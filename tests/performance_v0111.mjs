#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../src/26_Captura.js',import.meta.url),'utf8');let n=0;const test=(name,fn)=>{fn();n++;console.log('[PASS] '+name);};function body(name){const p=text.indexOf('function '+name),a=text.indexOf('{',p);let d=0;for(let i=a;i<text.length;i++){if(text[i]==='{')d++;if(text[i]==='}'&&--d===0)return text.slice(p,i+1);}throw Error(name);}
test('lookup de captureId usa findNext y una fila objetivo',()=>{const f=body('Captura_v2_buscarRegistroRapido_');assert.match(f,/findNext\(\)/);assert.doesNotMatch(f,/findAll\(|getValues\(\).*reverse/);});
test('búsqueda de marca apunta a NOTA_SISTEMA por layout',()=>{const f=body('Captura_v2_buscarMarcaEnHoja');assert.match(f,/Ingresos_layoutHoja_/);assert.match(f,/notaIdx/);assert.match(f,/findNext\(\)/);});
test('diagnóstico de duplicados está fuera del camino caliente',()=>{const hot=body('Captura_v2_buscarRegistroRapido_'),audit=body('Captura_diagnosticarCaptureIdsDuplicados_');assert.doesNotMatch(hot,/duplicad/);assert.match(audit,/duplicados/);});
console.log('Performance v0.11.1 — '+n+'/'+n+' PASS');
