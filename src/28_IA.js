/**
 * Sistema ECICEP — 28_IA
 * Integración gratuita con Google Gemini API para análisis y corrección
 * de datos. Lee la hoja de cálculo, detecta errores, ejecuta pruebas
 * y procesa instrucciones en lenguaje natural.
 *
 * Configuración: API key en Script Properties (clave: GEMINI_API_KEY).
 * Obtener gratis en: https://aistudio.google.com/apikey
 *
 * Límites tier gratuito:
 *   - Gemini 2.0 Flash: ~1,500 req/día, 15 RPM
 *   - ~8K tokens input/output por request
 *
 * SEGURIDAD: Nunca envía datos identificables (RUT, nombre) a la API.
 * Solo envía estructura, estadísticas y patrones anonimizados.
 */

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

var IA_CONFIG = {
  MODEL: 'gemini-2.0-flash',
  MAX_RETRIES: 3,
  TIMEOUT_MS: 30000,
  MODO_CORRECCION: 'auto',  // 'auto' | 'sugerir' | 'strict'
  LOG_SHEET: 'LOG_IA',
  BATCH_SIZE: 50  // filas por lote en procesamiento
};

// ---------------------------------------------------------------------------
// Conexión con Gemini API
// ---------------------------------------------------------------------------

/**
 * Llamada base a Gemini API con retry/backoff exponencial.
 * @param {string} prompt - Texto del prompt
 * @param {Object} [opts] - Opciones adicionales
 * @returns {string} Respuesta de la IA
 */
