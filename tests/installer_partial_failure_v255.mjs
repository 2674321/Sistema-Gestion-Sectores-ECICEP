// v255 (E15/E18/M10) — el instalador es FAIL-CLOSED: nunca ok:true degradado.
// Falla si un catálogo vacío o un trigger roto igual devuelve éxito.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

// 1) Catálogo de profesionales vacío → NO éxito.
const sinProf = createHarness255();
sinProf.install();
sinProf.c.Captura_v2_catalogo = () => [];
const r1 = sinProf.c.Form_operativoInstalar({});
assert.equal(r1.ok, false, 'catálogo vacío no puede instalar OK');
assert.ok(['INSTALL_REQUIRED_CATALOG_EMPTY', 'INSTALL_CATALOG_FAILED'].includes(r1.motivo), r1.motivo);

// 2) Trigger del worker imposible de crear → NO éxito.
const sinTrigger = createHarness255();
sinTrigger.install();
sinTrigger.triggers.splice(0, sinTrigger.triggers.length);
const newTrigger = sinTrigger.c.ScriptApp.newTrigger;
sinTrigger.c.ScriptApp.newTrigger = () => { throw new Error('TRIGGER_DENIED'); };
const r2 = sinTrigger.c.Form_operativoInstalar({});
assert.equal(r2.ok, false, 'sin worker trigger no puede instalar OK');
assert.equal(r2.motivo, 'INSTALL_WORKER_FAILED');
sinTrigger.c.ScriptApp.newTrigger = newTrigger;

// 3) Nunca borra respuestas reales al fallar.
assert.equal(sinTrigger.form.responses.length, 0);
console.log('installer_partial_failure_v255: PASS');
