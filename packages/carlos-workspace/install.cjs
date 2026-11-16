#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const PACKAGE = 'carlosYoko/herdr-mods:carlos-workspace';

function install(argv = []) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--update' || arg === '--no-switch') options[arg] = true;
    else if (arg === '--home' && argv[i + 1] && !argv[i + 1].startsWith('--')) options[arg] = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  const home = path.resolve(options['--home'] || process.env.HERDR_APP_HOME || path.join(os.homedir(), '.config', 'herdr-app'));
  const layoutName = 'carlos-workspace';
  const layoutPath = path.join(home, 'layouts', `${layoutName}.json`);
  const markerPath = path.join(home, 'data', 'community-carlos-workspace-install.json');
  const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
  const managed = marker?.package === PACKAGE;
  if (fs.existsSync(layoutPath) && (!managed || !options['--update'])) {
    throw new Error('Layout carlos-workspace already exists. It was not changed; choose another name or update only an installer-managed copy.');
  }
  const source = fs.readFileSync(path.join(__dirname, 'layouts', `${layoutName}.json`), 'utf8');
  const layout = JSON.parse(source);
  const refs = new Set();
  (function visit(node) {
    if (node?.content?.mod) refs.add(node.content.mod);
    for (const child of node?.children || []) visit(child);
  })(layout);
  const supported = new Set(['workspace-chrome', 'spaces', 'agents', 'tabs', 'pane', 'files', 'changes', 'workspace-status']);
  const unsupported = [...refs].filter(name => !supported.has(name));
  if (unsupported.length) throw new Error(`Preset unexpectedly depends on nonstandard mods: ${unsupported.join(', ')}`);

  function app(...args) {
    const result = spawnSync('herdr-app', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, HERDR_APP_HOME: home } });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
    let data;
    try { data = JSON.parse(result.stdout); } catch {}
    if (data?.error) throw new Error(data.error);
    return result.stdout;
  }
  const previous = JSON.parse(app('status')).layout;
  const backup = path.join(home, 'data', 'community-backups', `carlos-workspace-${Date.now()}`);
  if (fs.existsSync(layoutPath)) {
    fs.mkdirSync(backup, { recursive: true });
    fs.copyFileSync(layoutPath, path.join(backup, path.basename(layoutPath)));
  }
  fs.mkdirSync(path.dirname(layoutPath), { recursive: true });
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2) + '\n');
  fs.writeFileSync(markerPath, JSON.stringify({ package: PACKAGE, version: '0.1.0', layout: layoutName }, null, 2) + '\n');
  try {
    app('do', 'layout.switch', JSON.stringify({ name: options['--no-switch'] ? previous : layoutName }));
  } catch (error) {
    try { app('do', 'layout.switch', JSON.stringify({ name: previous })); } catch {}
    throw new Error(`${error.message}\nInstalled layout is at ${layoutPath}; previous layout was ${previous}.`);
  }
  console.log(`Installed visual preset ${layoutName} in ${home}${options['--no-switch'] ? '' : ` (active)`}`);
}

module.exports = { install };
if (require.main === module) {
  try { install(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
