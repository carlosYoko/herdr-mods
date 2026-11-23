const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const MAX_COMMENT_LENGTH = 65536;
const MAX_COMMENTS = 100;
const GH_BINARIES = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', 'gh'];
const MAX_AVATAR_BYTES = 1024 * 1024;

function parsePatch(patch) {
  if (!patch) return [];
  const rows = [];
  let oldLine = 0;
  let newLine = 0;
  let hunkIndex = 0;
  for (const text of patch.split(/\r?\n/)) {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
      hunkIndex++;
      rows.push({ kind: 'hunk', text, hunk: hunkIndex });
    } else if (text.startsWith('diff --git ') || text.startsWith('index ') || text.startsWith('--- ') || text.startsWith('+++ ') || text.startsWith('\\ No newline')) {
      continue;
    } else if (text.startsWith('+')) {
      rows.push({ kind: 'add', text: text.slice(1), oldLine: '', newLine, line: newLine, side: 'RIGHT', hunk: hunkIndex });
      newLine++;
    } else if (text.startsWith('-')) {
      rows.push({ kind: 'remove', text: text.slice(1), oldLine, newLine: '', line: oldLine, side: 'LEFT', hunk: hunkIndex });
      oldLine++;
    } else {
      rows.push({ kind: 'context', text: text.startsWith(' ') ? text.slice(1) : text, oldLine, newLine, line: newLine, side: 'RIGHT', hunk: hunkIndex });
      oldLine++;
      newLine++;
    }
  }
  return rows;
}

