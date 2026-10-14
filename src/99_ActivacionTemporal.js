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
    triggers: {
      submit: diag.estado && diag.estado.triggerOnFormSubmit,
      worker: diag.estado && diag.estado.triggerWorker
    },
    legacy: {
      estado: 'DEFERRED_POST_ACTIVATION'
    }
  });
}
