/**
 * ECICEP v255 — Autenticación de OPERADOR y frontera RPC (DEC-110).
 *
 * La CAPTURA pública es anónima y jamás depende de este módulo. Operador y
 * administración, en cambio, se sirven por un único gateway `WebApp_operadorRpc`
 * que exige una sesión OPSESS válida y solo despacha métodos allowlisted.
 *
 * Sesión:
 *   · ScriptProperty `ECICEP_OPERATOR_SECRET_SHA256` guarda SOLO el hash SHA-256
 *     (hex) de la clave de operador. Nunca plaintext.
 *   · La sesión vive en `CacheService.getScriptCache()` con clave
 *     `OPSESS:<sha256(sessionToken)>`, valor `1` y TTL 21600 s (6 h).
 *   · El `sessionToken` es `OPS-<64hex>` y viaja solo en `sessionStorage` del
 *     navegador. Nunca URL/query/cookie/ScriptProperties.
 *
 * Fail-closed (v255 §18): fallo de CacheService, hash ausente, token malformado,
 * token expirado o método desconocido deniegan al OPERADOR. La captura sigue.
 *
 * Nunca se registra la clave ni el token.
 */

var WEBAPP_OPERATOR_SECRET_PROP_ = 'ECICEP_OPERATOR_SECRET_SHA256';
var WEBAPP_OPERATOR_LOGIN_MAX_ = 20;
var WEBAPP_OPERATOR_SESSION_TTL_ = 21600;
var WEBAPP_OPERATOR_TOKEN_RE_ = /^OPS-[0-9a-f]{64}$/;
var WEBAPP_OPERATOR_CONFIRM_TTL_ = 120;

// --- Helpers privados ------------------------------------------------------

/** SHA-256 hex de un texto (UTF-8). Cadena vacía si el entorno no lo soporta. */
function WebApp_operadorHash_(texto) {
  try {
    var bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, String(texto == null ? '' : texto),
      Utilities.Charset.UTF_8);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i]; if (b < 0) b += 256;
      hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return hex;
  } catch (e) {
    return '';
  }
}

