/**
 * Sistema ECICEP Unificado — 17_Hojas
 * Las hojas de Google Sheets como INTERFAZ profesional (ETAPA hojas).
 *
 * Categorías de hoja (criterio de diseño/protección):
 *   🟢 EDITABLE    → INGRESO_* (puertas de captura)
 *   🔵 AUTOMÁTICA  → PACIENTES (parcial), EVENTOS, SECTOR_*, REM_SALIDA
 *   🟡 REVISIÓN    → CONFLICTOS
 *   🔴 TÉCNICA     → LOG, STAGING_IMPORT (ocultas)
 *   ⚙ CONFIG       → CONFIG, FUENTES, CAT_VIGENCIA_EXAMENES
 *
 * Principios: protecciones SOLO de advertencia (nunca bloquean Apps Script),
 * formato condicional con texto/indicador (no depender solo del color),
 * indicadores con FÓRMULAS vivas (jamás valores escritos a mano),
 * idempotente en cada ejecución de Instalar / Reparar Sistema.
 */

/* Identidad de versión — generada por tools/sync_remoto.py (BUILD.js) */
if (typeof ECICEP_BUILD === 'undefined') {
  var ECICEP_BUILD = { commit: 'dev', fecha: '' };
}

/* Módulos para el escritorio INICIO */
var INICIO_MODULOS = [
  { hoja:'PACIENTES',      icono:'👥', nombre:'PACIENTES',        desc:'Consulta y gestión de pacientes ECICEP' },
  { hoja:'INGRESO_NARANJO',icono:'📥', nombre:'INGRESOS',         desc:'Procesamiento de nuevos registros (puertas por sector)' },
  { hoja:'SECTOR_NARANJO', icono:'🗺️', nombre:'SECTORES',         desc:'Vistas operativas · Naranjo · Amarillo · Verde' },
  { hoja:'CONFLICTOS',     icono:'📋', nombre:'COLA DE REVISIÓN', desc:'Control de datos pendientes' },
  { hoja:'REM_SALIDA',     icono:'🩺', nombre:'REM',              desc:'Reporte mensual generado' },
  { hoja:'FUENTES',        icono:'🗂️', nombre:'FUENTES',          desc:'Fuentes de información y sincronización' },
  { hoja:'LOG',            icono:'🧪', nombre:'DIAGNÓSTICO',      desc:'Centro de Pruebas en el menú · LOG técnico' },
  { hoja:'CONFIG',         icono:'⚙️', nombre:'ADMINISTRACIÓN',   desc:'Configuración y mantenimiento' }
];

var HOJAS_NAV = [
  { hoja: 'PACIENTES',   etiqueta: '👥 Pacientes ECICEP' },
  { hoja: 'INGRESO_NARANJO', etiqueta: '🟠 Ingreso Naranjo' },
  { hoja: 'INGRESO_AMARILLO', etiqueta: '🟡 Ingreso Amarillo' },
  { hoja: 'INGRESO_VERDE', etiqueta: '🟢 Ingreso Verde' },
  { hoja: 'SECTOR_NARANJO', etiqueta: '🟠 Sector Naranjo' },
  { hoja: 'SECTOR_AMARILLO', etiqueta: '🟡 Sector Amarillo' },
  { hoja: 'SECTOR_VERDE', etiqueta: '🟢 Sector Verde' },
  { hoja: 'CONFLICTOS',  etiqueta: '📋 Cola de revisión' },
  { hoja: 'REM_SALIDA',  etiqueta: '🩺 REM (generado)' },
  { hoja: 'FUENTES',     etiqueta: '🗂️ Fuentes' },
  { hoja: 'CONFIG',      etiqueta: '⚙️ Configuración' },
  { hoja: 'LOG',         etiqueta: '📄 LOG' }
];

/** PURA: fórmula de indicador de calidad para INICIO. */
function Hojas_formulaIndicador(tipo) {
  switch (tipo) {
    case 'TOTAL_PAC':   return '=COUNTA(PACIENTES!A2:A)';
    case 'EVENTOS':     return '=COUNTA(EVENTOS!A2:A)';
    case 'POR_REVISAR': return '=COUNTIF(PACIENTES!AD2:AD;TRUE)';
    case 'ESTRAT_PEND': return '=COUNTIF(PACIENTES!I2:I;"")+COUNTIF(PACIENTES!I2:I;"G")';
    case 'RUT_INVALIDOS': return '=COUNTIF(PACIENTES!W2:W;FALSE)';
    case 'DUPLICADOS':  return '=SUMPRODUCT((PACIENTES!B2:B<>"")*(COUNTIF(PACIENTES!B2:B;PACIENTES!B2:B)>1))';
    case 'ULT_ACT':     return '=IF(COUNT(PACIENTES!AC2:AC)=0;"sin datos";MAX(PACIENTES!AC2:AC))';
    default: return '';
  }
}

