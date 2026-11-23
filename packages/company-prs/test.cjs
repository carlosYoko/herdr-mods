const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rewriteModReference } = require('./install.cjs');

const modPath = path.join(__dirname, 'mods', 'company-prs', 'main.js');
const source = fs.readFileSync(modPath, 'utf8');
for (const required of [
  'TEAM_SLUG = "easor-white-walkers"',
  'organizations(first: 100)',
  'author:@me',
  'review-requested:@me',
  'team-review-requested:${org.login}/${TEAM_SLUG}',
  'assignee:@me',
  'this.tab("company", "PRs"',
  'this.tab("own", "Mis PRs"',
  'this.tab("assigned", "PRs Asignadas"',
  'this.selectedTab === "assigned" ? this.sections.review',
  'mod: "company-pr-review"',
  'this.review(pr, cx)',
  'if (checking()) return'
]) assert.ok(source.includes(required), `expected mod to include ${required}`);
assert.ok(!source.includes('org:nomoapp'), 'organization is discovered from current GitHub memberships, not hard-coded');

const reviewUI = fs.readFileSync(path.join(__dirname, 'mods', 'company-pr-review', 'main.js'), 'utf8');
for (const required of [
  'child(label)',
  '"Comentar"',
  '"Inicio"',
  '"Fin"',
  'this.descriptionExpanded = false',
  'this.descriptionExpanded = !this.descriptionExpanded',
  'Descripción de la PR',
  'Comentario general de la revisión (opcional)',
  'addBg: "#0e2a1b"',
  'removeBg: "#2c1618"',
  'hunkBg: "#121d2f"',
  'Creada por @${this.authorLogin || "…"}',
  'AvatarImage.new(this.avatarPath)',
  'AvatarFallback.new()'
]) assert.ok(reviewUI.includes(required), `expected review modal to include ${required}`);

const layout = {
  content: { mod: 'my-prs' },
  children: [{ content: { mod: 'workspace-chrome' } }, { content: { mod: 'my-prs' } }]
};
assert.equal(rewriteModReference(layout, 'my-prs', 'company-prs'), 2);
assert.deepEqual([layout.content.mod, layout.children[1].content.mod], ['company-prs', 'company-prs']);
assert.equal(rewriteModReference(layout, 'my-prs', 'company-prs'), 0, 'install migration is idempotent');

console.log('Passed: company/own/reviewer/team PR sections, dynamic org discovery and safe layout migration.');
