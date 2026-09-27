/** Integridad y estado operativo ECICEP v0.11.1. Sin persistir PII. */
var SISTEMA_AUDITORIA_PROP = 'ECICEP_ULTIMA_AUDITORIA_V0111';
var _SISTEMA_AUDITORIA_MEMO = null;

function Sistema_propiedades_() {
  try { return typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties
    ? PropertiesService.getScriptProperties() : null; } catch (e) { return null; }
}
function Sistema_ultimaAuditoria_() {
  var raw = null, props = Sistema_propiedades_();
  try { raw = props && props.getProperty(SISTEMA_AUDITORIA_PROP); } catch (e) {}
  if (!raw && _SISTEMA_AUDITORIA_MEMO) return _SISTEMA_AUDITORIA_MEMO;
  try { return raw ? JSON.parse(raw) : null; } catch (e2) { return null; }
}
function Sistema_guardarAuditoria_(d) {
  d = d || {};
  var r = { fecha: new Date().toISOString(), stale: false, ok: d.ok === true,
    derivadosOk: d.derivadosOk === true, evidenciaSoloReporte: d.evidenciaSoloReporte === true,
    pacientes: Number(d.pacientes || 0), eventos: Number(d.eventos || 0),
    eventosHuerfanos: Number(d.eventosHuerfanos || 0), cachesPendientes: Number(d.cachesPendientes || 0),
    ingresosFalsos: Number(d.ingresosFalsos || 0), ingresosInconsistentes: Number(d.ingresosInconsistentes || 0),
    vistasPendientes: Number(d.vistasPendientes || 0), estratificacionPendiente: Number(d.estratificacionPendiente || 0),
    pacientesSinSector: Number(d.pacientesSinSector || 0),
    captureIdsDuplicados: Number(d.captureIdsDuplicados || 0), fuentesDuplicadas: Number(d.fuentesDuplicadas || 0),
    sectoresAfectados: (d.vistas && d.vistas.sectoresAfectados || []).slice() };
  _SISTEMA_AUDITORIA_MEMO = r;
  var props = Sistema_propiedades_();
  try { if (props) props.setProperty(SISTEMA_AUDITORIA_PROP, JSON.stringify(r)); } catch (e) {}
  return r;
}
function Sistema_marcarAuditoriaStale_() {
  var r = Sistema_ultimaAuditoria_();
  if (!r || r.stale) return;
  r.stale = true; r.invalidada = new Date().toISOString(); _SISTEMA_AUDITORIA_MEMO = r;
  var props = Sistema_propiedades_();
  try { if (props) props.setProperty(SISTEMA_AUDITORIA_PROP, JSON.stringify(r)); } catch (e) {}
}

function Integridad_snapshotDerivados_() {
  var pacientes = Modelo_leerPacientesCampos(['ID_INTERNO', 'SECTOR', 'ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO',
    'CONDICIONES', 'ESTRATIFICACION']);
  var eventos = Modelo_leerEventosCampos(['ID_EVENTO', 'ID_INTERNO', 'TIPO_EVENTO', 'FECHA_EVENTO', 'FUENTE']);
  var vistasPorSector = {};
  if (typeof SpreadsheetApp !== 'undefined') HOJAS_SECTOR.forEach(function (nombre) {
    var sector = nombre.replace('SECTOR_', ''), ids = {}, hoja = Modelo_ss().getSheetByName(nombre);
    if (hoja) {
      var ini = Modelo_dataStartRow(nombre), n = hoja.getLastRow() - ini + 1;
      var col = COLUMNAS_SECTOR_VISTA.indexOf('ID_INTERNO') + 1;
      if (n > 0 && col > 0) hoja.getRange(ini, col, n, 1).getValues().forEach(function (f) {
        var id = Utl_texto(f[0]); if (id) ids[id] = true;
      });
    }
    vistasPorSector[sector] = ids;
  });
  return { pacientes: pacientes, eventos: eventos, vistasPorSector: vistasPorSector };
}

