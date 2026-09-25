#!/usr/bin/env node
// v0.13.0 — Portada INICIO de 30 columnas (A1:AD38), fingerprint por contenido
// y diagnóstico visual accionable (§13/§14 del prompt de cierre).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// T1: contrato del lienzo gestionado y dimensiones del constructor.
const cfg = readFileSync(new URL('00_Config.js', root), 'utf8');
const src = readFileSync(new URL('34_LibroUX.js', root), 'utf8');
assert.match(cfg, /INICIO_RANGO_GESTIONADO\s*=\s*'A1:AD38'/);
const constr = src.match(/function Inicio_construir_\([\s\S]*?\n\}/)?.[0] || '';
assert.ok(constr, 'Inicio_construir_ existe');
assert.match(constr, /var filas = 38, cols = 30;/);
assert.match(constr, /for \(var c = 1; c <= 30; c\+\+\) h\.setColumnWidth\(c, 38\)/);
assert.match(constr, /getRange\('A1:AD1'\)\.merge/);
ok('T1 lienzo gestionado A1:AD38 (30 columnas × 38 filas) y anchos @38');

// T2: fingerprint derivado por contenido (no literal) y ligado a 30 columnas.
const fp = c.Inicio_fingerprintEsperado_();
assert.match(fp, /^v013\|[0-9a-f]{8}$/, 'fingerprint con hash FNV-1a 32 bits');
const contracts = JSON.stringify([c.INICIO_RANGO_GESTIONADO, c.Inicio_mergesEsperados_()]);
assert.ok(contracts.indexOf('AD') !== -1 && contracts.indexOf('AF60') === -1,
  'contracto de fingerprint describe el layout de 30 columnas');
ok('T2 fingerprint por contenido v013|fnv1a32 sobre el contrato real');

// T3: merges esperados del layout de 30 columnas.
const merges = c.Inicio_mergesEsperados_();
for (const m of ['A1:AD1', 'A2:AD2', 'A4:F7', 'G4:L7', 'M4:R7', 'S4:X7', 'Y4:AD7',
  'A10:J10', 'K10:T10', 'U10:AD10', 'A18:O18', 'P18:AD18', 'A27:AD29', 'A32:AD34'])
  assert.ok(merges.includes(m), 'merge ' + m);
assert.ok(merges.every(x => /^[A-Z]/.test(x)), 'merges notación A1');
ok('T3 merges esperados cubren accesos/cards/estado/pendientes/metadata/nota');

// T4: alturas declaradas hasta la fila 34 (nota operativa y filas base nuevas).
const alturas = c.Inicio_alturasEsperadas_();
assert.equal(alturas.length, 34, '34 alturas declaradas');
for (const h of [[27, 22], [28, 22], [29, 22], [30, 10], [31, 10], [32, 20], [33, 20], [34, 20]])
  assert.ok(alturas.some(x => x[0] === h[0] && x[1] === h[1]), 'altura fila ' + h[0] + ' = ' + h[1]);
ok('T4 alturas: metadata (27-29), separadores (30-31) y nota operativa (32-34)');

// T5: Inicio_diagnosticarVisual_ ante hoja ausente.
const nulo = c.Inicio_diagnosticarVisual_(null);
assert.equal(nulo.ok, false);
assert.ok(nulo.diferencias.includes('HOJA:INICIO'));
ok('T5 diagnóstico visual: hoja ausente → HOJA:INICIO');

// T6: hoja mínima (no alcanza dimensiones) reporta diferencias y no lanza.
const minima = c.Inicio_diagnosticarVisual_({ getMaxRows: () => 1, getMaxColumns: () => 1 });
assert.equal(minima.ok, false);
assert.ok(Array.isArray(minima.diferencias) && minima.diferencias.length > 0);
ok('T6 diagnóstico visual: hoja mínima → diferencias no vacías sin excepción');

// T7: bloque PENDIENTES y METADATA en el constructor (layout de 30 columnas).
assert.match(constr, /getRange\('P18:AD18'\)\.merge\(\)\.setValue\('PENDIENTES'\)/);
assert.match(constr, /getRange\('A27:AD29'\)\.merge\(\)\.setValue/);
assert.match(constr, /getRange\('A32:AD34'\)\.merge\(\)\.setValue/);
ok('T7 PENDIENTES P18:AD18, METADATA A27:AD29 y nota operativa A32:AD34');

// T8: comparación de colores normalizada (regresión coloresBase en hoja real:
// getBackground() devuelve '#rrggbb' minúsculas o 'rgb(...)'; los tokens están
// en '#RRGGBB'. La igualdad cruda falla aunque el pincel pinte el color exacto).
assert.equal(c.Utl_colorIgual('#0E5C68', '#0e5c68'), true, 'mismo color en hex distinto caso');
assert.equal(c.Utl_colorIgual('#0B3C49', 'rgb(11,60,73)'), true, 'hex vs rgb');
assert.equal(c.Utl_colorIgual('  #0e5c68 ', '#0E5C68'), true, 'espacios ignorados');
assert.equal(c.Utl_colorIgual('#0E5C68', '#0F5C68'), false, 'colores distintos no igualan');
assert.equal(c.Utl_colorIgual('transparent', 'transparent'), true, 'transparent coincide');
assert.equal(c.Utl_colorIgual('transparent', '#FFFFFF'), false, 'transparent != blanco');
ok('T8 Utl_colorIgual normaliza hex/rgb y no false-positiva');

// T9: el verifier INICIO usa la comparación normalizada (coloresBase real).
const verSrc = c.Inicio_verificar_.toString();
assert.match(verSrc, /Utl_colorIgual\(h\.getRange\('A1'\)\.getBackground\(\), M\.sistemaProfundo\)/);
assert.match(verSrc, /Utl_colorIgual\(h\.getRange\('U10'\)\.getBackground\(\), IDENTIDAD\.VERDE\)/);
assert.doesNotMatch(verSrc, /getBackground\(\) === /);
ok('T9 coloresBase del verifier usa Utl_colorIgual');

console.log('Inicio visual v0.13 — ' + n + '/' + n + ' PASS');