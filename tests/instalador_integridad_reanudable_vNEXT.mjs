#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';
const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
const cache=new Map();c.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
const diag={derivadosOk:true,pacientes:1000,eventos:4000,ingresosFalsos:0,ingresosInconsistentes:0,cachesPendientes:0,vistasPendientes:0,estratificacionPendiente:0,vistas:{sectoresAfectados:['NARANJO']},ingresos:{conteos:{},casos:[]}};
c.Integridad_diagnosticarDerivados_=()=>diag;c.Integridad_snapshotDerivados_=()=>({});
c.Ingresos_reconciliarIngresados_=()=>({ok:true,sectoresAfectados:['AMARILLO']});
c.Estrat_recalcularTodos_=()=>({ok:true,sectoresAfectados:['VERDE']});c.Control_recalcularCaches_=()=>({ok:true,cambios:0});
let vistas=0,auditorias=0;c.Modelo_refrescarVistasSectores_=s=>{vistas++;assert.deepEqual([...s].sort(),['AMARILLO','NARANJO','VERDE']);return{ok:true}};c.Sistema_guardarAuditoria_=()=>{auditorias++};
const curso=[];for(let i=0;i<6;i++){const r=c.Integridad_ejecutarPaso_('ejec-1');assert.equal(r.ok,true);curso.push(r.cursor);assert.equal(r.continuar,i<5)}
assert.deepEqual(curso,[1,2,3,4,5,6]);assert.equal(vistas,1,'un solo refresco de vistas');assert.equal(auditorias,1,'post-check persiste auditoría');
c.Integridad_ejecutarPaso_('ejec-falla');c.Ingresos_reconciliarIngresados_=()=>({ok:false,sectoresAfectados:[]});
const f1=c.Integridad_ejecutarPaso_('ejec-falla'),f2=c.Integridad_ejecutarPaso_('ejec-falla');assert.equal(f1.cursor,1);assert.equal(f2.cursor,1);assert.equal(f1.reintentable,true);
const instalador=readFileSync(new URL('Instalador.html',src),'utf8');assert.match(instalador,/r\.continuar\s*===\s*true/);
console.log('Integridad reanudable vNEXT: PASS');
