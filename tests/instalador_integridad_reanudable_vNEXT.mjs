#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';
const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
const cache=new Map();c.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
const props=new Map();c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})};
const diag={derivadosOk:true,pacientes:1000,eventos:4000,ingresosFalsos:1,ingresosInconsistentes:0,cachesPendientes:2,vistasPendientes:1,estratificacionPendiente:3,vistas:{sectoresAfectados:['NARANJO']},ingresos:{conteos:{DERIVADO_DESACTUALIZADO:1},casos:[]}};
let diagnosticos=0,snapshots=0;c.Integridad_diagnosticarDerivados_=()=>{diagnosticos++;return diag};c.Integridad_snapshotDerivados_=()=>{snapshots++;return{}};c.Ingresos_diagnosticarIngresados_=()=>diag.ingresos;
c.Ingresos_reconciliarIngresados_=()=>({ok:true,sectoresAfectados:['AMARILLO']});
c.Estrat_recalcularTodos_=()=>({ok:true,sectoresAfectados:['VERDE']});c.Control_recalcularCaches_=()=>({ok:true,cambios:0});
let vistas=0,auditorias=0,sectoresVistos=[];c.Modelo_refrescarVistasSectores_=s=>{vistas++;assert.equal(s.length,1);sectoresVistos.push(s[0]);return{ok:true}};c.Sistema_guardarAuditoria_=()=>{auditorias++};
const curso=[];let fin=false,guard=0;while(!fin&&guard++<12){const r=c.Integridad_ejecutarPaso_('ejec-1');assert.equal(r.ok,true);curso.push(r.cursor);fin=!r.continuar}
assert.deepEqual(curso,[1,2,3,4,4,4,5,6]);assert.equal(vistas,3,'una vista por RPC, sin repetir sectores');assert.equal(auditorias,1,'post-check persiste auditoría');
assert.deepEqual(sectoresVistos.sort(),['AMARILLO','NARANJO','VERDE']);
assert.equal(diagnosticos,2,'diagnóstico completo solo al inicio y post-check');assert.equal(snapshots,1,'snapshot adicional solo para ingreso realmente pendiente');
assert.equal(props.size,0,'cursor durable se limpia al finalizar');
c.Integridad_ejecutarPaso_('ejec-falla');c.Ingresos_reconciliarIngresados_=()=>({ok:false,sectoresAfectados:[]});
const f1=c.Integridad_ejecutarPaso_('ejec-falla'),f2=c.Integridad_ejecutarPaso_('ejec-falla');assert.equal(f1.cursor,1);assert.equal(f2.cursor,1);assert.equal(f1.reintentable,true);
const sano={derivadosOk:true,pacientes:1000,eventos:4000,ingresosFalsos:0,ingresosInconsistentes:0,cachesPendientes:0,vistasPendientes:0,estratificacionPendiente:0,vistas:{sectoresAfectados:[]},ingresos:{conteos:{DERIVADO_DESACTUALIZADO:0},casos:[]}};
c.Integridad_diagnosticarDerivados_=()=>sano;c.Ingresos_reconciliarIngresados_=()=>{throw new Error('NO_DEBE_EJECUTAR')};c.Estrat_recalcularTodos_=()=>{throw new Error('NO_DEBE_EJECUTAR')};c.Control_recalcularCaches_=()=>{throw new Error('NO_DEBE_EJECUTAR')};
let sanoFin=false,sanoPasos=0;while(!sanoFin&&sanoPasos++<8){const r=c.Integridad_ejecutarPaso_('ejec-sana');assert.equal(r.ok,true);sanoFin=!r.continuar}assert.equal(sanoPasos,6,'estado sano completa seis pasos sin trabajo mutante');
const instalador=readFileSync(new URL('Instalador.html',src),'utf8');assert.match(instalador,/r\.continuar\s*===\s*true/);
console.log('Integridad reanudable vNEXT: PASS');
