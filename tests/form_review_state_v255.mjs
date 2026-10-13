// v255 (E13/E14) — una respuesta con fallo de adaptador queda en REVIEW, se
// escribe en el trailer y NO se reprocesa en la siguiente corrida.
import assert from 'node:assert/strict';
import { createHarness255, agregarFila, captureIdDe } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const h = createHarness255();
h.install();
const r = h.c.Form_crearRespuestaDesdePayloadWeb_(payloadFor('nuevoIngreso'));
agregarFila(h, { RESPONSE_ID: captureIdDe(h, r.responseId), CAPTURE_PROVIDER: 'GOOGLE_FORMS',
  TRANSPORT_RESPONSE_ID: r.responseId, ESTADO: 'RECIBIDO', FECHA_FORMS: new Date().toISOString() });

// Falla del adaptador (no sistémica): la respuesta debe ir a REVIEW.
const adaptador = h.c.CapturaIngress_adapterForms_;
h.c.CapturaIngress_adapterForms_ = () => ({ ok: false, errores: [{ codigo: 'ADAPTER_INVALID' }] });
const w1 = h.c.Form_worker_();
assert.equal(w1.review, 1, 'fallo de adaptador → REVIEW');
assert.equal(w1.retryable, 0);
assert.equal(w1.procesadas, 0);
assert.equal(h.dataSheet.rows[0][h.colIndex('CLASIFICACION')], 'REVIEW', 'trailer marca REVIEW');
assert.match(h.dataSheet.rows[0][h.colIndex('TRANSPORTE_ERROR')], /ADAPTER_INVALID/);
assert.equal(h.c.Form_backlogResumen_().review, 1);

// El estado REVIEW persiste: la siguiente corrida no lo reprocesa.
h.c.CapturaIngress_adapterForms_ = adaptador;
const w2 = h.c.Form_worker_();
assert.equal(w2.procesadas, 0, 'REVIEW no se reprocesa');
assert.equal(w2.elegibles, 0, 'REVIEW no es candidato');
assert.equal(w2.review, 0);
assert.equal(h.dataSheet.rows[0][h.colIndex('CLASIFICACION')], 'REVIEW');
assert.equal(h.form.responses.length, 1);
console.log('form_review_state_v255: PASS');
