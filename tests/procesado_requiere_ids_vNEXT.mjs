#!/usr/bin/env node
// vNEXT — §17 post-aed3567: un PROCESADO jamás puede quedar con identidad
// incompleta (idInterno/idEvento vacíos = "pérdida silenciosa"). Se completan
// desde la marca durable (EVENTOS.FUENTE) o el estado DEGRADA a
// REQUIERE_REVISION con motivo PROCESADO_SIN_IDS.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

function hojaFake(vals) {
  const set = (r,c,v)=>{while(vals.length<r)vals.push([]);const row=vals[r-1];while(row.length<c)row.push('');row[c-1]=v};
  const finder = (buscado) => ({ matchEntireCell: () => ({ findNext: () => {
    for(let i=0;i<vals.length;i++){ for(let j=0;j<(vals[i]||[]).length;j++){ if(`${vals[i][j]}`===String(buscado)) return {getRow:()=>i+1}; } }
    return null;
  }}) });
  return {
    get val(){return vals}, getName:()=>vals.__nombre||'', getLastRow:()=>vals.length,
    getLastColumn:()=>vals.reduce((m,r)=>Math.max(m,r.length),0),
    getRange:(a,b,c,d)=>{
      if(typeof a==='number'){const nr=c??1,nc=d??1;const mk={getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(vals[a-1+i]||[])[b-1+j]??'')),setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))),setValue:v=>set(a,b,v),createTextFinder:(b)=>finder(b)};return mk;}
      return{getValues:()=>[[(vals[a-1]||[])[b-1]??'']],setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v))),createTextFinder:(b)=>finder(b)}
    },
    createTextFinder: (b) => finder(b)
  };
}

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

const E = ctx.CAPTURA_V2.ESTADOS;

// ── PURA: Captura_v2_completarIds_ ───────────────────────────────────────────
// ya completo → intacto
let r = ctx.Captura_v2_completarIds_(E.PROCESADO, 'EC-PX-1', 'EV-0001', 'marca-x');
assert.equal(r.estado, E.PROCESADO);
assert.equal(r.idInterno, 'EC-PX-1');
assert.equal(r.idEvento, 'EV-0001');

// PROCESADO sin idEvento, con marca de evento durable → completa
const capA = 'Cp4-' + 'a'.repeat(32);
const hEv = hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)]);
const hFr = hojaFake([Array.from(ctx.Form_columnas())]);
const ss = {
  getSheetByName: (n) => {
    if (n === 'EVENTOS') return hEv;
    if (n === 'FORM_RESPUESTAS') return hFr;
    return hojaFake([]);
  },
  insertSheet: (n) => hojaFake([Array.from(ctx.COLUMNAS_EVENTOS)])
};
ctx.Modelo_ss = () => ss;
ctx.Modelo_hoja = (n) => ss.getSheetByName(n);
ctx.Session = { getActiveUser: () => ({ getEmail: () => 't@e.cl' }) };
const colIdx = {}; Array.from(ctx.COLUMNAS_EVENTOS).forEach((c,i)=>colIdx[c]=i);
const mkEv = (f) => { const fila = Array.from(ctx.COLUMNAS_EVENTOS).map(() => ''); fila[colIdx.ID_EVENTO] = f.idEvento || ''; fila[colIdx.ID_INTERNO] = f.idInterno || ''; fila[colIdx.TIPO_EVENTO] = f.tipo || 'INGRESO'; fila[colIdx.FUENTE] = f.fuente; return fila; };
const marcas = ['FORM', capA, 'INGRESO'].join('|');
hEv.val.push(mkEv({ idEvento: 'EV-0001', idInterno: 'EC-PX-1', fuente: marcas }));
r = ctx.Captura_v2_completarIds_(E.PROCESADO, 'EC-PX-1', '', marcas);
assert.equal(r.estado, E.PROCESADO, 'se completó desde la marca completa');
assert.equal(r.idEvento, 'EV-0001', 'idEvento recuperado de EVENTOS');

// Fuente DURABLE del pipeline INGRESO real: el evento persiste FUENTE = captureId
// DESNUDO (Fuentes_fuenteOrigen → 03_Fuentes.js:90-97). La recuperación debe
// completar con la marca generada por Captura_v2_marca ('FORM|<cid>|NUEVO_INGRESO').
const capR = 'Cp4-' + '9'.repeat(32);
hEv.val.push(mkEv({ idEvento: 'EV-0002', idInterno: 'EC-PX-2', fuente: capR }));
r = ctx.Captura_v2_completarIds_(E.PROCESADO, 'EC-PX-2', '', 'FORM|' + capR + '|NUEVO_INGRESO');
assert.equal(r.estado, E.PROCESADO, 'se completó desde FUENTE = captureId desnudo (flujo INGRESO real)');
assert.equal(r.idEvento, 'EV-0002', 'idEvento recuperado por captureId desnudo');

// PROCESADO SIN identidad ni marca → DEGRADA, nunca false PROCESADO (firma de
// "se procesó sin crear nada": idInterno E idEvento ausentes sin evidencia).
r = ctx.Captura_v2_completarIds_(E.PROCESADO, '', '', '');
assert.equal(r.estado, E.REQUIERE_REVISION, 'degradado a REQUIERE_REVISION');
assert.equal(r.motivo, 'PROCESADO_SIN_IDS', 'motivo normativo');

