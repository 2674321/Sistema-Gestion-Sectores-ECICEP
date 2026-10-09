// ---------------------------------------------------------------------------
// 36_FormsCanal.js — Canal Google Forms (v253 — DEC-107).
//
// Google Forms es el canal PRINCIPAL y durable de captura. Se conserva la
// infraestructura legacy de Forms como tecnología base (idea del 24_Formulario)
// pero el canal operativo instalado aquí es NUEVO y separado:
//   * Form_operativoInstalar  → crea/arregla el Form, el esquema, el itemMap,
//     el trigger onFormSubmit, y migra las columnas de transporte.
//   * Form_onFormSubmit       → ingesta por envío (evento de Forms).
//   * Form_worker             → cola durable: reanuda lo que el trigger no pudo.
//   * Form_reconciliarTransporte → clasifica envíos no procesados (dryRun).
//   * Form_syncCatalogos      → sincroniza sectores/profesionales/estratificación
//     desde las fuentes oficiales (feed de opciones del Form).
//
// La cola física es FORM_RESPUESTAS (misma hoja técnica del pipeline V2) y el
// procesamiento SIEMPRE pasa por CapturaIngress_* → Captura_v2_enviar. NO se
// crea un segundo pipeline ni una segunda base de datos.
//
// Configuración operativa (ScriptProperties, nunca en Git):
//   GOOGLE_FORM_ID, GOOGLE_FORM_URL, GOOGLE_FORM_EDIT_URL,
//   GOOGLE_FORM_SCHEMA_VERSION, GOOGLE_FORM_ITEM_MAP, GOOGLE_FORM_TITLE_MAP,
//   GOOGLE_FORM_ESTADO, GOOGLE_FORM_CURSOR, GOOGLE_FORM_ERRORS|<captureId>,
//   GOOGLE_FORM_METRIC_<clave>  (LOCK_BUSY_DEFERRED, WORKER_RUNS, ...)
// Estáticos en GOOGLE_FORMS_CONFIG (00_Config.js).
// ---------------------------------------------------------------------------

