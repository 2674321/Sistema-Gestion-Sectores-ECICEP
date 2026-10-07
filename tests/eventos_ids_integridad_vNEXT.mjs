#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

function hojaFake(vals) {
  const set = (r,c,v)=>{while(vals.length<r)vals.push([]);const row=vals[r-1];while(row.length<c)row.push('');row[c-1]=v};
  return {
    get val(){return vals}, getName:()=>vals.__nombre||'', getLastRow:()=>vals.length,
    getLastColumn:()=>vals.reduce((m,r)=>Math.max(m,r.length),0),
    getRange:(a,b,c,d)=>{
      if(typeof a==='number'){const nr=c??1,nc=d??1;const mk={getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(vals[a-1+i]||[])[b-1+j]??'')),setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))),setValue:v=>set(a,b,v)};return mk;}
      return{getValues:()=>[[(vals[a-1]||[])[b-1]??'']],setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v)))}
    },
    insertColumns: function(){},
    createTextFinder: buscado=>({matchEntireCell:()=>({findNext:()=>{
      for(let i=0;i<vals.length;i++){ for(let j=0;j<(vals[i]||[]).length;j++){ if(String((vals[i]||[])[j])===String(buscado)) return {getRow:()=>i+1}; } }
      return null;
    }})})
  }
}

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

const hEv = hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)]);
const ss = { getSheetByName: (n) => { if (n === 'EVENTOS') return hEv; return hojaFake([]); }, insertSheet: (n) => { const h=hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)]); return h; } };
ctx.Modelo_ss = () => ss;
ctx.Modelo_hoja = (n) => ss.getSheetByName(n);
ctx.Session = { getActiveUser: () => ({ getEmail: () => 't@e.cl' }) };

const colIdx = {};
Array.from(ctx.COLUMNAS_EVENTOS).forEach((c,i)=>colIdx[c]=i);

// Evento válido con ID_EVENTO
const ok = ctx.Modelo_agregarEventos_([{ ID_EVENTO: 'EV-0001', ID_INTERNO: 'P-0001', TIPO_EVENTO: 'INGRESO', FUENTE: 'FORM|Cp4-' + 'a'.repeat(32) + '|INGRESO' }], 't', { autorizacion: 'IMPORT_AUTORIZADO' });
assert.equal(ok, 1, 'debe persistir un evento válido');

// ID_EVENTO vacío → rechazo explícito
assert.throws(() => ctx.Modelo_agregarEventos_([{ ID_EVENTO: '', ID_INTERNO: 'P-0002', TIPO_EVENTO: 'INGRESO', FUENTE: 'x' }], 't', { autorizacion: 'IMPORT_AUTORIZADO' }), /EVENTO_SIN_ID_EVENTO/);

// ID_EVENTO duplicado en lote → rechazo
assert.throws(() => ctx.Modelo_agregarEventos_([
  { ID_EVENTO: 'EV-0099', ID_INTERNO: 'P-0003', TIPO_EVENTO: 'INGRESO', FUENTE: 'y' },
  { ID_EVENTO: 'EV-0099', ID_INTERNO: 'P-0004', TIPO_EVENTO: 'INGRESO', FUENTE: 'z' }
], 't', { autorizacion: 'IMPORT_AUTORIZADO' }), /EVENTO_ID_DUPLICADO_EN_LOTE/);

console.log('Eventos IDs integridad vNEXT: PASS');
