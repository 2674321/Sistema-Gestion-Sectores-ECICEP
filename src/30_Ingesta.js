// ---------------------------------------------------------------------------
// 30_Ingesta.js — Puerta de ingreso única (adaptadores de transporte).
//
// v253 (DEC-107): Google Forms es el canal principal y durable de captura.
// Este módulo aísla el TRANSPORTE de lo que envía datos hacia el pipeline V2
// (26_Captura.js). Un "transporte" es la vía por la que llega la captura
// (Form Google, Web App legacy); el pipeline es UNO solo y siempre el mismo.
//
// Reglas:
//   * CapturaIngress_providerActivo()  → canal operativo (GOOGLE_FORMS).
//   * CapturaIngress_providerReservado() → transportes reconocidos pero NO
//     operativos (WEBAPP_LEGACY queda reservado por compatibilidad histórica).
//   * CapturaIngress_enviar(payload, ctx, provider) → orquesta: setea el
//     transporte en ctx (captureProvider / transportId) y delega al pipeline V2.
//     Un provider desconocido NO escribe nada: FALLBACK_PROVIDER_DISABLED.
//   * CapturaIngress_adapterForms(respuesta, opciones) → PURA: convierte una
//     respuesta del Form (respuesta + campos CANÓNICOS) en el payload V2.
//
// El captureId es DETERMINISTA: Cp4-<sha256hex('GOOGLE_FORMS|formId|responseId')>.
// El sha256 es implementación JS pura (FIPS 180-4) → mismo resultado dentro de
// Apps Script y en node (tests), sin depender de Utilities.computeDigest.
// ---------------------------------------------------------------------------

/** Transportes conocidos. GOOGLE_FORMS_FUTURE (histórico) es alias de GOOGLE_FORMS. */
var CAPTURA_INGESTA_PROVIDERS = {
  WEBAPP_LEGACY: 'WEBAPP_LEGACY',
  GOOGLE_FORMS: 'GOOGLE_FORMS'
};

/** Transportes reconocidos pero NO operativos (reserva de nombres). */
var CAPTURA_INGESTA_RESERVADOS = [CAPTURA_INGESTA_PROVIDERS.WEBAPP_LEGACY];

/** Normaliza alias históricos del transportador al nombre canónico. */
function CapturaIngress_normalizarProvider(nombre) {
  var n = Utl_texto(nombre).toUpperCase().replace(/-/g, '_');
  if (n === 'WEBAPP') return CAPTURA_INGESTA_PROVIDERS.WEBAPP_LEGACY;
  if (n === 'GOOGLE_FORMS_FUTURE') return CAPTURA_INGESTA_PROVIDERS.GOOGLE_FORMS;
  return n;
}

/** Transporte operativo del sistema (v253): Google Forms. */
function CapturaIngress_providerActivo() {
  return CAPTURA_INGESTA_PROVIDERS.GOOGLE_FORMS;
}

/**
 * Un transporte está "reservado" cuando existe su nombre pero NO es el canal
 * operativo (p. ej. la Web App legacy, conservada como landing y diagnóstico).
 */
function CapturaIngress_providerReservado(nombre) {
  var n = CapturaIngress_normalizarProvider(nombre);
  return CAPTURA_INGESTA_RESERVADOS.indexOf(n) !== -1;
}