var GOOGLE_FORMS_PROPS = ['GOOGLE_FORM_ID', 'GOOGLE_FORM_URL', 'GOOGLE_FORM_EDIT_URL',
  'GOOGLE_FORM_SCHEMA_VERSION', 'GOOGLE_FORM_ITEM_MAP', 'GOOGLE_FORM_TITLE_MAP',
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
function Form_json_(raw) {
  if (!raw) return {};
  try { var o = JSON.parse(raw); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}

/** Métricas del canal (contadores, no PII). */
function Form_metricas_() {
  var claves = ['LOCK_BUSY_DEFERRED', 'WORKER_RUNS', 'WORKER_PROCESSED', 'WORKER_ERRORS', 'DEFERRED_COUNT', 'OLDEST_PENDING_MIN'];
  var out = {};
  claves.forEach(function (k) {
    var v = Form_propLeer_('GOOGLE_FORM_METRIC_' + k);
    out[k] = v ? Number(v) : 0;
  });
  return out;
}
function Form_metricaSumar_(clave, delta) {
  var v = Number(Form_propLeer_('GOOGLE_FORM_METRIC_' + clave)) || 0;
  Form_propEscribir_('GOOGLE_FORM_METRIC_' + clave, String(v + (delta === undefined ? 1 : delta)));
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
  var secciones = ['NUEVO_INGRESO', 'REGISTRAR_CONTROL', 'REGISTRAR_SEGUIMIENTO'];
  var camposPorSeccion = {
    NUEVO_INGRESO: ['RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'SECTOR', 'ESTRATIFICACION', 'TELEFONOS', 'PROFESIONAL', 'PROFESIONAL2', 'OBSERVACIONES'],
    REGISTRAR_CONTROL: ['RUT', 'FECHA_EVENTO', 'PROFESIONAL', 'PROFESIONAL2', 'OBSERVACIONES'],
    REGISTRAR_SEGUIMIENTO: ['RUT', 'FECHA_EVENTO', 'PROFESIONAL', 'PROFESIONAL2', 'OBSERVACIONES']
  };
  return { secciones: secciones, campos: camposPorSeccion };
}

/** PRIVADO (puro): etiqueta/ítems de opción del FormApp según el tipo. */
function Form_tipoItem_(campo) {
  if (campo === 'SEXO' || campo === 'SECTOR' || campo === 'ESTRATIFICACION' || campo === 'PROFESIONAL' || campo === 'PROFESIONAL2') return 'LISTA';
  if (campo === 'FECHA_NACIMIENTO' || campo === 'FECHA_EVENTO') return 'FECHA';
  if (campo === 'OBSERVACIONES') return 'PARRAFO';
  return 'TEXTO';
}

/** GAS: construye o repara el esquema del Form. Idempotente: detecta items
 *  existentes por título y solo agrega los faltantes; nunca duplica. */
function Form_construirSchema_(form, opciones) {
  opciones = opciones || {};
  var cambios = [];
  var map = Form_esquemaCanonial_();
  var items = [];
  try { items = form.getItems(); } catch (e) { items = []; }
  var titulos = {};
  items.forEach(function (it) { titulos[it.getTitle()] = it; });

  var CFG = GOOGLE_FORMS_CONFIG;
  function opcionesTipo(campo, oficiales) {
    if (campo === 'SECTOR') return oficiales.sectores || [];
    if (campo === 'PROFESIONAL') return oficiales.profesionales || [];
    return (CFG.CAMPOS[campo] && CFG.CAMPOS[campo].opciones) || [];
  }
  function establecerOpciones(item, valores, requerido) {
    if (!item || !valores || !valores.length) return;
    if (item.setChoices) {
      var chs = valores.map(function (o) { return item.createChoice(String(o)); });
      item.setChoices(chs);
    }
    if (item.setRequired) item.setRequired(!!requerido);
  }

  // 1) Acción (navegación por secciones).
  var accionItem = titulos[CFG.ACCIONES.TITULO] || form.addMultipleChoiceItem();
  accionItem.setTitle(CFG.ACCIONES.TITULO);
  accionItem.setHelpText('Elegí qué deseás registrar y luego completá la sección correspondiente.');
  accionItem.setRequired(true);
  if (!titulos[CFG.ACCIONES.TITULO]) cambios.push('Item creado: ' + CFG.ACCIONES.TITULO);

  // 2) Por sección: página + campos + cierre, en orden real.
  map.secciones.forEach(function (sec) {
    var page = titulos[sec];
    if (!page) { page = form.addPageBreakItem().setTitle(sec); cambios.push('Sección creada: ' + sec); }
    var choicesGo = [];
    if (accionItem.setChoices && accionItem.getChoices) {
      try { choicesGo = accionItem.getChoices(); } catch (e) { choicesGo = []; }
    }
    var yaCon = choicesGo.some(function (c) { return String(c.getValue()) === sec; });
    if (!yaCon) {
      var et = CFG.ACCIONES.OPCIONES[sec] ? CFG.ACCIONES.OPCIONES[sec].etiqueta : sec;
      choicesGo.push(accionItem.createChoice(et, page));
      accionItem.setChoices(choicesGo);
    }

    map.campos[sec].forEach(function (campo) {
      var cfg = CFG.CAMPOS[campo] || { etiqueta: campo, opciones: [] };
      var titulo = cfg.etiqueta || campo;
      var requerido = campo !== 'ESTRATIFICACION' && campo !== 'TELEFONOS' && campo !== 'PROFESIONAL2' && campo !== 'OBSERVACIONES';
      var tipo = Form_tipoItem_(campo);
      var it = titulos[titulo];
      if (!it) {
        try {
          if (tipo === 'LISTA') it = form.addListItem().setTitle(titulo);
          else if (tipo === 'FECHA') it = form.addDateItem().setTitle(titulo);
          else if (tipo === 'PARRAFO') it = form.addParagraphTextItem().setTitle(titulo);
          else it = form.addTextItem().setTitle(titulo);
          cambios.push('Campo creado: ' + campo);
        } catch (e) { return; }
      }
      if (tipo === 'LISTA') establecerOpciones(it, opcionesTipo(campo, opciones), requerido);
      else if (it.setRequired) it.setRequired(requerido);
    });

    // Cierre de cada sección (SUBMIT/RESTART).
    var cierreT = 'Enviar respuesta';
    var cierre = titulos[cierreT] ? null : null;
    if (form.getItems) {
      try { cierre = form.getItems().filter(function (x) { return x.getTitle() === cierreT; })[0]; } catch (e) { cierre = null; }
    }
    if (!cierre) { cierre = form.addMultipleChoiceItem().setTitle(cierreT); cambios.push('Cierre creado: ' + cierreT); }
    cierre.setRequired(true);
    try {
      var chEnviar = cierre.createChoice(CFG.TITULO_CIERRE, FormApp.PageNavigationType.SUBMIT);
      var chVolver = cierre.createChoice('Corregir o cambiar acción', FormApp.PageNavigationType.RESTART);
      cierre.setChoices([chEnviar, chVolver]);
    } catch (e) { /* navegación no crítica en re-mix */ }
  });

  return { ok: true, cambios: cambios };
}

/** GAS: devuelve el Form operativo (creándolo si hace falta). */
function Form_abrirOCrear_(formId, titulo, cambios) {
  if (formId) {
    try { return { ok: true, form: FormApp.openById(formId), creado: false }; } catch (e) { /* recrear */ }
  }
  var f = null;
  try { f = FormApp.create(titulo || GOOGLE_FORMS_CONFIG.TITULO); } catch (e) { return { ok: false, motivo: 'FORM_APP_NO_DISPONIBLE' }; }
  try { f.setTitle(titulo || GOOGLE_FORMS_CONFIG.TITULO); } catch (e3) { /* seguir */ }
  cambios.push('Form creado: ' + (titulo || GOOGLE_FORMS_CONFIG.TITULO));
  return { ok: true, form: f, creado: true };
}

/** PRIVADO (puro): mapa título→campo y itemId→campo del schema instalado. */
function Form_mapaTitulos_() {
  var m = {};
  m[Utl_claveAlnum(GOOGLE_FORMS_CONFIG.ACCIONES.TITULO)] = 'ACCION';
  Object.keys(GOOGLE_FORMS_CONFIG.CAMPOS).forEach(function (c) {
    m[Utl_claveAlnum(GOOGLE_FORMS_CONFIG.CAMPOS[c].etiqueta || c)] = c;
  });
  return m;
}
function Form_itemMap_(form) {
  var m = Form_mapaTitulos_();
  var out = {};
  try {
    form.getItems().forEach(function (it) {
      var c = m[Utl_claveAlnum(it.getTitle())];
      if (c) out[String(it.getId())] = c;
    });
  } catch (e) { /* sin id */ }
  return out;
}

/**
 * GAS: instalador del canal Google Forms — idempotente.
 * Crea/arregla: hoja FORM_RESPUESTAS (28 columnas + transporte) → Form y schema
 * → propiedades operativas → trigger onFormSubmit → catálogos.
 * Invocable repetidamente sin duplicar nada.
 */
function Form_operativoInstalar(opciones) {
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
    hoja.getRange(1, 1, 1, Form_columnas().length).setValues([Form_columnas()]);
    cambios.push('Encabezados FORM_RESPUESTAS creados (28 columnas)');
  } else if (typeof Captura_v2_asegurarColumnasTransporte_ === 'function') {
    var antes = hoja.getLastColumn();
    Captura_v2_asegurarColumnasTransporte_(hoja);
    if (hoja.getLastColumn() > antes) cambios.push('Columnas de transporte anexadas');
  }
  try {
    var encFisico = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var clavesReales = encFisico.map(Utl_claveAlnum);
    var requieridas = Form_columnas().map(function (c) { return Utl_claveAlnum(c); });
    var faltan = requieridas.filter(function (c) { return clavesReales.indexOf(c) === -1; });
    var duplicadas = requieridas.filter(function (c) { return clavesReales.filter(function (x) { return x === c; }).length > 1; });
    if (faltan.length || duplicadas.length) {
      return { ok: false, motivo: 'ESQUEMA_CAPTURA_REQUIERE_REVISION', cambios: cambios, faltan: faltan, duplicadas: duplicadas };
    }
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e), cambios: cambios };
  }

  // 2) Form + schema.
  var abierto = Form_abrirOCrear_(Form_formId_(), GOOGLE_FORMS_CONFIG.TITULO, cambios);
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

  var catOpciones = {};
  try { catOpciones.sectores = (typeof SECTORES_RESPONSABLES !== 'undefined') ? SECTORES_RESPONSABLES : []; } catch (e3) { catOpciones.sectores = []; }
  catOpciones.profesionales = [];
  try { catOpciones.profesionales = (typeof Captura_v2_catalogo === 'function') ? Captura_v2_catalogo() : []; } catch (e4) { catOpciones.profesionales = []; }
  var schema = Form_construirSchema_(form, catOpciones);
  cambios = cambios.concat(schema.cambios || []);

  // 3) Propiedades operativas.
  var itemMap = Form_itemMap_(form);
  var urlResp = '', urlEdit = '';
  try { urlResp = form.getPublishedUrl(); } catch (e) { urlResp = ''; }
  try { urlEdit = form.getEditUrl(); } catch (e) { urlEdit = ''; }

  Form_propEscribir_('GOOGLE_FORM_ID', form.getId());
  Form_propEscribir_('GOOGLE_FORM_URL', urlResp);
  Form_propEscribir_('GOOGLE_FORM_EDIT_URL', urlEdit);
  Form_propEscribir_('GOOGLE_FORM_SCHEMA_VERSION', GOOGLE_FORMS_CONFIG.SCHEMA_VERSION);
  Form_propEscribir_('GOOGLE_FORM_ITEM_MAP', JSON.stringify(itemMap));
  Form_propEscribir_('GOOGLE_FORM_TITLE_MAP', JSON.stringify(Form_mapaTitulos_()));
  Form_propEscribir_('GOOGLE_FORM_ESTADO', 'INSTALADO');
  if (!Form_propLeer_('GOOGLE_FORM_CURSOR')) Form_propEscribir_('GOOGLE_FORM_CURSOR', '');

  // 4) Trigger onFormSubmit (idempotente: exactamente 1 por handler).
  var trigger = { presente: false, creado: false };
  if (typeof ScriptApp !== 'undefined') {
    try {
      var triggers = ScriptApp.getProjectTriggers();
      var ya = triggers.filter(function (t) { return t.getHandlerFunction() === 'Form_onFormSubmit'; });
      trigger.presente = ya.length > 0;
      if (!trigger.presente) {
        ScriptApp.newTrigger('Form_onFormSubmit').forForm(form).onFormSubmit().create();
        trigger.creado = true;
        cambios.push('Trigger onFormSubmit creado');
      }
      if (ya.length > 1) {
        for (var ti = 1; ti < ya.length; ti++) {
          try { ScriptApp.deleteTrigger(ya[ti]); } catch (e) { /* tolerante */ }
        }
        cambios.push('Triggers duplicados eliminados');
      }
    } catch (e) {
      trigger.motivo = String(e && e.message || e);
    }
  }

  // 5) Catálogos del Form (opciones).
  var catalogoRes = Form_syncCatalogos({ form: form });
  cambios = cambios.concat(catalogoRes.cambios || []);

  return {
    ok: true, motivo: 'INSTALADO', creado: abierto.creado,
    formId: form.getId(), url: urlResp, editUrl: urlEdit,
    schemaVersion: GOOGLE_FORMS_CONFIG.SCHEMA_VERSION,
    cambios: cambios, trigger: trigger,
    catalogo: { sectores: (catOpciones.sectores || []).length, profesionales: (catOpciones.profesionales || []).length },
    nota: 'Google Forms instalado como canal principal de captura (DEC-107).'
  };
}

