// v255 (M06/E14) — panel de operación y estado: SOLO agregados, CERO PII.
// Falla si el panel filtra RUT/nombre/teléfonos o si el worker manual salta el lock.
import assert from 'node:assert/strict';
import { createHarness255, agregarFila, captureIdDe } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const h = createHarness255();
h.install();

// Cola con datos clínicos que NUNCA deben aparecer agregados.
const r = h.c.Form_crearRespuestaDesdePayloadWeb_(Object.assign(payloadFor('nuevoIngreso'), {
  rut: '12.345.678-5', nombre: 'PERSONA SECRETA', telefonos: '988888888'
}));
agregarFila(h, { RESPONSE_ID: captureIdDe(h, r.responseId), ESTADO: 'RECIBIDO', FECHA_FORMS: new Date().toISOString() });

const panel = h.c.Form_panelOperacion_();
const dump = JSON.stringify(panel);
assert.doesNotMatch(dump, /SECRETA|12345678|988888888|PERSONA/);
assert.ok(typeof panel.health === 'string');
assert.ok(typeof panel.worker.triggerWorkerCount === 'number');
assert.ok(Number.isInteger(panel.recepciones));
assert.ok(panel.backlog && typeof panel.backlog.retryable === 'number');

const estado = h.c.Form_operativoEstado();
assert.doesNotMatch(JSON.stringify(estado), /SECRETA|12345678|988888888|PERSONA/);
assert.equal(estado.ok, true);
assert.equal(estado.schemaVersion, h.c.GOOGLE_FORMS_CONFIG.SCHEMA_VERSION);

// El worker manual desde admin delega (no hace bypass): procesa la cola real.
const ahora = h.c.api_formWorkerEjecutarAhora();
assert.equal(ahora.ok, true);
assert.equal(ahora.procesadas, 1, 'api_formWorkerEjecutarAhora reusa Form_worker');
console.log('forms_admin_no_pii_v255: PASS');
