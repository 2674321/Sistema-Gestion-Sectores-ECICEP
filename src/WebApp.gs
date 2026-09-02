/**
 * Sistema ECICEP Unificado — WebApp de captura (v0.9.3)
 * NUEVO CANAL DE ENTRADA (HTML propio) que reemplaza a Google Forms como
 * interfaz de captura. NO es una segunda implementación: reutiliza el 100%
 * del backend existente (validación, decisión, efectos, idempotencia).
 *
 * Flujo:
 *   WebApp HTML → google.script.run → Form_capturarDesdeUI(datos)
 *     → deposita la respuesta en FORM_RESPUESTAS (mismo mecanismo que el
 *       trigger onFormSubmit) → Form_procesarPendientes() (pipeline real).
 *
 * AISLAMIENTO: este módulo NO crea bases ni lógica paralela. El código es
 * autónomo y portátil: utiliza el contexto del proyecto (SpreadsheetApp.getActive()
 * cuando hay hoja activa) y la configuración existente (00_Config.js). No hay
 * IDs hardcodeados de DEMO ni de producción; el destino de escritura sigue la
 * lógica normal del proyecto Apps Script corriendo.
 *
 * Nota doGet: un proyecto Apps Script admite UN SOLO doGet. Este enruta:
 *   - llamada de webhook (GET con parámetros token/action) → Webhook.js (_wh_despachar)
 *   - cualquier otra → sirve el HTML de captura.
 */

// ---------------------------------------------------------------------------
// ENTRYPOINT WEB (doGet único)
// ---------------------------------------------------------------------------

function doGet(e) {
  // Conserva la ruta de webhook (GET con token/action) existente en Webhook.js.
  if (e && e.parameter && (e.parameter.token !== undefined || e.parameter.action !== undefined)) {
    return _wh_despachar(e);
  }
  return HtmlService.createTemplateFromFile('CapturaWeb').evaluate()
    .setTitle('ECICEP — Captura')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------------------
// PUENTE → PIPELINE EXISTENTE
// ---------------------------------------------------------------------------

/**
 * GAS: puente entre la interfaz WebApp y el pipeline existente.
 * Recibe `datos` serializables desde el HTML (claves = campos del contrato),
 * los deposita como una fila RECIBIDO en FORM_RESPUESTAS y dispara
 * Form_procesarPendientes() — EXACTAMENTE el camino que el trigger de Google
 * Forms usaba. Así se reutilizan validación, decisión, efectos e idempotencia
 * sin duplicar nada.
 *
 * @param {Object} datos  {ACCION,RUT,NOMBRE,SEXO,FECHA_NACIMIENTO,SECTOR,
 *                         ESTRATIFICACION,TELEFONOS,FECHA_EVENTO,PROFESIONAL,
 *                         PROFESIONAL2,OBSERVACIONES}
 * @returns {{ok:boolean, data?:Object, message:string, errors?:Array}}
 */
function Form_capturarDesdeUI(datos) {
  try {
    console.log('[BACKEND] 01 entrada Form_capturarDesdeUI');
    if (typeof SpreadsheetApp === 'undefined') {
      console.error('[BACKEND] 01b SpreadsheetApp no disponible');
      return { ok: false, message: 'Entorno no disponible (GAS)', errors: [{ campo: '_', mensaje: 'SOLO_GAS' }] };
    }
    datos = datos || {};
    var crudo = {
      ACCION: datos.ACCION,
      RUT: datos.RUT,
      NOMBRE: datos.NOMBRE,
      SEXO: datos.SEXO,
      FECHA_NACIMIENTO: datos.FECHA_NACIMIENTO,
      SECTOR: datos.SECTOR,
      ESTRATIFICACION: datos.ESTRATIFICACION,
      TELEFONOS: datos.TELEFONOS,
      FECHA_EVENTO: datos.FECHA_EVENTO,
      PROFESIONAL: datos.PROFESIONAL,
      PROFESIONAL2: datos.PROFESIONAL2 || '',
      OBSERVACIONES: datos.OBSERVACIONES
    };
    console.log('[BACKEND] 02 crudo construido accion=' + crudo.ACCION + ' rut=' + (crudo.RUT || '').substring(0, 6) + '***');

    // Valida en servidor con la MISMA regla del pipeline (nunca confiar en HTML).
    var val = Form_validarRespuesta(crudo, {});
    console.log('[BACKEND] 03 validacion val.ok=' + val.ok);
    if (!val.ok) {
      console.log('[BACKEND] 03b validacion FALLA');
      return {
        ok: false,
        message: 'El registro no pasó la validación.',
        errors: Form_erroresTexto(val.errores)
      };
    }

    // idempotencia: id único por envío (el pipeline lo usa como marca FORM|id|ACCION)
    var responseId = 'UI-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    console.log('[BACKEND] 04 responseId=' + responseId);

    // Construye la fila plana IGUAL que Form_capturarRespuestas (contrato FORM_RESPUESTAS).
    var fila = Form_campos().map(function (c) {
      return crudo[c.campo] !== undefined ? Utl_texto(crudo[c.campo]) : '';
    });
    var filaPlana = [
      Form_aIsoConHora(new Date()),
      responseId,
      FORM_CONFIG.FORM_VERSION,
      (typeof Session !== 'undefined' && Session.getActiveUser()) ? Session.getActiveUser().getEmail() : ''
    ].concat(fila).concat([
      JSON.stringify(crudo), '', '', 0, 'RECIBIDO', '', '', '', ''
    ]);

    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja) { Form_instalar(); hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS); }
    var cols = Form_columnas();
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, cols.length).setValues([filaPlana]);
    console.log('[BACKEND] 05 fila escrita en FORM_RESPUESTAS');

    // Procesa con el pipeline EXISTENTE (misma ruta que onFormSubmit).
    console.log('[BACKEND] 06 inicio Form_procesarPendientes');
    var t0 = new Date().getTime();
    var proc = Form_procesarPendientes({ max: 200 });
    var t1 = new Date().getTime();
    console.log('[BACKEND] 07 fin Form_procesarPendientes duracion=' + (t1 - t0) + 'ms proc=' + JSON.stringify(proc).substring(0, 200));

    // Lee el resultado de este envío para responder al navegador.
    var estado = UI_lecturaEstadoRespuesta(responseId);
    console.log('[BACKEND] 08 estado=' + JSON.stringify(estado));

    var esError = estado.estado === 'ERROR';
    var esRevision = estado.estado === 'REQUIERE_REVISION';
    var ok = !esError;
    var message = esError
      ? ('No se pudo completar: ' + (estado.motivo || estado.estado))
      : esRevision
        ? 'Registro recibido — requiere revisión'
        : (proc && proc.ok === false
          ? ('Recibido. Procesamiento pendiente: ' + (proc.motivo || ''))
          : 'Registro realizado correctamente');
    var resultado = {
      ok: ok,
      message: message,
      data: {
        responseId: responseId,
        accion: val.accion,
        estado: estado.estado,
        motivo: estado.motivo,
        idInterno: estado.idInterno
      },
      errors: esError ? [{ campo: '_', mensaje: estado.motivo || estado.estado }] : []
    };
    console.log('[BACKEND] 09 RETORNANDO ok=' + ok + ' estado=' + estado.estado);
    return resultado;
  } catch (err) {
    console.error('[BACKEND] 09C EXCEPTION:', err && err.message ? err.message : String(err));
    Log_error('WebApp', 'capturarDesdeUI', err && err.message ? err.message : String(err));
    Log_flush();
    return {
      ok: false,
      message: 'Error interno al registrar.',
      errors: [{ campo: '_', mensaje: err && err.message ? err.message : String(err) }]
    };
  }
}

