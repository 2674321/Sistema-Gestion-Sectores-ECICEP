#!/usr/bin/env node
// vNEXT — Reconciliación dryRun de pendientes RECIBIDO (diagnóstico automático
// POST-aed3567, §10/§18/§19). La evidencia es RESPONSE_ID (captureId) + TRAZA_CRUDA
// (payload canónico). Las coordenadas INGRESO_HOJA/INGRESO_FILA JAMÁS son
// evidencia (fila física reutilizada). Modo estrictamente dryRun: no escribe.
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
      if(typeof a==='number'){const nr=c??1,nc=d??1;const mk={getValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(vals[a-1+i]||[])[b-1+j]??'')),setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v)))};return mk;}
      return{getValues:()=>[[(vals[a-1]||[])[b-1]??'']],setValues:av=>av.forEach((row,i)=>row.forEach((v,j)=>set(a+i,b+j,v)))}
    },
    createTextFinder: (b)=>({ matchEntireCell: ()=>({ findNext: ()=>null }) })
  };
}

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

const R = ctx.CAPTURA_V2_RECONCI;

// §10: el pendiente LEGACY del paciente X quedó RECIBIDO. Su evento es ANTIGUO
// (FUENTE física HOJA_INGRESO|VERDE|4 = la causa raíz) o el evento no existe.
const store = {
  pacientes: [{ ID_INTERNO: 'EC-PX-0001', RUT: '12345678-5', NOMBRE: 'PACIENTE X', SECTOR: 'VERDE' }],
  eventos: [{ ID_EVENTO: 'EV-L0001', ID_INTERNO: 'EC-PX-0001', TIPO_EVENTO: 'INGRESO',
    FUENTE: 'HOJA_INGRESO|VERDE|4', FECHA_EVENTO: '2026-01-10' }]
};

const payloadX = { captureId: 'Cp4-b'.replace('-','') + 'b'.repeat(32), rut: '12345678-5', nombre: 'PACIENTE X', fechaIngreso: '2026-01-12', sector: 'VERDE' };
let capId = () => 'Cp4-' + 'b'.repeat(32);
let payload = { rut: '12345678-5', nombre: 'PACIENTE X', fechaIngreso: '2026-01-12', sector: 'VERDE' };

// 1) Moderno A ya procesado: existe EVENTO con FUENTE = marca completa de su
//    captureId (formato canónico de eventos manuales).
const capA = 'Cp4-' + 'a'.repeat(32);
store.eventos.push({ ID_EVENTO: 'EV-A0001', ID_INTERNO: 'EC-PX-0001', TIPO_EVENTO: 'INGRESO',
  FUENTE: 'FORM|' + capA + '|INGRESO' });
const clA = ctx.Captura_v2_clasificarPendiente_(
  { captureId: capA, TRAZA_CRUDA: JSON.stringify(payload) }, store);
assert.equal(clA.clasificacion, R.YA_COMPLETO_REPARAR_TRAILER, 'A: evento durable existe → reparar trailer');
assert.equal(clA.idInterno, 'EC-PX-0001', 'A: idInterno recuperado');
assert.equal(clA.idEvento, 'EV-A0001', 'A: idEvento recuperado');

// 1b) Moderno A2 ya procesado por el pipeline INGRESO real: EVENTOS.FUENTE es el
//     captureId DESNUDO (Fuentes_fuenteOrigen, 03_Fuentes.js:90-97). La
//     reconciliación debe reconocerlo como evidencia durable (misma identidad).
const capA2 = 'Cp4-' + '2'.repeat(32);
store.eventos.push({ ID_EVENTO: 'EV-A2001', ID_INTERNO: 'EC-PX-0001', TIPO_EVENTO: 'INGRESO',
  FUENTE: capA2 });
const clA2 = ctx.Captura_v2_clasificarPendiente_(
  { captureId: capA2, TRAZA_CRUDA: JSON.stringify(payload) }, store);
assert.equal(clA2.clasificacion, R.YA_COMPLETO_REPARAR_TRAILER, 'A2: FUENTE captureId desnudo también es durable');
assert.equal(clA2.idInterno, 'EC-PX-0001', 'A2: idInterno recuperado');
assert.equal(clA2.idEvento, 'EV-A2001', 'A2: idEvento recuperado');

// 2) Pendiente B (legacy histórico, RECIBIDO): sin evento durable; enlaza paciente existente.
const clB = ctx.Captura_v2_clasificarPendiente_(
  { captureId: capId(), TRAZA_CRUDA: JSON.stringify(payload) }, store);
assert.equal(clB.clasificacion, R.REPROCESABLE_SEGURO, 'B: reprocesable (enlaza paciente existente)');
assert.equal(clB.idInterno, 'EC-PX-0001', 'B: idInterno del paciente');

// 3) Pendiente C irreparable: sin captureId válido.
const clC = ctx.Captura_v2_clasificarPendiente_({ captureId: '', TRAZA_CRUDA: JSON.stringify(payload) }, store);
assert.equal(clC.clasificacion, R.NO_RECUPERABLE_AUTOMATICAMENTE, 'C: sin RESPONSE_ID válido');