function Integridad_diagnosticarDerivados_(snapshot) {
  snapshot = snapshot || Integridad_snapshotDerivados_();
  var pacientes = snapshot.pacientes, eventos = snapshot.eventos;
  var porId = {}, fuentes = {};
  pacientes.forEach(function (p) { if (p.ID_INTERNO) porId[Utl_texto(p.ID_INTERNO)] = p; });
  var eventosHuerfanos = 0, fuentesDuplicadas = 0;
  eventos.forEach(function (e) {
    var fuente = Utl_texto(e.FUENTE);
    if (fuente.indexOf('FORM|') === 0 || fuente.indexOf('HOJA_INGRESO|') === 0)
      fuentes[fuente] = (fuentes[fuente] || 0) + 1;
    var id = Utl_texto(e.ID_INTERNO);
    if (!id || !porId[id]) { eventosHuerfanos++; }
  });
  Object.keys(fuentes).forEach(function (f) { if (fuentes[f] > 1) fuentesDuplicadas++; });
  var maximos = Control_maximosEventoPorPaciente_(eventos);
  var cachesPendientes = 0;
  pacientes.forEach(function (p) {
    var m = maximos[Utl_texto(p.ID_INTERNO)] || { CONTROL: '', SEGUIMIENTO: '' };
    if (Control_aIso(p.ULTIMO_CONTROL) !== m.CONTROL || Control_aIso(p.ULTIMO_SEGUIMIENTO) !== m.SEGUIMIENTO)
      cachesPendientes++;
  });
  var ingresos = { errores: 0, conteos: { INGRESADO_FALSO: 0, INCONSISTENTE: 0, DERIVADO_DESACTUALIZADO: 0 } };
  try { ingresos = Ingresos_diagnosticarIngresados_(snapshot); } catch (eI) { ingresos.error = true; }
  var vistas = { pendientes: ingresos.conteos.DERIVADO_DESACTUALIZADO || 0, sectoresAfectados: [], omitida: true, sinSector: 0 };
  if (typeof SpreadsheetApp !== 'undefined') {
    try { vistas = Integridad_diagnosticarVistas_(pacientes, snapshot.vistasPorSector); }
    catch (eV) { vistas = { pendientes: 0, sectoresAfectados: [], error: true, sinSector: 0 }; }
  }
  // DERIVADOS de filas INGRESADO: solo bloquean los RENOVABLES (el sector tiene
  // vista para regenerar). Filas cuyo paciente no tiene sector asignado son
  // estado clínico (solo reporte): no hay vista derivable que reparar.
  var ingresosRenovables = 0, ingresosSinSector = 0;
  if (ingresos && !ingresos.error && Array.isArray(ingresos.casos)) {
    ingresos.casos.forEach(function (caso) {
      if (caso.clasificacion !== 'DERIVADO_DESACTUALIZADO') return;
      if (HOJAS_SECTOR.indexOf('SECTOR_' + Utl_texto(caso.sector).toUpperCase()) >= 0) ingresosRenovables++;
      else ingresosSinSector++;
    });
  } else if (ingresos && !ingresos.error) {
    ingresosRenovables = ingresos.conteos.DERIVADO_DESACTUALIZADO || 0;
  }
  var estratificacionPendiente = 0;
  if (typeof CFG_ESTRATIFICACION !== 'undefined' && CFG_ESTRATIFICACION.REGLA_DISPONIBLE &&
      typeof Estrat_evaluar === 'function') pacientes.forEach(function (p) {
    var ev = Estrat_evaluar(p.CONDICIONES, CATALOGO_CONDICIONES_ECICEP, CFG_ESTRATIFICACION);
    if (ev.estado === 'CALCULADO' && Utl_texto(ev.resultado).toUpperCase() !==
        Utl_texto(p.ESTRATIFICACION).toUpperCase()) estratificacionPendiente++;
  });
  var captura = { duplicados: 0 };
  try { captura = Captura_diagnosticarCaptureIdsDuplicados_(); } catch (eC) { captura.error = true; }
  var vistasPendientes = Math.max(vistas.pendientes || 0, ingresosRenovables);
  var pacientesSinSector = Math.max(vistas.sinSector || 0, ingresosSinSector);
  var derivadosOk = !ingresos.error && !vistas.error && !captura.error &&
      cachesPendientes === 0 &&
      (ingresos.conteos.INGRESADO_FALSO || 0) === 0 && (ingresos.conteos.INCONSISTENTE || 0) === 0 &&
      vistasPendientes === 0 && estratificacionPendiente === 0;
  var evidenciaSoloReporte = eventosHuerfanos > 0 || fuentesDuplicadas > 0 || (captura.duplicados || 0) > 0 ||
      pacientesSinSector > 0;
  return { ok: derivadosOk && !evidenciaSoloReporte,
    derivadosOk: derivadosOk, evidenciaSoloReporte: evidenciaSoloReporte,
    pacientes: pacientes.length, eventos: eventos.length, eventosHuerfanos: eventosHuerfanos,
    cachesPendientes: cachesPendientes, ingresosFalsos: ingresos.conteos.INGRESADO_FALSO || 0,
    ingresosInconsistentes: ingresos.conteos.INCONSISTENTE || 0, vistasPendientes: vistasPendientes,
    estratificacionPendiente: estratificacionPendiente, captureIdsDuplicados: captura.duplicados || 0,
    fuentesDuplicadas: fuentesDuplicadas, pacientesSinSector: pacientesSinSector,
    captura: captura, vistas: vistas, ingresos: ingresos };
}