/** GAS: INICIO — escritorio principal (lienzo cerrado, tarjetas, jerarquía). */
function Hojas_crearInicio(ss) {
  var h = ss.getSheetByName('INICIO');
  if (!h) h = ss.insertSheet('INICIO');
  h.clear();
  h.setHiddenGridlines(true);

  var PRIM = '#0E5C68', PRIM_SOFT = '#E5F1F2', TXT = '#1C2430',
      GRIS = '#5B6472', MUTED = '#8A93A3', BORDE = '#C9CEDA',
      SUAVE = '#F1F3F6', BLANCO = '#FFFFFF',
      OK = '#1F9D6B', WARN_BG = '#FBF3D6', ERR_BG = '#FBE4E4';

  /* ===== LIENZO: columnas B..K (2..11), filas 2..46 ===== */
  var COL_INI = 2, COL_FIN = 11, FILA_FIN = 46;
  for (var c = COL_INI; c <= COL_FIN; c++) h.setColumnWidth(c, 96);
  h.setColumnWidth(1, 24);
  h.getRange(1, COL_INI, FILA_FIN - 1, COL_FIN - COL_INI + 1).setBackground(BLANCO);

  /* ===== CABECERA ===== */
  h.getRange(2, COL_INI, 2, 5).merge().setValue('ECICEP')
    .setFontWeight('bold').setFontSize(30).setFontColor(PRIM).setFontFamily('Sora')
    .setVerticalAlignment('middle');
  h.getRange(2, 7, 1, 5).merge().setValue('\u2713 SISTEMA OPERATIVO')
    .setFontWeight('bold').setFontSize(11).setFontColor(OK)
    .setHorizontalAlignment('right');
  h.getRange(3, 7, 1, 5).merge().setValue('v' + ECICEP.VERSION + '  \u00b7  Build ' +
    (ECICEP_BUILD.commit || 'dev')).setFontSize(10).setFontColor(MUTED)
    .setHorizontalAlignment('right');
  h.getRange(4, COL_INI, 1, 10).merge()
    .setValue('Sistema de Gesti\u00f3n de Pacientes Cr\u00f3nicos por Sectores  \u00b7  CESFAM San Juan')
    .setFontStyle('italic').setFontSize(11).setFontColor(GRIS);

  /* ===== MÓDULOS PRINCIPALES (4 tarjetas grandes) ===== */
  h.getRange(6, COL_INI).setValue('M\u00d3DULOS').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var principales = [
    { hoja:'PACIENTES',      icono:'\ud83d\udc65', nombre:'PACIENTES',        desc:'Consulta y gesti\u00f3n',      imp:true },
    { hoja:'INGRESO_NARANJO',icono:'\ud83d\udce5', nombre:'INGRESOS',         desc:'Nuevos registros por sector',  imp:true },
    { hoja:'CONFLICTOS',     icono:'\ud83d\udccb', nombre:'COLA DE REVISI\u00d3N', desc:'Registros que requieren atenci\u00f3n', imp:true },
    { hoja:'REM_SALIDA',     icono:'\ud83e\ude7a', nombre:'REM',              desc:'Reporte mensual generado',     imp:true }
  ];
  /* tarjetas en columnas: (B,C) gap D (E,F) gap G (H,I) gap J (K,L)? limitado a B..K:
     usar pares B:C, E:F, H:I + K como borde derecho → 3 tarjetas por fila */
  function tarjeta(fila, c0, ancho, icono, nombre, desc, hojaDestino, importante, filasAlto) {
    var rng = h.getRange(fila, c0, filasAlto, ancho);
    rng.merge();
    rng.setFormula('=HYPERLINK("#gid=' + ss.getSheetByName(hojaDestino).getSheetId() +
      '";"' + icono + '\n' + nombre + '\n' + desc + '")')
     .setFontWeight('bold').setFontSize(importante ? 12 : 11)
     .setFontColor(importante ? '#FFFFFF' : PRIM)
     .setBackground(importante ? PRIM : SUAVE)
     .setHorizontalAlignment('center').setVerticalAlignment('middle')
     .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    rng.setBorder(true, true, true, true, null, null,
      importante ? PRIM : BORDE, SpreadsheetApp.BorderStyle.SOLID);
    return rng;
  }
  var modulosPrincipales = [
    { hoja:'PACIENTES',       icono:'\ud83d\udc65', nombre:'PACIENTES',        desc:'Consulta y gesti\u00f3n' },
    { hoja:'INGRESO_NARANJO', icono:'\ud83d\udce5', nombre:'INGRESOS',         desc:'Nuevos registros' },
    { hoja:'CONFLICTOS',      icono:'\ud83d\udccb', nombre:'COLA DE REVISI\u00d3N', desc:'Requieren atenci\u00f3n' },
    { hoja:'REM_SALIDA',      icono:'\ud83e\ude7a', nombre:'REM',              desc:'Reporte mensual' }
  ];
  modulosPrincipales.forEach(function (mod, ix) {
    tarjeta(7, COL_INI + ix * 2 + (ix > 0 ? ix : 0), 2, mod.icono, mod.nombre,
            mod.desc, mod.hoja, true, 3);
  });
  h.setRowHeights(7, 3, 22);

  /* ===== MÓDULOS SECUNDARIOS (4 tarjetas chicas) ===== */
  var secundarios = [
    { hoja:'SECTOR_NARANJO', icono:'\ud83d\udfe7', nombre:'SECTORES',        desc:'Naranjo \u00b7 Amarillo · Verde' },
    { hoja:'FUENTES',        icono:'\ud83d\uddc2\ufe0f', nombre:'FUENTES',   desc:'Informaci\u00f3n y sincronizaci\u00f3n' },
    { hoja:'LOG',            icono:'\ud83e\uddea', nombre:'DIAGN\u00d3STICO', desc:'Centro de Pruebas · LOG' },
    { hoja:'CONFIG',         icono:'\u2699\ufe0f', nombre:'ADMINISTRACI\u00d3N', desc:'Configuraci\u00f3n y mantenimiento' }
  ];
  secundarios.forEach(function (mod, ix) {
    tarjeta(11, COL_INI + ix * 2 + (ix > 0 ? ix : 0), 2, mod.icono, mod.nombre,
            mod.desc, mod.hoja, false, 3);
  });
  h.setRowHeights(11, 3, 20);

  /* ===== INDICADORES (6 tarjetas KPI, 3 por fila) ===== */
  h.getRange(15, COL_INI).setValue('INDICADORES').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var kpis = [
    ['=COUNTA(PACIENTES!A2:A)', 'PACIENTES'],
    ['=COUNTA(EVENTOS!A2:A)', 'EVENTOS'],
    ['=COUNTIF(PACIENTES!AD2:AD;TRUE)', 'POR REVISAR'],
    ['=COUNTIF(PACIENTES!I2:I;"")+COUNTIF(PACIENTES!I2:I;"G")', 'ESTRAT. PENDIENTE'],
    ['=COUNTIF(PACIENTES!W2:W;FALSE)', 'RUT INV\u00c1LIDOS'],
    ['=SUMPRODUCT((PACIENTES!B2:B<>"")*(COUNTIF(PACIENTES!B2:B;PACIENTES!B2:B)>1))', 'DUPLICADOS']
  ];
  kpis.forEach(function (k, ix) {
    var filaK = 16 + Math.floor(ix / 3) * 3;
    var c0 = COL_INI + (ix % 3) * 3 + Math.floor((ix % 3) / 2);
    var rngV = h.getRange(filaK, c0, 1, 2).merge().setFormula(k[0])
      .setFontWeight('bold').setFontSize(20).setFontFamily('Sora')
      .setFontColor(PRIM).setBackground(SUAVE)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    var rngL = h.getRange(filaK + 1, c0, 1, 2).merge().setValue(k[1])
      .setFontSize(9).setFontColor(MUTED).setBackground(SUAVE)
      .setHorizontalAlignment('center');
    rngV.setBorder(true, true, false, true, null, null, BORDE, SpreadsheetApp.BorderStyle.SOLID);
    rngL.setBorder(false, true, true, true, null, null, BORDE, SpreadsheetApp.BorderStyle.SOLID);
    h.setRowHeight(filaK, 32); h.setRowHeight(filaK + 1, 16);
  });

  /* ===== ALERTAS (tarjeta dinámica) ===== */
  h.getRange(23, COL_INI).setValue('ALERTAS').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var rAlerta = h.getRange(24, COL_INI, 3, 10).merge();
  rAlerta.setFormula('=IF(COUNTIF(PACIENTES!AD2:AD;TRUE)+COUNTIF(PACIENTES!W2:W;FALSE)>0;' +
    '"\u26a0 ATENCI\u00d3N REQUERIDA\n" & COUNTIF(PACIENTES!AD2:AD;TRUE) & " pacientes por revisar \u00b7 " &' +
    'COUNTIF(PACIENTES!W2:W;FALSE) & " RUT inv\u00e1lidos\nVer Cola de Revisi\u00f3n \u2192";' +
    '"\u2713 TODO EN ORDEN\nNo existen incidencias pendientes")')
   .setFontWeight('bold').setFontSize(12)
   .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  rAlerta.setBorder(true, true, true, true, null, null, BORDE, SpreadsheetApp.BorderStyle.SOLID);
  h.setRowHeights(24, 3, 20);

  /* ===== DISTRIBUCIÓN POR SECTOR (3 tarjetas) ===== */
  h.getRange(28, COL_INI).setValue('DISTRIBUCI\u00d3N POR SECTOR').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var sectores = [
    { dot:'\ud83d\udfe0', nombre:'NARANJO',  color:'#E8730A' },
    { dot:'\ud83d\udfe1', nombre:'AMARILLO', color:'#C79A00' },
    { dot:'\ud83d\udfe2', nombre:'VERDE',    color:'#2E8B57' }
  ];
  sectores.forEach(function (s2, ix) {
    var c0 = COL_INI + ix * 3 + Math.floor(ix / 2);
    h.getRange(29, c0, 1, 2).merge().setValue(s2.dot + ' ' + s2.nombre)
     .setFontWeight('bold').setFontSize(11).setFontColor(TXT)
     .setHorizontalAlignment('center');
    var rng = h.getRange(30, c0, 2, 2).merge()
     .setFormula('=COUNTIF(PACIENTES!H2:H;"' + s2.nombre + '")&" pacientes"')
     .setFontSize(13).setFontColor(TXT).setBackground(SUAVE)
     .setHorizontalAlignment('center').setVerticalAlignment('middle');
    rng.setBorder(true, true, true, true, null, null, s2.color,
      SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    h.setRowHeights(30, 2, 16);
  });

  /* ===== ESTADO DEL SISTEMA (tarjeta) ===== */
  h.getRange(33, COL_INI).setValue('ESTADO DEL SISTEMA').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  h.getRange(34, COL_INI, 1, 10).merge().setValue('\u2713 SISTEMA OPERATIVO')
   .setFontWeight('bold').setFontSize(13).setFontColor(OK)
   .setBackground(SUAVE).setHorizontalAlignment('center');
  var info = [
    ['Sistema', 'ECICEP v' + ECICEP.VERSION + '  \u00b7  Build ' + (ECICEP_BUILD.commit || 'dev')],
    ['Actualizaci\u00f3n del sistema', ECICEP_BUILD.fecha || '\u2014'],
    ['\u00daltima actualizaci\u00f3n de datos',
      '=IF(COUNT(PACIENTES!AC2:AC)=0;"\u2014";TEXT(MAX(PACIENTES!AC2:AC);"dd/mm/yyyy hh:mm"))'],
    ['\u00daltima sincronizaci\u00f3n de fuentes',
      '=IFERROR(VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0);"\u2014")']
  ];
  info.forEach(function (par, ix) {
    h.getRange(35 + ix, COL_INI, 1, 3).merge().setValue(par[0])
     .setFontColor(GRIS).setFontSize(11).setBackground(BLANCO);
    h.getRange(35 + ix, COL_INI + 3, 1, 7).merge().setValue(par[1])
     .setFontWeight('bold').setFontSize(11).setFontColor(TXT).setBackground(BLANCO);
  });

  /* ===== CONDICIONAL: alerta cambia según contenido ===== */
  h.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=LEFT($B$24;1)="\u26a0"')
      .setRanges([h.getRange(24, COL_INI)]).setBackground(WARN_BG).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=LEFT($B$24;1)="\u2713"')
      .setRanges([h.getRange(24, COL_INI)]).setBackground('#E3F3EA').build()
  ]);

  /* ===== CERRAR LIENZO ===== */
  h.getRange(1, COL_INI, FILA_FIN - 1, COL_FIN - COL_INI + 1)
   .setBorder(true, true, true, true, null, null, BORDE, SpreadsheetApp.BorderStyle.SOLID_THICK);
  h.setRowHeight(1, 12);
  if (h.getMaxRows() > FILA_FIN) h.hideRows(FILA_FIN + 1, h.getMaxRows());
  if (h.getMaxColumns() > COL_FIN) h.hideColumns(COL_FIN + 1, h.getMaxColumns() - COL_FIN);

  h.setTabColor(PRIM);
  return { modulos: INICIO_MODULOS.length, accesos: INICIO_MODULOS.length };
}

