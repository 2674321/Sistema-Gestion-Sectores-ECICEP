#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const c = vm.createContext({ console: { log(){}, warn(){}, error(){} }, JSON, Date, Math });
for (const f of ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js'])
  vm.runInContext(readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'), c, { filename: f });
c.Modelo_headerRow_ = () => 3;
c.Ingresos_layoutHoja_ = () => ({ mapa: { campos: { RUT: 0 }, notaIdx: 1 } });

function ejecutar({ filas, mode = 'normal', rut = '12345678-5', captureId = '' }) {
  let movida = false;
  const hoja = {
    getLastRow: () => filas.length, getLastColumn: () => 2,
    getRange(r, col, nr, nc) {
      if (mode === 'moved' && !movida) { filas[3] = ['99999999-9', 'otra']; movida = true; }
      return { getValues: () => Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => (filas[r - 1 + i] || [])[col - 1 + j] || '')) };
    },
    deleteRows(r) {
      if (mode === 'throw') throw new Error('DELETE_DOWN');
      if (mode !== 'noop') filas.splice(r - 1, 1);
    }
  };
  c.Modelo_hoja_ = () => hoja;
  return c.Ingresos_eliminarOrigenConfirmado_([{ estado: 'INGRESADO', vistaSectorConfirmada: true,
    estadoIngresoConfirmado: true, hoja: 'INGRESO_VERDE', filaOrigen: 4, rutOrigen: rut,
    captureIdOrigen: captureId, advertencias: [] }]);
}

const base = () => [['t'], ['s'], ['RUT','NOTA'], ['12345678-5','CAP-1'], ['22222222-2','CAP-2']];
let r = ejecutar({ filas: base(), captureId: 'CAP-1' });
assert.equal(r.ok, true); assert.equal(r.eliminadas, 1); assert.equal(r.verificadas, 1);
r = ejecutar({ filas: base(), mode: 'throw', captureId: 'CAP-1' });
assert.equal(r.ok, false); assert.equal(r.eliminadas, 0); assert.equal(r.fallidas[0].motivo, 'ORIGEN_DELETE_FALLIDO');
r = ejecutar({ filas: base(), mode: 'noop', captureId: 'CAP-1' });
assert.equal(r.ok, false); assert.equal(r.eliminadas, 1); assert.equal(r.verificadas, 0);
const iguales = [['t'],['s'],['RUT','NOTA'],['12345678-5','manual'],['12345678-5','manual']];
r = ejecutar({ filas: iguales });
assert.equal(r.ok, false); assert.equal(r.fallidas[0].motivo, 'ORIGEN_ELIMINACION_INCIERTA');
r = ejecutar({ filas: base(), mode: 'moved', captureId: 'CAP-1' });
assert.equal(r.eliminadas, 0); assert.equal(r.fallidas[0].motivo, 'ORIGEN_IDENTIDAD_CAMBIO');

console.log('ingresos_delete_verify_v258: PASS');
