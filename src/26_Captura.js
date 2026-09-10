/**
 * ECICEP — BACKEND DE CAPTURA V2 (docs/CONTRATO_CAPTURA_V2.md, NORMATIVO).
 *
 * Fase 3: backend de captura del contrato V2, aislado del frontend. Este
 * archivo es el ÚNICO punto de entrada del contrato de captura V2:
 *   - Núcleo puro (validación, idempotencia, estados, respuestas) sin I/O;
 *   - `ctx` inyectable para poder probar contra un registro en memoria;
 *   - ctx de GAS real que persiste en FORM_RESPUESTAS por ENCABEZADO y
 *     entrega al pipeline interno (TR-1/TR-2, §21);
 *   - entrypoints `WebApp_capturarEnviar` / `WebApp_capturarEstado`.
 *
 * No hereda el contrato previo (FORM_CONFIG / Form_capturarDesdeUI /
 * FORM| / UI-): esos nombres son implementación histórica. La captura V2
 * habla SOLO los nombres del §5/§6 (camelCase) y genera sus marcadores de
 * trazabilidad internamente (§25).
 *
 * Reglas inviolables aplicadas aquí (de AGENTS.md):
 *   - El contrato V2 es la única fuente; el código se adapta, jamás al revés.
 *   - Solo un entorno operativo (ECICEP en 00_Config.js); sin if(DEV/DEMO).
 *   - No se tocan los archivos del pipeline (12_Ingresos, 13_Eventos, ...);
 *     se REUTILIZAN sus funciones existentes para la entrega TR-2.
 *   - No hay segunda lógica de negocio: la entrega usa el pipeline actual.
 */

// ---------------------------------------------------------------------------
// Contrato V2 — vocabulario y matriz (esp. produccion; variables persistentes)
// ---------------------------------------------------------------------------

