#!/usr/bin/env node
// Clone the user's PR mod, then install this package's allowlisted review integration.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ROOT = __dirname;
const SOURCE_MOD = 'my-prs';
const MODS = [
  { name: 'company-prs', files: ['mod.json', 'main.js'], cloneFrom: SOURCE_MOD },
  { name: 'company-pr-review', files: ['mod.json', 'main.js', 'review-api.cjs'] }
];

function rewriteModReference(layout, from, to) {
  let changed = 0;
  function visit(node) {
    if (node?.content?.mod === from) { node.content.mod = to; changed++; }
    for (const child of node?.children || []) visit(child);
  }
  visit(layout);
  return changed;
}

function countModReference(layout, name) {
  let count = 0;
  function visit(node) {
    if (node?.content?.mod === name) count++;
    for (const child of node?.children || []) visit(child);
  }
  visit(layout);
  return count;
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

function packageFilesMatch(targetDir, sourceDir, files) {
  return files.every(file => fs.existsSync(path.join(targetDir, file)) &&
    fs.readFileSync(path.join(targetDir, file)).equals(fs.readFileSync(path.join(sourceDir, file))));
}

function install(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const home = path.resolve(options.home || process.env.HERDR_APP_HOME || path.join(os.homedir(), '.config', 'herdr-app'));
  const status = JSON.parse(runApp(home, ['status']));
  const layoutName = status.layout;
  if (!/^[a-zA-Z0-9_-]+$/.test(layoutName || '')) throw new Error('No active Herdr layout was reported.');

  const layoutFile = path.join(home, 'layouts', `${layoutName}.json`);
  if (!fs.existsSync(layoutFile)) throw new Error(`Active layout file not found: ${layoutFile}`);
  const layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'));
  const layoutOriginal = JSON.stringify(layout, null, 2) + '\n';
  const previousReferenceCount = rewriteModReference(layout, SOURCE_MOD, 'company-prs');
  const currentReferenceCount = countModReference(JSON.parse(layoutOriginal), 'company-prs');
  if (!previousReferenceCount && !currentReferenceCount) {
    throw new Error(`Active layout ${layoutName} does not contain ${SOURCE_MOD} or company-prs; nothing was changed.`);
  }

  for (const mod of MODS) {
    const sourceDir = path.join(ROOT, 'mods', mod.name);
    for (const file of mod.files) if (!fs.existsSync(path.join(sourceDir, file))) throw new Error(`Package source missing: ${mod.name}/${file}`);
    const targetDir = path.join(home, 'mods', mod.name);
    if (mod.cloneFrom && fs.existsSync(targetDir)) {
      let installedMod = {};
      try { installedMod = JSON.parse(fs.readFileSync(path.join(targetDir, 'mod.json'), 'utf8')); } catch {}
      if (installedMod.cloned_from?.name !== mod.cloneFrom && !options.update) {
        throw new Error(`${mod.name} exists but is not a Herdr clone of ${mod.cloneFrom}; use --update only after reviewing it.`);
      }
      if (currentReferenceCount && !options.update && !packageFilesMatch(targetDir, path.join(ROOT, 'mods', mod.name), mod.files)) {
        throw new Error(`${mod.name} has local changes; use --update only after reviewing them.`);
      }
    } else if (!mod.cloneFrom && fs.existsSync(targetDir) && !options.update && !packageFilesMatch(targetDir, sourceDir, mod.files)) {
      throw new Error(`${mod.name} already exists with local changes; use --update only after reviewing them.`);
    }
  }

  const createdDirs = [];
  const originals = new Map();
  const backupDir = path.join(home, 'data', 'community-backups', `company-prs-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  try {
    const primary = MODS[0];
    const primaryDir = path.join(home, 'mods', primary.name);
    if (!fs.existsSync(primaryDir)) {
      runApp(home, ['do', 'mod.clone', JSON.stringify({ name: SOURCE_MOD, as: primary.name })]);
      createdDirs.push(primaryDir);
    }

    for (const mod of MODS) {
      const targetDir = path.join(home, 'mods', mod.name);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        createdDirs.push(targetDir);
      }
      for (const file of mod.files) {
        const dest = path.join(targetDir, file);
        originals.set(dest, fs.existsSync(dest) ? { existed: true, data: fs.readFileSync(dest) } : { existed: false });
      }
    }
    originals.set(layoutFile, { existed: true, data: Buffer.from(layoutOriginal) });

    for (const [file, state] of originals) {
      if (!state.existed) continue;
      const backup = path.join(backupDir, path.relative(home, file));
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(backup, state.data);
    }

    for (const mod of MODS) {
      const targetDir = path.join(home, 'mods', mod.name);
      const sourceDir = path.join(ROOT, 'mods', mod.name);
      for (const file of mod.files) atomicWrite(path.join(targetDir, file), fs.readFileSync(path.join(sourceDir, file)));
    }
    if (previousReferenceCount) atomicWrite(layoutFile, JSON.stringify(layout, null, 2) + '\n');

    for (const mod of MODS) console.log(runApp(home, ['check', path.join(home, 'mods', mod.name)]).trim());
    const finalStatus = JSON.parse(runApp(home, ['status']));
    if (finalStatus.errors?.length) throw new Error(`Herdr reports mod/layout errors: ${finalStatus.errors.join('; ')}`);
  } catch (error) {
    for (const [file, state] of originals) {
      if (state.existed) atomicWrite(file, state.data);
      else fs.rmSync(file, { force: true });
    }
    for (const dir of createdDirs.reverse()) fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`${error.message}\nPrevious files were backed up at ${backupDir}.`);
  }

  console.log(`Installed ${MODS.map(mod => mod.name).join(' and ')} in ${home}; active layout: ${layoutName}.`);
  console.log(`Backup: ${backupDir}`);
}

module.exports = { install, rewriteModReference, countModReference, packageFilesMatch };
if (require.main === module) {
  try { install(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
