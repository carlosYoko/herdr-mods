import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, appHome, theme, props, closeOverlay, shared, setShared } from "herdr";

const PENDING = "codex.reset.pending";
const LOCK = "codex.reset.busyUntil";

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
    if (!Number.isFinite(seconds)) return "Sin caducidad";
    const d = new Date(seconds * 1000), pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  load(cx) {
    if (this.busy) return;
    this.loading = true;
    cx.spawn(async cx => {
      try {
        const r = await exec("node", [appHome() + "/mods/codex-quota/read-quota.cjs", "--details"], { timeout: 25000 });
        const data = JSON.parse(r.stdout.trim());
        if (data.error) throw new Error(data.error);
        this.data = data;
        if (!shared(PENDING)) this.error = null;
        setShared("codex.quota.latest", data);
      } catch (e) { this.error = String(e.message || e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  choose(credit, cx) {
    if (this.busy || shared(PENDING)) return;
    this.selection = { credit: credit.id, title: credit.title || "Reinicio de Codex", key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
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
        const r = await exec("node", [appHome() + "/mods/codex-quota/read-quota.cjs", "--consume", "--confirmed", "--credit", attempt.credit, "--idempotency-key", attempt.key], { timeout: 25000 });
        const result = JSON.parse(r.stdout.trim());
        if (result.error) throw new Error(result.error);
        const messages = {
          reset: "Reinicio aplicado. Codex ha confirmado el canje.",
          nothingToReset: "Codex indica que no hay límites que restablecer.",
          noCredit: "Codex indica que este reinicio no está disponible.",
          alreadyRedeemed: "Codex indica que este reinicio ya fue canjeado."
        };
        if (!messages[result.outcome]) throw new Error("Resultado desconocido; comprueba el estado antes de otro canje.");
        this.message = messages[result.outcome];
        setShared(PENDING, null);
        this.selection = null;
      } catch (e) {
        this.error = `${String(e.message || e)} El resultado puede ser incierto. Reintentar reutiliza la misma clave para evitar un doble canje.`;
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
    const locked = this.busy || Number(shared(LOCK) || 0) > Date.now();
    const credits = [...(this.data?.reset_credits || [])].sort((a, b) => (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity));
    const count = this.data?.resets_available;
    const card = credit => {
      const available = credit.status === "available" && credit.type === "codexRateLimits" && (!Number.isFinite(credit.expires_at) || credit.expires_at * 1000 > Date.now());
      return v_flex().p(12).gap(5).rounded(7).bg(t.raised)
        .child(h_flex().items_center().gap(8)
          .child(div().flex_1().font_semibold().child(credit.title || "Reinicio de Codex"))
          .child(this.button(`select-${credit.id}`, "Usar…", false, available && !locked && !this.loading && !pending, cx => this.choose(credit, cx))))
        .when(Boolean(credit.description), el => el.child(div().text_size(11).text_color(t.muted).child(credit.description)))
        .child(div().text_size(11).text_color(t.dim).child(`Caduca: ${this.date(credit.expires_at)} · ${credit.status === "available" ? "Disponible" : credit.status}`));
    };
    return v_flex().size_full().min_h(0).p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(16).font_semibold().child("Reinicios de Codex"))
        .child(this.button("close", "Cerrar", false, !locked, () => closeOverlay(props().overlay))))
      .child(div().text_color(t.muted).child(`Disponibles: ${count === null || count === undefined ? "…" : count}. Solo se gasta un reinicio al confirmar el canje.`))
      .when(Boolean(this.message), el => el.child(div().text_color(t.accent).child(this.message)))
      .when(Boolean(this.error), el => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(v_flex().id("reset-content").flex_1().min_h(0).gap(8).overflow_y_scrollbar()
        .when(Boolean(selection), el => el
          .child(div().text_size(15).font_semibold().child(pending ? "Comprobar / reintentar el canje pendiente" : "¿Usar este reinicio?"))
          .child(div().child(selection?.title || ""))
          .child(div().text_color(t.muted).child("Esta acción canjea un crédito real de tu cuenta. El alcance del reinicio es el indicado en su título. No se puede deshacer desde este panel."))
          .when(Boolean(pending), node => node.child(div().text_color(t.working).child("Hay un intento pendiente. No se iniciará otro distinto; el reintento usa la misma clave de idempotencia.")))
          .child(h_flex().gap(8)
            .when(!pending, node => node.child(this.button("cancel-reset", "Cancelar", false, !locked, cx => { this.selection = null; cx.notify(); })))
            .child(this.button("confirm-reset", locked ? "Canjeando…" : pending ? "Reintentar mismo canje" : "Confirmar y usar 1 reinicio", true, !locked && !this.loading, cx => this.consume(cx)))))
        .when(!selection, el => el
          .when(this.loading && !this.data, node => node.child("Consultando tu cuenta…"))
          .children(credits.map(card))
          .when(!this.loading && credits.length === 0, node => node.child("Codex no ha devuelto reinicios seleccionables."))))
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(10).text_color(t.dim).child("Cuenta ChatGPT conectada en Codex · horas locales"))
        .child(this.button("refresh-resets", this.loading ? "Consultando…" : "Actualizar", false, !locked && !this.loading, cx => this.load(cx))));
  }
}
