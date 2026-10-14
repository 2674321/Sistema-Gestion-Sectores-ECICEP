// ---------------------------------------------------------------------------
// 36_FormsCanal.js — Transporte durable Google Forms (v253 — DEC-106).
//
// Google Forms es el transporte durable interno detrás de CapturaWeb. Se conserva
// infraestructura legacy de Forms como tecnología base (idea del 24_Formulario),
// pero la pieza instalada aquí no es una interfaz operativa separada:
//   * Form_operativoInstalar_  → crea/arregla el Form, el esquema, el itemMap,
//     el trigger onFormSubmit, y migra las columnas de transporte.
//   * Form_onFormSubmit_       → ingesta por envío (evento de Forms).
//   * Form_worker_             → cola durable: reanuda lo que el trigger no pudo.
//   * Form_reconciliarTransporte_ → clasifica envíos no procesados (dryRun).
//   * Form_syncCatalogos_      → sincroniza sectores/profesionales/estratificación
//     desde las fuentes oficiales (feed de opciones del Form).
//
// La cola física es FORM_RESPUESTAS (misma hoja técnica del pipeline V2) y el
// procesamiento SIEMPRE pasa por CapturaIngress_* → Captura_v2_enviar_. NO se
// crea un segundo pipeline ni una segunda base de datos.
//
// Configuración operativa (ScriptProperties, nunca en Git):
//   GOOGLE_FORM_ID, GOOGLE_FORM_URL, GOOGLE_FORM_EDIT_URL,
//   GOOGLE_FORM_SCHEMA_VERSION, GOOGLE_FORM_ITEM_MAP, GOOGLE_FORM_CANONICAL_ITEM_MAP,
//   GOOGLE_FORM_TITLE_MAP,
//   GOOGLE_FORM_ESTADO, GOOGLE_FORM_CURSOR, GOOGLE_FORM_WORKER_LEASE,
//   GOOGLE_FORM_METRIC_<clave>  (LOCK_BUSY_DEFERRED, WORKER_RUNS, ...)
// v256: NO se escribe ScriptProperty por captura. Los errores de transporte
// viven en el trailer de FORM_RESPUESTAS (CLASIFICACION / TRANSPORTE_ERROR).
// Estáticos en GOOGLE_FORMS_CONFIG (00_Config.js).
// ---------------------------------------------------------------------------

var GOOGLE_FORMS_PROPS = ['GOOGLE_FORM_ID', 'GOOGLE_FORM_URL', 'GOOGLE_FORM_EDIT_URL',
  'GOOGLE_FORM_SCHEMA_VERSION', 'GOOGLE_FORM_ITEM_MAP', 'GOOGLE_FORM_CANONICAL_ITEM_MAP', 'GOOGLE_FORM_TITLE_MAP',
  'GOOGLE_FORM_ESTADO', 'GOOGLE_FORM_CURSOR'];

/** GAS: lector seguro de ScriptProperties (null en node). */
function Form_props_() {
  try {
    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      return PropertiesService.getScriptProperties();
    }
  } catch (e) { /* node */ }
  return null;
}
function Form_propLeer_(clave) {
  var p = Form_props_();
  return p ? p.getProperty(clave) || '' : '';
}
function Form_propEscribir_(clave, valor) {
  var p = Form_props_();
  if (p) p.setProperty(clave, String(valor));
}
/** v256 (P1): claves de ScriptProperties que empiezan con un prefijo EXACTO.
 *  Solo para inventario/limpieza legacy; NUNCA por captura. */
function Form_propClaves_(prefijo) {
  var p = Form_props_();
  if (!p || typeof p.getKeys !== 'function') return [];
  var out = [];
  try {
    var keys = p.getKeys() || [];
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).indexOf(String(prefijo)) === 0) out.push(keys[i]);
    }
  } catch (e) { return []; }
  return out;
}
function Form_json_(raw) {
  if (!raw) return {};
  try { var o = JSON.parse(raw); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}

/** v259 (DEC-114): guard exclusivamente técnico para mutadores de activación.
 *  Formato: OPEN:<timestamp de expiración ISO o epoch-ms>. No gobierna ninguna
 *  mutación clínica normal. La ventana nunca puede extenderse más de dos horas. */
function Operacion_ventanaActivacionAbierta_(ahoraMs) {
  var ahora = Number(ahoraMs) || Date.now();
  var cfg = GOOGLE_FORMS_CONFIG.ACTIVATION_WINDOW || {};
  var raw = String(Form_propLeer_(cfg.CLAVE || 'ECICEP_ACTIVATION_WINDOW') || '').trim();
  if (raw.indexOf('OPEN:') !== 0) return { ok: false, abierta: false, motivo: 'ACTIVATION_WINDOW_CLOSED' };
  var valor = raw.slice(5).trim();
  var expira = /^\d+$/.test(valor) ? Number(valor) : Date.parse(valor);
  if (!isFinite(expira)) return { ok: false, abierta: false, motivo: 'ACTIVATION_WINDOW_INVALID' };
  if (expira <= ahora) return { ok: false, abierta: false, motivo: 'ACTIVATION_WINDOW_EXPIRED' };
  if (expira - ahora > (cfg.TTL_MAX_MS || 7200000)) return { ok: false, abierta: false, motivo: 'ACTIVATION_WINDOW_TTL_EXCEEDED' };
  return { ok: true, abierta: true, expiraEn: new Date(expira).toISOString() };
}

/** Métricas del canal (contadores/gauges, no PII). */
function Form_metricas_() {
  var claves = ['LOCK_BUSY_DEFERRED', 'WORKER_RUNS', 'WORKER_PROCESSED', 'WORKER_ERRORS',
    'WORKER_RETRYABLE', 'WORKER_REVIEW', 'WORKER_TERMINAL', 'DEFERRED_COUNT', 'OLDEST_PENDING_MIN',
    'SUBMIT_SIGNAL_COUNT'];
  var out = {};
  claves.forEach(function (k) {
    var v = Form_propLeer_('GOOGLE_FORM_METRIC_' + k);
    out[k] = v ? Number(v) : 0;
  });
  // v270 (P0): SUBMIT_SIGNAL_COUNT mide CAPACIDAD (señal de submit cableada),
  // no recepción real. Se expone el alias semántico `installableSubmitSignals`.
  out.installableSubmitSignals = out.SUBMIT_SIGNAL_COUNT;
  return out;
}
/** v256 (P1): suma de contador con lectura+escritura ATÓMICA. La sección crítica
 *  es BREVE (solo el RMW de ScriptProperties), jamás rodea I/O. Best-effort: si
 *  el lock no está disponible no bloquea al llamador. */
function Form_metricaSumar_(clave, delta) {
  var prop = 'GOOGLE_FORM_METRIC_' + clave;
  var inc = delta === undefined ? 1 : (Number(delta) || 0);
  var lock = null;
  try {
    if (typeof LockService !== 'undefined') {
      lock = LockService.getScriptLock();
      if (lock && typeof lock.tryLock === 'function') lock.tryLock(0);
    }
    var v = Number(Form_propLeer_(prop)) || 0;
    Form_propEscribir_(prop, String(v + inc));
  } catch (e) { /* best-effort: las métricas no gobiernan verdad */ }
  finally { try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ } }
}
/** v256 (P1): incremento LOCK-FREE para el TRIGGER de submit. El trigger no
 *  puede tomar lock clínico (señal no bloqueante); además es el ÚNICO escritor
 *  de SUBMIT_SIGNAL_COUNT, por lo que la carrera es teórica. Nunca propaga error. */
function Form_metricaTriggerSumar_(clave, delta) {
  var prop = 'GOOGLE_FORM_METRIC_' + clave;
  var inc = delta === undefined ? 1 : (Number(delta) || 0);
  try {
    var v = Form_propLeer_(prop);
    Form_propEscribir_(prop, String((v ? Number(v) : 0) + inc));
  } catch (e) { /* best effort */ }
}

// ---------------------------------------------------------------------------
// TRANSPORTE v255 — dedupe por CLIENT_REQUEST_ID + recuperación de ACK
// ---------------------------------------------------------------------------

/** GAS: cache rápida del script (null en node/ausente). */
function Form_cache_() {
  try {
    if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
      return CacheService.getScriptCache();
    }
  } catch (e) { /* node */ }
  return null;
}

/** v256 (P0): resultado INDETERMINADO por fallo técnico. NUNCA debe degradarse
 *  a NO_ENCONTRADO: "no se pudo determinar" != "no existe". Sin PII. */
function Form_incierto_(codigo) {
  return { ok: true, estado: 'INCIERTO', incierto: true, codigo: codigo || 'INDETERMINADO' };
}

/** GAS: reserva del identificador antes de submit (estado RESERVED:<ts>).
 *  Solo se ejecuta bajo ScriptLock y con TTL corto (120 s). */
function Form_requestIdReservar_(clientRequestId, opciones) {
  opciones = opciones || {};
  var cfg = GOOGLE_FORMS_CONFIG.TRANSPORTE;
  var cache = Form_cache_();
  if (!clientRequestId || !cache) return { ok: true, conDedupe: false };
  try {
    var previo = cache.get(cfg.CACHE_PREFIJO + clientRequestId);
    if (previo) {
      if (previo.indexOf('RECEIVED:') === 0) {
        return { ok: true, estado: 'RECIBIDO', responseId: previo.slice('RECEIVED:'.length), yaRecibido: true };
      }
      if (previo.indexOf('RESERVED:') === 0) {
        var ts = Number(previo.slice('RESERVED:'.length)) || 0;
        if (Date.now() - ts < (cfg.TTL_RESERVADA_S * 1000 || 120000)) {
          return { ok: true, estado: 'EN_PROCESO' };
        }
      }
    }
    cache.put(cfg.CACHE_PREFIJO + clientRequestId, 'RESERVED:' + Date.now(), cfg.TTL_RESERVADA_S);
    return { ok: true, estado: 'RESERVADO' };
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e) };
  }
}

/** GAS: confirma la recepción durable (estado RECEIVED:<responseId>, TTL 6 h). */
function Form_requestIdConfirmar_(clientRequestId, responseId) {
  var cfg = GOOGLE_FORMS_CONFIG.TRANSPORTE;
  var cache = Form_cache_();
  if (!clientRequestId || !cache) return { ok: false };
  try {
    cache.put(cfg.CACHE_PREFIJO + clientRequestId, 'RECEIVED:' + String(responseId), cfg.TTL_RECIBIDA_S);
    return { ok: true };
  } catch (e) { return { ok: false, motivo: String(e && e.message || e) }; }
}

/** v256 (P0): resuelve la reserva de idempotencia ANTES de cualquier submit.
 *  Devuelve un estado concluyente:
 *   - RECIBIDO    → ya existe respuesta (dedupe).
 *   - EN_PROCESO  → reserva vigente.
 *   - RESERVADO   → reserva tomada; el llamador PUEDE enviar.
 *   - SERVICIO_OCUPADO → no se pudo garantizar la reserva; NO enviar.
 *  Nunca permite submit sin reserva cuando hay clientRequestId válido. */
function Form_reservarRequestIdConLock_(clientRequestId) {
  var lock = null;
  try {
    if (typeof LockService !== 'undefined') {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(500)) {
        // Sin serialización no se puede reservar de forma segura: sólo se
        // consulta el índice (read-only) para distinguir un duplicado evidente.
        var visto = Form_requestIdBuscar_(clientRequestId);
        if (visto.estado === 'RECIBIDO') return { estado: 'RECIBIDO', responseId: visto.responseId };
        if (visto.estado === 'EN_PROCESO') return { estado: 'EN_PROCESO' };
        return { estado: 'SERVICIO_OCUPADO', codigo: 'LOCK_BUSY' };
      }
    }
    var rsv = Form_requestIdReservar_(clientRequestId);
    if (rsv.yaRecibido) return { estado: 'RECIBIDO', responseId: rsv.responseId };
    if (rsv.estado === 'EN_PROCESO') return { estado: 'EN_PROCESO' };
    if (rsv.estado === 'RESERVADO') return { estado: 'RESERVADO' };
    return { estado: 'SERVICIO_OCUPADO', codigo: 'RESERVA_NO_DISPONIBLE' };
  } catch (e) {
    return { estado: 'SERVICIO_OCUPADO', codigo: 'RESERVA_FALLIDA' };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ }
  }
}

/** GAS: consulta del índice rápido del identificador. */
function Form_requestIdBuscar_(clientRequestId) {
  var cfg = GOOGLE_FORMS_CONFIG.TRANSPORTE;
  if (!clientRequestId) return { ok: true, estado: 'NO_ENCONTRADO' };
  var cache = Form_cache_();
  if (!cache) return Form_incierto_('CACHE_NO_DISPONIBLE');
  try {
    var valor = cache.get(cfg.CACHE_PREFIJO + clientRequestId);
    if (!valor) return { ok: true, estado: 'NO_ENCONTRADO' };
    if (valor.indexOf('RECEIVED:') === 0) {
      return { ok: true, estado: 'RECIBIDO', responseId: valor.slice('RECEIVED:'.length) };
    }
    if (valor.indexOf('RESERVED:') === 0) {
      var ts = Number(valor.slice('RESERVED:'.length)) || 0;
      if (Date.now() - ts < (cfg.TTL_RESERVADA_S * 1000 || 120000)) return { ok: true, estado: 'EN_PROCESO' };
      return { ok: true, estado: 'NO_ENCONTRADO' };
    }
    return { ok: true, estado: 'NO_ENCONTRADO' };
  } catch (e) { return Form_incierto_('CACHE_READ_FAILED'); }
}

/** GAS: recupera el ACK perdido escaneando SOLO respuestas recientes (máx. 6 h).
 *  Ubica CLIENT_REQUEST_ID, recupera el responseId y repuebla el cache.
 *  Salida sin PII: {ok, estado, responseId}. */
function Form_requestIdRecuperarRespuesta_(clientRequestId, opciones) {
  opciones = opciones || {};
  var formId = opciones.formId || Form_formId_();
  // Configuración ausente NO prueba ausencia de la respuesta (P0 v256).
  if (!formId) return Form_incierto_('FORM_NO_CONFIGURADO');
  var cfg = GOOGLE_FORMS_CONFIG.TRANSPORTE;
  var form = null;
  try { form = FormApp.openById(formId); } catch (e) { return Form_incierto_('FORM_NO_ACCESIBLE'); }
  var respuestas = null;
  try {
    respuestas = form.getResponses(new Date(Date.now() - cfg.ESCANEO_RECUPERACION_MS)) || [];
  } catch (e) { return Form_incierto_('FORM_RESPONSES_READ_FAILED'); }
  var itemMap = Form_json_(Form_propLeer_('GOOGLE_FORM_ITEM_MAP'));
  var titleMap = Form_json_(Form_propLeer_('GOOGLE_FORM_TITLE_MAP'));
  var omitidas = 0;
  for (var i = 0; i < respuestas.length; i++) {
    // Una respuesta individual defectuosa no debe convertir TODA la búsqueda en
    // ausencia: se omite esa fila (diagnóstico sin PII) y se continúa.
    var campos;
    try {
      campos = Form_extraerCampos_(respuestas[i], { itemMap: itemMap, titleMap: titleMap }).campos || {};
    } catch (eFila) { omitidas++; continue; }
    if (Utl_texto_(campos[cfg.CAMPO_CLIENT_REQUEST_ID]) === Utl_texto_(clientRequestId)) {
      var rid = '';
      try { rid = String(respuestas[i].getId()); } catch (e2) { rid = ''; }
      Form_requestIdConfirmar_(clientRequestId, rid);
      return { ok: true, estado: 'RECIBIDO', responseId: rid };
    }
  }
  // Consulta válida completada sin coincidencia: NO_ENCONTRADO (con diagnóstico
  // no-PII de filas ilegibles, si las hubo).
  return { ok: true, estado: 'NO_ENCONTRADO', omitidas: omitidas };
}

/** Entrypoint WebApp: verificación de recepción por identificador (ACK perdido).
 *  Ordinal: cache → escaneo acotado autoritativo → NO_ENCONTRADO. Si algún paso
 *  falla técnicamente, NUNCA se degrada a ausencia: se devuelve INCIERTO.
 *  Contrato público pequeño: {ok, estado, responseId?}. Nunca expone PII. */
function WebApp_verificarRecepcion(clientRequestId, acceso) {
  try {
    var cid = Utl_texto_(clientRequestId);
    if (!GOOGLE_FORMS_CONFIG.TRANSPORTE.PATRON_CLIENT_REQUEST_ID.test(cid)) {
      return { ok: false, estado: 'NO_ENCONTRADO' };
    }
    var directo = Form_requestIdBuscar_(cid);
    if (directo.estado === 'RECIBIDO') {
      var r1 = { ok: true, estado: 'RECIBIDO' };
      if (directo.responseId) r1.responseId = directo.responseId;
      return r1;
    }
    if (directo.estado === 'EN_PROCESO') return { ok: true, estado: 'EN_PROCESO' };
    // Cache no concluyente o ausente: fallback autoritativo al Form (durable).
    var recuperado = Form_requestIdRecuperarRespuesta_(cid);
    if (recuperado.estado === 'RECIBIDO') {
      var r2 = { ok: true, estado: 'RECIBIDO' };
      if (recuperado.responseId) r2.responseId = recuperado.responseId;
      return r2;
    }
    // NO_ENCONTRADO solo con evidencia suficiente: la consulta AUTORITATIVA al
    // Form se completó válidamente y no halló coincidencia. Un fallo de cache
    // (índice no autoritativo) no impide concluir ausencia una vez consultado el
    // Form; un fallo del Form sí es incertidumbre técnica (nunca ausencia).
    if (recuperado.estado === 'NO_ENCONTRADO') {
      return { ok: true, estado: 'NO_ENCONTRADO' };
    }
    return Form_incierto_(recuperado.codigo || directo.codigo || 'INDETERMINADO');
  } catch (e) {
    return Form_incierto_('VERIFICACION_FALLIDA');
  }
}

/** Campo SOURCE del transporte según el origen (v255). */
function Form_sourceSegunPayload_(payload) {
  var p = payload || {};
  var s = Utl_texto_(p.source).toUpperCase();
  if (s === GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_WEBAPP) return GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_WEBAPP;
  if (s === GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_GOOGLE_FORM_DIRECTO) return GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_GOOGLE_FORM_DIRECTO;
  return GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_WEBAPP;
}

/** GAS: id del Form vigente ('' en node/sin instalar). */
function Form_formId_() {
  return Form_propLeer_('GOOGLE_FORM_ID');
}

/** URL del respondedor del Form vigente ('' si no está instalado). */
function Form_urlRespondedor_() {
  return Form_propLeer_('GOOGLE_FORM_URL');
}

