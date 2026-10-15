import assert from 'node:assert/strict';
import { createHarness255, agregarFila } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
const now = Date.now();
assert.equal(h.c.Operacion_ventanaActivacionAbierta_(now).motivo, 'ACTIVATION_WINDOW_CLOSED');
h.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${now - 1}`);
assert.equal(h.c.Operacion_ventanaActivacionAbierta_(now).motivo, 'ACTIVATION_WINDOW_EXPIRED');
h.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${now + 3 * 3600 * 1000}`);
assert.equal(h.c.Operacion_ventanaActivacionAbierta_(now).motivo, 'ACTIVATION_WINDOW_TTL_EXCEEDED');
h.props.set('ECICEP_ACTIVATION_WINDOW', `OPEN:${now + 30 * 60 * 1000}`);
assert.equal(h.c.Operacion_ventanaActivacionAbierta_(now).abierta, true);

const h2 = createHarness255();
agregarFila(h2, { RESPONSE_ID: `Cp2-${'d'.repeat(32)}`, ESTADO: 'RECIBIDO' });
const blocked = h2.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(blocked.ok, false);
assert.equal(blocked.motivo, 'ACTIVATION_WINDOW_CLOSED');
assert.equal(blocked.cambios, 0);

const h3 = createHarness255();
h3.dataSheet.headers = h3.dataSheet.headers.filter(x => x !== 'TRANSPORTE_ERROR');
agregarFila(h3, { RESPONSE_ID: `Cp2-${'e'.repeat(32)}`, ESTADO: 'ERROR' });
const missing = h3.c.Form_migrarTrailerLegacy_({ dryRun: false });
assert.equal(missing.motivo, 'LEGACY_TRAILER_COLUMNS_REQUIRED');
assert.equal(missing.cambios, 0);
console.log('forms_activation_window_v259: PASS');
