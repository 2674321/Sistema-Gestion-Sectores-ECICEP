#!/usr/bin/env node
// Regresión 0.12.1 — Portada (INICIO) construida SIEMPRE sin filas/columnas
// inmovilizadas residuales.
// Síntoma real: "No se pueden combinar filas inmovilizadas con filas no
// inmovilizadas" en la fase "Preparando la portada" (Instalar_pInicio →
// Modelo_disenoHojas → Hojas_crearInicio → Inicio_construir_). Ocurre cuando
// la hoja hereda freeze de una instalación anterior y las escrituras del
// constructor cruzan el límite congelado/no-congelado.
// Invariante verificada: orden setFrozenRows(0) → escrituras → setFrozenRows(2).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = (m) => { n++; console.log('[PASS] ' + m); };

// --- T1: invariante en el código fuente (orden estructural) ---
const src34 = readFileSync(new URL('../src/34_LibroUX.js', import.meta.url), 'utf8');
const fn = src34.match(/function Inicio_construir_\([\s\S]*?\n\}/)?.[0] || '';
assert.ok(fn, 'Inicio_construir_ existe');
assert.ok(fn.indexOf('h.setFrozenRows(0); h.setFrozenColumns(0);') !== -1,
  'destraba el freeze residual al inicio');
const iUnlock = fn.indexOf('setFrozenRows(0)');
const iInsert = fn.indexOf('insertRowsAfter');
const iBreak = fn.indexOf('gestionado.breakApart');
const iClear = fn.indexOf('gestionado.clear');
assert.ok(iUnlock !== -1 && (iUnlock < iInsert) && (iUnlock < iBreak) && (iUnlock < iClear),
  'unlock ANTES de insertRowsAfter, breakApart y clear del rango gestionado');
assert.ok(fn.indexOf('h.setFrozenRows(2); h.setFrozenColumns(0);') !== -1,
  'congela 2 filas al final');
assert.ok(fn.indexOf('h.setFrozenRows(2)') > fn.indexOf('setFrozenRows(0)'),
  'el freeze final viene después del unlock inicial');
assert.match(fn, /freeze:\s*\(typeof h\.getFrozenRows === 'function'\) && h\.getFrozenRows\(\) === 2/,
  'verificación incluye freeze === 2');
ok('T1 fuente: unlock al inicio, escrituras en medio, freeze final y verificación');

