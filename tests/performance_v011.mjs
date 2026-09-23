#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
function test(nombre, fn) { fn(); n++; console.log('[PASS] ' + nombre); }

test('captureId en 20.000 filas usa TextFinder y lee solo la fila objetivo', () => {
  const headers = Array.from(c.Form_columnas()), ancho = headers.length;
  const fila = Array(ancho).fill('');
  const id = 'Cp4-' + 'a'.repeat(32), objetivo = 19999;
  fila[headers.indexOf('RESPONSE_ID')] = id; fila[headers.indexOf('ESTADO')] = 'PROCESADO';
  const lecturas = [];
  const hoja = { getLastRow: () => 20000, getLastColumn: () => ancho,
    getRange(r, col, nr, nc) {
      lecturas.push([r, col, nr, nc]);
      if (r === 1) return { getValues: () => [headers] };
      if (nc === 1 && col === headers.indexOf('RESPONSE_ID') + 1) return {
        createTextFinder: buscado => ({ matchEntireCell: exacta => ({ findNext: () => {
          assert.equal(buscado, id); assert.equal(exacta, true); return { getRow: () => objetivo };
        } }) }) };
      return { getValues: () => [fila] };
    } };
  c.Modelo_hoja = () => hoja;
  const r = c.Captura_v2_buscarRegistro(id);
  assert.equal(r.filaFisica, objetivo);
  assert.equal(lecturas.some(x => x[0] === 1 && x[2] === 20000 && x[3] === ancho), false);
  assert.equal(lecturas.some(x => x[0] === objetivo && x[2] === 1 && x[3] === ancho), true);
});

test('marca de captura usa lookup puntual y nunca Form_leerMarcas', () => {
  let puntual = 0, barrido = 0;
  c.Eventos_buscarPorFuente_ = f => { puntual++; return { idEvento: 'EV-1', idInterno: 'EC-1', fuente: f }; };
  c.Form_leerMarcas = () => { barrido++; return {}; };
  assert.equal(c.Captura_v2_marcaEnEventos('FORM|X|CONTROL').idEvento, 'EV-1');
  assert.equal(puntual, 1); assert.equal(barrido, 0);
});

test('post-write usa ID_EVENTO retornado y no realiza segundo lookup', () => {
  let lookups = 0;
  c.Captura_v2_buscarPersonaPorRut = () => ({ ID_INTERNO: 'EC-1' });
  c.Captura_v2_marcaEnEventos = () => { lookups++; return null; };
  c.Eventos_registrarPaciente_ = () => ({ ok: true, evento: { id: 'EV-DIRECTO' } });
  const r = c.Captura_v2_entregarEvento({ accion: 'registrarControl', rut: '11111111-1', fechaEvento: '2026-09-01' }, 'FORM|X|CONTROL', {});
  assert.equal(r.idEvento, 'EV-DIRECTO'); assert.equal(lookups, 1);
});

test('nuevo ingreso usa setValues y no appendRow', () => {
  const src = readFileSync(new URL('26_Captura.js', root), 'utf8');
  const fn = src.match(/function Captura_v2_entregarIngreso\([\s\S]*?\n\}/)[0];
  assert.doesNotMatch(fn, /appendRow\(/); assert.match(fn, /setValues\(\[filaIngreso\]\)/);
});

test('ficha puntual usa Modelo_buscarPaciente', () => {
  const src = readFileSync(new URL('31_Ficha.js', root), 'utf8');
  const fn = src.match(/function Ficha_construir_\([\s\S]*?\n\}/)[0];
  assert.match(fn, /Modelo_buscarPaciente\(idBus\)/);
  assert.doesNotMatch(fn, /Modelo_leerPacientesCampos/);
});

console.log('Hot path v0.11.0 — ' + n + '/' + n + ' PASS');
