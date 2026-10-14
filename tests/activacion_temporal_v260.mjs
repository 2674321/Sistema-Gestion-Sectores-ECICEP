// v0.17.0 — Gate NO_TEMP_PUBLIC_RPC.
// La superficie pública temporal de activación fue retirada: no existe
// `src/99_ActivacionTemporal.js` ni ninguna función global pública ECICEP_*.
// Los helpers privados útiles viven en 38_Release.js como `Operacion_*_`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(raiz, 'src');

// 1. El archivo temporal no existe.
assert.equal(fs.existsSync(path.join(srcDir, '99_ActivacionTemporal.js')), false,
  'src/99_ActivacionTemporal.js debe estar eliminado');

// 2. Ningún archivo declara las funciones públicas temporales.
const archivos = fs.readdirSync(srcDir).filter((f) => /\.(js|gs)$/.test(f));
const prohibidas = ['ECICEP_ACTIVAR_AHORA', 'ECICEP_EJECUTAR_WORKER_AHORA'];
for (const f of archivos) {
  const s = fs.readFileSync(path.join(srcDir, f), 'utf8');
  for (const p of prohibidas) {
    assert.doesNotMatch(s, new RegExp('function\\s+' + p + '\\s*\\('), f + ' no debe declarar ' + p);
  }
}

// 3. Ninguna función global pública empieza con ECICEP_ (todas privadas `_`).
for (const f of archivos) {
  const s = fs.readFileSync(path.join(srcDir, f), 'utf8');
  const m = s.match(/^function\s+(ECICEP_[A-Za-z0-9]+)\(/gm) || [];
  const publicas = m.map((x) => x.replace(/^function\s+/, '').replace(/\($/, '')).filter((n) => !n.endsWith('_'));
  assert.deepEqual(publicas, [], f + ' declara funciones públicas ECICEP_: ' + publicas.join(', '));
}

// 4. Los helpers privados permanecen en 38_Release.js.
const rel = fs.readFileSync(path.join(srcDir, '38_Release.js'), 'utf8');
assert.match(rel, /function Operacion_asegurarBackupActivacion_\(\)/, 'helper de respaldo presente');
assert.match(rel, /function Operacion_crearFormViaApi_\(\)/, 'helper Forms API presente');
assert.match(rel, /function Operacion_bootstrapFormProduccion_\(\)/, 'helper bootstrap presente');

// 5. La allowlist pública ya no declara public_temporary.
const allow = JSON.parse(fs.readFileSync(path.join(raiz, 'tests/rpc_public_allowlist.json'), 'utf8'));
assert.equal(allow.public_temporary, undefined, 'public_temporary debe eliminarse');

console.log('activacion_temporal_v260: PASS (NO_TEMP_PUBLIC_RPC)');
