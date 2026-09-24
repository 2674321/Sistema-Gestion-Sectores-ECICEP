#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/34_LibroUX.js', import.meta.url), 'utf8');
const fn = src.match(/function Inicio_construir_\([\s\S]*?\n}/)?.[0] || '';
assert.ok(fn, 'Inicio_construir_ existe');
assert.match(fn, /getRange\(INICIO_RANGO_GESTIONADO\)/);
assert.match(fn, /gestionado\.clear\(\)/);
assert.doesNotMatch(fn, /\bh\.clear\(|getDataRange\(\)\.clear/);
assert.doesNotMatch(fn, /COUNTIF|COUNTIFS|VLOOKUP|MAX\(PACIENTES/);
assert.match(fn, /Inicio_calcularMetricas_\(\)/);
assert.match(fn, /Inicio_guardarSnapshot_/);
assert.match(fn, /Inicio_escribirMetricas_/);
assert.match(src, /INICIO_RANGO_GESTIONADO === 'A1:AF60'/);
assert.match(src, /if \(!Utl_texto\(p\.ID_INTERNO\)\) return/);
console.log('Inicio v0.12 — 10/10 PASS');
