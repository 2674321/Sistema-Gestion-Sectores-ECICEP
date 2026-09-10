/**
 * Sistema ECICEP — 17_Hojas
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
  { hoja: 'LOG',         etiqueta: '📄 LOG' }
];

/** PURA: obtiene letra de columna (A, B, ..., Z, AA, AB, ...) a partir de índice 1-based. */
function Hojas_indiceAColumna(idx) {
  var letra = '';
  while (idx > 0) {
    var resto = (idx - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    idx = Math.floor((idx - 1) / 26);
  }
  return letra;
}

/** PURA: obtiene la letra de columna para un campo en MODELO_PACIENTE. */
function Hojas_columnaPaciente(campo) {
  var idx = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf(campo);
  if (idx === -1) return '';
  return Hojas_indiceAColumna(idx + 1);
}

/** PURA: rango de DATOS (col desde dataStartRow) para un campo de PACIENTES.
 *  Siempre deriva del contrato: jamás "A2:A" hardcoded. */
function Hojas_rangoPaciente(campo) {
  var col = Hojas_columnaPaciente(campo);
  if (!col) return '';
  var ini = Modelo_dataStartRow(HOJAS.PACIENTES);
  return col + ini + ':' + col;
}

/** PURA: rango de DATOS (col desde dataStartRow) para una hoja simple o visual
 *  según _MODELO_HOJAS_DEF / MODELO_PACIENTE. */
function Hojas_rangoHoja(nombreHoja, campo) {
  if (nombreHoja === HOJAS.PACIENTES) return Hojas_rangoPaciente(campo);
  var def = _MODELO_HOJAS_DEF[nombreHoja];
  var col = def && def.indexOf ? def.indexOf(campo) : -1;
  if (col < 0) return '';
  var letra = Hojas_indiceAColumna(col + 1);
  var ini = Modelo_dataStartRow(nombreHoja);
  return letra + ini + ':' + letra;
}

/** PURA: genera fórmula de indicador de calidad para INICIO usando columnas
 *  reales de MODELO_PACIENTE y el dataStartRow del contrato (nunca A2:A). */
function Hojas_formulaIndicador(tipo) {
  var p = Hojas_rangoPaciente;
  switch (tipo) {
    case 'TOTAL_PAC':   return '=COUNTA(PACIENTES!' + p('ID_INTERNO') + ')';
    case 'EVENTOS':     return '=COUNTA(EVENTOS!' + Hojas_rangoHoja(HOJAS.EVENTOS, 'ID_EVENTO') + ')';
    case 'POR_REVISAR': return '=COUNTIF(PACIENTES!' + p('REQUIERE_REVISION') + ';TRUE)';
    case 'ESTRAT_PEND': return '=COUNTIF(PACIENTES!' + p('ESTRATIFICACION') + ';"")+COUNTIF(PACIENTES!' + p('ESTRATIFICACION') + ';"G")';
    case 'RUT_INVALIDOS': return '=COUNTIF(PACIENTES!' + p('RUT_DV_VALIDO') + ';FALSE)';
    case 'DUPLICADOS':  return '=SUMPRODUCT((PACIENTES!' + p('RUT') + '<>"")*(COUNTIF(PACIENTES!' + p('RUT') + ';PACIENTES!' + p('RUT') + ')>1))';
    case 'ULT_ACT':     return '=IF(COUNT(PACIENTES!' + p('FECHA_ACTUALIZACION') + ')=0;"sin datos";MAX(PACIENTES!' + p('FECHA_ACTUALIZACION') + '))';
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
  var FILA_FIN = 90;   // lienzo vertical: contenido hasta ~48 + margen azul 49..90
  var COL_FIN = 40;    // lienzo horizontal: contenido + margen azul amplio (pantallas 21")
  var FILA_CONT = 48;  // última fila de contenido
  var COL_CONT = 20;   // última columna de contenido

  /* PASO 3-4: expandir ANTES de pintar */
  if (maxF < FILA_FIN) h.insertRowsAfter(maxF, FILA_FIN - maxF);
  if (maxC < COL_FIN) h.insertColumnsAfter(maxC, COL_FIN - maxC);

  h.clear();
  h.setHiddenGridlines(true);

  // v0.8.9.6: paleta INICIO = DESIGN_SYSTEM.MARCA (una fuente de verdad).
  var M = DESIGN_SYSTEM.MARCA;
  var AZUL = M.sistemaProfundo, AZUL_BAR = M.sistemaBarra, PRIM = M.sistema,
      PRIM_BR = M.sistemaBorde, VENTANA = M.ventana, BLANCO = M.blanco,
      TXT = M.texto, GRIS = M.gris, MUTED = M.muted,
      BORDE = M.borde, SUAVE = DESIGN_SYSTEM.SUPERFICIE.datosAlterno,
      OK = M.indicador, WARN_BG = DESIGN_SYSTEM.ESTADOS.REVISION.fondo;

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
   .setFontWeight('bold').setFontSize(11).setFontColor(BLANCO);
  h.getRange(3, 13, 1, 7).merge()
   .setValue('\u2713 Operativo   \u00b7   v' + ECICEP.VERSION + '   \u00b7   Build ' +
     (ECICEP_BUILD.commit || 'dev'))
   .setFontSize(10).setFontColor(M.agua).setHorizontalAlignment('right');
  h.setRowHeight(3, DESIGN_SYSTEM.ALTURAS.barra);

  /* ===== CABECERA ===== */
  h.getRange(5, 4, 2, 6).merge().setValue('ECICEP')
   .setFontWeight('bold').setFontSize(30).setFontColor(PRIM).setFontFamily('Sora')
   .setVerticalAlignment('middle');
  h.getRange(5, 12, 2, 8).merge()
   .setValue('Sistema de Gesti\u00f3n de Pacientes Cr\u00f3nicos por Sectores\nCESFAM San Juan')
   .setFontSize(11).setFontColor(GRIS).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP)
   .setHorizontalAlignment('right').setVerticalAlignment('middle');
  h.setRowHeight(5, DESIGN_SYSTEM.ALTURAS.buscador); h.setRowHeight(6, DESIGN_SYSTEM.ALTURAS.buscador);

  /* ===== MÓDULOS PRINCIPALES (4 botones, 4 cols c/u) ===== */
  h.getRange(8, 4).setValue('M\u00d3DULOS DEL SISTEMA').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var principales = [
    { hoja:'PACIENTES',       icono:'\ud83d\udc65', nombre:'PERSONAS',        desc:'Buscar · Ficha · Seguimiento' },
    { hoja:'INGRESO_NARANJO', icono:'\ud83d\udce5', nombre:'INGRESOS',        desc:'Nuevos registros' },
    { hoja:'CONFLICTOS',      icono:'\ud83d\udccb', nombre:'REVISI\u00d3N',   desc:'Requieren atenci\u00f3n' },
    { hoja:'REM_SALIDA',      icono:'\ud83d\udcca', nombre:'REPORTES',        desc:'REM mensual \u00b7 men\u00fa \u2192 \ud83d\udcca' }
  ];
  principales.forEach(function (mod, ix) {
    var c0 = 4 + ix * 4;
    var rng = h.getRange(9, c0, 3, 4).merge();
    var destino = ss.getSheetByName(mod.hoja);
    if (!destino) {
      // Defensa: hoja aún no creada en este contrato → botón informativo.
      rng.setValue(mod.icono + '\n' + mod.nombre + '\n' + mod.desc)
       .setFontWeight('bold').setFontSize(DESIGN_SYSTEM.TIPOGRAFIA.encabezado).setFontColor(GRIS)
       .setBackground(BLANCO).setHorizontalAlignment('center')
       .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    } else {
      rng.setFormula('=HYPERLINK("#gid=' + destino.getSheetId() +
        '";"' + mod.icono + '\n' + mod.nombre + '\n' + mod.desc + '")')
       .setFontWeight('bold').setFontSize(DESIGN_SYSTEM.TIPOGRAFIA.encabezado).setFontColor(BLANCO)
       .setBackground(PRIM).setHorizontalAlignment('center')
       .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    }
    rng.setBorder(true, true, true, true, null, null, PRIM_BR,
      SpreadsheetApp.BorderStyle.SOLID);
    h.setRowHeights(9, 3, 22);
  });

  /* ===== MÓDULOS SECUNDARIOS (4 botones suaves) ===== */
  var secundarios = [
    { hoja:'SECTOR_NARANJO', icono:'\ud83d\udfe7', nombre:'SECTORES',   desc:'Naranjo \u00b7 Amarillo · Verde' },
    { hoja:'FUENTES',        icono:'\ud83d\uddc2\ufe0f', nombre:'FUENTES', desc:'Informaci\u00f3n y sync' },
    { hoja:'LOG',            icono:'\ud83e\uddea', nombre:'DIAGN\u00d3STICO', desc:'Centro de Pruebas · LOG' },
    { info:true,             icono:'\u2699\ufe0f', nombre:'CONFIGURACI\u00d3N', desc:'Men\u00fa \u2192 \u2699 Configuraci\u00f3n \u00b7 Estratificaci\u00f3n \u00b7 Responsables' }
  ];
  secundarios.forEach(function (mod, ix) {
    var c0 = 4 + ix * 4;
    var rng = h.getRange(13, c0, 3, 4).merge();
    if (mod.info) {
      // Bloque informativo: CONFIG se administra desde el menú (hoja oculta).
      rng.setValue(mod.icono + '\n' + mod.nombre + '\n' + mod.desc)
       .setFontWeight('bold').setFontSize(11).setFontColor(GRIS)
       .setBackground(BLANCO).setHorizontalAlignment('center')
       .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    } else {
      var destino = ss.getSheetByName(mod.hoja);
      if (!destino) {
        // Defensa: hoja aún no creada en este contrato → bloque informativo.
        rng.setValue(mod.icono + '\n' + mod.nombre + '\n' + mod.desc)
         .setFontWeight('bold').setFontSize(11).setFontColor(GRIS)
         .setBackground(BLANCO).setHorizontalAlignment('center')
         .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      } else {
        rng.setFormula('=HYPERLINK("#gid=' + destino.getSheetId() +
          '";"' + mod.icono + '\n' + mod.nombre + '\n' + mod.desc + '")')
         .setFontWeight('bold').setFontSize(11).setFontColor(PRIM)
         .setBackground(BLANCO).setHorizontalAlignment('center')
         .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      }
    }
    rng.setBorder(true, true, true, true, null, null, BORDE,
      SpreadsheetApp.BorderStyle.SOLID);
    h.setRowHeights(13, 3, 20);
  });

  /* ===== INDICADORES (6 tarjetas, 2 filas × 3) ===== */
  h.getRange(17, 4).setValue('INDICADORES').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var kpis = [
    ['=COUNTA(PACIENTES!' + Hojas_rangoPaciente('ID_INTERNO') + ')', 'PACIENTES', 'Total registrados'],
    ['=COUNTA(EVENTOS!' + Hojas_rangoHoja(HOJAS.EVENTOS, 'ID_EVENTO') + ')', 'EVENTOS', 'Historial del sistema'],
    ['=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('REQUIERE_REVISION') + ';TRUE)', 'POR REVISAR', 'Requieren atención'],
    ['=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"")+COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"G")', 'ESTRAT. PENDIENTE', 'Sin confirmar'],
    ['=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('RUT_DV_VALIDO') + ';FALSE)', 'RUT INV\u00c1LIDOS', 'DV incorrecto'],
    ['=SUMPRODUCT((PACIENTES!' + Hojas_rangoPaciente('RUT') + '<>"")*(COUNTIF(PACIENTES!' + Hojas_rangoPaciente('RUT') + ';PACIENTES!' + Hojas_rangoPaciente('RUT') + ')>1))', 'DUPLICADOS', 'Detectados']
  ];
  kpis.forEach(function (k, ix) {
    var fila = 18 + Math.floor(ix / 3) * 3;
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

  /* ===== ALERTA DINÁMICA (tarjeta con color condicional) ===== */
  h.getRange(25, 4).setValue('ALERTAS').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var rA = h.getRange(26, 4, 2, 16).merge();
  rA.setFormula('=IF(COUNTIF(PACIENTES!' + Hojas_rangoPaciente('REQUIERE_REVISION') + ';TRUE)+COUNTIF(PACIENTES!' + Hojas_rangoPaciente('RUT_DV_VALIDO') + ';FALSE)>0;' +
    '"\u26a0 ATENCI\u00d3N REQUERIDA\n" & COUNTIF(PACIENTES!' + Hojas_rangoPaciente('REQUIERE_REVISION') + ';TRUE) & ' +
    '" pacientes por revisar \u00b7 " & COUNTIF(PACIENTES!' + Hojas_rangoPaciente('RUT_DV_VALIDO') + ';FALSE) & ' +
    '" RUT inv\u00e1lidos   \u2014   abrir Cola de Revisi\u00f3n \u2192";' +
    '"\u2713 TODO EN ORDEN\nNo existen incidencias pendientes")')
   .setFontWeight('bold').setFontSize(12).setVerticalAlignment('middle')
   .setBackground(BLANCO)
   .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  rA.setBorder(true, true, true, true, null, null, BORDE,
    SpreadsheetApp.BorderStyle.SOLID);
  /* color semáforo automático: ⚠ fondo ámbar, ✓ fondo verde */
  var reglaAlerta = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=LEFT(D26;1)="\u26a0"')
    .setBackground(DESIGN_SYSTEM.ESTADOS.ALERTA.fondo).setFontColor(DESIGN_SYSTEM.ESTADOS.ALERTA.tinta).setRanges([rA]).build();
  var reglaOk = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=LEFT(D26;1)="\u2713"')
    .setBackground(DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo).setFontColor(DESIGN_SYSTEM.ESTADOS.VIGENTE.tinta).setRanges([rA]).build();
  h.setConditionalFormatRules([reglaAlerta, reglaOk]);
  h.setRowHeights(26, 2, 18);

  /* ===== DISTRIBUCIÓN POR SECTOR (3 tarjetas) ===== */
  h.getRange(29, 4).setValue('DISTRIBUCI\u00d3N POR SECTOR').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  var sectores = [
    { nombre:'NARANJO',  color: IDENTIDAD.NARANJO },
    { nombre:'AMARILLO', color: IDENTIDAD.AMARILLO },
    { nombre:'VERDE',    color: IDENTIDAD.VERDE }
  ];
  sectores.forEach(function (s2, ix) {
    var c0 = 4 + ix * 5 + (ix === 2 ? 1 : 0);
    h.getRange(30, c0, 1, 4).merge().setValue('\u25cf ' + s2.nombre)
     .setFontWeight('bold').setFontSize(10).setFontColor(s2.color).setBackground(BLANCO)
     .setHorizontalAlignment('center');
    var rng = h.getRange(31, c0, 1, 4).merge()
     .setFormula('=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('SECTOR') + ';"' + s2.nombre + '")&" pacientes"')
     .setFontWeight('bold').setFontSize(13).setFontColor(TXT).setBackground(SUAVE)
     .setHorizontalAlignment('center').setVerticalAlignment('middle');
    h.getRange(32, c0, 1, 4).merge()
     .setFormula('=TEXT(COUNTIF(PACIENTES!' + Hojas_rangoPaciente('SECTOR') + ';"' + s2.nombre + '")/MAX(COUNTA(PACIENTES!' + Hojas_rangoPaciente('ID_INTERNO') + ');1);"0%")&" del total"')
     .setFontSize(9).setFontColor(MUTED).setBackground(BLANCO)
     .setHorizontalAlignment('center');
    h.getRange(30, c0, 3, 4).setBorder(true, true, true, true, null, null,
      s2.color, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    h.setRowHeight(30, 16); h.setRowHeight(31, 24); h.setRowHeight(32, 14);
  });

  /* ===== DISTRIBUCIÓN POR ESTRATIFICACIÓN (3 tarjetas, NUEVO) ===== */
  h.getRange(34, 4).setValue('DISTRIBUCI\u00d3N POR ESTRATIFICACI\u00d3N')
   .setFontWeight('bold').setFontSize(10).setFontColor(MUTED);
  var estrates = [
    { nombre:'G1', color: DESIGN_SYSTEM.MARCA.sistemaClaro, desc:'Bajo'},
    { nombre:'G2', color: DESIGN_SYSTEM.MARCA.sistema, desc:'Medio'},
    { nombre:'G3', color: DESIGN_SYSTEM.MARCA.sistemaProfundo, desc:'Alto'}
  ];
  estrates.forEach(function (g, ix) {
    var c0 = 4 + ix * 5 + (ix === 2 ? 1 : 0);
    h.getRange(35, c0, 1, 4).merge().setValue('\u25cf ' + g.nombre)
     .setFontWeight('bold').setFontSize(10).setFontColor(BLANCO).setBackground(g.color)
     .setHorizontalAlignment('center');
    var r = h.getRange(36, c0, 1, 4).merge()
     .setFormula('=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"' + g.nombre + '")&" pacientes"')
     .setFontWeight('bold').setFontSize(13).setFontColor(TXT).setBackground(SUAVE)
     .setHorizontalAlignment('center').setVerticalAlignment('middle');
    h.getRange(37, c0, 1, 4).merge()
     .setFormula('=TEXT(COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"' + g.nombre + '")/MAX(COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"")+COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"G1")+COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"G2")+COUNTIF(PACIENTES!' + Hojas_rangoPaciente('ESTRATIFICACION') + ';"G3");1);"0%")&" · ' + g.desc + '"')
     .setFontSize(9).setFontColor(MUTED).setBackground(BLANCO)
     .setHorizontalAlignment('center');
    h.getRange(35, c0, 3, 4).setBorder(true, true, true, true, null, null,
      g.color, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    h.setRowHeight(35, 16); h.setRowHeight(36, 24); h.setRowHeight(37, 14);
  });

  /* ===== ESTADO DEL SISTEMA (tarjeta) ===== */
  h.getRange(39, 4).setValue('ESTADO DEL SISTEMA').setFontWeight('bold')
   .setFontSize(10).setFontColor(MUTED);
  h.getRange(40, 4, 1, 16).merge().setValue('\u2713 SISTEMA OPERATIVO')
   .setFontWeight('bold').setFontSize(13).setFontColor(OK).setBackground(BLANCO)
   .setHorizontalAlignment('center');
  var info = [
    ['Versión', 'ECICEP v' + ECICEP.VERSION],
    ['Build', (ECICEP_BUILD.commit || 'dev')],
    ['Actualización del sistema', ECICEP_BUILD.fecha || '\u2014'],
    ['\u00daltima actualización de datos',
      '=IF(COUNT(PACIENTES!' + Hojas_rangoPaciente('FECHA_ACTUALIZACION') + ')=0;"\u2014";TEXT(MAX(PACIENTES!' + Hojas_rangoPaciente('FECHA_ACTUALIZACION') + ');"dd/mm/yyyy hh:mm"))'],
    ['\u00daltima sincronización de fuentes',
      '=IFERROR(TEXT(VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0);"dd/mm/yyyy hh:mm");"\u2014")'],
    ['Controles VENCIDOS',
      '=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('PROXIMO_CONTROL') + ';"<"&TODAY())'],
    ['Controles por vencer (\u226430 d\u00edas)',
      '=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('PROXIMO_CONTROL') + ';">="&TODAY())-COUNTIF(PACIENTES!' + Hojas_rangoPaciente('PROXIMO_CONTROL') + ';">"&TODAY()+30)'],
    ['Controles \u00faltimos 30 d\u00edas',
      '=COUNTIF(PACIENTES!' + Hojas_rangoPaciente('PROXIMO_CONTROL') + ';">="&TODAY()-30)-COUNTIF(PACIENTES!' + Hojas_rangoPaciente('PROXIMO_CONTROL') + ';">"&TODAY())']
  ];
  info.forEach(function (par, ix) {
    h.getRange(41 + ix, 4, 1, 4).merge().setValue(par[0])
     .setFontColor(GRIS).setFontSize(10.5).setBackground(BLANCO);
    h.getRange(41 + ix, 8, 1, 12).merge().setValue(par[1])
     .setFontWeight('bold').setFontSize(10.5).setFontColor(TXT).setBackground(BLANCO);
    h.setRowHeight(41 + ix, 16);
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
    kpi: h.getRange(19, 4).getFormula().indexOf('COUNTA') !== -1,
    estrat: h.getRange(36, 4).getFormula().indexOf('COUNTIF') !== -1
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

  /* Dropdown SEXO (F/M) en PACIENTES, INGRESO_* y SECTOR_* (desde dataStartRow) */
  try {
    var ruleSexo = SpreadsheetApp.newDataValidation()
      .requireValueInList(['F', 'M'], true).setAllowInvalid(false).build();
    var pSexo = ss.getSheetByName(HOJAS.PACIENTES);
    if (pSexo) {
      var iniP = Modelo_dataStartRow(HOJAS.PACIENTES);
      if (pSexo.getLastRow() >= iniP) {
        var colSexoP = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf('SEXO') + 1;
        pSexo.getRange(iniP, colSexoP, Math.max(pSexo.getMaxRows() - iniP + 1, 1), 1).setDataValidation(ruleSexo);
        aplicadas++;
      }
    }
    Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      var ini = Modelo_dataStartRow(nombre);
      if (h && h.getLastRow() >= ini) {
        var colSexo = INGRESO_COLUMNAS.indexOf('SEXO') + 1;
        h.getRange(ini, colSexo, Math.max(h.getMaxRows() - ini + 1, 1), 1).setDataValidation(ruleSexo);
        aplicadas++;
      }
    });
    HOJAS_SECTOR.forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      var ini = Modelo_dataStartRow(nombre);
      if (h && h.getLastRow() >= ini) {
        var colSexoS = COLUMNAS_SECTOR_VISTA.indexOf('SEXO') + 1;
        if (colSexoS > 0) {
          h.getRange(ini, colSexoS, Math.max(h.getMaxRows() - ini + 1, 1), 1).setDataValidation(ruleSexo);
          aplicadas++;
        }
      }
    });
  } catch (eSx) { errores.push('SEXO dropdown: ' + (eSx && eSx.message || eSx)); }

  /* Date picker FECHA_NACIMIENTO en INGRESO_* (desde dataStartRow) */
  try {
    var ruleFecha = SpreadsheetApp.newDataValidation()
      .setDateValid(true).setAllowInvalid(false).build();
    Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      var ini = Modelo_dataStartRow(nombre);
      if (h && h.getLastRow() >= ini) {
        var colFnac = INGRESO_COLUMNAS.indexOf('FECHA DE NACIMIENTO') + 1;
        if (colFnac > 0) {
          h.getRange(ini, colFnac, Math.max(h.getMaxRows() - ini + 1, 1), 1).setDataValidation(ruleFecha);
          aplicadas++;
        }
      }
    });
  } catch (eFn) { errores.push('FECHA_NACIMIENTO date picker: ' + (eFn && eFn.message || eFn)); }

  /* Dropdown ESTADO en INGRESO_* (desde dataStartRow) */
  try {
    var ruleEstado = SpreadsheetApp.newDataValidation()
      .requireValueInList(['PENDIENTE', 'AGENDADO', 'INGRESADO', 'NO_CONTESTA', 'FALLECIDO', 'NSP'], true)
      .setAllowInvalid(false).build();
    Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      var ini = Modelo_dataStartRow(nombre);
      if (h && h.getLastRow() >= ini) {
        var colEst = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
        h.getRange(ini, colEst, Math.max(h.getMaxRows() - ini + 1, 1), 1).setDataValidation(ruleEstado);
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
    function _aplicarNotas(nombre, columnas) {
      var hoja = ss.getSheetByName(nombre);
      if (!hoja) return;
      var hr = Modelo_headerRow(nombre);
      if (hoja.getLastRow() < hr) return;
      columnas.forEach(function (col, ix) {
        if (N[col]) hoja.getRange(hr, ix + 1).setNote(N[col]);
      });
    }
    _aplicarNotas(HOJAS.PACIENTES, MODELO_PACIENTE.map(function (c) { return c.campo; }));
    HOJAS_SECTOR.forEach(function (n) { _aplicarNotas(n, COLUMNAS_SECTOR_VISTA); });
    Object.keys(HOJAS_INGRESO).forEach(function (n) { _aplicarNotas(n, INGRESO_COLUMNAS); });
    if (HOJAS.CONFLICTOS) _aplicarNotas(HOJAS.CONFLICTOS, ['FECHA_DETECCION','TIPO','ID_INTERNO','RUT','NOMBRE','DETALLE','FUENTE_A','FUENTE_B','ESTADO_REVISION','RESUELTO_POR']);
    if (HOJAS.CONSULTA) _aplicarNotas(HOJAS.CONSULTA, ['FECHA_CONSULTA','RUT','NOMBRE','SEXO','SECTOR','ESTRATIFICACION']);
  } catch (eNt) { errores.push('Notas encabezados: ' + (eNt && eNt.message || eNt)); }

  /* PACIENTES: RUT inválido (rojo), revisión (ámbar), estrat por nivel.
   *  Fórmulas y rangos derivados del contrato (dataStartRow). */
  try {
    var p = ss.getSheetByName(HOJAS.PACIENTES);
    var iniP = Modelo_dataStartRow(HOJAS.PACIENTES);
    if (p && p.getLastRow() >= iniP) {
      var filas = Math.max(p.getMaxRows() - iniP + 1, 1);
      aplicar(p, [
        regla('=$W' + iniP + '=FALSE', DESIGN_SYSTEM.ESTADOS.ERROR.fondo, p.getRange(iniP, 2, filas, 1), true),
        regla('=$X' + iniP + '=TRUE', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, p.getRange(iniP, 2, filas, 1)),
        regla('=$AD' + iniP + '=TRUE', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, p.getRange(iniP, 30, filas, 1), true),
        regla('=$I' + iniP + '="G1"', DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo, p.getRange(iniP, 9, filas, 1)),
        regla('=$I' + iniP + '="G2"', DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo, p.getRange(iniP, 9, filas, 1)),
        regla('=$I' + iniP + '="G3"', DESIGN_SYSTEM.ESTADOS.VENCIDO.fondo, p.getRange(iniP, 9, filas, 1)),
        regla('=OR($I' + iniP + '="",$I' + iniP + '="G")', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, p.getRange(iniP, 9, filas, 1)),
        regla('=$Q' + iniP + '<>"",AND($Q' + iniP + '<TODAY())',
          DESIGN_SYSTEM.ESTADOS.VENCIDO.fondo, p.getRange(iniP, 17, filas, 1)),
        regla('=$Q' + iniP + '<>"",AND($Q' + iniP + '>=TODAY(),$Q' + iniP + '<=TODAY()+7)',
          DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo, p.getRange(iniP, 17, filas, 1)),
        regla('=$Q' + iniP + '<>"",AND($Q' + iniP + '>TODAY()+7)',
          DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo, p.getRange(iniP, 17, filas, 1))
      ]);
    }
  } catch (eP) { errores.push('PACIENTES: ' + (eP && eP.message || eP)); }

  /* INGRESO_*: estado con semáforo textual (desde dataStartRow) */
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    try {
      var h = ss.getSheetByName(nombre);
      var ini = Modelo_dataStartRow(nombre);
      var hr = Modelo_headerRow(nombre);
      if (!h || h.getLastRow() < hr) return;
      var colEstado = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
      var L = String.fromCharCode(64 + colEstado);
      var rEstado = h.getRange(ini, colEstado, Math.max(h.getMaxRows() - ini + 1, 1), 1);
      aplicar(h, [
        regla('=$' + L + ini + '="ERROR"', DESIGN_SYSTEM.ESTADOS.ERROR.fondo, rEstado, true),
        regla('=$' + L + ini + '="REQUIERE_REVISION"', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, rEstado),
        regla('=$' + L + ini + '="INGRESADO"', DESIGN_SYSTEM.ESTADOS.OK.fondo, rEstado)
      ]);
    } catch (eI) { errores.push(nombre + ': ' + (eI && eI.message || eI)); }
  });

  /* SECTOR_*: RUT inválido (rojo) + estratificación por nivel de color */
  HOJAS_SECTOR.forEach(function (nombre) {
    try {
      var h = ss.getSheetByName(nombre);
      var ini = Modelo_dataStartRow(nombre);
      var hr = Modelo_headerRow(nombre);
      if (!h || h.getLastRow() < hr) return;
      var colRut = COLUMNAS_SECTOR_VISTA.indexOf('RUT_DV_VALIDO') + 1;
      var colEst = COLUMNAS_SECTOR_VISTA.indexOf('ESTRATIFICACION') + 1;
      var colProx = COLUMNAS_SECTOR_VISTA.indexOf('PROXIMO_CONTROL') + 1;
      var letraRut = String.fromCharCode(64 + colRut);
      var letraEst = String.fromCharCode(64 + colEst);
      var letraProx = String.fromCharCode(64 + colProx);
      var filas = Math.max(h.getMaxRows() - ini + 1, 1);
      aplicar(h, [
        regla('=$' + letraRut + ini + '=FALSE', DESIGN_SYSTEM.ESTADOS.ERROR.fondo,
             h.getRange(ini, colRut, filas, 1), true),
        regla('=$' + letraRut + ini + '=FALSE', DESIGN_SYSTEM.ESTADOS.ERROR.fondo,
             h.getRange(ini, 2, filas, 1), true),
        regla('=$' + letraEst + ini + '="G1"', DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo,
             h.getRange(ini, colEst, filas, 1)),
        regla('=$' + letraEst + ini + '="G2"', DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo,
             h.getRange(ini, colEst, filas, 1)),
        regla('=$' + letraEst + ini + '="G3"', DESIGN_SYSTEM.ESTADOS.VENCIDO.fondo,
             h.getRange(ini, colEst, filas, 1)),
        regla('=OR($' + letraEst + ini + '="",$' + letraEst + ini + '="G")', DESIGN_SYSTEM.ESTADOS.REVISION.fondo,
             h.getRange(ini, colEst, filas, 1)),
        regla('=$' + letraProx + ini + '<>"",AND($' + letraProx + ini + '<TODAY())',
             DESIGN_SYSTEM.ESTADOS.VENCIDO.fondo, h.getRange(ini, colProx, filas, 1)),
        regla('=$' + letraProx + ini + '<>"",AND($' + letraProx + ini + '>=TODAY(),$' + letraProx + ini + '<=TODAY()+7)',
             DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo, h.getRange(ini, colProx, filas, 1)),
        regla('=$' + letraProx + ini + '<>"",AND($' + letraProx + ini + '>TODAY()+7)',
             DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo, h.getRange(ini, colProx, filas, 1))
      ]);
    } catch (eS2) { errores.push(nombre + ': ' + (eS2 && eS2.message || eS2)); }
  });

  /* CONFLICTOS: pendiente / resuelto (layout simple → dataStartRow=2) */
  try {
    var con = ss.getSheetByName(HOJAS.CONFLICTOS);
    var iniC = Modelo_dataStartRow(HOJAS.CONFLICTOS);
    var hrC = Modelo_headerRow(HOJAS.CONFLICTOS);
    if (con && con.getLastRow() >= hrC) {
      var rC = con.getRange(iniC, 9, Math.max(con.getMaxRows() - iniC + 1, 1), 1);
      aplicar(con, [
        regla('=$I' + iniC + '="PENDIENTE"', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, rC, true),
        regla('=$I' + iniC + '="RESUELTO"', DESIGN_SYSTEM.ESTADOS.OK.fondo, rC)
      ]);
    }
  } catch (eC2) { errores.push('CONFLICTOS: ' + (eC2 && eC2.message || eC2)); }

  return { aplicadas: aplicadas, errores: errores };
}

