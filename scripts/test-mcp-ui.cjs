// Offline UI and locale tests: no configuration files, native processes or MCP servers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../packages/mcp-manager/mods/mcp-manager');
const { detectLanguage, selectLanguage } = require(path.join(root, 'locale.cjs'));
const { publicError } = require(path.join(root, 'manage.cjs'));
for (const locale of ['es', 'es-ES', 'es_MX.UTF-8', 'ES-cl']) assert.equal(selectLanguage(locale), 'es');
for (const locale of ['en', 'fr-FR', '', undefined]) assert.equal(selectLanguage(locale), 'en');
const native = stdout => () => ({ status: 0, stdout });
assert.equal(detectLanguage({ platform: 'win32', env: {}, run: native('es-ES') }), 'es');
assert.equal(detectLanguage({ platform: 'darwin', env: {}, run: native('(en-US, es-ES)') }), 'en');
assert.equal(detectLanguage({ platform: 'linux', env: { LANG: 'es_ES.UTF-8' } }), 'es');
assert.equal(detectLanguage({ platform: 'linux', env: { LC_ALL: 'C', LANGUAGE: 'es' } }), 'en');
assert.equal(detectLanguage({ platform: 'linux', env: {}, fallback: () => { throw Error(); } }), 'en');
const i18n = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8').replace(/export /g, '') + '\nObject.assign(result, {messages,translator,errorText});', { result: i18n });
assert.deepEqual(Object.keys(i18n.messages.en).sort(), Object.keys(i18n.messages.es).sort());
for (const key of Object.keys(i18n.messages.en)) assert.deepEqual((i18n.messages.en[key].match(/\{\w+\}/g) || []).sort(), (i18n.messages.es[key].match(/\{\w+\}/g) || []).sort(), key);
assert.equal(i18n.translator('fr')('refresh'), 'Refresh');
assert.equal(publicError(new Error('SECRET_PARSER_EXCERPT')).error_code, 'request_failed');
assert.equal(publicError(Object.assign(new Error('SECRET'), { code: 'EACCES' })).error_code, 'access_error');
assert.equal(publicError(new Error('Configuración inválida (no se modifica): /fixture')).error_code, 'invalid_config');
assert.equal(publicError(new Error('La configuración ha cambiado. Actualiza y confirma de nuevo.')).error_code, 'stale');
assert.ok(!i18n.errorText(new Error('SECRET_PARSER_EXCERPT'), 'en').includes('SECRET'));
assert.ok(i18n.errorText({ error_code: 'invalid_config', error_values: { file: '/fixture' } }, 'en').includes('/fixture'));
let texts = [], callbacks = new Map(), focus, calls = [], state = new Map(), detectedLanguage;
function builder() {
  let proxy, id;
  proxy = new Proxy({}, { get(_t, key) {
    if (key === 'id') return value => { id = value; return proxy; };
    if (key === 'when') return (yes, cb) => { if (yes) cb(proxy); return proxy; };
    if (key === 'child') return value => { if (typeof value === 'string') texts.push(value); return proxy; };
    if (key === 'on_click') return cb => { callbacks.set(id, cb); return proxy; };
    return () => proxy;
  } }); return proxy;
}
const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8').replace(/^import .*;\r?$/gm, '').replace('export default class ', 'class ');
const sandbox = { ...i18n, View: class {}, div: builder, h_flex: builder, v_flex: builder, theme: () => ({}), focused: () => focus,
  panes: () => [{ terminal: 't1', app: 'pi' }], agents: () => [], terminals: () => [], spaces: () => [{ id: 's', machine: null }],
  shared: key => state.get(key), setShared: (key, value) => state.set(key, value),
  appHome: () => '/app', layout: () => ({}), run: () => {}, exec: async (_cmd, args) => {
    const request = JSON.parse(args[1]);
    if (request.action === 'language') return { code: 0, stdout: JSON.stringify({ language: detectedLanguage }) };
    calls.push(request); return { code: 0, stdout: JSON.stringify({ rows: [], files: [], writable: true, snapshot: 'new' }) };
  } };
vm.runInNewContext(source + '\nthis.Exported=McpManager;', sandbox);
let tasks = [];
const cx = { timer: { every: () => {} }, notify: () => {}, spawn: fn => { tasks.push(fn(cx)); } };
const flush = async () => { await Promise.all(tasks); tasks = []; };
(async () => {
  for (const language of ['en', 'es']) {
    detectedLanguage = language; state.clear(); calls = []; callbacks.clear();
    focus = { terminal: 't1', cwd: '/project', space: 's', tab: 'tab' };
    const tr = i18n.translator(language), panel = new sandbox.Exported();
    panel.init({}, cx); panel.render(cx); await flush(); assert.equal(calls[0].client, 'pi');
    assert.equal(state.get('mcp.ui.language'), language);
    panel.data = { rows: [{ name: 'fixture', file: '/project/.pi/mcp.json', scope: 'Proyecto', enabled: true }], files: [{ exists: true, file: '/project/.pi/mcp.json' }], writable: true, snapshot: 'fixture' };
    panel.details = true;
    texts = []; callbacks.clear(); panel.render(cx);
    for (const key of ['refresh', 'enabled', 'enableAll', 'disableAll', 'reload']) assert.ok(texts.includes(tr(key)), language + ': ' + key);
    assert.ok(texts.some(t => t.includes(tr('noticePi'))));
    assert.ok(texts.includes(tr('fileRead', { file: '/project/.pi/mcp.json' })));
    assert.ok(texts.includes(tr('project') + ' · /project/.pi/mcp.json'));
    callbacks.get('toggle-0')({}, cx); assert.equal(calls.length, 1, 'selection must not write');
    texts = []; panel.render(cx); assert.ok(texts.includes(tr('confirm'))); assert.ok(texts.includes(tr('warning'))); assert.ok(panel.pending);
    callbacks.get('cancel')({}, cx); assert.equal(panel.pending, null); assert.equal(calls.length, 1);
    callbacks.get('toggle-0')({}, cx); panel.render(cx); callbacks.get('confirm')({}, cx); await flush();
    assert.equal(calls[1].action, 'apply'); assert.equal(calls[1].confirmed, true); assert.equal(calls[1].snapshot, 'fixture');
    texts = []; panel.render(cx); assert.ok(texts.includes(tr('saved'))); assert.ok(texts.includes(tr('empty')));
    panel.error = { error_code: 'stale' }; texts = []; panel.render(cx); assert.ok(texts.includes(tr('stale')));
    // Language changes do not discard context or a pending confirmation.
    panel.pending = { names: ['fixture'], enabled: false };
    state.set('mcp.ui.language', language === 'en' ? 'es' : 'en'); panel.render(cx); assert.ok(panel.pending);
    state.set('mcp.ui.language', language);
    focus = { terminal: 'shell', cwd: '/other', space: 's', tab: 'other' };
    texts = []; panel.render(cx); assert.equal(panel.pending, null); assert.equal(panel.data, null); assert.ok(texts.includes(tr('noAgent')));
  }
  console.log('Passed MCP i18n/UI: native locale mocks, Spanish variants, English fallback, key/placeholder parity, safe structured errors, both-language loaded/confirmation/cancel/apply/error/empty/no-agent branches and focus invalidation.');
})().catch(e => { console.error(e); process.exitCode = 1; });