function IA_llamarGemini(prompt, opts) {
  opts = opts || {};
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada. Ve a Script Properties y añade la clave.');
  }

  var model = opts.model || IA_CONFIG.MODEL;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + model + ':generateContent?key=' + apiKey;

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature || 0.3,
      maxOutputTokens: opts.maxTokens || 2048
    }
  };

  var lastError = null;
  for (var attempt = 0; attempt < IA_CONFIG.MAX_RETRIES; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var code = response.getResponseCode();
      if (code === 429) {
        // Rate limited: esperar y reintentar
        var waitMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        Utilities.sleep(waitMs);
        continue;
      }

      if (code !== 200) {
        var errBody = response.getContentText();
        throw new Error('Gemini API error ' + code + ': ' + errBody.substring(0, 200));
      }

      var data = JSON.parse(response.getContentText());
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
      }
      throw new Error('Respuesta inesperada de Gemini: ' + JSON.stringify(data).substring(0, 200));

    } catch (e) {
      lastError = e;
      if (attempt < IA_CONFIG.MAX_RETRIES - 1) {
        Utilities.sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  throw new Error('Gemini API falló tras ' + IA_CONFIG.MAX_RETRIES + ' intentos: ' + (lastError ? lastError.message : 'desconocido'));
}

// ---------------------------------------------------------------------------
// Utilidades de lectura de datos (sin enviar PII)
// ---------------------------------------------------------------------------

/**
 * Lee una hoja y devuelve estadísticas anonimizadas para la IA.
 * NUNCA envía datos reales, solo estructura y patrones.
 */
/**
 * Detecta si un nombre de campo contiene datos personales identificables
 * o datos clínicos libres. Para estos campos, IA_leerEstadisticas omite
 * ejemplos del prompt de Gemini y solo envía métricas agregadas.
 */
function IA_esCampoSensible(nombre) {
  var n = String(nombre).trim().toUpperCase();
  return (
    /RUT/.test(n) ||
    /NOMBRE/.test(n) ||
    /TELEFONO/.test(n) ||
    /EMAIL|CORREO/.test(n) ||
    /DIRECCION/.test(n) ||
    /FECHA_NAC/.test(n) ||
    /OBSERVA/.test(n) ||
    /DESCRIPCION/.test(n) ||
    /PROFESIONAL/.test(n) ||
    /REGISTRADO_POR/.test(n) ||
    /NOTA/.test(n) ||
    /DUPLA/.test(n) ||
    /COMPOSICION/.test(n)
  );
}

/**
 * Lee una hoja siempre alineada a su contrato de layout vigente.
 * - Hojas visuales (PACIENTES): lee desde los encabezados reales hacia abajo
 *   (Modelo_leerBloqueCabecera), respetando título/secciones sin asumir fila 1.
 * - Hojas simples: lectura completa (encabezados + datos).
 * Devuelve [ [encabezados], ...filas de datos ]. Jamás asume fila 1.
 */
function IA_leerBloque(hojaNombre, hoja) {
  if (!hojaNombre) return [];
  if (!hoja) {
    try { hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(hojaNombre); } catch (e) { return []; }
  }
  if (!hoja) return [];
  if (Modelo_esHojaVisual(hojaNombre)) return Modelo_leerBloqueCabecera(hojaNombre, hoja);
  return Utl_leerBloque(hoja);
}

/**
 * Lee estadísticas descriptivas de una hoja.
 * Los campos sensibles solo aportan métricas agregadas (vacíos/únicos);
 * sus ejemplos concretos NO se envían a la API.
 */
function IA_leerEstadisticas(hojaNombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(hojaNombre);
  if (!hoja) return null;

  var datos = IA_leerBloque(hojaNombre, hoja);
  if (datos.length < 2) return { hoja: hojaNombre, filas: 0, columnas: 0 };

  var encabezados = datos[0];
  var filas = datos.length - 1;
  var stats = {
    hoja: hojaNombre,
    filas: filas,
    columnas: encabezados.length,
    campos: []
  };

  for (var c = 0; c < encabezados.length; c++) {
    var nombre = Utl_texto(encabezados[c]);
    var sensible = IA_esCampoSensible(nombre);
    var campo = {
      nombre: nombre,
      vacios: 0,
      unicos: 0,
      ejemplos: []
    };

    var valores = new Set();
    for (var f = 1; f < datos.length; f++) {
      var val = Utl_texto(datos[f][c]).trim();
      if (val === '') campo.vacios++;
      else {
        valores.add(val);
        if (!sensible && campo.ejemplos.length < 3) campo.ejemplos.push(val);
      }
    }
    campo.unicos = valores.size;
    if (sensible) campo.ejemplos = ['[OCULTO]'];
    stats.campos.push(campo);
  }

  return stats;
}

/**
 * Lee datos de una columna específica (anonimizados).
 */
function IA_leerColumna(hojaNombre, nombreColumna, maxFilas) {
  if (!WebApp_usuarioActivo()) return [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(hojaNombre);
  if (!hoja) return [];

  var datos = IA_leerBloque(hojaNombre, hoja);
  if (datos.length < 2) return [];

  var colIdx = -1;
  for (var c = 0; c < datos[0].length; c++) {
    if (Utl_texto(datos[0][c]).trim().toUpperCase() === nombreColumna.toUpperCase()) {
      colIdx = c;
      break;
    }
  }
  if (colIdx === -1) return [];

  var resultados = [];
  var limite = maxFilas || datos.length;
  for (var f = 1; f < Math.min(datos.length, limite); f++) {
    resultados.push({
      fila: Modelo_filaFisica(hojaNombre, f - 1),
      valor: Utl_texto(datos[f][colIdx]).trim()
    });
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// Análisis de datos
// ---------------------------------------------------------------------------

/**
 * Análisis completo de una hoja: detecta errores comunes y sugiere correcciones.
 */
function IA_analizarHoja(hojaNombre) {
  var stats = IA_leerEstadisticas(hojaNombre);
  if (!stats) return { error: 'Hoja no encontrada: ' + hojaNombre };

  var prompt = 'Eres un analista de datos clínicos. Analiza esta estructura de hoja de cálculo '
    + 'y detecta problemas comunes. NO uses datos reales, solo patrones.\n\n'
    + 'ESTRUCTURA:\n'
    + JSON.stringify(stats, null, 2) + '\n\n'
    + 'Detecta:\n'
    + '1. Campos con muchos valores vacíos (>20%)\n'
    + '2. Valores que no cumplen formato esperado (RUT, fecha, teléfono, sexo)\n'
    + '3. Posibles duplicados por patrón\n'
    + '4. Inconsistencias en datos categóricos\n\n'
    + 'Responde en JSON con el formato:\n'
    + '{ "problemas": [{ "tipo": "...", "campo": "...", "descripcion": "...", "severidad": "alta|media|baja", "correccion": "..." }], "resumen": "..." }';

  var respuesta = IA_llamarGemini(prompt);
  return IA_parsearJSON(respuesta);
}

/**
 * Analiza la hoja PACIENTES para errores específicos.
 */
function IA_analizarPacientes() {
  return IA_analizarHoja(HOJAS.PACIENTES);
}

/**
 * Analiza la hoja EVENTOS para errores específicos.
 */
function IA_analizarEventos() {
  return IA_analizarHoja(HOJAS.EVENTOS);
}

/**
 * Detecta duplicados potenciales por RUT o nombre相似.
 */
function IA_detectarDuplicados() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = IA_leerBloque(HOJAS.PACIENTES, hoja);
  if (datos.length < 3) return { duplicados: [], mensaje: 'Datos insuficientes' };

  // Columnas por nombre de encabezado (nunca por índice fijo)
  var colRut = IA_columnaPorNombre(datos, 'RUT');
  if (colRut === -1) return { error: 'Columna RUT no encontrada' };

  // Construir mapa de RUTs (sin enviar a IA)
  var mapaRuts = {};
  var duplicados = [];

  for (var f = 1; f < datos.length; f++) {
    var rut = Utl_texto(datos[f][colRut]).trim().toUpperCase(); // Columna RUT
    if (rut && mapaRuts[rut] !== undefined) {
      duplicados.push({
        rut: '***', // No exponer RUT real
        fila1: Modelo_filaFisica(HOJAS.PACIENTES, mapaRuts[rut]),
        fila2: Modelo_filaFisica(HOJAS.PACIENTES, f - 1)
      });
    }
    if (rut) mapaRuts[rut] = f - 1;
  }

  return {
    totalPacientes: datos.length - 1,
    duplicadosEncontrados: duplicados.length,
    detalle: duplicados.slice(0, 20) // Máximo 20 para no sobrecargar
  };
}

/**
 * Verifica integridad de eventos: huérfanos, fechas inconsistentes, etc.
 */
function IA_verificarIntegridadEventos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaEventos = ss.getSheetByName(HOJAS.EVENTOS);
  var hojaPacientes = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hojaEventos || !hojaPacientes) {
    return { error: 'Faltan hojas EVENTOS o PACIENTES' };
  }

  var eventos = IA_leerBloque(HOJAS.EVENTOS, hojaEventos);
  var pacientes = IA_leerBloque(HOJAS.PACIENTES, hojaPacientes);

  // Columnas por nombre de encabezado (nunca por índice fijo)
  var colPacId = IA_columnaPorNombre(pacientes, 'ID_INTERNO');
  var colEvId = IA_columnaPorNombre(eventos, 'ID_INTERNO');
  if (colPacId === -1 || colEvId === -1) {
    return { error: 'Columna ID_INTERNO no encontrada en PACIENTES o EVENTOS' };
  }

  // Construir set de IDs internos de pacientes
  var idsPacientes = {};
  for (var f = 1; f < pacientes.length; f++) {
    var pid = Utl_texto(pacientes[f][colPacId]).trim();
    if (pid) idsPacientes[pid] = true;
  }

  var problemas = [];
  for (var f = 1; f < eventos.length; f++) {
    var idInterno = Utl_texto(eventos[f][colEvId]).trim(); // ID_INTERNO en eventos
    if (idInterno && !idsPacientes[idInterno]) {
      problemas.push({
        tipo: 'EVENTO_HUERFANO',
        fila: Modelo_filaFisica(HOJAS.EVENTOS, f - 1),
        descripcion: 'Evento sin paciente asociado'
      });
    }
  }

  return {
    totalEventos: eventos.length - 1,
    problemasEncontrados: problemas.length,
    detalle: problemas.slice(0, 50)
  };
}

// ---------------------------------------------------------------------------
// Revisión integral de datos — mecanismo puro (node-testable)
// ---------------------------------------------------------------------------

/**
 * PURA: verifica correspondencia entre PACIENTES y EVENTOS.
 * Detecta: eventos huérfanos, pacientes sin eventos, RUT discordante entre
 * paciente y evento, y duplicados por RUT o nombre normalizado.
 * Por política operativa (DEC-IA-2026-01): NO reporta sector del evento
 * distinto al del paciente (heterogeneidad normal entre fuente y consolidado)
 * ni eventos con fecha anterior al ingreso (la fuente no fue ingestada con el
 * sistema, por lo que puede preceder al ingreso o sucederlo).
 * @param {Array} datosPacientes bloque [[encabezados], ...filas]
 * @param {Array} datosEventos bloque [[encabezados], ...filas]
 * @returns {Array} [{tipo, severidad, fila, detalle}]
 */
function IA_revisarConsistencia(datosPacientes, datosEventos) {
  function _claveRut(raw) {
    var n = Norm_normalizarRut(Utl_texto(raw).trim());
    if (n && n.rut) return n.rut;
    return Utl_texto(raw).trim().toUpperCase();
  }
  if (!datosPacientes || datosPacientes.length < 2) return [];
  if (!datosEventos || datosEventos.length < 2) {
    var vacio = [];
    var colId = IA_columnaPorNombre(datosPacientes, 'ID_INTERNO');
    for (var f = 1; f < datosPacientes.length; f++) {
      var id = colId >= 0 ? Utl_texto(datosPacientes[f][colId]).trim() : '';
      if (id) vacio.push({
        tipo: 'PACIENTE_SIN_EVENTOS', severidad: 'WARNING',
        fila: Modelo_filaFisica(HOJAS.PACIENTES, f - 1),
        detalle: 'paciente sin ningún evento registrado'
      });
    }
    return vacio;
  }

  var probs = [];
  var colPacId = IA_columnaPorNombre(datosPacientes, 'ID_INTERNO');
  var colPacRut = IA_columnaPorNombre(datosPacientes, 'RUT');
  var colPacNombre = IA_columnaPorNombre(datosPacientes, 'NOMBRE');

  var colEvId = IA_columnaPorNombre(datosEventos, 'ID_INTERNO');
  var colEvRut = IA_columnaPorNombre(datosEventos, 'RUT');

  var porId = {};
  for (var f = 1; f < datosPacientes.length; f++) {
    var id = colPacId >= 0 ? Utl_texto(datosPacientes[f][colPacId]).trim() : '';
    if (!id) continue;
    porId[id] = {
      fila: Modelo_filaFisica(HOJAS.PACIENTES, f - 1),
      rut: colPacRut >= 0 ? _claveRut(datosPacientes[f][colPacRut]) : '',
      nombre: colPacNombre >= 0 ? Utl_texto(datosPacientes[f][colPacNombre]).trim() : ''
    };
  }

  var conteoEventos = {};
  Object.keys(porId).forEach(function (id) { conteoEventos[id] = 0; });

  for (var e = 1; e < datosEventos.length; e++) {
    var eid = colEvId >= 0 ? Utl_texto(datosEventos[e][colEvId]).trim() : '';
    var pac = porId[eid];
    if (!pac) {
      probs.push({
        tipo: 'EVENTO_HUERFANO', severidad: 'ERROR',
        fila: Modelo_filaFisica(HOJAS.EVENTOS, e - 1),
        detalle: 'evento sin paciente asociado (ID: ' + eid + ')'
      });
      continue;
    }
    conteoEventos[eid]++;

    if (colEvRut >= 0 && pac.rut) {
      var evRut = colEvRut >= 0 ? _claveRut(datosEventos[e][colEvRut]) : '';
      if (evRut && evRut !== pac.rut) {
        probs.push({
          tipo: 'RUT_EVENTO_DISTINTO', severidad: 'WARNING',
          fila: Modelo_filaFisica(HOJAS.EVENTOS, e - 1),
          detalle: 'RUT del evento (' + evRut + ') ≠ RUT del paciente (' + pac.rut + ')'
        });
      }
    }
    // Política DEC-IA-2026-01: NO se reportan sector del evento distinto al
    // del paciente ni eventos anteriores al ingreso (fuente previa al sistema).
  }

  Object.keys(conteoEventos).forEach(function (id) {
    if (conteoEventos[id] === 0) {
      var pac = porId[id];
      probs.push({
        tipo: 'PACIENTE_SIN_EVENTOS', severidad: 'WARNING',
        fila: pac.fila,
        detalle: 'paciente sin ningún evento registrado'
      });
    }
  });

  var porRut = {};
  Object.keys(porId).forEach(function (id) {
    var r = porId[id].rut;
    if (r && r !== 'SIN RUT') {
      if (!porRut[r]) porRut[r] = [];
      porRut[r].push(porId[id]);
    }
  });
  Object.keys(porRut).forEach(function (r) {
    if (porRut[r].length > 1) {
      probs.push({
        tipo: 'PACIENTE_RUT_DUPLICADO', severidad: 'WARNING',
        fila: porRut[r][0].fila,
        detalle: 'RUT (' + r + ') presente en ' + porRut[r].length + ' pacientes'
      });
    }
  });

  var porNombre = {};
  Object.keys(porId).forEach(function (id) {
    var nombre = porId[id].nombre;
    var clave = nombre ? Norm_claveNombre(nombre) : '';
    if (clave) {
      if (!porNombre[clave]) porNombre[clave] = [];
      porNombre[clave].push(porId[id]);
    }
  });
  Object.keys(porNombre).forEach(function (clave) {
    var grupo = porNombre[clave];
    if (grupo.length < 2) return;
    var ruts = {};
    grupo.forEach(function (p) { ruts[p.rut] = true; });
    if (Object.keys(ruts).length > 1) {
      probs.push({
        tipo: 'PACIENTE_NOMBRE_DUPLICADO', severidad: 'WARNING',
        fila: grupo[0].fila,
        detalle: 'nombre duplicado (' + grupo[0].nombre + ') con ' + grupo.length + ' pacientes distintos'
      });
    }
  });

  return probs;
}

/**
 * PURA: identifica eventos huérfanos — filas de EVENTOS cuyo ID_INTERNO no
 * existe entre los IDs de PACIENTES. Devuelve filas físicas (contrato de
 * Modelo_filaFisica) para borrado posterior. Los eventos con ID_INTERNO vacío
 * se reportan por separado (NUNCA se eliminan automáticamente: pueden ser
 * capturas en curso).
 * @param {Array} datosEventos bloque [[encabezados], ...filas]
 * @param {Object} idsPacientes set de IDs válidos
 * @returns {{ huerfanos: Array, sinId: Array }}
 */
function IA_eventosHuerfanos(datosEventos, idsPacientes) {
  var res = { huerfanos: [], sinId: [] };
  if (!datosEventos || datosEventos.length < 2) return res;
  var colEvId = IA_columnaPorNombre(datosEventos, 'ID_INTERNO');
  for (var f = 1; f < datosEventos.length; f++) {
    var id = colEvId >= 0 ? Utl_texto(datosEventos[f][colEvId]).trim() : '';
    var fila = Modelo_filaFisica(HOJAS.EVENTOS, f - 1);
    if (!id) { res.sinId.push({ fila: fila, id: id }); continue; }
    var sinPaciente = !idsPacientes || !idsPacientes[id];
    if (sinPaciente) res.huerfanos.push({ fila: fila, id: id });
  }
  return res;
}

/**
 * GAS: elimina eventos huérfanos en bloque (patrón Recuperar_ejecutar:
 * leer → filtrar → limpiar → reescribir; NUNCA deleteRow en loop).
 * Solo borra eventos con ID_INTERNO no nulo y sin paciente asociado.
 * @param {Object} opts { prueba/DRY_RUN } — si truthy, NO borra, solo informa.
 * @returns {{ok, huerfanos, sinId, conservados, borrados, dryRun}}
 */
function IA_limpiarEventosHuerfanos(opts) {
  var ss = Modelo_ss();
  var hojaE = ss.getSheetByName(HOJAS.EVENTOS);
  var hojaP = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hojaE || !hojaP) throw new Error('Faltan hojas EVENTOS o PACIENTES');

  var pacientes = Modelo_leerPacientes();
  var ids = {};
  pacientes.forEach(function (p) {
    var id = Utl_texto(p.ID_INTERNO).trim();
    if (id) ids[id] = true;
  });

  // Bloque completo desde fila 1 (título/secciones/headers + datos) para
  // reescritura exacta. El bloque de datos alinea IA_eventosHuerfanos con
  // Modelo_filaFisica (headers en [0], datos desde Modelo_headerRow).
  var ancho = Math.max(hojaE.getLastColumn(), 1);
  var ultima = Math.max(hojaE.getLastRow(), 1);
  var bloqueE = hojaE.getRange(1, 1, ultima, ancho).getValues();
  var hr = Modelo_headerRow(HOJAS.EVENTOS);
  var bloqueDatos = [bloqueE[hr - 1]].concat(bloqueE.slice(hr));
  var huerfanos = IA_eventosHuerfanos(bloqueDatos, ids);

  var dryRun = !!(opts && opts.prueba);
  var borrados = 0;
  if (huerfanos.huerfanos.length && !dryRun) {
    var aElim = {};
    huerfanos.huerfanos.forEach(function (h) { aElim[h.fila] = true; });
    var conservar = [];
    for (var i = 0; i < bloqueE.length; i++) {
      if (aElim[i + 1]) { borrados++; continue; }
      conservar.push(bloqueE[i]);
    }
    hojaE.getRange(1, 1, bloqueE.length, ancho).clearContent();
    if (conservar.length) Utl_escribirBloque(hojaE, 1, 1, conservar);
  }
  if (borrados) {
    Log_info('EVENTOS_HUERFANOS', 'Limpieza eventos huérfanos', borrados + ' eventos sin paciente eliminados');
  }
  return {
    ok: true,
    pacientes: pacientes.length,
    huerfanos: huerfanos.huerfanos.length,
    sinId: huerfanos.sinId.length,
    conservados: Math.max(bloqueE.length - borrados, 0),
    borrados: dryRun ? 0 : borrados,
    dryRun: dryRun
  };
}

