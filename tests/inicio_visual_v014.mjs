#!/usr/bin/env node
// v0.15.0 — Portada INICIO PRO (PANEL_OPERATIVO_PRO_V015, A1:AJ50). El contrato
// cambió intencionalmente desde V014: contrato único INICIO_CONTRATO, 6
// accesos, 6 KPIs, cards con matrices, sin marco gigante ni SOBRANTE.
// Se conserva la cobertura de regresión (fingerprint, merges, alturas,
// diagnóstico, colores, fórmulas).
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
assert.match(cfg, /INICIO_RANGO_GESTIONADO\s*=\s*'A1:AJ50'/);
const constr = src.match(/function Inicio_construir_\([\s\S]*?\n\}/)?.[0] || '';
assert.ok(constr, 'Inicio_construir_ existe');
assert.match(constr, /var filas = cto\.filas, cols = cto\.columnas;/);
assert.match(constr, /typeof h\.setColumnWidths === 'function'\).*setColumnWidths\(1, cols, cto\.anchoColumna\)/);
assert.match(constr, /setRowHeights\(iniTramo, alturas\[iA - 1\]\[0\] - iniTramo \+ 1, alturas\[iA - 1\]\[1\]\)/,
  'las 50 alturas se aplican por tramos contiguos de igual valor');
assert.match(constr, /getRange\(cto\.header\.rango\)\.merge/);
ok('T1 lienzo gestionado A1:AJ50 (36 columnas × 50 filas) desde el contrato único');

// T2: fingerprint derivado por contenido (no literal), contrato PRO.
const fp = c.Inicio_fingerprintEsperado_();
assert.match(fp, /^pro015\|[0-9a-f]{8}$/, 'fingerprint con hash FNV-1a 32 bits');
const contracts = JSON.stringify([c.INICIO_RANGO_GESTIONADO, c.Inicio_mergesEsperados_()]);
assert.ok(contracts.indexOf('AJ') !== -1 && contracts.indexOf('AF60') === -1,
  'contracto de fingerprint describe el layout de 36 columnas');
ok('T2 fingerprint por contenido pro015|fnv1a32 sobre el contrato real');

// T3: merges esperados PRO (32, sin mergear pares label/value).
const merges = c.Inicio_mergesEsperados_();
assert.equal(merges.length, 32, 'merges exactos del contrato');
for (const m of ['A1:AJ1', 'A2:AJ2', 'A3:AJ3', 'A5:F8', 'AE5:AJ8',
  'A10:F10', 'A11:F12', 'AE10:AJ10', 'AE11:AJ12',
  'A15:L15', 'Y15:AJ15', 'A23:L23', 'Y23:AJ23',
  'A29:R29', 'S29:AJ29', 'A41:R41', 'S41:AJ41', 'A49:AJ50'])
  assert.ok(merges.includes(m), 'merge ' + m);
assert.ok(merges.every(x => /^[A-Z]/.test(x)), 'merges notación A1');
ok('T3 merges PRO: header, accesos, KPIs, cards, bloques e info (32, sin pares label/value)');

// T4: alturas declaradas de las 50 filas del contrato.
const alturas = c.Inicio_alturasEsperadas_();
assert.equal(alturas.length, 50, '50 filas con altura declarada');
assert.equal(JSON.stringify(alturas[0]), JSON.stringify([1, 30]));
assert.equal(JSON.stringify(alturas[49]), JSON.stringify([50, 20]));
assert.ok(alturas.every(x => x[1] > 0), 'alturas positivas');
ok('T4 50 alturas del contrato (header 30, KPIs, cards, bloques, footer)');

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

// T7: bloques PRO (estado, prioridades, estratificación, info, footer).
assert.match(constr, /cto\.estado\.tituloRango/);
assert.match(constr, /cto\.prioridades\.tituloRango/);
assert.match(constr, /cto\.estratificacion\.tituloRango/);
assert.match(constr, /cto\.info\.tituloRango/);
assert.match(constr, /cto\.footer\.rango/);
ok('T7 ESTADO, PRIORIDADES, ESTRATIFICACIÓN, INFO y FOOTER desde el contrato');

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
assert.match(verSrc, /Utl_colorIgual\(h\.getRange\('Y15'\)\.getBackground\(\), IDENTIDAD\.VERDE\)/);
assert.doesNotMatch(verSrc, /getBackground\(\) === /);
ok('T9 coloresBase del verifier usa Utl_colorIgual');

// T10: el contrato PRO se construye y verifica sin fórmulas vivas.
assert.match(constr, /getRange\(cto\.estadoGeneralRango\)\.merge\(\)\.setValue\('Panel operativo/);
assert.match(src, /etiqueta: 'PERSONAS', etiquetaRango: 'A10:F10', valorRango: 'A11:F12'/);
assert.match(src, /etiqueta: 'SIN PRÓXIMA ATENCIÓN', etiquetaRango: 'AE10:AJ10', valorRango: 'AE11:AJ12'/);
assert.match(constr, /cardDistribucionFila/);
assert.match(constr, /CAJA_ESTADO, CAJA_PEND, CAJA_ESTRAT, CAJA_INFO/);
assert.match(verSrc, /'A11', 'A16', 'Y11', 'Q30', 'AI30', 'R42', 'AI42'/,
  'los valores del panel se escriben como snapshot, no como fórmula viva');
ok('T10 estado general/KPIs/cards/cajas se construyen y verifican sin fórmulas vivas');

// T11: sin marco gigante ni SOBRANTE — el físico extra no es drift.
assert.doesNotMatch(constr, /INICIO_RANGO_GESTIONADO\)\.setBorder/, 'sin borde sobre el rango gestionado');
assert.doesNotMatch(constr, /hideRows|hideColumns/, 'no se ocultan las filas/columnas sobrantes');
assert.doesNotMatch(constr, /sistemaBorde/, 'sin marco exterior gigante');
assert.doesNotMatch(src, /COLUMNA:SOBRANTE/, 'SOBRANTE eliminado');
ok('T11 sin marco gigante: el físico extra no es drift ni se oculta');

console.log('Inicio visual v0.14 — ' + n + '/' + n + ' PASS');
