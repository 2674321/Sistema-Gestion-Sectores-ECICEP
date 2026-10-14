import assert from 'node:assert/strict'; import {buildManifest} from '../tools/release_manifest.mjs';
// v270 (§25): el manifest se DERIVA de fuentes reales. La versión/ esquema/
// instalador salen de 00_Config.js; las decisiones, de DECISIONES.md; y las
// suites/fallos, del reporte del verificador (nunca de un conteo manual).
const m=buildManifest({generatedAt:'2026-10-13T00:00:00.000Z',stage:'RC',verifier:{suites:162,passed:162,failed:0}});
assert.equal(m.appVersion,'0.17.0');
assert.equal(m.clinicalSchema,2);
assert.equal(m.formsSchema,4);
assert.equal(m.installerVersion,'INST-1');
assert.equal(m.releaseStage,'RC');
assert.equal(m.verifier.suites,162);
assert.equal(m.verifier.failures,0);
assert.match(m.contracts.decisionsThrough,/^DEC-\d+$/);
assert.equal(m.releaseGate.testsMatchVerifier,true);
// Sin verifier no puede declarar que los tests coinciden.
assert.equal(buildManifest({generatedAt:'2026-10-13T00:00:00.000Z'}).releaseGate.testsMatchVerifier,false);
const j=JSON.stringify(m);assert.doesNotMatch(j,/SPREADSHEET|FORM_ID|OPSESS|TOKEN|SECRET|PACIENTE/i);
console.log('release_manifest_v260: PASS');
