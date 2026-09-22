/**
 * Sistema ECICEP — WebApp de captura (v0.9.3)
 * NUEVO CANAL DE ENTRADA (HTML propio) que reemplaza a Google Forms como
 * interfaz de captura. NO es una segunda implementación: reutiliza el 100%
 * del backend existente (validación, decisión, efectos, idempotencia).
 *
 * Flujo vigente (captura V4 — único canal, contrato docs/CONTRATO_CAPTURA_V2.md NORMATIVO):
 *   CapturaWeb.html → google.script.run → WebApp_previaDuplicadosV2 / WebApp_capturarEnviar
 *     → Captura_v2_enviar (26_Captura.js): persistencia durable en FORM_RESPUESTAS
 *       (RESPONSE_ID Cp2-<32hex>, FORM_VERSION=2/3/4, TRAZA_CRUDA JSON) + entrega acotada + trailer.
 *   El puente legacy Form_capturarDesdeUI se conserva solo como compatibilidad interna
 *   (sin consumidor en la UI vigente); el pipeline legacy NO procesa filas del namespace V2.
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
// CONTROL DE ACCESO — DOS CAPACIDADES DISTINTAS
//   - CAPTURA  : capacidad pública de captura (QR/URL base). Solo escribe.
//   - OPERADOR : capacidad privilegiada (Consultar/administrar). Nunca se
//                inyecta en una página pública (ver §11).
// El token del webhook sigue siendo independiente y no se comparte en el QR.
// La propiedad CAPTURA_ACCESS_TOKEN conserva su valor (el QR actual no se
// invalida), pero ya NO concede acceso a funciones privilegiadas.
// ---------------------------------------------------------------------------

/** Autoriza la capacidad de OPERADOR: sesión activa o token de operador. */
function WebApp_autorizarBuscador(token) {
  if (WebApp_usuarioActivo()) return true;
  return WebApp_accesoOperadorValido_(token);
}

/** Autoriza la capacidad de CAPTURA: sesión activa o token de captura. */
function WebApp_autorizarCaptura(token) {
  if (WebApp_usuarioActivo()) return true;
  return WebApp_accesoCapturaValido_(token);
}

/** Clave de captura (pública por diseño). Conserva CAPTURA_ACCESS_TOKEN. */
function WebApp_claveCaptura_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var clave = props.getProperty('CAPTURA_ACCESS_TOKEN');
    if (clave) return clave;
    var lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
    if (lock && !lock.tryLock(5000)) return '';
    try {
      clave = props.getProperty('CAPTURA_ACCESS_TOKEN');
      if (clave) return clave;
      clave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      props.setProperty('CAPTURA_ACCESS_TOKEN', clave);
      return clave;
    } finally { if (lock) lock.releaseLock(); }
  } catch (e) { return ''; }
}

/** Clave de operador: separada de captura. Solo se entrega desde el menú de Sheets. */
function WebApp_claveOperador_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var clave = props.getProperty('OPERADOR_ACCESS_TOKEN');
    if (clave) return clave;
    var lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
    if (lock && !lock.tryLock(5000)) return '';
    try {
      clave = props.getProperty('OPERADOR_ACCESS_TOKEN');
      if (clave) return clave;
      clave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      props.setProperty('OPERADOR_ACCESS_TOKEN', clave);
      return clave;
    } finally { if (lock) lock.releaseLock(); }
  } catch (e) { return ''; }
}

function WebApp_accesoCapturaValido_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  var esperado = WebApp_claveCaptura_();
  return !!esperado && token === esperado;
}

function WebApp_accesoOperadorValido_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  var esperado = WebApp_claveOperador_();
  return !!esperado && token === esperado;
}

/** URL del canal de captura (QR y URL base). No concede acceso privilegiado. */
function WebApp_urlCaptura_() {
  var clave = WebApp_claveCaptura_();
  return clave ? ECICEP_webAppUrl() + '?acceso=' + encodeURIComponent(clave) : '';
}

