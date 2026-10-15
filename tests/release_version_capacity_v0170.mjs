#!/usr/bin/env node
// Guarda de capacidad de versiones de Apps Script (límite 200).
// El conteo real es el número de VERSIONES listadas por `clasp versions`,
// nunca max(versionNumber): los números tienen huecos por versiones borradas.
// Verifica además que en el límite NO se invoca `clasp deploy`.
import assert from 'node:assert/strict';
import {
  parseClaspVersions, versionCapacity, capacityGuardForDeploy,
  APPS_SCRIPT_MAX_VERSIONS, APPS_SCRIPT_WARN_VERSIONS
} from '../tools/release_manifest.mjs';

// Parser: cabecera real, descripciones arbitrarias (con guiones) y vacío.
const real = ['Found 3 versions.', '16 - ETAPA 5 carga real controlada', '265 - No description', '268 - v0.17.0-rc1 - fix 2'].join('\n');
assert.deepEqual(parseClaspVersions(real).numbers, [16, 265, 268]);
assert.equal(parseClaspVersions(real).count, 3);
assert.equal(parseClaspVersions('No versions found.').count, 0);
assert.equal(parseClaspVersions('').count, 0);

// Umbrales (warn=190, max=200).
assert.equal(versionCapacity(0).level, 'OK');
assert.equal(versionCapacity(189).level, 'OK');
assert.equal(versionCapacity(189).free, 11);
assert.equal(versionCapacity(190).level, 'NEAR');
assert.equal(versionCapacity(190).ok, true);
assert.equal(versionCapacity(199).level, 'NEAR');
assert.equal(versionCapacity(199).ok, true);
assert.equal(versionCapacity(200).ok, false);
assert.equal(versionCapacity(200).level, 'LIMIT');
assert.equal(versionCapacity(200).reason, 'APPS_SCRIPT_VERSION_LIMIT_REACHED');
assert.equal(versionCapacity(201).ok, false);
assert.equal(versionCapacity(APPS_SCRIPT_MAX_VERSIONS).free, 0);
assert.equal(APPS_SCRIPT_WARN_VERSIONS, 190);

function out(n) {
  return ['Found ' + n + ' versions.', ...Array.from({ length: n }, (_, i) => (16 + i) + ' - v')].join('\n');
}

// 1) 199 versiones → permite continuar y ejecuta deploy (queda 1 slot).
let llamadas = [];
let cap = capacityGuardForDeploy({ versionStdout: out(199), deployId: 'DEP-ID', runClasp: (...a) => { llamadas.push(a); return { status: 0 }; } });
assert.equal(cap.ok, true);
assert.equal(cap.level, 'NEAR');
assert.equal(cap.free, 1);
assert.equal(cap.deployed, true);
assert.equal(llamadas.length, 1, 'en 199 debe ejecutarse deploy');
assert.deepEqual(llamadas[0], ['clasp', ['deploy', '--deploymentId', 'DEP-ID']]);

// 2) 200 versiones → BLOQUEA y NO ejecuta deploy.
llamadas = [];
cap = capacityGuardForDeploy({ versionStdout: out(200), deployId: 'DEP-ID', runClasp: (...a) => { llamadas.push(a); return { status: 0 }; } });
assert.equal(cap.ok, false);
assert.equal(cap.deployed, false);
assert.equal(cap.reason, 'APPS_SCRIPT_VERSION_LIMIT_REACHED');
assert.equal(llamadas.length, 0, 'en el límite NO debe llamarse a clasp deploy');

// 3) 201+ → BLOQUEA defensivamente y NO ejecuta deploy.
for (const n of [201, 250]) {
  llamadas = [];
  const c = capacityGuardForDeploy({ versionStdout: out(n), deployId: 'DEP-ID', runClasp: (...a) => { llamadas.push(a); return { status: 0 }; } });
  assert.equal(c.deployed, false, 'n=' + n);
  assert.equal(llamadas.length, 0, 'n=' + n + ' no debe llamar a deploy');
}

// 4) Deploy presente pero fallido reporta CLASP_DEPLOY_FALLÓ.
const fallo = capacityGuardForDeploy({ versionStdout: out(120), deployId: 'DEP-ID', runClasp: () => ({ status: 1, stderr: 'boom' }) });
assert.equal(fallo.deployed, false);
assert.equal(fallo.reason, 'CLASP_DEPLOY_FALLÓ');

console.log('release_version_capacity_v0170: PASS');
