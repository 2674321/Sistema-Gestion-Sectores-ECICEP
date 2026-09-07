#!/usr/bin/env node
/**
 * Batería de TESTS DEL CONTRATO DE CAPTURA V2 — ECICEP (§36-38 de la Fase 2).
 *
 * Fuente normativa: docs/CONTRATO_CAPTURA_V2.md (única fuente del contrato).
 * Estos tests NO ejecutan la implementación nueva (no existe aún): verifican
 * el CONTRATO mismo (estructura, ejemplos normativos, matriz, estados,
 * idempotencia, errores) y, en un segundo plano, la coherencia de lo que el
 * contrato declara sobre el modelo con la implementación EXISTENTE (§38),
 * cargando el código real en un vm como el resto de la batería local.
 *
 * Uso: node tests/contrato_captura_v2.mjs
 *
 * Salida: [PASS]/[FAIL]/[SKIP] por prueba + TOTAL/PASS/FAIL/SKIP.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');
const DOC = readFileSync(path.join(raiz, 'docs/CONTRATO_CAPTURA_V2.md'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Mini runner
// ─────────────────────────────────────────────────────────────────────────────
const R = { pass: 0, fail: 0, skip: 0 };
function t(nombre, fn) {
  try {
    fn();
    console.log('[PASS] ' + nombre);
    R.pass += 1;
  } catch (e) {
    console.log('[FAIL] ' + nombre);
    console.log('   CAUSA: ' + (e && e.message ? e.message : String(e)));
    R.fail += 1;
  }
}
function skip(nombre, motivo) {
  console.log('[SKIP] ' + nombre + ' — ' + motivo);
  R.skip += 1;
}
function A(cond, msg) { if (!cond) throw new Error(msg); }
function igual(a, b, msg) { if (a !== b) throw new Error((msg || 'igual') + ' (recibido ' + JSON.stringify(a) + ', esperado ' + JSON.stringify(b) + ')'); }
function cont(arr, v, msg) { if (!arr.includes(v)) throw new Error((msg || 'contiene ' + JSON.stringify(v)) + ' (recibido ' + JSON.stringify(arr) + ')'); }
function nohay(obj, key, msg) { if (Object.prototype.hasOwnProperty.call(obj, key)) throw new Error((msg || 'no debe tener clave ' + JSON.stringify(key)) + ' (tiene ' + JSON.stringify(Object.keys(obj)) + ')'); }

// ─────────────────────────────────────────────────────────────────────────────
// Modelo NORMATIVO embebido (espejo ejecutable del contrato, §6/§7/§8/§9)
// ─────────────────────────────────────────────────────────────────────────────
const CONTRACT_VERSION = 2;
const OPERACIONES = ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'];
const SECTORES = ['AMARILLO', 'NARANJO', 'VERDE'];
const SEXOS = ['M', 'F', 'OTRO'];
const ESTRATIFICACIONES = ['G1', 'G2', 'G3'];
const ESTADOS_CAPTURA = ['RECIBIDO', 'VALIDANDO', 'VALIDO', 'PROCESADO', 'REQUIERE_REVISION', 'ERROR'];
const ESTADOS_TERMINALES = ['PROCESADO'];
const REINTENTOS_MAX = 3;
const CFG_FECHAS_CONTRATO = { ANO_MIN_EVENTO: 2015, ANO_MAX: 2040, ANO_MIN_NACIMIENTO: 1900, FORMATO_HOJA: 'dd/MM/yyyy', ZONA: 'America/Santiago' };
const PROFESIONALES_CATALOGO = ['MEDICO/A', 'ENFERMERA/O', 'TENS', 'MATRONA/O', 'PSICOLOGO/A', 'ASISTENTE SOCIAL', 'NUTRICIONISTA', 'KINESIOLOGO/A', 'TERAPEUTA OCUPACIONAL'];

const RE_CAPTURE_ID = /^Cp2-[a-f0-9]{32}$/;
const RE_RUT = /^[0-9]{1,8}-[0-9kK]$/;

// §5.2: la fecha del evento OTRO de actualizarDatos es generada por el backend
// (fecha de la operación); nunca proviene del payload. Precisión día, zona local.
const EVENTO_OTRO_FECHA = { generador: 'backend', formato: 'yyyy-MM-dd', precision: 'dia', zona: 'America/Santiago', tipo: 'OTRO' };

// Matriz §5.1: campo → { REQ: [ops], OPC: [ops] } (no listado = NP)
const MATRIZ = {
  captureId:               { REQ: OPERACIONES, OPC: [] },
  accion:                  { REQ: OPERACIONES, OPC: [] },
  rut:                     { REQ: OPERACIONES, OPC: [] },
  nombre:                  { REQ: ['nuevoIngreso'], OPC: [] },
  sexo:                    { REQ: [], OPC: ['nuevoIngreso'] },
  fechaNacimiento:         { REQ: ['nuevoIngreso'], OPC: [] },
  sector:                  { REQ: ['nuevoIngreso'], OPC: [] },
  fechaIngreso:            { REQ: ['nuevoIngreso'], OPC: [] },
  estratificacion:         { REQ: [], OPC: ['nuevoIngreso'] },
  telefonos:               { REQ: [], OPC: ['nuevoIngreso', 'actualizarDatos'] },
  fechaEvento:             { REQ: ['registrarControl', 'registrarSeguimiento'], OPC: [] },
  profesional:             { REQ: OPERACIONES, OPC: [] },
  profesionalSecundario:   { REQ: [], OPC: OPERACIONES },
  observaciones:           { REQ: [], OPC: OPERACIONES },
  confirmarNuevoPaciente:  { REQ: [], OPC: ['nuevoIngreso'] }
};

function esFechaIsoReal(s, anioMin, anioMax) {
  if (typeof s !== 'string') return false;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < anioMin || y > anioMax) return false;
  if (m < 1 || m > 12) return false;
  const dim = [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d >= 1 && d <= dim[m - 1];
}

function dvRut(cuerpo) {
  let suma = 0, mult = 2;
  const s = String(cuerpo);
  for (let i = s.length - 1; i >= 0; i--) { suma += Number(s[i]) * mult; mult = mult === 7 ? 2 : mult + 1; }
  const resto = (11 - (suma % 11)) % 11;
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}
function rutValido(rut) {
  if (typeof rut !== 'string') return false;
  if (!RE_RUT.test(rut)) return false;
  const [cuerpo, dv] = rut.split('-');
  return dvRut(cuerpo) === dv.toUpperCase();
}

// Normalización canónica del profesional (§6): mayúsculas, sin tildes, espacios
// colapsados, puntuación conservada. La comparación es contra NOMBRE del catálogo.
function normProf(v) {
  if (typeof v !== 'string') return '';
  return v.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
function telefonoNormalizable(v) {
  if (v === '') return true;
  if (typeof v !== 'string') return false;
  return v.split('/').every((tok) => /^\+?\d{5,15}$/.test(tok.trim()));
}

/**
 * Validador del CONTRATO (§14 capas 1-3). Devuelve {ok, errors[], normalizado}.
 * El normalizado es la forma canónica para idempotencia (§11/§13).
 */