/** GAS: filtros básicos en hojas de datos, anclados en headerRow del contrato
 *  (idempotente; si existe un filtro heredado mal anclado, se recrea). */
function Hojas_filtros(ss) {
  var n = 0;
  ['PACIENTES', 'EVENTOS', 'CONFLICTOS'].concat(HOJAS_SECTOR, Object.keys(HOJAS_INGRESO))
    .forEach(function (nombre) {
      var h = ss.getSheetByName(nombre);
      var hr = Modelo_headerRow(nombre);
      var ini = Modelo_dataStartRow(nombre);
      if (!h || h.getLastRow() < ini) return;
      var filtro = h.getFilter();
      if (!filtro || filtro.getRange().getRow() !== hr) {
        if (filtro) { try { filtro.remove(); } catch (eR) {} }
        h.getRange(hr, 1, h.getLastRow() - hr + 1, Math.max(h.getLastColumn(), 1)).createFilter();
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

  // Ocultar hoja CONFLICTOS (se accede vía Cola de revisión)
  var c = ss.getSheetByName(HOJAS.CONFLICTOS);
  if (c && !c.isSheetHidden()) { c.hideSheet(); ocultas++; }

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
  var rem = ss.getSheetByName(HOJAS.REM_SALIDA);
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
      var ini = Modelo_dataStartRow(nombre);
      if (!h || h.getLastRow() < ini) return;
      var colRut = INGRESO_COLUMNAS.indexOf('RUT') + 1;
      var vals = h.getRange(ini, colRut, h.getLastRow() - ini + 1, 1).getValues();
      var backgrounds = [];
      for (var i = 0; i < vals.length; i++) {
        var rut = Utl_texto(vals[i][0]);
        if (!rut) { backgrounds.push(['']); continue; }
        var norm = Norm_normalizarRut(rut);
        var valido = norm.rut && Norm_validarRut(norm.rut);
        backgrounds.push([valido ? DESIGN_SYSTEM.ESTADOS.OK.fondo : DESIGN_SYSTEM.ESTADOS.ERROR.fondo]);
      }
      h.getRange(ini, colRut, backgrounds.length, 1).setBackgrounds(backgrounds);
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
    var ini = Modelo_dataStartRow(nombre);
    if (fila < ini) return;

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
    celda.setBackground(valido ? DESIGN_SYSTEM.ESTADOS.OK.fondo : DESIGN_SYSTEM.ESTADOS.ERROR.fondo);
    celda.setNote(valido ? '✓ RUT válido' :
      '❌ RUT inválido (revisa dígito verificador o formato)');

    if (!esIngreso) return;

    /* duplicados dentro de la misma puerta (solo INGRESO_*) */
    var ultimo = norm.rut || String(crudo).trim().toUpperCase();
    var colVals = sh.getRange(ini, col, Math.max(sh.getLastRow() - ini + 1, 1), 1).getValues();
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
  var ui = _UI_get();
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
// 💾 Backups — dashboard HTML + carpeta dedicada + historial + poda
// ---------------------------------------------------------------------------

var BACKUP_PREFIJO = 'ECICEP_BACKUP';
var BACKUP_PREFIJO_AUTO = 'AUTO_ECICEP_BACKUP';
var BACKUP_PREFIJO_MAN = 'MANUAL_ECICEP_BACKUP';
var BACKUP_DEFAULT_MANTENER = 8;
var BACKUP_FOLDER_NOMBRE = 'ECICEP_Backups';

/** Obtiene (o crea) la carpeta dedicada de backups del ENTORNO activo (v0.9.1).
 *  Aislamiento DEV/DEMO: usa BACKUP_FOLDER_ID del entorno si está configurado;
 *  si no, deriva el nombre 'ECICEP_Backups_<ENV>' (DEV ≠ DEMO jamás comparten).
 *  Si el entorno es desconocido, cae al nombre genérico (solo lectura segura). */
function _backup_folder() {
  var cur = Entorno_actualGAS();
  var idEsperado = Entorno_recursoEsperado(cur.entorno, 'BACKUP_FOLDER_ID');
  if (idEsperado) {
    try {
      var fById = DriveApp.getFolderById(idEsperado);
      if (fById) return fById;
    } catch (e) { /* carpeta no accesible: caer al nombre derivado */ }
  }
  var nombre = cur.entorno === 'DESCONOCIDO'
    ? BACKUP_FOLDER_NOMBRE
    : Entorno_carpetaEsperada(cur.entorno);
  var folders = DriveApp.getFoldersByName(nombre);
  if (folders.hasNext()) return folders.next();
  var creada = DriveApp.createFolder(nombre);
  Log_info('Backup', 'carpeta', 'creada ' + nombre, null, null);
  return creada;
}

/** Obtiene el límite de retención desde CONFIG (editable por el usuario). */
function _backup_mantener() {
  var v = parseInt(_config_leerValores(['BACKUP_MANTENER'])['BACKUP_MANTENER'], 10);
  return (v > 0) ? v : BACKUP_DEFAULT_MANTENER;
}

/** GAS: crea backup completo en carpeta dedicada. */
function Backup_crear(etiqueta) {
  try {
    var ss = Modelo_ss();
    var tz = Session.getScriptTimeZone();
    var ts = Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmmss');
    var prefijo = etiqueta === 'AUTO' ? BACKUP_PREFIJO_AUTO : BACKUP_PREFIJO_MAN;
    var nombre = prefijo + '_' + ts;
    var folder = _backup_folder();
    var copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, folder);
    var tamano = copia.getSize();
    Log_info('Backup', 'crear', nombre + ' · ' + tamano + ' bytes');
    Log_flush();
    return { ok: true, nombre: nombre, url: copia.getUrl(), id: copia.getId(), tamano: tamano };
  } catch (e) {
    Log_error('Backup', 'crear', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** GAS: lista todos los backups (auto + manual) ordenados por fecha. */
function Backup_listar() {
  var items = [];
  var folder = null;
  try { folder = _backup_folder(); } catch (e) { return { ok: false, motivo: 'No se pudo acceder a Drive' }; }
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var nombre = f.getName();
    if (nombre.indexOf(BACKUP_PREFIJO_AUTO) === 0 || nombre.indexOf(BACKUP_PREFIJO_MAN) === 0) {
      items.push({
        nombre: nombre,
        url: f.getUrl(),
        id: f.getId(),
        tamano: f.getSize(),
        fecha: f.getDateCreated().toISOString(),
        esAuto: nombre.indexOf(BACKUP_PREFIJO_AUTO) === 0
      });
    }
  }
  items.sort(function (a, b) { return b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0; });
  var autoCount = items.filter(function (x) { return x.esAuto; }).length;
  var manCount = items.filter(function (x) { return !x.esAuto; }).length;
  return {
    ok: true,
    items: items,
    autoCount: autoCount,
    manCount: manCount,
    total: items.length
  };
}

/** GAS: elimina los backups automáticos más viejos, conserva los últimos N. */
function Backup_podar(mantener) {
  mantener = mantener || _backup_mantener();
  var folder = null;
  try { folder = _backup_folder(); } catch (e) { return { ok: false, motivo: 'No se pudo acceder a Drive' }; }
  var autoFiles = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf(BACKUP_PREFIJO_AUTO) === 0 && !f.isTrashed()) autoFiles.push(f);
  }
  autoFiles.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  var borrados = 0;
  for (var i = mantener; i < autoFiles.length; i++) {
    try { autoFiles[i].setTrashed(true); borrados++; } catch (e) {}
  }
  return { ok: true, borrados: borrados, conservados: Math.min(autoFiles.length, mantener) };
}

/** GAS: punto de entrada del TRIGGER semanal (sin UI). */
function Backup_programado() {
  var r = Backup_crear('AUTO');
  var poda = Backup_podar();
  _config_set('BACKUP_AUTO_ULTIMA', Utilities.formatDate(new Date(),
    Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
  Log_info('Backup', 'programado', r.nombre + ' · podados=' + (poda.borrados || 0));
  Log_flush();
  return r;
}

/** GAS: ¿existe el trigger programado? */
function Backup_triggerInstalado() {
  return ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'Backup_programado';
  });
}

/** GAS: instala trigger con parámetros configurables, idempotente. */
function Backup_programar(dia, hora) {
  Backup_quitarProgramacion();
  var dias = { 'DOMINGO': ScriptApp.WeekDay.SUNDAY, 'LUNES': ScriptApp.WeekDay.MONDAY,
    'MARTES': ScriptApp.WeekDay.TUESDAY, 'MIERCOLES': ScriptApp.WeekDay.WEDNESDAY,
    'JUEVES': ScriptApp.WeekDay.THURSDAY, 'VIERNES': ScriptApp.WeekDay.FRIDAY,
    'SABADO': ScriptApp.WeekDay.SATURDAY };
  var weekDay = dias[String(dia).toUpperCase()] || ScriptApp.WeekDay.SUNDAY;
  var hour = parseInt(hora, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 3;
  ScriptApp.newTrigger('Backup_programado').timeBased()
    .onWeekDay(weekDay).atHour(hour).create();
  _config_set('BACKUP_DIA', String(dia).toUpperCase());
  _config_set('BACKUP_HORA', String(hour));
  Log_info('Backup', 'programar', dia + ' ' + hour + ':00');
  Log_flush();
}

/** GAS: quita el trigger semanal. */
function Backup_quitarProgramacion() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'Backup_programado') ScriptApp.deleteTrigger(t);
  });
}

