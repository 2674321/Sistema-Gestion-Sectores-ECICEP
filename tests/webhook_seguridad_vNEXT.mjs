#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';
const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
const props=new Map([['WEBHOOK_TOKEN','secreto-de-prueba-no-real']]);
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||''})};
c.ContentService={MimeType:{JSON:'json'},createTextOutput:t=>({texto:t,setMimeType(){return this}})};
c.Log_info=()=>{};c.Log_error=()=>{};c.Log_flush=()=>{};c.Instalar_ejecutarPolitica=()=>({ok:true,token:'no-debe-salir',paciente:'no-debe-salir'});
const leer=x=>JSON.parse(x.texto);
assert.equal(leer(c._wh_despachar({parameter:{token:'secreto-de-prueba-no-real',action:'instalar'}},'GET')).motivo,'METODO_NO_PERMITIDO');
const post={parameter:{},postData:{contents:JSON.stringify({token:'secreto-de-prueba-no-real',action:'instalar'})}};
assert.equal(leer(c._wh_despachar(post,'POST')).motivo,'MUTACIONES_REMOTAS_DESHABILITADAS');
props.set('WEBHOOK_MUTACIONES_HABILITADAS','SI');const ok=leer(c._wh_despachar(post,'POST'));assert.equal(ok.ok,true);assert.equal(JSON.stringify(ok).includes('no-debe-salir'),false);
assert.equal(leer(c._wh_despachar({parameter:{action:'estado'}},'GET')).motivo,'NO_AUTORIZADO');
console.log('Webhook seguridad vNEXT: PASS');