// ---------------------------------------------------------------------------
// INSTALACIÓN (idempotente)
// ---------------------------------------------------------------------------

/** PRIVADO (puro): nombres de las claves del esquema, en orden de creación. */
function Form_esquemaCanonial_() {
  var secciones = ['NUEVO_INGRESO', 'REGISTRAR_CONTROL', 'REGISTRAR_SEGUIMIENTO', 'ACTUALIZAR_DATOS'];
  var camposPorSeccion = {
    NUEVO_INGRESO: ['RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'SECTOR', 'FECHA_INGRESO', 'ESTRATIFICACION', 'SALUD_MENTAL', 'TELEFONOS', 'PROFESIONAL', 'PROFESIONAL2', 'PROXIMO_CONTROL', 'OBSERVACIONES'],
    REGISTRAR_CONTROL: ['RUT', 'FECHA_EVENTO', 'PROFESIONAL', 'PROFESIONAL2', 'PROXIMO_CONTROL', 'OBSERVACIONES'],
    REGISTRAR_SEGUIMIENTO: ['RUT', 'FECHA_EVENTO', 'PROFESIONAL', 'PROFESIONAL2', 'PROXIMO_CONTROL', 'OBSERVACIONES'],
    ACTUALIZAR_DATOS: ['RUT', 'TELEFONOS', 'TELEFONO_OBS', 'PROXIMO_CONTROL', 'SALUD_MENTAL', 'OBSERVACIONES', 'PROFESIONAL', 'PROFESIONAL2']
  };
  return { secciones: secciones, campos: camposPorSeccion };
}

/** PRIVADO (puro): etiqueta/ítems de opción del FormApp según el tipo. */
function Form_tipoItem_(campo) {
  if (campo === 'SEXO' || campo === 'SECTOR' || campo === 'ESTRATIFICACION' || campo === 'SALUD_MENTAL' || campo === 'PROFESIONAL' || campo === 'PROFESIONAL2') return 'LISTA';
  if (campo === 'FECHA_NACIMIENTO' || campo === 'FECHA_INGRESO' || campo === 'FECHA_EVENTO' || campo === 'PROXIMO_CONTROL') return 'FECHA';
  if (campo === 'OBSERVACIONES') return 'PARRAFO';
  return 'TEXTO';
}

/** GAS: construye o repara el esquema del Form. La identidad persistida por
 * itemId es prioritaria; los títulos solo sirven como fallback de instalación. */
function Form_claveCanonicaItem_(seccion, campo) {
  return (seccion ? String(seccion).toUpperCase() : 'GLOBAL') + '|' + String(campo).toUpperCase();
}

function Form_construirSchema_(form, opciones) {
  opciones = opciones || {};
  var cambios = [];
  var errores = [];
  var map = Form_esquemaCanonial_();
  var idx = Form_indexarSchema_(form);

  var CFG = GOOGLE_FORMS_CONFIG;
  function opcionesTipo(campo, oficiales) {
    if (campo === 'SECTOR') return oficiales.sectores || [];
    // v255 (E16/M10): PROFESIONAL2 recibe el MISMO catálogo normalizado/deduplicado.
    if (campo === 'PROFESIONAL' || campo === 'PROFESIONAL2') return oficiales.profesionales || [];
    return (CFG.CAMPOS[campo] && CFG.CAMPOS[campo].opciones) || [];
  }
  function establecerOpciones(item, valores, requerido) {
    var opciones = valores || [];
    if (!item) return false;
    // v255 (E17): setRequired es independiente de tener opciones; se aplica SIEMPRE.
    if (item.setRequired) item.setRequired(!!requerido);
    if (!opciones.length) return false;
    if (item.setChoices) {
      var chs = opciones.map(function (o) { return item.createChoice(String(o)); });
      item.setChoices(chs);
      return true;
    }
    return false;
  }

  // 1) Acción (navegación por secciones).
  var accionItem = idx.accionItem || form.addMultipleChoiceItem();
  accionItem.setTitle(CFG.ACCIONES.TITULO);
  accionItem.setHelpText('Elegí qué deseás registrar y luego completá la sección correspondiente.');
  accionItem.setRequired(true);
  if (!idx.accionItem) cambios.push('Item creado: ' + CFG.ACCIONES.TITULO);

  // 1b) Campos GLOBALes de transporte (no son datos clínicos; no vuelven al payload).
  var globales = [CFG.TRANSPORTE.CAMPO_CLIENT_REQUEST_ID, CFG.TRANSPORTE.CAMPO_SOURCE];
  globales.forEach(function (g) {
    var gKey = Form_claveCanonicaItem_('', g);
    var entradaG = idx.byCanonicalKey[gKey];
    var gItem = entradaG && entradaG.item;
    if (!gItem) {
      gItem = form.addTextItem();
      cambios.push('Campo creado (transporte): ' + g);
    }
    gItem.setTitle(g);
    try { gItem.setRequired(false); } catch (e) {}
  });

  // 2) Por sección: página + campos + cierre, en orden real.
  var paginas = {};
  map.secciones.forEach(function (sec) {
    var page = idx.pages[sec];
    if (!page) { page = form.addPageBreakItem().setTitle(sec); cambios.push('Sección creada: ' + sec); }
    paginas[sec] = page;

    map.campos[sec].forEach(function (campo) {
      var cfg = CFG.CAMPOS[campo] || { etiqueta: campo, opciones: [] };
      var titulo = cfg.etiqueta || campo;
      var requerido = Form_campoRequerido_(sec, campo);
      var tipo = Form_tipoItem_(campo);
      var entrada = idx.byCanonicalKey[Form_claveCanonicaItem_(sec, campo)];
      var it = entrada && entrada.item;
      if (!it) {
        try {
          if (tipo === 'LISTA') it = form.addListItem().setTitle(titulo);
          else if (tipo === 'FECHA') it = form.addDateItem().setTitle(titulo);
          else if (tipo === 'PARRAFO') it = form.addParagraphTextItem().setTitle(titulo);
          else it = form.addTextItem().setTitle(titulo);
          cambios.push('Campo creado: ' + campo);
        } catch (e) { return; }
      }
      if (tipo === 'LISTA') {
        var okOpciones = establecerOpciones(it, opcionesTipo(campo, opciones), requerido);
        // v255 (E17): una lista REQUERIDA sin opciones es error de instalación;
        // el instalador debe fallar en vez de publicar un schema inutilizable.
        if (requerido && !okOpciones) errores.push('CAMPO_REQUERIDO_SIN_OPCIONES:' + campo);
      } else if (it.setRequired) it.setRequired(requerido);
    });

    try { page.setGoToPage(FormApp.PageNavigationType.SUBMIT); } catch (e) { /* API no disponible en harness antiguo */ }
  });

  // Reescribe las cuatro rutas en forma determinista. Cada opción apunta a la
  // página de su acción y no conserva destinos obsoletos de instalaciones previas.
  var rutas = map.secciones.map(function (sec) {
    var et = CFG.ACCIONES.OPCIONES[sec] ? CFG.ACCIONES.OPCIONES[sec].etiqueta : sec;
    return accionItem.createChoice(et, paginas[sec]);
  });
  accionItem.setChoices(rutas);

  if (errores.length) {
    return { ok: false, motivo: 'INSTALL_REQUIRED_CATALOG_EMPTY', errores: errores, cambios: cambios };
  }

  return { ok: true, cambios: cambios };
}

/** GAS: abre el Form conocido. Crear requiere una opción deliberada y explícita. */
function Form_abrirOCrear_(formId, titulo, cambios, opciones) {
  opciones = opciones || {};
  if (formId) {
    try { return { ok: true, form: FormApp.openById(formId), creado: false }; }
    catch (e) { return { ok: false, motivo: 'FORM_CONOCIDO_NO_ACCESIBLE', formId: formId }; }
  }
  if (opciones.crearNuevo !== true) return { ok: false, motivo: 'FORM_ID_REQUIRED' };
  var f = null;
  try { f = FormApp.create(titulo || GOOGLE_FORMS_CONFIG.TITULO); } catch (e) { return { ok: false, motivo: 'FORM_APP_NO_DISPONIBLE' }; }
  try { f.setTitle(titulo || GOOGLE_FORMS_CONFIG.TITULO); } catch (e3) { /* seguir */ }
  cambios.push('Form creado: ' + (titulo || GOOGLE_FORMS_CONFIG.TITULO));
  return { ok: true, form: f, creado: true };
}

/** PRIVADO (puro): mapa título→campo y itemId→campo del schema instalado. */
function Form_mapaTitulos_() {
  var m = {};
  m[Utl_claveAlnum_(GOOGLE_FORMS_CONFIG.ACCIONES.TITULO)] = 'ACCION';
  // v255: los dos campos GLOBALes de transporte también se resuelven por título.
  m[Utl_claveAlnum_(GOOGLE_FORMS_CONFIG.TRANSPORTE.CAMPO_CLIENT_REQUEST_ID)] = 'CLIENT_REQUEST_ID';
  m[Utl_claveAlnum_(GOOGLE_FORMS_CONFIG.TRANSPORTE.CAMPO_SOURCE)] = 'SOURCE';
  Object.keys(GOOGLE_FORMS_CONFIG.CAMPOS).forEach(function (c) {
    m[Utl_claveAlnum_(GOOGLE_FORMS_CONFIG.CAMPOS[c].etiqueta || c)] = c;
  });
  return m;
}
function Form_itemMap_(form) {
  var out = {};
  var canonical = Form_construirCanonicalItemMap_(form);
  Object.keys(canonical).forEach(function (key) {
    var campo = key === 'GLOBAL|ACCION' ? 'ACCION' : key.split('|')[1];
    out[String(canonical[key])] = campo;
  });
  return out;
}

function Form_construirCanonicalItemMap_(form) {
  var idx = Form_indexarSchema_(form);
  var out = {};
  Object.keys(idx.byCanonicalKey).forEach(function (key) {
    try { out[key] = String(idx.byCanonicalKey[key].item.getId()); } catch (e) { /* sin id */ }
  });
  return out;
}

/** GAS: anexa al final de FORM_RESPUESTAS las columnas de transporte v255 que
 *  falten (CLIENT_REQUEST_ID, SOURCE, CLASIFICACION, TRANSPORTE_ERROR).
 *  Idempotente y de SOLO encabezado: nunca reescribe ni desplaza datos. */
/** v256 (P0): asegura las columnas del trailer. Con opciones.simular=true es
 *  ESTRICTAMENTE read-only (planifica sin escribir) y devuelve {pendientes}. */
function Form_asegurarColumnasTransporte255_(hoja, opciones) {
  opciones = opciones || {};
  if (!hoja) return { pendientes: [], aplicado: false };
  var extra = ['CLIENT_REQUEST_ID', 'SOURCE', 'CLASIFICACION', 'TRANSPORTE_ERROR'];
  var actuales = [];
  try { actuales = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0] || []; } catch (e) { return { pendientes: extra.slice(), aplicado: false, error: 'ENCABEZADO_NO_LEIBLE' }; }
  var claves = actuales.map(Utl_claveAlnum_);
  var pendientes = extra.filter(function (c) { return claves.indexOf(Utl_claveAlnum_(c)) === -1; });
  if (!pendientes.length) return { pendientes: [], aplicado: false };
  if (opciones.simular) return { pendientes: pendientes, aplicado: false, simulado: true };
  try {
    hoja.getRange(1, hoja.getLastColumn() + 1, 1, pendientes.length).setValues([pendientes]);
    return { pendientes: pendientes, aplicado: true };
  } catch (e) { return { pendientes: pendientes, aplicado: false, error: 'ESCRITURA_FALLIDA' }; }
}

/** DEDUP: nombres canónicos únicos y no vacíos de los profesionales activos. */
function Form_catalogoProfesionales_() {
  var prof = [];
  try { prof = (typeof Captura_v2_catalogo_ === 'function') ? Captura_v2_catalogo_() : []; } catch (e4) { prof = []; }
  var vistos = {};
  return prof.filter(function (p) { return p && p.ACTIVO !== false; })
    .map(function (p) { return String(p.NOMBRE_CANONICO || p.NOMBRE || p.nombre || p.CODIGO || '').trim(); })
    .filter(function (n) {
      if (!n || vistos[Utl_claveAlnum_(n)]) return false;
      vistos[Utl_claveAlnum_(n)] = true;
      return true;
    });
}

/** Títulos legacy del botón de envío de esquemas previos. 'Enviar respuesta'
 *  existió hasta 3d9dece; la auditoría debe detectar AMBOS, no solo 'Enviar'. */
var SUBMIT_LEGACY_TITLES = ['Enviar respuesta', 'Enviar'];

/** Determina si un schema existente puede repararse sin borrar respuestas. */
function Form_auditarSchema_(form) {
  var items = [];
  try { items = form.getItems() || []; } catch (e) { return { seguro: false, motivo: 'FORM_SCHEMA_REQUIRES_REVIEW' }; }
  if (!items.length) return { seguro: true, vacio: true, duplicadas: [] };
  var vistos = {}, paginas = {}, duplicadas = [], incompatibles = [], seccion = '';
  var tituloCampo = Form_mapaTitulos_();
  function tipoEsperado(campo) {
    var t = Form_tipoItem_(campo);
    if (t === 'LISTA') return String(FormApp.ItemType.LIST);
    if (t === 'FECHA') return String(FormApp.ItemType.DATE);
    if (t === 'PARRAFO') return String(FormApp.ItemType.PARAGRAPH_TEXT);
    return String(FormApp.ItemType.TEXT);
  }
  for (var i = 0; i < items.length; i++) {
    var it = items[i], titulo = String(it.getTitle() || ''), tipo = '';
    try { tipo = String(it.getType()); } catch (e2) { tipo = ''; }
    if (tipo === String(FormApp.ItemType.PAGE_BREAK)) {
      if (paginas[titulo]) duplicadas.push('PAGE|' + titulo);
      paginas[titulo] = true; seccion = titulo; continue;
    }
    var key = (seccion || 'GLOBAL') + '|' + titulo;
    if (vistos[key]) duplicadas.push(key);
    vistos[key] = true;
    var esperado = '';
    if (!seccion && titulo === GOOGLE_FORMS_CONFIG.ACCIONES.TITULO) esperado = String(FormApp.ItemType.MULTIPLE_CHOICE);
    else if (seccion && SUBMIT_LEGACY_TITLES.indexOf(titulo) !== -1) incompatibles.push(key + ':ITEM_ARTIFICIAL_OBSOLETO');
    else {
      var campo = tituloCampo[Utl_claveAlnum_(titulo)];
      if (campo && campo !== 'ACCION') esperado = tipoEsperado(campo);
    }
    if (esperado && tipo !== esperado) incompatibles.push(key + ':' + tipo + '!=' + esperado);
  }
  var seguro = duplicadas.length === 0 && incompatibles.length === 0;
  return { seguro: seguro, vacio: false, duplicadas: duplicadas, incompatibles: incompatibles,
    motivo: seguro ? '' : 'FORM_SCHEMA_REQUIRES_REVIEW' };
}

/** Reconstruye solo un Form sin respuestas; nunca elimina respuestas reales. */
function Form_reconstruirSiVacio_(form, auditoria, cambios) {
  if (auditoria.seguro) return { ok: true, reconstruido: false };
  var n = 0;
  try { n = (form.getResponses() || []).length; } catch (e) { n = -1; }
  if (n !== 0) return { ok: false, motivo: 'FORM_SCHEMA_REQUIRES_REVIEW',
    duplicadas: auditoria.duplicadas || [], incompatibles: auditoria.incompatibles || [] };
  var items = form.getItems().slice();
  for (var i = items.length - 1; i >= 0; i--) form.deleteItem(items[i]);
  cambios.push('Schema reconstruido de forma determinista (Form sin respuestas)');
  return { ok: true, reconstruido: true };
}

/** Deja exactamente un trigger rápido y un worker periódico. */
function Form_asegurarTriggers_(form, cambios) {
  var estado = { onFormSubmit: 0, worker: 0, creados: [] };
  if (typeof ScriptApp === 'undefined') return estado;
  var triggers = ScriptApp.getProjectTriggers() || [];
  function asegurar(handler, crear) {
    var hallados = triggers.filter(function (t) { return t.getHandlerFunction() === handler; });
    for (var i = 1; i < hallados.length; i++) ScriptApp.deleteTrigger(hallados[i]);
    if (!hallados.length) {
      crear();
      estado.creados.push(handler);
      cambios.push('Trigger creado: ' + handler);
      return 1;
    }
    if (hallados.length > 1) cambios.push('Triggers duplicados eliminados: ' + handler);
    return 1;
  }
  estado.onFormSubmit = asegurar('Form_onFormSubmit_', function () {
    ScriptApp.newTrigger('Form_onFormSubmit_').forForm(form).onFormSubmit().create();
  });
  estado.worker = asegurar('Form_worker_', function () {
    ScriptApp.newTrigger('Form_worker_').timeBased().everyMinutes(5).create();
  });
  return estado;
}

/**
 * GAS: instalador del canal Google Forms — idempotente.
 * Crea/arregla: hoja FORM_RESPUESTAS (28 columnas + transporte) → Form y schema
 * → propiedades operativas → trigger onFormSubmit → catálogos.
 * Invocable repetidamente sin duplicar nada.
 */
