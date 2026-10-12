import assert from 'node:assert/strict';
import { createHarness } from './helpers/forms_v254_harness.mjs';
const h = createHarness();
const d = h.c.Form_fechaLocalDesdeIso_('2026-10-12');
assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 9); assert.equal(d.getDate(), 12); assert.equal(d.getHours(), 12);
console.log('forms_dates_chile_v254: PASS');
