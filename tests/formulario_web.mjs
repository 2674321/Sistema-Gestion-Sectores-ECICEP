#!/usr/bin/env node
/**
 * Batería FORMULARIO WEB — ECICEP (Fase S3).
 * Única fuente: comportamiento esperado definido por el contrato V2
 * (docs/CONTRATO_CAPTURA_V2.md §15-§18 y AUDITORIA_ESTABILIZACION.md §8).
 *
 * Objetivo: verificar la lógica REAL de src/CapturaWeb.html en la
 * interpretación de la respuesta del backend:
 *   - El formulario SOLO se limpia cuando el estado es PROCESADO.
 *   - RECIBIDO/VALIDANDO/VALIDO/REQUIERE_REVISION/ERROR conservan el
 *     formulario (reintento idéntico es inocuo A1/A2).
 *   - El botón/spinner nunca quedan bloqueados (timeout cubre previa y envío).
 *   - La guardia de doble envío impide RPC duplicadas.
 *   - Se expone solo identificadores técnicos, nunca datos clínicos.
 *
 * El harness ejecuta el script inline REAL de CapturaWeb.html en un sandbox
 * con DOM mínimo y expone los internos vía un hook inyectado en el IIFE.
 *
 * Uso: node tests/formulario_web.mjs
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');
const htmlFile = path.join(raiz, 'src/CapturaWeb.html');
const html = readFileSync(htmlFile, 'utf8');

// ── 1. Extracción del script inline principal (primer <script>) ──
const ini = html.indexOf('<script>');
const fin = html.indexOf('</script>', ini);
if (ini === -1 || fin === -1) { console.error('ERROR: <script> inline no encontrado'); process.exit(2); }
let script = html.slice(ini + '<script>'.length, fin);
const cierre = script.lastIndexOf('})();');
if (cierre === -1) { console.error('ERROR: cierre IIFE no encontrado'); process.exit(2); }

// ── 2. Inyección del hook de test dentro del IIFE ──
const exportBlock = `
  globalThis.__UI_TEST = {
    _envExito: _envExito, _envChips: _envChips, _envTimeoutInit: _envTimeoutInit,
    _envTimeoutOff: _envTimeoutOff, _envFallo: _envFallo, enviarFinal: enviarFinal,
    enviar: enviar, estadoListo: estadoListo, estadoEnviando: estadoEnviando,
    limpiarCampos: limpiarCampos, limpiarFormulario: limpiarFormulario,
    _asignarCaptureId: _asignarCaptureId, get $(){ return $; },
    get accion(){ return getAccion(); },
    get ultimoSig(){ return _ultimoSig; }, set ultimoSig(v){ _ultimoSig = v; },
    get enviando(){ return _enviando; }, set enviando(v){ _enviando = v; },
    get resumen(){ return _resumenEntradas.length ? _resumenEntradas[_resumenEntradas.length - 1] : null; },
    get resumenEntradas(){ return _resumenEntradas.slice(); }
  };
`;
script = script.slice(0, cierre) + exportBlock + script.slice(cierre);

// ── 3. Sandbox: DOM mínimo + stubs ──
const elementCache = new Map();
function makeElement(id) {
  const store = {
    value: '', innerHTML: '', textContent: '', className: '', disabled: false,
    style: {}, dataset: {}, _classes: new Set(), _children: [], options: []
  };
  const target = {
    id,
    classList: {
      add: (c) => { store._classes.add(c); store.className = [...store._classes].join(' '); },
      remove: (c) => { store._classes.delete(c); store.className = [...store._classes].join(' '); },
      toggle: (c, f) => {
        const v = (f === undefined) ? !store._classes.has(c) : !!f;
        if (v) store._classes.add(c); else store._classes.delete(c);
        store.className = [...store._classes].join(' ');
        return v;
      },
      contains: (c) => store._classes.has(c)
    },
    setAttribute(k, v) { target[k] = String(v); },
    getAttribute(k) { return (k in target) ? target[k] : null; },
    removeAttribute(k) { if (k in target) delete target[k]; },
    appendChild(n) { store._children.push(n); return n; },
    insertBefore(n) { store._children.push(n); return n; },
    removeChild(n) { const i = store._children.indexOf(n); if (i >= 0) store._children.splice(i, 1); return n; },
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    setSelectionRange() {}, select() {}, querySelectorAll() { return []; },
    querySelector() { return null; }, closest() { return null; }, contains() { return false; },
    scrollIntoView() {}, getContext() { return null; }
  };
  return new Proxy(target, {
    get(o, k) {
      if (typeof k === 'symbol') return undefined;
      if (k in store) return store[k];
      if (k in o) return o[k];
      return undefined;
    },
    set(o, k, v) { store[k] = v; return true; }
  });
}

const document = {
  getElementById(id) {
    if (!elementCache.has(id)) elementCache.set(id, makeElement(id));
    return elementCache.get(id);
  },
  createElement(tag) { return makeElement('<' + tag + '>'); },
  createTextNode(s) { return { nodeType: 3, textContent: s }; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {}, removeEventListener() {}
};

// Stub de google.script.run: encadenable, registra llamadas, nunca resuelve.
const rpcCalls = [];
const gsr = { withSuccessHandler() { return this; }, withFailureHandler() { return this; } };
['WebApp_esquemaFormulario', 'api_webappEstado',
  'WebApp_estadoInicial', 'WebApp_previaDuplicadosV2', 'WebApp_capturarEnviar'].forEach((name) => {
  gsr[name] = function () { rpcCalls.push({ name, args: [...arguments] }); return this; };
});

// Temporizadores controlables.
const timers = new Map(); let nextTimer = 1;
function setTimeout(fn, ms) { timers.set(nextTimer, { fn, ms }); return nextTimer++; }
function clearTimeout(id) { timers.delete(id); }

const sandbox = {
  console, JSON, Date, Math, RegExp, Object, Array, String, Number, Boolean, Error,
  parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  document, window: null,
  addEventListener() {}, removeEventListener() {},
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  google: { script: { run: gsr } },
  setTimeout, clearTimeout,
  RPC_CALLOUTS: rpcCalls,
  UI_TIMERS: {
    get pending() { return [...timers.keys()]; },
    count() { return timers.size; },
    fire(id) { const t = timers.get(id); if (t) { timers.delete(id); t.fn(); } },
    fireAll() { [...timers.keys()].forEach((id) => this.fire(id)); }
  }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(script, sandbox, { filename: 'CapturaWeb.html-inline.js' });
} catch (e) {
  console.error('ERROR ejecutando el script de la Web App en el sandbox:', e && e.message || e);
  process.exit(2);
}
const U = sandbox.__UI_TEST;
if (!U) { console.error('ERROR: hook __UI_TEST no quedo expuesto'); process.exit(2); }

// ── 4. Mini runner ──
let PASS = 0, FAIL = 0;
function t(nombre, fn) {
  try { fn(); PASS += 1; console.log('[PASS] ' + nombre); }
  catch (e) { FAIL += 1; console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message ? e.message : String(e))); }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function contiene(hay, aguja, msg) { A((hay || '').indexOf(aguja) !== -1, msg || 'no contiene: ' + aguja); }

// Utilidades de estado del formulario falso.
function poblarFormulario() {
  ['rut', 'nombre', 'fnac', 'fingreso', 'fecha_evento', 'telefonos', 'obs',
    'profesional', 'profesional2', 'sexo', 'sector', 'estrat'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = (id === 'obs' || id === 'telefonos' || id === 'profesional2') ? 'v' : 'x';
  });
  return document.getElementById('rut').value !== '';
}
function formularioLimpio() {
  return ['rut', 'nombre', 'fnac', 'fingreso', 'fecha_evento', 'telefonos', 'obs'].every((id) => !document.getElementById(id).value)
    && ['sexo', 'sector', 'estrat'].every((id) => !document.getElementById(id).value);
}
function focusRut() { elementCache.get('rut') && (document.getElementById('rut').value = 'X-RUT'); }
function resetVista() {
  elementCache.delete('btnEnviar');
  elementCache.delete('btnsNueva');
  elementCache.delete('btnLimpiar');
  elementCache.delete('spinEnviar');
  elementCache.delete('resumen');
}

const PROCESADO = { ok: true, data: { estado: 'PROCESADO', captureId: 'Cp2-0123456789abcdef0123456789abcdef', motivo: '', idInterno: 'I-1', idEvento: 'E-1' } };
const PENDIENTE = { ok: true, data: { estado: 'RECIBIDO', captureId: 'Cp2-0123456789abcdef0123456789abcdef', motivo: 'PENDIENTE_ENTREGA' } };
const REVISION = { ok: true, data: { estado: 'REQUIERE_REVISION', captureId: 'Cp2-0123456789abcdef0123456789abcdef', motivo: 'Persona no encontrada' } };

// ── 5. PRUEBAS ──
console.log('PARTE A — Interpretación de estados (regla de limpieza única).');
console.log('Requisito: limpiar SOLO en PROCESADO; conservar en cualquier otro estado.');

t('A1 PROCESADO → resumen ok, mensaje de éxito de la acción, y UNICA ruta de limpieza', () => {
  poblarFormulario();
  U._envExito(PROCESADO, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'ok', 'tipo debe ser ok: ' + JSON.stringify(U.resumen));
  contiene(U.resumen.titulo, 'Nuevo ingreso', 'mensaje de éxito de la acción');
  A(formularioLimpio(), 'el formulario debe quedar limpio tras PROCESADO');
  A(U.enviando === false, '_enviando debe quedar en false');
});

t('A2 PROCESADO → esconde btnEnviar y muestra btnsNueva (nueva captura)', () => {
  A(document.getElementById('btnEnviar').classList.contains('hidden'), 'btnEnviar debe ocultarse');
  A(document.getElementById('btnsNueva').classList.contains('show'), 'btnsNueva debe mostrarse');
});

t('A3 RECIBIDO+PENDIENTE_ENTREGA → warn, mensaje de pendiente, NO limpia, botones intactos', () => {
  resetVista();
  poblarFormulario();
  U.enviando = false;
  U._envExito(PENDIENTE, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'warn', 'tipo debe ser warn: ' + JSON.stringify(U.resumen));
  contiene(U.resumen.titulo, 'entrega pendiente', 'mensaje no ambiguo de pendiente');
  A(!formularioLimpio(), 'NO debe limpiarse con estado pendiente');
  A(!document.getElementById('btnEnviar').classList.contains('hidden'), 'btnEnviar debe seguir visible');
  A(!document.getElementById('btnsNueva').classList.contains('show'), 'btnsNueva NO debe mostrarse');
  A(U.enviando === false, '_enviando debe quedar en false (botón habilitado para reintento)');
});

t('A4 RECIBIDO (sin motivo) → warn pendiente, NO limpia', () => {
  poblarFormulario();
  U._envExito({ ok: true, data: { estado: 'RECIBIDO', captureId: 'Cp2-aa' } }, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'warn', 'tipo warn esperado');
  contiene(U.resumen.titulo, 'pendiente', 'mensaje de pendiente esperado');
  A(!formularioLimpio(), 'NO debe limpiarse');
});

t('A5 VALIDANDO → warn pendiente, NO limpia', () => {
  poblarFormulario();
  U._envExito({ ok: true, data: { estado: 'VALIDANDO', captureId: 'Cp2-bb' } }, 'REGISTRAR_CONTROL');
  A(U.resumen && U.resumen.tipo === 'warn', 'tipo warn esperado');
  contiene(U.resumen.titulo, 'VALIDANDO', 'mensaje pendiente con estado visible');
  A(!formularioLimpio(), 'NO debe limpiarse');
});

t('A6 VALIDO → warn pendiente, NO limpia', () => {
  poblarFormulario();
  U._envExito({ ok: true, data: { estado: 'VALIDO', captureId: 'Cp2-cc' } }, 'REGISTRAR_CONTROL');
  A(U.resumen && U.resumen.tipo === 'warn', 'tipo warn esperado');
  contiene(U.resumen.titulo, 'VALIDO', 'mensaje pendiente con estado visible');
  A(!formularioLimpio(), 'NO debe limpiarse');
});

t('A7 REQUIERE_REVISION → warn, mensaje de revisión, NO limpia', () => {
  resetVista();
  poblarFormulario();
  U.enviando = false;
  U._envExito(REVISION, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'warn', 'tipo debe ser warn: ' + JSON.stringify(U.resumen));
  contiene(U.resumen.titulo, 'requiere revisión', 'mensaje claro de revisión');
  contiene(U.resumen.det || '', 'Persona no encontrada', 'motivo visible');
  A(!formularioLimpio(), 'REQUIERE_REVISION NO debe limpiar');
  A(!document.getElementById('btnEnviar').classList.contains('hidden'), 'btnEnviar sigue visible');
});

t('A8 estado ERROR → err, NO limpia, botón habilitado para reintento', () => {
  poblarFormulario();
  U._envExito({ ok: true, data: { estado: 'ERROR', motivo: 'No se pudo procesar' } }, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'err', 'tipo err esperado');
  A(!formularioLimpio(), 'estado ERROR NO debe limpiar');
  A(document.getElementById('btnEnviar').disabled === false, 'botón habilitado para reintento');
});

console.log('PARTE B — Respuestas de rechazo (ok:false) y fallos de transporte.');

t('B1 ok:false con errors[] → err con mensajes, NO limpia', () => {
  poblarFormulario();
  U._envExito({ ok: false, errors: [{ codigo: 'REQ_FALTANTE', campo: 'nombre', mensaje: 'El nombre es obligatorio' }] }, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'err', 'tipo err esperado');
  contiene(U.resumen.det || '', 'El nombre es obligatorio', 'mensaje de error visible');
  A(!formularioLimpio(), 'rechazo NO debe limpiar');
});

t('B2 ok:false sin errors → err genérico, NO limpia', () => {
  poblarFormulario();
  U._envExito({ ok: false, message: 'fallo' }, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'err', 'tipo err esperado');
  A(!formularioLimpio(), 'NO debe limpiar');
});

t('B3 respuesta nula → err genérico, botón habilitado, NO limpia', () => {
  poblarFormulario();
  U._envExito(null, 'NUEVO_INGRESO');
  A(U.resumen && U.resumen.tipo === 'err', 'tipo err esperado');
  A(!formularioLimpio(), 'respuesta nula NO debe limpiar');
  A(document.getElementById('btnEnviar').disabled === false, 'botón habilitado');
});

t('B4 _envFallo (RPC falla) → err, botón habilitado, NO limpia', () => {
  poblarFormulario();
  U._envFallo();
  A(U.resumen && U.resumen.tipo === 'err', 'tipo err esperado');
  A(!formularioLimpio(), 'fallo RPC NO debe limpiar');
  A(U.enviando === false && document.getElementById('btnEnviar').disabled === false, 'desbloqueado');
});

t('B5 estado desconocido → defensivo: NO limpia y mensaje pendiente explícito', () => {
  poblarFormulario();
  U._envExito({ ok: true, data: { estado: 'ESTADO_INESPERADO' } }, 'NUEVO_INGRESO');
  A(!formularioLimpio(), 'estado desconocido NO debe limpiar');
  contiene(U.resumen.titulo, 'ESTADO_INESPERADO', 'estado visible y no ambiguo');
});

console.log('PARTE C — Privacidad: solo identificadores técnicos, nunca datos clínicos.');

t('C1 chips muestran solo estado, captureId, motivo e ids técnicos', () => {
  const chips = U._envChips({ estado: 'PROCESADO', captureId: 'Cp2-x', motivo: 'ok', idInterno: 'I-9', idEvento: 'E-9' });
  contiene(chips, 'Estado', 'chip estado');
  contiene(chips, 'Cp2-x', 'chip captureId');
  contiene(chips, 'PENDIENTE_ENTREGA'.replace('PENDIENTE_ENTREGA', 'I-9'), 'chip idInterno');
  A(chips.indexOf('nombre') === -1 && chips.indexOf('fechaNacimiento') === -1, 'no expone datos clínicos');
});

t('C2 la respuesta del backend nunca se vuelca completa al DOM', () => {
  poblarFormulario();
  U._envExito(PROCESADO, 'NUEVO_INGRESO');
  A((U.resumen.det || '').indexOf('diagnostico') === -1 && (U.resumen.det || '').indexOf('"data"') === -1, 'no se vuelca el blob de respuesta');
});

console.log('PARTE D — Guardia de doble envío y arranque seguro.');

t('D1 _enviando=true → enviar() no dispara RPC ni timers nuevos', () => {
  const antes = rpcCalls.length;
  const timersAntes = sandbox.UI_TIMERS.count();
  U.enviando = true;
  U.enviar();
  A(rpcCalls.length === antes, 'no debe dispararse ninguna RPC con envío en curso');
  A(sandbox.UI_TIMERS.count() === timersAntes, 'no deben quedar timers nuevos');
  U.enviando = false;
});

t('D2 formulario inválido → enviar() avisa y NO dispara RPC', () => {
  ['rut', 'nombre', 'fnac', 'fingreso', 'sexo', 'sector', 'estrat', 'fecha_evento'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  const antes = rpcCalls.length;
  U.enviando = false;
  U.enviar();
  A(rpcCalls.length === antes, 'formulario inválido no debe iniciar RPC');
  A(U.resumen && U.resumen.tipo === 'err' && U.resumen.titulo.indexOf('Revise los campos') !== -1, 'aviso de campos a revisar');
  A(U.enviando === false, '_enviando sigue false tras validación fallida');
});

t('D3 estadoEnviando/estadoListo controlan botón y spinner (estados opuestos)', () => {
  U.estadoEnviando();
  A(document.getElementById('btnEnviar').disabled === true, 'disable durante envío');
  A(document.getElementById('spinEnviar').classList.contains('on'), 'spinner activo');
  A(document.getElementById('btnEnviar').getAttribute('aria-busy') === 'true', 'aria-busy true');
  U.estadoListo();
  A(document.getElementById('btnEnviar').disabled === false, 'habilitado en reposo');
  A(!document.getElementById('spinEnviar').classList.contains('on'), 'spinner apagado');
  A(document.getElementById('btnEnviar').getAttribute('aria-busy') === 'false', 'aria-busy false');
});

console.log('PARTE E — Timeout: el envío nunca queda colgado (cubre previa y envío final).');

t('E1 _envTimeoutInit arma UN timer de 60s y rearmar no deja timers duplicados', () => {
  const antes = sandbox.UI_TIMERS.count();
  U._envTimeoutInit();
  U._envTimeoutInit();
  A(sandbox.UI_TIMERS.count() === antes + 1, 'una vez armado, rearmar no acumula timers');
});

t('E2 timeout disparado con _enviando=true → desbloquea botón, avisa y NO limpia', () => {
  poblarFormulario();
  U.enviando = true;
  U._envTimeoutInit();
  sandbox.UI_TIMERS.fireAll();
  A(U.enviando === false, '_enviando liberado por timeout');
  A(document.getElementById('btnEnviar').disabled === false, 'botón desbloqueado por timeout');
  A(U.resumen && U.resumen.tipo === 'err' && U.resumen.titulo.indexOf('tard\u00f3 demasiado') !== -1, 'aviso de timeout');
  A(!formularioLimpio(), 'timeout NO debe limpiar el formulario');
});

t('E3 timeout disparado con _enviando=false → no hace nada (timer muerto)', () => {
  const tituloAntes = U.resumen && U.resumen.titulo;
  U.enviando = false;
  U._envTimeoutInit();
  sandbox.UI_TIMERS.fireAll();
  A((U.resumen && U.resumen.titulo) === (tituloAntes || null), 'timer desarmado no produce mensajes nuevos');
});

t('E4 _envTimeoutOff limpia el timer pendiente', () => {
  U._envTimeoutInit();
  const n = sandbox.UI_TIMERS.count();
  U._envTimeoutOff();
  A(sandbox.UI_TIMERS.count() === n - 1, 'timer cancelado');
});

console.log('PARTE F — captureId: reintento idéntico conserva el identificador (§13 A1).');

t('F1 mismo contenido → mismo captureId; cambio de contenido → captureId nuevo', () => {
  U.ultimoSig = null;
  const a = U._asignarCaptureId('sig1');
  const b = U._asignarCaptureId('sig1');
  A(a === b, 'reintento idéntico conserva captureId');
  const c = U._asignarCaptureId('sig2');
  A(c !== b, 'contenido editado genera captureId nuevo');
  A(/^Cp2-[a-f0-9]{32}$/.test(a), 'formato §12: Cp2- + exactamente 32 hex minúsculas (recibido: ' + a + ')');
});

console.log('PARTE G — estadoEnviando se restablece al responder (nunca queda el spinner fijo).');

t('G1 tras PROCESADO el spinner no está activo y el texto vuelve al reposo', () => {
  poblarFormulario();
  U._envExito({ ok: true, data: { estado: 'PROCESADO' } }, 'REGISTRAR_CONTROL');
  A(!document.getElementById('spinEnviar').classList.contains('on'), 'spinner apagado tras PROCESADO');
  A(document.getElementById('btnEnviar').disabled === false, 'botón habilitado');
});

t('G2 tras RECIBIDO (pendiente) el spinner no está activo', () => {
  poblarFormulario();
  U._envExito(PENDIENTE, 'NUEVO_INGRESO');
  A(!document.getElementById('spinEnviar').classList.contains('on'), 'spinner apagado tras pendiente');
});

// ── Resumen ──
console.log('');
console.log('Formulario Web S3 — TOTAL: ' + (PASS + FAIL) + ' · PASS: ' + PASS + ' · FAIL: ' + FAIL);
if (FAIL > 0) process.exit(1);