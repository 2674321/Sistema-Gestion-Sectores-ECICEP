#!/usr/bin/env node
// v0.14.2 — Convergencia de HVis: FREEZE_ROWS/FREEZE_COLUMNS se reparan (no
// solo se detectan), hoja correcta = 0 writes, firma anti-no-convergencia y
// retry que converge. Sin tocar datos.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };
const realPendientes = c.HVis_pendientesVisual;
const realSecciones = c.HVis_aplicarSecciones;

// Hoja simulada con freeze mutable y contadores de escritura.
function hojaFreeze(nombre, rows, cols, congelarEscritura) {
  const st = { rows, cols, sets: [] };
  return {
    hoja: {
      getName: () => nombre,
      getFrozenRows: () => st.rows,
      getFrozenColumns: () => st.cols,
      setFrozenRows: v => { st.sets.push(['rows', v]); if (!congelarEscritura) st.rows = v; },
      setFrozenColumns: v => { st.sets.push(['cols', v]); if (!congelarEscritura) st.cols = v; }
    },
    st
  };
}
// Pendientes simulados desde el estado de freeze (estructura siempre OK).
function pendientesDesdeFreeze(st) {
  const p = [];
  if (st.rows !== 3) p.push('FREEZE_ROWS');
  if (st.cols !== 0) p.push('FREEZE_COLUMNS');
  return p;
}
function conFreeze(st) {
  c.HVis_pendientesVisual = () => ({ pendientes: pendientesDesdeFreeze(st) });
  c.HVis_aplicarSecciones = () => ({ estado: 'OK', secciones: 0 });
}

// T1: solo FREEZE_ROWS converge y corrige.
{
  const { hoja, st } = hojaFreeze('INGRESO_NARANJO', 0, 0);
  conFreeze(st);
  const r = c.HVis_reconciliarHoja(hoja);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(st.sets, [['rows', 3]], 'un solo setter al valor contractual');
  assert.ok((r.freezeReparado || []).includes('FREEZE_ROWS'));
  ok('T1 solo FREEZE_ROWS → corrige a 3 y converge');
}

// T2: solo FREEZE_COLUMNS converge y corrige.
{
  const { hoja, st } = hojaFreeze('INGRESO_NARANJO', 3, 2);
  conFreeze(st);
  const r = c.HVis_reconciliarHoja(hoja);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(st.sets, [['cols', 0]], 'respeta el contrato (0, sin merges en riesgo)');
  ok('T2 solo FREEZE_COLUMNS → corrige a 0 y converge');
}

// T3: hoja correcta = 0 escrituras.
{
  const { hoja, st } = hojaFreeze('INGRESO_NARANJO', 3, 0);
  conFreeze(st);
  const r = c.HVis_reconciliarHoja(hoja);
  assert.equal(r.ok, true);
  assert.equal(st.sets.length, 0, 'fast-path: valor correcto → 0 setters');
  ok('T3 hoja correcta → ok con 0 setters visuales');
}

// T4: retry converge (2.ª pasada limpia, cursor del motor puede avanzar).
{
  const { hoja, st } = hojaFreeze('INGRESO_NARANJO', 0, 0);
  conFreeze(st);
  const r1 = c.HVis_reconciliarHoja(hoja);
  assert.equal(r1.ok, true, 'primera repara');
  const antes = st.sets.length;
  const r2 = c.HVis_reconciliarHoja(hoja);
  assert.equal(r2.ok, true, 'segunda ya está convergida');
  assert.equal(st.sets.length, antes, 'retry sin drift = sin escrituras');
  ok('T4 retry: primera repara, segunda pasa en limpio (sin loop)');
}

// T5: AMARILLO y VERDE convergen igual.
for (const hojaNombre of ['INGRESO_AMARILLO', 'INGRESO_VERDE']) {
  const { hoja, st } = hojaFreeze(hojaNombre, 1, 0);
  conFreeze(st);
  const r = c.HVis_reconciliarHoja(hoja);
  assert.equal(r.ok, true, hojaNombre + ': ' + JSON.stringify(r));
}
ok('T5 INGRESO_AMARILLO e INGRESO_VERDE convergen ante drift de freeze');

// T6: SECTOR_* convergen igual.
for (const hojaNombre of ['SECTOR_NARANJO', 'SECTOR_AMARILLO', 'SECTOR_VERDE']) {
  const { hoja, st } = hojaFreeze(hojaNombre, 3, 1);
  conFreeze(st);
  const r = c.HVis_reconciliarHoja(hoja);
  assert.equal(r.ok, true, hojaNombre + ': ' + JSON.stringify(r));
}
ok('T6 SECTOR_NARANJO/AMARILLO/VERDE convergen ante drift de freeze');

// T7: sin convergencia = FAIL explícito con código (no loop silencioso).
{
  const { hoja, st } = hojaFreeze('INGRESO_NARANJO', 0, 0, true);
  conFreeze(st);
  const r = c.HVis_reconciliarHoja(hoja);
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'PRESENTACION_SIN_CONVERGENCIA');
  assert.ok(/no modificó el drift/.test(r.motivo), r.motivo);
  assert.ok(r.motivo.includes('INGRESO_NARANJO') && r.motivo.includes('FREEZE_ROWS'));
  ok('T7 drift irreparable → PRESENTACION_SIN_CONVERGENCIA con causa exacta');
}

// T8: firma de pendientes estable e independiente del orden.
{
  const a = c.HVis_firmaPendientes_(['FREEZE_ROWS', 'ANCHO:OBSERVACIONES']);
  const b = c.HVis_firmaPendientes_(['ANCHO:OBSERVACIONES', 'FREEZE_ROWS']);
  assert.equal(a, b, 'orden independiente');
  assert.notEqual(a, c.HVis_firmaPendientes_(['FREEZE_ROWS']), 'distingue drifts distintos');
  ok('T8 firma de pendientes estable para detectar no-convergencia');
}

// T9: estado compuesto 'OK → OK' con ok:true NO es fallo (regresión del
// retry de INGRESO_NARANJO: comparar el compuesto con 'OK' fallaba siempre).
{
  const { hoja, st } = hojaFreeze('INGRESO_NARANJO', 3, 0);
  let reparado = false;
  c.HVis_pendientesVisual = () => ({ pendientes: reparado ? [] : ['encabezados fondo≠#000000'] });
  c.HVis_aplicarSecciones = () => { reparado = true; return { ok: true, estado: 'OK → OK', secciones: 4 }; };
  const r = c.HVis_reconciliarHoja(hoja);
  assert.equal(r.ok, true, 'reparación real exitosa no se reporta como fallo: ' + JSON.stringify(r));
  ok('T9 estado compuesto OK → OK con ok:true converge (sin falso fallo)');
}

c.HVis_pendientesVisual = realPendientes;
c.HVis_aplicarSecciones = realSecciones;

console.log('Presentación convergencia freeze v0.14 — %d/%d PASS', n, 9);
if (n !== 9) process.exit(1);
