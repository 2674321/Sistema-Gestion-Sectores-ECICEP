// v255 (E08) — el worker no se queda pegado en los primeros 10: cuenta
// ELEGIBLES (no crudas) y salta lo ya clasificado en el trailer SIN depender de
// opciones.yaProcesado. 25 respuestas, max 10 ⇒ 10/10/5/0.
import assert from 'node:assert/strict';
import { createHarness255, captureIdDe, agregarFila } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const N = 25;
const h = createHarness255();
h.install();
for (let i = 0; i < N; i++) {
  const r = h.c.Form_crearRespuestaDesdePayloadWeb_(payloadFor('nuevoIngreso', i));
  assert.equal(r.ok, true);
}
// La cola en producción ya tiene fila por respuesta (el pipeline persiste el
// registro). La clasificación la escribe el worker en el trailer.
for (const resp of h.form.responses) {
  const cid = h.c.CapturaIngress_captureId_(h.form.id, resp.id);
  h.dataSheet.rows.push(h.dataSheet.headers.map(k => k === 'RESPONSE_ID' ? cid : (k === 'ESTADO' ? 'RECIBIDO' : '')));
}
assert.equal(h.dataSheet.rows.length, N);

const w1 = h.c.Form_worker_();            // SIN yaProcesado (producción)
assert.equal(w1.procesadas, 10, 'run1 procesa 10');
const w2 = h.c.Form_worker_();
assert.equal(w2.procesadas, 10, 'run2 procesa 10');
const w3 = h.c.Form_worker_();
assert.equal(w3.procesadas, 5, 'run3 procesa 5');
const w4 = h.c.Form_worker_();
assert.equal(w4.procesadas, 0, 'run4 no reprocesa (starvation resuelto)');
assert.equal(h.processed.size, 25, 'las 25 respuestas procesadas exactamente una vez');

// El backlog real refleja el estado del trailer (una sola lectura), no counters.
const backlog = h.c.Form_backlogResumen_();
assert.equal(backlog.terminal + backlog.processed, 25);
assert.equal(backlog.retryable, 0);
console.log('worker_production_backlog_v255: PASS');