/** GAS: sincroniza las opciones de los items desde las fuentes oficiales. */
function Form_syncCatalogos(opciones) {
  opciones = opciones || {};
  var cambios = [];
  var form = opciones.form;
  if (!form && typeof FormApp !== 'undefined') {
    var fid = Form_formId_();
    if (!fid) return { ok: false, motivo: 'NO_INSTALADO', cambios: cambios };
    try { form = FormApp.openById(fid); } catch (e) { return { ok: false, motivo: 'FORM_NO_ACCESIBLE', cambios: cambios }; }
  }
  if (!form) return { ok: false, motivo: 'SOLO_GAS', cambios: cambios };

  var sectores = (typeof SECTORES_RESPONSABLES !== 'undefined') ? SECTORES_RESPONSABLES : [];
  var profesionales = [];
  try {
    if (typeof Captura_v2_catalogo === 'function') profesionales = Captura_v2_catalogo() || [];
    else if (typeof Profesionales_catalogo === 'function') profesionales = Profesionales_catalogo() || [];
  } catch (e) { profesionales = []; }
  var nombresProf = profesionales.filter(function (p) { return p && p.ACTIVO !== false; })
    .map(function (p) { return String(p.NOMBRE || p.nombre || ''); }).filter(Boolean);

  var fuentes = ['SECTOR', 'PROFESIONAL'];
  try {
    var items = form.getItems();
    items.forEach(function (it) {
      var t = it.getTitle();
      var campo = null;
      if (t === GOOGLE_FORMS_CONFIG.CAMPOS.SECTOR.etiqueta) campo = 'SECTOR';
      else if (t === GOOGLE_FORMS_CONFIG.CAMPOS.PROFESIONAL.etiqueta) campo = 'PROFESIONAL';
      if (!campo || fuentes.indexOf(campo) === -1) return;
      var valores = campo === 'SECTOR' ? sectores : nombresProf;
      if (!valores.length || !it.setChoices) return;
      var chs = valores.map(function (o) { return it.createChoice(String(o)); });
      it.setChoices(chs);
      cambios.push('Catálogo aplicado: ' + t);
    });
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e), cambios: cambios };
  }
  return { ok: true, cambios: cambios, sectores: sectores.length, profesionales: nombresProf.length };
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
      campo = itemMap[id] || titleMap[Utl_claveAlnum(titulo)] || '';
    }
    if (!campo) continue;
    var raw = '';
    try { var r = ir.getResponse(); raw = Array.isArray(r) ? r.join('\n') : String(r === null ? '' : r); } catch (e4) { raw = ''; }
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