/**
 * PURA: calidad de campos adicionales de PACIENTES no cubiertos por
 * Calidad_auditarTodo: SEXO, ESTRATIFICACION, ESTADO, FUENTE vacía,
 * FECHA_NACIMIENTO inválida, FECHA_INGRESO inválida, REQUIERE_REVISION.
 * @param {Array} datosPacientes bloque [[encabezados], ...filas]
 * @returns {Array} [{tipo, severidad, fila, detalle}]
 */
function IA_revisarCamposNuevos(datosPacientes) {
  if (!datosPacientes || datosPacientes.length < 2) return [];
  var probs = [];

  var colRut = IA_columnaPorNombre(datosPacientes, 'RUT');
  var colNombre = IA_columnaPorNombre(datosPacientes, 'NOMBRE');
  var colSexo = IA_columnaPorNombre(datosPacientes, 'SEXO');
  var colFnac = IA_columnaPorNombre(datosPacientes, 'FECHA_NACIMIENTO');
  var colFing = IA_columnaPorNombre(datosPacientes, 'FECHA_INGRESO');
  var colEstrat = IA_columnaPorNombre(datosPacientes, 'ESTRATIFICACION');
  var colEstado = IA_columnaPorNombre(datosPacientes, 'ESTADO');
  var colFuente = IA_columnaPorNombre(datosPacientes, 'FUENTE');
  var colRev = IA_columnaPorNombre(datosPacientes, 'REQUIERE_REVISION');

  var SEXOS_SET = { M: true, F: true, OTRO: true };
  var ESTRATS_SET = { G1: true, G2: true, G3: true };
  var ESTADOS_SET = {};
  if (typeof ESTADOS !== 'undefined' && ESTADOS.VALIDOS) {
    ESTADOS.VALIDOS.forEach(function (e) { ESTADOS_SET[e] = true; });
  }

  for (var f = 1; f < datosPacientes.length; f++) {
    var fila = Modelo_filaFisica(HOJAS.PACIENTES, f - 1);

    if (colRut >= 0) {
      var raw = Utl_texto(datosPacientes[f][colRut]).trim().toUpperCase();
      if (raw && !Norm_validarRut(raw)) {
        probs.push({
          tipo: raw.indexOf('-') === -1 ? 'RUT_INCOMPLETO' : 'RUT_INVALIDO',
          severidad: 'ERROR', fila: fila, detalle: 'RUT inválido: ' + raw
        });
      }
    }
    if (colNombre >= 0 && Utl_vacio(Utl_texto(datosPacientes[f][colNombre]))) {
      probs.push({ tipo: 'SIN_NOMBRE', severidad: 'ERROR', fila: fila, detalle: 'sin nombre' });
    }
    if (colSexo >= 0) {
      var sx = Utl_texto(datosPacientes[f][colSexo]).trim().toUpperCase();
      if (sx && !SEXOS_SET[sx]) {
        probs.push({ tipo: 'SEXO_INVALIDO', severidad: 'WARNING', fila: fila, detalle: 'sexo inválido: ' + sx });
      }
    }
    if (colFnac >= 0) {
      var val = datosPacientes[f][colFnac];
      if (!Utl_vacio(val) && !IA_parsearFecha(val, { min: CFG_FECHAS.ANO_MIN_NACIMIENTO, max: CFG_FECHAS.ANO_MAX })) {
        probs.push({ tipo: 'FECHA_NACIMIENTO_INVALIDA', severidad: 'ERROR', fila: fila,
          detalle: 'fecha nacimiento inválida: ' + Utl_texto(val) });
      }
    }
    if (colFing >= 0) {
      var val = datosPacientes[f][colFing];
      if (!Utl_vacio(val) && !IA_parsearFecha(val)) {
        probs.push({ tipo: 'FECHA_INGRESO_INVALIDA', severidad: 'ERROR', fila: fila,
          detalle: 'fecha ingreso inválida: ' + Utl_texto(val) });
      }
    }
    if (colEstrat >= 0) {
      var est = Utl_texto(datosPacientes[f][colEstrat]).trim().toUpperCase();
      if (est && !ESTRATS_SET[est]) {
        probs.push({ tipo: 'ESTRATIFICACION_INVALIDA', severidad: 'WARNING', fila: fila,
          detalle: 'estratificación inválida: ' + est });
      }
    }
    if (colEstado >= 0) {
      var edo = Utl_texto(datosPacientes[f][colEstado]).trim().toUpperCase();
      if (edo && !ESTADOS_SET[edo]) {
        probs.push({ tipo: 'ESTADO_INVALIDO', severidad: 'WARNING', fila: fila, detalle: 'estado inválido: ' + edo });
      }
    }
    if (colFuente >= 0 && Utl_vacio(Utl_texto(datosPacientes[f][colFuente]))) {
      probs.push({ tipo: 'FUENTE_VACIA', severidad: 'WARNING', fila: fila, detalle: 'fuente de origen no registrada' });
    }
    if (colRev >= 0) {
      var rev = datosPacientes[f][colRev];
      var revTxt = Utl_texto(rev).trim().toUpperCase();
      if (rev === true || revTxt === 'TRUE' || revTxt === 'VERDADERO' || revTxt === 'SI') {
        probs.push({ tipo: 'REQUIERE_REVISION', severidad: 'INFO', fila: fila, detalle: 'marcado para revisión' });
      }
    }
  }

  return probs;
}