/** PURA: sha256 hex en JS puro (FIPS 180-4). UTF-8 vía encodeURIComponent. */
function CapturaIngress_sha256Hex_(input) {
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var s = decodeURIComponent(encodeURIComponent(String(input)));
  var n = s.length;
  var bits = n * 8;
  var ml = [];
  for (var i = 0; i < n; i++) ml[i] = s.charCodeAt(i);
  ml[n] = 0x80;
  while (ml.length % 64 !== 56) ml.push(0);
  var hiBits = Math.floor(bits / 4294967296);
  var loBits = (bits & 0xFFFFFFFF) >>> 0;
  ml.push(hiBits >>> 0); ml.push(loBits >>> 0);
  function rotr(x, c) { return (x >>> c) | (x << (32 - c)); }
  function add(a, b) { a = a >>> 0; b = b >>> 0; return (a + b) >>> 0; }
  function ws(c) { return (c << 24) | ((c & 0xFF00) << 8) | ((c >> 8) & 0xFF00) | (c >>> 24); }
  for (var off = 0; off < ml.length; off += 64) {
    var w = [];
    for (var t = 0; t < 16; t++) {
      var idx = off + t * 4;
      w[t] = ws(((ml[idx] & 0xff) << 24) | ((ml[idx + 1] & 0xff) << 16) | ((ml[idx + 2] & 0xff) << 8) | (ml[idx + 3] & 0xff)) >>> 0;
    }
    for (t = 16; t < 64; t++) {
      var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = add(w[t - 16], add(s0, add(w[t - 7], s1)));
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (t = 0; t < 64; t++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var temp1 = add(h, add(S1, add(ch, add(K[t], w[t]))));
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = add(S0, maj);
      h = g; g = f; f = e; e = add(d, temp1);
      d = c; c = b; b = a; a = add(temp1, temp2);
    }
    H[0] = add(H[0], a); H[1] = add(H[1], b); H[2] = add(H[2], c); H[3] = add(H[3], d);
    H[4] = add(H[4], e); H[5] = add(H[5], f); H[6] = add(H[6], g); H[7] = add(H[7], h);
  }
  function hex(x) {
    var s = '';
    for (var j = 7; j >= 0; j--) s += ((x >>> (j * 4)) & 0x0f).toString(16);
    return s;
  }
  var out = '';
  for (var q = 0; q < 8; q++) out += hex(H[q]);
  return out;
}

/**
 * PURA: captureId determinista del transporte Google Forms.
 * Cp4-<32 hex> = sha256 de 'GOOGLE_FORMS|<formId>|<responseId>'.
 */
function CapturaIngress_captureId_(formId, responseId) {
  var f = Utl_texto(formId);
  var r = Utl_texto(responseId);
  if (!f || !r) return '';
  var h = CapturaIngress_sha256Hex_('GOOGLE_FORMS|' + f + '|' + r); h = h.substring(0,32); return 'Cp4-' + h;
}

/** PURA: URL del respondedor del Form vigente (ScriptProperties o ''). */
function CapturaIngress_urlForm_() {
  try {
    if (typeof PropertiesService !== 'undefined') {
      var v = PropertiesService.getScriptProperties().getProperty('GOOGLE_FORM_URL');
      if (v && typeof v === 'string' && v.indexOf('forms.gle') === -1 && v.indexOf('/viewform') === -1 && v.indexOf('https://') === 0) return v;
      if (v && typeof v === 'string') return v;
    }
  } catch (e) { /* sin PropertiesService (node) */ }
  return '';
}

/** Acceso DRS real de GAS (inyectable). Lee la ficha SOLO para actualizarDatos. */
function CapturaIngress_ctx(acceso) {
  var c = (typeof Captura_v2_ctx === 'function') ? Captura_v2_ctx(acceso) : {};
  if (!c.captureProvider) c.captureProvider = CapturaIngress_providerActivo();
  return c;
}

/**
 * Envío puerta de entrada: fija el transporte en ctx y delega al pipeline V2.
 * - 'GOOGLE_FORMS'  → ctx.captureProvider='GOOGLE_FORMS'; transportId de ctx.
 * - 'WEBAPP_LEGACY' → ctx.captureProvider='WEBAPP_LEGACY' (canal retirado:
 *   WebApp_capturarEnviar ya rechaza; aquí solo como orquestador/proveedor).
 * - Desconocido     → FALLBACK_PROVIDER_DISABLED, sin escritura.
 */
function CapturaIngress_enviar(payload, ctx, provider) {
  var p = CapturaIngress_normalizarProvider(provider || CapturaIngress_providerActivo());
  if (p !== CAPTURA_INGESTA_PROVIDERS.GOOGLE_FORMS && p !== CAPTURA_INGESTA_PROVIDERS.WEBAPP_LEGACY) {
    return { ok: false, error: 'FALLBACK_PROVIDER_DISABLED', escrito: 0 };
  }
  if (typeof Captura_v2_enviar !== 'function') {
    return { ok: false, error: 'INGESTA_PIPELINE_NO_DISPONIBLE', escrito: 0 };
  }
  var c = ctx || CapturaIngress_ctx();
  c.captureProvider = p;
  if (p === CAPTURA_INGESTA_PROVIDERS.GOOGLE_FORMS) c.transportId = c.transportId || c.transportResponseId || '';
  return Captura_v2_enviar(payload, c);
}

/** Valores aceptados por cada clave del Form (validación leve del adaptador). */
var CAPTURA_FORMS_ENUM = {
  SEXO: ['M', 'F', 'OTRO'],
  SECTOR: ['AMARILLO', 'NARANJO', 'VERDE'],
  ESTRATIFICACION: ['G1', 'G2', 'G3', ''],
  SALUD_MENTAL: ['SI', 'NO']
};

/** Normaliza una clave canónica de campo del Form en la clave del contrato. */
function CapturaIngress_campoContrato_(clave) {
  var c = Utl_texto(clave).toUpperCase();
  var mapa = { RUT: 'rut', NOMBRE: 'nombre', SEXO: 'sexo', FECHA_NACIMIENTO: 'fechaNacimiento',
    SECTOR: 'sector', ESTRATIFICACION: 'estratificacion', TELEFONOS: 'telefonos',
    FECHA_EVENTO: 'fechaEvento', PROFESIONAL: 'profesional', PROFESIONAL2: 'profesionalSecundario',
    OBSERVACIONES: 'observaciones', SALUD_MENTAL: 'saludMental', TELEFONO_OBS: 'telefonoObs' };
  var k = mapa[c];
  return k || '';
}

/** PURA: fecha de operación del canal (opciones.hoy > Form_hoy). */
function CapturaIngress_hoy_(opciones) {
  if (opciones && opciones.hoy) return opciones.hoy;
  try {
    if (typeof Captura_v2_fechaOperacion === 'function') return Captura_v2_fechaOperacion({});
  } catch (e) { /* node sin dependencias */ }
  try {
    return Form_hoy({});
  } catch (e) { /* sin Form_hoy */ }
  return '';
}

/**
 * PURA: adaptador de respuesta del Form → payload V2.
 * @param {Object} respuesta {formId, responseId, timestamp, accion, campos}
 *   campos → claves CANÓNICAS de FORM_RESPUESTAS (RUT, NOMBRE, ...).
 * @param {Object} [opciones] {catalogo, hoy, leerPacientes, buscarCedente}
 * @returns {ok, captureId, payload, accion, errores, meta}
 *   meta = {provider:'GOOGLE_FORMS', transportResponseId, formId}
 */
function CapturaIngress_adapterForms(respuesta, opciones) {
  opciones = opciones || {};
  var err = [];
  var resp = respuesta || {};
  var campos = (resp.campos && typeof resp.campos === 'object') ? resp.campos : {};
  var formId = Utl_texto(resp.formId);
  var responseId = Utl_texto(resp.responseId);
  var captureId = CapturaIngress_captureId_(formId, responseId);

  var accionRaw = Utl_texto(resp.accion).toLowerCase().replace(/[^a-zA-Z]/g, '');
  var mapaAcc = {
    nuevoingreso: 'nuevoIngreso',
    nuevosingreso: 'nuevoIngreso',
    registrarcontrol: 'registrarControl',
    registrarseguimiento: 'registrarSeguimiento',
    actualizardatos: 'actualizarDatos'
  };
  var accion = mapaAcc[accionRaw] || mapaAcc[accionRaw.replace('nuevo','nuevo')] || '';
  if (!accion) accion = mapaAcc[accionRaw.replace('registro','registrar').replace('control','control').replace('seguimiento','seguimiento')] || '';
  if (accion !== 'nuevoIngreso' && accion !== 'registrarControl' && accion !== 'registrarSeguimiento' && accion !== 'actualizarDatos') {
    return { ok: false, captureId: captureId, payload: null, accion: accionRaw, errores: [{ codigo: 'ACCION_INVALIDA', mensaje: 'La acción del Form no es válida: ' + accionRaw }], meta: { provider: 'GOOGLE_FORMS', transportResponseId: responseId, formId: formId } };
  }
  if (!captureId) {
    err.push({ codigo: 'TRANSPORTE_INCOMPLETO', mensaje: 'Faltan formId o responseId' });
    var e1 = err[0]||{}; return { ok: false, captureId: '', payload: null, accion: accion, errores: err, error: e1.codigo||'FALLBACK_PROVIDER_DISABLED', escrito: 0, meta: { provider: 'GOOGLE_FORMS', transportResponseId: responseId, formId: formId } };
  }

  // Enums del Form → valor canónico (mayúsculas estrictas).
  var val = function (k) {
    var v = campos[k];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') v = String(v);
    return v.trim();
  };
  var normCampo = function (k) {
    var v = val(k);
    var map = CAPTURA_FORMS_ENUM[k];
    if (map) {
      var up = v.toUpperCase();
      if (map.indexOf(up) === -1 && up !== '') { err.push({ codigo: 'ENUM_INVALIDO', campo: k, mensaje: 'Valor admitido: ' + map.join(', ') }); return ''; }
      return up;
    }
    return v;
  };

  var payload = { captureId: captureId, accion: accion };
  var rutForm = normCampo('RUT');
  payload.rut = rutForm;
  payload.profesional = normCampo('PROFESIONAL');
  payload.profesionalSecundario = normCampo('PROFESIONAL2');
  payload.observaciones = val('OBSERVACIONES');

  if (accion === 'nuevoIngreso') {
    payload.nombre = val('NOMBRE');
    payload.sexo = normCampo('SEXO');
    payload.fechaNacimiento = val('FECHA_NACIMIENTO');
    payload.sector = normCampo('SECTOR');
    payload.fechaIngreso = val('FECHA_INGRESO') || CapturaIngress_hoy_(opciones);
    var estrat = normCampo('ESTRATIFICACION');
    if (estrat) payload.estratificacion = estrat;
    if (val('TELEFONOS')) payload.telefonos = val('TELEFONOS');
  } else if (accion === 'registrarControl' || accion === 'registrarSeguimiento') {
    payload.fechaEvento = val('FECHA_EVENTO');
  } else if (accion === 'actualizarDatos') {
    // El payload de actualización NO lleva telefonos/proximoControl top-level
    // (el validador los rechazaría); van dentro de actualizacion.campos.
    var ed = CapturaIngress_edicionDesdeForma_(accion, campos, rutForm, opciones, err);
    if (!ed) return { ok: false, captureId: captureId, payload: null, accion: accion, errores: err, meta: { provider: 'GOOGLE_FORMS', transportResponseId: responseId, formId: formId } };
    payload.actualizacion = ed;
  }

  if (err.length) {
    var e0 = err[0] || {};
    return { ok: false, captureId: captureId, payload: null, accion: accion, errores: err, error: e0.codigo || 'FALLBACK_PROVIDER_DISABLED', escrito: 0, meta: { provider: 'GOOGLE_FORMS', transportResponseId: responseId, formId: formId } };
  }

  if (typeof Captura_v2_validar === 'function') {
    var v = Captura_v2_validar(payload, { catalogo: opciones.catalogo });
    if (!v.ok) {
      return { ok: false, captureId: captureId, payload: null, accion: accion, errores: v.errores, meta: { provider: 'GOOGLE_FORMS', transportResponseId: responseId, formId: formId } };
    }
    payload = v.normalizado;
  }
  return { ok: true, captureId: captureId, payload: payload, accion: accion, errores: [], error: undefined, escrito: 0, meta: { provider: 'GOOGLE_FORMS', transportResponseId: responseId, formId: formId } };
}

/**
 * PURA/DRS: construye `actualizacion` (contrato V4 §0.1) para actualizarDatos.
 * Lee la ficha vigente SOLO en modo lectura (Modelo_leerPacientes.toString) para
 * obtener `anterior`; ESTRATIFICACION queda fuera porque no está en la allowlist
 * de edición (CAPTURA_EDICION_CAMPOS del backend 29).
 */
function CapturaIngress_edicionDesdeForma_(accion, campos, rutForm, opciones, err) {
  opciones = opciones || {};
  var nr = { estado: 'OK', rut: rutForm };
  if (!rutForm) { err.push({ codigo: 'RUT_INVALIDO', campo: 'rut', mensaje: 'El RUT es obligatorio para actualizar la ficha' }); return null; }
  if (typeof Norm_normalizarRut === 'function') { nr = Norm_normalizarRut(rutForm); }
  if (!nr || nr.estado !== 'OK') { err.push({ codigo: 'RUT_INVALIDO', campo: 'rut', mensaje: 'RUT con DV incorrecto o formato inválido' }); return null; }
  var rut = nr.rut;

  var leer = opciones.leerPacientes;
  if (!leer && typeof Modelo_leerPacientes === 'function') leer = Modelo_leerPacientes;
  if (!leer || typeof leer !== 'function') { err.push({ codigo: 'FICHA_NO_DISPONIBLE', mensaje: 'No se pudo leer la ficha vigente' }); return null; }

  var pacientes;
  try { pacientes = leer() || []; } catch (e) { pacientes = []; }
  if (!pacientes.length) { err.push({ codigo: 'FICHA_NO_DISPONIBLE', mensaje: 'No hay ficha para el RUT indicado' }); return null; }
  var hit = null;
  for (var i = 0; i < pacientes.length; i++) {
    var p = pacientes[i];
    var pr = (p && (p.RUT || p.rut)) ? String(p.RUT || p.rut).trim().toUpperCase() : '';
    try { if (typeof Norm_normalizarRut === 'function') { var pn = Norm_normalizarRut(pr); pr = pn.rut || pr; } } catch (e2) { /* mantener */ }
    if (pr === rut) { if (hit) { hit = -1; break; } hit = p; }
  }
  if (hit === -1 || !hit) { err.push({ codigo: 'FICHA_NO_DISPONIBLE', mensaje: 'El RUT debe pertenecer a una única ficha vigente' }); return null; }

  var texto = function (c) {
    var v = hit[c];
    if (v === undefined || v === null) return '';
    if (v instanceof Date) { try { return v.toISOString().slice(0, 10); } catch (e3) { return ''; } }
    return String(v).trim();
  };

  var campos2 = {};
  var que = ['NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS', 'SECTOR', 'OBSERVACIONES', 'SALUD_MENTAL'];
  for (var j = 0; j < que.length; j++) {
    var kc = que[j];
    var claveContrato = CapturaIngress_campoContrato_(kc);
    if (!claveContrato) continue;
    var nuevoValor = (campos[kc] === undefined || campos[kc] === null) ? '' : String(campos[kc]).trim();
    if (kc === 'SEXO' || kc === 'SALUD_MENTAL' || kc === 'SECTOR') nuevoValor = nuevoValor.toUpperCase();
    if (!nuevoValor) continue;
    var anterior = texto(kc);
    campos2[claveContrato] = { anterior: anterior, valor: nuevoValor };
  }
  if (!Object.keys(campos2).length) {
    err.push({ codigo: 'CAMPO_OBLIGATORIO_AUSENTE', campo: 'actualizacion', mensaje: 'La actualización requiere al menos un campo editado' });
    return null;
  }
  return { id: texto('ID_INTERNO') || texto('id'), rutOriginal: rut, campos: campos2, atenciones: [] };
}