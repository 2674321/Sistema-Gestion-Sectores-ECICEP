#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const c = vm.createContext({ console: { log(){}, warn(){}, error(){} }, JSON, Date, Math });
for (const f of ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'])
  vm.runInContext(readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'), c, { filename: f });

const detalle = JSON.stringify({ idInterno: 'P1', idEvento: 'E1', anterior: 'G1', nuevo: 'G2', revisionPrevia: false });
const rows = [['FECHA','TIPO','ID','','','DETALLE','','','ESTADO'], [new Date(),'CAMBIO_ESTRATIFICACION_PENDIENTE','P1','','',detalle,'','','ABIERTO']];
let resoluciones = 0;
const hoja = { getLastRow: () => rows.length, getRange: (r, col) => ({
  setValue(v) { rows[r - 1][col - 1] = v; resoluciones++; },
  getValue() { return rows[r - 1][col - 1]; }
}) };
c.Modelo_hoja_ = n => n === c.HOJAS.CONFLICTOS ? hoja : null;
c.Utl_leerBloque_ = () => rows.map(x => x.slice());
c.Modelo_leerEventosCampos_ = () => [{ ID_EVENTO: 'E1' }];
c.Modelo_buscarPaciente_ = () => ({ idx: 0, obj: { ID_INTERNO: 'P1', ESTRATIFICACION: 'G2', REQUIERE_REVISION: true } });
c.Ficha_escribirPacienteVerificado_ = () => ({ ok: false, verificado: false });
let r = c.Ficha_reconciliarEstratificacionPendiente_();
assert.equal(r.resueltos, 0); assert.equal(r.fallidos, 1); assert.equal(rows[1][8], 'ABIERTO');
c.Ficha_escribirPacienteVerificado_ = () => ({ ok: true, verificado: true });
r = c.Ficha_reconciliarEstratificacionPendiente_();
assert.equal(r.marcasLimpiadas, 1); assert.equal(r.resueltos, 1); assert.equal(rows[1][8], 'RESUELTO');
const otra = c.Ficha_reconciliarEstratificacionPendiente_();
assert.equal(otra.pendientes, 0); assert.equal(resoluciones, 1, 'segunda corrida idempotente');

console.log('estrat_reconcile_v258: PASS');
