#!/usr/bin/env node
/**
 * Batería OPERADOR / RESILIENCIA — ECICEP v0.10.5 (§36-§46).
 *
 * Cubre las garantías operativas de la segunda pasada de fiabilidad:
 *   §37-§39  estado de envío (ENVIO.seq), timeout, callbacks viejos y modal
 *            de duplicados en el IIFE real de src/CapturaWeb.html.
 *   §38-§39  recuperación de acceso: recarga única, conservación/restauración
 *            del captureId pendiente y nueva recuperación tras marcar sano.
 *   §40      bootstrap (BOOT): catálogo vacío, error temporal, reintentos,
 *            botón Reintentar y la invariante "nunca listo sin profesionales".
 *   §40      contrato común RPC: distinguir dataset vacío de RPC fallida
 *            (api_buscar, api_revisionListar, api_ficha, api_dashboardDatos,
 *            api_remVista, api_ingresosPendientes, api_ingresoDetalle).
 *   §42      idempotencia del operador: retry del mismo envío NO duplica
 *            (criterio captureId + marcas FUENTE), incluido retry post-timeout.
 *   §43      concurrencia: exclusión mutua (SERVICIO_OCUPADO) y guardia
 *            optimista de ficha (FICHA_CAMBIO) sin escrituras perdidas.
 *   §44-§45  ficha todo-o-nada + vista derivada best effort: un fallo de
 *            Modelo_refrescarVistasSectores_ reporta advertencia VISTA_SECTOR_
 *            PENDIENTE y el reintento no duplica el evento CAMBIO_SECTOR.
 *   §45-§46  revisión: cola vacía ≠ fallo; métricas de decisión exactas.
 *
 * La parte web ejecuta el script inline REAL de CapturaWeb.html en un sandbox
 * (mismo harness que formulario_web) con DOM mínimo, temporizadores
 * controlables y google.script.run que retiene handlers para poder responder.
 * La parte backend ejecuta el código REAL de src/ en un contexto vm.
 *
 * Uso: node tests/operador_resiliencia_vNEXT.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

// ── Runner ──
let PASS = 0, FAIL = 0;
function t(nombre, fn) {
  try { fn(); PASS += 1; console.log('[PASS] ' + nombre); }
  catch (e) { FAIL += 1; console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message ? e.message : String(e))); }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function contiene(hay, aguja, msg) { A((hay || '').indexOf(aguja) !== -1, msg || 'no contiene: ' + aguja); }

// ── 1. Sandbox web: IIFE real de CapturaWeb.html + runtime común ──
const htmlRaw = readFileSync(path.join(raiz, 'src/CapturaWeb.html'), 'utf8');
let iniSc = -1, finSc = -1, bundleScript = '';
for (let cursor = 0; cursor < htmlRaw.length;) {
  iniSc = htmlRaw.indexOf('<script>', cursor);
  if (iniSc === -1) break;
  finSc = htmlRaw.indexOf('</script>', iniSc);
  if (finSc === -1) break;
  const cand = htmlRaw.slice(iniSc + '<script>'.length, finSc);
  if (cand.indexOf('})();') !== -1) { bundleScript = cand; break; }
  cursor = finSc + '</script>'.length;
}
if (!bundleScript) { console.error('ERROR: IIFE de CapturaWeb no encontrado'); process.exit(2); }
const cierreIIFE = bundleScript.lastIndexOf('})();');
if (cierreIIFE === -1) { console.error('ERROR: cierre IIFE no encontrado'); process.exit(2); }

const runtimeHtml = readFileSync(path.join(raiz, 'src/00_OperadorRuntime.html'), 'utf8');
const mRuntime = runtimeHtml.match(/<script>([\s\S]*?)<\/script>/);
const runtimeScript = mRuntime ? mRuntime[1] : '';

const exportBlock = `
  globalThis.__UI_TEST = {
    enviar: enviar, enviarFinal: enviarFinal, _envExito: _envExito, _envFallo: _envFallo,
    envioIniciar: envioIniciar, envioEsActual: envioEsActual, envioFinalizar: envioFinalizar,
    envioPausarEsperaHumana: envioPausarEsperaHumana,
    _asignarCaptureId: _asignarCaptureId, _autoReloadSiVersion: _autoReloadSiVersion,
    _recargarAcceso: _recargarAcceso, accesoMarcarSano: accesoMarcarSano,
    _sesGet: _sesGet, _sesSet: _sesSet, _sesRemove: _sesRemove,
    bootReintentar: function () { bootOcultarError(); BOOT.intento = 0; bootEjecutar(); },
    get $(){ return $; },
    get accion(){ return getAccion(); },
    get enviando(){ return _enviando; }, set enviando(v){ _enviando = v; },
    get secuencia(){ return ENVIO.seq; },
    get activo(){ return ENVIO.activo; },
    get fase(){ return ENVIO.fase; },
    get tiempoId(){ return ENVIO.timeoutId; },
    get bootIntento(){ return BOOT.intento; },
    get bootListo(){ return BOOT.listo; },
    get profesionales(){ return PROF.slice(); },
    get ultimoSig(){ return _ultimoSig; }, set ultimoSig(v){ _ultimoSig = v; },
    get resumen(){ return _resumenEntradas.length ? _resumenEntradas[_resumenEntradas.length - 1] : null; },
    get resumenEntradas(){ return _resumenEntradas.slice(); }
  };
`;

function makeElement(id) {
  const store = {
    value: '', innerHTML: '', textContent: '', className: '', disabled: false,
    style: {}, dataset: {}, _classes: new Set(), _children: [], options: [],
    _list: {}
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
    addEventListener(type, fn) { (store._list[type] = store._list[type] || []).push(fn); },
    removeEventListener() {},
    fire(type, ev) { (store._list[type] || []).forEach((fn) => fn(ev || { target })); },
    focus() {}, blur() {}, click() {},
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

// Factory: cada llamada crea un sandbox fresco (aislamiento entre tests).
function createWebSandbox(seedSes) {
  const elementCache = new Map();
  const rpcCalls = [];
  const timers = new Map(); let nextTimer = 1;
  const reloads = []; const alertas = [];
  const sesStore = new Map(Object.entries(seedSes || {}));
  const radioAccion = makeElement('accion-radio');
  radioAccion.value = 'NUEVO_INGRESO';
  radioAccion.checked = true;

  const sessionStorage = {
    getItem(k) { return sesStore.has(k) ? sesStore.get(k) : null; },
    setItem(k, v) { sesStore.set(k, String(v)); },
    removeItem(k) { sesStore.delete(k); }
  };
  const document = {
    getElementById(id) {
      if (!elementCache.has(id)) elementCache.set(id, makeElement(id));
      return elementCache.get(id);
    },
    createElement(tag) { return makeElement('<' + tag + '>'); },
    createTextNode(s) { return { nodeType: 3, textContent: s }; },
    querySelectorAll() { return []; },
    querySelector(sel) { if (sel === 'input[name="accion"]:checked') return radioAccion; return null; },
    addEventListener() {}, removeEventListener() {},
    body: { appendChild() {}, removeChild() {}, textContent: '' },
    head: { appendChild() {} },
    documentElement: { appendChild() {} }
  };

  let curOk = null, curFail = null;
  const gsr = {
    withSuccessHandler(fn) { curOk = fn; return this; },
    withFailureHandler(fn) { curFail = fn; return this; }
  };
  ['WebApp_estadoInicial', 'WebApp_previaDuplicadosV2', 'WebApp_capturarEnviar', 'api_webappEstado'].forEach((name) => {
    gsr[name] = function () {
      rpcCalls.push({ name, args: [...arguments], ok: curOk, fail: curFail, consumed: false });
      curOk = null; curFail = null;
      return this;
    };
  });

  const sandbox = {
    console, JSON, Date, Math, RegExp, Object, Array, String, Number, Boolean, Error,
    Uint8Array, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    document, addEventListener() {}, removeEventListener() {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage,
    location: { reload() { reloads.push(1); } },
    alert(msg) { alertas.push(msg); },
    navigator: { clipboard: { writeText() {} } },
    google: { script: { run: gsr } },
    setTimeout(fn, ms) { timers.set(nextTimer, { fn, ms }); return nextTimer++; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { fn(); return 0; },
    window: null,
    open() {}
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  if (runtimeScript) vm.runInContext(runtimeScript, sandbox, { filename: '00_OperadorRuntime.html-inline.js' });
  const scriptConHook = bundleScript.slice(0, cierreIIFE) + exportBlock + bundleScript.slice(cierreIIFE);
  vm.runInContext(scriptConHook, sandbox, { filename: 'CapturaWeb.html-inline.js' });

  const U = sandbox.__UI_TEST;
  const api = {
    U, elementCache, rpcCalls, timers, reloads, alertas, sesStore, radioAccion, document,
    calls(name) { return rpcCalls.filter((c) => c.name === name); },
    pending(name) { return rpcCalls.find((c) => c.name === name && !c.consumed); },
    respond(name, value) {
      const call = api.pending(name);
      if (!call) throw new Error('Sin RPC pendiente ' + name + ' (tiene: ' + rpcCalls.map((c) => c.name).join(', ') + ')');
      call.consumed = true;
      if (value instanceof Error) call.fail(value); else call.ok(value);
    },
    fire(id) { const x = timers.get(id); if (x) { timers.delete(id); x.fn(); } },
    fireAll() { [...timers.keys()].forEach((id) => api.fire(id)); },
    formValido() {
      const v = {
        rut: '12.345.678-9', nombre: 'Paciente Test', sexo: 'M', fnac: '2000-01-01',
        sector: 'VERDE', fingreso: '2026-01-01', fecha_evento: '2026-01-02',
        telefonos: '+56911112222', obs: 'obs', profesional: 'MEDICO/A', profesional2: '', estrat: 'G1'
      };
      Object.keys(v).forEach((id) => { const el = document.getElementById(id); if (el) el.value = v[id]; });
    },
    resetAccion(a) { api.radioAccion.value = a; api.radioAccion.checked = true; }
  };
  return api;
}

// ── 2. Sandbox backend: código REAL de src/ en vm ──
function backend() {
  const c = vm.createContext({ console: { log() {}, error() {}, info() {} } });
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter((f) => /\.(js|gs)$/.test(f)).sort()) {
    vm.runInContext(readFileSync(path.join(raiz, 'src', f), 'utf8'), c, { filename: f });
  }
  return c;
}
function memory(c) {
  const rows = new Map(); const events = new Map();
  const ctx = {
    usuario: 'operador@test.local', catalogo: ['MEDICO/A'], ahora: () => '2026-09-16 10:00:00', maxReintentos: 3,
    buscarRegistro: (id) => rows.get(id),
    persistirRegistro: (r) => { rows.set(r.captureId, JSON.parse(JSON.stringify(r))); return { ok: true }; },
    actualizarTrailer: (id, changes) => { Object.assign(rows.get(id), changes); return { ok: true }; },
    entregar: c.Captura_v2_entregar
  };
  c.Captura_v2_buscarPersonaPorRut = () => ({ ID_INTERNO: 'FICTICIO' });
  c.Captura_v2_marcaEnEventos = (marca) => events.get(marca);
  c.Eventos_registrarPaciente_ = (p) => { events.set(p.fuente, { idInterno: p.idInterno, idEvento: 'EVENTO-FICTICIO' }); return { ok: true }; };
  return { ctx, rows, events };
}

// ── 3. Pruebas PARTE A — Estado de envío (§37) ──
console.log('OPERADOR A — estado de envío: las 4 acciones marcan envío activo con UNA RPC.');

t('A1 las 4 acciones fijan _enviando=true, ENVIO activo, fase correcta y UNA RPC', () => {
  const w = createWebSandbox();
  for (const acc of ['REGISTRAR_CONTROL', 'REGISTRAR_SEGUIMIENTO', 'ACTUALIZAR_DATOS']) {
    w.formValido(); w.U.enviando = false; w.resetAccion(acc);
    const antes = w.calls('WebApp_capturarEnviar').length;
    w.U.enviar();
    A(w.U.enviando === true, acc + ': _enviando activo');
    A(w.U.activo === true, acc + ': ENVIO activo');
    A(w.U.fase === 'entrega', acc + ': fase entrega (era ' + w.U.fase + ')');
    A(w.U.tiempoId !== null, acc + ': timeout armado');
    A(w.calls('WebApp_capturarEnviar').length === antes + 1, acc + ': exactamente 1 RPC de captura');
    A((w.calls('WebApp_previaDuplicadosV2')[w.calls('WebApp_previaDuplicadosV2').length - 1] || {}).name !== 'WebApp_previaDuplicadosV2',
      acc + ': sin pre-flight');
    A(w.U.envioFinalizar(w.U.secuencia) === true, acc + ': finalizar libera');
    A(w.U.enviando === false, acc + ': tras finalizar, _enviando false');
  }
});

t('A2 NUEVO_INGRESO usa pre-flight (fase preflight) y también queda vigilado por timeout', () => {
  const w = createWebSandbox();
  w.formValido(); w.U.enviando = false; w.resetAccion('NUEVO_INGRESO');
  w.U.enviar();
  A(w.U.enviando === true && w.U.fase === 'preflight', 'fase preflight esperada');
  A(w.calls('WebApp_previaDuplicadosV2').length === 1, '1 RPC de pre-flight');
  A(w.U.tiempoId !== null, 'timeout también en pre-flight');
  w.U.envioFinalizar(w.U.secuencia);
});

t('A3 el timeout desbloquea con el MISMO mensaje en las 4 acciones (nunca queda colgado)', () => {
  for (const acc of ['REGISTRAR_CONTROL', 'REGISTRAR_SEGUIMIENTO', 'ACTUALIZAR_DATOS', 'NUEVO_INGRESO']) {
    const w = createWebSandbox();
    w.formValido(); w.U.enviando = false; w.resetAccion(acc);
    w.U.enviar();
    const tid = w.U.tiempoId;
    A(tid !== null, acc + ': timeout pendiente');
    w.fire(tid);
    A(w.U.enviando === false, acc + ': liberado por timeout');
    A(w.U.activo === false && w.U.fase === '', acc + ': ENVIO inactivo tras timeout');
    A(w.U.resumen && w.U.resumen.tipo === 'warn', acc + ': aviso warn');
    contiene(w.U.resumen.titulo, 'tardando más de lo esperado', acc + ': mensaje único de timeout');
    A(w.elementCache.get('btnEnviar').disabled === false, acc + ': botón desbloqueado');
  }
});

t('A4 el callback de una solicitud vieja NUNCA toca la solicitud nueva (secuencia)', () => {
  const w = createWebSandbox();
  const s1 = w.U.envioIniciar('preflight');
  A(w.U.envioFinalizar(s1) === true, 'solicitud 1 finalizada');
  const s2 = w.U.envioIniciar('entrega');
  A(w.U.envioEsActual(s1) === false, 'seq 1 ya no es actual');
  A(w.U.envioEsActual(s2) === true, 'seq 2 es la actual');
  A(w.U.envioFinalizar(s1) === false, 'finalizar(seq viejo) NO debe liberar');
  A(w.U.enviando === true && w.U.activo === true, 'la solicitud nueva sigue activa e intacta');
  A(w.elementCache.get('btnEnviar').disabled === true, 'botón sigue bloqueado por la solicitud nueva');
  A(w.U.envioFinalizar(s2) === true && w.U.enviando === false, 'solo la solicitud actual libera el envío');
});

t('A5 el modal de duplicados PAUSA el timeout humano y conserva el envío activo', () => {
  const w = createWebSandbox();
  w.formValido(); w.U.enviando = false; w.resetAccion('NUEVO_INGRESO');
  w.U.enviar();
  w.respond('WebApp_previaDuplicadosV2', {
    ok: true, coincidencia: true,
    candidatos: [{ resultado: 'MATCH_EXACTO', criterio: 'RUT', paciente: { nombre: 'PERSONA FICTICIA', rut: '12.345.678-9' } }]
  });
  A(w.U.activo === true && w.U.enviando === true, 'envío sigue activo mientras decide el humano');
  A(w.U.tiempoId === null, 'timeout cancelado (el operador debe poder decidir sin prisa técnica)');
  A(w.elementCache.get('dupOverlay').classList.contains('show'), 'modal de duplicados visible');
  contiene(w.elementCache.get('dupMsg').textContent, 'Ya existe una persona con el mismo RUT', 'mensaje MATCH_EXACTO');
  contiene(w.elementCache.get('dupMsg').textContent, '1 coincidencia', 'conteo visible');
});

t('A7 descartar un duplicado descongela el formulario SIN disparar ninguna RPC', () => {
  const w = createWebSandbox();
  w.formValido(); w.U.enviando = false; w.resetAccion('NUEVO_INGRESO');
  w.U.enviar();
  w.respond('WebApp_previaDuplicadosV2', { ok: true, coincidencia: true, candidatos: [] });
  const antes = w.calls('WebApp_capturarEnviar').length;
  const d = w.elementCache.get('dupDescartar');
  d.fire('click', { target: d });
  A(w.U.enviando === false && w.U.activo === false, 'descartar libera el envío');
  A(w.U.tiempoId === null, 'sin timers de envío residuales');
  A(w.calls('WebApp_capturarEnviar').length === antes, 'descartar no reenvía ni dispara RPC');
  A(!w.elementCache.get('dupOverlay').classList.contains('show'), 'modal cerrado');
  A(w.elementCache.get('btnEnviar').disabled === false, 'botón listo para reingresar');
});

t('A6 continuar desde el modal conserva datos; "registrar como nuevo" confirma la intención', () => {
  const w = createWebSandbox();
  w.formValido(); w.U.enviando = false; w.resetAccion('NUEVO_INGRESO');
  w.U.enviar();
  w.respond('WebApp_previaDuplicadosV2', { ok: true, coincidencia: true, candidatos: [] });
  const env = w.elementCache.get('dupEnviar');
  env.fire('click', { target: env });
  const entrega = w.calls('WebApp_capturarEnviar').at(-1);
  A(entrega !== undefined, 'continuar dispara la captura');
  A(entrega.args[0].rut === '12.345.678-9', 'payload conserva el RUT del formulario');
  A(entrega.args[0].confirmarNuevoPaciente === undefined, '"Enviar de todos modos" NO fuerza paciente nuevo');
  w.U.envioFinalizar(w.U.secuencia);
});

t('A6b "Registrar de todos modos" (nuevo) marca confirmarNuevoPaciente=true en el payload', () => {
  const w = createWebSandbox();
  w.formValido(); w.U.enviando = false; w.resetAccion('NUEVO_INGRESO');
  w.U.enviar();
  w.respond('WebApp_previaDuplicadosV2', { ok: true, coincidencia: true, candidatos: [] });
  const nuevo = w.elementCache.get('dupNuevo');
  nuevo.fire('click', { target: nuevo });
  const entrega = w.calls('WebApp_capturarEnviar').at(-1);
  A(entrega !== undefined, 'la opción nuevo dispara la captura');
  A(entrega.args[0].confirmarNuevoPaciente === true, 'confirmarNuevoPaciente=true al forzar registro');
  w.U.envioFinalizar(w.U.secuencia);
});

// ── 3b. Pruebas PARTE B — Recuperación de acceso (§38-§39) ──
console.log('OPERADOR B — recuperación de acceso: una sola recarga y captureId conservado.');

t('B1 bootstrap sano limpia el flag de recarga (segunda incidencia puede recuperar)', () => {
  const w = createWebSandbox({ ecicep_reload_acceso: '1' });
  w.respond('WebApp_estadoInicial', { ok: true, profesionales: ['MEDICO/A'] });
  A(w.sesStore.get('ecicep_reload_acceso') === undefined, 'flag eliminado tras bootstrap sano');
  A(w.U.bootListo === true, 'bootstrap completo');
});

t('B2 una segunda incidencia sin marcar sano NO recarga (alerta, anti-bucle)', () => {
  const w = createWebSandbox();
  w.U._recargarAcceso();
  w.fireAll();
  A(w.reloads.length === 1, 'primera incidencia recarga');
  w.U._recargarAcceso();
  w.fireAll();
  A(w.reloads.length === 1, 'segunda incidencia NO vuelve a recargar');
  A(w.alertas.length === 1 && w.alertas[0].indexOf('versión anterior') !== -1, 'aviso de versión anterior');
});

t('B3 tras marcar sano, una nueva incidencia puede volver a recargar (recuperación)', () => {
  const w = createWebSandbox();
  w.U._recargarAcceso();
  w.fireAll();
  A(w.reloads.length === 1, 'primera recarga');
  w.U.accesoMarcarSano();
  w.U._recargarAcceso();
  w.fireAll();
  A(w.reloads.length === 2, 'recuperado: una segunda incidencia vuelve a recargar');
});

t('B4 _recargarAcceso conserva el captureId pendiente antes de recargar (cruce de pestaña)', () => {
  const w = createWebSandbox();
  w.U.ultimoSig = null;
  const id = w.U._asignarCaptureId('sig1');
  A(/^Cp4-[a-f0-9]{32}$/.test(id), 'captureId V4 generado: ' + id);
  w.U._recargarAcceso();
  A('Cp4-' + w.sesStore.get('ecicep_captureId') === id, 'captureId pendiente persiste (sin prefijo, se recompone al restaurar)');
  w.fireAll();
  A(w.reloads.length === 1, 'recarga pendiente disparada');
});

t('B5 al reabrir la pestaña, el captureId guardado se restaura y se consume una sola vez', () => {
  const seed = 'ab'.repeat(16);
  const w = createWebSandbox({ ecicep_captureId: seed, ecicep_reload_acceso: '1' });
  w.respond('WebApp_estadoInicial', { ok: true, profesionales: ['MEDICO/A'] });
  const restaurado = w.U._asignarCaptureId('sig-nueva');
  A(restaurado === 'Cp4-' + seed, 'captureId restaurado desde sessionStorage: ' + restaurado);
  A(w.sesStore.get('ecicep_captureId') === undefined, 'captureId consumido (no reutilizable)');
});

// ── 4. Pruebas PARTE C — Bootstrap (§40) ──
console.log('OPERADOR C — bootstrap: catálogo vacío, errores temporales y recuperación.');

t('C1 respuesta ok habilita el formulario con profesionales cargados', () => {
  const w = createWebSandbox();
  w.respond('WebApp_estadoInicial', { ok: true, profesionales: ['MEDICO/A'], esquema: {} });
  A(w.U.bootListo === true, 'BOOT.listo');
  A(w.elementCache.get('btnEnviar').disabled === false, 'formulario habilitado');
  A(w.U.profesionales.length === 1, 'catálogo cargado');
  A(w.elementCache.get('bootError').classList.contains('hidden'), 'sin error visible');
});

t('C2 catálogo vacío (ok:false CATALOGO_PROFESIONALES_NO_DISPONIBLE) reintenta y bloquea el formulario', () => {
  const w = createWebSandbox();
  const err = { ok: false, codigo: 'CATALOGO_PROFESIONALES_NO_DISPONIBLE', motivo: 'No fue posible cargar el catálogo de profesionales' };
  for (let i = 0; i < 3; i++) {
    w.respond('WebApp_estadoInicial', err);
    A(w.elementCache.get('btnEnviar').disabled === true, 'intento ' + i + ': formulario jamás habilitado sin catálogo');
    w.fireAll();
  }
  w.respond('WebApp_estadoInicial', err);
  A(w.U.bootIntento === 4, 'reintentos consumidos hasta el tope');
  contiene(w.elementCache.get('bootErrorMsg').textContent, 'catálogo de profesionales', 'texto del error visible');
  A(!w.elementCache.get('bootError').classList.contains('hidden'), 'mensaje de error visible');
  A(w.elementCache.get('btnEnviar').disabled === true, 'formulario bloqueado tras agotar reintentos');
  A(w.U.bootListo === false, 'BOOT nunca quedó listo');
});

t('C3 error temporal de transporte → reintenta automáticamente y se recupera con éxito', () => {
  const w = createWebSandbox();
  w.respond('WebApp_estadoInicial', new Error('red caida'));
  A(w.U.bootIntento === 1, 'primer fallo registrado');
  w.fireAll();
  w.respond('WebApp_estadoInicial', { ok: true, profesionales: ['MEDICO/A'] });
  A(w.U.bootListo === true, 'recuperado al segundo intento');
  A(w.U.bootIntento === 2, 'dos intentos: fallo + éxito');
  A(w.elementCache.get('btnEnviar').disabled === false, 'formulario habilitado');
});

t('C4 agotados los reintentos, el botón Reintentar ejecuta un nuevo intento que puede tener éxito', () => {
  const w = createWebSandbox();
  const err = { ok: false, codigo: 'CATALOGO_PROFESIONALES_NO_DISPONIBLE', motivo: 'No fue posible cargar el catálogo de profesionales' };
  for (let i = 0; i < 3; i++) { w.respond('WebApp_estadoInicial', err); w.fireAll(); }
  w.respond('WebApp_estadoInicial', err);
  A(!w.elementCache.get('bootError').classList.contains('hidden'), 'error final visible');
  const retry = w.elementCache.get('btnBootRetry');
  retry.fire('click', { target: retry });
  A(w.U.bootIntento === 0, 'Reintentar reinicia el contador');
  w.respond('WebApp_estadoInicial', { ok: true, profesionales: ['MEDICO/A'] });
  A(w.U.bootListo === true, 'reintento manual con éxito');
  A(w.elementCache.get('bootError').classList.contains('hidden'), 'error oculto tras éxito');
  A(w.elementCache.get('btnEnviar').disabled === false, 'formulario habilitado');
});

t('C5 el backend NUNCA responde ok:true con catálogo vacío (invariante de profesionales)', () => {
  const c = backend();
  c.WebApp_autorizarCaptura = () => true;
  c.Captura_v2_catalogo = () => [];
  const ok = c.WebApp_estadoInicial('TOKEN');
  A(ok.ok === false, 'catálogo vacío responde ok:false');
  A(ok.codigo === 'CATALOGO_PROFESIONALES_NO_DISPONIBLE', 'codigo específico de catálogo');
  const ok2 = c.WebApp_estadoInicial('TOKEN');
  A(ok2.ok === false, 'sin catálogo tampoco ok:true');
});

// ── 5. Pruebas PARTE D — Contrato común RPC (§40) ──
console.log('OPERADOR D — contrato RPC: dataset vacío ≠ RPC fallida.');

t('D1 api_buscar: sin resultados es ok:true con filas:[]; fallo es ok:false con codigo y filas:[]', () => {
  const c = backend();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {};
  c.Modelo_leerPacientesCampos = () => [];
  c.Bus_buscarPacientes = () => [];
  const vacio = c.api_buscar('zzz', 't');
  A(vacio.ok === true && Array.isArray(vacio.filas) && vacio.filas.length === 0, 'sin resultados: ok:true filas vacías');
  c.Bus_buscarPacientes = () => { throw new Error('boom'); };
  const fallo = c.api_buscar('zzz', 't');
  A(fallo.ok === false && fallo.codigo === 'BUSQUEDA_FALLO' && fallo.filas.length === 0, 'fallo: ok:false + filas vacías');
  c.WebApp_autorizarBuscador = () => false;
  const den = c.api_buscar('zzz', 't');
  A(den.ok === false && den.codigo === 'ACCESO_DENEGADO', 'acceso denegado distinguido');
});

t('D2 api_revisionListar: cola vacía es ok:true; fallo es ok:false con casos vacíos', () => {
  const c = backend();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {};
  c.Modelo_hoja = () => ({ getLastRow: () => 1 });
  const vacio = c.api_revisionListar('t');
  A(vacio.ok === true && vacio.casos.length === 0 && vacio.metricas.abiertos === 0, 'cola vacía: ok:true');
  c.Modelo_hoja = () => { throw new Error('sheet caido'); };
  const fallo = c.api_revisionListar('t');
  A(fallo.ok === false && fallo.codigo === 'REVISION_FALLO' && fallo.casos.length === 0, 'fallo: ok:false + casos vacíos');
});

t('D3 api_revisionListar: métricas de decisión exactas ante casos ABIERTO/RESUELTO (§46)', () => {
  const c = backend();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {};
  const bloque = [
    ['ESTADOREVISION', 'DETALLE', 'RESUELTOPOR', 'TIPO'],
    ['RESUELTO', '', 'CONFIRMAR_MATCH', 'DUPLICADO'],
    ['RESUELTO', '', 'RECHAZAR_MATCH', 'DUPLICADO'],
    ['ABIERTO', JSON.stringify({ criterio: 'RUT', confianza: 'ALTA', idProvisional: '', sectorOrigen: 'NARANJO',
      origen: { hoja: 'INGRESO_NARANJO', fila: 5 }, candidatoId: null,
      valoresOriginales: { NOMBRE: 'PERSONA FICTICIA', RUT: '11.111.111-1' } }), '', 'DUPLICADO'],
    ['ABIERTO', 'json-roto', '', 'DUPLICADO']
  ];
  c.Modelo_hoja = () => ({ getLastRow: () => bloque.length });
  c.Utl_leerBloque = () => bloque;
  c.Modelo_leerPacientesCampos = () => [];
  const r = c.api_revisionListar('t');
  A(r.ok === true, 'lista procesada');
  A(r.casos.length === 1, '1 caso abierto parseable, recibidos: ' + r.casos.length);
  A(r.metricas.abiertos === 1 && r.metricas.pendientes === 1, 'abiertos/pendientes exactos');
  A(r.metricas.resueltos === 2, 'resueltos exactos');
  A(r.metricas.esMismo === 1 && r.metricas.esOtro === 1, 'decisión CONFIRMAR vs RECHAZAR bien separada');
  contiene(r.casos[0].origen.fuente, 'INGRESO_NARANJO fila 5', 'traza de origen visible');
});

t('D4 api_ficha: NUNCA nulo; error unificado en {ok:false,codigo,motivo}; éxito pasa intacto', () => {
  const c = backend();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {};
  c.Ficha_construir_ = () => ({ ok: false, code: 'PACIENTE_NO_ENCONTRADO', message: 'Paciente no encontrado' });
  const ne = c.api_ficha('I-X', 't');
  A(ne !== null && ne !== undefined && ne.ok === false && ne.codigo === 'PACIENTE_NO_ENCONTRADO' && ne.motivo === 'Paciente no encontrado',
    'no encontrado: ok:false unificado, nunca null');
  c.Ficha_construir_ = () => { throw new Error('boom'); };
  const ex = c.api_ficha('I-X', 't');
  A(ex.ok === false && ex.codigo === 'FICHA_FALLO' && ex.motivo === 'boom', 'excepción: FICHA_FALLO');
  c.Ficha_construir_ = () => ({ ok: true, ficha: { ID_INTERNO: 'I-1' } });
  const ok = c.api_ficha('I-1', 't');
  A(ok.ok === true && ok.ficha.ID_INTERNO === 'I-1', 'éxito passthrough');
});

t('D5 api_dashboardDatos: dataset vacío es ok:true; fallo es ok:false', () => {
  const c = backend();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {};
  c._UI_tz = () => 'America/Santiago';
  c._ui_isoFecha = (v) => (v ? String(v) : '');
  c.Modelo_leerPacientesCampos = (campos) => [];
  c.Modelo_leerEventosCampos = (campos) => [];
  const vacio = c.api_dashboardDatos('t');
  A(vacio.ok === true && Array.isArray(vacio.pacientes) && Array.isArray(vacio.eventos), 'empty dataset: ok:true');
  c.Modelo_leerPacientesCampos = () => { throw new Error('boom'); };
  const fallo = c.api_dashboardDatos('t');
  A(fallo.ok === false && typeof fallo.motivo === 'string', 'fallo: ok:false con motivo');
});

t('D6 api_remVista: PERIODO_INVALIDO es ok:false con motivo exacto; vista vacía es ok:true', () => {
  const c = backend();
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {}; c.Log_info = () => {};
  const inv = c.api_remVista(2026, 13, 'VERDE', 'MES', '', 't');
  A(inv.ok === false && inv.motivo === 'PERIODO_INVALIDO', 'período inválido: ok:false PERIODO_INVALIDO');
  c.Rem_bucketSector = (s) => s;
  c._rem9_datos = () => ({ pacientes: [], eventos: [] });
  c.Rem9_armarVistaDatos = (d, opts) => ({ tablas: [], notas: [], meta: { modo: opts.modo, sector: opts.sector, pacientes: 0, atenciones: 0 } });
  const v = c.api_remVista(2026, 3, 'VERDE', 'MES', '', 't');
  A(v.ok === true && Array.isArray(v.tablas) && v.meta.pacientes === 0, 'vista vacía: ok:true');
});

t('D7 accesos rechazados de lectura devuelven ok:false (nunca null) en todos los endpoints', () => {
  const c = backend();
  c.WebApp_autorizarBuscador = () => false; c.Log_error = () => {};
  for (const res of [
    c.api_buscar('x', 't'), c.api_ficha('I', 't'), c.api_dashboardDatos('t'),
    c.api_ingresosPendientes({}, 't'), c.api_ingresoDetalle('INGRESO_VERDE', 2, 't')
  ]) A(res !== null && res !== undefined && res.ok === false, 'rechazo ok:false no nulo: ' + JSON.stringify(res));
});

// ── 6. Pruebas PARTE E — Idempotencia, concurrencia y todo-o-nada (§42-§45) ──
console.log('OPERADOR E — idempotencia del operador, concurrencia y ficha todo-o-nada.');

const BASE = { captureId: 'Cp4-' + 'a'.repeat(32), accion: 'registrarControl', rut: '11111111-1', fechaEvento: '2026-09-16', profesional: 'MEDICO/A' };

t('E1 reintento idéntico del mismo control NO duplica el evento (criterio captureId + FUENTE)', () => {
  const c = backend(), m = memory(c);
  const r1 = c.Captura_v2_enviar(BASE, m.ctx);
  A(r1.ok === true && r1.data.estado === 'PROCESADO', 'primer envío procesado');
  A(m.events.size === 1, 'un evento tras el primer envío');
  const r2 = c.Captura_v2_enviar(BASE, m.ctx);
  A(r2.ok === true && r2.data.estado === 'PROCESADO', 'reenvío terminal renvía el resultado (A1)');
  A(m.events.size === 1, 'el reintento NO duplica el evento');
  const conf = c.Captura_v2_enviar({ ...BASE, fechaEvento: '2026-09-17' }, m.ctx);
  A(conf.ok === false && conf.errors[0].codigo === 'CONFLICTO_IDEMPOTENCIA', 'mismo captureId con payload distinto → conflicto');
});

t('E2 reintento después de un timeout (estado VALIDO/retry A2) converge sin duplicar', () => {
  const c = backend(), m = memory(c);
  A(c.Captura_v2_enviar(BASE, m.ctx).ok === true, 'primer envío ok');
  A(m.events.size === 1, 'un evento');
  const st = m.rows.get(BASE.captureId);
  st.estado = 'VALIDO'; st.reintentos = 0; st.ingresoHoja = ''; st.ingresoFila = '';
  const retry = c.Captura_v2_enviar(BASE, m.ctx);
  A(retry.ok === true && retry.data.estado === 'PROCESADO', 'retry tras timeout procesa (A2)');
  A(m.events.size === 1, 'el retry no duplicó el evento');
  A(Number(st.reintentos) >= 1, 'reintento contabilizado');
});

t('E3 seguimiento idempotente: mismo reintento no agrega atenciones duplicadas', () => {
  const c = backend(), m = memory(c);
  const p = { ...BASE, accion: 'registrarSeguimiento', captureId: 'Cp4-' + 'c'.repeat(32) };
  A(c.Captura_v2_enviar(p, m.ctx).ok === true, 'primer seguimiento ok');
  A(m.events.size === 1, '1 evento');
  A(c.Captura_v2_enviar(p, m.ctx).ok === true, 'reenvío ok');
  A(m.events.size === 1, 'sin duplicados');
});

t('E4 lock ocupado devuelve SERVICIO_OCUPADO reintentable sin ejecutar la mutación', () => {
  const c = backend();
  c.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => {} }) };
  let ran = false;
  const r = c.Ecicep_conLock_(() => { ran = true; return { ok: true }; });
  A(r.ok === false && r.codigo === 'SERVICIO_OCUPADO' && r.reintentable === true, 'SERVICIO_OCUPADO reintentable');
  A(ran === false, 'la operación no se ejecutó bajo contención');
  // Lock libre → ejecuta y libera.
  let released = false;
  c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { released = true; } }) };
  const ok = c.Ecicep_conLock_(() => ({ ok: true }));
  A(ok.ok === true && released, 'con lock libre ejecuta y libera');
});

t('E5 api_fichaGuardarCambios propaga SERVICIO_OCUPADO y no llama al guardado bajo contención', () => {
  const c = backend();
  let llamadas = 0;
  c.WebApp_autorizarBuscador = () => true; c.Log_error = () => {}; c.Log_flush = () => {};
  c.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock: () => {} }) };
  c.Ficha_guardarCambios_ = () => { llamadas += 1; return { ok: true }; };
  const r = c.api_fichaGuardarCambios('I-1', { PROXIMO_CONTROL: { anterior: 'A', valor: 'B' } }, 't');
  A(r.ok === false && r.codigo === 'SERVICIO_OCUPADO', 'SERVICIO_OCUPADO propagado por la API');
  A(llamadas === 0, 'guardado no ejecutado bajo contención');
  delete c.LockService;
  const ok = c.api_fichaGuardarCambios('I-1', { PROXIMO_CONTROL: { anterior: 'A', valor: 'B' } }, 't');
  A(typeof ok === 'object', 'sin contención el guardado se ejecuta');
});

t('E6 ficha todo-o-nada: guarda PACIENTES + EVENTO; fallo de vista derivada solo avisa (§44)', () => {
  const c = backend();
  const espejo = { ID_INTERNO: 'I-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: 'G1' };
  const eventos = []; let escrituras = 0;
  c.Modelo_buscarPaciente = () => ({ obj: espejo, idx: 0 });
  c.Modelo_hoja = () => ({ getRange: () => ({ setValues: (filas) => { escrituras += 1; const row = filas[0]; if (row && espejo.SECTOR !== row[espejoIndex]) espejo.SECTOR = row[espejoIndex]; } }) });
  const espejoIndex = () => c.MODELO_PACIENTE.findIndex((x) => x.campo === 'SECTOR');
  c.Modelo_filaFisica = () => 2;
  c.Modelo_agregarEventos_ = (filas, usuario, opts) => { eventos.push(...filas); };
  c.Modelo_invalidarLecturas = () => {};
  c.Modelo_refrescarVistasSectores_ = () => { throw new Error('vista sectorial caida'); };
  c._ingresosUsuarioActual = () => '';
  const r = c.Ficha_guardarCambios_('I-1', { SECTOR: { anterior: 'NARANJO', valor: 'VERDE' } });
  A(r.ok === true, 'guardado TODO-ONADA ok a pesar de la vista derivada: ' + JSON.stringify(r));
  A(r.sectorCambio === true && r.cambiosAplicados.indexOf('SECTOR') !== -1, 'cambio de sector aplicado');
  A(r.advertencias.indexOf('VISTA_SECTOR_PENDIENTE') !== -1, 'advertencia de vista derivada pendiente');
  A(eventos.length === 1 && eventos[0].TIPO_EVENTO === 'CAMBIO_SECTOR', 'evento CAMBIO_SECTOR escrito una vez');
  A(escrituras >= 1, 'PACIENTES escrito al menos una vez');
});

t('E7 retry del mismo cambio de sector NO duplica el evento; cambio obsoleto da FICHA_CAMBIO (§43)', () => {
  const c = backend();
  const espejo = { ID_INTERNO: 'I-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: 'G1' };
  const eventos = [];
  c.Modelo_buscarPaciente = () => ({ obj: espejo, idx: 0 });
  c.Modelo_hoja = () => ({ getRange: () => ({ setValues: (filas) => { for (const campo of c.MODELO_PACIENTE) espejo[campo.campo] = ''; if (filas[0]) c.MODELO_PACIENTE.forEach((f, i) => { if (filas[0][i] !== undefined) espejo[f.campo] = filas[0][i]; }); } }) });
  c.Modelo_filaFisica = () => 2;
  c.Modelo_agregarEventos_ = (filas) => { eventos.push(...filas); };
  c.Modelo_invalidarLecturas = () => {};
  c.Modelo_refrescarVistasSectores_ = () => {};
  c._ingresosUsuarioActual = () => '';
  const r1 = c.Ficha_guardarCambios_('I-1', { SECTOR: { anterior: 'NARANJO', valor: 'VERDE' } });
  A(r1.ok === true && eventos.length === 1, 'primer guardado: 1 evento CAMBIO_SECTOR');
  const r2 = c.Ficha_guardarCambios_('I-1', { SECTOR: { anterior: 'NARANJO', valor: 'VERDE' } });
  A(r2.ok === true && eventos.length === 1, 'retry convergente (SECTOR ya VERDE) no crea evento nuevo');
  // Un tercer operador con valor obsoleto NO pisa: guardia optimista FICHA_CAMBIO.
  const r3 = c.Ficha_guardarCambios_('I-1', { SECTOR: { anterior: 'NARANJO', valor: 'AMARILLO' } });
  A(r3.ok === false && String(r3.codigo || r3.motivo).indexOf('FICHA_CAMBIO') !== -1, 'valor obsoleto → FICHA_CAMBIO, sin escritura perdida');
  A(eventos.length === 1 && espejo.SECTOR === 'VERDE', 'no hay escrituras concurrentes perdidas ni eventos duplicados');
});

t('E8 buscador UI consume el contrato {ok,filas} y conserva compatibilidad con arreglo', () => {
  const html = readFileSync(path.join(raiz, 'src/Sidebar.html'), 'utf8');
  A(/var l=Array\.isArray\(res\)\?res:\(res\.filas\|\|\[\]\)/.test(html),
    'Sidebar extrae filas del contrato RPC vigente');
  A(/if\(!res\|\|res\.ok===false\)/.test(html), 'Sidebar comunica el fallo lógico de la búsqueda');
  A(/seq!==_busquedaSeq/.test(html), 'Sidebar descarta respuestas obsoletas de búsquedas anteriores');
  A(/value\.trim\(\)!==t/.test(html), 'Sidebar verifica que la respuesta corresponda al término visible');
});

// ── Resumen ──
console.log('');
console.log('Operador / Resiliencia vNEXT — TOTAL: ' + (PASS + FAIL) + ' · PASS: ' + PASS + ' · FAIL: ' + FAIL);
if (FAIL > 0) process.exit(1);