/** Definición estricta del contrato V2. Solo nombres del §5/§6 y §7. */
var CAPTURA_V2 = {
  /** Operaciones del payload §5. */
  OPERACIONES: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'],
  /** Mapeo canónico §5/§25: operación V2 → etiqueta histórica interna. */
  LEGACY: {
    'nuevoIngreso': 'NUEVO_INGRESO',
    'registrarControl': 'REGISTRAR_CONTROL',
    'registrarSeguimiento': 'REGISTRAR_SEGUIMIENTO',
    'actualizarDatos': 'ACTUALIZAR_DATOS'
  },
  /** Inverso de LEGACY (lectura histórica, §25). */
  V2: {
    'NUEVO_INGRESO': 'nuevoIngreso',
    'REGISTRAR_CONTROL': 'registrarControl',
    'REGISTRAR_SEGUIMIENTO': 'registrarSeguimiento',
    'ACTUALIZAR_DATOS': 'actualizarDatos'
  },
  /** Enums estrictas §9 (sin sinónimos en el payload). */
  SECTORES: ['AMARILLO', 'NARANJO', 'VERDE'],
  SEXOS: ['M', 'F', 'OTRO'],
  ESTRATIFICACIONES: ['G1', 'G2', 'G3'],
  /** Formato de captureId §12: `Cp2-` + 32 hex minúsculas. */
  RE_CAPTURE_ID: /^Cp2-[a-f0-9]{32}$/,
  /** Orden canónico de campos §6 (define la forma canónica §11). */
  CAMPOS: [
    'captureId', 'accion', 'rut', 'nombre', 'sexo', 'fechaNacimiento', 'sector',
    'fechaIngreso', 'estratificacion', 'telefonos', 'fechaEvento', 'profesional',
    'profesionalSecundario', 'observaciones', 'confirmarNuevoPaciente'
  ],
  /** Tipo JSON declarado §7. */
  CAMPO_TIPO: {
    captureId: 'string', accion: 'string', rut: 'string', nombre: 'string',
    sexo: 'string', fechaNacimiento: 'string', sector: 'string',
    fechaIngreso: 'string', estratificacion: 'string', telefonos: 'string', fechaEvento: 'string',
    profesional: 'string', profesionalSecundario: 'string',
    observaciones: 'string', confirmarNuevoPaciente: 'boolean'
  },
  /** Matriz REQ/OPC/NP §5.1. */
  MATRIZ: {
    captureId: { REQ: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'], OPC: [] },
    accion: { REQ: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'], OPC: [] },
    rut: { REQ: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'], OPC: [] },
    nombre: { REQ: ['nuevoIngreso'], OPC: [] },
    sexo: { REQ: [], OPC: ['nuevoIngreso'] },
    fechaNacimiento: { REQ: ['nuevoIngreso'], OPC: [] },
    sector: { REQ: ['nuevoIngreso'], OPC: [] },
    fechaIngreso: { REQ: ['nuevoIngreso'], OPC: [] },
    estratificacion: { REQ: [], OPC: ['nuevoIngreso'] },
    telefonos: { REQ: [], OPC: ['nuevoIngreso', 'actualizarDatos'] },
    fechaEvento: { REQ: ['registrarControl', 'registrarSeguimiento'], OPC: [] },
    profesional: { REQ: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'], OPC: [] },
    profesionalSecundario: { REQ: [], OPC: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'] },
    observaciones: { REQ: [], OPC: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'] },
    confirmarNuevoPaciente: { REQ: [], OPC: ['nuevoIngreso'] }
  },
  /** Nombres internos/generados por el backend §6.1 (no pueden venir del cliente). */
  INTERNOS: [
    'CAPTUREID', 'RESPONSE_ID', 'RESPONSEID', 'FECHA_FORMS', 'FORM_VERSION',
    'USUARIO', 'TRAZA_CRUDA', 'INGRESO_HOJA', 'INGRESO_FILA', 'REINTENTOS',
    'ESTADO', 'MOTIVO', 'ID_INTERNO', 'ID_EVENTO', 'FECHA_PROCESO'
  ],
  /** Nombres del contrato previo (§25): se rechazan como entrada V2. */
  LEGACY_CAMPOS: [
    'ACCION', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'SECTOR',
    'ESTRATIFICACION', 'TELEFONOS', 'FECHA_EVENTO', 'PROFESIONAL',
    'PROFESIONAL2', 'OBSERVACIONES', 'CAMPOS'
  ],
  /** Estados de captura §18.1. */
  ESTADOS: {
    RECIBIDO: 'RECIBIDO', VALIDANDO: 'VALIDANDO', VALIDO: 'VALIDO',
    PROCESADO: 'PROCESADO', REQUIERE_REVISION: 'REQUIERE_REVISION', ERROR: 'ERROR'
  },
  /** Estados que NO se reinician (§19, §23). */
  TERMINALES: ['PROCESADO', 'REQUIERE_REVISION'],
  /** Estados reprocesables por reintento técnico A2 (§13, §23). */
  REINTENTABLES: ['RECIBIDO', 'VALIDANDO', 'VALIDO', 'ERROR']
};

/**
 * Estados reiniciables por reprocesamiento administrativo §23 (nunca PROCESADO).
 * Incluye VALIDO (transitorio §18.1) para evitar estados colgados; es un
 * superconjunto seguro de la lista explícita del §23.
 */
var CAPTURA_V2_REPROCESABLES = ['ERROR', 'REQUIERE_REVISION', 'RECIBIDO', 'VALIDANDO', 'VALIDO'];

/**
 * Estados retomables por la RETOMA V2 (Captura_v2_retomarRegistro, S1).
 * Re-entrega automática por el procesador V2 de pendientes NO terminales.
 * Excluye REQUIERE_REVISION (requiere decisión humana) y PROCESADO (terminal);
 * ambas exclusiones son deliberadas (ver CONTRATO_DATOS.md §retoma).
 */
var CAPTURA_V2_RETOMABLES = ['ERROR', 'RECIBIDO', 'VALIDANDO', 'VALIDO'];

// ---------------------------------------------------------------------------
// Errores (catálogo §20 — prohibido inventar códigos)
// ---------------------------------------------------------------------------

/** PURA: construye un error de captura §17. */
function Captura_v2_error(codigo, campo, mensaje, detalle) {
  return { codigo: codigo, campo: (campo === undefined ? null : campo), mensaje: mensaje || '', detalle: (detalle === undefined ? '' : detalle) };
}

/** §16.2 — error de entrega: conserva el mensaje estable y agrega el MOTIVO
 * real del intento para diagnóstico operativo, sin cambiar el contrato (ok:false). */
function Captura_v2_errorEntrega(motivo) {
  return Captura_v2_error('ERROR_INTERNO', null,
    'El procesamiento del envío falló; reintentable' + (motivo ? ' (' + motivo + ')' : ''), '§16.2');
}

/** PURA: ¿es una clave interna ó legacy (prohibida en el payload §6.1/§25)? */
function Captura_v2_esInterna(k) {
  if (CAPTURA_V2.INTERNOS.indexOf(k) !== -1) return true;
  if (CAPTURA_V2.LEGACY_CAMPOS.indexOf(k) !== -1) return true;
  return k.indexOf('FORM|') === 0 || k.indexOf('UI-') === 0;
}

/** PURA: normaliza un nombre de profesional (NOMBRE del catálogo §9). */
function Captura_v2_normalizarProfesional(v) {
  return Utl_colapsarEspacios(Utl_sinTildes(String(v === undefined || v === null ? '' : v).toUpperCase())).trim();
}

/** PURA: catálogo PROFESIONALES normalizado a la clave de §9 (acepta objetos o nombres). */
function Captura_v2_catalogoNormalizado(lista) {
  if (!lista) return [];
  if (!Array.isArray(lista)) lista = [lista];
  return lista.map(function (it) {
    if (typeof it === 'string') return Captura_v2_normalizarProfesional(it);
    var n = it && (it.NOMBRE_CANONICO || it.NOMBRE || it.CODIGO);
    return Captura_v2_normalizarProfesional(n || '');
  });
}

/** PURA: valida una fecha ISO estricta en rango (§10), sin sinónimos de formato. */
function Captura_v2_validarIsoFecha(raw, rango) {
  var texto = Utl_colapsarEspacios(Utl_texto(raw));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return { ok: false, detalle: 'Solo se admite formato ISO estricto yyyy-MM-dd' };
  }
  var nr = Norm_normalizarFecha(texto, rango || {});
  if (nr.estado !== 'VALIDA') return { ok: false, detalle: nr.detalle || 'Fecha fuera de rango plausible' };
  return { ok: true, iso: nr.iso };
}

/** PURA: forma canónica del payload §11 (orden §6, solo campos que aplican). */
function Captura_v2_canonica(norm) {
  var accion = (norm && norm.accion) || '';
  var partes = [];
  for (var i = 0; i < CAPTURA_V2.CAMPOS.length; i++) {
    var c = CAPTURA_V2.CAMPOS[i];
    if (c === 'accion') continue;
    var m = CAPTURA_V2.MATRIZ[c];
    var aplica = m.REQ.indexOf(accion) !== -1 || m.OPC.indexOf(accion) !== -1;
    if (!aplica) continue;
    var v = norm[c];
    if (v === undefined || v === null) v = '';
    if (c === 'confirmarNuevoPaciente') v = v ? 'true' : 'false';
    partes.push(c + '=' + String(v));
  }
  return accion + '|' + partes.join('|');
}

// ---------------------------------------------------------------------------
// Validación del payload (capas §14, en el orden §17)
// ---------------------------------------------------------------------------

/**
 * PURA: valida el payload V2 capa por capa (sintaxis → estructural → semántica).
 * @returns {ok, errores, normalizado, accion}
 */
function Captura_v2_validar(payload, opciones) {
  opciones = opciones || {};
  var catalogoNorm = Captura_v2_catalogoNormalizado(opciones.catalogo);
  var eSint = [], eClaves = [], eTipos = [], eOblig = [], eSem = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      errores: [Captura_v2_error('SINTAXIS_INVALIDA', null, 'El payload debe ser un objeto JSON', '§17')],
      normalizado: null, accion: ''
    };
  }

  // Capa 1 — sintaxis
  var captureId = payload.captureId;
  if (typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    eSint.push(Captura_v2_error('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp2- seguido de 32 caracteres hex minúsculos', '§12'));
  }

  // Capa 2 — estructural: accion (operación)
  var accion = payload.accion;
  var accionValida = typeof accion === 'string' && CAPTURA_V2.OPERACIONES.indexOf(accion) !== -1;
  if (!accionValida) {
    if (typeof accion !== 'string') {
      eOblig.push(Captura_v2_error('CAMPO_OBLIGATORIO_AUSENTE', 'accion', 'accion es obligatoria', '§8'));
    } else {
      eClaves.push(Captura_v2_error('ACCION_INVALIDA', 'accion', 'Operación no soportada por el contrato V2', '§9'));
    }
    var errs = eSint.concat(eClaves).concat(eTipos).concat(eOblig).concat(eSem);
    return { ok: errs.length === 0, errores: errs, normalizado: null, accion: Utl_texto(accion) };
  }

  // Capa 2 — claves exactas §6.1
  var claves = Object.keys(payload);
  for (var i = 0; i < claves.length; i++) {
    var k = claves[i];
    if (CAPTURA_V2.CAMPOS.indexOf(k) !== -1) continue;
    if (Captura_v2_esInterna(k)) {
      eClaves.push(Captura_v2_error('CAMPO_NO_PERMITIDO', k,
        'Campo interno o generado por el backend: no puede venir en el payload', '§6.1'));
    } else {
      eClaves.push(Captura_v2_error('CAMPO_DESCONOCIDO', k, 'Campo no definido en el contrato de captura V2', '§6'));
    }
  }

  var norm = {
    captureId: captureId, accion: accion,
    rut: '', nombre: '', sexo: '', fechaNacimiento: '', sector: '',
    fechaIngreso: '', estratificacion: '', telefonos: '', fechaEvento: '', profesional: '',
    profesionalSecundario: '', observaciones: '', confirmarNuevoPaciente: false
  };

  // Capa 2 (tipos + obligatoriedad) y Capa 3 (semántica) por campo §5.1
  for (var j = 0; j < CAPTURA_V2.CAMPOS.length; j++) {
    var campo = CAPTURA_V2.CAMPOS[j];
    if (campo === 'accion') continue;
    var presente = Object.prototype.hasOwnProperty.call(payload, campo);
    var valor = payload[campo];
    var indM = CAPTURA_V2.MATRIZ[campo];

    // NP para esta operación §5.1
    if (presente && indM.REQ.indexOf(accion) === -1 && indM.OPC.indexOf(accion) === -1) {
      eClaves.push(Captura_v2_error('CAMPO_NO_PERMITIDO', campo, 'No permitido para la operación ' + accion, '§5.1'));
      continue;
    }

    // Obligatorio §8
    if (indM.REQ.indexOf(accion) !== -1 && (valor === undefined || valor === null || valor === '')) {
      eOblig.push(Captura_v2_error('CAMPO_OBLIGATORIO_AUSENTE', campo, 'El campo es obligatorio para ' + accion, '§8'));
      continue;
    }

    // Opcional ausente §11
    if (!presente || valor === null || valor === '') {
      if (campo === 'confirmarNuevoPaciente') norm.confirmarNuevoPaciente = false;
      continue;
    }

    // Tipo §7
    var tipo = CAPTURA_V2.CAMPO_TIPO[campo];
    if (tipo === 'boolean') {
      if (typeof valor !== 'boolean') {
        eTipos.push(Captura_v2_error('TIPO_INCORRECTO', campo, 'Debe ser booleano (true/false)', '§7'));
        continue;
      }
      norm.confirmarNuevoPaciente = valor;
      continue;
    }
    if (typeof valor !== 'string') {
      eTipos.push(Captura_v2_error('TIPO_INCORRECTO', campo, 'Debe ser texto', '§7'));
      continue;
    }

    // Semántica §9/§10/§14.3
    if (campo === 'rut') {
      var nr = Norm_normalizarRut(valor);
      if (nr.estado !== 'OK') {
        eSem.push(Captura_v2_error('RUT_INVALIDO', 'rut', 'RUT con DV incorrecto o formato inválido', '§14.3'));
      } else {
        norm.rut = nr.rut;
      }
    } else if (campo === 'nombre') {
      norm.nombre = Utl_colapsarEspacios(String(valor)).trim();
    } else if (campo === 'sexo') {
      if (CAPTURA_V2.SEXOS.indexOf(valor) === -1) {
        eSem.push(Captura_v2_error('ENUM_INVALIDO', 'sexo', 'Valor admitido: M, F u OTRO', '§9'));
      } else {
        norm.sexo = valor;
      }
    } else if (campo === 'fechaNacimiento') {
      var rNac = Captura_v2_validarIsoFecha(valor, { min: CFG_FECHAS.ANO_MIN_NACIMIENTO, max: CFG_FECHAS.ANO_MAX });
      if (!rNac.ok) {
        eSem.push(Captura_v2_error('FECHA_INVALIDA', 'fechaNacimiento', 'Fecha inválida o fuera del rango 1900-2040', rNac.detalle));
      } else {
        norm.fechaNacimiento = rNac.iso;
      }
    } else if (campo === 'sector') {
      if (CAPTURA_V2.SECTORES.indexOf(valor) === -1) {
        eSem.push(Captura_v2_error('ENUM_INVALIDO', 'sector', 'Valor admitido: AMARILLO, NARANJO o VERDE', '§9'));
      } else {
        norm.sector = valor;
      }
    } else if (campo === 'fechaIngreso') {
      var rIng = Captura_v2_validarIsoFecha(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!rIng.ok) {
        eSem.push(Captura_v2_error('FECHA_INVALIDA', 'fechaIngreso', 'Fecha inválida o fuera del rango 2015-2040', rIng.detalle));
      } else {
        norm.fechaIngreso = rIng.iso;
      }
    } else if (campo === 'estratificacion') {
      if (CAPTURA_V2.ESTRATIFICACIONES.indexOf(valor) === -1) {
        eSem.push(Captura_v2_error('ENUM_INVALIDO', 'estratificacion', 'Valor admitido: G1, G2 o G3', '§9'));
      } else {
        norm.estratificacion = valor;
      }
    } else if (campo === 'telefonos') {
      var nt = Norm_normalizarTelefono(valor);
      norm.telefonos = (nt && nt.telefonos && nt.telefonos.length) ? nt.telefonos.join('/') : '';
    } else if (campo === 'fechaEvento') {
      var rEv = Captura_v2_validarIsoFecha(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!rEv.ok) {
        eSem.push(Captura_v2_error('FECHA_INVALIDA', 'fechaEvento', 'Fecha inválida o fuera del rango 2015-2040', rEv.detalle));
      } else {
        norm.fechaEvento = rEv.iso;
      }
    } else if (campo === 'profesional' || campo === 'profesionalSecundario') {
      var ppi = Captura_v2_normalizarProfesional(valor);
      var esSecundario = (campo === 'profesionalSecundario');
      if (esSecundario && ppi && ppi === Captura_v2_normalizarProfesional(norm.profesional)) {
        eSem.push(Captura_v2_error('CAMPO_INVALIDO', 'profesionalSecundario', 'Debe ser distinto del profesional que registra', '§14.3'));
      } else if (catalogoNorm.length && catalogoNorm.indexOf(ppi) === -1) {
        eSem.push(Captura_v2_error('ENUM_INVALIDO', campo, 'Debe ser un NOMBRE del catálogo PROFESIONALES', '§9'));
      } else {
        norm[esSecundario ? 'profesionalSecundario' : 'profesional'] = Utl_colapsarEspacios(String(valor)).trim();
      }
    } else if (campo === 'observaciones') {
      norm.observaciones = String(valor).trim();
    }
  }

  var errores = eSint.concat(eClaves).concat(eTipos).concat(eOblig).concat(eSem);
  return {
    ok: errores.length === 0,
    errores: errores,
    normalizado: errores.length === 0 ? norm : null,
    accion: accion
  };
}

// ---------------------------------------------------------------------------
// Transformación TR-1 (§21.1) — payload V2 → modelo interno normalizado
// ---------------------------------------------------------------------------

/** PURA: marca de trazabilidad interna (§25) generada por el backend. */
function Captura_v2_marca(norm) {
  return Form_marcadorFuente(norm.captureId, CAPTURA_V2.LEGACY[norm.accion] || '');
}

/** PURA: TR-1 — payload V2 normalizado → campos del modelo interno. */
function Captura_v2_normalizadoAInterno(norm, opciones) {
  opciones = opciones || {};
  var marca = opciones.marca || Captura_v2_marca(norm);
  return {
    ACCION: CAPTURA_V2.LEGACY[norm.accion] || '',
    RUT: norm.rut || '',
    NOMBRE: norm.nombre || '',
    SEXO: norm.sexo || '',
    FECHA_NACIMIENTO: norm.fechaNacimiento || '',
    SECTOR: norm.sector || '',
    FECHA_INGRESO: norm.fechaIngreso || '',
    ESTRATIFICACION: norm.estratificacion || '',
    TELEFONOS: norm.telefonos || '',
    FECHA_EVENTO: norm.fechaEvento || '',
    PROFESIONAL: norm.profesional || '',
    PROFESIONAL2: norm.profesionalSecundario || '',
    OBSERVACIONES: norm.observaciones || '',
    MARCA: marca,
    marca: marca
  };
}

// ---------------------------------------------------------------------------
// Registro de captura (modelo interno de persistencia, §15)
// ---------------------------------------------------------------------------

/** PURA: registro de captura nuevo (estado inicial RECIBIDO, §15.1). */
function Captura_v2_nuevoRegistro(norm, opciones) {
  opciones = opciones || {};
  return {
    captureId: norm.captureId,
    accion: norm.accion,
    normalizado: norm,
    canonical: Captura_v2_canonica(norm),
    estado: CAPTURA_V2.ESTADOS.RECIBIDO,
    motivo: '',
    idInterno: '',
    idEvento: '',
    ingresoHoja: '',
    ingresoFila: '',
    reintentos: 0,
    usuario: opciones.usuario || '',
    fechaRecepcion: opciones.fechaRecepcion || ''
  };
}

// ---------------------------------------------------------------------------
// Núcleo — envío, estado y reprocesamiento (sin I/O: todo vía ctx)
// ---------------------------------------------------------------------------

/**
 * Núcleo: procesa un envío V2. Todo I/O ocurre a través de `ctx`.
 * @param {Object} payload  payload del contrato §6.
 * @param {Object} ctx {usuario, ahora, maxReintentos, catalogo, buscarRegistro,
 *                      persistirRegistro, actualizarTrailer, entregar}
 */
function Captura_v2_enviar(payload, ctx) {
  var c = ctx || Captura_v2_ctx();
  if (!c || !c.usuario) {
    Captura_v2_logError('CapturaV2', 'enviar', 'sin usuario activo (rechazo §24.1)');
    return {
      ok: false,
      errors: [Captura_v2_error('ERROR_INTERNO', null, 'Sesión de usuario no detectada; acceso denegado', '§24.1')]
    };
  }

  var v = Captura_v2_validar(payload, { catalogo: c.catalogo });
  if (!v.ok) return { ok: false, errors: v.errores };
  Captura_v2_medida(c, 'T1_validar');

  var norm = v.normalizado;
  var captureId = norm.captureId;
  var canon = Captura_v2_canonica(norm);
  var maxR = (c.maxReintentos === undefined || c.maxReintentos === null) ? FORM_CONFIG.MAX_REINTENTOS : Number(c.maxReintentos);

  var reg = Captura_v2_leerSeguro(c, captureId);
  Captura_v2_medida(c, 'T2_registro');
  if (reg) {
    // Caso B §13: mismo captureId con payload distinto → conflicto.
    if (reg.canonical !== canon) {
      return {
        ok: false,
        errors: [Captura_v2_error('CONFLICTO_IDEMPOTENCIA', null, 'El captureId ya fue registrado con un payload distinto; use un captureId nuevo o reenvíe el payload original', '§13 B')]
      };
    }
    // Caso A1 §13: estado terminal → reenvía el resultado almacenado.
    if (CAPTURA_V2.TERMINALES.indexOf(reg.estado) !== -1) {
      return Captura_v2_respuestaAlmacenada(reg);
    }
    // Caso A2 §13/§23: reintento técnico, con tope maxReintentos.
    if (CAPTURA_V2.REINTENTABLES.indexOf(reg.estado) !== -1) {
      var reint = Number(reg.reintentos) || 0;
      if (reint >= maxR) {
        var rAgotado = {
          estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'REINTENTOS_AGOTADOS',
          idInterno: '', idEvento: '', ingresoHoja: '', ingresoFila: ''
        };
        Captura_v2_trailerSeguro(c, captureId, { estado: rAgotado.estado, motivo: rAgotado.motivo }, reg);
        Captura_v2_logError('CapturaV2', 'enviar', captureId + ': reintentos agotados (' + maxR + ')');
        return {
          ok: false,
          errors: [Captura_v2_error('ERROR_INTERNO', null, 'Reintentos agotados; el envío requiere revisión', '§13 maxReintentos')]
        };
      }
      reg.estado = CAPTURA_V2.ESTADOS.VALIDANDO;
      reg.reintentos = reint + 1;
      Captura_v2_trailerSeguro(c, captureId, { estado: CAPTURA_V2.ESTADOS.VALIDANDO, reintentos: reg.reintentos }, reg);
      if (reg.ingresoHoja && reg.ingresoFila) {
        try {
          var est = Form_leerFilaIngreso(reg.ingresoHoja, Number(reg.ingresoFila));
          if (est && est.estado && est.estado !== '' && est.estado !== 'ERROR') {
            var mapeado = Form_mapearResultadoFila(est.estado, est.nota);
            var idInt = Captura_v2_buscarIdInternoPorRut(norm.rut);
            var entregaFast = {
              estado: mapeado.estado, motivo: mapeado.motivo || '',
              idInterno: idInt, idEvento: '',
              ingresoHoja: reg.ingresoHoja, ingresoFila: reg.ingresoFila,
              resultadoTrailer: { ok: true }
            };
            Captura_v2_trailerSeguro(c, captureId, {
              estado: mapeado.estado, motivo: mapeado.motivo || '',
              idInterno: idInt, idEvento: '',
              ingresoHoja: reg.ingresoHoja, ingresoFila: reg.ingresoFila
            }, reg);
            Captura_v2_medida(c, 'T5_entrega_fin');
            Captura_v2_logInfo('CapturaV2', 'enviar', captureId + ': A2 fast-path (fila ya procesada: ' + est.estado + ')');
            return Captura_v2_respuestaEntrega(norm, entregaFast);
          }
        } catch (_eFast) { /* fallthrough: re-ejecutar pipeline completo */ }
      }
      var previoA2 = { hoja: reg.ingresoHoja, fila: reg.ingresoFila, regExiste: true };
      var entregaA2 = Captura_v2_ejecutarEntrega(norm, c, captureId, previoA2, reg);
      Captura_v2_medida(c, 'T5_entrega_fin');
      if (entregaA2.estado === CAPTURA_V2.ESTADOS.ERROR) {
        return { ok: false, errors: [Captura_v2_errorEntrega(entregaA2.motivo)] };
      }
      return Captura_v2_respuestaEntrega(norm, entregaA2);
    }
    // Estado inesperado (defensa; no debería ocurrir).
    return {
      ok: false,
      errors: [Captura_v2_error('ERROR_INTERNO', null, 'El envío queda para revisión', reg.motivo || reg.estado)]
    };
  }

  // Envío nuevo: primero persistencia durable del registro §15.1/§15.2.
  var nuevo = Captura_v2_nuevoRegistro(norm, { usuario: c.usuario, fechaRecepcion: (c.ahora ? c.ahora() : '') });
  var pers;
  try {
    pers = c.persistirRegistro(nuevo);
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'Persistencia', String(e));
    return { ok: false, errors: [Captura_v2_error('ERROR_INTERNO', null, 'No fue posible registrar el envío', '§15.2')] };
  }
  if (!pers || !pers.ok) {
    return { ok: false, errors: [Captura_v2_error('ERROR_INTERNO', null, 'No fue posible registrar el envío', '§15.2')] };
  }
  Captura_v2_medida(c, 'T3_persistir');
  // Prima el cache del trailer: evita un segundo escaneo de FORM_RESPUESTAS §15.
  if (pers.filaFisica) {
    Captura_v2_regDesdeCache(c, captureId, { captureId: captureId, filaFisica: Number(pers.filaFisica) || 0 });
  }

  Captura_v2_medida(c, 'T4_entrega_inicio');
  var entrega = Captura_v2_ejecutarEntrega(norm, c, captureId, {}, null);
  Captura_v2_medida(c, 'T5_entrega_fin');
  if (entrega.estado === CAPTURA_V2.ESTADOS.ERROR) {
    return { ok: false, errors: [Captura_v2_errorEntrega(entrega.motivo)] };
  }
  return Captura_v2_respuestaEntrega(norm, entrega);
}

/** Núcleo: consulta de estado de un envío (respuesta §16 o §17). */
function Captura_v2_estado(captureId, ctx) {
  var c = ctx || Captura_v2_ctx();
  if (!captureId || typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    return { ok: false, errors: [Captura_v2_error('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp2- seguido de 32 caracteres hex minúsculos', '§12')] };
  }
  var reg = Captura_v2_leerSeguro(c, captureId);
  if (!reg) {
    return { ok: false, errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'No existe un registro para el captureId indicado', '§20')] };
  }
  return Captura_v2_respuestaAlmacenada(reg);
}

