// Resolve the user's UI language without credentials, network or a model call.
const { spawnSync } = require('child_process');
function selectLanguage(locale) {
  return /^es(?:[-_@.]|$)/i.test(String(locale || '').trim()) ? 'es' : 'en';
}
function detectLanguage({ platform = process.platform, env = process.env, run = spawnSync,
  fallback = () => Intl.DateTimeFormat().resolvedOptions().locale } = {}) {
  const call = (cmd, args) => {
    try {
      const r = run(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 2000 });
      return r.status === 0 ? String(r.stdout || '').trim() : '';
    } catch { return ''; }
  };
  if (platform === 'win32') {
    const ui = call('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-UICulture).Name']);
    if (ui) return selectLanguage(ui);
  }
  if (platform === 'darwin') {
    const ui = call('/usr/bin/defaults', ['read', '-g', 'AppleLanguages']);
    const first = ui.match(/["']?([a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]+)*)["']?/);
    if (first) return selectLanguage(first[1]);
  }
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG;
  if (locale) {
    // C/POSIX explicitly opts out of translated messages, even if LANGUAGE is set.
    if (/^(C|POSIX)(?:\.|$)/i.test(locale)) return 'en';
    return selectLanguage((env.LANGUAGE || locale).split(':')[0]);
  }
  if (env.LANGUAGE) return selectLanguage(env.LANGUAGE.split(':')[0]);
  try { return selectLanguage(fallback()); } catch { return 'en'; }
}
module.exports = { detectLanguage, selectLanguage };
