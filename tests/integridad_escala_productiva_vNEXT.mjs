#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const src=new URL('../src/',import.meta.url);
const c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});

const io={getRange:0,getValues:0,setValue:0,setValues:0,clearContent:0,setFormulas:0,celdasLeidas:0,celdasEscritas:0,fullPacientes:0,fullEventos:0};
const reset=()=>Object.keys(io).forEach(k=>io[k]=0);
class Range{
  constructor(sheet,row,col,nr,nc){Object.assign(this,{sheet,row,col,nr,nc});}
  getValues(){io.getValues++;io.celdasLeidas+=this.nr*this.nc;
    if(this.row===this.sheet.hr&&this.col===1&&this.nr>1&&this.nc===this.sheet.lastCol){
      if(this.sheet.name==='PACIENTES')io.fullPacientes++;
      if(this.sheet.name==='EVENTOS')io.fullEventos++;
    }
    return Array.from({length:this.nr},(_,r)=>Array.from({length:this.nc},(_,x)=>this.sheet.get(this.row+r,this.col+x)));
  }
  setValues(v){io.setValues++;io.celdasEscritas+=this.nr*this.nc;for(let r=0;r<this.nr;r++)for(let x=0;x<this.nc;x++)this.sheet.set(this.row+r,this.col+x,v[r][x]);return this;}
  setValue(v){io.setValue++;io.celdasEscritas++;this.sheet.set(this.row,this.col,v);return this;}
  clearContent(){io.clearContent++;io.celdasEscritas+=this.nr*this.nc;return this;}
  setFormulas(){io.setFormulas++;io.celdasEscritas+=this.nr*this.nc;return this;}
}
class Sheet{
  constructor(name,headers,rows,hr){this.name=name;this.headers=headers;this.rows=rows;this.hr=hr;this.lastCol=headers.length;}
  getName(){return this.name} getLastColumn(){return this.lastCol} getLastRow(){return this.hr+this.rows.length}
  isSheetHidden(){return false}
  getRange(r,col,nr=1,nc=1){io.getRange++;return new Range(this,r,col,nr,nc)}
  get(r,col){if(r===this.hr)return this.headers[col-1]??'';const i=r-this.hr-1;return i>=0?(this.rows[i]?.[col-1]??''):''}
  set(r,col,v){const i=r-this.hr-1;if(i<0)return;while(this.rows.length<=i)this.rows.push([]);this.rows[i][col-1]=v}
}

const NP=2713,NE=21783;
const pHeaders=c.MODELO_PACIENTE.map(x=>x.campo),eHeaders=Array.from(c.COLUMNAS_EVENTOS);
const pi=Object.fromEntries(pHeaders.map((x,i)=>[x,i])),ei=Object.fromEntries(eHeaders.map((x,i)=>[x,i]));
const pRows=Array.from({length:NP},(_,i)=>{const r=Array(pHeaders.length).fill('');r[pi.ID_INTERNO]=`P${String(i+1).padStart(6,'0')}`;r[pi.SECTOR]=['NARANJO','AMARILLO','VERDE'][i%3];r[pi.ESTRATIFICACION]='G2';r[pi.CONDICIONES]='HTA';return r});
const max=Array.from({length:NP},()=>({CONTROL:'',SEGUIMIENTO:''}));
const eRows=Array.from({length:NE},(_,i)=>{const p=i%NP,id=`P${String(p+1).padStart(6,'0')}`,tipo=i%2?'CONTROL':'SEGUIMIENTO';const day=String(i%28+1).padStart(2,'0'),fecha=`2026-08-${day}`;if(fecha>max[p][tipo])max[p][tipo]=fecha;const r=Array(eHeaders.length).fill('');r[ei.ID_EVENTO]=`E${String(i+1).padStart(7,'0')}`;r[ei.ID_INTERNO]=id;r[ei.FECHA_EVENTO]=fecha;r[ei.TIPO_EVENTO]=tipo;r[ei.FUENTE]=`SINTETICO|${i+1}`;r[ei.FECHA_REGISTRO]=fecha+'T12:00:00Z';return r});
const desalineados=new Set(Array.from({length:530},(_,j)=>j*5));
pRows.forEach((r,i)=>{r[pi.ULTIMO_CONTROL]=desalineados.has(i)?'':max[i].CONTROL;r[pi.ULTIMO_SEGUIMIENTO]=desalineados.has(i)?'':max[i].SEGUIMIENTO;r[pi.FECHA_ACTUALIZACION]='2026-01-01'});
const hrP=c.Modelo_headerRow('PACIENTES'),hrE=c.Modelo_headerRow('EVENTOS');
const sheets={PACIENTES:new Sheet('PACIENTES',pHeaders,pRows,hrP),EVENTOS:new Sheet('EVENTOS',eHeaders,eRows,hrE)};
c.Modelo_hoja=n=>sheets[n]||null;c.Modelo_ss=()=>({getSheetByName:n=>sheets[n]||null});
c.CacheService=undefined;c.PropertiesService=undefined;c.Log_info=()=>{};c.Log_flush=()=>{};c.Sistema_marcarAuditoriaStale_=()=>{};c.Inicio_marcarDirty_=()=>{};