/**
 * Núcleo: reprocesamiento administrativo §23.
 * Reinicia estados NO terminales a VALIDANDO. Nunca PROCESADO.
 */
function Captura_v2_reprocesar(captureId, ctx) {
  var c = ctx || Captura_v2_ctx();
  if (!captureId || typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    return { ok: false, errors: [Captura_v2_error('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp2- seguido de 32 caracteres hex minúsculos', '§12')] };
  }
  var reg = Captura_v2_leerSeguro(c, captureId);
  if (!reg) {
    return { ok: false, errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'No existe un registro para el captureId indicado', '§20')] };
  }
  if (reg.estado === CAPTURA_V2.ESTADOS.PROCESADO) {
    return {
      ok: false,
      errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'PROCESADO es terminal: no se reinicia', '§23')]
    };
  }
  if (CAPTURA_V2_REPROCESABLES.indexOf(reg.estado) === -1) {
    return {
      ok: false,
      errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'Estado no reiniciable por reprocesamiento', reg.estado)]
    };
  }
  var cambios = { estado: CAPTURA_V2.ESTADOS.VALIDANDO, motivo: 'REPROCESO_ADMIN' };
  Captura_v2_trailerSeguro(c, captureId, cambios);
  return {
    ok: true,
    data: { captureId: captureId, accion: reg.accion, estado: CAPTURA_V2.ESTADOS.VALIDANDO, motivo: 'REPROCESO_ADMIN', idInterno: reg.idInterno || '', idEvento: reg.idEvento || '' }
  };
}

