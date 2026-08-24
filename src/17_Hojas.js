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
    case 'POR_REVISAR': return '=COUNTIF(PACIENTES!AD2:AD,TRUE)';
    case 'ESTRAT_PEND': return '=COUNTIF(PACIENTES!I2:I,"")+COUNTIF(PACIENTES!I2:I,"G")';
    case 'RUT_INVALIDOS': return '=COUNTIF(PACIENTES!W2:W,FALSE)';
    case 'DUPLICADOS':  return '=SUMPRODUCT((PACIENTES!B2:B<>"")*(COUNTIF(PACIENTES!B2:B,PACIENTES!B2:B)>1))';
    case 'ULT_ACT':     return '=IF(COUNT(PACIENTES!AC2:AC)=0,"\\u2014",TEXT(MAX(PACIENTES!AC2:AC),"dd/mm/yyyy hh:mm"))';
    default: return '';
  }
}

/** GAS: hoja INICIO — navegación + indicadores vivos. Idempotente. */
function Hojas_crearInicio(ss) {
  var h = ss.getSheetByName('INICIO');
  if (!h) { h = ss.insertSheet('INICIO'); }
  h.clear();
  var gids = {};
  HOJAS_NAV.forEach(function (n) {
    var sh = ss.getSheetByName(n.hoja);
    if (sh) gids[n.hoja] = sh.getSheetId();
  });

  h.getRange('B2').setValue('ECICEP').setFontWeight('bold').setFontSize(22)
   .setFontColor('#0E5C68').setFontFamily('Sora');
  h.getRange('B3').setValue('Panel de navegación del sistema \\u00b7 CESFAM San Juan')
   .setFontColor('#5B6472').setFontSize(10);

  h.getRange('B5').setValue('ACCESOS').setFontWeight('bold').setFontSize(10)
   .setFontColor('#8A93A3');
  var fila = 6;
  HOJAS_NAV.forEach(function (n) {
    if (!gids[n.hoja]) return;
    h.getRange(fila, 2).setFormula(
      '=HYPERLINK("#gid=' + gids[n.hoja] + '","' + n.etiqueta + '")')
      .setFontSize(12).setFontColor('#0E5C68');
    fila++;
  });

  fila += 1;
  h.getRange(fila, 2).setValue('INDICADORES DE CALIDAD').setFontWeight('bold')
   .setFontSize(10).setFontColor('#8A93A3');
  fila++;
  var indicadores = [
    ['Pacientes', 'TOTAL_PAC'], ['Eventos', 'EVENTOS'],
    ['Por revisar', 'POR_REVISAR'], ['Estratificación pendiente', 'ESTRAT_PEND'],
    ['RUT inválidos', 'RUT_INVALIDOS'], ['Registros duplicados', 'DUPLICADOS'],
    ['Última actualización', 'ULT_ACT']
  ];
  indicadores.forEach(function (ind) {
    h.getRange(fila, 2).setValue(ind[0]).setFontColor('#5B6472');
    h.getRange(fila, 3).setFormula(Hojas_formulaIndicador(ind[1]))
     .setFontWeight('bold').setFontFamily('Sora');
    fila++;
  });

  fila += 1;
  h.getRange(fila, 2).setValue('Los indicadores se calculan solos (fórmulas vivas). '+
    'Usa el menú ECICEP para las operaciones.').setFontItalic(true).setFontSize(9)
    .setFontColor('#8A93A3');

  h.setColumnWidth(2, 240); h.setColumnWidth(3, 160);
  h.setTabColor('#0E5C68');
  h.setHiddenGridlines(true);
  return { filas: fila, accesos: Object.keys(gids).length };
}

// ---------------------------------------------------------------------------
// Formato condicional, filtros, ocultamiento y protecciones
// ---------------------------------------------------------------------------

/** GAS: reglas de formato condicional por hoja (idempotente: borra las del
 *  sistema 'ECICEP-FMT' y recrea). Estados con color + texto ya en celda. */
