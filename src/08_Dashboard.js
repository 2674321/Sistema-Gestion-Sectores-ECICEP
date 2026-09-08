/**
 * Sistema ECICEP — 08_Dashboard
 * Dashboard base sobre PACIENTES + EVENTOS (nunca SECTOR_* como fuente).
 * Solo contiene funciones PURAS: la UI las consume vía api_dashboardDatos
 * (07_UI.js) y Dashboard.html. La capa legacy que escribía una hoja DASHBOARD
 * fue retirada en S9 (la hoja residual se conserva como tal).
 *
 * Módulo deliberadamente sin acceso a SpreadsheetApp: 100% testeable en node.
 */

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

/** PURA: normaliza cualquier valor de fecha a formato ISO yyyy-mm-dd. */
function Dash_fechaIso(v) {
  if (v instanceof Date) {
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  var s = Utl_texto(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return Utl_texto(v); // devolver tal cual si no es reconocible
}

/**
 * PURA: filtra eventos por rango de fechas y sector.
 */
function Dash_filtrarEventos(eventos, desdeIso, hastaIso, sector) {
  return (eventos || []).filter(function (e) {
    var f = Dash_fechaIso(e.FECHA_EVENTO);
    if (!f) return false; // sin fecha → excluido del análisis temporal
    if (f < desdeIso) return false;
    if (f > hastaIso) return false;
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
    var f = Dash_fechaIso(e.FECHA_EVENTO);
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
 * G1/G2/G3 = niveles definidos. G/null/vacío = PENDIENTE (nunca un nivel).
 * @returns {porSector:{NARANJO:n,...}, matrizG:{NARANJO:{G1:n,G2:n,G3:n,PENDIENTE:n},...}, total:n}
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
    if (/^G[123]$/.test(g)) {
      matrizG[s][g] = (matrizG[s][g] || 0) + 1;
    } else {
      // 'G', null, vacío, NSP → PENDIENTE (jamás se cuenta como nivel)
      matrizG[s]['PENDIENTE'] = (matrizG[s]['PENDIENTE'] || 0) + 1;
    }
  });
  return { porSector: porSector, matrizG: matrizG, total: total };
}
