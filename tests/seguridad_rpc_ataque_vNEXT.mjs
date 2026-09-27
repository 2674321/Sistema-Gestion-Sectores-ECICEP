#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
c.WebApp_autorizarBuscador=t=>t==='OPERADOR_PRUEBA';
let mutaciones=0;
c.Form_obtenerEstado=()=>({ok:true,estado:'OK'});
c.Form_procesarAhora=()=>{mutaciones++;return{ok:true}};
c.Form_refrescarControl=()=>{mutaciones++;return{ok:true}};
c.Form_reprocesar=()=>{mutaciones++;return{ok:true}};

for(const token of [undefined,'','CAPTURA_PRUEBA','INVALIDO']){
  assert.equal(c.api_formularioEstado(token).motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_formularioProcesar(token).motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_formularioControl(token).motivo,'ACCESO_DENEGADO');
  assert.equal(c.api_formularioReprocesar({},token).motivo,'ACCESO_DENEGADO');
}
assert.equal(mutaciones,0,'Captura anónima/token Captura no ejecuta administración legacy');
assert.equal(c.api_formularioEstado('OPERADOR_PRUEBA').ok,true);
assert.equal(c.api_formularioProcesar('OPERADOR_PRUEBA').ok,true);
assert.equal(c.api_formularioControl('OPERADOR_PRUEBA').ok,true);
assert.equal(c.api_formularioReprocesar({},'OPERADOR_PRUEBA').ok,true);
assert.equal(mutaciones,3,'Operador solo alcanza los tres wrappers mutantes previstos');

const html=readFileSync(new URL('FormularioPanel.html',src),'utf8');
assert.match(html,/data-acceso="<\?= TOKEN_ACCESO \?>"/);
assert.doesNotMatch(readFileSync(new URL('CapturaWeb.html',src),'utf8'),/OPERADOR_ACCESS_TOKEN|WebApp_claveOperador_/);
console.log('Ataque RPC vNEXT: Captura anónima y token Captura rechazados; Operador explícito PASS');