/**
 * Núcleo: RETOMA V2 de un pendiente no terminal (S1 §retoma).
 * Re-entrega el registro con el PROCESADOR V2 (misma mecánica de idempotencia
 * que A2 §13/§23) usando el payload normalizado almacenado en TRAZA_CRUDA.
 * NUNCA pasa por el pipeline legacy de Forms (separación de namespaces S1).
 * Bloqueados: PROCESADO (terminal §18) y REQUIERE_REVISION (decisión humana).
 */
function Captura_v2_retomarRegistro(captureId, ctx) {
  var c = ctx || Captura_v2_ctx();
  if (!captureId || typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    return { ok: false, errors: [Captura_v2_error('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp2- seguido de 32 caracteres hex minúsculos', '§12')] };
  }
  var reg = Captura_v2_leerSeguro(c, captureId);
  if (!reg) {
    return { ok: false, errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'No existe un registro para el captureId indicado', '§20')] };
  }
  if (reg.estado === CAPTURA_V2.ESTADOS.PROCESADO) {
    return { ok: false, errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'PROCESADO es terminal: no se retoma', '§23')] };
  }
  if (CAPTURA_V2_RETOMABLES.indexOf(reg.estado) === -1) {
    return { ok: false, errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'Estado no retomable por el procesador V2', reg.estado)] };
  }
  var norm = reg.normalizado;
  if (!norm || !norm.accion) {
    return { ok: false, errors: [Captura_v2_error('CAMPO_INVALIDO', 'captureId', 'Sin payload normalizado almacenado (TRAZA_CRUDA); usar reprocesamiento manual', '§23')] };
  }
  Captura_v2_trailerSeguro(c, captureId, { estado: CAPTURA_V2.ESTADOS.VALIDANDO, motivo: 'RETOMA_ADMIN' }, reg);
  var previo = (reg.ingresoHoja && reg.ingresoFila) ? { hoja: reg.ingresoHoja, fila: reg.ingresoFila, regExiste: true } : { regExiste: true };
  var entrega = Captura_v2_ejecutarEntrega(norm, c, captureId, previo, reg);
  Captura_v2_medida(c, 'T5_entrega_fin');
  if (entrega.estado === CAPTURA_V2.ESTADOS.ERROR) {
    return { ok: false, errors: [Captura_v2_errorEntrega(entrega.motivo)] };
  }
  return Captura_v2_respuestaEntrega(norm, entrega);
}

// ---------------------------------------------------------------------------
// Helpers del núcleo (respuestas y orquestación de la entrega)
// ---------------------------------------------------------------------------

/** Respuesta §16 a partir de un registro almacenado (caso A1). */
function Captura_v2_respuestaAlmacenada(reg) {
  return {
    ok: true,
    data: {
      captureId: reg.captureId,
      accion: reg.accion,
      estado: reg.estado,
      motivo: reg.motivo || '',
      idInterno: reg.idInterno || '',
      idEvento: reg.idEvento || ''
    }
  };
}

/**
 * Respuesta §16/§15.3 tras la entrega. Si el trailer no pudo confirmarse,
 * el envío queda RECIBIDO (eventualidad §15.3) con ok:true.
 */
function Captura_v2_respuestaEntrega(norm, entrega) {
  if (entrega.estado === CAPTURA_V2.ESTADOS.ERROR) {
    return { ok: false, errors: [Captura_v2_errorEntrega(entrega.motivo)] };
  }
  if (entrega.resultadoTrailer && entrega.resultadoTrailer.ok) {
    return {
      ok: true,
      data: {
        captureId: norm.captureId,
        accion: norm.accion,
        estado: entrega.estado,
        motivo: entrega.motivo || '',
        idInterno: entrega.idInterno || '',
        idEvento: entrega.idEvento || ''
      }
    };
  }
  return {
    ok: true,
    data: {
      captureId: norm.captureId,
      accion: norm.accion,
      estado: CAPTURA_V2.ESTADOS.RECIBIDO,
      motivo: 'PENDIENTE_ENTREGA',
      idInterno: '',
      idEvento: ''
    }
  };
}

/** Cache del registro por captureId dentro del MISMO request (§15, evita re-escaneo). */
function Captura_v2_regDesdeCache(c, captureId, reg) {
  c._capturaV2Memo = c._capturaV2Memo || {};
  if (reg === undefined) return c._capturaV2Memo[captureId];
  if (reg === null) delete c._capturaV2Memo[captureId];
  else c._capturaV2Memo[captureId] = reg;
}

/** Lee el registro con defensa ante fallo de I/O y cache por request (§15). */
function Captura_v2_leerSeguro(c, captureId) {
  var cacheado = (typeof Captura_v2_regDesdeCache === 'function') ? Captura_v2_regDesdeCache(c, captureId) : undefined;
  if (cacheado !== undefined) return cacheado;
  var reg;
  try {
    reg = c.buscarRegistro(captureId);
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'buscarRegistro', String(e));
    reg = null;
  }
  if (reg) Captura_v2_regDesdeCache(c, captureId, reg);
  return reg;
}

