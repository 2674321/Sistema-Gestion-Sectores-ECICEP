// v0.17.0 — El preflight de release conserva un resumen legacy LIGERO (nunca
// reconciliación profunda). La antigua pasada headless (99_ActivacionTemporal)
// fue retirada; la activación permanente es el asistente guiado en 38_Release.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const release = fs.readFileSync(
  new URL('../src/38_Release.js', import.meta.url),
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

// El asistente guiado de activación permanece y no publica superficie temporal.
assert.match(
  release,
  /function UI_formCanalAsistenteActivacion_\(\)/,
  'asistente de activación presente'
);
assert.doesNotMatch(
  release,
  /function\s+ECICEP_ACTIVAR_AHORA\s*\(/,
  'sin wrapper público temporal'
);

console.log('activation_fastpath_v260: PASS');
