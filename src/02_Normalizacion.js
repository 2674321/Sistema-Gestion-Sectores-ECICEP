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

// ---------------------------------------------------------------------------
// Frecuencia de controles y estado (MODELO UNIFICADO v0.8.5)
// Fuente de verdad: CONFIG (FREC_CONTROL_G*_CANT + _UNIDAD) + estratificación
// de CADA persona. Se reutiliza Vigencia_vencimiento para soportar días/meses.
// ---------------------------------------------------------------------------

/** Normaliza un valor de fecha (Date, ISO, serial) a ISO yyyy-mm-dd o ''. */
function Control_aIso(v) {
  if (v instanceof Date && !isNaN(v.getTime()))
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  var s = Utl_texto(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d+(\.\d+)?$/.test(s)) { // serial
    var f = new Date((Math.round(+s)) * 86400000);
    if (!isNaN(f.getTime()) && f.getFullYear() > 1900)
      return f.getFullYear() + '-' + ('0' + (f.getMonth() + 1)).slice(-2) + '-' + ('0' + f.getDate()).slice(-2);
  }
  return '';
}

/** Frecuencia por defecto (semilla): G1 = alto riesgo (más frecuente) →
 *  G3 = bajo (menos frecuente). Idéntica a la semilla de CONFIG. */
function Control_frecuenciaDefault() {
  return { G1: { cantidad: 90, unidad: 'días' }, G2: { cantidad: 180, unidad: 'días' },
           G3: { cantidad: 365, unidad: 'días' }, G: { cantidad: 180, unidad: 'días' } };
}

/** PURA: parsea las filas de CONFIG → {G1:{cantidad,unidad},G2,G3,G}.
 *  Prioriza FREC_CONTROL_G*_CANT/_UNIDAD; si un nivel no tiene _CANT, usa la
 *  clave legacy FREC_CONTROL_G* (en días). Unidad válida: días | meses. */
function Control_frecuenciaConfig(configRows) {
  var r = Control_frecuenciaDefault();
  var legacy = {};
  var tieneCant = {};
  ['G1', 'G2', 'G3', 'G'].forEach(function (g) { tieneCant[g] = false; });
  (configRows || []).forEach(function (f) {
    var k = Utl_texto(f[0]), v = Utl_texto(f[1]);
    var m;
    if ((m = /^FREC_CONTROL_(G[123]|G)_CANT$/.exec(k))) {
      var c = parseInt(v, 10);
      if (c > 0) r[m[1]].cantidad = c;
      tieneCant[m[1]] = true;
    } else if ((m = /^FREC_CONTROL_(G[123]|G)_UNIDAD$/.exec(k))) {
      r[m[1]].unidad = Utl_sinTildes(v).toLowerCase().indexOf('mes') === 0 ? 'meses' : 'días';
    } else if ((m = /^FREC_CONTROL_(G[123]|G)$/.exec(k))) {
      var d = parseInt(v, 10);
      if (d > 0) legacy[m[1]] = d;
    }
  });
  ['G1', 'G2', 'G3', 'G'].forEach(function (g) {
    if (!tieneCant[g] && legacy[g]) r[g] = { cantidad: legacy[g], unidad: 'días' };
  });
  return r;
}

/** GAS: lee la frecuencia configurada desde la hoja CONFIG. */
function Control_leerFrecuencia() {
  try {
    var h = Modelo_hoja(HOJAS.CONFIG);
    if (h && h.getLastRow() > 1) return Control_frecuenciaConfig(Utl_leerBloque(h));
  } catch (e) {}
  return Control_frecuenciaDefault();
}

/** PURA: frecuencia de un nivel (G1/G2/G3) o G que aplica a la persona. */
function Control_frecuenciaDe(estratificacion, freqConfig) {
  var g = /^G[123]$/.test(Utl_texto(estratificacion))
    ? Utl_texto(estratificacion).toUpperCase() : 'G';
  return (freqConfig && freqConfig[g]) || { cantidad: 180, unidad: 'días' };
}

/** PURA: PRÓXIMO_CONTROL = ÚLTIMO_CONTROL + frecuencia (días/meses, respeta
 *  CONFIG). Si no se pasa freqConfig, lee CONFIG (entorno GAS). */
