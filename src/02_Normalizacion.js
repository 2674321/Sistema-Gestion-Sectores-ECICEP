/**
 * Sistema ECICEP Unificado — 02_Normalizacion
 * Capa PURA: responde "¿cómo representamos consistentemente este dato?".
 * Prohibido aquí decidir semántica de negocio (eso es dominio/consolidación).
 * Sin SpreadsheetApp ni servicios GAS → testeable en node de forma aislada.
 *
 * Convención: ninguna función destruye el valor original; los resultados
 * incluyen `original` cuando aporta trazabilidad.
 */

// ---------------------------------------------------------------------------
// RUT
// ---------------------------------------------------------------------------

/** Calcula dígito verificador módulo 11 para un cuerpo numérico. */
function Norm_dvModulo11(cuerpo) {
  var suma = 0, mult = 2;
  for (var i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i), 10) * mult;
    mult = (mult === 7) ? 2 : mult + 1;
  }
  var resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
}

/**
 * Normaliza un RUT sin inventar datos.
 * @returns {estado:'VACIO'|'OK'|'SIN_DV'|'INVALIDO', rut, cuerpo, dv, dvCalculado, detalle, original}
 *   OK      → formato válido y DV correcto
 *   SIN_DV  → cuerpo plausible pero la fuente no traía DV (no se inventa)
 *   INVALIDO→ DV erróneo o caracteres/longitud imposibles
 */
function Norm_normalizarRut(raw) {
  var original = Utl_texto(raw);
  var res = { estado: 'VACIO', rut: '', cuerpo: '', dv: '', dvCalculado: '', detalle: '', original: original };
  if (Utl_vacio(original)) return res;

  // Excel entrega RUTs numéricos como float ("72910265.0")
  var limpio = original.trim().toUpperCase().replace(/\.0+$/, '').replace(/\./g, '').replace(/\s+/g, '');

  var mConDv = limpio.match(/^(\d{6,9})-([\dK])$/);
  var mSinDv = limpio.match(/^(\d{6,9})$/);

  if (mConDv) {
    res.cuerpo = mConDv[1];
    res.dv = mConDv[2];
    res.dvCalculado = Norm_dvModulo11(res.cuerpo);
    res.rut = res.cuerpo + '-' + res.dv;
    if (res.dv !== res.dvCalculado) {
      res.estado = 'INVALIDO';
      res.detalle = 'DV incorrecto (esperado ' + res.dvCalculado + ')';
    } else {
      res.estado = 'OK';
    }
    return res;
  }

  if (mSinDv) {
    res.cuerpo = mSinDv[1];
    res.dvCalculado = Norm_dvModulo11(res.cuerpo);
    res.estado = 'SIN_DV';
    res.rut = res.cuerpo; // solo el cuerpo; NO se agrega DV inventado
    res.detalle = 'La fuente no trae dígito verificador';
    return res;
  }

  res.estado = 'INVALIDO';
  res.detalle = 'Formato no reconocido como RUT chileno';
  return res;
}

/** true si el RUT (normalizado o crudo) tiene DV válido según módulo 11. */
function Norm_validarRut(rutNormalizado) {
  return Norm_normalizarRut(rutNormalizado).estado === 'OK';
}

// ---------------------------------------------------------------------------
// Teléfonos
// ---------------------------------------------------------------------------

/**
 * Normaliza teléfonos de las fuentes sin inventar números.
 * Maneja: floats de Excel, múltiples números ('/', '-', espacios),
 * anotaciones textuales ('ESPOSO', nombres), prefijo país 56, duplicados.
 * @returns {estado:'VACIO'|'OK'|'PARCIAL'|'INVALIDO', telefonos:[], observaciones:[], detalle, original}
 *   PARCIAL → hay números guardados pero alguno corto/sospechoso
 */