// ---------------------------------------------------------------------------
// Formato condicional, filtros, ocultamiento y protecciones
// ---------------------------------------------------------------------------

/** GAS: reglas de formato condicional por hoja.
 *  API a nivel SHEET (get/setConditionalFormatRules — Range no las tiene).
 *  Estas hojas son del sistema: se reemplazan TODAS sus reglas por las del
 *  estándar (idempotente). Errores aislados por hoja. */
function Hojas_formatoCondicional(ss) {
  var aplicadas = 0, errores = [];

  function regla(formula, fondo, rango, negrita) {
    var b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
      .setBackground(fondo).setRanges([rango]);
    if (negrita) b = b.setBold(true);
    return b.build();
  }
  function aplicar(hoja, reglas) {
    hoja.setConditionalFormatRules(reglas);
    aplicadas += reglas.length;
  }

  /* PACIENTES: RUT inválido (rojo), revisión (ámbar), estrat pendiente (ámbar) */
  try {
    var p = ss.getSheetByName(HOJAS.PACIENTES);
    if (p && p.getLastRow() > 1) {
      var filas = Math.max(p.getMaxRows() - 1, 1);
      aplicar(p, [
        regla('=$W2=FALSE', '#FBE4E4', p.getRange(2, 2, filas, 1), true),
        regla('=$AD2=TRUE', '#FBF3D6', p.getRange(2, 30, filas, 1), true),
        regla('=OR($I2="",$I2="G")', '#FBF3D6', p.getRange(2, 9, filas, 1))
      ]);
    }
  } catch (eP) { errores.push('PACIENTES: ' + (eP && eP.message || eP)); }

  /* INGRESO_*: estado con semáforo textual */
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    try {
      var h = ss.getSheetByName(nombre);
      if (!h || h.getLastRow() < 2) return;
      var colEstado = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
      var L = String.fromCharCode(64 + colEstado);
      var rEstado = h.getRange(2, colEstado, Math.max(h.getMaxRows() - 1, 1), 1);
      aplicar(h, [
        regla('=$' + L + '2="ERROR"', '#FBE4E4', rEstado, true),
        regla('=$' + L + '2="REQUIERE_REVISION"', '#FBF3D6', rEstado),
        regla('=$' + L + '2="INGRESADO"', '#E3F3EA', rEstado)
      ]);
    } catch (eI) { errores.push(nombre + ': ' + (eI && eI.message || eI)); }
  });

  /* SECTOR_*: estratificación pendiente */
  HOJAS_SECTOR.forEach(function (nombre) {
    try {
      var h = ss.getSheetByName(nombre);
      if (!h) return;
      var col = COLUMNAS_SECTOR_VISTA.indexOf('ESTRATIFICACION') + 1;
      var letra = String.fromCharCode(64 + col);
      aplicar(h, [
        regla('=OR($' + letra + '2="",$' + letra + '2="G")', '#FBF3D6',
             h.getRange(2, col, Math.max(h.getMaxRows() - 1, 1), 1))
      ]);
    } catch (eS2) { errores.push(nombre + ': ' + (eS2 && eS2.message || eS2)); }
  });

  /* CONFLICTOS: pendiente / resuelto */
  try {
    var con = ss.getSheetByName(HOJAS.CONFLICTOS);
    if (con && con.getLastRow() > 1) {
      var rC = con.getRange(2, 9, Math.max(con.getMaxRows() - 1, 1), 1);
      aplicar(con, [
        regla('=$I2="PENDIENTE"', '#FBF3D6', rC, true),
        regla('=$I2="RESUELTO"', '#E3F3EA', rC)
      ]);
    }
  } catch (eC2) { errores.push('CONFLICTOS: ' + (eC2 && eC2.message || eC2)); }

  return { aplicadas: aplicadas, errores: errores };
}

