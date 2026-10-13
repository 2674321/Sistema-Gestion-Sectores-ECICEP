/**
 * ECICEP — BACKEND DE CAPTURA V3 / COMPATIBILIDAD V2 (docs/CONTRATO_CAPTURA_V2.md, NORMATIVO).
 *
 * Fase 3: backend de captura del contrato V2, aislado del frontend. Este
 * archivo es el ÚNICO punto de entrada del contrato de captura V2:
 *   - Núcleo puro (validación, idempotencia, estados, respuestas) sin I/O;
 *   - `ctx` inyectable para poder probar contra un registro en memoria;
 *   - ctx de GAS real que persiste en FORM_RESPUESTAS por ENCABEZADO y
 *     entrega al pipeline interno (TR-1/TR-2, §21);
 *   - entrypoints `WebApp_capturarEnviar_` / `WebApp_capturarEstado_`.
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
  /** Formato de captureId §0/§12: `Cp4-` (vigente), `Cp3-` o `Cp2-` (anteriores) + 32 hex. */
  RE_CAPTURE_ID: /^Cp[234]-[a-f0-9]{32}$/,
  /** Orden canónico de campos §6 (define la forma canónica §11). */
  CAMPOS: [
    'captureId', 'accion', 'rut', 'nombre', 'sexo', 'fechaNacimiento', 'sector',
    'fechaIngreso', 'estratificacion', 'telefonos', 'fechaEvento', 'profesional',
    'profesionalSecundario', 'observaciones', 'confirmarNuevoPaciente', 'proximoControl', 'actualizacion',
    'saludMental'
  ],
  /** Tipo JSON declarado §7. */
  CAMPO_TIPO: {
    captureId: 'string', accion: 'string', rut: 'string', nombre: 'string',
    sexo: 'string', fechaNacimiento: 'string', sector: 'string',
    fechaIngreso: 'string', estratificacion: 'string', telefonos: 'string', fechaEvento: 'string',
    profesional: 'string', profesionalSecundario: 'string',
    observaciones: 'string', confirmarNuevoPaciente: 'boolean', proximoControl: 'string', actualizacion: 'object',
    saludMental: 'string'
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
    confirmarNuevoPaciente: { REQ: [], OPC: ['nuevoIngreso'] },
    actualizacion: { REQ: [], OPC: ['actualizarDatos'] },
    proximoControl: { REQ: [], OPC: ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'] },
    saludMental: { REQ: [], OPC: ['nuevoIngreso'] }
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
 * Estados retomables por la RETOMA V2 (Captura_v2_retomarRegistro_, S1).
 * Re-entrega automática por el procesador V2 de pendientes NO terminales.
 * Excluye REQUIERE_REVISION (requiere decisión humana) y PROCESADO (terminal);
 * ambas exclusiones son deliberadas (ver CONTRATO_DATOS.md §retoma).
 */
var CAPTURA_V2_RETOMABLES = ['ERROR', 'RECIBIDO', 'VALIDANDO', 'VALIDO'];

// ---------------------------------------------------------------------------
// Errores (catálogo §20 — prohibido inventar códigos)
// ---------------------------------------------------------------------------

/** PURA: construye un error de captura §17. */
function Captura_v2_error_(codigo, campo, mensaje, detalle) {
  return { codigo: codigo, campo: (campo === undefined ? null : campo), mensaje: mensaje || '', detalle: (detalle === undefined ? '' : detalle) };
}

/** §16.2 — error de entrega: conserva el mensaje estable y agrega el MOTIVO
 * real del intento para diagnóstico operativo, sin cambiar el contrato (ok:false). */
function Captura_v2_errorEntrega_(motivo) {
  return Captura_v2_error_('ERROR_INTERNO', null,
    'El procesamiento del envío falló; reintentable' + (motivo ? ' (' + motivo + ')' : ''), '§16.2');
}

/** PURA: ¿es una clave interna ó legacy (prohibida en el payload §6.1/§25)? */
function Captura_v2_esInterna_(k) {
  if (CAPTURA_V2.INTERNOS.indexOf(k) !== -1) return true;
  if (CAPTURA_V2.LEGACY_CAMPOS.indexOf(k) !== -1) return true;
  return k.indexOf('FORM|') === 0 || k.indexOf('UI-') === 0;
}

/** PURA: normaliza un nombre de profesional (NOMBRE del catálogo §9). */
function Captura_v2_normalizarProfesional_(v) {
  return Utl_colapsarEspacios_(Utl_sinTildes_(String(v === undefined || v === null ? '' : v).toUpperCase())).trim();
}

/** PURA: catálogo PROFESIONALES normalizado a la clave de §9 (acepta objetos o nombres). */
function Captura_v2_catalogoNormalizado_(lista) {
  if (!lista) return [];
  if (!Array.isArray(lista)) lista = [lista];
  return lista.map(function (it) {
    if (typeof it === 'string') return Captura_v2_normalizarProfesional_(it);
    var n = it && (it.NOMBRE_CANONICO || it.NOMBRE || it.CODIGO);
    return Captura_v2_normalizarProfesional_(n || '');
  });
}

/** PURA: valida una fecha ISO estricta en rango (§10), sin sinónimos de formato. */
function Captura_v2_validarIsoFecha_(raw, rango) {
  var texto = Utl_colapsarEspacios_(Utl_texto_(raw));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return { ok: false, detalle: 'Solo se admite formato ISO estricto yyyy-MM-dd' };
  }
  var nr = Norm_normalizarFecha_(texto, rango || {});
  if (nr.estado !== 'VALIDA') return { ok: false, detalle: nr.detalle || 'Fecha fuera de rango plausible' };
  return { ok: true, iso: nr.iso };
}

/** PURA: forma canónica del payload §11 (orden §6, solo campos que aplican). */
function Captura_v2_canonica_(norm) {
  var accion = (norm && norm.accion) || '';
  var partes = [];
  for (var i = 0; i < CAPTURA_V2.CAMPOS.length; i++) {
    var c = CAPTURA_V2.CAMPOS[i];
    if (c === 'accion') continue;
    if (c === 'actualizacion' && !/^Cp4-/.test(norm.captureId || '')) continue;
    // Mantener idéntica la huella de capturas V2 que ya están persistidas.
    if (c === 'proximoControl' && !/^Cp[34]-/.test(norm.captureId || '')) continue;
    // El indicador de salud mental es solo captura V4; las huellas Cp2/Cp3
    // (ya persistidas) no deben cambiar.
    if (c === 'saludMental' && !/^Cp4-/.test(norm.captureId || '')) continue;
    var m = CAPTURA_V2.MATRIZ[c];
    var aplica = m.REQ.indexOf(accion) !== -1 || m.OPC.indexOf(accion) !== -1;
    if (!aplica) continue;
    var v = norm[c];
    if (v === undefined || v === null) v = '';
    if (c === 'confirmarNuevoPaciente') v = v ? 'true' : 'false';
    partes.push(c + '=' + (c === 'actualizacion' && v ? Captura_jsonOrdenado_(v) : String(v)));
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
function Captura_v2_validar_(payload, opciones) {
  opciones = opciones || {};
  var catalogoNorm = Captura_v2_catalogoNormalizado_(opciones.catalogo);
  var eSint = [], eClaves = [], eTipos = [], eOblig = [], eSem = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      errores: [Captura_v2_error_('SINTAXIS_INVALIDA', null, 'El payload debe ser un objeto JSON', '§17')],
      normalizado: null, accion: ''
    };
  }

  // Capa 1 — sintaxis
  var captureId = payload.captureId;
  if (typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    eSint.push(Captura_v2_error_('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp4- (o Cp3-/Cp2- anteriores) seguido de 32 caracteres hex minúsculos', '§12'));
  }

  // Capa 2 — estructural: accion (operación)
  var accion = payload.accion;
  var accionValida = typeof accion === 'string' && CAPTURA_V2.OPERACIONES.indexOf(accion) !== -1;
  if (!accionValida) {
    if (typeof accion !== 'string') {
      eOblig.push(Captura_v2_error_('CAMPO_OBLIGATORIO_AUSENTE', 'accion', 'accion es obligatoria', '§8'));
    } else {
      eClaves.push(Captura_v2_error_('ACCION_INVALIDA', 'accion', 'Operación no soportada por el contrato V2', '§9'));
    }
    var errs = eSint.concat(eClaves).concat(eTipos).concat(eOblig).concat(eSem);
    return { ok: errs.length === 0, errores: errs, normalizado: null, accion: Utl_texto_(accion) };
  }

  // Capa 2 — claves exactas §6.1
  var claves = Object.keys(payload);
  for (var i = 0; i < claves.length; i++) {
    var k = claves[i];
    if (CAPTURA_V2.CAMPOS.indexOf(k) !== -1) continue;
    if (Captura_v2_esInterna_(k)) {
      eClaves.push(Captura_v2_error_('CAMPO_NO_PERMITIDO', k,
        'Campo interno o generado por el backend: no puede venir en el payload', '§6.1'));
    } else {
      eClaves.push(Captura_v2_error_('CAMPO_DESCONOCIDO', k, 'Campo no definido en el contrato de captura V2', '§6'));
    }
  }

  var norm = {
    captureId: captureId, accion: accion,
    rut: '', nombre: '', sexo: '', fechaNacimiento: '', sector: '',
    fechaIngreso: '', estratificacion: '', telefonos: '', fechaEvento: '', profesional: '',
    profesionalSecundario: '', observaciones: '', confirmarNuevoPaciente: false,
    proximoControl: '', actualizacion: null, saludMental: '',
    // DEC-105: derivado interno (NO es campo del contrato): anotaciones que
    // Norm_normalizarTelefono_ separa del texto de contacto. Antes se perdían.
    telefonoObs: ''
  };

  // Capa 2 (tipos + obligatoriedad) y Capa 3 (semántica) por campo §5.1
  for (var j = 0; j < CAPTURA_V2.CAMPOS.length; j++) {
    var campo = CAPTURA_V2.CAMPOS[j];
    if (campo === 'accion') continue;
    var presente = Object.prototype.hasOwnProperty.call(payload, campo);
    var valor = payload[campo];
    var indM = CAPTURA_V2.MATRIZ[campo];
    if (campo === 'proximoControl' && presente && !/^Cp[34]-/.test(captureId || '')) {
      eClaves.push(Captura_v2_error_('CAMPO_NO_PERMITIDO', campo, 'La agenda manual requiere captura versión 3', '§26'));
      continue;
    }

    if (campo === 'actualizacion' && presente && !/^Cp4-/.test(captureId || '')) {
      eClaves.push(Captura_v2_error_('CAMPO_NO_PERMITIDO', campo, 'La edición de ficha requiere captura V4', '§0.1'));continue;
    }

    if (campo === 'saludMental' && presente && !/^Cp4-/.test(captureId || '')) {
      eClaves.push(Captura_v2_error_('CAMPO_NO_PERMITIDO', campo, 'El indicador de salud mental requiere captura V4', '§0.1'));
      continue;
    }
    // NP para esta operación §5.1
    if (presente && indM.REQ.indexOf(accion) === -1 && indM.OPC.indexOf(accion) === -1) {
      eClaves.push(Captura_v2_error_('CAMPO_NO_PERMITIDO', campo, 'No permitido para la operación ' + accion, '§5.1'));
      continue;
    }

    // Obligatorio §8
    if (indM.REQ.indexOf(accion) !== -1 && (valor === undefined || valor === null || valor === '')) {
      eOblig.push(Captura_v2_error_('CAMPO_OBLIGATORIO_AUSENTE', campo, 'El campo es obligatorio para ' + accion, '§8'));
      continue;
    }

    // Opcional ausente §11
    if (!presente || valor === null || valor === '') {
      if (campo === 'confirmarNuevoPaciente') norm.confirmarNuevoPaciente = false;
      continue;
    }

    // Tipo §7
    var tipo = CAPTURA_V2.CAMPO_TIPO[campo];
    if (campo === 'actualizacion') {
      var ed = Captura_validarEdicion_(valor);
      if (!ed.ok) eSem.push(Captura_v2_error_('CAMPO_INVALIDO', campo, ed.motivo, '§0.1'));
      else norm.actualizacion = ed.valor;
      continue;
    }
    if (tipo === 'boolean') {
      if (typeof valor !== 'boolean') {
        eTipos.push(Captura_v2_error_('TIPO_INCORRECTO', campo, 'Debe ser booleano (true/false)', '§7'));
        continue;
      }
      norm.confirmarNuevoPaciente = valor;
      continue;
    }
    if (typeof valor !== 'string') {
      eTipos.push(Captura_v2_error_('TIPO_INCORRECTO', campo, 'Debe ser texto', '§7'));
      continue;
    }

    // Semántica §9/§10/§14.3
    if (campo === 'rut') {
      var nr = Norm_normalizarRut_(valor);
      if (nr.estado !== 'OK') {
        eSem.push(Captura_v2_error_('RUT_INVALIDO', 'rut', 'RUT con DV incorrecto o formato inválido', '§14.3'));
      } else {
        norm.rut = nr.rut;
      }
    } else if (campo === 'nombre') {
      norm.nombre = Utl_colapsarEspacios_(String(valor)).trim();
    } else if (campo === 'sexo') {
      if (CAPTURA_V2.SEXOS.indexOf(valor) === -1) {
        eSem.push(Captura_v2_error_('ENUM_INVALIDO', 'sexo', 'Valor admitido: M, F u OTRO', '§9'));
      } else {
        norm.sexo = valor;
      }
    } else if (campo === 'fechaNacimiento') {
      var rNac = Captura_v2_validarIsoFecha_(valor, { min: CFG_FECHAS.ANO_MIN_NACIMIENTO, max: CFG_FECHAS.ANO_MAX });
      if (!rNac.ok) {
        eSem.push(Captura_v2_error_('FECHA_INVALIDA', 'fechaNacimiento', 'Fecha inválida o fuera del rango 1900-2040', rNac.detalle));
      } else {
        norm.fechaNacimiento = rNac.iso;
      }
    } else if (campo === 'sector') {
      if (CAPTURA_V2.SECTORES.indexOf(valor) === -1) {
        eSem.push(Captura_v2_error_('ENUM_INVALIDO', 'sector', 'Valor admitido: AMARILLO, NARANJO o VERDE', '§9'));
      } else {
        norm.sector = valor;
      }
    } else if (campo === 'fechaIngreso') {
      var rIng = Captura_v2_validarIsoFecha_(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!rIng.ok) {
        eSem.push(Captura_v2_error_('FECHA_INVALIDA', 'fechaIngreso', 'Fecha inválida o fuera del rango 2015-2040', rIng.detalle));
      } else {
        norm.fechaIngreso = rIng.iso;
      }
    } else if (campo === 'estratificacion') {
      if (CAPTURA_V2.ESTRATIFICACIONES.indexOf(valor) === -1) {
        eSem.push(Captura_v2_error_('ENUM_INVALIDO', 'estratificacion', 'Valor admitido: G1, G2 o G3', '§9'));
      } else {
        norm.estratificacion = valor;
      }
    } else if (campo === 'telefonos') {
      var nt = Norm_normalizarTelefono_(valor);
      norm.telefonos = (nt && nt.telefonos && nt.telefonos.length) ? nt.telefonos.join('/') : '';
      // DEC-105: el normalizador separa teléfono y anotación ("esposo", "número
      // descartado"). Conservar solo los dígitos destruía la anotación: el
      // modelo tiene TELEFONO_OBS para ello y la captura no la llenaba.
      norm.telefonoObs = (nt && nt.observaciones && nt.observaciones.length)
        ? nt.observaciones.join('; ') : '';
    } else if (campo === 'proximoControl') {
      var agenda = Captura_v2_validarIsoFecha_(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!agenda.ok) eSem.push(Captura_v2_error_('FECHA_INVALIDA', campo, 'Fecha de próxima atención inválida', agenda.detalle));
      else norm.proximoControl = agenda.iso;
    } else if (campo === 'fechaEvento') {
      var rEv = Captura_v2_validarIsoFecha_(valor, { min: CFG_FECHAS.ANO_MIN, max: CFG_FECHAS.ANO_MAX });
      if (!rEv.ok) {
        eSem.push(Captura_v2_error_('FECHA_INVALIDA', 'fechaEvento', 'Fecha inválida o fuera del rango 2015-2040', rEv.detalle));
      } else {
        norm.fechaEvento = rEv.iso;
      }
    } else if (campo === 'profesional' || campo === 'profesionalSecundario') {
      var ppi = Captura_v2_normalizarProfesional_(valor);
      var esSecundario = (campo === 'profesionalSecundario');
      if (esSecundario && ppi && ppi === Captura_v2_normalizarProfesional_(norm.profesional)) {
        eSem.push(Captura_v2_error_('CAMPO_INVALIDO', 'profesionalSecundario', 'Debe ser distinto del profesional que registra', '§14.3'));
      } else if (catalogoNorm.length && catalogoNorm.indexOf(ppi) === -1) {
        eSem.push(Captura_v2_error_('ENUM_INVALIDO', campo, 'Debe ser un NOMBRE del catálogo PROFESIONALES', '§9'));
      } else {
        norm[esSecundario ? 'profesionalSecundario' : 'profesional'] = Utl_colapsarEspacios_(String(valor)).trim();
      }
    } else if (campo === 'observaciones') {
      norm.observaciones = String(valor).trim();
    } else if (campo === 'saludMental') {
      var sm = Norm_normalizarSaludMental_(valor);
      if (sm.estado === 'NO_RECONOCIDO') {
        eSem.push(Captura_v2_error_('CAMPO_INVALIDO', 'saludMental', 'Solo SI, NO o vacío (sin información)', '§9'));
      } else {
        norm.saludMental = sm.valor;
      }
    }
  }

  if (/^Cp4-/.test(captureId || '') && accion === 'actualizarDatos') {
    if (!norm.actualizacion) eOblig.push(Captura_v2_error_('CAMPO_OBLIGATORIO_AUSENTE','actualizacion','Cargue y modifique la ficha antes de guardar','§0.1'));
    if (payload.proximoControl !== undefined || payload.telefonos !== undefined) eClaves.push(Captura_v2_error_('CAMPO_NO_PERMITIDO',null,'Use los campos de la ficha para editar contacto y agenda','§0.1'));
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
function Captura_v2_marca_(norm) {
  return Form_marcadorFuente_(norm.captureId, CAPTURA_V2.LEGACY[norm.accion] || '');
}

/** PURA: TR-1 — payload V2 normalizado → campos del modelo interno. */
function Captura_v2_normalizadoAInterno_(norm, opciones) {
  opciones = opciones || {};
  var marca = opciones.marca || Captura_v2_marca_(norm);
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
    TELEFONO_OBS: norm.telefonoObs || '',   // DEC-105: la anotación también viaja
    FECHA_EVENTO: norm.fechaEvento || '',
    PROFESIONAL: norm.profesional || '',
    PROFESIONAL2: norm.profesionalSecundario || '',
    OBSERVACIONES: norm.observaciones || '',
    SALUD_MENTAL: norm.saludMental || '',
    MARCA: marca,
    marca: marca
  };
}

// ---------------------------------------------------------------------------
// Registro de captura (modelo interno de persistencia, §15)
// ---------------------------------------------------------------------------

/** PURA: registro de captura nuevo (estado inicial RECIBIDO, §15.1). */
function Captura_v2_nuevoRegistro_(norm, opciones) {
  opciones = opciones || {};
  return {
    captureId: norm.captureId,
    accion: norm.accion,
    normalizado: norm,
    canonical: Captura_v2_canonica_(norm),
    estado: CAPTURA_V2.ESTADOS.RECIBIDO,
    motivo: '',
    idInterno: '',
    idEvento: '',
    ingresoHoja: '',
    ingresoFila: '',
    reintentos: 0,
    usuario: opciones.usuario || '',
    fechaRecepcion: opciones.fechaRecepcion || '',
    // v253 (DEC-106): trazabilidad de transporte. El provider identifica el
    // canal que entregó el registro ('GOOGLE_FORMS' | 'WEBAPP_LEGACY') y
    // transportId es el id de la respuesta en el transporte (responseId del
    // Form; vacío en el canal Web App legacy). NO forman parte del payload
    // del contrato (el validador rechaza claves desconocidas).
    captureProvider: opciones.captureProvider || '',
    transportId: opciones.transportId || ''
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
function Captura_v2_enviar_(payload, ctx) {
  var c = ctx || Captura_v2_ctx_();
  if (!c || !c.usuario) {
    Captura_v2_logError_('CapturaV2', 'enviar', 'sin usuario activo (rechazo §24.1)');
    return {
      ok: false,
      errors: [Captura_v2_error_('ERROR_INTERNO', null, 'Sesión de usuario no detectada; acceso denegado', '§24.1')]
    };
  }

  var v = Captura_v2_validar_(payload, { catalogo: c.catalogo });
  if (!v.ok) return { ok: false, errors: v.errores };
  Captura_v2_medida_(c, 'T1_validar');

  var norm = v.normalizado;
  var captureId = norm.captureId;
  Captura_v2_marcaFase_(c, 'RECIBIDO');
  var canon = Captura_v2_canonica_(norm);
  var maxR = (c.maxReintentos === undefined || c.maxReintentos === null) ? FORM_CONFIG.MAX_REINTENTOS : Number(c.maxReintentos);

  var reg = Captura_v2_leerSeguro_(c, captureId);
  Captura_v2_medida_(c, 'T2_registro');
  if (reg) {
    // Caso B §13: mismo captureId con payload distinto → conflicto.
    if (reg.canonical !== canon) {
      return {
        ok: false,
        errors: [Captura_v2_error_('CONFLICTO_IDEMPOTENCIA', null, 'El captureId ya fue registrado con un payload distinto; use un captureId nuevo o reenvíe el payload original', '§13 B')]
      };
    }
    // Caso A1 §13: estado terminal → reenvía el resultado almacenado.
    if (CAPTURA_V2.TERMINALES.indexOf(reg.estado) !== -1) {
      return Captura_v2_respuestaAlmacenada_(reg);
    }
    // Caso A2 §13/§23: reintento técnico, con tope maxReintentos.
    if (CAPTURA_V2.REINTENTABLES.indexOf(reg.estado) !== -1) {
      var reint = Number(reg.reintentos) || 0;
      if (reint >= maxR) {
        var rAgotado = {
          estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'REINTENTOS_AGOTADOS',
          idInterno: '', idEvento: '', ingresoHoja: '', ingresoFila: ''
        };
        Captura_v2_trailerSeguro_(c, captureId, { estado: rAgotado.estado, motivo: rAgotado.motivo }, reg);
        Captura_v2_logError_('CapturaV2', 'enviar', captureId + ': reintentos agotados (' + maxR + ')');
        return {
          ok: false,
          errors: [Captura_v2_error_('ERROR_INTERNO', null, 'Reintentos agotados; el envío requiere revisión', '§13 maxReintentos')]
        };
      }
      reg.estado = CAPTURA_V2.ESTADOS.VALIDANDO;
      reg.reintentos = reint + 1;
      Captura_v2_trailerSeguro_(c, captureId, { estado: CAPTURA_V2.ESTADOS.VALIDANDO, reintentos: reg.reintentos }, reg);
      if (reg.ingresoHoja && reg.ingresoFila && !norm.proximoControl) {
        try {
          var est = Form_leerFilaIngreso_(reg.ingresoHoja, Number(reg.ingresoFila));
          if (est && est.estado && est.estado !== '' && est.estado !== 'ERROR') {
            var mapeado = Form_mapearResultadoFila_(est.estado, est.nota);
            var idInt = reg.idInterno || est.idInterno || Captura_v2_buscarIdInternoPorRut_(norm.rut);
            var idEvFast = reg.idEvento || est.idEvento || '';
            // §17: fast-path tampoco devuelve un PROCESADO sin identidad.
            var fastIds = Captura_v2_completarIds_(mapeado.estado, idInt, idEvFast, Captura_v2_marca_(norm));
            if (fastIds.motivo && !mapeado.motivo) mapeado.motivo = fastIds.motivo;
            mapeado.estado = fastIds.estado;
            idInt = fastIds.idInterno;
            idEvFast = fastIds.idEvento;
            var entregaFast = {
              estado: mapeado.estado, motivo: mapeado.motivo || '',
              idInterno: idInt, idEvento: idEvFast,
              ingresoHoja: reg.ingresoHoja, ingresoFila: reg.ingresoFila,
              resultadoTrailer: { ok: true }
            };
            Captura_v2_trailerSeguro_(c, captureId, {
              estado: mapeado.estado, motivo: mapeado.motivo || '',
              idInterno: idInt, idEvento: idEvFast,
              ingresoHoja: reg.ingresoHoja, ingresoFila: reg.ingresoFila
            }, reg);
            Captura_v2_medida_(c, 'T5_entrega_fin');
            Captura_v2_logInfo_('CapturaV2', 'enviar', captureId + ': A2 fast-path (fila ya procesada: ' + est.estado + ')');
            return Captura_v2_respuestaEntrega_(norm, entregaFast);
          }
        } catch (_eFast) {
          // El fallthrough al pipeline completo está protegido por `previoA2`
          // (no duplica); faltaba la traza del motivo.
          Captura_v2_logError_('CapturaV2', 'A2_fastpath', captureId + ': ' + String(_eFast));
        }
      }
      var previoA2 = { hoja: reg.ingresoHoja, fila: reg.ingresoFila, regExiste: true };
      var entregaA2 = Captura_v2_ejecutarEntrega_(norm, c, captureId, previoA2, reg);
      Captura_v2_medida_(c, 'T5_entrega_fin');
      if (entregaA2.estado === CAPTURA_V2.ESTADOS.ERROR) {
        return { ok: false, errors: [Captura_v2_errorEntrega_(entregaA2.motivo)] };
      }
      Captura_v2_marcaFase_(c, entregaA2.estado);
      return Captura_v2_respuestaEntrega_(norm, entregaA2);
    }
    // Estado inesperado (defensa; no debería ocurrir).
    return {
      ok: false,
      errors: [Captura_v2_error_('ERROR_INTERNO', null, 'El envío queda para revisión', reg.motivo || reg.estado)]
    };
  }

  // Envío nuevo: primero persistencia durable del registro §15.1/§15.2.
  var nuevo = Captura_v2_nuevoRegistro_(norm, {
    usuario: c.usuario, fechaRecepcion: (c.ahora ? c.ahora() : ''),
    captureProvider: c.captureProvider || c.provider || '',
    transportId: c.transportId || c.transportResponseId || ''
  });
  var pers;
  try {
    pers = c.persistirRegistro(nuevo);
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'Persistencia', String(e));
    return { ok: false, errors: [Captura_v2_error_('ERROR_INTERNO', null, 'No fue posible registrar el envío', '§15.2')] };
  }
  if (!pers || !pers.ok) {
    // `CONFIRMACION_FALLIDA` significa que la fila YA está escrita y solo falló
    // la relectura: el registro existe y el reenvío con el mismo captureId lo
    // recupera (A2). Antes se perdía el motivo real y no quedaba traza alguna.
    Captura_v2_logError_('CapturaV2', 'Persistencia',
      captureId + ': registro no confirmado (' + ((pers && pers.motivo) || 'sin_motivo') + ')');
    return { ok: false, errors: [Captura_v2_error_('ERROR_INTERNO', null, 'No fue posible registrar el envío', '§15.2')] };
  }
  Captura_v2_medida_(c, 'T3_persistir');
      Captura_v2_marcaFase_(c, 'PERSISTIDO');
  // Prima el cache del trailer: evita un segundo escaneo de FORM_RESPUESTAS §15.
  if (pers.filaFisica) {
    Captura_v2_regDesdeCache_(c, captureId, { captureId: captureId, filaFisica: Number(pers.filaFisica) || 0 });
  }

  Captura_v2_medida_(c, 'T4_entrega_inicio');
  var entrega = Captura_v2_ejecutarEntrega_(norm, c, captureId, {}, null);
  Captura_v2_medida_(c, 'T5_entrega_fin');
  if (entrega.estado === CAPTURA_V2.ESTADOS.ERROR) {
    return { ok: false, errors: [Captura_v2_errorEntrega_(entrega.motivo)] };
  }
  Captura_v2_marcaFase_(c, entrega.estado);
  return Captura_v2_respuestaEntrega_(norm, entrega);
}

/** Núcleo: consulta de estado de un envío (respuesta §16 o §17). */
function Captura_v2_estado_(captureId, ctx) {
  var c = ctx || Captura_v2_ctx_();
  if (!captureId || typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    return { ok: false, errors: [Captura_v2_error_('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp4- (o Cp3-/Cp2- anteriores) seguido de 32 caracteres hex minúsculos', '§12')] };
  }
  var reg = Captura_v2_leerSeguro_(c, captureId);
  if (!reg) {
    return { ok: false, errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'No existe un registro para el captureId indicado', '§20')] };
  }
  return Captura_v2_respuestaAlmacenada_(reg);
}

/**
 * Núcleo: reprocesamiento administrativo §23.
 * Reinicia estados NO terminales a VALIDANDO. Nunca PROCESADO.
 */
function Captura_v2_reprocesar_(captureId, ctx) {
  var c = ctx || Captura_v2_ctx_();
  if (!captureId || typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    return { ok: false, errors: [Captura_v2_error_('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp4- (o Cp3-/Cp2- anteriores) seguido de 32 caracteres hex minúsculos', '§12')] };
  }
  var reg = Captura_v2_leerSeguro_(c, captureId);
  if (!reg) {
    return { ok: false, errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'No existe un registro para el captureId indicado', '§20')] };
  }
  if (reg.estado === CAPTURA_V2.ESTADOS.PROCESADO) {
    return {
      ok: false,
      errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'PROCESADO es terminal: no se reinicia', '§23')]
    };
  }
  if (CAPTURA_V2_REPROCESABLES.indexOf(reg.estado) === -1) {
    return {
      ok: false,
      errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'Estado no reiniciable por reprocesamiento', reg.estado)]
    };
  }
  var cambios = { estado: CAPTURA_V2.ESTADOS.VALIDANDO, motivo: 'REPROCESO_ADMIN' };
  Captura_v2_trailerSeguro_(c, captureId, cambios);
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
function Captura_v2_retomarRegistro_(captureId, ctx) {
  var c = ctx || Captura_v2_ctx_();
  if (!captureId || typeof captureId !== 'string' || !CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    return { ok: false, errors: [Captura_v2_error_('SINTAXIS_INVALIDA', 'captureId', 'Formato válido: Cp4- (o Cp3-/Cp2- anteriores) seguido de 32 caracteres hex minúsculos', '§12')] };
  }
  var reg = Captura_v2_leerSeguro_(c, captureId);
  if (!reg) {
    return { ok: false, errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'No existe un registro para el captureId indicado', '§20')] };
  }
  if (reg.estado === CAPTURA_V2.ESTADOS.PROCESADO) {
    return { ok: false, errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'PROCESADO es terminal: no se retoma', '§23')] };
  }
  if (CAPTURA_V2_RETOMABLES.indexOf(reg.estado) === -1) {
    return { ok: false, errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'Estado no retomable por el procesador V2', reg.estado)] };
  }
  var norm = reg.normalizado;
  if (!norm || !norm.accion) {
    return { ok: false, errors: [Captura_v2_error_('CAMPO_INVALIDO', 'captureId', 'Sin payload normalizado almacenado (TRAZA_CRUDA); usar reprocesamiento manual', '§23')] };
  }
  Captura_v2_trailerSeguro_(c, captureId, { estado: CAPTURA_V2.ESTADOS.VALIDANDO, motivo: 'RETOMA_ADMIN' }, reg);
  var previo = (reg.ingresoHoja && reg.ingresoFila) ? { hoja: reg.ingresoHoja, fila: reg.ingresoFila, regExiste: true } : { regExiste: true };
  var entrega = Captura_v2_ejecutarEntrega_(norm, c, captureId, previo, reg);
  Captura_v2_medida_(c, 'T5_entrega_fin');
  if (entrega.estado === CAPTURA_V2.ESTADOS.ERROR) {
    return { ok: false, errors: [Captura_v2_errorEntrega_(entrega.motivo)] };
  }
  return Captura_v2_respuestaEntrega_(norm, entrega);
}