/** GAS: registra un fallo de transporte legible por la reconciliación. */
function Form_registrarErrorTransporte_(captureId, errores) {
  try {
    Form_propEscribir_('GOOGLE_FORM_ERRORS|' + captureId, JSON.stringify({
      ts: Date.now(), errores: (errores || []).slice(0, 5)
    }));
  } catch (e) { /* no bloquea */ }
}

/** PURA/GAS: salto definitivo si ya falló antes (evita reprocesos infinitos). */
function Form_errorTransporteVisto_(captureId, ventanaMin) {
  var raw = Form_propLeer_('GOOGLE_FORM_ERRORS|' + captureId);
  if (!raw) return false;
  try {
    var d = Form_json_(raw);
    if (d && d.ts) {
      var edad = (Date.now() - Number(d.ts)) / 60000;
      return edad < (ventanaMin || GOOGLE_FORMS_CONFIG.RECONCILIACION.CADUCIDAD_MIN);
    }
  } catch (e) { /* corrupto → reprocesar */ }
  return false;
}

/** GAS: procesa una respuesta del Form (1 envío → pipeline V2). */
function Form_procesarUnaRespuesta_(respuesta, ctx, opciones) {
  opciones = opciones || {};
  var captureId = CapturaIngress_captureId_(respuesta.formId, respuesta.responseId);
  if (Form_errorTransporteVisto_(captureId)) {
    return { ok: false, captureId: captureId, errores: [{ codigo: 'YA_DESCARTADO' }], descartado: true };
  }
  var ad = CapturaIngress_adapterForms({
    formId: respuesta.formId, responseId: respuesta.responseId,
    timestamp: respuesta.timestamp, accion: respuesta.accion, campos: respuesta.campos
  }, { catalogo: ctx.catalogo, hoy: opciones.hoy });
  if (!ad.ok) {
    Form_registrarErrorTransporte_(captureId, ad.errores);
    return { ok: false, captureId: captureId, errores: ad.errores };
  }
  var r = CapturaIngress_enviar(ad.payload, ctx, 'GOOGLE_FORMS');
  if (!r.ok) {
    return { ok: false, captureId: captureId, errores: r.errors || [{ codigo: 'PIPELINE' }] };
  }
  return { ok: true, captureId: captureId, accion: ad.accion, estado: (r.data && r.data.estado) || 'PROCESADO' };
}

