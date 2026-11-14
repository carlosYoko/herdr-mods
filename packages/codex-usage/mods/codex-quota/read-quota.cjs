// Query Codex's app-server protocol. Auth is handled by Codex, never read here.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const home = require('os').homedir();
const { detectLanguage } = require('./locale.cjs');
const language = detectLanguage();
const args = process.argv.slice(2);
const consuming = args.includes('--consume');
const details = args.includes('--details');
const value = flag => args[args.indexOf(flag) + 1];
const key = args.includes('--idempotency-key') ? value('--idempotency-key') : null;
const creditId = args.includes('--credit') ? value('--credit') : null;
if (consuming && (!args.includes('--confirmed') || !key || !/^[a-zA-Z0-9-]{16,120}$/.test(key) || (!creditId && !args.includes('--next')))) {
  console.log(JSON.stringify({ language, error_code: 'confirmation_required', error: 'Redemption requires confirmation, a credit and an idempotency key.' }));
  process.exit(1);
}
function findCodex() {
  if (process.env.CODEX_BINARY) return process.env.CODEX_BINARY;
  const found = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['codex'], { encoding: 'utf8', windowsHide: true });
  if (found.status === 0 && found.stdout.trim()) {
    const executable = found.stdout.trim().split(/\r?\n/).find(p => process.platform !== 'win32' || /\.exe$/i.test(p));
    if (executable) return executable;
  }
  const root = path.join(home, '.vscode', 'extensions');
  if (fs.existsSync(root)) {
    const candidates = fs.readdirSync(root).filter(n => n.startsWith('openai.chatgpt-'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const name of candidates) {
      const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
      const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
      const file = path.join(root, name, 'bin', `${platform}-${arch}`, process.platform === 'win32' ? 'codex.exe' : 'codex');
      if (fs.existsSync(file)) return file;
    }
  }
  throw Object.assign(new Error('Codex was not found. Install the CLI or set CODEX_BINARY.'), { code: 'binary_missing' });
}
let child, timer, finished = false;
function finish(result) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.log(JSON.stringify({ language, ...result }));
  if (child) { child.stdin.end(); child.kill(); }
}
try {
  child = spawn(findCodex(), ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const send = message => child.stdin.write(JSON.stringify(message) + '\n');
  timer = setTimeout(() => finish({ error_code: 'timeout', error: 'Codex did not respond within 20 seconds.' }), 20000);
  child.on('error', () => finish({ error_code: 'start_failed', error: 'Could not start Codex app-server.' }));
  child.stdin.on('error', () => finish({ error_code: 'connection_lost', error: 'Connection to Codex interrupted.' }));
  child.on('exit', () => finish({ error_code: 'early_exit', error: 'Codex exited before returning the quota.' }));
  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id !== 1 && message.id !== 2) continue;
      if (message.error) {
        // Never forward arbitrary server diagnostics that might contain account information.
        finish({ error_code: 'rpc_error', error_rpc_code: message.error.code, error: `Codex rejected the request (${message.error.code}). Check your Codex login.` });
        return;
      }
      if (message.id === 1) {
        send({ method: 'initialized' });
        send(consuming
          ? { id: 2, method: 'account/rateLimitResetCredit/consume', params: { idempotencyKey: key, ...(creditId ? { creditId } : {}) } }
          : { id: 2, method: 'account/rateLimits/read', params: { excludeResetCreditDetails: !details } });
      } else {
        const result = message.result;
        if (consuming) {
          const allowed = ['reset', 'nothingToReset', 'noCredit', 'alreadyRedeemed'];
          finish(allowed.includes(result?.outcome) ? { outcome: result.outcome } : { error_code: 'unknown_outcome', error: 'Unknown redemption response. Retry with the same key, not a different attempt.' });
          return;
        }
        const limits = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
        if (!limits) { finish({ error_code: 'no_limits', error: 'The account returned no quotas. Check your Codex login.' }); return; }
        const window = w => w ? { used_percent: w.usedPercent, window_minutes: w.windowDurationMins, resets_at: w.resetsAt } : null;
        finish({ timestamp: new Date().toISOString(), source: 'codex-app-server',
          rate_limits: { primary: window(limits.primary), secondary: window(limits.secondary), plan_type: limits.planType },
          resets_available: result.rateLimitResetCredits?.availableCount ?? null,
          ...(details ? { reset_credits: result.rateLimitResetCredits?.credits?.map(c => ({
            id: c.id, type: c.resetType, status: c.status, expires_at: c.expiresAt,
            title: c.title, description: c.description
          })) ?? null } : {}) });
      }
    }
  });
  send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'herdr_quota', title: 'Herdr quota', version: '1.0.0' }, capabilities: null } });
} catch (e) {
  finish({ error_code: e.code === 'binary_missing' ? e.code : 'request_failed', error: e.code === 'binary_missing' ? e.message : 'The Codex request failed.' });
}