// ---------------------------------------------------------------------------
// Helpers del núcleo (respuestas y orquestación de la entrega)
// ---------------------------------------------------------------------------

/** Respuesta §16 a partir de un registro almacenado (caso A1). */
function Captura_v2_respuestaAlmacenada_(reg) {
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
function Captura_v2_respuestaEntrega_(norm, entrega) {
  if (entrega.estado === CAPTURA_V2.ESTADOS.ERROR) {
    return { ok: false, errors: [Captura_v2_errorEntrega_(entrega.motivo)] };
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
function Captura_v2_regDesdeCache_(c, captureId, reg) {
  c._capturaV2Memo = c._capturaV2Memo || {};
  if (reg === undefined) return c._capturaV2Memo[captureId];
  if (reg === null) delete c._capturaV2Memo[captureId];
  else c._capturaV2Memo[captureId] = reg;
}

/** Lee el registro con defensa ante fallo de I/O y cache por request (§15). */
function Captura_v2_leerSeguro_(c, captureId) {
  var cacheado = (typeof Captura_v2_regDesdeCache_ === 'function') ? Captura_v2_regDesdeCache_(c, captureId) : undefined;
  if (cacheado !== undefined) return cacheado;
  var reg;
  try {
    reg = c.buscarRegistro(captureId);
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'buscarRegistro', String(e));
    reg = null;
  }
  if (reg) Captura_v2_regDesdeCache_(c, captureId, reg);
  return reg;
}

/** Escribe el trailer con defensa ante fallo de I/O (eventualidad §15.3). */
function Captura_v2_trailerSeguro_(c, captureId, cambios, reg) {
  if (!c.actualizarTrailer) return { ok: false };
  try {
    return c.actualizarTrailer(captureId, cambios, reg) || { ok: false };
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'actualizarTrailer', String(e));
    return { ok: false };
  }
}

/** Orquesta la entrega TR-2 y persiste el resultado en el trailer del registro. */
function Captura_v2_ejecutarEntrega_(norm, c, captureId, previo, reg) {
  var opcionesEntrega = {
    marca: Captura_v2_marca_(norm),
    captureId: captureId,
    usuario: c.usuario,
    acceso: c.acceso || '',
    previo: previo || {},
    regExiste: !!(previo && previo.regExiste)
  };
  var resultado = null;
  try {
    resultado = c.entregar(norm, opcionesEntrega) || {};
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'entregar', String(e));
    resultado = { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ENTREGA_FALLO_INTERNO' };
  }
  // §17: un PROCESADO no puede quedar con identidad incompleta. Se completa
  // desde la marca durable o se degrada ANTES de la agenda/contacto/trailer.
  var idsProc = Captura_v2_completarIds_(
    resultado.estado, resultado.idInterno || '', resultado.idEvento || '',
    opcionesEntrega.marca);
  if (idsProc.motivo && !resultado.motivo) resultado.motivo = idsProc.motivo;
  resultado.estado = idsProc.estado;
  resultado.idInterno = idsProc.idInterno;
  resultado.idEvento = idsProc.idEvento;
  // Agenda manual en la misma entrega: si falla queda reintentable, nunca un
  // falso PROCESADO. La marca existente evita recrear paciente/evento al retomar.
  if (resultado.estado === CAPTURA_V2.ESTADOS.PROCESADO && norm.proximoControl) {
    var agendaOk = false;
    try {
      var agenda = c.aplicarAgenda && c.aplicarAgenda(resultado.idInterno, norm.proximoControl);
      agendaOk = !!(agenda && agenda.ok);
    } catch (eAgenda) {
      // El evento/ingreso clínico YA se escribió; la agenda es una segunda
      // escritura sobre PACIENTES. Antes la excepción se descartaba y solo
      // quedaba 'AGENDA_NO_GUARDADA', sin causa ni referencia.
      Captura_v2_logError_('CapturaV2', 'aplicarAgenda',
        norm.captureId + ' → ' + String(eAgenda));
      agendaOk = false;
    }
    if (!agendaOk) { resultado.estado = CAPTURA_V2.ESTADOS.ERROR; resultado.motivo = 'AGENDA_NO_GUARDADA'; }
  }
  // DEC-105: anotación de contacto (TELEFONO_OBS). INGRESO_* no tiene columna
  // para ella, así que se aplica sobre PACIENTES tras la entrega clínica, con
  // la misma semántica que la agenda: si falla, la entrega NO queda PROCESADO.
  var contactoCampos = {};
  if (norm.telefonoObs) contactoCampos.TELEFONO_OBS = norm.telefonoObs;
  if (resultado.estado === CAPTURA_V2.ESTADOS.PROCESADO && resultado.idInterno &&
      c.aplicarContacto && Object.keys(contactoCampos).length) {
    var contactoOk = false;
    try {
      var cr = c.aplicarContacto(resultado.idInterno, contactoCampos);
      contactoOk = !!(cr && cr.ok);
    } catch (eContacto) {
      Captura_v2_logError_('CapturaV2', 'aplicarContacto',
        norm.captureId + ' → ' + String(eContacto));
      contactoOk = false;
    }
    if (!contactoOk) {
      resultado.estado = CAPTURA_V2.ESTADOS.ERROR;
      resultado.motivo = 'CONTACTO_NO_GUARDADO';
    }
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
  var resT = Captura_v2_trailerSeguro_(c, captureId, trailer, reg);
  if (estado === CAPTURA_V2.ESTADOS.ERROR) {
    Captura_v2_logError_('CapturaV2', 'entregar', captureId + ': ' + (resultado.motivo || 'ERROR'));
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
function Captura_v2_usuarioActual_() {
  try {
    if (typeof Session !== 'undefined' && Session.getActiveUser) {
      var u = Session.getActiveUser().getEmail();
      return u || '';
    }
  } catch (e) { /* sin sesión → acceso denegado en §24.1 */ }
  return '';
}

/** GAS: fecha de recepción (ISO con hora local). */
function Captura_v2_ahora_() {
  return Form_aIsoConHora_(new Date());
}

/** Construye el registro de captura desde una única fila física. */
function Captura_v2_registroDesdeFila_(captureId, fila, headers, filaFisica) {
  var mapa = Form_mapeoEncabezados_(headers);
  var crudo = '';
  if (mapa.idx.TRAZACRUDA !== undefined) crudo = Utl_texto_(fila[mapa.idx.TRAZACRUDA]);
  var normalizado = null;
  try { if (crudo) normalizado = JSON.parse(crudo); } catch (e) { normalizado = null; }
  return {
    captureId: captureId,
    accion: (normalizado && normalizado.accion) ? normalizado.accion : CAPTURA_V2.V2[Utl_texto_(fila[mapa.idx.ACCION !== undefined ? mapa.idx.ACCION : 0])] || '',
    normalizado: normalizado,
    canonical: normalizado ? Captura_v2_canonica_(normalizado) : '',
    estado: mapa.idx.ESTADO !== undefined ? Utl_texto_(fila[mapa.idx.ESTADO]).toUpperCase() : CAPTURA_V2.ESTADOS.RECIBIDO,
    motivo: mapa.idx.MOTIVO !== undefined ? Utl_texto_(fila[mapa.idx.MOTIVO]) : '',
    idInterno: mapa.idx.IDINTERNO !== undefined ? Utl_texto_(fila[mapa.idx.IDINTERNO]) : '',
    idEvento: mapa.idx.IDEVENTO !== undefined ? Utl_texto_(fila[mapa.idx.IDEVENTO]) : '',
    reintentos: mapa.idx.REINTENTOS !== undefined ? (Number(fila[mapa.idx.REINTENTOS]) || 0) : 0,
    ingresoHoja: mapa.idx.INGRESOHOJA !== undefined ? Utl_texto_(fila[mapa.idx.INGRESOHOJA]) : '',
    ingresoFila: mapa.idx.INGRESOFILA !== undefined ? Utl_texto_(fila[mapa.idx.INGRESOFILA]) : '',
    filaFisica: filaFisica,
    fechaIngreso: mapa.idx.FECHAINGRESO !== undefined ? Utl_texto_(fila[mapa.idx.FECHAINGRESO]) : ''
  };
}

/** Lookup puntual normal: header + TextFinder en RESPONSE_ID + fila objetivo. */
function Captura_v2_buscarRegistroRapido_(captureId) {
  var hoja = Modelo_hoja_(HOJAS.FORM_RESPUESTAS);
  if (!hoja || hoja.getLastRow() < 2) return null;
  var ultimac = hoja.getLastColumn();
  var headers = hoja.getRange(1, 1, 1, ultimac).getValues()[0];
  var mapa = Form_mapeoEncabezados_(headers);
  var colRid = mapa.idx.RESPONSEID !== undefined ? mapa.idx.RESPONSEID
    : (mapa.idx.RESPONSE_ID !== undefined ? mapa.idx.RESPONSE_ID : -1);
  if (colRid < 0) return null;
  var n = hoja.getLastRow() - 1;
  var hallado = hoja.getRange(2, colRid + 1, n, 1).createTextFinder(captureId)
    .matchEntireCell(true).findNext();
  if (!hallado) return null;
  var nf = hallado.getRow();
  var fila = hoja.getRange(nf, 1, 1, ultimac).getValues()[0];
  return Captura_v2_registroDesdeFila_(captureId, fila, headers, nf);
}

/** GAS: lee el registro por captureId mediante la ruta puntual obligatoria. */
function Captura_v2_buscarRegistro_(captureId) {
  return Captura_v2_buscarRegistroRapido_(captureId);
}

/**
 * Barrera autoritativa de identidad para el escritor durable.
 * Nunca convierte un fallo de lectura/esquema en "libre".
 * @returns {{estado:'LIBRE'|'DUPLICADO'|'LOOKUP_FAILED',registro?:Object,motivo?:string}}
 */
function Captura_v2_comprobarCaptureIdLibre_(hoja, captureId) {
  try {
    if (!hoja) throw new Error('HOJA_FORM_RESPUESTAS_AUSENTE');
    var ultimaFila = hoja.getLastRow();
    var ultimaColumna = hoja.getLastColumn();
    if (ultimaColumna < 1) throw new Error('ESQUEMA_CAPTURA_SIN_ENCABEZADOS');
    var headers = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
    var mapa = Form_mapeoEncabezados_(headers);
    var idxRid = mapa.idx.RESPONSEID !== undefined ? mapa.idx.RESPONSEID
      : (mapa.idx.RESPONSE_ID !== undefined ? mapa.idx.RESPONSE_ID : -1);
    if (idxRid < 0) throw new Error('ESQUEMA_CAPTURA_SIN_RESPONSE_ID');
    if (ultimaFila < 2) return { estado: 'LIBRE' };
    var rango = hoja.getRange(2, idxRid + 1, ultimaFila - 1, 1);
    var hallado = null;
    if (rango && typeof rango.createTextFinder === 'function') {
      hallado = rango.createTextFinder(captureId).matchEntireCell(true).findNext();
    } else {
      // Compatibilidad con adaptadores/mocks: una sola lectura columnar, nunca
      // un getRange por fila. Cualquier error se propaga como LOOKUP_FAILED.
      var ids = rango.getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(captureId)) {
          hallado = { getRow: (function (fila) { return function () { return fila; }; })(i + 2) };
          break;
        }
      }
    }
    if (!hallado) return { estado: 'LIBRE' };
    var nf = hallado.getRow();
    var fila = hoja.getRange(nf, 1, 1, ultimaColumna).getValues()[0];
    return { estado: 'DUPLICADO', registro: Captura_v2_registroDesdeFila_(captureId, fila, headers, nf) };
  } catch (e) {
    return { estado: 'LOOKUP_FAILED', motivo: e && e.message ? e.message : String(e) };
  }
}

/** Auditoría administrativa separada del camino caliente de captura. */
function Captura_diagnosticarCaptureIdsDuplicados_() {
  var hoja = Modelo_hoja_(HOJAS.FORM_RESPUESTAS);
  if (!hoja || hoja.getLastRow() < 2) return { total: 0, duplicados: 0, filasDuplicadas: 0 };
  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var mapa = Form_mapeoEncabezados_(headers);
  var idx = mapa.idx.RESPONSEID !== undefined ? mapa.idx.RESPONSEID
    : (mapa.idx.RESPONSE_ID !== undefined ? mapa.idx.RESPONSE_ID : -1);
  if (idx < 0) return { total: 0, duplicados: 0, filasDuplicadas: 0, esquemaIncompleto: true };
  var n = hoja.getLastRow() - 1, vistos = {}, grupos = 0, filas = 0;
  hoja.getRange(2, idx + 1, n, 1).getValues().forEach(function (r) {
    var id = Utl_texto_(r[0]);
    if (!id) return;
    vistos[id] = (vistos[id] || 0) + 1;
  });
  Object.keys(vistos).forEach(function (id) {
    if (vistos[id] > 1) { grupos++; filas += vistos[id] - 1; }
  });
  return { total: Object.keys(vistos).length, duplicados: grupos, filasDuplicadas: filas };
}

/** Esquema físico real: admite columnas adicionales sin mover datos existentes.
 * Rechaza encabezados obligatorios ausentes o duplicados antes de escribir.
 * v253 (DEC-106): antes de comparar, garantiza las dos columnas de transporte
 * (CAPTURE_PROVIDER, TRANSPORT_RESPONSE_ID) anexadas al final, de forma
 * idempotente, para que hojas creadas pre-v253 (26 columnas) migren sin
 * tocar sus datos. Cualquier otra ausencia/duplicado sigue siendo
 * ESQUEMA_CAPTURA_INCOMPATIBLE. */
function Captura_v2_columnasHoja_(hoja) {
  Captura_v2_asegurarColumnasTransporte_(hoja);
  var columnas = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var claves = columnas.map(Utl_claveAlnum_);
  Form_columnas_().forEach(function (nombre) {
    var clave = Utl_claveAlnum_(nombre);
    if (claves.indexOf(clave) === -1 || claves.indexOf(clave) !== claves.lastIndexOf(clave)) {
      throw new Error('ESQUEMA_CAPTURA_INCOMPATIBLE: ' + nombre);
    }
  });
  return columnas.map(function (nombre) {
    var clave = Utl_claveAlnum_(nombre);
    return Form_columnas_().filter(function (c) { return Utl_claveAlnum_(c) === clave; })[0] || nombre;
  });
}

/** v253: anexa al final de la hoja las columnas de transporte faltantes
 *  (CAPTURE_PROVIDER, TRANSPORT_RESPONSE_ID). Idempotente y de SOLO encabezado:
 *  nunca reescribe ni desplaza datos de columnas previas. Si la hoja no tiene
 *  encabezados aún, la inicializa con el esquema completo de Form_columnas_(). */
function Captura_v2_asegurarColumnasTransporte_(hoja) {
  if (!hoja) return;
  var disponibles = ['CAPTURE_PROVIDER', 'TRANSPORT_RESPONSE_ID'];
  var ultima = hoja.getLastColumn();
  if (!ultima) {
    try { hoja.getRange(1, 1, 1, Form_columnas_().length).setValues([Form_columnas_()]); } catch (e) { /* hoja sin acceso */ }
    return;
  }
  var enc = hoja.getRange(1, 1, 1, ultima).getValues()[0] || [];
  var claves = [];
  for (var i = 0; i < enc.length; i++) claves.push(Utl_claveAlnum_(enc[i]));
  var faltantes = [];
  disponibles.forEach(function (nombre) {
    if (claves.indexOf(Utl_claveAlnum_(nombre)) === -1) faltantes.push(nombre);
  });
  if (!faltantes.length) return;
  try {
    var filaCabecera = enc.slice();
    filaCabecera.length = ultima; // preserva el ancho real (no recorta)
    hoja.getRange(1, ultima + 1, 1, faltantes.length).setValues([faltantes]);
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'asegurarColumnasTransporte', String(e));
  }
}

/** GAS: persiste el registro de captura (fila RECIBIDO) con confirmación §15. */
function Captura_v2_persistirRegistro_(reg) {
  try {
    var hoja = Modelo_hoja_(HOJAS.FORM_RESPUESTAS);
    if (!hoja) return { ok: false, motivo: 'HOJA_FORM_RESPUESTAS_AUSENTE' };
    var cols = Captura_v2_columnasHoja_(hoja);
    var mapa = {};
    for (var i = 0; i < cols.length; i++) mapa[cols[i]] = i;
    // Una sola barrera autoritativa: si no puede demostrar libertad, no escribe.
    var identidad = Captura_v2_comprobarCaptureIdLibre_(hoja, reg.captureId);
    if (identidad.estado === 'DUPLICADO') return { ok: false, motivo: 'CAPTUREID_DUPLICADO' };
    if (identidad.estado !== 'LIBRE') {
      Captura_v2_logError_('CapturaV2', 'comprobarCaptureId', identidad.motivo || identidad.estado);
      return { ok: false, motivo: 'CAPTUREID_LOOKUP_FAILED', reintentable: true };
    }
    var fila = new Array(cols.length);
    for (var i2 = 0; i2 < cols.length; i2++) fila[i2] = '';
    fila[mapa.FECHA_FORMS] = reg.fechaRecepcion || Captura_v2_ahora_();
    fila[mapa.RESPONSE_ID] = reg.captureId;
    fila[mapa.FORM_VERSION] = Number(reg.captureId.charAt(2));
    fila[mapa.USUARIO] = reg.usuario || '';
    var internos = Captura_v2_normalizadoAInterno_(reg.normalizado, {});
    var parEs = [['ACCION', internos.ACCION], ['RUT', internos.RUT], ['NOMBRE', internos.NOMBRE], ['SEXO', internos.SEXO], ['FECHA_NACIMIENTO', internos.FECHA_NACIMIENTO], ['SECTOR', internos.SECTOR], ['FECHA_INGRESO', internos.FECHA_INGRESO], ['ESTRATIFICACION', internos.ESTRATIFICACION], ['TELEFONOS', internos.TELEFONOS], ['FECHA_EVENTO', internos.FECHA_EVENTO], ['PROFESIONAL', internos.PROFESIONAL], ['PROFESIONAL2', internos.PROFESIONAL2], ['OBSERVACIONES', internos.OBSERVACIONES]];
    for (var j = 0; j < parEs.length; j++) {
      if (mapa[parEs[j][0]] !== undefined) fila[mapa[parEs[j][0]]] = parEs[j][1];
    }
    fila[mapa.TRAZA_CRUDA] = JSON.stringify(reg.normalizado);
    // v253 (DEC-106): transporte del registro (solo si la columna existe).
    if (mapa.CAPTURE_PROVIDER !== undefined) fila[mapa.CAPTURE_PROVIDER] = reg.captureProvider || '';
    if (mapa.TRANSPORT_RESPONSE_ID !== undefined) fila[mapa.TRANSPORT_RESPONSE_ID] = reg.transportId || '';
    if (mapa.REINTENTOS !== undefined) fila[mapa.REINTENTOS] = reg.reintentos || 0;
    fila[mapa.ESTADO] = reg.estado || CAPTURA_V2.ESTADOS.RECIBIDO;
    var filaNueva = hoja.getLastRow() + 1;
    if (typeof Hojas_asegurarCapacidadGestionada_ === 'function')
      Hojas_asegurarCapacidadGestionada_(hoja, filaNueva, { bloque: 200 });
    hoja.getRange(filaNueva, 1, 1, cols.length).setValues([fila]);
    // Confirmación durable §15 sobre exactamente la fila escrita.
    var confirmacion = Captura_v2_confirmarFila_(hoja, filaNueva, reg.captureId, {
      estado: reg.estado || CAPTURA_V2.ESTADOS.RECIBIDO,
      captureProvider: reg.captureProvider || '', transportId: reg.transportId || ''
    });
    return confirmacion.ok ? { ok: true, filaFisica: filaNueva } : { ok: false, motivo: 'CONFIRMACION_FALLIDA' };
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'persistirRegistro', String(e));
    return { ok: false, motivo: 'EXCEPCION' };
  }
}