function Form_operativoInstalar_(opciones) {
  opciones = opciones || {};
  if (typeof FormApp === 'undefined' || typeof SpreadsheetApp === 'undefined') {
    return { ok: false, motivo: 'SOLO_GAS' };
  }
  var cambios = [];

  // 1) Hoja técnica + esquema de columnas (migración idempotente incluida).
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.FORM_RESPUESTAS);
  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.FORM_RESPUESTAS);
    try { hoja.hideSheet(); } catch (e) { /* no crítico */ }
    cambios.push('Hoja FORM_RESPUESTAS creada');
  }
  if (!hoja.getLastColumn()) {
    hoja.getRange(1, 1, 1, Form_columnas_().length).setValues([Form_columnas_()]);
    cambios.push('Encabezados FORM_RESPUESTAS creados (' + Form_columnas_().length + ' columnas)');
  } else {
    var antes = hoja.getLastColumn();
    if (typeof Captura_v2_asegurarColumnasTransporte_ === 'function') Captura_v2_asegurarColumnasTransporte_(hoja);
    Form_asegurarColumnasTransporte255_(hoja);
    if (hoja.getLastColumn() > antes) cambios.push('Columnas de transporte anexadas');
  }
  try {
    var encFisico = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var clavesReales = encFisico.map(Utl_claveAlnum_);
    var requieridas = Form_columnas_().map(function (c) { return Utl_claveAlnum_(c); });
    var faltan = requieridas.filter(function (c) { return clavesReales.indexOf(c) === -1; });
    var duplicadas = requieridas.filter(function (c) { return clavesReales.filter(function (x) { return x === c; }).length > 1; });
    if (faltan.length || duplicadas.length) {
      return { ok: false, motivo: 'ESQUEMA_CAPTURA_REQUIERE_REVISION', cambios: cambios, faltan: faltan, duplicadas: duplicadas };
    }
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e), cambios: cambios };
  }

  // 2) Form + schema.
  var formIdSolicitado = String(opciones.formId || Form_formId_() || '').trim();
  var abierto = Form_abrirOCrear_(formIdSolicitado, GOOGLE_FORMS_CONFIG.TITULO, cambios, {
    crearNuevo: opciones.crearNuevo === true && opciones.adoptarExistente !== true
  });
  if (!abierto.ok) return abierto;
  var form = abierto.form;
  try {
    form.setTitle(GOOGLE_FORMS_CONFIG.TITULO);
    form.setDescription(GOOGLE_FORMS_CONFIG.BIENVENIDA);
    form.setConfirmationMessage(GOOGLE_FORMS_CONFIG.CONFIRMACION);
    form.setShowLinkToRespondAgain(true);
    form.setRequireLogin(false);
    form.setAllowResponseEdits(false);
    try { form.setCollectEmail(false); } catch (e) { /* opcional */ }
    try { form.setIsQuiz(false); } catch (e) { /* opcional */ }
  } catch (e) { /* opcional según permisos */ }

  // v260: publicación explícita del Form interno. Si la API existe y falla, la
  // instalación falla cerrado: un Form sin publicar no es transporte válido.
  if (typeof form.setPublished === 'function') {
    try { form.setPublished(true); }
    catch (ePub) { return { ok: false, motivo: 'FORM_PUBLISH_FAILED', formId: form.getId(), respuestasConservadas: true, cambios: cambios }; }
  }
  if (typeof form.setAcceptingResponses === 'function') {
    try { form.setAcceptingResponses(true); }
    catch (eAcc) { return { ok: false, motivo: 'FORM_ACCEPTING_RESPONSES_FAILED', formId: form.getId(), respuestasConservadas: true, cambios: cambios }; }
  }

  var auditoriaSchema = Form_auditarSchema_(form);
  var migracionSchema = Form_reconstruirSiVacio_(form, auditoriaSchema, cambios);
  if (!migracionSchema.ok) return {
    ok: false, motivo: migracionSchema.motivo, formId: form.getId(),
    respuestasConservadas: true, duplicadas: migracionSchema.duplicadas || [],
    incompatibles: migracionSchema.incompatibles || [], cambios: cambios
  };

  // Catálogo UNA sola lectura (M10): sectores + profesionales normalizados y
  // deduplicados, aplicado a PROFESIONAL y PROFESIONAL2 por igual.
  var catOpciones = { sectores: [], profesionales: [] };
  try { catOpciones.sectores = (typeof SECTORES_RESPONSABLES !== 'undefined') ? SECTORES_RESPONSABLES.slice() : []; } catch (e3) { catOpciones.sectores = []; }
  catOpciones.profesionales = Form_catalogoProfesionales_();

  var schema = Form_construirSchema_(form, catOpciones);
  if (!schema.ok) {
    return { ok: false, motivo: schema.motivo || 'INSTALL_CATALOG_FAILED',
      errores: schema.errores || [], cambios: cambios, formId: form.getId() };
  }
  cambios = cambios.concat(schema.cambios || []);

  // 3) Propiedades operativas.
  var itemMap = Form_itemMap_(form);
  var canonicalMap = Form_construirCanonicalItemMap_(form);
  var urlResp = '', urlEdit = '';
  try { urlResp = form.getPublishedUrl(); } catch (e) { urlResp = ''; }
  try { urlEdit = form.getEditUrl(); } catch (e) { urlEdit = ''; }

  Form_propEscribir_('GOOGLE_FORM_ID', form.getId());
  Form_propEscribir_('GOOGLE_FORM_URL', urlResp);
  Form_propEscribir_('GOOGLE_FORM_EDIT_URL', urlEdit);
  Form_propEscribir_('GOOGLE_FORM_SCHEMA_VERSION', GOOGLE_FORMS_CONFIG.SCHEMA_VERSION);
  Form_propEscribir_('GOOGLE_FORM_ITEM_MAP', JSON.stringify(itemMap));
  Form_propEscribir_('GOOGLE_FORM_CANONICAL_ITEM_MAP', JSON.stringify(canonicalMap));
  Form_propEscribir_('GOOGLE_FORM_TITLE_MAP', JSON.stringify(Form_mapaTitulos_()));
  Form_propEscribir_('GOOGLE_FORM_ESTADO', 'INSTALADO');
  if (!Form_propLeer_('GOOGLE_FORM_CURSOR')) Form_propEscribir_('GOOGLE_FORM_CURSOR', '');

  // 4) Trigger rápido + worker durable (exactamente uno de cada handler).
  var trigger = { onFormSubmit: 0, worker: 0, creados: [] };
  try { trigger = Form_asegurarTriggers_(form, cambios); }
  catch (e5) { trigger.motivo = String(e5 && e5.message || e5); }

  // 5) Catálogos del Form (opciones).
  var catalogoRes = Form_syncCatalogos_({ form: form, catalogo: catOpciones });
  cambios = cambios.concat(catalogoRes.cambios || []);

  // 6) v255 fail-closed (E15): NUNCA ok:true degradado. Exigir worker trigger,
  //    catálogo OK y profesionales > 0 y canonical map completo antes de éxito.
  var faltanCanonical = Form_esquemaCanonial_().secciones.some(function (sec) {
    return Form_esquemaCanonial_().campos[sec].some(function (campo) {
      return !canonicalMap[Form_claveCanonicaItem_(sec, campo)];
    });
  });
  if ((trigger.onFormSubmit || 0) !== 1) {
    return { ok: false, motivo: 'INSTALL_SUBMIT_TRIGGER_FAILED', cambios: cambios, trigger: trigger };
  }
  if ((trigger.worker || 0) !== 1) {
    return { ok: false, motivo: 'INSTALL_WORKER_FAILED', cambios: cambios, trigger: trigger };
  }
  if (!catalogoRes.ok || !catalogoRes.okTodas) {
    return { ok: false, motivo: 'INSTALL_CATALOG_FAILED', cambios: cambios, catalogoRes: catalogoRes };
  }
  if (!(catOpciones.profesionales || []).length) {
    return { ok: false, motivo: 'INSTALL_REQUIRED_CATALOG_EMPTY', cambios: cambios };
  }
  if (faltanCanonical) {
    return { ok: false, motivo: 'INSTALL_CANONICAL_MAP_INCOMPLETO', cambios: cambios };
  }

  return {
    ok: true, motivo: 'INSTALADO', creado: abierto.creado,
    formId: form.getId(), url: urlResp, editUrl: urlEdit,
    schemaVersion: GOOGLE_FORMS_CONFIG.SCHEMA_VERSION,
    cambios: cambios, trigger: trigger, schemaReconstruido: migracionSchema.reconstruido,
    catalogo: { sectores: (catOpciones.sectores || []).length, profesionales: (catOpciones.profesionales || []).length },
    nota: 'Google Forms instalado como transporte durable interno de CapturaWeb (DEC-106).'
  };
}

/** GAS: sincroniza las opciones de los items CATALOGABLES desde las fuentes
 *  oficiales. v255 (E18): resuelve por GOOGLE_FORM_CANONICAL_ITEM_MAP (itemId),
 *  NUNCA por títulos; el título queda solo como fallback de reparación. */
function Form_syncCatalogos_(opciones) {
  opciones = opciones || {};
  var cambios = [];
  var form = opciones.form;
  if (!form && typeof FormApp !== 'undefined') {
    var fid = Form_formId_();
    if (!fid) return { ok: false, motivo: 'NO_INSTALADO', cambios: cambios };
    try { form = FormApp.openById(fid); } catch (e) { return { ok: false, motivo: 'FORM_NO_ACCESIBLE', cambios: cambios }; }
  }
  if (!form) return { ok: false, motivo: 'SOLO_GAS', cambios: cambios };

  var catalogo = opciones.catalogo || {};
  var sectores = (Array.isArray(catalogo.sectores) && catalogo.sectores.length)
    ? catalogo.sectores : ((typeof SECTORES_RESPONSABLES !== 'undefined') ? SECTORES_RESPONSABLES : []);
  var nombresProf = (Array.isArray(catalogo.profesionales) && catalogo.profesionales.length)
    ? catalogo.profesionales : Form_catalogoProfesionales_();

  var simular = !!opciones.simular;
  var idx = Form_indexarSchema_(form);
  var hit = 0, fallos = [];
  var fuentes = ['SECTOR', 'PROFESIONAL', 'PROFESIONAL2'];
  // v256 (P0): en modo simular NUNCA se llama setChoices; solo se planifica.
  function aplicar(it, valores) {
    if (simular) {
      var deseados = valores.map(String);
      var actuales = [];
      try { actuales = (it.getChoices() || []).map(function (c) { return String(c.getValue()); }); } catch (e2) { actuales = []; }
      return deseados.join('\u0001') !== actuales.join('\u0001');
    }
    it.setChoices(valores.map(function (o) { return it.createChoice(String(o)); }));
    return true;
  }
  fuentes.forEach(function (campo) {
    var valores = campo === 'SECTOR' ? sectores : nombresProf;
    var resuelto = false;
    Form_esquemaCanonial_().secciones.forEach(function (sec) {
      var entrada = idx.byCanonicalKey[Form_claveCanonicaItem_(sec, campo)];
      if (!entrada || !entrada.item) return;
      var it = entrada.item;
      if (!valores.length || !it.setChoices) resuelto = true; // existe pero sin cambios aplicables
      else if (aplicar(it, valores)) { cambios.push((simular ? 'Catálogo requiere cambio: ' : 'Catálogo aplicado: ') + campo + ' (' + valores.length + ')'); resuelto = true; }
      else resuelto = true; // ya coincide
    });
    if (resuelto) hit++;
    else fallos.push(campo);
  });
  // fallback de reparación por título SOLO si el mapa canónico no resolvió.
  if (fallos.length) {
    try {
      form.getItems().forEach(function (it) {
        var t = it.getTitle();
        var campo = null;
        if (t === GOOGLE_FORMS_CONFIG.CAMPOS.SECTOR.etiqueta) campo = 'SECTOR';
        else if (t === GOOGLE_FORMS_CONFIG.CAMPOS.PROFESIONAL.etiqueta) campo = 'PROFESIONAL';
        else if (t === (GOOGLE_FORMS_CONFIG.CAMPOS.PROFESIONAL2 && GOOGLE_FORMS_CONFIG.CAMPOS.PROFESIONAL2.etiqueta)) campo = 'PROFESIONAL2';
        if (!campo || fuentes.indexOf(campo) === -1 || fallos.indexOf(campo) === -1) return;
        var valores = campo === 'SECTOR' ? sectores : nombresProf;
        if (!valores.length || !it.setChoices) return;
        if (aplicar(it, valores)) cambios.push((simular ? 'Catálogo requiere cambio (reparación por título): ' : 'Catálogo aplicado (reparación por título): ') + t);
      });
    } catch (e) {
      return { ok: false, motivo: String(e && e.message || e), cambios: cambios, sectores: sectores.length, profesionales: nombresProf.length };
    }
  }
  return {
    ok: true, okTodas: hit + fallos.length === fuentes.length, simulado: simular,
    cambios: cambios, sectores: sectores.length, profesionales: nombresProf.length, camposAplicados: hit
  };
}

// ---------------------------------------------------------------------------
// EXTRACCIÓN DE RESPUESTAS → campos canónicos
// ---------------------------------------------------------------------------

/** PURA: extrae {accion, campos{canónico}} de un response del Form.
 *  Usa el itemMap por id y el titleMap por título (fallback). */
function Form_extraerCampos_(response, opciones) {
  opciones = opciones || {};
  var itemMap = opciones.itemMap || {};
  var titleMap = opciones.titleMap || {};
  var campos = {}, accion = '';
  var itemResponses = [];
  try { itemResponses = response.getItemResponses() || []; } catch (e) { itemResponses = []; }
  for (var i = 0; i < itemResponses.length; i++) {
    var ir = itemResponses[i];
    var item = null;
    try { item = ir.getItem(); } catch (e) { item = null; }
    var campo = '';
    if (item) {
      var id = '';
      var titulo = '';
      try { id = String(item.getId()); } catch (e2) { id = ''; }
      try { titulo = item.getTitle(); } catch (e3) { titulo = ''; }
      campo = itemMap[id] || titleMap[Utl_claveAlnum_(titulo)] || '';
    }
    if (!campo) continue;
    var raw = '';
    try {
      var r = ir.getResponse();
      if (Array.isArray(r)) raw = r.join('\n');
      else if (r && Object.prototype.toString.call(r) === '[object Date]') {
        raw = r.getFullYear() + '-' + String(r.getMonth() + 1).padStart(2, '0') + '-' + String(r.getDate()).padStart(2, '0');
      } else raw = String(r === null ? '' : r);
    } catch (e4) { raw = ''; }
    if (campo === 'ACCION') {
      var leg = GOOGLE_FORMS_CONFIG.ACCIONES.OPCIONES;
      var hallada = '';
      Object.keys(leg).forEach(function (k) { if (leg[k].etiqueta === String(raw).trim()) hallada = leg[k].clave; });
      accion = hallada || String(raw).trim();
    } else {
      campos[campo] = raw;
    }
  }
  return { accion: accion, campos: campos };
}

// ---------------------------------------------------------------------------
// INGESTA: trigger y cola
// ---------------------------------------------------------------------------

/** GAS: hoja técnica de la cola (Modelo_hoja_ con fallback a SpreadsheetApp).
 *  Devuelve null en contextos sin acceso (node). */
function Form_hojaRespuetas_() {
  try { if (typeof Modelo_hoja_ === 'function') return Modelo_hoja_(HOJAS.FORM_RESPUESTAS); } catch (e) { /* n/d */ }
  try {
    if (typeof SpreadsheetApp !== 'undefined') {
      return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS.FORM_RESPUESTAS);
    }
  } catch (e2) { /* n/d */ }
  return null;
}

var FORM_LEGACY_TRAILER_COLUMNAS = ['CAPTURE_PROVIDER', 'TRANSPORT_RESPONSE_ID',
  'CLIENT_REQUEST_ID', 'SOURCE', 'CLASIFICACION', 'TRANSPORTE_ERROR'];

/** PURA: identidad inequívoca de una fila anterior a Google Forms. */
function Form_esFilaLegacy_(fila) {
  var estado = Form_estadoFilaLegacy_(fila);
  return estado === 'LEGACY_UNMIGRATED' || estado === 'LEGACY_PARTIAL' || estado === 'LEGACY_COMPLETE';
}

function Form_estadoFilaLegacy_(fila) {
  fila = fila || {};
  var rid = String(fila.RESPONSE_ID || '').trim();
  if (!/^Cp[234]-[0-9a-f]{32}$/.test(rid)) return /^Cp[234]-/.test(rid) ? 'LEGACY_AMBIGUOUS' : 'NOT_LEGACY';
  var provider = String(fila.CAPTURE_PROVIDER || '').trim().toUpperCase();
  var transport = String(fila.TRANSPORT_RESPONSE_ID || '').trim();
  var client = String(fila.CLIENT_REQUEST_ID || '').trim();
  if (provider === CAPTURA_INGESTA_PROVIDERS.GOOGLE_FORMS && transport) return 'NOT_LEGACY';
  if (!provider && !transport && !client) return 'LEGACY_UNMIGRATED';
  if (provider !== CAPTURA_INGESTA_PROVIDERS.WEBAPP_LEGACY || transport || client) return 'LEGACY_AMBIGUOUS';
  var plan = Form_planTrailerLegacyPorEstado_(fila.ESTADO);
  return Form_legacyTrailerCompleto_(fila, plan) ? 'LEGACY_COMPLETE' : 'LEGACY_PARTIAL';
}

function Form_planTrailerLegacyPorEstado_(estadoRaw) {
  var estado = String(estadoRaw || '').trim().toUpperCase();
  var clasificacion = 'REVIEW', error = [];
  if (estado === 'PROCESADO') clasificacion = 'TERMINAL';
  else if (estado === 'REQUIERE_REVISION') error = [{ codigo: 'LEGACY_REQUIERE_REVISION' }];
  else if (estado === 'RECIBIDO' || estado === 'ERROR') error = [{ codigo: 'LEGACY_RECONCILIATION_REQUIRED', estado: estado }];
  else error = [{ codigo: 'LEGACY_STATE_UNKNOWN' }];
  return { estado: estado, valores: {
    CAPTURE_PROVIDER: CAPTURA_INGESTA_PROVIDERS.WEBAPP_LEGACY,
    TRANSPORT_RESPONSE_ID: '', CLIENT_REQUEST_ID: '',
    SOURCE: GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_LEGACY_PRE_FORMS,
    CLASIFICACION: clasificacion, TRANSPORTE_ERROR: JSON.stringify(error)
  } };
}

function Form_legacyTrailerCompleto_(fila, plan) {
  fila = fila || {}; plan = plan || Form_planTrailerLegacyPorEstado_(fila.ESTADO);
  var v = plan.valores || {};
  if (String(fila.CAPTURE_PROVIDER || '').trim().toUpperCase() !== v.CAPTURE_PROVIDER) return false;
  if (String(fila.TRANSPORT_RESPONSE_ID || '').trim() !== String(v.TRANSPORT_RESPONSE_ID || '')) return false;
  if (String(fila.CLIENT_REQUEST_ID || '').trim() !== String(v.CLIENT_REQUEST_ID || '')) return false;
  if (String(fila.SOURCE || '').trim().toUpperCase() !== v.SOURCE) return false;
  if (String(fila.CLASIFICACION || '').trim().toUpperCase() !== v.CLASIFICACION) return false;
  var actual, esperado;
  try { actual = JSON.parse(String(fila.TRANSPORTE_ERROR || '')); esperado = JSON.parse(v.TRANSPORTE_ERROR); }
  catch (e) { return false; }
  if (!Array.isArray(actual) || actual.length !== esperado.length) return false;
  for (var i = 0; i < esperado.length; i++) {
    if (!actual[i] || String(actual[i].codigo || '') !== esperado[i].codigo) return false;
    if (String(actual[i].estado || '') !== String(esperado[i].estado || '')) return false;
    if (Object.keys(actual[i]).some(function (k) { return ['codigo', 'estado'].indexOf(k) === -1; })) return false;
  }
  return true;
}

