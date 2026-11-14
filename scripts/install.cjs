#!/usr/bin/env node
// Explicit selection only: discovering/listing packages never runs their installers.
const fs = require('fs');
const path = require('path');
const PACKAGES = path.resolve(__dirname, '../packages');
const USAGE = `Usage:
  npm run mods:list
  npm run mod:install -- <package> [package options]
  npm run mod:install -- codex-usage --update

No package is installed by default. Exactly one package must be selected.
Use --list to see available packages or --help for this message.`;

function getCatalog(packagesDir = PACKAGES) {
  const catalog = new Map();
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesDir, entry.name, 'herdr-package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.id !== entry.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)
      || typeof manifest.description !== 'string'
      || !Array.isArray(manifest.mods) || !manifest.mods.every(n => typeof n === 'string' && /^[a-z0-9-]+$/.test(n))
      || typeof manifest.installer !== 'string' || !/^[a-z0-9-]+\.cjs$/.test(manifest.installer)) {
      throw new Error(`Invalid package manifest: ${manifestPath}`);
    }
    const installer = path.join(packagesDir, entry.name, manifest.installer);
    if (!fs.statSync(installer).isFile()) throw new Error(`Installer missing: ${manifest.id}`);
    catalog.set(manifest.id, { ...manifest, installer });
  }
  return catalog;
}

function execute(argv, { packagesDir = PACKAGES, log = console.log, install = (pkg, options) => {
  const module = require(pkg.installer);
  if (typeof module.install !== 'function') throw new Error(`Package ${pkg.id} has no install() export`);
  module.install(options);
} } = {}) {
  if (argv.length === 1 && argv[0] === '--help') { log(USAGE); return; }
  if (!argv.length) throw new Error(`Select a package. Nothing was installed.\n${USAGE}`);
  const catalog = getCatalog(packagesDir);
  if (argv.length === 1 && argv[0] === '--list') {
    log('Available packages (listing does not install anything):');
    for (const pkg of catalog.values()) log(`  ${pkg.id}\n    ${pkg.description}\n    Mods: ${pkg.mods.join(', ')}`);
    return;
  }
  const [id, ...options] = argv;
  const pkg = catalog.get(id);
  if (!pkg) throw new Error(`Unknown package: ${id}. Nothing was installed. Use npm run mods:list.`);
  // Do not support implicit/all/multiple installations. The selected installer validates options.
  if (options.some(arg => catalog.has(arg)) || options.includes('--all')) throw new Error('Select exactly one package. Nothing was installed.');
  log(`Selected package: ${pkg.id} (${pkg.mods.join(', ')})`);
  install(pkg, options);
}

module.exports = { execute, getCatalog };
if (require.main === module) {
  try { execute(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