/** URL de una vista de operador (paneles, ficha, REM…). Solo desde Sheets/UI autorizada. */
function WebApp_urlOperadorVista_(vista) {
  var base = ECICEP_webAppUrl();
  var token = WebApp_claveOperador_();
  if (!token) return '';
  return base + '?acceso=' + encodeURIComponent(token) +
    (vista ? '&vista=' + encodeURIComponent(vista) : '');
}

// ---- Alias de compatibilidad (contrato heredado). ----
// WebApp_claveCompartida_ / WebApp_accesoCompartidoValido_ / WebApp_urlCompartida_
// representan la CAPACIDAD DE CAPTURA (misma propiedad CAPTURA_ACCESS_TOKEN,
// misma URL del QR). WebApp_urlVista_ pasó a representar una vista de OPERADOR.

function WebApp_claveCompartida_() { return WebApp_claveCaptura_(); }

function WebApp_accesoCompartidoValido_(token) { return WebApp_accesoCapturaValido_(token); }

function WebApp_urlCompartida_() { return WebApp_urlCaptura_(); }

function WebApp_urlVista_(vista) { return WebApp_urlOperadorVista_(vista); }

/** Identidad del código servido (sello BUILD.js regenerado en cada push).
 *  CapturaWeb.html lo usa como contravalor: si el sello incrustado en la página
 *  difiere del que devuelve el backend, la página está en caché/obsoleta y se
 *  auto-recarga para no ejecutar RPC contra una plantilla antigua. */
function WebApp_buildActual_() {
  try {
    if (typeof ECICEP_BUILD !== 'undefined' && ECICEP_BUILD && ECICEP_BUILD.commit) {
      return String(ECICEP_BUILD.commit);
    }
    return '';
  } catch (e) { return ''; }
}

/** Devuelve el email del usuario activo o '' si no hay sesión autenticada. */
function WebApp_usuarioActivo() {
  try {
    if (typeof Session !== 'undefined' && Session.getActiveUser) {
      var u = Session.getActiveUser().getEmail();
      return u || '';
    }
  } catch (e) { /* sin sesión → acceso denegado */ }
  return '';
}

// ---------------------------------------------------------------------------
// ENTRYPOINT WEB (doGet único)
// ---------------------------------------------------------------------------

