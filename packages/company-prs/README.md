# Company PRs

Herdr mod cloned from the locally installed `my-prs` mod, with three horizontal tabs:

- **PRs**: open PRs in organizations where the GitHub CLI user belongs to the `easor-white-walkers` team, plus manually tracked PRs.
- **Mis PRs**: open PRs authored by the current GitHub CLI user.
- **PRs Asignadas**: open PRs assigned directly to the user, requesting their review, or requesting review from `easor-white-walkers`.

Existing manual URL tracking is retained.

The organization is discovered from the current GitHub memberships; no organization/account identifier is hard-coded. Queries use GitHub CLI authentication and only read GitHub data. Each category paginates up to GitHub Search's 1,000-result limit. The mod refreshes every minute.

## Install

Requires Herdr, GitHub CLI (`gh`) authenticated to GitHub, and an active layout containing the existing `my-prs` block:

```sh
node packages/company-prs/install.cjs
```

The installer clones `my-prs` with `herdr-app do mod.clone` if necessary, applies only the packaged files, changes the active layout's mod reference, makes a backup, and runs `herdr-app check`. To explicitly replace a prior local modification of `company-prs`, inspect it first and pass `--update`.

## Testing

```sh
node packages/company-prs/test.cjs
herdr-app check ~/.config/herdr-app/mods/company-prs
```
