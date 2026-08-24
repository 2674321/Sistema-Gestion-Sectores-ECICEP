/**
 * Sistema ECICEP Unificado — 07_UI
 * Interfaz DENTRO de Google Sheets (DEC-012: Sheets es la interfaz principal).
 * ETAPA 2: solo menú base con acciones existentes. La experiencia completa
 * (INICIO/DASHBOARD/FICHA/SEGUIMIENTO, búsquedas y botones) llega en ETAPA 4.
 */

/** Menú principal. Se ejecuta automáticamente al abrir el spreadsheet.
 *  Estructura oficial: un nombre = una función = una interfaz = una finalidad. */
function onOpen() {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('ECICEP')

      .addItem('🏠 Panel de Control', 'UI_panelControl')
      .addItem('📊 Estadísticas', 'UI_abrirDashboard')

      .addSubMenu(ui.createMenu('👥 Gestión')
        .addItem('👤 Pacientes ECICEP', 'UI_abrirBuscador')
        .addItem('📋 Cola de revisión', 'UI_abrirRevision')
        .addItem('📝 Procesar ingresos', 'UI_procesarIngresos')
        .addItem('🔄 Refrescar SECTOR', 'UI_refrescarSectores'))


      .addSubMenu(ui.createMenu('🩺 REM')
        .addItem('🩺 Generar REM', 'UI_generarRem')
        .addItem('🔎 Consultar REM', 'UI_verRem'))

      .addSubMenu(ui.createMenu('⚙️ Sistema')
        .addItem('⚙️ Configuración', 'UI_configuracion')
        .addItem('🔧 Instalar / Reparar Sistema', 'UI_instalarSistema')
        .addItem('🧪 Centro de Pruebas', 'UI_centroPruebas')
        .addItem('💾 Backups', 'UI_backup'))

      .addSeparator()
      .addItem('📄 Registro del sistema', 'UI_abrirLog')
      .addToUi();
  } catch (e) { /* entorno sin UI */ }
}

function UI_instalarEstructura() {
  var r = Utl_medir(Modelo_crearEstructura);
  var dis = Modelo_aplicarDiseno();
  Log_info('UI', 'instalarEstructura', 'creadas=' + r.resultado.creadas.join(','), null, r.ms);
  Log_flush();
  SpreadsheetApp.getUi().alert(
    '⚙️ Estructura creada/reparada.\n\n' +
    'Creadas: ' + (r.resultado.creadas.join(', ') || 'ninguna') +
    '\nDiseño aplicado: ' + dis.coloreadas + ' hojas · orden ' + dis.ordenadas +
    '\n(Recomendado: 🛠️ Instalar sistema para el resumen completo)');
}

/** Instala TODO en un clic: estructura + CONFIG + catálogos + validaciones +
 *  diseño + menús + validación final. Idempotente: re-ejecutar no duplica nada. */