/** GAS: trigger onFormSubmit — ingesta por envío (ruta rápida). */
function Form_onFormSubmit(e) {
  var inicio = Date.now();
  var formId = Form_formId_();
  if (!formId) return { ok: false, errores: [{ codigo: 'NO_INSTALADO' }] };
  var resp = e && e.response;
  if (!resp) return { ok: false, errores: [{ codigo: 'SIN_RESPONSE' }] };

  var responseId = '';
  try { responseId = String(resp.getId()); } catch (e3) { responseId = ''; }
  var ts = '';
  try { var dts = resp.getTimestamp(); ts = dts ? Control_aIso(dts) : ''; } catch (e4) { ts = ''; }

  var lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      Form_metricaSumar_('LOCK_BUSY_DEFERRED');
      return { ok: false, deferred: true, errores: [{ codigo: 'DEFERRED_LOCK_BUSY' }] };
    }
    var it = Form_extraerCampos_(resp, {
      itemMap: Form_json_(Form_propLeer_('GOOGLE_FORM_ITEM_MAP')),
      titleMap: Form_json_(Form_propLeer_('GOOGLE_FORM_TITLE_MAP'))
    });
    var ctx = CapturaIngress_ctx();
    var r = Form_procesarUnaRespuesta_({ formId: formId, responseId: responseId, timestamp: ts, accion: it.accion, campos: it.campos }, ctx, { hoy: ts });
    if (r.ok) Form_metricaSumar_('WORKER_PROCESSED');
    Form_propEscribir_('GOOGLE_FORM_CURSOR', ts || String(inicio));
    return { ok: r.ok, captureId: r.captureId, accion: r.accion, estado: r.estado, errores: r.errores, timeMs: Date.now() - inicio, deferred: false };
  } catch (e) {
    Form_metricaSumar_('WORKER_ERRORS');
    return { ok: false, errores: [{ codigo: 'EXCEPCION', mensaje: String(e && e.message || e) }] };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ }
  }
}

