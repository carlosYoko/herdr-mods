// All installers here are synthetic. No Herdr state or real account is touched.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execute, getCatalog } = require('./install.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-package-selection-'));
try {
  for (const id of ['first-mod', 'second-mod']) {
    const dir = path.join(root, id);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'herdr-package.json'), JSON.stringify({ id, description: 'test fixture', mods: [id], installer: 'install.cjs' }));
    // Listing must never evaluate this module. Selection should evaluate only one.
    fs.writeFileSync(path.join(dir, 'install.cjs'), 'throw new Error("installer was evaluated");');
  }
  const calls = [], output = [];
  const opts = { packagesDir: root, log: line => output.push(line), install: (pkg, args) => calls.push({ id: pkg.id, args }) };
  execute(['--list'], opts);
  assert.equal(calls.length, 0);
  assert.ok(output.join('\n').includes('first-mod'));
  assert.ok(output.join('\n').includes('second-mod'));
  execute(['--help'], opts);
  assert.equal(calls.length, 0);
  assert.throws(() => execute([], opts), /Select a package/);
  assert.throws(() => execute(['unknown'], opts), /Unknown package/);
  assert.throws(() => execute(['../first-mod'], opts), /Unknown package/);
  assert.throws(() => execute(['first-mod', 'second-mod'], opts), /exactly one/);
  assert.throws(() => execute(['first-mod', '--all'], opts), /exactly one/);
  assert.equal(calls.length, 0);
  execute(['second-mod', '--update', '--no-switch'], opts);
  assert.deepEqual(calls, [{ id: 'second-mod', args: ['--update', '--no-switch'] }]);
  const manifest = path.join(root, 'first-mod', 'herdr-package.json');
  const broken = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  broken.installer = '../escape.cjs';
  fs.writeFileSync(manifest, JSON.stringify(broken));
  assert.throws(() => getCatalog(root), /Invalid package manifest/);
  assert.equal(calls.length, 1);
  console.log('Passed: list without executing code, explicit one-package selection, option forwarding, missing/unknown/multiple/all/traversal guards.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
