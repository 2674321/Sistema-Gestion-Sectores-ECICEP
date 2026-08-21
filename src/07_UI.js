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
      .addItem('📥 Procesar ingresos', 'UI_procesarIngresos')
      .addItem('🔄 Actualizar vistas SECTOR', 'UI_refrescarSectores')
      .addItem('🩺 Diagnosticar ingresos', 'UI_diagnosticarIngresos')
      .addSeparator()
      .addItem('🧪 Sembrar datos ficticios (prueba)', 'UI_sembrarFicticios')
      .addItem('🔬 Ejecutar pruebas', 'UI_ejecutarPruebas')
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

/** Flujo INGRESO_* → PACIENTES + EVENTOS con resumen comprensible. */
function UI_procesarIngresos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Procesando flujo de ingreso (validación → identificación → escritura)…', 'ECICEP', 10);
  var r = Utl_medir(Ingresos_procesarTodasLasHojas);
  Log_info('UI', 'procesarIngresos', JSON.stringify(r.resultado), null, r.ms);
  Log_flush();
  SpreadsheetApp.getUi().alert(
    'PROCESAMIENTO COMPLETADO\n\n' +
    'Ejecución: ' + (r.resultado.ejecucion || '-') + '\n' +
    'Ingresos leídos: ' + r.resultado.leidos + '\n' +
    'Válidos: ' + r.resultado.validos + '\n' +
    'Con error: ' + r.resultado.conError + '\n\n' +
    'Pacientes nuevos: ' + r.resultado.nuevos + '\n' +
    'Pacientes existentes: ' + r.resultado.existentes + '\n' +
    'Requieren revisión: ' + r.resultado.revision + '\n' +
    'Eventos creados: ' + r.resultado.eventosCreados + '\n\n' +
    '(' + r.ms + ' ms)');
}

/** Regenera las vistas SECTOR_* desde PACIENTES (nunca bases independientes). */
function UI_refrescarSectores() {
  var r = Utl_medir(Modelo_refrescarVistasSectores);
  Log_info('UI', 'refrescarSectores', JSON.stringify(r.resultado), null, r.ms);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Vistas actualizadas — ' + JSON.stringify(r.resultado) + ' (' + r.ms + ' ms)', 'ECICEP', 8);
}

/** Diagnóstico: por qué fallan los ingresos (encabezados, mapeo, errores). */
function UI_diagnosticarIngresos() {
  Ingresos_diagnosticar();
  var hoja = Modelo_ss().getSheetByName('DIAGNOSTICO');
  if (hoja) SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(hoja);
}

/**
 * Escribe el dataset FICTICIO en las hojas INGRESO_* para probar el flujo
 * completo sin tocar datos reales. Cada fila queda marcada como prueba.
 * Incluye casos que terminan en error/revisión a propósito.
 */
function UI_sembrarFicticios() {
  var casos = DATASET_STAGING.casos;
  var porHoja = {};
  Object.keys(casos).forEach(function (nombre) {
    var c = casos[nombre];
    var sector = Norm_normalizarSector(c.origen.sector).sector;
    var hojaNombre = Ingresos_hojaParaSector(sector);
    if (!hojaNombre) return;
    if (!porHoja[hojaNombre]) porHoja[hojaNombre] = [];
    porHoja[hojaNombre].push(c.valores);
  });
  var total = 0;
  Object.keys(porHoja).forEach(function (hojaNombre) {
    var hoja = Modelo_ss().getSheetByName(hojaNombre);
    if (!hoja) return;
    var filas = porHoja[hojaNombre].map(function (v) {
      // orden según _INGRESO_ENCABEZADOS (operativos + sistema)
      return [
        Utl_texto(v.NOMBRE), Utl_texto(v.RUT), Utl_texto(v.SEXO),
        Utl_texto(v.FECHA_NACIMIENTO), Utl_texto(v.TELEFONOS || v.TELEFONO),
        Utl_texto(v.FECHA_INGRESO), Utl_texto(v.ESTRATIFICACION),
        Utl_texto(v.DUPLA_INGRESO), Utl_texto(v.OBSERVACIONES),
        'PENDIENTE', 'DATOS DE PRUEBA (ficticio)'
      ];
    });
    total += Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, filas);
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(
    total + ' filas ficticias sembradas en las hojas de ingreso. Usa "📥 Procesar ingresos".', 'ECICEP — PRUEBA', 10);
}