function Norm_normalizarTelefono(raw) {
  var original = Utl_texto(raw);
  var res = { estado: 'VACIO', telefonos: [], observaciones: [], detalle: '', original: original };
  if (Utl_vacio(original)) return res;

  // Float de Excel: "993617702.0" / notación científica
  var texto = original.replace(/\.0+$/, '').replace(/(\d)\.0*e\+\d+/i, '$1');
  var tokens = texto.split(/[\/,;|\n]+|\s+-\s*|-(?=\d{8,})/);
  var vistos = {};

  for (var i = 0; i < tokens.length; i++) {
    var tok = Utl_colapsarEspacios(tokens[i]);
    if (tok === '') continue;

    // Anotación textual dentro del token (ej: "ESPOSO", "64400270 sandra")
    var letras = tok.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñÜü\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (letras !== '' && letras.length > 1) res.observaciones.push(letras.toUpperCase());

    var candidatos = tok.replace(/[^0-9+]+/g, ' ').trim().split(/\s+/);
    for (var j = 0; j < candidatos.length; j++) {
      var solo = candidatos[j].replace(/^\+/, '');
      if (solo === '' || solo === '+') continue;
      if (solo.indexOf('56') === 0 && solo.length >= 11) solo = solo.substring(2); // código país
      if (solo.length < 8 || solo.length > 9) {
        res.observaciones.push('NUMERO DESCARTADO: ' + candidatos[j]);
        continue;
      }
      if (vistos[solo]) continue;
      vistos[solo] = true;
      res.telefonos.push(solo);
      if (solo.length === 8) res.detalle = 'Incluye número corto (posible dígito inicial perdido)';
    }
  }

  if (res.telefonos.length === 0 && res.observaciones.length === 0) res.estado = 'INVALIDO';
  else if (res.telefonos.length === 0) res.estado = 'VACIO';
  else if (res.detalle !== '') res.estado = 'PARCIAL';
  else res.estado = 'OK';

  res.telefonos.sort();
  return res;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

/**
 * Parser tolerante y honesto: nunca transforma una fecha dudosa en otra fecha.
 * @param {Object} [rango] {min,max} años plausibles; por defecto CFG_FECHAS
 *        (los nacimientos usan ANO_MIN_NACIMIENTO — ver Fuentes_normalizar)
 * @returns {estado:'VACIA'|'VALIDA'|'MES_ANO'|'INVALIDA'|'NO_RECONOCIDA',
 *           fecha:Date|null, iso:'', detalle:'', original}
 *   VACIA         → vacío real ('', '-', '--')
 *   VALIDA        → fecha completa confiable
 *   MES_ANO       → solo mes/año ('05/2026', '11/26'); fecha=null, no se inventa día
 *   INVALIDA      → parseable pero imposible (mes 24, año fuera de rango)
 *   NO_RECONOCIDA → texto que no es fecha (semántica la decide el negocio)
 */
function Norm_normalizarFecha(raw, rango) {
  var anoMin = (rango && rango.min !== undefined) ? rango.min : CFG_FECHAS.ANO_MIN;
  var anoMax = (rango && rango.max !== undefined) ? rango.max : CFG_FECHAS.ANO_MAX;
  var res = { estado: 'VACIA', fecha: null, iso: '', detalle: '', original: (raw instanceof Date) ? null : Utl_texto(raw) };

  function fijar(y, mo, d) {
    y = Number(y); mo = Number(mo); d = Number(d);
    var f = new Date(y, mo - 1, d);
    if (f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) {
      res.estado = 'INVALIDA'; res.detalle = 'Fecha inexistente en calendario'; return false;
    }
    if (y < anoMin || y > anoMax) {
      res.estado = 'INVALIDA'; res.detalle = 'Año ' + y + ' fuera de rango plausible'; return false;
    }
    res.estado = 'VALIDA'; res.fecha = f;
    res.iso = y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
    return true;
  }

  if (raw === null || raw === undefined || raw === '') return res;

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) {
      res.estado = 'INVALIDA'; res.detalle = 'Serial de fecha corrupto';
      return res;
    }
    var y = raw.getFullYear(), mo = raw.getMonth() + 1, d = raw.getDate();
    if (y < anoMin || y > anoMax) {
      res.estado = 'INVALIDA'; res.detalle = 'Serial con año ' + y + ' fuera de rango';
    } else {
      res.estado = 'VALIDA'; res.fecha = new Date(y, mo - 1, d);
      res.iso = y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
    }
    return res;
  }

  var t = Utl_colapsarEspacios(String(raw));
  if (t === '-' || t === '--') return res; // VACIA

  // ISO yyyy-mm-dd (con hora opcional)
  var mIso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mIso) { fijar(+mIso[1], +mIso[2], +mIso[3]); return res; }

  // dd/mm/yyyy | dd-mm-yyyy | dd.mm.yyyy (tolera separador final suelto)
  var mDia = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})[\/\-.]*$/);
  if (mDia) { fijar(+mDia[3], +mDia[2], +mDia[1]); return res; }

  // dd/mm/yy → año 2000+
  var mDia2 = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (mDia2) { fijar(2000 + +mDia2[3], +mDia2[2], +mDia2[1]); return res; }

  // mm/yyyy o mm/aa ('05/2026', '11/26') → MES_ANO, no se inventa día
  var mMes = t.match(/^(\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (mMes) {
    var mm = +mMes[1], aa = +mMes[2];
    if (mMes[2].length === 2) aa = 2000 + aa;
    if (mm >= 1 && mm <= 12 && aa >= anoMin && aa <= anoMax) {
      res.estado = 'MES_ANO'; res.detalle = 'Solo mes/año';
      res.iso = aa + '-' + ('0' + mm).slice(-2);
    } else {
      res.estado = 'INVALIDA'; res.detalle = 'Mes/año fuera de rango';
    }
    return res;
  }

  // Errores de hoja de cálculo
  if (/#VALUE!|#REF!|#N\/A/i.test(t)) {
    res.estado = 'INVALIDA'; res.detalle = 'Error de fórmula en la celda origen';
    return res;
  }

  res.estado = 'NO_RECONOCIDA';
  res.detalle = 'Texto no reconocible como fecha';
  return res;
}

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

/**
 * Normaliza nombre conservando tildes y ñ (información identitaria).
 * @returns {ok:boolean, nombre:'', original:''}
 */
function Norm_normalizarNombre(raw) {
  var original = Utl_texto(raw);
  if (Utl_vacio(original)) return { ok: false, nombre: '', original: original };
  var n = Utl_colapsarEspacios(original).toUpperCase()
    .replace(/[",;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { ok: n.length > 1, nombre: n, original: original };
}

/** Clave de matching: mayúsculas sin tildes, solo letras/espacios colapsados. */
function Norm_claveNombre(nombre) {
  return Utl_sinTildes(Utl_colapsarEspacios(nombre)).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------

/**
 * Normaliza un encabezado y lo mapea al campo canónico.
 * @returns {clave:'', canonico:null|string, conocido:boolean, ambiguo:boolean}
 *   conocido:true  → existe mapeo confirmado hacia el modelo
 *   ambiguo:true   → presente en fuentes pero sin destino definido
 *                    (registrado en ENCABEZADOS_SIN_DESTINO)
 */
var _NORM_IDX_ENC = null;
function _normIndiceEncabezados() {
  if (_NORM_IDX_ENC) return _NORM_IDX_ENC;
  _NORM_IDX_ENC = {};
  for (var k in SINONIMOS_ENCABEZADOS) {
    if (SINONIMOS_ENCABEZADOS.hasOwnProperty(k)) {
      _NORM_IDX_ENC[Utl_claveAlnum(k)] = SINONIMOS_ENCABEZADOS[k];
    }
  }
  return _NORM_IDX_ENC;
}

function Norm_mapearEncabezado(raw) {
  var clave = Utl_claveAlnum(Utl_colapsarEspacios(Utl_texto(raw)));
  var res = { clave: clave, canonico: null, conocido: false, ambiguo: false };
  if (clave === '') return res;

  var indice = _normIndiceEncabezados();
  if (indice.hasOwnProperty(clave)) {
    res.canonico = indice[clave];
    res.conocido = true;
    return res;
  }
  for (var i = 0; i < ENCABEZADOS_SIN_DESTINO.length; i++) {
    if (Utl_claveAlnum(ENCABEZADOS_SIN_DESTINO[i]) === clave) {
      res.ambiguo = true;
      return res;
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Estados y estratificación (representación consistente del valor)
// ---------------------------------------------------------------------------

/** Mapea un valor de estado de fuente al canónico; desconocidos quedan visibles. */
function Norm_normalizarEstado(raw) {
  var t = Utl_sinTildes(Utl_colapsarEspacios(raw)).toUpperCase();
  if (t === '') return '';
  if (ESTADOS.SINONIMOS.hasOwnProperty(t)) return ESTADOS.SINONIMOS[t];
  if (ESTADOS.VALIDOS.indexOf(t) !== -1) return t;
  return Utl_colapsarEspacios(Utl_texto(raw)).toUpperCase(); // desconocido: conservar visible
}

/** G/G1/G2/G3 → G1|G2|G3|'' ('G' sola y NSP quedan vacíos hasta confirmación). */
function Norm_normalizarEstratificacion(raw) {
  var t = Utl_sinTildes(Utl_colapsarEspacios(raw)).toUpperCase();
  if (/^G[123]$/.test(t)) return t;
  return '';
}

// ---------------------------------------------------------------------------
// Sector geográfico, sexo y tipo de evento
// ---------------------------------------------------------------------------

/**
 * Sector territorial canónico. Dimensión INDEPENDIENTE de la estratificación G.
 * Acepta alias (NARANJA→NARANJO) y formas con/sin "SECTOR".
 * @returns {estado:'VACIO'|'OK'|'INVALIDO', sector:'', original:''}
 */
function Norm_normalizarSector(raw) {
  var original = Utl_texto(raw);
  var res = { estado: 'VACIO', sector: '', detalle: '', original: original };
  if (Utl_vacio(original)) return res;
  var t = Utl_sinTildes(Utl_colapsarEspacios(original)).toUpperCase().replace(/^SECTOR\s+/, '');
  if (SECTORES.ALIAS.hasOwnProperty(t)) t = SECTORES.ALIAS[t];
  if (SECTORES.VALIDOS.indexOf(t) !== -1) {
    res.estado = 'OK';
    res.sector = t;
  } else {
    res.estado = 'INVALIDO';
    res.detalle = 'Sector no reconocido';
  }
  return res;
}

/** Sexo canónico M|F|OTRO|'' (acepta MASCULINO/FEMENINO/HOMBRE/MUJER…). */
function Norm_normalizarSexo(raw) {
  var t = Utl_sinTildes(Utl_colapsarEspacios(raw)).toUpperCase();
  if (t === '') return '';
  if (SEXOS.VALIDOS.indexOf(t) !== -1) return t;
  if (SEXOS.SINONIMOS.hasOwnProperty(t)) return SEXOS.SINONIMOS[t];
  return ''; // desconocido: no se inventa
}

/** Tipo de evento canónico; desconocidos quedan visibles tal cual (mayúsculas). */
function Norm_normalizarTipoEvento(raw) {
  var t = Utl_sinTildes(Utl_colapsarEspacios(raw)).toUpperCase();
  if (t === '') return '';
  if (TIPOS_EVENTO.SINONIMOS.hasOwnProperty(t)) return TIPOS_EVENTO.SINONIMOS[t];
  if (TIPOS_EVENTO.VALIDOS.indexOf(t) !== -1) return t;
  return Utl_colapsarEspacios(Utl_texto(raw)).toUpperCase();
}
