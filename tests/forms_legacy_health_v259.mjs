import assert from 'node:assert/strict';
import { createHarness255, agregarFila } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
h.install();
for (let i = 0; i < 126; i++) agregarFila(h, {
  RESPONSE_ID: `Cp2-${i.toString(16).padStart(32, '0')}`,
  ESTADO: i < 83 ? 'PROCESADO' : (i < 101 ? 'REQUIERE_REVISION' : (i < 117 ? 'RECIBIDO' : 'ERROR')),
  FECHA_FORMS: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
});
agregarFila(h, { RESPONSE_ID: `Cp4-${'e'.repeat(32)}`, ESTADO: 'RECIBIDO',
  CAPTURE_PROVIDER: 'WEBAPP_LEGACY', SOURCE: '' });
const b = h.c.Form_backlogResumen_();
assert.equal(b.retryable, 0);
assert.equal(b.review, 0);
assert.equal(b.oldestPendingMin, 0);
assert.deepEqual(JSON.parse(JSON.stringify(b.legacy)), { total: 127, terminal: 83, review: 44, unresolved: 26 });
const s = h.c.Form_saludOperativa_();
assert.equal(s.estado, 'OK', 'deuda legacy no degrada canal actual sano');
assert.deepEqual(JSON.parse(JSON.stringify(s.advertenciasHistoricas)), ['LEGACY_RECONCILIATION_PENDING']);
assert.ok(!s.alertas.includes('BACKLOG_PENDIENTE'));
console.log('forms_legacy_health_v259: PASS');
