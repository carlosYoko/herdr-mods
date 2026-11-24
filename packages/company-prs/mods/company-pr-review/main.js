import { View, div } from "gpui-kit";
import { h_flex, v_flex, Textarea, TextareaState, Avatar, AvatarImage, AvatarFallback, ScrollHandle } from "gpui-base";
import { appHome, closeOverlay, checking, exec, props, shared, setShared, window } from "herdr";

const API_SCRIPT = "/mods/company-pr-review/review-api.cjs";
const GITHUB = {
  canvas: "#0d1117", popover: "#0d1117", chrome: "#0d1117", surface: "#161b22", raised: "#21262d", border: "#30363d",
  foreground: "#e6edf3", muted: "#8b949e", dim: "#8b949e", accent: "#58a6ff", blue: "#1f6feb", blueText: "#ffffff",
  selected: "#0e2a1b", addBg: "#0e2a1b", addText: "#aff5b4", addMarker: "#3fb950",
  removeBg: "#2c1618", removeText: "#ffb4a2", removeMarker: "#f85149", blocked: "#f85149",
  hunkBg: "#121d2f", hunkText: "#79c0ff", solid: "#238636", solid_foreground: "#ffffff"
};
const DIFF_TEXT = { add: "+", remove: "−", context: " " };

function helperError(error) {
  return error instanceof Error ? error.message : String(error);
}

function readHelperResult(stdout) {
  for (const line of String(stdout || "").split(/\r?\n/).reverse()) {
    try {
      const result = JSON.parse(line.trim());
      if (result && typeof result === "object" && typeof result.ok === "boolean") {
        if (!result.ok) throw Object.assign(new Error(result.error || "GitHub request failed."), { code: result.code || "request_failed" });
        return result.result;
      }
    } catch (error) {
      if (error && error.code) throw error;
    }
  }
  throw new Error("El helper de GitHub devolvió una respuesta no válida.");
}

async function runHelper(args, timeout = 90000) {
  const helper = appHome() + API_SCRIPT;
  let result;
  if (window()?.platform === "macos") {
    result = await exec("/bin/zsh", ["-lc", 'if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi; exec node "$@"', "herdr-company-pr-review", helper, ...args], { timeout });
  } else {
    result = await exec("node", [helper, ...args], { timeout });
  }
  try { return readHelperResult(result.stdout); }
  catch (error) {
    if (error.code) throw error;
    if (result.code !== 0) throw Object.assign(new Error(helperError(error)), { code: "request_uncertain" });
    throw error;
  }
}

export default class CompanyPRReview extends View {
  init(_initialProps, cx) {
    const p = props() || {};
    this.overlay = p.overlay;
    this.owner = p.owner || "";
    this.repo = p.repo || "";
    this.number = Number(p.number);
    this.url = p.url || `https://github.com/${this.owner}/${this.repo}/pull/${this.number}`;
    this.title = p.title || `${this.owner}/${this.repo} #${this.number}`;
    this.loading = false;
    this.submitting = false;
    this.error = null;
    this.message = null;
    this.selectedFile = null;
    this.expandedFiles = new Set();
    this.diffScroll = ScrollHandle.new();
    this.fileScrollFileOffset = 0;
    this.collapsedDirs = new Set();
    this.seenKey = `company-pr-review.seen.${this.owner}/${this.repo}#${this.number}`;
    const storedSeen = shared(this.seenKey);
    this.seenFiles = new Set(Array.isArray(storedSeen) ? storedSeen.filter(file => typeof file === "string") : []);
    this.authorLogin = "";
    this.avatarPath = null;
    this.rangeStart = null;
    this.rangeEnd = null;
    this.inlineDrafts = [];
    this.descriptionExpanded = false;
    this.summary = TextareaState.new({ placeholder: "Comentario general de la revisión (opcional para aprobar)", rows: 2 });
    this.inlineComposer = TextareaState.new({ placeholder: "Escribe un comentario sobre las líneas seleccionadas", rows: 3 });
    this.pendingKey = `company-pr-review.pending.${this.owner}/${this.repo}#${this.number}`;
    this.uncertainAttempt = shared(this.pendingKey) || null;
    if (!checking()) this.load(cx);
  }