/** GAS: confirma (relectura) que la fila quedó con RESPONSE_ID y ESTADO. */
function Captura_v2_confirmarFila_(hoja, filaFisica, captureId, esperado) {
  try {
    esperado = esperado || {};
    filaFisica = Number(filaFisica);
    if (!filaFisica || filaFisica < 2) return { ok: false, motivo: 'FILA_ESPERADA_INVALIDA' };
    var ultimac = hoja.getLastColumn();
    var datos = hoja.getRange(filaFisica, 1, 1, ultimac).getValues()[0];
    var mapa = Form_mapeoEncabezados_(hoja.getRange(1, 1, 1, ultimac).getValues()[0]);
    var colRid = mapa.idx.RESPONSEID !== undefined ? mapa.idx.RESPONSEID : (mapa.idx.RESPONSE_ID !== undefined ? mapa.idx.RESPONSE_ID : 0);
    var rid = Utl_texto_(datos[colRid]);
    var est = mapa.idx.ESTADO !== undefined ? Utl_texto_(datos[mapa.idx.ESTADO]).toUpperCase() : '';
    var ok = rid === captureId && est !== '';
    if (esperado.estado) ok = ok && est === Utl_texto_(esperado.estado).toUpperCase();
    if (mapa.idx.CAPTUREPROVIDER !== undefined && esperado.captureProvider)
      ok = ok && Utl_texto_(datos[mapa.idx.CAPTUREPROVIDER]) === Utl_texto_(esperado.captureProvider);
    if (mapa.idx.TRANSPORTRESPONSEID !== undefined && esperado.transportId)
      ok = ok && Utl_texto_(datos[mapa.idx.TRANSPORTRESPONSEID]) === Utl_texto_(esperado.transportId);
    return { ok: ok, filaFisica: filaFisica, motivo: ok ? '' : 'FILA_DIVERGENTE' };
  } catch (e) {
    // Sin traza, un fallo transitorio de lectura tras un setValues exitoso
    // producía CONFIRMACION_FALLIDA sin ninguna pista en la hoja LOG.
    Captura_v2_logError_('CapturaV2', 'confirmarFila', captureId + ': ' + String(e));
    return { ok: false, filaFisica: filaFisica, motivo: 'LECTURA_CONFIRMACION_FALLIDA' };
  }
}

