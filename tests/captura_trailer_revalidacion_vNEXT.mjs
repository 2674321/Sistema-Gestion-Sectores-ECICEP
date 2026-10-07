#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

function hojaFake(vals) {
  const set = (r,c,v)=>{while(vals.length<r)vals.push([]);const row=vals[r-1];while(row.length<c)row.push('');row[c-1]=v};
  const finder = (buscado) => ({ matchEntireCell: (prev) => ({ findNext: () => {
    for(let i=0;i<vals.length;i++){ for(let j=0;j<(vals[i]||[]).length;j++){ if(`${vals[i][j]}`===String(buscado)) return {getRow:()=>i+1}; } }
    return null;
  }}) });
  return {
    get val(){return vals}, getName:()=>vals.__nombre||'', getLastRow:()=>vals.length,
    getLastColumn:()=>vals.reduce((m,r)=>Math.max(m,r.length),0),
    getRange:(a,b,c,d)=>{
      if(typeof a==='number'){
        const nr=c??1,nc=d??1;
        const mk={
          getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(vals[a-1+i]||[])[b-1+j]??'')),
          setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))),
          setValue:v=>set(a,b,v),
          createTextFinder:(b)=>finder(b)
        };
        return mk;
      }
      return {getValues:()=>[[(vals[a-1]||[])[b-1]??'']], setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))), createTextFinder:(b)=>finder(b)};
    },
    insertColumns: function(){},
    createTextFinder: (b) => finder(b)
  }
}

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

const capid = 'Cp4-' + 'c'.repeat(32);
const headers = Array.from(ctx.Form_columnas());
const h = hojaFake([headers]);
const ss = { getSheetByName: (n) => { if (n === 'FORM_RESPUESTAS') return h; return hojaFake([]); }, insertSheet: (n) => hojaFake([headers]) };
ctx.Modelo_ss = () => ss;
ctx.Modelo_hoja = (n) => ss.getSheetByName(n);
ctx.Captura_v2_ahora = () => '2026-09-16 10:00:00';
ctx.Session = { getActiveUser: () => ({ getEmail: () => 't@e.cl' }) };
ctx.Hojas_asegurarCapacidadGestionada_ = () => {};

const payload = { captureId: capid, accion: 'nuevoIngreso', rut: '12345678-5', nombre: 'T P', fechaNacimiento: '1990-01-01', sector: 'VERDE', fechaIngreso: '2026-09-01', profesional: 'M' };
const reg = ctx.Captura_v2_nuevoRegistro(payload, { usuario: 't', fechaRecepcion: '2026-09-16' });
const r1 = ctx.Captura_v2_persistirRegistro(reg);
assert.equal(r1.ok, true, 'persist inicial ok');

// Trailer normal sobre la fila correcta → ok
const trailer = ctx.Captura_v2_actualizarTrailer(capid, { estado: 'PROCESADO' }, reg);
assert.equal(trailer.ok, true, 'trailer sobre fila legítima ok');

// Revalidación: trailer dirigido a OTRA fila física (fila 99, no corresponde al captureId) → diverge
const divergente = ctx.Captura_v2_actualizarTrailer('Cp4-' + 'd'.repeat(32), { estado: 'PROCESADO' }, { filaFisica: 99 });
assert.equal(divergente.ok, false);
assert.equal(divergente.motivo, 'CAPTUREID_DIVERGENTE');

console.log('Captura trailer revalidación vNEXT: PASS');
