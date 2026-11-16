const assert = require('assert/strict');
const { patchTabs, integrateLayout } = require('../packages/codex-usage/install.cjs');
// Minimal synthetic protocol fixture, not a copy of Herdr source.
const fixture = 'import { View, div, svg, image } from "gpui-kit";\nexport default class Tabs extends View {\n  init() {\n  }\nrender() { return root.children(shown.map(item))); }\n}';
const patched = patchTabs(fixture);
assert.ok(patched.includes('super.init(props, cx)'));
assert.ok(patched.includes('.child(this.quotaBar())'));
assert.equal(patchTabs(patched), patched);
assert.throws(() => patchTabs('different version'), /Unsupported/);
const layout = { children: [{ content: { mod: 'tabs-compact' }, id: 'personal-tabs' }, { content: { mod: 'my-prs' } }] };
assert.equal(integrateLayout(layout, 'codex-usage-tabs', 'tabs-compact').children[0].content.mod, 'codex-usage-tabs');
assert.equal(layout.children[0].id, 'personal-tabs');
assert.equal(layout.children[1].content.mod, 'my-prs');
assert.equal(integrateLayout({ children: [{ content: { mod: 'tabs' } }] }, 'custom-tabs').children[0].content.mod, 'custom-tabs');
assert.throws(() => integrateLayout({ children: [] }, 'custom', 'tabs-compact'), /exactly one/);
assert.throws(() => integrateLayout({ children: [{content:{mod:'tabs-compact'}},{content:{mod:'tabs-compact'}}] }, 'custom', 'tabs-compact'), /exactly one/);
console.log('Passed: installer adapter, idempotent patch, layout integration and incompatible layout guards.');