/** GAS: actualiza el trailer del registro (INGRESO_HOJA..FECHA_PROCESO) por encabezado. */
function Captura_v2_actualizarTrailer_(captureId, cambios, reg) {
  try {
    var hoja = Modelo_hoja_(HOJAS.FORM_RESPUESTAS);
    if (!hoja) return { ok: false, motivo: 'HOJA_FORM_RESPUESTAS_AUSENTE' };
    if (!reg || !reg.filaFisica) {
      var encontrado = Captura_v2_buscarRegistro_(captureId);
      reg = (encontrado && encontrado.filaFisica) ? encontrado : reg;
      if (!reg || !reg.filaFisica) return { ok: false, motivo: 'SIN_REGISTRO' };
    }
    var cols = Captura_v2_columnasHoja_(hoja);
    var mapa = {};
    for (var i = 0; i < cols.length; i++) mapa[cols[i]] = i;
    var idxRid = mapa.RESPONSE_ID !== undefined ? mapa.RESPONSE_ID : (mapa.RESPONSEID !== undefined ? mapa.RESPONSEID : -1);
    var trailerCols = ['INGRESO_HOJA', 'INGRESO_FILA', 'REINTENTOS', 'ESTADO', 'MOTIVO', 'ID_INTERNO', 'ID_EVENTO', 'FECHA_PROCESO'];
    var indices = trailerCols.map(function (c) { return mapa[c]; });
    var ini = Math.min.apply(null, indices), fin = Math.max.apply(null, indices);
    var ancho = fin - ini + 1;
    var offset = {};
    for (var t = 0; t < trailerCols.length; t++) offset[trailerCols[t]] = mapa[trailerCols[t]] - ini;
    var valores = {
      INGRESO_HOJA: cambios.ingresoHoja, INGRESO_FILA: cambios.ingresoFila,
      REINTENTOS: cambios.reintentos, ESTADO: cambios.estado, MOTIVO: cambios.motivo,
      ID_INTERNO: cambios.idInterno, ID_EVENTO: cambios.idEvento,
      FECHA_PROCESO: (cambios.fechaProceso !== undefined) ? cambios.fechaProceso : Captura_v2_ahora_()
    };
    // Revalidación §21: la fila objetivo debe contener exactamente este captureId.
    function escribirTrailer(filaFisica) {
      if (idxRid >= 0) {
        var ridActual = Utl_texto_(hoja.getRange(filaFisica, idxRid + 1, 1, 1).getValues()[0][0]);
        if (ridActual !== captureId) {
          return { ok: false, motivo: 'CAPTUREID_DIVERGENTE' };
        }
      }
      var bloque = hoja.getRange(filaFisica, ini + 1, 1, ancho).getValues()[0];
      for (var k in offset) {
        if (valores[k] !== undefined && offset.hasOwnProperty(k)) bloque[offset[k]] = valores[k];
      }
      hoja.getRange(filaFisica, ini + 1, 1, ancho).setValues([bloque]);
      // Confirmación por relectura §15: el estado escrito debe verificarse.
      var relee = hoja.getRange(filaFisica, ini + 1, 1, ancho).getValues()[0];
      var okEstado = cambios.estado === undefined || Utl_texto_(relee[offset.ESTADO]).toUpperCase() === Utl_texto_(cambios.estado).toUpperCase();
      return okEstado ? { ok: true } : { ok: false, motivo: 'CONFIRMACION_TRAILER_FALLIDA' };
    }
    var primerIntento = escribirTrailer(Number(reg.filaFisica));
    if (primerIntento.motivo === 'CAPTUREID_DIVERGENTE') {
      // Caso fila reutilizada: A estaba en fila X, la hoja cambió y X ahora es
      // de B. NO se escribe sobre B: se relocaliza por captureId (durable) y se
      // reescribe una sola vez sobre la fila real de A.
      var reencontrado = null;
      try { reencontrado = Captura_v2_buscarRegistro_(captureId); } catch (eReloc) { reencontrado = null; }
      if (reencontrado && Number(reencontrado.filaFisica) > 0 &&
          Number(reencontrado.filaFisica) !== Number(reg.filaFisica)) {
        Captura_v2_logAux_('actualizarTrailer', captureId + ': DIVERGENTE fila ' + reg.filaFisica +
          ' → relocalizado a fila ' + reencontrado.filaFisica);
        return escribirTrailer(Number(reencontrado.filaFisica));
      }
    }
    return primerIntento;
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'actualizarTrailer', String(e));
    return { ok: false, motivo: 'EXCEPCION' };
  }
}

