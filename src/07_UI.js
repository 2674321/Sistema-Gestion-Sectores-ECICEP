/**
 * Sistema ECICEP Unificado — 07_UI
 * Interfaz DENTRO de Google Sheets (DEC-012: Sheets es la interfaz principal).
 * ETAPA 2: solo menú base con acciones existentes. La experiencia completa
 * (INICIO/DASHBOARD/FICHA/SEGUIMIENTO, búsquedas y botones) llega en ETAPA 4.
 */

/** Menú principal. Se ejecuta automáticamente al abrir el spreadsheet. */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('ECICEP')

      .addSubMenu(ui.createMenu('📊 Operación')
        .addItem('🔍 Buscar paciente / ficha', 'UI_abrirBuscador')
        .addItem('🧾 Cola de revisión', 'UI_abrirRevision')
        .addItem('📥 Procesar ingresos', 'UI_procesarIngresos')
        .addItem('🔄 Actualizar vistas SECTOR', 'UI_refrescarSectores'))
      .addSubMenu(ui.createMenu('📦 Importación')
        .addItem('📋 Diagnosticar fuentes reales', 'UI_diagnosticarFuentes')
        .addItem('📊 Análisis de carga real (DRY RUN)', 'UI_bloqueado')
        .addItem('🚀 Ejecutar carga autorizada', 'UI_ejecutarCarga'))
      .addSubMenu(ui.createMenu('🩺 Diagnóstico')
        .addItem('🩺 Diagnosticar ingresos', 'UI_diagnosticarIngresos'))

      .addSubMenu(ui.createMenu('⚙️ Administración')
        .addItem('⚙️ Instalar / reparar estructura', 'UI_instalarEstructura')
        .addItem('🧹 Vaciar datos de prueba', 'UI_vaciarDatosPrueba')
        .addItem('🔑 Configurar acceso remoto', 'UI_configurarWebhook')
        .addItem('🔍 Recuperación: inventario', 'UI_recuperarInventario')
        .addItem('⚠️ Recuperación: ejecutar reversión', 'UI_recuperarEjecutar'))

      .addSubMenu(ui.createMenu('🧪 Desarrollo')
        .addItem('⚡ Demo completa (ficticio)', 'UI_demoCompleta')
        .addItem('🧪 Sembrar datos ficticios', 'UI_sembrarFicticios')
        .addItem('🔬 Ejecutar pruebas', 'UI_ejecutarPruebas'))

      .addSubMenu(ui.createMenu('📈 Reportes')
        .addItem('📊 Actualizar dashboard', 'UI_actualizarDashboard'))

      .addSeparator()
      .addItem('📄 Abrir LOG', 'UI_abrirLog')
      .addToUi();
  } catch (e) { /* entorno sin UI */ }
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

/** Un solo clic: instala, siembra ficticios, procesa y refresca vistas. */
function UI_demoCompleta() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Demo completa en curso…', 'ECICEP', 15);
  var pasos = {};
  pasos.estructura = Modelo_crearEstructura();
  pasos.sembradas = Sembrar_ficticios();
  pasos.proceso = Ingresos_procesarTodasLasHojas({});
  pasos.vistas = Modelo_refrescarVistasSectores();
  Log_info('UI', 'demoCompleta', JSON.stringify(pasos.proceso));
  Log_flush();
  ss.toast(
    'Demo lista ✓ Sembradas: ' + pasos.sembradas +
    ' · Nuevos: ' + pasos.proceso.nuevos +
    ' · Enlazados: ' + pasos.proceso.existentes +
    ' · Errores: ' + pasos.proceso.conError +
    ' · Eventos: ' + pasos.proceso.eventosCreados, 'ECICEP ⚡', 20);
}

// ===========================================================================
// ETAPA 5 — Fuentes reales
// ===========================================================================

