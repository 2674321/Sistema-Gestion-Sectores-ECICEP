#!/usr/bin/env node
// v0.14.2 — Detalle de error útil: r.errores llega al motivo de la subtarea
// con prioridad motivo → linea → errores → fallidas → fallback, con código
// estructurado opcional. La UI consume motivo:string (sin PII, sin stack).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };
const realFormatear = c.Presentacion_formatearHoja_;
const TAREA = { id: 'formato:INGRESO_NARANJO', nombre: 'Formato visual · INGRESO_NARANJO' };

// T1: r.errores llega a la UI (caso del bug reportado).
{
  c.Presentacion_formatearHoja_ = () => ({ ok: false,
    errores: ['INGRESO_NARANJO: FREEZE_ROWS'] });
  const r = c.Presentacion_ejecutarTarea_(TAREA);
  c.Presentacion_formatearHoja_ = realFormatear;
  assert.equal(r.ok, false);
  assert.ok(r.motivo.includes('FREEZE_ROWS'), r.motivo);
  assert.ok(!r.motivo.includes('Falló la subtarea'), 'sin fallback genérico: ' + r.motivo);
  ok('T1 errores con FREEZE_ROWS llegan al motivo (' + r.motivo + ')');
}

// T2: prioridad motivo → linea → errores → fallidas → fallback.
{
  const casos = [
    [{ ok: false, motivo: 'M', linea: 'L', errores: ['E'], fallidas: ['F'] }, 'M'],
    [{ ok: false, linea: 'L', errores: ['E'], fallidas: ['F'] }, 'L'],
    [{ ok: false, errores: ['E'], fallidas: ['F'] }, 'E'],
    [{ ok: false, fallidas: ['F'] }, 'F'],
    [{ ok: false }, 'Falló la subtarea Formato visual']
  ];
  for (const [ret, esperado] of casos) {
    c.Presentacion_formatearHoja_ = () => ret;
    const r = c.Presentacion_ejecutarTarea_(TAREA);
    assert.ok(r.motivo.includes(esperado), JSON.stringify(ret) + ' → ' + r.motivo);
  }
  c.Presentacion_formatearHoja_ = realFormatear;
  ok('T2 prioridad motivo → linea → errores → fallidas → fallback');
}

// T3: código estructurado opcional viaja con el fallo.
{
  c.Presentacion_formatearHoja_ = () => ({ ok: false, motivo: 'x', errores: ['e'],
    codigo: 'PRESENTACION_SIN_CONVERGENCIA' });
  const r = c.Presentacion_ejecutarTarea_(TAREA);
  c.Presentacion_formatearHoja_ = realFormatear;
  assert.equal(r.codigo, 'PRESENTACION_SIN_CONVERGENCIA');
  assert.equal(typeof r.motivo, 'string');
  ok('T3 código estructurado opcional junto al motivo string');
}

// T4: formatearHoja devuelve motivo con actual/esperado + métricas.
{
  c.HVis_reconciliarHoja = () => ({ ok: false, codigo: 'PRESENTACION_HOJA_NO_CONVERGE',
    propiedad: 'FREEZE_ROWS', motivo: 'INGRESO_NARANJO · FREEZE_ROWS actual=0 esperado=3',
    detalles: ['FREEZE_ROWS'] });
  c._modelo_anchosHoja = () => {};
  c.Hojas_aplicarFormatosNumero_ = () => ({ ok: true, aplicados: 0 });
  c.Hojas_aplicarSemanticaColumnas_ = () => ({ ok: true, columnas: 0 });
  c.Modelo_ss = () => ({ getSheetByName: () => ({ getName: () => 'INGRESO_NARANJO' }) });
  const r = c.Presentacion_formatearHoja_('INGRESO_NARANJO');
  assert.equal(r.ok, false);
  assert.ok(r.motivo.includes('actual=0 esperado=3'), r.motivo);
  assert.equal(r.codigo, 'PRESENTACION_HOJA_NO_CONVERGE');
  for (const k of ['estructuraMs', 'anchosMs', 'formatosMs', 'semanticaMs'])
    assert.equal(typeof r[k], 'number', k);
  ok('T4 motivo con actual/esperado + métricas por fase (' + r.motivo + ')');
}

console.log('Presentación error detalle v0.14 — %d/%d PASS', n, 4);
if (n !== 4) process.exit(1);