/** GAS: filtros básicos en hojas de datos (uno por hoja, idempotente). */
function Hojas_filtros(ss) {
  var n = 0;
  ['PACIENTES', 'EVENTOS', 'CONFLICTOS'].concat(HOJAS_SECTOR, Object.keys(HOJAS_INGRESO))
    .forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      if (!h || h.getLastRow() < 2) return;
      if (!h.getFilter()) {
        h.getRange(1, 1, h.getLastRow(), Math.max(h.getLastColumn(), 1)).createFilter();
        n++;
      }
    });
  return { filtros: n };
}

/** GAS: oculta columnas técnicas (idempotente) — no cambia índices. */
function Hojas_ocultarTecnicas(ss) {
  var ocultas = 0;
  function ocultar(hoja, indices) {
    indices.forEach(function (col) {
      if (!hoja.isColumnHiddenByUser(col)) { hoja.hideColumns(col); ocultas++; }
    });
  }
  var p = ss.getSheetByName(HOJAS.PACIENTES);
  if (p) ocultar(p, [1, 7, 22, 24, 27]); // ID_INTERNO·TEL_OBS·NOM_NORM·RUT_SIN_DV·EST_FEC
  var e = ss.getSheetByName(HOJAS.EVENTOS);
  if (e) ocultar(e, [1, 2, 14, 15, 16]); // ID_EVENTO·ID_INTERNO·FUENTE·REGISTRADO_POR·FECHA_REG
  return { ocultas: ocultas };
}

