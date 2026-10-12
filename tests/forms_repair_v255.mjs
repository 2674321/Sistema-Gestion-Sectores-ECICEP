// v255 (M04) — reparación dry-run por defecto; con dryRun:false crea el worker
// sin borrar respuestas. Falla si el reparador borra respuestas o no es dry-run.
import assert from 'node:assert/strict';
import { createHarness255, captureIdDe, agregarFila } from './helpers/forms_v255_harness.mjs';
import { payloadFor } from './helpers/forms_v254_harness.mjs';

const h = createHarness255();
h.install();
const r = h.c.Form_crearRespuestaDesdePayloadWeb_(payloadFor('nuevoIngreso'));
agregarFila(h, { RESPONSE_ID: captureIdDe(h, r.responseId), ESTADO: 'RECIBIDO' });
assert.equal(h.form.responses.length, 1);

// Quitamos el trigger del worker para simular canal roto.
h.triggers.splice(0, h.triggers.length, ...h.triggers.filter(t => t.handler !== 'Form_worker_'));

// dry-run por defecto: reporta que hace falta, NO crea triggers.
const dry = h.c.Form_operativoReparar_();
assert.equal(dry.ok, true);
assert.equal(dry.dryRun, true);
assert.ok(dry.acciones.some(a => a.accion === 'trigger_worker' && a.estado === 'necesita_creacion'));
assert.equal(h.triggers.filter(t => t.handler === 'Form_worker_').length, 0, 'dry-run no crea triggers');

// reparación real: crea el worker y JAMÁS borra respuestas.
const real = h.c.Form_operativoReparar_({ dryRun: false });
assert.equal(real.dryRun, false);
assert.ok(real.acciones.some(a => a.accion === 'trigger_worker' && a.estado === 'creado'));
assert.equal(h.triggers.filter(t => t.handler === 'Form_worker_').length, 1);
assert.equal(h.form.responses.length, 1, 'la reparación nunca borra respuestas');
assert.equal(h.dataSheet.rows.length, 1, 'la reparación nunca borra filas de cola');
console.log('forms_repair_v255: PASS');
