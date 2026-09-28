#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
const src=new URL('../src/',import.meta.url), c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort()) vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
const CAP='a'.repeat(64),OP='b'.repeat(64),LEG='c'.repeat(64),props=new Map([
  ['CAPTURA_ACCESS_TOKEN',CAP],['OPERADOR_ACCESS_TOKEN',OP],['LEGACY_ACCESS_TOKEN',LEG]
]);
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)})};
c.Session={getActiveUser:()=>({getEmail:()=>''})};c.Utilities={formatDate:()=>''};
c.ContentService={createTextOutput:text=>({tipo:'texto',texto:text})};
c.HtmlService={createTemplateFromFile:n=>({archivo:n,evaluate(){return {tipo:'html',vars:this,setTitle(){return this},addMetaTag(){return this}}}})};
const base=c.doGet({parameter:{}});assert.equal(base.tipo,'html');
assert.equal(base.vars.CAPTURA_ACCESO,CAP);assert.equal(base.vars.TOKEN_ACCESO,CAP);assert.equal(base.vars.MODO_OPERADOR,false);assert.equal(base.vars.PORTAL_URL,'');
const captura=c.doGet({parameter:{acceso:CAP}});assert.equal(captura.vars.CAPTURA_ACCESO,CAP);assert.equal(captura.vars.TOKEN_ACCESO,CAP);assert.equal(captura.vars.MODO_OPERADOR,false);
const qrAntiguo=c.doGet({parameter:{acceso:'d'.repeat(64)}});assert.equal(qrAntiguo.vars.CAPTURA_ACCESO,CAP,'un QR antiguo recupera la capacidad de captura vigente');
assert.equal(c.WebApp_urlCompartida_(),c.ECICEP.WEB_APP_URL,'el QR contiene solo la URL base permanente');
assert.equal(c.WebApp_autorizarCaptura(CAP),true);assert.equal(c.WebApp_autorizar(CAP),false,'Captura no eleva a Operador');
assert.equal(c.WebApp_autorizar(OP),true);assert.equal(c.WebApp_autorizarCaptura(OP),false,'Operador no se inyecta como token Captura');
assert.equal(c.WebApp_autorizarCaptura(LEG),true);assert.equal(c.WebApp_autorizar(LEG),false,'legacy queda limitado a Captura');
assert.equal(c.api_instalarPaso('runtime',CAP,'x',{}).motivo,'ACCESO_DENEGADO');
c.Session={getActiveUser:()=>({getEmail:()=> 'persona@otro.test'})};assert.equal(c.WebApp_autorizar(''),false,'email no listado no autoriza');
props.set('OPERADOR_EMAILS','persona@otro.test');assert.equal(c.WebApp_autorizar(''),true,'allowlist explícita autoriza');
const web=readFileSync(new URL('WebApp.gs',src),'utf8');assert.doesNotMatch(web,/XFrameOptionsMode\.ALLOWALL/);
console.log('Seguridad WebApp capacidades vNEXT: PASS');