// ---------------------------------------------------------------------------
// Entrega TR-2 (§21, §22) — reutiliza el pipeline existente, jamás lo duplica
// ---------------------------------------------------------------------------

function Captura_v2_pacientesEnMemoria_() {
  return Modelo_leerPacientes_();
}

/** GAS: busca persona en PACIENTES por RUT canónico exacto. */
function Captura_v2_buscarPersonaPorRut_(rut) {
  if (typeof Modelo_buscarPacientePorRut_ === 'function') {
    var puntual = Modelo_buscarPacientePorRut_(rut);
    return puntual ? puntual.obj : null;
  }
  var pacientes = Captura_v2_pacientesEnMemoria_();
  var objetivo = Utl_texto_(rut);
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto_(pacientes[i].RUT) === objetivo) return pacientes[i];
  }
  return null;
}

/** GAS: idInterno de la persona por RUT (tras el pipeline de ingreso). */
function Captura_v2_buscarIdInternoPorRut_(rut) {
  var p = Captura_v2_buscarPersonaPorRut_(rut);
  return p ? Utl_texto_(p.ID_INTERNO) : '';
}

/** GAS: evento ya entregado para esta marca (§22 protección de efectos).
 *  Es «durable» si existe la marca con su EVENTO real. Se aceptan DOS formatos
 *  de FUENTE, ambos con la MISMA identidad durable (captureId):
 *    - marca completa `FORM|<captureId>|<ACCIÓN>` (eventos manuales de ficha y
 *      el formato canónico de Captura V2), y
 *    - captureId DESNUDO (`Cp4-…`), que es lo que el pipeline INGRESO escribe
 *      realmente vía Fuentes_fuenteOrigen_ (03_Fuentes.js:90-97).
 *  La recuperación §17 no debe depender del token de acción de la marca. */
function Captura_v2_marcaEnEventos_(marca) {
  if (!marca || typeof Eventos_buscarPorFuente_ !== 'function') return null;
  var ev = Eventos_buscarPorFuente_(marca);
  if (ev) return ev;
  var cid = Captura_v2_captureIdDesdeMarca_(marca);
  return cid ? (Eventos_buscarPorFuente_(cid) || null) : null;
}

/** PURA: captureId extraíble de una marca 'FORM|CpN-…|<ACCIÓN>'. Igual criterio
 *  que Ingresos_captureIdDesdeMarca_ (12_Ingresos.js:44) para no divergir del
 *  formato que el pipeline realmente persiste como FUENTE desnuda. */
function Captura_v2_captureIdDesdeMarca_(marca) {
  var m = Utl_texto_(marca).trim();
  var partes = m.split('|');
  if (partes.length < 2) return '';
  if (Utl_texto_(partes[0]).toUpperCase() !== 'FORM') return '';
  var cap = Utl_texto_(partes[1]).trim();
  return /^Cp[0-9]-/.test(cap) ? cap : '';
}

/**
 * §17 post-aed3567: PROCESADO no puede quedar sin identidad. Se completan los
 * IDs faltantes desde la evidencia durable (EVENTOS.FUENTE: marca completa o
 * captureId desnudo del pipeline INGRESO). Solo si tras la recuperación sigue
 * sin existir ID_INTERNO NI ID_EVENTO —la firma de "se procesó sin crear nada"
 * (pérdida silenciosa)— se DEGRADA a REQUIERE_REVISION. Con idInterno presente
*  y idEvento '' el PROCESADO se mantiene: la respuesta §16 del contrato admite
 *  idEvento vacío y el guardado queda trazable por idInterno (una traza de
 *  auditoría pendiente tampoco degrada, según la suite de edición).
 */
function Captura_v2_completarIds_(estado, idInterno, idEvento, marca) {
  if (estado !== CAPTURA_V2.ESTADOS.PROCESADO) {
    return { estado: estado, idInterno: idInterno || '', idEvento: idEvento || '' };
  }
  if (idInterno && idEvento) {
    return { estado: estado, idInterno: idInterno, idEvento: idEvento };
  }
  if (marca) {
    try {
      var ev = Captura_v2_marcaEnEventos_(marca);
      if (ev) {
        if (!idInterno) idInterno = ev.idInterno || '';
        if (!idEvento) idEvento = ev.idEvento || '';
      }
    } catch (eMarca) { /* sin marca → sin evidencia durable */ }
  }
  if (idInterno && idEvento) {
    return { estado: estado, idInterno: idInterno, idEvento: idEvento };
  }
  if (!idInterno) {
    return {
      estado: CAPTURA_V2.ESTADOS.REQUIERE_REVISION, motivo: 'PROCESADO_SIN_IDS',
      idInterno: '', idEvento: ''
    };
  }
  return { estado: estado, idInterno: idInterno, idEvento: idEvento };
}

