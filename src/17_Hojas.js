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

/** Alias v0.12, explícito y testeable, para columnas A1 más allá de Z. */
function Hojas_columnaA1_(numero) { return Hojas_indiceAColumna(numero); }

/** Resuelve una columna por nombre de campo desde el contrato vigente. */
function Hojas_columnaCampo_(nombreHoja, campo) {
  var columnas = nombreHoja === HOJAS.PACIENTES
    ? MODELO_PACIENTE.map(function (c) { return c.campo; })
    : (_MODELO_HOJAS_DEF[nombreHoja] || []);
  var buscada = Utl_claveAlnum(campo), idx = -1;
  columnas.some(function (c, i) {
    if (Utl_claveAlnum(c) === buscada) { idx = i + 1; return true; }
    return false;
  });
  return idx;
}

/** PURA: obtiene la letra de columna para un campo en MODELO_PACIENTE. */
function Hojas_columnaPaciente(campo) {
  var idx = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf(campo);
  if (idx === -1) return '';
  return Hojas_indiceAColumna(idx + 1);
}

/** GAS helper: cantidad de FILAS GESTIONADAS de una hoja de datos, acotada por
 *  getMaxRows(). Es el rango real sobre el que el sistema aplica formato,
 *  banding y reglas: dataStartRow + reserva (buffer) de filas vacías.
 *  Antes del hotfix 0.12.1 los formatos barrian getMaxRows() completos
 *  (miles de filas) en cada reinstalación, causa del timeout de presentación. */
function Hojas_filasGestionadas_(hoja, nombreHoja, opciones) {
  opciones = opciones || {};
  if (!hoja || typeof hoja.getMaxRows !== 'function' ||
      typeof hoja.getLastRow !== 'function') return 0;
  var dataStart = Number(opciones.filaInicial) > 0
    ? Number(opciones.filaInicial)
    : Modelo_dataStartRow(nombreHoja);
  var buffer = (opciones.buffer === undefined) ? 250 : Number(opciones.buffer);
  if (!(buffer >= 0)) buffer = 250;
  var max = hoja.getMaxRows();
  if (max < dataStart) return 0;
  var ultimo = Math.max(hoja.getLastRow() || 0, dataStart);
  var gestionadas = Math.min(ultimo + buffer, max);
  var filas = gestionadas - dataStart + 1;
  return filas > 0 ? filas : 0;
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
    case 'ESTRAT_PEND': return '=MAX(0;COUNTA(PACIENTES!' + p('ID_INTERNO') + ')' +
      '-COUNTIFS(PACIENTES!' + p('ID_INTERNO') + ';"<>";PACIENTES!' + p('ESTRATIFICACION') + ';"G1")' +
      '-COUNTIFS(PACIENTES!' + p('ID_INTERNO') + ';"<>";PACIENTES!' + p('ESTRATIFICACION') + ';"G2")' +
      '-COUNTIFS(PACIENTES!' + p('ID_INTERNO') + ';"<>";PACIENTES!' + p('ESTRATIFICACION') + ';"G3"))';
    case 'RUT_INVALIDOS': return '=COUNTIF(PACIENTES!' + p('RUT_DV_VALIDO') + ';FALSE)';
    case 'DUPLICADOS':  return '=SUMPRODUCT((PACIENTES!' + p('RUT') + '<>"")*(COUNTIF(PACIENTES!' + p('RUT') + ';PACIENTES!' + p('RUT') + ')>1))';
    case 'ULT_ACT':     return '=IF(COUNT(PACIENTES!' + p('FECHA_ACTUALIZACION') + ')=0;"sin datos";MAX(PACIENTES!' + p('FECHA_ACTUALIZACION') + '))';
    default: return '';
  }
}

/** PURA: fórmula de la alerta dinámica de INICIO. Solo lista incidencias con
 *  conteo > 0 (REGEXREPLACE elimina el separador final). Derivada del contrato. */
