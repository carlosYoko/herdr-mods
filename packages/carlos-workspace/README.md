# Carlos Workspace

Preset visual portable de Herdr: tema `graphite`, barra compacta, paneles sin espacio extra, terminales con padding 6×6, sidebar de 268 px y marco de ventana sin titlebar nativa. Incluye únicamente el layout; no instala ni modifica mods.

El layout usa los mods estándar de Herdr para espacios, agentes, pestañas, archivos, cambios, panel y estado. No incluye el panel personal de PRs ni la cuota Codex, para funcionar en Windows sin depender de esos mods.

## Instalar

Desde la raíz de este repositorio, con Herdr abierto:

```sh
npm run mod:install -- carlos-workspace
```

Crea y activa `layouts/carlos-workspace.json`. El preset selecciona `graphite`, uno de los temas integrados de Herdr, y aplica los paddings y tamaños del layout. No exporta credenciales, estado, datos de cuentas ni código de mods.

Para actualizar una instalación gestionada por este paquete:

```sh
npm run mod:install -- carlos-workspace --update
```

`--no-switch` instala sin cambiar el layout visible. Un layout existente no gestionado por el instalador nunca se reemplaza.
