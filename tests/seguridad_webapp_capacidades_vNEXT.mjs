// v255 (DEC-110) — Frontera de acceso de la Web App.
//
// · CAPTURA: pública y anónima. No depende de OPSESS, Session ni OAuth.
// · OPERADOR/ADMIN: requiere sesión OPSESS; toda RPC pasa por el gateway.
// · `WebApp_autorizar` deja de ser la puerta universal (DEC-101/102 quedaron
//   acotadas a la captura por DEC-110).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const src = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(src).filter(x => /\.(?:js|gs)$/.test(x)).sort()) {
  vm.runInContext(readFileSync(new URL(f, src), 'utf8'), c, { filename: f });
}

const hex = s => crypto.createHash('sha256').update(String(s)).digest('hex');

function makeCache(state) {
  const store = new Map();
  return {
    get: k => { const e = store.get(String(k)); if (!e) return null; if (e.exp && Date.now() > e.exp) { store.delete(String(k)); return null; } return e.v; },
    put: (k, v, ttl) => store.set(String(k), { v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 }),
    remove: k => store.delete(String(k)),
    _store: store
  };
}

let cacheOn = true;
const cache = makeCache();
c.CacheService = { getScriptCache: () => (cacheOn ? cache : null) };

const props = new Map();
c.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props.get(k) || '',
  setProperty: (k, v) => props.set(k, String(v)),
  deleteProperty: k => props.delete(k)
}) };

c.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
  computeDigest: (alg, txt) => Array.from(crypto.createHash('sha256').update(String(txt)).digest()),
  getUuid: () => crypto.randomUUID(),
  formatDate: () => ''
};
c.Session = { getActiveUser: () => ({ getEmail: () => 'operador@ecicep.local' }) };
c.ContentService = { createTextOutput: t => ({ tipo: 'text', texto: t }) };
c.HtmlService = {
  createHtmlOutputFromFile: n => ({ getContent: () => '<!--' + n + '-->' }),
  createTemplateFromFile: n => {
    const t = { archivo: n };
    t.evaluate = () => ({ tipo: 'html', vars: t, setTitle() { return this; }, addMetaTag() { return this; } });
    return t;
  }
};
c.Captura_v2_catalogo = () => [{ NOMBRE_CANONICO: 'PROFESIONAL UNO', ACTIVO: true }];

const RUTAS = { portal: 'PortalWeb', pacientes: 'Sidebar', ingresos: 'Sidebar', revision: 'Sidebar',
  ficha: 'Sidebar', controles: 'Controles', estadisticas: 'Dashboard', configuracion: 'Configuracion',
  backups: 'Backup', registro: 'LogVisor', instalar: 'Instalador', rem: 'RemVista', generarRem: 'RemGenerador' };

// --- 1. CAPTURA pública, sin OPSESS ni credencial --------------------------
const captura = c.doGet({ parameter: {} });
assert.equal(captura.tipo, 'html', 'la captura se sirve anónima');
assert.equal(captura.vars.archivo, 'CapturaWeb');
assert.equal(captura.vars.MODO_OPERADOR, false, 'CapturaWeb no muestra login de operador');
assert.equal(captura.vars.PORTAL_URL, '', 'la captura pública no enlaza Funciones privadas');
assert.equal(c.doGet({ parameter: { vista: 'captura' } }).vars.archivo, 'CapturaWeb');

// El estado técnico público no exige credencial.
const estado = c.api_webappEstado('');
assert.equal(estado.ok, true, 'api_webappEstado es público');
assert.equal(typeof estado.url, 'string');

// La captura funciona sin secret de operador ni sesión.
props.delete('ECICEP_OPERATOR_SECRET_SHA256');
cacheOn = false;
const estadoSinCache = c.api_webappEstado('cualquiera');
assert.equal(estadoSinCache.ok, true, 'la captura no depende de CacheService');
cacheOn = true;

// --- 2. Vistas operador: shell estático, sin PII precargada -----------------
for (const [vista, archivo] of Object.entries(RUTAS)) {
  const r = c.doGet({ parameter: { vista } });
  assert.equal(r.tipo, 'html', vista + ' sirve shell');
  assert.equal(r.vars.archivo, archivo, vista + ' usa su plantilla');
  assert.equal(r.vars.MODO_OPERADOR, true, vista + ' es vista de operador');
  assert.doesNotMatch(JSON.stringify(Object.keys(r.vars)), /RUT|NOMBRE|TELEFONO|OBSERVACION|PACIENTE/i, vista + ' no precarga PII');
}

// --- 3. `WebApp_autorizar` deja de ser la puerta universal -----------------
assert.equal(typeof c.WebApp_autorizar, 'undefined', 'WebApp_autorizar ya no es pública');
assert.ok(!c.WEBAPP_OPERATOR_RPC_ || c.WEBAPP_OPERATOR_RPC_ !== undefined);

