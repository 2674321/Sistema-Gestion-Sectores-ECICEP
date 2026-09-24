/**
 * ECICEP v0.12.0 — experiencia del libro, snapshots y mantenimiento selectivo.
 * Solo persiste métricas agregadas/flags técnicos; nunca PII.
 */
var LIBRO_DIRTY_PROP = 'ECICEP_LIBRO_DIRTY_V012';
var INICIO_SNAPSHOT_PROP = 'ECICEP_INICIO_SNAPSHOT_V012';
var INICIO_LAYOUT_PROP = 'ECICEP_INICIO_LAYOUT_V0122';
var INICIO_LAYOUT_VERSION = '0.12.2';
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
    m.sectores[s] = { pacientes: 0, pendientesIngreso: 0, revision: 0, vencidos: 0 };
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
    else if (prox < hoy) { m.vencidos++; if (sec) sec.vencidos++; }
    else if (prox <= limiteIso) m.porVencer++;
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
function Inicio_escribirMetricas_(m, hoja) {
  hoja = hoja || Modelo_ss().getSheetByName('INICIO');
  if (!hoja || !m) return { ok: false, motivo: 'INICIO_NO_DISPONIBLE' };
  ['NARANJO', 'AMARILLO', 'VERDE'].forEach(function (s, i) {
    var c = 1 + i * 8, x = (m.sectores || {})[s] || {};
    hoja.getRange(15, c + 5).setValue(x.pacientes || 0);
    hoja.getRange(16, c + 5).setValue(x.pendientesIngreso || 0);
    hoja.getRange(17, c + 5).setValue(x.revision || 0);
    hoja.getRange(18, c + 5).setValue(x.vencidos || 0);
  });
  var salud = m.salud || {};
  hoja.getRange(23, 2).setValue(salud.datos && salud.datos.ok ? '✓ OK' : '⚠ REVISAR');
  hoja.getRange(23, 8).setValue(salud.integridad && salud.integridad.ok === false ? '⚠ REVISAR' : '✓ OK');
  hoja.getRange(23, 14).setValue(salud.triggers && salud.triggers.ingresoOnEdit ? '✓ ACTIVO' : '⚠ REVISAR');
  hoja.getRange(23, 20).setValue(salud.triggers && salud.triggers.backup ? '✓ ACTIVO' : '○ PENDIENTE');
  [[m.revision, 2], [m.pendientesIngreso, 8], [m.rutInvalidos, 14], [m.sinProximaAtencion, 20]]
    .forEach(function (x) { hoja.getRange(30, x[1]).setValue(x[0] || 0); });
  var atencion = (m.revision || 0) + (m.pendientesIngreso || 0) + (m.rutInvalidos || 0) + (m.vencidos || 0);
  hoja.getRange('A33').setValue(atencion
    ? '⚠ Requiere atención: ' + atencion + ' elementos operativos'
    : '✓ Sistema operativo · sin incidencias pendientes');
  hoja.getRange('A38').setValue('Última actualización: ' + (m.fecha || '—'));
  hoja.getRange('A39').setValue('Auditoría profunda: ' + (m.ultimaAuditoria || 'pendiente'));
  hoja.getRange('A40').setValue('Último backup: ' + (m.ultimoBackup || 'pendiente'));
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
  return ['CENTRO_OPERATIVO', INICIO_RANGO_GESTIONADO, 'A1:X2', 'A8:X10',
    'SECTORES_3', 'ESTADO_4', 'PENDIENTES_4', 'FREEZE_2_0'].join('|');
}
function Inicio_layoutVigente_(h) {
  if (!h) return false;
  var props = Libro_propiedades_(), raw = '';
  try { raw = props && props.getProperty(INICIO_LAYOUT_PROP); } catch (eP) {}
  if (!raw) return false;
  var meta;
  try { meta = JSON.parse(raw); } catch (eJ) { return false; }
  if (!meta || meta.version !== INICIO_LAYOUT_VERSION ||
      meta.fingerprint !== Inicio_fingerprintEsperado_()) return false;
  try {
    return h.getFrozenRows() === 2 && h.getFrozenColumns() === 0 &&
      Utl_texto(h.getRange('A1').getValue()).indexOf('ECICEP') !== -1 &&
      Utl_texto(h.getRange('A8').getFormula()).indexOf('HYPERLINK') !== -1 &&
      h.getRange('F15').getFormula() === '';
  } catch (e) { return false; }
}
function Inicio_guardarLayout_() {
  var props = Libro_propiedades_(); if (!props) return;
  try { props.setProperty(INICIO_LAYOUT_PROP, JSON.stringify({
    version: INICIO_LAYOUT_VERSION, fingerprint: Inicio_fingerprintEsperado_()
  })); } catch (e) {}
}

