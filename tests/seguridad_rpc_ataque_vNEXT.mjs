#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const src=new URL('../src/',import.meta.url),c=vm.createContext({console:{log(){},warn(){},error(){}}});
for(const f of readdirSync(src).filter(x=>/\.(?:js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f,src),'utf8'),c,{filename:f});
c.WebApp_autorizarBuscador=t=>t==='OPERADOR_PRUEBA';
for(const retirado of ['Form_procesarAhora','UI_formularioPanel',
  'api_formularioEstado','api_formularioProcesar','api_formularioControl','api_formularioReprocesar'])
  assert.equal(typeof c[retirado],'undefined',retirado+' no debe seguir expuesto');
assert.doesNotMatch(readFileSync(new URL('CapturaWeb.html',src),'utf8'),/OPERADOR_ACCESS_TOKEN|WebApp_claveOperador_/);
console.log('Ataque RPC vNEXT: panel/trigger Forms legacy retirados y Captura sin token Operador PASS');