// --- 3b. RPC de operador no expuesta directamente ---------------------------
for (const f of ['api_buscar', 'api_ficha', 'api_instalarPaso', 'WebApp_cargarPacienteEdicion']) {
  assert.equal(c[f], undefined, f + ' no debe estar en google.script.run');
}

// --- 3. Login de operador --------------------------------------------------
assert.equal(c.WebApp_operadorIniciar('x').codigo, 'OPERADOR_NO_CONFIGURADO', 'sin secret configurado');
c.WebApp_operadorConfigurarClave_('clave-de-prueba-larga-1234');
assert.ok(props.get('ECICEP_OPERATOR_SECRET_SHA256'), 'solo se guarda el hash');
assert.notEqual(props.get('ECICEP_OPERATOR_SECRET_SHA256'), 'clave-de-prueba-larga-1234', 'nunca plaintext');

const mala = c.WebApp_operadorIniciar('clave-incorrecta');
assert.equal(mala.codigo, 'CREDENCIALES_INVALIDAS');
assert.equal(JSON.stringify(mala).includes(hex('clave-de-prueba-larga-1234')), false, 'no filtra hash');

const ok = c.WebApp_operadorIniciar('clave-de-prueba-larga-1234');
assert.equal(ok.ok, true);
assert.match(ok.sessionToken, /^OPS-[0-9a-f]{64}$/);
assert.equal(ok.expiresIn, 21600, 'TTL 6 h');

// --- 4. Gateway ------------------------------------------------------------
assert.equal(c.WebApp_operadorRpc('', 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA', 'sin sesión');
assert.equal(c.WebApp_operadorRpc(ok.sessionToken, 'metodo_no_allowlisted', []).codigo, 'RPC_OPERADOR_NO_PERMITIDA', 'no allowlisted');
c.WebApp_operadorMapa_().__test_ok = () => ({ ok: true, eco: 42 });
const rpcOk = c.WebApp_operadorRpc(ok.sessionToken, '__test_ok', []);
assert.equal(rpcOk.ok, true, 'allowlisted con sesión');
assert.equal(rpcOk.eco, 42);
delete c.WebApp_operadorMapa_().__test_ok;

// --- 5. Logout invalida la sesión -----------------------------------------
assert.equal(c.WebApp_operadorCerrar(ok.sessionToken).ok, true);
assert.equal(c.WebApp_operadorRpc(ok.sessionToken, 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA', 'token revocado');

// --- 6. Sesión expirada = sesión requerida, captura sigue ------------------
const ok2 = c.WebApp_operadorIniciar('clave-de-prueba-larga-1234');
const claveCache = 'OPSESS:' + hex(ok2.sessionToken);
cache._store.delete(claveCache);
assert.equal(c.WebApp_operadorRpc(ok2.sessionToken, 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA');
assert.equal(c.api_webappEstado('').ok, true, 'captura sigue operativa');

// --- 7. Fail-closed si CacheService falla ---------------------------------
cacheOn = false;
assert.equal(c.WebApp_operadorIniciar('clave-de-prueba-larga-1234').codigo, 'OPERADOR_NO_DISPONIBLE');
assert.equal(c.api_webappEstado('').ok, true, 'captura no se ve afectada por CacheService');
cacheOn = true;

// --- 8. Rate limit de login: sólo frena fallos -----------------------------
// 19 fallos → INVALIDAS · 20º → INVALIDAS · 21º → LIMITADO. La clave CORRECTA
// nunca queda bloqueada (no se puede provocar un DoS de login) y limpia el
// contador; un fallo posterior abre un contador nuevo.
cache.remove('OPLOGIN_FAIL_COUNT');
for (let i = 0; i < 19; i++) assert.equal(c.WebApp_operadorIniciar('incorrecta').codigo, 'CREDENCIALES_INVALIDAS', 'fallo ' + (i + 1));
assert.equal(c.WebApp_operadorIniciar('incorrecta').codigo, 'CREDENCIALES_INVALIDAS', 'fallo 20');
assert.equal(c.WebApp_operadorIniciar('incorrecta').codigo, 'OPERADOR_LOGIN_TEMPORALMENTE_LIMITADO', 'fallo 21');
const logSaturado = c.WebApp_operadorIniciar('clave-de-prueba-larga-1234');
assert.equal(logSaturado.ok, true, 'la clave correcta bypassa el throttle');
assert.equal(cache.get('OPLOGIN_FAIL_COUNT'), null, 'el login correcto limpia el contador');
cache.remove('OPLOGIN_FAIL_COUNT');

console.log('seguridad_webapp_capacidades_vNEXT (DEC-110): captura pública + operador OPSESS PASS');
