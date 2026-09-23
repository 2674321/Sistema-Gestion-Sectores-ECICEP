/**
 * Integridad y estado de salud ECICEP v0.11.0.
 * Diagnostica sin PII y repara únicamente derivados respaldados por evidencia.
 */

function Integridad_diagnosticarDerivados_() {
  var pacientes = Modelo_leerPacientesCampos(['ID_INTERNO', 'SECTOR', 'ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO',
    'CONDICIONES', 'ESTRATIFICACION']);
  var eventos = Modelo_leerEventosCampos(['ID_INTERNO', 'TIPO_EVENTO', 'FECHA_EVENTO']);
  var porId = {}, maximos = {};
  pacientes.forEach(function (p) { if (p.ID_INTERNO) porId[Utl_texto(p.ID_INTERNO)] = p; });
  var eventosHuerfanos = 0;
  eventos.forEach(function (e) {
    var id = Utl_texto(e.ID_INTERNO);
    if (!id || !porId[id]) { eventosHuerfanos++; return; }
    var tipo = Utl_texto(e.TIPO_EVENTO).toUpperCase();
    if (tipo !== 'CONTROL' && tipo !== 'SEGUIMIENTO') return;
    var fecha = Control_aIso(e.FECHA_EVENTO);
    if (!fecha) return;
    if (!maximos[id]) maximos[id] = { CONTROL: '', SEGUIMIENTO: '' };
    if (fecha > maximos[id][tipo]) maximos[id][tipo] = fecha;
  });
  var cachesPendientes = 0;
  pacientes.forEach(function (p) {
    var m = maximos[Utl_texto(p.ID_INTERNO)] || { CONTROL: '', SEGUIMIENTO: '' };
    if (Control_aIso(p.ULTIMO_CONTROL) !== m.CONTROL ||
        Control_aIso(p.ULTIMO_SEGUIMIENTO) !== m.SEGUIMIENTO) cachesPendientes++;
  });
  var ingresos = { conteos: { INGRESADO_FALSO: 0, INCONSISTENTE: 0, DERIVADO_DESACTUALIZADO: 0 } };
  try { ingresos = Ingresos_diagnosticarIngresados_(); } catch (eI) { ingresos.error = true; }
  var vistas = { pendientes: ingresos.conteos.DERIVADO_DESACTUALIZADO || 0, omitida: true };
  if (typeof SpreadsheetApp !== 'undefined') {
    try { vistas = Integridad_diagnosticarVistas_(pacientes); }
    catch (eV) { vistas = { pendientes: 0, error: true }; }
  }
  var estratificacionPendiente = 0;
  if (typeof CFG_ESTRATIFICACION !== 'undefined' && CFG_ESTRATIFICACION.REGLA_DISPONIBLE &&
      typeof Estrat_evaluar === 'function') {
    pacientes.forEach(function (p) {
      var evaluada = Estrat_evaluar(p.CONDICIONES, CATALOGO_CONDICIONES_ECICEP, CFG_ESTRATIFICACION);
      if (evaluada.estado === 'CALCULADO' &&
          Utl_texto(evaluada.resultado).toUpperCase() !== Utl_texto(p.ESTRATIFICACION).toUpperCase()) {
        estratificacionPendiente++;
      }
    });
  }
  var vistasPendientes = Math.max(vistas.pendientes || 0,
    ingresos.conteos.DERIVADO_DESACTUALIZADO || 0);
  return {
    ok: !ingresos.error && !vistas.error && eventosHuerfanos === 0 && cachesPendientes === 0 &&
      (ingresos.conteos.INGRESADO_FALSO || 0) === 0 &&
      (ingresos.conteos.INCONSISTENTE || 0) === 0 &&
      vistasPendientes === 0 && estratificacionPendiente === 0,
    pacientes: pacientes.length, eventos: eventos.length,
    eventosHuerfanos: eventosHuerfanos, cachesPendientes: cachesPendientes,
    ingresosFalsos: ingresos.conteos.INGRESADO_FALSO || 0,
    ingresosInconsistentes: ingresos.conteos.INCONSISTENTE || 0,
    vistasPendientes: vistasPendientes,
    estratificacionPendiente: estratificacionPendiente,
    vistas: vistas,
    ingresos: ingresos
  };
}

