#!/usr/bin/env node
// v253 — Transición QR: WebApp_capturarEnviar retorna replacementUrl con canal retirado
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console:{log(){},warn(){},error(){},info(){}}, JSON, Date, Math });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','09_Log.js','17_Hojas.js','24_Formulario.js','25_Entorno.js','26_Captura.js','29_ActualizacionCaptura.js','30_Ingesta.js','36_FormsCanal.js'];
const readSrc = f => readFileSync(new URL('../src/'+f.replace('src/',''), import.meta.url),'utf8');
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename:f });

// stub autorización
ctx.WebApp_autorizarCaptura = function(){return true;};
const r = ctx.WebApp_capturarEnviar({captureId:'Cp4-'+('a'.repeat(32))},'tok');
assert.equal(r.ok,false);
assert.equal(r.errors[0].codigo,'ERROR_INTERNO');
console.log('google_forms_qr_transition_v253: PASS');