function Control_calcularProximo(ultimoControl, estratificacion, freqConfig) {
  var uc = Control_aIso(ultimoControl);
  if (!uc) return '';
  var f = Control_frecuenciaDe(estratificacion,
    freqConfig || (typeof Control_leerFrecuencia === 'function' ? Control_leerFrecuencia() : null));
  var v = Vigencia_vencimiento(uc, f.cantidad, f.unidad);
  return v || '';
}

/** PURA: estado de vigencia del control → SIN_FECHA | VENCIDO | POR_VENCER | VIGENTE.
 *  hoyRef y avisoDias inyectables (pruebas deterministas). */
function Control_estadoVigencia(proximoControl, hoyRef, avisoDias) {
  var pc = Control_aIso(proximoControl);
  if (!pc) return 'SIN_FECHA';
  var aviso = (avisoDias == null) ? 7 : avisoDias;
  if (avisoDias == null) {
    try {
      var h = Modelo_hoja(HOJAS.CONFIG);
      if (h && h.getLastRow() > 1) {
        Utl_leerBloque(h).slice(1).forEach(function (f) {
          if (Utl_texto(f[0]) === 'AVISO_CONTROL_DIAS') aviso = parseInt(f[1], 10) || 7;
        });
      }
    } catch (e) {}
  }
  var hoy = String(hoyRef || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')).slice(0, 10);
  function dDias(a, b) {
    var x = new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
    var y = new Date(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
    return Math.round((x - y) / 864e5);
  }
  var diff = dDias(pc, hoy);
  if (diff < 0) return 'VENCIDO';
  if (diff <= aviso) return 'POR_VENCER';
  return 'VIGENTE';
}

/** PURA: color por estado de control (semáforo real, una sola fuente). */
function Control_colorEstado(estado) {
  return { VENCIDO: 'rojo', POR_VENCER: 'ambar', VIGENTE: 'verde', SIN_FECHA: 'gris' }[estado] || 'gris';
}

/** PURA: recordatorio legible a partir del estado y fechas. */
function Control_recordatorio(estado, proximoIso, hoyIso) {
  if (estado === 'SIN_FECHA') return 'Sin control registrado';
  if (estado === 'VENCIDO') return 'Control VENCIDO — agenda su control';
  var d = 0;
  if (proximoIso && hoyIso) {
    var x = new Date(+proximoIso.slice(0, 4), +proximoIso.slice(5, 7) - 1, +proximoIso.slice(8, 10));
    var y = new Date(+hoyIso.slice(0, 4), +hoyIso.slice(5, 7) - 1, +hoyIso.slice(8, 10));
    d = Math.round((x - y) / 864e5);
  }
  if (estado === 'POR_VENCER') return 'Control próximo — quedan ' + d + ' día(s)';
  return 'Control vigente';
}

/**
 * PURA: analiza un conjunto de pacientes para el diagnóstico de control.
 * (base del dry-run). @returns {metricas, inconsistencias, porSector}
 * @param {number} [avisoDias=7] días de aviso (desde CONFIG AVISO_CONTROL_DIAS)
 */
function Control_analizar(pacientes, freqConfig, hoyIso, avisoDias) {
  var aviso = (avisoDias == null) ? 7 : avisoDias;
  var m = { analizados: 0, G1: 0, G2: 0, G3: 0, GPend: 0,
            conControles: 0, sinUltimoControl: 0, conProximo: 0,
            vencidos: 0, proximos: 0, vigentes: 0, sinFecha: 0,
            sinNacimiento: 0, fechaInvalida: 0, configFaltante: 0,
            ambiguos: 0, edadRecalculable: 0 },
      inconsistencias = [], porSector = {};
  (pacientes || []).forEach(function (p) {
    m.analizados++;
    var g = Utl_texto(p.ESTRATIFICACION).toUpperCase();
    var nivel = /^G[123]$/.test(g) ? g : 'GPend';
    m[nivel]++;
    var sec = Utl_texto(p.SECTOR).toUpperCase() || 'SIN_SECTOR';
    porSector[sec] = porSector[sec] || { total: 0, G1: 0, G2: 0, G3: 0, GPend: 0 };
    porSector[sec].total++; porSector[sec][nivel]++;
    var uc = p.ULTIMO_CONTROL;
    var estado, prox;
    if (Utl_vacio(uc)) {
      m.sinUltimoControl++;
      estado = 'SIN_FECHA';
      inconsistencias.push(p.ID_INTERNO + ': sin último control');
    } else {
      m.conControles++;
      prox = Control_calcularProximo(uc, g, freqConfig);
      if (!prox) { m.configFaltante++; }
      estado = prox ? Control_estadoVigencia(prox, hoyIso, aviso) : 'SIN_FECHA';
      if (prox) {
        m.conProximo++;
        if (estado === 'VENCIDO') m.vencidos++;
        else if (estado === 'POR_VENCER') m.proximos++;
        else m.vigentes++;
      }
    }
    if (estado === 'SIN_FECHA') m.sinFecha++;
    var nac = Utl_edadDesde(Utl_texto(p.FECHA_NACIMIENTO), hoyIso ? new Date(+hoyIso.slice(0, 4), +hoyIso.slice(5, 7) - 1, +hoyIso.slice(8, 10)) : undefined);
    if (Utl_vacio(p.FECHA_NACIMIENTO)) m.sinNacimiento++;
    else if (nac === '' && !Utl_vacio(p.FECHA_NACIMIENTO)) m.fechaInvalida++;
    else if (nac !== '') m.edadRecalculable++;
  });
  m.GPend = (pacientes || []).length - m.G1 - m.G2 - m.G3;
  return { metricas: m, inconsistencias: inconsistencias, porSector: porSector };
}

/**
 * PURA: filas para el Panel de Control (una por persona) con estado/color/
 * recordatorio, ya ordenadas por sector. Base del panel y del dry-run.
 * @param {Array} pacientes
 * @param {Object} freqConfig
 * @param {string} hoyIso
 * @param {number} [avisoDias=7] días de aviso (desde CONFIG AVISO_CONTROL_DIAS)
 * @returns {filas:[...], sectores:[...]}
 */
function Control_filasPanel(pacientes, freqConfig, hoyIso, avisoDias) {
  var aviso = (avisoDias == null) ? 7 : avisoDias;
  var filas = (pacientes || []).map(function (p) {
    var g = Utl_texto(p.ESTRATIFICACION).toUpperCase();
    var uc = Utl_texto(p.ULTIMO_CONTROL);
    var prox = Control_calcularProximo(p.ULTIMO_CONTROL, g, freqConfig);
    var estado = prox ? Control_estadoVigencia(prox, hoyIso, aviso) : (uc ? 'SIN_FECHA' : 'SIN_FECHA');
    if (!uc && prox) estado = 'SIN_FECHA';
    return {
      idInterno: Utl_texto(p.ID_INTERNO),
      nombre: Utl_texto(p.NOMBRE),
      rut: Utl_texto(p.RUT),
      sector: Utl_texto(p.SECTOR),
      estrat: g,
      ultimoControl: uc,
      ultimoSeguimiento: Utl_texto(p.ULTIMO_SEGUIMIENTO),
      proximo: prox || '',
      estado: estado,
      color: Control_colorEstado(estado),
      recordatorio: Control_recordatorio(estado, prox, hoyIso),
      edad: Utl_edadDesde(Utl_texto(p.FECHA_NACIMIENTO),
        hoyIso ? new Date(+hoyIso.slice(0, 4), +hoyIso.slice(5, 7) - 1, +hoyIso.slice(8, 10)) : undefined)
    };
  });
  function ordenSec(s) { return { AMARILLO: 0, NARANJO: 1, VERDE: 2 }[Utl_texto(s).toUpperCase()] ?? 3; }
  var sectores = {};
  filas.forEach(function (f) { sectores[f.sector] = (sectores[f.sector] || 0) + 1; });
  var listaSectores = Object.keys(sectores).map(function (s) {
    return { sector: s, personas: sectores[s] };
  }).sort(function (a, b) { return ordenSec(a.sector) - ordenSec(b.sector); });
  filas.sort(function (a, b) {
    var d = ordenSec(a.sector) - ordenSec(b.sector);
    if (d) return d;
    return Utl_texto(a.nombre) < Utl_texto(b.nombre) ? -1 : 1;
  });
  return { filas: filas, sectores: listaSectores };
}

/**
 * PURA: consulta "Controles por persona" bajo demanda, filtrada y paginada.
 * NUNCA recoje toda la población si no hay criterios: el llamador decide.
 *  - sector: filtra por sector ('AMARILLO'|'NARANJO'|'VERDE'|'').
 *  - termino: busca por ID interno, RUT o nombre (insensible a mayúsculas
 *    y tildes; substring).
 *  - inicio: desplazamiento (pag 1 = 0). limite: filas a devolver (máx 100,
 *    default 25). Devuelve total real + desde/hasta. Orden sector→nombre
 *    (mismo criterio que Control_filasPanel).
 */
function Control_consultarControles(pacientes, freqConfig, hoyIso, opts, avisoDias) {
  var o = opts || {};
  var sec = Utl_texto(o.sector).toUpperCase();
  var term = Utl_texto(o.termino).trim();
  function numPos(v, def) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n >= 0 ? n : def;
  }
  var inicio = numPos(o.inicio, 0);
  var limite = numPos(o.limite, 25);
  if (!(limite > 0)) limite = 25;
  if (limite > 100) limite = 100;

  var lista = pacientes || [];
  var filtrados;
  if (sec && term) {
    filtrados = lista.filter(function (p) {
      return Utl_texto(p.SECTOR).toUpperCase() === sec && Control_coincideTermino(p, term);
    });
  } else if (sec) {
    filtrados = lista.filter(function (p) {
      return Utl_texto(p.SECTOR).toUpperCase() === sec;
    });
  } else if (term) {
    filtrados = lista.filter(function (p) { return Control_coincideTermino(p, term); });
  } else {
    filtrados = lista;
  }

  var res = Control_filasPanel(filtrados, freqConfig, hoyIso, avisoDias);
  var total = res.filas.length;
  var desde = inicio < total ? inicio : total;
  var pedazo = res.filas.slice(desde, inicio + limite);
  var hasta = desde + pedazo.length;
  return { filas: pedazo, total: total, desde: desde, hasta: hasta,
           inicio: desde, limite: limite, sectores: res.sectores };
}

/** PURA: ¿el término coincide con ID interno, RUT o nombre? Clave normalizada
 *  (sin tildes, sin puntos/guiones, sin mayúsculas) → el RUT '12.345.678-9'
 *  se encuentra escribiendo '123456789' y el nombre 'Gónzalez' con 'gonzalez'. */
function Control_coincideTermino(p, termino) {
  var q = Utl_claveAlnum(termino);
  if (q === '') return true;
  var clave = Utl_claveAlnum(
    Utl_texto(p.ID_INTERNO) + ' ' + Utl_texto(p.RUT) + ' ' + Utl_texto(p.NOMBRE));
  return clave.indexOf(q) !== -1;
}

/** Escribe PRÓXIMO_CONTROL derivado (idempotente: solo si cambia y deja de
 *  quedar vacío). Recalculo por persona según su estratificación + CONFIG. */
function Control_recalcularTodos() {
  var t0 = new Date();
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(HOJAS.PACIENTES);
  if (!hoja || hoja.getLastRow() < 2) return { ok: true, total: 0, cambios: 0, tiempo: 0 };
  var pacientes = Modelo_leerPacientes();
  var freq = Control_leerFrecuencia();
  var colProxCtrl = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf('PROXIMO_CONTROL') + 1;
  var cambios = 0;
  var pendientes = []; // {fila, valor}
  pacientes.forEach(function (p, i) {
    var n = Control_calcularProximo(p.ULTIMO_CONTROL, p.ESTRATIFICACION, freq);
    if (n && n !== Utl_texto(p.PROXIMO_CONTROL)) {
      pendientes.push({ fila: 2 + i, valor: n });
    }
  });
  if (pendientes.length) {
    pendientes.forEach(function (x) { hoja.getRange(x.fila, colProxCtrl).setValue(x.valor); cambios++; });
  }
  var ms = new Date() - t0;
  Log_info('Control', 'recalcularTodos', 'total=' + pacientes.length +
    ' cambios=' + cambios + ' frecuencia=' + JSON.stringify(freq), null, ms);
  Log_flush();
  return { ok: true, total: pacientes.length, cambios: cambios, frecuencia: freq, tiempo: ms };
}
