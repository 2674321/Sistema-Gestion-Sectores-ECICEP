#!/usr/bin/env node
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
assert.match(fn, /getRange\(INICIO_RANGO_GESTIONADO\)/);
assert.match(fn, /gestionado\.clear\(\)/);
assert.doesNotMatch(fn, /\bh\.clear\(|getDataRange\(\)\.clear/);
assert.doesNotMatch(fn, /COUNTIF|COUNTIFS|VLOOKUP|MAX\(PACIENTES/);
assert.match(fn, /Inicio_calcularMetricas_\(\)/);
assert.match(fn, /Inicio_guardarSnapshot_/);
assert.match(fn, /Inicio_escribirMetricas_/);
assert.match(src, /INICIO_RANGO_GESTIONADO === 'A1:AD38'/);
assert.match(src, /if \(!Utl_texto\(p\.ID_INTERNO\)\) return/);
assert.match(fn, /alturas\.length/,
  'la portada utiliza las 30 columnas del lienzo gestionado');
assert.match(fn, /h\.setColumnWidths\(1, cols, 38\)/,
  'los 38 px de las 30 columnas se aplican en UNA llamada');
const bloqueAccesos = fn.match(/var accesos = \[[\s\S]*?\n  \];/)?.[0] || '';
assert.equal((bloqueAccesos.match(/\{ texto:/g) || []).length, 5,
  '5 accesos principales en el nuevo layout');
for (const acceso of ['PERSONAS', 'CAPTURA', 'INGRESOS', 'CONTROLES', 'REM'])
  assert.match(bloqueAccesos, new RegExp(acceso));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const rango of ["rango: 'A4:F7'", "rango: 'G4:L7'", "rango: 'M4:R7'", "rango: 'S4:X7'", "rango: 'Y4:AD7'"])
  assert.match(bloqueAccesos, new RegExp(esc(rango)));
for (const redundante of ['ABRIR ECICEP', 'NUEVA CAPTURA', 'BUSCAR PERSONA'])
  assert.doesNotMatch(bloqueAccesos, new RegExp(redundante));
assert.match(fn, /getRange\('A18:O18'\)\.merge\(\)\.setValue\('ESTADO DEL SISTEMA'\)/);
assert.match(fn, /Controles vencidos.*Próximos 30 días.*Sin próximo control.*Fichas por revisar/s);
assert.match(fn, /getRange\('P18:AD18'\)\.merge\(\)\.setValue\('PENDIENTES'\)/);
assert.match(fn, /getRange\('A27:AD29'\)\.merge\(\)\.setValue\('Estado y actualización en preparación'\)/);
assert.match(fn, /h\.setFrozenRows\(2\); h\.setFrozenColumns\(0\)/);
assert.match(src, /PANEL_OPERATIVO_V014/);
assert.match(src, /acceso3: 'INGRESOS'/,
  'el fingerprint por contenido obliga a migrar desde la portada anterior');
assert.match(src, /'AC20:AD20', 'AC21:AD21', 'AC22:AD22', 'AC23:AD23'\]\.map/,
  'pendientes de la portada se escriben en AC..AD (columna de valores)');
assert.match(src, /var rangosEstado = \['I20:O20', 'I21:O21', 'I22:O22', 'I23:O23'\]/,
  'estados del bloque ESTADO se escriben en las columnas de valor I..O');
assert.match(src, /integridad\.derivadosOk === false \? 'ERROR'/,
  'solo una divergencia reparable convierte Integridad en ERROR');
assert.match(src, /integridad\.evidenciaSoloReporte/,
  'la evidencia histórica se conserva como ADVERTENCIA');
console.log('Inicio v0.12/v0.13 — layout PASS');
