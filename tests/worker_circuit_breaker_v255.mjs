// v255 (M03) — circuit breaker por errores SISTÉMICOS consecutivos (N=3).
// Falla si el circuito se abre con error no sistémico, o si no corta tras 3.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
h.install();

// Error NO sistémico: nunca abre el circuito.
for (let i = 0; i < 5; i++) {
  const r = h.c.Form_circuitoSistémico_('ERROR_CLINICO_LOCAL', Date.now(), 'x');
  assert.notEqual(r.motivo, 'CIRCUIT_OPEN', 'error no sistémico no abre circuito');
  assert.notEqual(r.circuit && r.circuit.abierto, true);
}

// Error sistémico consecutivo: abre exactamente en el 3.º intento.
const s1 = h.c.Form_circuitoSistémico_('FORM_NO_ACCESIBLE', Date.now(), 'x');
const s2 = h.c.Form_circuitoSistémico_('FORM_NO_ACCESIBLE', Date.now(), 'x');
const s3 = h.c.Form_circuitoSistémico_('FORM_NO_ACCESIBLE', Date.now(), 'x');
assert.notEqual(s1.motivo, 'CIRCUIT_OPEN');
assert.notEqual(s2.motivo, 'CIRCUIT_OPEN');
assert.equal(s3.motivo, 'CIRCUIT_OPEN', '3 systemicos consecutivos abren el circuito');
assert.equal(s3.circuit.abierto, true);
assert.equal(s3.procesadas, 0);

// El worker conserva la cola al abrir el circuito (no borra respuestas).
const h2 = createHarness255();
h2.install();
h2.c.Form_crearRespuestaDesdePayloadWeb_({ accion: 'nuevoIngreso', rut: '12.345.678-5', nombre: 'X Y',
  fechaNacimiento: '1980-01-02', sector: 'AMARILLO', fechaIngreso: '2026-10-12', profesional: 'PROFESIONAL UNO' });
const originalOpen = h2.c.FormApp.openById;
h2.c.FormApp = Object.assign({}, h2.c.FormApp, { openById() { throw new Error('FORM_NO_ACCESIBLE'); } });
h2.c.Form_worker_(); h2.c.Form_worker_();
const abierto = h2.c.Form_worker_();
assert.equal(abierto.motivo, 'CIRCUIT_OPEN');
assert.equal(h2.form.responses.length, 1, 'la cola durable se conserva');

// Un éxito resetea el contador de consecutivos.
h2.c.FormApp = Object.assign({}, h2.c.FormApp, { openById: originalOpen });
const ok = h2.c.Form_worker_();
assert.equal(ok.ok, true);
assert.equal(h2.c.Form_propLeer_('GOOGLE_FORM_CIRCUIT_CONSECUTIVOS'), '0', 'éxito resetea el circuito');
console.log('worker_circuit_breaker_v255: PASS');
