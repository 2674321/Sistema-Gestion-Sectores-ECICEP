import assert from 'node:assert/strict';
import { createHarness255, agregarFila } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
const estados = ['PROCESADO', 'REQUIERE_REVISION', 'RECIBIDO', 'ERROR'];
estados.forEach((estado, i) => agregarFila(h, {
  RESPONSE_ID: `Cp${i === 0 ? 2 : 4}-${String(i + 1).repeat(32)}`,
  ESTADO: estado, RUT: `SINTETICO-${i}`, NOMBRE: `FIXTURE-${i}`, MOTIVO: `M-${i}`
}));
const antes = h.dataSheet.rows.map(r => r.slice());
const dry = h.c.Form_migrarTrailerLegacy_();
assert.equal(dry.dryRun, true);
assert.equal(dry.legacyDetectadas, 4);
assert.deepEqual(h.dataSheet.rows, antes, 'dry-run 0 mutaciones');

h.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${Date.now() + 30 * 60 * 1000}`);
const apply = h.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(apply.ok, true);
assert.equal(apply.terminal, 1);
assert.equal(apply.review, 3);
const cls = h.dataSheet.rows.map(r => r[h.colIndex('CLASIFICACION')]);
assert.deepEqual(cls, ['TERMINAL', 'REVIEW', 'REVIEW', 'REVIEW']);
for (let i = 0; i < estados.length; i++) {
  for (const k of ['ESTADO', 'RUT', 'NOMBRE', 'MOTIVO']) assert.equal(h.dataSheet.rows[i][h.colIndex(k)], antes[i][h.colIndex(k)], `${k} preservado`);
  assert.equal(h.dataSheet.rows[i][h.colIndex('CAPTURE_PROVIDER')], 'WEBAPP_LEGACY');
  assert.equal(h.dataSheet.rows[i][h.colIndex('SOURCE')], 'LEGACY_PRE_FORMS');
}
assert.match(h.dataSheet.rows[2][h.colIndex('TRANSPORTE_ERROR')], /LEGACY_RECONCILIATION_REQUIRED/);
assert.doesNotMatch(h.dataSheet.rows[2][h.colIndex('TRANSPORTE_ERROR')], /SINTETICO|FIXTURE/);
const again = h.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(again.cambios, 0, 'segunda corrida idempotente');

const rec = h.c.Form_legacyReconciliarDryRun_({ eventoExiste: () => false, ingresoReferenciaExiste: () => false });
assert.equal(rec.dryRun, true);
assert.equal(rec.totalNoTerminal, 3);
assert.equal(rec.IDENTITY_INSUFFICIENT, 3);
console.log('forms_legacy_migration_v259: PASS');
