#!/usr/bin/env node
// v253 — Adapter: determinismo captureId sha256, acciones, validación básica
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console:{log(){},warn(){},error(){},info(){}}, JSON, Date, Math });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','17_Hojas.js','24_Formulario.js','26_Captura.js','30_Ingesta.js','36_FormsCanal.js'];
const readSrc = f => readFileSync(new URL('../src/'+f.replace('src/',''), import.meta.url),'utf8');
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename:f });

// determinismo
const cid = ctx.CapturaIngress_captureId_('f1','r1');
assert.equal(cid, 'Cp4-'+ctx.CapturaIngress_sha256Hex_('GOOGLE_FORMS|f1|r1'));
const c2 = ctx.CapturaIngress_captureId_('f1','r1');
assert.equal(cid,c2);
console.log('google_forms_adapter_v253: PASS');