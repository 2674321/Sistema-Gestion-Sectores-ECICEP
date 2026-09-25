#!/usr/bin/env node
// v0.13.0 — Motor de paridad visual INGRESO/SECTOR: firmas, diferencias y
// comparación entre familias con plantilla única.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// T1: diferencias por propiedad entre dos firmas (motor puro).
const dif = c.HVis_diferenciasFirmas_(
  { titulo: 'A', secciones: [{ id: 's1', columnas: ['RUT', 'NOMBRE'] }] },
  { titulo: 'A', secciones: [{ id: 's1', columnas: ['RUT', 'EDAD'] }] },
  '', [], 250);
assert.ok(dif.some(d => d.propiedad === 'secciones[0].columnas[1]'),
  'se reporta la columna divergente con su ruta');
const diffArray = c.HVis_diferenciasFirmas_([1, 2], [1, 2, 3], '', [], 250);
assert.ok(diffArray.some(d => /\.length$/.test(d.propiedad)), 'longitudes divergentes');
ok('T1 HVis_diferenciasFirmas_: ruta por propiedad y divergencia de longitudes');

// T2: hash estructural estable y sensible a contenido.
const h1 = c.HVis_hashEstructural_({ a: 1, b: [1, 2] });
const h2 = c.HVis_hashEstructural_({ b: [1, 2], a: 1 });
const h3 = c.HVis_hashEstructural_({ a: 1, b: [1, 3] });
assert.equal(h1, h2, 'orden de claves no altera el hash');
assert.notEqual(h1, h3, 'contenido distinto altera el hash');
assert.match(h1, /^[0-9a-f]{8}$/);
ok('T2 firma estable: hash estructural independiente del orden de claves');

// T3: familia e identidad por hoja.
assert.equal(c.HVis_familiaHoja('SECTOR_VERDE'), 'VERDE');
assert.equal(c.HVis_familiaHoja('INGRESO_AMARILLO'), 'AMARILLO');
assert.equal(c.HVis_identidad('EVENTOS'), 'GENERAL');
assert.equal(c.HVis_identidad('PACIENTES'), 'GENERAL');
const plant = c.HVis_plantillaParaHoja_('INGRESO_NARANJO');
assert.ok(plant && plant.familia === 'INGRESO' && plant.columnas.length > 0);
ok('T3 familia/identidad por sector y plantilla INGRESO con columnas');

// T4: comparación de familia sin hoja de referencia reporta fallo explícito.
c.Modelo_ss = () => ({ getSheetByName: () => null });
const sinRef = c.HVis_compararFamilia_(['INGRESO_NARANJO', 'INGRESO_VERDE']);
assert.equal(sinRef.ok, false);
assert.equal(sinRef.cantidadDiferencias, 1);
assert.ok(sinRef.diferencias[0].propiedad === 'hoja' || sinRef.diferencias[0].hoja === 'INGRESO_NARANJO');
ok('T4 familia sin hoja de referencia → ok:false con diferencia hoja');

// T5: la verificación final integra la paridad de ambas familias.
c.PropertiesService = { getScriptProperties: () => null };
const ver = c.Presentacion_verificar_();
assert.equal(ver.ok, false, 'sin hojas reales la presentación no converge');
assert.ok(ver.paridadIngreso && ver.paridadSector, 'expone ambas paridades');
assert.ok(Array.isArray(ver.diferencias), 'diferencias consolidadas');
ok('T5 Presentacion_verificar_ agrega paridad INGRESO y SECTOR en el contrato');

// T6: con paridades e inicio convergente, la verificación es ok.
c.Modelo_ss = () => ({ getSheetByName: (nm) => nm === 'INICIO' ? null : null });
c.HVis_compararFamilia_ = () => ({ ok: true, cantidadDiferencias: 0, diferencias: [] });
c.HVis_diagnosticarTodas = () => ({ diagnostico: {} });
const verOk = c.Presentacion_verificar_();
assert.equal(verOk.ok, true);
assert.equal(verOk.pendientes, 0);
ok('T6 paridad convergente y sin pendientes → ok:true');

// T7: divergencia de paridad mantiene ok:false incluso sin pendientes de celdas.
c.HVis_compararFamilia_ = () => ({ ok: false, cantidadDiferencias: 2, diferencias: [
  { hoja: 'INGRESO_AMARILLO', propiedad: 'identidad.colorPrincipal' } ] });
const verDiver = c.Presentacion_verificar_();
assert.equal(verDiver.ok, false);
assert.equal(verDiver.pendientes, 0, 'pendientes de celdas pueden ser 0');
ok('T7 divergencia de paridad bloquea la convergencia aunque no haya pendientes');

console.log('Paridad visual sectores v0.13 — ' + n + '/' + n + ' PASS');