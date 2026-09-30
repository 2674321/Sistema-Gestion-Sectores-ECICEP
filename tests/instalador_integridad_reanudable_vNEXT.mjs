#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});

const cache=new Map(),props=new Map();
c.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})};

const base={pacientes:1000,eventos:4000,eventosHuerfanos:2,fuentesDuplicadas:1,cachesPendientes:2};
const ingresos={ingresosFalsos:1,ingresosInconsistentes:0,ingresosDerivados:1,pacientesSinSector:1,sectoresAfectados:['NARANJO']};
const vistasDiag={vistasPendientes:1,pacientesSinSector:1,sectoresAfectados:['NARANJO']};
const estrat={estratificacionPendiente:3};
let componentes=0;
c.Integridad_diagnosticarBase_=()=>{componentes++;return componentes>4?{...base,cachesPendientes:0}:{...base}};
c.Integridad_diagnosticarIngresosComponente_=()=>{componentes++;return componentes>4?{...ingresos,ingresosFalsos:0,ingresosDerivados:0,sectoresAfectados:[]}:{...ingresos}};
c.Integridad_diagnosticarVistasComponente_=()=>{componentes++;return componentes>4?{...vistasDiag,vistasPendientes:0,sectoresAfectados:[]}:{...vistasDiag}};
c.Integridad_diagnosticarEstratificacionComponente_=()=>{componentes++;return componentes>4?{estratificacionPendiente:0}:{...estrat}};
c.Modelo_leerPacientesCampos=()=>[];c.Modelo_leerEventosCampos=()=>[];c.Integridad_leerVistasIds_=()=>({});
c.Ingresos_diagnosticarIngresados_=()=>({conteos:{INGRESADO_FALSO:1},casos:[]});
c.Ingresos_reconciliarIngresados_=()=>({ok:true,continuar:false,sectoresAfectados:['AMARILLO']});
c.Estrat_recalcularTodos_=()=>({ok:true,sectoresAfectados:['VERDE']});
c.Control_recalcularCaches_=()=>({ok:true,cambios:0});
let vistas=0,auditorias=0,sectoresVistos=[];
c.Modelo_refrescarVistasSectores_=s=>{vistas++;assert.equal(s.length,1);sectoresVistos.push(s[0]);return{ok:true}};
c.Sistema_guardarAuditoria_=()=>{auditorias++};

const curso=[];let fin=false,guard=0;
while(!fin&&guard++<20){const r=c.Integridad_ejecutarPaso_('ejec-1');assert.equal(r.ok,true,JSON.stringify(r));curso.push(r.cursor);fin=!r.continuar}
assert.deepEqual(curso,[1,2,3,4,5,6,7,7,7,8,9,10,11,12,13]);
assert.equal(vistas,3,'una vista canónica por RPC');
assert.equal(auditorias,1,'la consolidación persiste auditoría');
assert.deepEqual(sectoresVistos.sort(),['AMARILLO','NARANJO','VERDE']);
assert.equal(componentes,8,'diagnóstico y postcheck usan cuatro checkpoints cada uno');
assert.equal(props.size,0,'cursor durable se limpia al finalizar');

c.Integridad_ejecutarPaso_('durable');
cache.clear();
assert.equal(c.Integridad_ejecutarPaso_('durable').cursor,2);
props.set(c.Integridad_cursorClave_('corrupto'),'{mal json');
assert.equal(c.Integridad_ejecutarPaso_('corrupto').cursor,1);
props.set(c.Integridad_cursorClave_('viejo'),JSON.stringify({version:1,cursor:9}));
assert.equal(c.Integridad_ejecutarPaso_('viejo').cursor,1);

c.Integridad_diagnosticarBase_=()=>({...base});
c.Integridad_diagnosticarIngresosComponente_=()=>({...ingresos});
c.Integridad_diagnosticarVistasComponente_=()=>({...vistasDiag});
c.Integridad_diagnosticarEstratificacionComponente_=()=>({...estrat});
for(let i=0;i<4;i++)c.Integridad_ejecutarPaso_('lotes');
let lote=0;
c.Ingresos_reconciliarIngresados_=()=>({ok:true,continuar:++lote<2,procesados:12,restantes:lote<2?8:0,sectoresAfectados:[]});
const l1=c.Integridad_ejecutarPaso_('lotes'),l2=c.Integridad_ejecutarPaso_('lotes');
assert.equal(l1.cursor,4);assert.equal(l1.continuar,true);assert.equal(l2.cursor,5);

// El PRE_INSTALAR sobrevive pérdida de CacheService y se limpia únicamente al
// cierre explícito de la ejecución; no se crean backups redundantes.
c.SpreadsheetApp={};c.DriveApp={};let backups=0;
c.Backup_crear_=()=>({ok:true,nombre:'PRE_INSTALAR_FAKE_'+(++backups)});
assert.equal(c.Instalar_asegurarBackup_('bk-durable').creado,true);
cache.clear();c._INSTALAR_BACKUP_MEMO={};
assert.equal(c.Instalar_asegurarBackup_('bk-durable').skip,true);
assert.equal(backups,1);
c.Instalar_limpiarBackupEjecucion_('bk-durable');
assert.equal(props.has('ECICEP_INST_BK|bk-durable'),false);

const instalador=readFileSync(new URL('Instalador.html',src),'utf8');
assert.match(instalador,/r\.continuar\s*===\s*true/);
console.log('Integridad reanudable vNEXT: PASS');
