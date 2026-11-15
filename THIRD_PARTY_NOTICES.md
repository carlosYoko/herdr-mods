# Third-party software

This is an independent community project, not an official Herdr or OpenAI product.

The MIT license covers the original source in this repository only. Herdr,
gpui-kit, Codex and their trademarks retain their own licenses and ownership.
They are prerequisites, not bundled dependencies.

The installer invokes Herdr's supported `mod.clone` and `layout.clone`
commands on the target device and patches that local copy of the tabs mod.
The official tabs implementation, its assets, fonts and generated type files
are deliberately NOT distributed or relicensed here. The resulting local
clone still includes upstream code subject to its original terms.

`mcp-manager` uses smol-toml 1.9.1 (MIT, © smol-toml contributors) to parse
and serialize Codex TOML. npm installs the pinned dependency; the MCP installer
deploys that package, including its original LICENSE, with the local helper.
Source: https://github.com/squirrelchat/smol-toml

The UI preview is a synthetic illustration created for this package; it is
not a screenshot of a user's workspace or account.
