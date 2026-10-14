import assert from 'node:assert/strict';
import fs from 'node:fs';

const release = fs.readFileSync(
  new URL('../src/38_Release.js', import.meta.url),
  'utf8'
);

const wrapper = fs.readFileSync(
  new URL('../src/99_ActivacionTemporal.js', import.meta.url),
  'utf8'
);

const inicio = release.indexOf('function Operacion_preflightRelease_');
assert.ok(inicio >= 0, 'existe Operacion_preflightRelease_');

const resto = release.slice(inicio);
const siguiente = resto.slice(1).search(/\nfunction\s+/);
const preflight = siguiente >= 0
  ? resto.slice(0, siguiente + 1)
  : resto;

assert.doesNotMatch(
  preflight,
  /Form_legacyReconciliarDryRun_/,
  'preflight no ejecuta reconciliación legacy profunda'
);

assert.match(
  preflight,
  /backlog\.legacy/,
  'preflight reutiliza resumen legacy ligero'
);

assert.doesNotMatch(
  wrapper,
  /Form_migrarTrailerLegacy_/,
  'wrapper no migra legacy durante activación'
);

assert.match(
  wrapper,
  /Form_operativoInstalar_/,
  'wrapper instala el canal'
);

assert.match(
  wrapper,
  /Form_operativoDiagnosticar_/,
  'wrapper diagnostica después de instalar'
);

assert.match(
  wrapper,
  /READY_FOR_DEPLOY/,
  'wrapper conserva gate READY_FOR_DEPLOY'
);

assert.match(
  wrapper,
  /DEFERRED_POST_ACTIVATION/,
  'reconciliación legacy queda diferida'
);

console.log('activation_fastpath_v260: PASS');