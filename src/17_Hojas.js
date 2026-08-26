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

/** GAS: INICIO v5 — lienzo azul EXTENDIDO con márgenes de seguridad.
 *  Orden garantizado: medir → expandir filas → expandir columnas → pintar.
 *  Nunca opera sobre rangos inexistentes (#sin errores de límites). */
function Hojas_crearInicio(ss) {
  var h = ss.getSheetByName('INICIO');
  if (!h) h = ss.insertSheet('INICIO');

  /* PASO 1-2: medir */
  var maxF = h.getMaxRows(), maxC = h.getMaxColumns();

  /* PASO 2-3: dimensiones del lienzo (contenido + márgenes generosos) */
  var FILA_FIN = 90;   // lienzo vertical: contenido hasta ~44 + margen azul 45..90
  var COL_FIN = 40;    // lienzo horizontal: contenido + margen azul amplio (pantallas 21")
  var FILA_CONT = 44;  // última fila de contenido
  var COL_CONT = 20;   // última columna de contenido

  /* PASO 3-4: expandir ANTES de pintar */
  if (maxF < FILA_FIN) h.insertRowsAfter(maxF, FILA_FIN - maxF);
  if (maxC < COL_FIN) h.insertColumnsAfter(maxC, COL_FIN - maxC);

  h.clear();
  h.setHiddenGridlines(true);

  var AZUL = '#0B3C49', AZUL_BAR = '#0E4A5C', PRIM = '#0E5C68', PRIM_BR = '#1B7A8A',
      VENTANA = '#F7F8FA', BLANCO = '#FFFFFF', TXT = '#12242E',
      GRIS = '#5B6472', MUTED = '#7E93A3', BORDE = '#C9D4DC', SUAVE = '#F1F3F6',
      OK = '#35C28F', WARN_BG = '#FBF3D6';

  /* PASO 5-6: FUNDO AZUL COMPLETO (todo el lienzo, incluidos márgenes) */
  h.getRange(1, 1, FILA_FIN, COL_FIN).setBackground(AZUL);

  /* márgenes de seguridad: última col/fila del lienzo anchas y azules */
  h.setColumnWidth(1, 140);           // margen azul izquierdo
  h.setColumnWidth(2, 40);            // col 2: azul entre margen y ventana
  h.setColumnWidth(COL_FIN, 400);     // margen azul derecho panorámico
  h.setRowHeight(1, 24);              // margen azul superior
  h.setRowHeight(FILA_FIN, 160);      // margen azul inferior amplio
  for (var cm = 2; cm < COL_FIN; cm++) h.setColumnWidth(cm, 58);

  /* PASO 7: VENTANA central clara (cols 3..20, filas 3..44) */
  h.getRange(3, 3, FILA_CONT - 2, COL_CONT - 2).setBackground(VENTANA);

  var vC0 = 4, vC1 = 19; // columnas de contenido dentro de la ventana

  /* ===== BARRA SUPERIOR DE APLICACIÓN ===== */
  h.getRange(3, 3, 1, COL_CONT - 2).setBackground(AZUL_BAR);
  h.getRange(3, 4).setValue('\u25cf \u25cf \u25cf   ECICEP')
   .setFontWeight('bold').setFontSize(11).setFontColor('#FFFFFF');
  h.getRange(3, 13, 1, 7).merge()
   .setValue('\u2713 Operativo   \u00b7   v' + ECICEP.VERSION + '   \u00b7   Build ' +
     (ECICEP_BUILD.commit || 'dev'))
   .setFontSize(10).setFontColor('#9FD8CF').setHorizontalAlignment('right');
  h.setRowHeight(3, 28);

  /* ===== CABECERA ===== */
  h.getRange(5, 4, 2, 6).merge().setValue('ECICEP')
   .setFontWeight('bold').setFontSize(30).setFontColor(PRIM).setFontFamily('Sora')
   .setVerticalAlignment('middle');
  h.getRange(5, 12, 2, 8).merge()
   .setValue('Sistema de Gesti\u00f3n de Pacientes Cr\u00f3nicos por Sectores\nCESFAM San Juan')
   .setFontSize(11).setFontColor(GRIS).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP)
   .setHorizontalAlignment('right').setVerticalAlignment('middle');
  h.setRowHeight(5, 24); h.setRowHeight(6, 24);

  /* ===== MÓDULOS PRINCIPALES (4 botones, 4 cols c/u) ===== */
  h.getRange(8, 4).setValue('M\u00d3DULOS DEL SISTEMA').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var principales = [
    { hoja:'PACIENTES',       icono:'\ud83d\udc65', nombre:'PACIENTES',        desc:'Consulta y gesti\u00f3n' },
    { hoja:'INGRESO_NARANJO', icono:'\ud83d\udce5', nombre:'INGRESOS',         desc:'Nuevos registros' },
    { hoja:'CONFLICTOS',      icono:'\ud83d\udccb', nombre:'REVISI\u00d3N',   desc:'Requieren atenci\u00f3n' },
    { hoja:'REM_SALIDA',      icono:'\ud83e\ude7a', nombre:'REM',              desc:'Reporte mensual' }
  ];
  principales.forEach(function (mod, ix) {
    var c0 = 4 + ix * 4;
    var rng = h.getRange(9, c0, 3, 4).merge();
    rng.setFormula('=HYPERLINK("#gid=' + ss.getSheetByName(mod.hoja).getSheetId() +
      '";"' + mod.icono + '\n' + mod.nombre + '\n' + mod.desc + '")')
     .setFontWeight('bold').setFontSize(12).setFontColor('#FFFFFF')
     .setBackground(PRIM).setHorizontalAlignment('center')
     .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    rng.setBorder(true, true, true, true, null, null, PRIM_BR,
      SpreadsheetApp.BorderStyle.SOLID);
    h.setRowHeights(9, 3, 22);
  });

  /* ===== MÓDULOS SECUNDARIOS (4 botones suaves) ===== */
  var secundarios = [
    { hoja:'SECTOR_NARANJO', icono:'\ud83d\udfe7', nombre:'SECTORES',   desc:'Naranjo \u00b7 Amarillo · Verde' },
    { hoja:'FUENTES',        icono:'\ud83d\uddc2\ufe0f', nombre:'FUENTES', desc:'Informaci\u00f3n y sync' },
    { hoja:'LOG',            icono:'\ud83e\uddea', nombre:'DIAGN\u00d3STICO', desc:'Centro de Pruebas · LOG' },
    { hoja:'CONFIG',         icono:'\u2699\ufe0f', nombre:'ADMINISTRACI\u00d3N', desc:'Configuraci\u00f3n' }
  ];
  secundarios.forEach(function (mod, ix) {
    var c0 = 4 + ix * 4;
    var rng = h.getRange(13, c0, 3, 4).merge();
    rng.setFormula('=HYPERLINK("#gid=' + ss.getSheetByName(mod.hoja).getSheetId() +
      '";"' + mod.icono + '\n' + mod.nombre + '\n' + mod.desc + '")')
     .setFontWeight('bold').setFontSize(11).setFontColor(PRIM)
     .setBackground(BLANCO).setHorizontalAlignment('center')
     .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    rng.setBorder(true, true, true, true, null, null, BORDE,
      SpreadsheetApp.BorderStyle.SOLID);
    h.setRowHeights(13, 3, 20);
  });

  /* ===== INDICADORES (6 tarjetas, 2 filas × 3) ===== */
  h.getRange(17, 4).setValue('INDICADORES').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var kpis = [
    ['=COUNTA(PACIENTES!A2:A)', 'PACIENTES', 'Total registrados'],
    ['=COUNTA(EVENTOS!A2:A)', 'EVENTOS', 'Historial del sistema'],
    ['=COUNTIF(PACIENTES!AD2:AD;TRUE)', 'POR REVISAR', 'Requieren atención'],
    ['=COUNTIF(PACIENTES!I2:I;"")+COUNTIF(PACIENTES!I2:I;"G")', 'ESTRAT. PENDIENTE', 'Sin confirmar'],
    ['=COUNTIF(PACIENTES!W2:W;FALSE)', 'RUT INV\u00c1LIDOS', 'DV incorrecto'],
    ['=SUMPRODUCT((PACIENTES!B2:B<>"")*(COUNTIF(PACIENTES!B2:B;PACIENTES!B2:B)>1))', 'DUPLICADOS', 'Detectados']
  ];
  kpis.forEach(function (k, ix) {
    var fila = 18 + Math.floor(ix / 3) * 4;
    var c0 = 4 + (ix % 3) * 4 + (ix % 3) * 0;
    if (ix % 3 === 1) c0 = 9; if (ix % 3 === 2) c0 = 14; // 4-7 · 9-12 · 14-17
    h.getRange(fila, c0, 1, 4).merge().setValue(k[1])
     .setFontSize(9).setFontWeight('bold').setFontColor(MUTED).setBackground(BLANCO);
    var rngV = h.getRange(fila + 1, c0, 1, 4).merge().setFormula(k[0])
     .setFontWeight('bold').setFontSize(22).setFontFamily('Sora').setFontColor(PRIM)
     .setBackground(BLANCO).setHorizontalAlignment('center');
    h.getRange(fila + 2, c0, 1, 4).merge().setValue(k[2])
     .setFontSize(9.5).setFontColor(GRIS).setBackground(BLANCO);
    h.getRange(fila, c0, 3, 4).setBorder(true, true, true, true, null, null,
      BORDE, SpreadsheetApp.BorderStyle.SOLID);
    h.setRowHeight(fila, 14); h.setRowHeight(fila + 1, 32); h.setRowHeight(fila + 2, 14);
  });

  /* ===== ALERTA DINÁMICA (tarjeta) ===== */
  h.getRange(24, 4).setValue('ALERTAS').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var rA = h.getRange(25, 4, 2, 16).merge();
  rA.setFormula('=IF(COUNTIF(PACIENTES!AD2:AD;TRUE)+COUNTIF(PACIENTES!W2:W;FALSE)>0;' +
    '"\u26a0 ATENCI\u00d3N REQUERIDA\n" & COUNTIF(PACIENTES!AD2:AD;TRUE) & ' +
    '" pacientes por revisar \u00b7 " & COUNTIF(PACIENTES!W2:W;FALSE) & ' +
    '" RUT inv\u00e1lidos   \u2014   abrir Cola de Revisi\u00f3n \u2192";' +
    '"\u2713 TODO EN ORDEN\nNo existen incidencias pendientes")')
   .setFontWeight('bold').setFontSize(12).setVerticalAlignment('middle')
   .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  rA.setBorder(true, true, true, true, null, null, BORDE,
    SpreadsheetApp.BorderStyle.SOLID);
  h.setRowHeights(25, 2, 18);

  /* ===== DISTRIBUCIÓN POR SECTOR (3 tarjetas) ===== */
  h.getRange(28, 4).setValue('DISTRIBUCI\u00d3N POR SECTOR').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var sectores = [
    { nombre:'NARANJO',  color:'#E8730A' },
    { nombre:'AMARILLO', color:'#C79A00' },
    { nombre:'VERDE',    color:'#2E8B57' }
  ];
  sectores.forEach(function (s2, ix) {
    var c0 = 4 + ix * 5 + (ix === 2 ? 1 : 0);
    h.getRange(29, c0, 1, 4).merge().setValue('\u25cf ' + s2.nombre)
     .setFontWeight('bold').setFontSize(10).setFontColor(s2.color).setBackground(BLANCO)
     .setHorizontalAlignment('center');
    var rng = h.getRange(30, c0, 1, 4).merge()
     .setFormula('=COUNTIF(PACIENTES!H2:H;"' + s2.nombre + '")&" pacientes"')
     .setFontWeight('bold').setFontSize(13).setFontColor(TXT).setBackground(SUAVE)
     .setHorizontalAlignment('center').setVerticalAlignment('middle');
    h.getRange(31, c0, 1, 4).merge()
     .setFormula('=TEXT(COUNTIF(PACIENTES!H2:H;"' + s2.nombre + '")/MAX(COUNTA(PACIENTES!A2:A);1);"0%")&" del total"')
     .setFontSize(9).setFontColor(MUTED).setBackground(BLANCO)
     .setHorizontalAlignment('center');
    h.getRange(29, c0, 3, 4).setBorder(true, true, true, true, null, null,
      s2.color, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    h.setRowHeight(29, 16); h.setRowHeight(30, 24); h.setRowHeight(31, 14);
  });

  /* ===== ESTADO DEL SISTEMA (tarjeta) ===== */
  h.getRange(33, 4).setValue('ESTADO DEL SISTEMA').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  h.getRange(34, 4, 1, 16).merge().setValue('\u2713 SISTEMA OPERATIVO')
   .setFontWeight('bold').setFontSize(13).setFontColor(OK).setBackground(BLANCO)
   .setHorizontalAlignment('center');
  var info = [
    ['Versión', 'ECICEP v' + ECICEP.VERSION],
    ['Build', (ECICEP_BUILD.commit || 'dev')],
    ['Actualización del sistema', ECICEP_BUILD.fecha || '\u2014'],
    ['\u00daltima actualización de datos',
      '=IF(COUNT(PACIENTES!AC2:AC)=0;"\u2014";TEXT(MAX(PACIENTES!AC2:AC);"dd/mm/yyyy hh:mm"))'],
    ['\u00daltima sincronización de fuentes',
      '=IFERROR(VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0);"\u2014")']
  ];
  info.forEach(function (par, ix) {
    h.getRange(35 + ix, 4, 1, 4).merge().setValue(par[0])
     .setFontColor(GRIS).setFontSize(10.5).setBackground(BLANCO);
    h.getRange(35 + ix, 8, 1, 12).merge().setValue(par[1])
     .setFontWeight('bold').setFontSize(10.5).setFontColor(TXT).setBackground(BLANCO);
    h.setRowHeight(35 + ix, 16);
  });

  /* ===== PASO 14: ocultar SOLO excedentes fuera del lienzo ===== */
  if (h.getMaxRows() > FILA_FIN) h.hideRows(FILA_FIN + 1, h.getMaxRows() - FILA_FIN);
  if (h.getMaxColumns() > COL_FIN) h.hideColumns(COL_FIN + 1, h.getMaxColumns() - COL_FIN);
  h.setTabColor(AZUL);

  /* ===== PASO 15: verificación final automática ===== */
  var ver = {
    hoja: !!ss.getSheetByName('INICIO'),
    filas: h.getMaxRows() >= FILA_FIN,
    columnas: h.getMaxColumns() >= COL_FIN,
    fondo: String(h.getRange(1, 1).getBackground()).toLowerCase() === AZUL.toLowerCase(),
    ventana: String(h.getRange(5, 4).getBackground()).toLowerCase() === VENTANA.toLowerCase() ||
             String(h.getRange(5, 4).getBackground()).toLowerCase() === BLANCO.toLowerCase(),
    modulos: h.getRange(9, 4).getFormula().indexOf('HYPERLINK') !== -1,
    kpi: h.getRange(19, 4).getFormula().indexOf('COUNTA') !== -1
  };
  var fallos = Object.keys(ver).filter(function (k) { return !ver[k]; });
  if (fallos.length) {
    throw new Error('Verificación INICIO falló en: ' + fallos.join(', '));
  }
  return { ok: true, verificacion: ver, lienzo: { filas: FILA_FIN, columnas: COL_FIN } };
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

  /* Dropdown SEXO (F/M) en PACIENTES e INGRESO_* */
  try {
    var ruleSexo = SpreadsheetApp.newDataValidation()
      .requireValueInList(['F', 'M'], true).setAllowInvalid(false).build();
    var pSexo = ss.getSheetByName(HOJAS.PACIENTES);
    if (pSexo && pSexo.getLastRow() > 1) {
      var colSexoP = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf('SEXO') + 1;
      pSexo.getRange(2, colSexoP, Math.max(pSexo.getMaxRows() - 1, 1), 1).setDataValidation(ruleSexo);
      aplicadas++;
    }
    Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      if (h && h.getLastRow() > 1) {
        var colSexo = INGRESO_COLUMNAS.indexOf('SEXO') + 1;
        h.getRange(2, colSexo, Math.max(h.getMaxRows() - 1, 1), 1).setDataValidation(ruleSexo);
        aplicadas++;
      }
    });
    HOJAS_SECTOR.forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      if (h && h.getLastRow() > 1) {
        var colSexoS = COLUMNAS_SECTOR_VISTA.indexOf('SEXO') + 1;
        if (colSexoS > 0) {
          h.getRange(2, colSexoS, Math.max(h.getMaxRows() - 1, 1), 1).setDataValidation(ruleSexo);
          aplicadas++;
        }
      }
    });
  } catch (eSx) { errores.push('SEXO dropdown: ' + (eSx && eSx.message || eSx)); }

  /* Date picker FECHA_NACIMIENTO en INGRESO_* */
  try {
    var ruleFecha = SpreadsheetApp.newDataValidation()
      .setDateValid(true).setAllowInvalid(false).build();
    Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      if (h && h.getLastRow() > 1) {
        var colFnac = INGRESO_COLUMNAS.indexOf('FECHA DE NACIMIENTO') + 1;
        if (colFnac > 0) {
          h.getRange(2, colFnac, Math.max(h.getMaxRows() - 1, 1), 1).setDataValidation(ruleFecha);
          aplicadas++;
        }
      }
    });
  } catch (eFn) { errores.push('FECHA_NACIMIENTO date picker: ' + (eFn && eFn.message || eFn)); }

  /* Dropdown ESTADO en INGRESO_* */
  try {
    var ruleEstado = SpreadsheetApp.newDataValidation()
      .requireValueInList(['PENDIENTE', 'AGENDADO', 'INGRESADO', 'NO_CONTESTA', 'FALLECIDO', 'NSP'], true)
      .setAllowInvalid(false).build();
    Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      if (h && h.getLastRow() > 1) {
        var colEst = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
        h.getRange(2, colEst, Math.max(h.getMaxRows() - 1, 1), 1).setDataValidation(ruleEstado);
        aplicadas++;
      }
    });
  } catch (eEs) { errores.push('ESTADO dropdown: ' + (eEs && eEs.message || eEs)); }

  /* Notas guía en encabezados de TODAS las hojas */
  try {
    var N = {
      'RUT': 'Formato: 12345678-5 (se valida automáticamente)',
      'NOMBRE': 'Apellido Paterno + Materno + Nombre',
      'SEXO': 'F = Femenino · M = Masculino',
      'FECHA DE NACIMIENTO': 'Formato: dd/mm/aaaa (usar date picker)',
      'TELEFONO': 'Un solo teléfono de contacto',
      'TELEFONO1': 'Teléfono principal',
      'TELEFONO2': 'Teléfono secundario (opcional)',
      'TELEFONO(S)': 'Separe múltiples con / (ej: 912345678/987654321)',
      'SECTOR': 'Naranjo · Amarillo · Verde (se asigna automáticamente)',
      'ESTRATIFICACION': 'G1 (alto) · G2 (medio) · G3 (bajo) · G (sin calcular)',
      'ULTIMO_CONTROL': 'Fecha del último control registrado',
      'PROXIMO_CONTROL': 'Se calcula: ÚLT_CONTROL + frecuencia según G (CONFIG)',
      'ESTADO': 'Estado actual del paciente',
      'PROFESIONAL': 'Profesional asignado al seguimiento',
      'CONDICIONES': 'Condiciones crónicas del paciente (ej: HTA, DM)',
      'OTRAS_PATOLOGÍAS': 'Patologías adicionales registradas',
      'OBSERVACIONES': 'Notas y observaciones del seguimiento',
      'DUPLA': 'Pareja o duplica del paciente (si aplica)',
      'FUENTE': 'Origen de los datos (INGRESO / HISTÓRICO / EDITOR)',
      'FECHA DE INGRESO': 'Fecha de ingreso al programa ECICEP',
      'ESTADO_INGRESO': 'PENDIENTE · AGENDADO · INGRESADO · NO_CONTESTA · FALLECIDO · NSP',
      'OBSERVACIONES_INGRESO': 'Notas del proceso de ingreso',
      'RUT_DV_VALIDO': 'TRUE = RUT correcto · FALSE = necesita revisión',
      'ULTIMO_EVENTO': 'Fecha del último evento registrado',
      'ULTIMO_CONTROL': 'Fecha del último control (se actualiza con eventos CONTROL)',
      'PROXIMO_CONTROL': 'Se calcula automáticamente: ÚLT_CONTROL + frecuencia según G (editable en CONFIG)',
      'PRÓXIMO_SEGUIMIENTO': 'Fecha programada para próximo seguimiento',
      'FECHA_CONSULTA': 'Fecha de la consulta realizada',
      'CONFLICTO': 'Descripción del conflicto identificado',
      'ESTADO_CONFLICTO': 'PENDIENTE · RESUELTO',
      'RESOLUCIÓN': 'Acción tomada para resolver el conflicto',
      'RESULTADO': 'Resultado del análisis o evaluación'
    };
    function _aplicarNotas(hoja, columnas) {
      if (!hoja || hoja.getLastRow() < 1) return;
      columnas.forEach(function (col, ix) {
        if (N[col]) hoja.getRange(1, ix + 1).setNote(N[col]);
      });
    }
    _aplicarNotas(ss.getSheetByName(HOJAS.PACIENTES), MODELO_PACIENTE.map(function (c) { return c.campo; }));
    HOJAS_SECTOR.forEach(function (n) { _aplicarNotas(ss.getSheetByName(n), COLUMNAS_SECTOR_VISTA); });
    Object.keys(HOJAS_INGRESO).forEach(function (n) { _aplicarNotas(ss.getSheetByName(n), INGRESO_COLUMNAS); });
    if (HOJAS.CONFLICTOS) _aplicarNotas(ss.getSheetByName(HOJAS.CONFLICTOS), ['FECHA_DETECCION','TIPO','ID_INTERNO','RUT','NOMBRE','DETALLE','FUENTE_A','FUENTE_B','ESTADO_REVISION','RESUELTO_POR']);
    if (HOJAS.CONSULTA) _aplicarNotas(ss.getSheetByName(HOJAS.CONSULTA), ['FECHA_CONSULTA','RUT','NOMBRE','SEXO','SECTOR','ESTRATIFICACION']);
  } catch (eNt) { errores.push('Notas encabezados: ' + (eNt && eNt.message || eNt)); }

  /* PACIENTES: RUT inválido (rojo), revisión (ámbar), estrat por nivel */
  try {
    var p = ss.getSheetByName(HOJAS.PACIENTES);
    if (p && p.getLastRow() > 1) {
      var filas = Math.max(p.getMaxRows() - 1, 1);
      aplicar(p, [
        regla('=$W2=FALSE', '#FBE4E4', p.getRange(2, 2, filas, 1), true),
        regla('=$X2=TRUE', '#FBF3D6', p.getRange(2, 2, filas, 1)),
        regla('=$AD2=TRUE', '#FBF3D6', p.getRange(2, 30, filas, 1), true),
        regla('=$I2="G1"', '#D4EDDA', p.getRange(2, 9, filas, 1)),
        regla('=$I2="G2"', '#FFF3CD', p.getRange(2, 9, filas, 1)),
        regla('=$I2="G3"', '#F8D7DA', p.getRange(2, 9, filas, 1)),
        regla('=OR($I2="",$I2="G")', '#FBF3D6', p.getRange(2, 9, filas, 1)),
        regla('=$Q2<>"",AND($Q2<TODAY()),#F8D7DA', p.getRange(2, 17, filas, 1)),
        regla('=$Q2<>"",AND($Q2>=TODAY(),$Q2<=TODAY()+7),#FFF3CD', p.getRange(2, 17, filas, 1)),
        regla('=$Q2<>"",AND($Q2>TODAY()+7),#D4EDDA', p.getRange(2, 17, filas, 1))
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

  /* SECTOR_*: RUT inválido (rojo) + estratificación por nivel de color */
  HOJAS_SECTOR.forEach(function (nombre) {
    try {
      var h = ss.getSheetByName(nombre);
      if (!h) return;
      var colRut = COLUMNAS_SECTOR_VISTA.indexOf('RUT_DV_VALIDO') + 1;
      var colEst = COLUMNAS_SECTOR_VISTA.indexOf('ESTRATIFICACION') + 1;
      var letraRut = String.fromCharCode(64 + colRut);
      var letraEst = String.fromCharCode(64 + colEst);
      var filas = Math.max(h.getMaxRows() - 1, 1);
      aplicar(h, [
        regla('=$' + letraRut + '2=FALSE', '#FBE4E4',
             h.getRange(2, colRut, filas, 1), true),
        regla('=$' + letraRut + '2=FALSE', '#FBE4E4',
             h.getRange(2, 2, filas, 1), true),
        regla('=$' + letraEst + '2="G1"', '#D4EDDA',
             h.getRange(2, colEst, filas, 1)),
        regla('=$' + letraEst + '2="G2"', '#FFF3CD',
             h.getRange(2, colEst, filas, 1)),
        regla('=$' + letraEst + '2="G3"', '#F8D7DA',
             h.getRange(2, colEst, filas, 1)),
        regla('=OR($' + letraEst + '2="",$' + letraEst + '2="G")', '#FBF3D6',
             h.getRange(2, colEst, filas, 1)),
        regla('=$M2<>"",AND($M2<TODAY()),#F8D7DA',
             h.getRange(2, COLUMNAS_SECTOR_VISTA.indexOf('PROXIMO_CONTROL') + 1, filas, 1)),
        regla('=$M2<>"",AND($M2>=TODAY(),$M2<=TODAY()+7),#FFF3CD',
             h.getRange(2, COLUMNAS_SECTOR_VISTA.indexOf('PROXIMO_CONTROL') + 1, filas, 1)),
        regla('=$M2<>"",AND($M2>TODAY()+7),#D4EDDA',
             h.getRange(2, COLUMNAS_SECTOR_VISTA.indexOf('PROXIMO_CONTROL') + 1, filas, 1))
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
  if (p) ocultar(p, [1, 7, 22, 23, 24, 25, 26, 27, 28]); // ID_INTERNO·TEL_OBS·NOMBRE_NORM·RUT_SIN_DV·ESTRAT_ORIGEN·ESTRAT_CALC·ESTRAT_FECHA·FECHA_ACT·REVISION
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
  var rem = ss.getSheetByName('REM_SALIDA');
  if (rem) advertir(rem, 'A1', '🔵 Hoja generada automáticamente — los cambios se sobrescriben al refrescar');

  /* Limpiar protecciones previas de SECTOR_* e INGRESO_* (ya no se protegen) */
  HOJAS_SECTOR.concat(Object.keys(HOJAS_INGRESO)).forEach(function (nombre) {
    var h = ss.getSheetByName(nombre);
    if (h) h.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (pr) {
      try { pr.remove(); } catch (eR) { /* best effort */ }
    });
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

/** Colorea todas las celdas RUT en INGRESO_* según validación (persistente). */
function Hojas_colorearRutIngresos(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var ok = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    try {
      var h = ss.getSheetByName(nombre);
      if (!h || h.getLastRow() < 2) return;
      var colRut = INGRESO_COLUMNAS.indexOf('RUT') + 1;
      var vals = h.getRange(2, colRut, h.getLastRow() - 1, 1).getValues();
      var backgrounds = [];
      for (var i = 0; i < vals.length; i++) {
        var rut = Utl_texto(vals[i][0]);
        if (!rut) { backgrounds.push(['']); continue; }
        var norm = Norm_normalizarRut(rut);
        var valido = norm.rut && Norm_validarRut(norm.rut);
        backgrounds.push([valido ? '#E3F3EA' : '#FBE4E4']);
      }
      h.getRange(2, colRut, backgrounds.length, 1).setBackgrounds(backgrounds);
      ok++;
    } catch (e) {}
  });
  return ok;
}

/**
 * onEdit — validación de RUT EN VIVO en INGRESO_* y SECTOR_*:
 * normaliza el formato, pinta verde/rojo según módulo 11 y marca
 * duplicados con nota. Simple trigger: corre como el usuario.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var nombre = sh.getName();
    var esIngreso = HOJAS_INGRESO.hasOwnProperty(nombre);
    var esSector = HOJAS_SECTOR.indexOf(nombre) !== -1;
    if (!esIngreso && !esSector) return;
    var fila = e.range.getRow(), col = e.range.getColumn();
    if (fila < 2) return;

    var colRut;
    if (esIngreso) {
      colRut = INGRESO_COLUMNAS.indexOf('RUT') + 1;
    } else {
      colRut = COLUMNAS_SECTOR_VISTA.indexOf('RUT') + 1;
    }
    if (col !== colRut) return;

    var celda = sh.getRange(fila, col);
    var crudo = e.value;
    if (crudo == null || String(crudo).trim() === '') {
      celda.setBackground(null).setNote(null);
      return;
    }
    var norm = Norm_normalizarRut(String(crudo));
    if (norm.rut && norm.rut !== String(crudo).trim() && e.value === String(crudo)) {
      celda.setValue(norm.rut);
    }
    var valido = norm.rut && Norm_validarRut(norm.rut);
    celda.setBackground(valido ? '#E3F3EA' : '#FBE4E4');
    celda.setNote(valido ? '✓ RUT válido' :
      '❌ RUT inválido (revisa dígito verificador o formato)');

    if (!esIngreso) return;

    /* duplicados dentro de la misma puerta (solo INGRESO_*) */
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