function Form_desdeCursor_() {
  var cursor = Form_propLeer_('GOOGLE_FORM_CURSOR');
  if (!cursor) return new Date(0);
  var d = new Date(cursor);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/** GAS: worker de cola — reanuda respuestas del Form no procesadas (idempotente). */
function Form_worker(opciones) {
  opciones = opciones || {};
  if (opciones.simular) return opciones.simular();
  if (typeof LockService === 'undefined') return { ok: false, motivo: 'SOLO_GAS' };
  var formId = opciones.formId || Form_formId_();
  if (!formId) return { ok: false, motivo: 'NO_INSTALADO' };
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(12000)) {
      return { ok: false, motivo: 'DEFERRED_LOCK_BUSY', procesadas: 0, lock: false };
    }
    Form_metricaSumar_('WORKER_RUNS');
    var form = FormApp.openById(formId);
    var respuestas = [];
    try { respuestas = form.getResponses(Form_desdeCursor_()) || []; } catch (e) { respuestas = []; }

    var procesadas = 0, errores = 0, filas = [];
    var ctx = CapturaIngress_ctx();
    try { ctx.leerPacientes = Modelo_leerPacientes; } catch (e) { /* opcional */ }

    var limite = opciones.max || GOOGLE_FORMS_CONFIG.WORKER.MAX_POR_CORRIDA;
    for (var i = 0; i < respuestas.length && procesadas + errores < limite; i++) {
      var resp = respuestas[i];
      var responseId = '';
      try { responseId = String(resp.getId()); } catch (e2) { responseId = ''; }
      var ts = '';
      try { var dts = resp.getTimestamp(); ts = dts ? Control_aIso(dts) : ts; } catch (e3) { ts = ''; }
      var cid = CapturaIngress_captureId_(formId, responseId);
      if (opciones.yaProcesado && opciones.yaProcesado(cid)) continue;
      var it = Form_extraerCampos_(resp, {
        itemMap: Form_json_(Form_propLeer_('GOOGLE_FORM_ITEM_MAP')),
        titleMap: Form_json_(Form_propLeer_('GOOGLE_FORM_TITLE_MAP'))
      });
      var r = Form_procesarUnaRespuesta_({ formId: formId, responseId: responseId, timestamp: ts, accion: it.accion, campos: it.campos }, ctx, { hoy: ts });
      if (r.ok) procesadas++; else errores++;
      filas.push({ responseId: responseId, captureId: cid || r.captureId, ok: r.ok, accion: r.accion || '', estado: r.estado || '', errores: r.errores || [] });
      Form_propEscribir_('GOOGLE_FORM_CURSOR', ts);
    }
    if (procesadas) Form_metricaSumar_('WORKER_PROCESSED', procesadas);
    if (errores) Form_metricaSumar_('WORKER_ERRORS', errores);
    return { ok: true, procesadas: procesadas, errores: errores, restantes: respuestas.length - procesadas - errores, lock: true, filas: filas };
  } catch (e) {
    Form_metricaSumar_('WORKER_ERRORS');
    return { ok: false, motivo: String(e && e.message || e), procesadas: 0 };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ }
  }
}

