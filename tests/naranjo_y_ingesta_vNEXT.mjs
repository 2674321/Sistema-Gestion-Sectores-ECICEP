#!/usr/bin/env node
// vNEXT — §22 NARANJO (solo sector canónico 'NARANJO'; 'NARANJA' es alias legacy
// sin hoja propia) + §23 reprocesamiento/retoma (PROCESADO es terminal) +
// §24 placeholder de ingesta (Google Forms DESACTIVADO: nada escribe).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js','30_Ingesta.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

// ── §22 NARANJO ──────────────────────────────────────────────────────────────
assert.equal(ctx.Form_sectorHojaIngreso('NARANJO'), 'INGRESO_NARANJO', 'NARANJO → hoja canónica');
assert.equal(ctx.Form_sectorHojaIngreso('NARANJA'), '', 'NARANJA es alias legacy, sin hoja');
assert.equal(ctx.Form_sectorHojaIngreso('VERDE'), 'INGRESO_VERDE', 'VERDE intacto');
assert.equal(ctx.Form_sectorHojaIngreso('AMARILLO'), 'INGRESO_AMARILLO', 'AMARILLO intacto');
assert.equal(ctx.Form_sectorHojaIngreso(''), '', 'vacío → sin hoja');
const hojasIngreso = vm.runInContext('Object.keys(HOJAS_INGRESO)', ctx);
assert.ok(hojasIngreso.includes('INGRESO_NARANJO'), 'ingreso NARANJO existe');
const aNaranja = vm.runInContext('HOJAS_INGRESO["INGRESO_NARANJA"]', ctx);
assert.equal(aNaranja, 'NARANJO', 'alias legacy INGRESO_NARANJA → sector NARANJO (compat)');

// ── §24 Placeholder de ingesta (Google Forms DESACTIVADO) ───────────────────
assert.equal(ctx.CapturaIngress_providerActivo(), 'GOOGLE_FORMS', 'el canal operativo es Google Forms');
assert.equal(ctx.CapturaIngress_providerReservado('GOOGLE_FORMS'), false, 'Google Forms es operativo');
assert.equal(ctx.CapturaIngress_providerReservado('WEBAPP_LEGACY'), true, 'Web App legacy está reservado, NO operativo');
assert.equal(ctx.CapturaIngress_providerReservado('WEBAPP'), true, 'Web App legacy está reservado');

const payload = { captureId: 'Cp4-' + 'e'.repeat(32), accion: 'nuevoIngreso', rut: '12345678-5', nombre: 'T P', fechaNacimiento: '1990-01-01', sector: 'VERDE', fechaIngreso: '2026-09-01' };
let escrito = -1;
const rEnv = ctx.CapturaIngress_enviar({captureId:'Cp4-'+'z'.repeat(32)}, null, 'DESCONOCIDO_PROVIDER');
assert.equal(rEnv.ok, false, 'provider desconocido rechaza sin escribir');
assert.equal(rEnv.error, 'FALLBACK_PROVIDER_DISABLED', 'código normativo FALLBACK_PROVIDER_DISABLED');
assert.equal(rEnv.escrito, 0, 'NO escribe nada');
assert.equal(escrito, -1, 'ningún provider tocó el store');

const rAd = ctx.CapturaIngress_adapterForms({formId:'f1',responseId:'r1',accion:'nuevoIngreso',campos:{RUT:'12345678-5',NOMBRE:'T P',SEXO:'F',FECHA_NACIMIENTO:'1990-01-01',SECTOR:'VERDE',FECHA_INGRESO:'2026-09-01',PROFESIONAL:'MEDICO/A'}});
assert.equal(rAd.ok, true, 'adapter real procesa');

// WEBAPP delega a la captura real: payload inválido → errores, sin escritura.
const rWeb = ctx.CapturaIngress_enviar({ captureId: 'Cp4-' + 'f'.repeat(32) }, ctx.Captura_v2_ctx(), 'WEBAPP');
assert.equal(rWeb.ok, false, 'payload inválido rechazado por la captura real');
assert.ok(Array.isArray(rWeb.errors) && rWeb.errors.length >= 1, 'errores de validación');

// ── §23 PROCESADO es terminal (ni reproceso ni retoma) ───────────────────────
function hojaFake(vals) {
  const set=(r,c,v)=>{while(vals.length<r)vals.push([]);const row=vals[r-1];while(row.length<c)row.push('');row[c-1]=v};
  return {
    get val(){return vals}, getName:()=>vals.__nombre||'', getLastRow:()=>vals.length,
    getLastColumn:()=>vals.reduce((m,r)=>Math.max(m,r.length),0),
    getRange:(a,b,c,d)=>{if(typeof a==='number'){const nr=c??1,nc=d??1;const mk={getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(vals[a-1+i]||[])[b-1+j]??'')),setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))),createTextFinder:(x)=>({matchEntireCell:()=>({findNext:()=>{for(let i=0;i<vals.length;i++){for(let j=0;j<(vals[i]||[]).length;j++){if(`${vals[i][j]}`===String(x)){return{getRow:()=>i+1};}}}return null;}})})};return mk;}return{getValues:()=>[[(vals[a-1]||[])[b-1]??'']],setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))),createTextFinder:(x)=>({matchEntireCell:()=>({findNext:()=>{for(let i=0;i<vals.length;i++){for(let j=0;j<(vals[i]||[]).length;j++){if(`${vals[i][j]}`===String(x)){return{getRow:()=>i+1};}}}return null;}})})}},
    createTextFinder:(b)=>({matchEntireCell:()=>({findNext:()=>{for(let i=0;i<vals.length;i++){for(let j=0;j<(vals[i]||[]).length;j++){if(`${vals[i][j]}`===String(b)){return{getRow:()=>i+1};}}}return null;}})})
  };
}
const capX = 'Cp4-' + 'a'.repeat(32);
const cols = Array.from(ctx.Form_columnas());
const filaProc = ['2026-01-01', capX, '4', 't@e.cl', 'NUEVO_INGRESO', '12345678-5', 'T P', 'F', '1990-01-01', 'VERDE', '', '12', '2026-09-01', 'Médico/a', '', '', '{"captureId":"' + capX + '","accion":"nuevoIngreso"}', 'INGRESO_VERDE', '5', 0, 'PROCESADO', 'INGRESO_COMPLETO', 'EC-PX-1', 'EV-0001', '2026-01-02'];
const hfr = hojaFake([cols, filaProc]);
const ss = { getSheetByName: (n) => (n === 'FORM_RESPUESTAS' ? hfr : hojaFake([])), insertSheet: (n) => hojaFake([cols]) };
ctx.Modelo_ss = () => ss;
ctx.Modelo_hoja = (n) => ss.getSheetByName(n);
ctx.Session = { getActiveUser: () => ({ getEmail: () => 't@e.cl' }) };

const rRep = ctx.Captura_v2_reprocesar(capX);
assert.equal(rRep.ok, false, 'PROCESADO no se reinicia');
assert.match(rRep.errors[0].mensaje, /terminal/, 'motivo de terminal explícito');
const rRet = ctx.Captura_v2_retomarRegistro(capX);
assert.equal(rRet.ok, false, 'PROCESADO no se retoma');
assert.match(rRet.errors[0].mensaje, /terminal/, 'retoma tampoco toca PROCESADO');
assert.equal(hfr.val[1][20], 'PROCESADO', 'el estado terminal NO cambió');

console.log('Naranjo + ingesta + terminales vNEXT: PASS');