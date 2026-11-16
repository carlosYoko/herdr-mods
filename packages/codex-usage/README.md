# Codex Usage

Indicador compacto junto a las pestañas: cuota **restante** de 5 horas y 7 días,
más créditos de reinicio. Tooltip con fechas locales. Clic en porcentajes para
actualizar; clic en ↻ para abrir el panel de reinicios.

## Idioma automático: español / English

El indicador, tooltips, panel, botones, confirmaciones y errores propios se traducen automáticamente: **español** si el idioma del sistema es `es` (incluidas variantes como es-ES y es-MX), e **inglés** para cualquier otro idioma. No utiliza el país para decidir el idioma ni requiere una opción manual.

- Windows: consulta `Get-UICulture` mediante PowerShell.
- macOS: consulta el primer idioma de `AppleLanguages` con `defaults`.
- Linux: respeta `LC_ALL`, `LC_MESSAGES`, `LANG` y la preferencia `LANGUAGE`; C/POSIX mantiene inglés.
- Si falla la consulta nativa, usa el entorno o la configuración regional de Node; en último caso, inglés.

La detección se hace en cada consulta de Codex. Si cambias el idioma del sistema, puede ser necesario reiniciar Herdr para que herede el nuevo entorno; después pulsa actualizar. Antes de la primera detección, la interfaz usa inglés.

Los títulos y descripciones conocidos de créditos también se traducen. Si OpenAI devuelve un texto nuevo o desconocido, se conserva el original para no inventar el alcance del reinicio. Los nombres Codex/ChatGPT, IDs, comandos y detalles técnicos no se traducen.

## Plataformas

Diseñado para **Linux, macOS y Windows**, con descubrimiento del binario por plataforma y arquitectura. La integración visual está validada en Windows con Herdr 0.1.15; todavía falta validarla en Herdr real en macOS y Linux. La CI y las pruebas de idioma/protocolo usan simulaciones y no prueban un canje real.

## Antes de instalar: qué ejecuta y qué lee

Ejecuta `node` y el binario `codex app-server`. Codex consulta OpenAI usando
su sesión local existente de ChatGPT. El helper busca Codex en PATH o en la
extensión `~/.vscode/extensions/openai.chatgpt-*`; no lee auth.json directamente
ni copia tokens. La autenticación y cualquier renovación la gestiona Codex.

Los archivos del mod viven bajo el home de Herdr. No lee conversaciones.
El instalador lee la barra de pestañas y layout de Herdr para clonarlos en
ese mismo home, escribe copias personales y guarda backups locales.

Si Codex no está en PATH ni en la ubicación soportada, arranca Herdr con
`CODEX_BINARY` apuntando al ejecutable real. En Windows no uses un wrapper .cmd.
En Linux y macOS el proceso de Herdr debe poder encontrar Node y Codex en su entorno.
Si no hay sesión, inicia sesión con Codex en ese equipo; el panel no ofrece login.

## Reinicios

La consulta automática cada 2 minutos solo lee cuotas; abrir el panel pide
los detalles de cada crédito. Se muestran título, descripción, estado y
caducidad, ordenados por vencimiento. Los textos conocidos se traducen;
los desconocidos conservan el original. Un estado desconocido o crédito caducado no es canjeable.

1. Pulsa ↻ junto a los porcentajes.
2. Elige `Usar…`.
3. Revisa el alcance indicado en el título y confirma el uso de **1 crédito real**.

No se infiere que todos los créditos sean semanales ni que se repongan
periódicamente. El servidor decide si el canje produce un reset, si no hay nada
que restablecer, si falta el crédito o si ya fue canjeado.

Ante error ambiguo se conserva el intento en shared state y se reutiliza su
clave de idempotencia al reintentar. No hay reintentos automáticos. No borres
ese estado para forzar otro intento. Escape/cerrar no garantiza cancelar una
petición que ya se envió. El bloqueo local no sustituye la idempotencia del
servidor ni sincroniza intentos entre ordenadores.

## Limitaciones

- Solo Codex con ChatGPT; no Copilot ni facturación de API.
- Un perfil/cuenta local; no selector de cuentas.
- Campos ausentes aparecen como no disponibles, no como cero.
- Una cuota cuya fecha de reset ya pasó se oculta hasta una nueva lectura.
- Sin cron ni procesos de modelo: solo consultas del app-server.
- El transporte experimental puede requerir adaptar el helper tras una actualización.
- Windows validado; macOS y Linux pendientes de validación visual real.
- Abrir Herdr o ejecutar el instalador no canjea créditos.

Lista de paquetes: `npm run mods:list`.
Instala solo este paquete: `npm run mod:install -- codex-usage`.

Para conservar otro layout personal, selecciona su nombre y el mod de pestañas que usa. El instalador crea un layout y una copia de pestañas nuevos, sustituyendo solo esa referencia en la copia; no cambia el layout original ni los demás bloques. Ejemplo: `npm run mod:install -- codex-usage --base-layout files-icons-layout --tabs-mod tabs-compact --layout-name files-icons-codex --tabs-name tabs-compact-codex`. Usa nombres de destino libres; si ya existen, la instalación se detiene sin reemplazarlos. Si la barra no es compatible con los anclajes esperados, también se detiene sin modificarla.
Actualiza solo este paquete: `npm run mod:install -- codex-usage --update`.
`codex-quota` y `codex-resets` forman un conjunto y se instalan juntos.
Otros paquetes presentes o futuros no se instalan con este comando.

Instalación y actualización: [README principal](../../README.md).