/** GAS: protecciones de ADVERTENCIA según categoría (#2: nunca bloqueo duro). */
function Hojas_proteger(ss) {
  var n = 0;
  function advertir(hoja, a1, desc) {
    var rango = hoja.getRange(a1);
    var ya = hoja.getProtections(SpreadsheetApp.ProtectionType.RANGE)
      .some(function (pr) {
        try { return pr.getDescription() === desc; } catch (eP) { return false; }
      });
    if (!ya) {
      var pr = rango.protect().setDescription(desc);
      pr.setWarningOnly(true);
      n++;
    }
  }
  var ev = ss.getSheetByName(HOJAS.EVENTOS);
  if (ev) advertir(ev, 'A1:Z' + Math.max(ev.getMaxRows(), 1),
    '🔵 EVENTOS es append-only — el sistema agrega; evita editar/borrar filas');
  HOJAS_SECTOR.concat(['REM_SALIDA']).forEach(function (nombre) {
    var h = ss.getSheetByName(nombre);
    if (h) advertir(h, 'A1', '🔵 Hoja generada automáticamente — los cambios se sobrescriben al refrescar');
  });
  var log = ss.getSheetByName(HOJAS.LOG);
  if (log) advertir(log, 'A1', '🔴 Técnica — registro del sistema, no editar');
  var st = ss.getSheetByName(HOJAS.STAGING_IMPORT);
  if (st) advertir(st, 'A1', '🔴 Técnica — zona de importación, no editar');
  var cfg = ss.getSheetByName(HOJAS.CONFIG);
  if (cfg) advertir(cfg, 'A2:A' + Math.max(cfg.getMaxRows(), 1),
    '⚙ No renombrar CLAVES — solo editar VALORES');
  return { protecciones: n };
}