/** Comparación en tiempo constante (evita filtrar longitud/posición). */
function WebApp_operadorCompararConstante_(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** ¿Hay hash de operador configurado? */
function WebApp_operadorConfigurado_() {
  try {
    return !!PropertiesService.getScriptProperties().getProperty(WEBAPP_OPERATOR_SECRET_PROP_);
  } catch (e) {
    return false;
  }
}

/**
 * Configura la clave de operador: persiste SOLO el hash. Mínimo 20 caracteres.
 * No se ejecuta contra producción en la tarea v255; queda disponible para el
 * paso de activación autorizado. Nunca registra la clave.
 */
function WebApp_operadorConfigurarClave_(clave) {
  clave = String(clave == null ? '' : clave);
  if (clave.length < 20) return { ok: false, codigo: 'CLAVE_OPERADOR_CORTA', motivo: 'La clave debe tener al menos 20 caracteres.' };
  try {
    PropertiesService.getScriptProperties().setProperty(WEBAPP_OPERATOR_SECRET_PROP_, WebApp_operadorHash_(clave));
    return { ok: true };
  } catch (e) {
    return { ok: false, codigo: 'OPERADOR_NO_DISPONIBLE', motivo: 'No se pudo guardar la clave.' };
  }
}

function WebApp_operadorCache_() {
  try { return CacheService.getScriptCache(); } catch (e) { return null; }
}

function WebApp_operadorNuevoToken_() {
  return 'OPS-' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function WebApp_operadorLoginIntentos_() {
  var cache = WebApp_operadorCache_();
  if (!cache) return null;
  var raw = cache.get('OPLOGIN_FAIL_COUNT');
  return raw ? (parseInt(raw, 10) || 0) : 0;
}
function WebApp_operadorRegistrarFalloLogin_() {
  var cache = WebApp_operadorCache_();
  if (!cache) return;
  var n = (WebApp_operadorLoginIntentos_() || 0) + 1;
  cache.put('OPLOGIN_FAIL_COUNT', String(n), 60);
}
function WebApp_operadorLimpiarFallosLogin_() {
  var cache = WebApp_operadorCache_();
  if (cache) cache.remove('OPLOGIN_FAIL_COUNT');
}

/** Valida el token contra la sesión en cache. Fail-closed. */
function WebApp_operadorValidar_(sessionToken) {
  try {
    if (typeof sessionToken !== 'string' || !WEBAPP_OPERATOR_TOKEN_RE_.test(sessionToken)) return false;
    var cache = WebApp_operadorCache_();
    if (!cache) return false;
    return cache.get('OPSESS:' + WebApp_operadorHash_(sessionToken)) === '1';
  } catch (e) {
    return false;
  }
}

/** Exige sesión OPSESS. Deniega limpiamente si falta o es inválida. */
function WebApp_operadorExigir_(sessionToken) {
  if (!WebApp_operadorValidar_(sessionToken)) {
    return { ok: false, codigo: 'OPERADOR_SESION_REQUERIDA', motivo: 'Inicia sesión de operador.' };
  }
  return { ok: true };
}

/** Serialización canónica para ligar una confirmación a los argumentos exactos. */
function WebApp_operadorNormalizarConfirmacion_(valor) {
  if (valor === null || valor === undefined) return null;
  if (Array.isArray(valor)) return valor.map(WebApp_operadorNormalizarConfirmacion_);
  if (typeof valor === 'object') {
    var limpio = {};
    Object.keys(valor).sort().forEach(function (k) {
      limpio[k] = WebApp_operadorNormalizarConfirmacion_(valor[k]);
    });
    return limpio;
  }
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return valor;
  return String(valor);
}

/** Solo estas operaciones eliminan datos/filas/archivos. Las mutaciones
 * clínicas ordinarias conservan sus confirmaciones e idempotencia propias. */
function WebApp_operadorEsDestructiva_(metodo, args) {
  if (metodo === 'api_amarilloDedupHistorico') return !(args && args[0] === true); // false = aplica
  return {
    api_backupPodar: true,
    api_configEliminar: true,
    UI_recuperarEjecutar: true,
    UI_vaciarDatosPrueba: true
  }[metodo] === true;
}

function WebApp_operadorConfirmacionBinding_(sessionToken, metodo, args) {
  var normalizados = WebApp_operadorNormalizarConfirmacion_(args || []);
  return WebApp_operadorHash_(String(metodo) + '\n' + JSON.stringify(normalizados) + '\n' +
    WebApp_operadorHash_(sessionToken));
}

/** PREPARE: emite un nonce opaco, ligado a OPSESS+método+argumentos. */
function WebApp_operadorPrepararConfirmacion_(sessionToken, metodo, args) {
  var cache = WebApp_operadorCache_();
  if (!cache) return { ok: false, codigo: 'OPERADOR_CONFIRMACION_NO_DISPONIBLE', motivo: 'No se pudo preparar la confirmación segura.' };
  var nonce = 'OPCONF-' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('OPCONF:' + WebApp_operadorHash_(nonce),
    WebApp_operadorConfirmacionBinding_(sessionToken, metodo, args), WEBAPP_OPERATOR_CONFIRM_TTL_);
  return {
    ok: false,
    codigo: 'OPERADOR_CONFIRMACION_REQUERIDA',
    motivo: 'Confirma esta operación destructiva antes de continuar.',
    confirmacion: { nonce: nonce, expiresIn: WEBAPP_OPERATOR_CONFIRM_TTL_ }
  };
}

/** EXECUTE: consume primero el nonce; replay, cambio de args o de sesión fallan. */
function WebApp_operadorConsumirConfirmacion_(sessionToken, metodo, args, nonce) {
  if (typeof nonce !== 'string' || !/^OPCONF-[0-9a-f]{64}$/.test(nonce)) return false;
  var cache = WebApp_operadorCache_();
  if (!cache) return false;
  var clave = 'OPCONF:' + WebApp_operadorHash_(nonce);
  var esperado = cache.get(clave);
  cache.remove(clave);
  if (!esperado) return false;
  return WebApp_operadorCompararConstante_(esperado,
    WebApp_operadorConfirmacionBinding_(sessionToken, metodo, args));
}

// ---------------------------------------------------------------------------
// SUPERFICIE PÚBLICA DE OPERADOR (3 RPC). Sin secretos ni PII en la respuesta.
// ---------------------------------------------------------------------------

/**
 * Inicia sesión de operador con la clave. Devuelve un token de sesión opaco.
 * Errores: OPERADOR_NO_CONFIGURADO, OPERADOR_NO_DISPONIBLE, CREDENCIALES_INVALIDAS,
 * OPERADOR_LOGIN_TEMPORALMENTE_LIMITADO.
 * La clave correcta se acepta SIEMPRE (bypassa el throttle de intentos
 * fallidos) y limpia el contador: el rate-limit solo frena intentos erróneos,
 * de modo que un atacante no puede provocar un DoS de login contra el operador.
 */
function WebApp_operadorIniciar(clave) {
  var cache = WebApp_operadorCache_();
  if (!cache) {
    return { ok: false, codigo: 'OPERADOR_NO_DISPONIBLE', motivo: 'Servicio de sesión no disponible.' };
  }
  if (!WebApp_operadorConfigurado_()) {
    return { ok: false, codigo: 'OPERADOR_NO_CONFIGURADO', motivo: 'El operador no tiene clave configurada.' };
  }
  var esperado = '';
  try { esperado = PropertiesService.getScriptProperties().getProperty(WEBAPP_OPERATOR_SECRET_PROP_) || ''; } catch (e) { esperado = ''; }
  clave = String(clave == null ? '' : clave);
  // La clave correcta SIEMPRE concede: el throttle solo frena fallos. Si se
  // bloqueara por el contador antes de verificar, un atacante podría agotar el
  // límite global y dejar fuera al operador legítimo (DoS trivial del login).
  var correcta = !!(esperado && clave) &&
    WebApp_operadorCompararConstante_(WebApp_operadorHash_(clave), esperado);
  if (correcta) {
    WebApp_operadorLimpiarFallosLogin_();
    var token = WebApp_operadorNuevoToken_();
    cache.put('OPSESS:' + WebApp_operadorHash_(token), '1', WEBAPP_OPERATOR_SESSION_TTL_);
    return { ok: true, sessionToken: token, expiresIn: WEBAPP_OPERATOR_SESSION_TTL_ };
  }
  var intentos = WebApp_operadorLoginIntentos_();
  if (intentos !== null && intentos >= WEBAPP_OPERATOR_LOGIN_MAX_) {
    return { ok: false, codigo: 'OPERADOR_LOGIN_TEMPORALMENTE_LIMITADO', motivo: 'Demasiados intentos. Espera un minuto.' };
  }
  WebApp_operadorRegistrarFalloLogin_();
  return { ok: false, codigo: 'CREDENCIALES_INVALIDAS', motivo: 'Clave de operador incorrecta.' };
}

/** Cierra la sesión de operador. Idempotente. */
function WebApp_operadorCerrar(sessionToken) {
  try {
    if (typeof sessionToken === 'string' && WEBAPP_OPERATOR_TOKEN_RE_.test(sessionToken)) {
      var cache = WebApp_operadorCache_();
      if (cache) cache.remove('OPSESS:' + WebApp_operadorHash_(sessionToken));
    }
  } catch (e) { /* idempotente: nunca falla */ }
  return { ok: true };
}

/**
 * Gateway RPC de operador: exige OPSESS y despacha SOLO métodos allowlisted.
 * Mapa privado y explícito; sin despacho dinámico por nombre.
 */
function WebApp_operadorRpc(sessionToken, metodo, args, confirmacionNonce) {
  var exigir = WebApp_operadorExigir_(sessionToken);
  if (!exigir.ok) return exigir;
  var mapa = WebApp_operadorMapa_();
  var fn = Object.prototype.hasOwnProperty.call(mapa, metodo)
    ? mapa[metodo] : null;
  if (typeof fn !== 'function') {
    return { ok: false, codigo: 'RPC_OPERADOR_NO_PERMITIDA', motivo: 'Operación de operador no permitida.' };
  }
  if (args === undefined || args === null) args = [];
  if (!Array.isArray(args)) {
    return { ok: false, codigo: 'RPC_OPERADOR_ARGUMENTOS_INVALIDOS', motivo: 'Argumentos de operación no válidos.' };
  }
  if (WebApp_operadorEsDestructiva_(metodo, args)) {
    if (!confirmacionNonce) return WebApp_operadorPrepararConfirmacion_(sessionToken, metodo, args);
    if (!WebApp_operadorConsumirConfirmacion_(sessionToken, metodo, args, confirmacionNonce)) {
      return { ok: false, codigo: 'OPERADOR_CONFIRMACION_INVALIDA', motivo: 'La confirmación expiró o no corresponde a esta operación.' };
    }
  }
  try {
    return fn.apply(null, args);
  } catch (e) {
    return { ok: false, codigo: 'RPC_OPERADOR_FALLO', motivo: 'No fue posible completar la operación.' };
  }
}

// ---------------------------------------------------------------------------
// MAPA EXPLÍCITO DE RPC DE OPERADOR. Llaves lógicas (las que usan los HTML);
// valores: funciones internas (sufijo `_`) ya privatizadas. Generado por
// `tools/privatizar_rpc_surface_v255.mjs` a partir de la lista auditada §10.
// ---------------------------------------------------------------------------
var WEBAPP_OPERATOR_RPC_ = null;
function WebApp_operadorMapa_() {
  if (WEBAPP_OPERATOR_RPC_) return WEBAPP_OPERATOR_RPC_;
  WEBAPP_OPERATOR_RPC_ = {
  "UI_abrirBuscador": UI_abrirBuscador_,
  "UI_abrirControles": UI_abrirControles_,
  "UI_abrirDashboard": UI_abrirDashboard_,
  "UI_abrirFicha": UI_abrirFicha_,
  "UI_abrirRevision": UI_abrirRevision_,
  "UI_analisisCarga": UI_analisisCarga_,
  "UI_backup": UI_backup_,
  "UI_configurarWebhook": UI_configurarWebhook_,
  "UI_demoCompleta": UI_demoCompleta_,
  "UI_diagnosticarFuentes": UI_diagnosticarFuentes_,
  "UI_diagnosticarIngresos": UI_diagnosticarIngresos_,
  "UI_diagnosticoTrazabilidad": UI_diagnosticoTrazabilidad_,
  "UI_ejecutarCarga": UI_ejecutarCarga_,
  "UI_generarRem": UI_generarRem_,
  "UI_migrarEsquemaPacientes": UI_migrarEsquemaPacientes_,
  "UI_panelControl": UI_panelControl_,
  "UI_recuperarEjecutar": UI_recuperarEjecutar_,
  "UI_recuperarInventario": UI_recuperarInventario_,
  "UI_sembrarFicticios": UI_sembrarFicticios_,
  "UI_vaciarDatosPrueba": UI_vaciarDatosPrueba_,
  "UI_verRem": UI_verRem_,
  "WebApp_cargarPacienteEdicion": WebApp_cargarPacienteEdicion_,
  "api_acercaDe": api_acercaDe_,
  "api_amarilloDedupHistorico": api_amarilloDedupHistorico_,
  "api_amarilloImportarTodo": api_amarilloImportarTodo_,
  "api_auditoriaEjecutar": api_auditoriaEjecutar_,
  "api_backupConfigLeer": api_backupConfigLeer_,
  "api_backupCrear": api_backupCrear_,
  "api_backupFolder": api_backupFolder_,
  "api_backupListar": api_backupListar_,
  "api_backupPodar": api_backupPodar_,
  "api_backupProgramar": api_backupProgramar_,
  "api_backupToggle": api_backupToggle_,
  "api_buscar": api_buscar_,
  "api_calidadNormalizarFormatoRuts": api_calidadNormalizarFormatoRuts_,
  "api_calidadSincronizarCola": api_calidadSincronizarCola_,
  "api_configAgregar": api_configAgregar_,
  "api_configEliminar": api_configEliminar_,
  "api_configGuardar": api_configGuardar_,
  "api_configListar": api_configListar_,
  "api_controlActualizarUltimo": api_controlActualizarUltimo_,
  "api_controlPanel": api_controlPanel_,
  "api_dashboardDatos": api_dashboardDatos_,
  "api_diagnosticoControl": api_diagnosticoControl_,
  "api_duplaAbrir": api_duplaAbrir_,
  "api_duplaGuardar": api_duplaGuardar_,
  "api_estratRecalcularPaciente": api_estratRecalcularPaciente_,
  "api_ficha": api_ficha_,
  "api_fichaGuardarCambios": api_fichaGuardarCambios_,
  "api_formWorkerEjecutarAhora": api_formWorkerEjecutarAhora_,
  "api_fuentesImpacto": api_fuentesImpacto_,
  "api_ingresoDetalle": api_ingresoDetalle_,
  "api_ingresoIncorporar": api_ingresoIncorporar_,
  "api_ingresosIncorporarValidos": api_ingresosIncorporarValidos_,
  "api_ingresosPendientes": api_ingresosPendientes_,
  "api_instalarDiagnostico": api_instalarDiagnostico_,
  "api_instalarEtapas": api_instalarEtapas_,
  "api_instalarPaso": api_instalarPaso_,
  "api_integridadReparar": api_integridadReparar_,
  "api_irA": api_irA_,
  "api_logLeer": api_logLeer_,
  "api_patologiasAbrir": api_patologiasAbrir_,
  "api_patologiasGuardar": api_patologiasGuardar_,
  "api_pruebasRegistro": api_pruebasRegistro_,
  "api_pruebasSistema": api_pruebasSistema_,
  "api_registrarEvento": api_registrarEvento_,
  "api_rem9Datos": api_rem9Datos_,
  "api_remExportarPdf": api_remExportarPdf_,
  "api_remVista": api_remVista_,
  "api_responsablesGuardarSector": api_responsablesGuardarSector_,
  "api_responsablesListar": api_responsablesListar_,
  "api_revisionListar": api_revisionListar_,
  "api_revisionResolver": api_revisionResolver_,
  "api_sistemaEstadoSalud": api_sistemaEstadoSalud_
  };
  return WEBAPP_OPERATOR_RPC_;
}
