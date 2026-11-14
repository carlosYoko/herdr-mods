#!/usr/bin/env node
// Install only allowlisted community source files. Never copy account or app state.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const FILES = {
  'codex-quota': ['mod.json', 'main.js', 'read-quota.cjs'],
  'codex-resets': ['mod.json', 'main.js']
};
function patchTabs(source) {
  if (source.includes('// herdr-mods: codex-usage')) return source;
  function replaceOnce(old, next) {
    if (source.split(old).length !== 2) throw new Error('Unsupported tabs source: integration anchor missing/ambiguous. No tabs code was changed.');
    source = source.replace(old, next);
  }
  replaceOnce('import { View, div, svg, image } from "gpui-kit";', '// herdr-mods: codex-usage\nimport { div, svg, image } from "gpui-kit";\nimport CodexQuota from "./quota.js";');
  replaceOnce('export default class Tabs extends View {\n  init() {', 'export default class Tabs extends CodexQuota {\n  init(props, cx) {\n    super.init(props, cx);');
  replaceOnce('.children(shown.map(item)))', '.children(shown.map(item))\n        .child(this.quotaBar()))');
  return source;
}
function integrateLayout(layout, tabsName) {
  let count = 0;
  function visit(node) {
    if (node?.content?.mod === 'tabs') { node.content.mod = tabsName; count++; }
    for (const child of node?.children || []) visit(child);
  }
  visit(layout);
  if (count !== 1) throw new Error('Base layout must contain exactly one shipped tabs mod. Choose --base-layout main.');
  return layout;
}
function main(argv) {
  const args = [...argv];
  const options = {};
  while (args.length) {
    const key = args.shift();
    if (['--update', '--no-switch'].includes(key)) options[key] = true;
    else if (['--home', '--base-layout'].includes(key) && args.length) options[key] = args.shift();
    else throw new Error(`Unknown/incomplete option: ${key}`);
  }
  const home = path.resolve(options['--home'] || process.env.HERDR_APP_HOME || path.join(os.homedir(), '.config', 'herdr-app'));
  const base = options['--base-layout'] || 'main';
  if (!/^[a-zA-Z0-9_-]+$/.test(base)) throw new Error('Invalid base layout name');
  const layoutName = 'codex-usage', tabsName = 'codex-usage-tabs';
  const markerPath = path.join(home, 'data', 'community-codex-usage-install.json');
  const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
  const managed = marker?.package === 'carlosYoko/herdr-mods:codex-usage';
  const layoutPath = path.join(home, 'layouts', `${layoutName}.json`);
  const tabsDir = path.join(home, 'mods', tabsName);
  const destinations = [...Object.keys(FILES).map(n => path.join(home, 'mods', n)), tabsDir, layoutPath];
  if (destinations.some(p => fs.existsSync(p)) && !options['--update']) throw new Error('Some destination names already exist. Review them, then use --update to explicitly replace package code (backed up).');
  if (!managed && (fs.existsSync(tabsDir) || fs.existsSync(layoutPath))) throw new Error('Layout/tab clone name already in use and not managed by this installer. Nothing was changed.');
  // Preflight every source and protocol adapter before any writes or app commands.
  const files = [];
  for (const [name, names] of Object.entries(FILES)) for (const file of names) {
    files.push({ relative: path.join('mods', name, file), contents: fs.readFileSync(path.join(ROOT, 'packages', 'codex-usage', 'mods', name, file), 'utf8') });
  }
  const sourceTabsPath = managed ? path.join(tabsDir, 'main.js') : path.join(home, 'mods', 'tabs', 'main.js');
  const patchedTabs = patchTabs(fs.readFileSync(sourceTabsPath, 'utf8').replace(/\r\n/g, '\n'));
  if (!managed) integrateLayout(JSON.parse(fs.readFileSync(path.join(home, 'layouts', `${base}.json`), 'utf8')), tabsName);
  function app(...args) {
    const r = spawnSync('herdr-app', args, { encoding: 'utf8', env: { ...process.env, HERDR_APP_HOME: home }, windowsHide: true });
    if (r.error || r.status !== 0) throw new Error(`herdr-app ${args[0]} failed: ${r.error?.message || r.stderr || r.stdout}`);
    // do/check may emit errors in a JSON response.
    let json; try { json = JSON.parse(r.stdout); } catch {}
    if (json?.error) throw new Error(json.error);
    return r.stdout;
  }
  app('status'); // Requires a running app using this home.
  const backup = path.join(home, 'data', 'community-backups', new Date().toISOString().replace(/[:.]/g, '-'));
  const toBackup = [...files.map(f => f.relative), path.join('mods', tabsName, 'main.js'), path.join('mods', tabsName, 'quota.js'), path.join('layouts', `${layoutName}.json`)];
  for (const relative of toBackup) {
    const file = path.join(home, relative);
    if (!fs.existsSync(file)) continue;
    const dest = path.join(backup, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  let previousLayout;
  try { previousLayout = JSON.parse(app('status')).layout; } catch {}
  if (!managed) {
    app('do', 'mod.clone', JSON.stringify({ name: 'tabs', as: tabsName }));
    app('do', 'layout.clone', JSON.stringify({ name: base, as: layoutName }));
  }
  // Clone rewrites asset paths; apply the patch to that local version, not shipped code.
  const cloneSource = fs.readFileSync(path.join(tabsDir, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  const integratedSource = managed ? patchedTabs : patchTabs(cloneSource);
  for (const file of files) {
    const dest = path.join(home, file.relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.contents);
  }
  fs.writeFileSync(path.join(tabsDir, 'quota.js'), fs.readFileSync(path.join(ROOT, 'packages', 'codex-usage', 'mods', 'codex-quota', 'main.js')));
  fs.writeFileSync(path.join(tabsDir, 'main.js'), integratedSource);
  if (!managed) {
    const layout = integrateLayout(JSON.parse(fs.readFileSync(layoutPath, 'utf8')), tabsName);
    layout.preview = 'layouts/codex-usage.svg';
    fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2) + '\n');
  }
  fs.copyFileSync(path.join(ROOT, 'packages', 'codex-usage', 'preview.svg'), path.join(home, 'layouts', 'codex-usage.svg'));
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ package: 'carlosYoko/herdr-mods:codex-usage', version: '0.1.0', baseLayout: base }, null, 2));
  try {
    for (const name of [...Object.keys(FILES), tabsName]) console.log(app('check', path.join(home, 'mods', name)).trim());
  } catch (e) {
    if (previousLayout) app('do', 'layout.switch', JSON.stringify({ name: previousLayout }));
    throw new Error(`${e.message}\nPrevious files backed up at ${backup}. Restore manually if needed.`);
  }
  const target = options['--no-switch'] ? previousLayout : layoutName;
  if (target) app('do', 'layout.switch', JSON.stringify({ name: target }));
  console.log(`Installed codex-usage in ${home}\nLayout: ${layoutName}\nBackups (when replacing): ${backup}`);
}
module.exports = { install: main, patchTabs, integrateLayout };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
