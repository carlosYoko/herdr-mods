#!/usr/bin/env node
// Install an allowlisted patch onto a Herdr-created clone of the user's PR mod.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ROOT = __dirname;
const MOD_NAME = 'company-prs';
const SOURCE_MOD = 'my-prs';
const FILES = ['mod.json', 'main.js'];

function rewriteModReference(layout, from, to) {
  let changed = 0;
  function visit(node) {
    if (node?.content?.mod === from) { node.content.mod = to; changed++; }
    for (const child of node?.children || []) visit(child);
  }
  visit(layout);
  return changed;
}

function runApp(home, args) {
  const result = spawnSync('herdr-app', args, {
    encoding: 'utf8',
    env: { ...process.env, HERDR_APP_HOME: home },
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    throw new Error(`herdr-app ${args.join(' ')} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  let json;
  try { json = JSON.parse(result.stdout); } catch {}
  if (json?.error) throw new Error(json.error);
  return result.stdout;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--update') options.update = true;
    else if (arg === '--home' && argv[i + 1]) options.home = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  return options;
}

function atomicWrite(file, contents) {
  const temporary = `${file}.company-prs-tmp`;
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, file);
}

function install(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const home = path.resolve(options.home || process.env.HERDR_APP_HOME || path.join(os.homedir(), '.config', 'herdr-app'));
  const status = JSON.parse(runApp(home, ['status']));
  const layoutName = status.layout;
  if (!/^[a-zA-Z0-9_-]+$/.test(layoutName || '')) throw new Error('No active Herdr layout was reported.');

  const layoutFile = path.join(home, 'layouts', `${layoutName}.json`);
  const targetDir = path.join(home, 'mods', MOD_NAME);
  const sourceDir = path.join(ROOT, 'mods', MOD_NAME);
  if (!fs.existsSync(layoutFile)) throw new Error(`Active layout file not found: ${layoutFile}`);
  for (const file of FILES) if (!fs.existsSync(path.join(sourceDir, file))) throw new Error(`Package source missing: ${file}`);

  let layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
  const layoutOriginal = JSON.stringify(layout, null, 2) + '\n';
  const previousReferenceCount = rewriteModReference(layout, SOURCE_MOD, MOD_NAME);
  let currentReferenceCount = 0;
  if (!previousReferenceCount) {
    const inspect = JSON.parse(layoutOriginal);
    function count(node) {
      if (node?.content?.mod === MOD_NAME) currentReferenceCount++;
      for (const child of node?.children || []) count(child);
    }
    count(inspect);
  }
  if (!previousReferenceCount && !currentReferenceCount) {
    throw new Error(`Active layout ${layoutName} does not contain ${SOURCE_MOD} or ${MOD_NAME}; nothing was changed.`);
  }

  let createdClone = false;
  if (!fs.existsSync(targetDir)) {
    runApp(home, ['do', 'mod.clone', JSON.stringify({ name: SOURCE_MOD, as: MOD_NAME })]);
    createdClone = true;
  }
  const installedModFile = path.join(targetDir, 'mod.json');
  let installedMod = {};
  try { installedMod = JSON.parse(fs.readFileSync(installedModFile, 'utf8')); } catch {}
  if (installedMod.cloned_from?.name !== SOURCE_MOD && !options.update) {
    throw new Error(`${MOD_NAME} exists but is not a Herdr clone of ${SOURCE_MOD}; use --update only after reviewing it.`);
  }

  const backupDir = path.join(home, 'data', 'community-backups', `company-prs-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const originals = new Map();
  for (const file of FILES) {
    const dest = path.join(targetDir, file);
    if (fs.existsSync(dest)) originals.set(dest, fs.readFileSync(dest));
  }
  originals.set(layoutFile, Buffer.from(layoutOriginal));
  for (const [file, data] of originals) {
    const relative = path.relative(home, file);
    const backup = path.join(backupDir, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, data);
  }

  try {
    for (const file of FILES) {
      const dest = path.join(targetDir, file);
      atomicWrite(dest, fs.readFileSync(path.join(sourceDir, file)));
    }
    if (previousReferenceCount) atomicWrite(layoutFile, JSON.stringify(layout, null, 2) + '\n');
    console.log(runApp(home, ['check', targetDir]).trim());
    const finalStatus = JSON.parse(runApp(home, ['status']));
    if (finalStatus.errors?.length) throw new Error(`Herdr reports mod/layout errors: ${finalStatus.errors.join('; ')}`);
  } catch (error) {
    for (const [file, data] of originals) atomicWrite(file, data);
    if (createdClone) fs.rmSync(targetDir, { recursive: true, force: true });
    throw new Error(`${error.message}\nPrevious files were backed up at ${backupDir}.`);
  }

  console.log(`Installed ${MOD_NAME} in ${home}; active layout: ${layoutName}.`);
  console.log(`Backup: ${backupDir}`);
}

module.exports = { install, rewriteModReference };
if (require.main === module) {
  try { install(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
