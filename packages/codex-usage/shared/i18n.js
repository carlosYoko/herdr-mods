// Shared original UI translations. Installer copies this file beside each consumer.
export const messages = {
  en: {
    noDate: "no date", noExpiry: "Does not expire", quotaHint: "Codex · REMAINING quota · click to refresh",
    error: "Error: {error}", reading: "Checking your account…", age: "Account checked {minutes} min ago",
    fiveHours: "5 hours", weekly: "Weekly", minutes: "{minutes} min", resetAt: "{window}: resets {date}",
    resetHint: "Available resets: {count}. Click ↻ to view and redeem one with confirmation.",
    unavailable: "not reported", pollHint: "Checked every 2 minutes using Codex and your ChatGPT session.",
    openResets: "View available resets and redeem one with confirmation", shortWeek: "7d",
    resetsTitle: "Codex resets", close: "Close", availableCount: "Available: {count}. A reset is only redeemed after you confirm.",
    resetCredit: "Codex reset", use: "Use…", expires: "Expires: {date} · {status}",
    available: "Available", redeeming: "Redeeming", redeemed: "Redeemed", unknown: "Unknown",
    confirmTitle: "Use this reset?", pendingTitle: "Check / retry the pending redemption",
    warning: "This redeems a real credit from your account. The reset scope is stated in its title. It cannot be undone from this panel.",
    pendingWarning: "A redemption attempt is pending. No different attempt will be started; retrying uses the same idempotency key.",
    cancel: "Cancel", consuming: "Redeeming…", retry: "Retry same redemption", confirm: "Confirm and use 1 reset",
    empty: "Codex returned no selectable resets.", accountFooter: "ChatGPT account connected in Codex · local times",
    checking: "Checking…", refresh: "Refresh", uncertain: "The outcome may be uncertain. Retrying uses the same key to avoid duplicate redemption.",
    reset: "Reset applied. Codex confirmed the redemption.", nothingToReset: "Codex reports there are no limits to reset.",
    noCredit: "Codex reports this reset is unavailable.", alreadyRedeemed: "Codex reports this reset was already redeemed.",
    unknownOutcome: "Unknown redemption result. Check the status before trying another redemption.",
    fullReset: "Full reset (Weekly + 5 hr)", giftDescription: "Thanks for using Codex! You've been granted one free rate limit reset.",
    confirmation_required: "Redemption requires confirmation, a credit and an idempotency key.",
    binary_missing: "Codex was not found. Install the CLI or set CODEX_BINARY.",
    timeout: "Codex did not respond within 20 seconds.", start_failed: "Could not start Codex app-server.",
    connection_lost: "The connection to Codex was interrupted.", early_exit: "Codex exited before returning the quota.",
    rpc_error: "Codex rejected the request. Check your Codex login.",
    unknown_outcome: "Unknown redemption response. Do not start a different attempt; retry with the same key.",
    no_limits: "The account returned no quotas. Check your Codex login.",
    request_failed: "The Codex request failed. Check that Node and Codex are available."
  },
  es: {
    noDate: "sin fecha", noExpiry: "Sin caducidad", quotaHint: "Codex · cuota RESTANTE · clic para actualizar",
    error: "Error: {error}", reading: "Consultando tu cuenta…", age: "Consulta de cuenta: hace {minutes} min",
    fiveHours: "5 horas", weekly: "Semanal", minutes: "{minutes} min", resetAt: "{window}: se restablece {date}",
    resetHint: "Reinicios disponibles: {count}. Pulsa ↻ para verlos y canjear uno con confirmación.",
    unavailable: "no informado", pollHint: "Consulta cada 2 minutos mediante Codex con tu sesión de ChatGPT.",
    openResets: "Ver reinicios disponibles y canjear uno con confirmación", shortWeek: "7d",
    resetsTitle: "Reinicios de Codex", close: "Cerrar", availableCount: "Disponibles: {count}. Solo se gasta un reinicio al confirmar el canje.",
    resetCredit: "Reinicio de Codex", use: "Usar…", expires: "Caduca: {date} · {status}",
    available: "Disponible", redeeming: "Canjeando", redeemed: "Canjeado", unknown: "Desconocido",
    confirmTitle: "¿Usar este reinicio?", pendingTitle: "Comprobar / reintentar el canje pendiente",
    warning: "Esta acción canjea un crédito real de tu cuenta. El alcance del reinicio es el indicado en su título. No se puede deshacer desde este panel.",
    pendingWarning: "Hay un intento pendiente. No se iniciará otro distinto; el reintento usa la misma clave de idempotencia.",
    cancel: "Cancelar", consuming: "Canjeando…", retry: "Reintentar mismo canje", confirm: "Confirmar y usar 1 reinicio",
    empty: "Codex no ha devuelto reinicios seleccionables.", accountFooter: "Cuenta ChatGPT conectada en Codex · horas locales",
    checking: "Consultando…", refresh: "Actualizar", uncertain: "El resultado puede ser incierto. Reintentar reutiliza la misma clave para evitar un doble canje.",
    reset: "Reinicio aplicado. Codex ha confirmado el canje.", nothingToReset: "Codex indica que no hay límites que restablecer.",
    noCredit: "Codex indica que este reinicio no está disponible.", alreadyRedeemed: "Codex indica que este reinicio ya fue canjeado.",
    unknownOutcome: "Resultado de canje desconocido; comprueba el estado antes de otro canje.",
    fullReset: "Reinicio completo (semanal + 5 horas)", giftDescription: "¡Gracias por usar Codex! Has recibido un reinicio gratuito de tus límites de uso.",
    confirmation_required: "El canje requiere confirmación, crédito y clave de idempotencia.",
    binary_missing: "No se encuentra Codex. Instala la CLI o configura CODEX_BINARY.",
    timeout: "Codex no respondió en 20 segundos.", start_failed: "No se pudo iniciar Codex app-server.",
    connection_lost: "Conexión con Codex interrumpida.", early_exit: "Codex se cerró antes de devolver la cuota.",
    rpc_error: "Codex rechazó la petición. Comprueba la sesión de Codex.",
    unknown_outcome: "Respuesta de canje desconocida. No inicies otro canje; reintenta con la misma clave.",
    no_limits: "La cuenta no ha devuelto cuotas. Comprueba el login de Codex.",
    request_failed: "Falló la petición a Codex. Comprueba que Node y Codex estén disponibles."
  }
};
export function translator(language = "en") {
  const dictionary = messages[language] || messages.en;
  return (key, values = {}) => (dictionary[key] || messages.en[key] || key)
    .replace(/\{(\w+)\}/g, (match, name) => values[name] === undefined ? match : String(values[name]));
}
export function errorText(error, language) {
  const tr = translator(language);
  const code = error?.error_code || error?.code;
  if (code && messages.en[code]) return tr(code) + (error.error_rpc_code !== undefined ? ` (${error.error_rpc_code})` : "");
  return tr("request_failed");
}
export function creditTitle(title, language) {
  const tr = translator(language);
  if (!title) return tr("resetCredit");
  return title === "Full reset (Weekly + 5 hr)" ? tr("fullReset") : title;
}
export function creditDescription(description, language) {
  return description === "Thanks for using Codex! You've been granted one free rate limit reset."
    ? translator(language)("giftDescription") : (description || "");
}
