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
    createTextFinder: buscado=>({matchEntireCell:()=>({findNext:()=>{
      for(let i=0;i<vals.length;i++){
        for(let j=0;j<(vals[i]||[]).length;j++){
          if(String((vals[i]||[])[j])===String(buscado)) return {getRow:()=>i+1};
        }
      }
      return null;
    }})})
  }
}
const ctx=vm.createContext({console:{log(){},warn(){},error(){}},JSON,Date,Math});
const orden=['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for(const f of orden){vm.runInContext(readSrc(f),ctx,{filename:f});}
const h=hojaFake([Array.from(ctx.Form_columnas())]);
ctx.Modelo_hoja=()=>h; ctx.Captura_v2_ahora=()=>''; ctx.Session={getActiveUser:()=>({getEmail:()=>'t@e.cl'})}; ctx.Hojas_asegurarCapacidadGestionada_=()=>{};
const payload={captureId:'Cp4-'+('b'.repeat(32)),accion:'nuevoIngreso',rut:'12345678-5',nombre:'TEST PERSONA',fechaNacimiento:'1990-01-01',sector:'VERDE',fechaIngreso:'2026-09-01',profesional:'Matrona/o'};
const reg=ctx.Captura_v2_nuevoRegistro(payload,{usuario:'t',fechaRecepcion:'2026-09-16'});
const r1=ctx.Captura_v2_persistirRegistro(reg);
assert.equal(r1.ok,true,'primer persist debe ser ok');
const r2=ctx.Captura_v2_persistirRegistro(reg);
assert.equal(r2.ok,false,'segundo persist con mismo captureId debe fallar');
assert.equal(h.val.length,2,'solo una fila debe persistirse');
console.log('captureid writer integridad vNEXT: PASS');
