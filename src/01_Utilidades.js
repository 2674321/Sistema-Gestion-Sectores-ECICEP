/**
 * Sistema ECICEP — 01_Utilidades
 * Helpers genéricos de rendimiento y transformación. Sin lógica de negocio.
 * Todas las funciones que tocan servicios GAS están protegidas para poder
 * ejecutar este módulo en node (pruebas locales deterministas).
 */

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Convierte a string seguro; null/undefined → ''. */
function Utl_texto(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** true si es null, undefined, '' o solo espacios. */
function Utl_vacio(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Quita tildes/diacríticos conservando Ñ→N. */
function Utl_sinTildes(s) {
  var t = Utl_texto(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t.replace(/Ø/g, 'O');
}

/** Colapsa espacios múltiples y recorta extremos. */
function Utl_colapsarEspacios(s) {
  return Utl_texto(s).replace(/\s+/g, ' ').trim();
}

/** Clave alfanumérica para comparar encabezados/textos: mayúsculas, sin
 *  tildes, sin puntuación ni espacios. 'FECHA PROX. CONTROL' → FECHAPROXCONTROL */
function Utl_claveAlnum(s) {
  return Utl_sinTildes(Utl_texto(s)).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Edad en años cumplidos desde fecha ISO de nacimiento.
 * Devuelve '' si no hay fecha o es inválida. refDate inyectable para pruebas.
 */
function Utl_edadDesde(isoNacimiento, refDate) {
  if (Utl_vacio(isoNacimiento)) return '';
  var m = Utl_texto(isoNacimiento).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  var ref = refDate || new Date();
  var anio = +m[1], mes = +m[2], dia = +m[3];
  if (!anio || !mes || !dia) return '';
  var edad = ref.getFullYear() - anio;
  var antesDeCumple = (ref.getMonth() + 1 < mes) || (ref.getMonth() + 1 === mes && ref.getDate() < dia);
  if (antesDeCumple) edad -= 1;
  return (edad >= 0 && edad < 130) ? String(edad) : '';
}

/** PURA: convierte un índice 1-based (1=A, 26=Z, 27=AA) a letras de columna A1. */
function Utl_columnaLetra(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** PURA: fórmula EDAD en vivo para la vista SECTOR_*.
 *  Trabaja sobre texto ISO "yyyy-MM-dd" (locale-independiente).
 *  Separador ÚNICO ';' (estrategia centralizada del proyecto, ver 17_Hojas):
 *  mezclar ';' y ',' en una misma fórmula es erróneo de parseo (#ERROR!)
 *  en cualquier locale (S10-FIX). */
function Utl_formulaEdad(colFecha, fila) {
  var c = Utl_columnaLetra(colFecha);
  return '=IF(' + c + fila + '="";"";IFERROR(DATEDIF(DATE(MID(' + c + fila + ';1;4);MID(' + c + fila + ';6;2);MID(' + c + fila + ';9;2));TODAY();"Y");""))';
}

// ---------------------------------------------------------------------------
// Bloques (regla del proyecto: nunca getValue/setValue dentro de loops)
// ---------------------------------------------------------------------------

/** Lectura completa de una hoja en una sola llamada. Devuelve [][] crudo. */
function Utl_leerBloque(hoja) {
  if (!hoja) return [];
  var rango = hoja.getDataRange();
  if (rango.getNumRows() === 0) return [];
  return rango.getValues();
}

/** Escritura de un bloque 2D en una sola llamada. valores debe ser [][]. */
function Utl_escribirBloque(hoja, filaInicio, colInicio, valores) {
  if (!hoja || !valores || !valores.length) return 0;
  hoja.getRange(filaInicio, colInicio, valores.length, valores[0].length).setValues(valores);
  return valores.length;
}

// ---------------------------------------------------------------------------
// Colecciones
// ---------------------------------------------------------------------------

/** Map clave→array de elementos con esa clave. */
function Utl_agruparPor(arr, fnClave) {
  var m = new Map();
  for (var i = 0; i < arr.length; i++) {
    var k = fnClave(arr[i], i);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(arr[i]);
  }
  return m;
}

/** Divide un array en bloques de tamaño n (para escrituras por lotes). */
function Utl_partir(arr, n) {
  var bloques = [];
  for (var i = 0; i < arr.length; i += n) bloques.push(arr.slice(i, i + n));
  return bloques;
}

/** Agrupa filas 1-based consecutivas en sub-arrays contiguos, para poder
 *  escribir varias celdas con un solo setValues por grupo (regla del
 *  proyecto: nunca accesos de celda en loops). Devuelve [] sin filas. */
function Utl_gruposContiguosFilas(filas) {
  if (!filas || !filas.length) return [];
  var ordenadas = filas.slice().sort(function (a, b) { return a - b; });
  var grupos = [];
  var actual = [ordenadas[0]];
  for (var i = 1; i < ordenadas.length; i++) {
    if (ordenadas[i] === actual[actual.length - 1] + 1) actual.push(ordenadas[i]);
    else { grupos.push(actual); actual = [ordenadas[i]]; }
  }
  grupos.push(actual);
  return grupos;
}

// ---------------------------------------------------------------------------
// Medición de tiempo (rendimiento)
// ---------------------------------------------------------------------------

/** Ejecuta fn y devuelve { resultado, ms }. No lanza: propaga el error tras medir. */
function Utl_medir(fn) {
  var t0 = Date.now();
  try {
    var r = fn();
    return { resultado: r, ms: Date.now() - t0 };
  } catch (e) {
    e.ms = Date.now() - t0;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Toast semántico de servidor.
// tipo: 'ok' → ✓ · 'warn' → ⚠ · 'err' → ✕ · 'info' → sin icono.
// UN mensaje final breve; los detalles técnicos van al LOG.
// ---------------------------------------------------------------------------

/** PURA: prefijo de icono según tipo. */
function Utl_toastIcono(tipo) {
  if (tipo === 'ok') return '✓ ';
  if (tipo === 'warn') return '⚠ ';
  if (tipo === 'err') return '✕ ';
  return '';
}

/** GAS: toast breve con semántica central. No falla sin spreadsheet activo. */
function Utl_toast(tipo, texto, segundos) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    ss.toast(Utl_toastIcono(tipo) + texto, 'ECICEP', segundos || 6);
  } catch (e) { /* sin UI: silencioso */ }
}

/** GAS: objeto Ui cacheados por invocación. getUi() es costoso (compila la
 *  IDE la primera vez); con cachear evitamos RPC repetidos en una ejecución
 *  (mismo patrón que _MEMO_HOJAS). Devuelve null si no hay UI. */
var _UI_CACHE = null;
function _UI_get() {
  if (!_UI_CACHE && typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.getUi) {
    try { _UI_CACHE = SpreadsheetApp.getUi(); } catch (e) { _UI_CACHE = null; }
  }
  return _UI_CACHE;
}
