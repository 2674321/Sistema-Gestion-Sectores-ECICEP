// v255 (E07) — recuperación de ACK perdido por escaneo acotado.
// Falla si se elimina WebApp_verificarRecepcion o el escaneo de respuestas
// recientes que repuebla el cache.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const CID = 'CR-' + '11223344556677889900aabbccddeeff';

const h = createHarness255();
h.install();
const r = h.c.Form_crearRespuestaDesdePayloadWeb_(Object.assign({}, payloadFor('nuevoIngreso'), { clientRequestId: CID }));
assert.equal(r.ok, true);
const responseId = r.responseId;

// Simula ACK perdido: la respuesta existe pero el índice desapareció.
h.cache.remove('FORM_REQ:' + CID);
assert.equal(h.cache.get('FORM_REQ:' + CID), null, 'cache limpio');

const ver = h.c.WebApp_verificarRecepcion(CID);
assert.equal(ver.ok, true);
assert.equal(ver.estado, 'RECIBIDO', 'ACK recuperado por escaneo');
assert.equal(ver.responseId, responseId);
assert.equal(h.cache.get('FORM_REQ:' + CID), 'RECEIVED:' + responseId, 'cache repoblado');

// Sin coincidencia → NO_ENCONTRADO (sin PII).
const otro = 'CR-' + 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sinMatch = h.c.WebApp_verificarRecepcion(otro);
assert.equal(sinMatch.estado, 'NO_ENCONTRADO');

// Formato inválido → NO_ENCONTRADO sin tocar el Form.
const invalido = h.c.WebApp_verificarRecepcion('no-es-un-id');
assert.equal(invalido.ok, false);
assert.equal(invalido.estado, 'NO_ENCONTRADO');

// Toda salida es libre de PII clínica.
for (const out of [ver, sinMatch, invalido]) {
  assert.doesNotMatch(JSON.stringify(out), /RUT|NOMBRE|12345678|PERSONA/);
}
console.log('ack_lost_v255: PASS');
