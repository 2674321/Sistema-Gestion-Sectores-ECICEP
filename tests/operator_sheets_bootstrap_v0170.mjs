// v0.17.0 (DEC-119) — Bootstrap OPSESS desde el Spreadsheet autorizado.
//
// · El panel de Google Sheets abre directo (OPSESS automática) SIN exponer ni
//   recuperar la clave de operador.
// · La Web App externa y `google.script.run` NO reciben bootstrap → login.
// · La captura pública sigue anónima.
// · Las operaciones destructivas conservan su confirmación server-side (nonce).
// · `includeOperadorRuntime_` y `WebApp_operadorSesionDesdeSheets_` NO son RPC
//   públicas (terminan en `_`); superficie temporal = 0.
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

// --- Mocks GAS --------------------------------------------------------------
const store = new Map();
const cache = {
  _store: store,
  get(k) { const e = store.get(String(k)); if (!e) return null; if (e.exp && Date.now() > e.exp) { store.delete(String(k)); return null; } return e.v; },
  put(k, v, ttl) { store.set(String(k), { v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 }); },
  remove(k) { store.delete(String(k)); }
};
c.CacheService = { getScriptCache: () => cache };
const props = new Map();
c.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props.get(k) || '', setProperty: (k, v) => props.set(k, String(v)),
  deleteProperty: k => props.delete(k)
}) };
c.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
  computeDigest: (alg, txt) => Array.from(crypto.createHash('sha256').update(String(txt)).digest()),
  getUuid: () => crypto.randomUUID(), formatDate: () => ''
};
c.Session = { getActiveUser: () => ({ getEmail: () => 'operador@ecicep.local' }) };
c.ContentService = { createTextOutput: t => ({ tipo: 'text', texto: t }) };
c.HtmlService = {
  createHtmlOutputFromFile: n => ({ getContent: () => '<!--' + n + '-->' }),
  createTemplateFromFile: n => { const t = { archivo: n }; t.evaluate = () => ({ tipo: 'html', vars: t, setTitle() { return this; }, addMetaTag() { return this; } }); return t; }
};

// Contexto configurable: "container-bound de Sheets" vs "web app".
const SHEET_ID = c.ECICEP.SPREADSHEET_ID;
const sheetState = { hasActive: true, id: SHEET_ID, uiOk: true };
c.SpreadsheetApp = {
  getActiveSpreadsheet: () => (sheetState.hasActive ? { getId: () => sheetState.id } : null),
  getUi: () => { if (!sheetState.uiOk) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return {}; },
  openById: () => { throw new Error('openById NO debe usarse para probar contexto Sheets'); }
};

const runtime = readFileSync(new URL('00_OperadorRuntime.html', src), 'utf8');
const ui = readFileSync(new URL('07_UI.js', src), 'utf8');
const auth = readFileSync(new URL('37_OperadorAuth.js', src), 'utf8');
const captura = readFileSync(new URL('CapturaWeb.html', src), 'utf8');
const clave = 'clave-operador-sheets-bootstrap-2026';
assert.equal(c.WebApp_operadorConfigurarClave_(clave).ok, true);

// Contrato server-side: usa getActiveSpreadsheet + getUi, JAMÁS openById.
const fnBootstrap = auth.slice(auth.indexOf('function WebApp_operadorSesionDesdeSheets_'));
assert.match(fnBootstrap, /getActiveSpreadsheet\(\)/, 'debe verificar el Spreadsheet activo');
assert.match(fnBootstrap, /SpreadsheetApp\.getUi\(\)/, 'debe exigir contexto de UI container-bound');
assert.doesNotMatch(fnBootstrap, /openById/, 'no puede confiar en openById para probar contexto');

// --- A. Contexto Sheets autorizado → OPSESS emitido y válido -----------------
{
  sheetState.hasActive = true; sheetState.id = SHEET_ID; sheetState.uiOk = true;
  const r = c.WebApp_operadorSesionDesdeSheets_();
  assert.equal(r.ok, true, 'A: el Sheets autorizado concede sesión');
  assert.match(r.sessionToken, /^OPS-[0-9a-f]{64}$/, 'A: token OPS-…');
  assert.equal(r.expiresIn, 21600, 'A: TTL 6 h');
  assert.equal(c.WebApp_operadorValidar_(r.sessionToken), true, 'A: la sesión vale');
  c.WebApp_operadorMapa_().api_buscar = () => ({ ok: true, eco: 7 });
  assert.equal(c.WebApp_operadorRpc(r.sessionToken, 'api_buscar', []).eco, 7, 'A: el gateway acepta la sesión');
}

// --- E. Render desde Sheets → el runtime lleva el bootstrap ------------------
{
  const html = c.include('00_OperadorRuntime');
  const m = html.match(/window\.ECICEP_OPSESS_BOOTSTRAP="(OPS-[0-9a-f]{64})";/);
  assert.ok(m, 'E: el runtime de Sheets inyecta el token como variable JS');
  assert.equal(c.WebApp_operadorValidar_(m[1]), true, 'E: el token inyectado es una sesión válida');
  assert.ok(html.includes('<!--00_OperadorRuntime-->'), 'E: sigue incluyendo el runtime real');
}

// --- B. Spreadsheet ID incorrecto → DENY ------------------------------------
{
  sheetState.id = 'ID_DE_OTRO_LIBRO';
  const r = c.WebApp_operadorSesionDesdeSheets_();
  assert.equal(r.ok, false, 'B: otro Spreadsheet no concede');
  assert.equal(r.codigo, 'SHEETS_OPERATOR_BOOTSTRAP_DENIED');
  sheetState.id = SHEET_ID;
}