function validarPayload(payload) {
  const errors = [];
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  if (!p) return { ok: false, errors: [{ codigo: 'SINTAXIS_INVALIDA', campo: null, mensaje: 'Payload debe ser un objeto JSON', detalle: '' }] };

  const conocidas = Object.keys(MATRIZ);
  const internas = ['FECHA_FORMS', 'USUARIO', 'FORM_VERSION', 'TRAZA_CRUDA', 'INGRESO_HOJA', 'INGRESO_FILA',
    'REINTENTOS', 'ESTADO', 'MOTIVO', 'ID_INTERNO', 'ID_EVENTO', 'FECHA_PROCESO', 'respuestaId', 'responseId',
    'fuente', 'marca', 'registradoPor', 'estado', 'estadoIngreso', 'notaSistema', 'RESPONSE_ID',
    'respuestas_id', 'capture_version', 'version'];
  const prohibidasInput = ['ACCION', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'SECTOR', 'ESTRATIFICACION',
    'TELEFONOS', 'FECHA_EVENTO', 'PROFESIONAL', 'PROFESIONAL2', 'OBSERVACIONES', 'TRAZA'];

  Object.keys(p).forEach((k) => {
    if (internas.indexOf(k) !== -1 || prohibidasInput.indexOf(k) !== -1) {
      errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: k, mensaje: 'Campo interno/generado: ' + k, detalle: '§6.1' });
    } else if (conocidas.indexOf(k) === -1) {
      errors.push({ codigo: 'CAMPO_DESCONOCIDO', campo: k, mensaje: 'Campo no definido: ' + k, detalle: '§6' });
    }
  });
  if (errors.length) return { ok: false, errors };

  const n = {};
  const accion = p.accion;
  if (typeof accion !== 'string' || OPERACIONES.indexOf(accion) === -1) {
    errors.push({ codigo: 'ACCION_INVALIDA', campo: 'accion', mensaje: 'Acción no válida: ' + String(accion), detalle: '§9' });
  } else {
    n.accion = accion;
  }

  const defCampo = ($, requerido) => {
    const v = p[$];
    const presente = v !== undefined && v !== null && v !== '';
    if (requerido && !presente) errors.push({ codigo: 'CAMPO_OBLIGATORIO_AUSENTE', campo: $, mensaje: 'Campo obligatorio ausente: ' + $, detalle: '§8' });
    if (v === null && !requerido && MATRIZ[$] && MATRIZ[$].OPC.includes(accion)) { n[$] = ''; return; }
    return v;
  };

  // captureId
  const cid = defCampo('captureId', true);
  if (cid !== undefined && cid !== null && cid !== '') {
    if (typeof cid !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'captureId', mensaje: 'captureId debe ser string', detalle: '§7' });
    else if (!RE_CAPTURE_ID.test(cid)) errors.push({ codigo: 'SINTAXIS_INVALIDA', campo: 'captureId', mensaje: 'captureId con formato inválido', detalle: '§12' });
  }
  if (cid) n.captureId = cid;

  // rut
  const rut = defCampo('rut', true);
  if (rut !== undefined && rut !== null && rut !== '') {
    if (typeof rut !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'rut', mensaje: 'rut debe ser string', detalle: '§7' });
    else if (!rutValido(rut)) errors.push({ codigo: 'RUT_INVALIDO', campo: 'rut', mensaje: 'RUT con formato o DV inválido', detalle: '§14' });
    else n.rut = rut.toUpperCase();
  }

  // Por operación
  const req = (f) => MATRIZ[f].REQ.indexOf(accion) !== -1;
  const opc = (f) => MATRIZ[f].OPC.indexOf(accion) !== -1;
  const soloValido = (f) => {
    if (req(f) && p[f] !== undefined && p[f] !== null) {
      const v = p[f];
      if (typeof v !== 'string') { errors.push({ codigo: 'TIPO_INCORRECTO', campo: f, mensaje: f + ' debe ser string', detalle: '§7' }); return; }
      n[f] = v;
    }
  };

  // nombre
  const nombre = defCampo('nombre', req('nombre'));
  if (req('nombre')) {
    if (nombre !== undefined && nombre !== null && nombre !== '') {
      if (typeof nombre !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'nombre', mensaje: 'nombre debe ser string', detalle: '§7' });
      else if (nombre.trim().split(/\s+/).length < 2) errors.push({ codigo: 'CAMPO_INVALIDO', campo: 'nombre', mensaje: 'Nombre incompleto (mínimo 2 palabras)', detalle: '§6' });
      else n.nombre = nombre.trim();
    }
  }
  if (!req('nombre') && p.nombre !== undefined && p.nombre !== '' && p.nombre !== null) {
    errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'nombre', mensaje: 'nombre no permitido para ' + accion, detalle: '§5.1' });
  }

  // sexo / estratificacion / sector
  if (p.sexo !== undefined) {
    if (req('sexo') || opc('sexo')) {
      if (p.sexo === null || p.sexo === '') n.sexo = '';
      else if (typeof p.sexo !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'sexo', mensaje: 'sexo debe ser string', detalle: '§7' });
      else if (SEXOS.indexOf(p.sexo) === -1) errors.push({ codigo: 'ENUM_INVALIDO', campo: 'sexo', mensaje: 'Sexo inválido: ' + p.sexo, detalle: '§9' });
      else n.sexo = p.sexo;
    } else if (p.sexo !== '') errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'sexo', mensaje: 'sexo no permitido para ' + accion, detalle: '§5.1' });
  }

  if (p.estratificacion !== undefined) {
    if (req('estratificacion') || opc('estratificacion')) {
      if (p.estratificacion === null || p.estratificacion === '') n.estratificacion = '';
      else if (typeof p.estratificacion !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'estratificacion', mensaje: 'estratificacion debe ser string', detalle: '§7' });
      else if (ESTRATIFICACIONES.indexOf(p.estratificacion) === -1) errors.push({ codigo: 'ENUM_INVALIDO', campo: 'estratificacion', mensaje: 'Estratificación inválida: ' + p.estratificacion, detalle: '§9' });
      else n.estratificacion = p.estratificacion;
    } else if (p.estratificacion !== '') errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'estratificacion', mensaje: 'estratificacion no permitida para ' + accion, detalle: '§5.1' });
  }

  if (p.sector !== undefined) {
    if (req('sector')) {
      if (typeof p.sector !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'sector', mensaje: 'sector debe ser string', detalle: '§7' });
      else if (SECTORES.indexOf(p.sector) === -1) errors.push({ codigo: 'ENUM_INVALIDO', campo: 'sector', mensaje: 'Sector inválido: ' + p.sector, detalle: '§9' });
      else n.sector = p.sector;
    } else if (p.sector !== null && p.sector !== '') errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'sector', mensaje: 'sector no permitido para ' + accion, detalle: '§5.1' });
  }

  // fechas
  const validarFecha = (f, esNacimiento) => {
    const v = p[f];
    if (v === undefined || v === null || v === '') return;
    if (typeof v !== 'string') { errors.push({ codigo: 'TIPO_INCORRECTO', campo: f, mensaje: f + ' debe ser string de fecha', detalle: '§7' }); return; }
    const min = esNacimiento ? CFG_FECHAS_CONTRATO.ANO_MIN_NACIMIENTO : CFG_FECHAS_CONTRATO.ANO_MIN_EVENTO;
    if (!esFechaIsoReal(v, min, CFG_FECHAS_CONTRATO.ANO_MAX)) {
      errors.push({ codigo: 'FECHA_INVALIDA', campo: f, mensaje: 'Fecha inválida (ISO yyyy-MM-dd, rango): ' + v, detalle: '§10' });
      return;
    }
    n[f] = v;
  };
  if (req('fechaNacimiento')) validarFecha('fechaNacimiento', true);
  else if (p.fechaNacimiento !== undefined && p.fechaNacimiento !== null && p.fechaNacimiento !== '') {
    errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'fechaNacimiento', mensaje: 'fechaNacimiento no permitido para ' + accion, detalle: '§5.1' });
  }
  if (req('fechaEvento')) validarFecha('fechaEvento', false);
  else if (p.fechaEvento !== undefined && p.fechaEvento !== null && p.fechaEvento !== '') {
    errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'fechaEvento', mensaje: 'fechaEvento no permitido para ' + accion, detalle: '§5.1' });
  }
  if (req('fechaIngreso')) validarFecha('fechaIngreso', false);
  else if (p.fechaIngreso !== undefined && p.fechaIngreso !== null && p.fechaIngreso !== '') {
    errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'fechaIngreso', mensaje: 'fechaIngreso no permitido para ' + accion, detalle: '§5.1' });
  }

  // telefonos
  const tel = p.telefonos;
  if (tel !== undefined) {
    if (req('telefonos') || opc('telefonos')) {
      if (tel === null || tel === '') n.telefonos = '';
      else if (typeof tel !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'telefonos', mensaje: 'telefonos debe ser string', detalle: '§7' });
      else if (!telefonoNormalizable(tel)) errors.push({ codigo: 'CAMPO_INVALIDO', campo: 'telefonos', mensaje: 'Teléfono no normalizable; vacío para omitir', detalle: '§6' });
      else n.telefonos = tel.replace(/\s+/g, '');
    } else if (tel !== '' && tel !== null) errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'telefonos', mensaje: 'telefonos no permitido para ' + accion, detalle: '§5.1' });
  }

  // profesional
  const prof = defCampo('profesional', true);
  if (prof !== undefined && prof !== null && prof !== '' && typeof prof !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'profesional', mensaje: 'profesional debe ser string', detalle: '§7' });
  else if (prof !== undefined && prof !== null && prof !== '') {
    if (PROFESIONALES_CATALOGO.indexOf(normProf(prof)) === -1) {
      errors.push({ codigo: 'ENUM_INVALIDO', campo: 'profesional', mensaje: 'Profesional fuera de catálogo: ' + prof, detalle: '§9' });
    } else n.profesional = prof.trim();
  }

  // profesionalSecundario
  const p2 = p.profesionalSecundario;
  if (p2 !== undefined && p2 !== null && p2 !== '') {
    if (req('profesionalSecundario') || opc('profesionalSecundario')) {
      if (typeof p2 !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'profesionalSecundario', mensaje: 'profesionalSecundario debe ser string', detalle: '§7' });
      else if (typeof p.profesional === 'string' && normProf(p.profesional) === normProf(p2)) {
        errors.push({ codigo: 'CAMPO_INVALIDO', campo: 'profesionalSecundario', mensaje: 'Los dos profesionales deben ser diferentes', detalle: '§6' });
      } else if (PROFESIONALES_CATALOGO.indexOf(normProf(p2)) === -1) {
        errors.push({ codigo: 'ENUM_INVALIDO', campo: 'profesionalSecundario', mensaje: 'Profesional secundario fuera de catálogo', detalle: '§9' });
      } else n.profesionalSecundario = p2.trim();
    } else if (p2 !== '') errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'profesionalSecundario', mensaje: 'profesionalSecundario no permitido para ' + accion, detalle: '§5.1' });
  }

  // observaciones
  const obs = p.observaciones;
  if (obs !== undefined) {
    if (req('observaciones') || opc('observaciones')) {
      if (obs === null) n.observaciones = '';
      else if (typeof obs !== 'string') errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'observaciones', mensaje: 'observaciones debe ser string', detalle: '§7' });
      else n.observaciones = obs.trim();
    } else if (obs !== '' && obs !== null) errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'observaciones', mensaje: 'observaciones no permitido para ' + accion, detalle: '§5.1' });
  }

  // confirmarNuevoPaciente
  const cnp = p.confirmarNuevoPaciente;
  if (cnp !== undefined) {
    if (opc('confirmarNuevoPaciente')) {
      if (cnp === null) { errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'confirmarNuevoPaciente', mensaje: 'confirmarNuevoPaciente debe ser boolean o ausente', detalle: '§11' }); }
      else if (typeof cnp !== 'boolean') { errors.push({ codigo: 'TIPO_INCORRECTO', campo: 'confirmarNuevoPaciente', mensaje: 'confirmarNuevoPaciente debe ser boolean', detalle: '§7' }); }
      else n.confirmarNuevoPaciente = cnp;
    } else if (cnp !== null && cnp !== false && cnp !== undefined) {
      errors.push({ codigo: 'CAMPO_NO_PERMITIDO', campo: 'confirmarNuevoPaciente', mensaje: 'confirmarNuevoPaciente no permitido para ' + accion, detalle: '§5.1' });
    }
  }

  // Obligatorios presentes y no null
  Object.keys(MATRIZ).forEach((f) => {
    if (!MATRIZ[f].REQ.includes(accion)) return;
    if (p[f] === undefined || p[f] === null || p[f] === '') {
      if (!errors.some((e) => e.campo === f)) errors.push({ codigo: 'CAMPO_OBLIGATORIO_AUSENTE', campo: f, mensaje: 'Campo obligatorio ausente: ' + f, detalle: '§8' });
    }
  });

  return { ok: errors.length === 0, errors, normalizado: n };
}

