// ---------------------------------------------------------------------------
// 36_FormsCanal.js — Transporte durable Google Forms (v253 — DEC-106).
//
// Google Forms es el transporte durable interno detrás de CapturaWeb. Se conserva
// infraestructura legacy de Forms como tecnología base (idea del 24_Formulario),
// pero la pieza instalada aquí no es una interfaz operativa separada:
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
//   GOOGLE_FORM_SCHEMA_VERSION, GOOGLE_FORM_ITEM_MAP, GOOGLE_FORM_CANONICAL_ITEM_MAP,
//   GOOGLE_FORM_TITLE_MAP,
//   GOOGLE_FORM_ESTADO, GOOGLE_FORM_CURSOR, GOOGLE_FORM_ERRORS|<captureId>,
//   GOOGLE_FORM_METRIC_<clave>  (LOCK_BUSY_DEFERRED, WORKER_RUNS, ...)
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
function Form_json_(raw) {
  if (!raw) return {};
  try { var o = JSON.parse(raw); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}

/** Métricas del canal (contadores, no PII). */
function Form_metricas_() {
  var claves = ['LOCK_BUSY_DEFERRED', 'WORKER_RUNS', 'WORKER_PROCESSED', 'WORKER_ERRORS',
    'WORKER_RETRYABLE', 'WORKER_REVIEW', 'WORKER_TERMINAL', 'DEFERRED_COUNT', 'OLDEST_PENDING_MIN'];
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
  var map = Form_esquemaCanonial_();
  var idx = Form_indexarSchema_(form);

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
  var accionItem = idx.accionItem || form.addMultipleChoiceItem();
  accionItem.setTitle(CFG.ACCIONES.TITULO);
  accionItem.setHelpText('Elegí qué deseás registrar y luego completá la sección correspondiente.');
  accionItem.setRequired(true);
  if (!idx.accionItem) cambios.push('Item creado: ' + CFG.ACCIONES.TITULO);

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
      if (tipo === 'LISTA') establecerOpciones(it, opcionesTipo(campo, opciones), requerido);
      else if (it.setRequired) it.setRequired(requerido);
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
  m[Utl_claveAlnum(GOOGLE_FORMS_CONFIG.ACCIONES.TITULO)] = 'ACCION';
  Object.keys(GOOGLE_FORMS_CONFIG.CAMPOS).forEach(function (c) {
    m[Utl_claveAlnum(GOOGLE_FORMS_CONFIG.CAMPOS[c].etiqueta || c)] = c;
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
    else if (seccion && titulo === 'Enviar') incompatibles.push(key + ':ITEM_ARTIFICIAL_OBSOLETO');
    else {
      var campo = tituloCampo[Utl_claveAlnum(titulo)];
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
  estado.onFormSubmit = asegurar('Form_onFormSubmit', function () {
    ScriptApp.newTrigger('Form_onFormSubmit').forForm(form).onFormSubmit().create();
  });
  estado.worker = asegurar('Form_worker', function () {
    ScriptApp.newTrigger('Form_worker').timeBased().everyMinutes(5).create();
  });
  return estado;
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

  var auditoriaSchema = Form_auditarSchema_(form);
  var migracionSchema = Form_reconstruirSiVacio_(form, auditoriaSchema, cambios);
  if (!migracionSchema.ok) return {
    ok: false, motivo: migracionSchema.motivo, formId: form.getId(),
    respuestasConservadas: true, duplicadas: migracionSchema.duplicadas || [],
    incompatibles: migracionSchema.incompatibles || [], cambios: cambios
  };

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
  Form_propEscribir_('GOOGLE_FORM_CANONICAL_ITEM_MAP', JSON.stringify(Form_construirCanonicalItemMap_(form)));
  Form_propEscribir_('GOOGLE_FORM_TITLE_MAP', JSON.stringify(Form_mapaTitulos_()));
  Form_propEscribir_('GOOGLE_FORM_ESTADO', 'INSTALADO');
  if (!Form_propLeer_('GOOGLE_FORM_CURSOR')) Form_propEscribir_('GOOGLE_FORM_CURSOR', '');

  // 4) Trigger rápido + worker durable (exactamente uno de cada handler).
  var trigger = { onFormSubmit: 0, worker: 0, creados: [] };
  try { trigger = Form_asegurarTriggers_(form, cambios); }
  catch (e5) { trigger.motivo = String(e5 && e5.message || e5); }

  // 5) Catálogos del Form (opciones).
  var catalogoRes = Form_syncCatalogos({ form: form });
  cambios = cambios.concat(catalogoRes.cambios || []);

  return {
    ok: true, motivo: 'INSTALADO', creado: abierto.creado,
    formId: form.getId(), url: urlResp, editUrl: urlEdit,
    schemaVersion: GOOGLE_FORMS_CONFIG.SCHEMA_VERSION,
    cambios: cambios, trigger: trigger, schemaReconstruido: migracionSchema.reconstruido,
    catalogo: { sectores: (catOpciones.sectores || []).length, profesionales: (catOpciones.profesionales || []).length },
    nota: 'Google Forms instalado como transporte durable interno de CapturaWeb (DEC-106).'
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
    .map(function (p) { return String(p.NOMBRE_CANONICO || p.NOMBRE || p.nombre || p.CODIGO || ''); }).filter(Boolean);

  var fuentes = ['SECTOR', 'PROFESIONAL', 'PROFESIONAL2'];
  try {
    var items = form.getItems();
    items.forEach(function (it) {
      var t = it.getTitle();
      var campo = null;
      if (t === GOOGLE_FORMS_CONFIG.CAMPOS.SECTOR.etiqueta) campo = 'SECTOR';
      else if (t === GOOGLE_FORMS_CONFIG.CAMPOS.PROFESIONAL.etiqueta) campo = 'PROFESIONAL';
      else if (t === (GOOGLE_FORMS_CONFIG.CAMPOS.PROFESIONAL2 && GOOGLE_FORMS_CONFIG.CAMPOS.PROFESIONAL2.etiqueta)) campo = 'PROFESIONAL2';
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
    return { ok: false, captureId: captureId, errores: [{ codigo: 'YA_DESCARTADO' }], descartado: true, clasificacion: 'terminal' };
  }
  var ad = CapturaIngress_adapterForms({
    formId: respuesta.formId, responseId: respuesta.responseId,
    timestamp: respuesta.timestamp, accion: respuesta.accion, campos: respuesta.campos
  }, { catalogo: ctx.catalogo, hoy: opciones.hoy });
  if (!ad.ok) {
    Form_registrarErrorTransporte_(captureId, ad.errores);
    return { ok: false, captureId: captureId, errores: ad.errores, clasificacion: 'review' };
  }
  var r = CapturaIngress_enviar(ad.payload, ctx, 'GOOGLE_FORMS');
  if (!r.ok) {
    return { ok: false, captureId: captureId, errores: r.errors || [{ codigo: 'PIPELINE' }], clasificacion: 'retryable' };
  }
  return { ok: true, captureId: captureId, accion: ad.accion, estado: (r.data && r.data.estado) || 'PROCESADO' };
}

/** GAS: trigger onFormSubmit — señal liviana. El worker es el único escritor clínico. */
function Form_onFormSubmit(e) {
  var formId = Form_formId_();
  if (!formId) return { ok: false, errores: [{ codigo: 'NO_INSTALADO' }] };
  var resp = e && e.response;
  if (!resp) return { ok: false, errores: [{ codigo: 'SIN_RESPONSE' }] };
  var responseId = '';
  try { responseId = String(resp.getId()); } catch (e3) { responseId = ''; }
  Form_metricaSumar_('DEFERRED_COUNT');
  Form_propEscribir_('GOOGLE_FORM_METRIC_DEFERRED_TS', String(Date.now()));
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
    var waitMs = (GOOGLE_FORMS_CONFIG.WORKER && GOOGLE_FORMS_CONFIG.WORKER.LOCK_WAIT_MS) || 750;
    if (!lock.tryLock(500)) {
      Form_metricaSumar_('LOCK_BUSY_DEFERRED');
      Form_metricaSumar_('DEFERRED_COUNT');
      Form_propEscribir_('GOOGLE_FORM_METRIC_DEFERRED_TS', String(Date.now()));
      return { ok: false, motivo: 'DEFERRED_LOCK_BUSY', procesadas: 0, lock: false };
    }
    Form_metricaSumar_('WORKER_RUNS');
    var form = FormApp.openById(formId);
    var respuestas = [];
    try { respuestas = form.getResponses(Form_desdeCursor_()) || []; } catch (e) { respuestas = []; }

    respuestas.sort(function (a, b) {
      try { return a.getTimestamp().getTime() - b.getTimestamp().getTime(); } catch (e) { return 0; }
    });
    var procesadas = 0, errores = 0, retryable = 0, review = 0, terminal = 0, filas = [];
    var cursorSeguro = Form_propLeer_('GOOGLE_FORM_CURSOR');
    var encontroRetryable = false;
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
      if (opciones.yaProcesado && opciones.yaProcesado(cid)) {
        if (!encontroRetryable && ts) cursorSeguro = ts;
        continue;
      }
      var it = Form_extraerCampos_(resp, {
        itemMap: Form_json_(Form_propLeer_('GOOGLE_FORM_ITEM_MAP')),
        titleMap: Form_json_(Form_propLeer_('GOOGLE_FORM_TITLE_MAP'))
      });
      var r = Form_procesarUnaRespuesta_({ formId: formId, responseId: responseId, timestamp: ts, accion: it.accion, campos: it.campos }, ctx, { hoy: ts });
      if (r.ok) procesadas++;
      else {
        errores++;
        if (r.clasificacion === 'terminal') terminal++;
        else if (r.clasificacion === 'review') review++;
        else { retryable++; encontroRetryable = true; }
      }
      filas.push({ responseId: responseId, captureId: cid || r.captureId, ok: r.ok, accion: r.accion || '', estado: r.estado || '', clasificacion: r.ok ? 'processed' : (r.clasificacion || 'retryable'), errores: r.errores || [] });
      if (!encontroRetryable && ts && (r.ok || r.clasificacion === 'review' || r.clasificacion === 'terminal')) cursorSeguro = ts;
    }
    if (cursorSeguro && cursorSeguro !== Form_propLeer_('GOOGLE_FORM_CURSOR')) Form_propEscribir_('GOOGLE_FORM_CURSOR', cursorSeguro);
    if (procesadas) Form_metricaSumar_('WORKER_PROCESSED', procesadas);
    if (errores) Form_metricaSumar_('WORKER_ERRORS', errores);
    if (retryable) Form_metricaSumar_('WORKER_RETRYABLE', retryable);
    if (review) Form_metricaSumar_('WORKER_REVIEW', review);
    if (terminal) Form_metricaSumar_('WORKER_TERMINAL', terminal);
    return { ok: true, procesadas: procesadas, errores: errores, retryable: retryable,
      review: review, terminal: terminal, total: procesadas + retryable + review + terminal,
      restantes: Math.max(0, respuestas.length - procesadas - errores), lock: true, filas: filas };
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
  var total = Number(info.respuestas) || 0;
  var processed = metricas.WORKER_PROCESSED || 0;
  var retryable = metricas.WORKER_RETRYABLE || 0;
  var review = metricas.WORKER_REVIEW || 0;
  var terminal = metricas.WORKER_TERMINAL || 0;
  var pendientes = Math.max(0, total - processed - terminal);
  return {
    ok: true,
    instalado: !!formId,
    formId: formId,
    url: Form_urlRespondedor_(),
    schemaVersion: Number(Form_propLeer_('GOOGLE_FORM_SCHEMA_VERSION')) || 0,
    cursor: Form_propLeer_('GOOGLE_FORM_CURSOR'),
    triggerOnFormSubmit: trigger,
    metricas: metricas,
    observabilidad: { responsesTotal: total, processed: processed, retryable: retryable,
      review: review, terminal: terminal, backlog: pendientes, oldestPendingMin: oldest },
    backlog: { oldestPendingMin: oldest, pendientes: pendientes },
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
    if (!idx.seccion) continue;
    var key = idx.seccion + '|' + t;
    idx.byKey[key] = entrada;
    var campo = tituloCampo[Utl_claveAlnum(t)];
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

/** GAS: crea FormResponse desde payload Web (recepción durable). */
function Form_crearRespuestaDesdePayloadWeb_(payload) {
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
    var idx = Form_indexarSchema_(form);
    var itemMap = Form_json_(Form_propLeer_('GOOGLE_FORM_ITEM_MAP')) || {};
    // try to map by known labels if needed
    function setItem(keySec, valor) {
      var trozos = String(keySec).split('|');
      var campo = Form_mapaTitulos_()[Utl_claveAlnum(trozos.slice(1).join('|'))] || trozos.slice(1).join('|');
      var entrada = idx.byCanonicalKey[Form_claveCanonicaItem_(trozos[0], campo)] || idx.byKey[keySec];
      if (entrada && entrada.item) {
        try { response.withItemResponse(entrada.item.createResponse(valor)); return true; } catch (e) {}
      }
      return false;
    }
    function valorActualizacion(campo, fallback) {
      var a = payload.actualizacion && payload.actualizacion.campos && payload.actualizacion.campos[campo];
      if (a && typeof a === 'object' && a.valor !== undefined) return String(a.valor);
      return fallback === undefined || fallback === null ? '' : String(fallback);
    }
    // set ACCION global
    var accLabel = seccion && GOOGLE_FORMS_CONFIG.ACCIONES.OPCIONES[seccion]
      ? GOOGLE_FORMS_CONFIG.ACCIONES.OPCIONES[seccion].etiqueta : '';
    if (accLabel && idx.accionItem) {
      try { response.withItemResponse(idx.accionItem.createResponse(accLabel)); } catch (e) {}
    } else if (accLabel && idx.byKey[seccion + '|Acción a registrar']) {
      try { response.withItemResponse(idx.byKey[seccion + '|Acción a registrar'].item.createResponse(accLabel)); } catch (e) {}
    }
    // set common fields
    if (payload.rut) setItem(seccion + '|RUT', payload.rut) || setItem(seccion + '|RUT de la persona (ej: 12.345.678-5)', payload.rut) || setItem(seccion + '|RUT de la persona', payload.rut);
    if (seccion === 'NUEVO_INGRESO') {
      if (payload.nombre) setItem('NUEVO_INGRESO|Nombre completo', payload.nombre) || setItem('NUEVO_INGRESO|NOMBRE', payload.nombre) || setItem('NUEVO_INGRESO|Nombre', payload.nombre);
      if (payload.fechaNacimiento) try { setItem('NUEVO_INGRESO|Fecha de nacimiento', Form_fechaLocalDesdeIso_(payload.fechaNacimiento)); } catch (e) {}
      if (payload.sector) setItem('NUEVO_INGRESO|Sector', payload.sector);
      if (payload.fechaIngreso) try { setItem('NUEVO_INGRESO|Fecha de ingreso', Form_fechaLocalDesdeIso_(payload.fechaIngreso)); } catch (e) {}
      if (payload.profesional) setItem('NUEVO_INGRESO|Profesional que registra', payload.profesional) || setItem('NUEVO_INGRESO|PROFESIONAL', payload.profesional);
      if (payload.profesionalSecundario) setItem('NUEVO_INGRESO|Segundo profesional (opcional)', payload.profesionalSecundario) || setItem('NUEVO_INGRESO|PROFESIONAL2', payload.profesionalSecundario);
      if (payload.sexo) setItem('NUEVO_INGRESO|Sexo (M / F / OTRO)', payload.sexo);
      if (payload.estratificacion) setItem('NUEVO_INGRESO|Estratificación (solo si se conoce)', payload.estratificacion);
      if (payload.saludMental) setItem('NUEVO_INGRESO|Salud mental', payload.saludMental);
      if (payload.telefonos) setItem('NUEVO_INGRESO|Teléfono(s)', payload.telefonos);
      if (payload.proximoControl) try { setItem('NUEVO_INGRESO|Próximo control', Form_fechaLocalDesdeIso_(payload.proximoControl)); } catch (e) {}
      if (payload.observaciones) setItem('NUEVO_INGRESO|Observaciones', payload.observaciones);
    }
    if (seccion === 'REGISTRAR_CONTROL') {
      if (payload.rut) setItem('REGISTRAR_CONTROL|RUT de la persona (ej: 12.345.678-5)', payload.rut) || setItem('REGISTRAR_CONTROL|RUT', payload.rut);
      if (payload.fechaEvento) try { setItem('REGISTRAR_CONTROL|Fecha del evento (control/seguimiento)', Form_fechaLocalDesdeIso_(payload.fechaEvento)); } catch (e) {}
      if (payload.profesional) setItem('REGISTRAR_CONTROL|Profesional que registra', payload.profesional) || setItem('REGISTRAR_CONTROL|PROFESIONAL', payload.profesional);
      if (payload.profesionalSecundario) setItem('REGISTRAR_CONTROL|Segundo profesional (opcional)', payload.profesionalSecundario) || setItem('REGISTRAR_CONTROL|PROFESIONAL2', payload.profesionalSecundario);
      if (payload.proximoControl) try { setItem('REGISTRAR_CONTROL|Próximo control', Form_fechaLocalDesdeIso_(payload.proximoControl)); } catch (e) {}
      if (payload.observaciones) setItem('REGISTRAR_CONTROL|Observaciones', payload.observaciones);
    }
    if (seccion === 'REGISTRAR_SEGUIMIENTO') {
      if (payload.rut) setItem('REGISTRAR_SEGUIMIENTO|RUT', payload.rut);
      if (payload.fechaEvento) try { setItem('REGISTRAR_SEGUIMIENTO|Fecha del evento (control/seguimiento)', Form_fechaLocalDesdeIso_(payload.fechaEvento)); } catch (e) {}
      if (payload.profesional) setItem('REGISTRAR_SEGUIMIENTO|Profesional que registra', payload.profesional) || setItem('REGISTRAR_SEGUIMIENTO|PROFESIONAL', payload.profesional);
      if (payload.profesionalSecundario) setItem('REGISTRAR_SEGUIMIENTO|Segundo profesional (opcional)', payload.profesionalSecundario) || setItem('REGISTRAR_SEGUIMIENTO|PROFESIONAL2', payload.profesionalSecundario);
      if (payload.proximoControl) try { setItem('REGISTRAR_SEGUIMIENTO|Próximo control', Form_fechaLocalDesdeIso_(payload.proximoControl)); } catch (e) {}
      if (payload.observaciones) setItem('REGISTRAR_SEGUIMIENTO|Observaciones', payload.observaciones);
    }
    if (seccion === 'ACTUALIZAR_DATOS') {
      if (payload.rut) setItem('ACTUALIZAR_DATOS|RUT', payload.rut);
      if (payload.profesional) setItem('ACTUALIZAR_DATOS|Profesional que registra', payload.profesional) || setItem('ACTUALIZAR_DATOS|PROFESIONAL', payload.profesional);
      if (payload.profesionalSecundario) setItem('ACTUALIZAR_DATOS|Segundo profesional (opcional)', payload.profesionalSecundario) || setItem('ACTUALIZAR_DATOS|PROFESIONAL2', payload.profesionalSecundario);
      var telNuevo = valorActualizacion('TELEFONOS', payload.telefonos);
      var telObsNueva = valorActualizacion('TELEFONO_OBS', payload.telefonoObs);
      var proxNuevo = valorActualizacion('PROXIMO_CONTROL', payload.proximoControl);
      var smNueva = valorActualizacion('SALUD_MENTAL', payload.saludMental);
      var obsNueva = valorActualizacion('OBSERVACIONES', payload.observaciones);
      if (telNuevo) setItem('ACTUALIZAR_DATOS|Teléfono(s)', telNuevo);
      if (telObsNueva) setItem('ACTUALIZAR_DATOS|Observación del teléfono', telObsNueva);
      if (proxNuevo) try { setItem('ACTUALIZAR_DATOS|Próximo control', Form_fechaLocalDesdeIso_(proxNuevo)); } catch (e) {}
      if (smNueva) setItem('ACTUALIZAR_DATOS|Salud mental', smNueva);
      if (obsNueva) setItem('ACTUALIZAR_DATOS|Observaciones', obsNueva);
    }
    var submitted = response.submit();
    var rid = '';
    try { rid = String(submitted.getId()); } catch (e) {}
    var rts = '';
    try { var dt = submitted.getTimestamp(); rts = dt ? Control_aIso(dt) : ''; } catch (e) {}
    return { ok: true, estado: 'RECIBIDO', responseId: rid, receivedAt: rts };
  } catch (e) {
    return { ok: false, estado: 'ERROR', motivo: String(e && e.message || e) };
  }
}

/** Entrypoint WebApp: recepción durable via Google Forms (cola). No procesa clínicamente. */
function WebApp_capturarRecibirDurable(payload, acceso) {
  try {
    var v = Form_validarPayloadTransporte_(payload || {});
    if (!v.ok) return { ok: false, motivo: v.codigo || 'ACCION_INVALIDA' };
    var res = Form_crearRespuestaDesdePayloadWeb_(payload || {});
    if (!res.ok) return { ok: false, motivo: res.motivo || 'ERROR_DURABLE' };
    return { ok: true, estado: 'RECIBIDO', data: { estado: 'RECIBIDO', responseId: res.responseId, receivedAt: res.receivedAt } };
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e) };
  }
}

function Form_validarPayloadTransporte_(payload) {
  try {
    var p = payload || {};
    var acc = String(p.accion || '').toLowerCase();
    var valid = acc === 'nuevoingreso' || acc === 'registrarcontrol' || acc === 'registrarseguimiento' || acc === 'actualizardatos';
    if (!valid) return { ok: false, codigo: 'ACCION_INVALIDA' };
    if (acc === 'nuevoingreso') {
      if (!p.rut || !p.nombre || !p.fechaNacimiento || !p.sector || !p.fechaIngreso || !p.profesional) return { ok: false, codigo: 'VALIDATION_ERROR' };
    } else if (acc === 'registrarcontrol' || acc === 'registrarseguimiento') {
      if (!p.rut || !p.fechaEvento || !p.profesional) return { ok: false, codigo: 'VALIDATION_ERROR' };
    } else if (acc === 'actualizardatos') {
      if (!p.rut || !p.profesional) return { ok: false, codigo: 'VALIDATION_ERROR' };
    }
    return { ok: true };
  } catch (e) { return { ok: false, codigo: 'VALIDATION_ERROR' }; }
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
