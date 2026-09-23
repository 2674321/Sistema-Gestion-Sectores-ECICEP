#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = new URL('../src/', import.meta.url);
const read = f => readFileSync(new URL(f, src), 'utf8');
let n=0; const test=(name,fn)=>{fn();n++;console.log('[PASS] '+name);};
function body(text,name){const p=text.indexOf('function '+name);assert.ok(p>=0,name);const a=text.indexOf('{',p);let d=0;for(let i=a;i<text.length;i++){if(text[i]==='{')d++;if(text[i]==='}'&&--d===0)return text.slice(p,i+1);}throw Error(name);}
const inst=read('20_Instalador.js'), integ=read('33_Integridad.js'), ing=read('12_Ingresos.js'), bk=read('17_Hojas.js');
test('instalador adquiere lock antes del respaldo',()=>{const f=body(inst,'api_instalarPaso');assert.ok(f.indexOf('lock.tryLock')<f.indexOf('Instalar_asegurarBackup_'));});
test('etapa visual de respaldo no crea una copia fuera del lock',()=>{const f=body(inst,'Instalar_pRespaldo');assert.doesNotMatch(f,/Instalar_asegurarBackup_/);assert.match(f,/bajo bloqueo/);});
test('reparación pública respalda antes de mutar',()=>{const f=body(integ,'api_integridadReparar');assert.ok(f.indexOf("Backup_crear('PRE_REPARAR')")<f.indexOf('Integridad_repararDerivados_'));});
test('huérfanos y duplicados son solo reporte',()=>{const f=body(integ,'Integridad_repararDerivados_');assert.match(f,/HUERFANOS_SOLO_REPORTE/);assert.match(f,/DUPLICADOS_SOLO_REPORTE/);assert.doesNotMatch(f,/deleteRow|borrarEvento/);});
test('trigger informa handler tipo fuente cantidad y duplicación',()=>{const f=body(ing,'Triggers_diagnosticarIngresoOnEdit_');for(const x of ['handler','tipo','spreadsheetEsperado','cantidad','duplicado','asociado'])assert.match(f,new RegExp(x));});
test('backups previos quedan identificados',()=>{assert.match(bk,/BACKUP_PREFIJO_PRE/);assert.match(body(bk,'Backup_crear'),/PRE_/);});
console.log('Operación real v0.11.1 — '+n+'/'+n+' PASS');
