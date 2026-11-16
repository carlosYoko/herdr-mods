import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, appHome, theme, openOverlay, shared, setShared, window } from "herdr";
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
        const helper = appHome() + "/mods/codex-quota/read-quota.cjs";
        const mac = window()?.platform === "macos";
        let r;
        try {
          r = mac
            ? await exec("/bin/zsh", ["-lc", 'if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi; exec node "$@"', "herdr-codex-quota", helper], { timeout: 25000 })
            : await exec("node", [helper], { timeout: 25000 });
        } catch {
          throw Object.assign(new Error("Could not launch the quota helper."), { error_code: "launcher_failed" });
        }
        let data = null;
        for (const line of r.stdout.split(/\r?\n/).reverse()) {
          try { data = JSON.parse(line.trim()); break; } catch {}
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          const preview = r.stdout.trim().slice(0, 100).replace(/[\r\n\t]/g, " ");
          throw Object.assign(new Error(`Invalid helper output (exit ${r.code}; stdout ${r.stdout.length} chars; stderr ${r.stderr.length} chars; starts: ${preview || "<empty>"}).`), { error_code: "invalid_helper_output" });
        }
        if (data.language) setShared("codex.ui.language", data.language);
        if (data.error) throw Object.assign(new Error(data.error), data);
        if (r.code !== 0) throw Object.assign(new Error("The quota helper exited unsuccessfully."), { error_code: "helper_failed" });
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

  remainingTime(seconds) {
    if (!Number.isFinite(seconds)) return null;
    const total = Math.max(0, Math.ceil((seconds * 1000 - Date.now()) / 60000));
    const days = Math.floor(total / 1440), hours = Math.floor(total % 1440 / 60), minutes = total % 60;
    return days ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
  }

  windowLabel(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return "?";
    if (minutes % 1440 === 0) return `${minutes / 1440}d`;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
  }

  quotaBar() {
    const t = theme(), latest = shared("codex.quota.latest");
    const language = shared("codex.ui.language") || "en", tr = translator(language);
    const data = latest && (!this.quotaData || Date.parse(latest.timestamp) > Date.parse(this.quotaData.timestamp)) ? latest : this.quotaData;
    const windows = [data?.rate_limits?.primary, data?.rate_limits?.secondary];
    const age = data ? Math.max(0, Math.floor((Date.now() - Date.parse(data.timestamp)) / 60000)) : null;
    const stale = this.quotaError || (age !== null && age >= 5);
    const label = q => {
      const valid = Number.isFinite(q?.used_percent) && (!Number.isFinite(q.resets_at) || q.resets_at * 1000 > Date.now());
      const remaining = valid ? Math.max(0, Math.min(100, 100 - q.used_percent)) : null;
      const countdown = valid ? this.remainingTime(q.resets_at) : null;
      return div().text_color(stale ? t.dim : remaining !== null && remaining <= 10 ? t.blocked : t.muted)
        .child(`${this.windowLabel(q.window_minutes)} ${remaining === null ? "—" : `${Math.round(remaining)}%`}${countdown ? ` · ${countdown}` : ""}`);
    };
    const reset = data?.resets_available;
    const tooltip = [
      tr("quotaHint"),
      this.quotaError ? tr("error", { error: errorText(this.quotaError, language) }) : age === null ? tr("reading") : tr("age", { minutes: age }),
      ...windows.filter(Boolean).map(q => tr("resetAt", { window: this.windowLabel(q.window_minutes), date: this.quotaDate(q.resets_at) })),
      tr("resetHint", { count: reset ?? tr("unavailable") }),
      tr("pollHint")
    ].join("\n");
    return h_flex().id("codex-quota-inline").flex_none().h(26).px(8).gap(8).items_center().rounded(5)
      .text_size(11).hover(s => s.bg(t.hover)).tooltip(tooltip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); this.refreshQuota(cx); cx.notify(); })
      .child(div().text_color(t.dim).child(this.quotaLoading ? "Codex…" : stale ? "Codex !" : "Codex"))
      .children(windows.filter(Boolean).map(label))
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