/**
 * PURA: cruza un bloque de INGRESO contra el set de RUTs de PACIENTES.
 * @param {Object} rutsPacientes { 'RUT_NORMALIZADO': true, ... }
 * @param {string} nombreBloque hoja INGRESO (para cálculo de fila física)
 * @param {Array} datosIngreso bloque [[encabezados], ...filas]
 * @returns {Object} {totalFilas, totalConRut, faltantes:[{fila,rut,estado}], sinEstado}
 */
function IA_cruzarBloqueIngreso(rutsPacientes, nombreBloque, datosIngreso) {
  if (!datosIngreso || datosIngreso.length < 2) {
    return { totalFilas: 0, totalConRut: 0, faltantes: [], sinEstado: 0 };
  }

  var colRut = IA_columnaPorNombre(datosIngreso, 'RUT');
  var colEstado = IA_columnaPorNombre(datosIngreso, 'ESTADO_INGRESO');
  var headerRut = colRut >= 0 ? Utl_texto(datosIngreso[0][colRut]).trim().toUpperCase() : '';
  var totalFilas = datosIngreso.length - 1;
  var totalConRut = 0;
  var sinEstado = 0;
  var faltantes = [];

  for (var f = 1; f < datosIngreso.length; f++) {
    if (colRut < 0) break;
    var raw = Utl_texto(datosIngreso[f][colRut]).trim();
    if (!raw) continue;
    // Eco de encabezado (segunda fila de encabezados duplicada): no es un RUT.
    if (headerRut && raw.toUpperCase() === headerRut) continue;
    totalConRut++;
    var norm = Norm_normalizarRut(raw);
    var clave = norm.rut || raw.toUpperCase();
    var estado = colEstado >= 0 ? Utl_texto(datosIngreso[f][colEstado]).trim().toUpperCase() : '';
    if (!estado) sinEstado++;

    if (!rutsPacientes[clave]) {
      faltantes.push({
        fila: Modelo_filaFisica(nombreBloque, f - 1),
        rut: norm.rut || raw,
        estado: estado || 'SIN_ESTADO'
      });
    }
  }

  return { totalFilas: totalFilas, totalConRut: totalConRut, faltantes: faltantes, sinEstado: sinEstado };
}

// ---------------------------------------------------------------------------
// Revisión integral de datos — orquestación GAS
// ---------------------------------------------------------------------------

/**
 * Genera texto legible del reporte de revisión (para chat y UI).
 * @param {Object} reporte resultado de IA_revisarTodo
 * @returns {string}
 */
