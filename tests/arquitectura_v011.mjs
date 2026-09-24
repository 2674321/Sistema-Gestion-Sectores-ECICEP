#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const src = new URL('../src/', import.meta.url);
const read = f => readFileSync(new URL(f, src), 'utf8');
function cuerpo(codigo, nombre) {
  const inicio = codigo.indexOf('function ' + nombre + '(');
  assert.notEqual(inicio, -1, 'función ausente: ' + nombre);
  let llave = codigo.indexOf('{', inicio), nivel = 0;
  for (let i = llave; i < codigo.length; i++) {
    if (codigo[i] === '{') nivel++;
    else if (codigo[i] === '}' && --nivel === 0) return codigo.slice(inicio, i + 1);
  }
  throw new Error('función sin cierre: ' + nombre);
}
let n = 0;
function test(nombre, fn) { fn(); n++; console.log('[PASS] ' + nombre); }

test('UI no escribe directamente en hojas SECTOR_*', () => {
  const html = readdirSync(src).filter(f => f.endsWith('.html')).map(read).join('\n');
  assert.doesNotMatch(html, /getSheetByName\s*\(\s*['"]SECTOR_/);
  assert.doesNotMatch(html, /appendRow\s*\([^)]*SECTOR_/);
});

test('captura interactiva no usa Form_leerMarcas', () => {
  assert.doesNotMatch(cuerpo(read('26_Captura.js'), 'Captura_v2_marcaEnEventos'), /Form_leerMarcas/);
});

test('lookup captureId rápido es puntual', () => {
  const fn = cuerpo(read('26_Captura.js'), 'Captura_v2_buscarRegistroRapido_');
  assert.match(fn, /createTextFinder/);
  assert.doesNotMatch(fn, /getDataRange|Form_leerRespuestas/);
  const publica = cuerpo(read('26_Captura.js'), 'Captura_v2_buscarRegistro');
  assert.doesNotMatch(publica, /getDataRange|getValues|Form_leerRespuestas/);
});

test('RUT móvil admite K y no fuerza teclado numérico', () => {
  const html = read('CapturaWeb.html');
  const rut = html.match(/<input[^>]+id="rut"[^>]*>/i)?.[0] || '';
  assert.match(rut, /inputmode="text"/i);
  assert.doesNotMatch(rut, /type="number"|inputmode="numeric"/i);
});

test('REM abre sin loader falso', () => {
  const html = read('RemVista.html');
  const inicial = html.slice(html.indexOf('<div class="scroll-wrap"'), html.indexOf('<script src='));
  assert.doesNotMatch(inicial, /class="prog"|Calculando el informe/);
});

test('selector Control/Seguimiento no hace RPC', () => {
  const fn = cuerpo(read('Controles.html'), 'setTipoVista');
  assert.doesNotMatch(fn, /google\.script\.run|ECICEP_lectura|consultar\s*\(/);
  assert.match(fn, /aria-pressed/);
});

test('schema estable y versión son los de v0.12.2', () => {
  const cfg = read('00_Config.js');
  assert.match(cfg, /VERSION:\s*'0\.12\.2'/);
  assert.match(cfg, /SISTEMA_VERSION_SCHEMA_ACTUAL\s*=\s*2/);
});

test('log evita lock anidado y recorta por bloque', () => {
  const log = read('09_Log.js');
  assert.match(log, /hasLock/);
  assert.match(log, /deleteRows\(/);
  assert.doesNotMatch(cuerpo(log, 'Log_flush'), /deleteRow\(/);
});

console.log('Arquitectura v0.12.2 — ' + n + '/' + n + ' PASS');
