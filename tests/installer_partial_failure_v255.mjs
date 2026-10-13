// v255 (E15/E18/M10) — el instalador es FAIL-CLOSED: nunca ok:true degradado.
// Falla si un catálogo vacío o un trigger roto igual devuelve éxito.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

// 1) Catálogo de profesionales vacío → NO éxito.
const sinProf = createHarness255();
sinProf.install();
sinProf.c.Captura_v2_catalogo_ = () => [];
const r1 = sinProf.c.Form_operativoInstalar_({});
assert.equal(r1.ok, false, 'catálogo vacío no puede instalar OK');
assert.ok(['INSTALL_REQUIRED_CATALOG_EMPTY', 'INSTALL_CATALOG_FAILED'].includes(r1.motivo), r1.motivo);

// 2) Los dos triggers propios son gates fail-closed diferenciados.
const sinSubmit = createHarness255(); sinSubmit.install();
sinSubmit.c.Form_asegurarTriggers_ = () => ({ onFormSubmit: 0, worker: 1, creados: [] });
const r2a = sinSubmit.c.Form_operativoInstalar_({});
assert.equal(r2a.ok, false, 'sin submit trigger no puede instalar OK');
assert.equal(r2a.motivo, 'INSTALL_SUBMIT_TRIGGER_FAILED');

const sinTrigger = createHarness255(); sinTrigger.install();
sinTrigger.c.Form_asegurarTriggers_ = () => ({ onFormSubmit: 1, worker: 0, creados: [] });
const r2 = sinTrigger.c.Form_operativoInstalar_({});
assert.equal(r2.ok, false, 'sin worker trigger no puede instalar OK');
assert.equal(r2.motivo, 'INSTALL_WORKER_FAILED');

const ambos = createHarness255(); ambos.install();
ambos.c.Form_asegurarTriggers_ = () => ({ onFormSubmit: 1, worker: 1, creados: [] });
assert.equal(ambos.c.Form_operativoInstalar_({}).ok, true, 'ambos triggers permiten continuar');

// 3) Nunca borra respuestas reales al fallar.
assert.equal(sinTrigger.form.responses.length, 0);
console.log('installer_partial_failure_v255: PASS');
