// Offline tests: native locale calls and all account actions are mocked.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../packages/codex-usage');
const { detectLanguage, selectLanguage } = require(path.join(root, 'mods/codex-quota/locale.cjs'));
for (const locale of ['es', 'es-ES', 'es_MX.UTF-8', 'es_AR', 'ES-cl']) assert.equal(selectLanguage(locale), 'es');
for (const locale of ['en', 'en-US', 'fr-FR', 'de_DE', 'C', '', undefined]) assert.equal(selectLanguage(locale), 'en');
const success = value => () => ({ status: 0, stdout: value });
assert.equal(detectLanguage({ platform: 'win32', env: { LANG: 'en_US' }, run: success('es-ES\r\n') }), 'es');
assert.equal(detectLanguage({ platform: 'win32', env: { LANG: 'es_ES' }, run: success('fr-FR') }), 'en');
assert.equal(detectLanguage({ platform: 'darwin', env: { LANG: 'en_US' }, run: success('(\n "es-MX",\n "en-US"\n)') }), 'es');
assert.equal(detectLanguage({ platform: 'darwin', env: {}, run: success('(fr-FR, es-ES)') }), 'en');
for (const [env, expected] of [
  [{ LANG: 'es_ES.UTF-8' }, 'es'], [{ LC_ALL: 'en_US', LANG: 'es_ES' }, 'en'],
  [{ LC_MESSAGES: 'es_AR', LANG: 'en_US' }, 'es'], [{ LANG: 'en_US', LANGUAGE: 'es:en' }, 'es'],
  [{ LC_ALL: 'C', LANGUAGE: 'es' }, 'en'], [{ LANG: 'C.UTF-8', LANGUAGE: 'es' }, 'en']
]) assert.equal(detectLanguage({ platform: 'linux', env }), expected);
assert.equal(detectLanguage({ platform: 'win32', env: {}, run: () => { throw Error('missing'); }, fallback: () => 'es-ES' }), 'es');
assert.equal(detectLanguage({ platform: 'linux', env: {}, fallback: () => { throw Error('missing'); } }), 'en');

const i18n = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/i18n.js'), 'utf8').replace(/export /g, '') + '\nObject.assign(result, { messages, translator, errorText, creditTitle, creditDescription });', { result: i18n });
assert.deepEqual(Object.keys(i18n.messages.en).sort(), Object.keys(i18n.messages.es).sort());
for (const key of Object.keys(i18n.messages.en)) {
  assert.deepEqual((i18n.messages.en[key].match(/\{\w+\}/g) || []).sort(), (i18n.messages.es[key].match(/\{\w+\}/g) || []).sort(), key);
}
assert.equal(i18n.translator('fr')('close'), 'Close');
assert.equal(i18n.creditTitle('Full reset (Weekly + 5 hr)', 'es'), 'Reinicio completo (semanal + 5 horas)');
assert.equal(i18n.creditTitle('Unknown backend offer', 'es'), 'Unknown backend offer');
assert.ok(i18n.errorText({ error_code: 'rpc_error', error_rpc_code: -1 }, 'es').includes('(-1)'));

// Describe UI branches without executing callbacks, Node, Codex or native UI.
let texts = [];
const state = new Map();
function builder() {
  let proxy;
  proxy = new Proxy({}, { get(_target, key) {
    if (key === 'when') return (condition, callback) => { if (condition) callback(proxy); return proxy; };
    if (key === 'child' || key === 'tooltip') return value => { if (typeof value === 'string') texts.push(value); return proxy; };
    return () => proxy;
  } });
  return proxy;
}
function loadView(relative) {
  const sandbox = { ...i18n, View: class {}, div: builder, h_flex: builder, v_flex: builder,
    theme: () => ({}), shared: key => state.get(key), setShared: (key, value) => state.set(key, value),
    exec: () => { throw Error('render must not execute processes'); }, Date, Math,
    props: () => ({}), closeOverlay: () => {}, openOverlay: () => {}, appHome: () => '/unused' };
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replace(/^import .*;\r?$/gm, '').replace('export default class ', 'class ');
  const name = relative.includes('codex-resets') ? 'CodexResets' : 'CodexQuota';
  vm.runInNewContext(source + `\nthis.Exported = ${name};`, sandbox);
  return new sandbox.Exported();
}
for (const language of ['en', 'es']) {
  state.set('codex.ui.language', language);
  const panel = loadView('mods/codex-resets/main.js');
  panel.data = { resets_available: 1, reset_credits: [{ id: 'fake', title: 'Full reset (Weekly + 5 hr)', description: "Thanks for using Codex! You've been granted one free rate limit reset.", type: 'codexRateLimits', status: 'available', expires_at: null }] };
  panel.busy = false;
  panel.loading = false;
  panel.message = 'reset';
  texts = []; panel.render();
  assert.ok(texts.includes(i18n.translator(language)('resetsTitle')));
  assert.ok(texts.includes(i18n.creditTitle('Full reset (Weekly + 5 hr)', language)));
  panel.selection = { credit: 'fake', title: 'Full reset (Weekly + 5 hr)', key: 'test-idempotency-key' };
  texts = []; panel.render();
  assert.ok(texts.includes(i18n.translator(language)('confirm')));
  state.set('codex.reset.pending', panel.selection);
  panel.error = { error_code: 'timeout' };
  texts = []; panel.render();
  assert.ok(texts.includes(i18n.translator(language)('retry')));
  state.delete('codex.reset.pending');
  const quota = loadView('mods/codex-quota/main.js');
  quota.quotaData = { timestamp: new Date().toISOString(), rate_limits: { primary: { used_percent: 10, window_minutes: 300 }, secondary: { used_percent: 20, window_minutes: 10080 } } };
  texts = []; quota.render();
  assert.ok(texts.some(text => text.includes(i18n.translator(language)('quotaHint'))));
}
console.log('Passed: Windows/macOS/Linux language detection, English fallback, translation key/placeholder parity, both-language UI render branches and safe backend text fallback.');
