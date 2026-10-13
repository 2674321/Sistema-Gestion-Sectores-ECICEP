// v255 (E08/E13/M03) — backend caído: la cola durable conserva la respuesta y
// el siguiente intento la recupera. Falla si el worker descarta o marca terminal
// una respuesta ante un fallo temporal del pipeline.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const h = createHarness255();
h.install();
const r = h.c.Form_crearRespuestaDesdePayloadWeb_(payloadFor('nuevoIngreso'));
assert.equal(r.ok, true);
const resp = h.form.responses[0];
const cid = h.c.CapturaIngress_captureId_(h.form.id, resp.id);
h.dataSheet.rows.push(h.dataSheet.headers.map(k => k === 'RESPONSE_ID' ? cid :
  k === 'CAPTURE_PROVIDER' ? 'GOOGLE_FORMS' : k === 'TRANSPORT_RESPONSE_ID' ? r.responseId :
  k === 'ESTADO' ? 'RECIBIDO' : ''));

// Backend caído: la primera pasada falla de forma retryable.
let fallos = 0;
h.setPipelineBehavior((p, done) => {
  if (fallos++ === 0) return { ok: false, errors: [{ codigo: 'SERVICE_TEMPORARY' }] };
  if (done.has(p.captureId)) return { ok: true, data: { estado: 'DUPLICADO' } };
  done.add(p.captureId); return { ok: true, data: { estado: 'PROCESADO' } };
});

const down = h.c.Form_worker_();
assert.equal(down.procesadas, 0, 'backend caído no procesa');
assert.equal(down.retryable, 1, 'la respuesta queda retryable');
assert.equal(h.form.responses.length, 1, 'la cola durable conserva la respuesta');

// La fila queda marcada RETRYABLE en el trailer (no se pierde ni se borra).
const colCls = h.colIndex('CLASIFICACION');
assert.equal(h.dataSheet.rows[0][colCls], 'RETRYABLE', 'trailer marca RETRYABLE');
assert.equal(h.dataSheet.rows.length, 1, 'nunca se borra la fila de cola');

// Siguiente corrida: el backend está arriba → se procesa.
const up = h.c.Form_worker_();
assert.equal(up.procesadas, 1, 'al volver el backend se procesa');
assert.equal(h.processed.size, 1);
assert.equal(h.dataSheet.rows[0][colCls], 'TERMINAL', 'trailer marca TERMINAL');

// Form no accesible → circuito sistémico, cola conservada.
const h2 = createHarness255();
h2.install();
h2.c.FormApp = Object.assign({}, h2.c.FormApp, { openById() { throw new Error('FORM_NO_ACCESIBLE'); } });
const abierto = [false, false, false].map(() => h2.c.Form_worker_());
assert.equal(abierto[2].motivo, 'CIRCUIT_OPEN', '3 fallos sistémicos abren el circuito');
console.log('backend_down_durable_queue_v255: PASS');