function Integridad_diagnosticarVistas_(pacientes, vistasPorSector) {
  var ss = Modelo_ss(), porSector = {}, inconsistentes = {}, afectados = {}, sinSector = {};
  HOJAS_SECTOR.forEach(function (nombre) {
    var sector = nombre.replace('SECTOR_', ''), ids = vistasPorSector && vistasPorSector[sector];
    if (ids) { porSector[sector] = ids; return; }
    ids = {}; porSector[sector] = ids;
    var hoja = ss.getSheetByName(nombre); if (!hoja) { afectados[sector] = true; return; }
    var ini = Modelo_dataStartRow(nombre), n = hoja.getLastRow() - ini + 1;
    var col = COLUMNAS_SECTOR_VISTA.indexOf('ID_INTERNO') + 1;
    if (n <= 0 || col <= 0) return;
    hoja.getRange(ini, col, n, 1).getValues().forEach(function (fila) {
      var id = Utl_texto(fila[0]); if (id) ids[id] = true;
    });
  });
  (pacientes || []).forEach(function (p) {
    var id = Utl_texto(p.ID_INTERNO), sector = Utl_texto(p.SECTOR).toUpperCase();
    if (!id) return;
    // Sin sector (vacío, MULTIPLE u otro no cartografiado): estado clínico de
    // reporte, no regenerable por la vista sectorial (no existe SECTOR_*).
    if (!porSector[sector]) { if (sector) afectados[sector] = true; sinSector[id] = true; return; }
    if (!porSector[sector][id]) { inconsistentes[id] = true; if (sector) afectados[sector] = true; }
    Object.keys(porSector).forEach(function (s) {
      if (s !== sector && id && porSector[s][id]) {
        inconsistentes[id] = true; afectados[s] = true; if (sector) afectados[sector] = true;
      }
    });
  });
  return { pendientes: Object.keys(inconsistentes).length, sinSector: Object.keys(sinSector).length,
    sectoresAfectados: Object.keys(afectados).sort(), omitida: false };
}

