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

  if (!Form_formId_()) {
    return salir({ ok: false, etapa: 'FORM', motivo: 'FORM_ID_REQUIRED' });
  }

  // Autorreparación runtime previa al preflight: trigger semanal de respaldo.
  var repBack = ECICEP_asegurarBackupActivacion_();
  if (!repBack || !repBack.ok) {
    return salir({ ok: false, etapa: 'BACKUP_REPAIR', motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' });
  }

  // Autorreparación runtime previa al preflight: Form configurado accesible.
  var repForm = ECICEP_asegurarFormActivacion_();
  if (!repForm || !repForm.ok) {
    return salir({ ok: false, etapa: 'FORM_REPAIR', motivo: 'FORM_REPAIR_FAILED' });
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
      formRecreated: repForm.recreado === true
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

/** v260 TEMPORAL: asegura que el Form configurado sea accesible ANTES del
 *  preflight. Si el Form conocido no abre, crea un Form interno nuevo y
 *  reasigna SOLO `GOOGLE_FORM_ID`. El Form anterior queda INTACTO y huérfano:
 *  nunca se borra ni se modifica. No registra identificadores. */
function ECICEP_asegurarFormActivacion_() {
  var id = '';
  try { id = String(Form_formId_() || '').trim(); } catch (eFid) { id = ''; }
  if (id) {
    try { FormApp.openById(id); return { ok: true, recreado: false }; }
    catch (eAbierto) { /* sigue a la recreación */ }
  }

  var nuevo = null;
  try { nuevo = FormApp.create(GOOGLE_FORMS_CONFIG.TITULO); } catch (eNuevo) { return { ok: false, motivo: 'FORM_REPAIR_FAILED' }; }
  var nuevoId = '';
  try { nuevoId = String(nuevo && nuevo.getId() || '').trim(); } catch (eId) { nuevoId = ''; }
  if (!nuevoId) return { ok: false, motivo: 'FORM_REPAIR_FAILED' };

  try { Form_propEscribir_('GOOGLE_FORM_ID', nuevoId); } catch (eWrite) { return { ok: false, motivo: 'FORM_REPAIR_FAILED' }; }
  var vigente = '';
  try { vigente = String(Form_formId_() || '').trim(); } catch (eF2) { vigente = ''; }
  if (!vigente) return { ok: false, motivo: 'FORM_REPAIR_FAILED' };
  try { FormApp.openById(vigente); } catch (eVerify) { return { ok: false, motivo: 'FORM_REPAIR_FAILED' }; }
  return { ok: true, recreado: true };
}