function Inicio_construir_(ss, opciones) {
  opciones = opciones || {};
  var h = ss.getSheetByName('INICIO');
  if (!h) h = ss.insertSheet('INICIO');
  if (opciones.forzar !== true && Inicio_layoutVigente_(h)) {
    var tituloActual = 'ECICEP                                            v' + ECICEP.VERSION +
      ' · Build ' + (ECICEP_BUILD.commit || 'dev');
    var tituloRango = h.getRange('A1');
    if (Utl_texto(tituloRango.getValue()) !== tituloActual) tituloRango.setValue(tituloActual);
    try {
      if (!h.getTabColor || h.getTabColor() !== DESIGN_SYSTEM.MARCA.sistemaProfundo)
        h.setTabColor(DESIGN_SYSTEM.MARCA.sistemaProfundo);
    } catch (eT) {}
    var refresco = Inicio_refrescarSiNecesario_();
    return { ok: refresco.ok !== false, omitida: true, layoutVigente: true,
      refresco: refresco, verificacion: { hoja: true, titulo: true, accesos: true,
        snapshot: true, rangoGestionado: true, freeze: true } };
  }
  // Hotfix 0.12.1: si la hoja hereda filas/columnas inmovilizadas de una
  // instalación anterior, cualquier escritura cuyo rango cruce el límite
  // congelado/no-congelado falla ("No se pueden combinar filas inmovilizadas
  // con filas no inmovilizadas"). Invariante: la portada se construye SIEMPRE
  // sin freeze residual y se congela solo al final, idempotente.
  h.setFrozenRows(0); h.setFrozenColumns(0);
  var filas = 60, cols = 32;
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
  for (var c = 1; c <= 24; c++) h.setColumnWidth(c, 52);
  h.getRange('A1:X2').merge().setBackground(M.sistemaProfundo).setFontColor(blanco)
    .setValue('ECICEP                                            v' + ECICEP.VERSION + ' · Build ' + (ECICEP_BUILD.commit || 'dev'))
    .setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  h.getRange('A4:X5').merge().setValue('Sistema de Gestión por Sectores\nCentro operativo del libro')
    .setFontFamily('Sora').setFontSize(18).setFontWeight('bold').setFontColor(M.sistema)
    .setVerticalAlignment('middle').setWrap(true);
  function titulo(fila, texto) {
    h.getRange(fila, 1, 1, 24).merge().setValue(texto).setFontWeight('bold')
      .setFontSize(10).setFontColor(M.muted).setBackground(fondo);
  }
  titulo(7, 'ACCESOS');
  var accesos = [
    { texto: 'PERSONAS', hoja: 'PACIENTES' },
    { texto: 'CAPTURA', url: typeof WebApp_urlCaptura_ === 'function' ? WebApp_urlCaptura_() : '' },
    { texto: 'INCORPORAR INGRESOS', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('ingresos') : '' },
    { texto: 'CONTROLES', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('controles') : '' },
    { texto: 'ESTADÍSTICAS', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('estadisticas') : '' },
    { texto: 'REM', url: typeof WebApp_urlVista_ === 'function' ? WebApp_urlVista_('rem') : '' }
  ];
  accesos.forEach(function (a, i) {
    var rng = h.getRange(8, 1 + i * 4, 3, 4).merge(), formula = '';
    if (a.hoja && ss.getSheetByName(a.hoja)) formula = '=HYPERLINK("#gid=' + ss.getSheetByName(a.hoja).getSheetId() + '";"' + a.texto + '")';
    else if (a.url) formula = '=HYPERLINK("' + String(a.url).replace(/"/g, '""') + '";"' + a.texto + '")';
    if (formula) rng.setFormula(formula); else rng.setValue(a.texto);
    rng.setBackground(M.sistema).setFontColor(blanco).setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, null, null, M.sistemaBorde, SpreadsheetApp.BorderStyle.SOLID);
  });
  titulo(13, 'SECTORES');
  [{ n:'NARANJO', c:IDENTIDAD.NARANJO }, { n:'AMARILLO', c:IDENTIDAD.AMARILLO }, { n:'VERDE', c:IDENTIDAD.VERDE }]
    .forEach(function (s, i) {
      var c0 = 1 + i * 8;
      h.getRange(14, c0, 1, 8).merge().setValue(s.n).setBackground(s.c).setFontColor(blanco)
        .setFontWeight('bold').setHorizontalAlignment('center');
      [['Pacientes',15], ['Ingresos pendientes',16], ['Revisión',17], ['Vencidos',18]].forEach(function (x) {
        h.getRange(x[1], c0, 1, 5).merge().setValue(x[0]).setBackground(blanco).setFontColor(M.gris);
        h.getRange(x[1], c0 + 5, 1, 3).merge().setBackground(blanco).setFontWeight('bold').setHorizontalAlignment('right');
      });
      h.getRange(14, c0, 5, 8).setBorder(true, true, true, true, null, null, borde, SpreadsheetApp.BorderStyle.SOLID);
    });
  titulo(21, 'ESTADO DEL SISTEMA');
  ['Datos', 'Integridad', 'Trigger ingreso', 'Backup'].forEach(function (x, i) {
    var c0 = 1 + i * 6;
    h.getRange(22, c0, 1, 6).merge().setValue(x).setBackground(blanco).setFontColor(M.gris).setFontWeight('bold').setHorizontalAlignment('center');
    h.getRange(23, c0 + 1, 1, 4).merge().setBackground(blanco).setFontWeight('bold').setHorizontalAlignment('center');
    h.getRange(22, c0, 2, 6).setBorder(true, true, true, true, null, null, borde, SpreadsheetApp.BorderStyle.SOLID);
  });
  titulo(27, 'PENDIENTES OPERATIVOS');
  ['Revisión', 'Ingresos', 'RUT inválidos', 'Sin próxima atención'].forEach(function (x, i) {
    var c0 = 1 + i * 6;
    h.getRange(28, c0, 1, 6).merge().setValue(x).setBackground(blanco).setFontColor(M.gris).setHorizontalAlignment('center');
    h.getRange(29, c0 + 1, 2, 4).merge().setBackground(blanco).setFontColor(M.sistema).setFontFamily('Sora').setFontSize(20).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
    h.getRange(28, c0, 3, 6).setBorder(true, true, true, true, null, null, borde, SpreadsheetApp.BorderStyle.SOLID);
  });
  h.getRange('A33:X35').merge().setBackground(DESIGN_SYSTEM.HOJAS.seleccion.fondo)
    .setFontColor(DESIGN_SYSTEM.HOJAS.seleccion.tinta).setFontWeight('bold').setFontSize(12)
    .setVerticalAlignment('middle').setHorizontalAlignment('center')
    .setBorder(true, true, true, true, null, null, borde, SpreadsheetApp.BorderStyle.SOLID);
  h.getRange('A37:X37').merge().setValue('METADATA').setFontWeight('bold').setFontColor(M.muted);
  ['A38:X38','A39:X39','A40:X40'].forEach(function (a1) { h.getRange(a1).merge().setBackground(blanco).setFontColor(M.gris); });
  h.getRange('A42:X44').merge().setValue('La Web App es el canal operativo de captura. Las hojas de sector son vistas automáticas.')
    .setBackground(DESIGN_SYSTEM.HOJAS.derivado.fondo).setFontColor(M.muted).setFontStyle('italic').setVerticalAlignment('middle');
  h.setTabColor(M.sistemaProfundo);
  try { h.setConditionalFormatRules([]); } catch (eCF) {}
  h.setFrozenRows(2); h.setFrozenColumns(0);
  var metricas = Inicio_calcularMetricas_();
  Inicio_guardarSnapshot_(metricas); Inicio_escribirMetricas_(metricas, h);
  var ver = { hoja: !!ss.getSheetByName('INICIO'), filas: h.getMaxRows() >= filas,
    columnas: h.getMaxColumns() >= cols,
    titulo: Utl_texto(h.getRange('A1').getValue()).indexOf('ECICEP') !== -1,
    accesos: Utl_texto(h.getRange('A8').getFormula()).indexOf('HYPERLINK') !== -1,
    snapshot: h.getRange('F15').getFormula() === '', rangoGestionado: INICIO_RANGO_GESTIONADO === 'A1:AF60',
    freeze: (typeof h.getFrozenRows === 'function') && h.getFrozenRows() === 2 };
  var fallos = Object.keys(ver).filter(function (k) { return !ver[k]; });
  if (fallos.length) throw new Error('Verificación INICIO falló en: ' + fallos.join(', '));
  Inicio_guardarLayout_();
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

