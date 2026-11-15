// No MCP connections, commands from config, or credential values are exposed/executed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const toml = require('smol-toml');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function load(file, format) {
  let raw = null;
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Symlinks no admitidos: ' + file);
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (raw !== null && Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Configuración demasiado grande: ' + file);
  let data;
  try { data = raw === null ? {} : format === 'toml' ? toml.parse(raw) : JSON.parse(raw); }
  catch { throw new Error('Configuración inválida (no se modifica): ' + file); }
  if (!object(data)) throw new Error('Se esperaba un objeto: ' + file);
  return { file, raw, data, format };
}
function inspect(request, home = os.homedir()) {
  const { client, cwd } = request;
  if (!['pi', 'codex', 'claude'].includes(client) || typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('Contexto no válido');
  if (!fs.statSync(cwd).isDirectory()) throw new Error('Carpeta de sesión no disponible');
  const files = [];
  let key = 'mcpServers';
  const add = (file, scope, format = 'json') => {
    if (!files.some(x => x.file === file)) files.push({ ...load(file, format), scope });
  };
  let notice = 'Configuración estándar, no estado de conexión. No se conocen flags, perfiles ni variables de la sesión. Las extensiones pueden añadir otros MCP.';
  if (client === 'pi') {
    add(path.join(home, '.pi', 'agent', 'mcp.json'), 'Usuario');
    add(path.join(cwd, '.pi', 'mcp.json'), 'Proyecto');
    notice += ' Pi solo carga el proyecto si confías en él. Ejecuta /reload tras aplicar cambios. No se gestionan adaptadores MCP de extensiones.';
  } else if (client === 'codex') {
    key = 'mcp_servers';
    add(path.join(home, '.codex', 'config.toml'), 'Usuario', 'toml');
    // Project layers are discovered up to the repository boundary, not unrelated parents.
    const dirs = [];
    for (let dir = cwd;; dir = path.dirname(dir)) {
      dirs.push(dir);
      if (fs.existsSync(path.join(dir, '.git')) || path.dirname(dir) === dir) break;
    }
    for (const dir of dirs.reverse()) add(path.join(dir, '.codex', 'config.toml'), 'Proyecto', 'toml');
    notice += ' Codex: las capas de proyecto requieren confianza. Reinicia la sesión. Al guardar TOML se conservan valores, pero no comentarios ni formato. CODEX_HOME o --config personalizados no se detectan.';
  } else {
    add(path.join(home, '.claude.json'), 'Usuario');
    add(path.join(cwd, '.mcp.json'), 'Proyecto');
    notice += ' Claude Code: vista de definiciones, solo lectura; no representa permisos ni servidores deshabilitados en preferencias. No es Claude Desktop ni el chat de VS Code.';
  }
  const effective = new Map();
  for (const f of files) {
    const entries = f.data[key];
    if (entries !== undefined && !object(entries)) throw new Error('Tabla MCP inválida: ' + f.file);
    for (const [name, config] of Object.entries(entries || {})) {
      if (!object(config)) throw new Error('Entrada MCP inválida: ' + f.file);
      if (config.enabled !== undefined && typeof config.enabled !== 'boolean') throw new Error('Estado MCP inválido: ' + f.file);
      const prior = effective.get(name);
      const merged = client === 'pi' && prior && !config.command && !config.url && !config.type ? { ...prior.config, ...config } : config;
      effective.set(name, { name, config: merged, file: f.file, scope: f.scope, enabled: merged.enabled !== false });
    }
  }
  const profileMcp = client === 'codex' && Object.values(files[0].data.profiles || {}).some(p => p?.mcp_servers);
  const rows = [...effective.values()].sort((a,b) => a.name.localeCompare(b.name));
  const snapshot = hash(JSON.stringify(files.map(f => [f.file, f.raw])));
  return { files, key, rows, snapshot, notice, writable: client !== 'claude' && !profileMcp };
}
function publicView(state) {
  return { snapshot: state.snapshot, notice: state.notice, writable: state.writable,
    files: state.files.map(f => ({ file: f.file, scope: f.scope, exists: f.raw !== null })),
    rows: state.rows.map(({ name, file, scope, enabled }) => ({ name, file, scope, enabled })) };
}
function perform(request, home = os.homedir()) {
  const state = inspect(request, home);
  if (request.action === 'list') return publicView(state);
  if (request.action !== 'apply' || request.confirmed !== true || typeof request.enabled !== 'boolean' || !Array.isArray(request.names) || !request.names.length) throw new Error('Cambio sin confirmación válida');
  if (!state.writable) throw new Error('Cliente o perfil de solo lectura');
  if (state.snapshot !== request.snapshot) throw new Error('La configuración ha cambiado. Actualiza y confirma de nuevo.');
  if (new Set(request.names).size !== request.names.length) throw new Error('Selección duplicada');
  const changes = new Map();
  for (const name of request.names) {
    const row = state.rows.find(r => r.name === name);
    if (!row) throw new Error('Servidor ya no disponible');
    if (row.enabled === request.enabled) continue;
    const f = state.files.find(f => f.file === row.file);
    if (!changes.has(f.file)) changes.set(f.file, { ...f, data: structuredClone(f.data) });
    const dest = changes.get(f.file);
    dest.data[state.key][name].enabled = request.enabled;
  }
  const prepared = [...changes.values()].map(f => ({ ...f, next: f.format === 'toml' ? toml.stringify(f.data) : JSON.stringify(f.data, null, 2) + '\n' }));
  // Lock every destination, preflight and back up all originals before replacing any.
  const locks = [], temps = [], backups = [];
  try {
    for (const f of prepared) {
      const lock = f.file + '.herdr-mcp.lock';
      const fd = fs.openSync(lock, 'wx', 0o600); locks.push({ lock, fd });
    }
    for (const f of prepared) {
      const current = load(f.file, f.format);
      if (current.raw !== f.raw) throw new Error('Cambio concurrente: actualiza antes de guardar');
      const backup = f.file + '.herdr-backup-' + crypto.randomUUID();
      fs.writeFileSync(backup, f.raw, { mode: 0o600, flag: 'wx' }); backups.push(backup);
      const temp = f.file + '.herdr-tmp-' + crypto.randomUUID();
      fs.writeFileSync(temp, f.next, { mode: 0o600, flag: 'wx' }); temps.push(temp);
    }
    for (let i = 0; i < prepared.length; i++) {
      const f = prepared[i];
      if (load(f.file, f.format).raw !== f.raw) throw new Error('Cambio concurrente; puede haber cambios parciales. Revisa los backups.');
      fs.renameSync(temps[i], f.file);
    }
  } finally {
    for (const temp of temps) if (fs.existsSync(temp)) fs.unlinkSync(temp);
    for (const { fd, lock } of locks) { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
  return { ...publicView(inspect(request, home)), backups, applied: prepared.length };
}
module.exports = { inspect, perform, publicView };
if (require.main === module) {
  try {
    const req = JSON.parse(process.argv[2] || '{}');
    console.log(JSON.stringify(perform(req)));
  } catch (e) {
    // Never return parser excerpts, configuration values, or environment contents.
    console.log(JSON.stringify({ error: e.code ? `No se pudo acceder a la configuración (${e.code}).` : e.message }));
    process.exitCode = 1;
  }
}
