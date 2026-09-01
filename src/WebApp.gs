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
  // Logo: sirve la imagen del CESFAM San Juan como PNG blob (evita problemas de base64 en HTML).
  if (e && e.parameter && e.parameter.logo !== undefined) {
    var b64 = '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';
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png');
    return ContentService.createTextOutput(blob).setMimeType(ContentService.MimeType.PNG);
  }
  // Conserva la ruta de webhook (GET con token/action) existente en Webhook.js.
  if (e && e.parameter && (e.parameter.token !== undefined || e.parameter.action !== undefined)) {
    return _wh_despachar(e);
  }
  return HtmlService.createHtmlOutputFromFile('CapturaWeb')
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
 *                         ESTRATIFICACION,TELEFONOS,FECHA_EVENTO,PROFESIONAL,OBSERVACIONES}
 * @returns {{ok:boolean, data?:Object, message:string, errors?:Array}}
 */
function Form_capturarDesdeUI(datos) {
  try {
    if (typeof SpreadsheetApp === 'undefined') {
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
      OBSERVACIONES: datos.OBSERVACIONES
    };

    // Valida en servidor con la MISMA regla del pipeline (nunca confiar en HTML).
    var val = Form_validarRespuesta(crudo, {});
    if (!val.ok) {
      return {
        ok: false,
        message: 'El registro no pasó la validación.',
        errors: Form_erroresTexto(val.errores)
      };
    }

    // idempotencia: id único por envío (el pipeline lo usa como marca FORM|id|ACCION)
    var responseId = 'UI-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);

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

    // Procesa con el pipeline EXISTENTE (misma ruta que onFormSubmit).
    var proc = Form_procesarPendientes({ max: 200 });

    // Lee el resultado de este envío para responder al navegador.
    var estado = UI_lecturaEstadoRespuesta(responseId);

    return {
      ok: true,
      message: proc && proc.ok === false
        ? ('Recibido. Procesamiento pendiente: ' + (proc.motivo || ''))
        : 'Registro realizado correctamente',
      data: {
        responseId: responseId,
        accion: val.accion,
        estado: estado.estado,
        motivo: estado.motivo,
        idInterno: estado.idInterno
      },
      errors: []
    };
  } catch (err) {
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
    entorno: typeof Entorno_actualGAS !== 'undefined' ? Entorno_actualGAS().entorno : 'DESCONOCIDO'
  };
}
