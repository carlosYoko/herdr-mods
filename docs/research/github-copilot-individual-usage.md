# GitHub Copilot: individual usage data for a Herdr indicator

## Findings

GitHub has supported personal billing usage endpoints, but their responses do **not** provide a remaining quota percentage or quota-reset timestamp. A faithful indicator can report monthly consumption; it must not present that as remaining quota.

### Supported personal billing endpoints

- `GET /users/{username}/settings/billing/ai_credit/usage` reports AI-credit usage by product, SKU, and model.
- `GET /users/{username}/settings/billing/premium_request/usage` reports legacy premium-request usage.
- Both support `year`, `month`, `day`, `model`, and `product` filters and document usage/cost fields such as `grossQuantity`, `discountQuantity`, and `netQuantity`.
- The documented fine-grained-token or GitHub App user-token permission is **Plan: read**. Prefer these documented auth mechanisms; do not harvest IDE credentials.
- Reports cover up to 24 months. The API docs do not promise live freshness.

Sources: [AI-credit usage for a user](https://docs.github.com/en/rest/billing/usage#get-billing-ai-credit-usage-report-for-a-user), [premium-request usage for a user](https://docs.github.com/en/rest/billing/usage#get-billing-premium-request-usage-report-for-a-user).

### Billing/reset meaning

Current individual billing is AI-credit based. Included credits reset at 00:00 UTC on the first calendar day of each month, independently of subscription billing date; unused included credits do not roll over. Allowances include variable flex allotments, so a fixed denominator/percentage would be misleading. Code completions and next-edit suggestions are not charged as AI credits.

Legacy premium-request billing remains relevant for certain existing annual subscribers. Do not label all Copilot use as premium requests.

Sources: [Individual Copilot billing](https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/billing), [legacy premium-request monitoring](https://docs.github.com/en/copilot/reference/copilot-billing/request-based-billing-legacy/monitor-premium-requests).

### APIs not appropriate for an individual self-service indicator

- Organization billing usage endpoints require organization authorization and describe organization-billed usage.
- Copilot usage-metrics reports describe adoption/engagement, not remaining quota.
- Copilot seat APIs describe organization seat assignment/activity, not an individual's purchased-plan quota.

Sources: [Billing REST API](https://docs.github.com/en/rest/billing/usage), [Copilot usage metrics](https://docs.github.com/en/rest/copilot/copilot-usage-metrics), [Copilot seat details](https://docs.github.com/en/rest/copilot/copilot-user-management#get-copilot-seat-assignment-details-for-a-user).

### IDE entitlement data is not established as a public API

VS Code's first-party source parses fields such as `quota_snapshots`, `quota_reset_date_utc`, `percent_remaining`, and `quota_reset_at`. This demonstrates data used by a first-party client, but does not establish a supported public third-party API or authorize reuse of IDE credentials.

Sources: [VS Code chat entitlement parsing](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/chat/common/chatEntitlementService.ts#L977-L1046), [GitHub: monitor AI usage](https://docs.github.com/en/copilot/how-tos/manage-and-track-spending/monitor-ai-usage).

### API polling limits

Authenticated REST requests generally share a 5,000-request/hour primary limit; rate-limit headers expose remaining requests and reset epoch. This is separate from Copilot service limits, for which the reviewed documentation supplies no fixed personal remaining counter or reset API.

Sources: [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [Copilot usage limits](https://docs.github.com/en/copilot/concepts/billing-and-usage/individuals/usage-limits).

## Recommendation

If implementing a personal Copilot panel, start with the supported AI-credit usage endpoint and optionally support legacy premium-request reporting. Require a user-authorized fine-grained token with `Plan: read`, cache conservatively, and show reported monthly consumption plus fetch time. Link to GitHub's usage page for the authoritative allowance/reset view. Do not invent a remaining percentage or call internal IDE entitlement endpoints.

No account/API testing was performed; no credentials were used.
