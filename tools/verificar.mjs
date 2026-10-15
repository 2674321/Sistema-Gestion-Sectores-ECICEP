#!/usr/bin/env node
// Una sola entrada local/CI: descubre todas las suites sin dependencias externas.
// `--json` emite un reporte machine-readable (los helpers no se cuentan como suites).
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = process.argv.includes('--json');

const srcFiles = readdirSync(new URL('../src/', import.meta.url))
  .filter(f => /\.(js|gs)$/.test(f)).sort();
const suites = readdirSync(new URL('../tests/', import.meta.url))
  .filter(f => f.endsWith('.mjs')).sort();

let syntaxFailures = 0;
const syntaxFailed = [];
for (const f of srcFiles) {
  const r = spawnSync(process.execPath, ['--check'], { cwd: root, input: readFileSync(root + 'src/' + f), encoding: 'utf8' });
  if (r.status !== 0) {
    syntaxFailures++;
    syntaxFailed.push('src/' + f);
    if (!json) console.error('Sintaxis: ' + f, r.error || r.stderr);
  }
}

const totalInicio = Date.now();
const results = [];
let failures = syntaxFailures;
for (const f of suites) {
  const inicio = Date.now();
  const r = spawnSync(process.execPath, ['tests/' + f], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const ok = r.status === 0;
  if (!ok) failures++;
  const ms = Date.now() - inicio;
  results.push({ suite: 'tests/' + f, ok, ms });
  if (!json) {
    console.log(`\n${ok ? 'OK' : 'ERROR'} tests/${f} ${ms} ms`);
    const output = (r.stdout || '') + (r.stderr || '');
    console.log(ok ? output.trim().split('\n').slice(-3).join('\n') : output);
    if (r.error) console.error(r.error);
  }
}
const totalMs = Date.now() - totalInicio;
const passed = results.filter(x => x.ok).length;
const failed = results.length - passed;

if (json) {
  console.log(JSON.stringify({
    ok: failures === 0,
    suites: results.length,
    passed,
    failed,
    skipped: 0,
    syntaxFailures,
    durationMs: totalMs,
    failures: results.filter(x => !x.ok).map(x => x.suite).concat(syntaxFailed),
    results
  }));
} else {
  console.log(`\n${suites.length} suites; ${failures} fallos; ${totalMs} ms total (incluye sintaxis JS/GS).`);
}
process.exitCode = failures ? 1 : 0;
