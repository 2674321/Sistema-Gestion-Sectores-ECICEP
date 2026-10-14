// ---------------------------------------------------------------------------
// 38_Release.js — release baseline v260 (solo operación local/runtime guiada).
// No publica Apps Script ni cambia deployments. Todos los resultados son
// agregados técnicos, sin IDs, URLs, secretos ni PII.
// ---------------------------------------------------------------------------

function Operacion_checkRelease_(nombre, estado, detalle) {
  return { nombre: nombre, estado: estado, detalle: String(detalle || '') };
}

/** Preflight central SOLO LECTURA. Las ausencias de Form/operador previas a la
 * activación son NOT_CONFIGURED; no se confunden con corrupción. */
function Operacion_preflightRelease_() {
  var checks = [], formId = '', form = null, formAud = null, triggers = [];
  function add(n, e, d) { checks.push(Operacion_checkRelease_(n, e, d)); }
  add('APP_VERSION', ECICEP.VERSION === '0.17.0' ? 'PASS' : 'BLOCK', ECICEP.VERSION);
  add('SCHEMA_VERSION', Number(SISTEMA_VERSION_SCHEMA_ACTUAL) === 2 ? 'PASS' : 'BLOCK', String(SISTEMA_VERSION_SCHEMA_ACTUAL));
  add('WEB_APP_URL_PRESENT', /^https:\/\/script\.google\.com\//.test(String(ECICEP.WEB_APP_URL || '')) ? 'PASS' : 'BLOCK', ECICEP.WEB_APP_URL ? 'presente' : 'ausente');
  try {
    var sid = SpreadsheetApp.getActiveSpreadsheet().getId();
    add('SPREADSHEET_ID_MATCH', sid === ECICEP.SPREADSHEET_ID ? 'PASS' : 'BLOCK', sid === ECICEP.SPREADSHEET_ID ? 'coincide' : 'no coincide');
  } catch (eSid) { add('SPREADSHEET_ID_MATCH', 'BLOCK', 'no legible'); }
  try { formId = Form_formId_(); } catch (eFid) { formId = ''; }
  add('FORM_ID_PRESENT', formId ? 'PASS' : 'NOT_CONFIGURED', formId ? 'configurado' : 'setup runtime pendiente');
  if (formId) {
    try { form = FormApp.openById(formId); add('FORM_ACCESSIBLE', 'PASS', 'accesible'); }
    catch (eForm) { add('FORM_ACCESSIBLE', 'BLOCK', 'no accesible'); }
  } else add('FORM_ACCESSIBLE', 'NOT_CONFIGURED', 'depende de Form ID');
  if (form) {
    try {
      formAud = Form_auditarSchema_(form);
      add('FORM_SCHEMA_CURRENT', formAud.seguro ? 'PASS' : 'BLOCK', formAud.seguro ? 'vigente' : 'requiere revisión');
    } catch (eAud) { add('FORM_SCHEMA_CURRENT', 'BLOCK', 'no auditable'); }
  } else add('FORM_SCHEMA_CURRENT', 'NOT_CONFIGURED', 'depende de Form accesible');
  try {
    var h = Form_hojaRespuetas_(), colsOk = false;
    if (h && h.getLastColumn()) {
      var enc = h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(Utl_claveAlnum_);
      colsOk = Form_columnas_().every(function (c) { return enc.indexOf(Utl_claveAlnum_(c)) >= 0; });
    }
    add('FORM_COLUMNS_CURRENT', colsOk ? 'PASS' : (formId ? 'BLOCK' : 'NOT_CONFIGURED'), colsOk ? 'vigentes' : 'pendientes');
  } catch (eCols) { add('FORM_COLUMNS_CURRENT', 'BLOCK', 'no legibles'); }
  try { triggers = ScriptApp.getProjectTriggers() || []; } catch (eTrig) { triggers = []; }
  function count(handler) { return triggers.filter(function (t) { return t.getHandlerFunction() === handler; }).length; }
  var submitN = count('Form_onFormSubmit_'), workerN = count('Form_worker_'), backupN = count('Backup_programado_');
  add('FORM_SUBMIT_TRIGGER_COUNT', submitN === 1 ? 'PASS' : (formId ? 'BLOCK' : 'NOT_CONFIGURED'), String(submitN));
  add('FORM_WORKER_TRIGGER_COUNT', workerN === 1 ? 'PASS' : (formId ? 'BLOCK' : 'NOT_CONFIGURED'), String(workerN));
  add('OPERATOR_SECRET_PRESENT', WebApp_operadorConfigurado_() ? 'PASS' : 'NOT_CONFIGURED', WebApp_operadorConfigurado_() ? 'configurado' : 'setup runtime pendiente');
  try {
    var backlog = Form_backlogResumen_();
    add('ACTIVE_BACKLOG_READABLE', backlog && backlog.ok !== false ? 'PASS' : 'BLOCK', backlog && backlog.ok !== false ? 'legible' : 'no legible');
  } catch (eBack) { add('ACTIVE_BACKLOG_READABLE', 'BLOCK', 'no legible'); }
  try {
    var legacyResumen = backlog && backlog.ok !== false && backlog.legacy
      ? backlog.legacy
      : null;
    add(
      'LEGACY_SUMMARY_READABLE',
      legacyResumen ? 'PASS' : 'BLOCK',
      legacyResumen ? 'legible (resumen ligero)' : 'no legible'
    );
  } catch (eLeg) {
    add('LEGACY_SUMMARY_READABLE', 'BLOCK', 'no legible');
  }
  try {
    var scan = Modelo_escanearEstructura_(Modelo_ss_());
    var drift = !scan || (scan.criticasFaltantes || []).length > 0;
    add('NO_SCHEMA_DRIFT', drift ? 'BLOCK' : 'PASS', drift ? 'drift crítico' : 'sin drift crítico');
  } catch (eScan) { add('NO_SCHEMA_DRIFT', 'BLOCK', 'no verificable'); }
  try {
    var hc = Modelo_hoja_(HOJAS.CONFLICTOS), crit = 0;
    if (hc && hc.getLastRow() > 1) {
      var bc = Utl_leerBloque_(hc), ic = Revision_indiceColumnas_(bc[0]), ce = ic.ESTADOREVISION, ct = ic.TIPO;
      bc.slice(1).forEach(function (f) { if (Utl_texto_(f[ce]) === 'ABIERTO' && /^CRITIC/i.test(Utl_texto_(f[ct]))) crit++; });
    }
    add('NO_CRITICAL_CONFLICT_STATE', crit ? 'BLOCK' : 'PASS', crit ? 'hay conflictos críticos' : 'sin conflicto crítico');
  } catch (eCrit) { add('NO_CRITICAL_CONFLICT_STATE', 'BLOCK', 'no legible'); }
  add('BACKUP_TRIGGER_PRESENT', backupN === 1 ? 'PASS' : 'BLOCK', backupN === 1 ? '1' : (backupN + ' (se requiere exactamente 1)'));
  var ventana = Operacion_ventanaActivacionAbierta_();
  add('ACTIVATION_WINDOW_STATUS', ventana.ok ? 'PASS' : 'WARN', ventana.ok ? 'abierta' : 'cerrada');

  var block = checks.some(function (c) { return c.estado === 'BLOCK'; });
  var pending = checks.filter(function (c) { return c.estado === 'NOT_CONFIGURED'; }).map(function (c) { return c.nombre; });
  var activo = !!formId && WebApp_operadorConfigurado_();
  var resultado = block ? (activo ? 'ACTIVE_DEGRADED' : 'NOT_READY')
    : (activo ? 'ACTIVE_HEALTHY' : 'READY_TO_ACTIVATE');
  return { ok: !block, resultado: resultado, checks: checks, setupRuntimePendiente: pending };
}

function UI_formCanalPreflight_() {
  var r = Operacion_preflightRelease_();
  UI_formCanalAlert_('Preflight de activación', (r.checks || []).map(function (c) {
    return c.estado + ' ' + c.nombre + ': ' + c.detalle;
  }).concat(['Resultado: ' + r.resultado]));
  return r;
}

function UI_activacionEstadoVentana_() {
  var r = Operacion_ventanaActivacionAbierta_();
  UI_formCanalAlert_('Ventana técnica', [r.ok ? ('ABIERTA hasta ' + r.expiraEn) : 'CERRADA']);
  return r;
}

function UI_activacionAbrirVentana_() {
  var ui = _UI_get_();
  var confirma = ui.alert('Abrir ventana técnica', 'Confirma que la jornada finalizó y que no quedan usuarios operando. La ventana dura como máximo 120 minutos.', ui.ButtonSet.YES_NO);
  if (confirma !== ui.Button.YES) return { ok: false, motivo: 'CANCELADO' };
  var p = ui.prompt('Duración', 'Minutos de ventana (1 a 120):', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return { ok: false, motivo: 'CANCELADO' };
  var min = parseInt(p.getResponseText(), 10);
  if (!(min >= 1 && min <= 120)) return { ok: false, motivo: 'TTL_INVALIDO' };
  Form_propEscribir_(GOOGLE_FORMS_CONFIG.ACTIVATION_WINDOW.CLAVE, 'OPEN:' + String(Date.now() + min * 60000));
  return UI_activacionEstadoVentana_();
}

function UI_activacionCerrarVentana_() {
  try {
    var p = Form_props_();
    if (p) p.deleteProperty(GOOGLE_FORMS_CONFIG.ACTIVATION_WINDOW.CLAVE);
  } catch (e) { return { ok: false, motivo: 'VENTANA_NO_DISPONIBLE' }; }
  UI_formCanalAlert_('Ventana técnica', ['CERRADA']);
  return { ok: true, abierta: false };
}

function UI_operadorConfigurarClaveActivacion_() {
  var v = Operacion_ventanaActivacionAbierta_(); if (!v.ok) return v;
  var ui = _UI_get_(), p = ui.prompt('Clave de operador', 'Ingrese una clave de al menos 20 caracteres:', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return { ok: false, motivo: 'CANCELADO' };
  var clave = String(p.getResponseText() || '');
  if (clave.length < 20) { clave = ''; return { ok: false, motivo: 'CLAVE_OPERADOR_CORTA' }; }
  var conf = ui.alert('Confirmar clave', 'La clave se guardará como hash y no podrá recuperarse. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (conf !== ui.Button.YES) { clave = ''; return { ok: false, motivo: 'CANCELADO' }; }
  var r = WebApp_operadorConfigurarClave_(clave); clave = '';
  if (!r.ok || !WebApp_operadorConfigurado_()) return { ok: false, motivo: 'OPERADOR_NO_CONFIGURADO' };
  UI_formCanalAlert_('Operador', ['Clave configurada correctamente.']); return { ok: true };
}

function UI_formCanalAdoptarId_() {
  var v = Operacion_ventanaActivacionAbierta_(); if (!v.ok) return v;
  var ui = _UI_get_(), p = ui.prompt('Adoptar Form interno', 'Pegue el ID del Form:', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return { ok: false, motivo: 'CANCELADO' };
  var id = String(p.getResponseText() || '').trim(), form;
  if (!id) return { ok: false, motivo: 'FORM_ID_REQUIRED' };
  try { form = FormApp.openById(id); } catch (e) { return { ok: false, motivo: 'FORM_NO_ACCESIBLE' }; }
  var aud = Form_auditarSchema_(form), n = 0; try { n = (form.getResponses() || []).length; } catch (e2) { n = 0; }
  var c = ui.alert('Confirmar adopción', 'Form accesible. Schema: ' + (aud.seguro ? 'seguro' : 'requiere revisión') + '. Respuestas: ' + n + '. Solo se guardará el ID. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (c !== ui.Button.YES) return { ok: false, motivo: 'CANCELADO' };
  Form_propEscribir_('GOOGLE_FORM_ID', id); id = '';
  return { ok: true, motivo: 'FORM_ADOPTADO' };
}

function UI_formCanalCrearNuevoSeguro_() {
  var v = Operacion_ventanaActivacionAbierta_(); if (!v.ok) return v;
  if (Form_formId_()) return { ok: false, motivo: 'FORM_ID_ALREADY_PRESENT' };
  var ui = _UI_get_(), p = ui.prompt('Crear Form interno nuevo', 'Escriba exactamente: CREAR FORM ECICEP', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK || String(p.getResponseText() || '').trim() !== 'CREAR FORM ECICEP') return { ok: false, motivo: 'CONFIRMACION_INVALIDA' };
  var form;
  try { form = FormApp.create('Captura ECICEP'); Form_propEscribir_('GOOGLE_FORM_ID', form.getId()); }
  catch (e) { return { ok: false, motivo: 'FORM_CREATE_FAILED' }; }
  var r = Form_operativoInstalar_({ crearNuevo: false, adoptarExistente: true });
  if (!r.ok) return { ok: false, motivo: r.motivo || 'INSTALL_FAILED', formConservado: true };
  var d = Form_operativoDiagnosticar_();
  return d.ok ? { ok: true, motivo: 'FORM_CREADO_E_INSTALADO' } : { ok: false, motivo: 'POST_INSTALL_DIAGNOSTIC_FAILED', formConservado: true };
}

/** Blockers que el instalador puede reparar; el resto detiene el asistente
 *  ANTES de cualquier mutación (fail-closed). PURA. */
function Operacion_preflightBloqueosNoReparables_(pre) {
  var reparables = {
    FORM_COLUMNS_CURRENT: true,
    FORM_SUBMIT_TRIGGER_COUNT: true,
    FORM_WORKER_TRIGGER_COUNT: true
  };
  return ((pre && pre.checks) || []).filter(function (c) {
    return c.estado === 'BLOCK' && !reparables[c.nombre];
  });
}

/** Asistente del Spreadsheet. Deliberadamente no contiene push/deploy. */
function UI_formCanalAsistenteActivacion_() {
  var v = Operacion_ventanaActivacionAbierta_(); if (!v.ok) return v;
  var pre = Operacion_preflightRelease_();
  var bloqueos = Operacion_preflightBloqueosNoReparables_(pre);
  if (bloqueos.length) {
    return {
      ok: false,
      motivo: 'RELEASE_PREFLIGHT_BLOCKED',
      bloqueos: bloqueos.map(function (c) { return c.nombre; })
    };
  }
  if (!WebApp_operadorConfigurado_()) return { ok: false, motivo: 'OPERATOR_SETUP_REQUIRED', siguiente: 'UI_operadorConfigurarClaveActivacion_' };
  if (!Form_formId_()) return { ok: false, motivo: 'FORM_SETUP_REQUIRED', siguiente: 'UI_formCanalAdoptarId_|UI_formCanalCrearNuevoSeguro_' };
  var inst = UI_formCanalInstalarSeguro_(); if (!inst.ok) return inst;
  var dry = Form_migrarTrailerLegacy_({ dryRun: true });
  if (!dry.ok) return dry;
  if ((dry.legacyDetectadas || 0) + (dry.legacyParciales || 0) > 0) {
    var ui = _UI_get_(), c = ui.alert('Aplicar migración legacy', 'Dry-run completado. ¿Aplicar la migración recuperable?', ui.ButtonSet.YES_NO);
    if (c !== ui.Button.YES) return { ok: false, motivo: 'LEGACY_APPLY_CANCELLED' };
    var apply = Form_migrarTrailerLegacy_({ dryRun: false }); if (!apply.ok) return apply;
  }
  var post = Form_operativoDiagnosticar_();
  if (!post.ok) return { ok: false, motivo: 'POST_INSTALL_DIAGNOSTIC_FAILED' };
  // Post-preflight: tras instalar/legacy, NINGÚN BLOCK (ni siquiera los
  // reparables) puede permanecer para declarar READY_FOR_DEPLOY.
  var postPre = Operacion_preflightRelease_();
  var bloqueosPost = ((postPre && postPre.checks) || []).filter(function (x) { return x.estado === 'BLOCK'; });
  if (bloqueosPost.length) {
    return {
      ok: false,
      motivo: 'POST_RELEASE_PREFLIGHT_BLOCKED',
      bloqueos: bloqueosPost.map(function (c) { return c.nombre; })
    };
  }
  UI_formCanalAlert_('Asistente de activación', ['LISTO PARA DEPLOY']);
  return { ok: true, estado: 'READY_FOR_DEPLOY', preflight: pre.resultado };
}