/** PURA: plan conservador; solo devuelve valores técnicos sin PII. */
function Form_planMigracionLegacy_(fila) {
  fila = fila || {};
  var tipo = Form_estadoFilaLegacy_(fila);
  if (tipo === 'NOT_LEGACY') return { legacy: false, ambiguo: false, tipo: tipo };
  if (tipo === 'LEGACY_AMBIGUOUS') return { legacy: false, ambiguo: true, tipo: tipo };
  var plan = Form_planTrailerLegacyPorEstado_(fila.ESTADO);
  plan.legacy = true; plan.tipo = tipo;
  return plan;
}

function Form_filaPorMapa_(encabezados, valores) {
  var o = {};
  for (var i = 0; i < encabezados.length; i++) o[String(encabezados[i] || '').trim()] = valores[i];
  return o;
}

/** v259: completa únicamente el trailer moderno de filas legacy. DEFAULT
 *  dry-run. No crea columnas ni reintenta capturas históricas. */
function Form_migrarTrailerLegacy_(opciones) {
  opciones = opciones || {};
  var dryRun = opciones.dryRun !== false;
  var hoja = opciones.hoja || Form_hojaRespuetas_();
  var out = { ok: true, dryRun: dryRun, totalFilas: 0, legacyDetectadas: 0,
    legacyParciales: 0, legacyCompletas: 0, filasAplicadas: 0,
    terminal: 0, review: 0, cambios: 0, ambiguas: 0,
    estados: { PROCESADO: 0, REQUIERE_REVISION: 0, RECIBIDO: 0, ERROR: 0, OTROS: 0 },
    requiereColumnas: [] };
  if (!hoja) return out;
  var cols = hoja.getLastColumn(), rows = hoja.getLastRow();
  if (!cols || rows < 2) return out;
  var enc = hoja.getRange(1, 1, 1, cols).getValues()[0] || [];
  var pos = {};
  for (var i = 0; i < enc.length; i++) pos[String(enc[i] || '').trim()] = i;
  out.requiereColumnas = FORM_LEGACY_TRAILER_COLUMNAS.filter(function (c) { return pos[c] === undefined; });
  var inicioTrailer = pos[FORM_LEGACY_TRAILER_COLUMNAS[0]];
  var layoutSeguro = out.requiereColumnas.length === 0 && FORM_LEGACY_TRAILER_COLUMNAS.every(function (c, ix) { return pos[c] === inicioTrailer + ix; });
  var datos = hoja.getRange(2, 1, rows - 1, cols).getValues();
  out.totalFilas = datos.length;
  var planes = [];
  for (var r = 0; r < datos.length; r++) {
    var obj = Form_filaPorMapa_(enc, datos[r]);
    var plan = Form_planMigracionLegacy_(obj);
    if (!plan.legacy) { if (plan.ambiguo) out.ambiguas++; continue; }
    out.legacyDetectadas++;
    if (plan.tipo === 'LEGACY_PARTIAL') out.legacyParciales++;
    if (plan.tipo === 'LEGACY_COMPLETE') out.legacyCompletas++;
    var ek = Object.prototype.hasOwnProperty.call(out.estados, plan.estado) ? plan.estado : 'OTROS';
    out.estados[ek]++;
    if (plan.valores.CLASIFICACION === 'TERMINAL') out.terminal++; else out.review++;
    if (plan.tipo !== 'LEGACY_COMPLETE') planes.push({ fila: r + 2, original: obj, plan: plan });
  }
  if (dryRun) return out;
  if (out.requiereColumnas.length) { out.ok = false; out.motivo = 'LEGACY_TRAILER_COLUMNS_REQUIRED'; return out; }
  if (!layoutSeguro) { out.ok = false; out.motivo = 'LEGACY_TRAILER_LAYOUT_UNSAFE'; return out; }
  var ventana = Operacion_ventanaActivacionAbierta_();
  if (!ventana.ok) { out.ok = false; out.motivo = ventana.motivo; return out; }
  if (out.ambiguas) { out.ok = false; out.motivo = 'LEGACY_IDENTITY_AMBIGUOUS'; return out; }
  try {
    for (var p = 0; p < planes.length; p++) {
      var item = planes[p];
      var bloque = FORM_LEGACY_TRAILER_COLUMNAS.map(function (nombre) { return item.plan.valores[nombre]; });
      var diferencias = FORM_LEGACY_TRAILER_COLUMNAS.filter(function (nombre, ix) {
        return String(item.original[nombre] === undefined ? '' : item.original[nombre]) !== String(bloque[ix]);
      }).length;
      if (!diferencias) continue;
      hoja.getRange(item.fila, inicioTrailer + 1, 1, FORM_LEGACY_TRAILER_COLUMNAS.length).setValues([bloque]);
      out.filasAplicadas++; out.cambios += diferencias;
      var verFila = hoja.getRange(item.fila, 1, 1, cols).getValues()[0] || [];
      if (!Form_legacyTrailerCompleto_(Form_filaPorMapa_(enc, verFila), item.plan)) {
        out.ok = false; out.motivo = 'LEGACY_TRAILER_WRITE_VERIFY_FAILED'; return out;
      }
    }
  } catch (e) {
    out.ok = false; out.motivo = 'LEGACY_TRAILER_WRITE_VERIFY_FAILED';
  }
  return out;
}

/** Resumen agregado del legado, antes o después de completar su trailer. */
function Form_resumenLegacy_(estados) {
  var out = { total: 0, terminal: 0, review: 0, unresolved: 0 };
  (estados || new Map()).forEach(function (reg) {
    if (!reg.legacy) return;
    out.total++;
    var cls = String(reg.clasificacion || '').toUpperCase();
    var est = String(reg.estado || '').toUpperCase();
    if (cls === 'TERMINAL' || est === 'PROCESADO') out.terminal++;
    else { out.review++; if (est === 'RECIBIDO' || est === 'ERROR' || !est) out.unresolved++; }
  });
  return out;
}

/** Read-only: índice agregado de ID_EVENTO, sin conservar otras columnas. */
function Form_eventosIdsExistentes_() {
  var ids = {};
  try {
    var hoja = typeof Modelo_hoja_ === 'function' ? Modelo_hoja_(HOJAS.EVENTOS) : null;
    var hr = typeof Modelo_headerRow_ === 'function' ? Modelo_headerRow_(HOJAS.EVENTOS) : 1;
    if (!hoja || hoja.getLastRow() <= hr) return ids;
    var cols = hoja.getLastColumn();
    var enc = hoja.getRange(hr, 1, 1, cols).getValues()[0] || [];
    var ix = enc.map(function (x) { return String(x || '').trim().toUpperCase(); }).indexOf('ID_EVENTO');
    if (ix < 0) return ids;
    var valores = hoja.getRange(hr + 1, ix + 1, hoja.getLastRow() - hr, 1).getValues();
    for (var i = 0; i < valores.length; i++) {
      var id = String(valores[i][0] || '').trim(); if (id) ids[id] = true;
    }
  } catch (e) { return {}; }
  return ids;
}

/** GAS: lee UNA sola vez los estados actuales de la cola técnica.
 *  → Map<captureId,{filaFisica,estado,clasificacion,fechaForms}>.
 *  v255 (E13/E14): la clasificación (REVIEW/RETRYABLE/TERMINAL) se lee del
 *  trailer; nada de ScriptProperties por response. */
/** v256 (P0/P1): lee el estado de la cola desde el trailer. Devuelve
 *  {ok, estados:Map, motivo}. ok:false significa QUE NO SE PUDO LEER (nunca
 *  "cola vacía"): el worker NO debe asumir que todo es elegible. */
function Form_leerEstadosCola_() {
  var estados = new Map();
  var hoja = Form_hojaRespuetas_();
  // Hoja ausente = canal no instalado: no es un fallo de lectura.
  if (!hoja) return { ok: true, estados: estados };
  try {
    var ultC = (typeof hoja.getLastColumn === 'function') ? hoja.getLastColumn() : 0;
    var ultR = (typeof hoja.getLastRow === 'function') ? hoja.getLastRow() : 0;
    if (!ultC || !ultR || ultR < 2) return { ok: true, estados: estados };
    var enc = hoja.getRange(1, 1, 1, ultC).getValues()[0] || [];
    var mapa = {};
    for (var i = 0; i < enc.length; i++) mapa[Utl_claveAlnum_(enc[i])] = i;
    var colRid = mapa[Utl_claveAlnum_('RESPONSE_ID')];
    var colEst = mapa[Utl_claveAlnum_('ESTADO')];
    var colCls = mapa[Utl_claveAlnum_('CLASIFICACION')];
    var colErr = mapa[Utl_claveAlnum_('TRANSPORTE_ERROR')];
    var colFecha = mapa[Utl_claveAlnum_('FECHA_FORMS')];
    var colProvider = mapa[Utl_claveAlnum_('CAPTURE_PROVIDER')];
    var colTransport = mapa[Utl_claveAlnum_('TRANSPORT_RESPONSE_ID')];
    var colClient = mapa[Utl_claveAlnum_('CLIENT_REQUEST_ID')];
    var colSource = mapa[Utl_claveAlnum_('SOURCE')];
    if (colRid === undefined) return { ok: true, estados: estados };
    var datos = hoja.getRange(2, 1, ultR - 1, ultC).getValues();
    for (var r = 0; r < datos.length; r++) {
      var fila = datos[r];
      var cid = fila[colRid] === undefined || fila[colRid] === null ? '' : String(fila[colRid]).trim();
      var clave = Utl_claveAlnum_(cid);
      if (!cid || clave === 'RESPONSEID' || clave === 'RESPONSE_ID') continue;
      var provider = colProvider !== undefined ? Utl_texto_(fila[colProvider]).toUpperCase() : '';
      var transportId = colTransport !== undefined ? Utl_texto_(fila[colTransport]) : '';
      var clientId = colClient !== undefined ? Utl_texto_(fila[colClient]) : '';
      var source = colSource !== undefined ? Utl_texto_(fila[colSource]) : '';
      estados.set(cid, {
        filaFisica: r + 2,
        estado: colEst !== undefined ? Utl_texto_(fila[colEst]).toUpperCase() : '',
        clasificacion: colCls !== undefined ? Utl_texto_(fila[colCls]).toUpperCase() : '',
        transporteError: colErr !== undefined ? Utl_texto_(fila[colErr]) : '',
        fechaForms: colFecha !== undefined ? Utl_texto_(fila[colFecha]) : '',
        captureProvider: provider, transportResponseId: transportId, source: source,
        legacy: Form_esFilaLegacy_({ RESPONSE_ID: cid, CAPTURE_PROVIDER: provider,
          TRANSPORT_RESPONSE_ID: transportId, CLIENT_REQUEST_ID: clientId }) ||
          provider === CAPTURA_INGESTA_PROVIDERS.WEBAPP_LEGACY
      });
    }
  } catch (e) {
    return { ok: false, motivo: 'QUEUE_STATE_READ_FAILED', estados: estados };
  }
  return { ok: true, estados: estados };
}

/** v255 (E13): ¿un estado del trailer es elegible para el worker?
 *  Ausente/retryable → true. PROCESADO/REVIEW/TERMINAL/REQUIERE_REVISION → false. */
function Form_esElegibleCandidato_(estadoReg) {
  if (!estadoReg) return true;
  var cls = String(estadoReg.clasificacion || '').toUpperCase();
  if (cls === 'REVIEW' || cls === 'TERMINAL') return false;
  var est = String(estadoReg.estado || '').toUpperCase();
  if (est === 'PROCESADO' || est === 'REQUIERE_REVISION') return false;
  return true;
}

/** GAS: persiste clasificación durable + errores en el trailer de la fila.
 *  E14: los errores por response van a TRANSPORTE_ERROR de la hoja, no a
 *  ScriptProperties. Nunca reescribe columnas ajenas. */
function Form_escribirClasificacionTrailer_(filaFisica, clasificacion, errores) {
  try {
    var hoja = Form_hojaRespuetas_();
    // Sin fila física no hay nada que persistir: no es un fallo, es una omisión.
    if (!hoja || !filaFisica) return { ok: true, omitido: true };
    var ultC = (typeof hoja.getLastColumn === 'function') ? hoja.getLastColumn() : 0;
    var ultR = (typeof hoja.getLastRow === 'function') ? hoja.getLastRow() : 0;
    if (!ultC || !ultR || filaFisica < 2 || filaFisica > ultR) return { ok: true, omitido: true };
    var enc = hoja.getRange(1, 1, 1, ultC).getValues()[0] || [];
    var mapa = {};
    for (var i = 0; i < enc.length; i++) mapa[Utl_claveAlnum_(enc[i])] = i;
    var colCls = mapa[Utl_claveAlnum_('CLASIFICACION')];
    var colErr = mapa[Utl_claveAlnum_('TRANSPORTE_ERROR')];
    // Columnas ausentes: fallo REAL (no se pudo persistir la clasificación).
    if (colCls === undefined || colErr === undefined) return { ok: false, motivo: 'COLUMNAS_AUSENTES' };
    var fila = hoja.getRange(filaFisica, 1, 1, ultC).getValues()[0] || [];
    fila[colCls] = clasificacion || '';
    fila[colErr] = JSON.stringify((errores || []).slice(0, 5));
    hoja.getRange(filaFisica, 1, 1, ultC).setValues([fila]);
    return { ok: true };
  } catch (e) { return { ok: false, motivo: String(e && e.message || e) }; }
}

/** v255 (E05): extrae CLIENT_REQUEST_ID/SOURCE (dos campos GLOBALes) del response. */
function Form_extraerTransporte_(resp, idx) {
  var out = { clientRequestId: '', source: '' };
  try {
    var irs = resp.getItemResponses() || [];
    var itemReq = (idx && idx.byCanonicalKey['GLOBAL|CLIENT_REQUEST_ID']) || null;
    var itemSrc = (idx && idx.byCanonicalKey['GLOBAL|SOURCE']) || null;
    for (var i = 0; i < irs.length; i++) {
      var it = null;
      try { it = irs[i].getItem(); } catch (e) { it = null; }
      if (!it) continue;
      if (itemReq && itemReq.item && String(it.getId()) === String(itemReq.item.getId())) out.clientRequestId = Utl_texto_(irs[i].getResponse());
      else if (itemSrc && itemSrc.item && String(it.getId()) === String(itemSrc.item.getId())) out.source = Utl_texto_(irs[i].getResponse());
    }
  } catch (e) { /* transporte ausente → vacío */ }
  return out;
}

/** GAS: procesa UNA respuesta candidata con transporte v255.
 *  Dedupe por clientRequestId (E06), ACK (E07), clasificación durable (E13).
 *  REVIEW (adapter inválido) queda REVIEW; RETRYABLE vuelve; TERMINAL solo por
 *  regla expresa (duplicado). Devuelve {ok, captureId, responseId, requestId,
 *  accion, estado, clasificacion, errores, duplicado}. */
function Form_procesarRespuestaConTransporte_(respuesta, ctx, opciones) {
  opciones = opciones || {};
  var formId = respuesta.formId;
  var responseId = respuesta.responseId;
  var captureId = CapturaIngress_captureId_(formId, responseId);
  var transporte = opciones.transporte || {};
  var requestId = '';
  if (transporte.clientRequestId &&
      GOOGLE_FORMS_CONFIG.TRANSPORTE.PATRON_CLIENT_REQUEST_ID.test(String(transporte.clientRequestId))) {
    requestId = String(transporte.clientRequestId);
  }
  if (requestId) {
    var idxReq = Form_requestIdBuscar_(requestId);
    if (idxReq.estado === 'RECIBIDO' && idxReq.responseId && String(idxReq.responseId) !== String(responseId)) {
      return { ok: false, captureId: captureId, responseId: responseId, requestId: requestId,
        duplicado: true, clasificacion: 'TERMINAL', errores: [{ codigo: 'DUPLICADO_REQUEST_ID' }] };
    }
  }
  var ad = CapturaIngress_adapterForms_({
    formId: formId, responseId: responseId, timestamp: respuesta.timestamp,
    accion: respuesta.accion, campos: respuesta.campos
  }, { catalogo: ctx.catalogo, hoy: opciones.hoy });
  if (!ad.ok) {
    Form_registrarErrorTransporte_(captureId, ad.errores);
    return { ok: false, captureId: captureId, responseId: responseId, requestId: requestId,
      clasificacion: 'REVIEW', errores: ad.errores };
  }
  // v268: SOURCE normalizado. Con clientRequestId válido la respuesta viene de la
  // Web App; sin él, es captura directa al Form. Nada más se acepta.
var sourcesValidos = {};
  sourcesValidos[GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_WEBAPP] = true;
  sourcesValidos[GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_GOOGLE_FORM_DIRECTO] = true;
  var sourceLeido = String(transporte.source || '').trim().toUpperCase();
  var sourceNormalizado = sourcesValidos[sourceLeido]
    ? sourceLeido
    : (requestId ? GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_WEBAPP : GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_GOOGLE_FORM_DIRECTO);

  // v268: contexto POR RESPUESTA. El ctx del batch se copia para que el
  // transportId de una respuesta nunca se reutilice en la siguiente, y para que
  // responseId/clientRequestId/source queden explícitos en el registro.
  var ctxEnvio = {};
  Object.keys(ctx || {}).forEach(function (k) { ctxEnvio[k] = ctx[k]; });
  ctxEnvio.transportId = responseId;
  ctxEnvio.transportResponseId = responseId;
  ctxEnvio.clientRequestId = requestId;
  ctxEnvio.source = sourceNormalizado;

  // v258: el lease excluye worker/worker; este lock breve excluye la mutación
  // clínica frente a UI/operador. Extracción, schema y trailer quedan fuera.
  var r = Ecicep_conLock_(function () {
    return CapturaIngress_enviar_(ad.payload, ctxEnvio, 'GOOGLE_FORMS');
  });
  if (!r.ok) {
    return { ok: false, captureId: captureId, responseId: responseId, requestId: requestId,
      clasificacion: 'RETRYABLE', errores: r.errors || [{ codigo: r.codigo || r.motivo || 'PIPELINE' }] };
  }
  if (requestId) Form_requestIdConfirmar_(requestId, responseId);
  // v268: la fila física la crea Captura_v2_enviar_ durante ESTA corrida, así que
  // estadoPrev aún no la conoce. Se resuelve internamente para que el worker
  // escriba CLASIFICACION/TRANSPORTE_ERROR en la misma corrida.
  var filaPersistida = null;
  try {
    if (typeof Captura_v2_buscarRegistro_ === 'function') filaPersistida = Captura_v2_buscarRegistro_(captureId);
  } catch (eFila) { filaPersistida = null; }
  var filaFisicaNueva = (filaPersistida && filaPersistida.filaFisica) ? filaPersistida.filaFisica : '';
  return { ok: true, captureId: captureId, responseId: responseId, requestId: requestId,
    accion: ad.accion, estado: (r.data && r.data.estado) || 'PROCESADO', clasificacion: 'TERMINAL',
    filaFisica: filaFisicaNueva };
}

