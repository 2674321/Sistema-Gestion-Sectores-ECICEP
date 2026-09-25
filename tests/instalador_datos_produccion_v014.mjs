#!/usr/bin/env node
// v0.14.1 — Instalador y producción: default CONSERVAR en producción, INICIAL
// en libro vacío, guards de snapshot (confirmación + backup) y etapa fuentes
// sin snapshot unilateral.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };
const hojaCon = filas => ({ getLastRow: () => filas });
const vacio = () => ({ getSheetByName: () => null });

// T1: detección de producción (criterio conservador, sin versión).
{
  c.Modelo_ss = vacio;
  let e = c.Datos_estadoProduccion_();
  assert.equal(JSON.stringify({ p: e.pacientes, e: e.eventos, prod: e.produccion }),
    JSON.stringify({ p: 0, e: 0, prod: false }));
  const iniP = c.Modelo_dataStartRow(c.HOJAS.PACIENTES);
  const iniE = c.Modelo_dataStartRow(c.HOJAS.EVENTOS);
  c.Modelo_ss = () => ({ getSheetByName: n =>
    n === c.HOJAS.PACIENTES ? hojaCon(iniP + 1233) :
    n === c.HOJAS.EVENTOS ? hojaCon(iniE + 5677) : null });
  e = c.Datos_estadoProduccion_();
  assert.equal(e.pacientes, 1234);
  assert.equal(e.eventos, 5678);
  assert.equal(e.produccion, true);
  assert.equal(e.tienePacientes, true);
  ok('T1 producción detectada por filas reales (1234/5678), vacío sin producción');
}

// T2: producción + AUTO = CONSERVAR sin tocar fuentes.
{
  let llamadas = 0;
  c.Fuentes_cargaReal = () => { llamadas++; return { ok: true }; };
  c.Datos_estadoProduccion_ = () => ({ pacientes: 10, eventos: 20, produccion: true });
  const r = c.Instalar_pFuentes('EJ-1');
  assert.equal(r.ok, true);
  assert.equal(r.omitida, true);
  assert.equal(r.modo, 'CONSERVAR');
  assert.equal(r.motivo, 'DATOS_EXISTENTES_CONSERVADOS');
  assert.equal(llamadas, 0, 'CONSERVAR no lee fuentes para escritura');
  ok('T2 default en producción = CONSERVAR (0 llamadas a fuentes)');
}

// T3: libro vacío + AUTO = INICIAL con mecánica no destructiva.
{
  const seq = [];
  c.Datos_estadoProduccion_ = () => ({ pacientes: 0, eventos: 0, produccion: false });
  c.Fuentes_cargaReal = o => {
    seq.push([o.ejecutar, o.modo]);
    return o.ejecutar
      ? { ok: true, resumen: { registros: 3, nuevos: 3, existentes: 0, revision: 0 } }
      : { ok: true, ejecucionId: 'EJ-I', resumen: {} };
  };
  const r = c.Instalar_pFuentes('EJ-2');
  assert.equal(r.ok, true);
  assert.equal(r.modo, 'INICIAL');
  assert.deepEqual(seq.map(s => s[0]), [false, true], 'dry-run antes de escribir');
  assert.ok(seq.every(s => s[1] !== 'SNAPSHOT_ACTUAL'), 'INICIAL sin snapshot');
  ok('T3 libro vacío ofrece INICIAL (dry-run + escritura no destructiva)');
}

// T4: CONSERVADOR explícito escribe sin reemplazos.
{
  let modoVisto = '';
  c.Datos_estadoProduccion_ = () => ({ pacientes: 5, eventos: 5, produccion: true });
  c.Fuentes_cargaReal = o => {
    modoVisto = o.modo;
    return o.ejecutar
      ? { ok: true, resumen: { registros: 1, nuevos: 1, existentes: 0, revision: 0, merge: {} } }
      : { ok: true, ejecucionId: 'EJ-C', resumen: {} };
  };
  const r = c.Instalar_pFuentes('EJ-3', { modoDatos: 'CONSERVADOR' });
  assert.equal(r.ok, true);
  assert.equal(r.modo, 'CONSERVADOR');
  assert.equal(modoVisto, 'CONSERVADOR');
  ok('T4 sincronización conservadora disponible y explícita');
}

// T5: SNAPSHOT sin confirmación y sin backup queda bloqueado.
{
  let llamadas = 0;
  c.Fuentes_cargaReal = () => { llamadas++; return { ok: true }; };
  const r1 = c.Instalar_pFuentes('EJ-4', { modoDatos: 'SNAPSHOT_ACTUAL' });
  assert.equal(r1.ok, false);
  assert.equal(r1.motivo, 'SNAPSHOT_REQUIERE_CONFIRMACION');
  c.Instalar_asegurarBackup_ = () => ({ ok: false, motivo: 'DISCO_LLENO' });
  const r2 = c.Instalar_pFuentes('EJ-5', { modoDatos: 'SNAPSHOT_ACTUAL', confirmarSnapshot: true });
  assert.equal(r2.ok, false);
  assert.equal(r2.motivo, 'BACKUP_PRE_SNAPSHOT_FALLIDO');
  assert.equal(llamadas, 0, 'bloqueado antes de tocar fuentes');
  ok('T5 snapshot sin confirmación y sin backup = bloqueado');
}

// T6: SNAPSHOT confirmado + respaldado procede con impacto.
{
  c.Instalar_asegurarBackup_ = () => ({ ok: true, skip: true, nombre: 'PRE_INSTALAR_X' });
  c.Fuentes_cargaReal = o => o.ejecutar
    ? { ok: true, resumen: { registros: 4, nuevos: 1, existentes: 3, revision: 1,
        merge: { tipos: { FILL_ONLY: 2, FECHA_MAX: 1, REEMPLAZO_SNAPSHOT: 1 }, conflictos: 0 } } }
    : { ok: true, ejecucionId: 'EJ-S', resumen: {} };
  const r = c.Instalar_pFuentes('EJ-6', { modoDatos: 'SNAPSHOT_ACTUAL', confirmarSnapshot: true });
  assert.equal(r.ok, true);
  assert.equal(r.modo, 'SNAPSHOT_ACTUAL');
  assert.equal(JSON.stringify(r.impacto),
    JSON.stringify({ fillOnly: 2, fechasAdelantadas: 1, reemplazosSnapshot: 1, conflictos: 0 }));
  assert.ok(/reemplazos 1/.test(r.linea) && /respaldo/.test(r.linea));
  ok('T6 snapshot avanzado: impacto con reemplazos + respaldo (' + r.linea + ')');
}

// T7: el diagnóstico expone datos para el bloque DATOS (sin PII).
{
  const src = readFileSync(new URL('20_Instalador.js', root), 'utf8');
  assert.match(src, /diagnostico\.datos = Datos_estadoProduccion_\(\)/);
  ok('T7 diagnóstico con bloque datos (conteos, sin PII)');
}

console.log('Instalador datos producción v0.14 — %d/%d PASS', n, 7);
if (n !== 7) process.exit(1);
