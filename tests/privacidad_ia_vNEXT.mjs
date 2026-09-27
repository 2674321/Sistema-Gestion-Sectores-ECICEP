#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';
const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}},Set});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
c.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>({})})};
c.IA_leerBloque=()=>[['RUT','NOMBRE','CONDICIONES','SALUD_MENTAL','SECTOR','ESTRATIFICACION','OBSERVACIONES','PROFESIONAL','FECHA_EVENTO'],['11.111.111-1','PERSONA FICTICIA','DM2','SI','NARANJO','G2','texto clínico','PROFESIONAL X','2026-09-01']];
const stats=c.IA_leerEstadisticas(c.HOJAS.PACIENTES),serial=JSON.stringify(stats);
for(const campo of stats.campos)assert.equal(campo.ejemplos.length,0,campo.nombre+' no exporta ejemplos');
for(const secreto of ['11.111.111-1','PERSONA FICTICIA','DM2','NARANJO','G2','texto clínico','PROFESIONAL X','2026-09-01'])assert.equal(serial.includes(secreto),false,secreto+' no sale');
let llamada;c.PropertiesService={getScriptProperties:()=>({getProperty:()=> 'api-key-ficticia'})};
c.UrlFetchApp={fetch:(url,opt)=>{llamada={url,opt};return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({candidates:[{content:{parts:[{text:'ok'}]}}]})}}};
assert.equal(c.IA_llamarGemini_('solo agregados',{temperature:0}),'ok');
assert.equal(llamada.url.includes('api-key-ficticia'),false,'API key fuera de URL');
assert.equal(llamada.opt.headers['x-goog-api-key'],'api-key-ficticia');
assert.equal(JSON.parse(llamada.opt.payload).generationConfig.temperature,0,'temperature=0 se conserva');
assert.equal(c.IA_CONFIG.MODEL,'gemini-3.6-flash');
console.log('Privacidad IA vNEXT: PASS');
