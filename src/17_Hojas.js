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

/** GAS: INICIO — escritorio principal del sistema (no parece hoja de cálculo). */
function Hojas_crearInicio(ss) {
  var h = ss.getSheetByName('INICIO');
  if (!h) h = ss.insertSheet('INICIO');
  h.clear();
  h.setHiddenGridlines(true);

  var PRIM = '#0E5C68', TXT = '#1C2430', GRIS = '#5B6472', SUAVE = '#F1F3F6';
  var verTxt = 'v' + ECICEP.VERSION + '  ·  Build ' + (ECICEP_BUILD.commit || 'dev');

  /* anchos: A espaciador, B..I contenido */
  h.setColumnWidth(1, 24);
  for (var c = 2; c <= 9; c++) h.setColumnWidth(c, 112);

  /* CABECERA */
  h.getRange('B2:D3').merge().setValue('ECICEP')
    .setFontWeight('bold').setFontSize(26).setFontColor(PRIM).setFontFamily('Sora')
    .setVerticalAlignment('middle');
  h.getRange('E2:I2').merge().setValue('v' + ECICEP.VERSION + '  ·  \u2713 Operativo')
    .setFontWeight('bold').setFontSize(11).setFontColor('#1F9D6B')
    .setHorizontalAlignment('right').setVerticalAlignment('bottom');
  h.getRange('E3:I3').merge().setValue('Build ' + (ECICEP_BUILD.commit || 'dev'))
    .setFontSize(9).setFontColor('#8A93A3')
    .setHorizontalAlignment('right').setVerticalAlignment('top');
  h.getRange('B4:I4').merge()
   .setValue('Sistema de Gesti\u00f3n de Pacientes Cr\u00f3nicos por Sectores \u00b7 CESFAM San Juan')
   .setFontStyle('italic').setFontSize(11).setFontColor(GRIS);

  /* MÓDULOS */
  h.getRange('B6').setValue('M\u00d3DULOS DEL SISTEMA').setFontWeight('bold')
   .setFontSize(10).setFontColor('#8A93A3');
  var fila = 7;
  INICIO_MODULOS.forEach(function (mod) {
    var gidSh = ss.getSheetByName(mod.hoja);
    if (!gidSh) return;
    h.getRange(fila, 2, 1, 8).merge()
     .setFormula('=HYPERLINK("#gid=' + gidSh.getSheetId() + '";"' +
        mod.icono + '  ' + mod.nombre + '   \u00b7   ' + mod.desc + '")')
     .setFontWeight('bold').setFontSize(12).setFontColor(PRIM)
     .setBackground(SUAVE).setHorizontalAlignment('left')
     .setVerticalAlignment('middle');
    h.setRowHeight(fila, 30);
    fila++;
  });

  /* INDICADORES (tarjetas KPI) */
  fila += 1;
  h.getRange(fila, 2).setValue('INDICADORES').setFontWeight('bold')
   .setFontSize(10).setFontColor('#8A93A3');
  fila++;
  var kpis = [
    ['PACIENTES', '=COUNTA(PACIENTES!A2:A)'],
    ['EVENTOS', '=COUNTA(EVENTOS!A2:A)'],
    ['POR REVISAR', '=COUNTIF(PACIENTES!AD2:AD;TRUE)'],
    ['ESTRAT. PENDIENTE', '=COUNTIF(PACIENTES!I2:I;"")+COUNTIF(PACIENTES!I2:I;"G")'],
    ['RUT INV\u00c1LIDOS', '=COUNTIF(PACIENTES!W2:W;FALSE)'],
    ['DUPLICADOS', '=SUMPRODUCT((PACIENTES!B2:B<>"")*(COUNTIF(PACIENTES!B2:B;PACIENTES!B2:B)>1))']
  ];
  var colK = 2;
  kpis.forEach(function (k) {
    h.getRange(fila, colK, 1, 2).merge().setFormula(k[1])
     .setFontWeight('bold').setFontSize(18).setFontFamily('Sora')
     .setFontColor(PRIM).setBackground(SUAVE)
     .setHorizontalAlignment('center').setVerticalAlignment('middle');
    h.getRange(fila + 1, colK, 1, 2).merge().setValue(k[0])
     .setFontSize(9).setFontColor(GRIS).setBackground(SUAVE)
     .setHorizontalAlignment('center');
    colK += 2;
  });
  h.setRowHeight(fila, 34);
  fila += 2;

  /* ALERTAS (fórmulas: aparecen/desaparecen solas) */
  h.getRange(fila, 2).setValue('\u26a0 ATENCI\u00d3N REQUERIDA').setFontWeight('bold')
   .setFontSize(10).setFontColor('#8A93A3');
  fila++;
  var alertas = [
    ['=IF(COUNTIF(PACIENTES!AD2:AD;TRUE)>0;"\u26a0 "&COUNTIF(PACIENTES!AD2:AD;TRUE)&" pacientes requieren revis\u00f3n";"\u2713 Sin pacientes por revisar")'],
    ['=IF(COUNTIF(PACIENTES!W2:W;FALSE)>0;"\u26a0 "&COUNTIF(PACIENTES!W2:W;FALSE)&" RUT inv\u00e1lidos detectados";"\u2713 RUTs correctos")'],
    ['=IF(COUNTIF(PACIENTES!I2:I;"")+COUNTIF(PACIENTES!I2:I;"G")>0;"\u26a0 "&(COUNTIF(PACIENTES!I2:I;"")+COUNTIF(PACIENTES!I2:I;"G"))&" sin estratificaci\u00f3n confirmada";"\u2713 Estratificaci\u00f3n completa")']
  ];
  alertas.forEach(function (a) {
    h.getRange(fila, 2, 1, 8).merge().setFormula(a[0]).setFontSize(11);
    fila++;
  });

  /* DISTRIBUCIÓN POR SECTOR */
  fila += 1;
  h.getRange(fila, 2).setValue('DISTRIBUCI\u00d3N POR SECTOR').setFontWeight('bold')
   .setFontSize(10).setFontColor('#8A93A3');
  fila++;
  [['\ud83d\udfe0 NARANJO'], ['\ud83d\udfe1 AMARILLO'], ['\ud83d\udfe2 VERDE']].forEach(function (s2, ix) {
    var nom = ['NARANJO', 'AMARILLO', 'VERDE'][ix];
    h.getRange(fila, 2).setValue(s2[0]).setFontWeight('bold').setFontSize(11);
    h.getRange(fila, 3).setFormula('=COUNTIF(PACIENTES!H2:H;"' + nom + '")&" pacientes"')
     .setFontColor(GRIS).setFontSize(11);
    fila++;
  });

  /* ESTADO DEL SISTEMA + INFORMACIÓN */
  fila += 1;
  h.getRange(fila, 2).setValue('ESTADO DEL SISTEMA').setFontWeight('bold')
   .setFontSize(10).setFontColor('#8A93A3');
  fila++;
  h.getRange(fila, 2).setValue('\u2713 SISTEMA OPERATIVO').setFontWeight('bold')
   .setFontSize(13).setFontColor('#1F9D6B');
  fila++;
  var info = [
    ['Sistema', 'ECICEP v' + ECICEP.VERSION + '  \u00b7  Build ' + (ECICEP_BUILD.commit || 'dev')],
    ['Actualizaci\u00f3n del sistema', ECICEP_BUILD.fecha || '—'],
    ['\u00daltima actualizaci\u00f3n de datos',
      '=IF(COUNT(PACIENTES!AC2:AC)=0;"\u2014";TEXT(MAX(PACIENTES!AC2:AC);"dd/mm/yyyy hh:mm"))'],
    ['\u00daltima sincronizaci\u00f3n de fuentes',
      '=IFERROR(VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0);"\u2014")']
  ];
  info.forEach(function (par) {
    h.getRange(fila, 2).setValue(par[0]).setFontColor(GRIS).setFontSize(11);
    h.getRange(fila, 4).setValue(par[1]).setFontWeight('bold').setFontSize(11)
     .setFontColor(TXT);
    fila++;
  });

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
