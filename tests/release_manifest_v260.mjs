import assert from 'node:assert/strict'; import {buildManifest} from '../tools/release_manifest.mjs';
const m=buildManifest({generatedAt:'2026-10-13T00:00:00.000Z',suites:149,failures:0});
assert.equal(m.appVersion,'0.17.0');assert.equal(m.schemaVersion,2);assert.equal(m.installerVersion,'INST-1');assert.equal(m.activation.productionMutated,false);assert.equal(m.tests.failures,0);
const j=JSON.stringify(m);assert.doesNotMatch(j,/SPREADSHEET|FORM_ID|OPSESS|TOKEN|SECRET|PACIENTE/i);
console.log('release_manifest_v260: PASS');