function Hojas_formulaAlerta() {
  var p = Hojas_rangoPaciente;
  var nRev = 'COUNTIF(PACIENTES!' + p('REQUIERE_REVISION') + ';TRUE)';
  var nRut = 'COUNTIF(PACIENTES!' + p('RUT_DV_VALIDO') + ';FALSE)';
  var nCtr = 'COUNTIF(PACIENTES!' + p('PROXIMO_CONTROL') + ';"<"&TODAY())';
  return '=IF(' + nRev + '+' + nRut + '+' + nCtr + '>0;' +
    '"\u26a0 ATENCI\u00d3N REQUERIDA\n" & REGEXREPLACE(' +
    'IF(' + nRev + '>0;' + nRev + '&" por revisar \u00b7 ";"") & ' +
    'IF(' + nRut + '>0;' + nRut + '&" RUT inv\u00e1lidos \u00b7 ";"") & ' +
    'IF(' + nCtr + '>0;' + nCtr + '&" controles vencidos \u00b7 ";"")' +
    ';"\u00b7 $";"");' +
    '"\u2713 TODO EN ORDEN\nNo existen incidencias pendientes")';
}

/** PURA: fórmula de ingresos del mes (FECHA_INGRESO dentro del mes actual). */
function Hojas_formulaIngresosMes() {
  var p = Hojas_rangoPaciente('FECHA_INGRESO');
  return '=COUNTIFS(PACIENTES!' + p + ';">="&EOMONTH(TODAY();-1)+1;PACIENTES!' + p + ';"<"&EOMONTH(TODAY();0)+1)';
}

/** PURA: fórmula de pacientes sin próximo control agendado (vacío o NSP). */
function Hojas_formulaSinControl() {
  var p = Hojas_rangoPaciente('PROXIMO_CONTROL');
  return '=COUNTIF(PACIENTES!' + p + ';"")+COUNTIF(PACIENTES!' + p + ';"NSP")';
}

/** GAS: INICIO v0.12 — delega en el centro operativo basado en snapshot. */
function Hojas_crearInicio(ss) {
  return Inicio_construir_(ss || Modelo_ss());
}

// ---------------------------------------------------------------------------
// Formato condicional, filtros, ocultamiento y protecciones
// ---------------------------------------------------------------------------

/** Fórmula compartida del semáforo de la agenda manual. */
function Hojas_formulaProximoControl(letra, fila, estado) {
  var celda = '$' + letra + fila;
  if (estado === 'VENCIDO') return '=AND(' + celda + '<>"",' + celda + '<TODAY())';
  if (estado === 'PROXIMO') return '=AND(' + celda + '<>"",' + celda + '>=TODAY(),' + celda + '<=TODAY()+7)';
  if (estado === 'VIGENTE') return '=AND(' + celda + '<>"",' + celda + '>TODAY()+7)';
  throw new Error('Estado de agenda desconocido: ' + estado);
}

/** GAS: reglas de formato condicional por hoja.
 *  API a nivel SHEET (get/setConditionalFormatRules — Range no las tiene).
 *  Estas hojas son del sistema: se reemplazan TODAS sus reglas por las del
 *  estándar (idempotente). Errores aislados por hoja. */
function Hojas_firmaReglaCondicional_(regla) {
  try {
    var condicion = regla.getBooleanCondition && regla.getBooleanCondition();
    if (!condicion) return '';
    var rangos = (regla.getRanges ? regla.getRanges() : []).map(function (r) {
      var hoja = r.getSheet && r.getSheet();
      return (hoja && hoja.getName ? hoja.getName() + '!' : '') + r.getA1Notation();
    });
    var valores = condicion.getCriteriaValues ? condicion.getCriteriaValues() : [];
    return JSON.stringify({
      criterio: String(condicion.getCriteriaType ? condicion.getCriteriaType() : ''),
      valores: valores.map(function (v) { return String(v); }), rangos: rangos,
      fondo: condicion.getBackground ? condicion.getBackground() : '',
      tinta: condicion.getFontColor ? condicion.getFontColor() : '',
      negrita: condicion.getBold ? condicion.getBold() === true : false,
      cursiva: condicion.getItalic ? condicion.getItalic() === true : false,
      tachado: condicion.getStrikethrough ? condicion.getStrikethrough() === true : false,
      subrayado: condicion.getUnderline ? condicion.getUnderline() === true : false
    });
  } catch (e) { return ''; }
}