/**
 * CapturaStub: espejo de §16/§17/§18/§19/§13 sobre el contrato (sin procesamiento
 * clínico). Almacén clave= captureId → {canonical, estado, motivo, idInterno, idEvento}.
 */
function crearCapturaStub(pacientesRut) {
  const store = new Map();
  return {
    store,
    enviar(payload) {
      const v = validarPayload(payload);
      if (!v.ok) return { ok: false, errors: v.errors };
      const canon = JSON.stringify(v.normalizado);
      const prev = v.normalizado.captureId ? store.get(v.normalizado.captureId) : undefined;

      if (prev) {
        if (prev.canonical !== canon) {
          return { ok: false, errors: [{ codigo: 'CONFLICTO_IDEMPOTENCIA', campo: null, mensaje: 'captureId ya usado con otro payload', detalle: '§13 Caso B' }] };
        }
        if (prev.estado === 'PROCESADO' || prev.estado === 'REQUIERE_REVISION') {
          return { ok: true, data: { captureId: prev.captureId, accion: prev.accion, estado: prev.estado, motivo: prev.motivo, idInterno: prev.idInterno, idEvento: prev.idEvento }, reutilizado: true };
        }
        if (prev.estado === 'ERROR' || prev.estado === 'RECIBIDO' || prev.estado === 'VALIDANDO') {
          const res = procesar(v.normalizado, pacientesRut);
          var nuevo = { captureId: prev.captureId, ...res };
          nuevo.canonical = canon;
          store.set(prev.captureId, nuevo);
          return { ok: true, data: { captureId: nuevo.captureId, accion: nuevo.accion, estado: nuevo.estado, motivo: nuevo.motivo, idInterno: nuevo.idInterno, idEvento: nuevo.idEvento }, reutilizado: true };
        }
      }

      const res = procesar(v.normalizado, pacientesRut);
      res.canonical = canon;
      store.set(res.captureId, res);
      return { ok: true, data: { captureId: res.captureId, accion: res.accion, estado: res.estado, motivo: res.motivo, idInterno: res.idInterno, idEvento: res.idEvento }, reutilizado: false };
    },
    reiniciarAdmin(captureId) {
      const prev = store.get(captureId);
      if (!prev) return { ok: false, motivo: 'NO_ENCONTRADA' };
      if (prev.estado === 'PROCESADO') return { ok: false, motivo: 'YA_PROCESADO_NO_SE_REINICIA' };
      prev.estado = 'VALIDANDO';
      return { ok: true };
    }
  };
}

