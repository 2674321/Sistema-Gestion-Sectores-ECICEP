#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const c = vm.createContext({ console });
for (const f of readdirSync(new URL('../src/', import.meta.url)).filter(f => /\.(js|gs)$/.test(f)).sort())
  vm.runInContext(readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'), c, { filename: f });
const conv = vm.runInContext('Hojas_columnaA1_', c);
assert.deepEqual([1,26,27,30,52,53].map(conv), ['A','Z','AA','AD','AZ','BA']);
const ux = vm.runInContext('HOJAS_UX', c);
assert.equal(ux.PACIENTES.frozenRows, 3); assert.equal(ux.PACIENTES.frozenColumns, 0);
assert.equal(ux.EVENTOS.frozenRows, 1); assert.equal(ux.EVENTOS.frozenColumns, 1);
const orden = vm.runInContext('Hojas_ordenObjetivo_()', c);
assert.deepEqual(Array.from(orden).slice(0, 9), ['INICIO','PACIENTES','INGRESO_NARANJO','INGRESO_AMARILLO','INGRESO_VERDE','SECTOR_NARANJO','SECTOR_AMARILLO','SECTOR_VERDE','REM_SALIDA']);
assert.equal(vm.runInContext("Hojas_esProteccionEcicep_({getDescription:function(){return 'ECICEP: sistema';}})", c), true);
assert.equal(vm.runInContext("Hojas_esProteccionEcicep_({getDescription:function(){return 'Protección clínica local';}})", c), false);
assert.equal(vm.runInContext("Hojas_validacionCampo_('ESTADO_INGRESO').tipo", c), 'LISTA');
assert.equal(vm.runInContext("Hojas_validacionCampo_('FECHA DE NACIMIENTO').tipo", c), 'FECHA');
const hojas = readFileSync(new URL('../src/17_Hojas.js', import.meta.url), 'utf8');
assert.match(hojas, /Hojas_esProteccionEcicep_\(pr\)/);
assert.doesNotMatch(hojas, /String\.fromCharCode\(64\s*\+/);
console.log('Hojas visual v0.12 — 13/13 PASS');