/** Orquestador: aplica TODO el diseño de hojas. Lo llama Instalar sistema. */
function Modelo_disenoHojas() {
  var ss = Modelo_ss();
  var res = {};
  res.inicio = Hojas_crearInicio(ss);
  res.cond = Hojas_formatoCondicional(ss);
  res.filtros = Hojas_filtros(ss);
  res.ocultas = Hojas_ocultarTecnicas(ss);
  res.protecciones = Hojas_proteger(ss);
  Log_info('Hojas', 'diseno', JSON.stringify({ cond: res.cond.aplicadas,
    filtros: res.filtros.filtros, ocultas: res.ocultas.ocultas,
    protecciones: res.protecciones.protecciones }));
  Log_flush();
  return res;
}

/**
 * onEdit — validación de RUT EN VIVO en las puertas INGRESO_*:
 * normaliza el formato, pinta verde/rojo según módulo 11 y marca
 * duplicados con nota. Simple trigger: corre como el usuario.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var nombre = sh.getName();
    if (!HOJAS_INGRESO.hasOwnProperty(nombre)) return;
    var fila = e.range.getRow(), col = e.range.getColumn();
    if (fila < 2) return;
    var colRut = INGRESO_COLUMNAS.indexOf('RUT') + 1;
    if (col !== colRut) return;

    var celda = sh.getRange(fila, col);
    var crudo = e.value;
    if (crudo == null || String(crudo).trim() === '') {
      celda.setBackground(null).setNote(null);
      return;
    }
    var norm = Norm_normalizarRut(String(crudo));
    if (norm.rut && norm.rut !== String(crudo).trim() && e.value === String(crudo)) {
      celda.setValue(norm.rut); // normaliza el formato visible
    }
    var valido = norm.rut && Norm_validarRut(norm.rut);
    celda.setBackground(valido ? '#E3F3EA' : '#FBE4E4');
    celda.setNote(valido ? '✓ RUT válido' :
      '❌ RUT inválido (revisa dígito verificador o formato)');

    /* duplicados dentro de la misma puerta */
    var ultimo = norm.rut || String(crudo).trim().toUpperCase();
    var colVals = sh.getRange(2, col, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    var cnt = 0;
    colVals.forEach(function (r) {
      if (Utl_texto(r[0]).toUpperCase() === ultimo.toUpperCase()) cnt++;
    });
    if (cnt > 1) celda.setNote('⚠ Posible duplicado (' + cnt + ' filas con este RUT)');
  } catch (err) { /* simple trigger: jamás interrumpir al usuario */ }
}

