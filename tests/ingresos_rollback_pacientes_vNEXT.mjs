#!/usr/bin/env node
// vNEXT — P0 transaccional: si el lote de EVENTOS falla tras anexar PACIENTES
// nuevos, las filas anexadas se retiran (rollback) para que el reintento del
// mismo lote converja sin huérfanos ni duplicados.
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
    deleteRow: (fila) => { if (fila >= 1 && fila <= vals.length) vals.splice(fila - 1, 1); },
    createTextFinder: () => ({ matchEntireCell: () => ({ findNext: () => null }) })
  };
}

function libro() {
  const cols = Array.from(ctx.MODELO_PACIENTE.map(c => c.campo));
  // PACIENTES es una hoja visual: encabezados en fila física 3, datos desde 4.
  const pac = hojaFake([['TITULO'], ['SECCION'], cols]);
  const ev = hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)]);
  const ss = {
    getSheetByName: (n) => {
      if (n === 'PACIENTES') return pac;
      if (n === 'EVENTOS') return ev;
      return hojaFake([]);
    },
    insertSheet: (n) => { const h = hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)]); h.val.__nombre = n; return h; }
  };
  ctx.Modelo_ss = () => ss;
  ctx.Modelo_hoja = (n) => ss.getSheetByName(n);
  ctx.Session = { getActiveUser: () => ({ getEmail: () => 't@e.cl' }) };
  if (typeof ctx.Modelo_invalidarLecturas === 'function') ctx.Modelo_invalidarLecturas();
  return { pac, ev };
}

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

const cols = Array.from(ctx.MODELO_PACIENTE.map(c => c.campo));
function paciente(id, rut) {
  const o = { ID_INTERNO: id, RUT: rut, NOMBRE: 'P ' + id, SECTOR: 'VERDE', ESTRATIFICACION: 'G1', FUENTE: 'CAPTURA|' + rut };
  return o;
}

// ── Fase A: append normal agrega exactamente N filas ────────────────────────
let lib = libro();
const anexados = [paciente('P-0001', '11111111-1'), paciente('P-0002', '22222222-2')];
const nA = ctx.Modelo_agregarPacientes_(anexados, { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ingresos-pacientes' });
assert.equal(nA, 2, 'agrega 2 pacientes');
assert.equal(lib.pac.val.length, 5, 'title+seccion+header + 2 filas');
assert.equal(ctx.Modelo_leerPacientes().length, 2, '2 pacientes legibles');

// ── Fase B: rollback retira exactamente las filas anexadas ──────────────────
lib = libro();
ctx.Modelo_agregarPacientes_(anexados, { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ingresos-pacientes' });
const rb = ctx.Ingresos_rollbackPacientesNuevos_(0);
assert.equal(rb.eliminadas, 2, 'rollback de 2 filas anexadas');
assert.equal(lib.pac.val.length, 3, 'quedó solo el encabezado (título+sección+header)');
assert.equal(ctx.Modelo_leerPacientes().length, 0, 'sin pacientes luego del rollback');

// ── Fase C: rollback retira solo la fila nueva cuando ya existía 1 previa ───
lib = libro();
ctx.Modelo_agregarPacientes_([paciente('P-0000', '99999999-9')], { autorizacion: 'IMPORT_AUTORIZADO' });
// 1 paciente preexistente (antesNuevos=1). Append de 1 nuevo → 2 en total.
ctx.Modelo_agregarPacientes_([paciente('P-0001', '11111111-1')], { autorizacion: 'IMPORT_AUTORIZADO' });
const rb2 = ctx.Ingresos_rollbackPacientesNuevos_(1);
assert.equal(rb2.eliminadas, 1, 'rollback de 1 fila anexada');
assert.equal(ctx.Modelo_leerPacientes().length, 1, 'queda el preexistente');
assert.equal(ctx.Modelo_leerPacientes()[0].ID_INTERNO, 'P-0000', 'el preexistente NO se toca');

// ── Fase D: segunda llamada idempotente con count ya consistente ────────────
lib = libro();
const antesD = ctx.Modelo_leerPacientes().length;
ctx.Modelo_agregarPacientes_([paciente('P-0001', '11111111-1')], { autorizacion: 'IMPORT_AUTORIZADO' });
const rb3a = ctx.Ingresos_rollbackPacientesNuevos_(antesD);
const rb3b = ctx.Ingresos_rollbackPacientesNuevos_(antesD);
assert.equal(rb3a.eliminadas, 1, 'primera llamada retira la anexada');
assert.equal(rb3b.eliminadas, 0, 'segunda llamada no tiene nada que retirar');
assert.equal(lib.pac.val.length, 3, 'volvió a title+seccion+header');
assert.equal(ctx.Modelo_leerPacientes().length, 0, 'última aserción de la fase D');

console.log('ingresos transaccionrollback vNEXT: PASS');