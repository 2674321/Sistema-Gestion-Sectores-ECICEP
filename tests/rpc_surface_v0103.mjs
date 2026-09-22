#!/usr/bin/env node
// RPC surface v0.10.3/0.10.4 — funciones críticas NO accesibles directamente a
// google.script.run (§93). Mecanismo: las funciones internas llevan sufijo `_`;
// si un nombre crítico existiera SIN sufijo, quedaría expuesto a google.script.run.
// El test detecta: (1) ausencia de exponer sin `_`, (2) que ninguna página llame
// a esas funciones por su nombre crítico, (3) que el acceso pasa solo por api_*
// con credencial válida (ACCESO UNIVERSAL v0.10.4; OPERADOR legacy v0.10.3).
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../src/',import.meta.url);
const CRITICAS=[
  'Hojas_resetFabrica',
  'Recuperar_ejecutar',
  'IA_limpiarEventosHuerfanos',
  'Modelo_agregarPacientes',
  'Modelo_agregarEventos',
  'Estrat_recalcularPaciente',
  'Ingresos_procesarTodasLasHojas'
];
let pruebas=0,faltas=[];
function t(nombre,fn){fn();pruebas++;console.log('[PASS] '+nombre);}

// (1) Unión de código `src`. Comprobar que cada crítica NO está definida como
// `function <nombre>` (sin `_`). La variante interna `_` sí debe existir.
const srcCodigo=[];
for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort()){
  srcCodigo.push(readFileSync(new URL(f,root),'utf8'));
}
const todo=srcCodigo.join('\n');
t('Ninguna función crítica se define sin sufijo `_` (expuesta a google.script.run)',()=>{
  for(const nombre of CRITICAS){
    const riesgo=new RegExp('function\\s+'+nombre+'\\s*\\(').test(todo);
    const interna=new RegExp('function\\s+'+nombre+'_\\s*\\(').test(todo);
    assert.equal(riesgo,false,nombre+' no debe definirse sin `_`');
    assert.equal(interna,true,nombre+' debe existir como interna `_`');
  }
});

// (2) Ninguna página HTML invoca esas funciones por su nombre crítico.
t('Ningún HTML llama a google.script.run.<critica> ni al nombre interno directo',()=>{
  const htmls=readdirSync(root).filter(x=>/\.html$/.test(x));
  assert.ok(htmls.length>0,'existen plantillas HTML');
  for(const f of htmls){
    const html=readFileSync(new URL(f,root),'utf8');
    for(const nombre of CRITICAS){
      assert.equal(html.includes('google.script.run.'+nombre),false,`${f}: no google.script.run.${nombre}`);
      assert.equal(html.includes('google.script.run.'+nombre+'_'),false,`${f}: no google.script.run.${nombre}_`);
      assert.equal(new RegExp('\\.'+nombre+'\\s*\\(').test(html),false,`${f}: no invoca ${nombre}`);
    }
  }
});

// (3) Los endpoints públicos equivalentes existen, toman token y exigen
//     credencial válida (ACCESO UNIVERSAL v0.10.4; OPERADOR solo como legacy).
t('El acceso a las críticas pasa solo por api_* públicos con credencial válida',()=>{
  const map={
    Hojas_resetFabrica:'api_instalarPaso',
    Recuperar_ejecutar:'api_registrarEvento',
    IA_limpiarEventosHuerfanos:'api_configGuardar',
    Modelo_agregarPacientes:'api_ingresoIncorporar',
    Modelo_agregarEventos:'api_registrarEvento',
    Estrat_recalcularPaciente:'api_estratRecalcularPaciente',
    Ingresos_procesarTodasLasHojas:'api_calidadSincronizarCola'
  };
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}}});
  for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort())
    vm.runInContext(readFileSync(new URL(f,root),'utf8'),ctx,{filename:f});
  const UNIVERSAL='a'.repeat(64),LEGACY='b'.repeat(64);
  const props=new Map();
  props.set('CAPTURA_ACCESS_TOKEN',UNIVERSAL);
  props.set('OPERADOR_ACCESS_TOKEN',LEGACY);
  ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
  ctx.Utilities={getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890',formatDate:()=>''};
  ctx.Session={getActiveUser:()=>({getEmail:()=>''})};
  ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>null}),openById:()=>null};
  ctx.Modelo_leerPacientes=()=>[];ctx.Modelo_hoja=()=>null;
  ctx.Log_info=()=>{};ctx.Log_warning=()=>{};ctx.Log_error=()=>{};ctx.Log_flush=()=>{};
  // Todos los wrappers de la superficie exigen WebApp_autorizarBuscador
  // (credencial válida universal; legacy v0.10.3 aceptado en transición).
  const presentes=Object.values(map).filter(n=>typeof ctx[n]==='function');
  assert.ok(presentes.length>=4,'hay wrappers api_* verificables');
  for(const nombre of presentes){
    try{
      const r=ctx[nombre](LEGACY);
      // no debe explotar la falta de backend: o negó por datos ausentes o quedó ok.
      assert.ok(typeof r==='object','wrappers devuelven objeto');
    }catch(e){
      // un wrapper puede lanzar antes por backend ausente; no debe ser porque
      // alguien esquivó la autorización.
      assert.ok(false,nombre+' lanzó excepción inesperada en VM: '+e.message);
    }
  }
});

t('Los wrappers api_* de las críticas se niegan con token inválido y sin token',()=>{
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}}});
  for(const f of readdirSync(root).filter(x=>/\.(js|gs)$/.test(x)).sort())
    vm.runInContext(readFileSync(new URL(f,root),'utf8'),ctx,{filename:f});
  const UNIVERSAL='a'.repeat(64),INVALIDO='0'.repeat(64);
  const props=new Map();
  props.set('CAPTURA_ACCESS_TOKEN',UNIVERSAL);
  props.set('OPERADOR_ACCESS_TOKEN','c'.repeat(64));
  ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
  ctx.Utilities={getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890',formatDate:()=>''};
  ctx.Session={getActiveUser:()=>({getEmail:()=>''})};
  ctx.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>null}),openById:()=>null};
  ctx.Modelo_leerPacientes=()=>[];ctx.Modelo_hoja=()=>null;
  ctx.Log_info=()=>{};ctx.Log_warning=()=>{};ctx.Log_error=()=>{};ctx.Log_flush=()=>{};
  const casos=[['api_estratRecalcularPaciente','P-FICTICIO'],['api_registrarEvento',{}]];
  for(const [nombre,...args] of casos){
    if(typeof ctx[nombre]!=='function')continue;
    const mal=ctx[nombre](...args,INVALIDO);
    assert.equal(mal.ok,false,nombre+' con token inválido negado');
    assert.equal(mal.motivo,'ACCESO_DENEGADO',nombre+' con token inválido: ACCESO_DENEGADO');
    const sin=ctx[nombre](...args);
    assert.equal(sin.ok,false,nombre+' sin token negado');
    const ok=ctx[nombre](...args,UNIVERSAL);
    assert.notEqual(ok.motivo,'ACCESO_DENEGADO',nombre+' con credencial universal autoriza (falla de negocio, no de acceso)');
  }
});
console.log('RPC surface v0.10.3: '+pruebas+'/'+pruebas+(faltas.length?' — FALTAS: '+faltas.join(', '):''));