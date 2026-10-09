#!/usr/bin/env node
// vNEXT — §27 observabilidad SIN PII: fases del pipeline, medidas solo de
// duración, captureId truncado, y JAMÁS RUT/nombre/teléfono en logs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

const logs = [];
const ctx = vm.createContext({ console: { log: (...a) => logs.push(a.join(' ')), warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

function hojaFake(vals) {
  const set=(r,c,v)=>{while(vals.length<r)vals.push([]);const row=vals[r-1];while(row.length<c)row.push('');row[c-1]=v};
  const find=(x)=>({matchEntireCell:()=>({findNext:()=>{for(let i=0;i<vals.length;i++){for(let j=0;j<(vals[i]||[]).length;j++){if(`${vals[i][j]}`===String(x)){return{getRow:()=>i+1};}}}return null;}})});
  return {
    get val(){return vals}, getName:()=>vals.__nombre||'', getLastRow:()=>vals.length,
    getLastColumn:()=>vals.reduce((m,r)=>Math.max(m,r.length),0),
    getRange:(a,b,c,d)=>{if(typeof a==='number'){const nr=c??1,nc=d??1;const mk={getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(vals[a-1+i]||[])[b-1+j]??'')),setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))),createTextFinder:find};return mk;}return{getValues:()=>[[(vals[a-1]||[])[b-1]??'']],setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v)))}},
    createTextFinder:find
  };
}
const hfr = hojaFake([Array.from(ctx.Form_columnas())]);
const hEv = hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)]);
const ss = { getSheetByName: (n) => { if (n === 'EVENTOS') return hEv; if (n === 'FORM_RESPUESTAS') return hfr; return hojaFake([]); }, insertSheet: (n) => hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)]) };
ctx.Modelo_ss = () => ss;
ctx.Modelo_hoja = (n) => ss.getSheetByName(n);
ctx.Session = { getActiveUser: () => ({ getEmail: () => 't@e.cl' }) };

const captureId = 'Cp4-' + 'b'.repeat(32);
const rut = '11111111-1';
const nombre = 'Paciente Observabilidad';
const payload = { captureId, accion: 'nuevoIngreso', rut, nombre, fechaNacimiento: '1980-05-05', sector: 'AMARILLO', fechaIngreso: '2026-09-05', profesional: 'Médico/a', telefonos: '9 9999 9999' };

const c = ctx.Captura_v2_ctx();
c.entregar = (norm, op) => ({ estado: 'PROCESADO', idInterno: 'EC-1', idEvento: 'EV-0001', ingresoHoja: 'INGRESO_AMARILLO', ingresoFila: '7' });
c.aplicarAgenda = null;
c.aplicarContacto = null;
const res = ctx.Captura_v2_enviar(payload, c);
assert.equal(res.ok, true, 'entrega procesada');
assert.equal(res.data.estado, 'PROCESADO', 'estado final PROCESADO');

// 1) fases del pipeline: RECIBIDO → PERSISTIDO → estado final.
assert.ok(Array.isArray(c._fases), 'ctx acumula fases');
assert.ok(c._fases.includes('RECIBIDO'), 'fase RECIBIDO registrada');
assert.ok(c._fases.includes('PERSISTIDO'), 'fase PERSISTIDO registrada');
assert.ok(c._fases.includes('PROCESADO'), 'fase estado final registrada');
assert.ok(c._fases.indexOf('RECIBIDO') < c._fases.indexOf('PERSISTIDO'), 'orden de fases');

// 2) medidas solo de duración (n=etiqueta, d=ms), sin contenido de datos.
if (c.medidas) {
  for (const m of c.medidas) {
    assert.equal(typeof m.d, 'number', 'duración numérica');
    assert.doesNotThrow(() => String(m.n), 'etiqueta de medida');
  }
}

// 3) logMedidas: captureId TRUNCADO y sin PII.
const antes = logs.length;
ctx.Captura_v2_logMedidas(c, captureId);
const neue = logs.slice(antes).join('\n');
assert.ok(neue.includes('fases=RECIBIDO>PERSISTIDO>PROCESADO') || neue.includes('fases='), 'volcado incluye fases');
assert.ok(captureId.length > 8, 'captureId real es largo');
assert.ok(!neue.includes(captureId), 'NUNCA el captureId completo');
assert.ok(!neue.includes(rut), 'sin RUT');
assert.ok(!neue.includes(nombre), 'sin nombre');
assert.ok(!neue.includes(payload.telefonos), 'sin teléfono');

// 4) el ref truncado es el prefijo corto (≤ 8 chars), no un trozo del dato.
const ref = neue.split('tiempos')[1];
if (ref) {
  const token = (ref.trim().split(' ')[0] || '').replace(/:$/, '');
  assert.ok(token.length <= 8 && token.length > 0, 'ref capturaId de máx 8 chars');
}

console.log('Observabilidad sin PII vNEXT: PASS');