function Hojas_formatoCondicional(ss) {
  var aplicadas = 0;
  function reemplazar(hoja, reglas) {
    var rangoTodo = hoja.getRange(1, 1, Math.max(hoja.getMaxRows(), 1), Math.max(hoja.getLastColumn(), 1));
    rangoTodo.getConditionalFormatRules().forEach(function (r) {
      if (r.getFrozens && false) {}
    });
    // borrar solo reglas propias: Sheets no etiqueta reglas → reconstruir todas
    var actuales = hoja.getConditionalFormatRules();
    var conservar = actuales.filter(function (r) {
      return String(r.getRanges()[0] && r.getRanges()[0].getA1Notation()).indexOf('ECICEP') !== -1;
    });
    hoja.setConditionalFormatRules(conservar.concat(reglas));
    aplicadas += reglas.length;
  }
  function regla(formula, fondo, rango, negrita) {
    var b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
      .setBackground(fondo).setRanges([rango]);
    if (negrita) b = b.setFontBold(true);
    return b.build();
  }

  /* PACIENTES: RUT inválido (rojo), revisión (ámbar), estrat pendiente (ámbar) */
  var p = ss.getSheetByName(HOJAS.PACIENTES);
  if (p && p.getLastRow() > 1) {
    var filas = Math.max(p.getMaxRows() - 1, 1);
    var reglas = [
      regla('=$W2=FALSE', '#FBE4E4', p.getRange(2, 2, filas, 1), true),   // RUT inválido
      regla('=$AD2=TRUE', '#FBF3D6', p.getRange(2, 30, filas, 1), true),  // Requiere revisión
      regla('=OR($I2="",$I2="G")', '#FBF3D6', p.getRange(2, 9, filas, 1)) // Estrat pendiente
    ];
    reemplazar(p, reglas);
  }

  /* INGRESO_*: estado con semáforo textual */
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    var h = ss.getSheetByName(nombre);
    if (!h || h.getLastRow() < 2) return;
    var colEstado = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
    var filas = Math.max(h.getMaxRows() - 1, 1);
    var rEstado = h.getRange(2, colEstado, filas, 1);
    reemplazar(h, [
      regla('=$' + String.fromCharCode(64 + colEstado) + '2="ERROR"', '#FBE4E4', rEstado, true),
      regla('=$' + String.fromCharCode(64 + colEstado) + '2="REQUIERE_REVISION"', '#FBF3D6', rEstado),
      regla('=$' + String.fromCharCode(64 + colEstado) + '2="INGRESADO"', '#E3F3EA', rEstado)
    ]);
  });

  /* SECTOR_*: estratificación pendiente */
  HOJAS_SECTOR.forEach(function (nombre) {
    var h = ss.getSheetByName(nombre);
    if (!h || h.getLastRow() < 2) return;
    var col = COLUMNAS_SECTOR_VISTA.indexOf('ESTRATIFICACION') + 1;
    var letra = String.fromCharCode(64 + col);
    reemplazar(h, [
      regla('=OR($' + letra + '2="",$' + letra + '2="G")', '#FBF3D6',
           h.getRange(2, col, Math.max(h.getMaxRows() - 1, 1), 1))
    ]);
  });

  /* CONFLICTOS: pendiente / resuelto */
  var con = ss.getSheetByName(HOJAS.CONFLICTOS);
  if (con && con.getLastRow() > 1) {
    var colRev = 9; // ESTADO_REVISION
    var rC = con.getRange(2, colRev, Math.max(con.getMaxRows() - 1, 1), 1);
    reemplazar(con, [
      regla('=$I2="PENDIENTE"', '#FBF3D6', rC, true),
      regla('=$I2="RESUELTO"', '#E3F3EA', rC)
    ]);
  }
  return { aplicadas: aplicadas };
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
    var ya = rango.getProtections(SpreadsheetApp.ProtectionType.RANGE)
      .some(function (pr) { return pr.getDescription() === desc; });
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
