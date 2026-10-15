// v255 (DEC-110) — La CAPTURA pública concede siempre, sin sesión, sin OPSESS,
// sin OAuth y sin permiso editor. Falla si alguna RPC de captura exige login.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const h = createHarness255();
h.install();

// Sin secret de operador configurado: la captura no debe depender de él.
assert.equal(h.props.get('ECICEP_OPERATOR_SECRET_SHA256') || '', '', 'no hay secret de operador');

// Recepción durable anónima, incluso con un `acceso` inexistente/ inválido.
for (const acceso of ['', 'TOKEN-INVALIDO', null, undefined, 'admin']) {
  const r = h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', String(acceso)), acceso);
  assert.equal(r.ok, true, 'captura anónima con acceso=' + acceso + ': ' + JSON.stringify(r));
  assert.equal(r.estado, 'RECIBIDO');
  assert.ok(r.data && r.data.responseId, 'la recepción devuelve responseId');
}
assert.ok(h.form.responses.length >= 5, 'todas las respuestas se encolaron');

// La verificación de ACK también es anónima (nunca responde sesión/credencial).
const verif = h.c.WebApp_verificarRecepcion('', '');
assert.equal(typeof verif.estado, 'string', 'WebApp_verificarRecepcion responde sin sesión: ' + JSON.stringify(verif));
assert.doesNotMatch(JSON.stringify(verif), /SESION|OPSESS|CREDENCIAL|ACCESO/i);

// Aunque Session explote (usuario no logueado), la captura sigue concediendo.
h.c.Session = { getActiveUser() { throw new Error('SIN_SESION'); } };
const sinSesion = h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', 'sin-sesion'), '');
assert.equal(sinSesion.ok, true, 'captura no depende de Session.getActiveUser()');

// CacheService no disponible: la captura pública no depende de la cache/sesión.
h.c.CacheService = { getScriptCache() { throw new Error('CACHE_DOWN'); } };
const sinCache = h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', 'sin-cache'), '');
assert.equal(sinCache.ok, true, 'captura pública concede aunque CacheService no esté disponible');

// El receptor no puede referenciar credenciales ni la hoja clínica.
const formas = readFileSync(new URL('../src/36_FormsCanal.js', import.meta.url), 'utf8');
const i = formas.indexOf('function WebApp_capturarRecibirDurable');
assert.doesNotMatch(formas.slice(i, i + 2600), /Session|getActiveUser|OPSESS|SpreadsheetApp|allowlist/,
  'el receptor no debe depender de credenciales ni de la hoja');
console.log('public_capture_unauthenticated_v255: captura pública anónima PASS');
