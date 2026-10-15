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

// Parciales preexistentes: provider-only y source/clasificación incompletos.
const hp = createHarness255();
agregarFila(hp, { RESPONSE_ID: `Cp4-${'a'.repeat(32)}`, ESTADO: 'RECIBIDO', CAPTURE_PROVIDER: 'WEBAPP_LEGACY' });
agregarFila(hp, { RESPONSE_ID: `Cp3-${'b'.repeat(32)}`, ESTADO: 'ERROR', CAPTURE_PROVIDER: 'WEBAPP_LEGACY', SOURCE: 'LEGACY_PRE_FORMS' });
const pd = hp.c.Form_migrarTrailerLegacy_();
assert.equal(pd.legacyDetectadas, 2);
assert.equal(pd.legacyParciales, 2);
assert.equal(pd.legacyCompletas, 0);
assert.equal(pd.cambios, 0, 'dry-run parcial no escribe');
hp.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${Date.now() + 30 * 60 * 1000}`);
const pa = hp.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(pa.ok, true); assert.equal(pa.filasAplicadas, 2);
for (let i = 0; i < 2; i++) {
  const obj = hp.c.Form_filaPorMapa_(hp.dataSheet.headers, hp.dataSheet.rows[i]);
  assert.equal(hp.c.Form_legacyTrailerCompleto_(obj, hp.c.Form_planTrailerLegacyPorEstado_(obj.ESTADO)), true);
}
assert.equal(hp.c.Form_migrarTrailerLegacy_({ dryRun: false }).cambios, 0);

function interceptarFalloParcial(hh, fallaEnSetValues) {
  const original = hh.dataSheet.getRange.bind(hh.dataSheet);
  let llamadas = 0;
  hh.dataSheet.getRange = function(row, col, nrows, ncols) {
    const range = original(row, col, nrows, ncols);
    if (row > 1 && ncols === 6) {
      const real = range.setValues;
      range.setValues = values => {
        llamadas++;
        if (llamadas === fallaEnSetValues) {
          original(row, col, 1, 1).setValue('WEBAPP_LEGACY');
          throw new Error('INTERRUPCION_SINTETICA');
        }
        return real(values);
      };
    }
    return range;
  };
  return () => { hh.dataSheet.getRange = original; };
}

// Interrupción dentro de una fila: provider queda durable y la siguiente corrida converge.
const hi = createHarness255();
agregarFila(hi, { RESPONSE_ID: `Cp2-${'c'.repeat(32)}`, ESTADO: 'RECIBIDO', RUT: 'SINTETICO-I', NOMBRE: 'FIXTURE-I' });
const historicaI = hi.dataSheet.rows[0].slice();
hi.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${Date.now() + 30 * 60 * 1000}`);
const restaurarI = interceptarFalloParcial(hi, 1);
const falloI = hi.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(falloI.ok, false); assert.equal(falloI.motivo, 'LEGACY_TRAILER_WRITE_VERIFY_FAILED');
restaurarI();
assert.equal(hi.c.Form_migrarTrailerLegacy_().legacyParciales, 1, 'provider-only se redetecta');
assert.equal(hi.c.Form_migrarTrailerLegacy_({ dryRun: false }).ok, true);
assert.equal(hi.c.Form_migrarTrailerLegacy_({ dryRun: false }).cambios, 0, 'tercera corrida converge');
for (const k of ['ESTADO', 'RUT', 'NOMBRE']) assert.equal(hi.dataSheet.rows[0][hi.colIndex(k)], historicaI[hi.colIndex(k)]);

// Interrupción entre filas: progreso seguro se conserva y las tres convergen.
const hb = createHarness255();
for (let i = 0; i < 3; i++) agregarFila(hb, { RESPONSE_ID: `Cp4-${String(i + 6).repeat(32)}`, ESTADO: i ? 'ERROR' : 'PROCESADO', NOMBRE: `FIXTURE-B-${i}` });
const historicasB = hb.dataSheet.rows.map(r => r.slice());
hb.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${Date.now() + 30 * 60 * 1000}`);
const restaurarB = interceptarFalloParcial(hb, 2);
const falloB = hb.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(falloB.ok, false); assert.equal(falloB.filasAplicadas, 1);
restaurarB();
const rerunB = hb.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(rerunB.ok, true); assert.equal(rerunB.filasAplicadas, 2);
assert.equal(hb.c.Form_migrarTrailerLegacy_({ dryRun: false }).cambios, 0);
for (let i = 0; i < 3; i++) {
  assert.equal(hb.dataSheet.rows[i][hb.colIndex('NOMBRE')], historicasB[i][hb.colIndex('NOMBRE')]);
  const obj = hb.c.Form_filaPorMapa_(hb.dataSheet.headers, hb.dataSheet.rows[i]);
  assert.equal(hb.c.Form_legacyTrailerCompleto_(obj), true, `fila ${i + 1} completa`);
}

// Layout no contiguo: fail-closed y cero escrituras.
const hl = createHarness255();
const sourceIx = hl.dataSheet.headers.indexOf('SOURCE');
hl.dataSheet.headers.splice(sourceIx, 1); hl.dataSheet.headers.push('SOURCE');
agregarFila(hl, { RESPONSE_ID: `Cp2-${'f'.repeat(32)}`, ESTADO: 'RECIBIDO' });
hl.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${Date.now() + 30 * 60 * 1000}`);
const unsafe = hl.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(unsafe.motivo, 'LEGACY_TRAILER_LAYOUT_UNSAFE'); assert.equal(unsafe.cambios, 0);
console.log('forms_legacy_migration_v259: PASS');
