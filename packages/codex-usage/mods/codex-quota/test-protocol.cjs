// Offline protocol tests: no Codex process, network request or real credit redemption.
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const { EventEmitter } = require('events');
const source = fs.readFileSync(require('path').join(__dirname, 'read-quota.cjs'), 'utf8');

async function simulate(args, reply) {
  const requests = [];
  let killed = false, spawned = false;
  const result = await new Promise((resolve, reject) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () => {};
    child.kill = () => { killed = true; };
    child.stdin.write = line => {
      const request = JSON.parse(line);
      requests.push(request);
      if (!request.id) return;
      queueMicrotask(() => child.stdout.emit('data', Buffer.from(JSON.stringify({
        id: request.id, ...(request.id === 1 ? { result: {} } : reply)
      }) + '\n')));
    };
    try {
      vm.runInNewContext(source, {
        require(name) {
          if (name === './locale.cjs') return { detectLanguage: () => 'en' };
          if (name === 'child_process') return { spawn() { spawned = true; return child; }, spawnSync() { throw new Error('unexpected lookup'); } };
          return require(name);
        },
        process: { argv: ['node', 'read-quota.cjs', ...args], env: { CODEX_BINARY: 'mock-codex' }, platform: 'win32', exit() { throw new Error('guard'); } },
        console: { log(line) { resolve(JSON.parse(line)); } },
        setTimeout, clearTimeout
      });
    } catch (e) { if (e.message !== 'guard') reject(e); }
  });
  return { result, requests, killed, spawned };
}

(async () => {
  const read = await simulate(['--details'], { result: {
    rateLimits: { primary: { usedPercent: 24, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: null, planType: 'plus' },
    rateLimitResetCredits: { availableCount: 1, credits: [{ id: 'test-credit', resetType: 'codexRateLimits', status: 'available', expiresAt: null, title: 'Full reset', description: null }] }
  } });
  assert.equal(read.result.language, 'en');
  assert.equal(read.result.reset_credits[0].id, 'test-credit');
  assert.equal(read.requests[2].params.excludeResetCreditDetails, false);
  assert.equal(read.killed, true);
  const guarded = await simulate(['--consume'], {});
  assert.ok(guarded.result.error);
  assert.equal(guarded.spawned, false);
  const key = 'test-idempotency-key-1234';
  for (const outcome of ['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed']) {
    const consumed = await simulate(['--consume', '--confirmed', '--credit', 'test-credit', '--idempotency-key', key], { result: { outcome } });
    assert.equal(consumed.result.outcome, outcome);
    assert.equal(consumed.requests[2].method, 'account/rateLimitResetCredit/consume');
    assert.deepEqual(consumed.requests[2].params, { idempotencyKey: key, creditId: 'test-credit' });
    assert.equal(consumed.killed, true);
  }
  const rejected = await simulate([], { error: { code: -32000, message: 'private diagnostics' } });
  assert.equal(rejected.result.error_code, 'rpc_error');
  assert.ok(rejected.result.error.includes('-32000'));
  assert.ok(!JSON.stringify(rejected.result).includes('private diagnostics'));
  const unknown = await simulate(['--consume', '--confirmed', '--credit', 'test-credit', '--idempotency-key', key], { result: { outcome: 'unexpected' } });
  assert.ok(unknown.result.error);
  console.log('Passed: detail read, explicit confirmation guard, 4 redemption outcomes, idempotency forwarding, process cleanup, safe errors. No real credits used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
