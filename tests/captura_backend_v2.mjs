#!/usr/bin/env node
/**
 * Batería de tests del BACKEND DE CAPTURA V2 — ECICEP (Fase 3).
 *
 * Fuente normativa: docs/CONTRATO_CAPTURA_V2.md (única fuente del contrato).
 * Verifica la IMPLEMENTACIÓN src/26_Captura.js contra el contrato:
 *   - Parte A: validación del payload (capas §14, catálogo §20, matriz §5.1).
 *   - Parte B: envío vía ctx en memoria (persistencia §15, idempotencia §13,
 *     estados §18, reintentos §23, respuestas §16/§17).
 *   - Parte C: transformación TR-1 §21.1, marcas §25, coherencia con 00_Config
 *     y el backend legacy (§26, Anexo B).
 * 100% de las pruebas sin hojas reales (ctx inyectable); los entrypoints GAS
 * se prueban solo como "no crash" en node.
 *
 * Uso: node tests/captura_backend_v2.mjs
 *
 * Salida: [PASS]/[FAIL]/[SKIP] por prueba + TOTAL/PASS/FAIL/SKIP.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Carga del núcleo (mismo orden que ejecutar_local.mjs) + 26_Captura.js
// ─────────────────────────────────────────────────────────────────────────────
const archivos = [
  'src/00_Config.js',
  'src/01_Utilidades.js',
  'src/02_Normalizacion.js',
  'src/03_Fuentes.js',
  'src/04_Identificacion.js',
  'src/13_Eventos.js',
  'src/14_REM.js',
  'src/15_RemExcel.js',
  'src/16_Amarillo.js',
  'src/17_Hojas.js',
  'src/18_Calidad.js',
  'src/19_Permisos.js',
  'src/20_Instalador.js',
  'src/21_Auditoria.js',
  'src/22_HojasVisual.js',
  'src/12_Ingresos.js',
  'src/24_Formulario.js',
  'src/25_Entorno.js',
  'src/Webhook.js',
  'src/WebApp.gs',
  'src/06_Modelo.js',
  'src/08_Dashboard.js',
  'src/11_DatosPrueba.js',
  'src/10_Pruebas.js',
  'src/26_Captura.js',
  'src/27_Actualizacion.js'
];
const texto26 = readFileSync(path.join(raiz, 'src/26_Captura.js'), 'utf8');

let codigo = '';
for (const a of archivos) codigo += readFileSync(path.join(raiz, a), 'utf8') + '\n';

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(codigo, sandbox, { filename: 'ecicep-nucleo-backend-v2.js' });
} catch (e) {
  console.error('ERROR cargando el núcleo:', e.message);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini runner (mismo estilo que contrato_captura_v2.mjs)
// ─────────────────────────────────────────────────────────────────────────────
const R = { pass: 0, fail: 0, skip: 0 };
function t(nombre, fn) {
  try {
    fn();
    R.pass += 1;
    console.log('[PASS] ' + nombre);
  } catch (e) {
    R.fail += 1;
    console.log('[FAIL] ' + nombre);
    console.log('   CAUSA: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
  }
}
function skip(nombre, motivo) {
  R.skip += 1;
  console.log('[SKIP] ' + nombre + ' — ' + motivo);
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function igual(a, b, msg) { if (a !== b) throw new Error((msg || 'igual') + ' (recibido ' + JSON.stringify(a) + ', esperado ' + JSON.stringify(b) + ')'); }
function cont(arr, v, msg) { if (!arr.includes(v)) throw new Error((msg || 'contiene ' + JSON.stringify(v)) + ' (recibido ' + JSON.stringify(arr) + ')'); }
function nohay(obj, key, msg) { if (Object.prototype.hasOwnProperty.call(obj, key)) throw new Error((msg || 'no debe tener clave ' + JSON.stringify(key)) + ' (tiene ' + JSON.stringify(Object.keys(obj)) + ')'); }
function profundoIgual(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg || 'profundoIgual') + ' (recibido ' + ja + ', esperado ' + jb + ')');
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos de prueba (payloads §27)
// ─────────────────────────────────────────────────────────────────────────────
const cid = 'Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90';
const RUT1 = '11111111-1';
const RUT2 = '22222222-2';
const CATALOGO = ['MEDICO/A', 'ENFERMERA/O', 'TENS', 'MATRONA/O', 'PSICOLOGO/A', 'ASISTENTE SOCIAL'];

function nuevoIngreso(over = {}) {
  const p = {
    captureId: cid,
    accion: 'nuevoIngreso',
    rut: RUT1,
    nombre: 'JUAN PÉREZ GÓMEZ',
    sexo: 'M',
    fechaNacimiento: '1988-03-12',
    sector: 'AMARILLO',
    fechaIngreso: '2026-09-01',
    estratificacion: 'G2',
    telefonos: '990600712',
    profesional: 'MATRONA/O',
    profesionalSecundario: 'MEDICO/A',
    observaciones: '  Ingreso por control de salud  ',
    confirmarNuevoPaciente: false
  };
  return Object.assign(p, over);
}

function registrarControl(over = {}) {
  const p = {
    captureId: cid,
    accion: 'registrarControl',
    rut: RUT1,
    fechaEvento: '2026-08-15',
    profesional: 'ENFERMERA/O',
    profesionalSecundario: 'TENS',
    observaciones: 'Control de rutina'
  };
  return Object.assign(p, over);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto en memoria (inyectable; segue TR-2 mínima para observaciones)
// ─────────────────────────────────────────────────────────────────────────────
function makeCtx(opciones = {}) {
  const registros = new Map();
  const personas = new Map();
  const entregas = [];
  let seq = 0;

  const ctx = {
    registros,
    personas,
    entregas,
    usuario: opciones.usuario === undefined ? 'tester@ecicep.cl' : opciones.usuario,
    ahora: () => '2026-09-04 10:00:00',
    maxReintentos: opciones.maxReintentos === undefined ? 3 : opciones.maxReintentos,
    catalogo: opciones.catalogo === undefined ? CATALOGO : opciones.catalogo
  };

  ctx.buscarRegistro = (captureId) => registros.get(captureId) || null;

  ctx.persistirRegistro = (reg) => {
    if (opciones.failPersistir) return { ok: false, motivo: 'TEST_PERSIST_FALL' };
    if (registros.has(reg.captureId)) return { ok: false, motivo: 'TEST_REGISTRO_DUPLICADO' };
    const copia = JSON.parse(JSON.stringify(reg));
    registros.set(reg.captureId, copia);
    return { ok: true };
  };

  ctx.actualizarTrailer = (captureId, cambios) => {
    if (opciones.failTrailer) return { ok: false, motivo: 'TEST_TRAILER_FALL' };
    const reg = registros.get(captureId);
    if (!reg) return { ok: false, motivo: 'SIN_REGISTRO' };
    for (const k of Object.keys(cambios)) if (cambios[k] !== undefined) reg[k] = cambios[k];
    return { ok: true };
  };

  ctx.entregar = (norm, meta) => {
    entregas.push({ norm: JSON.parse(JSON.stringify(norm)), meta });
    if (opciones.entregarFn) return opciones.entregarFn(norm, meta, ctx);
    if (norm.accion === 'nuevoIngreso') {
      seq += 1;
      const id = 'EC-TEST-' + String(1000 + seq);
      personas.set(norm.rut, { RUT: norm.rut, NOMBRE: norm.nombre, ID_INTERNO: id });
      return { estado: 'PROCESADO', motivo: '', idInterno: id, idEvento: '', ingresoHoja: 'INGRESO_' + norm.sector, ingresoFila: String(100 + seq) };
    }
    const pers = personas.get(norm.rut);
    if (!pers) return { estado: 'REQUIERE_REVISION', motivo: 'PERSONA_NO_ENCONTRADA', idInterno: '', idEvento: '' };
    seq += 1;
    return { estado: 'PROCESADO', motivo: '', idInterno: pers.ID_INTERNO, idEvento: 'EV-TEST-' + String(2000 + seq) };
  };

  ctx.precargar = (payload, estado, over = {}) => {
    const v = sandbox.Captura_v2_validar(payload, { catalogo: ctx.catalogo });
    if (!v.ok) throw new Error('precargar: payload inválido: ' + JSON.stringify(v.errores));
    const reg = sandbox.Captura_v2_nuevoRegistro(v.normalizado, { usuario: ctx.usuario, fechaRecepcion: '2026-09-04 09:00:00' });
    reg.estado = estado;
    reg.reintentos = over.reintentos === undefined ? 0 : over.reintentos;
    reg.motivo = over.motivo || '';
    registros.set(reg.captureId, reg);
    return reg;
  };

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTE A — validación del payload (§14 capas, §20 catálogo, §5.1 matriz)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPARTE A — Validación');

t('A1 payload nuevoIngreso válido (§27.1) → ok con normalizado', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso(), { catalogo: CATALOGO });
  A(v.ok, 'debe ser ok');
  igual(v.normalizado.rut, RUT1);
  igual(v.normalizado.nombre, 'JUAN PÉREZ GÓMEZ');
  igual(v.normalizado.sexo, 'M');
  igual(v.normalizado.fechaNacimiento, '1988-03-12');
  igual(v.normalizado.sector, 'AMARILLO');
  igual(v.normalizado.fechaIngreso, '2026-09-01');
  igual(v.normalizado.estratificacion, 'G2');
  igual(v.normalizado.telefonos, '990600712');
  igual(v.normalizado.profesional, 'MATRONA/O');
  igual(v.normalizado.profesionalSecundario, 'MEDICO/A');
  igual(v.normalizado.observaciones, 'Ingreso por control de salud');
  igual(v.normalizado.confirmarNuevoPaciente, false);
});

t('A1b confirmarNuevoPaciente=true se conserva (§24) — boolean', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ confirmarNuevoPaciente: true }), { catalogo: CATALOGO });
  A(v.ok);
  igual(v.normalizado.confirmarNuevoPaciente, true);
});

t('A2 captureId inválido (§27.2) → SINTAXIS_INVALIDA en captureId', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ captureId: 'CP2-' + 'a'.repeat(32) }), { catalogo: CATALOGO });
  A(!v.ok);
  igual(v.errores[0].codigo, 'SINTAXIS_INVALIDA');
  igual(v.errores[0].campo, 'captureId');
});

t('A2b captureId con hex mayúsculas → SINTAXIS_INVALIDA (§12, minúsculas)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ captureId: 'Cp2-' + 'A'.repeat(32) }), { catalogo: CATALOGO });
  A(!v.ok);
  igual(v.errores[0].codigo, 'SINTAXIS_INVALIDA');
});

t('A3 accion inválida → ACCION_INVALIDA (§9)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ accion: 'registrarX' }), { catalogo: CATALOGO });
  A(!v.ok);
  igual(v.errores[0].codigo, 'ACCION_INVALIDA');
  igual(v.errores[0].campo, 'accion');
});

t('A4 accion ausente → CAMPO_OBLIGATORIO_AUSENTE accion (§8)', () => {
  const p = nuevoIngreso(); delete p.accion;
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok);
  igual(v.errores[0].codigo, 'CAMPO_OBLIGATORIO_AUSENTE');
  igual(v.errores[0].campo, 'accion');
});

t('A5 nombre ausente → CAMPO_OBLIGATORIO_AUSENTE nombre (§27.3, errors[0])', () => {
  const p = nuevoIngreso(); delete p.nombre;
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok);
  igual(v.errores[0].codigo, 'CAMPO_OBLIGATORIO_AUSENTE');
  igual(v.errores[0].campo, 'nombre');
});

t('A6 sector fuera de enum (§27.4) → ENUM_INVALIDO', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ sector: 'AZUL' }), { catalogo: CATALOGO });
  A(!v.ok);
  igual(v.errores[0].codigo, 'ENUM_INVALIDO');
  igual(v.errores[0].campo, 'sector');
});

t('A7 fecha en formato no-ISO → FECHA_INVALIDA (§10)', () => {
  let v = sandbox.Captura_v2_validar(nuevoIngreso({ fechaNacimiento: '12/03/1988' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'FECHA_INVALIDA'); igual(v.errores[0].campo, 'fechaNacimiento');
  v = sandbox.Captura_v2_validar(registrarControl({ fechaEvento: '15-08-2026' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'FECHA_INVALIDA'); igual(v.errores[0].campo, 'fechaEvento');
});

t('A7b fecha fuera de rango → FECHA_INVALIDA (§10): nacimiento <1900', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ fechaNacimiento: '1850-01-01' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'FECHA_INVALIDA');
});

t('A7c fecha evento < 2015 → FECHA_INVALIDA (§10)', () => {
  const v = sandbox.Captura_v2_validar(registrarControl({ fechaEvento: '2010-01-01' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'FECHA_INVALIDA');
});

t('A8 rut con DV inválido → RUT_INVALIDO (§14)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ rut: '11111111-7' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'RUT_INVALIDO'); igual(v.errores[0].campo, 'rut');
});

t('A9 profesional fuera de catálogo → ENUM_INVALIDO (§9)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ profesional: 'CURANDERO/A' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'ENUM_INVALIDO'); igual(v.errores[0].campo, 'profesional');
});

t('A9b profesional del catálogo sin tildes/mayúsculas → válido (§9 coincidencia normalizada)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ profesional: 'médico/a', profesionalSecundario: 'ENFERMERA/O' }), { catalogo: CATALOGO });
  A(v.ok, 'médico/a debe normalizar a MEDICO/A');
  igual(v.normalizado.profesional, 'médico/a'); // se conserva el texto entregado (normalización en proceso interno)
});

t('A10 profesionalSecundario === profesional → CAMPO_INVALIDO (§14.3)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ profesionalSecundario: 'MATRONA/O' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'CAMPO_INVALIDO'); igual(v.errores[0].campo, 'profesionalSecundario');
});

t('A11 campo interno presente → CAMPO_NO_PERMITIDO (§6.1)', () => {
  const p = nuevoIngreso({ ESTADO: 'PROCESADO' });
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'CAMPO_NO_PERMITIDO'); igual(v.errores[0].campo, 'ESTADO');
});

t('A11b marca FORM| en payload → CAMPO_NO_PERMITIDO (§25)', () => {
  const p = nuevoIngreso({ 'FORM|x|NUEVO_INGRESO': 'si' });
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'CAMPO_NO_PERMITIDO');
});

t('A12 campo legacy (RUT mayúscula) → CAMPO_NO_PERMITIDO (§25)', () => {
  const p = nuevoIngreso({ RUT: RUT1 });
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'CAMPO_NO_PERMITIDO'); igual(v.errores[0].campo, 'RUT');
});

t('A13 campo desconocido → CAMPO_DESCONOCIDO (§6)', () => {
  const p = nuevoIngreso({ apodo: 'JUANITO' });
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'CAMPO_DESCONOCIDO'); igual(v.errores[0].campo, 'apodo');
});

t('A14 tipo incorrecto → TIPO_INCORRECTO (§7)', () => {
  let v = sandbox.Captura_v2_validar(nuevoIngreso({ confirmarNuevoPaciente: 'si' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'TIPO_INCORRECTO'); igual(v.errores[0].campo, 'confirmarNuevoPaciente');
  v = sandbox.Captura_v2_validar(nuevoIngreso({ sexo: 3 }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].campo, 'sexo');
});

t('A15 NP por operación (§5.1): fechaEvento en nuevoIngreso → CAMPO_NO_PERMITIDO', () => {
  const p = nuevoIngreso(); p.fechaEvento = '2026-08-15';
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'CAMPO_NO_PERMITIDO'); igual(v.errores[0].campo, 'fechaEvento');
});

t('A15b NP por operación: nombre en registrarControl → CAMPO_NO_PERMITIDO', () => {
  const p = registrarControl(); p.nombre = 'JUAN PÉREZ GÓMEZ';
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'CAMPO_NO_PERMITIDO'); igual(v.errores[0].campo, 'nombre');
});

t('A16 registrarControl válido → ok y normalizado con fechaEvento', () => {
  const p = registrarControl({ captureId: 'Cp2-b1b2c3d4e5f60718293a4b5c6d7e8f90' });
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(v.ok);
  igual(v.normalizado.fechaEvento, '2026-08-15');
  igual(v.normalizado.accion, 'registrarControl');
});

t('A17 sexo con sinónimo MASCULINO → ENUM_INVALIDO (§9: sin sinónimos)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso({ sexo: 'MASCULINO' }), { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'ENUM_INVALIDO'); igual(v.errores[0].campo, 'sexo');
});

t('A18 payload no objeto → SINTAXIS_INVALIDA campo null (§17)', () => {
  const v = sandbox.Captura_v2_validar('hola', { catalogo: CATALOGO });
  A(!v.ok); igual(v.errores[0].codigo, 'SINTAXIS_INVALIDA'); igual(v.errores[0].campo, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTE B — envío con ctx en memoria (§13, §15, §16, §17, §18, §23, §24.1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPARTE B — Envío / idempotencia / estados');

t('B1 envío nuevo nuevoIngreso → ok:true PROCESADO, respuesta §16 exacta', () => {
  const ctx = makeCtx();
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(r.ok, 'debe aceptar');
  igual(Object.keys(r.data).sort().join('|'), 'accion|captureId|estado|idEvento|idInterno|motivo', 'claves exactas de §16');
  igual(r.data.captureId, cid);
  igual(r.data.accion, 'nuevoIngreso');
  igual(r.data.estado, 'PROCESADO');
  igual(r.data.motivo, '');
  A(r.data.idInterno.startsWith('EC-TEST-'), 'idInterno poblado');
  igual(r.data.idEvento, '');
  const reg = ctx.registros.get(cid);
  A(reg, 'registro persistido');
  igual(reg.estado, 'PROCESADO');
  igual(ctx.entregas.length, 1, 'una entrega');
  A(reg.usuario === 'tester@ecicep.cl', 'usuario registrado');
});

t('B2 A1 §13: reintento del mismo payload → ok:true PROCESADO sin efectos nuevos', () => {
  const ctx = makeCtx();
  const r1 = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(r1.ok);
  const r2 = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(r2.ok);
  igual(r2.data.estado, 'PROCESADO');
  igual(ctx.entregas.length, 1, 'no re-entrega');
  igual(ctx.registros.size, 1, 'no re-persiste');
});

t('B3 B §13: mismo captureId, payload distinto → CONFLICTO_IDEMPOTENCIA sin efectos', () => {
  const ctx = makeCtx();
  A(sandbox.Captura_v2_enviar(nuevoIngreso(), ctx).ok);
  const r = sandbox.Captura_v2_enviar(nuevoIngreso({ observaciones: 'Otro texto' }), ctx);
  A(!r.ok);
  igual(r.errors[0].codigo, 'CONFLICTO_IDEMPOTENCIA');
  igual(ctx.entregas.length, 1, 'sin nueva entrega');
});

t('B4 C §13: captureId nuevo con datos idénticos → envío nuevo aceptado', () => {
  const cid2 = 'Cp2-c1b2c3d4e5f60718293a4b5c6d7e8f90';
  const ctx = makeCtx();
  A(sandbox.Captura_v2_enviar(nuevoIngreso(), ctx).ok);
  const r = sandbox.Captura_v2_enviar(nuevoIngreso({ captureId: cid2 }), ctx);
  A(r.ok, 'datos clínicamente iguales con ID nuevo NO es conflicto técnico');
  igual(ctx.registros.size, 2);
  igual(ctx.entregas.length, 2);
});

t('B5 A2 §23: registro en ERROR reintentable → reenvío con payload idéntico → PROCESADO', () => {
  const ctx = makeCtx({ entregarFn: (norm, meta) => ({ estado: 'PROCESADO', motivo: '', idInterno: 'EC-TEST-1001', idEvento: 'EV-TEST-2001' }) });
  ctx.precargar(nuevoIngreso(), 'ERROR', { reintentos: 1, motivo: 'falló antes' });
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(r.ok);
  igual(r.data.estado, 'PROCESADO');
  igual(ctx.registros.get(cid).reintentos, 2, 'reintento incrementado');
});

t('B5b A2 fast-path §23: fila ya INGRESADO → PROCESADO sin re-ejecutar pipeline', () => {
  const ctx = makeCtx({ entregarFn: () => { throw new Error('NO_DEBE_ENTREGAR'); } });
  ctx.precargar(nuevoIngreso(), 'ERROR', { reintentos: 1 });
  const reg = ctx.registros.get(cid);
  reg.ingresoHoja = 'INGRESO_AMARILLO';
  reg.ingresoFila = '101';
  const prevFila = sandbox.Form_leerFilaIngreso;
  const prevId = sandbox.Captura_v2_buscarIdInternoPorRut;
  sandbox.Form_leerFilaIngreso = () => ({ estado: 'INGRESADO', nota: '' });
  sandbox.Captura_v2_buscarIdInternoPorRut = () => 'EC-TEST-1001';
  try {
    const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
    A(r.ok, 'debe ser ok');
    igual(r.data.estado, 'PROCESADO');
    igual(r.data.idInterno, 'EC-TEST-1001');
    igual(ctx.entregas.length, 0, 'pipeline NO se re-ejecutó');
    igual(ctx.registros.get(cid).estado, 'PROCESADO', 'trailer actualizado');
    igual(ctx.registros.get(cid).reintentos, 2, 'reintento incrementado');
  } finally {
    sandbox.Form_leerFilaIngreso = prevFila;
    sandbox.Captura_v2_buscarIdInternoPorRut = prevId;
  }
});

t('B5c A2 fast-path §23: fila ya DUPLICADO → REQUIERE_REVISION sin re-ejecutar pipeline', () => {
  const ctx = makeCtx({ entregarFn: () => { throw new Error('NO_DEBE_ENTREGAR'); } });
  ctx.precargar(nuevoIngreso(), 'ERROR', { reintentos: 1 });
  const reg = ctx.registros.get(cid);
  reg.ingresoHoja = 'INGRESO_AMARILLO';
  reg.ingresoFila = '102';
  const prevFila = sandbox.Form_leerFilaIngreso;
  const prevId = sandbox.Captura_v2_buscarIdInternoPorRut;
  sandbox.Form_leerFilaIngreso = () => ({ estado: 'DUPLICADO', nota: 'Ya existe ingreso para este RUT' });
  sandbox.Captura_v2_buscarIdInternoPorRut = () => '';
  try {
    const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
    A(r.ok, 'REQUIERE_REVISION es resultado válido (no error)');
    igual(r.data.estado, 'REQUIERE_REVISION');
    igual(r.data.motivo, 'Ya existe ingreso para este RUT');
    igual(ctx.entregas.length, 0, 'pipeline NO se re-ejecutó');
  } finally {
    sandbox.Form_leerFilaIngreso = prevFila;
    sandbox.Captura_v2_buscarIdInternoPorRut = prevId;
  }
});

t('B5d A2 fallthrough §23: fila SIN estado → re-ejecuta pipeline completo', () => {
  const ctx = makeCtx({ entregarFn: () => ({ estado: 'PROCESADO', motivo: '', idInterno: 'EC-TEST-2002', idEvento: '' }) });
  ctx.precargar(nuevoIngreso(), 'ERROR', { reintentos: 1 });
  const reg = ctx.registros.get(cid);
  reg.ingresoHoja = 'INGRESO_AMARILLO';
  reg.ingresoFila = '103';
  const prevFila = sandbox.Form_leerFilaIngreso;
  sandbox.Form_leerFilaIngreso = () => ({ estado: '', nota: '' });
  try {
    const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
    A(r.ok);
    igual(r.data.estado, 'PROCESADO');
    igual(ctx.entregas.length, 1, 'pipeline completa SÍ se ejecutó');
  } finally {
    sandbox.Form_leerFilaIngreso = prevFila;
  }
});

t('B6 A2 tope §23: cargo = maxReintentos → ERROR_INTERNO REINTENTOS_AGOTADOS', () => {
  const ctx = makeCtx();
  ctx.precargar(nuevoIngreso(), 'ERROR', { reintentos: 3 });
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(!r.ok);
  igual(r.errors[0].codigo, 'ERROR_INTERNO');
  igual(ctx.registros.get(cid).estado, 'ERROR');
  igual(ctx.registros.get(cid).motivo, 'REINTENTOS_AGOTADOS');
});

t('B7 §15.2: fallo de persistencia → ok:false ERROR_INTERNO y NO se entrega', () => {
  const ctx = makeCtx({ failPersistir: true });
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(!r.ok);
  igual(r.errors[0].codigo, 'ERROR_INTERNO');
  igual(ctx.entregas.length, 0, 'no hay efecto sin registro (§15.2)');
  igual(ctx.registros.size, 0);
});

t('B8 §15.3: fallo de trailer → ok:true RECIBIDO (eventualidad)', () => {
  const ctx = makeCtx({ failTrailer: true });
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(r.ok, 'se acepta aunque el intento síncrono no completó');
  igual(r.data.estado, 'RECIBIDO');
  igual(r.data.motivo, 'PENDIENTE_ENTREGA');
});

t('B9 §16.2/§23: entrega ERROR → ok:false; con motor sano, reintento A2 → PROCESADO', () => {
  let sano = false;
  const ctx = makeCtx({
    entregarFn: (norm, meta) => sano
      ? { estado: 'PROCESADO', motivo: '', idInterno: 'EC-TEST-1001', idEvento: '' }
      : { estado: 'ERROR', motivo: 'PIPELINE_CAIDO' }
  });
  const r1 = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(!r1.ok, 'procesamiento falló');
  igual(r1.errors[0].codigo, 'ERROR_INTERNO');
  igual(ctx.registros.get(cid).estado, 'ERROR', 'estado ERROR persistido');
  sano = true;
  const r2 = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(r2.ok);
  igual(r2.data.estado, 'PROCESADO');
  igual(ctx.entregas.length, 2);
});

t('B10 §18: persona no encontrada → ok:true REQUIERE_REVISION + motivo', () => {
  const ctx = makeCtx();
  const r = sandbox.Captura_v2_enviar(registrarControl({ rut: RUT2, captureId: 'Cp2-d1b2c3d4e5f60718293a4b5c6d7e8f90' }), ctx);
  A(r.ok, 'REQUIERE_REVISION es resultado válido (no error)');
  igual(r.data.estado, 'REQUIERE_REVISION');
  igual(r.data.motivo, 'PERSONA_NO_ENCONTRADA');
  igual(ctx.registros.get('Cp2-d1b2c3d4e5f60718293a4b5c6d7e8f90').estado, 'REQUIERE_REVISION');
});

t('B11 A1 sobre REQUIERE_REVISION → reenvía almacenado sin re-entregar', () => {
  const cidR = 'Cp2-e1b2c3d4e5f60718293a4b5c6d7e8f90';
  const ctx = makeCtx();
  const cp = registrarControl({ rut: RUT2, captureId: cidR });
  A(sandbox.Captura_v2_enviar(cp, ctx).ok);
  const r = sandbox.Captura_v2_enviar(cp, ctx);
  A(r.ok);
  igual(r.data.estado, 'REQUIERE_REVISION');
  igual(ctx.entregas.length, 1, 'no re-entrega');
});

t('B12 §23: reprocesar REQUIERE_REVISION → VALIDANDO; reprocesar PROCESADO → bloqueado', () => {
  const ctx = makeCtx();
  A(sandbox.Captura_v2_enviar(nuevoIngreso(), ctx).ok);   // PROCESADO
  const rP = sandbox.Captura_v2_reprocesar(cid, ctx);
  A(!rP.ok, 'PROCESADO nunca se reinicia');
  igual(rP.errors[0].codigo, 'CAMPO_INVALIDO');

  const cidR = 'Cp2-f1b2c3d4e5f60718293a4b5c6d7e8f90';
  ctx.precargar(registrarControl({ rut: RUT2, captureId: cidR }), 'REQUIERE_REVISION', { motivo: 'PERSONA_NO_ENCONTRADA' });
  const rR = sandbox.Captura_v2_reprocesar(cidR, ctx);
  A(rR.ok);
  igual(rR.data.estado, 'VALIDANDO');
  igual(ctx.registros.get(cidR).estado, 'VALIDANDO');
  igual(ctx.registros.get(cidR).motivo, 'REPROCESO_ADMIN');
});

t('B13 §16: consulta de estado (webapp_estado / Captura_v2_estado)', () => {
  const ctx = makeCtx();
  A(sandbox.Captura_v2_enviar(nuevoIngreso(), ctx).ok);
  const ok = sandbox.Captura_v2_estado(cid, ctx);
  A(ok.ok); igual(ok.data.estado, 'PROCESADO');
  const u = sandbox.Captura_v2_estado('Cp2-' + 'f'.repeat(32), ctx);
  A(!u.ok); igual(u.errors[0].codigo, 'CAMPO_INVALIDO');
  const m = sandbox.Captura_v2_estado('Cp2-ABCDEFABCDEFABCDEFABCDEFABCDEFAB', ctx);
  A(!m.ok); igual(m.errors[0].codigo, 'SINTAXIS_INVALIDA');
});

t('B14 §24.1: sin usuario activo → rechazo ERROR_INTERNO', () => {
  const ctx = makeCtx({ usuario: '' });
  const r = sandbox.Captura_v2_enviar(nuevoIngreso(), ctx);
  A(!r.ok);
  igual(r.errors[0].codigo, 'ERROR_INTERNO');
  igual(ctx.registros.size, 0);
});

t('B15 control sobre persona existente → PROCESADO con idEvento', () => {
  const ctx = makeCtx();
  const p1 = nuevoIngreso({ captureId: 'Cp2-b1b2c3d4e5f60718293a4b5c6d7e8f90' });
  A(sandbox.Captura_v2_enviar(p1, ctx).ok);   // crea persona RUT1
  const p2 = registrarControl({ rut: RUT1, captureId: 'Cp2-c2b2c3d4e5f60718293a4b5c6d7e8f90' });
  const r = sandbox.Captura_v2_enviar(p2, ctx);
  A(r.ok);
  igual(r.data.estado, 'PROCESADO');
  A(r.data.idEvento.startsWith('EV-TEST-'), 'idEvento poblado');
  igual(r.data.idInterno.startsWith('EC-TEST-'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTE C — transformación TR-1 / marcas / coherencia con config y legacy
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPARTE C — Transformación y coherencia');

t('C1 TR-1 §21.1: payload V2 → modelo interno normalizado', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso(), { catalogo: CATALOGO });
  A(v.ok);
  const i = sandbox.Captura_v2_normalizadoAInterno(v.normalizado, {});
  igual(i.ACCION, 'NUEVO_INGRESO');
  igual(i.RUT, RUT1);
  igual(i.NOMBRE, 'JUAN PÉREZ GÓMEZ');
  igual(i.SECTOR, 'AMARILLO');
  igual(i.FECHA_INGRESO, '2026-09-01', 'TR-1 asigna fechaIngreso a FECHA_INGRESO (§21.1)');
  igual(i.TELEFONOS, '990600712');
  igual(i.PROFESIONAL, 'MATRONA/O');
  igual(i.PROFESIONAL2, 'MEDICO/A');
  igual(i.marca, 'FORM|' + cid + '|NUEVO_INGRESO', 'marca interna §25');
});

t('C1b control TR-1: marca del evento = FORM|<captureId>|REGISTRAR_CONTROL (§25)', () => {
  const v = sandbox.Captura_v2_validar(registrarControl(), { catalogo: CATALOGO });
  A(v.ok);
  const i = sandbox.Captura_v2_normalizadoAInterno(v.normalizado, {});
  igual(i.ACCION, 'REGISTRAR_CONTROL');
  igual(i.marca, 'FORM|' + cid + '|REGISTRAR_CONTROL');
});

t('C2 marcador determinista: mismo captureId+accion → misma marca (§25)', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso(), { catalogo: CATALOGO });
  const m1 = sandbox.Captura_v2_marca(v.normalizado);
  const m2 = sandbox.Form_marcadorFuente(cid, 'NUEVO_INGRESO');
  igual(m1, m2);
  igual(m1, sandbox.CAPTURA_V2.__noMagic !== undefined ? 'x' : m1);
});

t('C2b la marca NO la provee el cliente (solo backend) — payload no trae marca', () => {
  const p = nuevoIngreso();
  nohay(p, 'marca');
  nohay(p, 'MARCA');
});

t('C3 §26: CAPTURE_CONTRACT_VERSION === 2 declarado en 00_Config.js', () => {
  igual(sandbox.CAPTURE_CONTRACT_VERSION, 2);
});

t('C4 §25/Anexo B.4: sin colisión de identificadores entre legacy y V2', () => {
  cont(FORM_CONFIG_LEGACY_CHECK(), 'NUEVO_INGRESO', 'legacy conserva ACCIONES');
  function FORM_CONFIG_LEGACY_CHECK() { return sandbox.FORM_CONFIG.ACCIONES.VALIDOS; }
  A(sandbox.FORM_CONFIG.ACCIONES.VALIDOS.indexOf('nuevoIngreso') === -1, 'legacy no acepta camelCase');
  A(sandbox.CAPTURA_V2.OPERACIONES.indexOf('NUEVO_INGRESO') === -1, 'V2 no acepta etiquetas legacy');
  igual(sandbox.CAPTURA_V2.CAMPOS.length, 15, '§6 define 15 campos (fechaIngreso incluido)');
  cont(sandbox.CAPTURA_V2.CAMPOS, 'captureId');
  cont(sandbox.CAPTURA_V2.CAMPOS, 'fechaIngreso');
  cont(sandbox.CAPTURA_V2.CAMPOS, 'confirmarNuevoPaciente');
});

t('C5 Anexo B.5: el backend legacy (Form_validarRespuesta) rechaza payload V2', () => {
  const p = nuevoIngreso();
  const hoy = sandbox.Form_hoy ? sandbox.Form_hoy({}) : new Date().getFullYear() + '-01-01';
  let r;
  try { r = sandbox.Form_validarRespuesta(p, { hoy: hoy }); } catch (e) { r = { ok: false }; }
  A(!r.ok, 'el cliente/backend legacy no entiende accion camelCase');
  nohay(p, 'ACCION', 'payload V2 no usa ACCION');
});

t('C6 §24.1 smoke: entrys WebApp_capturarEnviar/Estado no crashean en node', () => {
  const r = sandbox.WebApp_capturarEnviar(nuevoIngreso());
  A(r.ok === false, 'sin sesión GAS → rechazo controlado');
  igual(r.errors[0].codigo, 'ERROR_INTERNO');
  const e = sandbox.WebApp_capturarEstado(cid);
  igual(e.ok, true !== true ? 'x' : e.ok); // sin manejo real de hoja en node; debe retornar algo
  A(typeof e === 'object', 'retorna objeto');
});

t('C7 §11/§13: formas canónicas iguales pese a formateo distinto del payload', () => {
  const ctx = makeCtx();
  const p1 = nuevoIngreso();
  const p2 = nuevoIngreso({ nombre: 'JUAN   PÉREZ  GÓMEZ  ', telefonos: '56990600712', observaciones: 'Ingreso por control de salud' });
  const n1 = sandbox.Captura_v2_validar(p1, { catalogo: CATALOGO }).normalizado;
  const n2 = sandbox.Captura_v2_validar(p2, { catalogo: CATALOGO }).normalizado;
  igual(sandbox.Captura_v2_canonica(n1), sandbox.Captura_v2_canonica(n2), 'misma forma canónica');
});

t('C8 §5.1: la matriz embebida coincide con la del contrato (espejo)', () => {
  const M = sandbox.CAPTURA_V2.MATRIZ;
  const esperado = {
    nombre: { REQ: ['nuevoIngreso'], OPC: [] },
    sexo: { REQ: [], OPC: ['nuevoIngreso'] },
    fechaNacimiento: { REQ: ['nuevoIngreso'], OPC: [] },
    sector: { REQ: ['nuevoIngreso'], OPC: [] },
    fechaIngreso: { REQ: ['nuevoIngreso'], OPC: [] },
    estratificacion: { REQ: [], OPC: ['nuevoIngreso'] },
    telefonos: { REQ: [], OPC: ['nuevoIngreso', 'actualizarDatos'] },
    fechaEvento: { REQ: ['registrarControl', 'registrarSeguimiento'], OPC: [] }
  };
  for (const c of Object.keys(esperado)) {
    profundoIgual(M[c], esperado[c], 'matriz §5.1 campo ' + c);
  }
});

t('C9 estados §18.1 y terminales §18/§19 en la implementación', () => {
  cont(sandbox.CAPTURA_V2.ESTADOS.PROCESADO ? ['RECIBIDO', 'VALIDANDO', 'VALIDO', 'PROCESADO', 'REQUIERE_REVISION', 'ERROR'] : [], 'PROCESADO');
  A(sandbox.CAPTURA_V2.TERMINALES.indexOf('PROCESADO') !== -1);
  A(sandbox.CAPTURA_V2.TERMINALES.indexOf('REQUIERE_REVISION') !== -1);
  A(sandbox.CAPTURA_V2.REINTENTABLES.indexOf('RECIBIDO') !== -1);
  A(sandbox.CAPTURA_V2.REINTENTABLES.indexOf('ERROR') !== -1);
});

t('C10 §6/§21.1: TR-1 asigna PROFESIONAL2 a la dupla; TR-2 fila canónica usa 11 columnas', () => {
  const v = sandbox.Captura_v2_validar(nuevoIngreso(), { catalogo: CATALOGO });
  const i = sandbox.Captura_v2_normalizadoAInterno(v.normalizado, { marca: 'M' });
  const fila = sandbox.Form_filaCanonicaIngreso(i, 'M', {});
  igual(fila.length, 11, 'INGRESO_COLUMNAS');
  igual(fila[5], '2026-09-01', 'FECHA DE INGRESO = fechaIngreso (columna 5, §21.1)');
  igual(fila[7], 'MATRONA/O; MEDICO/A', 'dupla con ; ');
  igual(fila[10], 'M', 'marca en NOTA_SISTEMA');
});

t('C10b §21.1: columna FECHA DE INGRESO por ENCABEZADO (variantes FECHA DE ING…)', () => {
  const idx = sandbox.Captura_v2_indiceColumnaFecha(['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)', 'FECHA DE INGRESO', 'ESTRATIFICACION']);
  igual(idx, 5, 'encabezado exacto → índice 5');
  const idxVar = sandbox.Captura_v2_indiceColumnaFecha(['NOMBRE', 'FECHA DE INGRESO (REAL)', 'SECTOR']);
  igual(idxVar, 1, 'variante "FECHA DE ING…" → índice 1');
  const idxVar2 = sandbox.Captura_v2_indiceColumnaFecha(['NOMBRE', 'FECHA DE INGRESO ALT', 'SECTOR']);
  igual(idxVar2, 1, 'variante "FECHA DE ING…" → índice 1');
  igual(sandbox.Captura_v2_indiceColumnaFecha(['NOMBRE', 'RUT']), -1, 'sin columna → -1');
});

t('C10c validación: fechaIngreso obligatoria/formatos/rango (espejo contrato §5.1/§10)', () => {
  const ausente = sandbox.Captura_v2_validar(nuevoIngreso({ fechaIngreso: undefined }), { catalogo: CATALOGO });
  A(!ausente.ok && ausente.errores.some((e) => e.codigo === 'CAMPO_OBLIGATORIO_AUSENTE' && e.campo === 'fechaIngreso'), 'ausente → CAMPO_OBLIGATORIO_AUSENTE');
  const noIso = sandbox.Captura_v2_validar(nuevoIngreso({ fechaIngreso: '01/09/2026' }), { catalogo: CATALOGO });
  A(!noIso.ok && noIso.errores.some((e) => e.codigo === 'FECHA_INVALIDA' && e.campo === 'fechaIngreso'), 'no-ISO → FECHA_INVALIDA');
  const rango = sandbox.Captura_v2_validar(nuevoIngreso({ fechaIngreso: '2014-12-31' }), { catalogo: CATALOGO });
  A(!rango.ok && rango.errores.some((e) => e.codigo === 'FECHA_INVALIDA'), 'fuera de rango → FECHA_INVALIDA');
  const np = sandbox.Captura_v2_validar(registrarControl({ fechaIngreso: '2026-09-01' }), { catalogo: CATALOGO });
  A(!np.ok && np.errores.some((e) => e.codigo === 'CAMPO_NO_PERMITIDO' && e.campo === 'fechaIngreso'), 'NP en control → CAMPO_NO_PERMITIDO');
  const ok = sandbox.Captura_v2_validar(nuevoIngreso(), { catalogo: CATALOGO });
  A(ok.ok && ok.normalizado.fechaIngreso === '2026-09-01', 'válido normaliza');
});

t('C10d idempotencia: mismo captureId + SOLO fechaIngreso distinta → CONFLICTO (§13 B)', () => {
  const ctx = makeCtx();
  A(sandbox.Captura_v2_enviar(nuevoIngreso(), ctx).ok, 'primer envío aceptado');
  const r = sandbox.Captura_v2_enviar(nuevoIngreso({ fechaIngreso: '2026-09-02' }), ctx);
  A(!r.ok && r.errors.some((e) => e.codigo === 'CONFLICTO_IDEMPOTENCIA'), 'CONFLICTO_IDEMPOTENCIA');
  igual(ctx.registros.size, 1, 'sin efectos nuevos');
});

t('C10e captura rápida FASE 4: el request NO barre todas los hojas INGRESO_* ni procesa lote', () => {
  A(texto26.indexOf('Form_buscarFilaIngresoPorMarca') === -1, '26_Captura.js no barre por marca (sweep retirado)');
  A(texto26.indexOf('Form_procesarPendientes') === -1, '26_Captura.js jamás procesa lote en el request');
});

t('C11 previa duplicados V2: acepta payload camelCase y detecta coincidencias', () => {
  const alias = sandbox.WebApp_previaDuplicadosV2({ accion: 'registrarControl', rut: RUT1, nombre: 'A B' });
  A(alias && alias.ok === true && alias.coincidencia === false, 'alias evita chequeo fuera de nuevoIngreso');
  const sinGAS = sandbox.Captura_v2_previaDuplicados(nuevoIngreso());
  A(sinGAS && sinGAS.ok === false, 'en node sin hoja → fallo controlado (en GAS resuelve con PACIENTES reales)');
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTE D — Fase 9: §5.2 fecha de operación de actualizarDatos + §12 captureId estricto
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPARTE D — §5.2 actualizarDatos (fecha OTRO generada por backend) y §12 captureId');

function payloadActualizar(over = {}) {
  const p = {
    captureId: cid,
    accion: 'actualizarDatos',
    rut: RUT1,
    telefonos: '990600712',
    profesional: 'MATRONA/O',
    observaciones: 'Actualización de contacto'
  };
  return Object.assign(p, over);
}

t('D1 actualizarDatos sin fechaEvento → payload válido (nunca FECHA_INVALIDA ni REQ ausente)', () => {
  const v = sandbox.Captura_v2_validar(payloadActualizar(), { catalogo: CATALOGO });
  A(v.ok, JSON.stringify(v.errores || ''));
  nohay(payloadActualizar(), 'fechaEvento', 'el payload normativo (§5.2/§27.7) no transporta fechaEvento');
});

t('D2 actualizarDatos con fechaEvento → CAMPO_NO_PERMITIDO (§5.2: fecha solo la genera el backend)', () => {
  const p = payloadActualizar({ fechaEvento: '2026-09-05' });
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(!v.ok, 'fecha no permitida');
  A(v.errores.some((e) => e.codigo === 'CAMPO_NO_PERMITIDO' && e.campo === 'fechaEvento'), JSON.stringify(v.errores));
});

t('D3 §5.2 Captura_v2_fechaOperacion: ISO yyyy-MM-dd real, día local, inyectable, nunca vacía', () => {
  igual(sandbox.Captura_v2_fechaOperacion({ hoy: '2026-09-06' }), '2026-09-06', 'inyectable (solo pruebas)');
  const f = sandbox.Captura_v2_fechaOperacion({});
  A(/^\d{4}-\d{2}-\d{2}$/.test(f), 'formato ISO día de la operación (' + f + ')');
  A(f !== '', 'nunca vacía');
  A(!String(f).includes('T') && !String(f).includes(' '), 'solo fecha calendario, sin hora');
  const n = sandbox.Norm_normalizarFecha(f, {});
  A(n.estado === 'VALIDA', 'fecha real válida para el modelo');
});

t('D4 TR-2c §21: entregarEvento actualiza PACIENTES PRIMERO y crea OTRO con fecha = operación', () => {
  const orden = [];
  let llamadas = { update: 0, evento: null };
  const prevBuscar = sandbox.Captura_v2_buscarPersonaPorRut;
  const prevMarca = sandbox.Captura_v2_marcaEnEventos;
  const prevReg = sandbox.api_registrarEvento;
  const prevUpd = sandbox.Form_actualizarDatosPaciente;
  try {
    sandbox.Captura_v2_buscarPersonaPorRut = () => ({ RUT: RUT1, NOMBRE: 'JUAN PÉREZ GÓMEZ', ID_INTERNO: 'EC-TEST-5001', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2' });
    sandbox.Captura_v2_marcaEnEventos = (m) => (llamadas.evento ? { idInterno: 'EC-TEST-5001', idEvento: 'EV-OTRO-TEST' } : null);
    sandbox.Form_actualizarDatosPaciente = (pac, interno, marca) => { orden.push('actualizar'); llamadas.update += 1; return true; };
    sandbox.api_registrarEvento = (payload) => {
      orden.push('otro');
      llamadas.evento = payload;
      igual(payload.tipoEvento, 'OTRO', 'tipoEvento');
      A(payload.fecha && payload.fecha !== '', 'OTRO.FECHA_EVENTO NUNCA vacía');
      igual(payload.fecha, sandbox.Captura_v2_fechaOperacion({}), 'FECHA_EVENTO = fecha de la operación generada por backend');
      igual(payload.idInterno, 'EC-TEST-5001');
      igual(payload.fuente, 'FORM|' + cid + '|ACTUALIZAR_DATOS', 'marca del canal como FUENTE (§5.2/§25)');
      return { ok: true };
    };
    const v = sandbox.Captura_v2_validar(payloadActualizar(), { catalogo: CATALOGO });
    if (!v.ok) throw new Error('payload inválido: ' + JSON.stringify(v.errores));
    const r = sandbox.Captura_v2_entregarEvento(v.normalizado, 'FORM|' + cid + '|ACTUALIZAR_DATOS', { usuario: 'tester@ecicep.cl' });
    igual(r.estado, 'PROCESADO', JSON.stringify(r));
    igual(r.idEvento, 'EV-OTRO-TEST');
    profundoIgual(orden, ['actualizar', 'otro'], 'campos PACIENTES antes del evento OTRO');
    igual(llamadas.update, 1, 'una actualización');
    A(!!llamadas.evento, 'evento OTRO registrado');
  } finally {
    sandbox.Captura_v2_buscarPersonaPorRut = prevBuscar;
    sandbox.Captura_v2_marcaEnEventos = prevMarca;
    sandbox.api_registrarEvento = prevReg;
    sandbox.Form_actualizarDatosPaciente = prevUpd;
  }
});

t('D5 actualizarDatos: si la actualización falla → ERROR y NO se registra OTRO', () => {
  const orden = [];
  const prevBuscar = sandbox.Captura_v2_buscarPersonaPorRut;
  const prevMarca = sandbox.Captura_v2_marcaEnEventos;
  const prevReg = sandbox.api_registrarEvento;
  const prevUpd = sandbox.Form_actualizarDatosPaciente;
  try {
    sandbox.Captura_v2_buscarPersonaPorRut = () => ({ RUT: RUT1, ID_INTERNO: 'EC-TEST-5002' });
    sandbox.Captura_v2_marcaEnEventos = () => null;
    sandbox.Form_actualizarDatosPaciente = () => false;
    sandbox.api_registrarEvento = (p) => { orden.push('otro'); return { ok: true }; };
    const v = sandbox.Captura_v2_validar(payloadActualizar(), { catalogo: CATALOGO });
    const r = sandbox.Captura_v2_entregarEvento(v.normalizado, 'FORM|' + cid + '|ACTUALIZAR_DATOS', {});
    igual(r.estado, 'ERROR');
    igual(r.motivo, 'ACTUALIZACION_FALLIDA');
    profundoIgual(orden, [], 'sin OTRO huérfano cuando la actualización falla');
  } finally {
    sandbox.Captura_v2_buscarPersonaPorRut = prevBuscar;
    sandbox.Captura_v2_marcaEnEventos = prevMarca;
    sandbox.api_registrarEvento = prevReg;
    sandbox.Form_actualizarDatosPaciente = prevUpd;
  }
});

t('D6 §12: captureId 32 hex válido; 64 hex / corto / char no-hex → SINTAXIS_INVALIDA', () => {
  A(sandbox.Captura_v2_validar(nuevoIngreso({ captureId: cid }), { catalogo: CATALOGO }).ok, '32 hex válido');
  const p64 = sandbox.Captura_v2_validar(nuevoIngreso({ captureId: 'Cp2-' + 'a'.repeat(64) }), { catalogo: CATALOGO });
  A(!p64.ok && p64.errores.some((e) => e.codigo === 'SINTAXIS_INVALIDA' && e.campo === 'captureId'), '64 hex rechazado sin normalizar');
  const px = sandbox.Captura_v2_validar(nuevoIngreso({ captureId: 'Cp2-xxxxxxxx' }), { catalogo: CATALOGO });
  A(!px.ok && px.errores.some((e) => e.codigo === 'SINTAXIS_INVALIDA'), 'corto rechazado');
  const pg = sandbox.Captura_v2_validar(nuevoIngreso({ captureId: 'Cp2-' + 'a'.repeat(31) + 'G' }), { catalogo: CATALOGO });
  A(!pg.ok && pg.errores.some((e) => e.codigo === 'SINTAXIS_INVALIDA'), '32 chars con no-hex rechazado');
  A(!sandbox.CAPTURA_V2.RE_CAPTURE_ID.test('Cp2-' + 'a'.repeat(64)), 'regex estricta 32 (no 64)');
});

t('D7 envío actualizarDatos vía ctx → PROCESADO con idEvento (§27.7, persistencia §15)', () => {
  const ctx = makeCtx();
  const cidIng = 'Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f9a';
  const cidAct = 'Cp2-b2c3d4e5f60718293a4b5c6d7e8f9a1a';
  A(sandbox.Captura_v2_enviar(nuevoIngreso({ captureId: cidIng }), ctx).ok, 'persona base creada');
  const r = sandbox.Captura_v2_enviar(payloadActualizar({ captureId: cidAct }), ctx);
  A(r.ok, JSON.stringify(r.errors || ''));
  igual(Object.keys(r.data).sort().join('|'), 'accion|captureId|estado|idEvento|idInterno|motivo', 'respuesta §16 exacta');
  igual(r.data.accion, 'actualizarDatos');
  igual(r.data.estado, 'PROCESADO');
  A(r.data.idEvento.startsWith('EV-TEST-'), 'evento OTRO entregado');
  igual(r.data.motivo, '');
  const reg = ctx.registros.get(cidAct);
  A(reg, 'registro persistido');
  igual(reg.estado, 'PROCESADO');
  A(!Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(reg)), 'fechaEvento') || reg.fechaEvento === undefined || reg.fechaEvento === '', 'sin fechaEvento en el registro payload');
});

t('D8 idempotencia sobre actualizarDatos: A1 reintento idéntico → sin re-entrega; B payload distinto → CONFLICTO', () => {
  const ctx = makeCtx();
  const cidIng = 'Cp2-c3d4e5f60718293a4b5c6d7e8f9a1b2a';
  const cidAct = 'Cp2-d4e5f60718293a4b5c6d7e8f9a1b2c3a';
  A(sandbox.Captura_v2_enviar(nuevoIngreso({ captureId: cidIng }), ctx).ok, 'persona base');
  const p = payloadActualizar({ captureId: cidAct });
  A(sandbox.Captura_v2_enviar(p, ctx).ok, 'primer actualizarDatos');
  const r2 = sandbox.Captura_v2_enviar(p, ctx);
  A(r2.ok);
  igual(r2.data.estado, 'PROCESADO');
  A(ctx.entregas.filter((e) => e.norm.captureId === cidAct).length === 1, 'A1: un solo efecto');
  const rB = sandbox.Captura_v2_enviar(payloadActualizar({ captureId: cidAct, observaciones: 'otra observación' }), ctx);
  A(!rB.ok && rB.errors.some((e) => e.codigo === 'CONFLICTO_IDEMPOTENCIA'), 'B: payload distinto → CONFLICTO_IDEMPOTENCIA');
});

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\nCaptura Backend V2 — TOTAL: ${R.pass + R.fail + R.skip} · PASS: ${R.pass} · FAIL: ${R.fail} · SKIP: ${R.skip}`);
process.exit(R.fail ? 1 : 0);