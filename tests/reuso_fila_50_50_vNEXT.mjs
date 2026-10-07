#!/usr/bin/env node
// vNEXT — Causa raíz 50/50 (post-aed3567): la fila física reutilizada marcaba
// "yaIncorporado" con el evento de OTRO paciente (FUENTE física archivo|hoja|fila).
// Con la marca durable 'FORM|CpN-…|<ACCIÓN>' el staging lleva CAPTURE_ID y la
// idempotencia se demuestra SOLO contra la identidad lógica (captureId), nunca
// contra coordenadas físicas. Escenario §9 combinado VERDE + AMARILLO:
//   1P: 50 capturas del mismo RUT sobre la MISMA fila física (reutilizada 50 veces)
//       → TODAS crean su evento; NINGUNA es "yaIncorporado" (era el síntoma 0/50).
//   2:  retry del mismo captureId → yaIncorporado contra SU PROPIO evento.
//   3:  otra persona en la fila reutilizada → nuevo paciente+evento.
//   4:  fila legacy (sin marca) re-importada → se registra (evidencia física);
//       ya no colisiona con la marca durable de captura.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

const mkStaging = (sector, rut, nombre, fecha, filaFisica, captureIdMarca) => {
  const v = { NOMBRE: nombre, RUT: rut, SEXO: 'F', FECHA_NACIMIENTO: '1980-05-10',
    TELEFONOS: '900000000', ESTRATIFICACION: 'G2', FECHA_INGRESO: fecha,
    DUPLA_INGRESO: '', OBSERVACIONES: 'obs de ingreso' };
  const fila = ctx.Fuentes_normalizar(ctx.Fuentes_crearFila(
    { archivo: 'HOJA_INGRESO', hoja: 'INGRESO_' + sector, fila: String(filaFisica), sector: sector }, v));
  if (captureIdMarca) fila.CAPTURE_ID = captureIdMarca;
  return fila;
};

const cap = n => 'Cp4-' + String(n).padStart(2, '0').repeat(16);
// 50 fechas DISTINTAS: el dedupe same-day (paciente+fecha) no dispara y solo la
// identidad durable (captureId) decide, que es exactamente el §9 de la causa raíz.
const fecha50 = i => '2026-' + String((i % 12) + 1).padStart(2, '0') + '-' + String((i % 28) + 1).padStart(2, '0');

let store = { pacientes: [], eventos: [] };

// Caso 1P: 50 capturas del mismo RUT, fila física 4 reutilizada.
const lotes50 = [];
for (let i = 0; i < 50; i++) {
  lotes50.push(mkStaging('VERDE', '12345678-5', 'PACIENTE X',
    fecha50(i), 4, cap(i)));
}
const s1 = ctx.Ingresos_procesarFilas(lotes50, store, {});
assert.equal(s1.resumen.leidos, 50, 'se leen las 50 filas del lote repetido');
assert.equal(s1.resumen.yaIncorporados, 0, 'NADIE fue marcado yaIncorporado (era el 0/50)');
assert.equal(s1.resumen.eventosCreados, 50, 'las 50 capturas generan su propio evento INGRESO');
assert.equal(s1.resumen.nuevos, 1, 'un solo paciente (mismo RUT)');
assert.equal(store.pacientes.length, 1, 'un único paciente persistido');
assert.equal(store.eventos.length, 50, '50 eventos INGRESO con FUENTE durable distinta');
assert.equal(s1.resultados.length, 50, 'conservación de masa: 50 filas → 50 resultados');
assert.equal(s1.resultados.every(r => r.estado === 'INGRESADO'), true, 'todas INGRESADO');

// Cada evento conserva SU captura como FUENTE (y no la coordenada física).
const fuentes = new Set(store.eventos.map(e => e.FUENTE));
assert.equal(fuentes.size, 50, '50 FUENTE durables únicas por captureId');
assert.equal(store.eventos.some(e => e.FUENTE === 'HOJA_INGRESO|VERDE|4'), false,
  'ningún evento moderno se identifica por coordenada física');

// Caso 2: retry del captureId 0 con FECHA DIFERENTE (misma fila física) →
// yaIncorporado contra SU PROPIO evento durable (no por same-day).
const retry = ctx.Ingresos_procesarFilas(
  [mkStaging('VERDE', '12345678-5', 'PACIENTE X', '2026-11-15', 4, cap(0))],
  store, {});
assert.equal(retry.resultados.length, 1, 'retry tiene resultado');
assert.equal(retry.resultados[0].yaIncorporado, true, 'retry = yaIncorporado (idempotencia por captureId)');
assert.equal(store.eventos.length, 50, 'el retry NO suma evento');

// Caso 3: OTRA persona en la fila reutilizada 4 → nuevo, sin colisión.
const s3 = ctx.Ingresos_procesarFilas(
  [mkStaging('VERDE', '87654321-4', 'PACIENTE Y', '2026-09-10', 4, cap(51))],
  store, {});
assert.equal(s3.resultados[0].yaIncorporado, false, 'otra persona = nueva captura');
assert.equal(s3.resumen.nuevos, 1, 'crea su paciente');
assert.equal(store.pacientes.length, 2, '1 (RUT X) + 1 (persona Y) en total');

// Caso 4: fila legacy (sin marca) de la MISMA coordenada física 4 re-importada.
// La persona X re-ingresada a mano NO debe quedar atrapada por eventos modernos.
const s4 = ctx.Ingresos_procesarFilas(
  [mkStaging('VERDE', '12345678-5', 'PACIENTE X', '2027-01-05', 4, null)],
  store, {});
assert.equal(s4.resultados[0].estado, 'INGRESADO', 'legacy igual ingresa');
assert.equal(s4.resultados[0].yaIncorporado, false, 'legacy no colisiona con FUENTE durable');

// §9 AMARILLO: reutilización de fila también en INGRESO_AMARILLO (fixture 2).
let storeA = { pacientes: [], eventos: [] };
const sA = ctx.Ingresos_procesarFilas([
  mkStaging('AMARILLO', '55555555-5', 'PACIENTE Z', '2026-09-01', 4, cap(100)),
  mkStaging('AMARILLO', '55555555-5', 'PACIENTE Z', '2026-09-02', 4, cap(101))
], storeA, {});
assert.equal(sA.resumen.yaIncorporados, 0, 'AMARILLO: ninguna yaIncorporado');
assert.equal(sA.resumen.eventosCreados, 2, 'AMARILLO: 2 eventos de captura por misma fila');
assert.equal(sA.resumen.nuevos, 1, 'AMARILLO: un paciente (mismo RUT)');
assert.equal(sA.resultados.every(r => r.estado === 'INGRESADO' && r.yaIncorporado === false), true,
  'AMARILLO: ambas INGRESADO nuevas');

console.log('Reuso fila 50/50 vNEXT: PASS');