/** v256 (P1): ELIMINADO el registro por captura en ScriptProperties
 *  (GOOGLE_FORM_ERRORS|<captureId>). El trailer de FORM_RESPUESTAS
 *  (CLASIFICACION / TRANSPORTE_ERROR) es la fuente autoritativa; se conserva
 *  esta función como NO-OP para compatibilidad de llamadas. */
function Form_registrarErrorTransporte_(captureId, errores) {
  return { ok: true, omitido: true, motivo: 'TRAILER_ES_AUTORITATIVO' };
}

/** v256 (P1): inventario/clasificación de errores legacy por prefijo EXACTO.
 *  Solo se usa en reparación explícita; nunca como fuente de verdad. */
function Form_erroresLegacy_() {
  var claves = [];
  var p = Form_props_();
  if (p && typeof p.getKeys === 'function') {
    try {
      var pref = GOOGLE_FORMS_CONFIG.ERRORES_PREFIJO;
      claves = (p.getKeys() || []).filter(function (k) { return String(k).indexOf(pref) === 0; });
    } catch (e) { claves = []; }
  }
  return claves;
}

/** v256 (P1): elimina claves legacy por prefijo EXACTO. Read-only si simular. */
function Form_limpiarErroresLegacy_(simular) {
  var claves = Form_propClaves_(GOOGLE_FORMS_CONFIG.ERRORES_PREFIJO);
  if (simular || !claves.length) return { ok: true, simulado: !!simular, eliminados: 0, encontrados: claves.length };
  var p = Form_props_();
  var borrados = 0;
  for (var i = 0; i < claves.length; i++) {
    try { if (p && p.deleteProperty) { p.deleteProperty(claves[i]); borrados++; } } catch (e) { /* ignorar */ }
  }
  return { ok: true, borrados: borrados, restantes: claves.length - borrados };
}

/** GAS: trigger onFormSubmit — señal liviana de recepción (E12).
 *  El worker es el único escritor clínico; aquí solo contador + timestamp. */
function Form_onFormSubmit_(e) {
  var formId = Form_formId_();
  if (!formId) return { ok: false, errores: [{ codigo: 'NO_INSTALADO' }] };
  var resp = e && e.response;
  if (!resp) return { ok: false, errores: [{ codigo: 'SIN_RESPONSE' }] };
  var responseId = '';
  try { responseId = String(resp.getId()); } catch (e3) { responseId = ''; }
  Form_metricaTriggerSumar_('SUBMIT_SIGNAL_COUNT');
  Form_propEscribir_('GOOGLE_FORM_LAST_SUBMIT_SIGNAL_TS', String(Date.now()));
  return { ok: true, queued: true, responseId: responseId };
}

function Form_desdeCursor_() {
  var cursor = Form_propLeer_('GOOGLE_FORM_CURSOR');
  if (!cursor) return new Date(0);
  var d = new Date(cursor);
  if (isNaN(d.getTime())) return new Date(0);
  var overlapMin = (GOOGLE_FORMS_CONFIG.WORKER && GOOGLE_FORMS_CONFIG.WORKER.OVERLAP_MIN) || (24 * 60);
  return new Date(Math.max(0, d.getTime() - overlapMin * 60000));
}

/** v256 (P0): token de lease sin PII (identifica la corrida, no al usuario). */
function Form_leaseToken_() {
  return 'wl-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 1e9));
}

/** v256 (P0): lee el lease vigente del worker desde ScriptProperties. */
function Form_leaseLeer_() {
  var raw = Form_propLeer_(GOOGLE_FORMS_CONFIG.WORKER_LEASE.CLAVE);
  if (!raw) return null;
  var d = Form_json_(raw);
  if (!d || !d.t) return null;
  var ttlMs = (GOOGLE_FORMS_CONFIG.WORKER_LEASE.TTL_S || 600) * 1000;
  return { t: Number(d.t) || 0, exp: Number(d.exp) || ((Number(d.t) || 0) + ttlMs), token: String(d.token || '') };
}

function Form_leaseVigente_(lease) {
  return !!(lease && lease.exp && Date.now() < lease.exp);
}

/** v256 (P0): toma el arriendo del worker. El ScriptLock se mantiene SOLO el
 *  tiempo de leer/escribir el lease (sección breve), nunca durante I/O.
 *  Devuelve {ok:true, token} o {ok:false, motivo:'DEFERRED_LEASE_BUSY'|'DEFERRED_LOCK_BUSY'}. */
function Form_leaseTomar_() {
  var lock = null;
  try {
    if (typeof LockService !== 'undefined') {
      lock = LockService.getScriptLock();
      var waitMs = (GOOGLE_FORMS_CONFIG.WORKER && GOOGLE_FORMS_CONFIG.WORKER.LOCK_WAIT_MS) || 750;
      if (!lock.tryLock(waitMs)) return { ok: false, motivo: 'DEFERRED_LOCK_BUSY' };
    }
    var actual = Form_leaseLeer_();
    if (Form_leaseVigente_(actual)) return { ok: false, motivo: 'DEFERRED_LEASE_BUSY' };
    var ahora = Date.now();
    var lease = { t: ahora, exp: ahora + (GOOGLE_FORMS_CONFIG.WORKER_LEASE.TTL_S || 600) * 1000, token: Form_leaseToken_() };
    Form_propEscribir_(GOOGLE_FORMS_CONFIG.WORKER_LEASE.CLAVE, JSON.stringify(lease));
    return { ok: true, token: lease.token };
  } catch (e) {
    return { ok: false, motivo: 'LEASE_ERROR' };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ }
  }
}

/** v256 (P0): libera el lease SOLO si el token coincide. No propaga errores. */
function Form_leaseLiberar_(token) {
  var lock = null;
  var adquirido = false;
  try {
    if (!token) return { ok: false };
    if (typeof LockService !== 'undefined') {
      lock = LockService.getScriptLock();
      adquirido = !!lock.tryLock((GOOGLE_FORMS_CONFIG.WORKER && GOOGLE_FORMS_CONFIG.WORKER.LOCK_WAIT_MS) || 750);
      if (!adquirido) return { ok: false, motivo: 'DEFERRED_LOCK_BUSY' };
    }
    var actual = Form_leaseLeer_();
    if (!actual || actual.token !== token) return { ok: false };
    var p = Form_props_();
    if (p && p.deleteProperty) p.deleteProperty(GOOGLE_FORMS_CONFIG.WORKER_LEASE.CLAVE);
    else Form_propEscribir_(GOOGLE_FORMS_CONFIG.WORKER_LEASE.CLAVE, '');
    return { ok: true };
  } catch (e) {
    return { ok: false };
  } finally {
    try { if (lock && adquirido) lock.releaseLock(); } catch (e3) { /* ignorar */ }
  }
}

/** v258: el trailer durable es gate para cualquier clasificación del worker. */
function Form_persistirClasificacion_(filaFisica, resultado) {
  resultado = resultado || {};
  var clasificacion = resultado.ok ? (resultado.clasificacion || 'TERMINAL')
    : (resultado.clasificacion || 'RETRYABLE');
  var errores = resultado.errores || [];
  var escritura = Form_escribirClasificacionTrailer_(filaFisica, clasificacion, errores);
  if (escritura && escritura.ok) {
    return { ok: true, clasificacion: clasificacion, errores: errores };
  }
  return { ok: false, clasificacion: 'RETRYABLE', errores: [{
    codigo: 'TRAILER_WRITE_FAILED', motivo: (escritura && escritura.motivo) || 'ESCRITURA_FALLIDA'
  }] };
}

/** v255 (M03): circuito por errores SISTÉMICOS consecutivos (N=3). Corta el
 *  batch conservando la cola; el siguiente intento reintenta (resetea al éxito). */
function Form_circuitoSistémico_(codigo, inicioMs, motivo) {
  var cfg = GOOGLE_FORMS_CONFIG.CIRCUIT || {};
  var esSistemico = (cfg.ERRORES_SISTEMICOS || []).indexOf(codigo) !== -1;
  if (esSistemico) {
    var n = (Number(Form_propLeer_('GOOGLE_FORM_CIRCUIT_CONSECUTIVOS')) || 0) + 1;
    Form_propEscribir_('GOOGLE_FORM_CIRCUIT_CONSECUTIVOS', String(n));
    if (n >= (cfg.UMBRAL || 3)) {
      return { ok: false, motivo: 'CIRCUIT_OPEN', codigo: codigo, circuit: { abierto: true, consecutivos: n }, procesadas: 0, durationMs: Date.now() - inicioMs };
    }
  }
  return { ok: false, motivo: codigo, procesadas: 0, durationMs: Date.now() - inicioMs };
}

/** GAS: worker de cola durable — reanuda respuestas no procesadas (v255).
 *  Operativo: UNA lectura de estados del trailer + conteo de ELEGIBLES (E08).
 *  opciones.yaProcesado queda SOLO como inyección de pruebas; la producción
 *  no depende de él. LOCK_WAIT_MS respetada (E30). */