function doGet(e) {
  // Conserva la ruta de webhook (GET con token/action) existente en Webhook.js.
  if (e && e.parameter && (e.parameter.token !== undefined || e.parameter.action !== undefined)) {
    return _wh_despachar(e);
  }
  var p = e && e.parameter || {};
  var acceso = String(p.acceso || '').trim();
  var vista = String(p.vista || 'captura').trim();
  var esOperador = WebApp_usuarioActivo() || WebApp_accesoOperadorValido_(acceso);
  if (vista === 'captura') {
    return WebApp_servirCaptura_(esOperador);
  }
  if (!WebApp_accesoOperadorValido_(acceso)) {
    return ContentService.createTextOutput('Enlace de Captura no válido. Solicita el enlace o QR actualizado desde el menú ECICEP.');
  }
  var archivos = {
    portal: 'PortalWeb', pacientes: 'Sidebar',
    revision: 'Sidebar', ficha: 'Sidebar', controles: 'Controles',
    estadisticas: 'Dashboard', configuracion: 'Configuracion',
    backups: 'Backup', registro: 'LogVisor', instalar: 'Instalador', rem: 'RemVista',
    generarRem: 'RemGenerador'
  };
  var archivo = Object.prototype.hasOwnProperty.call(archivos, vista) ? archivos[vista] : '';
  if (!archivo) return ContentService.createTextOutput('Función no disponible. Abre el enlace actualizado de Captura.');
  var plantilla = HtmlService.createTemplateFromFile(archivo);
  var operador = WebApp_claveOperador_();
  // Página de OPERADOR: recibe el token de operador (privilegiado) para RPC.
  plantilla.CAPTURA_ACCESO = operador;
  plantilla.TOKEN_ACCESO = operador;
  plantilla.TOKEN_INVITACION = operador;
  plantilla.MODO_OPERADOR = true;
  plantilla.PORTAL_URL = WebApp_urlVista_('portal');
  plantilla.FICHA_URL = WebApp_urlVista_('ficha');
  plantilla.REM_URL = WebApp_urlVista_('rem');
  plantilla.DASH_URL = WebApp_urlVista_('estadisticas');
  plantilla.GENERAR_REM_URL = WebApp_urlVista_('generarRem');
  plantilla.BUILD = Utilities.formatDate(new Date(), ECICEP.TZ, 'yyyyMMdd-HHmm');
  plantilla.PAGE_BUILD = WebApp_buildActual_();
  plantilla.SECCION = 'TODAS';
  plantilla.modo = vista === 'pacientes' ? 'pacientes' : vista === 'revision' ? 'revision' : 'ficha';
  plantilla.ID_INICIAL = vista === 'ficha' && p.id ? String(p.id) : '';
  if (vista === 'portal') {
    plantilla.LINKS = [
      ['Captura', 'captura'], ['Pacientes y ficha', 'pacientes'],
      ['Controles', 'controles'], ['Estadísticas', 'estadisticas'],
      ['REM', 'rem'], ['Generar REM', 'generarRem'],
      ['Cola de revisión', 'revision'], ['Configuración', 'configuracion'],
      ['Backups', 'backups'], ['Registro', 'registro'],
      ['Instalar / reparar', 'instalar']
    ].map(function (item) { return { titulo: item[0], url: WebApp_urlVista_(item[1]) }; });
  }
  return plantilla.evaluate()
    .setTitle('ECICEP — ' + vista)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Sirve el canal de captura (público). CAPTURA_ACCESO = clave de captura;
 *  TOKEN_ACCESO / TOKEN_INVITACION quedan VACÍOS: la página pública nunca
 *  recibe credenciales privilegiadas. MODO_OPERADOR=true solo si quien abre
 *  la URL es un operador (sesión o token de operador). */
function WebApp_servirCaptura_(esOperador) {
  var plantilla = HtmlService.createTemplateFromFile('CapturaWeb');
  var clave = WebApp_claveCaptura_();
  plantilla.CAPTURA_ACCESO = clave;
  plantilla.TOKEN_ACCESO = '';
  plantilla.TOKEN_INVITACION = '';
  plantilla.MODO_OPERADOR = !!esOperador;
  plantilla.PORTAL_URL = esOperador ? WebApp_urlVista_('portal') : '';
  plantilla.FICHA_URL = '';
  plantilla.REM_URL = '';
  plantilla.DASH_URL = '';
  plantilla.GENERAR_REM_URL = '';
  plantilla.BUILD = Utilities.formatDate(new Date(), ECICEP.TZ, 'yyyyMMdd-HHmm');
  plantilla.PAGE_BUILD = WebApp_buildActual_();
  plantilla.SECCION = 'TODAS';
  plantilla.modo = 'ficha';
  plantilla.ID_INICIAL = '';
  return plantilla.evaluate()
    .setTitle('ECICEP — Captura de datos')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------------------
// PUENTE → PIPELINE EXISTENTE
// ---------------------------------------------------------------------------

/**
 * GAS: expone a la Web App el esquema del formulario (secciones por ACCION,
 * campos requeridos y mensajes de éxito) derivado de FORM_CONFIG. La UI pinta
 * y valida con LO MISMO que valida el backend — sin reglas duplicadas a mano.
 */
function WebApp_esquemaFormulario() {
  return Form_esquemaFormulario();
}

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
  var _tTotal = Date.now();
  try {
    if (!WebApp_usuarioActivo()) {
      return { ok: false, message: 'Sesión de usuario no detectada; acceso denegado', errors: [{ campo: '_', mensaje: 'ACCESO_DENEGADO' }] };
    }
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

    // idempotencia: si un envío IDÉNTICO (ACCION+RUT) llegó en los últimos 90s
    // y NO terminó en error, se reaprovecha (evita duplicado por doble clic o
    // reintento tras timeout→botón re-habilitado). Nunca crea una segunda fila.
    var existente = UI_buscarEnvioReciente(crudo.ACCION, crudo.RUT);
    if (existente && existente.responseId) {
      console.log('[BACKEND] 03c envío reciente detectado '+existente.responseId+' estado='+existente.estado);
      // Si el envío previo quedó pendiente (un timeout interrumpió el
      // procesamiento del lado del servidor), se re-ejecuta el pipeline para
      // RETOMARLO y se responde con el estado real, nunca con un falso éxito.
      if (existente.estado === 'RECIBIDO' || existente.estado === 'VALIDANDO') {
        try { Form_procesarPendientes({ max: 200 }); } catch (eProc) { console.log('[BACKEND] 03c retomar pendientes: ' + String(eProc)); }
      }
      var estadoExistente = UI_lecturaEstadoRespuesta(existente.responseId);
      var pendiente = (estadoExistente.estado === 'RECIBIDO' || estadoExistente.estado === 'VALIDANDO');
      return {
        ok: !(estadoExistente.estado === 'ERROR') && !pendiente,
        message: estadoExistente.estado === 'ERROR'
          ? 'El envío anterior falló: ' + (estadoExistente.motivo || estadoExistente.estado)
          : (pendiente
              ? 'Registro ya recibido (procesamiento pendiente; se retomará automáticamente)'
              : 'Registro ya recibido (se evita duplicado)'),
        data: { responseId: existente.responseId, accion: crudo.ACCION, estado: estadoExistente.estado, motivo: estadoExistente.motivo, idInterno: estadoExistente.idInterno },
        errors: []
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
      JSON.stringify(crudo), '', '', 0, 'RECIBIDO', '', '', '', '', crudo.FECHA_INGRESO || ''
    ]);

    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja) { Form_instalar(); hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS); }
    var cols = Form_columnas();
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, cols.length).setValues([filaPlana]);
    console.log('[BACKEND] 05 fila escrita en FORM_RESPUESTAS');

    // Procesa con el pipeline EXISTENTE (misma ruta que onFormSubmit).
    // 'fuerzaNuevoPaciente' (elegido por el usuario: "son personas diferentes")
    // propaga confirmarNuevos al pipeline → POSIBLE_DUPLICADO se crea como nuevo.
    var opcionesProc = { max: 200 };
    if (datos.__fuerzaNuevoPaciente === true) opcionesProc.confirmarNuevos = true;
    console.log('[BACKEND] 06 inicio Form_procesarPendientes confirmarNuevos=' + (opcionesProc.confirmarNuevos === true));
    var t0 = new Date().getTime();
    var proc = Form_procesarPendientes(opcionesProc);
    var t1 = new Date().getTime();
    console.log('[BACKEND] 07 fin Form_procesarPendientes duracion=' + (t1 - t0) + 'ms proc=' + JSON.stringify(proc).substring(0, 200));

    // Lee el resultado de este envío para responder al navegador.
    var estado = UI_lecturaEstadoRespuesta(responseId);
    console.log('[BACKEND] 08 estado=' + JSON.stringify(estado));

    var esError = estado.estado === 'ERROR';
    var esRevision = estado.estado === 'REQUIERE_REVISION';
    var procFallido = !!(proc && proc.ok === false);
    // Respuesta VERAZ según lo que realmente ocurrió: si el procesamiento
    // falló (lock ocupado, excepción) o la fila quedó sin estado final, nunca
    // reportar "registrado correctamente" por defecto.
    var ok = !esError && !procFallido;
    var message = esError
      ? ('No se pudo completar: ' + (estado.motivo || estado.estado))
      : esRevision
        ? 'Registro recibido — requiere revisión'
        : procFallido
          ? ('No se pudo registrar: ' + (proc.motivo || 'El procesamiento no finalizó'))
          : (estado.estado === 'RECIBIDO' || estado.estado === 'VALIDANDO')
            ? 'Registro recibido. El procesamiento quedó pendiente; se retomará automáticamente.'
            : 'Registro realizado correctamente';
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
    // Si el envío terminó en ERROR, adjuntar un diagnóstico en vivo de la hoja
    // (estado real de la fila y de la marca), para depurar sin volver a ciegas.
    // 2024-09-04: el diagnóstico corre INLINE dentro del mismo request (presupuesto 60s)
    // → se mide su tiempo y se hizo barato (lectura única por hoja, sin normalizar todo).
    if (esError) {
      var _tDiag = Date.now();
      try {
        if (typeof Form_diagnosticoEnvio === 'function') {
          resultado.data.diagnostico = Form_diagnosticoEnvio(responseId);
          console.log('[DIAG] t=' + (Date.now() - _tDiag) + 'ms ' + JSON.stringify(resultado.data.diagnostico).substring(0, 1500));
        }
      } catch (eDiag) {
        console.log('[DIAG] error capturando diagnóstico: ' + String(eDiag));
      }
    }
    console.log('[BACKEND] 09 RETORNANDO ok=' + ok + ' estado=' + estado.estado + ' tTotal=' + (Date.now() - _tTotal) + 'ms');
    return resultado;
  } catch (err) {
    console.error('[BACKEND] 09C EXCEPTION:', err && err.message ? err.message : String(err), 'tTotal=' + (Date.now() - _tTotal) + 'ms');
    Log_error('WebApp', 'capturarDesdeUI', err && err.message ? err.message : String(err));
    Log_flush();
    return {
      ok: false,
      message: 'Error interno al registrar.',
      errors: [{ campo: '_', mensaje: err && err.message ? err.message : String(err) }]
    };
  }
}

