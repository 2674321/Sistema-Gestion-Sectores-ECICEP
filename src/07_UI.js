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
      .addItem('🔍 Buscar paciente / Ficha', 'UI_abrirBuscador')
      .addItem('🧾 Cola de revisión', 'UI_abrirRevision')
      .addSeparator()
      .addItem('🧹 Vaciar datos de prueba', 'UI_vaciarDatosPrueba')
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
    'PROCESAMIENTO COMPLETADO — v' + ECICEP.VERSION + '\n\n' +
    'Ejecución: ' + (r.resultado.ejecucion || '-') + '\n\n' +
    'Ingresos leídos: ' + r.resultado.leidos + '\n' +
    'Validación → OK: ' + r.resultado.validacionOk +
    ' · WARNING: ' + r.resultado.validacionWarning +
    ' · ERROR: ' + r.resultado.validacionError + '\n\n' +
    'Pacientes nuevos: ' + r.resultado.nuevos + '\n' +
    'Pacientes existentes (evento enlazado): ' + r.resultado.existentes + '\n' +
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

// ===========================================================================
// ETAPA 4 — Búsqueda · Ficha · Registro de evento · Cola de revisión
// (interacción con búsqueda/historial justifica sidebar — DEC-012)
// ===========================================================================

function UI_abrirBuscador() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('ECICEP — Pacientes')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

function UI_abrirRevision() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('ECICEP — Revisión')
    .setWidth(340);
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Endpoint sidebar: búsqueda por RUT exacto o nombre (no agresiva). */
function api_buscar(termino) {
  return Bus_buscarPacientes(Modelo_leerPacientes(), termino, 25).map(function (p) {
    return { id: p.ID_INTERNO, rut: p.RUT, nombre: p.NOMBRE,
             sector: p.SECTOR, estado: p.ESTADO, estrat: p.ESTRATIFICACION };
  });
}

/** Endpoint sidebar: ficha consolidada + historial desde EVENTOS. */
function api_ficha(idInterno) {
  return Modelo_fichaPaciente(idInterno);
}

/** Endpoint sidebar: registra un evento para un paciente existente y
 *  sincroniza la caché de estado vigente en PACIENTES. */