// PROCESADO con idInterno pero idEvento '' → NO degrada (§16 permite idEvento
// vacío con idInterno presente; la entrega es trazable por idInterno; §25 audit
// pendiente). Solo se intenta completar idEvento desde evidencia durable.
r = ctx.Captura_v2_completarIds_(E.PROCESADO, 'EC-CON', '', 'marca-sin-evento');
assert.equal(r.estado, E.PROCESADO, 'idInterno presente ⇒ no degrada');
assert.equal(r.idInterno, 'EC-CON');
assert.equal(r.idEvento, '', 'idEvento queda vacío sin evidencia');

// estados no terminales intactos
r = ctx.Captura_v2_completarIds_(E.RECIBIDO, 'EC-1', 'EV-1', 'm');
assert.equal(r.estado, E.RECIBIDO);

// ── Integración: la entrega devuelve PROCESADO con idInterno y sin idEvento.
//    §16 admite idEvento '' (el evento queda trazable por idInterno); la
//    recuperación §17 intenta completar desde la marca durable y, al no haber
//    evidencia, NO degrada (idInterno presente = entidad creada). ────────────
const payload = { captureId: capA, accion: 'nuevoIngreso', rut: '12345678-5', nombre: 'T P', fechaNacimiento: '1990-01-01', sector: 'VERDE', fechaIngreso: '2026-09-01', profesional: 'Médico/a' };
const c = ctx.Captura_v2_ctx();
c.entregar = (norm, opciones) => ({ estado: E.PROCESADO, idInterno: 'EC-PX-1', idEvento: '', ingresoHoja: 'INGRESO_VERDE', ingresoFila: '4' });
c.aplicarAgenda = null;
c.aplicarContacto = null;
const res = ctx.Captura_v2_enviar(payload, c);
assert.equal(res.ok, true, JSON.stringify(res));
assert.equal(res.data.estado, E.PROCESADO, 'idInterno presente ⇒ PROCESADO (nunca degrada sin evidencia de pérdida)');
assert.equal(res.data.idInterno, 'EC-PX-1');
assert.equal(res.data.idEvento, '', 'idEvento vacío es válido en la respuesta §16');

// Pérdida silenciosa real: la entrega afirma PROCESADO SIN ID alguno (ni
// idInterno ni idEvento) y no hay evidencia durable → la respuesta DEGRADA y
// el trailer queda REQUIERE_REVISION (nunca un falso PROCESADO).
const c0 = ctx.Captura_v2_ctx();
c0.entregar = (norm, opciones) => ({ estado: E.PROCESADO, idInterno: '', idEvento: '', ingresoHoja: 'INGRESO_VERDE', ingresoFila: '4' });
c0.aplicarAgenda = null;
c0.aplicarContacto = null;
const res0 = ctx.Captura_v2_enviar(
  Object.assign({}, payload, { captureId: 'Cp4-' + '0'.repeat(32), rut: '12345678-5', nombre: 'SIN IDS' }), c0);
assert.equal(res0.ok, true, JSON.stringify(res0));
assert.equal(res0.data.estado, E.REQUIERE_REVISION, 'nunca fake-PROCESADO cuando no existe ninguna identidad');
assert.equal(res0.data.motivo, 'PROCESADO_SIN_IDS', 'motivo visible para operador');

// Contraste: entrega COMPLETA sí queda PROCESADO.
const c2 = ctx.Captura_v2_ctx();
c2.entregar = (norm, opciones) => ({ estado: E.PROCESADO, idInterno: 'EC-PX-1', idEvento: 'EV-0001', ingresoHoja: 'INGRESO_VERDE', ingresoFila: '4' });
c2.aplicarAgenda = null;
c2.aplicarContacto = null;
const res2 = ctx.Captura_v2_enviar(
  Object.assign({}, payload, { captureId: 'Cp4-' + 'b'.repeat(32) }), c2);
assert.equal(res2.ok, true, JSON.stringify(res2));
assert.equal(res2.data.estado, E.PROCESADO, 'entrega completa sí es PROCESADO');

// Recuperación INTEGRADA con la convención real del pipeline INGRESO: la entrega
// devuelve PROCESADO sin idEvento pero el EVENTO ya existe con FUENTE=return captureId
// desnudo (el flujo real). La respuesta debe completar los IDs, no degradar.
const c3 = ctx.Captura_v2_ctx();
c3.entregar = (norm, opciones) => ({ estado: E.PROCESADO, idInterno: 'EC-PX-2', idEvento: '', ingresoHoja: 'INGRESO_VERDE', ingresoFila: '6' });
c3.aplicarAgenda = null;
c3.aplicarContacto = null;
const res3 = ctx.Captura_v2_enviar(
  Object.assign({}, payload, { captureId: capR, nombre: 'R RECUP' }), c3);
assert.equal(res3.ok, true, JSON.stringify(res3));
assert.equal(res3.data.estado, E.PROCESADO, 'recupera ids desde FUENTE desnuda (flujo INGRESO)');
assert.equal(res3.data.idEvento, 'EV-0002', 'idEvento completado en la respuesta');
assert.equal(res3.data.idInterno, 'EC-PX-2', 'idInterno completado en la respuesta');

console.log('PROCESADO requiere IDs vNEXT: PASS');