function Integridad_repararDerivados_(opciones) {
  opciones = opciones || {};
  var reparar = function () {
    var snapshot = Integridad_snapshotDerivados_();
    var antes = Integridad_diagnosticarDerivados_(snapshot), acciones = [], resultado = {};
    if (antes.ingresosFalsos || antes.ingresosInconsistentes || antes.vistasPendientes) {
      resultado.ingresos = Ingresos_reconciliarIngresados_({ reparar: true,
        confirmarNuevo: opciones.confirmarNuevo === true, bajoLock: true,
        diagnostico: antes.ingresos, snapshot: snapshot, deferirVistas: true }); acciones.push('INGRESOS');
    }
    if (antes.estratificacionPendiente && typeof Estrat_recalcularTodos_ === 'function') {
      resultado.estratificacion = Estrat_recalcularTodos_({ deferirVistas: true }); acciones.push('ESTRATIFICACION');
    }
    if (antes.cachesPendientes) { resultado.caches = Control_recalcularCaches_(); acciones.push('CACHES'); }
    var sectores = (antes.vistas && antes.vistas.sectoresAfectados || []).slice();
    (resultado.ingresos && resultado.ingresos.sectoresAfectados || []).forEach(function (s) {
      if (sectores.indexOf(s) < 0) sectores.push(s);
    });
    (resultado.estratificacion && resultado.estratificacion.sectoresAfectados || []).forEach(function (s) {
      if (sectores.indexOf(s) < 0) sectores.push(s);
    });
    if (sectores.length) {
      resultado.vistas = Modelo_refrescarVistasSectores_(sectores);
      acciones.push('VISTAS:' + sectores.join(','));
    }
    if (antes.eventosHuerfanos) acciones.push('HUERFANOS_SOLO_REPORTE');
    if (antes.captureIdsDuplicados || antes.fuentesDuplicadas) acciones.push('DUPLICADOS_SOLO_REPORTE');
    var despues = Integridad_diagnosticarDerivados_(); Sistema_guardarAuditoria_(despues);
    var avisos = [];
    if (despues.eventosHuerfanos) avisos.push('EVENTOS_HUERFANOS:' + despues.eventosHuerfanos);
    if (despues.captureIdsDuplicados) avisos.push('CAPTURE_IDS_DUPLICADOS:' + despues.captureIdsDuplicados);
    if (despues.fuentesDuplicadas) avisos.push('FUENTES_DUPLICADAS:' + despues.fuentesDuplicadas);
    if (despues.pacientesSinSector) avisos.push('PACIENTES_SIN_SECTOR:' + despues.pacientesSinSector);
    var motivo = despues.derivadosOk ? '' : ['DERIVADOS_PENDIENTES',
      'ingresosFalsos=' + despues.ingresosFalsos,
      'ingresosInconsistentes=' + despues.ingresosInconsistentes,
      'vistasPendientes=' + despues.vistasPendientes,
      'cachesPendientes=' + despues.cachesPendientes,
      'estratificacionPendiente=' + despues.estratificacionPendiente].join('; ');
    return { ok: despues.derivadosOk, integridadCompleta: despues.ok,
      advertencia: avisos.length > 0, avisos: avisos, motivo: motivo,
      linea: avisos.length ? 'Derivados reconciliados · evidencia histórica solo reportada: ' + avisos.join(', ') : 'Derivados reconciliados',
      antes: antes, despues: despues, acciones: acciones,
      ingresos: resultado.ingresos || null, estratificacion: resultado.estratificacion || null,
      caches: resultado.caches || null, controles: resultado.controles || null, vistas: resultado.vistas || null };
  };
  return opciones.bajoLock ? reparar() : Ecicep_conLock_(reparar);
}

// Motor reanudable del instalador. El cursor solo avanza al completar una
// subtarea; CacheService contiene exclusivamente cursor, conteos y sectores.
var INTEGRIDAD_SUBPLAN = [
  { id: 'diagnostico', nombre: 'Diagnóstico batch' },
  { id: 'ingresos', nombre: 'Reconciliación de ingresos' },
  { id: 'estratificacion', nombre: 'Estratificación derivada' },
  { id: 'caches', nombre: 'Caches de eventos' },
  { id: 'vistas', nombre: 'Vistas sectoriales' },
  { id: 'postcheck', nombre: 'Verificación final y auditoría' }
];
var _INTEGRIDAD_CURSOR_MEMO = {};

