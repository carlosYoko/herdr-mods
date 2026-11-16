import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, appHome, theme, props, closeOverlay, shared, setShared, window } from "herdr";
import { translator, errorText, creditTitle, creditDescription } from "./i18n.js";

const PENDING = "codex.reset.pending";
const LOCK = "codex.reset.busyUntil";
function runQuota(args) {
  const helper = appHome() + "/mods/codex-quota/read-quota.cjs";
  return window()?.platform === "macos"
    ? exec("/bin/zsh", ["-lc", 'if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi; exec node "$@"', "herdr-codex-quota", helper, ...args], { timeout: 25000 })
    : exec("node", [helper, ...args], { timeout: 25000 });
}
function parseHelperOutput(output) {
  for (const line of output.split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line.trim());
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {}
  }
  throw Object.assign(new Error("The quota helper returned invalid output."), { error_code: "invalid_helper_output" });
}

export default class CodexResets extends View {
  init(_props, cx) {
    this.data = null;
    this.error = null;
    this.message = null;
    this.busy = false;
    this.selection = shared(PENDING) || null;
    // A closed panel may leave an ambiguous attempt; allow its lock to expire visibly.
    const remainingLock = Number(shared(LOCK) || 0) - Date.now();
    if (remainingLock > 0) cx.timer.after(remainingLock + 100, cx => cx.notify());
    this.load(cx);
  }

  date(seconds) {
    if (!Number.isFinite(seconds)) return translator(shared("codex.ui.language"))("noExpiry");
    const d = new Date(seconds * 1000), pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  load(cx) {
    if (this.busy) return;
    this.loading = true;
    cx.spawn(async cx => {
      try {
        const r = await runQuota(["--details"]);
        const data = parseHelperOutput(r.stdout);
        if (data.language) setShared("codex.ui.language", data.language);
        if (data.error) throw Object.assign(new Error(data.error), data);
        if (r.code !== 0) throw Object.assign(new Error("The quota helper exited unsuccessfully."), { error_code: "helper_failed" });
        this.data = data;
        if (!shared(PENDING)) this.error = null;
        setShared("codex.quota.latest", data);
      } catch (e) { this.error = e; }
      finally { this.loading = false; cx.notify(); }
    });
  }

  choose(credit, cx) {
    if (this.busy || shared(PENDING)) return;
    this.selection = { credit: credit.id, title: credit.title || "", key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
    this.message = null;
    cx.notify();
  }

  consume(cx) {
    const attempt = shared(PENDING) || this.selection;
    if (!attempt || this.busy || this.loading || Number(shared(LOCK) || 0) > Date.now()) return;
    // Keep the same attempt after ambiguous failures, including closing/reopening the panel.
    setShared(PENDING, attempt);
    setShared(LOCK, Date.now() + 45000);
    this.busy = true;
    this.error = null;
    cx.spawn(async cx => {
      try {
        const r = await runQuota(["--consume", "--confirmed", "--credit", attempt.credit, "--idempotency-key", attempt.key]);
        const result = parseHelperOutput(r.stdout);
        if (result.language) setShared("codex.ui.language", result.language);
        if (result.error) throw Object.assign(new Error(result.error), result);
        if (r.code !== 0) throw Object.assign(new Error("The quota helper exited unsuccessfully."), { error_code: "helper_failed" });
        if (!["reset", "nothingToReset", "noCredit", "alreadyRedeemed"].includes(result.outcome)) {
          throw Object.assign(new Error("Unknown redemption outcome"), { code: "unknown_outcome" });
        }
        this.message = result.outcome;
        setShared(PENDING, null);
        this.selection = null;
      } catch (e) {
        this.error = e;
      } finally {
        this.busy = false;
        setShared(LOCK, 0);
        this.load(cx);
        cx.notify();
      }
    });
  }

  button(id, text, primary, enabled, action) {
    const t = theme();
    return div().id(id).px(12).py(7).rounded(6).text_size(12)
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .opacity(enabled ? 1 : 0.4).on_click((_event, cx) => { if (enabled) action(cx); }).child(text);
  }

  render() {
    const t = theme(), pending = shared(PENDING), selection = pending || this.selection;
    const language = shared("codex.ui.language") || "en", tr = translator(language);
    const locked = this.busy || Number(shared(LOCK) || 0) > Date.now();
    const credits = [...(this.data?.reset_credits || [])].sort((a, b) => (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity));
    const count = this.data?.resets_available;
    const card = credit => {
      const available = credit.status === "available" && credit.type === "codexRateLimits" && (!Number.isFinite(credit.expires_at) || credit.expires_at * 1000 > Date.now());
      return v_flex().p(12).gap(5).rounded(7).bg(t.raised)
        .child(h_flex().items_center().gap(8)
          .child(div().flex_1().font_semibold().child(creditTitle(credit.title, language)))
          .child(this.button(`select-${credit.id}`, tr("use"), false, available && !locked && !this.loading && !pending, cx => this.choose(credit, cx))))
        .when(Boolean(credit.description), el => el.child(div().text_size(11).text_color(t.muted).child(creditDescription(credit.description, language))))
        .child(div().text_size(11).text_color(t.dim).child(tr("expires", { date: this.date(credit.expires_at), status: tr(["available", "redeeming", "redeemed"].includes(credit.status) ? credit.status : "unknown") })));
    };
    return v_flex().size_full().min_h(0).p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(16).font_semibold().child(tr("resetsTitle")))
        .child(this.button("close", tr("close"), false, !locked, () => closeOverlay(props().overlay))))
      .child(div().text_color(t.muted).child(tr("availableCount", { count: count ?? "…" })))
      .when(Boolean(this.message), el => el.child(div().text_color(t.accent).child(tr(this.message))))
      .when(Boolean(this.error), el => el.child(div().text_size(12).text_color(t.blocked).child(errorText(this.error, language) + (pending ? " " + tr("uncertain") : ""))))
      .child(v_flex().id("reset-content").flex_1().min_h(0).gap(8).overflow_y_scrollbar()
        .when(Boolean(selection), el => el
          .child(div().text_size(15).font_semibold().child(pending ? tr("pendingTitle") : tr("confirmTitle")))
          .child(div().child(creditTitle(selection?.title, language)))
          .child(div().text_color(t.muted).child(tr("warning")))
          .when(Boolean(pending), node => node.child(div().text_color(t.working).child(tr("pendingWarning"))))
          .child(h_flex().gap(8)
            .when(!pending, node => node.child(this.button("cancel-reset", tr("cancel"), false, !locked, cx => { this.selection = null; cx.notify(); })))
            .child(this.button("confirm-reset", locked ? tr("consuming") : pending ? tr("retry") : tr("confirm"), true, !locked && !this.loading, cx => this.consume(cx)))))
        .when(!selection, el => el
          .when(this.loading && !this.data, node => node.child(tr("reading")))
          .children(credits.map(card))
          .when(!this.loading && credits.length === 0, node => node.child(tr("empty")))))
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(10).text_color(t.dim).child(tr("accountFooter")))
        .child(this.button("refresh-resets", this.loading ? tr("checking") : tr("refresh"), false, !locked && !this.loading, cx => this.load(cx))));
  }
}