// --- C. Sin getUi() (web app / script run) → DENY ---------------------------
{
  sheetState.uiOk = false;
  assert.equal(c.WebApp_operadorSesionDesdeSheets_().codigo, 'SHEETS_OPERATOR_BOOTSTRAP_DENIED', 'C: sin UI container-bound no hay sesión');
  sheetState.uiOk = true;
}

// --- D. Web App (sin Spreadsheet activo) → bootstrap vacío → login -----------
{
  sheetState.hasActive = false;
  assert.equal(c.WebApp_operadorSesionDesdeSheets_().codigo, 'SHEETS_OPERATOR_BOOTSTRAP_DENIED', 'D: doGet no concede');
  const html = c.include('00_OperadorRuntime');
  assert.ok(html.includes('window.ECICEP_OPSESS_BOOTSTRAP="";'), 'D: en Web App el bootstrap va vacío');
  assert.equal(c.WebApp_operadorRpc('', 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA', 'D: sin sesión → login');
  sheetState.hasActive = true;
}

// --- F. Token inválido / expirado → fallback login --------------------------
{
  assert.equal(c.WebApp_operadorValidar_('OPS-' + 'a'.repeat(64)), false, 'F: token desconocido inválido');
  assert.equal(c.WebApp_operadorValidar_('OPS-nohex'), false, 'F: token malformado inválido');
  const r = c.WebApp_operadorSesionDesdeSheets_();
  cache.remove('OPSESS:' + hex(r.sessionToken)); // simula expiración
  assert.equal(c.WebApp_operadorRpc(r.sessionToken, 'api_buscar', []).codigo, 'OPERADOR_SESION_REQUERIDA', 'F: sesión expirada → login');
  // El runtime sólo acepta OPS-<64hex> y limpia la variable tras consumirla.
  assert.match(runtime, /\/\^OPS-\[0-9a-f\]\{64\}\$\//, 'F: el runtime valida el formato del bootstrap');
  assert.match(runtime, /delete window\.ECICEP_OPSESS_BOOTSTRAP/, 'F: el runtime limpia el bootstrap tras consumirlo');
}

// --- G. Destructiva desde Sheets → nonce obligatorio ------------------------
{
  const ses = c.WebApp_operadorSesionDesdeSheets_();
  let ejec = 0;
  c.WebApp_operadorMapa_().api_configEliminar = () => { ejec += 1; return { ok: true }; };
  const prep = c.WebApp_operadorRpc(ses.sessionToken, 'api_configEliminar', ['CLAVE_X', 'legacy']);
  assert.equal(prep.codigo, 'OPERADOR_CONFIRMACION_REQUERIDA', 'G: destructiva exige nonce aun desde Sheets');
  assert.equal(ejec, 0, 'G: no se ejecuta sin nonce');
  assert.equal(c.WebApp_operadorRpc(ses.sessionToken, 'api_configEliminar', ['CLAVE_X', 'legacy'], prep.confirmacion.nonce).ok, true, 'G: con nonce ejecuta');
  assert.equal(ejec, 1);
  assert.equal(c.WebApp_operadorRpc(ses.sessionToken, 'api_configEliminar', ['CLAVE_X', 'legacy'], prep.confirmacion.nonce).codigo,
    'OPERADOR_CONFIRMACION_INVALIDA', 'G: replay rechazado');
}

// --- H. Superficie pública/temporal intacta ---------------------------------
{
  const archivos = readdirSync(src).filter(f => /\.(?:js|gs)$/.test(f));
  const publicas = [];
  let temp = 0;
  for (const f of archivos) {
    const s = readFileSync(new URL(f, src), 'utf8');
    for (const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
      if (!m[1].endsWith('_')) publicas.push(m[1]);
      if (/^ECICEP_(ACTIVAR_AHORA|EJECUTAR_WORKER_AHORA|DIAGNOSTICO_RELEASE_TEMPORAL)/.test(m[1])) temp++;
    }
  }
  assert.equal(typeof c.includeOperadorRuntime_, 'function', 'H: helper privado de template existe');
  assert.equal(c.includeOperadorRuntime, undefined, 'H: includeOperadorRuntime NO es global (termina en `_`)');
  assert.equal(publicas.includes('WebApp_operadorSesionDesdeSheets'), false, 'H: el bootstrap no es RPC pública');
  assert.equal(publicas.includes('WebApp_operadorEmitirSesion'), false, 'H: la emisión no es RPC pública');
  assert.equal(publicas.includes('includeOperadorRuntime'), false, 'H: el include con bootstrap no es público');
  assert.equal(temp, 0, 'H: TEMP_PUBLIC_RPC_COUNT debe ser 0');
  // El include genérico enruta el runtime por el bootstrap.
  assert.match(ui, /if \(nombre === '00_OperadorRuntime'\) return includeOperadorRuntime_\(\)/, 'H: include enruta el runtime');
  console.log('TEMP_PUBLIC_RPC_COUNT=' + temp);
}

// --- I. Captura pública intacta ---------------------------------------------
{
  assert.match(captura, /include\('00_OperadorRuntime'\)/, 'I: CapturaWeb conserva el include público');
  assert.doesNotMatch(captura, /OPSESS_BOOTSTRAP/, 'I: CapturaWeb no maneja bootstrap de operador');
  assert.doesNotMatch(captura, /WebApp_operador/, 'I: CapturaWeb no usa RPC de operador');
  const cap = c.doGet({ parameter: { vista: 'captura' } });
  assert.equal(cap.vars.archivo, 'CapturaWeb', 'I: se sirve la captura');
  assert.equal(cap.vars.MODO_OPERADOR, false, 'I: captura sin login');
  assert.equal(c.api_webappEstado('').ok, true, 'I: estado técnico público sigue anónimo');
}

console.log('operator_sheets_bootstrap_v0170: Sheets auto-OPSESS + Web App login + captura anónima PASS');
