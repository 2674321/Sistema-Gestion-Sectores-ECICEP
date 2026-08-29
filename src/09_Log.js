/**
 * Sistema ECICEP Unificado — 09_Log
 * Logging centralizado con búfer en memoria y escritura por lotes (DEC-014).
 * Niveles: DEBUG < INFO < WARNING < ERROR. El búfer se vuelca a la hoja LOG
 * en una sola escritura; jamás lanza excepciones que rompan el flujo principal.
 */

var _LOG_BUFFER = [];
var _LOG_NIVELES = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };

/** Registra una entrada en el búfer. contexto puede ser objeto/string. */
function Log_registrar(nivel, modulo, operacion, mensaje, contexto, duracionMs) {
  try {
    if ((_LOG_NIVELES[nivel] || 0) < (_LOG_NIVELES[CFG_LOG.NIVEL] || 0)) return;
    _LOG_BUFFER.push([
      new Date(),
      nivel,
      Utl_texto(modulo).substring(0, 40),
      Utl_texto(operacion).substring(0, 60),
      Utl_texto(mensaje).substring(0, 500),
      duracionMs || '',
      typeof contexto === 'object' ? JSON.stringify(contexto) : Utl_texto(contexto).substring(0, 500)
    ]);
    if (_LOG_BUFFER.length >= CFG_LOG.MAX_BUFFER) Log_flush();
  } catch (e) { /* el log nunca rompe el flujo */ }
}

function Log_info(modulo, operacion, mensaje, contexto) { Log_registrar('INFO', modulo, operacion, mensaje, contexto); }
function Log_warning(modulo, operacion, mensaje, contexto) { Log_registrar('WARNING', modulo, operacion, mensaje, contexto); }
function Log_error(modulo, operacion, mensaje, contexto) { Log_registrar('ERROR', modulo, operacion, mensaje, contexto); }

/**
 * Vuelca el búfer a la hoja LOG en una sola escritura.
 * En entornos sin SpreadsheetApp (pruebas node) es no-op silencioso.
 */
function Log_flush() {
  if (!_LOG_BUFFER.length) return;
  var entradas = _LOG_BUFFER;
  _LOG_BUFFER = [];
  try {
    if (typeof SpreadsheetApp === 'undefined') {
      for (var i = 0; i < entradas.length; i++) console.log(entradas[i].slice(1, 5).join(' | '));
      return;
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(ECICEP.SPREADSHEET_ID);
    var hoja = ss.getSheetByName(CFG_LOG.HOJA);
    if (!hoja) {
      hoja = ss.insertSheet(CFG_LOG.HOJA);
      hoja.appendRow(['FECHA', 'NIVEL', 'MODULO', 'OPERACION', 'MENSAJE', 'DURACION_MS', 'CONTEXTO']);
    }
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) { // si no hay lock, reencola y sale
      _LOG_BUFFER = entradas.concat(_LOG_BUFFER);
      return;
    }
    try {
      var ultimaFila = hoja.getLastRow();
      // Recorte del histórico: conserva las últimas MAX_FILAS_HOJA
      if (ultimaFila > CFG_LOG.MAX_FILAS_HOJA + entradas.length) {
        var borrarDesde = ultimaFila - CFG_LOG.MAX_FILAS_HOJA;
        hoja.deleteRows(2, borrarDesde - 1);
        ultimaFila = hoja.getLastRow();
      }
      Utl_escribirBloque(hoja, ultimaFila + 1, 1, entradas);
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    // Último recurso: consola/Logger para no perder trazabilidad
    try { console.error('Log_flush fallo: ' + e.message); } catch (e2) { /* noop */ }
  }
}
