/**
 * Sistema ECICEP Unificado — 07_UI
 * Interfaz DENTRO de Google Sheets (DEC-012: Sheets es la interfaz principal).
 * ETAPA 2: solo menú base con acciones existentes. La experiencia completa
 * (INICIO/DASHBOARD/FICHA/SEGUIMIENTO, búsquedas y botones) llega en ETAPA 4.
 */

/** Menú principal. Se ejecuta automáticamente al abrir el spreadsheet. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('ECICEP')
      .addItem('⚙ Instalar / reparar estructura', 'UI_instalarEstructura')
      .addItem('🧪 Ejecutar pruebas', 'UI_ejecutarPruebas')
      .addItem('📄 Abrir LOG', 'UI_abrirLog')
      .addToUi();
  } catch (e) { /* entorno sin UI (scripts headless): ignorar */ }
}

function UI_instalarEstructura() {
  var r = Utl_medir(Modelo_crearEstructura);
  Log_info('UI', 'instalarEstructura', 'creadas=' + r.resultado.creadas.join(','), null, r.ms);
  Log_flush();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Estructura lista. Creadas: ' + (r.resultado.creadas.join(', ') || 'ninguna (ya existían)') +
    ' · ' + r.ms + ' ms', 'ECICEP', 8);
}

function UI_ejecutarPruebas() {
  var res = Pruebas_ejecutarTodo();
  Log_info('UI', 'pruebas', 'pasados=' + res.pasados + '/' + res.total);
  Log_flush();
  SpreadsheetApp.getUi().alert(
    'ECICEP — Pruebas del núcleo\n\n' +
    'Total: ' + res.total + '\nPasados: ' + res.pasados + '\nFallidos: ' + res.fallidos +
    (res.fallidos ? '\n\nRevisa el registro (Logger) para el detalle.' : '\n\nTodo correcto.'));
  Logger.log(JSON.stringify(res.detalles.filter(function (d) { return !d.ok; }), null, 2));
}

function UI_abrirLog() {
  var hoja = Modelo_hoja(HOJAS.LOG);
  if (!hoja) { Modelo_crearEstructura(); hoja = Modelo_hoja(HOJAS.LOG); }
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(hoja);
}
