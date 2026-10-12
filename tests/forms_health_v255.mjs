// v255 (M01) — salud operativa real: OK / DEGRADED / CRITICAL.
// Falla si se elimina Form_saludOperativa_ o si deja de considerar el trigger
// del worker, el backlog y la antigüedad del pendiente más viejo.
import assert from 'node:assert/strict';
import { createHarness255, captureIdDe } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

function conRespuesta(estado, fechaForms) {
  const h = createHarness255();
  h.install();
  const r = h.c.Form_crearRespuestaDesdePayloadWeb_(payloadFor('nuevoIngreso'));
  const cid = captureIdDe(h, r.responseId);
  h.dataSheet.rows.push(h.dataSheet.headers.map(k => k === 'RESPONSE_ID' ? cid : (k === 'ESTADO' ? estado : (k === 'FECHA_FORMS' ? fechaForms : ''))));
  return h;
}

// OK — instalado, sin pendientes.
const ok = createHarness255();
ok.install();
const sOk = ok.c.Form_saludOperativa_();
assert.equal(sOk.estado, 'OK', 'canal sano');
assert.equal(sOk.alertas.length, 0);

// CRITICAL — falta el trigger del worker.
const sinWorker = ok;
sinWorker.triggers.splice(0, sinWorker.triggers.length, ...sinWorker.triggers.filter(t => t.handler !== 'Form_worker'));
const sCrit = sinWorker.c.Form_saludOperativa_();
assert.equal(sCrit.estado, 'CRITICAL');
assert.ok(sCrit.alertas.includes('WORKER_TRIGGER_AUSENTE'));

// DEGRADED — hay backlog pendiente (fila sin clasificación terminal).
const hb = conRespuesta('RECIBIDO', new Date().toISOString());
const sBack = hb.c.Form_saludOperativa_();
assert.equal(sBack.estado, 'DEGRADED');
assert.ok(sBack.alertas.includes('BACKLOG_PENDIENTE'));

// DEGRADED — pendiente más viejo que el umbral (180 min).
const old = conRespuesta('RECIBIDO', new Date(Date.now() - 4 * 3600 * 1000).toISOString());
const sOld = old.c.Form_saludOperativa_();
assert.equal(sOld.estado, 'DEGRADED');
assert.ok(sOld.alertas.includes('OLDEST_PENDING_EXCEDIDO'));
assert.ok(sOld.backlog.oldestPendingMin >= 180);

// Sin PII en el resultado de salud.
assert.doesNotMatch(JSON.stringify(sOld), /RUT|NOMBRE|12345678|PERSONA/);
console.log('forms_health_v255: PASS');