/** GAS: entrega TR-2 según operación (§21/§22). */
function Captura_v2_entregar_(norm, opciones) {
  opciones = opciones || {};
  var marca = opciones.marca || Captura_v2_marca_(norm);
  if (norm.actualizacion) return Captura_entregarEdicion_(norm, marca, opciones);
  if (norm.accion === 'nuevoIngreso') return Captura_v2_entregarIngreso_(norm, marca, opciones);
  return Captura_v2_entregarEvento_(norm, marca, opciones);
}

/**
 * PURA/GAS: resuelve el índice de la columna `FECHA DE INGRESO` POR ENCABEZADO
 * (§21.1, variantes `FECHA DE ING…`). Devuelve -1 si no se resuelve.
 */
function Captura_v2_indiceColumnaFecha_(encabezados) {
  var headers = encabezados || [];
  for (var i = 0; i < headers.length; i++) {
    var h = Utl_texto_(headers[i]).trim().toUpperCase();
    if (h === 'FECHA DE INGRESO' || h.indexOf('FECHA DE ING') === 0) return i;
  }
  return -1;
}

/**
 * GAS: búsqueda ACOTADA de la marca en UNA sola hoja INGRESO_<SECTOR> (§21/§22).
 * Se usa solo cuando existe registro previo (reintento A2) sin coordenadas en el
 * trailer (ventana de ida-y-vuelta). JAMÁS barre todas las hojas INGRESO_*.
 */
function Captura_v2_buscarMarcaEnHoja_(nombreHoja, marca) {
  var hoja = Modelo_hoja_(nombreHoja);
  if (!hoja || hoja.getLastRow() < 2) return null;
  var loc = Ingresos_layoutHoja_(hoja, nombreHoja, true);
  if (loc && loc.mapa && loc.mapa.notaIdx >= 0) {
    var n = hoja.getLastRow() - loc.hr;
    if (n <= 0) return null;
    var celda = hoja.getRange(loc.hr + 1, loc.mapa.notaIdx + 1, n, 1)
      .createTextFinder(marca).matchEntireCell(true).findNext();
    return celda ? { hoja: nombreHoja, fila: String(celda.getRow()) } : null;
  }
  // Compatibilidad exclusiva con hojas heredadas sin NOTA_SISTEMA.
  var ultimac = Math.min(hoja.getLastColumn(), 40);
  var bloque = hoja.getRange(1, 1, hoja.getLastRow(), ultimac).getValues();
  for (var f = Modelo_headerRow_(nombreHoja); f < bloque.length; f++) {
    for (var c = 0; c < bloque[f].length; c++) {
      if (Utl_texto_(bloque[f][c]) === marca) return { hoja: nombreHoja, fila: String(f + 1) };
    }
  }
  return null;
}

/**
 * GAS: confirmación REAL de la fila de ingreso (§16) en el intento síncrono:
 * relee la fila y verifica por encabezado que FECHA DE INGRESO = fechaIngreso y
 * que el pipeline dejó ESTADO_INGRESO marcado. Devuelve {ok:true} o {ok:false,motivo}.
 * LECTURA ACOTADA (v0.10.5 §15): 1 fila de encabezados + 1 fila objetivo, NUNCA
 * el bloque completo de la hoja.
 */
function Captura_v2_confirmarEntregaIngreso_(nombreHoja, filaFisica, fechaIso) {
  try {
    var hoja = Modelo_hoja_(nombreHoja);
    if (!hoja) return { ok: false, motivo: 'HOJA_AUSENTE' };
    var nf = Number(filaFisica);
    if (!nf || nf < 1 || nf > hoja.getLastRow()) return { ok: false, motivo: 'FILA_FUERA_DE_RANGO' };
    var hr = Modelo_headerRow_(nombreHoja);
    var ancho = Math.min(hoja.getLastColumn(), 40);
    var encabezados = hoja.getRange(hr, 1, 1, ancho).getValues()[0];
    if (encabezados.join('|') == null || encabezados.join('|').toUpperCase().indexOf('NOMBRE') === -1) {
      return { ok: false, motivo: 'BLOQUE_DESALINEADO' };
    }
    if (nf <= hr) return { ok: false, motivo: 'FILA_FUERA_DE_RANGO' };
    var colFecha = Captura_v2_indiceColumnaFecha_(encabezados);
    if (colFecha < 0) return { ok: false, motivo: 'COLUMNA_FECHA_INGRESO_NO_ENCONTRADA' };
    var mapa = Ingresos_mapearEncabezadosHoja_(encabezados);
    var fila = hoja.getRange(nf, 1, 1, ancho).getValues()[0];
    var escrito = Utl_texto_(fila[colFecha]);
    var okFecha = escrito === Utl_texto_(fechaIso);
    var okEstado = mapa.estadoIdx >= 0 && Utl_texto_(fila[mapa.estadoIdx]).toUpperCase() !== '';
    if (!okFecha) return { ok: false, motivo: 'FECHA_INGRESO_DIVERGENTE', actual: escrito };
    if (!okEstado) return { ok: false, motivo: 'SIN_ESTADO_PIPELINE' };
    return {
      ok: true,
      fila: filaFisica,
      estado: mapa.estadoIdx >= 0 ? Utl_texto_(fila[mapa.estadoIdx]).toUpperCase() : '',
      nota: mapa.notaIdx >= 0 ? Utl_texto_(fila[mapa.notaIdx]) : ''
    };
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
function Captura_v2_entregarIngreso_(norm, marca, opciones) {
  opciones = opciones || {};
  try {
    var hojaNombre = Form_sectorHojaIngreso_(norm.sector);
    var hoja = Modelo_hoja_(hojaNombre);
    if (!hoja) return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'INGRESO_HOJA_NO_DISPONIBLE' };

    var internos = Captura_v2_normalizadoAInterno_(norm, { marca: marca });
    var previo = opciones.previo || {};
    var filaFisica = 0, hojaEntrega = '';

    if (previo.hoja && previo.fila) {
      // Efecto ya entregado en un intento previo (A2): no se duplica la fila (§22).
      hojaEntrega = previo.hoja;
      filaFisica = Number(previo.fila) || 0;
      Captura_v2_logInfo_('CapturaV2', 'entregarIngreso', marca + ': coordenadas previas (' + hojaEntrega + ':' + filaFisica + ')');
    } else if (opciones.regExiste) {
      // Crash-window: registro existe pero el trailer no registró coordenadas.
      var hallado = Captura_v2_buscarMarcaEnHoja_(hojaNombre, marca);
      if (hallado && hallado.fila) {
        hojaEntrega = hallado.hoja;
        filaFisica = Number(hallado.fila) || 0;
        Captura_v2_logInfo_('CapturaV2', 'entregarIngreso', marca + ': fila reencontrada acotada (' + hojaEntrega + ':' + filaFisica + ')');
      }
    }
    if (!hojaEntrega || !filaFisica) {
      var filaIngreso = Form_filaCanonicaIngreso_(internos, marca, { hoy: norm.fechaIngreso });
      filaFisica = hoja.getLastRow() + 1;
      if (typeof Hojas_asegurarCapacidadGestionada_ === 'function')
        Hojas_asegurarCapacidadGestionada_(hoja, filaFisica, { bloque: 200 });
      hoja.getRange(filaFisica, 1, 1, filaIngreso.length).setValues([filaIngreso]);
      hojaEntrega = hojaNombre;
    }

    // Procesar SOLO la fila del envío actual (acotación §13 nunca re-procesa backlog).
    // Gate §22/DEC-024-025: POSIBLE_DUPLICADO solo se auto-crea cuando el humano
    // lo confirma explícitamente (confirmarNuevoPaciente=true); sin confirmar → REVISION.
    // Una captura es exactamente la misma operación acotada que "Cargar" una
    // fila desde el panel. No debe ejecutar el formateo global de INGRESO_* ni
    // mantener una segunda composición del pipeline: ambos fueron causas de
    // timeout/falso "ejecutado" sin alta clínica.
    var proc = Ingresos_procesarFila_(hojaEntrega, filaFisica, {
      confirmarNuevo: norm.confirmarNuevoPaciente === true,
      // DEC-104: la fila se relee del libro, así que la dupla viaja por opciones
      // para que el EVENTO de ingreso registre PROFESIONAL y PROFESIONAL2.
      profesional: norm.profesional || '',
      profesionalSecundario: norm.profesionalSecundario || ''
    });
    if (!proc || proc.ok === false) {
      return { estado: CAPTURA_V2.ESTADOS.ERROR,
        motivo: Utl_texto_(proc && (proc.motivo || proc.error)) || 'PIPELINE_INGRESO_NO_CONFIRMADO' };
    }

    // Confirmación real §16: fila con FECHA DE INGRESO = fechaIngreso y estado del pipeline.
    var conf = Captura_v2_confirmarEntregaIngreso_(hojaEntrega, filaFisica, norm.fechaIngreso);
    if (conf && conf.ok === false) {
      Captura_v2_logAux_('entregarIngreso', marca + ': confirmación pendiente (' + conf.motivo + ')');
      return {
        estado: CAPTURA_V2.ESTADOS.RECIBIDO,
        motivo: 'PENDIENTE_CONFIRMACION',
        idInterno: '',
        idEvento: '',
        ingresoHoja: hojaEntrega,
        ingresoFila: String(filaFisica)
      };
    }

    // Estado real de la fila: fast-path acotado (1 header + 1 fila), nunca el
    // bloque completo de la hoja (v0.10.5 §16).
    var est = Form_leerFilaIngreso_rapida_(hojaEntrega, filaFisica);
    var mapeado = Form_mapearResultadoFila_(est.estado, est.nota);
    var resFila = proc.resultado || {};
    var idInterno = resFila.idInterno || Captura_v2_buscarIdInternoPorRut_(norm.rut);
    var idEvento = resFila.idEvento || '';
    // §17: PROCESADO exige idInterno+idEvento reales; se completan desde la
    // marca durable o se degradan a REQUIERE_REVISION (nunca PROCESADO vacío).
    var resIds = Captura_v2_completarIds_(mapeado.estado, idInterno, idEvento, marca);
    if (resIds.motivo && !mapeado.motivo) mapeado.motivo = resIds.motivo;
    return {
      estado: resIds.estado,
      motivo: mapeado.motivo,
      idInterno: resIds.idInterno,
      idEvento: resIds.idEvento,
      ingresoHoja: hojaEntrega,
      ingresoFila: String(filaFisica)
    };
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'entregarIngreso', String(e));
    return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ENTREGA_INGRESO_FALLO' };
  }
}

/**
 * §5.2 — FECHA DE OPERACIÓN para `actualizarDatos`.
 * Generada EXCLUSIVAMENTE por el backend; nunca proviene del payload
 * (`fechaEvento` es NP para `actualizarDatos`, §5.1). Precisión día,
 * ISO `yyyy-MM-dd`, zona local del entorno (America/Santiago), con la
 * misma mecánica que el pipeline histórico (`Form_hoy_`) y `FECHA_ACTUALIZACION`.
 * `opciones.hoy` solo para pruebas deterministas; nunca para datos del cliente.
 */
function Captura_v2_fechaOperacion_(opciones) {
  opciones = opciones || {};
  if (opciones.hoy) return opciones.hoy;
  return Form_hoy_({});
}

/**
 * GAS: TR-2b/TR-2c — evento clínico (control/seguimiento) y actualización.
 * La identidad es exacta (RUT); persona no encontrada → REQUIERE_REVISION.
 * La marca del canal viaja como FUENTE del evento (§25).
 * TR-2c (§5.2): `actualizarDatos` actualiza PRIMERO los campos operativos de
 * PACIENTES y SOLO entonces registra el evento `OTRO`, cuya FECHA_EVENTO es la
 * fecha de la operación generada por el backend (jamás `''` ni dato del payload).
 */