function UI_diagnosticarFuentes() {
  var resultado = Fuentes_diagnosticarFuentes();

  // escribir reporte en DIAGNOSTICO
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaD = ss.getSheetByName('DIAGNOSTICO_FUENTES');
  if (!hojaD) hojaD = ss.insertSheet('DIAGNOSTICO_FUENTES');
  hojaD.clearContents();
  Utl_escribirBloque(hojaD, 1, 1, [[
    'FUENTE','SECTOR','HOJA','EXISTE','ENCAB.FILA','RECONOCIDAS','FALTANTES','DESCONOCIDAS','FILAS_DATOS','NOTA'
  ]]);
  var fila = 2;
  resultado.fuentes.forEach(function (fuente) {
    if (fuente.error || fuente.motivo) {
      Utl_escribirBloque(hojaD, fila, 1, [[
        fuente.nombre, fuente.sector, '', '', '', '', '', '', '', fuente.error || fuente.motivo
      ]]);
      fila++;
      return;
    }
    fuente.hojas.forEach(function (h) {
      Utl_escribirBloque(hojaD, fila, 1, [[
        fuente.nombre,
        fuente.sector,
        h.nombre || '',
        h.existe === false ? 'NO EXISTE' : (h.vacia ? 'VACÍA' : 'SÍ'),
        h.encabezadoFila || '',
        h.columnasReconocidas ? h.columnasReconocidas.join(', ') : '',
        h.columnasFaltantes && h.columnasFaltantes.length ? h.columnasFaltantes.join(', ') : '',
        h.desconocidas && h.desconocidas.length ? h.desconocidas.join(' | ') : '',
        h.filasDatosAprox !== undefined ? h.filasDatosAprox : '',
        ''
      ]]);
      fila++;
    });
  });
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(hojaD);
  SpreadsheetApp.getActiveSpreadsheet().toast('Diagnóstico de fuentes escrito en DIAGNOSTICO_FUENTES.', 'ECICEP', 8);
}

function UI_importarMuestra() {
  var ui = SpreadsheetApp.getUi();
  var sectores = Object.keys(FUENTES_DRIVE).filter(function (k) { return FUENTES_DRIVE[k].id; });
  if (!sectores.length) {
    ui.alert('No hay fuentes con ID de Drive configurado.');
    return;
  }

  var resultados = [];
  sectores.forEach(function (nombreArchivo) {
    var cfg = FUENTES_DRIVE[nombreArchivo];
    cfg.hojas.forEach(function (hoja) {
      var r = Fuentes_importarMuestra(nombreArchivo, hoja, 10);
      r.fuente = nombreArchivo;
      r.hojaNombre = hoja;
      resultados.push(r);
    });
  });

  // escribir reporte en DIAGNOSTICO_IMPORT
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaR = ss.getSheetByName('IMPORT_MUESTRA');
  if (!hojaR) hojaR = ss.insertSheet('IMPORT_MUESTRA');
  hojaR.clearContents();
  Utl_escribirBloque(hojaR, 1, 1, [[
    'FUENTE','HOJA','FILA_ORIGEN','VALIDACIÓN','RUT','NOMBRE','SECTOR','ESTRAT',
    'GATE','ERRORES','WARNINGS'
  ]]);
  var fila = 2;
  var totales = { ok: 0, warn: 0, err: 0, nuevos: 0, enlazados: 0, revision: 0 };
  resultados.forEach(function (r) {
    if (!r.ok) {
      Utl_escribirBloque(hojaR, fila, 1, [[r.fuente, r.hojaNombre, '', 'ERROR GLOBAL', '', '', '', '', r.motivo, '', '']]);
      fila++;
      return;
    }
    r.detalle.forEach(function (d) {
      Utl_escribirBloque(hojaR, fila, 1, [[
        r.fuente, r.hojaNombre, d.filaOrigen, d.estado,
        d.rut, d.nombre, d.sector, d.estratificacion,
        d.gate,
        d.errores.join(' // '),
        d.warnings.join(' // ')
      ]]);
      fila++;
      if (d.estado === 'OK') totales.ok++;
      else if (d.estado === 'WARNING') totales.warn++;
      else totales.err++;
    });
    totales.nuevos += r.resumen.nuevos;
    totales.enlazados += r.resumen.existentes;
    totales.revision += r.resumen.revision;
  });

  ss.setActiveSheet(hojaR);
  ui.alert(
    'DRY RUN COMPLETADO — NO SE ESCRIBIÓ NADA\n\n' +
    'Muestra: 10 filas por hoja\n' +
    'Validación → OK: ' + totales.ok + ' · WARNING: ' + totales.warn + ' · ERROR: ' + totales.err + '\n' +
    'Serían pacientes nuevos: ' + totales.nuevos + '\n' +
    'Requieren revisión: ' + totales.revision + '\n\n' +
    'Reporte completo en la hoja IMPORT_MUESTRA.\n' +
    'Si los resultados son correctos, avisa al asistente para proceder con la carga real.');
}

