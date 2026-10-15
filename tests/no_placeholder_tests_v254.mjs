import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const files = readdirSync('tests').filter(f => /v254\.mjs$/.test(f) && f !== 'no_placeholder_tests_v254.mjs');
assert.ok(files.length >= 12, 'se audita la batería v254 completa');
for (const file of files) {
  const source = readFileSync('tests/' + file, 'utf8');
  assert.doesNotMatch(source, /assert\.ok\(true\)|\|\|\s*true/, file + ': patrón placeholder');
  if (/PASS/.test(source)) {
    const meaningful = /assert\.(?:equal|deepEqual|match|doesNotMatch|ok|throws)|assert[A-Z]\w*\(\)|runFullDryRun\(\)/.test(source);
    assert.equal(meaningful, true, file + ': PASS debe estar respaldado por assertions o harness productivo');
  }
}
console.log('no_placeholder_tests_v254: PASS (' + files.length + ' archivos)');
