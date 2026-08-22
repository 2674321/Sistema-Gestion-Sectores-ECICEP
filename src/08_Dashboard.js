/**
 * Sistema ECICEP Unificado — 08_Dashboard
 * Dashboard base sobre PACIENTES + EVENTOS (nunca SECTOR_* como fuente).
 * Filtros dinámicos sin código: DESDE/HASTA/SECTOR en celdas identificadas.
 * Agregación batch en memoria → escritura de valores → trazabilidad por detalle.
 */

var _DASH_FILTROS = {
  FILA_DESDE: 2, COL_DESDE: 2,
  FILA_HASTA: 3, COL_HASTA: 2,
  FILA_SECTOR: 4, COL_SECTOR: 2,
  SECTORES: ['TODOS', 'NARANJO', 'AMARILLO', 'VERDE']
};

/** PURA: resuelve fechas inicio/fin según tipo de período seleccionado. */
function Dash_resolverPeriodo(tipo, desdeStr, hastaStr) {
  var hoy = new Date();
  function fmt(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
  }
  function inicioMes(mesesAtras) {
    var d = new Date(hoy.getFullYear(), hoy.getMonth() - (mesesAtras||0), 1);
    return fmt(d);
  }
  function finHoy() { return fmt(hoy); }

  switch ((tipo || '').toUpperCase()) {
    case 'MES ACTUAL':
      return { desde: inicioMes(0), hasta: finHoy() };
    case 'MES ANTERIOR': {
      var ini = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1);
      var fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: fmt(ini), hasta: fmt(fin) };
    }
    case 'ÚLTIMOS 3 MESES': return { desde: inicioMes(2), hasta: finHoy() };
    case 'ÚLTIMOS 6 MESES': return { desde: inicioMes(5), hasta: finHoy() };
    case 'AÑO ACTUAL': return { desde: hoy.getFullYear()+'-01-01', hasta: finHoy() };
    case 'AÑO A LA FECHA': return { desde: hoy.getFullYear()+'-01-01', hasta: finHoy() };
    case 'PERSONALIZADO': return { desde: desdeStr || '2026-01-01', hasta: hastaStr || finHoy() };
    default: return { desde: inicioMes(0), hasta: finHoy() };
  }
}

/**
 * PURA: filtra eventos por rango de fechas y sector.
 */
function Dash_filtrarEventos(eventos, desdeIso, hastaIso, sector) {
  return (eventos || []).filter(function (e) {
    var f = Utl_texto(e.FECHA_EVENTO);
    if (f && f < desdeIso) return false;
    if (f && f > hastaIso) return false;
    if (sector && sector !== 'TODOS' && Utl_texto(e.SECTOR).toUpperCase() !== sector.toUpperCase()) return false;
    return true;
  });
}

/**
 * PURA: agrega actividad por tipo de evento dentro del período.
 * @returns {INGRESO:n, CONTROL:n, SEGUIMIENTO:n, PLAN_CUIDADO:n, ...}
 */
function Dash_agregarActividad(eventosFiltrados) {
  var conteo = {};
  (eventosFiltrados || []).forEach(function (e) {
    var t = Utl_texto(e.TIPO_EVENTO) || 'SIN_TIPO';
    conteo[t] = (conteo[t] || 0) + 1;
  });
  return conteo;
}

/**
 * PURA: actividad mensual dentro del período.
 * @returns [{mes:'2026-03', INGRESO:n, CONTROL:n, ...}]
 */
function Dash_actividadMensual(eventosFiltrados, desdeIso, hastaIso) {
  var meses = {};
  (eventosFiltrados || []).forEach(function (e) {
    var f = Utl_texto(e.FECHA_EVENTO);
    if (!f || f.length < 7) return;
    var mes = f.substring(0, 7);
    if (!meses[mes]) meses[mes] = {};
    var t = Utl_texto(e.TIPO_EVENTO) || 'OTRO';
    meses[mes][t] = (meses[mes][t] || 0) + 1;
  });
  return Object.keys(meses).sort().map(function (mes) {
    var fila = { mes: mes };
    TIPOS_EVENTO.VALIDOS.forEach(function (t) { fila[t] = meses[mes][t] || 0; });
    return fila;
  });
}

/**
 * PURA: métricas de calidad de datos desde PACIENTES.
 */