function downloadImage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch { reject(new Error('Invalid GitHub avatar URL.')); return; }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'avatars.githubusercontent.com' || redirects > 3) {
      reject(new Error('Avatar URL is outside the allowed GitHub image host.'));
      return;
    }
    const req = https.get(parsed, { headers: { 'User-Agent': 'Herdr-Company-PR-Review', Accept: 'image/*' } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        downloadImage(new URL(response.headers.location, parsed).toString(), redirects + 1).then(resolve, reject);
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';')[0].toLowerCase();
      const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
      if (response.statusCode !== 200 || !extensions[contentType]) {
        response.resume();
        reject(new Error('GitHub did not return a supported avatar image.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_AVATAR_BYTES) {
          req.destroy(new Error('GitHub avatar exceeds the size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ data: Buffer.concat(chunks), extension: extensions[contentType] }));
      response.on('error', reject);
    });
    req.setTimeout(8000, () => req.destroy(new Error('GitHub avatar request timed out.')));
    req.on('error', reject);
  });
}

async function cacheAvatar(login, avatarUrl, appRoot, download = downloadImage) {
  if (typeof login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error('Invalid GitHub username for avatar.');
  if (typeof appRoot !== 'string' || !path.isAbsolute(appRoot)) throw new Error('Invalid Herdr app home.');
  const parsed = new URL(avatarUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'avatars.githubusercontent.com') throw new Error('Avatar URL is outside the allowed GitHub image host.');
  const directory = path.join(appRoot, 'data', 'company-pr-review', 'avatars');
  fs.mkdirSync(directory, { recursive: true });
  const prefix = path.join(directory, login.toLowerCase());
  const existing = ['png', 'jpg', 'webp', 'gif'].map(extension => `${prefix}.${extension}`).find(file => {
    try { return Date.now() - fs.statSync(file).mtimeMs < 7 * 24 * 60 * 60 * 1000; } catch { return false; }
  });
  if (existing) return { path: path.relative(appRoot, existing).split(path.sep).join('/') };
  const image = await download(avatarUrl);
  if (!image || !Buffer.isBuffer(image.data) || image.data.length > MAX_AVATAR_BYTES || !['png', 'jpg', 'webp', 'gif'].includes(image.extension)) {
    throw new Error('GitHub returned an invalid avatar image.');
  }
  const target = `${prefix}.${image.extension}`;
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, image.data, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return { path: path.relative(appRoot, target).split(path.sep).join('/') };
}

function validateIdentity(owner, repo, number) {
  if (typeof owner !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || owner === '.' || owner === '..') {
    throw new Error('Invalid GitHub owner.');
  }
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') {
    throw new Error('Invalid GitHub repository.');
  }
  const pullNumber = Number(number);
  if (!Number.isSafeInteger(pullNumber) || pullNumber < 1) throw new Error('Invalid pull request number.');
  return pullNumber;
}

function validateReviewPayload(payload) {
  if (!payload || !['COMMENT', 'APPROVE'].includes(payload.event)) throw new Error('Only COMMENT and APPROVE reviews are allowed.');
  const body = typeof payload.body === 'string' ? payload.body : '';
  if (body.length > MAX_COMMENT_LENGTH) throw new Error('Review summary is too long.');
  if (!Array.isArray(payload.comments) || payload.comments.length > MAX_COMMENTS) throw new Error('Too many inline comments.');
  const comments = payload.comments.map(comment => {
    if (!comment || typeof comment.path !== 'string' || !comment.path || comment.path.startsWith('/') || comment.path.split('/').includes('..')) {
      throw new Error('Invalid path in inline review comment.');
    }
    if (typeof comment.body !== 'string' || !comment.body.trim() || comment.body.length > MAX_COMMENT_LENGTH) {
      throw new Error('Inline review comments must contain text and stay below the length limit.');
    }
    const line = Number(comment.line);
    if (!Number.isSafeInteger(line) || line < 1 || !['LEFT', 'RIGHT'].includes(comment.side)) throw new Error('Invalid inline comment line or side.');
    const normalized = { path: comment.path, line, side: comment.side, body: comment.body };
    if (comment.start_line !== undefined) {
      const startLine = Number(comment.start_line);
      if (!Number.isSafeInteger(startLine) || startLine < 1 || startLine > line || comment.start_side !== comment.side) {
        throw new Error('Inline comment ranges must be ordered and stay on one diff side.');
      }
      normalized.start_line = startLine;
      normalized.start_side = comment.start_side;
    }
    return normalized;
  });
  if (payload.event === 'COMMENT' && !body.trim() && comments.length === 0) {
    throw new Error('A comment review needs a summary or at least one inline comment.');
  }
  return { body, event: payload.event, comments };
}

function endpoint(owner, repo, number, suffix = '') {
  const pullNumber = validateIdentity(owner, repo, number);
  return `/repos/${owner}/${repo}/pulls/${pullNumber}${suffix}`;
}

function request(method, path, body, spawn = spawnSync) {
  if (!['GET', 'POST'].includes(method)) throw new Error('Unsupported GitHub API method.');
  const args = ['api', path];
  if (method === 'POST') args.push('--method', 'POST', '--input', '-');
  let lastError;
  for (const binary of GH_BINARIES) {
    const result = spawn(binary, args, {
      encoding: 'utf8',
      input: method === 'POST' ? JSON.stringify(body) : undefined,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 45000
    });
    if (result.error && result.error.code === 'ENOENT' && binary !== GH_BINARIES[GH_BINARIES.length - 1]) {
      lastError = result.error;
      continue;
    }
    if (result.error) {
      const error = new Error('GitHub CLI request failed before a response was received.');
      error.code = 'request_uncertain';
      throw error;
    }
    if (result.status !== 0) {
      const statusMatch = `${result.stderr || ''}\n${result.stdout || ''}`.match(/HTTP\s+(\d{3})/i);
      const status = statusMatch ? Number(statusMatch[1]) : null;
      const error = new Error(status ? `GitHub rejected the request (HTTP ${status}).` : 'GitHub CLI request failed without a confirmed response.');
      error.code = status && status < 500 ? 'github_rejected' : 'request_uncertain';
      throw error;
    }
    try { return JSON.parse(result.stdout); }
    catch { throw new Error('GitHub returned an invalid JSON response.'); }
  }
  throw lastError || new Error('GitHub CLI is unavailable.');
}

function fetchPages(owner, repo, number, suffix, runRequest = request) {
  const values = [];
  for (let page = 1; page <= 10; page++) {
    const endpointPath = endpoint(owner, repo, number, `${suffix}?per_page=100&page=${page}`);
    const result = runRequest('GET', endpointPath);
    if (!Array.isArray(result)) throw new Error('GitHub returned an invalid list response.');
    values.push(...result);
    if (result.length < 100) return { values, truncated: false };
  }
  return { values, truncated: true };
}

function fetchReview(owner, repo, number, runRequest = request) {
  const pullNumber = validateIdentity(owner, repo, number);
  const pull = runRequest('GET', endpoint(owner, repo, pullNumber));
  const files = fetchPages(owner, repo, pullNumber, '/files', runRequest);
  let comments = { values: [], truncated: false };
  let reviews = { values: [], truncated: false };
  const warnings = [];
  try { comments = fetchPages(owner, repo, pullNumber, '/comments', runRequest); }
  catch { warnings.push('No se pudieron cargar los comentarios de revisión existentes.'); }
  try { reviews = fetchPages(owner, repo, pullNumber, '/reviews', runRequest); }
  catch { warnings.push('No se pudieron cargar los resúmenes de revisión existentes.'); }
  if (files.truncated) warnings.push('Se muestran como máximo 1000 archivos.');
  if (comments.truncated || reviews.truncated) warnings.push('Se muestran como máximo 1000 comentarios/revisiones.');
  return { pull, files: files.values.map(file => ({ ...file, diff: parsePatch(file.patch) })), comments: comments.values, reviews: reviews.values, warnings };
}

function submitReview(owner, repo, number, payload, runRequest = request) {
  const safePayload = validateReviewPayload(payload);
  if (JSON.stringify(safePayload).length > 512 * 1024) throw new Error('The review is too large to submit safely.');
  const result = runRequest('POST', endpoint(owner, repo, number, '/reviews'), safePayload);
  if (!result || !Number.isSafeInteger(Number(result.id)) || Number(result.id) < 1) {
    const error = new Error('GitHub did not confirm that it created the review.');
    error.code = 'request_uncertain';
    throw error;
  }
  return result;
}

async function main(argv) {
  const [operation, owner, repo, number, rawPayload] = argv;
  try {
    let result;
    if (operation === 'fetch') result = fetchReview(owner, repo, number);
    else if (operation === 'submit') result = submitReview(owner, repo, number, JSON.parse(rawPayload || 'null'));
    else if (operation === 'avatar') result = await cacheAvatar(owner, repo, number);
    else throw new Error('Unknown GitHub review operation.');
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error.code || 'request_failed', error: error.message }) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { cacheAvatar, endpoint, fetchReview, parsePatch, request, submitReview, validateIdentity, validateReviewPayload };
if (require.main === module) main(process.argv.slice(2));
