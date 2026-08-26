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

// ---------------------------------------------------------------------------
// ETAPA 8C — Contrato de validación del catálogo de condiciones
// ---------------------------------------------------------------------------

/**
 * PURA: valida que un catálogo cumpla el esquema obligatorio.
 * Detecta: campos faltantes, códigos duplicados, aliases en conflicto,
 * ponderaciones inválidas y entradas malformadas.
 * @param {Array} catalogo lista de condiciones
 * @returns {valido:boolean, errores:[string], advertencias:[string]}
 */
function Estrat_validarCatalogo(catalogo) {
  var errores = [], advertencias = [];
  if (!catalogo || !catalogo.length) {
    return { valido: false, errores: ['Catálogo vacío o nulo'], advertencias: [] };
  }

  var codigosVistos = {}, aliasesVistos = {};

  catalogo.forEach(function (c, idx) {
    var etiqueta = 'condición ' + (idx + 1) + ' (' + Utl_texto(c.CODIGO || '?') + ')';

    // campos obligatorios
    ['CODIGO','NOMBRE_CANONICO','ALIASES','PONDERACION','ACTIVA'].forEach(function (campo) {
      if (c[campo] === undefined || c[campo] === null) {
        errores.push(etiqueta + ': falta ' + campo);
      }
      // detectar campo obsoleto NOMBRE (en vez de NOMBRE_CANONICO)
      if (campo === 'NOMBRE_CANONICO' && c.NOMBRE !== undefined && c.NOMBRE_CANONICO === undefined) {
        errores.push(etiqueta + ': usa campo obsoleto NOMBRE en lugar de NOMBRE_CANONICO');
      }
    });

    // código único
    var codigo = Utl_texto(c.CODIGO).toUpperCase();
    if (codigo && codigosVistos[codigo]) {
      errores.push(etiqueta + ': código duplicado "' + codigo + '"');
    }
    if (codigo) codigosVistos[codigo] = true;

    // ponderación válida
    if (c.PONDERACION !== undefined && (typeof c.PONDERACION !== 'number' || c.PONDERACION < 0)) {
      errores.push(etiqueta + ': PONDERACION inválida (' + c.PONDERACION + ')');
    }

    // aliases únicos entre todas las condiciones
    (c.ALIASES || []).forEach(function (a) {
      var claveA = Utl_claveAlnum(a);
      if (!claveA) return;
      if (aliasesVistos[claveA] && aliasesVistos[claveA] !== codigo) {
        errores.push('alias "' + a + '" usado por ' + aliasesVistos[claveA] + ' y ' + codigo);
      }
      if (claveA) aliasesVistos[claveA] = codigo;
    });

    // nombre canónico no vacío si el campo existe
    if (c.NOMBRE_CANONICO !== undefined && Utl_vacio(c.NOMBRE_CANONICO)) {
      errores.push(etiqueta + ': NOMBRE_CANONICO vacío');
    }
  });

  return { valido: errores.length === 0, errores: errores, advertencias: advertencias };
}

/**
 * PURA: normaliza el campo CONDICIONES del paciente contra el catálogo.
 * @param {string} raw texto original con condiciones separadas por ";" o ","
 * @param {Array} catalogo [{CODIGO,NOMBRE_CANONICO,ALIASES,PONDERACION,ACTIVA}]
 * @returns {detectadas:[{codigo,nombre,ponderacion}], noReconocidas:[],
 *           origen:string, cantidad:number, sumaPonderacion:number}
 */