function Captura_v2_entregarEvento_(norm, marca, opciones) {
  try {
    var persona = Captura_v2_buscarPersonaPorRut_(norm.rut);
    if (!persona) {
      return { estado: CAPTURA_V2.ESTADOS.REQUIERE_REVISION, motivo: 'PERSONA_NO_ENCONTRADA', idInterno: '', idEvento: '' };
    }
    // Protección de efecto §22: si esta marca ya generó evento, no duplicar.
    var existente = Captura_v2_marcaEnEventos_(marca);
    if (existente && existente.idEvento) {
      return { estado: CAPTURA_V2.ESTADOS.PROCESADO, motivo: '', idInterno: existente.idInterno || persona.ID_INTERNO, idEvento: existente.idEvento };
    }
    var registradoPor = (opciones && opciones.usuario) || 'CAPTURA_V2';

    if (norm.accion === 'actualizarDatos') {
      // TR-2c §21/§5.2: campos operativos PRIMERO; el evento OTRO solo si
      // la actualización fue aplicada (evita OTRO huérfano y reintento ciego).
      var internos = Captura_v2_normalizadoAInterno_(norm, { marca: marca });
      if (typeof Form_actualizarDatosPaciente_ !== 'function') {
        return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ACTUALIZACION_FALLIDA', idInterno: persona.ID_INTERNO, idEvento: '' };
      }
      var upd = Form_actualizarDatosPaciente_(persona, internos, marca, opciones && opciones.acceso);
      if (!upd) {
        return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ACTUALIZACION_FALLIDA', idInterno: persona.ID_INTERNO, idEvento: '' };
      }
      // §40/§42: la captura ya está autorizada y bajo lock; se usa la capa de
      // dominio directamente (nunca un wrapper api_* ni una re-autorización).
      var resOtro = Eventos_registrarPaciente_({
        tipoEvento: 'OTRO',
        fecha: Captura_v2_fechaOperacion_({}),
        idInterno: persona.ID_INTERNO,
        profesional: norm.profesional || '',
        profesionalSecundario: norm.profesionalSecundario || '', // DEC-104: no se pierde
        descripcion: 'ACTUALIZACION_VIA_CAPTURA',
        observaciones: norm.observaciones || '',
        fuente: marca,
        registradoPor: registradoPor
      }, { fuenteTransporte: 'CapturaV2' });
      if (!resOtro || !resOtro.ok) {
        Captura_v2_logError_('CapturaV2', 'entregarEvento', marca + ': evento OTRO no registrado (actualizarDatos): ' + ((resOtro && resOtro.motivo) || 'EVENTO_NO_REGISTRADO'));
        return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: (resOtro && resOtro.motivo) || 'EVENTO_NO_REGISTRADO', idInterno: persona.ID_INTERNO, idEvento: '' };
      }
      return {
        estado: CAPTURA_V2.ESTADOS.PROCESADO,
        motivo: '',
        idInterno: persona.ID_INTERNO,
        idEvento: resOtro.evento && resOtro.evento.id ? resOtro.evento.id
          : ((Captura_v2_marcaEnEventos_(marca) || {}).idEvento || '')
      };
    }

    var tipoEvento = norm.accion === 'registrarControl' ? 'CONTROL' : 'SEGUIMIENTO';
    var res = Eventos_registrarPaciente_({
      tipoEvento: tipoEvento,
      fecha: norm.fechaEvento || '',
      idInterno: persona.ID_INTERNO,
      profesional: norm.profesional || '',
      profesionalSecundario: norm.profesionalSecundario || '', // DEC-104: no se pierde
      descripcion: '',
      observaciones: norm.observaciones || '',
      fuente: marca,
      registradoPor: registradoPor
    }, { fuenteTransporte: 'CapturaV2' });
    if (!res || !res.ok) {
      return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: (res && res.motivo) || 'EVENTO_NO_REGISTRADO', idInterno: persona.ID_INTERNO, idEvento: '' };
    }
    return {
      estado: CAPTURA_V2.ESTADOS.PROCESADO,
      motivo: '',
      idInterno: persona.ID_INTERNO,
      idEvento: res.evento && res.evento.id ? res.evento.id
        : ((Captura_v2_marcaEnEventos_(marca) || {}).idEvento || '')
    };
  } catch (e) {
    Captura_v2_logError_('CapturaV2', 'entregarEvento', String(e));
    return { estado: CAPTURA_V2.ESTADOS.ERROR, motivo: 'ENTREGA_EVENTO_FALLO', idInterno: '', idEvento: '' };
  }
}

// ---------------------------------------------------------------------------
// Contexto de producción (GAS) y entrypoints de la Web App
// ---------------------------------------------------------------------------

/** GAS: catálogo PROFESIONALES para validación §9. */
function Captura_v2_catalogo_() {
  try {
    if (typeof Profesionales_catalogo_ === 'function') return Profesionales_catalogo_();
  } catch (e) { /* catálogo no disponible */ }
  return [];
}

/** Construye el ctx real de GAS. Inyectable en tests. */
function Captura_v2_ctx_(acceso) {
  return {
    // DEC-102: la atribución NUNCA bloquea un envío. Con acceso universal el
    // correo se usa si hay sesión (Sheets); si no, una etiqueta estable. Exigir
    // un token válido aquí producía "acceso denegado" y perdía el registro.
    usuario: Captura_v2_usuarioActual_() || 'ACCESO_COMPARTIDO',
    acceso: acceso || '',
    ahora: Captura_v2_ahora_,
    maxReintentos: FORM_CONFIG.MAX_REINTENTOS,
    catalogo: Captura_v2_catalogo_(),
    buscarRegistro: Captura_v2_buscarRegistro_,
    persistirRegistro: Captura_v2_persistirRegistro_,
    actualizarTrailer: Captura_v2_actualizarTrailer_,
    entregar: Captura_v2_entregar_,
    // La captura YA está autorizada (entrypoint WebApp_autorizarCaptura_) y bajo
    // lock; aquí se usa la capa de dominio directamente (nunca un wrapper api_*
    // ni una re-autorización). §40-§42.
    aplicarAgenda: function (idInterno, fecha) {
      return Paciente_actualizarCampos_(idInterno, { PROXIMO_CONTROL: fecha }, { fuente: 'CAPTURA_V2' });
    },
    // DEC-105: campos de PACIENTES que la captura acepta pero cuya única casa es
    // la ficha (la puerta INGRESO_* no tiene columna para ellos).
    aplicarContacto: function (idInterno, campos) {
      return Paciente_actualizarCampos_(idInterno, campos, { fuente: 'CAPTURA_V2' });
    },
    medir: Captura_v2_marcaMedida_
  };
}

/** Alias Web App heredado. La UI vigente usa WebApp_capturarRecibirDurable;
 * ambos terminan en la misma respuesta durable de Forms y no procesan datos
 * clínicos dentro de la recepción. */
function WebApp_capturarEnviar_(payload, acceso) {
  if (typeof WebApp_capturarRecibirDurable === 'function') {
    return WebApp_capturarRecibirDurable(payload, acceso);
  }
  return { ok: false, errors: [Captura_v2_error_('ERROR_INTERNO', null,
    'Transporte durable no disponible', 'DURABLE_RECEIVER_UNAVAILABLE')] };
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
function Captura_v2_previaDuplicados_(datos, esOperador) {
  try {
    datos = datos || {};
    if (Utl_texto_(datos.accion).toLowerCase() !== 'nuevoingreso') {
      return { ok: true, coincidencia: false, candidatos: [], motivo: 'Solo se checan coincidencias en nuevoIngreso' };
    }
    // §17 P0 PRIVACIDAD: en captura pública NO se hace pre-flight detallado ni
    // se exponen candidatos (nombre/RUT/sexo/nacimiento/ingreso/estratificación).
    // El pipeline resuelve MATCH / POSIBLE_DUPLICADO / REQUIERE_REVISION en backend.
    // El detalle queda reservado a modo OPERADOR.
    if (!esOperador) {
      return { ok: true, coincidencia: false, candidatos: [], motivo: 'PREVIEW_OMITIDO_EN_PUBLICO' };
    }
    var n = {};
    var rut = Norm_normalizarRut_(datos.rut);
    n.RUT = rut.rut; n.RUT_ESTADO = rut.estado; n.RUT_CUERPO = rut.cuerpo;
    var nom = Norm_normalizarNombre_(datos.nombre);
    n.NOMBRE = nom.nombre;
    n.NOMBRE_CLAVE = (nom.ok && nom.nombre) ? Norm_claveNombre_(nom.nombre) : '';
    var tel = Norm_normalizarTelefono_(Utl_texto_(datos.telefonos));
    n.TELEFONOS = (tel && tel.telefonos) ? tel.telefonos.join('/') : '';

    var pacientes = Modelo_leerPacientes_() || [];
    var indices = Iden_construirIndices_(pacientes);
    var iden = Iden_identificar_(n, indices);
    var candidatos = [];
    if (iden.paciente && iden.idPaciente) {
      candidatos.push({
        criterio: iden.criterio || 'Coincidencia detectada',
        confianza: iden.confianza || '',
        resultado: iden.resultado,
        paciente: WebApp_resumenPaciente_(iden.paciente)
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
            paciente: WebApp_resumenPaciente_(p)
          });
        }
      });
    }
    return { ok: true, coincidencia: candidatos.length > 0, candidatos: candidatos, rutNormalizado: n.RUT };
  } catch (e) {
    Captura_v2_logError_('WebApp', 'previaDuplicadosV2', String(e));
    return { ok: false, motivo: 'PREVIA_FALLO_INTERNO' };
  }
}

/** Alias Web App: pre-flight de duplicados V2.
 *  ACCESO UNIVERSAL (DEC-101): no existe un canal desprivilegiado, así que el
 *  pre-flight detallado se entrega a todos. Evitar pacientes duplicados es
 *  parte del trabajo de correcciones del CESFAM; el resumen del candidato solo
 *  expone campos que la propia ficha ya muestra (nunca teléfonos ni
 *  observaciones). */
function WebApp_previaDuplicadosV2_(datos, acceso) {
  try {
    return Captura_v2_previaDuplicados_(datos, false);
  } catch (e) {
    return { ok: false, motivo: String(e && e.message || e) };
  }
}

/** Entrypoint Web App: consulta de estado de un envío V2. */
function WebApp_capturarEstado_(captureId, acceso) {
  try {
    return Captura_v2_estado_(captureId, Captura_v2_ctx_(acceso));
  } catch (e) {
    Captura_v2_logError_('WebApp', 'capturarEstado', String(e));
    return { ok: false, errors: [Captura_v2_error_('ERROR_INTERNO', null, 'Falla interna al consultar el envío', '§16.2')] };
  }
}

/** Entrypoint Web App: retoma administrativa de un pendiente V2 (procesador V2). */
function WebApp_capturarRetomar_(payload, acceso) {
  var lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      Captura_v2_logError_('WebApp', 'capturarRetomar',
        ((payload && payload.captureId) || 'captureId-desconocido') + ': lock no disponible en 30s');
      return { ok: false, errors: [Captura_v2_error_('ERROR_INTERNO', null, 'Servicio ocupado; reintente en unos segundos', 'S2-LockService')] };
    }
    var captureId = (payload && typeof payload === 'object' && payload.captureId) ? payload.captureId : null;
    return Captura_v2_retomarRegistro_(captureId, Captura_v2_ctx_(acceso));
  } catch (e) {
    Captura_v2_logError_('WebApp', 'capturarRetomar', String(e));
    return { ok: false, errors: [Captura_v2_error_('ERROR_INTERNO', null, 'Falla interna al retomar el envío', '§16.2')] };
  } finally {
    try { if (lock) lock.releaseLock(); } catch (e2) { /* ignorar */ }
  }
}

// ---------------------------------------------------------------------------
// §18/§19 — Reconciliación dryRun de pendientes (RECIBIDO). Solo diagnóstico:
// NO reescribe nada. La evidencia es RESPONSE_ID (captureId) + TRAZA_CRUDA
// (payload canónico); INGRESO_HOJA/INGRESO_FILA jamás se usan como evidencia
// (§18), para no repetir la causa raíz de la fila física reutilizada.
// ---------------------------------------------------------------------------

var CAPTURA_V2_RECONCI = {
  YA_COMPLETO_REPARAR_TRAILER: 'YA_COMPLETO_REPARAR_TRAILER',
  REPROCESABLE_SEGURO: 'REPROCESABLE_SEGURO',
  REQUIERE_REVISION: 'REQUIERE_REVISION',
  CONFLICTO: 'CONFLICTO',
  NO_RECUPERABLE_AUTOMATICAMENTE: 'NO_RECUPERABLE_AUTOMATICAMENTE'
};

/** PURA: rut para comparación (sin separadores, mayúscula). */
function Captura_v2_rutClave_(v) {
  return Utl_texto_(v).toUpperCase().replace(/[^0-9K]/g, '');
}

/**
 * PURA: clasifica UN pendiente con la evidencia canónica (ignora fila física).
 * @param {Object} rec   {captureId|RESPONSE_ID, normalizado|TRAZA_CRUDA}
 * @param {Object} store {pacientes:[], eventos:[]}
 * @returns {captureId, clasificacion, motivo, idInterno?, idEvento?}
 */