// --- Harness: hoja y rango falsos que registran el orden real de operaciones ---
const colLetra = (n) => {
  let letra = '';
  while (n > 0) { const r = (n - 1) % 26; letra = String.fromCharCode(65 + r) + letra; n = Math.floor((n - 1) / 26); }
  return letra;
};
const a1Parse = (a1) => { const m = /^([A-Z]+)(\d+)/.exec(a1); return { c: m[1], f: Number(m[2]) }; };
function fabricarHoja(estado) {
  const celdas = new Map();
  let ops = [];
  const sh = {
    frozenRows: estado.frozenRows,
    frozenCols: estado.frozenCols,
    maxRows: estado.maxRows,
    maxCols: estado.maxCols
  };
  sh.getSheetName = () => 'INICIO';
  sh.getSheetId = () => 123;
  sh.getMaxRows = () => sh.maxRows;
  sh.getMaxColumns = () => sh.maxCols;
  sh.insertRowsAfter = (a, num) => { ops.push({ name: 'mutaR', v: 'filas+' + num }); sh.maxRows += num; };
  sh.insertColumnsAfter = (a, num) => { ops.push({ name: 'mutaR', v: 'cols+' + num }); sh.maxCols += num; };
  sh.showRows = () => { ops.push({ name: 'muestra' }); };
  sh.showColumns = () => { ops.push({ name: 'muestra' }); };
  sh.setHiddenGridlines = () => { ops.push({ name: 'mutaR', v: 'hidden' }); };
  sh.setColumnWidth = () => { ops.push({ name: 'mutaR', v: 'ancho' }); };
  sh.setFrozenRows = (v) => { ops.push({ name: 'setFrozenRows', v }); sh.frozenRows = v; };
  sh.setFrozenColumns = (v) => { ops.push({ name: 'setFrozenColumns', v }); sh.frozenCols = v; };
  sh.getFrozenRows = () => sh.frozenRows;
  sh.getFrozenColumns = () => sh.frozenCols;
  sh.setTabColor = () => { ops.push({ name: 'embellece' }); };
  sh.setConditionalFormatRules = () => { ops.push({ name: 'mutaR', v: 'cf' }); };
  sh._ops = () => ops;
  sh._opsReset = () => { ops = []; };
  sh.getRange = (...args) => {
    let col = 1, fila = 1, nc = 1, nr = 1;
    if (typeof args[0] === 'string') {
      const p = a1Parse(args[0]);
      col = p.c.length <= 1 ? (p.c.charCodeAt(0) - 64) : (p.c.charCodeAt(0) - 64) * 26 + (p.c.charCodeAt(1) - 64);
      fila = p.f;
    } else {
      fila = Number(args[0]); col = Number(args[1]);
      nr = Number(args[2]) || 1; nc = Number(args[3]) || 1;
    }
    const clave = colLetra(col) + fila;
    const escritura = (tipo, v, atom) => {
      ops.push({ name: tipo, v });
      if (atom !== undefined) celdas.set(clave, atom);
    };
    return {
      breakApart() { ops.push({ name: 'breakApart' }); },
      clear() { ops.push({ name: 'clear' }); celdas.clear(); },
      merge() { ops.push({ name: 'merge' }); return this; },
      setBackground(v) { escritura('escribe', 'bg'); return this; },
      setFontFamily(v) { escritura('escribe', 'font'); return this; },
      setFontColor(v) { escritura('escribe', 'color'); return this; },
      setFontWeight(v) { escritura('escribe', 'peso'); return this; },
      setFontSize(v) { escritura('escribe', 'tamano'); return this; },
      setFontStyle(v) { escritura('escribe', 'estilo'); return this; },
      setVerticalAlignment(v) { escritura('escribe', 'valign'); return this; },
      setHorizontalAlignment(v) { escritura('escribe', 'halign'); return this; },
      setWrap(v) { escritura('escribe', 'wrap'); return this; },
      setBorder() { escritura('escribe', 'borde'); return this; },
      setValue(v) { escritura('escribe', 'valor', v); return this; },
      setFormula(v) { escritura('escribe', 'formula', v); return this; },
      getValue() { return celdas.has(clave) ? celdas.get(clave) : ''; },
      getFormula() { return celdas.has(clave) ? celdas.get(clave) : ''; }
    };
  };
  return sh;
}
function fabricarLibro(hoja) {
  // PACIENTES existe a efectos de la rama HYPERLINK de los accesos.
  return {
    getSheetByName(name) { return name === 'INICIO' || name === 'PACIENTES' ? hoja : null; },
    insertSheet() { return hoja; }
  };
}

// Stubs de dependencias para que Inicio_construir_ termine sin GAS.
c.SpreadsheetApp = { BorderStyle: { SOLID: 'SOLID' } };
c.Inicio_calcularMetricas_ = () => ({ fecha: '2026-09-24', sectores: {}, pacientes: 0,
  revision: 0, rutInvalidos: 0, pendientesIngreso: 0, ultimaAuditoria: '', ultimoBackup: '' });
c.Inicio_guardarSnapshot_ = () => ({});
c.Inicio_escribirMetricas_ = () => ({ ok: true });
c.Libro_limpiarDirty_ = () => ({});
c.WebApp_urlCaptura_ = () => '';
c.WebApp_urlVista_ = () => '';

