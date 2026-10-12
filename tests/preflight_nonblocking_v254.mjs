import assert from 'node:assert/strict';
import { createHarness, payloadFor } from './helpers/forms_v254_harness.mjs';

const h = createHarness(); h.install();
h.c.WebApp_previaDuplicadosV2 = () => { throw new Error('timeout preflight'); };
const result = h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso'));
assert.equal(result.ok, true); assert.equal(result.estado, 'RECIBIDO');
assert.equal(h.form.responses.length, 1); assert.equal(h.pipelineCalls.length, 0);
console.log('preflight_nonblocking_v254: PASS');
