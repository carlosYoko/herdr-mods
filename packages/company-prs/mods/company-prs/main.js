import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { exec, theme, shared, setShared, checking } from "herdr";

const TEAM_SLUG = "easor-white-walkers";
const GH_BINARIES = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "gh"];
const PR_FIELDS = `number title url isDraft author { login } repository { nameWithOwner } commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { nodes { ... on CheckRun { name status conclusion detailsUrl } ... on StatusContext { context state targetUrl } } } } } } }`;
const ORGANIZATIONS_QUERY = `query { viewer { login organizations(first: 100) { nodes { login teams(first: 100) { nodes { slug } } } } } }`;

function status(check) {
  if (check.status && check.status !== "COMPLETED") return "working";
  const value = check.conclusion || check.state;
  if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"].includes(value)) return "blocked";
  if (["PENDING", "EXPECTED"].includes(value)) return "working";
  return "done";
}

function uniquePRs(prs) {
  return [...new Map(prs.filter(pr => pr && pr.url).map(pr => [pr.url, pr])).values()];
}

async function runGitHub(args, timeout = 30000) {
  let failure = "GitHub CLI no disponible";
  for (const executable of GH_BINARIES) {
    try {
      const result = await exec(executable, args, { timeout });
      if (result.code === 0) return result;
      failure = (result.stderr || "").trim() || `GitHub CLI terminó con código ${result.code}`;
      if (result.code !== 127) break;
    } catch (error) {
      failure = String(error);
    }
  }
  throw new Error(failure);
}

function searchField(spec, cursor) {
  const after = cursor ? `, after: ${JSON.stringify(cursor)}` : "";
  return `${spec.key}: search(query: ${JSON.stringify(spec.query)}, type: ISSUE, first: 100${after}) { issueCount pageInfo { hasNextPage endCursor } nodes { ... on PullRequest { ${PR_FIELDS} } } }`;
}

function searchSpecs(organizations) {
  const specs = [];
  organizations.forEach((org, index) => {
    const prefix = `org:${org.login} is:pr is:open`;
    specs.push({ key: `company${index}`, section: "company", query: `${prefix} sort:updated-desc` });
    specs.push({ key: `own${index}`, section: "own", query: `${prefix} author:@me sort:updated-desc` });
    specs.push({ key: `userReview${index}`, section: "reviewUser", query: `${prefix} review-requested:@me sort:updated-desc` });
    specs.push({ key: `userAssigned${index}`, section: "reviewAssignee", query: `${prefix} assignee:@me sort:updated-desc` });
    specs.push({ key: `teamReview${index}`, section: "reviewTeam", query: `${prefix} team-review-requested:${org.login}/${TEAM_SLUG} sort:updated-desc` });
  });
  return specs;
}

export default class CompanyPRs extends View {
  init(_props, cx) {
    this.sections = { company: [], own: [], review: [], tracked: [] };
    this.loading = false;
    this.loaded = false;
    this.expanded = new Set();
    this.selectedTab = "company";
    this.input = InputState.new({ placeholder: "https://github.com/owner/repo/pull/123" });
    this.input.on("submit", (_event, cx) => this.add(cx));
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(60000, cx => this.refresh(cx));
  }

  async discoverOrganizations() {
    const result = await runGitHub(["api", "graphql", "-f", `query=${ORGANIZATIONS_QUERY}`]);
    const response = JSON.parse(result.stdout);
    if (!response.data || !response.data.viewer) throw new Error((response.errors && response.errors[0] && response.errors[0].message) || "No se pudo leer la cuenta de GitHub");
    const organizations = response.data.viewer.organizations.nodes.filter(org =>
      org.teams.nodes.some(team => team.slug === TEAM_SLUG)
    );
    if (!organizations.length) throw new Error(`No encuentro el equipo ${TEAM_SLUG} en tus organizaciones de GitHub`);
    return { login: response.data.viewer.login, organizations };
  }