/** Compara la pertenencia de todos los pacientes con las vistas SECTOR_*.
 *  Solo entrega conteos e IDs técnicos internos; nunca RUT, nombre ni contacto. */
function Integridad_diagnosticarVistas_(pacientes) {
  var ss = Modelo_ss(), porSector = {}, inconsistentes = {};
  HOJAS_SECTOR.forEach(function (nombre) {
    var sector = nombre.replace('SECTOR_', ''), ids = {};
    porSector[sector] = ids;
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) return;
    var ini = Modelo_dataStartRow(nombre), n = hoja.getLastRow() - ini + 1;
    var col = COLUMNAS_SECTOR_VISTA.indexOf('ID_INTERNO') + 1;
    if (n <= 0 || col <= 0) return;
    hoja.getRange(ini, col, n, 1).getValues().forEach(function (fila) {
      var id = Utl_texto(fila[0]);
      if (id) ids[id] = true;
    });
  });
  (pacientes || []).forEach(function (p) {
    var id = Utl_texto(p.ID_INTERNO), sector = Utl_texto(p.SECTOR).toUpperCase();
    if (!id || !porSector[sector] || !porSector[sector][id]) inconsistentes[id || 'SIN_ID'] = true;
    Object.keys(porSector).forEach(function (s) {
      if (s !== sector && id && porSector[s][id]) inconsistentes[id] = true;
    });
  });
  return { pendientes: Object.keys(inconsistentes).length, omitida: false };
}

function Integridad_repararDerivados_(opciones) {
  opciones = opciones || {};
  var reparar = function () {
    var antes = Integridad_diagnosticarDerivados_();
    var ingresos = Ingresos_reconciliarIngresados_({ reparar: true,
      confirmarNuevo: opciones.confirmarNuevo === true, bajoLock: true });
    var estratificacion = null;
    if (typeof CFG_ESTRATIFICACION !== 'undefined' && CFG_ESTRATIFICACION.REGLA_DISPONIBLE &&
        typeof Estrat_recalcularTodos_ === 'function') estratificacion = Estrat_recalcularTodos_();
    var controles = Control_recalcularTodos();
    var vistas = null;
    try { vistas = Modelo_refrescarVistasSectores_(); } catch (eV) { vistas = { error: true }; }
    var despues = Integridad_diagnosticarDerivados_();
    return { ok: despues.ok, antes: antes, despues: despues,
      ingresos: ingresos, estratificacion: estratificacion, controles: controles, vistas: vistas };
  };
  return opciones.bajoLock ? reparar() : Ecicep_conLock_(reparar);
}

function Sistema_estadoSalud_() {
  var ss = Modelo_ss();
  var hojasIngreso = 0, hojasSector = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (n) {
    if (n === 'INGRESO_NARANJA') return;
    if (ss.getSheetByName(n)) hojasIngreso++;
  });
  HOJAS_SECTOR.forEach(function (n) { if (ss.getSheetByName(n)) hojasSector++; });
  var integridad = Integridad_diagnosticarDerivados_();
  var triggerIngreso = Triggers_diagnosticarIngresoOnEdit_();
  var backup = false;
  try { backup = Backup_triggerInstalado(); } catch (eB) { backup = false; }
  return {
    ok: !!ss.getSheetByName(HOJAS.PACIENTES) && !!ss.getSheetByName(HOJAS.EVENTOS) && integridad.ok,
    version: ECICEP.VERSION, schema: SISTEMA_VERSION_SCHEMA_ACTUAL,
    hojas: { pacientes: !!ss.getSheetByName(HOJAS.PACIENTES),
      eventos: !!ss.getSheetByName(HOJAS.EVENTOS), ingresos: hojasIngreso, sectores: hojasSector },
    integridad: { ingresosFalsos: integridad.ingresosFalsos,
      eventosHuerfanos: integridad.eventosHuerfanos,
      vistasPendientes: integridad.vistasPendientes,
      cachesPendientes: integridad.cachesPendientes },
    triggers: { ingresoOnEdit: triggerIngreso.estado === 'OK', backup: backup }
  };
}
