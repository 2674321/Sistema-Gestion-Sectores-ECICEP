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
 * Lee estadísticas descriptivas de una hoja.
 * Los campos sensibles solo aportan métricas agregadas (vacíos/únicos);
 * sus ejemplos concretos NO se envían a la API.
 */
function IA_leerEstadisticas(hojaNombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(hojaNombre);
  if (!hoja) return null;

  var datos = Utl_leerBloque(hoja);
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(hojaNombre);
  if (!hoja) return [];

  var datos = Utl_leerBloque(hoja);
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
      fila: f + 1,
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

  var datos = Utl_leerBloque(hoja);
  if (datos.length < 3) return { duplicados: [], mensaje: 'Datos insuficientes' };

  // Columnas por nombre de encabezado (nunca por índice fijo)
  var colRut = IA_columnaPorNombre(datos, 'RUT');
  if (colRut === -1) return { error: 'Columna RUT no encontrada' };

  // Construir mapa de RUTs (sin enviar a IA)
  var mapaRuts = {};
  var duplicados = [];

  for (var f = 1; f < datos.length; f++) {
    var rut = Utl_texto(datos[f][colRut]).trim().toUpperCase(); // Columna RUT
    if (rut && mapaRuts[rut]) {
      duplicados.push({
        rut: '***', // No exponer RUT real
        fila1: mapaRuts[rut],
        fila2: f + 1
      });
    }
    if (rut) mapaRuts[rut] = f + 1;
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

  var eventos = Utl_leerBloque(hojaEventos);
  var pacientes = Utl_leerBloque(hojaPacientes);

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
        fila: f + 1,
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
// Corrección automática
// ---------------------------------------------------------------------------

/**
 * Corrige RUTs: formatea con puntos y guión, valida DV.
 */
function IA_corregirRuts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = Utl_leerBloque(hoja);
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
        fila: f + 1,
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
    Utl_escribirBloque(hoja, 2, 1, valores);
    IA_registrarCambio('RUTS', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Corrige fechas: unifica formato a ISO yyyy-MM-dd.
 */
function IA_corregirFechas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = Utl_leerBloque(hoja);
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
          correcciones.push({ fila: f + 1, columna: col, antes: val, despues: fecha });
          fila[col] = fecha;
          corregida = true;
        }
      }
    });

    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, 2, 1, valores);
    IA_registrarCambio('FECHAS', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Intenta parsear una fecha en varios formatos comunes.
 */
function IA_parsearFecha(valor) {
  if (!valor) return null;
  var v = Utl_texto(valor).trim();

  // Ya es ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10);

  // dd/MM/yyyy
  var m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);

  // dd-MM-yyyy
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);

  // dd.MM.yyyy
  m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);

  return null;
}

/**
 * Corrige nombres: capitalización y espacios.
 */
function IA_corregirNombres() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = Utl_leerBloque(hoja);
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
      correcciones.push({ fila: f + 1, antes: nombreOriginal, despues: nombreCorregido });
      fila[colNombre] = nombreCorregido;
    }
    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, 2, 1, valores);
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = Utl_leerBloque(hoja);
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
      correcciones.push({ fila: f + 1, antes: telOriginal, despues: telCorregido });
      fila[colTel] = telCorregido;
    }
    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, 2, 1, valores);
    IA_registrarCambio('TELEFONOS', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Normaliza teléfono: quita prefijo país 56, espacios, guiones.
 */
function IA_normalizarTelefono(tel) {
  if (!tel) return '';
  var t = tel.replace(/[\s\-\(\)]/g, '');

  // Quitar prefijo 56 si tiene 9+ dígitos
  if (t.length >= 10 && t.substring(0, 2) === '56') {
    t = t.substring(2);
  }

  // Quitar 9 al inicio si tiene 9 dígitos (móvil chileno)
  if (t.length === 9 && t[0] === '9') {
    t = t.substring(1);
  }

  return t;
}

/**
 * Corrige campo SEXO: valores válidos M/F/OTRO.
 */
function IA_corregirSexo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja) return { error: 'Hoja PACIENTES no encontrada' };

  var datos = Utl_leerBloque(hoja);
  if (datos.length < 2) return { corregidos: 0 };

  var colSexo = IA_columnaPorNombre(datos, 'SEXO');
  if (colSexo === -1) return { error: 'Columna SEXO no encontrada' };

  var correcciones = [];
  var valores = [];

  for (var f = 1; f < datos.length; f++) {
    var fila = datos[f].slice();
    var sexoOriginal = Utl_texto(fila[colSexo]).trim().toUpperCase();
    var sexoCorregido = SEXOS.SINONIMOS[sexoOriginal] || sexoOriginal;

    // Validar
    if (SEXOS.VALIDOS.indexOf(sexoCorregido) === -1 && sexoCorregido !== '') {
      sexoCorregido = 'OTRO';
    }

    if (sexoCorregido !== sexoOriginal) {
      correcciones.push({ fila: f + 1, antes: sexoOriginal, despues: sexoCorregido });
      fila[colSexo] = sexoCorregido;
    }
    valores.push(fila);
  }

  if (correcciones.length > 0) {
    Utl_escribirBloque(hoja, 2, 1, valores);
    IA_registrarCambio('SEXO', correcciones.length, correcciones.slice(0, 10));
  }

  return { corregidos: correcciones.length, detalle: correcciones.slice(0, 20) };
}

/**
 * Ejecuta todas las correcciones en orden.
 */
function IA_corregirTodo() {
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
      var resultado = IA_ejecutarAccion(parsed.accion, parsed.parametros || []);
      parsed.resultado = resultado;
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
 * Ejecuta una acción por nombre.
 */
function IA_ejecutarAccion(nombre, parametros) {
  var acciones = {
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

  var fn = acciones[nombre];
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
