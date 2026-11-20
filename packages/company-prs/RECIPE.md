# Recipe: company-prs

## Goal

Show three horizontal tabs for organization-wide open PRs, the current user's own open PRs, and open PRs assigned to the user, requested for review from the user, or requested for review from the `easor-white-walkers` team.

## Integration boundaries

- Derive organization names from the authenticated GitHub viewer's organization/team memberships; do not commit account or organization identifiers.
- Keep the `my-prs.tracked` shared-state key so existing manual tracking survives the clone.
- Use `gh` for read-only GraphQL queries; do not add a token, credential, API key, or secret to mod state or source.
- Preserve the existing PR/check details and manual follow feature.
- Run the Herdr clone command before applying package code. Never patch the shipped mod directly.

## Verification

Run `node packages/company-prs/test.cjs`, `npm test`, `herdr-app check ~/.config/herdr-app/mods/company-prs`, then inspect the live Herdr window and its `herdr-app status`.
