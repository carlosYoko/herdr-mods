const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cacheAvatar, endpoint, fetchReview, parsePatch, request, submitReview, validateReviewPayload } = require('./mods/company-pr-review/review-api.cjs');

assert.equal(endpoint('nomoapp', 'nomo-server-app', 11003), '/repos/nomoapp/nomo-server-app/pulls/11003');
assert.throws(() => endpoint('../org', 'repo', 1), /owner/i);
assert.throws(() => endpoint('org', 'repo', 0), /number/i);

const parsedDiff = parsePatch('diff --git a/src/a.js b/src/a.js\n@@ -10,3 +10,4 @@ function f\n context\n-old\n+new\n+tail');
assert.deepEqual(parsedDiff.filter(row => row.kind !== 'hunk').map(row => [row.kind, row.line, row.side, row.hunk]), [
  ['context', 10, 'RIGHT', 1], ['remove', 11, 'LEFT', 1], ['add', 11, 'RIGHT', 1], ['add', 12, 'RIGHT', 1]
]);

const multiline = {
  event: 'COMMENT',
  body: 'Please address these issues.',
  comments: [{ path: 'src/file.js', start_line: 4, start_side: 'RIGHT', line: 7, side: 'RIGHT', body: 'This range needs a guard.' }]
};
assert.deepEqual(validateReviewPayload(multiline), multiline);
assert.throws(() => validateReviewPayload({ event: 'REQUEST_CHANGES', body: '', comments: [] }), /Only COMMENT and APPROVE/);
assert.throws(() => validateReviewPayload({ event: 'COMMENT', body: '', comments: [] }), /needs a summary/);
assert.throws(() => validateReviewPayload({ event: 'COMMENT', body: '', comments: [{ path: '../secret', line: 1, side: 'RIGHT', body: 'no' }] }), /path/i);
assert.throws(() => validateReviewPayload({ event: 'COMMENT', body: '', comments: [{ path: 'a.js', start_line: 5, start_side: 'LEFT', line: 4, side: 'RIGHT', body: 'no' }] }), /ranges/i);
assert.deepEqual(validateReviewPayload({ event: 'APPROVE', body: '', comments: [] }), { event: 'APPROVE', body: '', comments: [] });

let invocation;
const posted = request('POST', '/repos/org/repo/pulls/7/reviews', multiline, (_binary, args, options) => {
  invocation = { args, input: options.input };
  return { status: 0, stdout: '{"id":7}', stderr: '' };
});
assert.deepEqual(posted, { id: 7 });
assert.deepEqual(invocation.args, ['api', '/repos/org/repo/pulls/7/reviews', '--method', 'POST', '--input', '-']);
assert.deepEqual(JSON.parse(invocation.input), multiline);

let reviewRequest;
submitReview('org', 'repo', 7, multiline, (method, path, body) => {
  reviewRequest = { method, path, body };
  return { id: 7 };
});
assert.deepEqual(reviewRequest, { method: 'POST', path: '/repos/org/repo/pulls/7/reviews', body: multiline });
assert.throws(() => submitReview('org', 'repo', 7, multiline, () => ({})), error => error.code === 'request_uncertain');

const pages = [];
const bundle = fetchReview('org', 'repo', 7, (_method, path) => {
  pages.push(path);
  if (path.endsWith('/pulls/7')) return { number: 7 };
  if (path.includes('/files?')) return [{ filename: 'src/a.js', patch: '@@ -1 +1 @@\n-a\n+b' }];
  if (path.includes('/comments?')) return [{ id: 1, body: 'existing' }];
  return [{ id: 2, state: 'APPROVED' }];
});
assert.equal(bundle.pull.number, 7);
assert.equal(bundle.files[0].filename, 'src/a.js');
assert.equal(bundle.files[0].diff[0].kind, 'hunk');
assert.equal(bundle.files[0].diff[2].line, 1);
assert.equal(bundle.comments[0].body, 'existing');
assert.equal(bundle.reviews[0].state, 'APPROVED');
assert.equal(pages.length, 4);

(async () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'company-pr-review-avatar-'));
  try {
    let downloads = 0;
    const avatarUrl = 'https://avatars.githubusercontent.com/u/1?v=4';
    const downloader = async () => { downloads++; return { data: Buffer.from('mock-avatar'), extension: 'png' }; };
    const cached = await cacheAvatar('octocat', avatarUrl, appRoot, downloader);
    assert.equal(cached.path, 'data/company-pr-review/avatars/octocat.png');
    assert.equal(fs.readFileSync(path.join(appRoot, cached.path), 'utf8'), 'mock-avatar');
    assert.deepEqual(await cacheAvatar('octocat', avatarUrl, appRoot, downloader), cached);
    assert.equal(downloads, 1, 'fresh avatar cache avoids another network request');
    await assert.rejects(cacheAvatar('../user', avatarUrl, appRoot, downloader), /username/i);
    await assert.rejects(cacheAvatar('octocat', 'https://example.com/avatar.png', appRoot, downloader), /allowed GitHub/i);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
  console.log('Passed: GitHub review API allowlist, multiline payload validation, mocked POST, avatar cache and PR review fetch.');
})().catch(error => { console.error(error); process.exitCode = 1; });