function Integridad_cursorClave_(ejecucion) {
  return 'ECICEP_INST_INT|' + Utl_texto(ejecucion || 'LEGACY').replace(/[^A-Za-z0-9_-]/g, '').substring(0, 80);
}
function Integridad_cursorLeer_(ejecucion) {
  var clave = Integridad_cursorClave_(ejecucion), raw = null, props = Sistema_propiedades_();
  try { raw = CacheService.getScriptCache().get(clave); } catch (e) {}
  try { if (!raw && props) raw = props.getProperty(clave); } catch (eP) {}
  if (!raw && _INTEGRIDAD_CURSOR_MEMO[clave]) return _INTEGRIDAD_CURSOR_MEMO[clave];
  try { return raw ? JSON.parse(raw) : null; } catch (e2) { return null; }
}
function Integridad_cursorGuardar_(ejecucion, estado) {
  var clave = Integridad_cursorClave_(ejecucion), raw = JSON.stringify(estado), props = Sistema_propiedades_();
  _INTEGRIDAD_CURSOR_MEMO[clave] = estado;
  try { CacheService.getScriptCache().put(clave, raw, 3600); } catch (e) {}
  try { if (props) props.setProperty(clave, raw); } catch (eP) {}
}
function Integridad_cursorLimpiar_(ejecucion) {
  var clave = Integridad_cursorClave_(ejecucion), props = Sistema_propiedades_();
  delete _INTEGRIDAD_CURSOR_MEMO[clave];
  try { CacheService.getScriptCache().remove(clave); } catch (e) {}
  try { if (props) props.deleteProperty(clave); } catch (eP) {}
}
function Integridad_resumenSeguro_(d) {
  return { pacientes: Number(d.pacientes || 0), eventos: Number(d.eventos || 0),
    ingresosFalsos: Number(d.ingresosFalsos || 0), ingresosInconsistentes: Number(d.ingresosInconsistentes || 0),
    ingresosDerivados: Number(d.ingresos && d.ingresos.conteos && d.ingresos.conteos.DERIVADO_DESACTUALIZADO || 0),
    cachesPendientes: Number(d.cachesPendientes || 0), vistasPendientes: Number(d.vistasPendientes || 0),
    estratificacionPendiente: Number(d.estratificacionPendiente || 0),
    sectoresAfectados: (d.vistas && d.vistas.sectoresAfectados || []).slice() };
}

