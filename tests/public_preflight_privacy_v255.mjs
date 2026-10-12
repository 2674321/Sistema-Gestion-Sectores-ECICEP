// v255 (§17 P0 / E27) — pre-flight público SIN PII ni pre-flight detallado.
// Falla si el pre-flight público expone candidatos o exige credencial.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
h.install();

// Hay un paciente con el mismo RUT en la "base": aun así, en público NO se expone.
const r = h.c.WebApp_previaDuplicadosV2({
  accion: 'nuevoIngreso', rut: '12.345.678-5', nombre: 'PERSONA SECRETA', telefonos: '999999999'
}, '');
assert.equal(r.ok, true);
assert.equal(r.motivo, 'PREVIEW_OMITIDO_EN_PUBLICO');
assert.equal(r.candidatos.length, 0, 'captura pública no expone candidatos');
assert.equal(r.coincidencia, false);
assert.doesNotMatch(JSON.stringify(r), /SECRETA|12345678|999999999|EC-001/);

// El pre-flight público jamás condiciona el acceso a credencial (DEC-102).
assert.doesNotMatch(String(h.c.WebApp_previaDuplicadosV2), /ACCESO_DENEGADO|Session|getActiveUser|token/i);
console.log('public_preflight_privacy_v255: PASS');
