// Query Codex's app-server protocol. Auth is handled by Codex, never read here.
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const home = require('os').homedir();
const args = process.argv.slice(2);
const consuming = args.includes('--consume');
const details = args.includes('--details');
const value = flag => args[args.indexOf(flag) + 1];
const key = args.includes('--idempotency-key') ? value('--idempotency-key') : null;
const creditId = args.includes('--credit') ? value('--credit') : null;
if (consuming && (!args.includes('--confirmed') || !key || !/^[a-zA-Z0-9-]{16,120}$/.test(key) || (!creditId && !args.includes('--next')))) {
  console.log(JSON.stringify({ error: 'El canje requiere confirmación, crédito y clave de idempotencia.' }));
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
  throw new Error('No se encuentra Codex. Instala la CLI o configura CODEX_BINARY.');
}
let child, timer, finished = false;
function finish(result) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.log(JSON.stringify(result));
  if (child) { child.stdin.end(); child.kill(); }
}
try {
  child = spawn(findCodex(), ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const send = message => child.stdin.write(JSON.stringify(message) + '\n');
  timer = setTimeout(() => finish({ error: 'Codex no respondió en 20 segundos.' }), 20000);
  child.on('error', () => finish({ error: 'No se pudo iniciar Codex app-server.' }));
  child.stdin.on('error', () => finish({ error: 'Conexión con Codex interrumpida.' }));
  child.on('exit', () => finish({ error: 'Codex se cerró antes de devolver la cuota.' }));
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
        finish({ error: `Codex rechazó la consulta (${message.error.code}). Comprueba la sesión en VS Code.` });
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
          finish(allowed.includes(result?.outcome) ? { outcome: result.outcome } : { error: 'Respuesta de canje desconocida. No inicies otro canje; reintenta con la misma clave.' });
          return;
        }
        const limits = result?.rateLimitsByLimitId?.codex || result?.rateLimits;
        if (!limits) { finish({ error: 'La cuenta no ha devuelto cuotas. Comprueba el login de Codex.' }); return; }
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
  finish({ error: e.message });
}
