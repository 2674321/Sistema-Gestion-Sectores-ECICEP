#!/usr/bin/env node
// v0.14.0 — Portada INICIO como panel operativo completo (30 columnas A1:AD38):
// hero, accesos, banda de KPIs, cards por sector, distribución, estado,
// pendientes, alerta, metadata y nota. Fingerprint por contenido y
// diagnóstico visual accionable.
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
assert.match(constr, /typeof h\.setColumnWidths === 'function'\).*setColumnWidths\(1, cols, 38\)/);
assert.match(constr, /setRowHeights\(iniTramo, alturas\[iA - 1\]\[0\] - iniTramo \+ 1, alturas\[iA - 1\]\[1\]\)/,
  'las 34 alturas se aplican por tramos contiguos de igual valor');
assert.match(constr, /getRange\('A1:AD1'\)\.merge/);
ok('T1 lienzo gestionado A1:AD38 (30 columnas × 38 filas) y anchos @38');

// T2: fingerprint derivado por contenido (no literal) y ligado a 30 columnas.
const fp = c.Inicio_fingerprintEsperado_();
assert.match(fp, /^v014\|[0-9a-f]{8}$/, 'fingerprint con hash FNV-1a 32 bits');
const contracts = JSON.stringify([c.INICIO_RANGO_GESTIONADO, c.Inicio_mergesEsperados_()]);
assert.ok(contracts.indexOf('AD') !== -1 && contracts.indexOf('AF60') === -1,
  'contracto de fingerprint describe el layout de 30 columnas');
ok('T2 fingerprint por contenido v014|fnv1a32 sobre el contrato real');

// T3: merges esperados del panel operativo de 30 columnas.
const merges = c.Inicio_mergesEsperados_();
for (const m of ['A1:AD1', 'A2:AD2', 'A3:AD3', 'A4:F7', 'G4:L7', 'M4:R7', 'S4:X7', 'Y4:AD7',
  'A8:F8', 'G8:L8', 'M8:R8', 'S8:X8', 'Y8:AD8',
  'A9:F9', 'G9:L9', 'M9:R9', 'S9:X9', 'Y9:AD9',
  'A10:J10', 'K10:T10', 'U10:AD10',
  'A15:J15', 'K15:T15', 'U15:AD15', 'A16:J16', 'K16:T16', 'U16:AD16',
  'A18:O18', 'P18:AD18', 'A24:AD25', 'A27:AD29', 'A32:AD34'])
  assert.ok(merges.includes(m), 'merge ' + m);
assert.ok(merges.every(x => /^[A-Z]/.test(x)), 'merges notación A1');
ok('T3 merges esperados cubren hero/accesos/KPIs/cards/distribución/estado/alerta/metadata');

// T4: alturas declaradas de las 34 filas del panel operativo.
const alturas = c.Inicio_alturasEsperadas_();
assert.equal(JSON.stringify(alturas), JSON.stringify([[1, 32], [2, 22], [3, 26], [4, 22], [5, 22], [6, 22], [7, 22],
  [8, 16], [9, 30], [10, 30], [11, 20], [12, 20], [13, 20], [14, 20],
  [15, 18], [16, 24], [17, 8], [18, 26], [19, 8], [20, 21], [21, 21],
  [22, 21], [23, 21], [24, 14], [25, 20], [26, 8], [27, 22], [28, 22],
  [29, 22], [30, 10], [31, 10], [32, 22], [33, 22], [34, 22]]), 'alturas del panel operativo');
ok('T4 alturas: hero (3), KPIs (8-9), cards (10-14), distribución (15-16), alerta (24-25)');

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

// T7: bloque PENDIENTES, ALERTA, METADATA y nota en el constructor.
assert.match(constr, /getRange\('P18:AD18'\)\.merge\(\)\.setValue\('PENDIENTES'\)/);
assert.match(constr, /getRange\('A24:AD25'\)\.merge\(\)\.setValue\('Sin alertas operativas'\)/);
assert.match(constr, /getRange\('A27:AD29'\)\.merge\(\)\.setValue/);
assert.match(constr, /getRange\('A32:AD34'\)\.merge\(\)\.setValue/);
ok('T7 PENDIENTES P18:AD18, ALERTA A24:AD25, METADATA A27:AD29 y nota A32:AD34');

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

// T10: el panel operativo se construye, se verifica y no reintroduce fórmulas vivas.
assert.match(constr, /getRange\('A3:AD3'\)\.merge\(\)\.setValue\('Panel operativo/);
assert.match(constr, /PERSONAS', rango: 'A8:F8', valor: 'A9:F9'/);
assert.match(constr, /ALERTAS OPERATIVAS', rango: 'Y8:AD8', valor: 'Y9:AD9'/);
assert.match(constr, /getRange\(15, c0, 1, 10\)\.merge\(\)\.setValue\(s\.n\)/);
assert.match(constr, /getRange\(16, c0, 1, 10\)\.merge\(\)/);
assert.match(constr, /'A18:O23'/);
assert.match(constr, /'P18:AD23'/);
assert.match(verSrc, /getRange\('A9'\)\.getFormula\(\) === '' && h\.getRange\('A16'\)\.getFormula\(\) === ''/,
  'los valores del panel se escriben como snapshot, no como fórmula viva');
ok('T10 hero/KPIs/distribución/alerta se construyen y verifican sin fórmulas vivas');

console.log('Inicio visual v0.14 — ' + n + '/' + n + ' PASS');
