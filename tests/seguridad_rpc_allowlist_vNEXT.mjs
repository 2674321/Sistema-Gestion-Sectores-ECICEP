#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const src=new URL('../src/',import.meta.url);
const allow=JSON.parse(readFileSync(new URL('./rpc_public_allowlist.json',import.meta.url),'utf8')).functions;
const archivos=readdirSync(src).filter(f=>/\.(?:js|gs)$/.test(f)).sort();
const funciones=[];
const codigo={};
for(const archivo of archivos){
  const s=readFileSync(new URL(archivo,src),'utf8');codigo[archivo]=s;
  for(const m of s.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm))
    if(!m[1].endsWith('_')) funciones.push(m[1]);
}
assert.deepEqual([...new Set(funciones)].sort(),[...allow].sort(),'la superficie RPC cambió sin revisión de allowlist');
for(const nombre of ['Instalar_pIntegridad','Instalar_pMigraciones','Instalar_pFuentes','Fuentes_cargaReal','Limpieza_ejecutar','Backup_podar'])
  assert.ok(!funciones.includes(nombre),nombre+' no puede ser RPC pública');
for(const nombre of ['api_instalarPaso','api_backupPodar','api_configGuardar','api_integridadReparar']){
  const todo=Object.values(codigo).join('\n');
  const pos=todo.indexOf('function '+nombre+'(');assert.ok(pos>=0,nombre+' existe');
  assert.match(todo.slice(pos,pos+1200),/WebApp_autorizar(?:Buscador)?\(/,nombre+' debe guardar capacidad Operador');
}
console.log('RPC allowlist vNEXT: '+funciones.length+' funciones públicas inventariadas; críticos internos privados');