/** Núcleo headless del sembrado (reutilizado por webhook). */
function Sembrar_ficticios() {
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
  Log_info('Sembrar', 'ficticios', total + ' filas');
  return total;
}

/** Un solo clic: instala, siembra ficticios, procesa y refresca vistas. */
function UI_demoCompleta() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Demo completa en curso…', 'ECICEP', 15);
  var pasos = {};
  pasos.estructura = Modelo_crearEstructura();
  pasos.sembradas = Sembrar_ficticios();
  pasos.proceso = Ingresos_procesarTodasLasHojas({});
  pasos.vistas = Modelo_refrescarVistasSectores();
  Log_info('UI', 'demoCompleta', JSON.stringify(pasos.proceso));
  Log_flush();
  ss.toast(
    'Demo lista ✓ Sembradas: ' + pasos.sembradas +
    ' · Nuevos: ' + pasos.proceso.nuevos +
    ' · Enlazados: ' + pasos.proceso.existentes +
    ' · Errores: ' + pasos.proceso.conError +
    ' · Eventos: ' + pasos.proceso.eventosCreados, 'ECICEP ⚡', 20);
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
    Modelo_agregarEventos([evento], _ingresosUsuarioActual(), { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ficha-registro' });

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

/** Endpoint sidebar: lista casos ABIERTOS con comparación origen vs candidato. */
function api_revisionListar() {
  var hoja = Modelo_hoja(HOJAS.CONFLICTOS);
  if (!hoja || hoja.getLastRow() < 2) return { casos: [], metricas: {} };
  var pacientes = Modelo_leerPacientes();
  var porId = {};
  pacientes.forEach(function (p) { porId[Utl_texto(p.ID_INTERNO)] = p; });

  var casos = [], metricas = { abiertos: 0, resueltos: 0, esMismo: 0, esOtro: 0, pendientes: 0 };
  Utl_leerBloque(hoja).slice(1).forEach(function (f, i) {
    var estado = Utl_texto(f[8]);
    if (estado === 'RESUELTO') {
      metricas.resueltos += 1;
      var dec = Utl_texto(f[6]).indexOf('CONFIRMAR') !== -1 ? 'esMismo' : 'esOtro';
      metricas[dec] += 1;
      return;
    }
    if (estado !== 'ABIERTO') return;
    var datos = null;
    try { datos = JSON.parse(f[5]); } catch (e) { return; }
    if (!datos) return;
    metricas.abiertos += 1;

    // buscar candidato
    var cand = datos.candidatoId ? porId[datos.candidatoId] : null;
    var vo = datos.valoresOriginales || {};
    casos.push({
      indice: i + 2,
      tipo: f[1],
      criterio: datos.criterio || '',
      confianza: datos.confianza || '',
      idProvisional: datos.idProvisional || '',
      // lado A: registro origen
      origen: {
        nombre: vo.NOMBRE || '', rut: vo.RUT || '', telefono: vo.TELEFONOS || '',
        sector: datos.sectorOrigen || '', estrat: vo.ESTRATIFICACION || '',
        fechaIngreso: vo.FECHA_INGRESO || '',
        fuente: (datos.origen ? datos.origen.hoja : '') + ' fila ' + (datos.origen ? datos.origen.fila : '')
      },
      // lado B: paciente candidato existente
      candidato: cand ? {
        id: cand.ID_INTERNO, nombre: cand.NOMBRE, rut: cand.RUT,
        telefono: cand.TELEFONOS, sector: cand.SECTOR,
        estrat: cand.ESTRATIFICACION, estado: cand.ESTADO
      } : null
    });
  });
  metricas.pendientes = metricas.abiertos;
  return { casos: casos, metricas: metricas };
}

/** Endpoint sidebar: aplica la decisión humana sobre un caso ABIERTO. */
function api_revisionResolver(indiceHoja, decision) {
  try {
    var hoja = Modelo_hoja(HOJAS.CONFLICTOS);
    if (!hoja) return { ok: false, motivo: 'SIN_HOJA' };
    var filaVal = hoja.getRange(indiceHoja, 1, 1, 10).getValues()[0];
    if (Utl_texto(filaVal[8]) !== 'ABIERTO') return { ok: false, motivo: 'CONFLICTO_YA_RESUELTO' };
    var datos = JSON.parse(filaVal[5]);
    if (decision !== 'CONFIRMAR_MATCH' && decision !== 'RECHAZAR_MATCH') {
      return { ok: false, motivo: 'DECISION_INVALIDA' };
    }

    var prep = Rev_prepararResolucion(datos, decision, { nuevoId: Modelo_nuevoIdInterno });
    if (!prep.ok) return { ok: false, motivo: prep.motivo };

    var contexto = { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'revision-' + decision.toLowerCase() };
    var destinoId = '';
    if (prep.accion === 'CREAR') {
      Modelo_agregarPacientes([prep.pacienteNuevo], contexto);
      destinoId = prep.pacienteNuevo.ID_INTERNO;
    } else {
      destinoId = datos.candidatoId;
    }
    Modelo_agregarEventos([prep.evento], _ingresosUsuarioActual(), contexto);

    // trazabilidad completa
    var ahora = new Date();
    hoja.getRange(indiceHoja, 9).setValue('RESUELTO');
    hoja.getRange(indiceHoja, 10).setValue(_ingresosUsuarioActual() + ' · ' + decision +
      ' · ' + ahora.toISOString() + ' → ' + destinoId);

    Modelo_refrescarVistasSectores();
    Log_info('Revision', decision, prep.accion + ' · caso fila ' + indiceHoja + ' → ' + destinoId);
    Log_flush();
    return { ok: true, accion: prep.accion, destinoId: destinoId };
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

// ===========================================================================
// ETAPA 5 — Carga real controlada (análisis + ejecución con gate)
// ===========================================================================

function UI_analisisCarga() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Analizando fuentes reales (DRY RUN, no escribe nada)…', 'ECICEP', 15);
  var r = Fuentes_cargaReal({ ejecutar: false });
  var res = r.resumen;

  var hojaR = ss.getSheetByName('CARGA_ANALISIS');
  if (!hojaR) hojaR = ss.insertSheet('CARGA_ANALISIS');
  hojaR.clearContents();
  Utl_escribirBloque(hojaR, 1, 1, [[
    'FUENTE|HOJA','FILA','VALIDACIÓN','RUT','NOMBRE','SECTOR','ESTRAT','GATE','NOTA'
  ]]);
  r.detalle.forEach(function (d, i) {
    Utl_escribirBloque(hojaR, i + 2, 1, [[
      d.fuenteOrigen || '', d.fila || '', d.estado || '', d.rut || '',
      d.nombre || '', d.sector || '', d.estratificacion || '',
      d.gate || '', d.nota || ''
    ]]);
  });

  Log_info('UI', 'analisisCarga', JSON.stringify(res));
  Log_flush();
  ss.setActiveSheet(hojaR);
  ui = SpreadsheetApp.getUi();
  ui.alert(
    'ANÁLISIS DE CARGA REAL — DRY RUN\n\n' +
    'Ejecución: ' + res.ejecucion + '\n' +
    'Registros leídos: ' + res.leidos + '\n' +
    'Ya importados previamente: ' + (res.yaImportadas || 0) + '\n\n' +
    'Validación → OK: ' + res.validacionOk +
    ' · WARNING: ' + res.validacionWarning +
    ' · ERROR: ' + res.validacionError + '\n\n' +
    'Si se ejecutara:\n' +
    '  Pacientes nuevos: ' + res.nuevos + '\n' +
    '  Existentes enlazados: ' + res.existentes + '\n' +
    '  Requieren revisión: ' + res.revision + '\n' +
    '  Eventos creados: ' + res.eventosCreados + '\n\n' +
    'NO SE ESCRIBIÓ NADA.\n' +
    'Para ejecutar la carga real usa 🚀 EJECUTAR carga real.');
}

function UI_ejecutarCarga() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    '🚀 EJECUTAR CARGA REAL',
    'Esto escribirá datos REALES en PACIENTES y EVENTOS.\n\n' +
    'Se procesarán únicamente las hojas autorizadas.\n' +
    'Los errores y REQUIERE_REVISION quedan excluidos.\n' +
    'La operación tiene idempotencia (no duplica).\n\n' +
    '¿Confirmas la ejecución?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Ejecutando carga real…', 'ECICEP', 30);

  var r = Fuentes_cargaReal({ ejecutar: true });
  var res = r.resumen;

  Log_info('UI', 'ejecutarCarga', JSON.stringify({
    leidos: res.leidos, nuevos: res.nuevos, existentes: res.existentes,
    revision: res.revision, conError: res.conError, eventos: res.eventosCreados
  }));
  Log_flush();

  ui.alert(
    'CARGA REAL COMPLETADA ✓\n\n' +
    'Ejecución: ' + res.ejecucion + '\n' +
    'Leídos: ' + res.leidos + '\n' +
    'Ya importados (omitidos): ' + (res.yaImportadas || 0) + '\n\n' +
    'Validación → OK: ' + res.validacionOk +
    ' · WARNING: ' + res.validacionWarning +
    ' · ERROR (bloqueados): ' + res.validacionError + '\n\n' +
    'Pacientes nuevos creados: ' + res.nuevos + '\n' +
    'Existentes enlazados: ' + res.existentes + '\n' +
    'Requieren revisión: ' + res.revision + '\n' +
    'Eventos creados: ' + res.eventosCreados + '\n\n' +
    'Vistas SECTOR_* refrescadas: ' + JSON.stringify(r.vistasSector || {}));
}

function UI_bloqueado() {
  SpreadsheetApp.getUi().alert(
    '🔒 OPERACIÓN BLOQUEADA\n\n' +
    'Esta acción está deshabilitada temporalmente\n' +
    'por el incidente de escritura accidental en DRY RUN.\n\n' +
    'No ejecutar hasta completar la auditoría.');
}

// ===========================================================================
// ETAPA 5-INCIDENTE — Recuperación selectiva
// ===========================================================================

function UI_recuperarInventario() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'RECUPERACIÓN — Paso 1: Inventario',
    'Pega el prefijo de fuente a investigar\n(ej: ECICEP NARANJO o PCTS. ECICEP):',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var prefijo = resp.getResponseText().trim();
  if (!prefijo) return;

  var conteo = Recuperar_inventario(prefijo);
  var hoja = Modelo_ss().getSheetByName('RECUPERACION');
  if (hoja) ss.setActiveSheet(hoja);
  ui.alert(
    'INVENTARIO GENERADO\n\n' +
    'Pacientes afectados: ' + conteo.pacientes + '\n' +
    'Eventos afectados: ' + conteo.eventos + '\n\n' +
    'Revisa la hoja RECUPERACION.\n' +
    'Si confirmas que TODOS deben eliminarse,\n' +
    'usa ⚠️ Recuperación: ejecutar reversión.');
}

function UI_recuperarEjecutar() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    '⚠️ REVERSIÓN SELECTIVA',
    'Pega el MISMO prefijo de fuente usado en el inventario:',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var prefijo = resp.getResponseText().trim();
  if (!prefijo) return;

  var conf = ui.alert(
    '⚠️ CONFIRMAR REVERSIÓN',
    'Esto eliminará PERMANENTEMENTE los registros identificados.\n' +
    'Solo se eliminan los del inventario (prefijo: ' + prefijo + ').\n\n' +
    '¿Confirmas?',
    ui.ButtonSet.YES_NO);
  if (conf !== ui.Button.YES) return;

  var r = Recuperar_ejecutar(prefijo);
  ui.alert(
    'REVERSIÓN COMPLETADA\n\n' +
    'Pacientes eliminados: ' + r.pacientesEliminados + '\n' +
    'Eventos eliminados: ' + r.eventosEliminados + '\n' +
    'SECTOR_* refrescadas.');
}