function Norm_normalizarCondiciones(raw, catalogo) {
  var origen = Utl_texto(raw).trim();
  var res = { detectadas: [], noReconocidas: [], origen: origen,
              cantidad: 0, sumaPonderacion: 0 };
  if (!origen || !catalogo || !catalogo.length) return res;

  var partes = origen.split(/[;,\n]+/);
  var vistos = {};

  partes.forEach(function (parte) {
    var texto = Utl_colapsarEspacios(parte).trim();
    if (!texto) return;
    var clave = Utl_sinTildes(texto).toUpperCase();

    // buscar en catálogo por código, nombre canónico o alias
    var encontrada = null;
    for (var i = 0; i < catalogo.length; i++) {
      var c = catalogo[i];
      if (!c.ACTIVA) continue;
      if (Utl_claveAlnum(c.CODIGO) === Utl_claveAlnum(clave)) { encontrada = c; break; }
      if (Utl_claveAlnum(c.NOMBRE_CANONICO || '') === Utl_claveAlnum(clave)) { encontrada = c; break; }
      if (c.ALIASES && c.ALIASES.some(function(a) {
        return Utl_claveAlnum(a) === Utl_claveAlnum(clave);
      })) { encontrada = c; break; }
    }

    if (encontrada) {
      if (!vistos[encontrada.CODIGO]) {
        vistos[encontrada.CODIGO] = true;
        res.detectadas.push({
          codigo: encontrada.CODIGO,
          nombre: encontrada.NOMBRE_CANONICO,
          ponderacion: encontrada.PONDERACION !== undefined ? encontrada.PONDERACION : 1
        });
        res.sumaPonderacion += (encontrada.PONDERACION !== undefined ? encontrada.PONDERACION : 1);
      }
    } else {
      res.noReconocidas.push(texto.toUpperCase());
    }
  });

  res.cantidad = res.detectadas.length;
  return res;
}

/**
 * PURA: aplica la regla de estratificación por PUNTAJE PONDERADO.
 * puntaje = suma de ponderaciones · 0→G0 · 1→G1 · 2-4→G2 · ≥5→G3
 * @param {number} puntaje suma de ponderaciones
 * @param {Object} config CFG_ESTRATIFICACION
 */
function Estrat_calcularPorPuntaje(puntaje, config) {
  config = config || CFG_ESTRATIFICACION;
  if (!config.REGLA_DISPONIBLE) {
    return { resultado: 'NO_CALCULABLE', regla: 'REGLA_NO_CONFIGURADA' };
  }
  var p = Number(puntaje) || 0;
  for (var i = 0; i < (config.UMBRALES || []).length; i++) {
    var u = config.UMBRALES[i];
    var okMin = u.minPuntaje === undefined || p >= u.minPuntaje;
    var okMax = u.maxPuntaje === undefined || p <= u.maxPuntaje;
    if (okMin && okMax) return { resultado: u.nivel, regla: 'PUNTAJE=' + p };
  }
  return { resultado: 'NO_CALCULABLE', regla: 'sin umbral para puntaje=' + p };
}

/**
 * PURA: motor completo — condiciones → catálogo → ponderación → puntaje → nivel.
 * Difiere de ETAPA 8A en que usa SUMA DE PONDERACIONES (no simple conteo).
 * Las condiciones de doble puntuación aportan 2 al puntaje.
 */
function Estrat_evaluar(rawCondiciones, catalogo, config) {
  config = config || CFG_ESTRATIFICACION;
  var norm = Norm_normalizarCondiciones(rawCondiciones, catalogo);

  if (!norm.cantidad && !norm.noReconocidas.length) {
    // sin datos registrados ≠ sin condiciones (FASE 9)
    return { estado:'SIN_DATOS', resultado:'', detectadas:[], noReconocidas:[],
             cantidad:0, puntaje:0, regla:'', version: config.VERSION_REGLA };
  }

  var calc = Estrat_calcularPorPuntaje(norm.sumaPonderacion, config);
  var estadoFinal = calc.resultado === 'NO_CALCULABLE' ? 'NO_CALCULABLE' : 'CALCULADO';
  // si hay no reconocidas y el resultado es bajo → marcar como NO_CALCULABLE
  if (norm.noReconocidas.length > 0 && calc.resultado !== 'G3') {
    estadoFinal = 'NO_CALCULABLE';
    calc.regla += ' + CONDICIONES_NO_RECONOCIDAS=' + norm.noReconocidas.length;
  }
  return {
    estado: estadoFinal,
    resultado: estadoFinal === 'CALCULADO' ? calc.resultado : '',
    detectadas: norm.detectadas,
    noReconocidas: norm.noReconocidas,
    cantidad: norm.cantidad,
    puntaje: norm.sumaPonderacion,
    regla: calc.regla,
    version: config.VERSION_REGLA
  };
}

