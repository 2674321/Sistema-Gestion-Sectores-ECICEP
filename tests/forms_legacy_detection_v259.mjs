import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

const c = createHarness255().c;
const cp2 = 'Cp2-' + 'a'.repeat(32);
const cp4 = 'Cp4-' + 'b'.repeat(32);
assert.equal(c.Form_esFilaLegacy_({ RESPONSE_ID: cp2 }), true);
assert.equal(c.Form_esFilaLegacy_({ RESPONSE_ID: cp4 }), true);
assert.equal(c.Form_esFilaLegacy_({ RESPONSE_ID: cp4, CAPTURE_PROVIDER: 'GOOGLE_FORMS', TRANSPORT_RESPONSE_ID: 'native-1' }), false);
assert.equal(c.Form_esFilaLegacy_({ RESPONSE_ID: 'Cp4-raro' }), false);
assert.equal(c.Form_planMigracionLegacy_({ RESPONSE_ID: 'Cp4-raro' }).ambiguo, true);
console.log('forms_legacy_detection_v259: PASS');
