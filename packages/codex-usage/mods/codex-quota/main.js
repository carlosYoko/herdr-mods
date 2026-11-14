import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, appHome, theme, openOverlay, shared, setShared } from "herdr";
import { translator, errorText } from "./i18n.js";

export default class CodexQuota extends View {
  init(_props, cx) {
    this.quotaData = null;
    this.quotaError = null;
    this.quotaLoading = false;
    this.refreshQuota(cx);
    cx.timer.every(120000, cx => this.refreshQuota(cx));
  }

  refreshQuota(cx) {
    if (this.quotaLoading) return;
    this.quotaLoading = true;
    cx.spawn(async cx => {
      try {
        const r = await exec("node", [appHome() + "/mods/codex-quota/read-quota.cjs"], { timeout: 25000 });
        const data = JSON.parse(r.stdout.trim());
        if (data.language) setShared("codex.ui.language", data.language);
        if (data.error) throw Object.assign(new Error(data.error), data);
        this.quotaData = data;
        setShared("codex.quota.latest", data);
        this.quotaError = null;
      } catch (e) { this.quotaError = e; }
      finally { this.quotaLoading = false; cx.notify(); }
    });
  }

  quotaDate(seconds) {
    if (!Number.isFinite(seconds)) return translator(shared("codex.ui.language"))("noDate");
    const d = new Date(seconds * 1000), pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  quotaBar() {
    const t = theme(), latest = shared("codex.quota.latest");
    const language = shared("codex.ui.language") || "en", tr = translator(language);
    const data = latest && (!this.quotaData || Date.parse(latest.timestamp) > Date.parse(this.quotaData.timestamp)) ? latest : this.quotaData;
    const windows = [data?.rate_limits?.primary, data?.rate_limits?.secondary];
    const age = data ? Math.max(0, Math.floor((Date.now() - Date.parse(data.timestamp)) / 60000)) : null;
    const stale = this.quotaError || (age !== null && age >= 5);
    const label = (name, mins) => {
      const q = windows.find(w => w?.window_minutes === mins);
      const valid = q && Number.isFinite(q.used_percent) && (!Number.isFinite(q.resets_at) || q.resets_at * 1000 > Date.now());
      const remaining = valid ? Math.max(0, Math.min(100, 100 - q.used_percent)) : null;
      return div().text_color(stale ? t.dim : remaining !== null && remaining <= 10 ? t.blocked : t.muted)
        .child(`${name} ${remaining === null ? "—" : `${Math.round(remaining)}%`}`);
    };
    const reset = data?.resets_available;
    const tooltip = [
      tr("quotaHint"),
      this.quotaError ? tr("error", { error: errorText(this.quotaError, language) }) : age === null ? tr("reading") : tr("age", { minutes: age }),
      ...windows.filter(Boolean).map(q => tr("resetAt", { window: q.window_minutes === 300 ? tr("fiveHours") : q.window_minutes === 10080 ? tr("weekly") : tr("minutes", { minutes: q.window_minutes }), date: this.quotaDate(q.resets_at) })),
      tr("resetHint", { count: reset ?? tr("unavailable") }),
      tr("pollHint")
    ].join("\n");
    return h_flex().id("codex-quota-inline").flex_none().h(26).px(8).gap(8).items_center().rounded(5)
      .text_size(11).hover(s => s.bg(t.hover)).tooltip(tooltip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); this.refreshQuota(cx); cx.notify(); })
      .child(div().text_color(t.dim).child(this.quotaLoading ? "Codex…" : stale ? "Codex !" : "Codex"))
      .child(label("5h", 300)).child(label(tr("shortWeek"), 10080))
      .child(div().id("open-codex-resets").px(4).rounded(4).text_color(t.dim)
        .hover(s => s.bg(t.raised).text_color(t.foreground))
        .tooltip(tr("openResets"))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "codex-resets", kind: "dialog", width: 550, height: 540 });
        }).child(`↻ ${reset === null || reset === undefined ? "—" : reset}`));
  }

  render() { return this.quotaBar(); }
}