// ---------------------------------------------------------------------------
// RECONCILIACIÓN (dryRun) y DIAGNÓSTICO
// ---------------------------------------------------------------------------

/**
 * GAS: clasifica envíos del Form que no llegaron a procesarse.
 * dryRun=true (default): solo lee y clasifica, NO escribe NADA.
 * devuelve: {ok, dryRun, analizados, nuevos[], yaEnCola[], ausentes[], fallidos[]}
 */
function Form_reconciliarTransporte(opciones) {
  opciones = opciones || {};
  var dryRun = opciones.dryRun !== false;
  var formId = opciones.formId || Form_formId_();
  if (!formId) return { ok: false, motivo: 'NO_INSTALADO' };
  var form = FormApp.openById(formId);
  var respuestas = [];
  try {
    respuestas = form.getResponses(new Date(Date.now() - GOOGLE_FORMS_CONFIG.RECONCILIACION.VENTANA_HS * 3600000));
  } catch (e) { respuestas = []; }

  var leerEnCola = opciones.leerEnCola || function (cid) {
    try { if (typeof Captura_v2_buscarRegistro === 'function') return !!Captura_v2_buscarRegistro(cid); } catch (e2) { /* n/d */ }
    return false;
  };
  var nuevos = [], yaEnCola = [], ausentes = [], fallidos = [];
  for (var i = 0; i < respuestas.length; i++) {
    var resp = respuestas[i];
    var responseId = '';
    try { responseId = String(resp.getId()); } catch (e2) { responseId = ''; }
    if (!responseId) continue;
    var cid = CapturaIngress_captureId_(formId, responseId);
    if (Form_errorTransporteVisto_(cid, 24 * 60)) { fallidos.push({ responseId: responseId, captureId: cid, estado: 'RECHAZADO_EN_ADAPTADOR' }); continue; }
    if (leerEnCola(cid)) { yaEnCola.push({ responseId: responseId, captureId: cid, estado: 'EN_COLA_ORDENADA' }); continue; }
    nuevos.push({ responseId: responseId, captureId: cid, estado: 'SIN_PROCESAR' });
  }
  return { ok: true, dryRun: dryRun, analizados: respuestas.length, nuevos: nuevos, yaEnCola: yaEnCola, ausentes: ausentes, fallidos: fallidos };
}

