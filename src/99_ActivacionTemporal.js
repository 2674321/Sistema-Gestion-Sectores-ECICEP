/**
 * TEMPORAL v260.
 * Ejecutar UNA sola vez desde Apps Script Editor y eliminar después del GO.
 * No forma parte de la superficie operativa permanente.
 */
function ECICEP_ACTIVAR_AHORA() {
  function salir(r) {
    console.log('ECICEP_ACTIVATION_RESULT ' + JSON.stringify(r));
    return r;
  }

  // La ejecución manual del propietario constituye la autorización explícita
  // para esta ventana inmediata. Si la ventana previa expiró, abrir 60 minutos.
  var ventana = Operacion_ventanaActivacionAbierta_();
  if (!ventana || !ventana.ok) {
    Form_propEscribir_(
      GOOGLE_FORMS_CONFIG.ACTIVATION_WINDOW.CLAVE,
      'OPEN:' + String(Date.now() + 60 * 60000)
    );
    ventana = Operacion_ventanaActivacionAbierta_();
  }
  if (!ventana || !ventana.ok) {
    return salir({ ok: false, etapa: 'VENTANA', motivo: ventana && ventana.motivo || 'VENTANA_CERRADA' });
  }

  if (!WebApp_operadorConfigurado_()) {
    return salir({ ok: false, etapa: 'OPERADOR', motivo: 'OPERADOR_NO_CONFIGURADO' });
  }

  // Autorreparación runtime previa al preflight: trigger semanal de respaldo.
  var repBack = ECICEP_asegurarBackupActivacion_();
  if (!repBack || !repBack.ok) {
    return salir({ ok: false, etapa: 'BACKUP_REPAIR', motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' });
  }

  // Bootstrap del Form interno bajo la MISMA identidad que ejecuta el script:
  // reutiliza el configurado si abre, o crea uno nuevo FormApp/Forms API v1.
  var boot = ECICEP_bootstrapFormProduccion_();
  if (!boot || !boot.ok) {
    return salir({
      ok: false,
      etapa: 'FORM_BOOTSTRAP',
      motivo: boot && boot.motivo || 'FORM_BOOTSTRAP_FAILED'
    });
  }

  if (!Form_formId_()) {
    return salir({ ok: false, etapa: 'FORM', motivo: 'FORM_ID_REQUIRED' });
  }

  // Preflight inicial: solo se toleran blockers que el instalador repara.
  var pre = Operacion_preflightRelease_();
  var bloqueos = Operacion_preflightBloqueosNoReparables_(pre);
  if (bloqueos.length) {
    return salir({
      ok: false,
      etapa: 'PREFLIGHT',
      motivo: 'RELEASE_PREFLIGHT_BLOCKED',
      bloqueos: bloqueos.map(function (x) { return x.nombre; })
    });
  }

  // Instala/adopta ÚNICAMENTE el Form ya configurado.
  var instalar = Form_operativoInstalar_({
    crearNuevo: false,
    adoptarExistente: true
  });
  if (!instalar || !instalar.ok) {
    return salir({
      ok: false,
      etapa: 'INSTALAR',
      motivo: instalar && instalar.motivo || 'INSTALL_FAILED'
    });
  }

  var diag = Form_operativoDiagnosticar_();
  if (!diag || !diag.ok) {
    return salir({
      ok: false,
      etapa: 'DIAGNOSTICO',
      motivo: 'POST_INSTALL_DIAGNOSTIC_FAILED'
    });
  }

  var post = Operacion_preflightRelease_();
  var postBlocks = (post.checks || []).filter(function (c) {
    return c.estado === 'BLOCK';
  });

  if (postBlocks.length) {
    return salir({
      ok: false,
      etapa: 'POST_PREFLIGHT',
      motivo: 'POST_RELEASE_PREFLIGHT_BLOCKED',
      bloqueos: postBlocks.map(function (x) { return x.nombre; })
    });
  }

  return salir({
    ok: true,
    estado: 'READY_FOR_DEPLOY',
    preflight: post.resultado,
    schemaVersion: GOOGLE_FORMS_CONFIG.SCHEMA_VERSION,
    repairs: {
      backupTrigger: repBack.creado === true,
      formCreated: boot.creado === true,
      formCreationMethod: boot.metodo || 'EXISTING'
    },
    triggers: {
      submit: diag.estado && diag.estado.triggerOnFormSubmit,
      worker: diag.estado && diag.estado.triggerWorker
    },
    legacy: {
      estado: 'DEFERRED_POST_ACTIVATION'
    }
  });
}

/** v260 TEMPORAL (DEC activa): asegura el trigger semanal de respaldo de forma
 *  idempotente ANTES del preflight, sin crear respaldos, sin borrar archivos y
 *  sin cambiar la retención. Usa la API oficial `Backup_programar_`, que ya
 *  reprograma desde cero. Nunca registra identificadores. */
function ECICEP_asegurarBackupActivacion_() {
  var instalado = false;
  try { instalado = !!Backup_triggerInstalado_(); } catch (eBack) { instalado = false; }
  if (instalado) return { ok: true, creado: false };

  var cfg = {};
  try { cfg = _config_leerValores_(['BACKUP_DIA', 'BACKUP_HORA']) || {}; } catch (eCfg) { cfg = {}; }
  var dia = String(cfg.BACKUP_DIA || '').trim().toUpperCase() || 'DOMINGO';
  var hora = parseInt(String(cfg.BACKUP_HORA || '').trim(), 10);
  if (isNaN(hora) || hora < 0 || hora > 23) hora = 3;

  try { Backup_programar_(dia, hora); } catch (eProg) { return { ok: false, motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' }; }

  var verificado = false;
  try { verificado = !!Backup_triggerInstalado_(); } catch (eBack2) { verificado = false; }
  return verificado ? { ok: true, creado: true } : { ok: false, motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' };
}

/** v260 TEMPORAL: crea el Form interno vía Google Forms API v1 (fallback de
 *  `FormApp.create`). Devuelve internamente el id; el bootstrap NUNCA lo expone.
 *  Clasifica el fallo sin incluir el cuerpo de error ni el token de acceso. */
function ECICEP_crearFormViaApi_() {
  var titulo = String(GOOGLE_FORMS_CONFIG.TITULO || '');
  var resp = null;
  try {
    resp = UrlFetchApp.fetch('https://forms.googleapis.com/v1/forms', {
      method: 'POST',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ info: { title: titulo, documentTitle: titulo } }),
      muteHttpExceptions: true
    });
  } catch (eFetch) { return { ok: false, motivo: 'FORM_API_CREATE_FAILED' }; }

  var codigo = 0;
  try { codigo = Number(resp.getResponseCode()) || 0; } catch (eCode) { codigo = 0; }
  if (codigo === 401 || codigo === 403) return { ok: false, motivo: 'FORM_API_AUTH_REQUIRED' };
  if (!(codigo >= 200 && codigo < 300)) return { ok: false, motivo: 'FORM_API_CREATE_FAILED' };

  var id = '';
  try { id = String(JSON.parse(String(resp.getContentText() || '')).formId || '').trim(); } catch (eJson) { id = ''; }
  if (!id) return { ok: false, motivo: 'FORM_API_INVALID_RESPONSE' };
  return { ok: true, id: id, metodo: 'FORMS_API' };
}

/** v260 TEMPORAL: deja listo un Form interno accesible bajo la MISMA identidad
 *  que ejecuta el script. Reutiliza `GOOGLE_FORM_ID` si abre; si no, crea uno
 *  con FormApp y, en su defecto, con la Forms API v1. Persiste el ID SOLO tras
 *  verificarlo. Nunca borra Forms previos y nunca imprime identificadores. */
function ECICEP_bootstrapFormProduccion_() {
  var previo = '';
  try { previo = String(Form_formId_() || '').trim(); } catch (ePrevio) { previo = ''; }
  if (previo) {
    var abre = false;
    try { FormApp.openById(previo); abre = true; } catch (eAbrir) { abre = false; }
    if (abre) return { ok: true, creado: false, metodo: 'EXISTING' };
  }

  var nuevo = '', metodo = 'FORMAPP';
  try {
    var creado = FormApp.create(GOOGLE_FORMS_CONFIG.TITULO);
    nuevo = String(creado && creado.getId() || '').trim();
  } catch (eCreate) { nuevo = ''; }
  if (!nuevo) {
    var viaApi = ECICEP_crearFormViaApi_();
    if (!viaApi || !viaApi.ok) return { ok: false, motivo: viaApi && viaApi.motivo || 'FORM_API_CREATE_FAILED' };
    nuevo = String(viaApi.id || '').trim();
    metodo = 'FORMS_API';
    if (!nuevo) return { ok: false, motivo: 'FORM_BOOTSTRAP_VERIFY_FAILED' };
  }

  // La propagación de Forms puede tardar: reintentos acotados (~3 s en total).
  var verificado = false;
  for (var intento = 0; intento < 5 && !verificado; intento++) {
    try { FormApp.openById(nuevo); verificado = true; }
    catch (eVerificar) {
      verificado = false;
      if (intento < 4) { try { Utilities.sleep(750); } catch (eSleep) { /* sin espera */ } }
    }
  }
  if (!verificado) return { ok: false, motivo: 'FORM_BOOTSTRAP_VERIFY_FAILED' };

  try { Form_propEscribir_('GOOGLE_FORM_ID', nuevo); }
  catch (eWrite) { return { ok: false, motivo: 'FORM_BOOTSTRAP_PROPERTY_WRITE_FAILED' }; }
  var vigente = '';
  try { vigente = String(Form_formId_() || '').trim(); } catch (eLeer) { vigente = ''; }
  if (vigente !== nuevo) return { ok: false, motivo: 'FORM_BOOTSTRAP_PROPERTY_VERIFY_FAILED' };
  try { FormApp.openById(vigente); } catch (eFinal) { return { ok: false, motivo: 'FORM_BOOTSTRAP_VERIFY_FAILED' }; }
  return { ok: true, creado: true, metodo: metodo };
}
