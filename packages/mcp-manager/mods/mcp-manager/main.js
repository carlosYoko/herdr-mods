import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { focused, panes, agents, terminals, spaces, theme, appHome, exec, run, layout } from "herdr";

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
    this.key = null; this.data = null; this.error = null; this.loading = false; this.writing = false; this.version = 0;
    cx.timer.every(15000, cx => {
      const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
      if (panel && !panel.hidden && body?.active === "mcp" && !this.pending && !this.writing) this.refresh(cx);
    });
  }
  refresh(cx) {
    if (!this.ctx?.client || !this.ctx.cwd || this.ctx.remote || this.writing) return;
    const version = ++this.version;
    const request = { action: "list", client: this.ctx.client, cwd: this.ctx.cwd };
    this.loading = true; this.error = null;
    cx.spawn(async cx => {
      try {
        const r = await exec("node", [appHome() + "/mods/mcp-manager/manage.cjs", JSON.stringify(request)], { timeout: 10000 });
        const data = JSON.parse(r.stdout);
        if (version !== this.version) return;
        if (data.error) throw new Error(data.error);
        if (r.code !== 0) throw new Error("No se pudo leer la configuración");
        this.data = data;
      } catch (e) { if (version === this.version) { this.error = String(e.message ?? e); this.data = null; } }
      finally { if (version === this.version) { this.loading = false; cx.notify(); } }
    });
  }
  ask(names, enabled, cx) {
    if (this.loading || this.writing || !this.data?.writable) return;
    this.pending = { client: this.ctx.client, cwd: this.ctx.cwd, names, enabled, snapshot: this.data.snapshot };
    this.message = null; cx.notify();
  }
  apply(cx) {
    if (!this.pending || this.writing) return;
    const request = { ...this.pending, action: "apply", confirmed: true };
    this.pending = null; this.writing = true; this.error = null;
    const version = ++this.version;
    cx.spawn(async cx => {
      try {
        const r = await exec("node", [appHome() + "/mods/mcp-manager/manage.cjs", JSON.stringify(request)], { timeout: 15000 });
        const data = JSON.parse(r.stdout);
        if (data.error) throw new Error(data.error);
        if (r.code !== 0) throw new Error("No se pudo aplicar el cambio");
        if (version === this.version) { this.data = data; this.message = "Guardado. Recarga o reinicia el agente. Backups junto a la configuración: .herdr-backup-*"; }
      } catch (e) { if (version === this.version) { this.error = String(e.message ?? e); this.data = null; } }
      finally { this.writing = false; if (version !== this.version) this.refresh(cx); cx.notify(); }
    });
  }
  render(cx) {
    const t = theme(), ctx = context(), key = JSON.stringify(ctx);
    if (key !== this.key) {
      this.key = key; this.ctx = ctx; this.data = null; this.pending = null; this.error = null; this.message = null; this.loading = false; ++this.version;
      this.refresh(cx);
    }
    const busy = this.loading || this.writing;
    const button = (id, text, action, disabled = false) => div().id(id).px(9).py(6).rounded(6).text_size(12)
      .bg(t.raised).text_color(disabled ? t.dim : t.foreground)
      .when(!disabled, el => el.hover(s => s.bg(t.hover)).on_click((_e, cx) => action(cx))).child(text);
    const note = text => div().text_size(12).text_color(t.muted).child(text);
    const rows = this.data?.rows ?? [];
    const canEdit = this.data?.writable && !busy && !this.pending;
    const root = v_flex().size_full().min_w(0).bg(t.chrome).text_color(t.foreground).text_size(13).rounded(10).border(1).border_color(t.border);
    root.child(h_flex().h(40).px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().font_semibold().child("MCP"))
      .child(button("refresh", "Actualizar", cx => { this.pending = null; this.refresh(cx); cx.notify(); }, busy || !ctx.client || ctx.remote))
      .child(button("close", "×", () => run("layout.hide", { id: "panel" }))));
    const body = v_flex().id("mcp-scroll").flex_1().min_h(0).p(12).gap(12).overflow_y_scrollbar();
    body.child(div().font_semibold().child(ctx.client ? `${ctx.client === "claude" ? "Claude Code" : ctx.client === "pi" ? "Pi" : "Codex"} · ${ctx.address}` : "Sin agente compatible enfocado"));
    if (ctx.cwd) body.child(note(ctx.cwd));
    if (!ctx.client) body.child(note("Enfoca una terminal de Pi, Codex o Claude Code. No se usa el agente de otra pestaña. VS Code y Claude Desktop no exponen aquí su sesión."));
    else if (ctx.remote) body.child(note("Las sesiones remotas aún no están admitidas. No se lee ni modifica la configuración local para una sesión remota."));
    else {
      body.child(note("CONFIGURACIÓN ESTÁNDAR · conexión no consultada"));
      if (this.loading) body.child(note("Leyendo configuración…"));
      if (this.writing) body.child(note("Guardando… No se reinicia ni se envía texto al agente."));
      if (this.error) body.child(div().text_color(t.blocked).child(this.error));
      if (this.message) body.child(div().text_color(t.done).child(this.message));
      if (this.data) {
        body.child(button("details", this.details ? "Ocultar alcance y límites" : "Ver alcance y límites", cx => { this.details = !this.details; cx.notify(); }));
        if (this.details) body.child(note(this.data.notice));
        body.child(note("Los cambios requieren recargar/reiniciar el agente. Se modifica la configuración, no la conexión activa."));
        if (!this.data.writable) body.child(note("Solo lectura. No se modifica este cliente/perfil."));
        body.child(h_flex().gap(6)
          .child(button("enable-all", "Activar todos", cx => this.ask(rows.filter(r => !r.enabled).map(r => r.name), true, cx), !canEdit || !rows.some(r => !r.enabled)))
          .child(button("disable-all", "Desactivar todos", cx => this.ask(rows.filter(r => r.enabled).map(r => r.name), false, cx), !canEdit || !rows.some(r => r.enabled))));
        if (!rows.length) body.child(note("No hay MCP definidos en estos archivos estándar. Los registrados por extensiones o perfiles personalizados no aparecen aquí."));
        if (this.pending) {
          const selected = rows.filter(r => this.pending.names.includes(r.name));
          body.child(v_flex().p(10).gap(8).rounded(7).border(1).border_color(t.blocked)
            .child(div().font_semibold().child(`${this.pending.enabled ? "Activar" : "Desactivar"} ${selected.length} MCP`))
            .child(note(selected.map(r => r.name).join(", ")))
            .child(note("Se modifican los archivos indicados debajo. Los de usuario afectan a otras sesiones; los de proyecto pueden estar compartidos por Git. Se guarda backup, pero no hay rollback automático entre varios archivos. JSON/TOML se reformatean; TOML pierde comentarios. Si usas otro perfil o configuración, cancela."))
            .child(h_flex().gap(6).child(button("confirm", "Confirmar cambio", cx => this.apply(cx)))
              .child(button("cancel", "Cancelar", cx => { this.pending = null; cx.notify(); }))));
        }
        for (const [i, row] of rows.entries()) {
          body.child(v_flex().gap(5).p(10).rounded(7).bg(t.surface)
            .child(h_flex().items_center().gap(8)
              .child(div().flex_1().min_w(0).font_semibold().child(row.name))
              .child(button(`toggle-${i}`, this.ctx.client === "claude" ? "Definido" : row.enabled ? "ON · Desactivar" : "OFF · Activar", cx => this.ask([row.name], !row.enabled, cx), !canEdit)))
            .child(note(row.scope + " · " + row.file)));
        }
        if (this.details) for (const file of this.data.files) body.child(note((file.exists ? "Archivo leído: " : "No existe: ") + file.file));
      }
    }
    return root.child(body);
  }
}