function Form_worker_(opciones) {
  opciones = opciones || {};
  if (opciones.simular) return opciones.simular();
  if (typeof LockService === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  var formId = opciones.formId || Form_formId_();
  if (!formId) return { ok: false, motivo: 'NO_INSTALADO' };
  var leaseToken = '';
  var inicioMs = Date.now();
  try {
    // v256 (P0): lease corto — NO se retiene ScriptLock durante I/O/pipeline.
    var toma = Form_leaseTomar_();
    if (!toma.ok) {
      if (toma.motivo === 'DEFERRED_LOCK_BUSY') Form_metricaSumar_('LOCK_BUSY_DEFERRED');
      else Form_metricaSumar_('LEASE_BUSY_DEFERRED');
      Form_propEscribir_('GOOGLE_FORM_METRIC_DEFERRED_TS', String(Date.now()));
      return { ok: false, motivo: toma.motivo, procesadas: 0, lock: false, lease: false, durationMs: Date.now() - inicioMs };
    }
    leaseToken = toma.token;
    Form_metricaSumar_('WORKER_RUNS');
    Form_propEscribir_('GOOGLE_FORM_LAST_WORKER_RUN_TS', String(Date.now()));
    var form = null;
    try {
      form = FormApp.openById(formId);
    } catch (e) {
      Form_propEscribir_('GOOGLE_FORM_LAST_RETRYABLE_TS', String(Date.now()));
      return Form_circuitoSistémico_('FORM_NO_ACCESIBLE', inicioMs, 'Form no accesible');
    }
    var respuestas;
    try { respuestas = form.getResponses(Form_desdeCursor_()) || []; }
    catch (e) {
      // v256 (P0/P1): un fallo de lectura NO es "sin trabajo". No se resetea el
      // circuito, no se avanza el cursor y se contabiliza como error sistémico.
      Form_propEscribir_('GOOGLE_FORM_LAST_RETRYABLE_TS', String(Date.now()));
      return Form_circuitoSistémico_('FORM_RESPONSES_READ_FAILED', inicioMs, 'No se pudieron leer las respuestas');
    }

    respuestas.sort(function (a, b) {
      try { return a.getTimestamp().getTime() - b.getTimestamp().getTime(); } catch (e) { return 0; }
    });
    // v256 (P0): si la cola no es legible NO se procesa ni se avanza cursor.
    var lecturaCola = Form_leerEstadosCola_();
    if (!lecturaCola.ok) {
      Form_propEscribir_('GOOGLE_FORM_LAST_RETRYABLE_TS', String(Date.now()));
      return Form_circuitoSistémico_('QUEUE_STATE_READ_FAILED', inicioMs, 'No se pudo leer la cola');
    }
    var estadosCola = lecturaCola.estados;
    var itemMap = Form_json_(Form_propLeer_('GOOGLE_FORM_ITEM_MAP'));
    var titleMap = Form_json_(Form_propLeer_('GOOGLE_FORM_TITLE_MAP'));
    var idx = Form_indexarSchema_(form);
    var cfg = GOOGLE_FORMS_CONFIG.WORKER || {};

    var candidatos = [];
    for (var i = 0; i < respuestas.length; i++) {
      var resp = respuestas[i];
      var responseId = '';
      try { responseId = String(resp.getId()); } catch (e2) { responseId = ''; }
      var cid = CapturaIngress_captureId_(formId, responseId);
      var est = estadosCola.get(cid);
      if (!Form_esElegibleCandidato_(est)) continue;
      if (opciones.yaProcesado && opciones.yaProcesado(cid)) continue;
      candidatos.push({ resp: resp, responseId: responseId, cid: cid, ts: '', estadoPrev: est });
    }
    for (var t = 0; t < candidatos.length; t++) {
      try { var dts = candidatos[t].resp.getTimestamp(); candidatos[t].ts = dts ? Control_aIso_(dts) : ''; } catch (e4) { candidatos[t].ts = ''; }
    }

    var limite = opciones.max || cfg.MAX_POR_CORRIDA || 10;
    var procesadas = 0, errores = 0, retryable = 0, review = 0, terminal = 0;
    var elegibles = candidatos.length;
    var cursorSeguro = Form_propLeer_('GOOGLE_FORM_CURSOR');
    var encontroRetryable = false;
    var ctx = CapturaIngress_ctx_();
    try { ctx.leerPacientes = Modelo_leerPacientes_; } catch (e) { /* opcional */ }

    var filas = [];
    var procesadasEsteBatch = 0;
    for (var k = 0; k < candidatos.length && (procesadasEsteBatch + errores) < limite; k++) {
      var cand = candidatos[k];
      var campos = Form_extraerCampos_(cand.resp, { itemMap: itemMap, titleMap: titleMap });
      var tr = Form_extraerTransporte_(cand.resp, idx);
      var r = Form_procesarRespuestaConTransporte_(
        { formId: formId, responseId: cand.responseId, timestamp: cand.ts, accion: campos.accion, campos: campos.campos },
        ctx, { hoy: cand.ts, transporte: tr });
      var rOk = r.ok;
      var rf = cand.cid || r.captureId || '';
      // v268: para una respuesta recién creada, estadoPrev no conoce la fila;
      // el procesador la resuelve tras persistir. Sin esto, CLASIFICACION y
      // TRANSPORTE_ERROR quedaban sin escribir en la misma corrida.
      var filaFisica = (cand.estadoPrev && cand.estadoPrev.filaFisica) || r.filaFisica || '';
      var persistencia = Form_persistirClasificacion_(filaFisica, r);
      if (!persistencia.ok) {
        rOk = false;
        r.clasificacion = persistencia.clasificacion;
        r.errores = persistencia.errores;
        errores++; retryable++; encontroRetryable = true;
        Form_propEscribir_('GOOGLE_FORM_LAST_RETRYABLE_TS', String(Date.now()));
      } else if (rOk) {
        procesadas++; procesadasEsteBatch++;
        Form_propEscribir_('GOOGLE_FORM_LAST_PROCESSED_TS', String(Date.now()));
      } else {
        errores++;
        if (r.clasificacion === 'REVIEW') {
          review++;
        } else if (r.clasificacion === 'TERMINAL') {
          terminal++;
          Form_propEscribir_('GOOGLE_FORM_LAST_TERMINAL_TS', String(Date.now()));
        } else {
          retryable++; encontroRetryable = true;
          Form_propEscribir_('GOOGLE_FORM_LAST_RETRYABLE_TS', String(Date.now()));
        }
      }
      filas.push({ responseId: r.responseId || cand.responseId, captureId: rf, ok: rOk, accion: r.accion || '', estado: r.estado || '', clasificacion: rOk ? 'processed' : (r.clasificacion || 'retryable'), errores: r.errores || [] });
      if (!encontroRetryable && cand.ts) cursorSeguro = cand.ts;
    }
    if (cursorSeguro && cursorSeguro !== Form_propLeer_('GOOGLE_FORM_CURSOR')) Form_propEscribir_('GOOGLE_FORM_CURSOR', cursorSeguro);
    if (!encontroRetryable) Form_propEscribir_('GOOGLE_FORM_CIRCUIT_CONSECUTIVOS', '0');
    if (procesadas) Form_metricaSumar_('WORKER_PROCESSED', procesadas);
    if (errores) Form_metricaSumar_('WORKER_ERRORS', errores);
    if (retryable) Form_metricaSumar_('WORKER_RETRYABLE', retryable);
    if (review) Form_metricaSumar_('WORKER_REVIEW', review);
    if (terminal) Form_metricaSumar_('WORKER_TERMINAL', terminal);
    if (!encontroRetryable && procesadas && procesadasEsteBatch) Form_propEscribir_('GOOGLE_FORM_LAST_WORKER_OK_TS', String(Date.now()));
    return { ok: true, procesadas: procesadas, errores: errores, retryable: retryable,
      review: review, terminal: terminal, total: procesadas + retryable + review + terminal,
      elegibles: elegibles, restantes: Math.max(0, elegibles - procesadasEsteBatch - errores),
      durationMs: Date.now() - inicioMs, lock: true, lease: true, filas: filas };
  } catch (e) {
    Form_metricaSumar_('WORKER_ERRORS');
    return { ok: false, motivo: String(e && e.message || e), procesadas: 0, durationMs: Date.now() - inicioMs };
  } finally {
    // Libera el lease SOLO si el token coincide (no roba corridas ajenas).
    try { if (leaseToken) Form_leaseLiberar_(leaseToken); } catch (e2) { /* ignorar */ }
  }
}

// ---------------------------------------------------------------------------
// RECONCILIACIÓN (dryRun) y DIAGNÓSTICO
// ---------------------------------------------------------------------------

/** v255 (E09/E10): estado actual del backlog derivado de IDs ÚNICOS del trailer
 *  (nunca de contadores acumulativos). Devuelve processed/retryable/review/
 *  terminal/pending/oldestPendingMin. */
function Form_backlogResumen_() {
  var resumen = { ok: true, disponible: true, processed: 0, retryable: 0, review: 0, terminal: 0, pending: 0, tajada: [], oldestPendingMin: 0,
    legacy: { total: 0, terminal: 0, review: 0, unresolved: 0 } };
  var lectura = Form_leerEstadosCola_();
  // v256 (P0/P1): estado DESCONOCIDO — nunca reportar 0 como si la cola
  // estuviera vacía cuando en realidad no pudo leerse.
  if (!lectura.ok) {
    resumen.ok = false;
    resumen.disponible = false;
    resumen.motivo = lectura.motivo || 'QUEUE_STATE_READ_FAILED';
    return resumen;
  }
  var estados = lectura.estados;
  resumen.legacy = Form_resumenLegacy_(estados);
  var ahora = Date.now();
  var minTs = null;
  estados.forEach(function (reg, cid) {
    if (reg.legacy) return;
    var cls = String(reg.clasificacion || '').toUpperCase();
    var est = String(reg.estado || '').toUpperCase();
    // La CLASIFICACION del trailer (escrita por el worker) es autoritativa.
    if (cls === 'REVIEW' || est === 'REQUIERE_REVISION') { resumen.review++; resumen.tajada.push({ captureId: cid, clasificacion: 'REVIEW', fechaForms: reg.fechaForms }); return; }
    if (cls === 'TERMINAL' || est === 'PROCESADO') { resumen.terminal++; return; }
    if (cls === 'RETRYABLE' || est === 'ERROR' || est === 'RECIBIDO' || est === 'VALIDANDO' || est === 'VALIDO' || est === '') {
      resumen.retryable++;
      resumen.tajada.push({ captureId: cid, clasificacion: 'RETRYABLE', fechaForms: reg.fechaForms });
      var t = Number(new Date(String(reg.fechaForms || '').length >= 10 ? String(reg.fechaForms) : Number(reg.fechaForms) || 0)) || 0;
      if (!minTs || t < minTs) minTs = t;
      return;
    }
    resumen.processed++;
  });
  resumen.oldestPendingMin = minTs ? Math.max(0, Math.round((ahora - minTs) / 60000)) : 0;
  return resumen;
}

/** v270 (P0 observabilidad): snapshot del canal ACTIVO con ventana acotada.
 *  Cruza las respuestas RECIENTES del Form (evidencia durable de recepción)
 *  contra el mapa de cola `FORM_RESPUESTAS` para exponer cuántas respuestas
 *  aún NO están materializadas. Sin PII: solo agregados y el instante del
 *  pendiente más antiguo. Nunca lanza: si algo no es legible devuelve
 *  `disponible:false` con `motivo` en vez de inventar 0.
 *
 *  `unmaterialized` = respuestas del Form dentro de la ventana cuya fila de
 *  cola todavía no existe (ni siquiera como RECIBIDO). `materialized` = las
 *  que sí tienen fila. Ambas cubren SOLO la ventana acotada (cursor del worker
 *  u `opciones.ventanaHs`), no el histórico completo. */
function Form_canalActivoSnapshot_(opciones) {
  opciones = opciones || {};
  var salida = {
    ok: true, disponible: true, motivo: '',
    formsResponsesRecent: null, materialized: null, unmaterialized: null,
    processed: 0, retryable: 0, review: 0, terminal: 0,
    oldestUnmaterializedMin: 0, ventanaHs: null
  };
  var backlog = Form_backlogResumen_();
  salida.processed = backlog.terminal + backlog.processed;
  salida.retryable = backlog.retryable;
  salida.review = backlog.review;
  salida.terminal = backlog.terminal;
  if (backlog.disponible === false) {
    salida.ok = false; salida.disponible = false;
    salida.motivo = backlog.motivo || 'QUEUE_STATE_READ_FAILED';
    return salida;
  }
  var ventanaHs = Number(opciones.ventanaHs) || GOOGLE_FORMS_CONFIG.RECONCILIACION.VENTANA_HS;
  salida.ventanaHs = ventanaHs;
  var formId = Form_formId_();
  if (!formId || typeof FormApp === 'undefined') {
    salida.ok = false; salida.disponible = false; salida.motivo = 'FORM_NO_DISPONIBLE';
    return salida;
  }
  var form = opciones._form;
  if (!form) {
    try { form = FormApp.openById(formId); }
    catch (e) { salida.ok = false; salida.disponible = false; salida.motivo = 'FORM_NO_ACCESIBLE'; return salida; }
  }
  var respuestas;
  try { respuestas = form.getResponses(new Date(Date.now() - ventanaHs * 3600000)); }
  catch (e2) { salida.ok = false; salida.disponible = false; salida.motivo = 'FORM_RESPONSES_READ_FAILED'; return salida; }
  respuestas = respuestas || [];
  var lectura = Form_leerEstadosCola_();
  if (!lectura.ok) {
    salida.ok = false; salida.disponible = false;
    salida.motivo = lectura.motivo || 'QUEUE_STATE_READ_FAILED';
    return salida;
  }
  var mapa = lectura.estados;
  var materialized = 0, unmaterialized = 0, minTs = null, ahora = Date.now();
  for (var i = 0; i < respuestas.length; i++) {
    var rid = '';
    try { rid = String(respuestas[i].getId()); } catch (e3) { rid = ''; }
    if (!rid) continue;
    var cid = CapturaIngress_captureId_(formId, rid);
    if (mapa.has(cid)) { materialized++; continue; }
    unmaterialized++;
    var ts = 0;
    try { ts = respuestas[i].getTimestamp().getTime(); } catch (e4) { ts = 0; }
    if (ts && (minTs === null || ts < minTs)) minTs = ts;
  }
  salida.formsResponsesRecent = respuestas.length;
  salida.materialized = materialized;
  salida.unmaterialized = unmaterialized;
  salida.oldestUnmaterializedMin = minTs === null ? 0 : Math.max(0, Math.round((ahora - minTs) / 60000));
  return salida;
}

/** v259: clasificación read-only y agregada de legado no terminal. */
function Form_legacyReconciliarDryRun_(opciones) {
  opciones = opciones || {};
  var out = { ok: true, dryRun: true, totalNoTerminal: 0, CANONICAL_CONFIRMED: 0,
    INGRESO_REFERENCE_EXISTS: 0, REQUIRES_MANUAL_REVIEW: 0, IDENTITY_INSUFFICIENT: 0 };
  var hoja = opciones.hoja || Form_hojaRespuetas_();
  if (!hoja || hoja.getLastRow() < 2) return out;
  var cols = hoja.getLastColumn(), rows = hoja.getLastRow();
  var enc = hoja.getRange(1, 1, 1, cols).getValues()[0] || [];
  var datos = hoja.getRange(2, 1, rows - 1, cols).getValues();
  var idsEventos = opciones.eventoExiste ? null : Form_eventosIdsExistentes_();
  for (var i = 0; i < datos.length; i++) {
    var f = Form_filaPorMapa_(enc, datos[i]);
    var legacy = Form_esFilaLegacy_(f) || String(f.CAPTURE_PROVIDER || '').toUpperCase() === CAPTURA_INGESTA_PROVIDERS.WEBAPP_LEGACY;
    if (!legacy || String(f.ESTADO || '').toUpperCase() === 'PROCESADO') continue;
    out.totalNoTerminal++;
    var canonical = false, ingreso = false;
    if (String(f.ID_EVENTO || '').trim()) {
      try { canonical = opciones.eventoExiste ? !!opciones.eventoExiste(f.ID_EVENTO) : !!idsEventos[String(f.ID_EVENTO).trim()]; } catch (e) { canonical = false; }
    }
    if (!canonical && f.INGRESO_HOJA && f.INGRESO_FILA) {
      try {
        if (opciones.ingresoReferenciaExiste) ingreso = !!opciones.ingresoReferenciaExiste(f.INGRESO_HOJA, f.INGRESO_FILA, f.RESPONSE_ID);
        else if (typeof Form_buscarFilaIngresoPorMarca_ === 'function' && typeof Form_marcadorFuente_ === 'function') {
          var hallado = Form_buscarFilaIngresoPorMarca_(Form_marcadorFuente_(f.RESPONSE_ID, 'INGRESO'));
          ingreso = !!(hallado && String(hallado.hoja) === String(f.INGRESO_HOJA) && String(hallado.fila) === String(f.INGRESO_FILA));
        }
      } catch (e2) { ingreso = false; }
    }
    if (canonical) out.CANONICAL_CONFIRMED++;
    else if (ingreso) out.INGRESO_REFERENCE_EXISTS++;
    else if (!String(f.ID_EVENTO || '').trim() && !String(f.ID_INTERNO || '').trim() && !(f.INGRESO_HOJA && f.INGRESO_FILA)) out.IDENTITY_INSUFFICIENT++;
    else out.REQUIRES_MANUAL_REVIEW++;
  }
  return out;
}

/** GAS: clasifica envíos del Form que no llegaron a procesarse.
 *  v255 (E22): SIEMPRE read-only; toda reparación vive en Form_operativoReparar_(). */
function Form_reconciliarTransporte_(opciones) {
  opciones = opciones || {};
  var formId = (opciones.formId || opciones.id) || Form_formId_();
  if (!formId) return { ok: false, motivo: 'NO_INSTALADO' };
  var form;
  try { form = FormApp.openById(formId); } catch (e) { return { ok: false, motivo: 'FORM_NO_ACCESIBLE' }; }
  var respuestas = [];
  try {
    respuestas = form.getResponses(new Date(Date.now() - GOOGLE_FORMS_CONFIG.RECONCILIACION.VENTANA_HS * 3600000));
  } catch (e) { respuestas = []; }

  var leerEnCola = opciones.leerEnCola || function (cid) {
    try { if (typeof Captura_v2_buscarRegistro_ === 'function') return !!Captura_v2_buscarRegistro_(cid); } catch (e2) { /* n/d */ }
    return false;
  };
  // v256 (P1): la clasificación de errores se deriva del trailer autoritativo,
  // NUNCA de ScriptProperties por captura. Si la cola no es legible, se reporta
  // DESCONOCIDO en lugar de fabricar fallidos/ausentes.
  var lecturaCola = Form_leerEstadosCola_();
  var colaDesconocida = !lecturaCola.ok;
  var estadosTrailer = lecturaCola.estados;
  var nuevos = [], yaEnCola = [], ausentes = [], fallidos = [];
  for (var i = 0; i < respuestas.length; i++) {
    var resp = respuestas[i];
    var responseId = '';
    try { responseId = String(resp.getId()); } catch (e2) { responseId = ''; }
    if (!responseId) continue;
    var cid = CapturaIngress_captureId_(formId, responseId);
    var reg = estadosTrailer.get(cid);
    if (reg && (reg.transporteError || String(reg.clasificacion || '').toUpperCase() === 'REVIEW')) {
      fallidos.push({ responseId: responseId, captureId: cid, estado: 'RECHAZADO_EN_ADAPTADOR' }); continue;
    }
    if (leerEnCola(cid)) { yaEnCola.push({ responseId: responseId, captureId: cid, estado: 'EN_COLA_ORDENADA' }); continue; }
    nuevos.push({ responseId: responseId, captureId: cid, estado: 'SIN_PROCESAR' });
  }
  return { ok: !colaDesconocida, dryRun: true, analizados: respuestas.length, colaDesconocida: colaDesconocida, nuevos: nuevos, yaEnCola: yaEnCola, ausentes: ausentes, fallidos: fallidos };
}

/** GAS: reparación segura del canal v255 (M04). DEFAULT dry-run. Entrada:
 *  { repairTrigger, repairCatalogos, repairPropiedades, repairMetricas, dryRun }.
 *  NUNCA borra respuestas ni toca pacientes/eventos. */
function Form_operativoReparar_(opciones) {
  opciones = opciones || {};
  var dryRun = opciones.dryRun !== false;
  var acciones = [];
  var formId = Form_formId_();
  var form = null;
  if (formId && typeof FormApp !== 'undefined') {
    try { form = FormApp.openById(formId); } catch (e) { form = null; }
  }
  // v256 (P0): dryRun es ESTRICTAMENTE read-only. Cada acción reporta
  // sin_cambios | necesita_cambio | aplicado | error:<motivo>. Nunca ok:true
  // si una acción requerida falla.
  if (opciones.repairColumnas !== false) {
    try {
      var hoja = Form_hojaRespuetas_();
      var rc = Form_asegurarColumnasTransporte255_(hoja, { simular: dryRun });
      var estCol;
      if (rc.error) estCol = 'error:' + rc.error;
      else if ((rc.pendientes || []).length) estCol = dryRun ? 'necesita_cambio' : (rc.aplicado ? 'aplicado' : 'error:ESCRITURA_FALLIDA');
      else estCol = 'sin_cambios';
      acciones.push({ accion: 'columnas_transporte', estado: estCol, detalle: rc.pendientes || [] });
    } catch (e) { acciones.push({ accion: 'columnas_transporte', estado: 'error:' + String(e && e.message || e) }); }
  }
  if (opciones.repairTriggers !== false && form) {
    try {
      var triggerWorker = 0;
      if (typeof ScriptApp !== 'undefined') {
        triggerWorker = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'Form_worker_'; }).length;
      }
      if (triggerWorker === 0) {
        if (dryRun) acciones.push({ accion: 'trigger_worker', estado: 'necesita_cambio', motivo: 'necesita_creacion' });
        else { ScriptApp.newTrigger('Form_worker_').timeBased().everyMinutes(5).create(); acciones.push({ accion: 'trigger_worker', estado: 'aplicado' }); }
      } else {
        acciones.push({ accion: 'trigger_worker', estado: 'sin_cambios' });
      }
    } catch (e) { acciones.push({ accion: 'trigger_worker', estado: 'error:' + String(e && e.message || e) }); }
  }
  if (opciones.repairCatalogos !== false && form) {
    try {
      var cr = Form_syncCatalogos_({ form: form, simular: dryRun });
      var estCat;
      if (!cr.ok) estCat = 'error:' + (cr.motivo || 'CATALOGO_FALLIDO');
      else if ((cr.cambios || []).length) estCat = dryRun ? 'necesita_cambio' : 'aplicado';
      else estCat = 'sin_cambios';
      acciones.push({ accion: 'catalogos', estado: estCat, detalle: (cr.cambios || []).length + ' cambios' });
    } catch (e) { acciones.push({ accion: 'catalogos', estado: 'error:' + String(e && e.message || e) }); }
  }
  if (opciones.repairPropiedades !== false && form) {
    try {
      var cm = Form_construirCanonicalItemMap_(form);
      var jsonCm = JSON.stringify(cm);
      var coincide = Form_propLeer_('GOOGLE_FORM_CANONICAL_ITEM_MAP') === jsonCm;
      var estMap;
      if (coincide) estMap = 'sin_cambios';
      else if (dryRun) estMap = 'necesita_cambio';
      else { Form_propEscribir_('GOOGLE_FORM_CANONICAL_ITEM_MAP', jsonCm); estMap = 'aplicado'; }
      acciones.push({ accion: 'canonical_map', estado: estMap, detalle: Object.keys(cm).length + ' claves' });
    } catch (e) { acciones.push({ accion: 'canonical_map', estado: 'error:' + String(e && e.message || e) }); }
  }
  // v256 (P1): limpieza legacy OPCIONAL y explícita (por defecto no se toca).
  if (opciones.repairErroresLegacy) {
    try {
      var leg = Form_limpiarErroresLegacy_(dryRun);
      var estLeg;
      if (dryRun) estLeg = leg.encontradas ? 'necesita_cambio' : 'sin_cambios';
      else estLeg = 'aplicado';
      acciones.push({ accion: 'errores_legacy', estado: estLeg, detalle: (leg.encontradas || 0) + ' clave(s) GOOGLE_FORM_ERRORS|' + (dryRun ? '' : ', ' + (leg.borrados || 0) + ' borrada(s)') });
    } catch (e) { acciones.push({ accion: 'errores_legacy', estado: 'error:' + String(e && e.message || e) }); }
  }
  var hayError = acciones.some(function (a) { return String(a.estado).indexOf('error:') === 0; });
  var necesitaCambio = acciones.some(function (a) { return a.estado === 'necesita_cambio'; });
  return { ok: !hayError, dryRun: dryRun, formId: formId, necesitaCambio: necesitaCambio, acciones: acciones };
}

/** v255 (M05): worker manual desde admin — delega a Form_worker_() sin bypass. */
function api_formWorkerEjecutarAhora_(opciones) {
  return Form_worker_(opciones);
}

/** GAS: estado operativo del canal (sin datos clínicos).
 *  v255: backlog real por IDs únicos (E09/E10) + triggers del worker (E11). */
function Form_operativoEstado_(opciones) {
  opciones = opciones || {};
  var formId = Form_formId_();
  var metricas = Form_metricas_();
  var triggerOnFormSubmit = null, triggerWorker = null;
  if (typeof ScriptApp !== 'undefined') {
    try {
      var ts = ScriptApp.getProjectTriggers();
      triggerOnFormSubmit = ts.filter(function (t) { return t.getHandlerFunction() === 'Form_onFormSubmit_'; }).length;
      triggerWorker = ts.filter(function (t) { return t.getHandlerFunction() === 'Form_worker_'; }).length;
    } catch (e) { triggerOnFormSubmit = -1; triggerWorker = -1; }
  }
  var info = {};
  // v256 (P1): DISTINGUIR "no legible" de "0". Sin Form o sin lectura, el
  // conteo queda DESCONOCIDO (no se reporta como cero).
  var responsesDisponible = false;
  var formAbierto = null;
  if (formId && typeof FormApp !== 'undefined') {
    try {
      formAbierto = FormApp.openById(formId);
      var form = formAbierto;
      info.titulo = form.getTitle();
      try { info.respuestas = form.getResponses().length; responsesDisponible = true; }
      catch (e) { info.responsesError = String(e && e.message || e); }
    } catch (e) { info.error = String(e && e.message || e); }
  }
  var backlog = Form_backlogResumen_();
  var snapshot = Form_canalActivoSnapshot_({ _form: formAbierto });
  var total = responsesDisponible ? Number(info.respuestas) || 0 : null;
  var triggersDisponible = (triggerWorker !== null && triggerOnFormSubmit !== null);
  return {
    ok: true,
    instalado: !!formId,
    formId: formId,
    url: Form_urlRespondedor_(),
    schemaVersion: Number(Form_propLeer_('GOOGLE_FORM_SCHEMA_VERSION')) || 0,
    cursor: Form_propLeer_('GOOGLE_FORM_CURSOR'),
    triggerOnFormSubmit: triggerOnFormSubmit,
    triggerWorker: triggerWorker,
    triggersDisponible: triggersDisponible,
    responsesDisponible: responsesDisponible,
    metricas: metricas,
    observabilidad: {
      formsResponses: responsesDisponible ? total : 'DESCONOCIDO',
      responsesTotal: responsesDisponible ? total : 'DESCONOCIDO',
      responsesDisponible: responsesDisponible,
      processed: backlog.terminal + backlog.processed,
      retryable: backlog.retryable,
      review: backlog.review,
      terminal: backlog.terminal,
      backlog: backlog.pending + backlog.retryable,
      oldestPendingMin: backlog.oldestPendingMin,
      backlogDisponible: backlog.disponible !== false,
      triggersDisponible: triggersDisponible
      ,legacy: backlog.legacy,
      legacyTotal: backlog.legacy.total, legacyTerminal: backlog.legacy.terminal,
      legacyReview: backlog.legacy.review, legacyUnresolved: backlog.legacy.unresolved,
      // v270 (P0): snapshot acotado del canal activo (Form reciente vs cola).
      formsResponsesRecent: snapshot.formsResponsesRecent,
      materialized: snapshot.materialized,
      unmaterialized: snapshot.unmaterialized,
      oldestUnmaterializedMin: snapshot.oldestUnmaterializedMin,
      ventanaHs: snapshot.ventanaHs,
      snapshotDisponible: snapshot.disponible !== false,
      snapshotMotivo: snapshot.motivo || '',
      // v270 (P0): métrica de CAPACIDAD (submit trigger cableado), no de
      // recepción. La recepción real se deriva de LAST_RECEIVED_TS/materialized.
      installableSubmitSignals: (triggerOnFormSubmit === null) ? null : (triggerOnFormSubmit > 0 ? 1 : 0),
      recepcionesSnapshot: snapshot.disponible !== false ? snapshot.materialized : 'DESCONOCIDO'
    },
    backlogDisponible: backlog.disponible !== false,
    responsesDisponible: responsesDisponible,
    triggersDisponible: triggersDisponible,
    backlogMotivo: backlog.motivo || '',
    backlog: { disponible: backlog.disponible !== false, oldestPendingMin: backlog.oldestPendingMin, pendientes: backlog.pending + backlog.retryable, pending: backlog.pending, retryable: backlog.retryable, review: backlog.review, terminal: backlog.terminal, legacy: backlog.legacy },
    form: info,
    canal: 'GOOGLE_FORMS'
  };
}