function Hojas_reglasCondicionalesCoinciden_(actuales, deseadas) {
  if (!actuales || actuales.length !== deseadas.length) return false;
  for (var i = 0; i < deseadas.length; i++) {
    var a = Hojas_firmaReglaCondicional_(actuales[i]);
    var d = Hojas_firmaReglaCondicional_(deseadas[i]);
    if (!a || !d || a !== d) return false;
  }
  return true;
}

function Hojas_aplicarFormatoCondicional_(ss) {
  var aplicadas = 0, omitidas = 0, errores = [];

  function regla(formula, fondo, rango, negrita) {
    var b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
      .setBackground(fondo).setRanges([rango]);
    if (negrita) b = b.setBold(true);
    return b.build();
  }
  function aplicar(hoja, reglas) {
    try {
      if (typeof hoja.getConditionalFormatRules === 'function' &&
          Hojas_reglasCondicionalesCoinciden_(hoja.getConditionalFormatRules(), reglas)) {
        omitidas += reglas.length; return;
      }
    } catch (eC) { /* reescritura segura si la API no permite comparar */ }
    hoja.setConditionalFormatRules(reglas);
    aplicadas += reglas.length;
  }

  // Validaciones, notas y formatos numéricos se aplican en funciones separadas.

  /* PACIENTES: RUT inválido (rojo), revisión (ámbar), estrat por nivel.
   *  Fórmulas y rangos derivados del contrato (dataStartRow). */
  try {
    var p = ss.getSheetByName(HOJAS.PACIENTES);
    var iniP = Modelo_dataStartRow(HOJAS.PACIENTES);
    if (p && p.getLastRow() >= iniP) {
      var filas = Math.max(Hojas_filasGestionadas_(p, HOJAS.PACIENTES), 1);
      var cRut = Hojas_columnaCampo_(HOJAS.PACIENTES, 'RUT'),
          cRutOk = Hojas_columnaCampo_(HOJAS.PACIENTES, 'RUT_DV_VALIDO'),
          cRev = Hojas_columnaCampo_(HOJAS.PACIENTES, 'REQUIERE_REVISION'),
          cSinDv = Hojas_columnaCampo_(HOJAS.PACIENTES, 'RUT_SIN_DV'),
          cEst = Hojas_columnaCampo_(HOJAS.PACIENTES, 'ESTRATIFICACION'),
          cProx = Hojas_columnaCampo_(HOJAS.PACIENTES, 'PROXIMO_CONTROL');
      var lRutOk = Hojas_columnaA1_(cRutOk), lRev = Hojas_columnaA1_(cRev),
          lSinDv = Hojas_columnaA1_(cSinDv), lEst = Hojas_columnaA1_(cEst), lProx = Hojas_columnaA1_(cProx);
      aplicar(p, [
        regla('=$' + lRutOk + iniP + '=FALSE', DESIGN_SYSTEM.ESTADOS.ERROR.fondo, p.getRange(iniP, cRut, filas, 1), true),
        regla('=$' + lSinDv + iniP + '=TRUE', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, p.getRange(iniP, cRut, filas, 1)),
        regla('=$' + lRev + iniP + '=TRUE', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, p.getRange(iniP, cRev, filas, 1), true),
        regla('=$' + lEst + iniP + '="G1"', DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo, p.getRange(iniP, cEst, filas, 1)),
        regla('=$' + lEst + iniP + '="G2"', DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo, p.getRange(iniP, cEst, filas, 1)),
        regla('=$' + lEst + iniP + '="G3"', DESIGN_SYSTEM.ESTADOS.VENCIDO.fondo, p.getRange(iniP, cEst, filas, 1)),
        regla('=OR($' + lEst + iniP + '="",$' + lEst + iniP + '="G")', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, p.getRange(iniP, cEst, filas, 1)),
        regla(Hojas_formulaProximoControl(lProx, iniP, 'VENCIDO'),
          DESIGN_SYSTEM.ESTADOS.VENCIDO.fondo, p.getRange(iniP, cProx, filas, 1)),
        regla(Hojas_formulaProximoControl(lProx, iniP, 'PROXIMO'),
          DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo, p.getRange(iniP, cProx, filas, 1)),
        regla(Hojas_formulaProximoControl(lProx, iniP, 'VIGENTE'),
          DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo, p.getRange(iniP, cProx, filas, 1))
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
      var L = Hojas_columnaA1_(colEstado);
      var rEstado = h.getRange(ini, colEstado, Math.max(Hojas_filasGestionadas_(h, nombre), 1), 1);
      aplicar(h, [
        regla('=$' + L + ini + '="PENDIENTE"', DESIGN_SYSTEM.ESTADOS.ALERTA.fondo, rEstado),
        regla('=$' + L + ini + '="AGENDADO"', DESIGN_SYSTEM.ESTADOS.INFO.fondo, rEstado),
        regla('=$' + L + ini + '="ERROR"', DESIGN_SYSTEM.ESTADOS.ERROR.fondo, rEstado, true),
        regla('=$' + L + ini + '="REQUIERE_REVISION"', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, rEstado),
        regla('=$' + L + ini + '="INGRESADO"', DESIGN_SYSTEM.ESTADOS.OK.fondo, rEstado),
        regla('=$' + L + ini + '="NO_CONTESTA"', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, rEstado),
        regla('=$' + L + ini + '="FALLECIDO"', DESIGN_SYSTEM.HOJAS.tecnico.fondo, rEstado),
        regla('=$' + L + ini + '="NSP"', DESIGN_SYSTEM.ESTADOS.ERROR.fondo, rEstado)
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
      var letraRut = Hojas_columnaA1_(colRut);
      var letraEst = Hojas_columnaA1_(colEst);
      var letraProx = Hojas_columnaA1_(colProx);
      var filas = Math.max(Hojas_filasGestionadas_(h, nombre), 1);
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
        regla(Hojas_formulaProximoControl(letraProx, ini, 'VENCIDO'),
             DESIGN_SYSTEM.ESTADOS.VENCIDO.fondo, h.getRange(ini, colProx, filas, 1)),
        regla(Hojas_formulaProximoControl(letraProx, ini, 'PROXIMO'),
             DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo, h.getRange(ini, colProx, filas, 1)),
        regla(Hojas_formulaProximoControl(letraProx, ini, 'VIGENTE'),
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
      var rC = con.getRange(iniC, 9, Math.max(Hojas_filasGestionadas_(con, HOJAS.CONFLICTOS), 1), 1);
      aplicar(con, [
        regla('=$I' + iniC + '="PENDIENTE"', DESIGN_SYSTEM.ESTADOS.REVISION.fondo, rC, true),
        regla('=$I' + iniC + '="RESUELTO"', DESIGN_SYSTEM.ESTADOS.OK.fondo, rC)
      ]);
    }
  } catch (eC2) { errores.push('CONFLICTOS: ' + (eC2 && eC2.message || eC2)); }

  /* EVENTOS: color discreto únicamente en TIPO_EVENTO. */
  try {
    var ev = ss.getSheetByName(HOJAS.EVENTOS), iniEv = Modelo_dataStartRow(HOJAS.EVENTOS);
    var colTipo = Hojas_columnaCampo_(HOJAS.EVENTOS, 'TIPO_EVENTO');
    if (ev && ev.getLastRow() >= Modelo_headerRow(HOJAS.EVENTOS) && colTipo > 0) {
      var filasEv = Math.max(Hojas_filasGestionadas_(ev, HOJAS.EVENTOS), 1), letraTipo = Hojas_columnaA1_(colTipo);
      var rangoTipo = ev.getRange(iniEv, colTipo, filasEv, 1);
      aplicar(ev, [
        regla('=$' + letraTipo + iniEv + '="INGRESO"', DESIGN_SYSTEM.ESTADOS.INFO.fondo, rangoTipo),
        regla('=$' + letraTipo + iniEv + '="CONTROL"', DESIGN_SYSTEM.ESTADOS.OK.fondo, rangoTipo),
        regla('=$' + letraTipo + iniEv + '="SEGUIMIENTO"', DESIGN_SYSTEM.ESTADOS.VIGENTE.fondo, rangoTipo),
        regla('=$' + letraTipo + iniEv + '="CAMBIO_SECTOR"', DESIGN_SYSTEM.HOJAS.seleccion.fondo, rangoTipo),
        regla('=$' + letraTipo + iniEv + '="CAMBIO_ESTRATIFICACION"', DESIGN_SYSTEM.ESTADOS.PROXIMO.fondo, rangoTipo),
        regla('=$' + letraTipo + iniEv + '="OTRO"', DESIGN_SYSTEM.HOJAS.tecnico.fondo, rangoTipo)
      ]);
    }
  } catch (eEv) { errores.push('EVENTOS: ' + (eEv && eEv.message || eEv)); }

  return { aplicadas: aplicadas, omitidas: omitidas, errores: errores };
}

/** GAS: filtros básicos en hojas de datos, anclados en headerRow del contrato
 *  (idempotente; si existe un filtro heredado mal anclado, se recrea). */
function Hojas_filtros(ss) {
  // Un filtro compartido cambia la vista de todos los colaboradores. v0.12
  // conserva los existentes y deja búsqueda/filtrado operativo en la Web App.
  return { filtros: 0, omitida: true, motivo: 'FILTROS_COMPARTIDOS_NO_AUTOMATICOS' };
}

/** GAS: oculta columnas técnicas (idempotente) — no cambia índices. */
function Hojas_ocultarTecnicas(ss) {
  var ocultas = 0;
  function ocultar(hoja, campos) {
    var nombre = hoja.getName();
    campos.forEach(function (campo) {
      var col = Hojas_columnaCampo_(nombre, campo);
      if (col < 1) return;
      if (!hoja.isColumnHiddenByUser(col)) { hoja.hideColumns(col); ocultas++; }
    });
  }
  var p = ss.getSheetByName(HOJAS.PACIENTES);
  if (p) ocultar(p, ['ID_INTERNO','TELEFONO_OBS','NOMBRE_NORMALIZADO','RUT_DV_VALIDO',
    'RUT_SIN_DV','ESTRAT_ORIGEN','ESTRAT_CALCULADA','ESTRAT_FECHA_CALCULO','FUENTE','FECHA_ACTUALIZACION']);
  var e = ss.getSheetByName(HOJAS.EVENTOS);
  if (e) ocultar(e, ['ID_EVENTO','ID_INTERNO','FUENTE','REGISTRADO_POR','FECHA_REGISTRO']);

  // Ocultar hoja CONFLICTOS (se accede vía Cola de revisión)
  var c = ss.getSheetByName(HOJAS.CONFLICTOS);
  if (c && !c.isSheetHidden()) { c.hideSheet(); ocultas++; }

  return { ocultas: ocultas };
}

/** GAS: protecciones de ADVERTENCIA según categoría (#2: nunca bloqueo duro). */
function Hojas_proteger(ss) {
  var n = 0;
  function advertir(hoja, a1, desc) {
    desc = 'ECICEP:' + desc;
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

  /* Solo se eliminan protecciones propiedad de ECICEP. Las protecciones de
     usuarios o administradores siempre se preservan. */
  HOJAS_SECTOR.forEach(function (nombre) {
    var h = ss.getSheetByName(nombre);
    if (h) h.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (pr) {
      try { if (Hojas_esProteccionEcicep_(pr)) pr.remove(); } catch (eR) { /* best effort */ }
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

/** Compatibilidad histórica: la fase INICIO es dueña exclusiva de la
 *  portada. El resto de la presentación vive en 35_Presentacion.js. */
function Modelo_disenoHojas() {
  var ss = Modelo_ss();
  var res = { inicio: Hojas_crearInicio(ss),
    cond: { aplicadas: 0, omitida: true, errores: [] },
    filtros: { filtros: 0, omitida: true },
    ocultas: { ocultas: 0, omitida: true },
    protecciones: { protecciones: 0, omitida: true } };
  Log_info('Hojas', 'inicio', JSON.stringify({ ok: res.inicio.ok !== false }));
  Log_flush();
  return res;
}

/** Colorea todas las celdas RUT en INGRESO_* según validación (idempotente).
 *  Fast-path 0.12.1: si la coloración actual ya coincide, cero escrituras. */
function Hojas_colorearRutIngresos(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var ok = 0, fallidas = [];
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    try {
      var h = ss.getSheetByName(nombre);
      var ini = Modelo_dataStartRow(nombre);
      if (!h || h.getLastRow() < ini) return;
      var colRut = INGRESO_COLUMNAS.indexOf('RUT') + 1;
      var cantidad = Hojas_filasGestionadas_(h, nombre);
      if (!cantidad && h.getLastRow() >= ini) cantidad = h.getLastRow() - ini + 1;
      if (cantidad < 1) return;
      var vals = h.getRange(ini, colRut, cantidad, 1).getValues();
      var backgrounds = [];
      for (var i = 0; i < vals.length; i++) {
        var rut = Utl_texto(vals[i][0]);
        if (!rut) { backgrounds.push(['']); continue; }
        var norm = Norm_normalizarRut(rut);
        var valido = norm.rut && Norm_validarRut(norm.rut);
        backgrounds.push([valido ? DESIGN_SYSTEM.ESTADOS.OK.fondo : DESIGN_SYSTEM.ESTADOS.ERROR.fondo]);
      }
      var r = h.getRange(ini, colRut, backgrounds.length, 1);
      var yaCoincide = false;
      try {
        if (typeof r.getBackgrounds === 'function') {
          var actuales = r.getBackgrounds();
          yaCoincide = actuales.length === backgrounds.length &&
            actuales.every(function (fila, fi) {
              return fila && fila[0] === backgrounds[fi][0];
            });
        }
      } catch (eBg) { yaCoincide = false; }
      if (!yaCoincide) r.setBackgrounds(backgrounds);
      ok++;
    } catch (e) { fallidas.push(nombre + ': ' + (e && e.message || e)); }
  });
  return { coloreadas: ok, fallidas: fallidas, reescritas: ok };
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
function Hojas_resetFabrica_(conBackup) {
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
  var r = Hojas_resetFabrica_(resp === 'SI');
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
var BACKUP_PREFIJO_PRE = 'PRE_ECICEP_BACKUP';
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

/** Solo lectura: busca la carpeta sin crear recursos durante un diagnóstico. */
function _backup_folderExistente_() {
  var cur = Entorno_actualGAS();
  var id = Entorno_recursoEsperado(cur.entorno, 'BACKUP_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var nombre = cur.entorno === 'DESCONOCIDO' ? BACKUP_FOLDER_NOMBRE : Entorno_carpetaEsperada(cur.entorno);
  var folders = DriveApp.getFoldersByName(nombre);
  return folders.hasNext() ? folders.next() : null;
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
    etiqueta = Utl_texto(etiqueta || 'MANUAL').toUpperCase();
    var prefijo = etiqueta === 'AUTO' ? BACKUP_PREFIJO_AUTO
      : (etiqueta.indexOf('PRE_') === 0 ? BACKUP_PREFIJO_PRE : BACKUP_PREFIJO_MAN);
    var nombre = prefijo + (etiqueta.indexOf('PRE_') === 0 ? '_' + etiqueta : '') + '_' + ts;
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
    if (nombre.indexOf(BACKUP_PREFIJO_AUTO) === 0 || nombre.indexOf(BACKUP_PREFIJO_MAN) === 0 ||
        nombre.indexOf(BACKUP_PREFIJO_PRE) === 0) {
      items.push({
        nombre: nombre,
        url: f.getUrl(),
        id: f.getId(),
        tamano: f.getSize(),
        fecha: f.getDateCreated().toISOString(),
        esAuto: nombre.indexOf(BACKUP_PREFIJO_AUTO) === 0,
        esPrevio: nombre.indexOf(BACKUP_PREFIJO_PRE) === 0
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

/** Estado real y de solo lectura del respaldo. No crea carpeta ni archivos. */
function Backup_estadoOperativo_() {
  var cfg = _config_leerValores(['BACKUP_AUTO_ULTIMA', 'BACKUP_MANTENER', 'BACKUP_DIA', 'BACKUP_HORA']);
  var mantener = parseInt(cfg.BACKUP_MANTENER, 10);
  if (!(mantener > 0)) mantener = BACKUP_DEFAULT_MANTENER;
  var trigger = false, folder = null, listado = { items: [], autoCount: 0, manCount: 0 };
  try { trigger = Backup_triggerInstalado(); } catch (eT) {}
  try { folder = _backup_folderExistente_(); } catch (eF) {}
  if (folder) {
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next(), nombre = f.getName();
      if (nombre.indexOf(BACKUP_PREFIJO_AUTO) !== 0 && nombre.indexOf(BACKUP_PREFIJO_MAN) !== 0 &&
          nombre.indexOf(BACKUP_PREFIJO_PRE) !== 0) continue;
      listado.items.push({ nombre: nombre, fecha: f.getDateCreated().toISOString() });
      if (nombre.indexOf(BACKUP_PREFIJO_AUTO) === 0) listado.autoCount++;
      else listado.manCount++;
    }
  }
  listado.items.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
  var ultima = listado.items.length ? listado.items[0].fecha : '';
  var configurado = !!cfg.BACKUP_DIA && cfg.BACKUP_HORA !== '';
  var estado = !folder ? 'PENDIENTE_VALIDACION' : (!trigger ? 'INACTIVO' : (!ultima ? 'SIN_EJECUCION' : 'OK'));
  return { ok: !!folder && trigger && !!ultima, estado: estado, configurado: configurado,
    triggerActivo: trigger, carpetaAccesible: !!folder, ultima: ultima || cfg.BACKUP_AUTO_ULTIMA || '',
    total: listado.items.length, autoCount: listado.autoCount, manCount: listado.manCount,
    mantener: mantener, dia: cfg.BACKUP_DIA || 'DOMINGO', hora: cfg.BACKUP_HORA || '3' };
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
function api_backupListar(token) {
  if (!WebApp_autorizarBuscador(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  var st = Backup_listar();
  var trigger = Backup_triggerInstalado();
  var cfg = _config_leerValores(['BACKUP_AUTO_ULTIMA', 'BACKUP_MANTENER', 'BACKUP_DIA', 'BACKUP_HORA']);
  var ultima = cfg['BACKUP_AUTO_ULTIMA'] || '';
  var mantener = parseInt(cfg['BACKUP_MANTENER'], 10);
  if (!(mantener > 0)) mantener = BACKUP_DEFAULT_MANTENER;
  return {
    ok: true,
    trigger: trigger,
    ultima: ultima || 'nunca',
    mantener: mantener,
    dia: cfg['BACKUP_DIA'] || 'DOMINGO',
    hora: cfg['BACKUP_HORA'] || '3',
    items: st.items || [],
    autoCount: st.autoCount || 0,
    manCount: st.manCount || 0
  };
}

/** Endpoint: crear backup manual. */
function api_backupCrear(etiqueta, token) {
  if (!WebApp_autorizarBuscador(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  return Backup_crear(etiqueta || 'MANUAL');
}

/** Endpoint: toggle automático (activar/desactivar). */
function api_backupToggle(token) {
  try {
    if (!WebApp_autorizarBuscador(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
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
function api_backupProgramar(dia, hora, token) {
  try {
    if (!WebApp_autorizarBuscador(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    Backup_programar(dia, hora);
    return { ok: true, mensaje: 'Backup programado: ' + dia + ' ' + hora + ':00' };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: leer configuración actual de programación. */
function api_backupConfigLeer(token) {
  if (!WebApp_autorizarBuscador(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  return {
    ok: true,
    dia: _rem9_configValor('BACKUP_DIA') || 'DOMINGO',
    hora: _rem9_configValor('BACKUP_HORA') || '3',
    mantener: _backup_mantener()
  };
}

/** Endpoint: podar backups automáticos viejos. */
function api_backupPodar(token) {
  if (!WebApp_autorizarBuscador(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  return Backup_podar();
}

/** Endpoint: URL de la carpeta de backups. */
function api_backupFolder(token) {
  try {
    if (!WebApp_autorizarBuscador(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
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
