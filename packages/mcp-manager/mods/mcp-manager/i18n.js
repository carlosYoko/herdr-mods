// Original MCP panel translations. Technical names and paths are never translated.
export const messages = {
  en: {
    refresh: "Refresh", noAgent: "No compatible agent focused",
    focusHint: "Focus a Pi, Codex or Claude Code terminal. An agent from another tab is never used. VS Code and Claude Desktop do not expose their chat session here.",
    remoteHint: "Remote sessions are not supported yet. Local configuration is never read or modified for a remote session.",
    standard: "STANDARD CONFIGURATION · connection not inspected", reading: "Reading configuration…",
    writing: "Saving… The agent is not restarted and no text is sent to it.",
    hideDetails: "Hide scope and limitations", showDetails: "View scope and limitations",
    reload: "Changes require reloading/restarting the agent. This modifies configuration, not the active connection.",
    readOnly: "Read-only. This client/profile is not modified.", enableAll: "Enable all", disableAll: "Disable all",
    empty: "No MCP servers are defined in these standard files. Servers registered by extensions or custom profiles do not appear here.",
    enableCount: "Enable {count} MCP servers", disableCount: "Disable {count} MCP servers",
    warning: "The files listed below will be modified. User files affect other sessions; project files may be shared through Git. Backups are saved, but there is no automatic rollback across files. JSON/TOML are reformatted; TOML comments are lost. Cancel if you use a different profile or configuration.",
    confirm: "Confirm change", cancel: "Cancel", defined: "Defined", enabled: "ON · Disable", disabled: "OFF · Enable",
    user: "User", project: "Project", fileRead: "File read: {file}", fileMissing: "Not found: {file}",
    saved: "Saved. Reload or restart the agent. Backups are next to the configuration: .herdr-backup-*",
    signIn: "Sign in",
    signingIn: "Signing in… Pi may open your browser; approve the request there.",
    signedIn: "OAuth sign-in completed in Pi. Run /reload to reconnect the server.",
    oauthFailed: "Pi could not complete OAuth sign-in. The server remains enabled; check Pi's /mcp login for details.",
    oauthAfterEnable: "After enabling, Pi will start its OAuth sign-in flow. Pi stores credentials; Herdr never reads or stores tokens.",
    noticeBase: "Standard configuration, not connection state. Session flags, profiles and environment variables are unknown. Extensions may add other MCP servers.",
    noticePi: "Pi only loads trusted projects. Run /reload after applying changes. Extension MCP adapters are not managed.",
    noticeCodex: "Codex project layers require trust. Restart the session. Saving TOML preserves values, but not comments or formatting. Custom CODEX_HOME or --config options are not detected.",
    noticeClaude: "Claude Code: read-only definitions, not permissions or disabled-server preferences. This is not Claude Desktop or the VS Code chat.",
    read_failed: "Could not read the configuration. Check that Node.js is available to Herdr.",
    apply_failed: "Could not apply the change. Refresh and check backups before retrying.",
    request_failed: "The MCP helper failed. Check Node.js, refresh and review the configuration; no automatic retry was started.",
    access_error: "Could not access the configuration ({code}). If a lock remains, check that no write is active before removing it.",
    symlink: "Configuration symlinks are not supported: {file}", too_large: "Configuration is too large: {file}",
    invalid_config: "Invalid configuration (not modified): {file}", expected_object: "Expected a configuration object: {file}",
    invalid_table: "Invalid MCP table: {file}", invalid_entry: "Invalid MCP entry: {file}", invalid_state: "Invalid MCP enabled state: {file}",
    invalid_context: "Invalid session context.", missing_folder: "The session folder is unavailable.",
    confirmation_required: "A change requires explicit confirmation and a valid selection.", read_only: "This client or profile is read-only.",
    stale: "The configuration changed. Refresh and confirm again.", duplicate: "Duplicate selection.",
    missing_server: "The server is no longer available.", concurrent: "Concurrent change: refresh before saving.",
    partial: "Concurrent change; some files may have changed. Review backups before retrying."
  },
  es: {
    refresh: "Actualizar", noAgent: "Sin agente compatible enfocado",
    focusHint: "Enfoca una terminal de Pi, Codex o Claude Code. No se usa el agente de otra pestaña. VS Code y Claude Desktop no exponen aquí su sesión.",
    remoteHint: "Las sesiones remotas aún no están admitidas. No se lee ni modifica la configuración local para una sesión remota.",
    standard: "CONFIGURACIÓN ESTÁNDAR · conexión no consultada", reading: "Leyendo configuración…",
    writing: "Guardando… No se reinicia ni se envía texto al agente.",
    hideDetails: "Ocultar alcance y límites", showDetails: "Ver alcance y límites",
    reload: "Los cambios requieren recargar/reiniciar el agente. Se modifica la configuración, no la conexión activa.",
    readOnly: "Solo lectura. No se modifica este cliente/perfil.", enableAll: "Activar todos", disableAll: "Desactivar todos",
    empty: "No hay MCP definidos en estos archivos estándar. Los registrados por extensiones o perfiles personalizados no aparecen aquí.",
    enableCount: "Activar {count} MCP", disableCount: "Desactivar {count} MCP",
    warning: "Se modifican los archivos indicados debajo. Los de usuario afectan a otras sesiones; los de proyecto pueden estar compartidos por Git. Se guarda backup, pero no hay rollback automático entre varios archivos. JSON/TOML se reformatean; TOML pierde comentarios. Si usas otro perfil o configuración, cancela.",
    confirm: "Confirmar cambio", cancel: "Cancelar", defined: "Definido", enabled: "ON · Desactivar", disabled: "OFF · Activar",
    user: "Usuario", project: "Proyecto", fileRead: "Archivo leído: {file}", fileMissing: "No existe: {file}",
    saved: "Guardado. Recarga o reinicia el agente. Backups junto a la configuración: .herdr-backup-*",
    signIn: "Iniciar sesión",
    signingIn: "Iniciando sesión… Pi puede abrir el navegador; aprueba allí la solicitud.",
    signedIn: "OAuth completado en Pi. Ejecuta /reload para reconectar el servidor.",
    oauthFailed: "Pi no pudo completar OAuth. El servidor sigue activado; consulta /mcp login en Pi para ver detalles.",
    oauthAfterEnable: "Al activarlo, Pi iniciará el flujo OAuth. Pi guarda las credenciales; Herdr nunca lee ni almacena tokens.",
    noticeBase: "Configuración estándar, no estado de conexión. No se conocen flags, perfiles ni variables de la sesión. Las extensiones pueden añadir otros MCP.",
    noticePi: "Pi solo carga el proyecto si confías en él. Ejecuta /reload tras aplicar cambios. No se gestionan adaptadores MCP de extensiones.",
    noticeCodex: "Codex: las capas de proyecto requieren confianza. Reinicia la sesión. Al guardar TOML se conservan valores, pero no comentarios ni formato. CODEX_HOME o --config personalizados no se detectan.",
    noticeClaude: "Claude Code: vista de definiciones, solo lectura; no representa permisos ni servidores deshabilitados en preferencias. No es Claude Desktop ni el chat de VS Code.",
    read_failed: "No se pudo leer la configuración. Comprueba que Node.js esté disponible para Herdr.",
    apply_failed: "No se pudo aplicar el cambio. Actualiza y revisa los backups antes de reintentar.",
    request_failed: "Falló el helper MCP. Comprueba Node.js, actualiza y revisa la configuración; no se ha iniciado un reintento automático.",
    access_error: "No se pudo acceder a la configuración ({code}). Si queda un lock, comprueba que no hay una escritura activa antes de eliminarlo.",
    symlink: "Symlinks de configuración no admitidos: {file}", too_large: "Configuración demasiado grande: {file}",
    invalid_config: "Configuración inválida (no se modifica): {file}", expected_object: "Se esperaba un objeto de configuración: {file}",
    invalid_table: "Tabla MCP inválida: {file}", invalid_entry: "Entrada MCP inválida: {file}", invalid_state: "Estado MCP inválido: {file}",
    invalid_context: "Contexto de sesión no válido.", missing_folder: "Carpeta de sesión no disponible.",
    confirmation_required: "El cambio requiere confirmación explícita y una selección válida.", read_only: "Cliente o perfil de solo lectura.",
    stale: "La configuración ha cambiado. Actualiza y confirma de nuevo.", duplicate: "Selección duplicada.",
    missing_server: "Servidor ya no disponible.", concurrent: "Cambio concurrente: actualiza antes de guardar.",
    partial: "Cambio concurrente; puede haber cambios parciales. Revisa los backups antes de reintentar."
  }
};
export function translator(language = "en") {
  const dictionary = messages[language] || messages.en;
  return (key, values = {}) => (dictionary[key] || messages.en[key] || key)
    .replace(/\{(\w+)\}/g, (match, name) => values[name] === undefined ? match : String(values[name]));
}
export function errorText(error, language) {
  const key = error?.error_code;
  // Never render raw process errors or parser excerpts.
  return translator(language)(key && Object.prototype.hasOwnProperty.call(messages.en, key) ? key : "request_failed", error?.error_values || {});
}