function UI_instalarSistema() {
  var ui = SpreadsheetApp.getUi();
  var avisos = [];
  var t0 = Date.now();
  try {
    // 1-2) Estructura (crea/verifica hojas y configuración semilla general+módulos)
    var est = Modelo_crearEstructura();

    // 3) Catálogos centralizados (vigencia de exámenes)
    var ss = Modelo_ss();
    var cat = Modelo_instalarCatalogos(ss);

    // 4) Validaciones controladas en puertas INGRESO_*
    var val = Modelo_validarIngresos(ss);

    // 4b) Inventario de hojas internas: crear faltantes + corregir visibilidad
    var inv = Modelo_inventarioHojas(ss);

    // 4c) Sincronización de datos por sector (idempotente):
    //     si la fuente Amarillo está conectada en FUENTES_DRIVE → puerta + histórico
    var amarillo = null;
    try {
      var cfgAm = FUENTES_DRIVE['SEGUIMIENTO ECICEP Sector Amarillo'];
      if (cfgAm && cfgAm.id) {
        amarillo = Amarillo_importarTodo(true);
        try { if (typeof Modelo_refrescarVistasSectores === 'function') Modelo_refrescarVistasSectores(); } catch (eV) {}
      }
    } catch (eA) { avisos.push('Amarillo: ' + (eA && eA.message || eA)); }

    // 4c-bis) Primera importación de fuentes conectadas (Naranjo/Verde).
    // Idempotente: se marca en CONFIG y se salta si ya hay datos de esa fuente.
    var cargaFuente = null;
    try {
      var pend = Fuentes_pendientes();
      var yaHecha = _rem9_configValor('CARGA_REAL_HECHA');
      if (pend.length && !yaHecha) {
        cargaFuente = Fuentes_cargaReal({ ejecutar: true });
        _config_set('CARGA_REAL_HECHA', Utilities.formatDate(new Date(),
          Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
        try { if (typeof Modelo_refrescarVistasSectores === 'function') Modelo_refrescarVistasSectores(); } catch (eV2) {}
      } else if (pend.length && yaHecha) {
        avisos.push('Fuentes sin importar (' + pend.join(', ') + ') — ya existe una carga real del ' + yaHecha + '. Usa Herramientas → Cargar para re-importar.');
      }
    } catch (eC) { avisos.push('Carga de fuentes: ' + (eC && eC.message || eC)); }

    // 4d) Limpieza de hojas residuales de desarrollo
    var limpieza = Modelo_limpiarHojasResiduales(ss);

    // 4e) Interfaz de hojas: INICIO + indicadores + condicional + filtros + ocultas + protecciones
    var hojasUI = Modelo_disenoHojas();

    // 5) Diseño visual completo (colores en pares sector-ingreso, orden,
    //    ocultas, banding, congelados, anchos y formatos de fecha)
    var dis = Modelo_aplicarDiseno();

    // 6) Menus disponibles de inmediato sin esperar a que Google re-dispare onOpen
    try { onOpen(); } catch (eMenu) { avisos.push('Menú: ' + eMenu.message); }

    // 7) Validación final de funciones y hojas críticas
    var criticas = ['PACIENTES', 'EVENTOS',
      'SECTOR_NARANJO', 'SECTOR_AMARILLO', 'SECTOR_VERDE',
      'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];
    var faltan = criticas.filter(function (n) { return !Modelo_hoja(n); });
    if (faltan.length) avisos.push('Faltan hojas: ' + faltan.join(', '));

    var funciones = [['Modelo_leerPacientes'], ['Rem_generar'], ['api_dashboardDatos'],
      ['api_patologiasGuardar'], ['UI_verRem'], ['REM_exportarPdf']];
    var sinFn = funciones.filter(function (f) { return typeof this[f[0]] !== 'function'; }.bind(this))
      .map(function (f) { return f[0]; });
    if (sinFn.length) avisos.push('Funciones ausentes: ' + sinFn.join(', '));

    var pacientes = Modelo_leerPacientes().length;
    var eventos = Modelo_leerEventos().length;

    Log_info('UI', 'instalarSistema',
      'creadas=' + est.creadas.length + ' coloreadas=' + dis.coloreadas +
      ' bandas=' + dis.bandas + ' validaciones=' + val.validaciones +
      ' pacientes=' + pacientes, null);
    Log_flush();

    if (dis.fallidas && dis.fallidas.length) {
      avisos = avisos.concat(dis.fallidas.map(function (f) { return 'Diseño · ' + f; }));
    }
    if (val.fallidas.length) {
      avisos = avisos.concat(val.fallidas.map(function (f) { return 'Validaciones · ' + f; }));
    }

    ui.alert(
      '🛠️ INSTALACIÓN FINALIZADA\n\n' +
      '✓ Hojas verificadas: creadas ' + est.creadas.length +
      ' · existentes ' + est.existentes.length + '\n' +
      '✓ CONFIG general/módulos sembrado (idempotente)\n' +
      '✓ Catálogo vigencia exámenes' +
        (cat.sembrada ? ' (con ejemplos)' : ' verificado') + '\n' +
      '✓ Validaciones aplicadas: ' + val.validaciones + ' en ' + val.hojas + ' puertas INGRESO\n' +
      '✓ Columnas sistema marcadas: ' + val.protegidas + '\n' +
      '✓ Hojas residuales eliminadas: ' + (limpieza.eliminadas.length
        ? limpieza.eliminadas.join(', ') : 'ninguna') + '\n' +
      (est.dashboardReparado ? '✓ DASHBOARD reparado (tenía encabezados de PACIENTES)\n' : '') +
      '✓ Hojas internas: ' + inv.total + ' verificadas' +
        (inv.creadas.length ? ' · creadas: ' + inv.creadas.join(', ') : '') +
        (inv.visibilidadCorregida.length ? ' · visibilidad corregida: ' + inv.visibilidadCorregida.join(', ') : '') + '\n' +
      '✓ Diseño: ' + dis.coloreadas + ' hojas coloreadas · ' + dis.ordenadas +
        ' ordenadas · ' + dis.bandas + ' con filas intercaladas\n' +
      '✓ Ocultas: ' + (dis.ocultas.length ? dis.ocultas.join(', ') : 'ninguna') + '\n' +
      '✓ Hoja INICIO: ' + hojasUI.inicio.accesos + ' accesos + indicadores vivos\n' +
      '✓ Formato condicional: ' + hojasUI.cond.aplicadas + ' reglas · Filtros: ' +
        hojasUI.filtros.filtros + ' · Columnas técnicas ocultas: ' + hojasUI.ocultas.ocultas + '\n' +
      '✓ Protecciones de advertencia: ' + hojasUI.protecciones.protecciones + '\n' +
      '✓ Menú actualizado · Encabezados y fechas formateados\n' +
      '✓ Datos: PACIENTES ' + pacientes + ' · EVENTOS ' + eventos + '\n' +
      (cargaFuente ? '✓ Carga inicial de fuentes: ' + JSON.stringify(
        (cargaFuente.porFuente||cargaFuente.resumen||cargaFuente)) + '\n' : '') +
      (amarillo ? '✓ Sector Amarillo sincronizado: puerta +' + amarillo.puerta.nuevas +
        ' · histórico ' + amarillo.historico.eventosCreados + ' eventos · ' +
        amarillo.historico.pacientesActualizados + ' pacientes actualizados' +
        (amarillo.historico.pendientesSinPaciente.length
          ? ' (⚠ ' + amarillo.historico.pendientesSinPaciente.length + ' filas requieren re-procesar ingresos)'
          : '') + '\n' : '') + '\n' +
      (avisos.length ? '⚠️ AVISOS:\n· ' + avisos.join('\n· ')
                     : 'Sistema listo para utilizar.') +
      '\n\n\u23f1 Duraci\u00f3n: ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  } catch (e) {
    Log_error('UI', 'instalarSistema', e && e.message ? e.message : String(e));
    Log_flush();
    ui.alert('ERROR en instalación: ' + (e && e.message ? e.message : String(e)));
  }
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

/** 📄 Registro del Sistema: visor visual del LOG (la hoja queda interna). */
function UI_abrirLog() {
  var t = HtmlService.createTemplateFromFile('LogVisor');
  t.BUILD = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setTitle('Registro del Sistema')
    .setWidth(1180).setHeight(720));
}

/** Endpoint visor LOG: últimos registros + conteos por nivel. */
function api_logLeer(limite) {
  try {
    var h = Modelo_hoja(HOJAS.LOG);
    if (!h || h.getLastRow() < 2) return { ok: true, registros: [], resumen: { total: 0, errores: 0, advertencias: 0, informacion: 0 } };
    var max = Math.min(Number(limite) || 500, 2000);
    var ultima = h.getLastRow();
    var desde = Math.max(2, ultima - max + 1);
    var vals = h.getRange(desde, 1, ultima - desde + 1, Math.min(h.getLastColumn(), 7)).getValues();
    var tz = Session.getScriptTimeZone();
    var registros = vals.map(function (f) {
      return {
        fechaIso: f[0] instanceof Date ? Utilities.formatDate(f[0], tz, 'yyyy-MM-dd HH:mm:ss') : Utl_texto(f[0]),
        nivel: Utl_texto(f[1]).toUpperCase(),
        modulo: Utl_texto(f[2]),
        accion: Utl_texto(f[3]),
        resultado: Utl_texto(f[4]),
        duracionMs: f[5],
        contexto: Utl_texto(f[6])
      };
    });
    var errores = 0, adv = 0, info = 0;
    registros.forEach(function (r) {
      if (r.nivel === 'ERROR') errores++;
      else if (r.nivel === 'WARNING') adv++;
      else info++;
    });
    return { ok: true, registros: registros,
             resumen: { total: registros.length, errores: errores, advertencias: adv, informacion: info } };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
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
/** Incluye un archivo HTML (tokens/componentes) dentro de una plantilla. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Abre una vista HTML como dialog ancho (dashboard / REM). */
function _ui_dialogo(nombre, titulo) {
  var t = HtmlService.createTemplateFromFile(nombre);
  t.BUILD = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  var html = t.evaluate().setTitle(titulo).setWidth(1180).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, titulo);
}

/** Abre la sidebar en un modo concreto: 'centro' (panel) o 'pacientes' (buscador+ficha). */
function _ui_sidebar(modo, titulo) {
  var t = HtmlService.createTemplateFromFile('Sidebar');
  t.modo = modo;
  t.BUILD = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm');
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle(titulo));
}

/** 🏠 Panel de Control: dashboard principal con accesos y estado general. */
function UI_panelControl() { _ui_sidebar('centro', 'Panel de Control'); }

/** 👤 Pacientes ECICEP: buscador + ficha. */
function UI_abrirBuscador() { _ui_sidebar('pacientes', 'Pacientes ECICEP'); }

/** 📋 Cola de Revisión: sidebar exclusivo del módulo de revisión. */
function UI_abrirRevision() { _ui_sidebar('revision', 'Cola de Revisión'); }

/** ⚙️ Configuración: abre la hoja CONFIG (la muestra si está oculta). */
function UI_configuracion() {
  var h = Modelo_hoja(HOJAS.CONFIG);
  if (!h) return;
  if (h.isSheetHidden()) h.showSheet();
  Modelo_ss().setActiveSheet(h);
}

/** 🧪 Centro de Pruebas: única entrada al diagnóstico del sistema. */
function UI_centroPruebas() { _ui_dialogo('CentroPruebas', 'Centro de Pruebas'); }

function UI_abrirDashboard() { _ui_dialogo('Dashboard', 'Estadísticas'); }

function UI_verRem() { _ui_dialogo('RemVista', 'REM vista de trabajo'); }

/** Generador REM: dialog estilo Panel (reemplaza los prompt nativos). */
function UI_generarRem() { _ui_dialogo('RemGenerador', 'Generar REM'); }

/** Navegación a hoja por nombre, con whitelist del diseño del libro. */
function api_irA(nombreHoja) {
  try {
    var permitidas = {};
    MODELO_DISENO.forEach(function (d) { permitidas[d.nombre] = true; });
    var nombre = Utl_texto(nombreHoja).trim();
    if (!permitidas[nombre]) return { ok: false, motivo: 'HOJA_NO_PERMITIDA' };
    var h = Modelo_hoja(nombre);
    if (!h) return { ok: false, motivo: 'HOJA_NO_EXISTE' };
    if (h.isSheetHidden()) h.showSheet();
    Modelo_ss().setActiveSheet(h);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Resumen operativo real para el Centro de Control (una llamada). */
function api_centroResumen() {
  try {
    var pacientes = Modelo_leerPacientes();
    var eventos = Modelo_leerEventos();
    var tz = Session.getScriptTimeZone();
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var mesActual = hoyIso.slice(0, 7);

    var ingresosHoy = 0, eventosMes = 0;
    var eventosMin = eventos.map(function (e) {
      var f = _ui_isoFecha(e.FECHA_EVENTO);
      if (f === hoyIso && Utl_texto(e.TIPO_EVENTO).toUpperCase() === 'INGRESO') ingresosHoy++;
      if (f.slice(0, 7) === mesActual) eventosMes++;
      return { tipo: Utl_texto(e.TIPO_EVENTO), sector: Utl_texto(e.SECTOR), f: f,
               nombre: Utl_texto(e.NOMBRE) };
    });

    var paxMin = pacientes.map(function (p) {
      return { sector: Utl_texto(p.SECTOR),
               rev: (p.REQUIERE_REVISION === true || p.REQUIERE_REVISION === 'TRUE'),
               est: Utl_texto(p.ESTRATIFICACION) };
    });
    var porRevisar = paxMin.filter(function (p) { return p.rev; }).length;
    var estratPendiente = _panel_estratPendiente(paxMin);
    var sectores = _panel_resumenSectores(paxMin, eventosMin, hoyIso);

    var cola = 0;
    try {
      var rev = api_revisionListar();
      cola = (rev && rev.metricas && rev.metricas.abiertos) || 0;
    } catch (eR) {}

    var ultimaD = null;
    pacientes.forEach(function (p) {
      if (p.FECHA_ACTUALIZACION instanceof Date &&
          (!ultimaD || p.FECHA_ACTUALIZACION > ultimaD)) ultimaD = p.FECHA_ACTUALIZACION;
    });

    // Última actividad: últimos 4 eventos del día/mes en curso, datos discretos
    var ultimos = eventosMin.slice()
      .sort(function (a, b) { return b.f < a.f ? -1 : b.f > a.f ? 1 : 0; })
      .slice(0, 4)
      .map(function (e) {
        return { fechaIso: e.f, hora: (e.f && e.f.length >= 16) ? e.f.slice(11, 16) : '',
                 tipo: e.tipo, iniciales: _panel_iniciales(e.nombre) };
      });

    return { ok: true,
             pacientes: pacientes.length, ingresosHoy: ingresosHoy,
             eventosMes: eventosMes, porRevisar: porRevisar,
             estratPendiente: estratPendiente, colaRevision: cola,
             sectores: sectores, ultimos: ultimos,
             ultimaAct: ultimaD ? Utilities.formatDate(ultimaD, tz, 'dd/MM/yyyy HH:mm') : 'sin cambios',
             fechaIso: hoyIso,
             horaIso: Utilities.formatDate(new Date(), tz, 'HH:mm') };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Fecha → 'YYYY-MM-DD' en zona horaria del proyecto (nunca UTC por defecto). */
function _ui_isoFecha(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return Utl_texto(v).slice(0, 10);
}

/**
 * Endpoint dashboard: UNA sola llamada con todo lo necesario para que el
 * cliente filtre localmente y la UI reaccione instantánea. Payload mínimo
 * por fila; sin datos derivados precalculados (#25: se computan en cliente).
 */
function api_dashboardDatos() {
  try {
    var pacientes = Modelo_leerPacientes().map(function (p) {
      return { sector: Utl_texto(p.SECTOR), est: Utl_texto(p.ESTRATIFICACION),
               rev: (p.REQUIERE_REVISION === true || p.REQUIERE_REVISION === 'TRUE'),
               cond: Utl_texto(p.CONDICIONES), fi: _ui_isoFecha(p.FECHA_INGRESO),
               pc: _ui_isoFecha(p.PROXIMO_CONTROL) };
    });
    var eventos = Modelo_leerEventos().map(function (e) {
      return { tipo: Utl_texto(e.TIPO_EVENTO), sector: Utl_texto(e.SECTOR),
               f: _ui_isoFecha(e.FECHA_EVENTO) };
    });
    var catalogo = CATALOGO_CONDICIONES_ECICEP.filter(function (c) { return c.ACTIVA; })
      .map(function (c) { return { codigo: c.CODIGO, nombre: c.NOMBRE_CANONICO }; });
    return { ok: true, pacientes: pacientes, eventos: eventos, catalogo: catalogo,
             generadoEn: _ui_isoFecha(new Date()) };
  } catch (e) {
    Log_error('Dashboard', 'api_dashboardDatos', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint visor REM: contenido crudo de REM_SALIDA para tratamiento visual.
 *  NO define columnas oficiales — solo transporta lo generado. */
function api_remLeer() {
  try {
    var hoja = Modelo_hoja('REM_SALIDA');
    if (!hoja || hoja.getLastRow() < 1) return { ok: false, motivo: 'REM_NO_GENERADO' };
    var tz = Session.getScriptTimeZone();
    var filas = Utl_leerBloque(hoja).map(function (f) {
      return f.map(function (c) {
        return (c instanceof Date) ? Utilities.formatDate(c, tz, 'dd/MM/yyyy HH:mm') : c;
      });
    });
    // meta para acciones del visor (PDF): parseo de la cabecera reproducible
    var meta = { anio: null, mes: null, sector: 'TODOS' };
    var textoCab = Utl_texto(filas.length ? filas[0][0] : '');
    var mMes = /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/.exec(textoCab.toUpperCase());
    if (mMes) {
      meta.mes = REM_MESES.indexOf(mMes[1]) + 1;
      meta.anio = +mMes[2];
    }
    var mSec = /Sector:\s*([A-ZÁÉÍÓÚ]+)/i.exec(textoCab);
    if (mSec) meta.sector = mSec[1].toUpperCase();
    return { ok: true, filas: filas, meta: meta };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint sidebar: búsqueda por RUT exacto o nombre (no agresiva). */
function api_buscar(termino) {
  return Bus_buscarPacientes(Modelo_leerPacientes(), termino, 25).map(function (p) {
    return { id: p.ID_INTERNO, rut: p.RUT, nombre: p.NOMBRE,
             sector: p.SECTOR, estado: p.ESTADO, estrat: p.ESTRATIFICACION };
  });
}

/** Endpoint sidebar: ficha consolidada + historial desde EVENTOS.
 *  Contrato: NUNCA retorna null/undefined. Siempre retorna {ok:true|false,...}
 */
function api_ficha(idInterno) {
  try {
    var pacientes = Modelo_leerPacientes();
    var paciente = null;
    var idNormalizado = Utl_texto(idInterno).trim();

    for (var i = 0; i < pacientes.length; i++) {
      var idSheet = Utl_texto(pacientes[i].ID_INTERNO).trim();
      if (idSheet === idNormalizado) { paciente = pacientes[i]; break; }
    }

    if (!paciente) {
      return {
        ok: false,
        code: 'PACIENTE_NO_ENCONTRADO',
        message: 'No se encontró paciente con ID_INTERNO=' + JSON.stringify(idNormalizado),
        totalLeidos: pacientes.length
      };
    }

    var eventos = [];
    try {
      eventos = Modelo_leerEventos().filter(function (e) {
        return Utl_texto(e.ID_INTERNO) === Utl_texto(idNormalizado);
      }).sort(function (a, b) {
        return Utl_texto(a.FECHA_EVENTO) < Utl_texto(b.FECHA_EVENTO) ? -1 :
               Utl_texto(a.FECHA_EVENTO) > Utl_texto(b.FECHA_EVENTO) ? 1 : 0;
      });
    } catch (evErr) {
      console.warn('Error leyendo eventos para ficha:', evErr.message);
      // continuar sin eventos pero con datos del paciente
    }

    var ficha = {};
    _FICHA_CAMPOS_OPERATIVOS.forEach(function (c) {
      var v = paciente[c];
      // convertir Date objects a ISO string para serialización
      if (v instanceof Date) {
        v = v.getFullYear() + '-' + ('0'+(v.getMonth()+1)).slice(-2) + '-' + ('0'+v.getDate()).slice(-2);
      }
      ficha[c] = v !== undefined && v !== null ? v : '';
    });

    ficha.EDAD = Utl_edadDesde(paciente.FECHA_NACIMIENTO);
    ficha.eventos = eventos.map(function (e) {
      var fechaEv = e.FECHA_EVENTO;
      if (fechaEv instanceof Date) {
        fechaEv = fechaEv.getFullYear() + '-' + ('0'+(fechaEv.getMonth()+1)).slice(-2) + '-' + ('0'+fechaEv.getDate()).slice(-2);
      }
      return { fecha: fechaEv, tipo: e.TIPO_EVENTO, sector: e.SECTOR,
               riesgo: e.RIESGO_G, profesional: e.PROFESIONAL, descripcion: e.DESCRIPCION };
    });

    return { ok: true, ficha: ficha };

  } catch (e) {
    return {
      ok: false,
      code: 'ERROR_BACKEND',
      message: e && e.message ? e.message : String(e)
    };
  }
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
    var esquema = Modelo_asegurarEsquemaPacientes();
    if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };
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
  var ui = SpreadsheetApp.getUi();
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
  if (hoja) Modelo_ss().setActiveSheet(hoja);
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

// ===========================================================================
// Esquema PACIENTES — migración manual/verificable desde el menú
// ===========================================================================

function UI_migrarEsquemaPacientes() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = Modelo_asegurarEsquemaPacientes();
    if (!r.ok) {
      ui.alert('❌ ESQUEMA INCOMPATIBLE\n\n' + r.motivo +
        '\n\nNO se modificó nada.\nRevisar los encabezados de PACIENTES manualmente.');
      return;
    }
    var repar = Modelo_repararCamposTecnicos();
    if (!r.migrada && repar.reparados === 0 && repar.marcadosRevision === 0) {
      ui.alert('✅ TODO LIMPIO\n\nEsquema alineado (' + Modelo_campos().length +
        ' columnas) y sin filas con datos inconsistentes.\nNo se requiere ninguna acción.');
      return;
    }
    var msg = '';
    if (r.migrada) {
      msg += '🔧 MIGRACIÓN COMPLETADA\n\nColumnas insertadas: ' + r.insertadas.join(', ') + '\n\n';
    }
    msg += '🧹 LIMPIEZA APLICADA\nFilas reparadas: ' + repar.reparados +
      '\nMarcadas para revisión (FUENTE vacía): ' + repar.marcadosRevision;
    if (repar.sospechosas && repar.sospechosas.length) {
      msg += '\n\n⚠️ Trazabilidad perdida en:\n' + repar.sospechosas.slice(0, 10).map(function (s) {
        return 'Fila ' + s.fila + ' · ' + s.nombre + ' (' + s.rut + ')';
      }).join('\n');
    }
    ui.alert(msg);
  } catch (e) {
    ui.alert('ERROR: ' + (e && e.message ? e.message : String(e)));
  }
}

// ===========================================================================
// Integridad de trazabilidad (FUENTE como contrato)
// ===========================================================================

/** Diagnóstico SOLO LECTURA: detecta FUENTE vacía y cierres indebidos. */
function UI_diagnosticoTrazabilidad() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = Modelo_diagnosticoTrazabilidad();
    var msg = '🔎 INTEGRIDAD DE TRAZABILIDAD\n\n' +
      'Total pacientes: ' + r.total + '\n' +
      'OK: ' + r.ok + '\n' +
      'Con FUENTE vacía: ' + r.conFuenteVacia + '\n' +
      'FUENTE vacía + REQUIERE_REVISION=false: ' + r.conFuenteVaciaRevisionFalse + '\n' +
      '(solo reporte — no se corrigió nada)';
    if (r.incompletas.length) {
      msg += '\n\n⚠️ TRAZABILIDAD_INCOMPLETA:\n' + r.incompletas.slice(0, 10).map(function (p) {
        return 'Fila ' + p.fila + ' · ' + p.nombre + ' (' + p.rut + ')' +
          (p.requiereRevision ? '' : ' · ⚠️ cerrada sin origen');
      }).join('\n');
      if (r.incompletas.length > 10) msg += '\n… y ' + (r.incompletas.length - 10) + ' más';
    }
    ui.alert(msg);
  } catch (e) {
    ui.alert('ERROR: ' + (e && e.message ? e.message : String(e)));
  }
}

// ===========================================================================
// REM mensual — la interfaz oficial es el dialog RemGenerador (UI_generarRem,
// definido junto a los demás openers). Esta sección se conserva vacía a
// propósito: la generación vive en 14_REM.js y la UI en RemGenerador.html.
// ===========================================================================

// ===========================================================================
// ETAPA 8E — Selector de patologías ECICEP
// ===========================================================================

/** Endpoint sidebar: devuelve catálogo + condiciones actuales del paciente. */
function api_patologiasAbrir(idInterno) {
  var catalogo = CATALOGO_CONDICIONES_ECICEP.filter(function (c) { return c.ACTIVA; }).map(function (c) {
    return { codigo: c.CODIGO, nombre: c.NOMBRE_CANONICO, peso: c.PONDERACION };
  });
  var pacientes = Modelo_leerPacientes();
  var paciente = null;
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(idInterno)) { paciente = pacientes[i]; break; }
  }
  var seleccionadas = paciente && paciente.CONDICIONES ? Utl_texto(paciente.CONDICIONES).split(';').filter(Boolean) : [];
  var otras = paciente && paciente.OTRAS_PATOLOGIAS ? Utl_texto(paciente.OTRAS_PATOLOGIAS) : '';
  return { catalogo: catalogo, seleccionadas: seleccionadas, otrasPatologias: otras };
}

/** PURA: valida que los códigos existan en el catálogo y elimina duplicados. */
function Condiciones_validarSeleccion(codigos, catalogo) {
  var validos = [], invalidos = [];
  var vistos = {};
  (codigos || []).forEach(function (codigo) {
    var limpio = Utl_texto(codigo).toUpperCase().trim();
    if (!limpio) return;
    if (vistos[limpio]) return;
    vistos[limpio] = true;
    var existe = catalogo.some(function (c) {
      return c.ACTIVA && c.CODIGO.toUpperCase() === limpio;
    });
    if (existe) validos.push(limpio);
    else invalidos.push(limpio);
  });
  return { validos: validos, invalidos: invalidos };
}

/** Endpoint sidebar: valida y guarda las patologías del paciente. */
function api_patologiasGuardar(idInterno, codigosSeleccionados, otrasPatologias) {
  try {
    var val = Condiciones_validarSeleccion(codigosSeleccionados, CATALOGO_CONDICIONES_ECICEP);
    if (val.invalidos.length) return { ok: false, motivo: 'CÓDIGOS_INVALIDOS', invalidos: val.invalidos };

    var esquema = Modelo_asegurarEsquemaPacientes();
    if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };

    var pacientes = Modelo_leerPacientes();
    var idx = -1;
    for (var i = 0; i < pacientes.length; i++) {
      if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(idInterno)) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };

    var anteriores = Utl_texto(pacientes[idx].CONDICIONES);
    pacientes[idx].CONDICIONES = val.validos.join(';');
    pacientes[idx].OTRAS_PATOLOGIAS = Utl_texto(otrasPatologias).trim();
    pacientes[idx].FECHA_ACTUALIZACION = new Date();

    Modelo_hoja(HOJAS.PACIENTES).getRange(2 + idx, 1, 1, MODELO_PACIENTE.length)
         .setValues([Modelo_filaDesdeObjeto(pacientes[idx])]);

    Log_info('Patologias', 'guardar', 'paciente=' + idInterno + ' anteriores=[' + anteriores + '] nuevas=[' + val.validos.join(';') + ']');
    Log_flush();

    return { ok: true, condiciones: val.validos, cantidad: val.validos.length,
             puntaje: _calcularPuntaje(val.validos),
             estratificacion: CFG_ESTRATIFICACION.REGLA_DISPONIBLE ? 'calculable' : 'pendiente de regla oficial',
             esquemaMigrado: !!esquema.migrada };
  } catch (e) {
    Log_error('Patologias', 'guardar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

function _calcularPuntaje(codigos) {
  var total = 0;
  (codigos || []).forEach(function (codigo) {
    for (var i = 0; i < CATALOGO_CONDICIONES_ECICEP.length; i++) {
      if (CATALOGO_CONDICIONES_ECICEP[i].CODIGO === codigo && CATALOGO_CONDICIONES_ECICEP[i].ACTIVA) {
        total += CATALOGO_CONDICIONES_ECICEP[i].PONDERACION || 1; break;
      }
    }
  });
  return total;
}

/** Diagnóstico: cuenta pacientes y muestra primeros 3 IDs. */
function api_diagnosticoPacientes() {
  var pacientes = Modelo_leerPacientes();
  return {
    total: pacientes.length,
    columnas: pacientes.length ? Object.keys(pacientes[0]).slice(0, 8) : [],
    primerosIds: pacientes.slice(0, 3).map(function (p) { return p.ID_INTERNO; }),
    hojaExiste: !!Modelo_hoja(HOJAS.PACIENTES),
    ultimaFila: Modelo_hoja(HOJAS.PACIENTES) ? Modelo_hoja(HOJAS.PACIENTES).getLastRow() : 0
  };
}

/** DIAGNÓSTICO: ejecutar desde el editor de Apps Script para depurar búsqueda/ficha */
function DIAGNOSTICO_BUSCAR_FICHA() {
  var pacientes = Modelo_leerPacientes();
  Logger.log('=== DIAGNÓSTICO BÚSQUEDA→FICHA ===');
  Logger.log('Total pacientes: ' + pacientes.length);

  if (pacientes.length === 0) {
    Logger.log('❌ ERROR CRÍTICO: No se leyó ningún paciente de PACIENTES');
    return;
  }

  Logger.log('✓ Pacientes leídos correctamente');
  Logger.log('');

  // analizar primeros 3 pacientes en detalle
  pacientes.slice(0, 3).forEach(function (p, idx) {
    Logger.log('--- Paciente ' + idx + ' ---');
    Logger.log('ID_INTERNO: ' + JSON.stringify(p.ID_INTERNO));
    Logger.log('tipo: ' + typeof p.ID_INTERNO);
    Logger.log('largo: ' + Utl_texto(p.ID_INTERNO).length);
    Logger.log('RUT: ' + JSON.stringify(p.RUT));
    Logger.log('NOMBRE: ' + JSON.stringify(Utl_texto(p.NOMBRE).substring(0, 30)));
    Logger.log('keys del objeto: ' + JSON.stringify(Object.keys(p).slice(0, 10)));
    Logger.log('');
  });

  // prueba búsqueda del primero
  var primero = pacientes[0];
  var nombreBusqueda = Utl_texto(primero.NOMBRE).substring(0, 5);
  Logger.log('--- Prueba búsqueda "' + nombreBusqueda + '" ---');
  var busqueda = Bus_buscarPacientes(pacientes, nombreBusqueda);
  Logger.log('Resultados búsqueda: ' + busqueda.length);
  if (busqueda.length > 0) {
    Logger.log('Primer resultado ID: ' + JSON.stringify(busqueda[0].ID_INTERNO));
    Logger.log('Coincide con original: ' + (busqueda[0].ID_INTERNO === primero.ID_INTERNO));
  }

  // prueba ficha del primero
  Logger.log('');
  Logger.log('--- Prueba ficha para ID ' + JSON.stringify(primero.ID_INTERNO) + ' ---');
  var ficha = Modelo_fichaPaciente(primero.ID_INTERNO);
  Logger.log('Ficha resultado: ' + (ficha ? 'ENCONTRADA ✓' : 'NULL ✗'));

  if (!ficha) {
    Logger.log('⚠️ INVESTIGANDO POR QUÉ NO ENCUENTRA:');
    Logger.log('ID buscado (string): ' + JSON.stringify(Utl_texto(primero.ID_INTERNO)));
    // comparar manualmente cada ID
    for (var i = 0; i < pacientes.length; i++) {
      var idSheet = Utl_texto(pacientes[i].ID_INTERNO);
      var idBuscar = Utl_texto(primero.ID_INTERNO);
      if (i < 3) {
        Logger.log('  fila ' + (i+2) + ': ID=' + JSON.stringify(idSheet) +
                   ' | === buscado? ' + (idSheet === idBuscar));
      }
      if (idSheet === idBuscar) {
        Logger.log('  MATCH MANUAL encontrado en índice ' + i);
        break;
      }
    }
  }

  // probar también con un paciente del medio
  if (pacientes.length > 10) {
    var medio = pacientes[Math.floor(pacientes.length / 2)];
    Logger.log('');
    Logger.log('--- Prueba ficha paciente del medio ---');
    Logger.log('ID: ' + JSON.stringify(medio.ID_INTERNO));
    var fichaMedio = Modelo_fichaPaciente(medio.ID_INTERNO);
    Logger.log('Ficha: ' + (fichaMedio ? 'ENCONTRADA ✓' : 'NULL ✗'));
  }

  Logger.log('=== FIN DIAGNÓSTICO ===');
}

// ===========================================================================
// 🧪 Centro de Pruebas — registro declarativo + ejecutor con informe
// ===========================================================================

var PRUEBAS_SISTEMA = [
  { id: 'hojas',        modulo: 'SISTEMA',    nombre: 'Hojas críticas presentes',      fn: '_pruS_hojas' },
  { id: 'config',       modulo: 'SISTEMA',    nombre: 'CONFIG sembrado',               fn: '_pruS_config' },
  { id: 'menu',         modulo: 'SISTEMA',    nombre: 'Funciones del menú globales',   fn: '_pruS_menu' },
  { id: 'plantillas',   modulo: 'INTERFAZ',   nombre: 'Sidebars y dialogs compilables',fn: '_pruS_plantillas' },
  { id: 'estadisticas', modulo: 'INTERFAZ',   nombre: 'Estadísticas operativa',        fn: '_pruS_estadisticas' },
  { id: 'validaciones', modulo: 'DATOS',      nombre: 'Validaciones en INGRESO',       fn: '_pruS_validaciones' },
  { id: 'catalogos',    modulo: 'DATOS',      nombre: 'Catálogo vigencias',            fn: '_pruS_catalogos' },
  { id: 'formatos',     modulo: 'DATOS',      nombre: 'Formato de fechas PACIENTES',   fn: '_pruS_formatos' },
  { id: 'protecciones', modulo: 'DATOS',      nombre: 'Protecciones sistema',          fn: '_pruS_protecciones' },
  { id: 'remDatos',     modulo: 'REM',        nombre: 'REM generado disponible',       fn: '_pruS_remDatos' },
  { id: 'pdf',          modulo: 'REM',        nombre: 'Exportador PDF',                fn: '_pruS_pdf' },
  { id: 'traza',        modulo: 'INTEGRIDAD', nombre: 'Trazabilidad FUENTE',           fn: '_pruS_traza' },
  { id: 'consistencia', modulo: 'INTEGRIDAD', nombre: 'Consistencia entre sectores',   fn: '_pruS_consistencia' },
  { id: 'calidad',      modulo: 'INTEGRIDAD', nombre: 'Calidad de datos (auditoría)',  fn: '_pruS_calidad' }
];

/** Registro para el cliente (checkboxes agrupados por módulo). */
function api_pruebasRegistro() {
  return { ok: true, pruebas: PRUEBAS_SISTEMA };
}

/** Ejecuta SOLO las pruebas pedidas (#9). Cada check es inteligente cuando
 *  puede (#11): evalúa funcionamiento real, no solo existencia. Registra en LOG (#10). */
function api_pruebasSistema(ids) {
  var t0 = Date.now();
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var pedidos = (ids && ids.length) ? ids : PRUEBAS_SISTEMA.map(function (p) { return p.id; });
  var resultados = pedidos.map(function (id) {
    var reg = null;
    PRUEBAS_SISTEMA.forEach(function (p) { if (p.id === id) reg = p; });
    if (!reg) return { id: id, estado: 'ERROR', detalle: 'Prueba desconocida', ms: 0 };
    var t1 = Date.now();
    try {
      var fn = G[reg.fn];
      if (typeof fn !== 'function') throw new Error('función ausente: ' + reg.fn);
      var r = fn() || {};
      r.id = id; r.modulo = reg.modulo; r.nombre = reg.nombre;
      r.ms = Date.now() - t1;
      if (!r.estado) r.estado = 'OK';
      return r;
    } catch (e) {
      return { id: id, modulo: reg.modulo, nombre: reg.nombre, estado: 'ERROR',
               detalle: e && e.message ? e.message : String(e), ms: Date.now() - t1 };
    }
  });
  var contar = function (e) {
    return resultados.filter(function (r) { return r.estado === e; }).length;
  };
  var resumen = { total: resultados.length, ok: contar('OK'), warn: contar('WARN'),
                  error: contar('ERROR'), skip: contar('SKIP') };
  Log_info('Pruebas', 'ejecutar', JSON.stringify(resumen), null, Date.now() - t0);
  Log_flush();
  return { ok: true, resultados: resultados, resumen: resumen, duracion: Date.now() - t0 };
}

/* ---- Checks individuales: devuelven {estado:OK|WARN|ERROR|SKIP, detalle} ---- */

function _pruS_hojas() {
  var crit = ['PACIENTES', 'EVENTOS', 'SECTOR_NARANJO', 'SECTOR_AMARILLO',
              'SECTOR_VERDE', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];
  var faltan = crit.filter(function (n) { return !Modelo_hoja(n); });
  if (faltan.length) return { estado: 'ERROR',
    detalle: 'Faltan hojas operativas: ' + faltan.join(', ') };

  var problemas = [], okInternas = [];
  MODELO_DISENO.filter(function (d) { return d.oculta; }).forEach(function (d) {
    var h = Modelo_hoja(d.nombre);
    if (!h) { problemas.push('\u274c ' + d.nombre + ' no existe'); return; }
    if (!h.isSheetHidden()) { problemas.push('\u26a0 ' + d.nombre + ' existe pero est\u00e1 VISIBLE'); }
    else okInternas.push(d.nombre + ' oculta \u2713');
  });
  if (problemas.length) return { estado: 'WARN', detalle: problemas.join(' \u00b7 ') };
  return { estado: 'OK',
           detalle: crit.length + ' operativas · internas OK: ' + okInternas.length };
}
function _pruS_config() {
  var h = Modelo_hoja(HOJAS.CONFIG);
  if (!h) return { estado: 'ERROR', detalle: 'Sin hoja CONFIG' };
  var req = ['GENERAL_NOMBRE_SISTEMA', 'GENERAL_INSTITUCION', 'DASHBOARD_TITULO',
             'REM_INCLUIR_INDICADORES', 'PACIENTES_MIN_BUSQUEDA'];
  var valores = {};
  Utl_leerBloque(h).forEach(function (f) { valores[Utl_texto(f[0])] = f[1]; });
  var faltan = req.filter(function (k) { return !(k in valores); });
  return faltan.length
    ? { estado: 'ERROR', detalle: 'Faltan claves: ' + faltan.join(', ') }
    : { estado: 'OK', detalle: req.length + ' claves verificadas' };
}
function _pruS_menu() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var fns = ['UI_panelControl', 'UI_abrirBuscador', 'UI_abrirRevision', 'UI_abrirDashboard',
             'UI_generarRem', 'UI_verRem', 'UI_configuracion', 'UI_instalarSistema',
             'UI_centroPruebas'];
  var faltan = fns.filter(function (n) { return typeof G[n] !== 'function'; });
  return faltan.length
    ? { estado: 'ERROR', detalle: 'Ausentes: ' + faltan.join(', ') }
    : { estado: 'OK', detalle: fns.length + ' funciones globales' };
}
function _pruS_plantillas() {
  var errores = [];
  ['Sidebar', 'Dashboard', 'RemVista', 'RemGenerador', 'CentroPruebas']
    .forEach(function (n) {
      try {
        var t = HtmlService.createTemplateFromFile(n);
        t.modo = 'centro'; t.BUILD = '';
        t.evaluate().getContent();
      } catch (e) { errores.push(n + ': ' + (e && e.message || e)); }
    });
  return errores.length
    ? { estado: 'ERROR', detalle: errores.join(' · ') }
    : { estado: 'OK', detalle: '5 plantillas compilan' };
}
function _pruS_estadisticas() {
  /* Verificación ligera (<1s): estructura legible, no el payload completo.
     El payload completo ya lo ejercita el Panel cada vez que se abre. */
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  if (typeof G.api_dashboardDatos !== 'function')
    return { estado: 'ERROR', detalle: 'api_dashboardDatos ausente' };
  var hP = Modelo_hoja(HOJAS.PACIENTES);
  var hE = Modelo_hoja(HOJAS.EVENTOS);
  if (!hP || !hE) return { estado: 'ERROR', detalle: 'Faltan hojas PACIENTES/EVENTOS' };
  var filasP = Math.max(hP.getLastRow() - 1, 0);
  var filasE = Math.max(hE.getLastRow() - 1, 0);
  if (filasP > 0) {
    var muestra = hP.getRange(2, 1, 1, 1).getValue(); // primera celda de datos legible
    if (!muestra && muestra !== '') return { estado: 'WARN', detalle: 'lectura de datos devolvió valor inválido' };
  }
  return { estado: 'OK',
           detalle: 'pacientes=' + filasP + ' · eventos=' + filasE +
                    ' (payload completo verificado por el Panel al abrirse)' };
}
function _pruS_validaciones() {
  var ss = Modelo_ss(), total = 0, con = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (!h || h.isSheetHidden()) return;
    total++;
    var col = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
    if (h.getLastRow() >= 2 && h.getRange(2, col).getDataValidation()) con++;
  });
  if (!total) return { estado: 'WARN', detalle: 'sin puertas INGRESO visibles' };
  return con === total
    ? { estado: 'OK', detalle: con + '/' + total + ' puertas validadas' }
    : { estado: 'WARN', detalle: con + '/' + total + ' — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_catalogos() {
  var h = Modelo_hoja('CAT_VIGENCIA_EXAMENES');
  if (!h) return { estado: 'ERROR', detalle: 'Hoja CAT_VIGENCIA_EXAMENES ausente' };
  var enc = (Utl_leerBloque(h)[0] || []).map(function (c) { return Utl_texto(c); });
  var esperados = _MODELO_HOJAS_DEF['CAT_VIGENCIA_EXAMENES'];
  var ok = esperados.every(function (e, i) { return enc[i] === e; });
  return ok
    ? { estado: 'OK', detalle: Math.max(h.getLastRow() - 1, 0) + ' exámenes configurados' }
    : { estado: 'ERROR', detalle: 'Encabezados incorrectos: ' + enc.join(',') };
}
function _pruS_formatos() {
  var h = Modelo_hoja(HOJAS.PACIENTES);
  if (!h || h.getLastRow() < 2) return { estado: 'WARN', detalle: 'PACIENTES sin datos' };
  var col = MODELO_PACIENTE.map(function (c) { return c.campo; })
            .indexOf('FECHA_ACTUALIZACION') + 1;
  var nf = h.getRange(2, col).getNumberFormat();
  return String(nf).indexOf('dd') !== -1
    ? { estado: 'OK', detalle: nf }
    : { estado: 'WARN', detalle: 'Formato actual "' + nf + '" — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_protecciones() {
  var n = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (k) {
    var h = Modelo_ss().getSheetByName(k);
    if (!h) return;
    n += h.getProtections(SpreadsheetApp.ProtectionType.RANGE)
          .filter(function (p) { return p.getDescription() === 'ECICEP-SISTEMA'; }).length;
  });
  return n >= 6
    ? { estado: 'OK', detalle: n + ' columnas del sistema marcadas' }
    : { estado: 'WARN', detalle: n + '/6 — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_remDatos() {
  var r = api_remLeer();
  return r.ok
    ? { estado: 'OK', detalle: 'filas=' + r.filas.length }
    : { estado: 'WARN', detalle: 'REM_NO_GENERADO — usa 🩺 Generar REM primero' };
}
function _pruS_pdf() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  if (typeof G.REM_exportarPdf !== 'function')
    return { estado: 'ERROR', detalle: 'REM_exportarPdf ausente' };
  return { estado: 'SKIP',
           detalle: 'Exportación manual: Consultar REM → Descargar PDF (evita archivos de prueba)' };
}
function _pruS_traza() {
  var d = Modelo_diagnosticoTrazabilidad();
  return d.conFuenteVacia === 0
    ? { estado: 'OK', detalle: d.total + ' pacientes con trazabilidad completa' }
    : { estado: 'WARN', detalle: d.conFuenteVacia + ' sin FUENTE (' +
        d.conFuenteVaciaRevisionFalse + ' cerradas sin origen)' };
}

// ===========================================================================
// 🏠 Panel de Control — agregadores puros (testeables)
// ===========================================================================

var PANEL_SECTORES = ['NARANJO', 'AMARILLO', 'VERDE'];

/** PURA: resumen por sector a partir de filas mínimas normalizadas.
 *  pacientes:[{sector,rev}] · eventos:[{tipo,sector,f}]
 *  Cobertura por volumen real (sin inventar importaciones):
 *  ≥50 Operativo · >0 Cobertura parcial · 0 Sin datos. */
function _panel_resumenSectores(pacientes, eventos, hoyIso) {
  var secs = {};
  PANEL_SECTORES.forEach(function (s) {
    secs[s] = { sector: s, pacientes: 0, ingresos7d: 0, porRevisar: 0, cobertura: 'SIN DATOS' };
  });
  var limite = '';
  if (hoyIso) {
    var d = new Date(+hoyIso.slice(0, 4), +hoyIso.slice(5, 7) - 1, +hoyIso.slice(8, 10));
    d.setDate(d.getDate() - 6); // ventana de 7 días incluyendo hoy
    limite = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
             '-' + String(d.getDate()).padStart(2, '0');
  }
  (pacientes || []).forEach(function (p) {
    var s = secs[Utl_texto(p.sector).toUpperCase()];
    if (!s) return;
    s.pacientes++;
    if (p.rev === true || p.rev === 'TRUE') s.porRevisar++;
  });
  (eventos || []).forEach(function (e) {
    var s = secs[Utl_texto(e.sector).toUpperCase()];
    if (!s) return;
    if (Utl_texto(e.tipo).toUpperCase() === 'INGRESO' && limite &&
        Utl_texto(e.f) >= limite && Utl_texto(e.f) <= hoyIso) s.ingresos7d++;
  });
  Object.keys(secs).forEach(function (k) {
    var s = secs[k];
    s.cobertura = s.pacientes >= 50 ? 'Operativo'
                : s.pacientes > 0 ? 'Cobertura parcial' : 'Sin datos';
  });
  return PANEL_SECTORES.map(function (k) { return secs[k]; });
}

/** PURA: cantidad de pacientes con estratificación pendiente (vacío/'G'). */
function _panel_estratPendiente(filas) {
  return (filas || []).filter(function (e) {
    var t = Utl_texto(e.est !== undefined ? e.est : e.ESTRATIFICACION).trim().toUpperCase();
    return t === '' || t === 'G';
  }).length;
}

/** PURA: iniciales discretas para actividad reciente (sin nombre completo). */
function _panel_iniciales(nombre) {
  return Utl_texto(nombre).trim().split(/\s+/).slice(0, 2)
    .map(function (w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ');
}


/** Consistencia transversal entre sectores (#5): conteos, duplicados por RUT,
 *  pacientes sin sector y pendientes de importación Amarillo. */
function _pruS_consistencia() {
  var pacientes = Modelo_leerPacientes();
  var porSector = {}, sinSector = 0, dups = {};
  var vistos = {};
  pacientes.forEach(function (p) {
    var s = Utl_texto(p.SECTOR).toUpperCase() || '(SIN SECTOR)';
    porSector[s] = (porSector[s] || 0) + 1;
    if (s === '(SIN SECTOR)') sinSector++;
    var rut = Utl_texto(p.RUT).toUpperCase();
    if (rut && vistos[rut]) dups[rut] = (dups[rut] || 0) + 1;
    vistos[rut] = true;
  });
  var detalle = Object.keys(porSector).sort().map(function (s) {
    return s + ': ' + porSector[s];
  }).join(' · ');
  var nDup = Object.keys(dups).length;
  if (nDup) return { estado: 'ERROR',
    detalle: detalle + ' · ' + nDup + ' RUT duplicados: ' + Object.keys(dups).slice(0, 3).join(', ') };
  if (sinSector) return { estado: 'WARN',
    detalle: detalle + ' · ' + sinSector + ' sin sector' };
  var amarillo = porSector['AMARILLO'] || 0;
  var extra = amarillo < 100 ? ' · ⚠ Sector Amarillo con ' + amarillo +
    ' registros (fuente de 1.091 pendiente de importar)' : '';
  return { estado: amarillo < 100 ? 'WARN' : 'OK',
           detalle: detalle + extra };
}


/** Auditoría de calidad como prueba del Centro: WARN si hay problemas. */
function _pruS_calidad() {
  var a = Calidad_auditarTodo();
  if (a.conProblemas === 0)
    return { estado: 'OK', detalle: a.totalPacientes + ' pacientes · ' +
      a.totalEventos + ' eventos sin problemas de calidad' };
  return { estado: a.resumenTipos['RUT_INVALIDO'] || a.resumenTipos['EVENTO_HUERFANO']
             ? 'ERROR' : 'WARN',
           detalle: a.conProblemas + ' entidades con problemas: ' +
             Object.keys(a.resumenTipos).map(function (k) {
               return k + '=' + a.resumenTipos[k]; }).join(' · ') +
             ' — usa Herramientas → Auditar calidad y sincronizar Cola' };
}