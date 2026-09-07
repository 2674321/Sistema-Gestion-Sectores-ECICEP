#!/usr/bin/env node
/**
 * Batería UI-SHAPED de captura V2 — ECICEP (Fase 6).
 *
 * Fuente normativa: docs/CONTRATO_CAPTURA_V2.md §5.1/§6/§8/§11 (únicas fuentes).
 *
 * Objetivo: verificar que el payload REAL que construye la Web App
 * (src/CapturaWeb.html) es exactamente el payload permitido por la matriz
 * contractual, y que además lo acepta el validador V2 real de producción
 * (src/26_Captura.js). Regresión FASE 5: la UI enviaba campos NP → rechazo.
 *
 * El test extrae `construirPayloadV2` y `_accionCamel` DEL ARCHIVO REAL
 * (CapturaWeb.html) y los ejecuta en node con el estado completo de la UI.
 * No usa payloads artificialmente mínimos: cada estado UI trae todas las
 * claves que el formulario realmente posee.
 *
 * Uso: node tests/captura_ui_payload_v2.mjs
 * Salida: [PASS]/[FAIL] por prueba + TOTAL/PASS/FAIL.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Carga del núcleo (mismo orden que captura_backend_v2.mjs) para tener el
// validador V2 REAL de producción.
// ─────────────────────────────────────────────────────────────────────────────
const archivos = [
  'src/00_Config.js', 'src/01_Utilidades.js', 'src/02_Normalizacion.js', 'src/03_Fuentes.js',
  'src/04_Identificacion.js', 'src/13_Eventos.js', 'src/14_REM.js', 'src/15_RemExcel.js',
  'src/16_Amarillo.js', 'src/17_Hojas.js', 'src/18_Calidad.js', 'src/19_Permisos.js',
  'src/20_Instalador.js', 'src/21_Auditoria.js', 'src/22_HojasVisual.js', 'src/12_Ingresos.js',
  'src/24_Formulario.js', 'src/25_Entorno.js', 'src/Webhook.js', 'src/WebApp.gs',
  'src/06_Modelo.js', 'src/08_Dashboard.js', 'src/11_DatosPrueba.js', 'src/10_Pruebas.js',
  'src/26_Captura.js'
];
let codigo = '';
for (const a of archivos) codigo += readFileSync(path.join(raiz, a), 'utf8') + '\n';

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(codigo, sandbox, { filename: 'ecicep-backend-ui-payload-v2.js' });

// ─────────────────────────────────────────────────────────────────────────────
// Extracción de las funciones REALES del frontend desde CapturaWeb.html
// ─────────────────────────────────────────────────────────────────────────────
function extraerFuncion(html, nombre) {
  const ini = html.indexOf('function ' + nombre + '(');
  if (ini === -1) throw new Error('FUNCIÓN NO ENCONTRADA en CapturaWeb.html: ' + nombre);
  const desde = ini;
  let i = html.indexOf('{', desde);
  if (i === -1) throw new Error('LLAVE NO ENCONTRADA para: ' + nombre);
  let prof = 0, j = i;
  for (; j < html.length; j++) {
    if (html[j] === '{') prof += 1;
    else if (html[j] === '}') { prof -= 1; if (prof === 0) { j += 1; break; } }
  }
  return html.slice(desde, j);
}

const html = readFileSync(path.join(raiz, 'src/CapturaWeb.html'), 'utf8');
if (!html.includes('function construirPayloadV2(')) throw new Error('construirPayloadV2 ausente en CapturaWeb.html');
if (!html.includes('function recolectar(')) throw new Error('recolectar ausente en CapturaWeb.html');
try {
  vm.runInContext(extraerFuncion(html, '_accionCamel'), sandbox, { filename: 'construirPayloadV2-html.js' });
  vm.runInContext(extraerFuncion(html, 'construirPayloadV2'), sandbox, { filename: 'construirPayloadV2-html.js' });
} catch (e) {
  console.error('ERROR extrayendo funciones del frontend:', e.message);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini runner
// ─────────────────────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0;
function t(nombre, fn) {
  try { fn(); PASS += 1; console.log('[PASS] ' + nombre); }
  catch (e) { FAIL += 1; console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message ? e.message : String(e))); }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function profundos(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg || 'profundoIgual') + '\n   recibido: ' + ja + '\n   esperado: ' + jb);
}

// ─────────────────────────────────────────────────────────────────────────────
// Oráculo contractual (§5.1): claves permitidas por operación
// ─────────────────────────────────────────────────────────────────────────────
const PERMITIDAS = {
  nuevoIngreso: ['captureId', 'accion', 'rut', 'nombre', 'sexo', 'fechaNacimiento', 'sector',
    'fechaIngreso', 'estratificacion', 'telefonos', 'profesional', 'profesionalSecundario',
    'observaciones', 'confirmarNuevoPaciente'],
  registrarControl: ['captureId', 'accion', 'rut', 'fechaEvento', 'profesional',
    'profesionalSecundario', 'observaciones'],
  registrarSeguimiento: ['captureId', 'accion', 'rut', 'fechaEvento', 'profesional',
    'profesionalSecundario', 'observaciones'],
  actualizarDatos: ['captureId', 'accion', 'rut', 'telefonos', 'profesional',
    'profesionalSecundario', 'observaciones']
};
const REQ = {
  nuevoIngreso: ['captureId', 'accion', 'rut', 'nombre', 'fechaNacimiento', 'sector', 'fechaIngreso', 'profesional'],
  registrarControl: ['captureId', 'accion', 'rut', 'fechaEvento', 'profesional'],
  registrarSeguimiento: ['captureId', 'accion', 'rut', 'fechaEvento', 'profesional'],
  actualizarDatos: ['captureId', 'accion', 'rut', 'profesional']
};
const ACCION_CAMEL = {
  NUEVO_INGRESO: 'nuevoIngreso', REGISTRAR_CONTROL: 'registrarControl',
  REGISTRAR_SEGUIMIENTO: 'registrarSeguimiento', ACTUALIZAR_DATOS: 'actualizarDatos'
};

const CATALOGO = ['MEDICO/A', 'ENFERMERA/O', 'TENS', 'MATRONA/O', 'PSICOLOGO/A', 'ASISTENTE SOCIAL'];
function genCid(n) { const s = '00000000000000000000000000000000' + n.toString(16); return 'Cp2-' + s.slice(-32); }

// ─────────────────────────────────────────────────────────────────────────────
// Estados UI realistas: TODAS las claves que el formulario realmente posee,
// aunque el backend las marque NP para esa operación.
// ─────────────────────────────────────────────────────────────────────────────
function estadoUINuevoIngreso(over = {}) {
  return Object.assign({
    accionUI: 'NUEVO_INGRESO', rut: '11111111-1', nombre: 'LUISA ANDREA PARRA SOTO',
    sexo: 'F', fechaNacimiento: '1988-03-12', sector: 'AMARILLO', fechaIngreso: '2026-09-01',
    estratificacion: 'G1', telefonos: '990600712', fechaEvento: '',
    profesional: 'MATRONA/O', profesionalSecundario: 'MEDICO/A', observaciones: 'Ingreso por control de salud'
  }, over);
}
function estadoUIControl(over = {}) {
  // DOM con identificacion poblada (residual de un NUEVO_INGRESO previo) + evento/prof.
  return Object.assign({
    accionUI: 'REGISTRAR_CONTROL', rut: '11111111-1', nombre: 'LUISA ANDREA PARRA SOTO',
    sexo: 'F', fechaNacimiento: '1988-03-12', sector: 'AMARILLO', fechaIngreso: '2026-09-01',
    estratificacion: 'G1', telefonos: '990600712', fechaEvento: '2026-08-15',
    profesional: 'ENFERMERA/O', profesionalSecundario: 'TENS', observaciones: 'Control de rutina'
  }, over);
}
function estadoUISeguimiento(over = {}) {
  return Object.assign({
    accionUI: 'REGISTRAR_SEGUIMIENTO', rut: '11111111-1', nombre: 'LUISA ANDREA PARRA SOTO',
    sexo: 'F', fechaNacimiento: '1988-03-12', sector: 'AMARILLO', fechaIngreso: '2026-09-01',
    estratificacion: 'G1', telefonos: '990600712', fechaEvento: '2026-08-20',
    profesional: 'TENS', profesionalSecundario: 'ENFERMERA/O', observaciones: 'Seguimiento'
  }, over);
}
function estadoUIActualizar(over = {}) {
  return Object.assign({
    accionUI: 'ACTUALIZAR_DATOS', rut: '11111111-1', nombre: 'LUISA ANDREA PARRA SOTO',
    sexo: 'F', fechaNacimiento: '1988-03-12', sector: 'AMARILLO', fechaIngreso: '2026-09-01',
    estratificacion: 'G1', telefonos: '977654321', fechaEvento: '2026-08-15',
    profesional: 'MEDICO/A', profesionalSecundario: '', observaciones: 'Actualización de teléfono'
  }, over);
}

function build(estado, opciones) {
  const est = Object.assign({}, estado);
  if (!est.captureId) est.captureId = genCid(PASS + 1 + Math.floor(Math.random() * 100000));
  return sandbox.construirPayloadV2(est, opciones || {});
}
const pkeys = (p) => Object.keys(p).sort();

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBAS
// ─────────────────────────────────────────────────────────────────────────────
console.log('PARTE A — Payload por acción ⊆ permitidas (§5.1). Campos NP ausentes.');

t('NUEVO_INGRESO: payload ⊆ permitidas, REQ presentes, sin NP', () => {
  const p = build(estadoUINuevoIngreso());
  const accion = p.accion;
  pkeys(p).forEach((k) => A(PERMITIDAS[accion].includes(k), 'clave NP o desconocida: ' + k));
  REQ[accion].forEach((k) => A(Object.prototype.hasOwnProperty.call(p, k), 'REQ ausente: ' + k));
  A(p.fechaIngreso === '2026-09-01', 'fechaIngreso debe viajar');
  A(!Object.prototype.hasOwnProperty.call(p, 'fechaEvento'), 'fechaEvento NP no debe existir');
  A(!Object.prototype.hasOwnProperty.call(p, 'confirmarNuevoPaciente'), 'confirmarNuevoPaciente no sin fuerza');
});

t('REGISTRAR_CONTROL: payload ⊆ permitidas, REQ presentes, sin NP', () => {
  const p = build(estadoUIControl());
  const accion = p.accion;
  pkeys(p).forEach((k) => A(PERMITIDAS[accion].includes(k), 'clave NP o desconocida: ' + k));
  REQ[accion].forEach((k) => A(Object.prototype.hasOwnProperty.call(p, k), 'REQ ausente: ' + k));
  ['nombre', 'sexo', 'fechaNacimiento', 'sector', 'fechaIngreso', 'estratificacion', 'telefonos'].forEach((np) => {
    A(!Object.prototype.hasOwnProperty.call(p, np), 'clave NP presente: ' + np);
  });
  A(p.fechaEvento === '2026-08-15', 'fechaEvento debe viajar en CONTROL');
});

t('REGISTRAR_SEGUIMIENTO: payload ⊆ permitidas, REQ presentes, sin NP', () => {
  const p = build(estadoUISeguimiento());
  const accion = p.accion;
  pkeys(p).forEach((k) => A(PERMITIDAS[accion].includes(k), 'clave NP o desconocida: ' + k));
  REQ[accion].forEach((k) => A(Object.prototype.hasOwnProperty.call(p, k), 'REQ ausente: ' + k));
  A(!Object.prototype.hasOwnProperty.call(p, 'fechaIngreso'), 'fechaIngreso NP no debe existir');
  A(p.fechaEvento === '2026-08-20', 'fechaEvento debe viajar en SEGUIMIENTO');
});

t('ACTUALIZAR_DATOS: payload ⊆ permitidas, REQ presentes, sin NP', () => {
  const p = build(estadoUIActualizar());
  const accion = p.accion;
  pkeys(p).forEach((k) => A(PERMITIDAS[accion].includes(k), 'clave NP o desconocida: ' + k));
  REQ[accion].forEach((k) => A(Object.prototype.hasOwnProperty.call(p, k), 'REQ ausente: ' + k));
  ['nombre', 'sexo', 'fechaNacimiento', 'sector', 'fechaIngreso', 'estratificacion', 'fechaEvento'].forEach((np) => {
    A(!Object.prototype.hasOwnProperty.call(p, np), 'clave NP presente: ' + np);
  });
  A(p.telefonos === '977654321', 'telefonos (OPC en actualizarDatos) debe viajar');
});

t('Exactitud: payload NUEVO_INGRESO completo ≡ conjunto permitido lleno (13 claves)', () => {
  const p = build(estadoUINuevoIngreso());
  const esperadas = ['captureId', 'accion', 'rut', 'nombre', 'sexo', 'fechaNacimiento', 'sector',
    'fechaIngreso', 'estratificacion', 'telefonos', 'profesional', 'profesionalSecundario', 'observaciones'];
  profundos(pkeys(p), esperadas.slice().sort(), 'claves del payload NUEVO_INGRESO');
});

console.log('\nPARTE B — Fechas por operación (§10/§5.1).');

t('fechaIngreso: presente SOLO en nuevoIngreso', () => {
  A(Object.prototype.hasOwnProperty.call(build(estadoUINuevoIngreso()), 'fechaIngreso'), 'NUEVO_INGRESO debe traer fechaIngreso');
  A(!Object.prototype.hasOwnProperty.call(build(estadoUIControl()), 'fechaIngreso'), 'CONTROL no debe traer fechaIngreso');
  A(!Object.prototype.hasOwnProperty.call(build(estadoUISeguimiento()), 'fechaIngreso'), 'SEGUIMIENTO no debe traer fechaIngreso');
  A(!Object.prototype.hasOwnProperty.call(build(estadoUIActualizar()), 'fechaIngreso'), 'ACTUALIZAR no debe traer fechaIngreso');
});

t('fechaEvento: presente en CONTROL/SEGUIMIENTO, ausente en NUEVO_INGRESO/ACTUALIZAR', () => {
  A(!Object.prototype.hasOwnProperty.call(build(estadoUINuevoIngreso()), 'fechaEvento'), 'NUEVO_INGRESO no debe traer fechaEvento');
  A(Object.prototype.hasOwnProperty.call(build(estadoUIControl()), 'fechaEvento'), 'CONTROL debe traer fechaEvento');
  A(Object.prototype.hasOwnProperty.call(build(estadoUISeguimiento()), 'fechaEvento'), 'SEGUIMIENTO debe traer fechaEvento');
  A(!Object.prototype.hasOwnProperty.call(build(estadoUIActualizar()), 'fechaEvento'), 'ACTUALIZAR no debe traer fechaEvento');
});

console.log('\nPARTE C — Cambio de acción (§12): los valores residuales del DOM no cruzan el contrato.');

t('Cambio NUEVO_INGRESO → CONTROL → NUEVO_INGRESO preserva la matriz', () => {
  const pA = build(Object.assign(estadoUINuevoIngreso(), { fechaIngreso: '2026-09-05' }));
  A(Object.prototype.hasOwnProperty.call(pA, 'fechaIngreso'), 'Payload A debe contener fechaIngreso');
  const pB = build(Object.assign(estadoUIControl(), { fechaIngreso: '2026-09-05' }));
  A(!Object.prototype.hasOwnProperty.call(pB, 'fechaIngreso'), 'Payload B (CONTROL) no debe contener fechaIngreso');
  A(Object.prototype.hasOwnProperty.call(pB, 'fechaEvento'), 'Payload B debe contener fechaEvento');
  const pC = build(Object.assign(estadoUINuevoIngreso(), { fechaIngreso: '2026-09-05' }));
  A(Object.prototype.hasOwnProperty.call(pC, 'fechaIngreso'), 'Payload C debe volver a contener fechaIngreso');
  A(!Object.prototype.hasOwnProperty.call(pC, 'fechaEvento'), 'Payload C no debe contener fechaEvento');
});

console.log('\nPARTE D — Regresión FASE 5 reproducida con el estado UI completo.');

t('FASE5: NUEVO_INGRESO completo no trae fechaEvento (aunque fechaEvento exista vacío en DOM)', () => {
  const p = build(estadoUINuevoIngreso());
  A(!Object.prototype.hasOwnProperty.call(p, 'fechaEvento'), 'fechaEvento vacío en DOM no debe cruzar al payload');
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(v.ok === true, 'validador debe aceptar: ' + JSON.stringify(v.errores || v.errors));
});

t('FASE5: CONTROL con campos de NUEVO_INGRESO en DOM no trae claves NP', () => {
  const p = build(estadoUIControl());
  ['nombre', 'sexo', 'fechaNacimiento', 'sector', 'fechaIngreso', 'estratificacion', 'telefonos'].forEach((np) => {
    A(!Object.prototype.hasOwnProperty.call(p, np), 'clave NP presente: ' + np);
  });
  const v = sandbox.Captura_v2_validar(p, { catalogo: CATALOGO });
  A(v.ok === true, 'validador debe aceptar: ' + JSON.stringify(v.errores || v.errors));
});

console.log('\nPARTE E — Integración: el payload UI real es aceptado por el validador V2 real.');

t('Integración NUEVO_INGRESO UI → Captura_v2_validar → ok:true', () => {
  const v = sandbox.Captura_v2_validar(build(estadoUINuevoIngreso()), { catalogo: CATALOGO });
  A(v.ok === true, 'FALLA: ' + JSON.stringify(v.errores || v.errors));
});
t('Integración REGISTRAR_CONTROL UI → Captura_v2_validar → ok:true', () => {
  const v = sandbox.Captura_v2_validar(build(estadoUIControl()), { catalogo: CATALOGO });
  A(v.ok === true, 'FALLA: ' + JSON.stringify(v.errores || v.errors));
});
t('Integración REGISTRAR_SEGUIMIENTO UI → Captura_v2_validar → ok:true', () => {
  const v = sandbox.Captura_v2_validar(build(estadoUISeguimiento()), { catalogo: CATALOGO });
  A(v.ok === true, 'FALLA: ' + JSON.stringify(v.errores || v.errors));
});
t('Integración ACTUALIZAR_DATOS UI → Captura_v2_validar → ok:true', () => {
  const v = sandbox.Captura_v2_validar(build(estadoUIActualizar()), { catalogo: CATALOGO });
  A(v.ok === true, 'FALLA: ' + JSON.stringify(v.errores || v.errors));
});

console.log('\nPARTE F — confirmarNuevoPaciente: solo nuevoIngreso y solo por instrucción explícita.');

t('confirmarNuevoPaciente=true solo en NUEVO_INGRESO; nunca en las demás', () => {
  const pN = build(estadoUINuevoIngreso(), { confirmarNuevoPaciente: true });
  A(pN.confirmarNuevoPaciente === true, 'NUEVO_INGRESO con fuerza debe incluirlo');
  const pa = build(estadoUIControl(), { confirmarNuevoPaciente: true });
  A(!Object.prototype.hasOwnProperty.call(pa, 'confirmarNuevoPaciente'), 'CONTROL nunca debe traerlo');
  const pS = build(estadoUISeguimiento(), { confirmarNuevoPaciente: true });
  A(!Object.prototype.hasOwnProperty.call(pS, 'confirmarNuevoPaciente'), 'SEGUIMIENTO nunca debe traerlo');
  const pU = build(estadoUIActualizar(), { confirmarNuevoPaciente: true });
  A(!Object.prototype.hasOwnProperty.call(pU, 'confirmarNuevoPaciente'), 'ACTUALIZAR nunca debe traerlo');
});

console.log('\nPARTE G — Consistencia 100%: ninguna clave fuera de la matriz en ningún payload.');

t('Ningún payload construido contiene claves fuera de PERMITIDAS', () => {
  [estadoUINuevoIngreso, estadoUIControl, estadoUISeguimiento, estadoUIActualizar].forEach((mk) => {
    const p = build(mk());
    const accion = p.accion;
    pkeys(p).forEach((k) => A(PERMITIDAS[accion].includes(k), 'clave fuera de matriz: ' + k + ' en ' + accion));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('Captura UI Payload V2 — TOTAL: ' + (PASS + FAIL) + ' · PASS: ' + PASS + ' · FAIL: ' + FAIL);
if (FAIL > 0) process.exit(1);