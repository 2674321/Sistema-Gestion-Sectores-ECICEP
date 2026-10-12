// v255 (E19/E20) — drift de schema en el receptor: si un campo aceptado no
// puede materializarse en ItemResponse, NO se envía nada (fail-closed).
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

// 1) Falta un campo requerido (sin NOMBRE) → drift y NO submit.
const faltaReq = createHarness255();
faltaReq.install();
const r1 = faltaReq.c.Form_crearRespuestaDesdePayloadWeb_({ accion: 'nuevoIngreso', rut: '12.345.678-5',
  sector: 'AMARILLO', fechaIngreso: '2026-10-12', profesional: 'PROFESIONAL UNO' });
assert.equal(r1.ok, false);
assert.equal(r1.motivo, 'FORM_SCHEMA_DRIFT');
assert.ok(r1.failedAcceptedFields.includes('NUEVO_INGRESO|NOMBRE'));
assert.equal(faltaReq.form.responses.length, 0, 'nada se envía si hay drift');

// 2) El item requerido no existe en el Form → drift aunque el payload lo traiga.
const drift = createHarness255();
faltaReq.install();
faltaReq.install();
const cm = JSON.parse(faltaReq.props.get('GOOGLE_FORM_CANONICAL_ITEM_MAP'));
const nombreId = cm['NUEVO_INGRESO|NOMBRE'];
faltaReq.form.items = faltaReq.form.items.filter(it => it.getId() !== nombreId);
const r2 = faltaReq.c.Form_crearRespuestaDesdePayloadWeb_(payloadFor('nuevoIngreso'));
assert.equal(r2.ok, false);
assert.equal(r1.ok, false);
assert.equal(r2.motivo, 'FORM_SCHEMA_DRIFT');
assert.ok(r2.failedAcceptedFields.includes('NUEVO_INGRESO|NOMBRE'));
assert.equal(faltaReq.form.responses.length, 0, 'nunca se envía una respuesta incompleta');
console.log('forms_schema_drift_receiver_v255: PASS');