/** Escribe el trailer con defensa ante fallo de I/O (eventualidad §15.3). */
function Captura_v2_trailerSeguro(c, captureId, cambios, reg) {
  if (!c.actualizarTrailer) return { ok: false };
  try {
    return c.actualizarTrailer(captureId, cambios, reg) || { ok: false };
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'actualizarTrailer', String(e));
    return { ok: false };
  }
}

/** Orquesta la entrega TR-2 y persiste el resultado en el trailer del registro. */
function Captura_v2_ejecutarEntrega(norm, c, captureId, previo, reg) {
  var opcionesEntrega = {
    marca: Captura_v2_marca(norm),
    captureId: captureId,
    usuario: c.usuario,
    previo: previo || {},
    regExiste: !!(previo && previo.regExiste)
  };
  var resultado = null;
  try {
    resultado = c.entregar(norm, opcionesEntrega) || {};
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'entregar', String(e));
    resultado = { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ENTREGA_FALLO_INTERNO' };
  }
  var estado = resultado.estado || CAPTURA_V2.ESTADOS.ERROR;
  var trailer = {
    estado: estado,
    motivo: resultado.motivo || '',
    idInterno: resultado.idInterno || '',
    idEvento: resultado.idEvento || ''
  };
  if (resultado.ingresoHoja) trailer.ingresoHoja = resultado.ingresoHoja;
  if (resultado.ingresoFila) trailer.ingresoFila = resultado.ingresoFila;
  var resT = Captura_v2_trailerSeguro(c, captureId, trailer, reg);
  if (estado === CAPTURA_V2.ESTADOS.ERROR) {
    Captura_v2_logError('CapturaV2', 'entregar', captureId + ': ' + (resultado.motivo || 'ERROR'));
  }
  return {
    estado: estado,
    motivo: resultado.motivo || '',
    idInterno: resultado.idInterno || '',
    idEvento: resultado.idEvento || '',
    ingresoHoja: resultado.ingresoHoja || '',
    ingresoFila: resultado.ingresoFila || '',
    resultadoTrailer: resT
  };
}

// ---------------------------------------------------------------------------
// Contexto GAS real — persistencia en FORM_RESPUESTAS por encabezado y TR-2
// ---------------------------------------------------------------------------

/** GAS: usuario activo (sesión §24.1); '' si la sesión no expone usuario. */
function Captura_v2_usuarioActual() {
  try {
    if (typeof Session !== 'undefined' && Session.getActiveUser) {
      var u = Session.getActiveUser().getEmail();
      return u || '';
    }
  } catch (e) { /* sin sesión → acceso denegado en §24.1 */ }
  return '';
}

/** GAS: fecha de recepción (ISO con hora local). */
function Captura_v2_ahora() {
  return Form_aIsoConHora(new Date());
}

/** GAS: lee el registro de captura por captureId (RESPONSE_ID) en FORM_RESPUESTAS. */
function Captura_v2_buscarRegistro(captureId) {
  var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
  if (!hoja || hoja.getLastRow() < 2) return null;
  var cols = Form_columnas();
  var ultima = hoja.getLastRow();
  var ultimac = Math.min(hoja.getLastColumn(), cols.length);
  var datos = hoja.getRange(1, 1, ultima, ultimac).getValues();
  var headers = datos[0];
  var mapa = Form_mapeoEncabezados(headers);
  for (var f = datos.length - 1; f >= 1; f--) {
    var colRid = mapa.idx.RESPONSEID !== undefined ? mapa.idx.RESPONSEID : (mapa.idx.RESPONSE_ID !== undefined ? mapa.idx.RESPONSE_ID : 0);
    if (Utl_texto(datos[f][colRid]) === captureId) {
      var crudo = '';
      if (mapa.idx.TRAZACRUDA !== undefined) crudo = Utl_texto(datos[f][mapa.idx.TRAZACRUDA]);
      var normalizado = null;
      try { if (crudo) normalizado = JSON.parse(crudo); } catch (e) { normalizado = null; }
      return {
        captureId: captureId,
        accion: (normalizado && normalizado.accion) ? normalizado.accion : CAPTURA_V2.V2[Utl_texto(datos[f][mapa.idx.ACCION !== undefined ? mapa.idx.ACCION : 0])] || '',
        normalizado: normalizado,
        canonical: normalizado ? Captura_v2_canonica(normalizado) : '',
        estado: mapa.idx.ESTADO !== undefined ? Utl_texto(datos[f][mapa.idx.ESTADO]).toUpperCase() : CAPTURA_V2.ESTADOS.RECIBIDO,
        motivo: mapa.idx.MOTIVO !== undefined ? Utl_texto(datos[f][mapa.idx.MOTIVO]) : '',
        idInterno: mapa.idx.IDINTERNO !== undefined ? Utl_texto(datos[f][mapa.idx.IDINTERNO]) : '',
        idEvento: mapa.idx.IDEVENTO !== undefined ? Utl_texto(datos[f][mapa.idx.IDEVENTO]) : '',
        reintentos: mapa.idx.REINTENTOS !== undefined ? (Number(datos[f][mapa.idx.REINTENTOS]) || 0) : 0,
        ingresoHoja: mapa.idx.INGRESOHOJA !== undefined ? Utl_texto(datos[f][mapa.idx.INGRESOHOJA]) : '',
        ingresoFila: mapa.idx.INGRESOFILA !== undefined ? Utl_texto(datos[f][mapa.idx.INGRESOFILA]) : '',
        filaFisica: f + 1,
        fechaIngreso: mapa.idx.FECHAINGRESO !== undefined ? Utl_texto(datos[f][mapa.idx.FECHAINGRESO]) : ''
      };
    }
  }
  return null;
}

/** GAS: persiste el registro de captura (fila RECIBIDO) con confirmación §15. */
function Captura_v2_persistirRegistro(reg) {
  try {
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja) return { ok: false, motivo: 'HOJA_FORM_RESPUESTAS_AUSENTE' };
    var cols = Form_columnas();
    var mapa = {};
    for (var i = 0; i < cols.length; i++) mapa[cols[i]] = i;
    var fila = new Array(cols.length);
    for (var i2 = 0; i2 < cols.length; i2++) fila[i2] = '';
    fila[mapa.FECHA_FORMS] = reg.fechaRecepcion || Captura_v2_ahora();
    fila[mapa.RESPONSE_ID] = reg.captureId;
    fila[mapa.FORM_VERSION] = CAPTURE_CONTRACT_VERSION;
    fila[mapa.USUARIO] = reg.usuario || '';
    var internos = Captura_v2_normalizadoAInterno(reg.normalizado, {});
    var parEs = [['ACCION', internos.ACCION], ['RUT', internos.RUT], ['NOMBRE', internos.NOMBRE], ['SEXO', internos.SEXO], ['FECHA_NACIMIENTO', internos.FECHA_NACIMIENTO], ['SECTOR', internos.SECTOR], ['FECHA_INGRESO', internos.FECHA_INGRESO], ['ESTRATIFICACION', internos.ESTRATIFICACION], ['TELEFONOS', internos.TELEFONOS], ['FECHA_EVENTO', internos.FECHA_EVENTO], ['PROFESIONAL', internos.PROFESIONAL], ['PROFESIONAL2', internos.PROFESIONAL2], ['OBSERVACIONES', internos.OBSERVACIONES]];
    for (var j = 0; j < parEs.length; j++) {
      if (mapa[parEs[j][0]] !== undefined) fila[mapa[parEs[j][0]]] = parEs[j][1];
    }
    fila[mapa.TRAZA_CRUDA] = JSON.stringify(reg.normalizado);
    if (mapa.REINTENTOS !== undefined) fila[mapa.REINTENTOS] = reg.reintentos || 0;
    fila[mapa.ESTADO] = reg.estado || CAPTURA_V2.ESTADOS.RECIBIDO;
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, cols.length).setValues([fila]);
    // Confirmación durable §15: releer la última fila y verificar header + estado.
    var ok = Captura_v2_confirmarFila(hoja, reg.captureId);
    return ok ? { ok: true, filaFisica: hoja.getLastRow() } : { ok: false, motivo: 'CONFIRMACION_FALLIDA' };
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'persistirRegistro', String(e));
    return { ok: false, motivo: 'EXCEPCION' };
  }
}

/** GAS: confirma (relectura) que la fila quedó con RESPONSE_ID y ESTADO. */
function Captura_v2_confirmarFila(hoja, captureId) {
  try {
    var ultima = hoja.getLastRow();
    var cols = Form_columnas();
    var ultimac = Math.min(hoja.getLastColumn(), cols.length);
    var datos = hoja.getRange(ultima, 1, 1, ultimac).getValues()[0];
    var mapa = Form_mapeoEncabezados(hoja.getRange(1, 1, 1, ultimac).getValues()[0]);
    var colRid = mapa.idx.RESPONSEID !== undefined ? mapa.idx.RESPONSEID : (mapa.idx.RESPONSE_ID !== undefined ? mapa.idx.RESPONSE_ID : 0);
    var rid = Utl_texto(datos[colRid]);
    var est = mapa.idx.ESTADO !== undefined ? Utl_texto(datos[mapa.idx.ESTADO]).toUpperCase() : '';
    return rid === captureId && est !== '';
  } catch (e) {
    return false;
  }
}

