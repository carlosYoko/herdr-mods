import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { focused, panes, agents, terminals, spaces, theme, appHome, exec, run, layout, shared, setShared } from "herdr";
import { translator, errorText } from "./i18n.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const found = find(c, id); if (found) return found; }
}
function context() {
  const f = focused();
  const address = f?.shown ?? f?.terminal;
  const pane = panes().find(p => p.terminal === address);
  const agent = agents().find(a => a.address === address);
  const terminal = terminals().find(t => t.address === address);
  const app = String(agent?.app ?? pane?.app ?? terminal?.report?.app ?? "").toLowerCase();
  const client = app === "pi" ? "pi" : app === "codex" ? "codex" : ["claude", "claude-code"].includes(app) ? "claude" : null;
  const machine = spaces().find(s => s.id === f?.space)?.machine;
  const cwd = f?.cwd ?? pane?.cwd;
  return { client, cwd, address, remote: Boolean(machine || address?.includes("/")) };
}
export default class McpManager extends View {
  init(_props, cx) {
    this.key = null; this.data = null; this.error = null; this.loading = false; this.writing = false; this.authenticating = null; this.version = 0;
    cx.spawn(async cx => {
      try {
        const r = await exec("node", [appHome() + "/mods/mcp-manager/manage.cjs", JSON.stringify({ action: "language" })], { timeout: 6000 });
        const data = JSON.parse(r.stdout);
        if (r.code === 0 && ["en", "es"].includes(data.language)) setShared("mcp.ui.language", data.language);
      } catch { /* Keep the cached language or English if detection is unavailable. */ }
      cx.notify();
    });
    cx.timer.every(15000, cx => {
      const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
      if (panel && !panel.hidden && body?.active === "mcp" && !this.pending && !this.writing && !this.authenticating) this.refresh(cx);
    });
  }
  refresh(cx) {
    if (!this.ctx?.client || !this.ctx.cwd || this.ctx.remote || this.writing || this.authenticating) return;
    const version = ++this.version;
    const request = { action: "list", client: this.ctx.client, cwd: this.ctx.cwd };
    this.loading = true; this.error = null;
    cx.spawn(async cx => {
      try {
        const r = await exec("node", [appHome() + "/mods/mcp-manager/manage.cjs", JSON.stringify(request)], { timeout: 10000 });
        const data = JSON.parse(r.stdout);
        if (version !== this.version) return;
        if (data.error) throw Object.assign(new Error(), data);
        if (r.code !== 0) throw { error_code: "read_failed" };
        this.data = data;
      } catch (e) { if (version === this.version) { this.error = e; this.data = null; } }
      finally { if (version === this.version) { this.loading = false; cx.notify(); } }
    });
  }
  ask(names, enabled, cx, authTargets = []) {
    if (this.loading || this.writing || this.authenticating || !this.data?.writable) return;
    this.pending = { client: this.ctx.client, cwd: this.ctx.cwd, names, enabled, snapshot: this.data.snapshot, authTargets };
    this.message = null; cx.notify();
  }
  signIn(row, cx) {
    if (this.ctx.client !== "pi" || !row.oauth || this.loading || this.writing || this.authenticating || this.pending) return;
    this.startPiOAuth({ name: row.name, local: row.scope === "Proyecto", cwd: this.ctx.cwd }, this.version, cx);
  }
  startPiOAuth(target, version, cx) {
    this.authenticating = target.name;
    this.error = null;
    this.message = "signingIn";
    cx.notify();
    cx.spawn(async cx => {
      try {
        const args = ["mcp", "login", target.name];
        if (target.local) args.push("--local");
        args.push("--timeout", "300");
        const result = await exec("pi", args, { cwd: target.cwd, timeout: 310000 });
        if (result.code !== 0) throw { error_code: "oauth_failed" };
        if (version === this.version) this.message = "signedIn";
      } catch {
        if (version === this.version) { this.error = { error_code: "oauthFailed" }; this.message = null; }
      } finally {
        if (this.authenticating === target.name) this.authenticating = null;
        cx.notify();
      }
    });
  }
  apply(cx) {
    if (!this.pending || this.writing || this.authenticating) return;
    const { authTargets = [], ...pending } = this.pending;
    const request = { ...pending, action: "apply", confirmed: true };
    this.pending = null; this.writing = true; this.error = null;
    const version = ++this.version;
    cx.spawn(async cx => {
      try {
        const r = await exec("node", [appHome() + "/mods/mcp-manager/manage.cjs", JSON.stringify(request)], { timeout: 15000 });
        const data = JSON.parse(r.stdout);
        if (data.error) throw Object.assign(new Error(), data);
        if (r.code !== 0) throw { error_code: "apply_failed" };
        if (version === this.version) { this.data = data; this.message = "saved"; }
        this.writing = false;
        for (const target of authTargets) {
          if (version !== this.version) break;
          this.authenticating = target.name;
          this.message = "signingIn";
          cx.notify();
          try {
            const args = ["mcp", "login", target.name];
            if (target.local) args.push("--local");
            args.push("--timeout", "300");
            const auth = await exec("pi", args, { cwd: request.cwd, timeout: 310000 });
            if (auth.code !== 0) throw new Error("Pi OAuth login failed");
            if (version === this.version) { this.message = "signedIn"; this.error = null; }
          } catch {
            if (version === this.version) { this.error = { error_code: "oauthFailed" }; this.message = null; }
            break;
          } finally { this.authenticating = null; }
        }
      } catch (e) { if (version === this.version) { this.error = e; this.data = null; } }
      finally { this.writing = false; this.authenticating = null; if (version !== this.version) this.refresh(cx); cx.notify(); }
    });
  }
  render(cx) {
    const t = theme(), ctx = context(), key = JSON.stringify(ctx);
    const language = shared("mcp.ui.language") || "en", tr = translator(language);
    if (key !== this.key) {
      this.key = key; this.ctx = ctx; this.data = null; this.pending = null; this.error = null; this.message = null; this.loading = false; ++this.version;
      this.refresh(cx);
    }
    const busy = this.loading || this.writing || Boolean(this.authenticating);
    const button = (id, text, action, disabled = false) => div().id(id).px(9).py(6).rounded(6).text_size(12)
      .bg(t.raised).text_color(disabled ? t.dim : t.foreground)
      .when(!disabled, el => el.hover(s => s.bg(t.hover)).on_click((_e, cx) => action(cx))).child(text);
    const note = text => div().text_size(12).text_color(t.muted).child(text);
    const rows = this.data?.rows ?? [];
    const canEdit = this.data?.writable && !busy && !this.pending;
    const root = v_flex().size_full().min_w(0).bg(t.chrome).text_color(t.foreground).text_size(13).rounded(10).border(1).border_color(t.border);
    root.child(h_flex().h(40).px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().font_semibold().child("MCP"))
      .child(button("refresh", tr("refresh"), cx => { this.pending = null; this.refresh(cx); cx.notify(); }, busy || !ctx.client || ctx.remote))
      .child(button("close", "×", () => run("layout.hide", { id: "panel" }))));
    const body = v_flex().id("mcp-scroll").flex_1().min_h(0).p(12).gap(12).overflow_y_scrollbar();
    body.child(div().font_semibold().child(ctx.client ? `${ctx.client === "claude" ? "Claude Code" : ctx.client === "pi" ? "Pi" : "Codex"} · ${ctx.address}` : tr("noAgent")));
    if (ctx.cwd) body.child(note(ctx.cwd));
    if (!ctx.client) body.child(note(tr("focusHint")));
    else if (ctx.remote) body.child(note(tr("remoteHint")));
    else {
      body.child(note(tr("standard")));
      if (this.loading) body.child(note(tr("reading")));
      if (this.writing) body.child(note(tr("writing")));
      if (this.error) body.child(div().text_color(t.blocked).child(errorText(this.error, language)));
      if (this.message) body.child(div().text_color(t.done).child(tr(this.message)));
      if (this.data) {
        body.child(button("details", tr(this.details ? "hideDetails" : "showDetails"), cx => { this.details = !this.details; cx.notify(); }));
        if (this.details) body.child(note(tr("noticeBase") + " " + tr(ctx.client === "pi" ? "noticePi" : ctx.client === "codex" ? "noticeCodex" : "noticeClaude")));
        body.child(note(tr("reload")));
        if (!this.data.writable) body.child(note(tr("readOnly")));
        body.child(h_flex().gap(6)
          .child(button("enable-all", tr("enableAll"), cx => this.ask(rows.filter(r => !r.enabled).map(r => r.name), true, cx), !canEdit || !rows.some(r => !r.enabled)))
          .child(button("disable-all", tr("disableAll"), cx => this.ask(rows.filter(r => r.enabled).map(r => r.name), false, cx), !canEdit || !rows.some(r => r.enabled))));
        if (!rows.length) body.child(note(tr("empty")));
        if (this.pending) {
          const selected = rows.filter(r => this.pending.names.includes(r.name));
          body.child(v_flex().p(10).gap(8).rounded(7).border(1).border_color(t.blocked)
            .child(div().font_semibold().child(tr(this.pending.enabled ? "enableCount" : "disableCount", { count: selected.length })))
            .child(note(selected.map(r => r.name).join(", ")))
            .when(this.pending.authTargets?.length > 0, el => el.child(note(tr("oauthAfterEnable"))))
            .child(note(tr("warning")))
            .child(h_flex().gap(6).child(button("confirm", tr("confirm"), cx => this.apply(cx)))
              .child(button("cancel", tr("cancel"), cx => { this.pending = null; cx.notify(); }))));
        }
        for (const [i, row] of rows.entries()) {
          const canSignIn = this.ctx.client === "pi" && row.oauth === true;
          const authAfterEnable = canSignIn && !row.enabled ? [{ name: row.name, local: row.scope === "Proyecto" }] : [];
          body.child(v_flex().gap(5).p(10).rounded(7).bg(t.surface)
            .child(h_flex().items_center().gap(8)
              .child(div().flex_1().min_w(0).font_semibold().child(row.name))
              .child(button(`toggle-${i}`, tr(this.ctx.client === "claude" ? "defined" : row.enabled ? "enabled" : "disabled"), cx => this.ask([row.name], !row.enabled, cx, authAfterEnable), !canEdit))
              .when(canSignIn, el => el.child(button(`login-${i}`, tr("signIn"), cx => this.signIn(row, cx), busy || Boolean(this.pending)))))
            .child(note(tr(row.scope === "Usuario" ? "user" : "project") + " · " + row.file)));
        }
        if (this.details) for (const file of this.data.files) body.child(note(tr(file.exists ? "fileRead" : "fileMissing", { file: file.file })));
      }
    }
    return root.child(body);
  }
}
