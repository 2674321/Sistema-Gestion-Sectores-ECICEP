/**
 * Sistema ECICEP Unificado — 06_Modelo
 * Acceso a la base PACIENTES y creación de la estructura del Spreadsheet.
 * Única puerta de entrada a las hojas del sistema para el resto de módulos.
 */

var _MODELO_SS = null;

/** Spreadsheet activo (ligado) con fallback por ID. */
function Modelo_ss() {
  if (_MODELO_SS) return _MODELO_SS;
  _MODELO_SS = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(ECICEP.SPREADSHEET_ID);
  return _MODELO_SS;
}

function Modelo_hoja(nombre) {
  return Modelo_ss().getSheetByName(nombre);
}

/** Nombres de columnas del modelo en orden. */
function Modelo_campos() {
  return MODELO_PACIENTE.map(function (c) { return c.campo; });
}

/** Índice (1-based) de una columna del modelo en la hoja PACIENTES. */
function Modelo_indiceColumna(campo) {
  return Modelo_campos().indexOf(campo) + 1;
}

/**
 * Genera un ID interno único: EC-<base36 tiempo>-<aleatorio>.
 * No depende de RUT (permite corregir un RUT sin romper referencias).
 */
function Modelo_nuevoIdInterno() {
  var t = Date.now().toString(36).toUpperCase();
  var r = Math.floor(Math.random() * 1679616).toString(36).toUpperCase(); // 36^4
  while (r.length < 4) r = '0' + r;
  return 'EC-' + t + '-' + r;
}

// ---------------------------------------------------------------------------
// Instalación / reparación de estructura (idempotente)
// ---------------------------------------------------------------------------

