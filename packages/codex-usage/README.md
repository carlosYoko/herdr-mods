# Codex Usage

Indicador compacto junto a las pestañas: cuota **restante** de 5 horas y 7 días,
más créditos de reinicio. Tooltip con fechas locales. Clic en porcentajes para
actualizar; clic en ↻ para abrir el panel de reinicios.

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
En macOS el proceso de Herdr debe poder encontrar Node y Codex en su entorno.
Si no hay sesión, inicia sesión con Codex en ese Mac/PC; el panel no ofrece login.

## Reinicios

La consulta automática cada 2 minutos solo lee cuotas; abrir el panel pide
los detalles de cada crédito. Se muestran título, descripción, estado y
caducidad, ordenados por vencimiento. Los textos del servidor se mantienen
tal como se reciben. Un estado desconocido o crédito caducado no es canjeable.

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
- Windows validado; macOS pendiente de validación real.
- Abrir Herdr o ejecutar el instalador no canjea créditos.

Instalación y actualización: [README principal](../../README.md).