/** GAS: estado operativo del canal (sin datos clínicos). */
function Form_operativoEstado(opciones) {
  opciones = opciones || {};
  var formId = Form_formId_();
  var metricas = Form_metricas_();
  var trigger = null;
  if (typeof ScriptApp !== 'undefined') {
    try {
      trigger = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'Form_onFormSubmit'; }).length;
    } catch (e) { trigger = -1; }
  }
  var info = {};
  if (formId && typeof FormApp !== 'undefined') {
    try {
      var form = FormApp.openById(formId);
      info.titulo = form.getTitle();
      try { info.respuestas = form.getResponses().length; } catch (e) { /* opcional */ }
    } catch (e) { info.error = String(e && e.message || e); }
  }
  var oldest = metricas.OLDEST_PENDING_MIN;
  var deferredTs = Number(Form_propLeer_('GOOGLE_FORM_METRIC_DEFERRED_TS')) || 0;
  if (deferredTs) oldest = Math.round((Date.now() - deferredTs) / 60000);
  return {
    ok: true,
    instalado: !!formId,
    formId: formId,
    url: Form_urlRespondedor_(),
    schemaVersion: Number(Form_propLeer_('GOOGLE_FORM_SCHEMA_VERSION')) || 0,
    cursor: Form_propLeer_('GOOGLE_FORM_CURSOR'),
    triggerOnFormSubmit: trigger,
    metricas: metricas,
    backlog: { oldestPendingMin: oldest, pendientes: 0 },
    form: info,
    canal: 'GOOGLE_FORMS'
  };
}

/** GAS: diagnóstico de instalación del canal (sin mutar nada). */
function Form_operativoDiagnosticar(opciones) {
  var estado;
  try { estado = Form_operativoEstado(opciones); } catch (e) { estado = { ok: false, motivo: String(e && e.message || e) }; }
  var checks = [
    { nombre: 'form_id', ok: !!(estado.formId), detalle: estado.formId || 'Sin Form configurado (ejecutar Form_operativoInstalar)' },
    { nombre: 'schema_version', ok: estado.schemaVersion === GOOGLE_FORMS_CONFIG.SCHEMA_VERSION, detalle: 'Schema v' + estado.schemaVersion + ' / esperada v' + GOOGLE_FORMS_CONFIG.SCHEMA_VERSION },
    { nombre: 'trigger', ok: (estado.triggerOnFormSubmit || 0) === 1, detalle: 'Triggers onFormSubmit: ' + (estado.triggerOnFormSubmit === null ? 'n/d' : estado.triggerOnFormSubmit) },
    { nombre: 'url', ok: !!estado.url, detalle: estado.url || 'Sin URL de respondedor' }
  ];
  var hojaOk = false;
  if (typeof SpreadsheetApp !== 'undefined') {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var h = ss.getSheetByName(HOJAS.FORM_RESPUESTAS);
      hojaOk = !!(h && h.getLastColumn() >= Form_columnas().length);
    } catch (e) { hojaOk = false; }
  }
  checks.push({ nombre: 'columnas', ok: hojaOk, detalle: hojaOk ? 'FORM_RESPUESTAS con ' + Form_columnas().length + ' columnas' : 'FORM_RESPUESTAS incompleta' });
  return { ok: estado.ok !== false && checks.every(function (c) { return c.ok; }), checks: checks, estado: estado, versionSistema: ECICEP.VERSION };
}

/** GAS: panel administrativo del canal (HTML). */
function UI_googleFormsPanel() {
  var html = HtmlService.createHtmlOutputFromFile('GoogleFormsPanel');
  html.setTitle('Google Forms — Canal de captura ECICEP');
  return html;
}