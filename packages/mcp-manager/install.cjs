const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
function replaceOnce(source, old, next) {
  if (source.split(old).length !== 2) throw new Error('Tabs no compatibles: ancla ausente o ambigua.');
  return source.replace(old, next);
}
function patchTabs(source) {
  if (source.includes('// herdr-mods: mcp-manager')) return source;
  source = replaceOnce(source, 'const enabled = shared("workspace.panels") ?? ["files", "changes"];', 'const enabled = [...new Set([...(shared("workspace.panels") ?? ["files", "changes"]), "mcp"])];');
  const anchor = '.when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))';
  return '// herdr-mods: mcp-manager\n' + replaceOnce(source, anchor, anchor + '\n      .child(panelButton("mcp", "MCP", "mods/mcp-manager/icon.svg"))');
}
function integrateLayout(root) {
  let stack, tabs;
  function walk(n) { if (n.id === 'panel-body') stack = n; if (n.id === 'tabs') tabs = n; for (const c of n.children || []) walk(c); }
  walk(root);
  if (stack?.type !== 'stack' || !tabs?.content?.mod) throw new Error('Layout incompatible: se requieren tabs y panel-body.');
  if (stack.children.some(c => c.id === 'mcp')) throw new Error('El layout base ya incluye un panel mcp.');
  stack.children.push({ id: 'mcp', type: 'block', content: { mod: 'mcp-manager' } });
  tabs.content.mod = 'mcp-workspace-tabs';
  root.preview = 'layouts/mcp-workspace.svg';
  return root;
}
function install(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (['--update', '--no-switch'].includes(arg)) options[arg] = true;
    else if (['--home', '--base-layout'].includes(arg) && argv[i+1] && !argv[i+1].startsWith('--')) options[arg] = argv[++i];
    else throw new Error('Opción desconocida/incompleta: ' + arg);
  }
  const home = path.resolve(options['--home'] || process.env.HERDR_APP_HOME || path.join(os.homedir(), '.config/herdr-app'));
  const markerPath = path.join(home, 'data/community-mcp-manager-install.json');
  const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
  const managed = marker?.package === 'carlosYoko/herdr-mods:mcp-manager';
  const base = options['--base-layout'] || 'main';
  if (!/^[a-zA-Z0-9_-]+$/.test(base)) throw new Error('Nombre de layout no válido');
  const tabsDir = path.join(home, 'mods/mcp-workspace-tabs'), modDir = path.join(home, 'mods/mcp-manager');
  const layoutFile = path.join(home, 'layouts/mcp-workspace.json');
  const destinations = [tabsDir, modDir, layoutFile];
  if (destinations.some(p => fs.existsSync(p)) && (!managed || !options['--update'])) throw new Error('Destinos ocupados. Solo se actualiza una instalación propia con --update.');
  const layout = JSON.parse(fs.readFileSync(managed ? layoutFile : path.join(home, 'layouts', base + '.json'), 'utf8'));
  const find = (n, id) => n.id === id ? n : (n.children || []).map(c => find(c, id)).find(Boolean);
  const sourceName = managed ? 'mcp-workspace-tabs' : find(layout, 'tabs')?.content?.mod;
  if (!sourceName || !/^[a-zA-Z0-9_-]+$/.test(sourceName)) throw new Error('No hay tabs compatibles');
  patchTabs(fs.readFileSync(path.join(home, 'mods', sourceName, 'main.js'), 'utf8').replace(/\r\n/g, '\n'));
  if (!managed) integrateLayout(structuredClone(layout));
  const dep = path.resolve(path.dirname(require.resolve('smol-toml')), '..');
  const files = ['main.js', 'mod.json', 'manage.cjs', 'i18n.js', 'locale.cjs'].map(name => ({ name, content: fs.readFileSync(path.join(__dirname, 'mods/mcp-manager', name)) }));
  function app(...args) {
    const r = spawnSync('herdr-app', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, HERDR_APP_HOME: home } });
    if (r.error || r.status !== 0) throw new Error(r.error?.message || r.stderr || r.stdout);
    let data; try { data = JSON.parse(r.stdout); } catch {}
    if (data?.error) throw new Error(data.error);
    return r.stdout;
  }
  const previous = JSON.parse(app('status')).layout;
  const backup = path.join(home, 'data/community-backups', 'mcp-' + Date.now());
  for (const target of [...destinations, markerPath, path.join(home, 'layouts/mcp-workspace.svg')]) if (fs.existsSync(target)) {
    const dest = path.join(backup, path.relative(home, target)); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.cpSync(target, dest, { recursive: true });
  }
  try {
    if (!managed) {
      app('do', 'mod.clone', JSON.stringify({ name: sourceName, as: 'mcp-workspace-tabs' }));
      app('do', 'layout.clone', JSON.stringify({ name: base, as: 'mcp-workspace' }));
    }
    fs.mkdirSync(modDir, { recursive: true });
    // Only this dependency is deployed, not the repository's node_modules tree.
    const depDest = path.join(modDir, 'node_modules/smol-toml');
    fs.rmSync(depDest, { recursive: true, force: true }); fs.cpSync(dep, depDest, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(modDir, f.name), f.content);
    fs.copyFileSync(path.join(__dirname, 'icon.svg'), path.join(modDir, 'icon.svg'));
    const tabsFile = path.join(tabsDir, 'main.js');
    fs.writeFileSync(tabsFile, patchTabs(fs.readFileSync(tabsFile, 'utf8').replace(/\r\n/g, '\n')));
    if (!managed) fs.writeFileSync(layoutFile, JSON.stringify(integrateLayout(JSON.parse(fs.readFileSync(layoutFile, 'utf8'))), null, 2) + '\n');
    fs.copyFileSync(path.join(__dirname, 'preview.svg'), path.join(home, 'layouts/mcp-workspace.svg'));
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, JSON.stringify({ package: 'carlosYoko/herdr-mods:mcp-manager', baseLayout: managed ? marker.baseLayout : base, version: '0.1.1' }, null, 2));
    for (const dir of [modDir, tabsDir]) console.log(app('check', dir).trim());
    app('do', 'layout.switch', JSON.stringify({ name: options['--no-switch'] ? previous : 'mcp-workspace' }));
  } catch (e) {
    try { app('do', 'layout.switch', JSON.stringify({ name: previous })); } catch {}
    throw new Error(`${e.message}\nBackups: ${backup}. No hay rollback automático de archivos.`);
  }
  console.log('Instalado mcp-manager. Layout: mcp-workspace. Backups: ' + backup);
}
module.exports = { install, patchTabs, integrateLayout };
if (require.main === module) { try { install(process.argv.slice(2)); } catch(e) { console.error(e.message); process.exitCode = 1; } }