// ---------------------------------------------------------------------------
// Reset de fábrica — eliminar TODAS las hojas para reinstalar desde cero
// ---------------------------------------------------------------------------

/**
 * GAS: elimina TODAS las hojas del spreadsheet (deja una mínima vacía).
 * @param {boolean} conBackup si true, copia el spreadsheet completo a Drive
 *        antes de borrar (RECOMENDADO: es la única red de seguridad).
 * @returns {ok, backupUrl?, hojasEliminadas}
 */
function Hojas_resetFabrica(conBackup) {
  var ss = Modelo_ss();
  var backupUrl = null;
  if (conBackup) {
    var nombreBackup = 'BACKUP_ECICEP_' + Utilities.formatDate(new Date(),
      Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var copia = DriveApp.getFileById(ss.getId()).makeCopy(nombreBackup);
    backupUrl = copia.getUrl();
    Log_info('Fabrica', 'reset', 'Backup creado: ' + nombreBackup);
  }
  var primera = ss.getSheets()[0];
  ss.getSheets().forEach(function (sh) {
    if (sh !== primera) ss.deleteSheet(sh);
  });
  primera.clear();
  primera.setName('Hoja 1');
  primera.setTabColor(null);
  if (primera.getFilter()) primera.getFilter().remove();
  Log_warning('Fabrica', 'reset', 'Todas las hojas eliminadas (' +
    (conBackup ? 'con backup' : 'SIN backup') + ')');
  Log_flush();
  return { ok: true, backupUrl: backupUrl };
}

/** GAS: confirmación en dos pasos con palabra clave. */
function UI_resetFabrica(conBackup) {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt(
    '⚠️ RESET DE FÁBRICA — Paso 1/2',
    'Esto ELIMINARÁ TODAS las hojas y datos del spreadsheet\n' +
    '(pacientes, eventos, conflictos, configuración).\n\n' +
    'Escribe ELIMINAR para continuar:',
    ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  if (Utl_texto(r1.getResponseText()).trim() !== 'ELIMINAR') {
    ui.alert('Palabra incorrecta — operación cancelada.');
    return;
  }
  var r2 = ui.prompt(
    'Paso 2/2 — Backup',
    '¿Crear backup completo en Drive antes de borrar?\n' +
    'RECOMENDADO: sí (es la única red de seguridad).\n\n' +
    'Escribe SI para crear backup, NO para borrar sin backup:',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var resp = Utl_texto(r2.getResponseText()).trim().toUpperCase();
  if (resp !== 'SI' && resp !== 'NO') {
    ui.alert('Respuesta inválida — operación cancelada.');
    return;
  }
  var r = Hojas_resetFabrica(resp === 'SI');
  ui.alert('🏭 RESET COMPLETADO\n\n' +
    (r.backupUrl ? 'Backup creado en Drive.\n' : 'SIN backup.\n') +
    '\nSiguiente paso:\nECICEP → ⚙️ Sistema → 🔧 Instalar / Reparar Sistema\n' +
    '(recreará hojas y re-importará las fuentes conectadas).');
}

// ---------------------------------------------------------------------------
// 💾 Backups — manual ahora + automático semanal (trigger) con poda
// ---------------------------------------------------------------------------

var BACKUP_PREFIJO_AUTO = 'AUTO_ECICEP_BACKUP';
var BACKUP_MANTENER = 8;

/** GAS: copia completa del spreadsheet (hojas, formatos, paneles, todo). */
function Backup_crear(etiqueta) {
  var ss = Modelo_ss();
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  var nombre = 'BACKUP_ECICEP' + (etiqueta ? '_' + etiqueta : '') + '_' + ts;
  var copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre);
  Log_info('Backup', 'crear', nombre);
  Log_flush();
  return { ok: true, nombre: nombre, url: copia.getUrl(), id: copia.getId() };
}

/** GAS: elimina los backups automáticos más viejos, conserva los últimos N. */
function Backup_podarAuto(mantener) {
  var lista = [];
  var files = DriveApp.searchFiles('name contains "' + BACKUP_PREFIJO_AUTO + '" and trashed = false');
  while (files.hasNext()) lista.push(files.next());
  lista.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  var borrados = 0;
  for (var i = (mantener || BACKUP_MANTENER); i < lista.length; i++) {
    lista[i].setTrashed(true); borrados++;
  }
  return borrados;
}

/** GAS: punto de entrada del TRIGGER semanal (sin UI). */
function Backup_programado() {
  var r = Backup_crear('AUTO');
  var borrados = Backup_podarAuto(BACKUP_MANTENER);
  _config_set('BACKUP_AUTO_ULTIMA', Utilities.formatDate(new Date(),
    Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
  Log_info('Backup', 'programado', r.nombre + ' · podados=' + borrados);
  Log_flush();
  return r;
}

/** GAS: ¿existe el trigger semanal? */
function Backup_triggerInstalado() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'Backup_programado';
  });
}

/** GAS: instala trigger semanal (domingo 03:00), idempotente. */
function Backup_programarSemanal() {
  Backup_quitarProgramacion();
  ScriptApp.newTrigger('Backup_programado').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  Log_info('Backup', 'programar', 'trigger semanal instalado');
  Log_flush();
}

/** GAS: quita el trigger semanal. */
function Backup_quitarProgramacion() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'Backup_programado') ScriptApp.deleteTrigger(t);
  });
}