function Integridad_ejecutarPaso_(ejecucion) {
  var estado = Integridad_cursorLeer_(ejecucion) || { cursor: 0, sectores: [], metricas: {} };
  var cursor = Number(estado.cursor || 0);
  if (cursor < 0 || cursor >= INTEGRIDAD_SUBPLAN.length) cursor = 0;
  var tarea = INTEGRIDAD_SUBPLAN[cursor], t0 = Date.now(), detalle = null;
  try {
    if (tarea.id === 'diagnostico') {
      var diag = Integridad_diagnosticarDerivados_();
      estado.diagnostico = Integridad_resumenSeguro_(diag);
      estado.sectores = estado.diagnostico.sectoresAfectados.slice();
      detalle = estado.diagnostico;
    } else if (tarea.id === 'ingresos') {
      var requiereIngresos = estado.diagnostico && (estado.diagnostico.ingresosFalsos ||
        estado.diagnostico.ingresosInconsistentes || estado.diagnostico.ingresosDerivados);
      if (!requiereIngresos) detalle = { ok: true, omitida: true, motivo: 'SIN_INGRESOS_PENDIENTES' };
      else {
        var snapI = Integridad_snapshotDerivados_();
        var diagIngresos = Ingresos_diagnosticarIngresados_(snapI);
        detalle = Ingresos_reconciliarIngresados_({ reparar: true, bajoLock: true,
          diagnostico: diagIngresos, snapshot: snapI, deferirVistas: true });
        (detalle.sectoresAfectados || []).forEach(function (s) { if (estado.sectores.indexOf(s) < 0) estado.sectores.push(s); });
        if (detalle.ok === false) throw new Error('INGRESOS_NO_CONVERGEN');
      }
    } else if (tarea.id === 'estratificacion') {
      if (!estado.diagnostico || !estado.diagnostico.estratificacionPendiente)
        detalle = { ok: true, omitida: true, motivo: 'ESTRATIFICACION_VIGENTE' };
      else {
        detalle = Estrat_recalcularTodos_({ deferirVistas: true });
        (detalle.sectoresAfectados || []).forEach(function (s) { if (estado.sectores.indexOf(s) < 0) estado.sectores.push(s); });
        if (detalle.ok === false) throw new Error(detalle.motivo || 'ESTRATIFICACION_FALLO');
      }
    } else if (tarea.id === 'caches') {
      if (!estado.diagnostico || !estado.diagnostico.cachesPendientes)
        detalle = { ok: true, omitida: true, motivo: 'CACHES_VIGENTES' };
      else {
        detalle = Control_recalcularCaches_();
        if (detalle.ok === false) throw new Error(detalle.motivo || 'CACHES_FALLO');
      }
    } else if (tarea.id === 'vistas') {
      var sectorIx = Number(estado.vistaCursor || 0);
      if (!estado.sectores.length) detalle = { omitida: true, motivo: 'VISTAS_VIGENTES' };
      else {
        var sectorActual = estado.sectores[sectorIx];
        detalle = Modelo_refrescarVistasSectores_([sectorActual]);
        sectorIx++; estado.vistaCursor = sectorIx;
        estado.metricas['vista:' + sectorActual] = { ms: Date.now() - t0 };
        if (sectorIx < estado.sectores.length) {
          Integridad_cursorGuardar_(ejecucion, estado);
          return { ok: true, continuar: true, cursor: cursor,
            progreso: { actual: cursor + sectorIx / estado.sectores.length, total: INTEGRIDAD_SUBPLAN.length },
            subetapa: { id: 'vistas:' + estado.sectores[sectorIx], nombre: 'Vista ' + estado.sectores[sectorIx] },
            tareaCompletada: { id: 'vistas:' + sectorActual, nombre: 'Vista ' + sectorActual },
            diagnostico: detalle, metricas: estado.metricas, ms: Date.now() - t0 };
        }
      }
    } else if (tarea.id === 'postcheck') {
      var despues = Integridad_diagnosticarDerivados_();
      Sistema_guardarAuditoria_(despues);
      detalle = Integridad_resumenSeguro_(despues);
      if (!despues.derivadosOk) throw new Error('DERIVADOS_PENDIENTES');
    }
  } catch (ePaso) {
    return { ok: false, continuar: false, cursor: cursor,
      progreso: { actual: cursor, total: INTEGRIDAD_SUBPLAN.length },
      subetapa: tarea, codigo: 'INTEGRIDAD_SUBTAREA_FALLO',
      motivo: ePaso && ePaso.message ? ePaso.message : String(ePaso), reintentable: true,
      ms: Date.now() - t0 };
  }
  estado.metricas[tarea.id] = { ms: Date.now() - t0 };
  cursor++; estado.cursor = cursor;
  var fin = cursor >= INTEGRIDAD_SUBPLAN.length;
  if (fin) Integridad_cursorLimpiar_(ejecucion); else Integridad_cursorGuardar_(ejecucion, estado);
  return { ok: true, continuar: !fin, cursor: cursor,
    progreso: { actual: cursor, total: INTEGRIDAD_SUBPLAN.length },
    subetapa: fin ? null : INTEGRIDAD_SUBPLAN[cursor], tareaCompletada: tarea,
    diagnostico: detalle, metricas: estado.metricas, ms: Date.now() - t0 };
}

function Sistema_datosBasicos_() {
  var ss = Modelo_ss(), ingresos = 0, sectores = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (n) { if (n !== 'INGRESO_NARANJA' && ss.getSheetByName(n)) ingresos++; });
  HOJAS_SECTOR.forEach(function (n) { if (ss.getSheetByName(n)) sectores++; });
  var schema = ''; try { schema = String(Mig_schemaLeido()); } catch (e) {}
  var hojas = { pacientes: !!ss.getSheetByName(HOJAS.PACIENTES), eventos: !!ss.getSheetByName(HOJAS.EVENTOS),
    ingresos: ingresos, sectores: sectores };
  return { ok: hojas.pacientes && hojas.eventos && ingresos === 3 && sectores === 3 &&
      schema === String(SISTEMA_VERSION_SCHEMA_ACTUAL), hojas: hojas, schemaLeido: schema,
    schemaEsperado: String(SISTEMA_VERSION_SCHEMA_ACTUAL) };
}

