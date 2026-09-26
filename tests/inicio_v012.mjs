#!/usr/bin/env node
// v0.15.0 — Portada INICIO PRO (PANEL_OPERATIVO_PRO_V015, A1:AJ50). El contrato
// cambió intencionalmente desde V014: lienzo 36×50, 6 accesos, 6 KPIs,
// contrato único INICIO_CONTRATO, sin marco gigante ni SOBRANTE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/34_LibroUX.js', import.meta.url), 'utf8');
function extraer(nombre) {
  const ini = src.indexOf('function ' + nombre + '(');
  if (ini < 0) return '';
  const llave = src.indexOf('{', ini); let nivel = 0;
  for (let i = llave; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}' && --nivel === 0) return src.slice(ini, i + 1);
  }
  return '';
}
const fn = extraer('Inicio_construir_');
assert.ok(fn, 'Inicio_construir_ existe');
assert.match(fn, /getRange\(cto\.rango\)/);
assert.match(fn, /gestionado\.clear\(\)/);
assert.doesNotMatch(fn, /\bh\.clear\(|getDataRange\(\)\.clear/);
assert.doesNotMatch(fn, /COUNTIF|COUNTIFS|VLOOKUP|MAX\(PACIENTES/);
assert.match(fn, /Inicio_calcularMetricas_\(\)/);
assert.match(fn, /Inicio_guardarSnapshot_/);
assert.match(fn, /Inicio_escribirMetricas_/);
assert.match(src, /rango: 'A1:AJ50'/);
assert.match(src, /if \(!Utl_texto\(p\.ID_INTERNO\)\) return/);
assert.match(fn, /alturas\.length/,
  'la portada utiliza las 36 columnas del lienzo gestionado');
assert.match(fn, /h\.setColumnWidths\(1, cols, cto\.anchoColumna\)/,
  'los anchos de las 36 columnas se aplican en UNA llamada');
const cto = src.match(/var INICIO_CONTRATO = \{[\s\S]*?\n\};/)?.[0] || '';
assert.ok(cto, 'contrato único INICIO_CONTRATO existe');
assert.equal((cto.match(/texto: '/g) || []).length >= 6, true, '6 accesos en el contrato');
assert.match(src, /PANEL_OPERATIVO_PRO_V015/);
assert.doesNotMatch(src, /PANEL_OPERATIVO_V014[^0-9]/, 'V014 obsoleto (solo historial)');
assert.doesNotMatch(fn, /sistemaBorde/, 'sin marco exterior gigante');
assert.doesNotMatch(src, /COLUMNA:SOBRANTE/, 'SOBRANTE eliminado');
assert.match(fn, /h\.setFrozenRows\(2\); h\.setFrozenColumns\(0\)/);
assert.match(src, /integridad\.derivadosOk === false \? 'ERROR'/,
  'solo una divergencia reparable convierte Integridad en ERROR');
assert.match(src, /integridad\.evidenciaSoloReporte/,
  'la evidencia histórica se conserva como ADVERTENCIA');
console.log('Inicio v0.12/v0.13 — layout PASS');