/** GAS: estado AGREGADO de publicación del Form. Usa los métodos de lectura
 *  SOLO si existen; si no, devuelve `null` (nunca inventa `false`).
 *  Devuelve solo estado: sin ID, sin URL, sin PII. */
function Form_estadoPublicacion_(form) {
  var out = { accesible: false, publicado: null, aceptaRespuestas: null };
  if (!form) return out;
  out.accesible = true;
  if (typeof form.isPublished === 'function') {
    try { out.publicado = !!form.isPublished(); } catch (e) { out.publicado = null; }
  }
  if (typeof form.isAcceptingResponses === 'function') {
    try { out.aceptaRespuestas = !!form.isAcceptingResponses(); } catch (e2) { out.aceptaRespuestas = null; }
  }
  return out;
}

/** GAS: diagnóstico de instalación del canal (sin mutar nada).
 *  v255 (E11): triggerWorkerCount es BLOQUEANTE. */
function Form_operativoDiagnosticar_(opciones) {
  var estado;
  try { estado = Form_operativoEstado_(opciones); } catch (e) { estado = { ok: false, motivo: String(e && e.message || e) }; }
  var checks = [
    { nombre: 'form_id', ok: !!(estado.formId), detalle: estado.formId || 'Sin Form configurado (ejecutar Form_operativoInstalar_)' },
    { nombre: 'schema_version', ok: estado.schemaVersion === GOOGLE_FORMS_CONFIG.SCHEMA_VERSION, detalle: 'Schema v' + estado.schemaVersion + ' / esperada v' + GOOGLE_FORMS_CONFIG.SCHEMA_VERSION },
    // v270 (P0): trigger de submit = TELEMETRÍA. No es bloqueante: el worker
    // periódico es el procesador autoritativo. Se reporta como advertencia.
    { nombre: 'trigger_on_form_submit', ok: (estado.triggerOnFormSubmit || 0) === 1, bloqueante: false, detalle: 'Triggers onFormSubmit: ' + (estado.triggerOnFormSubmit === null ? 'n/d' : estado.triggerOnFormSubmit) + ' (telemetría; no bloquea)' },
    { nombre: 'trigger_worker', ok: (estado.triggerWorker || 0) === 1, detalle: 'Triggers worker: ' + (estado.triggerWorker === null ? 'n/d' : estado.triggerWorker) + ' (requerido: 1)' },
    { nombre: 'url', ok: !!estado.url, detalle: estado.url || 'Sin URL de respondedor' }
  ];
  var hojaOk = false;
  if (typeof SpreadsheetApp !== 'undefined') {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var h = ss.getSheetByName(HOJAS.FORM_RESPUESTAS);
      hojaOk = !!(h && h.getLastColumn && h.getLastColumn() >= Form_columnas_().length);
    } catch (e) { hojaOk = false; }
  }
  checks.push({ nombre: 'columnas', ok: hojaOk, detalle: hojaOk ? 'FORM_RESPUESTAS con ' + Form_columnas_().length + ' columnas' : 'FORM_RESPUESTAS incompleta' });

  // v260: publicación y aceptación de respuestas. `null` = introspección no
  // disponible en el runtime; solo un `false` EXPLÍCITO hace fallar el diagnóstico.
  var publicacion = { accesible: false, publicado: null, aceptaRespuestas: null };
  try {
    if (estado && estado.formId && !(estado.form && estado.form.error) && typeof FormApp !== 'undefined') {
      publicacion = Form_estadoPublicacion_(FormApp.openById(estado.formId));
    }
  } catch (ePub) { /* se conserva null/null: no verificable */ }
  checks.push({
    nombre: 'publicacion',
    ok: publicacion.publicado !== false && publicacion.aceptaRespuestas !== false,
    detalle: 'publicado=' + publicacion.publicado + ' · aceptaRespuestas=' + publicacion.aceptaRespuestas
  });
  return { ok: estado.ok !== false && checks.every(function (c) { return c.bloqueante === false || c.ok; }), checks: checks, estado: estado, publicacion: publicacion, versionSistema: ECICEP.VERSION };
}

/** v255 (M01): salud real del canal — OK / DEGRADED / CRITICAL.
 *  CRITICAL: sin worker trigger o Form no accesible o schema roto.
 *  DEGRADED: backlog>0, oldest>umbral o retryable>0. Sin PII. */
function Form_saludOperativa_(opciones) {
  opciones = opciones || {};
  var diag = Form_operativoDiagnosticar_(opciones);
  var estado = diag.estado || {};
  var backlog = estado.backlog || {};
  var alertas = [];
  var advertenciasHistoricas = [];
  var nivel = 'OK';
  if ((estado.triggerWorker || 0) !== 1) { nivel = 'CRITICAL'; alertas.push('WORKER_TRIGGER_AUSENTE'); }
  if (!estado.formId || estado.form.error) { if (nivel !== 'CRITICAL') nivel = 'CRITICAL'; alertas.push('FORM_NO_ACCESIBLE'); }
  if (estado.schemaVersion !== GOOGLE_FORMS_CONFIG.SCHEMA_VERSION) { if (nivel !== 'CRITICAL') nivel = 'CRITICAL'; alertas.push('SCHEMA_DRIFT'); }
  // v256 (P1): estado DESCONOCIDO — si la cola no pudo leerse, NUNCA se
  // presenta 0/OK como si estuviera vacía.
  if (estado.responsesDisponible === false && estado.formId && !(estado.form && estado.form.error)) {
    if (nivel === 'OK') nivel = 'DEGRADED'; alertas.push('RESPONSES_READ_FAILED');
  }
  if (estado.triggersDisponible === false) {
    if (nivel === 'OK') nivel = 'DEGRADED'; alertas.push('TRIGGERS_UNKNOWN');
  }
  if (estado.backlogDisponible === false) {
    if (nivel === 'OK') nivel = 'DEGRADED';
    alertas.push('QUEUE_STATE_READ_FAILED');
  } else if (backlog.oldestPendingMin > GOOGLE_FORMS_CONFIG.SALUD.OLDEST_PENDING_MAX_MIN) {
    if (nivel === 'OK') nivel = 'DEGRADED'; alertas.push('OLDEST_PENDING_EXCEDIDO');
  } else if ((backlog.pending || 0) + (backlog.retryable || 0) > 0 || (backlog.review || 0) > 0) {
    if (nivel === 'OK') nivel = 'DEGRADED'; alertas.push('BACKLOG_PENDIENTE');
  }
  // v270 (P0): respuestas del Form aún NO materializadas en la cola. Reglas:
  //  · dentro de una sola cadencia → transitorio (sin alerta);
  //  · > 2 cadencias → DEGRADED;
  //  · envejecimiento > OLDEST_PENDING_MAX_MIN → CRITICAL.
  var obs = estado.observabilidad || {};
  var cadenciaMin = Number(GOOGLE_FORMS_CONFIG.WORKER && GOOGLE_FORMS_CONFIG.WORKER.CADENCIA_MIN) || 5;
  var umbralViejo = GOOGLE_FORMS_CONFIG.SALUD.OLDEST_PENDING_MAX_MIN;
  var unmaterialized = Number(obs.unmaterialized) || 0;
  if (obs.snapshotDisponible === false && estado.responsesDisponible !== false && !(estado.form && estado.form.error)) {
    if (nivel === 'OK') nivel = 'DEGRADED';
    alertas.push('SNAPSHOT_READ_FAILED');
  } else if (unmaterialized > 0) {
    var edadUnmat = Number(obs.oldestUnmaterializedMin) || 0;
    if (edadUnmat > umbralViejo) {
      if (nivel !== 'CRITICAL') nivel = 'CRITICAL';
      alertas.push('UNMATERIALIZED_ENVEJECIDO');
    } else if (edadUnmat > 2 * cadenciaMin) {
      if (nivel === 'OK') nivel = 'DEGRADED';
      alertas.push('UNMATERIALIZED_PENDIENTE');
    }
    // ≤ 2 cadencias ⇒ transitorio: sin alerta.
  }
  if (backlog.legacy && backlog.legacy.unresolved > 0) advertenciasHistoricas.push('LEGACY_RECONCILIATION_PENDING');
  return { ok: nivel === 'OK', estado: nivel, alertas: alertas, advertenciasHistoricas: advertenciasHistoricas, backlog: backlog, backlogDisponible: estado.backlogDisponible !== false, responsesDisponible: estado.responsesDisponible !== false, triggersDisponible: estado.triggersDisponible !== false, observabilidad: obs, diagOk: diag.ok, checks: diag.checks };
}

/** v255 (M06): panel de operación del transporte — solo agregados, SIN PII. */
function Form_panelOperacion_(opciones) {
  opciones = opciones || {};
  var salud = Form_saludOperativa_(opciones);
  var estado = salud.diagOk !== undefined ? (Form_operativoEstado_(opciones)) : {};
  var m = Form_metricas_();
  var ahora = Date.now();
  return {
    ok: true,
    generadoEn: String(new Date(ahora).toISOString()),
    health: salud.estado,
    alertas: salud.alertas,
    advertenciasHistoricas: salud.advertenciasHistoricas,
    worker: { triggerWorkerCount: estado.triggerWorker || 0, cadenceMin: 5 },
    lastWorkerRunAt: Form_propLeer_('GOOGLE_FORM_LAST_WORKER_RUN_TS') || '',
    lastWorkerOkAt: Form_propLeer_('GOOGLE_FORM_LAST_WORKER_OK_TS') || '',
    lastReceivedAt: Form_propLeer_('GOOGLE_FORM_LAST_RECEIVED_TS') || '',
    lastProcessedAt: Form_propLeer_('GOOGLE_FORM_LAST_PROCESSED_TS') || '',
    lastRetryableAt: Form_propLeer_('GOOGLE_FORM_LAST_RETRYABLE_TS') || '',
    lastTerminalAt: Form_propLeer_('GOOGLE_FORM_LAST_TERMINAL_TS') || '',
    backlog: salud.backlog,
    canalActual: {
      formsResponses: estado.observabilidad ? estado.observabilidad.formsResponses : 'DESCONOCIDO',
      formsResponsesRecent: estado.observabilidad ? estado.observabilidad.formsResponsesRecent : 'DESCONOCIDO',
      materialized: estado.observabilidad ? estado.observabilidad.materialized : 'DESCONOCIDO',
      unmaterialized: estado.observabilidad ? estado.observabilidad.unmaterialized : 'DESCONOCIDO',
      oldestUnmaterializedMin: estado.observabilidad ? estado.observabilidad.oldestUnmaterializedMin : 0,
      processed: estado.observabilidad ? estado.observabilidad.processed : 0,
      retryable: salud.backlog.retryable || 0, review: salud.backlog.review || 0,
      pending: salud.backlog.pending || 0, oldestPendingMin: salud.backlog.oldestPendingMin || 0
    },
    legado: salud.backlog.legacy || { total: 0, terminal: 0, review: 0, unresolved: 0 },
    lockBusy: m.LOCK_BUSY_DEFERRED || 0,
    // v270 (P0): recepciones = evidencia real (materializadas en ventana), no
    // el contador de capacidad del trigger de submit.
    recepciones: (estado.observabilidad && typeof estado.observabilidad.materialized === 'number' && isFinite(estado.observabilidad.materialized))
      ? estado.observabilidad.materialized
      : (Number(Form_propLeer_('GOOGLE_FORM_METRIC_SUBMIT_SIGNAL_COUNT')) || 0),
    installableSubmitSignals: m.installableSubmitSignals || 0,
    errores: m.WORKER_ERRORS || 0,
    runs: m.WORKER_RUNS || 0
  };
}

/** GAS: panel administrativo del canal (HTML). */
function UI_googleFormsPanel_() {
  var html = HtmlService.createHtmlOutputFromFile('GoogleFormsPanel');
  html.setTitle('Google Forms — Canal de captura ECICEP');
  return html;
}
function Form_indexarSchema_(form) {
  var idx = { byKey: {}, byCanonicalKey: {}, byItemId: {}, byTitle: {}, pages: {}, seccion: null, accionChoices: [], accionItem: null };
  var items = form.getItems();
  var tituloCampo = Form_mapaTitulos_();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var t = it.getTitle();
    // ACCION global antes de PageBreak
    if (it.getType && it.getType() === FormApp.ItemType.MULTIPLE_CHOICE && !idx.seccion && t) {
      try {
        if (t === GOOGLE_FORMS_CONFIG.ACCIONES.TITULO) {
          idx.accionItem = it;
          idx.byCanonicalKey['GLOBAL|ACCION'] = { item: it, tipo: it.getType ? it.getType().toString() : '' };
        }
      } catch (e) {}
    }
    // Page break cambia seccion
    if (it.getType && it.getType() === FormApp.ItemType.PAGE_BREAK) {
      try {
        var pb = it.asPageBreakItem();
        idx.seccion = String(pb.getTitle() || pb.getHelpText() || '');
        idx.pages[idx.seccion] = it;
      } catch (e) { idx.seccion = t; }
      continue;
    }
    var entrada = { item: it, tipo: it.getType ? it.getType().toString() : '' };
    try { idx.byItemId[String(it.getId())] = entrada; } catch (e) {}
    if (!idx.seccion) {
      // v255: campos GLOBALes de transporte antes del primer PageBreak.
      if (tituloCampo[Utl_claveAlnum_(t)] === 'CLIENT_REQUEST_ID') idx.byCanonicalKey['GLOBAL|CLIENT_REQUEST_ID'] = entrada;
      else if (tituloCampo[Utl_claveAlnum_(t)] === 'SOURCE') idx.byCanonicalKey['GLOBAL|SOURCE'] = entrada;
      continue;
    }
    var key = idx.seccion + '|' + t;
    idx.byKey[key] = entrada;
    var campo = tituloCampo[Utl_claveAlnum_(t)];
    if (campo && campo !== 'ACCION') idx.byCanonicalKey[Form_claveCanonicaItem_(idx.seccion, campo)] = entrada;
    idx.byTitle[t] = idx.byTitle[t] || [];
    idx.byTitle[t].push({ key: key, sec: idx.seccion, item: it });
  }
  if (idx.accionItem) {
    try { idx.byItemId[String(idx.accionItem.getId())] = idx.byCanonicalKey['GLOBAL|ACCION']; } catch (e) {}
  }
  // La identidad persistida por itemId manda sobre los títulos visibles. Así un
  // cambio editorial de etiqueta no crea otra pregunta ni rompe el roundtrip.
  var persistido = Form_json_(Form_propLeer_('GOOGLE_FORM_CANONICAL_ITEM_MAP'));
  Object.keys(persistido).forEach(function (canonicalKey) {
    var entrada = idx.byItemId[String(persistido[canonicalKey])];
    if (!entrada) return;
    idx.byCanonicalKey[canonicalKey] = entrada;
    if (canonicalKey === 'GLOBAL|ACCION') idx.accionItem = entrada.item;
  });
  return idx;
}

function Form_campoRequerido_(seccion, campo) {
  var sec = String(seccion || '').toUpperCase();
  var c = String(campo || '').toUpperCase();
  if (c === 'TELEFONOS' || c === 'PROFESIONAL2' || c === 'OBSERVACIONES' || c === 'SALUD_MENTAL' || c === 'SEXO' || c === 'ESTRATIFICACION' || c === 'PROXIMO_CONTROL') return false;
  if (sec === 'NUEVO_INGRESO') {
    if (c === 'RUT' || c === 'NOMBRE' || c === 'FECHA_NACIMIENTO' || c === 'SECTOR' || c === 'FECHA_INGRESO' || c === 'PROFESIONAL') return true;
    return false;
  }
  if (sec === 'REGISTRAR_CONTROL' || sec === 'REGISTRAR_SEGUIMIENTO') {
    if (c === 'RUT' || c === 'FECHA_EVENTO' || c === 'PROFESIONAL') return true;
    return false;
  }
  if (sec === 'ACTUALIZAR_DATOS') {
    if (c === 'RUT' || c === 'PROFESIONAL') return true;
    return false;
  }
  return false;
}

/** v267 (E2E): convierte un `FormApp.Item` genérico en su clase concreta ANTES
 *  de crear el ItemResponse. En el runtime real sólo las clases tipadas
 *  (TextItem/ParagraphTextItem/ListItem/MultipleChoiceItem/DateItem) exponen
 *  `createResponse()`; el Item genérico no. Sin fallback genérico: un bug aquí
 *  debe seguir siendo visible, no quedar enmascarado. */
