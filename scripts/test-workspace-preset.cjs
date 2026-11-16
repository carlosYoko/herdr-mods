const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getCatalog } = require('./install.cjs');

const root = path.resolve(__dirname, '..');
const pkg = getCatalog(path.join(root, 'packages')).get('carlos-workspace');
assert.ok(pkg, 'visual preset is discoverable');
assert.deepEqual(pkg.mods, [], 'preset installs no mods');
const layout = JSON.parse(fs.readFileSync(path.join(root, 'packages/carlos-workspace/layouts/carlos-workspace.json'), 'utf8'));
assert.equal(layout.theme, 'graphite');
assert.deepEqual(layout.terminal_padding, [6, 6]);
assert.deepEqual(layout.padding, [0, 2]);
const refs = new Set();
(function visit(node) {
  if (node?.content?.mod) refs.add(node.content.mod);
  for (const child of node?.children || []) visit(child);
})(layout);
assert.deepEqual([...refs].sort(), ['agents', 'changes', 'files', 'spaces', 'tabs', 'workspace-chrome', 'workspace-status'].sort());
assert.ok(JSON.stringify(layout).includes('"mod":"pane"'), 'pane header uses Herdr standard pane mod');
console.log('Passed: Carlos Workspace preset is discoverable, visual-only, and references standard Herdr mods.');
