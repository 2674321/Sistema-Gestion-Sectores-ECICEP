// Helper de pruebas — DOM mínimo para ejecutar el <script> REAL de
// src/EditorPaciente.html sin dependencias externas (no hay jsdom en CI).
//
// Monta un DOM realista del formulario de captura:
//   - <select id="accion"> (acción seleccionable, NO radios) — el contrato
//     vigente de CapturaWeb desde v254.
//   - secciones #secTel / #secAgenda / #secObs y #secProf.
//   - contenedores del editor: #editorPaciente,#edCargar,#edCampos,#edEstado,
//     #edResumen y un #rut real.
//
// Expone los internos mínimos para poder accionar el flujo (cambiar la acción,
// pulsar Cargar paciente y resolver la RPC) sin inyectar hooks en el IIFE.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function extraerScriptEditor(html) {
  let cursor = 0;
  while (cursor < html.length) {
    const ini = html.indexOf('<script>', cursor);
    if (ini === -1) break;
    const fin = html.indexOf('</script>', ini);
    if (fin === -1) break;
    const candidato = html.slice(ini + '<script>'.length, fin);
    if (candidato.indexOf('window.ECICEP_EDITOR') !== -1) return candidato;
    cursor = fin + '</script>'.length;
  }
  throw new Error('No se encontró el <script> de EditorPaciente');
}

function makeEl(tag, registry) {
  let _id = '';
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    type: '', value: '', checked: false, disabled: false, hidden: false,
    textContent: '', innerHTML: '', className: '', htmlFor: '',
    rows: 0, min: '', max: '', maxLength: 0, style: {}, options: [],
    _children: [], _listeners: {}, _classes: new Set(), _attr: {},
    setAttribute(k, v) {
      el._attr[k] = String(v);
      if (k === 'id') el.id = String(v);
      if (k === 'hidden') el.hidden = true;
    },
    getAttribute(k) {
      if (k === 'id') return _id || null;
      return (k in el._attr) ? el._attr[k] : null;
    },
    removeAttribute(k) { delete el._attr[k]; if (k === 'hidden') el.hidden = false; },
    appendChild(c) { el._children.push(c); return c; },
    insertBefore(c) { el._children.push(c); return c; },
    removeChild(c) { const i = el._children.indexOf(c); if (i >= 0) el._children.splice(i, 1); return c; },
    replaceChildren() { el._children = []; },
    addEventListener(t, f) { (el._listeners[t] = el._listeners[t] || []).push(f); },
    removeEventListener() {},
    focus() {}, blur() {}, scrollIntoView() {}, setSelectionRange() {}, select() {},
    click() { el.__fire('click'); },
    querySelectorAll(sel) { return descendientes(el).filter(n => coincide(n, sel)); },
    querySelector(sel) { return descendientes(el).find(n => coincide(n, sel)) || null; },
    closest() { return null; },
    contains() { return false; },
    __fire(t) { (el._listeners[t] || []).slice().forEach(f => f({ type: t, target: el })); }
  };
  Object.defineProperty(el, 'id', {
    get() { return _id; },
    set(v) { _id = String(v); if (_id) registry.set(_id, el); }
  });
  el.classList = {
    add: c => el._classes.add(c),
    remove: c => el._classes.delete(c),
    contains: c => el._classes.has(c),
    toggle: (c, force) => {
      const on = (force === undefined) ? !el._classes.has(c) : !!force;
      if (on) el._classes.add(c); else el._classes.delete(c);
      return on;
    }
  };
  return el;
}

function descendientes(root, out = []) {
  for (const c of root._children || []) {
    if (!c || typeof c !== 'object' || c.nodeType === 3) continue;
    out.push(c);
    descendientes(c, out);
  }
  return out;
}

function coincide(el, sel) {
  return String(sel).split(',').some(parte => {
    const p = parte.trim();
    if (!p) return false;
    if (p === 'input:checked') return el.tagName === 'INPUT' && el.checked === true;
    const soloTag = p.replace(/:.*$/, '').toUpperCase();
    return el.tagName === soloTag;
  });
}

/**
 * Construye un sandbox con el script de EditorPaciente ejecutado.
 * @param {{ source: string }} opts — texto del <script> a ejecutar.
 * @returns {{ document, window, editor, timers, fireDOMContentLoaded,
 *             resolverCarga, rechazarCarga, rpc, setAccion }}
 */
export function crearHarness({ source }) {
  const registry = new Map();
  const document = {
    getElementById(id) {
      if (registry.has(id)) return registry.get(id);
      const el = makeEl('div', registry);
      el.id = id; // registra vía setter id
      return el;
    },
    createElement(tag) { return makeEl(tag, registry); },
    createTextNode(s) { return { nodeType: 3, textContent: String(s) }; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener() {}
  };
  const docListeners = {};
  const body = makeEl('body', registry);
  body.setAttribute('data-acceso', '');
  document.body = body;

  // Elementos base del formulario de captura.
  const accion = document.getElementById('accion');
  accion.tagName = 'SELECT';
  accion.value = 'NUEVO_INGRESO';
  ['editorPaciente', 'secTel', 'secAgenda', 'secObs', 'secProf', 'edCargar', 'edCampos', 'edEstado', 'edResumen', 'rut']
    .forEach(id => document.getElementById(id));
  // Atributos `hidden` del markup real (#editorPaciente y #edCampos nacen ocultos).
  document.getElementById('editorPaciente').hidden = true;
  document.getElementById('edCampos').hidden = true;

  const timers = new Map(); let nextTimer = 1;
  const setTimeout = (fn) => { timers.set(nextTimer, { fn }); return nextTimer++; };
  const clearTimeout = (id) => { timers.delete(id); };

  // Stub de ECICEP_run() con el patrón google.script.run.
  const rpc = { success: null, failure: null, metodo: '', args: [] };
  function ECICEP_run() {
    let proxy;
    const b = {
      withSuccessHandler(f) { rpc.success = f; return proxy; },
      withFailureHandler(f) { rpc.failure = f; return proxy; },
      withUserObject() { return proxy; }
    };
    proxy = new Proxy(b, {
      get(t, prop) {
        if (prop in t) return t[prop];
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        return (...args) => { rpc.metodo = prop; rpc.args = args; };
      }
    });
    return proxy;
  }

  const sandbox = {
    console, JSON, Date, Math, RegExp, Object, Array, String, Number, Boolean, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    document, setTimeout, clearTimeout,
    ECICEP_run,
    ECICEP_requiereRecarga: () => false,
    ECICEP_esServicioOcupado: () => false,
    ECICEP_errorTexto: e => (e && e.message) || 'error'
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'EditorPaciente-inline.js' });

  return {
    document, window: sandbox, sandbox, timers, rpc,
    fireDOMContentLoaded() { (docListeners.DOMContentLoaded || []).slice().forEach(f => f({ type: 'DOMContentLoaded' })); },
    fireAllTimers() { [...timers.keys()].forEach(id => { const t = timers.get(id); timers.delete(id); t.fn(); }); },
    setAccion(v) { accion.value = v; accion.__fire('change'); },
    resolverCarga(r) { rpc.success && rpc.success(r); },
    rechazarCarga(e) { rpc.failure && rpc.failure(e); },
    get editor() { return sandbox.ECICEP_EDITOR; },
    camposRenderizados() {
      const raiz = document.getElementById('edCampos');
      return descendientes(raiz).filter(n => /^ed_/.test(n.id || ''));
    },
    gruposRenderizados() {
      const raiz = document.getElementById('edCampos');
      return descendientes(raiz).filter(n => String(n.className).split(/\s+/).includes('ed-grupo'));
    }
  };
}