/**
 * GAS: busca un envío previo con la MISMA ACCION+RUT dentro de una ventana de
 * 90 segundos que NO haya terminado en ERROR. Devuelve {responseId, estado} o
 * null. Lee solo las filas recientes del final (máx 25).
 */
function UI_buscarEnvioReciente(accion, rut) {
  try {
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja) return null;
    var ultima = hoja.getLastRow();
    var hr = Modelo_headerRow(HOJAS.FORM_RESPUESTAS);
    if (!ultima || ultima < hr) return null;
    var desde = Math.max(hr + 1, ultima - 24);
    var valores = hoja.getRange(desde, 1, ultima - desde + 1, Math.max(hoja.getLastColumn() || 0, 1)).getValues();
    var mapa = Form_mapeoEncabezados(hoja.getRange(hr, 1, 1, Math.max(hoja.getLastColumn() || 0, 1)).getValues()[0]);
    var idx = mapa.idx;
    var ahora = Date.now();
    for (var i = valores.length - 1; i >= 0; i--) {
      var filaA = valores[i];
      var ts = idx['FECHAFORMS'] !== undefined ? new Date(filaA[idx['FECHAFORMS']]).getTime() : 0;
      if (!ts || (ahora - ts) > 90000) continue;
      var a = Utl_colapsarEspacios(Utl_texto(idx['ACCION'] !== undefined ? filaA[idx['ACCION']] : '')).toUpperCase();
      var r = Utl_texto(idx['RUT'] !== undefined ? filaA[idx['RUT']] : '').toUpperCase().replace(/[\s.]/g, '');
      var r2 = Utl_texto(rut).toUpperCase().replace(/[\s.]/g, '');
      if (a === accion && r === r2) {
        var est = Utl_texto(idx['ESTADO'] !== undefined ? filaA[idx['ESTADO']] : '').toUpperCase();
        if (est === 'ERROR') continue;
        return { responseId: Utl_texto(idx['RESPONSEID'] !== undefined ? filaA[idx['RESPONSEID']] : ''), estado: est || 'RECIBIDO' };
      }
    }
  } catch (e) { console.log('[BACKEND] busqueda reciente: ' + String(e)); }
  return null;
}