/** GAS: actualiza el trailer del registro (INGRESO_HOJA..FECHA_PROCESO) por encabezado. */
function Captura_v2_actualizarTrailer(captureId, cambios, reg) {
  try {
    var hoja = Modelo_hoja(HOJAS.FORM_RESPUESTAS);
    if (!hoja) return { ok: false, motivo: 'HOJA_FORM_RESPUESTAS_AUSENTE' };
    if (!reg || !reg.filaFisica) {
      var encontrado = Captura_v2_buscarRegistro(captureId);
      reg = (encontrado && encontrado.filaFisica) ? encontrado : reg;
      if (!reg || !reg.filaFisica) return { ok: false, motivo: 'SIN_REGISTRO' };
    }
    var cols = Form_columnas();
    var mapa = {};
    for (var i = 0; i < cols.length; i++) mapa[cols[i]] = i;
    var trailerCols = ['INGRESO_HOJA', 'INGRESO_FILA', 'REINTENTOS', 'ESTADO', 'MOTIVO', 'ID_INTERNO', 'ID_EVENTO', 'FECHA_PROCESO'];
    var ini = mapa.INGRESO_HOJA, fin = mapa.FECHA_PROCESO;
    var ancho = fin - ini + 1;
    var bloque = hoja.getRange(reg.filaFisica, ini + 1, 1, ancho).getValues()[0];
    var offset = {};
    for (var t = 0; t < trailerCols.length; t++) offset[trailerCols[t]] = mapa[trailerCols[t]] - ini;
    var valores = {
      INGRESO_HOJA: cambios.ingresoHoja, INGRESO_FILA: cambios.ingresoFila,
      REINTENTOS: cambios.reintentos, ESTADO: cambios.estado, MOTIVO: cambios.motivo,
      ID_INTERNO: cambios.idInterno, ID_EVENTO: cambios.idEvento,
      FECHA_PROCESO: (cambios.fechaProceso !== undefined) ? cambios.fechaProceso : Captura_v2_ahora()
    };
    for (var k in offset) {
      if (valores[k] !== undefined && offset.hasOwnProperty(k)) bloque[offset[k]] = valores[k];
    }
    hoja.getRange(reg.filaFisica, ini + 1, 1, ancho).setValues([bloque]);
    // Confirmación por relectura §15: el estado escrito debe verificarse.
    var relee = hoja.getRange(reg.filaFisica, ini + 1, 1, ancho).getValues()[0];
    var okEstado = cambios.estado === undefined || Utl_texto(relee[offset.ESTADO]).toUpperCase() === Utl_texto(cambios.estado).toUpperCase();
    return okEstado ? { ok: true } : { ok: false, motivo: 'CONFIRMACION_TRAILER_FALLIDA' };
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'actualizarTrailer', String(e));
    return { ok: false, motivo: 'EXCEPCION' };
  }
}

// ---------------------------------------------------------------------------
// Entrega TR-2 (§21, §22) — reutiliza el pipeline existente, jamás lo duplica
// ---------------------------------------------------------------------------

function Captura_v2_pacientesEnMemoria() {
  return Modelo_leerPacientes();
}

/** GAS: busca persona en PACIENTES por RUT canónico exacto. */
function Captura_v2_buscarPersonaPorRut(rut) {
  var pacientes = Captura_v2_pacientesEnMemoria();
  var objetivo = Utl_texto(rut);
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto(pacientes[i].RUT) === objetivo) return pacientes[i];
  }
  return null;
}

/** GAS: idInterno de la persona por RUT (tras el pipeline de ingreso). */
function Captura_v2_buscarIdInternoPorRut(rut) {
  var p = Captura_v2_buscarPersonaPorRut(rut);
  return p ? Utl_texto(p.ID_INTERNO) : '';
}

/** GAS: evento ya entregado para esta marca (§22 protección de efectos). */
function Captura_v2_marcaEnEventos(marca) {
  if (!marca || typeof Form_leerMarcas !== 'function') return null;
  var leidas = Form_leerMarcas();
  return (leidas && leidas[marca]) ? { idInterno: leidas[marca].idInterno || '', idEvento: leidas[marca].idEvento || '' } : null;
}

/** GAS: entrega TR-2 según operación (§21/§22). */
function Captura_v2_entregar(norm, opciones) {
  opciones = opciones || {};
  var marca = opciones.marca || Captura_v2_marca(norm);
  if (norm.accion === 'nuevoIngreso') return Captura_v2_entregarIngreso(norm, marca, opciones);
  return Captura_v2_entregarEvento(norm, marca, opciones);
}

/**
 * PURA/GAS: resuelve el índice de la columna `FECHA DE INGRESO` POR ENCABEZADO
 * (§21.1, variantes `FECHA DE ING…`). Devuelve -1 si no se resuelve.
 */
function Captura_v2_indiceColumnaFecha(encabezados) {
  var headers = encabezados || [];
  for (var i = 0; i < headers.length; i++) {
    var h = Utl_texto(headers[i]).trim().toUpperCase();
    if (h === 'FECHA DE INGRESO' || h.indexOf('FECHA DE ING') === 0) return i;
  }
  return -1;
}

/**
 * GAS: búsqueda ACOTADA de la marca en UNA sola hoja INGRESO_<SECTOR> (§21/§22).
 * Se usa solo cuando existe registro previo (reintento A2) sin coordenadas en el
 * trailer (ventana de ida-y-vuelta). JAMÁS barre todas las hojas INGRESO_*.
 */
function Captura_v2_buscarMarcaEnHoja(nombreHoja, marca) {
  try {
    var hoja = Modelo_hoja(nombreHoja);
    if (!hoja || hoja.getLastRow() < 2) return null;
    var ultimac = Math.min(hoja.getLastColumn(), 40);
    var bloque = hoja.getRange(1, 1, hoja.getLastRow(), ultimac).getValues();
    if (bloque.length < 2 || bloque[0].join('|') == null || bloque[0].join('|').toUpperCase().indexOf('NOMBRE') === -1) return null;
    var mapa = Ingresos_mapearEncabezadosHoja(bloque[0]);
    if (mapa.notaIdx < 0) return null;
    var hr = Modelo_headerRow(nombreHoja);
    for (var f = hr; f < bloque.length; f++) {
      if (Utl_texto(bloque[f][mapa.notaIdx]) === marca) return { hoja: nombreHoja, fila: String(f + 1) };
    }
  } catch (e) { /* best effort; si falla se anexa (dedupe de negocio protege) */ }
  return null;
}

/**
 * GAS: confirmación REAL de la fila de ingreso (§16) en el intento síncrono:
 * relee la fila y verifica por encabezado que FECHA DE INGRESO = fechaIngreso y
 * que el pipeline dejó ESTADO_INGRESO marcado. Devuelve {ok:true} o {ok:false,motivo}.
 */
function Captura_v2_confirmarEntregaIngreso(nombreHoja, filaFisica, fechaIso, bloqueReusar) {
  try {
    var hoja = Modelo_hoja(nombreHoja);
    if (!hoja) return { ok: false, motivo: 'HOJA_AUSENTE' };
    var ultimac = Math.min(hoja.getLastColumn(), 40);
    var bloque = (bloqueReusar && bloqueReusar.length) ? bloqueReusar
      : hoja.getRange(1, 1, hoja.getLastRow(), ultimac).getValues();
    if (!bloque.length || bloque[0].join('|') == null || bloque[0].join('|').toUpperCase().indexOf('NOMBRE') === -1) {
      return { ok: false, motivo: 'BLOQUE_DESALINEADO' };
    }
    var hr = Modelo_headerRow(nombreHoja);
    var idx = Number(filaFisica) - hr;
    if (isNaN(idx) || idx < 1 || idx >= bloque.length) return { ok: false, motivo: 'FILA_FUERA_DE_RANGO' };
    var colFecha = Captura_v2_indiceColumnaFecha(bloque[0]);
    if (colFecha < 0) return { ok: false, motivo: 'COLUMNA_FECHA_INGRESO_NO_ENCONTRADA' };
    var mapa = Ingresos_mapearEncabezadosHoja(bloque[0]);
    var escrito = Utl_texto(bloque[idx][colFecha]);
    var okFecha = escrito === Utl_texto(fechaIso);
    var okEstado = mapa.estadoIdx >= 0 && Utl_texto(bloque[idx][mapa.estadoIdx]).toUpperCase() !== '';
    if (!okFecha) return { ok: false, motivo: 'FECHA_INGRESO_DIVERGENTE', actual: escrito };
    if (!okEstado) return { ok: false, motivo: 'SIN_ESTADO_PIPELINE' };
    return { ok: true, fila: filaFisica, bloque: bloque };
  } catch (e) {
    return { ok: false, motivo: 'EXCEPCION' };
  }
}

