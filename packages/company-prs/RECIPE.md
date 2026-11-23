# Recipe: company-prs

## Goal

Show three horizontal tabs for organization-wide open PRs, the current user's own open PRs, and open PRs assigned to the user, requested for review from the user, or requested for review from the `easor-white-walkers` team.

## Integration boundaries

- Derive organization names from the authenticated GitHub viewer's organization/team memberships; do not commit account or organization identifiers.
- Keep the `my-prs.tracked` shared-state key so existing manual tracking survives the clone.
- Use `gh` for reads and a narrowly allowlisted helper for POSTing GitHub pull-request reviews; do not add a token, credential, API key, or secret to mod state or source.
- Require an explicit click to approve or submit comments. Never auto-retry a review submission; persist only an uncertainty marker (not comment text) until the user verifies GitHub.
- Preserve the existing PR/check details and manual follow feature.
- Run the Herdr clone command before applying package code. Never patch the shipped mod directly.

## Verification

Run `node packages/company-prs/test.cjs`, `node packages/company-prs/test-review-api.cjs`, `npm test`, `herdr-app check` for both installed mods, then inspect the live Herdr modal and `herdr-app status`. Never test by creating a real review.