function IA_textoRevision(reporte) {
  var lin = '──────────────────────────────';
  var texto = 'Revisión Integral completada (' + (reporte.fecha || '') + ')\n\n';

  texto += 'Resumen\n';
  texto += 'Pacientes: ' + (reporte.totalPacientes || 0) + ' | Eventos: ' + (reporte.totalEventos || 0) + '\n';
  texto += 'Total problemas: ' + (reporte.totalProblemas || 0);
  if (reporte.porSeveridad) {
    texto += ' (' + (reporte.porSeveridad.ERROR || 0) + ' errores, '
      + (reporte.porSeveridad.WARNING || 0) + ' advertencias';
    if (reporte.porSeveridad.INFO) texto += ', ' + reporte.porSeveridad.INFO + ' informativos';
    texto += ')';
  }
  texto += '\n\n';

  (reporte.categorias || []).forEach(function (cat) {
    if (!cat.problemas || !cat.problemas.length) return;
    var nCat = (cat.total !== undefined) ? cat.total : cat.problemas.length;
    var detalle = cat.problemas;
    var completo = cat.problemasTotal || detalle;
    texto += lin + '\n';
    texto += cat.etiqueta + ' (' + nCat + ')\n';
    texto += lin + '\n';

    var conteo = {};
    completo.forEach(function (p) {
      var base = p.tipo;
      conteo[base] = (conteo[base] || 0) + 1;
    });
    Object.keys(conteo).forEach(function (tipo) {
      texto += '  ' + conteo[tipo] + ' × ' + tipo + '\n';
    });

    var muestra = detalle.slice(0, 8);
    muestra.forEach(function (p) {
      texto += '    fila ' + p.fila + ': ' + p.detalle + '\n';
    });
    if (detalle.length > 8) {
      texto += '    ... y ' + (nCat - 8) + ' más\n';
    }
    if (nCat > detalle.length) {
      texto += '    (detalle limitado a los primeros ' + detalle.length + ' problemas)\n';
    }
    texto += '\n';
  });

  if (reporte.fuentes && reporte.fuentes.length) {
    texto += lin + '\n';
    texto += 'Detalle por fuente de ingreso\n';
    texto += lin + '\n';
    reporte.fuentes.forEach(function (s) {
      if (s.error) { texto += '  ' + s.hoja + ': error — ' + s.error + '\n'; return; }
      if (s.omitida) { texto += '  ' + s.hoja + ': ' + s.motivo + '\n'; return; }
      texto += '  ' + s.hoja + ' (' + s.sector + '): '
        + s.cruce.totalConRut + ' con RUT, '
        + s.cruce.faltantes.length + ' sin paciente';
      if (s.cruce.sinEstado) texto += ', ' + s.cruce.sinEstado + ' sin estado';
      texto += '\n';
    });
    texto += '\n';
  }

  if (!reporte.totalProblemas) {
    texto += '✅ No se detectaron inconsistencias ni problemas de calidad de datos.\n';
  }

  return texto;
}

/**
 * Revisión de consistencia Pacientes↔Eventos + calidad de campos.
 * Determinista, sin llamadas a Gemini.
 */
function IA_revisarConsistenciaYCampos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaPac = ss.getSheetByName(HOJAS.PACIENTES);
  var hojaEv = ss.getSheetByName(HOJAS.EVENTOS);
  if (!hojaPac) return { error: 'Hoja PACIENTES no encontrada' };

  var datosPac = IA_leerBloque(HOJAS.PACIENTES, hojaPac);
  if (!hojaEv) {
    // Sin hoja EVENTOS la consistencia no puede evaluarse: devolver aviso en
    // lugar de marcar a todos los pacientes como "sin eventos" (falsa inundación).
    return {
      totalPacientes: Math.max(0, datosPac.length - 1),
      totalEventos: 0,
      consistencia: [],
      campos: IA_revisarCamposNuevos(datosPac),
      aviso: 'Hoja EVENTOS no encontrada: consistencia omitida'
    };
  }
  var datosEv = IA_leerBloque(HOJAS.EVENTOS, hojaEv);

  return {
    totalPacientes: Math.max(0, datosPac.length - 1),
    totalEventos: Math.max(0, datosEv.length - 1),
    consistencia: IA_revisarConsistencia(datosPac, datosEv),
    campos: IA_revisarCamposNuevos(datosPac)
  };
}

/**
 * Cruce de fuentes de ingreso (INGRESO_*) contra PACIENTES.
 */
function IA_revisarFuentes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaPac = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hojaPac) return { error: 'Hoja PACIENTES no encontrada' };

  var datosPac = IA_leerBloque(HOJAS.PACIENTES, hojaPac);
  var colRutPac = IA_columnaPorNombre(datosPac, 'RUT');
  var rutsPacientes = {};
  for (var f = 1; f < datosPac.length; f++) {
    if (colRutPac < 0) break;
    var raw = Utl_texto(datosPac[f][colRutPac]).trim();
    if (!raw) continue;
    var norm = Norm_normalizarRut(raw);
    if (norm.rut) rutsPacientes[norm.rut] = true;
  }

  var resultados = [];
  Object.keys(HOJAS_INGRESO).forEach(function (hojaNombre) {
    var sector = HOJAS_INGRESO[hojaNombre];
    try {
      var hoja = ss.getSheetByName(hojaNombre);
      if (!hoja) {
        resultados.push({ hoja: hojaNombre, sector: sector, omitida: true, motivo: 'no existe' });
        return;
      }
      var datos = IA_leerBloque(hojaNombre, hoja);
      resultados.push({
        hoja: hojaNombre, sector: sector, omitida: false,
        cruce: IA_cruzarBloqueIngreso(rutsPacientes, hojaNombre, datos)
      });
    } catch (e) {
      resultados.push({ hoja: hojaNombre, sector: sector, error: e.message });
    }
  });

  return { sectores: resultados };
}

/**
 * Revisión integral completa: consistencia + campos + fuentes.
 * Determinista, funciona sin API key. Registra en LOG_IA.
 * @returns {Object} {explicacion, resultado, fecha, categorias, totalProblemas, porSeveridad, fuentes}
 */
function IA_revisarTodo() {
  var reporte = { categorias: [], fecha: Utilities.formatDate(new Date(), ECICEP.TZ, 'dd/MM/yyyy HH:mm:ss') };
  var totalProblemas = 0;
  var porSeveridad = { ERROR: 0, WARNING: 0, INFO: 0 };

  function _sumarCategoria(cat, problemasFull) {
    var completo = problemasFull || cat.problemas || [];
    cat.total = completo.length;
    cat.problemasTotal = completo;
    completo.forEach(function (p) {
      if (porSeveridad[p.severidad] !== undefined) porSeveridad[p.severidad]++;
    });
    totalProblemas += completo.length;
    reporte.categorias.push(cat);
  }

  try {
    var res = IA_revisarConsistenciaYCampos();
    if (res.error) {
      _sumarCategoria({ id: 'ERROR', etiqueta: 'Error', problemas:
        [{ tipo: 'ERROR_SISTEMA', severidad: 'ERROR', fila: 0, detalle: res.error }] });
    } else {
      reporte.totalPacientes = res.totalPacientes;
      reporte.totalEventos = res.totalEventos;
      if (res.aviso) _sumarCategoria({
        id: 'AVISO', etiqueta: 'Aviso',
        problemas: [{ tipo: 'AVISO_SISTEMA', severidad: 'INFO', fila: 0, detalle: res.aviso }] });
      if (res.consistencia.length) _sumarCategoria({
        id: 'CONSISTENCIA', etiqueta: 'Consistencia Pacientes ↔ Eventos',
        problemas: res.consistencia.slice(0, 100) }, res.consistencia);
      if (res.campos.length) _sumarCategoria({
        id: 'CALIDAD', etiqueta: 'Calidad de campos',
        problemas: res.campos.slice(0, 100) }, res.campos);
    }
  } catch (e) {
    _sumarCategoria({ id: 'ERROR', etiqueta: 'Error', problemas:
      [{ tipo: 'ERROR_SISTEMA', severidad: 'ERROR', fila: 0, detalle: e.message }] });
  }

  try {
    var fuentes = IA_revisarFuentes();
    if (!fuentes.error) {
      var faltantesFull = [];
      fuentes.sectores.forEach(function (s) {
        if (s.cruce && s.cruce.faltantes.length) {
          s.cruce.faltantes.forEach(function (f) {
            faltantesFull.push({
              tipo: 'FUENTE_FALTANTE', severidad: 'WARNING', fila: f.fila,
              detalle: '[' + s.hoja + '] RUT ' + f.rut + ' sin paciente (estado: ' + f.estado + ')'
            });
          });
        }
      });
      if (faltantesFull.length) _sumarCategoria({
        id: 'FUENTES', etiqueta: 'Cruce con fuentes de ingreso',
        problemas: faltantesFull.slice(0, 100) }, faltantesFull);
      reporte.fuentes = fuentes.sectores;
    }
  } catch (e) {
    _sumarCategoria({ id: 'ERROR', etiqueta: 'Error', problemas:
      [{ tipo: 'ERROR_SISTEMA', severidad: 'ERROR', fila: 0,
         detalle: 'Error en cruce con fuentes: ' + e.message }] });
  }

  reporte.totalProblemas = totalProblemas;
  reporte.porSeveridad = porSeveridad;

  try {
    IA_registrarCambio('REVISION', totalProblemas,
      reporte.categorias.map(function (c) { return c.id + ':' + (c.total || c.problemas.length); }));
  } catch (e) { /* log no bloquea */ }

  reporte.explicacion = IA_textoRevision(reporte);
  return reporte;
}

