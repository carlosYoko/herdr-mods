# Working on this repository

- Source of truth: packages/<package>/mods/<name>/, never the entire Herdr home.
- Never commit credentials, app state, conversations, real account IDs or screenshots of private workspaces.
- Do not copy or relicense shipped Herdr mod code. Clone locally with Herdr commands and apply a small integration patch.
- Run npm test, then herdr-app check for every changed installed mod, then inspect it in the app.
- Never redeem a real Codex reset credit as an automated test. Protocol tests must mock the app-server.
- Keep protocol methods explicitly allowlisted. Consumption must require confirmation and an idempotency key.
- Preserve pending-attempt keys on uncertain outcomes. Do not add automatic retries that could spend credits.
- Do not claim macOS testing unless actually performed on macOS.
- Check git diff and staged filenames before publishing.