/** GAS: lee el estado/motivo/idInterno de una respuesta recién procesada. */
function UI_lecturaEstadoRespuesta(responseId) {
  try {
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja || hoja.getLastRow() < Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) {
      return { estado: 'RECIBIDO', motivo: '', idInterno: '' };
    }
    var valores = Modelo_leerBloqueCabecera(HOJAS.FORM_RESPUESTAS, hoja);
    var mapa = Form_mapeoEncabezados(valores[0]);
    for (var f = valores.length - 1; f > 0; f--) {
      if (Utl_texto(valores[f][mapa.idx['RESPONSEID']]) === String(responseId)) {
        return {
          estado: mapa.idx['ESTADO'] !== undefined ? Utl_texto(valores[f][mapa.idx['ESTADO']]) : '',
          motivo: mapa.idx['MOTIVO'] !== undefined ? Utl_texto(valores[f][mapa.idx['MOTIVO']]) : '',
          idInterno: mapa.idx['ID_INTERNO'] !== undefined ? Utl_texto(valores[f][mapa.idx['ID_INTERNO']]) : ''
        };
      }
    }
  } catch (e) { /* devuelve estado default */ }
  return { estado: 'RECIBIDO', motivo: '', idInterno: '' };
}

// Aliases de panel (para poder usarla también desde una sidebar si se desea).
function api_webappCapturar(datos) { return Form_capturarDesdeUI(datos); }
function api_webappEstado() {
  return {
    ok: true,
    version: ECICEP.VERSION,
    entorno: typeof Entorno_actualGAS !== 'undefined' ? Entorno_actualGAS().entorno : 'DESCONOCIDO',
    url: typeof ECICEP_webAppUrl === 'function' ? ECICEP_webAppUrl() : ''
  };
}