/**
 * GAS: TR-2a — fila INGRESO_<SECTOR> + pipeline acotado (§21, §25).
 * La fila lleva la marca interna en NOTA_SISTEMA; el pipeline decide
 * CREAR_PACIENTE/ENLAZAR/REVISION y la deduplicación de negocio (§22).
 * Rápido y sin barrer todas las hojas INGRESO_* dentro del request:
 *   1) reintento A2 → coordenadas previas del trailer (sin lectura extra);
 *   2) crash-window A2 (trailer vacío) → búsqueda acotada a la hoja del sector;
 *   3) envío nuevo → anexo al final sin búsqueda alguna.
 */
function Captura_v2_entregarIngreso(norm, marca, opciones) {
  opciones = opciones || {};
  try {
    var hojaNombre = Form_sectorHojaIngreso(norm.sector);
    var hoja = Modelo_hoja(hojaNombre);
    if (!hoja) return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'INGRESO_HOJA_NO_DISPONIBLE' };

    // Normalizar layout visual ANTES de calcular coordenadas (v0.8.9.5 fast-path:
    // HVis_yaFormateada deja esto en ~cero cuando ya está formateado).
    try { if (typeof HVis_formatearIngresos === 'function') HVis_formatearIngresos(); } catch (e) { /* best effort */ }

    var internos = Captura_v2_normalizadoAInterno(norm, { marca: marca });
    var previo = opciones.previo || {};
    var filaFisica = 0, hojaEntrega = '';

    if (previo.hoja && previo.fila) {
      // Efecto ya entregado en un intento previo (A2): no se duplica la fila (§22).
      hojaEntrega = previo.hoja;
      filaFisica = Number(previo.fila) || 0;
      Captura_v2_logInfo('CapturaV2', 'entregarIngreso', marca + ': coordenadas previas (' + hojaEntrega + ':' + filaFisica + ')');
    } else if (opciones.regExiste) {
      // Crash-window: registro existe pero el trailer no registró coordenadas.
      var hallado = Captura_v2_buscarMarcaEnHoja(hojaNombre, marca);
      if (hallado && hallado.fila) {
        hojaEntrega = hallado.hoja;
        filaFisica = Number(hallado.fila) || 0;
        Captura_v2_logInfo('CapturaV2', 'entregarIngreso', marca + ': fila reencontrada acotada (' + hojaEntrega + ':' + filaFisica + ')');
      }
    }
    if (!hojaEntrega || !filaFisica) {
      hoja.appendRow(Form_filaCanonicaIngreso(internos, marca, { hoy: norm.fechaIngreso }));
      hojaEntrega = hojaNombre;
      filaFisica = hoja.getLastRow();
    }

    // Procesar SOLO la fila del envío actual (acotación §13 nunca re-procesa backlog).
    var soloFilas = {};
    soloFilas[hojaEntrega] = [String(filaFisica)];
    var proc = Ingresos_procesarTodasLasHojas({
      soloHojas: [hojaEntrega],
      soloFilas: soloFilas,
      confirmarNuevos: true,
      confirmarNuevoPaciente: norm.confirmarNuevoPaciente === true
    });
    if (proc && proc.error) return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: Utl_texto(proc.error) };

    // Confirmación real §16: fila con FECHA DE INGRESO = fechaIngreso y estado del pipeline.
    var conf = Captura_v2_confirmarEntregaIngreso(hojaEntrega, filaFisica, norm.fechaIngreso);
    if (conf && conf.ok === false) {
      Captura_v2_logAux('entregarIngreso', marca + ': confirmación pendiente (' + conf.motivo + ')');
      return {
        estado: CAPTURA_V2.ESTADOS.RECIBIDO,
        motivo: 'PENDIENTE_CONFIRMACION',
        idInterno: '',
        idEvento: '',
        ingresoHoja: hojaEntrega,
        ingresoFila: String(filaFisica)
      };
    }

    var est = (conf && conf.bloque)
      ? Form_leerFilaIngresoDesdeBloque(hojaEntrega, filaFisica, conf.bloque)
      : Form_leerFilaIngreso(hojaEntrega, filaFisica);
    var mapeado = Form_mapearResultadoFila(est.estado, est.nota);
    var idInterno = Captura_v2_buscarIdInternoPorRut(norm.rut);
    return {
      estado: mapeado.estado,
      motivo: mapeado.motivo,
      idInterno: idInterno,
      idEvento: '',
      ingresoHoja: hojaEntrega,
      ingresoFila: String(filaFisica)
    };
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'entregarIngreso', String(e));
    return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ENTREGA_INGRESO_FALLO' };
  }
}

/**
 * §5.2 — FECHA DE OPERACIÓN para `actualizarDatos`.
 * Generada EXCLUSIVAMENTE por el backend; nunca proviene del payload
 * (`fechaEvento` es NP para `actualizarDatos`, §5.1). Precisión día,
 * ISO `yyyy-MM-dd`, zona local del entorno (America/Santiago), con la
 * misma mecánica que el pipeline histórico (`Form_hoy`) y `FECHA_ACTUALIZACION`.
 * `opciones.hoy` solo para pruebas deterministas; nunca para datos del cliente.
 */
function Captura_v2_fechaOperacion(opciones) {
  opciones = opciones || {};
  if (opciones.hoy) return opciones.hoy;
  return Form_hoy({});
}

/**
 * GAS: TR-2b/TR-2c — evento clínico (control/seguimiento) y actualización.
 * La identidad es exacta (RUT); persona no encontrada → REQUIERE_REVISION.
 * La marca del canal viaja como FUENTE del evento (§25).
 * TR-2c (§5.2): `actualizarDatos` actualiza PRIMERO los campos operativos de
 * PACIENTES y SOLO entonces registra el evento `OTRO`, cuya FECHA_EVENTO es la
 * fecha de la operación generada por el backend (jamás `''` ni dato del payload).
 */
function Captura_v2_entregarEvento(norm, marca, opciones) {
  try {
    var persona = Captura_v2_buscarPersonaPorRut(norm.rut);
    if (!persona) {
      return { estado: CAPTURA_V2.ESTADOS.REQUIERE_REVISION, motivo: 'PERSONA_NO_ENCONTRADA', idInterno: '', idEvento: '' };
    }
    // Protección de efecto §22: si esta marca ya generó evento, no duplicar.
    var existente = Captura_v2_marcaEnEventos(marca);
    if (existente && existente.idEvento) {
      return { estado: CAPTURA_V2.ESTADOS.PROCESADO, motivo: '', idInterno: existente.idInterno || persona.ID_INTERNO, idEvento: existente.idEvento };
    }
    var registradoPor = (opciones && opciones.usuario) || 'CAPTURA_V2';

    if (norm.accion === 'actualizarDatos') {
      // TR-2c §21/§5.2: campos operativos PRIMERO; el evento OTRO solo si
      // la actualización fue aplicada (evita OTRO huérfano y reintento ciego).
      var internos = Captura_v2_normalizadoAInterno(norm, { marca: marca });
      if (typeof Form_actualizarDatosPaciente !== 'function') {
        return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ACTUALIZACION_FALLIDA', idInterno: persona.ID_INTERNO, idEvento: '' };
      }
      var upd = Form_actualizarDatosPaciente(persona, internos, marca);
      if (!upd) {
        return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ACTUALIZACION_FALLIDA', idInterno: persona.ID_INTERNO, idEvento: '' };
      }
      // §5.2: fecha del evento OTRO = fecha de la operación (backend), nunca vacía.
      var resOtro = api_registrarEvento({
        tipoEvento: 'OTRO',
        fecha: Captura_v2_fechaOperacion({}),
        idInterno: persona.ID_INTERNO,
        profesional: norm.profesional || '',
        descripcion: 'ACTUALIZACION_VIA_CAPTURA',
        observaciones: norm.observaciones || '',
        fuente: marca,
        registradoPor: registradoPor
      });
      if (!resOtro || !resOtro.ok) {
        Captura_v2_logError('CapturaV2', 'entregarEvento', marca + ': evento OTRO no registrado (actualizarDatos): ' + ((resOtro && resOtro.motivo) || 'EVENTO_NO_REGISTRADO'));
        return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: (resOtro && resOtro.motivo) || 'EVENTO_NO_REGISTRADO', idInterno: persona.ID_INTERNO, idEvento: '' };
      }
      var halladoAct = Captura_v2_marcaEnEventos(marca);
      return {
        estado: CAPTURA_V2.ESTADOS.PROCESADO,
        motivo: '',
        idInterno: persona.ID_INTERNO,
        idEvento: (halladoAct && halladoAct.idEvento) ? halladoAct.idEvento : ''
      };
    }

    var tipoEvento = norm.accion === 'registrarControl' ? 'CONTROL' : 'SEGUIMIENTO';
    var res = api_registrarEvento({
      tipoEvento: tipoEvento,
      fecha: norm.fechaEvento || '',
      idInterno: persona.ID_INTERNO,
      profesional: norm.profesional || '',
      descripcion: '',
      observaciones: norm.observaciones || '',
      fuente: marca,
      registradoPor: registradoPor
    });
    if (!res || !res.ok) {
      return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: (res && res.motivo) || 'EVENTO_NO_REGISTRADO', idInterno: persona.ID_INTERNO, idEvento: '' };
    }
    var hallado = Captura_v2_marcaEnEventos(marca);
    return {
      estado: CAPTURA_V2.ESTADOS.PROCESADO,
      motivo: '',
      idInterno: persona.ID_INTERNO,
      idEvento: (hallado && hallado.idEvento) ? hallado.idEvento : ''
    };
  } catch (e) {
    Captura_v2_logError('CapturaV2', 'entregarEvento', String(e));
    return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ENTREGA_EVENTO_FALLO', idInterno: '', idEvento: '' };
  }
}

