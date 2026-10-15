#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
const clave = h.c.GOOGLE_FORMS_CONFIG.WORKER_LEASE.CLAVE;
h.props.set(clave, JSON.stringify({ token: 'nuevo-token', t: Date.now(), exp: Date.now() + 60000 }));
h.setLockSequence([false]);
const r = h.c.Form_leaseLiberar_('viejo-token');
assert.equal(r.motivo, 'DEFERRED_LOCK_BUSY');
assert.equal(JSON.parse(h.props.get(clave)).token, 'nuevo-token', 'release viejo no borra lease ajeno');

console.log('forms_lease_release_v258: PASS');