function Dash_calidadDatos(pacientes) {
  var sinRut = 0, rutInvalido = 0, sinSector = 0, sinEstrat = 0, requiereRev = 0;
  (pacientes || []).forEach(function (p) {
    if (Utl_vacio(p.RUT)) sinRut++;
    else if (p.RUT_DV_VALIDO === false || p.RUT_SIN_DV === true) rutInvalido++;
    if (Utl_vacio(p.SECTOR)) sinSector++;
    if (Utl_vacio(p.ESTRATIFICACION)) sinEstrat++;
    if (p.REQUIERE_REVISION === true) requiereRev++;
  });
  return { sinRut: sinRut, rutInvalido: rutInvalido, sinSector: sinSector,
           estratPendiente: sinEstrat, requiereRevision: requiereRev };
}

/**
 * PURA: distribución de pacientes por sector y estratificación.
 * @returns {porSector:{NARANJO:n,...}, matrizG:{NARANJO:{G1:n,G2:n,G3:n},...}, total:n}
 */
function Dash_distribucionPacientes(pacientes, sector) {
  var porSector = {}, matrizG = {}, total = 0;
  (pacientes || []).forEach(function (p) {
    var s = Utl_texto(p.SECTOR).toUpperCase();
    if (sector && sector !== 'TODOS' && s !== sector.toUpperCase()) return;
    total++;
    porSector[s] = (porSector[s] || 0) + 1;
    if (!matrizG[s]) matrizG[s] = {};
    var g = Utl_texto(p.ESTRATIFICACION).toUpperCase();
    if (/^G[123]$/.test(g)) matrizG[s][g] = (matrizG[s][g] || 0) + 1;
  });
  return { porSector: porSector, matrizG: matrizG, total: total };
}

/**
 * ORQUESTADOR: actualiza la hoja DASHBOARD con los filtros actuales.
 * Lee filtros de celdas, hace batch reads, agrega en memoria, escribe valores.
 * Menú: 📈 Reportes → 🔄 Actualizar dashboard
 */