function Sistema_estadoSalud_(opciones) {
  opciones = opciones || {};
  var datos = Sistema_datosBasicos_(), trigger = Triggers_diagnosticarIngresoOnEdit_(), backup;
  try { backup = Backup_estadoOperativo_(); }
  catch (eB) { backup = { ok: false, estado: 'PENDIENTE_VALIDACION', motivo: eB && eB.message || String(eB) }; }
  var auditoria = Sistema_ultimaAuditoria_(), diag = null;
  if (opciones.profundo === true) { diag = Integridad_diagnosticarDerivados_(); auditoria = Sistema_guardarAuditoria_(diag); }
  var integridad = diag || auditoria;
  var integridadOk = integridad ? (((integridad.derivadosOk === true) ||
    (integridad.derivadosOk === undefined && integridad.ok === true)) && !integridad.stale) : null;
  var operativo = datos.ok && trigger.ok && integridadOk !== false, avisos = [];
  if (!datos.ok) avisos.push('DATOS_O_ESQUEMA_INCOMPLETOS');
  if (!trigger.ok) avisos.push('TRIGGER_INGRESO_' + trigger.estado);
  if (!integridad) avisos.push('AUDITORIA_PROFUNDA_PENDIENTE');
  else if (integridad.stale) avisos.push('AUDITORIA_PROFUNDA_DESACTUALIZADA');
  else if (integridad.derivadosOk === false ||
      (integridad.derivadosOk === undefined && !integridad.ok)) avisos.push('INTEGRIDAD_DERIVADA_PENDIENTE');
  else if (!integridad.ok || integridad.evidenciaSoloReporte) avisos.push('EVIDENCIA_HISTORICA_REQUIERE_REVISION');
  if (integridad && integridad.pacientesSinSector) avisos.push('PACIENTES_SIN_SECTOR:' + integridad.pacientesSinSector);
  if (!backup.ok) avisos.push('RESPALDO_' + (backup.estado || 'PENDIENTE'));
  var estado = !datos.ok || !trigger.ok || integridadOk === false ? 'ERROR' : (avisos.length ? 'ADVERTENCIA' : 'OK');
  return { ok: operativo, operativo: operativo, estado: estado, profundo: opciones.profundo === true,
    version: ECICEP.VERSION, schema: SISTEMA_VERSION_SCHEMA_ACTUAL, datos: datos, hojas: datos.hojas,
    integridad: integridad || { ok: null, estado: 'PENDIENTE_VALIDACION' },
    automatizaciones: { ingreso: trigger, backup: backup },
    triggers: { ingresoOnEdit: trigger.ok, backup: backup.triggerActivo === true },
    ultimaAuditoria: auditoria ? { fecha: auditoria.fecha, stale: !!auditoria.stale } : null, avisos: avisos };
}

function api_sistemaEstadoSalud(opciones, acceso) {
  if (!WebApp_autorizarBuscador(acceso)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  try { return Sistema_estadoSalud_(opciones || {}); }
  catch (e) { return { ok: false, operativo: false, estado: 'ERROR', motivo: e && e.message || String(e) }; }
}
function api_integridadReparar(acceso) {
  if (!WebApp_autorizarBuscador(acceso)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  return Ecicep_conLock_(function () {
    var respaldo = Backup_crear_('PRE_REPARAR');
    if (!respaldo || respaldo.ok === false) return { ok: false, motivo: 'BACKUP_FALLIDO',
      detalle: respaldo && respaldo.motivo || '' };
    var r = Integridad_repararDerivados_({ reparar: true, bajoLock: true });
    r.respaldo = respaldo.nombre; return r;
  });
}