/**
 * Escapa texto para insertarlo en HTML (contra XSS en diálogos construidos).
 */
function _IA_esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Menú "Revisión completa": ejecuta la revisión integral (determinista, sin
 * Gemini) y muestra el reporte en un diálogo modal legible.
 */
function IA_revisarTodoUI() {
  if (!WebApp_usuarioActivo()) return;
  var reporte = IA_revisarTodo();
  if (!reporte) {
    Utl_toast('err', 'La revisión no devolvió resultados.', 5);
    return;
  }
  var titulo = 'Revisión Integral';
  var cuerpo = reporte.explicacion || 'Sin resultados.';
  var html = '<html><head><base target="_top"></head>'
    + '<body style="margin:0;box-sizing:border-box;background:#fafafa;font-family:monospace;'
    + 'font-size:12px;line-height:1.5;white-space:pre-wrap;padding:14px;color:#222">'
    + _IA_esc(cuerpo) + '</body></html>';
  _UI_get().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(660).setHeight(500),
    titulo);
}

// ---------------------------------------------------------------------------
// Corrección automática
// ---------------------------------------------------------------------------

/**
 * Corrige RUTs: formatea con puntos y guión, valida DV.
 */
function IA_corregirRuts() {
  if (!WebApp_usuarioActivo()) return { error: 'Sesión de usuario no detectada; acceso denegado' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = IA_leerBloque(HOJAS.PACIENTES, hoja);
  if (datos.length < 2) return { corregidos: 0 };

  // Encontrar columna RUT (por nombre, nunca por índice fijo)
  var colRut = IA_columnaPorNombre(datos, 'RUT');
  if (colRut === -1) return { error: 'Columna RUT no encontrada' };

  var correcciones = [];
  var valores = [];

  for (var f = 1; f < datos.length; f++) {
    var rutOriginal = Utl_texto(datos[f][colRut]).trim();
    var rutNormalizado = Norm_normalizarRut(rutOriginal);

    if (rutNormalizado !== rutOriginal && rutNormalizado.estado === 'OK') {
      correcciones.push({
        fila: Modelo_filaFisica(HOJAS.PACIENTES, f - 1),
        antes: rutOriginal,
        despues: rutNormalizado.rut
      });
      var fila = datos[f].slice();
      fila[colRut] = rutNormalizado.rut;
      valores.push(fila);
    } else {
      valores.push(datos[f]);
    }
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, Modelo_dataStartRow(HOJAS.PACIENTES), 1, valores);
    IA_registrarCambio('RUTS', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Corrige fechas: unifica formato a ISO yyyy-MM-dd.
 */
function IA_corregirFechas() {
  if (!WebApp_usuarioActivo()) return { error: 'Sesión de usuario no detectada; acceso denegado' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = IA_leerBloque(HOJAS.PACIENTES, hoja);
  if (datos.length < 2) return { corregidos: 0 };

  // Columnas de fecha conocidas (resolución por encabezado: ver IA_columnaPorNombre)
  var colFechaNac = IA_columnaPorNombre(datos, 'FECHA_NACIMIENTO');
  var colFechaIngreso = IA_columnaPorNombre(datos, 'FECHA_INGRESO');

  var correcciones = [];
  var valores = [];

  for (var f = 1; f < datos.length; f++) {
    var fila = datos[f].slice();
    var corregida = false;

    // Intentar normalizar fechas
    [colFechaNac, colFechaIngreso].forEach(function(col) {
      if (col === -1) return;
      var val = Utl_texto(fila[col]).trim();
      if (val && val !== '') {
        var fecha = IA_parsearFecha(val);
        if (fecha && fecha !== val) {
          correcciones.push({ fila: Modelo_filaFisica(HOJAS.PACIENTES, f - 1), columna: col, antes: val, despues: fecha });
          fila[col] = fecha;
          corregida = true;
        }
      }
    });

    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, Modelo_dataStartRow(HOJAS.PACIENTES), 1, valores);
    IA_registrarCambio('FECHAS', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Intenta parsear una fecha usando el normalizador determinista del sistema.
 * Acepta strings, objetos Date (celdas de hoja de cálculo) y seriales numéricos.
 * Solo devuelve ISO cuando la fecha es plenamente válida (calendario y rango);
 * jamás fabrica ni muta fechas dudosas (MES_ANO, INVALIDA, NO_RECONOCIDA → null).
 * @param {*} valor string | Date | number | null
 * @param {Object} [rango] {min, max} años aceptados (por defecto CFG_FECHAS)
 * @returns {string|null} ISO yyyy-MM-dd o null
 */
function IA_parsearFecha(valor, rango) {
  if (Utl_vacio(valor)) return null;
  if (valor instanceof Date || typeof valor === 'number') {
    var iso = Control_aIso(valor);
    if (!iso) return null;
    var rv = Norm_normalizarFecha(iso, rango);
    return rv.estado === 'VALIDA' ? rv.iso : null;
  }
  var n = Norm_normalizarFecha(valor, rango);
  if (n.estado === 'VALIDA') return n.iso;
  return null;
}

/**
 * Corrige nombres: capitalización y espacios.
 */
function IA_corregirNombres() {
  if (!WebApp_usuarioActivo()) return { error: 'Sesión de usuario no detectada; acceso denegado' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = IA_leerBloque(HOJAS.PACIENTES, hoja);
  if (datos.length < 2) return { corregidos: 0 };

  var colNombre = IA_columnaPorNombre(datos, 'NOMBRE');
  if (colNombre === -1) return { error: 'Columna NOMBRE no encontrada' };

  var correcciones = [];
  var valores = [];

  for (var f = 1; f < datos.length; f++) {
    var fila = datos[f].slice();
    var nombreOriginal = Utl_texto(fila[colNombre]).trim();
    var nombreCorregido = IA_normalizarNombre(nombreOriginal);

    if (nombreCorregido !== nombreOriginal) {
      correcciones.push({ fila: Modelo_filaFisica(HOJAS.PACIENTES, f - 1), antes: nombreOriginal, despues: nombreCorregido });
      fila[colNombre] = nombreCorregido;
    }
    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, Modelo_dataStartRow(HOJAS.PACIENTES), 1, valores);
    IA_registrarCambio('NOMBRES', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Normaliza un nombre: mayúsculas, espacios colapsados.
 */
function IA_normalizarNombre(nombre) {
  if (!nombre) return '';
  return Utl_colapsarEspacios(nombre.toUpperCase());
}

/**
 * Corrige teléfonos: formato estándar.
 */
function IA_corregirTelefonos() {
  if (!WebApp_usuarioActivo()) return { error: 'Sesión de usuario no detectada; acceso denegado' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = IA_leerBloque(HOJAS.PACIENTES, hoja);
  if (datos.length < 2) return { corregidos: 0 };

  var colTel = IA_columnaPorNombre(datos, 'TELEFONOS');
  if (colTel === -1) return { error: 'Columna TELEFONOS no encontrada' };

  var correcciones = [];
  var valores = [];

  for (var f = 1; f < datos.length; f++) {
    var fila = datos[f].slice();
    var telOriginal = Utl_texto(fila[colTel]).trim();
    var telCorregido = IA_normalizarTelefono(telOriginal);

    if (telCorregido !== telOriginal) {
      correcciones.push({ fila: Modelo_filaFisica(HOJAS.PACIENTES, f - 1), antes: telOriginal, despues: telCorregido });
      fila[colTel] = telCorregido;
    }
    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, Modelo_dataStartRow(HOJAS.PACIENTES), 1, valores);
    IA_registrarCambio('TELEFONOS', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Normaliza teléfono reutilizando el normalizador determinista del sistema:
 * extrae números válidos, descarta anotaciones y devuelve los números unidos
 * con '/' (formato canónico del pipeline). No inventa dígitos.
 */
function IA_normalizarTelefono(tel) {
  if (Utl_vacio(tel)) return '';
  var n = Norm_normalizarTelefono(tel);
  if (!n.telefonos || n.telefonos.length === 0) {
    // No hay números claros: se conserva el texto original (no se muta ni se borra).
    return Utl_colapsarEspacios(Utl_texto(tel));
  }
  return n.telefonos.join('/');
}

/**
 * Corrige campo SEXO: valores válidos M/F/OTRO.
 */
function IA_corregirSexo() {
  if (!WebApp_usuarioActivo()) return { error: 'Sesión de usuario no detectada; acceso denegado' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = IA_leerBloque(HOJAS.PACIENTES, hoja);
  if (datos.length < 2) return { corregidos: 0 };

  var colSexo = IA_columnaPorNombre(datos, 'SEXO');
  if (colSexo === -1) return { error: 'Columna SEXO no encontrada' };

  var correcciones = [];
  var valores = [];

  for (var f = 1; f < datos.length; f++) {
    var fila = datos[f].slice();
    var sexoOriginal = Utl_texto(fila[colSexo]).trim().toUpperCase();
    // Normalizador determinista: mapea sinónimos a M/F/OTRO y devuelve ''
    // para desconocidos. Nunca se inventa un valor (antes forzaba 'OTRO').
    var sexoCorregido = Norm_normalizarSexo(sexoOriginal);
    if (sexoCorregido === '' && sexoOriginal !== '') sexoCorregido = sexoOriginal;

    if (sexoCorregido !== sexoOriginal) {
      correcciones.push({ fila: Modelo_filaFisica(HOJAS.PACIENTES, f - 1), antes: sexoOriginal, despues: sexoCorregido });
      fila[colSexo] = sexoCorregido;
    }
    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, Modelo_dataStartRow(HOJAS.PACIENTES), 1, valores);
    IA_registrarCambio('SEXO', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Ejecuta todas las correcciones en orden.
 */
function IA_corregirTodo() {
  if (!WebApp_usuarioActivo()) return { error: 'Sesión de usuario no detectada; acceso denegado' };
  var resultados = {};

  try { resultados.ruts = IA_corregirRuts(); } catch (e) { resultados.ruts = { error: e.message }; }
  try { resultados.fechas = IA_corregirFechas(); } catch (e) { resultados.fechas = { error: e.message }; }
  try { resultados.nombres = IA_corregirNombres(); } catch (e) { resultados.nombres = { error: e.message }; }
  try { resultados.telefonos = IA_corregirTelefonos(); } catch (e) { resultados.telefonos = { error: e.message }; }
  try { resultados.sexo = IA_corregirSexo(); } catch (e) { resultados.sexo = { error: e.message }; }

  var totalCorregidos = 0;
  Object.keys(resultados).forEach(function(k) {
    if (resultados[k] && resultados[k].corregidos) {
      totalCorregidos += resultados[k].corregidos;
    }
  });

  return { total: totalCorregidos, porCategoria: resultados };
}

// ---------------------------------------------------------------------------
// Ejecución de pruebas
// ---------------------------------------------------------------------------

/**
 * Ejecuta la suite de tests del sistema.
 */
function IA_ejecutarTests() {
  try {
    // Buscar el archivo de tests
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var scriptId = ScriptApp.getScriptId();

    // Intentar ejecutar tests vía DriveApp (acceso al repo)
    var resultado = {
      timestamp: new Date().toISOString(),
      tests: [],
      resumen: ''
    };

    // Ejecutar Pruebas_ejecutarTodo si está disponible
    if (typeof Pruebas_ejecutarTodo === 'function') {
      var resultadoPruebas = Pruebas_ejecutarTodo();
      resultado.tests = resultadoPruebas;
      resultado.resumen = 'Tests ejecutados: ' + JSON.stringify(resultadoPruebas).substring(0, 500);
    } else {
      resultado.resumen = 'Función Pruebas_ejecutarTodo no disponible en este entorno. '
        + 'Ejecuta localmente: node tests/ejecutar_local.mjs';
    }

    IA_registrarCambio('TESTS', 1, [resultado]);
    return resultado;

  } catch (e) {
    return { error: e.message, timestamp: new Date().toISOString() };
  }
}

/**
 * Analiza resultados de tests y sugiere fixes usando IA.
 */
function IA_analizarFallos(resultadoTests) {
  var prompt = 'Eres un desarrollador de Apps Script analizando resultados de tests. '
    + 'Analiza estos resultados y sugiere correcciones:\n\n'
    + JSON.stringify(resultadoTests, null, 2) + '\n\n'
    + 'Responde en JSON:\n'
    + '{ "analisis": "...", "sugerencias": [{ "archivo": "...", "problema": "...", "solucion": "..." }] }';

  try {
    var respuesta = IA_llamarGemini(prompt);
    return IA_parsearJSON(respuesta);
  } catch (e) {
    return { error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Chat / Instrucciones en lenguaje natural
// ---------------------------------------------------------------------------

/**
 * Procesa una instrucción en lenguaje natural.
 */
function IA_procesarInstruccion(texto) {
  var prompt = 'Eres un asistente del sistema ECICEP (gestión de pacientes en hojas de cálculo). '
    + 'El usuario te pide: "' + texto + '"\n\n'
    + 'Interpreta la intención y responde con una acción concreta que el sistema pueda ejecutar. '
    + 'Acciones disponibles:\n'
    + '- revisar_todo()\n'
    + '- revisar_consistencia()\n'
    + '- revisar_fuentes()\n'
    + '- analizar_hoja(NOMBRE_HOJA)\n'
    + '- corregir_ruts()\n'
    + '- corregir_fechas()\n'
    + '- corregir_nombres()\n'
    + '- corregir_telefonos()\n'
    + '- corregir_sexo()\n'
    + '- corregir_todo()\n'
    + '- detectar_duplicados()\n'
    + '- verificar_integridad()\n'
    + '- ejecutar_tests()\n'
    + '- leer_estadisticas(NOMBRE_HOJA)\n\n'
    + 'Responde en JSON:\n'
    + '{ "intencion": "...", "accion": "nombre_funcion", "parametros": [...], "explicacion": "..." }';

  try {
    var respuesta = IA_llamarGemini(prompt);
    var parsed = IA_parsearJSON(respuesta);

    // Ejecutar la acción si es válida
    if (parsed && parsed.accion) {
      parsed.accion = IA_normalizarNombreAccion(parsed.accion);
      var resultado = IA_ejecutarAccion(parsed.accion, parsed.parametros || []);
      parsed.resultado = resultado;
      // Las revisiones integrales devuelven un reporte estructurado con
      // `explicacion` legible: se prioriza sobre el resumen libre del modelo.
      if (resultado && resultado.categorias && typeof resultado.explicacion === 'string') {
        parsed.explicacion = resultado.explicacion;
      }
    }

    return parsed;
  } catch (e) {
    return { error: e.message, texto: texto };
  }
}

/**
 * Chat multi-turno con historial.
 */
function IA_chat(mensaje, historial) {
  if (!WebApp_usuarioActivo()) return 'Sesión de usuario no detectada; acceso denegado.';
  historial = historial || [];

  var contexto = 'Eres un asistente amable del sistema ECICEP. '
    + 'Responde en español, sé conciso y útil. '
    + 'Si el usuario pide algo que no puedes hacer, explica por qué.\n\n'
    + 'HISTORIAL:\n';

  historial.forEach(function(h) {
    contexto += (h.rol === 'usuario' ? 'Usuario: ' : 'IA: ') + h.texto + '\n';
  });

  contexto += '\nUsuario: ' + mensaje + '\nIA:';

  try {
    var respuesta = IA_llamarGemini(contexto, { temperature: 0.7 });
    return respuesta;
  } catch (e) {
    return 'Lo siento, hubo un error: ' + e.message;
  }
}

// ---------------------------------------------------------------------------
// Ejecución de acciones
// ---------------------------------------------------------------------------

/**
 * PURA: normaliza el nombre de una acción antes del despacho. El prompt lista
 * las acciones con paréntesis (p. ej. `revisar_todo()`, `analizar_hoja(X)`) y
 * Gemini puede repetirlos literales; sin esta normalización el despacho
 * fallaría con "Acción desconocida". También recorta espacios.
 * @param {string} nombre acción cruda de Gemini / usuario
 * @returns {string} nombre limpio de la acción
 */
function IA_normalizarNombreAccion(nombre) {
  return Utl_texto(nombre || '').trim().replace(/\(.*\)$/, '');
}

/**
 * Ejecuta una acción por nombre.
 */
function IA_ejecutarAccion(nombre, parametros) {
  if (!WebApp_usuarioActivo()) return { error: 'Sesión de usuario no detectada; acceso denegado' };
  var clave = IA_normalizarNombreAccion(nombre);
  var acciones = {
    'revisar_todo': IA_revisarTodo,
    'revisar_consistencia': IA_revisarConsistenciaYCampos,
    'revisar_fuentes': IA_revisarFuentes,
    'analizar_hoja': IA_analizarHoja,
    'corregir_ruts': IA_corregirRuts,
    'corregir_fechas': IA_corregirFechas,
    'corregir_nombres': IA_corregirNombres,
    'corregir_telefonos': IA_corregirTelefonos,
    'corregir_sexo': IA_corregirSexo,
    'corregir_todo': IA_corregirTodo,
    'detectar_duplicados': IA_detectarDuplicados,
    'verificar_integridad': IA_verificarIntegridadEventos,
    'ejecutar_tests': IA_ejecutarTests,
    'leer_estadisticas': IA_leerEstadisticas,
    'analizar_pacientes': IA_analizarPacientes,
    'analizar_eventos': IA_analizarEventos
  };

  var fn = acciones[clave];
  if (!fn) return { error: 'Acción desconocida: ' + nombre };

  try {
    return fn.apply(null, parametros);
  } catch (e) {
    return { error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/**
 * Registra un cambio en la hoja LOG_IA.
 */
function IA_registrarCambio(tipo, cantidad, detalle) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaLog = ss.getSheetByName(IA_CONFIG.LOG_SHEET);

  // Crear hoja si no existe
  if (!hojaLog) {
    hojaLog = ss.insertSheet(IA_CONFIG.LOG_SHEET);
    hojaLog.appendRow(['FECHA', 'USUARIO', 'TIPO', 'CANTIDAD', 'DETALLE']);
    hojaLog.getRange('1:1').setFontWeight('bold');
  }

  var usuario = Session.getActiveUser().getEmail() || 'desconocido';
  var fecha = Utilities.formatDate(new Date(), ECICEP.TZ, 'dd/MM/yyyy HH:mm:ss');
  var detalleStr = JSON.stringify(detalle || []).substring(0, 500);

  hojaLog.appendRow([fecha, usuario, tipo, cantidad, detalleStr]);
}

// ---------------------------------------------------------------------------
// UI Helpers
// ---------------------------------------------------------------------------

/**
 * Abre el panel lateral de IA.
 */
function IA_abrirPanel() {
  var t = HtmlService.createTemplateFromFile('IAPanel');
  _UI_get().showSidebar(t.evaluate().setTitle('IA — ECICEP'));
}

/**
 * Análisis rápido desde el menú.
 */
function IA_analizarCompleto() {
  Utl_toast('info', 'Iniciando análisis completo...', 3);

  var resultados = {
    pacientes: null,
    eventos: null,
    duplicados: null,
    integridad: null
  };

  try { resultados.pacientes = IA_analizarPacientes(); } catch (e) { resultados.pacientes = { error: e.message }; }
  try { resultados.eventos = IA_analizarEventos(); } catch (e) { resultados.eventos = { error: e.message }; }
  try { resultados.duplicados = IA_detectarDuplicados(); } catch (e) { resultados.duplicados = { error: e.message }; }
  try { resultados.integridad = IA_verificarIntegridadEventos(); } catch (e) { resultados.integridad = { error: e.message }; }

  Utl_toast('ok', 'Análisis completado. Revisa el panel de IA.', 5);
  return resultados;
}

/**
 * Configura la API key.
 */
function IA_configurar() {
  var html = '<html><body><script>'
    + 'var key=prompt("Ingresa tu API key de Google AI Studio:");'
    + 'if(key){google.script.run.withSuccessHandler(function(){alert("API key configurada correctamente")}).IA_guardarApiKey(key);}'
    + 'else{alert("Operación cancelada");}'
    + 'google.script.host.close();'
    + '</script></body></html>';

  _UI_get().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(10).setHeight(10),
    'Configurar API Key');
}

/**
 * Guarda la API key en Script Properties.
 */
function IA_guardarApiKey(key) {
  if (!WebApp_usuarioActivo()) return false;
  if (key && key.trim()) {
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key.trim());
    return true;
  }
  return false;
}

/**
 * Verifica si la API key está configurada.
 */
function IA_verificarConfig() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  return { configurada: !!key };
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Busca el índice de una columna por su nombre de encabezado.
 * NUNCA usar índices fijos: el layout puede evolucionar (ver COLUMNAS_EVENTOS,
 * MODELO_PACIENTE). Devuelve -1 si no existe.
 */
function IA_columnaPorNombre(datos, nombre) {
  if (!datos || !datos.length) return -1;
  var header = datos[0];
  var objetivo = String(nombre).trim().toUpperCase();
  for (var c = 0; c < header.length; c++) {
    if (Utl_texto(header[c]).trim().toUpperCase() === objetivo) return c;
  }
  return -1;
}

/**
 * Intenta parsear JSON de la respuesta de IA (a veces viene con markdown).
 */
function IA_parsearJSON(texto) {
  if (!texto) return null;

  // Limpiar markdown code blocks
  var limpio = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(limpio);
  } catch (e) {
    // Intentar extraer JSON del texto
    var match = limpio.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        return { textoOriginal: texto };
      }
    }
    return { textoOriginal: texto };
  }
}
