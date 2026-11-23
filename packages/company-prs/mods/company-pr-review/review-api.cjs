const { spawnSync } = require('node:child_process');

const MAX_COMMENT_LENGTH = 65536;
const MAX_COMMENTS = 100;
const GH_BINARIES = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', 'gh'];

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

function main(argv) {
  const [operation, owner, repo, number, rawPayload] = argv;
  try {
    const result = operation === 'fetch'
      ? fetchReview(owner, repo, number)
      : operation === 'submit'
        ? submitReview(owner, repo, number, JSON.parse(rawPayload || 'null'))
        : (() => { throw new Error('Unknown GitHub review operation.'); })();
    process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error.code || 'request_failed', error: error.message }) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { endpoint, fetchReview, parsePatch, request, submitReview, validateIdentity, validateReviewPayload };
if (require.main === module) main(process.argv.slice(2));