// --- T2/T3/T4/T5: escenario HEREDADO (hoja ya congelada en 2/1 y 10 filas) ---
const hojaA = fabricarHoja({ frozenRows: 2, frozenCols: 1, maxRows: 10, maxCols: 5 });
const libroA = fabricarLibro(hojaA);
const resA = c.Inicio_construir_(libroA);
const opsA = hojaA._ops();
assert.equal(resA.ok, true);
assert.equal(resA.verificacion.freeze, true, 'verif.freeze === true');
assert.equal(hojaA.frozenRows, 2, 'termina con 2 filas congeladas');
assert.equal(hojaA.frozenCols, 0, 'termina sin columnas congeladas');
ok('T2 hoja heredada con freeze: construye sin lanzar, freeze final 2/0');

const idxEscrituraA = opsA.map((o, i) => ['mutaR', 'breakApart', 'clear', 'merge', 'escribe', 'muestra']
  .indexOf(o.name) !== -1 ? i : -1).filter(i => i >= 0);
const idxFreezeA = opsA.map((o, i) => o.name === 'setFrozenRows' ? i : -1).filter(i => i >= 0);
assert.ok(idxFreezeA.length >= 2, 'al menos unlock inicial + freeze final');
assert.equal(opsA[idxFreezeA[0]].v, 0, 'primer setFrozenRows es 0');
assert.ok(idxFreezeA[0] < idxEscrituraA[0],
  'unlock (índice ' + idxFreezeA[0] + ') ANTES de toda escritura (índice ' + idxEscrituraA[0] + ')');
ok('T3 heredado: el freeze residual se destraba ANTES de la primera escritura');

const intermediosA = idxFreezeA.slice(0, -1).filter(i => opsA[i].v > 0);
assert.equal(intermediosA.length, 0, 'ningún freeze>0 intermedio antes del final');
const ultimoFreezeA = idxFreezeA[idxFreezeA.length - 1];
assert.equal(opsA[ultimoFreezeA].v, 2, 'último freeze es 2');
assert.ok(ultimoFreezeA > idxEscrituraA[idxEscrituraA.length - 1],
  'freeze final (índice ' + ultimoFreezeA + ') DESPUÉS de toda escritura (índice ' +
    idxEscrituraA[idxEscrituraA.length - 1] + ')');
ok('T4 heredado: todas las escrituras con freeze=0; congelado solo al final');

assert.equal(resA.verificacion.columnas, true, 'columnas 32');
assert.equal(resA.verificacion.filas, true, 'filas 60');
ok('T5 heredado: verificación completa de la portada reconstruida');

// --- T6/T7: escenario NUEVO (hoja recién creada sin freeze) ---
const hojaB = fabricarHoja({ frozenRows: 0, frozenCols: 0, maxRows: 60, maxCols: 32 });
const resB = c.Inicio_construir_(fabricarLibro(hojaB));
const opsB = hojaB._ops();
assert.equal(resB.ok, true);
assert.equal(resB.verificacion.freeze, true);
assert.equal(hojaB.frozenRows, 2);
ok('T6 hoja nueva: construye y congela 2 filas al final');

const idxFreezeB = opsB.map((o, i) => o.name === 'setFrozenRows' && o.v === 2 ? i : -1)
  .filter(i => i >= 0);
const fijoB = idxFreezeB[0]; // línea de freeze final
for (let i = 0; i < opsB.length; i++) {
  if (opsB[i].name !== 'mutaR' && opsB[i].name !== 'clear' && opsB[i].name !== 'merge' &&
      opsB[i].name !== 'escribe' && opsB[i].name !== 'breakApart') continue;
  // Toda escritura ocurre antes del freeze final (freeze=0 durante todo el dibujado)
  assert.ok(i < fijoB, 'escritura en ' + i + ' ocurre ANTES del freeze final en ' + fijoB);
}
ok('T7 hoja nueva: ningún write con filas inmovilizadas (invariante mantenida)');

console.log('\nInicio portada freeze — ' + n + '/' + n + ' PASS');