// ---------------------------------------------------------------------------
// Contexto de producción (GAS) y entrypoints de la Web App
// ---------------------------------------------------------------------------

/** GAS: catálogo PROFESIONALES para validación §9. */
function Captura_v2_catalogo() {
  try {
    if (typeof Profesionales_catalogo === 'function') return Profesionales_catalogo();
  } catch (e) { /* catálogo no disponible */ }
  return [];
}

/** Construye el ctx real de GAS. Inyectable en tests. */
function Captura_v2_ctx() {
  return {
    usuario: Captura_v2_usuarioActual(),
    ahora: Captura_v2_ahora,
    maxReintentos: FORM_CONFIG.MAX_REINTENTOS,
    catalogo: Captura_v2_catalogo(),
    buscarRegistro: Captura_v2_buscarRegistro,
    persistirRegistro: Captura_v2_persistirRegistro,
    actualizarTrailer: Captura_v2_actualizarTrailer,
    entregar: Captura_v2_entregar,
    medir: Captura_v2_marcaMedida
  };
}

/** Entrypoint Web App: envío de captura V2 (único canal operativo). */
function WebApp_capturarEnviar(payload) {
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return { ok: false, errors: [Captura_v2_error('ERROR_INTERNO', null, 'Servicio ocupado; reintente en unos segundos', 'S2-LockService')] };
    }
    var ctx = Captura_v2_ctx();
    Captura_v2_medida(ctx, 'T0_recepcion');
    var res = Captura_v2_enviar(payload || {}, ctx);
    Captura_v2_medida(ctx, 'T6_respuesta');
    Captura_v2_logMedidas(ctx);
    return res;
  } catch (e) {
    Captura_v2_logError('WebApp', 'capturarEnviar', String(e));
    return { ok: false, errors: [Captura_v2_error('ERROR_INTERNO', null, 'Falla interna al procesar el envío', '§16.2')] };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ }
  }
}

// ---------------------------------------------------------------------------
// Pre-flight de duplicados V2 (única RPC previa en NUEVO_INGRESO; resto 1 RPC)
// ---------------------------------------------------------------------------

/**
 * GAS: pre-flight de duplicados para el PAYLOAD V2 (§5, §24).
 * Recibe la forma camelCase de la Web App (no toca el flujo legacy de WebApp.gs).
 * Solo se consulta en `nuevoIngreso` desde la UI; su costo es una RPC extra
 * únicamente en ese caso (informe FASE 4). Las demás acciones no pre-consultan.
 */
function Captura_v2_previaDuplicados(datos) {
  try {
    datos = datos || {};
    if (Utl_texto(datos.accion).toLowerCase() !== 'nuevoingreso') {
      return { ok: true, coincidencia: false, candidatos: [], motivo: 'Solo se checan coincidencias en nuevoIngreso' };
    }
    var n = {};
    var rut = Norm_normalizarRut(datos.rut);
    n.RUT = rut.rut; n.RUT_ESTADO = rut.estado; n.RUT_CUERPO = rut.cuerpo;
    var nom = Norm_normalizarNombre(datos.nombre);
    n.NOMBRE = nom.nombre;
    n.NOMBRE_CLAVE = (nom.ok && nom.nombre) ? Norm_claveNombre(nom.nombre) : '';
    var tel = Norm_normalizarTelefono(Utl_texto(datos.telefonos));
    n.TELEFONOS = (tel && tel.telefonos) ? tel.telefonos.join('/') : '';

    var pacientes = Modelo_leerPacientes() || [];
    var indices = Iden_construirIndices(pacientes);
    var iden = Iden_identificar(n, indices);
    var candidatos = [];
    if (iden.paciente && iden.idPaciente) {
      candidatos.push({
        criterio: iden.criterio || 'Coincidencia detectada',
        confianza: iden.confianza || '',
        resultado: iden.resultado,
        paciente: WebApp_resumenPaciente(iden.paciente)
      });
    }
    if (iden.resultado !== 'MATCH_EXACTO' && n.NOMBRE_CLAVE && indices.porNombre[n.NOMBRE_CLAVE]) {
      indices.porNombre[n.NOMBRE_CLAVE].forEach(function (p) {
        var ya = candidatos.some(function (c) { return c.paciente.idInterno === p.ID_INTERNO; });
        if (!ya) {
          candidatos.push({
            criterio: 'Nombre exacto duplicado',
            confianza: 'MEDIA',
            resultado: 'NOMBRE_EXACTO',
            paciente: WebApp_resumenPaciente(p)
          });
        }
      });
    }
    return { ok: true, coincidencia: candidatos.length > 0, candidatos: candidatos, rutNormalizado: n.RUT };
  } catch (e) {
    Captura_v2_logError('WebApp', 'previaDuplicadosV2', String(e));
    return { ok: false, motivo: 'PREVIA_FALLO_INTERNO' };
  }
}

/** Alias Web App: pre-flight de duplicados V2. */
function WebApp_previaDuplicadosV2(datos) {
  return Captura_v2_previaDuplicados(datos);
}

/** Entrypoint Web App: consulta de estado de un envío V2. */
function WebApp_capturarEstado(captureId) {
  try {
    return Captura_v2_estado(captureId, Captura_v2_ctx());
  } catch (e) {
    Captura_v2_logError('WebApp', 'capturarEstado', String(e));
    return { ok: false, errors: [Captura_v2_error('ERROR_INTERNO', null, 'Falla interna al consultar el envío', '§16.2')] };
  }
}

/** Entrypoint Web App: retoma administrativa de un pendiente V2 (procesador V2). */
function WebApp_capturarRetomar(payload) {
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return { ok: false, errors: [Captura_v2_error('ERROR_INTERNO', null, 'Servicio ocupado; reintente en unos segundos', 'S2-LockService')] };
    }
    var captureId = (payload && typeof payload === 'object' && payload.captureId) ? payload.captureId : null;
    return Captura_v2_retomarRegistro(captureId, Captura_v2_ctx());
  } catch (e) {
    Captura_v2_logError('WebApp', 'capturarRetomar', String(e));
    return { ok: false, errors: [Captura_v2_error('ERROR_INTERNO', null, 'Falla interna al retomar el envío', '§16.2')] };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ }
  }
}

// ---------------------------------------------------------------------------
// Instrumentación de tiempos del intento síncrono (§16 captura rápida T0..T6)
// ---------------------------------------------------------------------------

/** GAS/PURA: marca una medida si el ctx está instrumentado. No bloquea. */
function Captura_v2_medida(c, etiqueta) {
  if (!c || typeof c.medir !== 'function') return;
  try { c.medir(etiqueta); } catch (e) { /* no bloquear nunca */ }
}

/** GAS: acumula la medida en el ctx (base = primera llamada del request). */
function Captura_v2_marcaMedida(etiqueta) {
  try {
    var t = Date.now();
    Captura_v2_marcaMedida._base = Captura_v2_marcaMedida._base || t;
    if (!this.medidas) this.medidas = [];
    this.medidas.push({ n: etiqueta, d: t - Captura_v2_marcaMedida._base });
  } catch (e) { /* no bloquear nunca */ }
}

/** GAS: vuelca acumuladas por request (solo consola/servidor; jamás al UI). */
function Captura_v2_logMedidas(c) {
  try {
    if (c && c.medidas && c.medidas.length) {
      Captura_v2_logAux('tiempos', c.medidas.map(function (x) { return x.n + '=' + x.d + 'ms'; }).join(' | '));
    }
  } catch (e) { /* no bloquear nunca */ }
}

// ---------------------------------------------------------------------------
// Trazas (solo GAS; en node se omiten silenciosamente)
// ---------------------------------------------------------------------------

function Captura_v2_logInfo(modulo, operacion, mensaje) {
  try {
    if (typeof SpreadsheetApp !== 'undefined' && typeof Log_info === 'function') Log_info(modulo || 'CapturaV2', operacion, mensaje);
  } catch (e) { /* no bloquear nunca */ }
}

function Captura_v2_logAux(operacion, mensaje) {
  if (typeof console !== 'undefined') console.log('[CAPTURA_V2] ' + operacion + ': ' + mensaje);
}

function Captura_v2_logError(modulo, operacion, mensaje) {
  try {
    if (typeof SpreadsheetApp !== 'undefined' && typeof Log_error === 'function') Log_error(modulo || 'CapturaV2', operacion, mensaje);
  } catch (e) { /* no bloquear nunca */ }
  try { Captura_v2_logAux(operacion, mensaje); } catch (e) { /* no bloquear nunca */ }
}