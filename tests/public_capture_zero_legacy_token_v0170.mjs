// v270 (DEC-110) — La CAPTURA pública carga de forma anónima con CERO token
// legacy en el HTML servido, en el DOM, en la URL y en las llamadas de captura.
// Falla si reaparece `data-acceso`, `window.ECICEP_ACCESO`, `CAPTURA_ACCESO`,
// `TOKEN_ACCESO`, `TOKEN_INVITACION` o `ECICEP_ACCESS_TOKEN` en la captura, o si
// alguna RPC de captura vuelve a exigir/recibir la credencial.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';
import { crearContextoOperador } from './helpers/operador_vm.mjs';

const leerSrc = f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const captura = leerSrc('CapturaWeb.html');
const webapp = leerSrc('WebApp.gs');
const forms = leerSrc('36_FormsCanal.js');

// ── 1. HTML servido: ningún alias de credencial legacy en el DOM. ─────────────
for (const alias of ['data-acceso', 'CAPTURA_ACCESO', 'TOKEN_ACCESO', 'TOKEN_INVITACION',
  'window.ECICEP_ACCESO', 'ECICEP_ACCESS_TOKEN']) {
  assert.ok(!captura.includes(alias),
    'CapturaWeb.html NO debe contener ' + alias + ' (credencial legacy en la captura pública)');
}

// ── 2. URL: ningún parámetro de token/acceso en la captura. ───────────────────
assert.ok(!/[?&]acceso=/.test(captura), 'la captura no debe propagar ?acceso= en la URL');
assert.ok(!/[?&]token=/.test(captura), 'la captura no debe propagar ?token= en la URL');
assert.doesNotMatch(captura, /URL[^\n]*ECICEP_ACCESS_TOKEN/,
  'la captura no debe componer URLs con la credencial legacy');

// ── 3. Llamadas de captura: sin credencial. ──────────────────────────────────
assert.ok(captura.includes('.WebApp_estadoInicial()'), 'estadoInicial se invoca sin token');
assert.ok(captura.includes('.WebApp_verificarRecepcion(id)'), 'verificarRecepcion se invoca sin token');
assert.ok(captura.includes('.WebApp_capturarRecibirDurable(datos)'), 'capturarRecibirDurable se invoca sin token');
assert.ok(captura.includes('.api_webappEstado()'), 'api_webappEstado se invoca sin token');
assert.doesNotMatch(captura, /WebApp_\w+\([^)]*ECICEP_ACCESO/,
  'ninguna llamada de captura debe pasar ECICEP_ACCESO');

// ── 4. Servidor: WebApp.gs no inyecta la credencial en la captura. ─────────────
const servir = webapp.slice(webapp.indexOf('function WebApp_servirCaptura_'),
  webapp.indexOf('function WebApp_servirCaptura_') + 900);
for (const alias of ['CAPTURA_ACCESO', 'TOKEN_ACCESO', 'TOKEN_INVITACION']) {
  assert.ok(!servir.includes(alias), 'WebApp_servirCaptura_ no debe inyectar ' + alias);
}
assert.match(servir, /function WebApp_servirCaptura_\(\)\s*\{/,
  'WebApp_servirCaptura_ ya no recibe la credencial');

// doGet: la rama de captura NO resuelve la credencial legacy.
const doGet = webapp.slice(webapp.indexOf('function doGet('), webapp.indexOf('function WebApp_servirCaptura_'));
const iServir = doGet.indexOf('WebApp_servirCaptura_()');
const iClave = doGet.indexOf('WebApp_claveUniversal_()');
assert.ok(iServir !== -1, 'doGet sirve la captura');
assert.ok(iClave === -1 || iServir < iClave,
  'doGet no debe resolver la credencial legacy antes de servir la captura');

// ── 5. Firmas de servidor: sin parámetro de credencial. ──────────────────────
assert.match(forms, /function WebApp_verificarRecepcion\(clientRequestId\)\s*\{/,
  'WebApp_verificarRecepcion ya no recibe acceso');
assert.match(forms, /function WebApp_capturarRecibirDurable\(payload\)\s*\{/,
  'WebApp_capturarRecibirDurable ya no recibe acceso');

// ── 6. Runtime: doGet renderiza la captura SIN variables de token. ───────────
{
  const { c } = crearContextoOperador();
  const r = c.doGet({ parameter: {} });
  assert.equal(r.vars.MODO_OPERADOR, false, 'la captura se sirve en modo captura');
  for (const alias of ['CAPTURA_ACCESO', 'TOKEN_ACCESO', 'TOKEN_INVITACION']) {
    assert.equal(r.vars[alias], undefined, 'doGet no expone ' + alias + ' en la captura');
  }
  // La credencial universal tampoco se materializa sólo por abrir la captura.
  assert.equal(c.PropertiesService.getScriptProperties().getProperty('ECICEP_ACCESS_TOKEN'), '',
    'abrir la captura no debe crear la credencial legacy');
  // Las RPC de bootstrap de la captura ya no declaran el parámetro de credencial.
  assert.equal(c.WebApp_estadoInicial.length, 0, 'estadoInicial no recibe la credencial legacy');
  assert.equal(c.api_webappEstado.length, 0, 'api_webappEstado no recibe la credencial legacy');
}

// ── 7. Runtime: las RPC de captura funcionan sin token. ──────────────────────
const h = createHarness255();
h.install();
for (const acceso of ['', null, undefined, 'TOKEN-INVALIDO']) {
  const r = h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', String(acceso)), acceso);
  assert.equal(r.ok, true, 'captura anónima sin token (acceso=' + acceso + '): ' + JSON.stringify(r));
  assert.equal(r.estado, 'RECIBIDO');
}
const verif = h.c.WebApp_verificarRecepcion('');
assert.equal(typeof verif.estado, 'string', 'verificarRecepcion responde sin token: ' + JSON.stringify(verif));
assert.equal(h.c.WebApp_capturarRecibirDurable.length, 1, 'capturarRecibirDurable recibe 1 argumento');
assert.equal(h.c.WebApp_verificarRecepcion.length, 1, 'verificarRecepcion recibe 1 argumento');

console.log('public_capture_zero_legacy_token_v0170: captura anónima sin token legacy PASS');