/** Endpoint: estado + historial completo (para el HTML).
 *  UNA lectura de CONFIG para `BACKUP_AUTO_ULTIMA` y `BACKUP_MANTENER`
 *  (antes eran dos lecturas completas de la misma hoja). */
function api_backupListar() {
  var st = Backup_listar();
  var trigger = Backup_triggerInstalado();
  var cfg = _config_leerValores(['BACKUP_AUTO_ULTIMA', 'BACKUP_MANTENER']);
  var ultima = cfg['BACKUP_AUTO_ULTIMA'] || '';
  var mantener = parseInt(cfg['BACKUP_MANTENER'], 10);
  if (!(mantener > 0)) mantener = BACKUP_DEFAULT_MANTENER;
  return {
    ok: true,
    trigger: trigger,
    ultima: ultima || 'nunca',
    mantener: mantener,
    items: st.items || [],
    autoCount: st.autoCount || 0,
    manCount: st.manCount || 0
  };
}

/** Endpoint: crear backup manual. */
function api_backupCrear(etiqueta) {
  return Backup_crear(etiqueta || 'MANUAL');
}

/** Endpoint: toggle automático (activar/desactivar). */
function api_backupToggle() {
  try {
    if (Backup_triggerInstalado()) {
      Backup_quitarProgramacion();
      return { ok: true, mensaje: 'Backup automático desactivado' };
    } else {
      var dia = _rem9_configValor('BACKUP_DIA') || 'DOMINGO';
      var hora = _rem9_configValor('BACKUP_HORA') || '3';
      Backup_programar(dia, hora);
      return { ok: true, mensaje: 'Backup automático activado (' + dia + ' ' + hora + ':00)' };
    }
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: programar backup con día y hora específicos. */
function api_backupProgramar(dia, hora) {
  try {
    Backup_programar(dia, hora);
    return { ok: true, mensaje: 'Backup programado: ' + dia + ' ' + hora + ':00' };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: leer configuración actual de programación. */
function api_backupConfigLeer() {
  return {
    ok: true,
    dia: _rem9_configValor('BACKUP_DIA') || 'DOMINGO',
    hora: _rem9_configValor('BACKUP_HORA') || '3',
    mantener: _backup_mantener()
  };
}

/** Endpoint: podar backups automáticos viejos. */
function api_backupPodar() {
  return Backup_podar();
}

/** Endpoint: URL de la carpeta de backups. */
function api_backupFolder() {
  try {
    var folder = _backup_folder();
    return { ok: true, url: folder.getUrl(), id: folder.getId() };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** 💾 Menú de backups: abre dashboard HTML. */
function UI_backup() {
  _ui_dialogo('Backup', 'Backups del sistema');
}
