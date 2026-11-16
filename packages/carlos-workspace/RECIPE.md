# Carlos Workspace — recipe

- Artefacto portable y sin mods: un layout personal basado en componentes estándar de Herdr.
- Fija `theme: graphite`, `terminal_padding: [6, 6]`, `padding: [0, 2]`, sidebar de 268 px, tabs de 28 px, panel de 368 px, status de 28 px, pane gap/radius 0 y titlebar nativa oculta.
- Conserva los nodos Spaces, Agents, Files y Changes del layout estándar. Omite mods instalados por separado (PRs, Codex Usage, GitView personalizado, MCP Manager).
- `install.cjs` valida que todas las referencias sean a mods estándar, se niega a reemplazar destinos ajenos y solo permite `--update` con su marker propio.
- Validación: `npm test`; en la máquina destino `herdr-app status` y revisión visual tras la instalación.