function Dash_actualizar() {
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName('DASHBOARD');
  if (!hoja) hoja = ss.insertSheet('DASHBOARD');
  ss.setActiveSheet(hoja);

  // leer filtros de las celdas
  var tipo = Utl_texto(hoja.getRange(_DASH_FILTROS.FILA_DESDE ? 1 : 1, 1).getValue());
  // simplificación: leer de celdas fijas
  var b1 = hoja.getRange(1, 1, 6, 4).getValues();
  var tipoPeriodo = Utl_texto(b1[1][1]).trim();  // fila 2: Tipo de período
  var desdeCustom = Utl_texto(b1[2][1]).trim();  // fila 3: Fecha desde
  var hastaCustom = Utl_texto(b1[3][1]).trim();  // fila 4: Fecha hasta
  var sectorSel   = Utl_texto(b1[4][1]).trim();  // fila 5: Sector

  if (!tipoPeriodo) {
    _dash_inicializarFiltros(hoja);
    return { ok: false, motivo: 'DASHBOARD_INICIALIZADO — configura los filtros y vuelve a ejecutar.' };
  }
  if (tipoPeriodo === 'TIPO DE PERÍODO ▼') {
    _dash_inicializarFiltros(hoja);
    return { ok: false, motivo: 'CONFIGURA LOS FILTROS PRIMERO.' };
  }

  var periodo = Dash_resolverPeriodo(tipoPeriodo, desdeCustom, hastaCustom);
  var sector = sectorSel || 'TODOS';

  // batch reads
  var pacientes = Modelo_leerPacientes();
  var eventos = Modelo_leerEventos();
  var evFiltrados = Dash_filtrarEventos(eventos, periodo.desde, periodo.hasta, sector === 'TODOS' ? null : sector);

  // agregaciones en memoria
  var actividad = Dash_agregarActividad(evFiltrados);
  var mensual = Dash_actividadMensual(evFiltrados, periodo.desde, periodo.hasta);
  var distPac = Dash_distribucionPacientes(pacientes, sector === 'TODOS' ? null : sector);
  var calidad = Dash_calidadDatos(pacientes);

  // escribir resultados como VALORES (no fórmulas)
  var filaEscritura = 7; // después del bloque de filtros
  var bloques = [];

  bloques.push(['', '', '', '']);
  bloques.push(['── ACTIVIDAD EN PERÍODO ──', periodo.desde + ' → ' + periodo.hasta, '', '']);
  TIPOS_EVENTO.VALIDOS.forEach(function (t) {
    if (actividad[t]) bloques.push([t, actividad[t], '', '']);
  });

  bloques.push(['', '', '', '']);
  bloques.push(['── DISTRIBUCIÓN PACIENTES ──', '', '', '']);
  bloques.push(['SECTOR', 'TOTAL', 'G1', 'G2', 'G3']);
  Object.keys(distPac.matrizG).sort().forEach(function (s) {
    var mg = distPac.matrizG[s];
    bloques.push([s, distPac.porSector[s] || 0, mg['G1'] || 0, mg['G2'] || 0, mg['G3'] || 0]);
  });
  bloques.push(['TOTAL', distPac.total,
    Object.values(distPac.matrizG).reduce(function(a,m){return a+(m.G1||0);},0),
    Object.values(distPac.matrizG).reduce(function(a,m){return a+(m.G2||0);},0),
    Object.values(distPac.matrizG).reduce(function(a,m){return a+(m.G3||0);},0)]);

  bloques.push(['', '', '', '']);
  bloques.push(['── ACTIVIDAD MENSUAL ──', '', '', '']);
  bloques.push(['MES','INGRESO','CONTROL','SEGUIMIENTO','PLAN_CUIDADO']);
  mensual.forEach(function (m) {
    bloques.push([m.mes, m['INGRESO']||0, m['CONTROL']||0, m['SEGUIMIENTO']||0, m['PLAN_CUIDADO']||0]);
  });

  bloques.push(['', '', '', '']);
  bloques.push(['── CALIDAD DE DATOS ──', '', '', '']);
  bloques.push(['Sin RUT', calidad.sinRut, '', '']);
  bloques.push(['RUT inválido/sin DV', calidad.rutInvalido, '', '']);
  bloques.push(['Sin sector', calidad.sinSector, '', '']);
  bloques.push(['Estratificación pendiente', calidad.estratPendiente, '', '']);
  bloques.push(['Requiere revisión', calidad.requiereRevision, '', '']);

  // limpiar área de resultados y escribir
  hoja.getRange(filaEscritura, 1, Math.max(hoja.getMaxRows() - filaEscritura, 1), 5).clearContent();
  // normalizar todas las filas a exactamente 5 columnas
  var bloquesNorm = bloques.map(function (fila) {
    while (fila.length < 5) fila.push('');
    return fila.slice(0, 5);
  });
  Utl_escribirBloque(hoja, filaEscritura, 1, bloquesNorm);

  Log_info('Dashboard', 'actualizar', JSON.stringify({
    periodo: periodo.desde+'→'+periodo.hasta, sector: sector,
    eventos: evFiltrados.length, pacientes: distPac.total }));
  Log_flush();

  return { ok: true, periodo: periodo, sector: sector,
           actividad: actividad, distribucion: distPac, calidad: calidad };
}

/** Inicializa los filtros si la hoja está vacía o mal configurada. */
function _dash_inicializarFiltros(hoja) {
  hoja.getRange(1, 1, 5, 4).clearContent();
  var encabezados = [
    ['FILTRO', 'VALOR'],
    ['Tipo de período', 'MES ACTUAL'],
    ['Fecha desde (si PERSONALIZADO)', ''],
    ['Fecha hasta (si PERSONALIZADO)', ''],
    ['Sector', 'TODOS']
  ];
  Utl_escribirBloque(hoja, 1, 1, encabezados);
  hoja.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#0b5394').setFontColor('#ffffff');

  // validación de datos para Tipo de período y Sector
  var tiposPermitidos = ['MES ACTUAL','MES ANTERIOR','ÚLTIMOS 3 MESES','ÚLTIMOS 6 MESES','AÑO ACTUAL','AÑO A LA FECHA','PERSONALIZADO'];
  var reglaTipo = SpreadsheetApp.newDataValidation().requireValueInList(tiposPermitidos, true).build();
  hoja.getRange(2, 2).setDataValidation(reglaTipo);
  var sectoresValidos = _DASH_FILTROS.SECTORES;
  var reglaSector = SpreadsheetApp.newDataValidation().requireValueInList(sectoresValidos, true).build();
  hoja.getRange(5, 2).setDataValidation(reglaSector);
}

function UI_actualizarDashboard() {
  var r = Utl_medir(Dash_actualizar);
  if (r.resultado.ok) {
    Log_info('UI', 'dashboard', JSON.stringify(r.resultado.periodo));
    Log_flush();
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Dashboard actualizado (' + r.ms + ' ms)', 'ECICEP 📊', 8);
  } else {
    SpreadsheetApp.getUi().alert(r.resultado.motivo);
  }
}