  async fetchSearches(organizations) {
    const specs = searchSpecs(organizations);
    const items = Object.fromEntries(specs.map(spec => [spec.key, []]));
    const cursors = Object.fromEntries(specs.map(spec => [spec.key, null]));
    const complete = new Set();
    const errors = [];

    for (let page = 0; page < 10 && complete.size < specs.length; page++) {
      const pending = specs.filter(spec => !complete.has(spec.key));
      const query = `query { ${pending.map(spec => searchField(spec, cursors[spec.key])).join(" ")} }`;
      const result = await runGitHub(["api", "graphql", "-f", `query=${query}`], 45000);
      const response = JSON.parse(result.stdout);
      if (response.errors && response.errors.length) errors.push(...response.errors.map(error => error.message));
      if (!response.data) throw new Error(errors.join(" · ") || "GitHub no devolvió las PRs");
      for (const spec of pending) {
        const connection = response.data[spec.key];
        if (!connection) { complete.add(spec.key); continue; }
        items[spec.key].push(...(connection.nodes || []).filter(pr => pr && pr.url));
        if (connection.pageInfo && connection.pageInfo.hasNextPage && connection.pageInfo.endCursor) {
          cursors[spec.key] = connection.pageInfo.endCursor;
        } else {
          complete.add(spec.key);
        }
      }
    }

    const notComplete = specs.filter(spec => !complete.has(spec.key));
    if (notComplete.length) errors.push("GitHub Search limita cada categoría a 1000 resultados");

    const all = { company: [], own: [], reviewUser: [], reviewAssignee: [], reviewTeam: [] };
    for (const spec of specs) all[spec.section].push(...items[spec.key]);
    return { sections: all, errors: [...new Set(errors)] };
  }