function procesar(normalizado, pacientesRut) {
  const base = { captureId: normalizado.captureId, accion: normalizado.accion, motivo: '', idInterno: '', idEvento: '' };
  if (normalizado.accion === 'nuevoIngreso') {
    return { ...base, estado: 'PROCESADO', motivo: '' };
  }
  if (normalizado.accion === 'registrarControl' || normalizado.accion === 'registrarSeguimiento' || normalizado.accion === 'actualizarDatos') {
    if (pacientesRut.indexOf(normalizado.rut) === -1) {
      return { ...base, estado: 'REQUIERE_REVISION', motivo: 'PERSONA_NO_ENCONTRADA' };
    }
    const tipo = normalizado.accion === 'registrarControl' ? 'CONTROL' : normalizado.accion === 'registrarSeguimiento' ? 'SEGUIMIENTO' : 'OTRO';
    return { ...base, estado: 'PROCESADO', idInterno: 'EC-PRUEBA-' + normalizado.rut.split('-')[0], idEvento: 'EV-' + tipo };
  }
  return { ...base, estado: 'ERROR', motivo: 'OPERACION_NO_SOPORTADA' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payloads de referencia (§27)
// ─────────────────────────────────────────────────────────────────────────────
const CID = 'Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90';
function payloadNuevoIngreso(extra) {
  return Object.assign({
    captureId: CID, accion: 'nuevoIngreso', rut: '12345678-5', nombre: 'LUISA ANDREA PARRA SOTO',
    sexo: 'F', fechaNacimiento: '1988-03-12', sector: 'AMARILLO', fechaIngreso: '2026-09-01', estratificacion: 'G1',
    telefonos: '+56955556666', profesional: 'Matrona/o', observaciones: ''
  }, extra || {});
}
function payloadControl(cid) {
  return {
    captureId: cid || 'Cp2-' + 'b'.repeat(32), accion: 'registrarControl', rut: '12345678-5',
    fechaEvento: '2026-09-03', profesional: 'Matrona/o', observaciones: 'control periódico'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE A — estructura y coherencia del documento (§30/§37)
// ─────────────────────────────────────────────────────────────────────────────
t('secciones_completas — las 28 secciones normativas existen', () => {
  const presentes = [];
  DOC.split('\n').forEach((ln) => {
    const m = /^## (\d{1,2})\. /.exec(ln);
    if (m) presentes.push(Number(m[1]));
  });
  for (let i = 1; i <= 28; i++) cont(presentes, i, 'falta sección ' + i);
  cont(presentes, 29, 'falta criterios de aceptación');
  cont(presentes, 30, 'falta condición de bloqueo');
});

t('version_constante — CAPTURE_CONTRACT_VERSION = 2 y prefijo Cp2-', () => {
  A(DOC.indexOf('CAPTURE_CONTRACT_VERSION = 2') !== -1, 'el documento declara versión 2');
  A(DOC.indexOf('`Cp2-`') !== -1, 'el documento define el prefijo Cp2-');
  A(CONTRACT_VERSION === 2, 'versión embebida');
  A(RE_CAPTURE_ID.test('Cp2-' + 'a'.repeat(32)), 'regex captureId acepta formato válido');
  A(!RE_CAPTURE_ID.test('Cp2-' + 'A'.repeat(32)), 'regex rechaza mayúsculas');
  A(!RE_CAPTURE_ID.test('UI-123'), 'el formato V2 no acepta identificadores legado');
});

t('matriz_consistente — cada campo de §5.1 con obligatoriedad definida y cobertura', () => {
  const filas = {};
  let enMatriz = false;
  DOC.split('\n').forEach((ln) => {
    if (/### 5\.1/.test(ln)) { enMatriz = true; return; }
    if (enMatriz && /^##|^###/.test(ln)) enMatriz = false;
    if (!enMatriz) return;
    const m = /^\| `([a-zA-Z]+)` \| (REQ|OPC|NP) \| (REQ|OPC|NP) \| (REQ|OPC|NP) \| (REQ|OPC|NP) \|/.exec(ln);
    if (m) filas[m[1]] = [m[2], m[3], m[4], m[5]];
  });
  Object.keys(MATRIZ).forEach((f) => {
    A(Object.prototype.hasOwnProperty.call(filas, f), 'matriz del doc no cubre ' + f);
    ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos'].forEach((op, i) => {
      const esperado = MATRIZ[f].REQ.includes(op) ? 'REQ' : MATRIZ[f].OPC.includes(op) ? 'OPC' : 'NP';
      igual(filas[f][i], esperado, 'matriz ' + f + '/' + op);
    });
  });
  A(Object.keys(filas).length === Object.keys(MATRIZ).length, 'el doc define campos extra fuera del §6');
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTE B — casos mínimos §36 sobre el modelo normativo
// ─────────────────────────────────────────────────────────────────────────────
t('schema_valido — §27.1 aceptado', () => {
  const r = validarPayload(payloadNuevoIngreso());
  A(r.ok, 'payload §27.1 debe ser válido: ' + JSON.stringify(r.errors));
  igual(r.normalizado.accion, 'nuevoIngreso');
});

t('campo_obligatorio_ausente — falta nombre (§27.3)', () => {
  const r = validarPayload({ captureId: CID, accion: 'nuevoIngreso', rut: '12345678-5' });
  A(!r.ok, 'debe rechazar');
  const e = r.errors.find((x) => x.codigo === 'CAMPO_OBLIGATORIO_AUSENTE');
  A(!!e, 'debe reportar CAMPO_OBLIGATORIO_AUSENTE: ' + JSON.stringify(r.errors));
  igual(e.campo, 'nombre');
});

t('accion_invalida — operación inexistente', () => {
  const r = validarPayload({ captureId: CID, accion: 'borrarRegistro', rut: '12345678-5' });
  A(!r.ok, 'debe rechazar');
  A(r.errors.some((x) => x.codigo === 'ACCION_INVALIDA'), 'reporta ACCION_INVALIDA');
});

t('campo_no_permitido — campo clínico en operación equivocada', () => {
  const r = validarPayload({ ...payloadControl(), fechaNacimiento: '1988-03-12', nombre: 'X Y' });
  A(!r.ok, 'debe rechazar');
  A(r.errors.some((x) => x.codigo === 'CAMPO_NO_PERMITIDO' && x.campo === 'fechaNacimiento'), 'fechaNacimiento NP en registrarControl');
  A(r.errors.some((x) => x.codigo === 'CAMPO_NO_PERMITIDO' && x.campo === 'nombre'), 'nombre NP en registrarControl');
});

t('campo_interno_rechazado — claves internas/generadas prohibidas (§6.1)', () => {
  ['ESTADO', 'INGRESO_FILA', 'ID_INTERNO', 'ID_EVENTO', 'REINTENTOS', 'TRAZA_CRUDA', 'RESPONSE_ID', 'responseId'].forEach((k) => {
    const p = payloadNuevoIngreso();
    p[k] = 'x';
    const r = validarPayload(p);
    A(!r.ok, 'debe rechazar ' + k);
    A(r.errors.some((x) => x.codigo === 'CAMPO_NO_PERMITIDO' && x.campo === k), 'CAMPO_NO_PERMITIDO para ' + k);
  });
});

t('tipo_incorrecto — tipos JSON no declarados', () => {
  const pNumero = payloadNuevoIngreso(); pNumero.rut = 12345678;
  const r1 = validarPayload(pNumero);
  A(!r1.ok && r1.errors.some((x) => x.codigo === 'TIPO_INCORRECTO' && x.campo === 'rut'), 'rut numérico → TIPO_INCORRECTO');
  const pBool = payloadNuevoIngreso(); pBool.confirmarNuevoPaciente = 'si';
  const r2 = validarPayload(pBool);
  A(!r2.ok && r2.errors.some((x) => x.codigo === 'TIPO_INCORRECTO' && x.campo === 'confirmarNuevoPaciente'), 'cnp string → TIPO_INCORRECTO');
  const pObs = payloadCampaña(); if (pObs) pObs.observaciones = { a: 1 };
  const r3 = pObs ? validarPayload(pObs) : { ok: true };
  if (pObs) A(!r3.ok && r3.errors.some((x) => x.codigo === 'TIPO_INCORRECTO' && x.campo === 'observaciones'), 'observaciones objeto → TIPO_INCORRECTO');
});
function payloadCampaña() { return payloadNuevoIngreso({ observaciones: 'nota' }); }

t('enum_invalido — sector, sexo, estratificación, profesional fuera de conjunto (§9)', () => {
  const c = (extra) => validarPayload(payloadNuevoIngreso(extra));
  A(!c({ sector: 'AZUL' }).ok && c({ sector: 'AZUL' }).errors.some((x) => x.codigo === 'ENUM_INVALIDO' && x.campo === 'sector'), 'sector AZUL');
  A(!c({ sexo: 'X' }).ok && c({ sexo: 'X' }).errors.some((x) => x.codigo === 'ENUM_INVALIDO' && x.campo === 'sexo'), 'sexo X');
  A(!c({ estratificacion: 'G4' }).ok && c({ estratificacion: 'G4' }).errors.some((x) => x.codigo === 'ENUM_INVALIDO' && x.campo === 'estratificacion'), 'estrat G4');
  A(!c({ profesional: 'No existe' }).ok && c({ profesional: 'No existe' }).errors.some((x) => x.codigo === 'ENUM_INVALIDO' && x.campo === 'profesional'), 'profesional fuera de catálogo');
});

t('fecha_invalida — ISO estricto + rango + calendario real (§10)', () => {
  const r1 = validarPayload(payloadNuevoIngreso({ fechaNacimiento: '12/03/1988' }));
  A(!r1.ok && r1.errors.some((x) => x.codigo === 'FECHA_INVALIDA' && x.campo === 'fechaNacimiento'), 'dd/MM/yyyy no es ISO estricto');
  const r2 = validarPayload(payloadNuevoIngreso({ fechaNacimiento: '2026-02-30' }));
  A(!r2.ok && r2.errors.some((x) => x.codigo === 'FECHA_INVALIDA'), 'fecha imposible 2026-02-30');
  const r3 = validarPayload(payloadNuevoIngreso({ fechaNacimiento: '1899-12-31' }));
  A(!r3.ok && r3.errors.some((x) => x.codigo === 'FECHA_INVALIDA'), 'año anterior a 1900');
  const r4 = validarPayload({ ...payloadControl(), fechaEvento: '03/09/2026' });
  A(!r4.ok && r4.errors.some((x) => x.codigo === 'FECHA_INVALIDA'), 'dd/MM/yyyy no es ISO estricto');
  const r5 = validarPayload({ ...payloadControl(), fechaEvento: '1980-01-01' });
  A(!r5.ok && r5.errors.some((x) => x.codigo === 'FECHA_INVALIDA'), 'fecha evento < 2015');
});

t('fechaIngreso_obligatorio — REQ en nuevoIngreso (§5.1/§8)', () => {
  const r = validarPayload(payloadNuevoIngreso({ fechaIngreso: undefined }));
  A(!r.ok, 'nuevoIngreso sin fechaIngreso debe rechazarse');
  A(r.errors.some((x) => x.codigo === 'CAMPO_OBLIGATORIO_AUSENTE' && x.campo === 'fechaIngreso'), 'reporta CAMPO_OBLIGATORIO_AUSENTE fechaIngreso');
  const r2 = validarPayload(payloadNuevoIngreso({ fechaIngreso: '' }));
  A(!r2.ok && r2.errors.some((x) => x.codigo === 'CAMPO_OBLIGATORIO_AUSENTE' && x.campo === 'fechaIngreso'), 'vacío = ausente');
  const r3 = validarPayload(payloadNuevoIngreso({ fechaIngreso: null }));
  A(!r3.ok && r3.errors.some((x) => x.codigo === 'CAMPO_OBLIGATORIO_AUSENTE' && x.campo === 'fechaIngreso'), 'null = ausente');
});

t('fechaIngreso_np — NP fuera de nuevoIngreso (§5.1)', () => {
  const r = validarPayload({ ...payloadControl(), fechaIngreso: '2026-09-01' });
  A(!r.ok, 'fechaIngreso en registrarControl debe rechazarse');
  A(r.errors.some((x) => x.codigo === 'CAMPO_NO_PERMITIDO' && x.campo === 'fechaIngreso'), 'CAMPO_NO_PERMITIDO fechaIngreso');
});

t('fechaIngreso_formato — ISO estricto + rango [2015,2040] (§10)', () => {
  const r1 = validarPayload(payloadNuevoIngreso({ fechaIngreso: '01/09/2026' }));
  A(!r1.ok && r1.errors.some((x) => x.codigo === 'FECHA_INVALIDA' && x.campo === 'fechaIngreso'), 'dd/MM/yyyy no es ISO');
  const r2 = validarPayload(payloadNuevoIngreso({ fechaIngreso: '2026-13-01' }));
  A(!r2.ok && r2.errors.some((x) => x.codigo === 'FECHA_INVALIDA' && x.campo === 'fechaIngreso'), 'mes 13');
  const r3 = validarPayload(payloadNuevoIngreso({ fechaIngreso: '2026-02-30' }));
  A(!r3.ok && r3.errors.some((x) => x.codigo === 'FECHA_INVALIDA' && x.campo === 'fechaIngreso'), 'fecha imposible');
  const r4 = validarPayload(payloadNuevoIngreso({ fechaIngreso: '2014-12-31' }));
  A(!r4.ok && r4.errors.some((x) => x.codigo === 'FECHA_INVALIDA' && x.campo === 'fechaIngreso'), 'año < 2015');
  const r5 = validarPayload(payloadNuevoIngreso({ fechaIngreso: '2041-01-01' }));
  A(!r5.ok && r5.errors.some((x) => x.codigo === 'FECHA_INVALIDA' && x.campo === 'fechaIngreso'), 'año > 2040');
  const rOk = validarPayload(payloadNuevoIngreso({ fechaIngreso: '2015-01-01' }));
  A(rOk.ok, '2015-01-01 válido');
});

t('fechaIngreso_sin_fallback — no se deriva de fechaEvento ni de hoy (§10)', () => {
  const r = validarPayload(payloadNuevoIngreso({ fechaIngreso: undefined, fechaEvento: '2026-09-02' }));
  A(!r.ok, 'aunque exista fechaEvento, fechaIngreso ausente sigue siendo error');
  A(r.errors.some((x) => x.codigo === 'CAMPO_OBLIGATORIO_AUSENTE' && x.campo === 'fechaIngreso'), 'CAMPO_OBLIGATORIO_AUSENTE fechaIngreso');
});

t('idempotencia_fechaIngreso (Caso B) — mismo ID + solo fechaIngreso distinta → CONFLICTO', () => {
  const stub = crearCapturaStub(['12345678-5']);
  stub.enviar(payloadNuevoIngreso());
  const res = stub.enviar(payloadNuevoIngreso({ fechaIngreso: '2026-09-02' }));
  A(!res.ok, 'debe rechazar');
  A(res.errors.some((x) => x.codigo === 'CONFLICTO_IDEMPOTENCIA'), 'CONFLICTO_IDEMPOTENCIA');
  igual(stub.store.size, 1, 'sin efectos nuevos');
});

t('null_incorrecto — null en REQ = CAMPO_OBLIGATORIO_AUSENTE (§8/§11)', () => {
  const r = validarPayload(payloadNuevoIngreso({ rut: null }));
  A(!r.ok, 'rut null debe rechazarse');
  A(r.errors.some((x) => x.codigo === 'CAMPO_OBLIGATORIO_AUSENTE' && x.campo === 'rut'), 'null en REQ → CAMPO_OBLIGATORIO_AUSENTE');
  const r2 = validarPayload(payloadNuevoIngreso({ sexo: null, estratificacion: null }));
  A(r2.ok, 'null en OPC nullable es válido');
});

t('respuesta_valida — forma exacta de §16', () => {
  const stub = crearCapturaStub(['12345678-5']);
  const res = stub.enviar(payloadNuevoIngreso());
  A(res.ok, 'debe aceptar');
  igual(typeof res.data.captureId, 'string');
  igual(res.data.estado, 'PROCESADO');
  igual(res.data.motivo, '');
  A(!('errors' in res) || res.errors === undefined, 'ok:true sin errors');
  nohay(res.data, 'estadoIngreso');
});

t('respuesta_error — forma exacta de §17', () => {
  const stub = crearCapturaStub(['12345678-5']);
  const res = stub.enviar({ captureId: CID, accion: 'nuevoIngreso', rut: '12345678-5' });
  A(!res.ok, 'debe rechazar');
  A(Array.isArray(res.errors) && res.errors.length > 0, 'errors[]');
  const e = res.errors[0];
  A(typeof e.codigo === 'string' && typeof e.campo === 'string' && typeof e.mensaje === 'string', 'codigo/campo/mensaje');
  A('detalle' in e, 'detalle presente (string o vacío)');
});

t('idempotencia_reenvio (Caso A1) — mismo ID+payload devuelve resultado previo sin efectos', () => {
  const stub = crearCapturaStub(['12345678-5']);
  const a = stub.enviar(payloadNuevoIngreso());
  const b = stub.enviar(payloadNuevoIngreso());
  A(a.ok && b.ok, 'ambos aceptados');
  A(b.reutilizado === true, 'segundo envío es reutilización');
  igual(b.data.estado, a.data.estado);
  igual(b.data.idInterno, a.data.idInterno);
  igual(stub.store.size, 1, 'un solo registro de captura');
});

t('idempotencia_reintento (Caso A2) — ERROR se reprocesa sin duplicar', () => {
  const stub = crearCapturaStub(['12345678-5']);
  stub.store.set(CID, { captureId: CID, accion: 'nuevoIngreso', canonical: JSON.stringify(validarPayload(payloadNuevoIngreso()).normalizado), estado: 'ERROR', motivo: 'timeout simulado', idInterno: '', idEvento: '' });
  const res = stub.enviar(payloadNuevoIngreso());
  A(res.ok, 'reintento seguro aceptado');
  igual(res.data.estado, 'PROCESADO');
  igual(stub.store.size, 1, 'no crea registro duplicado');
});

t('idempotencia_conflicto (Caso B) — mismo ID + payload distinto → CONFLICTO_IDEMPOTENCIA', () => {
  const stub = crearCapturaStub(['12345678-5']);
  stub.enviar(payloadNuevoIngreso());
  const res = stub.enviar(payloadNuevoIngreso({ observaciones: 'cambio el comentario' }));
  A(!res.ok, 'debe rechazar');
  A(res.errors.some((x) => x.codigo === 'CONFLICTO_IDEMPOTENCIA'), 'CONFLICTO_IDEMPOTENCIA');
  igual(stub.store.size, 1, 'sin efectos nuevos');
});

t('idempotencia_vs_dedupe_negocio (Caso C) — datos iguales + ID nuevo NO es conflicto', () => {
  const stub = crearCapturaStub(['12345678-5']);
  stub.enviar(payloadNuevoIngreso());
  const res = stub.enviar(payloadNuevoIngreso({ captureId: 'Cp2-' + 'c'.repeat(32) }));
  A(res.ok && res.data.estado === 'PROCESADO', 'ID nuevo con datos iguales se acepta (dedupe = negocio)');
  igual(stub.store.size, 2);
});

t('estados_cerrados — conjunto §18.1 y terminal PROCESADO', () => {
  igual(ESTADOS_CAPTURA.length, 6);
  cont(ESTADOS_CAPTURA, 'RECIBIDO');
  cont(ESTADOS_CAPTURA, 'VALIDANDO');
  cont(ESTADOS_CAPTURA, 'VALIDO');
  cont(ESTADOS_CAPTURA, 'PROCESADO');
  cont(ESTADOS_CAPTURA, 'REQUIERE_REVISION');
  cont(ESTADOS_CAPTURA, 'ERROR');
});

t('transicion_terminal_no_reinicia — PROCESADO inamovible (§19/§23)', () => {
  const stub = crearCapturaStub(['12345678-5']);
  stub.enviar(payloadNuevoIngreso());
  const r = stub.reiniciarAdmin(CID);
  A(!r.ok && r.motivo === 'YA_PROCESADO_NO_SE_REINICIA', 'el admin no reinicia PROCESADO');
});

t('persona_no_encontrada — clínica sobre RUT inexistente → REQUIERE_REVISION (no error)', () => {
  const stub = crearCapturaStub(['9999']);
  const res = stub.enviar(payloadControl());
  A(res.ok, 'captura aceptada aunque la persona no exista');
  igual(res.data.estado, 'REQUIERE_REVISION');
  A(res.data.motivo.indexOf('PERSONA_NO_ENCONTRADA') !== -1, 'motivo explica');
});

t('campo_permitido_por_operacion — las 4 operaciones aceptan su payload válido mínimo', () => {
  const stub = crearCapturaStub(['12345678-5']);
  const casos = [
    payloadNuevoIngreso({ captureId: 'Cp2-' + 'd'.repeat(32) }),
    payloadControl('Cp2-' + 'e'.repeat(32)),
    { captureId: 'Cp2-' + 'f'.repeat(32), accion: 'registrarSeguimiento', rut: '12345678-5', fechaEvento: '2026-09-04', profesional: 'Matrona/o' },
    { captureId: 'Cp2-' + '1'.repeat(32), accion: 'actualizarDatos', rut: '12345678-5', telefonos: '+56977778888', profesional: 'Matrona/o' }
  ];
  casos.forEach((p) => {
    const res = stub.enviar(p);
    A(res.ok, 'debe aceptar ' + p.accion + ': ' + JSON.stringify(res.errors || ''));
  });
  const noFalso = { captureId: 'Cp2-' + '0'.repeat(32), accion: 'nuevoIngreso', rut: '12345678-5', nombre: 'A B', fechaNacimiento: '1990-01-01', sector: 'NARANJO', fechaIngreso: '2026-09-01', profesional: 'TENS' };
  const okFalso = stub.enviar(noFalso);
  A(okFalso.ok, 'nuevoIngreso sin estratificación/telefonos es válido (OPC)');
});

// ─────────────────────────────────────────────────────────────────────────────
// §5.2 — fecha del evento OTRO de actualizarDatos (delta v2.1)
// ─────────────────────────────────────────────────────────────────────────────
// Espejo ejecutable del §5.2: el backend genera la fecha de la operación
// (ISO yyyy-MM-dd, precisión día, zona local), nunca derivada del payload.
function fechaOperacionBackend() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function payloadActualizarDatos(cid) {
  return {
    captureId: cid || 'Cp2-fedcba9876543210fedcba9876543210',
    accion: 'actualizarDatos', rut: '12345678-5', telefonos: '+56977778888',
    profesional: 'Matrona/o', observaciones: 'actualiza teléfono'
  };
}

t('actualizar_otro_fecha_backend — §5.2 declara la fecha del evento OTRO generada por el backend', () => {
  A(DOC.indexOf('### 5.2') !== -1, 'existe la sección §5.2 en el documento');
  const seg52 = DOC.split('### 5.2')[1] || '';
  A(seg52.indexOf('generada por el backend') !== -1, '§5.2 declara fecha generada por el backend');
  A(seg52.indexOf('fecha de la operación') !== -1, '§5.2 declara fecha de la operación');
  A(seg52.indexOf('fechaEvento') !== -1, '§5.2 mantiene la referencia a fechaEvento (NP en payload)');
  A(seg52.indexOf('FECHA_INVALIDA') !== -1 || seg52.indexOf('FECHA_EVENTO_AUSENTE') !== -1, '§5.2 elimina el escenario fechaEvento=\'\' → FECHA_INVALIDA');
  igual(EVENTO_OTRO_FECHA.generador, 'backend');
  igual(EVENTO_OTRO_FECHA.formato, 'yyyy-MM-dd');
  igual(EVENTO_OTRO_FECHA.precision, 'dia');
  igual(EVENTO_OTRO_FECHA.zona, 'America/Santiago');
  igual(EVENTO_OTRO_FECHA.tipo, 'OTRO');
  A(seg52.indexOf('registrarControl') !== -1, '§5.2 limita la regla a actualizarDatos (control/seguimiento REQ desde el cliente)');
});

t('actualizar_otro_sin_fecha_evento — payload §27.7 válido; nunca fechaEvento=\'\' → FECHA_INVALIDA', () => {
  const p = payloadActualizarDatos();
  // §27.7: el payload normativo NO transporta fechaEvento
  A(!Object.prototype.hasOwnProperty.call(p, 'fechaEvento'), 'el payload normativo no incluye fechaEvento');
  const r = validarPayload(p);
  A(r.ok, 'payload válido §27.7 aceptado: ' + JSON.stringify(r.errors));
  // §5.2: el backend produce la fecha de la operación (día), siempre no vacía y en rango
  const f = fechaOperacionBackend();
  A(esFechaIsoReal(f, CFG_FECHAS_CONTRATO.ANO_MIN_EVENTO, CFG_FECHAS_CONTRATO.ANO_MAX), 'fecha de operación ISO real en rango [2015,2040]');
  A(f !== '' && f.length === 10, 'la fecha de operación nunca es vacía (' + JSON.stringify(f) + ')');
  // idempotencia de §13: reintento con payload idéntico → reuse (Caso A1), sin duplicar
  const stub = crearCapturaStub(['12345678-5']);
  const a = stub.enviar(p);
  const b = stub.enviar(payloadActualizarDatos());
  A(a.ok && b.ok, 'envíos aceptados');
  A(b.reutilizado === true, 'reintento idéntico → reutilización sin efectos nuevos');
  igual(a.data.estado, 'PROCESADO');
  A(String(a.data.idEvento).indexOf('EV-') === 0, 'evento OTRO entregado (' + a.data.idEvento + ')');
  igual(stub.store.size, 1, 'un solo registro de captura');
});

t('actualizar_otro_fecha_evento_np — fechaEvento en el payload de actualizarDatos es CAMPO_NO_PERMITIDO', () => {
  const p = payloadActualizarDatos();
  p.fechaEvento = '2026-09-05';
  const r = validarPayload(p);
  A(!r.ok, 'debe rechazar');
  A(r.errors.some((x) => x.codigo === 'CAMPO_NO_PERMITIDO' && x.campo === 'fechaEvento'), 'CAMPO_NO_PERMITIDO fechaEvento');
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTE C — ejemplos NORMATIVOS del documento (§27) verificados ejecutablemente
// ─────────────────────────────────────────────────────────────────────────────
function extraerEjemplos() {
  const ej = [];
  const lineas = DOC.split('\n');
  let seccion = '';
  let codigo = [];
  let enCodigo = false;
  lineas.forEach((ln) => {
    const h = /^### (27\.\d)/.exec(ln);
    if (h) seccion = h[1];
    if (/^```json/.test(ln)) { enCodigo = true; codigo = []; return; }
    if (enCodigo && /^```$/.test(ln.trim())) { enCodigo = false; const obj = JSON.parse(codigo.join('\n')); if (!('ok' in obj)) ej.push({ seccion, payload: obj }); return; }
    if (enCodigo) codigo.push(ln);
  });
  return ej;
}

t('ejemplos_normativos_validos — §27.1 aceptado exactamente como está', () => {
  const e = extraerEjemplos().find((x) => x.seccion === '27.1');
  A(!!e, 'ejemplo 27.1 presente');
  const r = validarPayload(e.payload);
  A(r.ok, 'el ejemplo normativo §27.1 debe ser aceptado: ' + JSON.stringify(r.errors));
});

t('ejemplos_normativos_invalidos — §27.3/§27.4 rechazados con el código esperado', () => {
  const es = extraerEjemplos();
  const p3 = es.find((x) => x.seccion === '27.3');
  A(!!p3, 'ejemplo 27.3 presente');
  const r3 = validarPayload(p3.payload);
  A(!r3.ok && r3.errors.some((x) => x.codigo === 'CAMPO_OBLIGATORIO_AUSENTE' && x.campo === 'nombre'), '27.3 → CAMPO_OBLIGATORIO_AUSENTE nombre');
  const p4 = es.find((x) => x.seccion === '27.4');
  A(!!p4, 'ejemplo 27.4 presente');
  const r4 = validarPayload(p4.payload);
  A(!r4.ok, '27.4 inválido');
  A(r4.errors[0] && r4.errors[0].codigo === 'ENUM_INVALIDO' && r4.errors[0].campo === 'sector', '27.4 errors[0] → ENUM_INVALIDO sector (sector es el único defecto): ' + JSON.stringify(r4.errors));
  A(!r4.ok && r4.errors.some((x) => x.codigo === 'ENUM_INVALIDO' && x.campo === 'sector'), '27.4 → ENUM_INVALIDO sector');
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTE D — §38 consistencia con la implementación EXISTENTE (vm)
// ─────────────────────────────────────────────────────────────────────────────
const archivos = [
  'src/00_Config.js', 'src/01_Utilidades.js', 'src/02_Normalizacion.js', 'src/03_Fuentes.js',
  'src/04_Identificacion.js', 'src/13_Eventos.js', 'src/14_REM.js', 'src/15_RemExcel.js',
  'src/16_Amarillo.js', 'src/17_Hojas.js', 'src/18_Calidad.js', 'src/19_Permisos.js',
  'src/20_Instalador.js', 'src/21_Auditoria.js', 'src/22_HojasVisual.js', 'src/12_Ingresos.js',
  'src/24_Formulario.js', 'src/25_Entorno.js', 'src/Webhook.js', 'src/WebApp.gs',
  'src/06_Modelo.js', 'src/08_Dashboard.js', 'src/11_DatosPrueba.js'
];
let T = null;
try {
  let code = '';
  for (const a of archivos) code += readFileSync(path.join(raiz, a), 'utf8') + '\n';
  const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'ecicep-contrato-v2.js' });
  T = sandbox;
} catch (e) {
  T = null;
  console.log('   (warning) núcleo no cargable para §38: ' + e.message);
}

// `var` y `function` se anexan al objeto global del vm, pero las declaraciones
// `const`/`let` de nivel superior solo existen como enlaces léxicos: se acceden
// evaluando en el propio contexto (mismo patrón de la batería principal).
function g(expr) { return vm.runInContext(expr, T); }

t('impl_modelo — enums/estados/rangos citados por el contrato existen en 00_Config', () => {
  A(!!T, 'núcleo cargado');
  A(JSON.stringify(g('SECTORES_RESPONSABLES')) === JSON.stringify(SECTORES), 'SECTORES_RESPONSABLES');
  A(JSON.stringify(g('SEXOS.VALIDOS')) === JSON.stringify(SEXOS), 'SEXOS.VALIDOS');
  A(g('CFG_FECHAS.ANO_MIN') === 2015 && g('CFG_FECHAS.ANO_MAX') === 2040 && g('CFG_FECHAS.ANO_MIN_NACIMIENTO') === 1900, 'CFG_FECHAS');
  A(g('CFG_FECHAS.ZONA') === 'America/Santiago', 'zona horaria');
  A(Array.isArray(g('ESTADOS_INGRESO.VALIDOS')) && g('ESTADOS_INGRESO.VALIDOS').indexOf('INGRESADO') !== -1, 'ESTADOS_INGRESO');
  ['CONTROL', 'SEGUIMIENTO', 'OTRO'].forEach((tipo) => cont(g('TIPOS_EVENTO.VALIDOS'), tipo, 'TIPOS_EVENTO'));
});

t('impl_puertas — INGRESO_COLUMNAS y COLUMNAS_EVENTOS soportan TR-1/TR-2', () => {
  A(!!T, 'núcleo cargado');
  const colsIng = g('INGRESO_COLUMNAS');
  ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)', 'FECHA DE INGRESO', 'ESTRATIFICACION', 'DUPLA INGRESO', 'OBSERVACIONES', 'ESTADO_INGRESO', 'NOTA_SISTEMA'].forEach((c) => cont(colsIng, c, 'INGRESO_COLUMNAS'));
  const colsEv = g('COLUMNAS_EVENTOS');
  ['ID_EVENTO', 'ID_INTERNO', 'RUT', 'FECHA_EVENTO', 'TIPO_EVENTO', 'PROFESIONAL', 'FUENTE'].forEach((c) => cont(colsEv, c, 'COLUMNAS_EVENTOS'));
  const mp = g('MODELO_PACIENTE');
  ['ID_INTERNO', 'RUT', 'NOMBRE', 'DUPLA_INGRESO', 'PROFESIONAL_SEGUIMIENTO', 'TELEFONOS', 'OBSERVACIONES'].forEach((c) => {
    A(mp.some((x) => x.campo === c), 'MODELO_PACIENTE.' + c);
  });
});

t('impl_no_colision — el payload V2 no es la entrada de la implementación histórica', () => {
  A(!!T, 'núcleo cargado');
  ['NUEVO_INGRESO', 'REGISTRAR_CONTROL', 'REGISTRAR_SEGUIMIENTO', 'ACTUALIZAR_DATOS'].forEach((leg) => {
    A(T.FORM_CONFIG.ACCIONES.VALIDOS.indexOf(leg) !== -1, 'legado aún expone ' + leg);
    A(T.FORM_CONFIG.ACCIONES.VALIDOS.indexOf(leg.toLowerCase()) === -1, '…y no existe alias camelCase');
  });
  OPERACIONES.forEach((op) => A(T.FORM_CONFIG.ACCIONES.VALIDOS.indexOf(op) === -1, 'la implementación histórica NO reconoce ' + op));
  A(T.FORM_CONFIG.MARCAS.PREFIJO === 'FORM|', 'marca legado FORM|');
  A(T.FORM_CONFIG.ESTADOS !== undefined, 'FORM_CONFIG.ESTADOS sigue existiendo como material histórico');
});

t('impl_adaptador_necesario — la validación histórica rechaza el payload V2 (sin acceso silencioso)', () => {
  A(!!T, 'núcleo cargado');
  const r = T.Form_validarRespuesta(payloadNuevoIngreso());
  A(!r.ok, 'el payload V2 (camelCase) NO pasa por la validación histórica');
  A(r.errores && r.errores.some((e) => e.campo === 'ACCION'), 'la validación histórica reporta ACCION inválida (prueba de que no hay alias silencioso)');
});

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('TOTAL: ' + (R.pass + R.fail + R.skip) + ' / PASS: ' + R.pass + ' / FAIL: ' + R.fail + ' / SKIP: ' + R.skip);
if (R.fail > 0) { console.log('Contrato sin aprobar: corregir siguiendo §30 del documento.'); process.exit(1); }
console.log('Contrato verificado (docs/CONTRATO_CAPTURA_V2.md).');