var _MODELO_HOJAS_DEF = {};
_MODELO_HOJAS_DEF[HOJAS.CONFIG] = ['CLAVE', 'VALOR', 'DESCRIPCION'];
_MODELO_HOJAS_DEF[HOJAS.PACIENTES] = null; // usa MODELO_PACIENTE
_MODELO_HOJAS_DEF[HOJAS.STAGING_IMPORT] = ['ID_PROVISIONAL', 'ARCHIVO_ORIGEN', 'HOJA_ORIGEN', 'FILA_ORIGEN', 'SECTOR_ORIGEN', 'ESTADO_VALIDACION', 'ERRORES', 'WARNINGS', 'IDENTIFICACION', 'VALORES_ORIGINALES', 'NORMALIZADO', 'FUENTE'];
_MODELO_HOJAS_DEF[HOJAS.EVENTOS] = COLUMNAS_EVENTOS;
// Puertas de entrada por sector (ETAPA 3b): columnas operativas + sistema
var _INGRESO_ENCABEZADOS = ['NOMBRE', 'RUT', 'SEXO', 'FECHA NACIMIENTO', 'TELEFONO(S)', 'FECHA INGRESO', 'ESTRATIFICACION', 'DUPLA INGRESO', 'OBSERVACIONES', 'ESTADO_INGRESO', 'NOTA_SISTEMA'];
Object.keys(HOJAS_INGRESO).forEach(function (h) { _MODELO_HOJAS_DEF[h] = _INGRESO_ENCABEZADOS; });
_MODELO_HOJAS_DEF[HOJAS.LOG] = ['FECHA', 'NIVEL', 'MODULO', 'OPERACION', 'MENSAJE', 'DURACION_MS', 'CONTEXTO'];
_MODELO_HOJAS_DEF[HOJAS.CONFLICTOS] = ['FECHA_DETECCION', 'TIPO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'DETALLE', 'FUENTE_A', 'FUENTE_B', 'ESTADO_REVISION', 'RESUELTO_POR'];
_MODELO_HOJAS_DEF[HOJAS.FUENTES] = ['ARCHIVO', 'SECTOR', 'HOJAS', 'ESTADO_REGISTRO', 'ULTIMA_LECTURA', 'OBSERVACIONES'];

var _CONFIG_SEMILLA = [
  ['VERSION', ECICEP.VERSION, 'Versión del sistema instalada'],
  ['AMBIENTE', ECICEP.AMBIENTE, 'DESARROLLO | PRODUCCION'],
  ['SPREADSHEET_ID', ECICEP.SPREADSHEET_ID, 'ID de este spreadsheet'],
  ['NIVEL_LOG', CFG_LOG.NIVEL, 'DEBUG | INFO | WARNING | ERROR'],
  ['TTL_CACHE_SEG', CFG_CACHE.TTL_DEFECTO_SEG, 'TTL por defecto de caché (segundos)'],
  ['ANO_MIN_FECHAS', CFG_FECHAS.ANO_MIN, 'Año mínimo plausible para fechas'],
  ['ANO_MAX_FECHAS', CFG_FECHAS.ANO_MAX, 'Año máximo plausible para fechas']
];

/**
 * Crea/repara las hojas del sistema sin tocar datos existentes.
 * Elimina "Hoja 1" SOLO si existe y está completamente vacía.
 * @returns {creadas:[], existentes:[], hojaPredeterminadaEliminada:boolean}
 */
function Modelo_crearEstructura() {
  var res = { creadas: [], existentes: [], hojaPredeterminadaEliminada: false };
  var ss = Modelo_ss();

  Object.keys(_MODELO_HOJAS_DEF).forEach(function (nombre) {
    var hoja = ss.getSheetByName(nombre);
    if (!hoja) {
      hoja = ss.insertSheet(nombre);
      res.creadas.push(nombre);
      var encabezados = _MODELO_HOJAS_DEF[nombre] || Modelo_campos();
      Utl_escribirBloque(hoja, 1, 1, [encabezados]);
    } else {
      res.existentes.push(nombre);
    }
  });

  _modelo_formatearPacientes(ss.getSheetByName(HOJAS.PACIENTES));
  _modelo_sembrarConfig(ss.getSheetByName(HOJAS.CONFIG), res.creadas.indexOf(HOJAS.CONFIG) !== -1);

  // Hoja predeterminada: eliminar solo si vacía (regla de no destrucción)
  var hoja0 = ss.getSheetByName(HOJAS.HOJA_PREDETERMINADA);
  if (hoja0 && ss.getSheets().length > 1) {
    var datos = hoja0.getDataRange().getValues();
    var vacia = datos.every(function (fila) { return fila.every(function (c) { return c === ''; }); });
    if (vacia) { ss.deleteSheet(hoja0); res.hojaPredeterminadaEliminada = true; }
  }

  Log_info('Modelo', 'crearEstructura', 'creadas=' + res.creadas.join(',') + ' existentes=' + res.existentes.join(','));
  Log_flush();
  return res;
}

/** Formato base de PACIENTES: encabezado fijo, anchos, fechas, técnicas ocultas. */
function _modelo_formatearPacientes(hoja) {
  if (!hoja) return;
  hoja.setFrozenRows(1);
  var rangoEnc = hoja.getRange(1, 1, 1, MODELO_PACIENTE.length);
  rangoEnc.setFontWeight('bold').setBackground('#0b5394').setFontColor('#ffffff');

  // Anchos razonables según tipo
  for (var i = 0; i < MODELO_PACIENTE.length; i++) {
    var tipo = MODELO_PACIENTE[i].tipo;
    var ancho = (tipo === 'fecha') ? 100 : (tipo === 'enum' ? 110 : (tipo === 'bool' ? 90 : 160));
    hoja.setColumnWidth(i + 1, ancho);
    if (tipo === 'fecha') {
      hoja.getRange(2, i + 1, hoja.getMaxRows() - 1, 1).setNumberFormat(CFG_FECHAS.FORMATO_HOJA);
    }
  }

  // Columnas técnicas: agrupadas y ocultas (visibles solo si el usuario expande)
  var primeraTecnica = -1, contador = 0;
  for (var j = 0; j < MODELO_PACIENTE.length; j++) {
    if (MODELO_PACIENTE[j].tecnico) {
      if (primeraTecnica === -1) primeraTecnica = j + 1;
      contador++;
    }
  }
  if (primeraTecnica > 0 && contador > 0) {
    try {
      hoja.getRange(1, primeraTecnica, 1, contador).shiftColumnGroupDepth(1);
      var grupo = hoja.getColumnGroup(primeraTecnica, contador);
      grupo.collapse();
    } catch (e) {
      hoja.hideColumns(primeraTecnica, contador); // fallback seguro
    }
  }
}

/** Siembra CONFIG solo si la hoja es nueva o no tiene las claves base. */
function _modelo_sembrarConfig(hoja, esNueva) {
  if (!hoja) return;
  var existentes = {};
  if (!esNueva && hoja.getLastRow() > 1) {
    Utl_leerBloque(hoja).slice(1).forEach(function (f) { existentes[f[0]] = true; });
  }
  var filas = _CONFIG_SEMILLA.filter(function (f) { return esNueva || !existentes[f[0]]; });
  if (filas.length) {
    var inicio = hoja.getLastRow() + 1;
    Utl_escribirBloque(hoja, Math.max(inicio, 2), 1, filas);
  }
}

// ---------------------------------------------------------------------------
// Lectura de la base (por bloques + índices en memoria)
// ---------------------------------------------------------------------------

/** Lee PACIENTES completo como array de objetos canónicos. */
function Modelo_leerPacientes() {
  var hoja = Modelo_hoja(HOJAS.PACIENTES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  var valores = Utl_leerBloque(hoja);
  var campos = valores[0];
  var salida = [];
  for (var f = 1; f < valores.length; f++) {
    var obj = {};
    for (var c = 0; c < campos.length; c++) obj[campos[c]] = valores[f][c];
    salida.push(obj);
  }
  return salida;
}

/** Map RUT normalizado → índice dentro del array de Modelo_leerPacientes. */
function Modelo_indicePorRut(pacientes) {
  return Utl_mapaPor(pacientes, function (p) { return Utl_texto(p.RUT); });
}

// ---------------------------------------------------------------------------
// Escrituras por lotes (ETAPA 3b) — solo entorno GAS
// ---------------------------------------------------------------------------

/** Convierte un objeto canónico a fila según orden MODELO_PACIENTE. */
function Modelo_filaDesdeObjeto(obj) {
  return Modelo_campos().map(function (campo) {
    var v = obj[campo];
    return (v === undefined || v === null) ? '' : v;
  });
}

/**
 * Agrega pacientes nuevos en UNA escritura. Los objetos deben venir completos
 * desde la capa de ingresos; aquí solo se fija FECHA_ACTUALIZACION.
 */
function Modelo_agregarPacientes(objetos) {
  if (!objetos || !objetos.length) return 0;
  var ahora = new Date();
  var filas = objetos.map(function (o) {
    o.FECHA_ACTUALIZACION = ahora;
    return Modelo_filaDesdeObjeto(o);
  });
  var hoja = Modelo_hoja(HOJAS.PACIENTES);
  return Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, filas);
}

/**
 * Agrega eventos en UNA escritura respetando append-only:
 * nunca modifica filas existentes, solo añade al final.
 * Fija FECHA_REGISTRO y REGISTRADO_POR al momento de escribir.
 */
function Modelo_agregarEventos(eventos, registradoPor) {
  if (!eventos || !eventos.length) return 0;
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(HOJAS.EVENTOS);
  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.EVENTOS);
    Utl_escribirBloque(hoja, 1, 1, [COLUMNAS_EVENTOS]);
  }
  var ahora = new Date();
  var filas = eventos.map(function (ev) {
    ev.FECHA_REGISTRO = ahora;
    ev.REGISTRADO_POR = ev.REGISTRADO_POR || registradoPor || '';
    return COLUMNAS_EVENTOS.map(function (c) {
      var v = ev[c];
      return (v === undefined || v === null) ? '' : v;
    });
  });
  return Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, filas);
}