function api_registrarEvento(payload) {
  try {
    var p = payload || {};
    if (TIPOS_EVENTO.VALIDOS.indexOf(p.tipoEvento) === -1) return { ok: false, motivo: 'TIPO_INVALIDO' };
    var fecha = Norm_normalizarFecha(p.fecha);
    if (fecha.estado !== 'VALIDA') return { ok: false, motivo: 'FECHA_INVALIDA' };

    var pacientes = Modelo_leerPacientes();
    var objetivo = null;
    for (var i = 0; i < pacientes.length; i++) {
      if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(p.idInterno)) { objetivo = pacientes[i]; break; }
    }
    if (!objetivo) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };

    var evento = {
      ID_EVENTO: Ev_nuevoId(),
      ID_INTERNO: objetivo.ID_INTERNO,
      RUT: objetivo.RUT,
      NOMBRE: objetivo.NOMBRE,
      FECHA_EVENTO: fecha.iso,
      TIPO_EVENTO: p.tipoEvento,
      SECTOR: objetivo.SECTOR,
      RIESGO_G: objetivo.ESTRATIFICACION || '',
      PROFESIONAL: p.profesional || '',
      PROFESIONAL_TIPO: '',
      DESCRIPCION: p.descripcion || '',
      CANTIDAD: '',
      OBSERVACIONES: p.observaciones || '',
      FUENTE: 'UI_FICHA',
      REGISTRADO_POR: _ingresosUsuarioActual(),
      FECHA_REGISTRO: null
    };
    Modelo_agregarEventos([evento]);

    Ingresos_sincronizarCache(objetivo, evento);
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    var idx = pacientes.indexOf(objetivo); // posición dentro del bloque de datos
    hojaP.getRange(2 + idx, 1, 1, MODELO_PACIENTE.length)
         .setValues([Modelo_filaDesdeObjeto(objetivo)]);

    Modelo_refrescarVistasSectores();
    Log_info('Ficha', 'registrarEvento', evento.TIPO_EVENTO + ' → ' + evento.ID_INTERNO);
    Log_flush();
    return { ok: true, evento: { tipo: evento.TIPO_EVENTO, fecha: evento.FECHA_EVENTO } };
  } catch (e) {
    Log_error('Ficha', 'registrarEvento', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint sidebar: lista casos ABIERTOS de la cola de revisión. */
function api_revisionListar() {
  var hoja = Modelo_hoja(HOJAS.CONFLICTOS);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return Utl_leerBloque(hoja).slice(1).map(function (f, i) {
    var datos = null;
    try { datos = JSON.parse(f[5]); } catch (e) { /* fila antigua */ }
    return { indice: i + 2, tipo: f[1], rut: f[3], nombre: f[4],
             detalle: f[6], candidato: f[7], estado: f[8], datos: datos };
  }).filter(function (r) { return r.estado === 'ABIERTO' && r.datos; });
}

/** Endpoint sidebar: aplica la decisión humana sobre un caso ABIERTO. */
function api_revisionResolver(indiceHoja, decision) {
  try {
    var hoja = Modelo_hoja(HOJAS.CONFLICTOS);
    if (!hoja) return { ok: false, motivo: 'SIN_HOJA' };
    var filaVal = hoja.getRange(indiceHoja, 1, 1, 10).getValues()[0];
    if (Utl_texto(filaVal[8]) !== 'ABIERTO') return { ok: false, motivo: 'YA_RESUELTO' };
    var datos = JSON.parse(filaVal[5]);
    if (decision !== 'CONFIRMAR_MATCH' && decision !== 'RECHAZAR_MATCH') {
      return { ok: false, motivo: 'DECISION_INVALIDA' };
    }

    var prep = Rev_prepararResolucion(datos, decision, { nuevoId: Modelo_nuevoIdInterno });
    if (!prep.ok) return { ok: false, motivo: prep.motivo };

    if (prep.accion === 'CREAR') Modelo_agregarPacientes([prep.pacienteNuevo]);
    Modelo_agregarEventos([prep.evento], _ingresosUsuarioActual());

    hoja.getRange(indiceHoja, 9).setValue('RESUELTO');
    hoja.getRange(indiceHoja, 10).setValue(_ingresosUsuarioActual());

    Modelo_refrescarVistasSectores();
    Log_info('Revision', decision, prep.accion + ' · caso fila ' + indiceHoja);
    Log_flush();
    return { ok: true, accion: prep.accion };
  } catch (e) {
    Log_error('Revision', decision, e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** FASE 4.0 — limpieza segura del dataset ficticio. */
function UI_vaciarDatosPrueba() {
  var ui = SpreadsheetApp.getUi();
  var colecta = Limpieza_colectar();

  // cuenta pacientes/eventos afectados ANTES de borrar nada
  var ruts = colecta.ruts;
  var pacientes = Modelo_leerPacientes().filter(function (p) { return Limpieza_esPacienteDePrueba(p, ruts); });
  var ids = {};
  pacientes.forEach(function (p) { ids[Utl_texto(p.ID_INTERNO)] = true; });
  var eventos = Modelo_leerEventos().filter(function (e) {
    return (ids[Utl_texto(e.ID_INTERNO)] || ruts.indexOf(Utl_texto(e.RUT).toUpperCase()) !== -1) &&
           Utl_texto(e.FUENTE).indexOf('HOJA_INGRESO') === 0;
  });

  if (!colecta.totalFilas && !pacientes.length && !eventos.length) {
    ui.alert('No hay datos identificados como prueba. Nada que eliminar.');
    return;
  }
  var resp = ui.alert(
    'LIMPIEZA DE DATOS DE PRUEBA',
    'Se eliminarán únicamente registros identificados como DATOS DE PRUEBA.\n\n' +
      'Filas de ingreso marcadas: ' + colecta.totalFilas + '\n' +
      'Pacientes: ' + pacientes.length + '\n' +
      'Eventos: ' + eventos.length + '\n\n¿Continuar?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var r = Limpieza_ejecutar(colecta);
  Log_info('UI', 'vaciarDatosPrueba', JSON.stringify(r));
  Log_flush();
  ui.alert(
    'LIMPIEZA COMPLETADA\n\n' +
    'Filas de ingreso eliminadas: ' + r.filasIngreso + '\n' +
    'Pacientes eliminados: ' + r.pacientes + '\n' +
    'Eventos eliminados: ' + r.eventos + '\n\n' +
    'SECTOR_* refrescadas.');
}
