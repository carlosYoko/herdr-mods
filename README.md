# Herdr Mods

Colección comunitaria de **mods, layouts y temas para Herdr**, organizada en paquetes independientes para **Linux, macOS y Windows**. No está limitada a Codex: cada paquete puede aportar un panel, una herramienta, una integración o un diseño de ventana.

**Proyecto independiente, no oficial de Herdr ni de sus proveedores.**

## Plataformas

El repositorio y el instalador general están diseñados para Linux, macOS y Windows. Cada paquete documenta sus requisitos y nivel de validación. La CI ejecuta pruebas automatizadas en los tres sistemas; las pruebas con procesos simulados no sustituyen una validación de la interfaz en un dispositivo real.

| Plataforma | Instalador general | Integración visual del paquete actual |
| --- | --- | --- |
| Windows | Compatible | Validada con Herdr 0.1.15 |
| macOS | Compatible por diseño | Pendiente de validación en Herdr real |
| Linux | Compatible por diseño | Pendiente de validación en Herdr real |

## Catálogo

| Paquete | Función | Idiomas |
| --- | --- | --- |
| [codex-usage](packages/codex-usage/) | Cuota restante de 5 horas y semanal; panel de reinicios con confirmación de canje. | Español automático si el sistema está en español; inglés para el resto. |
| [mcp-manager](packages/mcp-manager/) | Panel junto a Files/Changes: configuración estándar de Pi y Codex; Claude Code en solo lectura. | Español. |

Los paquetes se instalan por separado. Instalar uno no instala los demás.

## Instalación selectiva

Requisitos comunes: Git, Node.js 20+, Herdr abierto y `herdr-app` disponible en PATH. Consulta también los requisitos del paquete elegido. Ejecuta `npm ci` para instalar la dependencia TOML fijada en el lockfile (utilizada por mcp-manager).

```sh
git clone https://github.com/carlosYoko/herdr-mods.git
cd herdr-mods
npm ci
npm test
npm run mods:list
```

Instala **solo el paquete que elijas**, por ejemplo:

```sh
npm run mod:install -- codex-usage
```

Para actualizar solo ese paquete:

```sh
git pull --ff-only
npm ci
npm test
npm run mod:install -- codex-usage --update
```

La forma general es `npm run mod:install -- <paquete> [opciones]`. `mods:list` solo enumera: no ejecuta instaladores. Sin nombre, con un nombre desconocido, varios paquetes o `--all`, no instala nada. No hay una instalación global implícita.

Para instalar el panel MCP conservando un layout de cuotas ya instalado:

```sh
npm run mod:install -- mcp-manager --base-layout codex-usage
```

Crea el layout `mcp-workspace` sin modificar `codex-usage`. Sin `--base-layout`, clona `main`. Consulta el README del paquete para sus límites y los archivos de configuración que puede modificar.

Los mods que colaboran pueden agruparse en un paquete y se instalan juntos. Cada instalador lista explícitamente sus archivos, protege los originales de Herdr y valida los mods instalados. Opciones y diseños específicos se explican en el README de cada paquete.

`--update` permite reemplazar los archivos del paquete. Los instaladores actuales guardan backups en `HERDR_APP_HOME/data/community-backups/<fecha>/`. No hay rollback automático completo de una instalación fallida: conserva los backups hasta comprobar el resultado.

## Trabajar entre Linux, Mac y Windows

Este repositorio es la **fuente de verdad**, no la carpeta de configuración de Herdr.

1. Antes de empezar en cada equipo: `git status` y `git pull --ff-only`.
2. Edita `packages/<paquete>/mods/<mod>/`, o el layout/tema fuente correspondiente.
3. Ejecuta `npm test`.
4. Instala el paquete editado: `npm run mod:install -- <paquete> --update`.
5. Prueba en Herdr, incluidos menús, confirmaciones y estados asíncronos.
6. Revisa `git diff`, haz commit y `git push`.
7. En otro equipo: pull, pruebas e instalación selectiva otra vez.

No desarrolles cambios sin publicar simultáneamente en varios equipos. Si Git rechaza un pull o push, resuelve el conflicto; no uses force-push. Los archivos instalados son copias: editar la configuración de Herdr no actualiza el repositorio. Traslada cualquier prueba rápida al código fuente antes del commit.

Nunca versiones toda `~/.config/herdr-app`, credenciales, conversaciones, sesiones, `shared.json`, preferencias personales o archivos regenerados. Las cuentas y autenticaciones permanecen en cada dispositivo y no viajan por Git.

## Organización y nuevos paquetes

```text
packages/
  <paquete>/
    herdr-package.json
    install.cjs
    README.md
    RECIPE.md
    preview.png
    mods/
      <mod>/
    layouts/              # opcional
    themes/               # opcional
scripts/
  install.cjs             # selección y catálogo general
  test-*.cjs
LICENSE
```

Para añadir un paquete, crea su carpeta, receta, pruebas, manifiesto e instalador. El dispatcher descubre `herdr-package.json` sin añadir un script npm específico. El manifiesto indica `id` (igual al nombre de carpeta), `description`, `mods` e `installer`. El instalador exporta `install(args)` y valida opciones antes de escribir.

Incluye solo código propio y archivos expresamente necesarios. Para personalizar código oficial de Herdr, clónalo localmente durante la instalación; no lo copies ni lo relicencies en el repositorio. Los idiomas y plataformas concretas se documentan por paquete.

## Seguridad y licencia

Revisa el README de cada paquete antes de instalar: los mods son código de confianza y pueden ejecutar programas, acceder a archivos o consultar servicios de red. Las acciones que gasten créditos o modifiquen una cuenta deben requerir confirmación explícita y nunca probarse contra recursos reales de forma automática.

Código propio bajo [MIT](LICENSE). Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para requisitos y componentes de terceros.
