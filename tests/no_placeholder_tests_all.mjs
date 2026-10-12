// v255 — detector GLOBAL de tests placeholder (endurecido en el release gate).
// Detecta, sobre TODAS las suites de tests/:
//   - el patrón stub: suite que tras quitar imports/comentarios sólo tiene un
//     `console.log(...PASS...)`;
//   - `assert.ok(true)` literal;
//   - `|| true` (cortocircuito que fuerza verde);
//   - suites que imprimen PASS sin ninguna aserción ni harness (assert./A(/t();
//   - auditores de tools/ con `check('...', true)` hardcodeado.
// Además, todo test `*_v255.mjs` debe tener >= 3 aserciones reales (assert. o A()).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort();
assert.ok(files.length >= 100, 'debe escanear la batería completa, no una muestra');

function lineasCodigo(src) {
  return src.split('\n').map(l => l.trim()).filter(l =>
    l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*') &&
    !l.startsWith('#!') && !/^import\s/.test(l));
}

const ASERCION = /assert\.|(?:^|[^\w.])A\(/;
const HARNESS = /\bt\(|\bregistrar\(|process\.exit|throw new Error|from ['"]\.\/helpers\//;

const placeholders = [];
const suspendidos = [];
for (const f of files) {
  const src = readFileSync(path.join(dir, f), 'utf8');
  const codigo = lineasCodigo(src);

  const soloPrint = codigo.length <= 1 && codigo.every(l => /^console\.log\(/.test(l));
  if (soloPrint && /PASS/.test(src)) placeholders.push(f);

  if (f === 'no_placeholder_tests_all.mjs') continue; // el detector se autodescribe
  if (/assert\.ok\(\s*true\s*\)/.test(src)) suspendidos.push(f + ' (assert.ok(true))');
  if (/\|\|\s*true\b/.test(src)) suspendidos.push(f + ' (|| true)');
  if (/PASS/.test(src) && !ASERCION.test(src) && !HARNESS.test(src)) {
    suspendidos.push(f + ' (PASS sin aserciones/harness)');
  }
}

assert.deepEqual(placeholders, [], 'tests placeholder sin aserciones reales: ' + placeholders.join(', '));
assert.deepEqual(suspendidos, [], 'tests con verde forzado o sin verificación: ' + suspendidos.join(', '));

const v255 = files.filter(f => /_v255\.mjs$/.test(f));
assert.ok(v255.length >= 8, 'faltan tests v255');
for (const f of v255) {
  const src = readFileSync(path.join(dir, f), 'utf8');
  const asserts = (src.match(new RegExp(ASERCION, 'g')) || []).length;
  assert.ok(asserts >= 3, f + ': menos de 3 aserciones (' + asserts + ')');
}

const toolsDir = path.join(dir, '..', 'tools');
const tools = readdirSync(toolsDir).filter(f => f.endsWith('.mjs'));
for (const f of tools) {
  const src = readFileSync(path.join(toolsDir, f), 'utf8');
  assert.ok(!/check\(\s*['"][^'"]*['"]\s*,\s*true\s*\)/.test(src),
    'tool con check hardcodeado a true: ' + f);
}

console.log('no_placeholder_tests_all: ' + files.length + ' tests, ' + v255.length + ' v255 sin placeholders');
