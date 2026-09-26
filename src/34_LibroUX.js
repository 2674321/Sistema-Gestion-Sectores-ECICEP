/**
 * ECICEP v0.15.0 — experiencia del libro, snapshots y mantenimiento selectivo.
 * Solo persiste métricas agregadas/flags técnicos; nunca PII.
 */
var LIBRO_DIRTY_PROP = 'ECICEP_LIBRO_DIRTY_V012';
var INICIO_SNAPSHOT_PROP = 'ECICEP_INICIO_SNAPSHOT_V012';
var INICIO_LAYOUT_PROP = 'ECICEP_INICIO_LAYOUT_V015';
var INICIO_LAYOUT_VERSION = '0.15.0';
var _LIBRO_DIRTY_MEMO = null;

function Libro_propiedades_() {
  try { return typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties
    ? PropertiesService.getScriptProperties() : null; } catch (e) { return null; }
}
function Libro_dirtyVacio_() {
  return { INICIO: false, VISUAL: false, VALIDACIONES: false, ESTRUCTURA: false };
}
function Libro_leerDirty_() {
  if (_LIBRO_DIRTY_MEMO) return _LIBRO_DIRTY_MEMO;
  var out = Libro_dirtyVacio_(), props = Libro_propiedades_(), raw = '';
  try { raw = props && props.getProperty(LIBRO_DIRTY_PROP); } catch (e) {}
  if (raw) try {
    var guardado = JSON.parse(raw);
    Object.keys(out).forEach(function (k) { out[k] = guardado[k] === true; });
  } catch (e2) {}
  out._disponible = !!props;
  _LIBRO_DIRTY_MEMO = out;
  return out;
}
function Libro_guardarDirty_() {
  var d = Libro_leerDirty_(), props = Libro_propiedades_();
  if (!props) return d;
  var limpio = Libro_dirtyVacio_();
  Object.keys(limpio).forEach(function (k) { limpio[k] = d[k] === true; });
  try { props.setProperty(LIBRO_DIRTY_PROP, JSON.stringify(limpio)); } catch (e) {}
  return d;
}
function Libro_marcarDirty_(tipo) {
  var d = Libro_leerDirty_(), t = Utl_texto(tipo).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(d, t)) return d;
  if (!d[t]) { d[t] = true; Libro_guardarDirty_(); }
  if (t === 'VISUAL' || t === 'VALIDACIONES' || t === 'ESTRUCTURA') {
    var props = Libro_propiedades_();
    try { if (props) props.deleteProperty('ECICEP_PRESENTACION_LAYOUT_V0122'); } catch (e) {}
  }
  return d;
}
function Libro_estaDirty_(tipo) {
  return Libro_leerDirty_()[Utl_texto(tipo).toUpperCase()] === true;
}
function Libro_limpiarDirty_(tipo) {
  var d = Libro_leerDirty_(), t = Utl_texto(tipo).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(d, t) && d[t]) { d[t] = false; Libro_guardarDirty_(); }
  return d;
}
function Inicio_marcarDirty_() {
  Libro_marcarDirty_('INICIO');
  var props = Libro_propiedades_();
  if (!props) return;
  try {
    var raw = props.getProperty(INICIO_SNAPSHOT_PROP), snap = raw ? JSON.parse(raw) : {};
    if (snap.stale === true) return;
    snap.stale = true;
    props.setProperty(INICIO_SNAPSHOT_PROP, JSON.stringify(snap));
  } catch (e) {}
}

function Inicio_hoyIso_() {
  try { return Utilities.formatDate(new Date(), ECICEP.TZ, 'yyyy-MM-dd'); }
  catch (e) {
    var d = new Date(), m = String(d.getMonth() + 1), dia = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' +
      (dia.length < 2 ? '0' + dia : dia);
  }
}
function Inicio_sumarDiasIso_(iso, dias) {
  var p = String(iso || '').split('-'), d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + dias);
  var m = String(d.getMonth() + 1), n = String(d.getDate());
  return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (n.length < 2 ? '0' + n : n);
}