function Form_crearItemResponse_(item, valor) {
  if (!item || typeof item.getType !== 'function') throw new Error('FORM_ITEM_INVALID');
  var tipo = item.getType();
  if (tipo === FormApp.ItemType.TEXT) return item.asTextItem().createResponse(String(valor));
  if (tipo === FormApp.ItemType.PARAGRAPH_TEXT) return item.asParagraphTextItem().createResponse(String(valor));
  if (tipo === FormApp.ItemType.LIST) return item.asListItem().createResponse(String(valor));
  if (tipo === FormApp.ItemType.MULTIPLE_CHOICE) return item.asMultipleChoiceItem().createResponse(String(valor));
  if (tipo === FormApp.ItemType.DATE) {
    if (!(valor instanceof Date) || isNaN(valor.getTime())) throw new Error('FORM_DATE_RESPONSE_INVALID');
    return item.asDateItem().createResponse(valor);
  }
  throw new Error('FORM_ITEM_TYPE_UNSUPPORTED');
}

/** GAS: crea FormResponse desde payload Web (recepción durable). */
/** v255 (E19/E20): crea FormResponse desde payload Web mediante PLAN de
 *  ItemResponses resuelto por canonical keys. TODO campo no vacío debe crear
 *  ItemResponse con éxito; si no, FORM_SCHEMA_DRIFT y NO submit.
 *  Errores sin PII: solo canonical keys. */
function Form_crearRespuestaDesdePayloadWeb_(payload, opciones) {
  opciones = opciones || {};
  try {
    var formId = Form_formId_();
    if (!formId) return { ok: false, estado: 'ERROR', motivo: 'FORM_NO_CONFIGURADO' };
    var form = FormApp.openById(formId);
    var response = form.createResponse();
    var accion = String(payload.accion || '').toLowerCase();
    var seccion = null;
    if (accion === 'nuevoingreso') seccion = 'NUEVO_INGRESO';
    else if (accion === 'registrarcontrol') seccion = 'REGISTRAR_CONTROL';
    else if (accion === 'registrarseguimiento') seccion = 'REGISTRAR_SEGUIMIENTO';
    else if (accion === 'actualizardatos') seccion = 'ACTUALIZAR_DATOS';
    if (!seccion) return { ok: false, estado: 'ERROR', motivo: 'ACCION_INVALIDA' };
    var idx = Form_indexarSchema_(form);
    var plan = [];
    var fallos = [];

    function setCanonical(campoSeccion, campo, valor, esFecha) {
      var ck = Form_claveCanonicaItem_(campoSeccion, campo);
      var entrada = idx.byCanonicalKey[ck];
      var reparadoPorTitulo = false;
      if (!entrada || !entrada.item) {
        // v255 (E20): títulos SOLO como reparación si el canonical no existe.
        var etiq = GOOGLE_FORMS_CONFIG.CAMPOS[campo] && GOOGLE_FORMS_CONFIG.CAMPOS[campo].etiqueta;
        if (etiq && idx.byTitle[etiq] && idx.byTitle[etiq].length) { entrada = idx.byTitle[etiq][0]; reparadoPorTitulo = true; }
      }
      var v = valor;
      if (esFecha) {
        v = Form_fechaLocalDesdeIso_(valor);
        if (!v) { plan.push({ canonicalKey: ck, ok: false, motivo: 'FECHA_INVALIDA' }); fallos.push(ck); return false; }
      }
      if (v === null || v === undefined || String(v).trim() === '') {
        plan.push({ canonicalKey: ck, valor: '', ok: true, omitidoVacio: true });
        return true;
      }
      var ok = false, tipoItem = '', motivoFallo = '';
      if (entrada && entrada.item) {
        try { tipoItem = entrada.item.getType ? String(entrada.item.getType()) : ''; } catch (eT) { tipoItem = ''; }
        try { response.withItemResponse(Form_crearItemResponse_(entrada.item, v)); ok = true; }
        catch (e2) { ok = false; motivoFallo = 'ITEM_RESPONSE_FAILED'; }
      }
      // Plan sin PII: sólo canonical key, tipo agregado y motivo técnico.
      plan.push({ canonicalKey: ck, ok: ok, reparadoPorTitulo: reparadoPorTitulo, itemType: tipoItem, motivo: motivoFallo });
      if (!ok) fallos.push(ck);
      return ok;
    }
    function valorActualizacion(campo, fallback) {
      var a = payload.actualizacion && payload.actualizacion.campos && payload.actualizacion.campos[campo];
      if (a && typeof a === 'object' && a.valor !== undefined) return String(a.valor);
      return fallback === undefined || fallback === null ? '' : String(fallback);
    }

    // ACCION global + transporte global (E05: CLIENT_REQUEST_ID y SOURCE).
    var accLabel = (GOOGLE_FORMS_CONFIG.ACCIONES.OPCIONES[seccion] || {}).etiqueta || '';
    setCanonical('GLOBAL', 'ACCION', accLabel, false);
    var source = String(opciones.source || payload.source || GOOGLE_FORMS_CONFIG.TRANSPORTE.SOURCE_WEBAPP).toUpperCase();
    setCanonical('GLOBAL', 'SOURCE', source, false);
    if (payload.clientRequestId) setCanonical('GLOBAL', 'CLIENT_REQUEST_ID', String(payload.clientRequestId), false);

    // Campos comunes.
    if (payload.rut) setCanonical(seccion, 'RUT', payload.rut, false);
    if (seccion === 'NUEVO_INGRESO') {
      if (payload.nombre) setCanonical('NUEVO_INGRESO', 'NOMBRE', payload.nombre, false);
      if (payload.fechaNacimiento) setCanonical('NUEVO_INGRESO', 'FECHA_NACIMIENTO', payload.fechaNacimiento, true);
      if (payload.sector) setCanonical('NUEVO_INGRESO', 'SECTOR', payload.sector, false);
      if (payload.fechaIngreso) setCanonical('NUEVO_INGRESO', 'FECHA_INGRESO', payload.fechaIngreso, true);
      if (payload.profesional) setCanonical('NUEVO_INGRESO', 'PROFESIONAL', payload.profesional, false);
      if (payload.profesionalSecundario) setCanonical('NUEVO_INGRESO', 'PROFESIONAL2', payload.profesionalSecundario, false);
      if (payload.sexo) setCanonical('NUEVO_INGRESO', 'SEXO', payload.sexo, false);
      if (payload.estratificacion) setCanonical('NUEVO_INGRESO', 'ESTRATIFICACION', payload.estratificacion, false);
      if (payload.saludMental) setCanonical('NUEVO_INGRESO', 'SALUD_MENTAL', payload.saludMental, false);
      if (payload.telefonos) setCanonical('NUEVO_INGRESO', 'TELEFONOS', payload.telefonos, false);
      if (payload.proximoControl) setCanonical('NUEVO_INGRESO', 'PROXIMO_CONTROL', payload.proximoControl, true);
      if (payload.observaciones) setCanonical('NUEVO_INGRESO', 'OBSERVACIONES', payload.observaciones, false);
    }
    if (seccion === 'REGISTRAR_CONTROL') {
      if (payload.fechaEvento) setCanonical('REGISTRAR_CONTROL', 'FECHA_EVENTO', payload.fechaEvento, true);
      if (payload.profesional) setCanonical('REGISTRAR_CONTROL', 'PROFESIONAL', payload.profesional, false);
      if (payload.profesionalSecundario) setCanonical('REGISTRAR_CONTROL', 'PROFESIONAL2', payload.profesionalSecundario, false);
      if (payload.proximoControl) setCanonical('REGISTRAR_CONTROL', 'PROXIMO_CONTROL', payload.proximoControl, true);
      if (payload.observaciones) setCanonical('REGISTRAR_CONTROL', 'OBSERVACIONES', payload.observaciones, false);
    }
    if (seccion === 'REGISTRAR_SEGUIMIENTO') {
      if (payload.fechaEvento) setCanonical('REGISTRAR_SEGUIMIENTO', 'FECHA_EVENTO', payload.fechaEvento, true);
      if (payload.profesional) setCanonical('REGISTRAR_SEGUIMIENTO', 'PROFESIONAL', payload.profesional, false);
      if (payload.profesionalSecundario) setCanonical('REGISTRAR_SEGUIMIENTO', 'PROFESIONAL2', payload.profesionalSecundario, false);
      if (payload.proximoControl) setCanonical('REGISTRAR_SEGUIMIENTO', 'PROXIMO_CONTROL', payload.proximoControl, true);
      if (payload.observaciones) setCanonical('REGISTRAR_SEGUIMIENTO', 'OBSERVACIONES', payload.observaciones, false);
    }
    if (seccion === 'ACTUALIZAR_DATOS') {
      if (payload.profesional) setCanonical('ACTUALIZAR_DATOS', 'PROFESIONAL', payload.profesional, false);
      if (payload.profesionalSecundario) setCanonical('ACTUALIZAR_DATOS', 'PROFESIONAL2', payload.profesionalSecundario, false);
      var telNuevo = valorActualizacion('TELEFONOS', payload.telefonos);
      var telObsNueva = valorActualizacion('TELEFONO_OBS', payload.telefonoObs);
      var proxNuevo = valorActualizacion('PROXIMO_CONTROL', payload.proximoControl);
      var smNueva = valorActualizacion('SALUD_MENTAL', payload.saludMental);
      var obsNueva = valorActualizacion('OBSERVACIONES', payload.observaciones);
      if (telNuevo) setCanonical('ACTUALIZAR_DATOS', 'TELEFONOS', telNuevo, false);
      if (telObsNueva) setCanonical('ACTUALIZAR_DATOS', 'TELEFONO_OBS', telObsNueva, false);
      if (proxNuevo) setCanonical('ACTUALIZAR_DATOS', 'PROXIMO_CONTROL', proxNuevo, true);
      if (smNueva) setCanonical('ACTUALIZAR_DATOS', 'SALUD_MENTAL', smNueva, false);
      if (obsNueva) setCanonical('ACTUALIZAR_DATOS', 'OBSERVACIONES', obsNueva, false);
    }
    // v255 (E19): cobertura de campos requeridos de la sección dentro del plan.
    Form_esquemaCanonial_().campos[seccion].forEach(function (campo) {
      if (!Form_campoRequerido_(seccion, campo)) return;
      var ck = Form_claveCanonicaItem_(seccion, campo);
      var cubierto = plan.some(function (pe) { return pe.canonicalKey === ck && pe.ok; });
      if (!cubierto) fallos.push(ck);
    });
    // v255 (E19): fail-closed — NADA se envía si algún campo aceptado falló.
    if (fallos.length) {
      return { ok: false, estado: 'ERROR', motivo: 'FORM_SCHEMA_DRIFT', failedAcceptedFields: fallos, plan: plan, formId: formId };
    }
    var submitted = response.submit();
    var rid = '';
    try { rid = String(submitted.getId()); } catch (e) {}
    var rts = '';
    try { var dt = submitted.getTimestamp(); rts = dt ? Control_aIso_(dt) : ''; } catch (e) {}
    return { ok: true, estado: 'RECIBIDO', responseId: rid, receivedAt: rts, plan: plan };
  } catch (e) {
    return { ok: false, estado: 'ERROR', motivo: String(e && e.message || e) };
  }
}

/** Entrypoint WebApp: recepción durable via Google Forms (cola). No procesa
 *  clínicamente. v255 (E05/E06/E07): dedupe por CLIENT_REQUEST_ID + reserva
 *  + confirmación de ACK. Sin PII en la respuesta. */
function WebApp_capturarRecibirDurable(payload, acceso) {
  try {
    var p = payload || {};
    var v = Form_validarPayloadTransporte_(p);
    if (!v.ok) return { ok: false, motivo: v.codigo || 'ACCION_INVALIDA', errores: v.errores || [] };
    var requId = '';
    if (p.clientRequestId && GOOGLE_FORMS_CONFIG.TRANSPORTE.PATRON_CLIENT_REQUEST_ID.test(String(p.clientRequestId))) {
      requId = String(p.clientRequestId);
    }
    // v256 (P0): con clientRequestId válido JAMÁS se envía sin reserva resuelta.
    if (requId) {
      var rsv = Form_reservarRequestIdConLock_(requId);
      if (rsv.estado === 'RECIBIDO') {
        return { ok: true, estado: 'RECIBIDO', data: { estado: 'RECIBIDO', responseId: rsv.responseId, deduped: true, yaRecibido: true } };
      }
      if (rsv.estado === 'EN_PROCESO') {
        return { ok: true, estado: 'EN_PROCESO', data: { estado: 'EN_PROCESO' } };
      }
      if (rsv.estado !== 'RESERVADO') {
        // Fail-closed: no hay evidencia sólida de reserva vigente. No se envía.
        return { ok: true, estado: 'INCIERTO', motivo: 'SERVICIO_OCUPADO',
          data: { estado: 'INCIERTO', motivo: 'SERVICIO_OCUPADO' } };
      }
    }
    var res = Form_crearRespuestaDesdePayloadWeb_(p);
    if (!res.ok) {
      if (requId) { try { var cache = Form_cache_(); if (cache) cache.remove(GOOGLE_FORMS_CONFIG.TRANSPORTE.CACHE_PREFIJO + requId); } catch (e4) {} }
      return { ok: false, motivo: res.motivo || 'ERROR_DURABLE', failedAcceptedFields: res.failedAcceptedFields || [] };
    }
    if (requId) Form_requestIdConfirmar_(requId, res.responseId);
    Form_propEscribir_('GOOGLE_FORM_LAST_RECEIVED_TS', String(Date.now()));
    // v256 (P1): NO se incrementa SUBMIT_SIGNAL_COUNT aquí. El contador del
    // panel se alimenta de Form_onFormSubmit_ para evitar doble conteo.
    return { ok: true, estado: 'RECIBIDO', data: { estado: 'RECIBIDO', responseId: res.responseId, receivedAt: res.receivedAt, deduped: false } };
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e) };
  }
}

/** v255 (E21): validación de transporte SIN lookup clínico. Reglas de formato,
 *  calendario real, whitelists y longitudes máximas. */
function Form_validarPayloadTransporte_(payload) {
  try {
    var p = payload || {};
    var errores = [];
    var acc = String(p.accion || '').toLowerCase();
    var valid = acc === 'nuevoingreso' || acc === 'registrarcontrol' || acc === 'registrarseguimiento' || acc === 'actualizardatos';
    if (!valid) return { ok: false, codigo: 'ACCION_INVALIDA', errores: [{ codigo: 'ACCION_INVALIDA' }] };

    function fechaReal(v) {
      if (v === undefined || v === null || String(v).trim() === '') return true;
      var s = String(v).trim();
      var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return false;
      var y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
      if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
      var dt = new Date(Date.UTC(y, mo - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
    }
    function rutBasico(v) {
      if (v === undefined || v === null) return false;
      var s = String(v).replace(/\./g, '').replace(/\s+/g, '');
      return /^\d{7,8}-?[\dkK]?$/.test(s) && s.length >= 8;
    }
    function longMax(v, max) { return v === undefined || v === null || String(v).length <= max; }

    // clientRequestId (opcional desde Web; vacío en Form directo).
    if (p.clientRequestId !== undefined && p.clientRequestId !== null && String(p.clientRequestId).trim() !== '') {
      var cri = String(p.clientRequestId).trim();
      if (!GOOGLE_FORMS_CONFIG.TRANSPORTE.PATRON_CLIENT_REQUEST_ID.test(cri)) errores.push({ codigo: 'CLIENT_REQUEST_ID_INVALIDO' });
    }
    // RUT.
    if (!rutBasico(p.rut)) errores.push({ codigo: 'RUT_INVALIDO' });
    // Longitudes máximas.
    if (!longMax(p.nombre, 200)) errores.push({ codigo: 'NOMBRE_LARGO' });
    if (!longMax(p.rut, 12)) errores.push({ codigo: 'RUT_LARGO' });
    if (!longMax(p.profesional, 120)) errores.push({ codigo: 'PROFESIONAL_LARGO' });
    if (!longMax(p.profesionalSecundario, 120)) errores.push({ codigo: 'PROFESIONAL_LARGO' });
    if (!longMax(p.telefonos, 300)) errores.push({ codigo: 'TELEFONOS_LARGO' });
    if (!longMax(p.observaciones, 2000)) errores.push({ codigo: 'OBSERVACIONES_LARGO' });
    // Fechas con calendario real.
    if (!fechaReal(p.fechaNacimiento)) errores.push({ codigo: 'FECHA_NACIMIENTO_INVALIDA' });
    if (!fechaReal(p.fechaIngreso)) errores.push({ codigo: 'FECHA_INGRESO_INVALIDA' });
    if (!fechaReal(p.fechaEvento)) errores.push({ codigo: 'FECHA_EVENTO_INVALIDA' });
    if (!fechaReal(p.proximoControl)) errores.push({ codigo: 'PROXIMO_CONTROL_INVALIDO' });
    // Whitelists (vacío válido para opcionales).
    var listas = [
      ['sector', ['NARANJO', 'AMARILLO', 'VERDE', 'MULTIPLE']],
      ['sexo', ['M', 'F', 'OTRO']],
      ['estratificacion', ['G1', 'G2', 'G3']],
      ['saludMental', ['SI', 'NO']]
    ];
    for (var li = 0; li < listas.length; li++) {
      var clave = listas[li][0], permitidos = listas[li][1];
      var val = String(p[clave] || '').trim().toUpperCase();
      if (val !== '' && permitidos.indexOf(val) === -1) errores.push({ codigo: clave.toUpperCase() + '_INVALIDO' });
    }
    // actualizacion: si viene como estructura (editor), debe ser válida. La Web
    // App también transporta campos sueltos del formulario (telefonos,
    // proximoControl, observaciones) sin el objeto estructurado; ambos formatos
    // son válidos y el builder resuelve uno u otro.
    if (acc === 'actualizardatos' && p.actualizacion !== undefined && p.actualizacion !== null) {
      var a = p.actualizacion;
      if (typeof a !== 'object' || !a.campos || typeof a.campos !== 'object') {
        errores.push({ codigo: 'ACTUALIZACION_INVALIDA' });
      } else {
        Object.keys(a.campos).forEach(function (ck) {
          var cel = a.campos[ck];
          if (!cel || typeof cel !== 'object' || cel.valor === undefined) errores.push({ codigo: 'ACTUALIZACION_CAMPO_INVALIDO:' + ck });
        });
      }
    }
    if (errores.length) return { ok: false, codigo: 'VALIDATION_ERROR', errores: errores };
    return { ok: true };
  } catch (e) { return { ok: false, codigo: 'VALIDATION_ERROR', errores: [{ codigo: 'VALIDATION_ERROR' }] }; }
}

function Form_fechaLocalDesdeIso_(iso) {
  try {
    var s = String(iso || '').trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10), 12, 0, 0);
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch (e) { return null; }
}
