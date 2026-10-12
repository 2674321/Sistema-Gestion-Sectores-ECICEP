// v255 (E05/E06) — dedupe del transporte por CLIENT_REQUEST_ID.
// Falla si se elimina la reserva/confirmación del identificador en el receptor.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const CID = 'CR-' + 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const CID2 = 'CR-' + 'f0e1d2c3b4a5968778695a4b3c2d1e0f';

function payload(cid, i = 0) {
  return Object.assign({}, payloadFor('nuevoIngreso', i), { clientRequestId: cid });
}

const h = createHarness255();
h.install();

const first = h.c.WebApp_capturarRecibirDurable(payload(CID), 'anon');
assert.equal(first.ok, true, 'primer envío ok');
assert.equal(first.data.responseId, 'resp-0001');
assert.equal(h.form.responses.length, 1, 'una sola respuesta durable');

const second = h.c.WebApp_capturarRecibirDurable(payload(CID), 'anon');
assert.equal(second.ok, true, 'reenvío responde ok');
assert.equal(second.data.yaRecibido, true, 'reenvío detectado como ya recibido');
assert.equal(h.form.responses.length, 1, 'el reenvío no crea otra respuesta (dedupe)');

const third = h.c.WebApp_capturarRecibirDurable(payload(CID2, 1), 'anon');
assert.equal(third.ok, true);
assert.equal(h.form.responses.length, 2, 'otro clientRequestId sí crea respuesta');

const idx = h.c.Form_indexarSchema_(h.form);
const tr = h.c.Form_extraerTransporte_(h.form.responses[0], idx);
assert.equal(tr.clientRequestId, CID, 'CLIENT_REQUEST_ID viaja en el transporte');
assert.equal(tr.source, 'WEBAPP', 'SOURCE=WEBAPP por defecto');

const invalido = h.c.WebApp_capturarRecibirDurable(
  Object.assign({}, payloadFor('nuevoIngreso', 9), { clientRequestId: 'CR-corto' }));
assert.equal(invalido.ok, false, 'formato de clientRequestId inválido se rechaza');
assert.ok((invalido.errores || []).some(e => e.codigo === 'CLIENT_REQUEST_ID_INVALIDO'));

console.log('client_request_id_v255: PASS');