/** GAS: estado actual de backups. */
function Backup_estado() {
  return { trigger: Backup_triggerInstalado(),
           ultima: _rem9_configValor('BACKUP_AUTO_ULTIMA') || 'nunca' };
}

/** 💾 Menú único de backups (manual / programar / quitar / estado). */
function UI_backup() {
  var ui = SpreadsheetApp.getUi();
  var st = Backup_estado();
  var r = ui.prompt(
    '💾 BACKUPS DEL SISTEMA',
    'Programación semanal: ' + (st.trigger ? 'ACTIVA (domingo 03:00)' : 'inactiva') +
    '\nÚltima automática: ' + st.ultima +
    '\nSe conservan los últimos ' + BACKUP_MANTENER + ' automáticos.\n\n' +
    'Escribe una opción:\n' +
    '  AHORA   → backup manual completo, ahora\n' +
    '  SEMANAL → activar backup automático semanal\n' +
    '  QUITAR  → desactivar automático\n' +
    '  ESTADO  → ver estado',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var op = Utl_texto(r.getResponseText()).trim().toUpperCase();
  if (op === 'AHORA') {
    var b = Backup_crear('MANUAL');
    ui.alert('✓ Backup creado:\n' + b.nombre + '\n\n' + b.url);
  } else if (op === 'SEMANAL') {
    Backup_programarSemanal();
    ui.alert('✓ Backup automático semanal ACTIVADO\n(Domingo 03:00 · se conservan los últimos ' +
      BACKUP_MANTENER + ')');
  } else if (op === 'QUITAR') {
    Backup_quitarProgramacion();
    ui.alert('Programación automática desactivada.');
  } else if (op === 'ESTADO') {
    ui.alert('Programación semanal: ' + (st.trigger ? 'ACTIVA' : 'inactiva') +
      '\nÚltima automática: ' + st.ultima);
  } else {
    ui.alert('Opción no reconocida: ' + op);
  }
}
