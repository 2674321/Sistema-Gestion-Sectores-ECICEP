#!/usr/bin/env node
// Una sola entrada local/CI: descubre todas las suites sin dependencias externas.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let failures = 0;
for (const f of readdirSync(new URL('../src/', import.meta.url)).filter(f => /\.(js|gs)$/.test(f)).sort()) {
  const r = spawnSync(process.execPath, ['--check'], { cwd: root, input: readFileSync(root + 'src/' + f), encoding: 'utf8' });
  if (r.status !== 0) { failures++; console.error('Sintaxis: ' + f, r.error || r.stderr); }
}
const suites = readdirSync(new URL('../tests/', import.meta.url)).filter(f => f.endsWith('.mjs')).sort();
for (const f of suites) {
  const r = spawnSync(process.execPath, ['tests/' + f], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const ok = r.status === 0;
  if (!ok) failures++;
  console.log(`\n${ok ? 'OK' : 'ERROR'} tests/${f}`);
  const output = (r.stdout || '') + (r.stderr || '');
  console.log(ok ? output.trim().split('\n').slice(-3).join('\n') : output);
  if (r.error) console.error(r.error);
}
console.log(`\n${suites.length} suites; ${failures} fallos (incluye sintaxis JS/GS).`);
process.exitCode = failures ? 1 : 0;