// Baseline reproducible del HEAD auditado: seis requests profundos (diagnóstico,
// ingreso, cache, tres vistas/postcheck agrupados aquí) leen ancho completo y
// la auditoría histórica hace un scan de RESPONSE_ID.
reset();
for(let n=0;n<6;n++){c.Modelo_leerBloqueCabecera('PACIENTES',sheets.PACIENTES);c.Modelo_leerBloqueCabecera('EVENTOS',sheets.EVENTOS)}
io.getRange++;io.getValues++;io.celdasLeidas+=NP;
const antes={...io,formScans:1,rpcVistas:3,maxUnidadCeldas:(NP+1)*pHeaders.length+(NE+1)*eHeaders.length+NP,cacheWrites:3};

reset();c.Modelo_invalidarLecturas();
const unidades=[];
for(let n=0;n<2;n++){const inicio=io.celdasLeidas;const d=c.Integridad_diagnosticarBase_();assert.equal(d.cachesPendientes,530);unidades.push(io.celdasLeidas-inicio)}
// Tres vistas: lectura real proyectada por RPC (15 campos paciente + 6 campos
// evento para conservar correcciones de fecha y trazabilidad).
for(const sector of ['NARANJO','AMARILLO','VERDE']){const inicio=io.celdasLeidas;c.Modelo_leerPacientesCampos([...c.COLUMNAS_SECTOR_VISTA.filter(x=>x!=='EDAD'&&x!=='ULTIMO_EVENTO'),'SECTOR']);c.Modelo_leerEventosCampos(['ID_INTERNO','FECHA_EVENTO','TIPO_EVENTO','FECHA_REGISTRO']);unidades.push(io.celdasLeidas-inicio)}
c.Modelo_invalidarLecturas();const reparacion=c.Control_recalcularCaches_();
assert.equal(reparacion.cambios,530);assert.equal(reparacion.modoEscritura,'COLUMNAS_BATCH');
const escriturasPrimera=io.setValues;
c.Modelo_invalidarLecturas();const segunda=c.Control_recalcularCaches_();
assert.equal(segunda.cambios,0);assert.equal(segunda.modoEscritura,'SIN_ESCRITURAS');
const despues={...io,formScans:0,rpcVistas:3,maxUnidadCeldas:Math.max(...unidades),cacheWrites:escriturasPrimera};
assert.equal(despues.fullPacientes,2,'solo las dos pasadas explícitas de reparación leen PACIENTES completo');
assert.equal(despues.fullEventos,0,'EVENTOS nunca requiere ancho completo');
assert.ok(despues.maxUnidadCeldas<antes.maxUnidadCeldas/2);

console.log(JSON.stringify({dataset:{pacientes:NP,eventos:NE,ingresos:2713,vistas:2713,formRespuestas:NP},antes,despues,segundaPasada:{cambios:segunda.cambios,modo:segunda.modoEscritura}},null,2));
console.log('Integridad escala productiva vNEXT: PASS');
