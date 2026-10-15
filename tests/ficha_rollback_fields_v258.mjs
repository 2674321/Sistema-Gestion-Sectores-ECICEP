#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const c = vm.createContext({ console: { log(){}, warn(){}, error(){} }, JSON, Date, Math });
for (const f of ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'])
  vm.runInContext(readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'), c, { filename: f });

const snap = { ID_INTERNO: 'P1', RUT: '12345678-5', SECTOR: 'VERDE', ESTRATIFICACION: 'G2',
  ESTADO: 'ACTIVO', TELEFONOS: '111', OBSERVACIONES: 'antes' };
const esperado = Array.from(c.Modelo_filaDesdeObjeto_(snap));
const idxTel = Array.from(c.Modelo_campos_()).indexOf('TELEFONOS');
c.Modelo_filaFisica_ = () => 4; c.Modelo_invalidarLecturas_ = () => {}; c.Modelo_agregarConflictos_ = () => 1;
c.Modelo_hoja_ = () => ({ getRange: () => ({ setValues() {}, getValues: () => {
  const real = esperado.slice(); real[idxTel] = 'NO_RESTAURADO'; return [real];
} }) });
const r = c.Ficha_rollbackPacienteVerificado_(0, snap, 'FICHA_CAMBIO_SECTOR', ['ID_INTERNO','SECTOR','TELEFONOS','OBSERVACIONES']);
assert.equal(r.ok, false); assert.equal(r.motivo, 'RELECTURA_DIVERGENTE');

console.log('ficha_rollback_fields_v258: PASS');