/** Una lectura canónica de pacientes/eventos y una columna por puerta. */
function Inicio_calcularMetricas_() {
  var pacientes = Modelo_leerPacientesCampos(['ID_INTERNO', 'RUT', 'SECTOR',
    'ESTRATIFICACION', 'REQUIERE_REVISION', 'RUT_DV_VALIDO', 'PROXIMO_CONTROL']);
  var eventos = Modelo_leerEventosCampos(['ID_EVENTO']);
  var hoy = Inicio_hoyIso_(), limiteIso = Inicio_sumarDiasIso_(hoy, 30);
  var m = { fecha: new Date().toISOString(), stale: false, pacientes: 0,
    eventos: eventos.length, revision: 0, estratificacionPendiente: 0,
    g1: 0, g2: 0, g3: 0,
    rutInvalidos: 0, duplicados: 0, pendientesIngreso: 0, vencidos: 0,
    porVencer: 0, sinProximaAtencion: 0, sectores: {} };
  ['NARANJO', 'AMARILLO', 'VERDE'].forEach(function (s) {
    m.sectores[s] = { pacientes: 0, pendientesIngreso: 0, revision: 0,
      proximaAtencion: 0, vencidos: 0, porVencer: 0, sinProximaAtencion: 0 };
  });
  var ruts = {};
  pacientes.forEach(function (p) {
    if (!Utl_texto(p.ID_INTERNO)) return;
    m.pacientes++;
    var sector = Utl_texto(p.SECTOR).toUpperCase(), sec = m.sectores[sector];
    if (sec) sec.pacientes++;
    if (p.REQUIERE_REVISION === true || Utl_texto(p.REQUIERE_REVISION).toUpperCase() === 'TRUE') {
      m.revision++; if (sec) sec.revision++;
    }
    // v0.14 §51: conteos G1/G2/G3/G-pendiente en el MISMO recorrido (sin
    // lecturas redundantes). Base del snapshot para la zona de
    // estratificación de INICIO PRO.
    var est = Utl_texto(p.ESTRATIFICACION).toUpperCase();
    if (est === 'G1') m.g1++; else if (est === 'G2') m.g2++; else if (est === 'G3') m.g3++;
    if (['G1', 'G2', 'G3'].indexOf(est) < 0)
      m.estratificacionPendiente++;
    if (p.RUT_DV_VALIDO === false || Utl_texto(p.RUT_DV_VALIDO).toUpperCase() === 'FALSE') m.rutInvalidos++;
    var rut = Utl_texto(p.RUT).replace(/\./g, '').toUpperCase();
    if (rut) ruts[rut] = (ruts[rut] || 0) + 1;
    var prox = Control_aIso(p.PROXIMO_CONTROL);
    // v0.15 §17: vencidos/próximos/sin-próxima también por sector, en el MISMO
    // recorrido (la card PRO lo necesita sin lecturas extra).
    if (!prox) { m.sinProximaAtencion++; if (sec) sec.sinProximaAtencion++; }
    else if (prox < hoy) { m.vencidos++; if (sec) sec.vencidos++; }
    else if (prox <= limiteIso) { m.porVencer++; if (sec) { sec.proximaAtencion++; sec.porVencer++; } }
  });
  Object.keys(ruts).forEach(function (rut) { if (ruts[rut] > 1) m.duplicados += ruts[rut] - 1; });
  var ss = Modelo_ss();
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    if (nombre === 'INGRESO_NARANJA') return;
    var h = ss.getSheetByName(nombre); if (!h) return;
    var ini = Modelo_dataStartRow(nombre), col = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
    var n = h.getLastRow() - ini + 1, pendientes = 0;
    if (n > 0 && col > 0) h.getRange(ini, col, n, 1).getValues().forEach(function (f) {
      var estado = Utl_texto(f[0]).toUpperCase();
      if (!estado || estado === 'PENDIENTE' || estado === 'AGENDADO' || estado === 'REQUIERE_REVISION') pendientes++;
    });
    m.pendientesIngreso += pendientes;
    var sector = nombre.replace('INGRESO_', '').replace('NARANJA', 'NARANJO');
    if (m.sectores[sector]) m.sectores[sector].pendientesIngreso = pendientes;
  });
  try { m.salud = Sistema_estadoSalud_({ profundo: false }); }
  catch (eS) { m.salud = { operativo: false, estado: 'PENDIENTE', avisos: ['ESTADO_NO_DISPONIBLE'] }; }
  try { var aud = Sistema_ultimaAuditoria_(); m.ultimaAuditoria = aud && aud.fecha || ''; }
  catch (eA) { m.ultimaAuditoria = ''; }
  try { var bk = Backup_estadoOperativo_(); m.ultimoBackup = bk.ultima || ''; }
  catch (eB) { m.ultimoBackup = ''; }
  return m;
}
function Inicio_guardarSnapshot_(m) {
  var props = Libro_propiedades_();
  try { if (props) props.setProperty(INICIO_SNAPSHOT_PROP, JSON.stringify(m || {})); } catch (e) {}
  return m;
}
function Inicio_leerSnapshot_() {
  var props = Libro_propiedades_();
  try { var raw = props && props.getProperty(INICIO_SNAPSHOT_PROP); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

function Inicio_numeroVisible_(valor) {
  var n = Number(valor || 0);
  if (!isFinite(n)) n = 0;
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
/** Notación A1 de un bloque horizontal: fila, columna inicial y ancho. */
function Inicio_a1_(fila, col, ancho) {
  function letra(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  return letra(col) + fila + ':' + letra(col + ancho - 1) + fila;
}
/** Redondea N porcentajes para que sumen exactamente 100 (método del mayor
 *  resto). Si total es 0 devuelve ceros. Mantiene el orden de entrada. */
function Inicio_porcentajesRedondeados_(valores, total) {
  var n = valores.length, pcts = [], restos = [], suma = 0, i;
  if (total > 0) {
    for (i = 0; i < n; i++) {
      var exacto = Number(valores[i] || 0) * 100 / total;
      var piso = Math.floor(exacto);
      pcts.push(piso); restos.push(exacto - piso); suma += piso;
    }
    var faltante = 100 - suma;
    var orden = restos.map(function (r, j) { return { r: r, j: j }; })
      .sort(function (a, b) { return b.r - a.r; });
    for (i = 0; i < Math.min(faltante, n); i++) pcts[orden[i].j]++;
  } else {
    for (i = 0; i < n; i++) pcts.push(0);
  }
  return pcts;
}
/** Escribe N valores en una sola pasada (un setValue por ancla). Los anclas son
 *  rangos fusionados de anchos distintos; RangeList.setValues exige una matriz
 *  homogénea, así que no aplica. El coste total es pequeño frente a lo que
 *  ahorran las dimensiones batched de Inicio_construir_ (64 idas → 2). */
function Inicio_escribirValores_(hoja, pares) {
  if (!hoja || !pares || !pares.length) return { ok: false, motivo: 'SIN_RANGOS' };
  var escritas = 0;
  pares.forEach(function (p) { hoja.getRange(p.a1).setValue(p.valor); escritas++; });
  return { ok: true, escritas: escritas };
}
function Inicio_fechaVisible_(valor) {
  if (!valor) return 'Pendiente';
  try { return Utilities.formatDate(new Date(valor), ECICEP.TZ, 'dd-MM-yyyy HH:mm'); }
  catch (e) { return Utl_texto(valor) || 'Pendiente'; }
}
function Inicio_escribirMetricas_(m, hoja, opciones) {
  hoja = hoja || Modelo_ss().getSheetByName('INICIO');
  if (!hoja || !m) return { ok: false, motivo: 'INICIO_NO_DISPONIBLE' };
  opciones = opciones || {};
  var cto = INICIO_CONTRATO;
  var colsValor = [9, 21, 33]; // I, U, AG: primera columna del span de valor de cada card
  var clavesSector = ['pacientes', 'pendientesIngreso', 'revision', 'vencidos',
    'porVencer', 'sinProximaAtencion'];
  var totalPersonas = Number(m.pacientes || 0);
  var sectoresOrden = ['NARANJO', 'AMARILLO', 'VERDE'];
  var personasSector = sectoresOrden.map(function (s) {
    return Number(((m.sectores || {})[s] || {}).pacientes || 0);
  });
  // Redondeo con mayor resto: los porcentajes individuales suman 100 exacto.
  var porcentajesSector = Inicio_porcentajesRedondeados_(personasSector, totalPersonas);
  var rangosValor = [];
  sectoresOrden.forEach(function (s, i) {
    var x = (m.sectores || {})[s] || {};
    var matriz = clavesSector.map(function (clave) {
      return [Inicio_numeroVisible_(x[clave] || 0), '', '', '']; });
    matriz.push([Inicio_numeroVisible_(porcentajesSector[i]) + ' %', '', '', '']);
    hoja.getRange(cto.cardFilas[0], colsValor[i], 7, 4).setValues(matriz);
  });
  Inicio_escribirValores_(hoja, sectoresOrden.map(function (s, i) {
    var ini = [1, 13, 25][i];
    return { a1: Inicio_a1_(cto.cardDistribucionFila, ini, 12),
      valor: Inicio_numeroVisible_(personasSector[i]) + ' personas · ' +
        Inicio_numeroVisible_(porcentajesSector[i]) + ' % del total' };
  }));
  var salud = m.salud || {};
  var integridad = salud.integridad || {};
  var estadoIntegridad = integridad.derivadosOk === false ? 'ERROR' :
    (integridad.evidenciaSoloReporte || integridad.stale || integridad.ok === false ||
      (integridad.ok !== true && integridad.derivadosOk !== true)) ? 'ADVERTENCIA' : 'OK';
  var presentacionEstado = 'REVISAR';
  try {
    // Barato y honesto: en plena reparación los flags están marcados; en libro
    // limpio, OK. El detalle vive en la subtarea `verificar` del plan.
    var dV = (typeof Libro_leerDirty_ === 'function') ? Libro_leerDirty_() : {};
    presentacionEstado = (dV.VISUAL || dV.VALIDACIONES || dV.ESTRUCTURA) ? 'ADVERTENCIA' : 'OK';
  } catch (ePV) {}
  var estados = [
    salud.datos ? (salud.datos.ok ? 'OK' : 'ERROR') : 'ADVERTENCIA',
    estadoIntegridad,
    salud.triggers && salud.triggers.ingresoOnEdit ? 'OK' : 'ADVERTENCIA',
    salud.triggers && salud.triggers.backup ? 'OK' : 'ADVERTENCIA',
    presentacionEstado,
    Inicio_fechaVisible_(m.ultimaAuditoria)
  ];
  var rangosEstado = ['Q30:R30', 'Q31:R31', 'Q32:R32', 'Q33:R33', 'Q34:R34', 'Q35:R35'];
  estados.forEach(function (estado, i) {
    var token = estado === 'OK' ? DESIGN_SYSTEM.ESTADOS.OK :
      estado === 'ERROR' ? DESIGN_SYSTEM.ESTADOS.ERROR : DESIGN_SYSTEM.ESTADOS.ALERTA;
    hoja.getRange(rangosEstado[i]).setValue(estado).setBackground(token.fondo)
      .setFontColor(token.tinta).setFontWeight('bold').setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  });
  var atencion = (m.revision || 0) + (m.sinProximaAtencion || 0) + (m.vencidos || 0) +
    (m.pendientesIngreso || 0) + (m.rutInvalidos || 0);
  var estadoSalud = Utl_texto(salud.estado).toUpperCase();
  var hayError = estados.indexOf('ERROR') !== -1 || estadoSalud === 'ERROR';
  var hayAviso = estados.indexOf('ADVERTENCIA') !== -1 || estadoSalud === 'ADVERTENCIA' || atencion > 0;
  var estadoGeneral = hayError ? 'ERROR' : hayAviso ? 'ADVERTENCIA' : 'OK';
  var tokenGeneral = estadoGeneral === 'OK' ? DESIGN_SYSTEM.ESTADOS.OK :
    estadoGeneral === 'ERROR' ? DESIGN_SYSTEM.ESTADOS.ERROR : DESIGN_SYSTEM.ESTADOS.ALERTA;
  hoja.getRange(cto.estadoGeneralRango).setValue('● ' + estadoGeneral + ' · ' + Inicio_numeroVisible_(atencion) +
      ' alertas operativas · ' + Inicio_numeroVisible_(m.pacientes) + ' personas en seguimiento')
    .setBackground(tokenGeneral.fondo).setFontColor(tokenGeneral.tinta);
  Inicio_escribirValores_(hoja, cto.kpis.map(function (k) {
    return { a1: k.valorRango, valor: Inicio_numeroVisible_(m[k.campo] || 0) };
  }));
  hoja.getRange(30, 35, 6, 2).setValues([
    [Inicio_numeroVisible_(m.vencidos), ''],
    [Inicio_numeroVisible_(m.porVencer), ''],
    [Inicio_numeroVisible_(m.sinProximaAtencion), ''],
    [Inicio_numeroVisible_(m.revision), ''],
    [Inicio_numeroVisible_(m.pendientesIngreso), ''],
    [Inicio_numeroVisible_(m.rutInvalidos), '']
  ]);
  // Paridad en INFO (§12): en plan, la calculan las subtareas paridad:* y la
  // refresca el `verificar` final (sin duplicar ~6 firmas aquí); standalone
  // (reconstruir INICIO suelto) se calcula aquí para no dejar PENDIENTE eterno.
  var paridad = { ingreso: 'PENDIENTE', sector: 'PENDIENTE' };
  if (opciones.viaPlan !== true) {
    try {
      if (typeof HVis_compararFamilia_ === 'function') {
        var fam = Presentacion_familiasParidad_();
        paridad.ingreso = HVis_compararFamilia_(fam.ingreso).ok === true ? 'PASS' : 'DIVERGENTE';
        paridad.sector = HVis_compararFamilia_(fam.sector).ok === true ? 'PASS' : 'DIVERGENTE';
      }
    } catch (ePar) {}
  }
  var build = (typeof ECICEP_BUILD !== 'undefined' && ECICEP_BUILD && ECICEP_BUILD.commit) || 'dev';
  hoja.getRange(42, 35, 7, 2).setValues([
    ['v' + ECICEP.VERSION, ''],
    [String(build), ''],
    [Inicio_fechaVisible_(m.fecha), ''],
    [Inicio_fechaVisible_(m.ultimaAuditoria), ''],
    [Inicio_fechaVisible_(m.ultimoBackup), ''],
    [paridad.ingreso, ''],
    [paridad.sector, '']
  ]);
  hoja.getRange(42, 18, 4, 1).setValues([
    [Inicio_numeroVisible_(m.g1)],
    [Inicio_numeroVisible_(m.g2)],
    [Inicio_numeroVisible_(m.g3)],
    [Inicio_numeroVisible_(m.estratificacionPendiente)]
  ]);
  hoja.getRange('A2:AJ2').setValue(cto.subheader.texto + ' · ' +
    Inicio_numeroVisible_(m.pacientes) + ' personas · ' +
    Inicio_numeroVisible_(m.eventos) + ' eventos');
  return { ok: true, fecha: m.fecha, pacientes: m.pacientes, eventos: m.eventos };
}
function Inicio_refrescar_(opciones) {
  var h = Modelo_ss().getSheetByName('INICIO');
  if (!h) return { ok: false, motivo: 'INICIO_NO_EXISTE' };
  var m = Inicio_calcularMetricas_();
  Inicio_guardarSnapshot_(m);
  var r = Inicio_escribirMetricas_(m, h);
  Libro_limpiarDirty_('INICIO');
  return r;
}
function Inicio_refrescarSiNecesario_() {
  var snap = Inicio_leerSnapshot_();
  return (!snap || snap.stale === true || Libro_estaDirty_('INICIO'))
    ? Inicio_refrescar_({ forzar: true }) : { ok: true, omitida: true, snapshot: snap };
}

/** v0.15 §11 — Contrato único de INICIO PRO (única fuente de verdad).
 *  Builder, fingerprint, merges esperados, alturas, verifier y diagnóstico
 *  derivan de aquí: no hay copias manuales del layout. Canvas A1:AJ50
 *  (36 columnas × 50 filas): 6 accesos, 6 KPIs, 3 cards de sector con 7
 *  métricas, estado, prioridades, estratificación, información y footer.
 *  32 merges (presupuesto ≤40): solo headers/botones/valores destacados;
 *  las filas de métricas son matrices sin mergear. */
var INICIO_CONTRATO = {
  version: 'PANEL_OPERATIVO_PRO_V015',
  rango: 'A1:AJ50', filas: 50, columnas: 36,
  freezeRows: 2, freezeColumns: 0, anchoColumna: 38,
  header: { rango: 'A1:AJ1', texto: 'ECICEP · CENTRO OPERATIVO' },
  subheader: { rango: 'A2:AJ2',
    texto: 'Gestión integrada por sectores · seguimiento, ingresos y controles' },
  estadoGeneralRango: 'A3:AJ3',
  accesos: [
    { texto: 'PERSONAS', rango: 'A5:F8', vista: 'pacientes' },
    { texto: 'CAPTURA', rango: 'G5:L8', vista: 'captura' },
    { texto: 'INGRESOS', rango: 'M5:R8', vista: 'ingresos' },
    { texto: 'CONTROLES', rango: 'S5:X8', vista: 'controles' },
    { texto: 'ESTADÍSTICAS', rango: 'Y5:AD8', vista: 'estadisticas' },
    { texto: 'REM', rango: 'AE5:AJ8', vista: 'rem' }
  ],
  kpis: [
    { etiqueta: 'PERSONAS', etiquetaRango: 'A10:F10', valorRango: 'A11:F12', campo: 'pacientes' },
    { etiqueta: 'EVENTOS', etiquetaRango: 'G10:L10', valorRango: 'G11:L12', campo: 'eventos' },
    { etiqueta: 'REVISIÓN', etiquetaRango: 'M10:R10', valorRango: 'M11:R12', campo: 'revision' },
    { etiqueta: 'VENCIDOS', etiquetaRango: 'S10:X10', valorRango: 'S11:X12', campo: 'vencidos' },
    { etiqueta: 'PRÓXIMOS 30 DÍAS', etiquetaRango: 'Y10:AD10', valorRango: 'Y11:AD12', campo: 'porVencer' },
    { etiqueta: 'SIN PRÓXIMA ATENCIÓN', etiquetaRango: 'AE10:AJ10', valorRango: 'AE11:AJ12', campo: 'sinProximaAtencion' }
  ],
  sectores: [
    { n: 'NARANJO', ini: 1 }, { n: 'AMARILLO', ini: 13 }, { n: 'VERDE', ini: 25 }
  ],
  cardFilas: [16, 17, 18, 19, 20, 21, 22],
  cardMetricas: ['Personas', 'Ingresos pendientes', 'Revisión', 'Vencidos',
    'Próximos 30 días', 'Sin próxima atención', '% del total'],
  cardDistribucionFila: 23,
  estado: { titulo: 'A29:R38', tituloRango: 'A29:R29', tituloTexto: 'ESTADO DEL SISTEMA',
    filas: [30, 31, 32, 33, 34, 35],
    etiquetas: ['Datos', 'Integridad', 'Ingreso manual', 'Backup', 'Presentación', 'Última auditoría'] },
  prioridades: { titulo: 'S29:AJ38', tituloRango: 'S29:AJ29', tituloTexto: 'PRIORIDADES',
    filas: [30, 31, 32, 33, 34, 35],
    etiquetas: ['Controles vencidos', 'Próximos 30 días', 'Sin próxima atención',
      'Fichas por revisar', 'Ingresos pendientes', 'RUT inválidos'] },
  estratificacion: { titulo: 'A41:R47', tituloRango: 'A41:R41', tituloTexto: 'ESTRATIFICACIÓN',
    filas: [42, 43, 44, 45], etiquetas: ['G1', 'G2', 'G3', 'G / pendiente'] },
  info: { titulo: 'S41:AJ47', tituloRango: 'S41:AJ41', tituloTexto: 'INFORMACIÓN DEL SISTEMA',
    filas: [42, 43, 44, 45, 46, 47, 48],
    etiquetas: ['Versión', 'Build', 'Última actualización', 'Última auditoría',
      'Último backup', 'Paridad INGRESO', 'Paridad SECTOR'] },
  footer: { rango: 'A49:AJ50',
    texto: 'Datos agregados · consulta la ficha para información individual.' },
  alturas: [[1, 30], [2, 22], [3, 26], [4, 8], [5, 22], [6, 22], [7, 22], [8, 22],
    [9, 8], [10, 16], [11, 24], [12, 24], [13, 8], [14, 8], [15, 26],
    [16, 20], [17, 20], [18, 20], [19, 20], [20, 20], [21, 20], [22, 20], [23, 22],
    [24, 8], [25, 8], [26, 8], [27, 8], [28, 8], [29, 26],
    [30, 20], [31, 20], [32, 20], [33, 20], [34, 20], [35, 20],
    [36, 8], [37, 8], [38, 8], [39, 8], [40, 8], [41, 26],
    [42, 20], [43, 20], [44, 20], [45, 20], [46, 8], [47, 8], [48, 20],
    [49, 20], [50, 20]]
};

function Inicio_fingerprintEsperado_() {
  return 'pro015|' + Utl_fnv1a32_(JSON.stringify(INICIO_CONTRATO));
}
function Inicio_mergesEsperados_() {
  var cto = INICIO_CONTRATO, merges = [cto.header.rango, cto.subheader.rango, cto.estadoGeneralRango];
  cto.accesos.forEach(function (a) { merges.push(a.rango); });
  cto.kpis.forEach(function (k) { merges.push(k.etiquetaRango, k.valorRango); });
  cto.sectores.forEach(function (s) {
    merges.push(Inicio_a1_(15, s.ini, 12));
    merges.push(Inicio_a1_(cto.cardDistribucionFila, s.ini, 12));
  });
  merges.push(cto.estado.tituloRango, cto.prioridades.tituloRango,
    cto.estratificacion.tituloRango, cto.info.tituloRango, cto.footer.rango);
  return merges.sort();
}
function Inicio_alturasEsperadas_() {
  return INICIO_CONTRATO.alturas;
}
function Inicio_colorOscuro_(color) {
  var hex = Utl_texto(color).replace('#', '');
  if (!/^[0-9A-F]{6}$/i.test(hex)) return false;
  var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 105;
}
/** Verificación estructural completa de la portada; no consulta datos clínicos. */
/** Verificación estructural completa de la portada PRO; no consulta datos
 *  clínicos. Todo lo comprobable deriva de INICIO_CONTRATO (§18). Las
 *  dimensiones físicas extra NO son drift: solo se exigen mínimos. */
function Inicio_verificar_(h) {
  var cto = INICIO_CONTRATO;
  var ver = { hoja: !!h, layoutVersion: false, rangoGestionado: INICIO_RANGO_GESTIONADO === cto.rango,
    dimensiones: false, titulo: false, subtitulo: false, estadoGeneral: false,
    accesos: false, kpis: false, tarjetas: false, bloques: false, merges: false,
    freeze: false, freezeSeguro: false, anchos: false, alturas: false,
    coloresBase: false, fondoClaro: false, snapshot: false };
  if (!h) { ver.ok = false; ver.fallos = ['hoja']; return ver; }
  var props = Libro_propiedades_(), raw = '', meta = null;
  try { raw = props && props.getProperty(INICIO_LAYOUT_PROP); meta = raw ? JSON.parse(raw) : null; }
  catch (eP) { meta = null; }
  ver.layoutVersion = !!meta && meta.version === INICIO_LAYOUT_VERSION &&
    meta.fingerprint === Inicio_fingerprintEsperado_();
  try { ver.dimensiones = h.getMaxRows() >= cto.filas && h.getMaxColumns() >= cto.columnas; } catch (eD) {}
  try {
    var titulo = Utl_texto(h.getRange('A1').getValue());
    ver.titulo = titulo.indexOf('ECICEP') !== -1;
    ver.subtitulo = Utl_texto(h.getRange('A2').getValue()).indexOf('Gestión integrada por sectores') !== -1;
    ver.estadoGeneral = ['OK', 'ADVERTENCIA', 'ERROR'].some(function (e) {
      return Utl_texto(h.getRange('A3').getValue()).indexOf(e) !== -1; });
  } catch (eT) {}
  try {
    ver.accesos = cto.accesos.every(function (a) {
      var celda = h.getRange(a.rango.split(':')[0]);
      var enlazado = Utl_texto(celda.getFormula()).indexOf('HYPERLINK') !== -1;
      return enlazado || Utl_texto(celda.getValue()).indexOf(a.texto) !== -1;
    });
    ver.kpis = cto.kpis.every(function (k) {
      return Utl_texto(h.getRange(k.etiquetaRango.split(':')[0]).getValue()) === k.etiqueta; });
    ver.tarjetas = cto.sectores.every(function (s) {
      return Utl_texto(h.getRange(Inicio_a1_(15, s.ini, 1).split(':')[0]).getValue()) === s.n; }) &&
      cto.sectores.every(function (s, ix) {
        return cto.cardMetricas.every(function (et, f) {
          return Utl_texto(h.getRange(cto.cardFilas[f], s.ini).getValue()) === et; }); }) &&
      !!Utl_texto(h.getRange('A23').getValue());
    ver.bloques = Utl_texto(h.getRange('A29').getValue()) === cto.estado.tituloTexto &&
      Utl_texto(h.getRange('S29').getValue()) === cto.prioridades.tituloTexto &&
      Utl_texto(h.getRange('A41').getValue()) === cto.estratificacion.tituloTexto &&
      Utl_texto(h.getRange('S41').getValue()) === cto.info.tituloTexto &&
      !!Utl_texto(h.getRange('A49').getValue());
    ver.snapshot = ['A11', 'A16', 'Y11', 'Q30', 'AI30', 'R42', 'AI42'].every(function (a1) {
      try { return h.getRange(a1).getFormula() === ''; } catch (eF) { return false; } });
  } catch (eC) {}
  try {
    var rangos = h.getRange(cto.rango).getMergedRanges();
    var reales = rangos.map(function (r) { return r.getA1Notation(); }).sort();
    var esperados = Inicio_mergesEsperados_();
    ver.merges = reales.length === esperados.length && reales.every(function (a1, i) { return a1 === esperados[i]; });
    ver.freezeSeguro = rangos.every(function (r) {
      return !(r.getRow() <= 2 && r.getRow() + r.getNumRows() - 1 > 2);
    });
  } catch (eM) {}
  try { ver.freeze = h.getFrozenRows() === cto.freezeRows && h.getFrozenColumns() === cto.freezeColumns; } catch (eF) {}
  try {
    ver.anchos = true; ver.detalleAnchos = [];
    for (var col = 1; col <= cto.columnas; col++) {
      var anchoReal = h.getColumnWidth(col);
      if (anchoReal !== cto.anchoColumna) { ver.anchos = false; ver.detalleAnchos.push({ col: col, ancho: anchoReal }); }
    }
  } catch (eW) { ver.anchos = false; }
  try {
    ver.alturas = true; ver.detalleAlturas = [];
    Inicio_alturasEsperadas_().forEach(function (x) {
      var altoReal = h.getRowHeight(x[0]);
      if (altoReal !== x[1]) { ver.alturas = false; ver.detalleAlturas.push({ fila: x[0], alto: altoReal, esperado: x[1] }); }
    });
  } catch (eH) { ver.alturas = false; }
  try {
    var M = DESIGN_SYSTEM.MARCA, blanco = DESIGN_SYSTEM.SUPERFICIE.datos;
    ver.coloresBase = Utl_colorIgual(h.getRange('A1').getBackground(), M.sistemaProfundo) &&
      Utl_colorIgual(h.getRange('A5').getBackground(), blanco) &&
      Utl_colorIgual(h.getRange('A10').getBackground(), M.sistema) &&
      Utl_colorIgual(h.getRange('A11').getBackground(), blanco) &&
      Utl_colorIgual(h.getRange('A15').getBackground(), IDENTIDAD.NARANJO) &&
      Utl_colorIgual(h.getRange('M15').getBackground(), IDENTIDAD.AMARILLO) &&
      Utl_colorIgual(h.getRange('Y15').getBackground(), IDENTIDAD.VERDE) &&
      Utl_colorIgual(h.getRange('A29').getBackground(), M.sistema) &&
      Utl_colorIgual(h.getRange('S29').getBackground(), M.sistema) &&
      Utl_colorIgual(h.getRange('A16').getBackground(), blanco) &&
      ['OK', 'ALERTA', 'ERROR'].some(function (k) {
        return Utl_colorIgual(h.getRange('A3').getBackground(), DESIGN_SYSTEM.ESTADOS[k].fondo);
      });
    var fondos = h.getRange('A1:AJ40').getBackgrounds(), oscuros = 0, total = 0;
    fondos.forEach(function (fila) { fila.forEach(function (color) {
      total++; if (Inicio_colorOscuro_(color)) oscuros++;
    }); });
    ver.fondoClaro = total > 0 && oscuros / total <= 0.15;
  } catch (eB) {}
  ver.fallos = Object.keys(ver).filter(function (k) {
    return k !== 'ok' && k !== 'fallos' && k !== 'detalleAnchos' && k !== 'detalleAlturas' && ver[k] !== true;
  });
  ver.ok = ver.fallos.length === 0;
  return ver;
}
function Inicio_layoutVigente_(h) {
  return Inicio_verificar_(h).ok;
}
/** Diagnóstico visual de INICIO PRO: tokens de diferencia accionables.
 *  No consulta datos clínicos. Devuelve {ok, diferencias}.
 *  v0.15 §15: las dimensiones físicas extra NO son drift (sin SOBRANTE). */
function Inicio_diagnosticarVisual_(hoja) {
  var diag = { ok: false, diferencias: [] };
  if (!hoja) { diag.diferencias.push('HOJA:INICIO'); return diag; }
  try {
    var v = Inicio_verificar_(hoja);
    var mapa = {
      layoutVersion: 'LAYOUT_VERSION', rangoGestionado: 'RANGO_GESTIONADO',
      dimensiones: 'DIMENSIONES', titulo: 'TITULO', subtitulo: 'SUBTITULO',
      estadoGeneral: 'ESTADO_GENERAL', accesos: 'ACCESOS', kpis: 'KPIS',
      tarjetas: 'CARD', bloques: 'BLOQUES', merges: 'MERGE',
      freeze: 'FREEZE', freezeSeguro: 'MERGE:CRUZA_FREEZE', anchos: 'ANCHO',
      alturas: 'ALTURA', coloresBase: 'COLOR_BASE', fondoClaro: 'FONDO', snapshot: 'SNAPSHOT'
    };
    (v.fallos || []).forEach(function (k) { if (mapa[k]) diag.diferencias.push(mapa[k]); });
    INICIO_CONTRATO.accesos.forEach(function (a) {
      try {
        var celda = hoja.getRange(a.rango.split(':')[0]);
        var enlazado = Utl_texto(celda.getFormula()).indexOf('HYPERLINK') !== -1;
        if (!enlazado && Utl_texto(celda.getValue()).indexOf(a.texto) === -1)
          diag.diferencias.push('LINK:' + a.texto);
      } catch (eL) { diag.diferencias.push('LINK:' + a.texto); }
    });
  } catch (e) {
    diag.diferencias.push('DIAGNOSTICO:ERROR');
  }
  diag.ok = diag.diferencias.length === 0;
  return diag;
}
function Inicio_guardarLayout_() {
  var props = Libro_propiedades_(); if (!props) return;
  try { props.setProperty(INICIO_LAYOUT_PROP, JSON.stringify({
    version: INICIO_LAYOUT_VERSION, fingerprint: Inicio_fingerprintEsperado_()
  })); } catch (e) {}
}
function Inicio_borrarLayout_() {
  var props = Libro_propiedades_();
  try { if (props) props.deleteProperty(INICIO_LAYOUT_PROP); } catch (e) {}
}

function Inicio_construir_(ss, opciones) {
  opciones = opciones || {};
  var cto = INICIO_CONTRATO;
  var h = ss.getSheetByName('INICIO');
  if (!h) h = ss.insertSheet('INICIO');
  if (opciones.forzar !== true && Inicio_layoutVigente_(h)) {
    var tituloActual = cto.header.texto;
    var tituloRango = h.getRange('A1');
    if (Utl_texto(tituloRango.getValue()) !== tituloActual) tituloRango.setValue(tituloActual);
    try {
      if (!h.getTabColor || !Utl_colorIgual(h.getTabColor(), DESIGN_SYSTEM.MARCA.sistemaProfundo))
        h.setTabColor(DESIGN_SYSTEM.MARCA.sistemaProfundo);
    } catch (eT) {}
    var refresco = Inicio_refrescarSiNecesario_();
    var vigente = Inicio_verificar_(h);
    return { ok: refresco.ok !== false, omitida: true, layoutVigente: true,
      refresco: refresco, verificacion: vigente };
  }
  // Hotfix 0.12.1: si la hoja hereda filas/columnas inmovilizadas de una
  // instalación anterior, cualquier escritura cuyo rango cruce el límite
  // congelado/no-congelado falla ("No se pueden combinar filas inmovilizadas
  // con filas no inmovilizadas"). Invariante: la portada se construye SIEMPRE
  // sin freeze residual y se congela solo al final, idempotente.
  h.setFrozenRows(0); h.setFrozenColumns(0);
  // v0.15 §15: lienzo mínimo (filas/columnas del contrato); el físico extra NO
  // es drift y NO se fusiona ni se oculta (sin marco exterior gigante).
  var filas = cto.filas, cols = cto.columnas;
  if (h.getMaxRows() < filas) h.insertRowsAfter(h.getMaxRows(), filas - h.getMaxRows());
  if (h.getMaxColumns() < cols) h.insertColumnsAfter(h.getMaxColumns(), cols - h.getMaxColumns());
  try { h.showRows(1, Math.min(filas, h.getMaxRows())); } catch (eSR) {}
  try { h.showColumns(1, Math.min(cols, h.getMaxColumns())); } catch (eSC) {}
  var gestionado = h.getRange(cto.rango);
  try { gestionado.breakApart(); } catch (eM) {}
  gestionado.clear();
  h.setHiddenGridlines(true);
  var M = DESIGN_SYSTEM.MARCA, blanco = DESIGN_SYSTEM.SUPERFICIE.datos;
  var fondo = DESIGN_SYSTEM.TOKENS_UI.background, borde = DESIGN_SYSTEM.TOKENS_UI.border;
  gestionado.setBackground(fondo).setFontFamily('Arial').setFontColor(DESIGN_SYSTEM.TOKENS_UI.text);
  // Presupuesto de RPC (regresión 2026-09-25): la portada se construye dentro de
  // una subtarea del plan de presentación y el límite de Apps Script es DURO por
  // invocación. Encadenar un setX por celda emitía ~720 idas a la API y la
  // subtarea moría por tiempo sin dejar cambios. Ahora las dimensiones van en 2
  // llamadas y cada token de estilo se aplica una vez sobre un RangeList.
  // Dimensiones. setRowHeights/setColumnWidths de Apps Script NO aceptan arrays:
  // el tercer parámetro es una altura/ancho ÚNICA para el bloque, así que se
  // agrupan las alturas en tramos contiguos de igual valor y los anchos (todos
  // 38) en una sola llamada.
  var alturas = Inicio_alturasEsperadas_();
  if (typeof h.setRowHeights === 'function') {
    var iniTramo = alturas[0][0], iA;
    for (iA = 1; iA <= alturas.length; iA++) {
      if (iA === alturas.length || alturas[iA][1] !== alturas[iA - 1][1]) {
        h.setRowHeights(iniTramo, alturas[iA - 1][0] - iniTramo + 1, alturas[iA - 1][1]);
        iniTramo = iA < alturas.length ? alturas[iA][0] : iniTramo;
      }
    }
  } else if (typeof h.setRowHeight === 'function') {
    alturas.forEach(function (x) { h.setRowHeight(x[0], x[1]); });
  }
  if (typeof h.setColumnWidths === 'function') h.setColumnWidths(1, cols, cto.anchoColumna);
  else for (var c = 1; c <= cols; c++) h.setColumnWidth(c, cto.anchoColumna);

  var FONDOS = {}, TINTAS = {}, PESOS = {}, TAMANOS = {}, HALIN = {}, VALIN = {};
  var conBorde = [], conWrap = [];
  function g(mapa, valor) { if (!mapa[valor]) mapa[valor] = []; return mapa[valor]; }
  var SINGULAR = { setBackgrounds:'setBackground', setFontColors:'setFontColor',
    setFontSizes:'setFontSize', setFontWeights:'setFontWeight',
    setHorizontalAlignments:'setHorizontalAlignment', setVerticalAlignments:'setVerticalAlignment' };
  function capa(mapa, orden, metodoPlural, convertir) {
    var metodo = SINGULAR[metodoPlural];
    orden.forEach(function (valor) {
      var rangos = mapa[valor];
      if (!rangos || !rangos.length) return;
      var salida = convertir ? convertir(valor) : valor;
      try {
        h.getRangeList(rangos)[metodo](salida);
      } catch (eG) {
        rangos.forEach(function (a2) { h.getRange(a2)[metodo](salida); });
      }
    });
  }
  var sectores = cto.sectores.map(function (s, ix) {
    var letras = [['A', 'L'], ['M', 'X'], ['Y', 'AJ']][ix];
    return { n: s.n, ini: s.ini, c: IDENTIDAD[s.n], colA: letras[0], colB: letras[1] }; });
  function urlAcceso_(vista) {
    if (vista === 'captura')
      return (typeof WebApp_urlCaptura_ === 'function') ? WebApp_urlCaptura_() : '';
    return (typeof WebApp_urlVista_ === 'function') ? WebApp_urlVista_(vista) : '';
  }
  var accesos = cto.accesos.map(function (a) {
    return { texto: a.texto, rango: a.rango, url: urlAcceso_(a.vista) }; });
  var kpis = cto.kpis;
  var metricasSector = cto.cardMetricas.map(function (et, i) { return [et, cto.cardFilas[i]]; });

  // --- contenido: merges solo en headers/botones/valores (§14: 32, sin
  // mergear cada par label/value; las filas de métricas son matrices) ---
  h.getRange(cto.header.rango).merge().setValue(cto.header.texto);
  h.getRange(cto.subheader.rango).merge().setValue(cto.subheader.texto);
  h.getRange(cto.estadoGeneralRango).merge().setValue('Panel operativo · datos agregados y verificables');
  accesos.forEach(function (a) {
    var rng = h.getRange(a.rango).merge(), formula = '';
    if (a.url) formula = '=HYPERLINK("' + String(a.url).replace(/"/g, '""') + '";"' + a.texto + '")';
    if (formula) rng.setFormula(formula); else rng.setValue(a.texto);
  });
  kpis.forEach(function (k) {
    h.getRange(k.etiquetaRango).merge().setValue(k.etiqueta);
    h.getRange(k.valorRango).merge().setValue(0);
  });
  sectores.forEach(function (s) {
    var c0 = s.ini;
    h.getRange(15, c0, 1, 12).merge().setValue(s.n);
    var matrizEtiquetas = metricasSector.map(function (x) {
      var fila = [x[0]];
      for (var i = 1; i < 12; i++) fila.push('');
      return fila;
    });
    h.getRange(cto.cardFilas[0], c0, metricasSector.length, 12).setValues(matrizEtiquetas);
    h.getRange(cto.cardDistribucionFila, c0, 1, 12).merge().setValue('0 personas · 0 % del total');
  });
  h.getRange(cto.estado.tituloRango).merge().setValue(cto.estado.tituloTexto);
  h.getRange(cto.estado.filas[0], 1, cto.estado.etiquetas.length, 1)
    .setValues(cto.estado.etiquetas.map(function (t) { return [t]; }));
  h.getRange(cto.prioridades.tituloRango).merge().setValue(cto.prioridades.tituloTexto);
  h.getRange(cto.prioridades.filas[0], 19, cto.prioridades.etiquetas.length, 1)
    .setValues(cto.prioridades.etiquetas.map(function (t) { return [t]; }));
  h.getRange(cto.estratificacion.tituloRango).merge().setValue(cto.estratificacion.tituloTexto);
  h.getRange(cto.estratificacion.filas[0], 1, cto.estratificacion.etiquetas.length, 1)
    .setValues(cto.estratificacion.etiquetas.map(function (t) { return [t]; }));
  h.getRange(cto.info.tituloRango).merge().setValue(cto.info.tituloTexto);
  h.getRange(cto.info.filas[0], 19, cto.info.etiquetas.length, 1)
    .setValues(cto.info.etiquetas.map(function (t) { return [t]; }));
  h.getRange(cto.footer.rango).merge().setValue(cto.footer.texto);

  // --- estilos PRO (§13): fondo claro, cards blancas, header sistema, acento
  // sectorial, Arial base. Un grupo por token; RangeList en una sola pasada. ---
  g(FONDOS, blanco);
  accesos.forEach(function (a) { g(FONDOS, blanco).push(a.rango); g(TINTAS, M.sistema).push(a.rango);
    g(PESOS, 'bold').push(a.rango); g(TAMANOS, 10).push(a.rango); g(HALIN, 'center').push(a.rango);
    g(VALIN, 'middle').push(a.rango); conBorde.push(a.rango); });
  kpis.forEach(function (k) {
    g(FONDOS, M.sistema).push(k.etiquetaRango); g(TINTAS, blanco).push(k.etiquetaRango);
    g(PESOS, 'bold').push(k.etiquetaRango);
    g(TAMANOS, 8).push(k.etiquetaRango); g(HALIN, 'center').push(k.etiquetaRango);
    g(VALIN, 'middle').push(k.etiquetaRango);
    conBorde.push(k.etiquetaRango);
    g(FONDOS, blanco).push(k.valorRango); g(TINTAS, M.texto).push(k.valorRango);
    g(PESOS, 'bold').push(k.valorRango);
    g(TAMANOS, 18).push(k.valorRango); g(HALIN, 'center').push(k.valorRango);
    g(VALIN, 'middle').push(k.valorRango);
    conBorde.push(k.valorRango);
  });
  sectores.forEach(function (s) {
    var caja = s.colA + '15:' + s.colB + '23', cabecera = s.colA + '15:' + s.colB + '15';
    var dist = s.colA + '23:' + s.colB + '23';
    g(FONDOS, blanco).push(caja); conBorde.push(caja);
    g(FONDOS, s.c).push(cabecera);
    g(TINTAS, blanco).push(cabecera);
    g(PESOS, 'bold').push(cabecera);
    g(TAMANOS, 11).push(cabecera);
    g(HALIN, 'center').push(cabecera); g(VALIN, 'middle').push(cabecera);
    cto.cardFilas.forEach(function (fila) {
      g(TINTAS, M.gris).push(s.colA + fila);
      g(HALIN, 'left').push(s.colA + fila);
      g(VALIN, 'middle').push(s.colA + fila);
    });
    g(TINTAS, M.texto).push(s.colA + '16:' + s.colB + '22');
    g(PESOS, 'bold').push(s.colA + '16:' + s.colB + '22');
    g(HALIN, 'right').push(s.colA + '16:' + s.colB + '22');
    g(VALIN, 'middle').push(s.colA + '16:' + s.colB + '22');
    g(FONDOS, blanco).push(dist); g(TINTAS, M.texto).push(dist);
    g(PESOS, 'bold').push(dist); g(TAMANOS, 10).push(dist);
    g(HALIN, 'center').push(dist); g(VALIN, 'middle').push(dist); conBorde.push(dist);
  });
  var CAJA_ESTADO = 'A29:R35', CAJA_PEND = 'S29:AJ35';
  var CAJA_ESTRAT = 'A41:R47', CAJA_INFO = 'S41:AJ48';
  g(FONDOS, blanco).push(CAJA_ESTADO, CAJA_PEND, CAJA_ESTRAT, CAJA_INFO);
  conBorde.push(CAJA_ESTADO, CAJA_PEND, CAJA_ESTRAT, CAJA_INFO);
  [cto.estado.tituloRango, cto.prioridades.tituloRango,
   cto.estratificacion.tituloRango, cto.info.tituloRango].forEach(function (cab) {
    g(FONDOS, M.sistema).push(cab); g(TINTAS, blanco).push(cab); g(PESOS, 'bold').push(cab);
    g(TAMANOS, 10).push(cab); g(HALIN, 'center').push(cab); g(VALIN, 'middle').push(cab);
  });
  g(TINTAS, M.gris).push('A30:A35', 'S30:S35', 'A42:A45', 'S42:S48');
  g(PESOS, 'bold').push('A30:A35', 'S30:S35', 'A42:A45', 'S42:S48');
  g(HALIN, 'left').push('A30:A35', 'S30:S35', 'A42:A45', 'S42:S48');
  g(VALIN, 'middle').push('A30:A35', 'S30:S35', 'A42:A45', 'S42:S48');
  g(TINTAS, M.texto).push('Q30:R35', 'R42:R45');
  g(PESOS, 'bold').push('Q30:R35', 'R42:R45');
  g(HALIN, 'center').push('Q30:R35', 'R42:R45');
  g(VALIN, 'middle').push('Q30:R35', 'R42:R45');
  g(TINTAS, M.sistema).push('AI30:AJ35');
  g(PESOS, 'bold').push('AI30:AJ35');
  g(HALIN, 'right').push('AI30:AJ35');
  g(VALIN, 'middle').push('AI30:AJ35');
  g(TINTAS, M.texto).push('AI42:AJ48');
  g(HALIN, 'left').push('AI42:AJ48');
  g(VALIN, 'middle').push('AI42:AJ48');
  g(FONDOS, DESIGN_SYSTEM.HOJAS.seleccion.fondo).push('A2:AJ2', 'A3:AJ3');
  g(TINTAS, M.gris).push('A2:AJ2'); g(TAMANOS, 9).push('A2:AJ2');
  g(HALIN, 'left').push('A2:AJ2'); g(VALIN, 'middle').push('A2:AJ2');
  g(TINTAS, M.texto).push('A3:AJ3'); g(PESOS, 'bold').push('A3:AJ3');
  g(TAMANOS, 10).push('A3:AJ3'); g(HALIN, 'left').push('A3:AJ3');
  g(VALIN, 'middle').push('A3:AJ3'); conBorde.push('A3:AJ3');
  g(FONDOS, M.sistemaProfundo).push('A1:AJ1');
  g(TINTAS, blanco).push('A1:AJ1'); g(PESOS, 'bold').push('A1:AJ1');
  g(TAMANOS, 16).push('A1:AJ1'); g(HALIN, 'left').push('A1:AJ1');
  g(VALIN, 'middle').push('A1:AJ1');
  g(FONDOS, DESIGN_SYSTEM.HOJAS.derivado.fondo).push('A49:AJ50');
  g(TINTAS, M.gris).push('A49:AJ50');
  g(TAMANOS, 9).push('A49:AJ50'); g(HALIN, 'center').push('A49:AJ50');
  g(VALIN, 'middle').push('A49:AJ50');
  conBorde.push('A49:AJ50'); conWrap.push('A49:AJ50');

  // Fondos base primero y acentos al final: la cabecera de sector se pinta
  // encima de la caja blanca de su tarjeta.
  capa(FONDOS, [blanco, DESIGN_SYSTEM.HOJAS.seleccion.fondo, DESIGN_SYSTEM.HOJAS.derivado.fondo,
    fondo, M.sistema, M.sistemaProfundo, DESIGN_SYSTEM.ESTADOS.OK.fondo]
    .concat(sectores.map(function (s) { return s.c; })), 'setBackgrounds');
  capa(TINTAS, [blanco, M.texto, M.gris, M.sistema, M.sistemaProfundo,
    DESIGN_SYSTEM.ESTADOS.OK.tinta], 'setFontColors');
  capa(PESOS, ['bold'], 'setFontWeights');
  capa(TAMANOS, [14, 10, 9, 8], 'setFontSizes', Number);
  capa(HALIN, ['center', 'right', 'left'], 'setHorizontalAlignments');
  capa(VALIN, ['middle', 'top'], 'setVerticalAlignments');
  if (conBorde.length) {
    try { h.getRangeList(conBorde).setBorder(true, true, true, true, null, null, borde, SpreadsheetApp.BorderStyle.SOLID); }
    catch (eB) { conBorde.forEach(function (a2) {
      h.getRange(a2).setBorder(true, true, true, true, null, null, borde, SpreadsheetApp.BorderStyle.SOLID); }); }
  }
  conWrap.forEach(function (a2) { h.getRange(a2).setWrap(true); });
  // v0.15 §15: sin marco exterior gigante. El físico extra no es drift, no se
  // fusiona ni se oculta: el canvas termina donde termina el contrato.
  h.setTabColor(M.sistemaProfundo);
  try { h.setConditionalFormatRules([]); } catch (eCF) {}
  var metricas = Inicio_calcularMetricas_();
  Inicio_guardarSnapshot_(metricas);
  Inicio_escribirMetricas_(metricas, h, (opciones && opciones.escribir) || {});
  h.setFrozenRows(2); h.setFrozenColumns(0);
  Inicio_guardarLayout_();
  var ver = Inicio_verificar_(h);
  if (!ver.ok && (ver.detalleAnchos && ver.detalleAnchos.length || ver.detalleAlturas && ver.detalleAlturas.length)) {
    try {
      (ver.detalleAnchos || []).forEach(function (d) { h.setColumnWidth(d.col, cto.anchoColumna); });
      (ver.detalleAlturas || []).forEach(function (d) { h.setRowHeight(d.fila, d.esperado); });
      ver = Inicio_verificar_(h);
    } catch (eAuto) {}
  }
  if (!ver.ok) {
    var detalle = [];
    if (ver.detalleAnchos && ver.detalleAnchos.length) detalle.push('anchos(' + ver.detalleAnchos.map(function (d) { return 'col' + d.col + '=' + d.ancho; }).join(',') + ')');
    if (ver.detalleAlturas && ver.detalleAlturas.length) detalle.push('alturas(' + ver.detalleAlturas.map(function (d) { return 'fila' + d.fila + '=' + d.alto; }).join(',') + ')');
    Inicio_borrarLayout_();
    throw new Error('Verificación INICIO falló en: ' + (detalle.length ? detalle.join(', ') : ver.fallos.join(', ')));
  }
  Libro_limpiarDirty_('INICIO');
  return { ok: true, verificacion: ver, lienzo: { filas: filas, columnas: cols }, metricas: metricas };
}

function Hojas_validacionCampo_(etiqueta) {
  var clave = Utl_claveAlnum(etiqueta);
  if (clave === 'FECHADENACIMIENTO') clave = 'FECHANACIMIENTO';
  var nombres = Object.keys(VALIDACIONES_CAMPOS);
  for (var i = 0; i < nombres.length; i++) {
    if (Utl_claveAlnum(nombres[i]) === clave) return VALIDACIONES_CAMPOS[nombres[i]];
  }
  return null;
}

/** PURA: ¿la validación existente de una celda coincide con la configurada?
 *  Lista → misma lista (mismo orden no exigido); Fecha → criterio de fecha. */
function Hojas_validacionCoincide_(dv, cfg) {
  if (!dv || typeof dv.getCriteria !== 'function') return false;
  try {
    var cr = dv.getCriteria();
    if (cfg.tipo === 'FECHA') {
      return String(cr) === 'DATE_IS_VALID_DATE';
    }
    if (cfg.tipo === 'LISTA') {
      if (String(cr) !== 'VALUE_IN_LIST') return false;
      var cv = typeof dv.getCriteriaValues === 'function' ? dv.getCriteriaValues() : [];
      var actual = cv && cv[0];
      if (!Array.isArray(actual)) return false;
      var esperados = cfg.valores || [];
      if (actual.length !== esperados.length) return false;
      var set = {};
      esperados.forEach(function (v) { set[String(v)] = 1; });
      return actual.every(function (v) { return set[String(v)] === 1; });
    }
    return false;
  } catch (eX) { return false; }
}

/** Aplica formatos de dato desde FORMATO_CAMPOS/FORMATO_TIPOS, incluso a
 *  filas aún vacías. El rango se acota a filas gestionadas y se compara
 *  completo: una columna correcta produce cero escrituras. */
function Hojas_aplicarFormatosNumero_(ss, opciones) {
  opciones = opciones || {}; ss = ss || Modelo_ss();
  var nombres = opciones.hojas || Object.keys(_MODELO_HOJAS_DEF), aplicados = 0, errores = [];
  var forzado = (opciones.cantidad !== undefined && opciones.cantidad !== null);
  nombres.forEach(function (nombre) {
    var h = ss.getSheetByName(nombre); if (!h) return;
    try {
      var hr = Modelo_headerRow(nombre), ini = opciones.filaInicial || Modelo_dataStartRow(nombre);
      if (h.getLastRow() < hr || h.getMaxRows() < ini) return;
      var cantidad = forzado ? Number(opciones.cantidad)
        : Math.max(Hojas_filasGestionadas_(h, nombre, opciones), 1);
      var labels = h.getRange(hr, 1, 1, Math.max(h.getLastColumn(), 1)).getValues()[0];
      labels.forEach(function (et, i) {
        if (!Utl_texto(et)) return;
        var formato = Formato_especificacionCampo_(et).formato;
        if (!formato) return;
        var ya = false;
        try {
          if (!forzado) {
            var actual = h.getRange(ini, i + 1, cantidad, 1);
            if (typeof actual.getNumberFormats === 'function') {
              ya = actual.getNumberFormats().every(function (fila) {
                return fila[0] === formato;
              });
            } else if (typeof actual.getNumberFormat === 'function') {
              ya = actual.getNumberFormat() === formato;
            }
          }
        } catch (eN) { ya = false; }
        if (ya) return;
        h.getRange(ini, i + 1, cantidad, 1).setNumberFormat(formato); aplicados++;
      });
    } catch (e) { errores.push(nombre + ': ' + (e && e.message || e)); }
  });
  return { ok: errores.length === 0, aplicados: aplicados, errores: errores };
}

function Hojas_aplicarValidaciones_(ss, opciones) {
  opciones = opciones || {}; ss = ss || Modelo_ss();
  // Las puertas INGRESO_* pertenecen exclusivamente a Modelo_validarIngresos.
  var nombres = opciones.hojas || [HOJAS.PACIENTES].concat(HOJAS_SECTOR);
  var forzado = (opciones.cantidad !== undefined && opciones.cantidad !== null);
  var aplicadas = 0, errores = [];
  nombres.forEach(function (nombre) {
    var h = ss.getSheetByName(nombre); if (!h) return;
    try {
      var hr = Modelo_headerRow(nombre), ini = opciones.filaInicial || Modelo_dataStartRow(nombre);
      if (h.getLastRow() < hr || h.getMaxRows() < ini) return;
      var cantidad = forzado ? Number(opciones.cantidad)
        : Math.max(Hojas_filasGestionadas_(h, nombre, opciones), 1);
      var labels = h.getRange(hr, 1, 1, Math.max(h.getLastColumn(), 1)).getValues()[0];
      labels.forEach(function (et, i) {
        var cfg = Hojas_validacionCampo_(et); if (!cfg) return;
        if (!forzado) {
          try {
            var cell = h.getRange(ini, i + 1);
            if (typeof cell.getDataValidation === 'function' &&
                Hojas_validacionCoincide_(cell.getDataValidation(), cfg)) return;
          } catch (eV) {}
        }
        var b = SpreadsheetApp.newDataValidation();
        if (cfg.tipo === 'LISTA') b.requireValueInList(cfg.valores, true);
        else if (cfg.tipo === 'FECHA') b.requireDate();
        b.setAllowInvalid(cfg.permitirVacio === true);
        h.getRange(ini, i + 1, cantidad, 1).setDataValidation(b.build()); aplicadas++;
      });
    } catch (e) { errores.push(nombre + ': ' + (e && e.message || e)); }
  });
  return { ok: errores.length === 0, aplicadas: aplicadas, errores: errores };
}

function Hojas_aplicarNotas_(ss) {
  ss = ss || Modelo_ss();
  var notas = {
    RUT: 'Formato: 12345678-5. ECICEP valida el dígito verificador.',
    PROXIMO_CONTROL: 'Próxima atención agendada manualmente desde Captura o la ficha.',
    ESTADO_INGRESO: 'Al seleccionar INGRESADO, ECICEP ejecuta la incorporación al sistema. El backend confirmará el estado final.',
    NOTA_SISTEMA: 'Campo generado automáticamente por ECICEP.'
  }, aplicadas = 0;
  [HOJAS.PACIENTES].concat(Object.keys(HOJAS_INGRESO), HOJAS_SECTOR).forEach(function (nombre) {
    var h = ss.getSheetByName(nombre); if (!h || h.getLastRow() < Modelo_headerRow(nombre)) return;
    var hr = Modelo_headerRow(nombre), rango = h.getRange(hr, 1, 1, h.getLastColumn());
    var labels = rango.getValues()[0], actuales;
    try { actuales = typeof rango.getNotes === 'function' ? rango.getNotes()[0] : labels.map(function () { return ''; }); }
    catch (eN) { actuales = labels.map(function () { return ''; }); }
    var deseadas = actuales.slice(), cambio = false;
    labels.forEach(function (et, i) {
      var nota = notas[Utl_texto(et).toUpperCase()];
      if (!nota || actuales[i] === nota) return;
      deseadas[i] = nota; cambio = true; aplicadas++;
    });
    if (cambio && typeof rango.setNotes === 'function') rango.setNotes([deseadas]);
    else if (cambio) labels.forEach(function (et, i) {
      if (deseadas[i] !== actuales[i]) h.getRange(hr, i + 1).setNote(deseadas[i]);
    });
  });
  return { ok: true, aplicadas: aplicadas };
}

/** Wrapper compatible: las reglas condicionales ECICEP son system-managed. */
function Hojas_formatoCondicional(ss) {
  ss = ss || Modelo_ss();
  return Hojas_aplicarFormatoCondicional_(ss);
}

function Hojas_prepararRangoDatos_(nombreHoja, filaInicial, cantidad) {
  var ss = Modelo_ss(), h = ss.getSheetByName(nombreHoja);
  if (!h || cantidad <= 0) return { ok: false, motivo: 'RANGO_NO_DISPONIBLE' };
  var familia = (HOJAS_UX[nombreHoja] || {}).familia;
  var fondo = familia === 'vista' ? DESIGN_SYSTEM.HOJAS.derivado.fondo : DESIGN_SYSTEM.HOJAS.editable.fondo;
  h.getRange(filaInicial, 1, cantidad, Math.max(h.getLastColumn(), 1))
    .setBackground(fondo).setFontSize(DESIGN_SYSTEM.TIPOGRAFIA.datos)
    .setVerticalAlignment(DESIGN_SYSTEM.MEDIO);
  // Modelo_validarIngresos es el owner exclusivo de reglas de INGRESO_*.
  if (familia === 'entrada') Modelo_validarIngresos(ss, { hoja: nombreHoja,
    filaInicial: filaInicial, cantidad: cantidad });
  else Hojas_aplicarValidaciones_(ss, { hojas: [nombreHoja], filaInicial: filaInicial, cantidad: cantidad });
  Hojas_aplicarFormatosNumero_(ss, { hojas: [nombreHoja], filaInicial: filaInicial, cantidad: cantidad });
  Hojas_aplicarSemanticaColumnas_(h, { filaInicial: filaInicial, cantidad: cantidad });
  try { h.setRowHeights(filaInicial, cantidad, DESIGN_SYSTEM.ALTURAS.dato); } catch (e) {}
  return { ok: true, hoja: nombreHoja, filaInicial: filaInicial, cantidad: cantidad };
}

/** Diferencia visualmente columnas editables, derivadas y técnicas por nombre.
 *  Fast-path 0.12.1: rango acotado a filas gestionadas; columna cuya primera
 *  celda de datos ya tiene fondo/tinta correctos = cero escrituras. */
function Hojas_aplicarSemanticaColumnas_(hoja, opciones) {
  opciones = opciones || {};
  var nombre = hoja.getName(), ux = HOJAS_UX[nombre] || {}, hr = Modelo_headerRow(nombre);
  var ini = opciones.filaInicial || Modelo_dataStartRow(nombre);
  if (hoja.getLastRow() < hr || hoja.getMaxRows() < ini) return { ok:true, columnas:0 };
  var labels = hoja.getRange(hr, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
  var filas = opciones.cantidad === undefined
    ? Math.max(Hojas_filasGestionadas_(hoja, nombre), 1) : Number(opciones.cantidad);
  var aplicadas = 0;
  var tecnicasPac = {};
  MODELO_PACIENTE.forEach(function (c) { if (c.tecnico) tecnicasPac[c.campo] = true; });
  labels.forEach(function (et, i) {
    var campo = Utl_texto(et).toUpperCase(), estilo = DESIGN_SYSTEM.HOJAS.editable;
    if (ux.familia === 'vista') estilo = DESIGN_SYSTEM.HOJAS.derivado;
    else if (ux.familia === 'tecnica' || ux.familia === 'historial') estilo = DESIGN_SYSTEM.HOJAS.tecnico;
    else if (nombre === HOJAS.PACIENTES && tecnicasPac[campo]) estilo = DESIGN_SYSTEM.HOJAS.sistema;
    else if (ux.familia === 'entrada' && campo === 'NOTA_SISTEMA') estilo = DESIGN_SYSTEM.HOJAS.sistema;
    var especificacion = Formato_especificacionCampo_(et);
    var alineacion = String(especificacion.alineacion || 'LEFT').toUpperCase();
    var wrap = especificacion.wrap === true, ya = false;
    // v0.14 §60: estrategia de ajuste canónica con compat temporal al booleano.
    var estrategia = String(especificacion.wrapStrategy || (wrap ? 'WRAP' : 'CLIP')).toUpperCase();
    if (['WRAP', 'CLIP', 'OVERFLOW'].indexOf(estrategia) === -1) estrategia = wrap ? 'WRAP' : 'CLIP';
    var vertical = String(especificacion.vertical || 'MIDDLE').toUpperCase();
    try {
      var actual = hoja.getRange(ini, i + 1, filas, 1);
      ya = typeof actual.getBackgrounds === 'function' && actual.getBackgrounds().every(function (f) { return f[0] === estilo.fondo; }) &&
        typeof actual.getFontColors === 'function' && actual.getFontColors().every(function (f) { return f[0] === estilo.tinta; }) &&
        typeof actual.getHorizontalAlignments === 'function' && actual.getHorizontalAlignments().every(function (f) {
          return String(f[0] || '').toUpperCase() === alineacion;
        }) && typeof actual.getWraps === 'function' && actual.getWraps().every(function (f) { return f[0] === wrap; }) &&
        (typeof actual.getVerticalAlignments !== 'function' || actual.getVerticalAlignments().every(function (f) {
          return String(f[0] || '').toUpperCase() === vertical;
        })) && (typeof actual.getWrapStrategies !== 'function' || actual.getWrapStrategies().every(function (f) {
          return String(f && f[0]).toUpperCase().indexOf(estrategia) !== -1;
        })) && (especificacion.fontSize === undefined || typeof actual.getFontSizes !== 'function' ||
          actual.getFontSizes().every(function (f) { return Number(f[0]) === Number(especificacion.fontSize); }));
    } catch (eS) { ya = false; }
    if (ya) return;
    var destino = hoja.getRange(ini, i + 1, filas, 1).setBackground(estilo.fondo).setFontColor(estilo.tinta)
      .setHorizontalAlignment(alineacion.toLowerCase());
    if (typeof destino.setWrapStrategy === 'function' && typeof SpreadsheetApp !== 'undefined' &&
        SpreadsheetApp.WrapStrategy && SpreadsheetApp.WrapStrategy[estrategia])
      destino.setWrapStrategy(SpreadsheetApp.WrapStrategy[estrategia]);
    else if (typeof destino.setWrap === 'function') destino.setWrap(wrap);
    if (typeof destino.setVerticalAlignment === 'function') destino.setVerticalAlignment(vertical.toLowerCase());
    if (especificacion.fontSize !== undefined && typeof destino.setFontSize === 'function')
      destino.setFontSize(Number(especificacion.fontSize));
    aplicadas++;
  });
  return { ok:true, columnas:aplicadas };
}

function Hojas_asegurarCapacidad_(hoja, filaNecesaria, opciones) {
  opciones = opciones || {};
  if (!hoja || typeof hoja.getMaxRows !== 'function' || typeof hoja.insertRowsAfter !== 'function')
    return { ok: true, expandida: false, omitida: true };
  var max = hoja.getMaxRows(), reserva = Number(opciones.reserva || 50);
  if (filaNecesaria + reserva <= max) return { ok: true, expandida: false, maxRows: max };
  var bloque = Math.max(Number(opciones.bloque || 200), filaNecesaria + reserva - max);
  hoja.insertRowsAfter(max, bloque);
  Hojas_prepararRangoDatos_(hoja.getName(), max + 1, bloque);
  return { ok: true, expandida: true, agregadas: bloque, maxRows: max + bloque };
}

/** Nombre explícito v0.12.2; conserva el helper histórico como contrato. */
function Hojas_asegurarCapacidadGestionada_(hoja, filaNecesaria, opciones) {
  return Hojas_asegurarCapacidad_(hoja, filaNecesaria, opciones);
}

function Hojas_colorPestana_(nombre) {
  var ux = HOJAS_UX[nombre] || {}, sector = ux.sector || '';
  if (nombre === 'INICIO') return DESIGN_SYSTEM.MARCA.sistemaProfundo;
  if (nombre === 'PACIENTES' || nombre === 'EVENTOS') return DESIGN_SYSTEM.MARCA.sistema;
  if (sector === 'NARANJO') return ux.familia === 'vista' ? PALETA_SECCION.NARANJO.encabezado : IDENTIDAD.NARANJO;
  if (sector === 'AMARILLO') return ux.familia === 'vista' ? PALETA_SECCION.AMARILLO.encabezado : IDENTIDAD.AMARILLO;
  if (sector === 'VERDE') return ux.familia === 'vista' ? PALETA_SECCION.VERDE.encabezado : IDENTIDAD.VERDE;
  if (nombre === 'REM_SALIDA') return DESIGN_SYSTEM.MARCA.reporte;
  return DESIGN_SYSTEM.MARCA.tecnico;
}
function Hojas_ordenObjetivo_() {
  return ['INICIO','PACIENTES','INGRESO_NARANJO','INGRESO_AMARILLO','INGRESO_VERDE',
    'SECTOR_NARANJO','SECTOR_AMARILLO','SECTOR_VERDE','REM_SALIDA'];
}
function Hojas_ordenar_(ss) {
  ss = ss || Modelo_ss(); var activa = ss.getActiveSheet(), ordenadas = 0, pos = 1;
  var visibles = ss.getSheets().filter(function (h) { return !h.isSheetHidden(); });
  var indices = {}; visibles.forEach(function (h, i) { indices[h.getName()] = i + 1; });
  Hojas_ordenObjetivo_().forEach(function (n) {
    var h = ss.getSheetByName(n); if (!h || h.isSheetHidden()) return;
    if (indices[n] !== pos) {
      ss.setActiveSheet(h, false); ss.moveActiveSheet(pos); ordenadas++;
      visibles = ss.getSheets().filter(function (x) { return !x.isSheetHidden(); });
      indices = {}; visibles.forEach(function (x, i) { indices[x.getName()] = i + 1; });
    }
    pos++;
  });
  try { if (activa) ss.setActiveSheet(activa, false); } catch (e) {}
  return { ok: true, ordenadas: ordenadas };
}

function Hojas_esProteccionEcicep_(pr) {
  try { return Utl_texto(pr.getDescription()).indexOf('ECICEP:') === 0; }
  catch (e) { return false; }
}

function Triggers_diagnosticarOnChangeLibro_() {
  var ts = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'ECICEP_onChangeLibro'; });
  return { ok: ts.length === 1, estado: ts.length === 1 ? 'OK' : (ts.length ? 'DUPLICADO' : 'FALTA'), total: ts.length };
}
function Triggers_asegurarOnChangeLibro_() {
  var ts = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'ECICEP_onChangeLibro'; });
  for (var i = 1; i < ts.length; i++) ScriptApp.deleteTrigger(ts[i]);
  if (!ts.length) ScriptApp.newTrigger('ECICEP_onChangeLibro').forSpreadsheet(Modelo_ss()).onChange().create();
  return { ok: true, estado: 'OK', creados: ts.length ? 0 : 1, eliminados: Math.max(ts.length - 1, 0) };
}
function ECICEP_onChangeLibro(e) {
  var tipo = e && e.changeType || '';
  if (['INSERT_ROW','INSERT_COLUMN','REMOVE_ROW','REMOVE_COLUMN','INSERT_GRID','REMOVE_GRID','FORMAT'].indexOf(tipo) < 0)
    return { ok: true, omitido: true };
  Libro_marcarDirty_('ESTRUCTURA'); Libro_marcarDirty_('VISUAL');
  Libro_marcarDirty_('VALIDACIONES'); Libro_marcarDirty_('INICIO');
  return { ok: true, marcado: true, tipo: tipo };
}

function Libro_repararEjecucion_() {
  // Clave estable por usuario para reanudar el MISMO cursor entre llamadas.
  try {
    var k = Utl_texto(Session.getTemporaryActiveUserKey()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    return k ? 'MENU|' + k : 'MENU|ANON';
  } catch (e) { return 'MENU|ANON'; }
}

/** §8: Reparar presentación = MISMO motor reanudable del instalador.
 *  Wrapper fino sobre Presentacion_ejecutarPaso_: mismo plan, mismo cursor,
 *  mismo post-check; sin orquestador paralelo. Reanuda entre clics. */
function Libro_repararPresentacion_(opciones) {
  opciones = opciones || {};
  var clave = opciones.ejecucion || Libro_repararEjecucion_();
  var r = Presentacion_ejecutarPaso_('diseno', clave);
  var pasos = 1, MAX = 6; // ≈ 2 min por acción de menú; si queda trabajo, se reanuda.
  while (r.ok !== false && r.continuar === true && pasos < MAX) {
    r = Presentacion_ejecutarPaso_('diseno', clave);
    pasos++;
  }
  return r;
}
function Libro_mantenimiento_(opciones) {
  opciones = opciones || {}; var d = Libro_leerDirty_(), r = { ok: true, presentacion: null, inicio: null };
  var necesitaVisual = opciones.forzar === true || d.VISUAL || d.VALIDACIONES || d.ESTRUCTURA;
  if (necesitaVisual && opciones.visualYaProcesado !== true) r.presentacion = Libro_repararPresentacion_({ forzar: opciones.forzar === true });
  if (opciones.refrescarInicio !== false && (opciones.forzar === true || d.INICIO)) r.inicio = Inicio_refrescarSiNecesario_();
  r.ok = (!r.presentacion || r.presentacion.ok !== false) && (!r.inicio || r.inicio.ok !== false);
  return r;
}
function UI_actualizarInicio() {
  var r = Inicio_refrescar_({ forzar: true });
  Utl_toast(r.ok ? 'ok' : 'error', r.ok ? 'Inicio actualizado' : (r.motivo || 'No se pudo actualizar Inicio'), 5);
  return r;
}
function UI_irInicio() {
  var ss = Modelo_ss(), h = ss.getSheetByName('INICIO');
  if (h) ss.setActiveSheet(h, false);
  return { ok: !!h };
}
/** @deprecated v0.14 — wrapper interno, YA NO es acción principal del menú.
 *  La reconstrucción de INICIO vive en el instalador (opción avanzada
 *  "Forzar reconstrucción de INICIO" → motor único de Presentación).
 *  Se conserva para compatibilidad (tests / callers internos).
 *  Reconstruye SOLO la portada, en una sola invocación y sin depender del plan de
 *  presentación. Es la vía directa para dejar INICIO al día cuando el resto del
 *  libro ya está presentado (regresión 2026-09-25: la subtarea 'inicio' quedaba
 *  fuera del presupuesto de un clic y la hoja no cambiaba). */
function UI_reconstruirInicio() {
  var ui = _UI_get();
  // El ítem del menú es una acción EXPLÍCITA del usuario: fuerza la
  // reconstrucción completa (marco, dimensiones, estilos y cifras). Si no se
  // forzara, el fast path del layout vigente solo refrescaría las cifras y el
  // marco de color nunca se redibujaría tras una corrección visual.
  var r = Inicio_construir_(Modelo_ss(), { forzar: true });
  if (r.ok === false) {
    ui.alert('Portada INICIO', 'No se pudo reconstruir la portada: ' +
      (r.motivo || 'error desconocido') + '\n\nRepite la acción; es idempotente.', ui.ButtonSet.OK);
    return r;
  }
  var v = r.verificacion || {};
  ui.alert('Portada INICIO', 'Portada reconstruida: hero, KPIs, cards por sector, distribución, estado, '
      + 'pendientes, alerta y marco de color.\nVerificación: ' + (v.ok === true ? 'correcta' : (v.fallos || []).join(', ')),
    ui.ButtonSet.OK);
  return r;
}
function UI_repararPresentacion() {
  // @deprecated v0.14 — wrapper interno, YA NO es acción principal del menú.
  // La reparación visual vive en el instalador (botón "Reparar solo
  // presentación" → Libro_repararPresentacion_ → motor único). Se conserva
  // para compatibilidad (tests / callers internos).
  var ui = _UI_get();
  if (typeof Presentacion_layoutVigente_ !== 'function' || !Presentacion_layoutVigente_()) {
    var resp = ui.alert('Reparar presentación',
      'Se realineará el libro a v' + ECICEP.VERSION + ' (portada INICIO 30 columnas, formatos, validaciones y paridad INGRESO/SECTOR). No modifica datos clínicos. ¿Continuar?',
      ui.ButtonSet.YES_NO);
    if (resp !== ui.Button.YES) return { ok: true, cancelada: true };
  }
  var r = Libro_repararPresentacion_();
  if (r.ok === false) {
    ui.alert('Reparación incompleta',
      (r.motivo || 'Subtarea de presentación fallida') + '\n\nEjecuta de nuevo Reparar presentación: reintenta la misma subtarea (idempotente).',
      ui.ButtonSet.OK);
    return r;
  }
  if (r.continuar === true) {
    ui.alert('Presentación en proceso',
      'La reparación es reanudable y aún no termina. Ejecuta de nuevo Reparar presentación para continuar.',
      ui.ButtonSet.OK);
    return r;
  }
  var v = r.verificacion, mensaje, titulo;
  if (v && v.ok === true) {
    titulo = 'Presentación reparada';
    mensaje = 'Presentación alineada al diseño vigente: 0 pendientes y paridad INGRESO/SECTOR convergente.';
  } else {
    titulo = 'Presentación reparada (presentación incompleta)';
    var n = v && v.diferencias ? v.diferencias.length : (r.pendientes || 0);
    mensaje = 'Sin errores de subtarea, pero restan ' + n + ' divergencia(s) visual(es).\n';
    if (v && v.topDivergencias && v.topDivergencias.length)
      mensaje += 'Principales: ' + v.topDivergencias.join(', ') + '\n';
    mensaje += 'Reintenta Reparar presentación o usa Instalar / reparar.';
  }
  ui.alert(titulo, mensaje, ui.ButtonSet.OK);
  return r;
}