  async fetchTracked(tracked) {
    if (!tracked.length) return [];
    const fields = `pullRequest(number: NUMBER) { ${PR_FIELDS} }`;
    const aliases = tracked.map((pr, index) =>
      `tracked${index}: repository(owner: ${JSON.stringify(pr.owner)}, name: ${JSON.stringify(pr.repo)}) { ${fields.replace("NUMBER", String(pr.number))} }`
    );
    const result = await runGitHub(["api", "graphql", "-f", `query=query { ${aliases.join(" ")} }`]);
    const response = JSON.parse(result.stdout);
    if (!response.data) throw new Error((response.errors && response.errors[0] && response.errors[0].message) || "No se pudieron cargar las PRs seguidas");
    return tracked.map((_pr, index) => response.data[`tracked${index}`] && response.data[`tracked${index}`].pullRequest).filter(Boolean);
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async cx => {
      try {
        const tracked = shared("my-prs.tracked") || [];
        this.trackedKey = JSON.stringify(tracked);
        const { login, organizations } = await this.discoverOrganizations();
        const [search, trackedPRs] = await Promise.all([
          this.fetchSearches(organizations),
          this.fetchTracked(tracked)
        ]);
        const review = new Map();
        for (const pr of search.sections.reviewUser) review.set(pr.url, { ...pr, reviewSources: ["Review solicitada a ti"] });
        for (const pr of search.sections.reviewAssignee) {
          const previous = review.get(pr.url);
          review.set(pr.url, { ...pr, reviewSources: [...((previous && previous.reviewSources) || []), "Asignada a ti"] });
        }
        for (const pr of search.sections.reviewTeam) {
          const previous = review.get(pr.url);
          review.set(pr.url, { ...pr, reviewSources: [...((previous && previous.reviewSources) || []), `Review solicitada al equipo ${TEAM_SLUG}`] });
        }
        this.sections = {
          company: uniquePRs([...search.sections.company, ...trackedPRs]),
          own: uniquePRs(search.sections.own),
          review: uniquePRs([...review.values()]),
          tracked: uniquePRs(trackedPRs)
        };
        this.login = login;
        this.organizationCount = organizations.length;
        this.loaded = true;
        this.error = search.errors.length ? search.errors.join(" · ") : null;
      } catch (error) {
        this.error = String(error);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  add(cx) {
    const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(this.input.value().trim());
    if (!match) { this.error = "Introduce una URL válida de PR de github.com"; cx.notify(); return; }
    if (this.loading) return;
    const tracked = shared("my-prs.tracked") || [];
    const entry = { owner: match[1], repo: match[2], number: Number(match[3]) };
    if (tracked.length >= 25) { this.error = "Máximo 25 PRs en seguimiento"; cx.notify(); return; }
    if (!tracked.some(pr => pr.owner === entry.owner && pr.repo === entry.repo && pr.number === entry.number)) {
      setShared("my-prs.tracked", [...tracked, entry]);
    }
    this.input.set_value("");
    this.adding = false;
    this.refresh(cx);
    cx.notify();
  }

  remove(pr, cx) {
    this.confirmURL = this.confirmURL === pr.url ? null : pr.url;
    cx.notify();
  }

  open(url, cx) {
    if (!/^https:\/\//.test(url || "")) return;
    cx.spawn(async cx => {
      try {
        const result = await exec("open", [url]);
        if (result.code !== 0) throw new Error(result.stderr);
      } catch (error) { this.error = String(error); cx.notify(); }
    });
  }

  tab(id, label, t) {
    const selected = this.selectedTab === id;
    return div().id(`prs-tab-${id}`).flex_1().h(28).px(3).py(6).truncate().cursor_pointer()
      .text_size(11).text_color(selected ? t.accent : t.muted)
      .bg(selected ? t.raised : t.chrome)
      .border_b(selected ? 2 : 0).border_color(selected ? t.accent : t.border)
      .on_click((_event, cx) => { this.selectedTab = id; cx.notify(); })
      .child(label);
  }

  card(pr, sectionId, cx, t) {
    const labels = { working: "En curso", blocked: "Fallo", done: "OK" };
    const commits = pr.commits && pr.commits.nodes;
    const commit = commits && commits[0] && commits[0].commit;
    const rollup = commit && commit.statusCheckRollup;
    const checks = (rollup && rollup.contexts && rollup.contexts.nodes) || [];
    const failed = checks.filter(check => status(check) === "blocked").length;
    const running = checks.filter(check => status(check) === "working").length;
    const rollupState = rollup && rollup.state;
    const state = failed || ["FAILURE", "ERROR"].includes(rollupState) ? "blocked" : running || rollupState === "PENDING" ? "working" : rollup ? "done" : null;
    const tracked = shared("my-prs.tracked") || [];
    const isTracked = tracked.some(item => `https://github.com/${item.owner}/${item.repo}/pull/${item.number}` === pr.url);
    const children = [
      h_flex().px(8).h(25).items_center().gap(5)
        .child(div().id(`fold-${sectionId}-${pr.url}`).cursor_pointer().text_color(t.dim)
          .on_click((_event, cx) => { this.expanded.has(pr.url) ? this.expanded.delete(pr.url) : this.expanded.add(pr.url); cx.notify(); })
          .child(this.expanded.has(pr.url) ? "▾" : "▸"))
        .child(div().id(`pr-${sectionId}-${pr.url}`).flex_1().min_w(0).truncate().cursor_pointer().tooltip(pr.title)
          .on_click((_event, cx) => this.open(pr.url, cx)).child(`${(pr.repository && pr.repository.nameWithOwner) || "repo"} #${pr.number}`))
        .child(div().text_color(t.dim).text_size(10).child((pr.author && pr.author.login) || "")),
      div().px(8).text_color(t.muted).truncate().child(`${pr.isDraft ? "Draft · " : ""}${pr.title}`),
      div().px(8).py(4).text_size(11).text_color(state ? t[state] : t.dim)
        .child(state ? `${labels[state]}${running ? ` · ${running} checks ejecutándose` : ""}${failed ? ` · ${failed} fallidos` : ""}` : "Sin checks")
    ];
    if (sectionId === "assigned" && pr.reviewSources && pr.reviewSources.length) {
      children.push(div().px(8).text_size(10).text_color(t.accent).child(pr.reviewSources.join(" · ")));
    }
    if (isTracked && this.confirmURL === pr.url) {
      children.push(v_flex().mx(6).my(4).p(8).gap(8).rounded(4).bg(t.popover).border(1).border_color(t.border).text_size(11)
        .child(div().child("¿Eliminar esta PR del seguimiento manual?"))
        .child(h_flex().justify_end().gap(6)
          .child(div().id(`cancel-untrack-${pr.url}`).px(8).py(4).bg(t.raised).rounded(3).cursor_pointer()
            .on_click((_event, cx) => { this.confirmURL = null; cx.notify(); }).child("Cancelar"))
          .child(div().id(`confirm-untrack-${pr.url}`).px(8).py(4).bg(t.solid).text_color(t.solid_foreground).rounded(3).cursor_pointer()
            .on_click((_event, cx) => {
              setShared("my-prs.tracked", (shared("my-prs.tracked") || []).filter(item => `https://github.com/${item.owner}/${item.repo}/pull/${item.number}` !== pr.url));
              this.confirmURL = null;
              this.refresh(cx);
              cx.notify();
            }).child("Eliminar"))));
    } else if (isTracked) {
      children.push(div().px(8).text_size(10).text_color(t.dim).cursor_pointer().tooltip("Dejar de seguir esta PR")
        .on_click((_event, cx) => this.remove(pr, cx)).child("Seguimiento manual · quitar ×"));
    }
    if (this.expanded.has(pr.url)) {
      checks.forEach((check, index) => children.push(
        div().id(`check-${sectionId}-${pr.url}-${index}`).px(12).py(3).text_size(11).text_color(t[status(check)]).cursor_pointer()
          .tooltip(check.name || check.context)
          .on_click((_event, cx) => this.open(check.detailsUrl || check.targetUrl || `${pr.url}/checks`, cx))
          .child(`${labels[status(check)]} · ${check.name || check.context}`)
      ));
    }
    return v_flex().flex_none().border_b(1).border_color(t.border).children(children);
  }

  render(cx) {
    const tracked = shared("my-prs.tracked") || [];
    if (JSON.stringify(tracked) !== this.trackedKey && !this.loading && !checking()) this.refresh(cx);
    const t = theme();
    const visible = this.selectedTab === "assigned" ? this.sections.review : this.sections[this.selectedTab] || [];
    const cardSection = this.selectedTab === "assigned" ? "assigned" : this.selectedTab;
    const emptyText = this.selectedTab === "company" ? "No hay PRs de empresa" : this.selectedTab === "own" ? "No tienes PRs abiertas" : "No tienes PRs asignadas";
    return v_flex().size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(12).border_t(1).border_color(t.border)
      .child(h_flex().h(28).px(8).gap(6).items_center().flex_none()
        .child(div().flex_1().text_color(t.muted).truncate().child(`PRs · ${this.login ? `@${this.login}` : "GitHub"} · ${visible.length}`))
        .child(div().id("prs-add").cursor_pointer().tooltip("Seguir una PR por URL").on_click((_event, cx) => { this.adding = !this.adding; cx.notify(); }).child("+"))
        .child(div().id("prs-refresh").cursor_pointer().text_color(t.dim).tooltip("Actualizar · cada 60 segundos").on_click((_event, cx) => this.refresh(cx)).child(this.loading ? "…" : "↻")))
      .when(this.adding, el => el.child(v_flex().px(8).gap(4).flex_none()
        .child(Input.new(this.input).h(28).text_size(11))
        .child(div().id("prs-add-confirm").cursor_pointer().text_color(t.accent).on_click((_event, cx) => this.add(cx)).child("Añadir seguimiento manual"))))
      .child(h_flex().flex_none().px(4).gap(2)
        .child(this.tab("company", "PRs", t))
        .child(this.tab("own", "Mis PRs", t))
        .child(this.tab("assigned", "PRs Asignadas", t)))
      .child(v_flex().id("prs-content").flex_1().min_h(0).overflow_y_scrollbar()
        .when(Boolean(this.error), el => el.child(div().p(8).text_color(t.blocked).child(this.error)))
        .when(!visible.length && !this.error, el => el.child(div().p(8).text_color(t.dim).child(this.loaded ? emptyText : "Cargando PRs de GitHub…")))
        .children(visible.map(pr => this.card(pr, cardSection, cx, t))));
  }
}