function Libro_repararPresentacion_(opciones) {
  opciones = opciones || {}; var ss = Modelo_ss(), resultados = [], ajustadas = 0, fallos = [];
  Hojas_ordenObjetivo_().concat(['EVENTOS','CONFIG','LOG','FORM_RESPUESTAS']).forEach(function (nombre) {
    var h = ss.getSheetByName(nombre); if (!h || nombre === 'INICIO') return;
    try {
      var antes = typeof HVis_pendientesVisual === 'function' ? HVis_pendientesVisual(h) : { pendientes: [] };
      if ((antes.pendientes || []).length || opciones.forzar) {
        if (HVis_obtenerSecciones(nombre)) HVis_reconciliarHoja(h, { layout:true });
        h.setTabColor(Hojas_colorPestana_(nombre));
        var ux = HOJAS_UX[nombre] || {};
        if (ux.frozenRows !== undefined) h.setFrozenRows(ux.frozenRows);
        if (ux.frozenColumns !== undefined) h.setFrozenColumns(ux.frozenColumns);
        _modelo_anchosHoja(h); Hojas_aplicarSemanticaColumnas_(h); ajustadas++;
      }
      resultados.push({ hoja: nombre, ok: true, ajustes: (antes.pendientes || []).length });
    } catch (e) { fallos.push(nombre + ': ' + (e && e.message || e)); resultados.push({ hoja:nombre, ok:false, motivo:String(e) }); }
  });
  var diseno = opciones.omitirModelo ? { fallidas: [] } : Modelo_aplicarDiseno();
  (diseno.fallidas || []).forEach(function (x) { fallos.push(x); });
  var val = Hojas_aplicarValidaciones_(ss), valIngreso = Modelo_validarIngresos(ss);
  var notas = Hojas_aplicarNotas_(ss), formatos = Hojas_aplicarFormatosNumero_(ss);
  var orden = Hojas_ordenar_(ss);
  if (fallos.length === 0) { Libro_limpiarDirty_('VISUAL'); Libro_limpiarDirty_('VALIDACIONES'); Libro_limpiarDirty_('ESTRUCTURA'); }
  return { ok: fallos.length === 0, hojasRevisadas: resultados.length, hojasAjustadas: ajustadas,
    validacionesCorregidas: (val.aplicadas || 0) + (valIngreso.validaciones || 0), anchosCorregidos: ajustadas,
    tabsCorregidos: ajustadas, resultados: resultados, orden: orden, fallidas: fallos,
    motivo: fallos.join('; '), notas: notas.aplicadas || 0, formatos: formatos.aplicados || 0 };
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
function UI_repararPresentacion() {
  var ui = _UI_get();
  var d = HVis_diagnosticarTodas(), n = 0;
  Object.keys(d.diagnostico || {}).forEach(function (k) {
    var v = d.diagnostico[k], p = v && v.estadoActual && v.estadoActual.visual;
    n += p && p.cantidadPendientes || 0;
  });
  var resp = ui.alert('Reparar presentación', 'Se detectaron ' + n + ' ajustes visuales. Esta acción no modifica datos clínicos. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return { ok: true, cancelada: true };
  var r = Libro_repararPresentacion_({ forzar: false });
  ui.alert(r.ok ? 'Presentación reparada' : 'Reparación incompleta',
    r.resultados.map(function (x) { return x.hoja + ' ' + (x.ok ? '✓ ' + x.ajustes + ' ajustes' : '✕ ' + x.motivo); }).join('\n'), ui.ButtonSet.OK);
  return r;
}