// ---------------------------------------------------------------------------
// GAS: recálculo de estratificación
// ---------------------------------------------------------------------------

/**
 * Recalcula la estratificación de UN paciente y guarda en PACIENTES.
 * @returns {{ok:boolean, resultado:string, puntaje:number, regla:string}}
 */
function Estrat_recalcularPaciente(idInterno) {
  var hoja = Modelo_hoja(HOJAS.PACIENTES);
  if (!hoja) return { ok: false, motivo: 'SIN_HOJA_PACIENTES' };
  var pacientes = Modelo_leerPacientes();
  var idx = -1;
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(idInterno)) { idx = i; break; }
  }
  if (idx < 0) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
  var p = pacientes[idx];
  var res = Estrat_evaluar(p.CONDICIONES, CATALOGO_CONDICIONES_ECICEP, CFG_ESTRATIFICACION);
  var nuevoValor = res.estado === 'CALCULADO' ? String(res.resultado) : '';
  var anterior = Utl_texto(p.ESTRATIFICACION);
  p.ESTRATIFICACION = nuevoValor;
  p.ESTRAT_ORIGEN = String(anterior || '');
  p.ESTRAT_CALCULADA = String(res.resultado || '');
  p.ESTRAT_FECHA_CALCULO = new Date();
  p.FECHA_ACTUALIZACION = new Date();
  Modelo_hoja(HOJAS.PACIENTES).getRange(2 + idx, 1, 1, MODELO_PACIENTE.length)
    .setValues([Modelo_filaDesdeObjeto(p)]);
  try { Modelo_refrescarVistasSectores(); } catch (eSec) { /* best effort */ }
  return { ok: true, resultado: nuevoValor || 'pendiente', puntaje: res.puntaje,
           regla: res.regla, version: res.version };
}

/**
 * Recalcula la estratificación de TODOS los pacientes.
 * @returns {{ok:boolean, total:number, recalculados:number, tiempo:number}}
 */
function Estrat_recalcularTodos() {
  var t0 = new Date();
  var hoja = Modelo_hoja(HOJAS.PACIENTES);
  if (!hoja) return { ok: false, motivo: 'SIN_HOJA_PACIENTES' };
  var pacientes = Modelo_leerPacientes();
  var recalculados = 0;
  var filas = [];
  pacientes.forEach(function (p) {
    var res = Estrat_evaluar(p.CONDICIONES, CATALOGO_CONDICIONES_ECICEP, CFG_ESTRATIFICACION);
    var nuevoValor = res.estado === 'CALCULADO' ? String(res.resultado) : '';
    var anterior = Utl_texto(p.ESTRATIFICACION);
    p.ESTRATIFICACION = nuevoValor;
    p.ESTRAT_ORIGEN = String(anterior || '');
    p.ESTRAT_CALCULADA = String(res.resultado || '');
    p.ESTRAT_FECHA_CALCULO = new Date();
    p.FECHA_ACTUALIZACION = new Date();
    filas.push(Modelo_filaDesdeObjeto(p));
    if (nuevoValor !== anterior) recalculados++;
  });
  if (filas.length) {
    hoja.getRange(2, 1, filas.length, MODELO_PACIENTE.length).setValues(filas);
  }
  try { Modelo_refrescarVistasSectores(); } catch (eSec) { /* best effort */ }
  var ms = new Date() - t0;
  Log_info('Estrat', 'recalcularTodos', 'total=' + pacientes.length +
    ' recalculados=' + recalculados, null, ms);
  Log_flush();
  return { ok: true, total: pacientes.length, recalculados: recalculados, tiempo: ms };
}