/** GAS: lee el estado/motivo/idInterno de una respuesta recién procesada. */
function UI_lecturaEstadoRespuesta(responseId) {
  try {
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja || hoja.getLastRow() < Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS)) {
      return { estado: 'RECIBIDO', motivo: '', idInterno: '' };
    }
    var ultima = hoja.getLastRow();
    var hr = Modelo_headerRow(HOJAS.FORM_RESPUESTAS);
    // La respuesta recién se escribió al final: leer solo la cola (evita leer
    // todo el histórico de FORM_RESPUESTAS en cada envío).
    var desde = Math.max(hr + 1, ultima - 39);
    var ancho = Math.max(hoja.getLastColumn() || 0, 1);
    var enc = hoja.getRange(hr, 1, 1, ancho).getValues()[0];
    var mapa = Form_mapeoEncabezados(enc);
    var valores = hoja.getRange(desde, 1, ultima - desde + 1, ancho).getValues();
    for (var f = valores.length - 1; f >= 0; f--) {
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

/**
 * GAS: versión reducida y legible de un paciente para mostrar en la Web App.
 * Cuidado de privacidad: NO se expone TELEFONOS ni OBSERVACIONES al navegador;
 * solo identidad y fechas de operación (los datos que el formulario ya conoce).
 */
function WebApp_resumenPaciente(p) {
  if (!p) return null;
  return {
    idInterno: p.ID_INTERNO || '',
    nombre: Utl_texto(p.NOMBRE),
    rut: Utl_texto(p.RUT),
    sexo: Utl_texto(p.SEXO),
    fechaNacimiento: Utl_texto(p.FECHA_NACIMIENTO),
    sector: Utl_texto(p.SECTOR),
    estratificacion: Utl_texto(p.ESTRATIFICACION),
    fechaIngreso: Utl_texto(p.FECHA_INGRESO)
  };
}

function api_webappEstado(acceso) {
  if (!WebApp_autorizarCaptura(acceso)) return {ok:false,motivo:'ACCESO_DENEGADO'};
  return {
    ok: true,
    version: ECICEP.VERSION,
    build: WebApp_buildActual_(),
    entorno: typeof Entorno_actualGAS !== 'undefined' ? Entorno_actualGAS().entorno : 'DESCONOCIDO',
    url: WebApp_urlCompartida_()
  };
}

/** GAS: estado inicial de la WebApp (esquema + catálogo profesionales + url).
 *  Unifica en una sola RPC las llamadas que el formulario realizaba por separado
 *  al cargar (esquema, catálogo y url), reduciendo la latencia inicial a 1 viaje. */
function WebApp_estadoInicial(acceso) {
  if (!WebApp_autorizarCaptura(acceso)) return {ok:false,motivo:'ACCESO_DENEGADO'};
  return {
    esquema: Form_esquemaFormulario(),
    profesionales: WebApp_profesionalesDropdown(),
    url: WebApp_urlCompartida_(),
    build: WebApp_buildActual_()
  };
}

/** GAS: catálogo PROFESIONALES para el dropdown de la Web App.
 *  Contrato del api_profesionalesCatalogo retirado: solo profesionales activos,
 *  como nombres canónicos (strings), no objetos. */
function WebApp_profesionalesDropdown() {
  try {
    if (typeof Captura_v2_catalogo !== 'function') return [];
    return Captura_v2_catalogo()
      .filter(function (c) { return c && c.ACTIVO !== false && (c.NOMBRE_CANONICO || c.NOMBRE || c.CODIGO); })
      .map(function (c) { return c.NOMBRE_CANONICO || c.NOMBRE || c.CODIGO; });
  } catch (e) {
    return [];
  }
}