// 4) Pendiente D incompleto: payload sin sector → revisión humana.
const clD = ctx.Captura_v2_clasificarPendiente_(
  { captureId: capId(), TRAZA_CRUDA: JSON.stringify({ rut: '12345678-5', nombre: 'PACIENTE X', fechaIngreso: '2026-01-12' }) }, store);
assert.equal(clD.clasificacion, R.REQUIERE_REVISION, 'D: payload incompleto → revisión');

// 5) Pendiente E: nuevo RUT sin paciente ni evento → reprocesable (crearía entidad).
const clE = ctx.Captura_v2_clasificarPendiente_(
  { captureId: capId(), TRAZA_CRUDA: JSON.stringify({ rut: '11112222-3', nombre: 'NUEVO', fechaIngreso: '2026-01-12', sector: 'VERDE' }) }, store);
assert.equal(clE.clasificacion, R.REPROCESABLE_SEGURO, 'E: crearía entidad nueva');
assert.equal(clE.motivo, 'CREARIA_ENTIDAD_NUEVA', 'E: motivo correcto');

// 6) §10: un EVENTO durable que no coincide con el RUT del payload → CONFLICTO.
const capF = 'Cp4-' + 'f'.repeat(32);
store.eventos.push({ ID_EVENTO: 'EV-F0001', ID_INTERNO: 'EC-PX-0001', TIPO_EVENTO: 'INGRESO',
  FUENTE: 'FORM|' + capF + '|INGRESO' });
const clF = ctx.Captura_v2_clasificarPendiente_(
  { captureId: capF, TRAZA_CRUDA: JSON.stringify({ rut: '99999999-9', nombre: 'OTRO', fechaIngreso: '2026-01-12', sector: 'VERDE' }) }, store);
assert.equal(clF.clasificacion, R.CONFLICTO, 'F: evidencia durable en conflicto con payload');

// 7) Informe agregado dryRun desde una hoja FORM_RESPUESTAS con pendientes.
const headers = ['TIMESTAMP', 'RESPONSE_ID', 'ESTADO', 'TRAZA_CRUDA', 'INGRESO_HOJA', 'INGRESO_FILA', 'ID_INTERNO', 'ID_EVENTO', 'REINTENTOS'];
const cabFila = hojaFake([headers]);
let escrituras = 0;
const hook = cabFila;
const vueltas = { guardadas: 0 };
const ssFake = {
  getSheetByName: (n) => {
    if (n === 'FORM_RESPUESTAS') return cabFila;
    return hojaFake([]);
  }
};
ctx.Modelo_ss = () => ssFake;
ctx.Modelo_hoja = (n) => ssFake.getSheetByName(n);
// sembrar pendientes
cabFila.val.push(['2026-01-01', capA, 'RECIBIDO', JSON.stringify(payload), 'INGRESO_VERDE', '4', 'EC-PX-0001', 'EV-A0001', '0']); // fila 2
cabFila.val.push(['2026-01-01', capId(), 'RECIBIDO', JSON.stringify(payload), 'INGRESO_VERDE', '4', '', '', '0']);           // fila 3 legacy same row
cabFila.val.push(['2026-01-01', 'Cp4-' + 'c'.repeat(32), 'RECIBIDO', '', 'INGRESO_VERDE', '4', '', '', '0']);                 // fila 4 sin payload
cabFila.val.push([new Date(), 'Cp4-' + 'd'.repeat(32), 'PROCESADO', JSON.stringify(payload), 'INGRESO_VERDE', '4', 'EC-PX-0001', 'EV-A0001', '0']); // fila 5 ya procesado → NO pendiente

const informe = ctx.Captura_v2_reconciliarPendientes({ pacientes: store.pacientes, eventos: store.eventos, detalle: true });
assert.equal(informe.dryRun, true, 'dryRun estricto');
assert.equal(informe.total, 3, 'solo 3 RECIBIDO/VALIDANDO/VALIDO (el PROCESADO se excluye)');
assert.equal(informe.porEstado[R.YA_COMPLETO_REPARAR_TRAILER], 1, 'A clasificado');
assert.equal(informe.porEstado[R.REPROCESABLE_SEGURO], 1, 'B clasificado');
assert.equal(informe.porEstado[R.NO_RECUPERABLE_AUTOMATICAMENTE], 1, 'C clasificado');
assert.equal(informe.detalle.length, 3, 'detalle por captureId');
assert.ok(String(JSON.stringify(informe)).indexOf('12345678-5') === -1, 'informe sin RUT (sin PII)');
assert.equal(cabFila.val.length, 5, 'dryRun: la hoja NO se modificó');
assert.equal(vueltas.guardadas, 0, 'no hubo escritura alguna');

// 8) Invariante §10: ES LÍCITO que el viejo legado físico y un moderno SAME
//    persona convivan: ninguno marca CONFLICTO entre ellos (clases no colisionan).
assert.equal(clB.clasificacion, R.REPROCESABLE_SEGURO, 'legacy físico ≠ conflicto con el mundo moderno');

console.log('Legacy reconciliación dryRun vNEXT: PASS');