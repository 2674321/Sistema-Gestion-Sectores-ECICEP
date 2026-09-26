#!/usr/bin/env node
// v0.14 — Contrato canónico de formato de celdas (§59-61, §125):
// FORMATO_CAMPOS es la ÚNICA fuente; cada campo visible resuelve tipo, ancho,
// formato, alineación, vertical, wrapStrategy y superficie. DoD celdas:
// RUT/teléfonos como texto, fechas homogéneas, nombre legible, vertical y
// wrapStrategy consistentes. La firma de paridad cubre las nuevas dimensiones.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };
const esp = campo => c.Formato_especificacionCampo_(campo);
// `const` de nivel superior no cuelga del contexto vm: se leen por evaluación.
const g = nombre => vm.runInContext(nombre, c);

// T1: no hay FORMATO_CAMPOS_2 ni CONFIG_VISUAL_2 (una sola fuente).
{
  const src00 = readFileSync(new URL('00_Config.js', root), 'utf8');
  assert.doesNotMatch(src00, /FORMATO_CAMPOS_2|CONFIG_VISUAL_2/);
  assert.ok(g('FORMATO_CAMPOS') && g('FORMATO_TIPOS'));
  ok('T1 FORMATO_CAMPOS/FORMATO_TIPOS como fuente única (sin contratos paralelos)');
}

// T2: todo campo visible de las 4 familias resuelve el contrato completo.
{
  const campos = new Set([
    ...g('INGRESO_COLUMNAS'),
    ...c.COLUMNAS_SECTOR_VISTA,
    ...c.MODELO_PACIENTE.map(x => x.campo),
    ...c.COLUMNAS_EVENTOS
  ]);
  assert.ok(campos.size > 20, 'cobertura real (' + campos.size + ' campos)');
  for (const campo of campos) {
    const e = esp(campo);
    assert.ok(e.tipo, campo + ': tipo');
    assert.ok(Number(e.ancho) > 0, campo + ': ancho');
    assert.ok(e.formato !== undefined, campo + ': formato');
    assert.ok(e.alineacion, campo + ': alineación');
    assert.equal(e.vertical, 'MIDDLE', campo + ': vertical homogéneo');
    assert.ok(['WRAP', 'CLIP', 'OVERFLOW'].includes(e.wrapStrategy), campo + ': wrapStrategy');
    assert.ok(e.superficie !== undefined, campo + ': superficie');
  }
  ok('T2 ' + campos.size + ' campos resuelven tipo/ancho/formato/alineación/vertical/wrapStrategy/superficie');
}

// T3: DoD celdas — RUT y teléfonos como texto (no numéricos).
{
  for (const campo of ['RUT', 'TELEFONOS', 'TELEFONO(S)', 'NOMBRE']) {
    const e = esp(campo);
    assert.equal(e.formato, '@', campo + ' es texto (@), nunca numérico');
  }
  ok('T3 RUT/teléfonos/nombre con formato texto @');
}

// T4: fechas y fecha-hora homogéneas.
{
  for (const campo of ['FECHA DE NACIMIENTO', 'FECHA DE INGRESO', 'PROXIMO_CONTROL', 'FECHA_EVENTO'])
    assert.equal(esp(campo).formato, 'dd/MM/yyyy', campo);
  for (const campo of ['FECHA_REGISTRO', 'FECHA_PROCESO', 'FECHA_ACTUALIZACION'])
    assert.equal(esp(campo).formato, 'dd/MM/yyyy HH:mm', campo);
  ok('T4 fechas dd/MM/yyyy y fecha-hora dd/MM/yyyy HH:mm homogéneas');
}

// T5: EDAD numérica, ESTRATIFICACION/ESTADO centrados, NOTA_SISTEMA sistema 9pt.
{
  assert.equal(esp('EDAD').formato, '0');
  assert.equal(esp('EDAD').alineacion, 'CENTER');
  for (const campo of ['ESTRATIFICACION', 'ESTADO', 'ESTADO_INGRESO'])
    assert.equal(esp(campo).alineacion, 'CENTER', campo);
  assert.equal(esp('NOTA_SISTEMA').fontSize, 9, 'NOTA_SISTEMA 9pt (superficie sistema)');
  assert.equal(esp('NOMBRE').ancho, 240, 'nombre legible (columna amplia)');
  assert.equal(esp('NOMBRE').wrapStrategy, 'CLIP', 'nombre con CLIP (fila fija)');
  assert.ok(esp('OBSERVACIONES').ancho >= 280, 'observaciones amplias');
  ok('T5 EDAD/estados centrados, NOTA_SISTEMA 9pt, anchos legibles');
}

// T6: wrapStrategy migra desde `wrap` con compatibilidad temporal.
{
  assert.equal(esp('RUT').wrapStrategy, 'CLIP', 'RUT sin wrap → CLIP');
  assert.equal(esp('NOMBRE').wrapStrategy, 'CLIP', 'NOMBRE con CLIP (v0.15 §19, fila fija)');
  assert.equal(esp('OBSERVACIONES').wrapStrategy, 'CLIP', 'observaciones con CLIP (v0.15 §19)');
  assert.equal(esp('NOTA_SISTEMA').wrapStrategy, 'WRAP', 'sistema largo conserva WRAP');
  ok('T6 wrapStrategy WRAP/CLIP derivada de `wrap` (migración gradual)');
}

// T7: la firma de paridad cubre las dimensiones nuevas (§126).
{
  const firma = readFileSync(new URL('22_HojasVisual.js', root), 'utf8')
    .match(/function HVis_firmaVisualHoja_[\s\S]*?\n\}/)[0];
  for (const dim of ['ancho', 'numberFormat', 'alineacion', 'wrap', 'superficie', 'freeze', 'tabColor', 'merges'])
    assert.ok(firma.includes(dim), 'firma incluye ' + dim);
  ok('T7 firma visual con wrap/superficie/altura/freeze/tabColor/merges');
}

console.log('Formato celdas v0.14 — %d/%d PASS', n, 7);
if (n !== 7) process.exit(1);
