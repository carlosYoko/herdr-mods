# Company PRs

Herdr mod cloned from the locally installed `my-prs` mod, with three horizontal tabs:

- **PRs**: open PRs in organizations where the GitHub CLI user belongs to the `easor-white-walkers` team, plus manually tracked PRs.
- **Mis PRs**: open PRs authored by the current GitHub CLI user.
- **PRs Asignadas**: open PRs assigned directly to the user, requesting their review, or requesting review from `easor-white-walkers`.

Existing manual URL tracking is retained. Selecting a PR opens a modal with its description, changed files, unified diffs, existing review comments, and review summaries. The PR creator's GitHub username and avatar appear discreetly beneath the title; the public avatar is cached locally with an initials fallback. Each diff row has a visible **Comentar** action; click it to set the start, then **Fin** on another line in the same hunk for a multiline comment. **Usar esta línea** creates a single-line comment. The PR description is collapsed by default and can be expanded; the general review comment stays visible, and diffs use GitHub dark palette colors. Draft comments can be removed before submitting. The modal can submit a comment review or an explicit approval.

GitHub actions use an allowlisted helper and the authenticated `gh` CLI; credentials are never copied into Herdr state. An ambiguous submission result is not retried automatically and blocks duplicate submission until the user confirms they checked GitHub.

The organization is discovered from the current GitHub memberships; no organization/account identifier is hard-coded. Queries use GitHub CLI authentication and only read GitHub data. Each category paginates up to GitHub Search's 1,000-result limit. The mod refreshes every minute.

## Install

Requires Herdr, GitHub CLI (`gh`) authenticated to GitHub, and an active layout containing the existing `my-prs` block:

```sh
node packages/company-prs/install.cjs
```

The installer clones `my-prs` with `herdr-app do mod.clone` if necessary, installs the companion review modal, changes the active layout's mod reference, makes a backup, and runs `herdr-app check` for both mods. To explicitly replace prior local modifications, inspect them first and pass `--update`.

## Testing

```sh
node packages/company-prs/test.cjs
node packages/company-prs/test-review-api.cjs
herdr-app check ~/.config/herdr-app/mods/company-prs
herdr-app check ~/.config/herdr-app/mods/company-pr-review
```