  load(cx) {
    if (this.loading || !this.owner || !this.repo || !Number.isSafeInteger(this.number) || this.number < 1) return;
    this.loading = true;
    this.error = null;
    cx.spawn(async cx => {
      try {
        this.data = await runHelper(["fetch", this.owner, this.repo, String(this.number)]);
        const initialFile = this.data.files.find(file => !this.seenFiles.has(file.filename)) || this.data.files[0];
        this.selectedFile = initialFile?.filename || null;
        if (initialFile) this.expandedFiles.add(initialFile.filename);
        const author = this.data.pull && this.data.pull.user;
        this.authorLogin = (author && author.login) || "";
        if (this.authorLogin && author.avatar_url) {
          cx.spawn(async avatarCx => {
            try {
              const cached = await runHelper(["avatar", this.authorLogin, author.avatar_url, appHome()], 15000);
              this.avatarPath = cached.path;
              avatarCx.notify();
            } catch {}
          });
        }
      } catch (error) {
        this.error = helperError(error);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  toggleSeenFile(path, cx) {
    const next = new Set(this.seenFiles);
    const wasViewed = next.has(path);
    if (wasViewed) {
      next.delete(path);
      this.expandedFiles.add(path);
    } else {
      next.add(path);
      this.expandedFiles.delete(path);
    }
    this.seenFiles = next;
    setShared(this.seenKey, [...next].sort());
    cx.notify();
  }

  toggleFileExpanded(path, cx) {
    this.expandedFiles.has(path) ? this.expandedFiles.delete(path) : this.expandedFiles.add(path);
    this.selectedFile = path;
    cx.notify();
  }

  selectDiffFile(path, cx) {
    const index = (this.data.files || []).findIndex(file => file.filename === path);
    this.selectedFile = path;
    this.expandedFiles.clear();
    this.expandedFiles.add(path);
    if (index >= 0) this.diffScroll.scroll_to_item(this.fileScrollFileOffset + index);
    cx.notify();
  }

  toggleDirectory(path, cx) {
    this.collapsedDirs.has(path) ? this.collapsedDirs.delete(path) : this.collapsedDirs.add(path);
    cx.notify();
  }

  fileTreeRows(nodes, depth, t, cx) {
    const rows = [];
    for (const node of nodes || []) {
      if (node.kind === "directory") {
        const collapsed = this.collapsedDirs.has(node.path);
        rows.push(h_flex().id(`tree-dir-${node.path}`).h(24).pl(6 + depth * 12).gap(5).items_center()
          .child(div().w(12).flex_none().text_color(t.muted).cursor_pointer()
            .on_click((_event, cx) => this.toggleDirectory(node.path, cx)).child(collapsed ? "▸" : "▾"))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.foreground).cursor_pointer().tooltip(node.path)
            .on_click((_event, cx) => this.toggleDirectory(node.path, cx)).child(node.name)));
        if (!collapsed) rows.push(...this.fileTreeRows(node.children, depth + 1, t, cx));
        continue;
      }
      const viewed = this.seenFiles.has(node.path);
      const selected = this.selectedFile === node.path;
      rows.push(h_flex().id(`tree-file-${node.path}`).h(25).pl(6 + depth * 12).pr(4).gap(5).items_center().rounded(3)
        .bg(selected ? GITHUB.hunkBg : GITHUB.surface)
        .child(div().id(`seen-${node.path}`).w(16).h(16).flex_none().rounded(3).border_1()
          .border_color(viewed ? GITHUB.addMarker : GITHUB.border).bg(viewed ? GITHUB.addBg : GITHUB.canvas)
          .text_center().text_size(10).font_semibold().text_color(viewed ? GITHUB.addMarker : GITHUB.muted).cursor_pointer()
          .tooltip(viewed ? "Marcado como revisado; pulsa para quitar la marca" : "Marcar fichero como revisado")
          .on_click((_event, cx) => this.toggleSeenFile(node.path, cx)).child(viewed ? "✓" : ""))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(selected ? GITHUB.blueText : GITHUB.foreground)
          .cursor_pointer().tooltip(node.path).on_click((_event, cx) => this.selectDiffFile(node.path, cx)).child(node.name)));
    }
    return rows;
  }

  fileSidebar(files, t, cx) {
    const viewedCount = files.filter(file => this.seenFiles.has(file.filename)).length;
    const rows = this.fileTreeRows((this.data && this.data.tree) || [], 0, t, cx);
    return v_flex().id("pr-file-sidebar").w(280).flex_none().h_full().min_h(0).border_1().border_color(t.border).rounded(6).bg(t.surface)
      .child(v_flex().flex_none().p(8).gap(4).border_b(1).border_color(t.border)
        .child(div().font_semibold().text_size(12).text_color(t.foreground).child(`Explorador · ${files.length} archivos`))
        .child(div().text_size(10).text_color(t.muted).child(`${viewedCount}/${files.length} vistos`)))
      .child(v_flex().id("pr-file-tree").flex_1().min_h(0).overflow_y_scrollbar().py(5).gap(1).children(rows));
  }

  selectLine(file, row, cx) {
    if (this.submitting || this.submitted || !this.data || this.data.pull.state !== "open" || row.line < 1 || !row.side) return;
    const point = { path: file.filename, line: row.line, side: row.side, hunk: row.hunk };
    if (!this.rangeStart || this.rangeEnd || this.rangeStart.path !== point.path || this.rangeStart.side !== point.side || this.rangeStart.hunk !== point.hunk) {
      this.rangeStart = point;
      this.rangeEnd = null;
      this.inlineComposer.set_value("");
    } else {
      const first = point.line <= this.rangeStart.line ? point : this.rangeStart;
      const last = point.line <= this.rangeStart.line ? this.rangeStart : point;
      this.rangeStart = first;
      this.rangeEnd = last;
    }
    this.error = null;
    this.message = null;
    cx.notify();
  }

  addInlineComment(cx) {
    if (!this.rangeStart || !this.rangeEnd) return;
    const body = this.inlineComposer.value().trim();
    if (!body) { this.error = "Escribe el comentario antes de añadirlo."; cx.notify(); return; }
    const draft = {
      path: this.rangeStart.path,
      line: this.rangeEnd.line,
      side: this.rangeEnd.side,
      ...(this.rangeStart.line !== this.rangeEnd.line ? { start_line: this.rangeStart.line, start_side: this.rangeStart.side } : {}),
      body
    };
    this.inlineDrafts = [...this.inlineDrafts, draft];
    this.rangeStart = null;
    this.rangeEnd = null;
    this.inlineComposer.set_value("");
    this.error = null;
    this.message = "Comentario añadido al borrador de revisión.";
    cx.notify();
  }

  removeDraft(index, cx) {
    this.inlineDrafts = this.inlineDrafts.filter((_draft, i) => i !== index);
    cx.notify();
  }

  submit(event, cx) {
    if (this.submitting || this.loading || this.uncertainAttempt) return;
    const payload = { event, body: this.summary.value().trim(), comments: this.inlineDrafts };
    if (event === "COMMENT" && !payload.body && !payload.comments.length) {
      this.error = "Añade un comentario general o comentarios sobre líneas.";
      cx.notify();
      return;
    }
    this.submitting = true;
    this.error = null;
    this.message = null;
    cx.spawn(async cx => {
      try {
        await runHelper(["submit", this.owner, this.repo, String(this.number), JSON.stringify(payload)], 60000);
        setShared(this.pendingKey, null);
        this.uncertainAttempt = null;
        this.submitted = true;
        this.inlineDrafts = [];
        this.message = event === "APPROVE" ? "Aprobación enviada a GitHub." : "Comentarios enviados a GitHub.";
      } catch (error) {
        this.error = helperError(error);
        if (error.code !== "github_rejected") {
          this.uncertainAttempt = { at: Date.now(), event };
          setShared(this.pendingKey, this.uncertainAttempt);
        }
      } finally {
        this.submitting = false;
        cx.notify();
      }
    });
  }

  acknowledgeUncertain(cx) {
    setShared(this.pendingKey, null);
    this.uncertainAttempt = null;
    this.error = null;
    this.message = "Reenvío habilitado. Comprueba primero el estado de la revisión en GitHub.";
    cx.notify();
  }

  close() {
    if (this.overlay) closeOverlay(this.overlay);
  }

  openInBrowser(cx) {
    if (!/^https:\/\//.test(this.url)) return;
    cx.spawn(async cx => {
      try {
        const result = await exec("open", [this.url]);
        if (result.code !== 0) throw new Error(result.stderr);
      } catch (error) {
        this.error = helperError(error);
        cx.notify();
      }
    });
  }

  authorAvatar() {
    const initials = (this.authorLogin || "?").slice(0, 2).toUpperCase();
    const avatar = Avatar.new().w(22).h(22).rounded_full().overflow_hidden().bg(GITHUB.raised).border_1().border_color(GITHUB.border);
    if (this.avatarPath) avatar.image(AvatarImage.new(this.avatarPath).size_full());
    return avatar.fallback(AvatarFallback.new().size_full().items_center().justify_center().bg(GITHUB.raised)
      .text_color(GITHUB.foreground).text_size(9).font_semibold().child(initials));
  }

  button(id, label, primary, enabled, action) {
    const background = id === "approve-pr" ? GITHUB.solid : primary ? GITHUB.blue : GITHUB.raised;
    return div().id(id).px(11).py(7).rounded(5).text_size(12).cursor_pointer()
      .bg(background).text_color(GITHUB.foreground).border_1().border_color(GITHUB.border)
      .opacity(enabled ? 1 : 0.45)
      .on_click((_event, cx) => { if (enabled) action(cx); })
      .child(label);
  }

  diffRow(file, row, index, t, cx) {
    if (row.kind === "hunk") {
      return div().id(`hunk-${file.filename}-${index}`).px(8).py(4).bg(GITHUB.hunkBg).text_color(GITHUB.hunkText).font_family("Menlo").text_size(10).child(row.text);
    }
    const selectedStart = this.rangeStart && this.rangeStart.path === file.filename && this.rangeStart.line === row.line && this.rangeStart.side === row.side;
    const selectedEnd = this.rangeEnd && this.rangeEnd.path === file.filename && this.rangeEnd.line === row.line && this.rangeEnd.side === row.side;
    const selectingEnd = this.rangeStart && !this.rangeEnd && this.rangeStart.path === file.filename && this.rangeStart.side === row.side && this.rangeStart.hunk === row.hunk;
    const canSelect = this.data && this.data.pull.state === "open" && !this.submitted && !this.submitting;
    const samePoint = selectedStart && selectedEnd;
    const label = !canSelect ? "Solo lectura" : samePoint ? "Línea" : selectedStart ? "Inicio" : selectedEnd ? "Fin" : selectingEnd ? "Fin" : "Comentar";
    const background = row.kind === "add" ? GITHUB.addBg : row.kind === "remove" ? GITHUB.removeBg : GITHUB.canvas;
    const markerColor = row.kind === "add" ? GITHUB.addMarker : row.kind === "remove" ? GITHUB.removeMarker : GITHUB.muted;
    return h_flex().id(`diff-${file.filename}-${index}`).min_h(24).items_start().gap(0).bg(background)
      .child(div().w(38).flex_none().text_right().pr(5).text_color(GITHUB.muted).font_family("Menlo").text_size(10).child(String(row.oldLine || "")))
      .child(div().w(38).flex_none().text_right().pr(5).text_color(GITHUB.muted).font_family("Menlo").text_size(10).child(String(row.newLine || "")))
      .child(div().w(18).flex_none().text_center().font_family("Menlo").text_size(11).text_color(markerColor).child(DIFF_TEXT[row.kind]))
      .child(div().w(70).flex_none().px(3).py(2).text_size(9).text_color(selectedStart || selectedEnd ? GITHUB.blueText : GITHUB.blue).bg(selectedStart || selectedEnd ? GITHUB.blue : GITHUB.surface).rounded(3).cursor_pointer()
        .tooltip("Comentar esta línea; pulsa Inicio y luego Fin para un rango multilínea")
        .opacity(canSelect ? 1 : 0.55)
        .on_click((_event, cx) => { if (canSelect) this.selectLine(file, row, cx); })
        .child(label))
      .child(div().flex_1().min_w(0).font_family("Menlo").text_size(11).text_color(row.kind === "add" ? GITHUB.addText : row.kind === "remove" ? GITHUB.removeText : GITHUB.foreground).child(row.text || " "));
  }

  fileView(file, index, t, cx) {
    const rows = file.diff || [];
    const comments = (this.data.comments || []).filter(comment => comment.path === file.filename);
    const viewed = this.seenFiles.has(file.filename);
    const expanded = this.expandedFiles.has(file.filename);
    const body = [];
    if (expanded) {
      if (file.patch) body.push(...rows.map((row, rowIndex) => this.diffRow(file, row, rowIndex, t, cx)));
      else body.push(div().px(10).py(8).text_color(t.dim).child("GitHub no proporciona un diff de texto para este archivo."));
      if (comments.length) body.push(v_flex().px(10).py(5).gap(5).bg(t.popover)
        .children(comments.map(comment => div().id(`review-comment-${comment.id}`).p(7).rounded(4).bg(t.chrome)
          .child(div().text_size(10).text_color(t.accent).child(`${comment.user?.login || "reviewer"} · línea ${comment.line || "—"}`))
          .child(div().text_size(11).text_color(t.foreground).child(comment.body || "")))));
    }
    return v_flex().id(`pr-file-card-${index}`).flex_none().border_1().border_color(t.border).rounded(5).bg(t.surface)
      .child(h_flex().id(`pr-file-header-${index}`).h(38).px(9).gap(8).items_center().bg(t.raised)
        .child(div().id(`collapse-file-${index}`).w(16).flex_none().text_center().text_color(t.muted).cursor_pointer()
          .tooltip(expanded ? "Colapsar fichero" : "Expandir fichero")
          .on_click((_event, cx) => this.toggleFileExpanded(file.filename, cx)).child(expanded ? "▾" : "▸"))
        .child(div().flex_1().min_w(0).font_semibold().truncate().text_size(11).text_color(t.foreground)
          .tooltip(file.filename).cursor_pointer().on_click((_event, cx) => this.toggleFileExpanded(file.filename, cx)).child(file.filename))
        .child(div().text_color(t.dim).text_size(10).child(`+${file.additions || 0} −${file.deletions || 0}`))
        .child(h_flex().id(`viewed-file-${index}`).h(26).px(7).gap(5).items_center().rounded(4).cursor_pointer()
          .bg(viewed ? GITHUB.hunkBg : GITHUB.surface).text_color(viewed ? GITHUB.blue : GITHUB.muted).text_size(10)
          .tooltip(viewed ? "Quitar marca de revisado y expandir" : "Marcar como revisado y colapsar")
          .on_click((_event, cx) => this.toggleSeenFile(file.filename, cx))
          .child(div().w(14).h(14).flex_none().rounded(3).border_1().border_color(viewed ? GITHUB.blue : GITHUB.border)
            .bg(viewed ? GITHUB.blue : GITHUB.canvas).text_center().text_size(9).font_semibold().text_color(GITHUB.blueText).child(viewed ? "✓" : ""))
          .child(div().child("Visto"))))
      .when(expanded, el => el.children(body));
  }

  render(cx) {
    const t = GITHUB;
    const data = this.data || {};
    const p = data.pull || {};
    const files = data.files || [];
    const canComment = this.inlineDrafts.length > 0 || this.summary.value().trim().length > 0;
    const openPR = p.state === "open";
    const locked = this.loading || this.submitting || this.uncertainAttempt || this.submitted || !openPR;
    const selectedRangeText = this.rangeStart
      ? `${this.rangeStart.path} · ${this.rangeStart.side} ${this.rangeStart.line}${this.rangeEnd ? `–${this.rangeEnd.line}` : " · elige otra línea del mismo bloque y lado para definir el final"}`
      : null;
    const root = [h_flex().flex_none().items_center().gap(8)
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().text_size(15).font_semibold().truncate().tooltip(this.title).child(this.title))
        .child(div().text_size(10).text_color(t.muted).child(`${this.owner}/${this.repo} #${this.number} · ${p.state || "cargando"} · ${(p.base && p.base.ref) || "?"} ← ${(p.head && p.head.ref) || "?"}`))
        .child(h_flex().items_center().gap(6).child(this.authorAvatar())
          .child(div().text_size(10).text_color(t.muted).child(`Creada por @${this.authorLogin || "…"}`))))
      .child(this.button("open-pr-on-github", "Abrir en GitHub ↗", false, true, cx => this.openInBrowser(cx)))
      .child(this.button("close-pr-review", "×", false, true, () => this.close()))];
    if (this.error) root.push(div().px(8).py(5).rounded(4).bg(t.raised).text_color(t.blocked).child(this.error));
    if (this.message) root.push(div().px(8).py(5).rounded(4).bg(t.raised).text_color(t.accent).child(this.message));
    if (this.uncertainAttempt) root.push(v_flex().px(8).py(6).gap(5).rounded(4).bg(t.raised)
      .child(div().text_color(t.blocked).child("El resultado del envío es incierto. No se reintentará automáticamente; verifica en GitHub antes de habilitar otro envío."))
      .child(this.button("acknowledge-review-outcome", "He verificado en GitHub; permitir reenvío", false, !this.submitting, cx => this.acknowledgeUncertain(cx))));
    if (data.warnings && data.warnings.length) root.push(div().px(8).text_color(t.muted).child(data.warnings.join(" · ")));

    const intro = [];
    if (files.length && openPR) intro.push(div().p(8).rounded(4).bg(GITHUB.surface).text_size(11).text_color(GITHUB.muted)
      .child("Para comentar: pulsa Comentar junto a una línea. Para un comentario multilínea, pulsa Inicio y luego Fin en otra línea del mismo bloque."));
    if (this.loading && !this.data) intro.push(div().p(12).text_color(t.muted).child("Cargando detalles y diff de GitHub…"));
    if (p.body) {
      const descriptionPreview = String(p.body).split(/\r?\n/).find(line => line.trim()) || "";
      const descriptionChildren = [h_flex().items_center().gap(8).cursor_pointer()
        .on_click((_event, cx) => { this.descriptionExpanded = !this.descriptionExpanded; cx.notify(); })
        .child(div().flex_1().text_size(11).font_semibold().text_color(t.foreground).child(`${this.descriptionExpanded ? "▾" : "▸"} Descripción de la PR`))
        .child(div().text_size(10).text_color(t.blue).child(this.descriptionExpanded ? "Colapsar" : "Expandir"))];
      if (this.descriptionExpanded) descriptionChildren.push(div().text_color(t.foreground).child(p.body));
      else if (descriptionPreview) descriptionChildren.push(div().truncate().text_size(11).text_color(t.muted).child(descriptionPreview));
      intro.push(v_flex().p(9).gap(5).rounded(5).bg(t.surface).border_1().border_color(t.border).children(descriptionChildren));
    }
    const summaries = (data.reviews || []).filter(review => review.body);
    if (summaries.length) intro.push(v_flex().gap(5).children(summaries.map((review, index) =>
      div().id(`review-summary-${index}`).p(8).rounded(5).bg(t.chrome)
        .child(div().text_size(10).text_color(t.accent).child(`${(review.user && review.user.login) || "reviewer"} · ${review.state || "COMMENTED"}`))
        .child(div().text_color(t.foreground).child(review.body))
    )));
    const viewedCount = files.filter(file => this.seenFiles.has(file.filename)).length;
    const fileCards = files.map((file, index) => this.fileView(file, index, t, cx));
    if (!files.length && !this.loading && !this.error) fileCards.push(div().p(12).text_color(t.dim).child("Esta PR no contiene archivos modificados."));
    const changesHeader = h_flex().flex_none().h(34).px(9).gap(8).items_center().rounded(4).bg(t.surface)
      .child(div().flex_1().font_semibold().text_size(11).text_color(t.foreground).child(`Cambios · ${files.length} archivos`))
      .child(div().text_size(10).text_color(t.muted).child(`${viewedCount}/${files.length} vistos`));
    this.fileScrollFileOffset = intro.length + 1;
    const scrollItems = [...intro, changesHeader, ...fileCards];
    const center = v_flex().id("pr-review-center").flex_1().h_full().min_w(0).min_h(0)
      .child(v_flex().id("pr-review-scroll").flex_1().min_h(0).overflow_y_scrollbar()
        .track_scroll(this.diffScroll).gap(8).children(scrollItems));
    root.push(h_flex().id("pr-review-workspace").flex_1().min_h(0).gap(8)
      .child(this.fileSidebar(files, t, cx))
      .child(center));

    if (selectedRangeText) root.push(v_flex().flex_none().p(8).gap(5).rounded(5).bg(t.raised)
      .child(div().text_size(10).text_color(t.accent).truncate().tooltip(selectedRangeText).child(selectedRangeText))
      .child(Textarea.new(this.inlineComposer).h(74).text_size(11).text_color(t.foreground))
      .child(h_flex().justify_end().gap(6)
        .child(this.button("cancel-inline-range", "Cancelar rango", false, !this.submitting, cx => { this.rangeStart = null; this.rangeEnd = null; this.inlineComposer.set_value(""); cx.notify(); }))
        .child(this.button("single-line-range", this.rangeEnd ? "Solo inicio" : "Usar esta línea", false, !this.submitting, cx => { this.rangeEnd = this.rangeStart; cx.notify(); }))
        .child(this.button("add-inline-comment", "Añadir comentario", true, Boolean(this.rangeEnd && this.inlineComposer.value().trim()) && !this.submitting, cx => this.addInlineComment(cx)))));
    if (this.inlineDrafts.length) {
      const draftRows = [];
      this.inlineDrafts.forEach((draft, index) => {
        const row = h_flex().id(`inline-draft-${index}`).px(8).py(4).gap(6).items_center().bg(t.chrome).rounded(4)
          .child(div().flex_1().min_w(0).truncate().tooltip(`${draft.path}: ${draft.body}`).child(`${draft.path}:${draft.start_line || draft.line}–${draft.line} · ${draft.body}`))
          .child(this.button(`remove-inline-draft-${index}`, "Quitar", false, !this.submitting, cx => this.removeDraft(index, cx)));
        draftRows.push(row);
      });
      root.push(v_flex().flex_none().max_h(100).overflow_y_scrollbar().gap(4).children(draftRows));
    }
    const summaryContent = [
      div().text_size(11).font_semibold().text_color(t.muted).child("Comentario general de la revisión (opcional)"),
      Textarea.new(this.summary).h(62).text_size(11).text_color(t.foreground),
      h_flex().items_center().gap(6)
        .child(div().flex_1().text_size(10).text_color(t.dim).child(`${files.length} archivos · ${this.inlineDrafts.length} comentarios en borrador`))
        .child(this.button("send-review-comments", this.submitting ? "Enviando…" : "Enviar comentarios", false, canComment && !locked, cx => this.submit("COMMENT", cx)))
        .child(this.button("approve-pr", this.submitting ? "Enviando…" : "Aprobar PR", true, !locked, cx => this.submit("APPROVE", cx)))
    ];
    root.push(v_flex().flex_none().gap(5).p(6).rounded(5).bg(GITHUB.surface).children(summaryContent));
    return v_flex().size_full().min_h(0).p(12).gap(8).rounded(8).bg(t.popover).text_color(t.foreground).text_size(12).children(root);
  }
}
