#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import vm from 'node:vm';
const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
const props=new Map([['WEBHOOK_TOKEN','secreto-de-prueba-no-real']]);
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||''})};
c.ContentService={MimeType:{JSON:'json'},createTextOutput:t=>({texto:t,setMimeType(){return this}})};
c.Log_info_=()=>{};c.Log_error_=()=>{};c.Log_flush_=()=>{};c.Instalar_ejecutarPolitica_=()=>({ok:true,token:'no-debe-salir',paciente:'no-debe-salir'});
const leer=x=>JSON.parse(x.texto);
assert.equal(leer(c._wh_despachar_({parameter:{token:'secreto-de-prueba-no-real',action:'instalar'}},'GET')).motivo,'METODO_NO_PERMITIDO');
const post={parameter:{},postData:{contents:JSON.stringify({token:'secreto-de-prueba-no-real',action:'instalar'})}};
assert.equal(leer(c._wh_despachar_(post,'POST')).motivo,'MUTACIONES_REMOTAS_DESHABILITADAS');
props.set('WEBHOOK_MUTACIONES_HABILITADAS','SI');const ok=leer(c._wh_despachar_(post,'POST'));assert.equal(ok.ok,true);assert.equal(JSON.stringify(ok).includes('no-debe-salir'),false);
assert.equal(leer(c._wh_despachar_({parameter:{action:'estado'}},'GET')).motivo,'NO_AUTORIZADO');
// GET de lectura con token válido: handler interno existente sigue operando.
c.Entorno_actualGAS_=()=>({entorno:'TEST'});c.Modelo_hoja_=()=>null;
const estado=leer(c._wh_despachar_({parameter:{token:'secreto-de-prueba-no-real',action:'estado'}},'GET'));
assert.equal(estado.ok,true,JSON.stringify(estado));
// Webhook y operador usan tokens independientes: el webhook no toca OPSESS ni el
// secreto de operador (DEC-110: no mezclar WEBHOOK_TOKEN / OPSESS).
assert.equal(props.has('ECICEP_OPERATOR_SECRET_SHA256'),false);
assert.doesNotMatch(readFileSync(new URL('../src/Webhook.js',import.meta.url),'utf8'),/OPSESS|ECICEP_OPERATOR_SECRET/);
console.log('Webhook seguridad vNEXT: PASS');
