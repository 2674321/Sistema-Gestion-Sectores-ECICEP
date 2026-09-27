#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const src=new URL('../src/',import.meta.url);
const ingresos=readFileSync(new URL('12_Ingresos.js',src),'utf8');
const ini=ingresos.indexOf('function Ingresos_diagnosticarIngresados_'),fin=ingresos.indexOf('function Ingresos_reconciliarIngresados_',ini),diag=ingresos.slice(ini,fin);
assert.doesNotMatch(diag,/createTextFinder|Eventos_buscarPorFuente_|Modelo_buscarPaciente/,'diagnóstico global debe ser in-memory tras lecturas batch');
assert.match(diag,/eventosPorFuente/);assert.match(diag,/vistasPorSector/);
const norm=readFileSync(new URL('02_Normalizacion.js',src),'utf8');const c0=norm.indexOf('function Control_recalcularCaches_'),cache=norm.slice(c0);
assert.doesNotMatch(cache,/getRange\(Modelo_dataStartRow\(HOJAS\.PACIENTES\),\s*1,\s*filas\.length,\s*MODELO_PACIENTE\.length\)/,'un cache no reescribe PACIENTES completo');
assert.match(cache,/Utl_gruposContiguosFilas/);
const modelo=readFileSync(new URL('06_Modelo.js',src),'utf8');const v0=modelo.indexOf('function Modelo_refrescarVistasSectores_'),vista=modelo.slice(v0,modelo.indexOf('function Modelo_leerEventos',v0));
assert.doesNotMatch(vista,/getMaxRows\(\)/,'vista pequeña no limpia capacidad física');assert.match(vista,/getLastRow\(\)/);
console.log('Integridad rendimiento vNEXT: I/O batch y escrituras selectivas PASS');
