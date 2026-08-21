/**
 * Sistema ECICEP Unificado — 01_Utilidades
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

/** Map clave→primer elemento que produce esa clave. */
function Utl_mapaPor(arr, fnClave, fnValor) {
  var m = new Map();
  for (var i = 0; i < arr.length; i++) {
    var k = fnClave(arr[i], i);
    if (!m.has(k)) m.set(k, fnValor ? fnValor(arr[i], i) : arr[i]);
  }
  return m;
}

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
// Caché (DEC-015): abstracción mínima sobre CacheService.
// Solo para índices/parámetros de lectura con invalidación explícita.
// En node (sin CacheService) queda en no-op silencioso.
// ---------------------------------------------------------------------------
function Utl_cacheGet(clave) {
  try {
    if (typeof CacheService === 'undefined') return null;
    var bruto = CacheService.getScriptCache().get(CFG_CACHE.PREFIJO + clave);
    return bruto === null ? null : JSON.parse(bruto);
  } catch (e) {
    return null; // la caché jamás debe romper el flujo
  }
}

function Utl_cachePut(clave, valor, ttlSeg) {
  try {
    if (typeof CacheService === 'undefined') return false;
    CacheService.getScriptCache().put(CFG_CACHE.PREFIJO + clave, JSON.stringify(valor), ttlSeg || CFG_CACHE.TTL_DEFECTO_SEG);
    return true;
  } catch (e) {
    return false;
  }
}

function Utl_cacheOlvidar(clave) {
  try {
    if (typeof CacheService === 'undefined') return;
    CacheService.getScriptCache().remove(CFG_CACHE.PREFIJO + clave);
  } catch (e) { /* no-op */ }
}
