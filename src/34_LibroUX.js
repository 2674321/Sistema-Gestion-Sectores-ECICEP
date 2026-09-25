/**
 * ECICEP v0.13.0 — experiencia del libro, snapshots y mantenimiento selectivo.
 * Solo persiste métricas agregadas/flags técnicos; nunca PII.
 */
var LIBRO_DIRTY_PROP = 'ECICEP_LIBRO_DIRTY_V012';
var INICIO_SNAPSHOT_PROP = 'ECICEP_INICIO_SNAPSHOT_V012';
var INICIO_LAYOUT_PROP = 'ECICEP_INICIO_LAYOUT_V014';
var INICIO_LAYOUT_VERSION = '0.14.0';
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
    rutInvalidos: 0, duplicados: 0, pendientesIngreso: 0, vencidos: 0,
    porVencer: 0, sinProximaAtencion: 0, sectores: {} };
  ['NARANJO', 'AMARILLO', 'VERDE'].forEach(function (s) {
    m.sectores[s] = { pacientes: 0, pendientesIngreso: 0, revision: 0,
      proximaAtencion: 0 };
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
    if (['G1', 'G2', 'G3'].indexOf(Utl_texto(p.ESTRATIFICACION).toUpperCase()) < 0)
      m.estratificacionPendiente++;
    if (p.RUT_DV_VALIDO === false || Utl_texto(p.RUT_DV_VALIDO).toUpperCase() === 'FALSE') m.rutInvalidos++;
    var rut = Utl_texto(p.RUT).replace(/\./g, '').toUpperCase();
    if (rut) ruts[rut] = (ruts[rut] || 0) + 1;
    var prox = Control_aIso(p.PROXIMO_CONTROL);
    if (!prox) m.sinProximaAtencion++;
    else if (prox < hoy) m.vencidos++;
    else if (prox <= limiteIso) { m.porVencer++; if (sec) sec.proximaAtencion++; }
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
function Inicio_escribirMetricas_(m, hoja) {
  hoja = hoja || Modelo_ss().getSheetByName('INICIO');
  if (!hoja || !m) return { ok: false, motivo: 'INICIO_NO_DISPONIBLE' };
  var iniciosSector = [1, 11, 21];
  var nombresSector = ['NARANJO', 'AMARILLO', 'VERDE'];
  var clavesSector = ['pacientes', 'pendientesIngreso', 'revision', 'proximaAtencion'];
  var rangosValor = [];
  nombresSector.forEach(function (s, i) {
    var x = (m.sectores || {})[s] || {};
    clavesSector.forEach(function (clave, f) {
      rangosValor.push({ a1: Inicio_a1_(11 + f, iniciosSector[i] + 7, 3), valor: x[clave] || 0 });
    });
  });
  Inicio_escribirValores_(hoja, rangosValor);
  var pendientes = [m.vencidos, m.porVencer, m.sinProximaAtencion, m.revision];
  Inicio_escribirValores_(hoja, ['AC20:AD20', 'AC21:AD21', 'AC22:AD22', 'AC23:AD23'].map(function (a2, i) {
    return { a1: a2, valor: pendientes[i] || 0 };
  }));
  var salud = m.salud || {};
  var integridad = salud.integridad || {};
  var estadoIntegridad = integridad.derivadosOk === false ? 'ERROR' :
    (integridad.evidenciaSoloReporte || integridad.stale || integridad.ok === false ||
      (integridad.ok !== true && integridad.derivadosOk !== true)) ? 'ADVERTENCIA' : 'OK';
  var estados = [
    salud.datos ? (salud.datos.ok ? 'OK' : 'ERROR') : 'ADVERTENCIA',
    estadoIntegridad,
    salud.triggers && salud.triggers.ingresoOnEdit ? 'OK' : 'ADVERTENCIA',
    salud.triggers && salud.triggers.backup ? 'OK' : 'ADVERTENCIA'
  ];
  var rangosEstado = ['I20:O20', 'I21:O21', 'I22:O22', 'I23:O23'];
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
  var resumen = estadoGeneral === 'ERROR' ? 'ERROR · revisar el estado del sistema' :
    estadoGeneral === 'ADVERTENCIA' && atencion > 0 ? 'ADVERTENCIA · ' +
      Inicio_numeroVisible_(atencion) + ' alertas requieren atención operativa' :
    estadoGeneral === 'ADVERTENCIA' ? 'ADVERTENCIA · revisar la configuración operativa' :
      'OK · sistema listo para operar';
  hoja.getRange('A3:AD3').setValue('● ' + estadoGeneral + ' · ' + Inicio_numeroVisible_(atencion) +
      ' alertas operativas · ' + Inicio_numeroVisible_(m.pacientes) + ' personas en seguimiento')
    .setBackground(tokenGeneral.fondo).setFontColor(tokenGeneral.tinta);
  Inicio_escribirValores_(hoja, [['A9:F9', m.pacientes], ['G9:L9', m.eventos], ['M9:R9', m.revision],
    ['S9:X9', m.vencidos], ['Y9:AD9', atencion]].map(function (k) {
      return { a1: k[0], valor: Inicio_numeroVisible_(k[1]) };
    }));
  var totalPersonas = Number(m.pacientes || 0);
  var sectoresOrden = ['NARANJO', 'AMARILLO', 'VERDE'];
  var personasSector = sectoresOrden.map(function (s) {
    return Number(((m.sectores || {})[s] || {}).pacientes || 0);
  });
  // Redondeo con mayor resto: los porcentajes individuales suman 100 exacto.
  var porcentajesSector = Inicio_porcentajesRedondeados_(personasSector, totalPersonas);
  Inicio_escribirValores_(hoja, sectoresOrden.map(function (s, i) {
    var porcentaje = porcentajesSector[i];
    return { a1: Inicio_a1_(16, iniciosSector[i], 10),
      valor: Inicio_numeroVisible_(personasSector[i]) + ' personas · ' + Inicio_numeroVisible_(porcentaje) + ' % del total' };
  }));
  hoja.getRange('A24:AD25').setValue('ALERTA OPERATIVA · ' + estadoGeneral + ' · ' +
      Inicio_numeroVisible_(atencion) + ' alertas requieren atención · Revisión ' +
      Inicio_numeroVisible_(m.revision) + ' · Vencidos ' + Inicio_numeroVisible_(m.vencidos) +
      ' · Sin próxima atención ' + Inicio_numeroVisible_(m.sinProximaAtencion) +
      ' · Ingresos pendientes ' + Inicio_numeroVisible_(m.pendientesIngreso))
    .setBackground(tokenGeneral.fondo).setFontColor(tokenGeneral.tinta);
  hoja.getRange('A2:AD2').setValue('Gestión por sectores · ' + Inicio_numeroVisible_(m.pacientes) + ' personas · ' +
    Inicio_numeroVisible_(m.eventos) + ' eventos · actualizado ' + Inicio_fechaVisible_(m.fecha));
  hoja.getRange('A27:AD29').setValue(resumen + '\nDatos ' + Inicio_fechaVisible_(m.fecha) +
    '  ·  Auditoría ' + Inicio_fechaVisible_(m.ultimaAuditoria) +
    '  ·  Respaldo ' + Inicio_fechaVisible_(m.ultimoBackup))
    .setBackground(tokenGeneral.fondo).setFontColor(tokenGeneral.tinta);
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

function Inicio_fingerprintEsperado_() {
  var contrato = {
    panel: 'PANEL_OPERATIVO_V014', rango: INICIO_RANGO_GESTIONADO,
    header: ['A1:AD1', 'A2:AD2'],
    hero: 'A3:AD3',
    accesos: ['A4:F7', 'G4:L7', 'M4:R7', 'S4:X7', 'Y4:AD7'],
    acceso3: 'INGRESOS',
    kpiBand: ['A8:F8', 'G8:L8', 'M8:R8', 'S8:X8', 'Y8:AD8'],
    kpiSub: ['A9:F9', 'G9:L9', 'M9:R9', 'S9:X9', 'Y9:AD9'],
    cards: ['A10:J10', 'K10:T10', 'U10:AD10'],
    distribucion: ['A15:J15', 'K15:T15', 'U15:AD15'],
    distribucionValor: ['A16:J16', 'K16:T16', 'U16:AD16'],
    estado: 'A18:O18', pendientes: 'P18:AD18',
    alerta: 'A24:AD25',
    metadata: 'A27:AD29', nota: 'A32:AD34',
    ancho: 38, freeze: [2, 0]
  };
  return 'v014|' + Utl_fnv1a32_(JSON.stringify(contrato));
}
function Inicio_mergesEsperados_() {
  var merges = ['A1:AD1', 'A2:AD2', 'A3:AD3', 'A4:F7', 'G4:L7', 'M4:R7', 'S4:X7', 'Y4:AD7'];
  [['A8', 'F8', 'A9', 'F9'], ['G8', 'L8', 'G9', 'L9'], ['M8', 'R8', 'M9', 'R9'],
    ['S8', 'X8', 'S9', 'X9'], ['Y8', 'AD8', 'Y9', 'AD9']].forEach(function (k) {
      merges.push(k[0] + ':' + k[1]);
      merges.push(k[2] + ':' + k[3]);
    });
  merges.push('A10:J10', 'K10:T10', 'U10:AD10');
  [['A15', 'J15', 'A16', 'J16'], ['K15', 'T15', 'K16', 'T16'], ['U15', 'AD15', 'U16', 'AD16']]
    .forEach(function (k) {
      merges.push(k[0] + ':' + k[1]);
      merges.push(k[2] + ':' + k[3]);
    });
  merges.push('A18:O18', 'P18:AD18', 'A24:AD25', 'A27:AD29', 'A32:AD34');
  [[1, 'A', 'G', 'H', 'J'], [11, 'K', 'Q', 'R', 'T'], [21, 'U', 'AA', 'AB', 'AD']]
    .forEach(function (s) {
      for (var fila = 11; fila <= 14; fila++) {
        merges.push(s[1] + fila + ':' + s[2] + fila);
        merges.push(s[3] + fila + ':' + s[4] + fila);
      }
    });
  for (var estado = 20; estado <= 23; estado++) {
    merges.push('A' + estado + ':H' + estado);
    merges.push('I' + estado + ':O' + estado);
    merges.push('P' + estado + ':AB' + estado);
    merges.push('AC' + estado + ':AD' + estado);
  }
  return merges.sort();
}
function Inicio_alturasEsperadas_() {
  return [[1, 32], [2, 22], [3, 26], [4, 22], [5, 22], [6, 22], [7, 22],
    [8, 16], [9, 30], [10, 30], [11, 20], [12, 20], [13, 20], [14, 20],
    [15, 18], [16, 24], [17, 8], [18, 26], [19, 8], [20, 21], [21, 21],
    [22, 21], [23, 21], [24, 14], [25, 20], [26, 8], [27, 22], [28, 22],
    [29, 22], [30, 10], [31, 10], [32, 22], [33, 22], [34, 22]];
}
function Inicio_colorOscuro_(color) {
  var hex = Utl_texto(color).replace('#', '');
  if (!/^[0-9A-F]{6}$/i.test(hex)) return false;
  var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 105;
}
/** Verificación estructural completa de la portada; no consulta datos clínicos. */
function Inicio_verificar_(h) {
  var ver = { hoja: !!h, layoutVersion: false, rangoGestionado: INICIO_RANGO_GESTIONADO === 'A1:AD38',
    dimensiones: false, titulo: false, subtitulo: false, accesos: false, tarjetas: false,
    bloques: false, merges: false, freeze: false, freezeSeguro: false, anchos: false,
    alturas: false, coloresBase: false, fondoClaro: false, snapshot: false };
  if (!h) { ver.ok = false; ver.fallos = ['hoja']; return ver; }
  var props = Libro_propiedades_(), raw = '', meta = null;
  try { raw = props && props.getProperty(INICIO_LAYOUT_PROP); meta = raw ? JSON.parse(raw) : null; }
  catch (eP) { meta = null; }
  ver.layoutVersion = !!meta && meta.version === INICIO_LAYOUT_VERSION &&
    meta.fingerprint === Inicio_fingerprintEsperado_();
  try { ver.dimensiones = h.getMaxRows() >= 38 && h.getMaxColumns() >= 30; } catch (eD) {}
  try {
    var titulo = Utl_texto(h.getRange('A1').getValue());
    ver.titulo = titulo.indexOf('ECICEP') !== -1 && titulo.indexOf(ECICEP.VERSION) !== -1;
    ver.subtitulo = Utl_texto(h.getRange('A2').getValue()).indexOf('Gestión por sectores') !== -1;
  } catch (eT) {}
  try {
    ver.accesos = ['A4', 'G4', 'M4', 'S4', 'Y4'].every(function (a1) {
      return Utl_texto(h.getRange(a1).getFormula()).indexOf('HYPERLINK') !== -1;
    });
  } catch (eA) {}
  try {
    ver.tarjetas = ['A10', 'K10', 'U10'].map(function (a1) { return Utl_texto(h.getRange(a1).getValue()); })
      .join('|') === 'NARANJO|AMARILLO|VERDE' &&
      Utl_texto(h.getRange('A11').getValue()) === 'Personas' &&
      Utl_texto(h.getRange('A14').getValue()) === 'Próxima atención' &&
      ['OK', 'ADVERTENCIA', 'ERROR'].some(function (e) {
        return Utl_texto(h.getRange('A3').getValue()).indexOf(e) !== -1;
      }) &&
      ['A8', 'G8', 'M8', 'S8', 'Y8'].map(function (a1) { return Utl_texto(h.getRange(a1).getValue()); })
        .join('|') === 'PERSONAS|EVENTOS|REVISIÓN PENDIENTE|CONTROLES VENCIDOS|ALERTAS OPERATIVAS' &&
      ['A15', 'K15', 'U15'].map(function (a1) { return Utl_texto(h.getRange(a1).getValue()); })
        .join('|') === 'NARANJO|AMARILLO|VERDE' &&
      !!Utl_texto(h.getRange('A24').getValue());
    ver.bloques = Utl_texto(h.getRange('A18').getValue()) === 'ESTADO DEL SISTEMA' &&
      Utl_texto(h.getRange('P18').getValue()) === 'PENDIENTES' && !!Utl_texto(h.getRange('A27').getValue());
    ver.snapshot = h.getRange('H11').getFormula() === '' && h.getRange('AC20').getFormula() === '' &&
      h.getRange('A9').getFormula() === '' && h.getRange('A16').getFormula() === '';
  } catch (eC) {}
  try {
    var rangos = h.getRange(INICIO_RANGO_GESTIONADO).getMergedRanges();
    var reales = rangos.map(function (r) { return r.getA1Notation(); }).sort();
    var esperados = Inicio_mergesEsperados_();
    ver.merges = reales.length === esperados.length && reales.every(function (a1, i) { return a1 === esperados[i]; });
    ver.freezeSeguro = rangos.every(function (r) {
      return !(r.getRow() <= 2 && r.getRow() + r.getNumRows() - 1 > 2);
    });
  } catch (eM) {}
  try { ver.freeze = h.getFrozenRows() === 2 && h.getFrozenColumns() === 0; } catch (eF) {}
  try {
    ver.anchos = true;
    for (var col = 1; col <= 30; col++) if (h.getColumnWidth(col) !== 38) { ver.anchos = false; break; }
  } catch (eW) { ver.anchos = false; }
  try {
    ver.alturas = Inicio_alturasEsperadas_().every(function (x) { return h.getRowHeight(x[0]) === x[1]; });
  } catch (eH) {}
  try {
    var M = DESIGN_SYSTEM.MARCA, blanco = DESIGN_SYSTEM.SUPERFICIE.datos;
    ver.coloresBase = Utl_colorIgual(h.getRange('A1').getBackground(), M.sistemaProfundo) &&
      Utl_colorIgual(h.getRange('A4').getBackground(), blanco) &&
      Utl_colorIgual(h.getRange('A18').getBackground(), M.sistema) &&
      Utl_colorIgual(h.getRange('A20').getBackground(), blanco) &&
      Utl_colorIgual(h.getRange('P18').getBackground(), M.sistema) &&
      Utl_colorIgual(h.getRange('P20').getBackground(), blanco) &&
      Utl_colorIgual(h.getRange('A10').getBackground(), IDENTIDAD.NARANJO) &&
      Utl_colorIgual(h.getRange('K10').getBackground(), IDENTIDAD.AMARILLO) &&
      Utl_colorIgual(h.getRange('U10').getBackground(), IDENTIDAD.VERDE) &&
      Utl_colorIgual(h.getRange('A8').getBackground(), M.sistema) &&
      Utl_colorIgual(h.getRange('A9').getBackground(), blanco) &&
      Utl_colorIgual(h.getRange('A15').getBackground(), IDENTIDAD.NARANJO) &&
      Utl_colorIgual(h.getRange('A16').getBackground(), blanco) &&
      ['OK', 'ALERTA', 'ERROR'].some(function (k) {
        return Utl_colorIgual(h.getRange('A24').getBackground(), DESIGN_SYSTEM.ESTADOS[k].fondo);
      });
    var fondos = h.getRange('A1:AD29').getBackgrounds(), oscuros = 0, total = 0;
    fondos.forEach(function (fila) { fila.forEach(function (color) {
      total++; if (Inicio_colorOscuro_(color)) oscuros++;
    }); });
    ver.fondoClaro = total > 0 && oscuros / total <= 0.15;
  } catch (eB) {}
  ver.fallos = Object.keys(ver).filter(function (k) {
    return k !== 'ok' && k !== 'fallos' && ver[k] !== true;
  });
  ver.ok = ver.fallos.length === 0;
  return ver;
}
function Inicio_layoutVigente_(h) {
  return Inicio_verificar_(h).ok;
}
/** Diagnóstico visual de INICIO (§14): tokens de diferencia accionables.
 *  No consulta datos clínicos. Devuelve {ok, diferencias}. */
function Inicio_diagnosticarVisual_(hoja) {
  var diag = { ok: false, diferencias: [] };
  if (!hoja) { diag.diferencias.push('HOJA:INICIO'); return diag; }
  try {
    var v = Inicio_verificar_(hoja);
    var mapa = {
      layoutVersion: 'LAYOUT_VERSION', rangoGestionado: 'RANGO_GESTIONADO',
      dimensiones: 'DIMENSIONES', titulo: 'TITULO', subtitulo: 'SUBTITULO',
      accesos: 'ACCESOS', tarjetas: 'CARD', bloques: 'BLOQUES', merges: 'MERGE',
      freeze: 'FREEZE', freezeSeguro: 'MERGE:CRUZA_FREEZE', anchos: 'ANCHO',
      alturas: 'ALTURA', coloresBase: 'COLOR_BASE', fondoClaro: 'FONDO', snapshot: 'SNAPSHOT'
    };
    (v.fallos || []).forEach(function (k) { if (mapa[k]) diag.diferencias.push(mapa[k]); });
    [['A4', 'PERSONAS'], ['G4', 'CAPTURA'], ['M4', 'INGRESOS'], ['S4', 'CONTROLES'], ['Y4', 'REM']]
      .forEach(function (x) {
        try {
          if (Utl_texto(hoja.getRange(x[0]).getFormula()).indexOf('HYPERLINK') === -1)
            diag.diferencias.push('LINK:' + x[1]);
        } catch (eL) { diag.diferencias.push('LINK:' + x[1]); }
      });
    if (hoja.getMaxColumns() > 30) diag.diferencias.push('COLUMNA:SOBRANTE');
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
  var h = ss.getSheetByName('INICIO');
  if (!h) h = ss.insertSheet('INICIO');
  if (opciones.forzar !== true && Inicio_layoutVigente_(h)) {
    var tituloActual = 'ECICEP · CENTRO OPERATIVO · v' + ECICEP.VERSION;
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
  var filas = 38, cols = 30;
  if (h.getMaxRows() < filas) h.insertRowsAfter(h.getMaxRows(), filas - h.getMaxRows());
  if (h.getMaxColumns() < cols) h.insertColumnsAfter(h.getMaxColumns(), cols - h.getMaxColumns());
  try { h.showRows(1, Math.min(filas, h.getMaxRows())); } catch (eSR) {}
  try { h.showColumns(1, Math.min(cols, h.getMaxColumns())); } catch (eSC) {}
  var gestionado = h.getRange(INICIO_RANGO_GESTIONADO);
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
  if (typeof h.setColumnWidths === 'function') h.setColumnWidths(1, cols, 38);
  else for (var c = 1; c <= cols; c++) h.setColumnWidth(c, 38);

  var FONDOS = {}, TINTAS = {}, PESOS = {}, TAMANOS = {}, HALIN = {}, VALIN = {};
  var conBorde = [], conWrap = [];
  function g(mapa, valor) { if (!mapa[valor]) mapa[valor] = []; return mapa[valor]; }
  var a1 = Inicio_a1_;
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
  var sectores = [{ n:'NARANJO', c:IDENTIDAD.NARANJO, ini:1 }, { n:'AMARILLO', c:IDENTIDAD.AMARILLO, ini:11 },
    { n:'VERDE', c:IDENTIDAD.VERDE, ini:21 }];
  var accesos = [
    { texto: 'PERSONAS', rango: 'A4:F7', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('pacientes') : '' },
    { texto: 'CAPTURA', rango: 'G4:L7', url: typeof WebApp_urlCaptura_ === 'function' ? WebApp_urlCaptura_() : '' },
    { texto: 'INGRESOS', rango: 'M4:R7', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('ingresos') : '' },
    { texto: 'CONTROLES', rango: 'S4:X7', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('controles') : '' },
    { texto: 'REM', rango: 'Y4:AD7', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('rem') : '' }
  ];
  var kpis = [
    { etiqueta: 'PERSONAS', rango: 'A8:F8', valor: 'A9:F9' },
    { etiqueta: 'EVENTOS', rango: 'G8:L8', valor: 'G9:L9' },
    { etiqueta: 'REVISIÓN PENDIENTE', rango: 'M8:R8', valor: 'M9:R9' },
    { etiqueta: 'CONTROLES VENCIDOS', rango: 'S8:X8', valor: 'S9:X9' },
    { etiqueta: 'ALERTAS OPERATIVAS', rango: 'Y8:AD8', valor: 'Y9:AD9' }
  ];
  var metricasSector = [['Personas',11], ['Ingresos pendientes',12], ['Revisión',13], ['Próxima atención',14]];

  // --- contenido: un merge + un valor por bloque del contrato ---
  h.getRange('A1:AD1').merge().setValue('ECICEP · CENTRO OPERATIVO · v' + ECICEP.VERSION);
  h.getRange('A2:AD2').merge().setValue('Gestión por sectores · resumen operativo en preparación');
  h.getRange('A3:AD3').merge().setValue('Panel operativo · datos agregados y verificables');
  accesos.forEach(function (a) {
    var rng = h.getRange(a.rango).merge(), formula = '';
    if (a.url) formula = '=HYPERLINK("' + String(a.url).replace(/"/g, '""') + '";"' + a.texto + '")';
    if (formula) rng.setFormula(formula); else rng.setValue(a.texto);
  });
  kpis.forEach(function (k) {
    h.getRange(k.rango).merge().setValue(k.etiqueta);
    h.getRange(k.valor).merge().setValue(0);
  });
  sectores.forEach(function (s) {
    var c0 = s.ini;
    h.getRange(10, c0, 1, 10).merge().setValue(s.n);
    metricasSector.forEach(function (x) {
      h.getRange(x[1], c0, 1, 7).merge().setValue(x[0]);
      h.getRange(x[1], c0 + 7, 1, 3).merge();
    });
    h.getRange(15, c0, 1, 10).merge().setValue(s.n);
    h.getRange(16, c0, 1, 10).merge().setValue('0 personas · 0 % del total');
  });
  h.getRange('A18:O18').merge().setValue('ESTADO DEL SISTEMA');
  ['Datos', 'Integridad', 'Ingreso manual', 'Backup'].forEach(function (texto, i) {
    h.getRange(20 + i, 1, 1, 8).merge().setValue(texto);
    h.getRange(20 + i, 9, 1, 7).merge();
  });
  h.getRange('P18:AD18').merge().setValue('PENDIENTES');
  ['Controles vencidos', 'Próximos 30 días', 'Sin próximo control', 'Fichas por revisar']
    .forEach(function (texto, i) {
      h.getRange('P' + (20 + i) + ':AB' + (20 + i)).merge().setValue(texto);
      h.getRange('AC' + (20 + i) + ':AD' + (20 + i)).merge();
  });
  h.getRange('A24:AD25').merge().setValue('Sin alertas operativas');
  h.getRange('A27:AD29').merge().setValue('Estado y actualización en preparación');
  h.getRange('A32:AD34').merge().setValue('Nota operativa: los valores mostrados son agregados; '
      + 'no reemplazan la verificación individual en PACIENTES ni el control clínico en el sector.');

  // --- estilos: un grupo por token; RangeList los aplica en una sola pasada ---
  g(FONDOS, blanco);
  accesos.forEach(function (a) { g(FONDOS, blanco).push(a.rango); g(TINTAS, M.sistema).push(a.rango);
    g(PESOS, 'bold').push(a.rango); g(TAMANOS, 10).push(a.rango); g(HALIN, 'center').push(a.rango);
    g(VALIN, 'middle').push(a.rango); conBorde.push(a.rango); });
  kpis.forEach(function (k) {
    g(FONDOS, M.sistema).push(k.rango); g(TINTAS, blanco).push(k.rango); g(PESOS, 'bold').push(k.rango);
    g(TAMANOS, 8).push(k.rango); g(HALIN, 'center').push(k.rango); g(VALIN, 'middle').push(k.rango);
    conBorde.push(k.rango);
    g(FONDOS, blanco).push(k.valor); g(TINTAS, M.texto).push(k.valor); g(PESOS, 'bold').push(k.valor);
    g(TAMANOS, 14).push(k.valor); g(HALIN, 'center').push(k.valor); g(VALIN, 'middle').push(k.valor);
    conBorde.push(k.valor);
  });
  sectores.forEach(function (s) {
    var c0 = s.ini, caja = a1(10, c0, 10), cabecera = a1(10, c0, 10), distCab = a1(15, c0, 10);
    g(FONDOS, blanco).push(caja); conBorde.push(caja);
    g(FONDOS, s.c).push(cabecera, distCab);
    g(TINTAS, blanco).push(cabecera, distCab);
    g(PESOS, 'bold').push(cabecera, distCab);
    g(TAMANOS, 10).push(cabecera); g(TAMANOS, 9).push(distCab);
    g(HALIN, 'center').push(cabecera, distCab); g(VALIN, 'middle').push(cabecera, distCab);
    metricasSector.forEach(function (x) {
      var etiqueta = a1(x[1], c0, 7), valor = a1(x[1], c0 + 7, 3);
      g(FONDOS, blanco).push(etiqueta, valor);
      g(TINTAS, M.gris).push(etiqueta); g(TINTAS, M.texto).push(valor);
      g(PESOS, 'bold').push(valor); g(HALIN, 'right').push(valor);
    });
    var distValor = a1(16, c0, 10);
    g(FONDOS, blanco).push(distValor); g(TINTAS, M.texto).push(distValor);
    g(PESOS, 'bold').push(distValor); g(TAMANOS, 10).push(distValor);
    g(HALIN, 'center').push(distValor); g(VALIN, 'middle').push(distValor); conBorde.push(distValor);
  });
  var CAJA_ESTADO = 'A18:O23', CAJA_PENDIENTES = 'P18:AD23';
  g(FONDOS, blanco).push(CAJA_ESTADO, CAJA_PENDIENTES);
  conBorde.push(CAJA_ESTADO, CAJA_PENDIENTES);
  ['A18:O18', 'P18:AD18'].forEach(function (cab) {
    g(FONDOS, M.sistema).push(cab); g(TINTAS, blanco).push(cab); g(PESOS, 'bold').push(cab);
    g(HALIN, 'center').push(cab);
  });
  ['Datos', 'Integridad', 'Ingreso manual', 'Backup'].forEach(function (texto, i) {
    var etiqueta = a1(20 + i, 1, 8), valor = a1(20 + i, 9, 7);
    g(TINTAS, M.gris).push(etiqueta); g(PESOS, 'bold').push(etiqueta);
    g(HALIN, 'center').push(valor); g(VALIN, 'middle').push(valor);
  });
  ['Controles vencidos', 'Próximos 30 días', 'Sin próximo control', 'Fichas por revisar']
    .forEach(function (texto, i) {
      var etiqueta = 'P' + (20 + i) + ':AB' + (20 + i), valor = 'AC' + (20 + i) + ':AD' + (20 + i);
      g(TINTAS, M.gris).push(etiqueta); g(PESOS, 'bold').push(etiqueta);
      g(TINTAS, M.sistema).push(valor); g(PESOS, 'bold').push(valor);
      g(HALIN, 'right').push(valor); g(VALIN, 'middle').push(valor);
    });
  g(FONDOS, DESIGN_SYSTEM.HOJAS.seleccion.fondo).push('A2:AD2', 'A3:AD3');
  g(TINTAS, M.gris).push('A2:AD2'); g(TAMANOS, 9).push('A2:AD2');
  g(HALIN, 'left').push('A2:AD2'); g(VALIN, 'middle').push('A2:AD2');
  g(TINTAS, M.texto).push('A3:AD3'); g(PESOS, 'bold').push('A3:AD3');
  g(TAMANOS, 10).push('A3:AD3'); g(HALIN, 'left').push('A3:AD3');
  g(VALIN, 'middle').push('A3:AD3'); conBorde.push('A3:AD3');
  g(FONDOS, M.sistemaProfundo).push('A1:AD1');
  g(TINTAS, blanco).push('A1:AD1'); g(PESOS, 'bold').push('A1:AD1');
  g(TAMANOS, 14).push('A1:AD1'); g(HALIN, 'left').push('A1:AD1');
  g(VALIN, 'middle').push('A1:AD1');
  g(FONDOS, DESIGN_SYSTEM.ESTADOS.OK.fondo).push('A24:AD25');
  g(TINTAS, DESIGN_SYSTEM.ESTADOS.OK.tinta).push('A24:AD25');
  g(PESOS, 'bold').push('A24:AD25'); g(TAMANOS, 10).push('A24:AD25');
  g(HALIN, 'left').push('A24:AD25'); g(VALIN, 'middle').push('A24:AD25');
  conBorde.push('A24:AD25'); conWrap.push('A24:AD25');
  g(FONDOS, DESIGN_SYSTEM.HOJAS.derivado.fondo).push('A27:AD29');
  g(TINTAS, M.gris).push('A27:AD29'); g(PESOS, 'bold').push('A27:AD29');
  g(TAMANOS, 9).push('A27:AD29'); g(HALIN, 'center').push('A27:AD29');
  g(VALIN, 'middle').push('A27:AD29');
  conBorde.push('A27:AD29'); conWrap.push('A27:AD29');
  g(FONDOS, fondo).push('A32:AD34'); g(TINTAS, M.gris).push('A32:AD34');
  g(TAMANOS, 9).push('A32:AD34'); g(HALIN, 'left').push('A32:AD34');
  g(VALIN, 'top').push('A32:AD34');
  conBorde.push('A32:AD34'); conWrap.push('A32:AD34');

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
  // Marco de color alrededor de todo el panel: la portada se percibe como una
  // tarjeta, no como bloques sueltos sobre blanco. Ocultar filas/columnas
  // excedentes elimina el "espacio blanco" adyacente que se veía feo.
  try {
    h.getRange(INICIO_RANGO_GESTIONADO).setBorder(true, true, true, true, null, null,
      M.sistemaBorde, SpreadsheetApp.BorderStyle.SOLID);
  } catch (eM) {}
  try {
    if (h.getMaxRows() > filas && typeof h.hideRows === 'function') h.hideRows(filas + 1, h.getMaxRows() - filas);
    if (h.getMaxColumns() > cols && typeof h.hideColumns === 'function') h.hideColumns(cols + 1, h.getMaxColumns() - cols);
  } catch (eH) {}
  h.setTabColor(M.sistemaProfundo);
  try { h.setConditionalFormatRules([]); } catch (eCF) {}
  var metricas = Inicio_calcularMetricas_();
  Inicio_guardarSnapshot_(metricas); Inicio_escribirMetricas_(metricas, h);
  h.setFrozenRows(2); h.setFrozenColumns(0);
  Inicio_guardarLayout_();
  var ver = Inicio_verificar_(h);
  if (!ver.ok) {
    Inicio_borrarLayout_();
    throw new Error('Verificación INICIO falló en: ' + ver.fallos.join(', '));
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
    try {
      var actual = hoja.getRange(ini, i + 1, filas, 1);
      ya = typeof actual.getBackgrounds === 'function' && actual.getBackgrounds().every(function (f) { return f[0] === estilo.fondo; }) &&
        typeof actual.getFontColors === 'function' && actual.getFontColors().every(function (f) { return f[0] === estilo.tinta; }) &&
        typeof actual.getHorizontalAlignments === 'function' && actual.getHorizontalAlignments().every(function (f) {
          return String(f[0] || '').toUpperCase() === alineacion;
        }) && typeof actual.getWraps === 'function' && actual.getWraps().every(function (f) { return f[0] === wrap; });
    } catch (eS) { ya = false; }
    if (ya) return;
    hoja.getRange(ini, i + 1, filas, 1).setBackground(estilo.fondo).setFontColor(estilo.tinta)
      .setHorizontalAlignment(alineacion.toLowerCase()).setWrap(wrap);
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
/** Reconstruye SOLO la portada, en una sola invocación y sin depender del plan de
 *  presentación. Es la vía directa para dejar INICIO al día cuando el resto del
 *  libro ya está presentado (regresión 2026-09-25: la subtarea 'inicio' quedaba
 *  fuera del presupuesto de un clic y la hoja no cambiaba). */
function UI_reconstruirInicio() {
  var ui = _UI_get();
  var r = Inicio_construir_(Modelo_ss(), { forzar: false });
  if (r.ok === false) {
    ui.alert('Portada INICIO', 'No se pudo reconstruir la portada: ' +
      (r.motivo || 'error desconocido') + '\n\nRepite la acción; es idempotente.', ui.ButtonSet.OK);
    return r;
  }
  var v = r.verificacion || {};
  ui.alert('Portada INICIO', r.omitida
    ? 'La portada ya estaba al día (contrato PANEL_OPERATIVO_V014). Se refrescaron las cifras.'
    : 'Portada reconstruida: hero, KPIs, cards por sector, distribución, estado, '
      + 'pendientes y alerta.\nVerificación: ' + (v.ok === true ? 'correcta' : (v.fallos || []).join(', ')),
    ui.ButtonSet.OK);
  return r;
}
function UI_repararPresentacion() {
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