function Captura_v2_clasificarPendiente_(rec, store) {
  store = store || {};
  var captureId = Utl_texto_((rec && (rec.captureId || rec.RESPONSE_ID)) || '');
  if (!CAPTURA_V2.RE_CAPTURE_ID.test(captureId)) {
    return { captureId: captureId, clasificacion: CAPTURA_V2_RECONCI.NO_RECUPERABLE_AUTOMATICAMENTE, motivo: 'SIN_RESPONSE_ID_VALIDO' };
  }
  var payload = null;
  if (rec && rec.normalizado && typeof rec.normalizado === 'object') payload = rec.normalizado;
  else if (rec && rec.TRAZA_CRUDA) {
    try { payload = JSON.parse(rec.TRAZA_CRUDA); } catch (e) { payload = null; }
  }
  // Evidencia durable: EVENTO cuya FUENTE es la marca de ESTE captureId. El
  // pipeline INGRESO persiste FUENTE = captureId desnudo (Fuentes_fuenteOrigen_),
  // y los eventos manuales la marca completa: ambas son la misma identidad.
  var marca = 'FORM|' + captureId + '|';
  var evDurable = null;
  (store.eventos || []).forEach(function (e) {
    if (evDurable) return;
    var fuente = Utl_texto_(e.FUENTE);
    if (fuente.indexOf(marca) === 0 || fuente === captureId) evDurable = e;
  });
  if (evDurable) {
    var idEv = Utl_texto_(evDurable.ID_INTERNO);
    var pacienteEv = null;
    (store.pacientes || []).forEach(function (p) {
      if (!pacienteEv && Utl_texto_(p.ID_INTERNO) === idEv) pacienteEv = p;
    });
    var coindiceRut = !payload || !payload.rut || (pacienteEv &&
      Captura_v2_rutClave_(pacienteEv.RUT) === Captura_v2_rutClave_(payload.rut));
    var res = { captureId: captureId, idInterno: idEv, idEvento: Utl_texto_(evDurable.ID_EVENTO) };
    if (pacienteEv && coindiceRut) {
      res.clasificacion = CAPTURA_V2_RECONCI.YA_COMPLETO_REPARAR_TRAILER;
      res.motivo = 'EVENTO_DURABLE_YA_EXISTE';
    } else {
      res.clasificacion = CAPTURA_V2_RECONCI.CONFLICTO;
      res.motivo = pacienteEv ? 'RUT_NO_COINCIDE_CON_EVENTO_DURABLE' : 'SIN_PACIENTE_DEL_EVENTO_DURABLE';
    }
    return res;
  }
  if (!payload || !payload.rut) {
    return { captureId: captureId, clasificacion: CAPTURA_V2_RECONCI.NO_RECUPERABLE_AUTOMATICAMENTE, motivo: 'SIN_PAYLOAD_REPROCESABLE' };
  }
  var sinSector = !Utl_texto_(payload.sector);
  var sinFecha = !Utl_texto_(payload.fechaIngreso);
  var sinNombre = !Utl_texto_(payload.nombre);
  if (sinSector || sinFecha || sinNombre) {
    // §18: un payload incompleto no se reprocesa solo, aun si el RUT coincide:
    // faltaría la decisión de sector/fecha/nombre y el reproceso decidiría mal.
    return { captureId: captureId, clasificacion: CAPTURA_V2_RECONCI.REQUIERE_REVISION, motivo: 'PAYLOAD_INCOMPLETO' };
  }
  var pacienteRut = null;
  (store.pacientes || []).forEach(function (p) {
    if (!pacienteRut && Captura_v2_rutClave_(p.RUT) === Captura_v2_rutClave_(payload.rut)) pacienteRut = p;
  });
  if (pacienteRut) {
    return { captureId: captureId, clasificacion: CAPTURA_V2_RECONCI.REPROCESABLE_SEGURO, motivo: 'ENLAZA_A_PACIENTE_EXISTENTE', idInterno: Utl_texto_(pacienteRut.ID_INTERNO) };
  }
  return { captureId: captureId, clasificacion: CAPTURA_V2_RECONCI.REPROCESABLE_SEGURO, motivo: 'CREARIA_ENTIDAD_NUEVA' };
}

/**
 * GAS/PURA: informe agregado (sin PII) de los pendientes, modo dryRun estricto.
 * `opciones.detalle===true` agrega por captureId (identificador opaco, nunca
 * RUT/nombre/teléfono). `opciones.pacientes/eventos` permiten inyectar el store
 * en pruebas; en GAS se lee de Modelo_*.
 */
function Captura_v2_reconciliarPendientes_(opciones) {
  opciones = opciones || {};
  var store = null;
  if (opciones.pacientes || opciones.eventos) {
    store = { pacientes: opciones.pacientes || [], eventos: opciones.eventos || [] };
  } else if (typeof Modelo_leerPacientes_ === 'function' && typeof Modelo_leerEventos_ === 'function') {
    store = { pacientes: Modelo_leerPacientes_(), eventos: Modelo_leerEventos_() };
  }
  store = store || { pacientes: [], eventos: [] };
  var porEstado = {}, detalle = (opciones.detalle === true) ? [] : null;
  var hoja = typeof Modelo_hoja_ === 'function' ? Modelo_hoja_(HOJAS.FORM_RESPUESTAS) : null;
  if (hoja && hoja.getLastRow && hoja.getLastRow() > 1) {
    var cab = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
    var mapa = Form_mapeoEncabezados_(cab);
    var nRows = hoja.getLastRow() - 1;
    var cols = Math.max(hoja.getLastColumn(), 1);
    var bloque = hoja.getRange(2, 1, nRows, cols).getValues();
    var idxEst = mapa.idx.ESTADO;
    var idxRid = mapa.idx.RESPONSEID !== undefined ? mapa.idx.RESPONSEID
      : (mapa.idx.RESPONSE_ID !== undefined ? mapa.idx.RESPONSE_ID : -1);
    bloque.forEach(function (fila, i) {
      var est = idxEst !== undefined ? Utl_texto_(fila[idxEst]).toUpperCase() : '';
      if (est !== 'RECIBIDO' && est !== 'VALIDANDO' && est !== 'VALIDO') return;
      var rid = idxRid >= 0 ? Utl_texto_(fila[idxRid]) : '';
      var norm = null;
      if (mapa.idx.TRAZACRUDA !== undefined) {
        var crudo = Utl_texto_(fila[mapa.idx.TRAZACRUDA]);
        try { if (crudo) norm = JSON.parse(crudo); } catch (e) { norm = null; }
      }
      var cl = Captura_v2_clasificarPendiente_({ captureId: rid, normalizado: norm, TRAZA_CRUDA: fila[mapa.idx.TRAZACRUDA] }, store);
      porEstado[cl.clasificacion] = (porEstado[cl.clasificacion] || 0) + 1;
      if (detalle) detalle.push({ captureId: cl.captureId, clasificacion: cl.clasificacion, motivo: cl.motivo || '' });
    });
  }
  var pendientes = 0;
  Object.keys(porEstado).forEach(function (k) { pendientes += porEstado[k]; });
  var informe = { dryRun: true, total: pendientes, porEstado: porEstado };
  if (detalle) informe.detalle = detalle;
  try {
    if (typeof Log_info_ === 'function') Log_info_('CapturaV2', 'reconciliar', JSON.stringify({ dryRun: true, total: pendientes, porEstado: porEstado }));
  } catch (e) { /* observabilidad */ }
  return informe;
}

// ---------------------------------------------------------------------------
// §20 — Diagnóstico de los TRES dominios de acceso (no confundir Web App con
// fuentes externas: un fallo de openById() externo NO es un fallo de captura).
// ---------------------------------------------------------------------------

function Captura_v2_diagnosticoPermisos_(opciones) {
  opciones = opciones || {};
  var webApp = {
    dominio: 'CAPTURE_WEBAPP_ACCESS', ejecutaComo: 'USER_DEPLOYING', acceso: 'ANYONE_ANONYMOUS',
    autorizaUniversalmente: (typeof WebApp_autorizar_ === 'function') ? WebApp_autorizar_('') === true : false,
    exigeToken: false, ok: true
  };
  var bound = { dominio: 'BOUND_SPREADSHEET_ACCESS' };
  try {
    var ss = (typeof Modelo_ss_ === 'function') ? Modelo_ss_() : null;
    if (!ss) {
      bound.ok = false; bound.motivo = 'LIBRO_NO_DISPONIBLE'; bound.lectura = false; bound.escritura = false;
    } else {
      bound.nombre = (typeof ss.getName === 'function') ? Utl_texto_(ss.getName()) : '';
      bound.ok = true; bound.lectura = true; bound.escritura = true;
    }
  } catch (e) {
    bound.ok = false; bound.motivo = 'LIBRO_NO_ACCESIBLE'; bound.lectura = false; bound.escritura = false;
  }
  var externas = [];
  if (typeof Fuentes_preflightFuentes_ === 'function') {
    var pre = Fuentes_preflightFuentes_(opciones.abridor);
    (pre.fuentes || []).forEach(function (f) {
      externas.push({
        dominio: 'EXTERNAL_SOURCE_ACCESS',
        archivo: f.archivo,
        accesible: !!f.accesible,
        error: (f.errores && f.errores[0]) || ''
      });
    });
  }
  return {
    CAPTURE_WEBAPP_ACCESS: webApp,
    BOUND_SPREADSHEET_ACCESS: bound,
    EXTERNAL_SOURCE_ACCESS: externas
  };
}

// ---------------------------------------------------------------------------
// Instrumentación de tiempos del intento síncrono (§16 captura rápida T0..T6)
// ---------------------------------------------------------------------------

/** GAS/PURA: marca una medida si el ctx está instrumentado. No bloquea. */
function Captura_v2_medida_(c, etiqueta) {
  if (!c || typeof c.medir !== 'function') return;
  try { c.medir(etiqueta); } catch (e) { /* no bloquear nunca */ }
}

/** GAS/PURA (§27): registra la fase del pipeline en `c._fases` (RECIBIDO →
 *  PERSISTIDO → estado final). Solo observabilidad; jamás bloquea. */
function Captura_v2_marcaFase_(c, fase) {
  if (!c) return;
  try {
    if (!c._fases) c._fases = [];
    if (typeof fase === 'string' && c._fases.indexOf(fase) === -1) c._fases.push(fase);
  } catch (e) { /* no bloquear nunca */ }
}

/** GAS: acumula la medida en el ctx (T0 = primera llamada del request).
 *  v0.10.5 §32: el origen de tiempo vive en el contexto (`this._t0`), NO en un
 *  estático compartido, para no mezclar bases entre requests concurrentes. */
function Captura_v2_marcaMedida_(etiqueta) {
  try {
    var t = Date.now();
    if (!this._t0) this._t0 = t;
    if (!this.medidas) this.medidas = [];
    this.medidas.push({ n: etiqueta, d: t - this._t0 });
  } catch (e) { /* no bloquear nunca */ }
}

/** GAS: vuelca medidas y fases acumuladas por request (solo consola/servidor;
 *  jamás al UI). El captureId se trunca para no volcar con trazabilidad
 *  reversible completa; no se incluye RUT/nombre/teléfono (§27 sin PII). */
function Captura_v2_logMedidas_(c, captureId) {
  try {
    var partes = [];
    if (c && c._fases && c._fases.length) partes.push('fases=' + c._fases.join('>'));
    if (c && c.medidas && c.medidas.length) {
      partes.push(c.medidas.map(function (x) { return x.n + '=' + x.d + 'ms'; }).join(' | '));
    }
    var ref = captureId ? ' ' + Utl_texto_(captureId).slice(0, 8) : '';
    if (partes.length) Captura_v2_logAux_('tiempos' + ref, partes.join(' — '));
  } catch (e) { /* no bloquear nunca */ }
}

// ---------------------------------------------------------------------------
// Trazas (solo GAS; en node se omiten silenciosamente)
// ---------------------------------------------------------------------------

function Captura_v2_logInfo_(modulo, operacion, mensaje) {
  try {
    if (typeof SpreadsheetApp !== 'undefined' && typeof Log_info_ === 'function') Log_info_(modulo || 'CapturaV2', operacion, mensaje);
  } catch (e) { /* no bloquear nunca */ }
  // Igual que logError: sin volcado, las migas de pan del fast-path A2 y del
  // ciclo de vida se perdían y no había forma de reconstruir un reenvío.
  try { if (typeof Log_flush_ === 'function') Log_flush_(); } catch (e) { /* no bloquear nunca */ }
}

function Captura_v2_logAux_(operacion, mensaje) {
  if (typeof console !== 'undefined') console.log('[CAPTURA_V2] ' + operacion + ': ' + mensaje);
}

function Captura_v2_logError_(modulo, operacion, mensaje) {
  try {
    if (typeof SpreadsheetApp !== 'undefined' && typeof Log_error_ === 'function') Log_error_(modulo || 'CapturaV2', operacion, mensaje);
  } catch (e) { /* no bloquear nunca */ }
  // Sin este volcado, `Log_error_` solo acumula en memoria y el error se pierde al
  // reciclar el contenedor: todo fallo de captura era indistinguible de «no
  // ocurrió nada». `Log_flush_` es seguro (sale temprano si el buffer está vacío y
  // reencola si no logra el lock).
  try { if (typeof Log_flush_ === 'function') Log_flush_(); } catch (e) { /* no bloquear nunca */ }
  try { Captura_v2_logAux_(operacion, mensaje); } catch (e) { /* no bloquear nunca */ }
}
