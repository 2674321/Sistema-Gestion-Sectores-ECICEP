// v270 (P1) — input hardening del contrato autoritativo.
// Falla si:
//  · `Captura_v2_validar_` no acota el tamaño total del payload serializado;
//  · no acota la longitud de campos de texto libre;
//  · no acota tamaño/profundidad de `actualizacion`;
//  · el validador de transporte (Form directo) diverge de las cotas del contrato;
//  · un error de rechazo filtra el contenido (PII) en vez de solo la cota;
//  · alguna entrada hostil hace lanzar al validador (fuzz).
import assert from 'node:assert/strict';
import { createHarness } from './helpers/forms_v254_harness.mjs';

const h = createHarness();
const c = h.c;
const CID = 'Cp4-' + 'a'.repeat(32);
const LIM = c.CAPTURA_V2.LIMITES;

function base(extra) {
  return Object.assign({
    captureId: CID, accion: 'nuevoIngreso', rut: '12.345.678-5',
    nombre: 'PERSONA UNO', sexo: 'F', fechaNacimiento: '1980-01-02',
    sector: 'AMARILLO', fechaIngreso: '2026-10-12', estratificacion: 'G2',
    saludMental: 'NO', telefonos: '999999999', profesional: 'PROFESIONAL UNO',
    observaciones: 'OBS'
  }, extra || {});
}
function codigos(r) { return (r.errores || []).map(e => e.codigo); }

// --- 1 · payload serializado sobredimensionado → rechazo temprano SINTAXIS_INVALIDA
{
  const r = c.__Captura_v2_validar_real(base({ observaciones: 'x'.repeat(LIM.PAYLOAD_MAX_CHARS + 500) }), {});
  assert.equal(r.ok, false, 'payload gigante rechazado');
  assert.equal(r.errores[0].codigo, 'SINTAXIS_INVALIDA');
  assert.equal(r.errores[0].campo, null);
}

// --- 2 · longitudes de texto libre (una por una)
{
  const casos = [
    ['nombre', LIM.TEXTO.nombre], ['observaciones', LIM.TEXTO.observaciones],
    ['telefonos', LIM.TEXTO.telefonos], ['profesional', LIM.TEXTO.profesional],
    ['profesionalSecundario', LIM.TEXTO.profesionalSecundario]
  ];
  for (const [campo, max] of casos) {
    const extra = {}; extra[campo] = 'x'.repeat(max + 1);
    const r = c.__Captura_v2_validar_real(base(extra), {});
    assert.equal(r.ok, false, campo + ' sobre el tope debe fallar');
    assert.ok(codigos(r).indexOf('CAMPO_INVALIDO') !== -1, campo + ' → CAMPO_INVALIDO');
    assert.ok((r.errores || []).some(e => e.codigo === 'CAMPO_INVALIDO' && e.campo === campo), campo + ' señala el campo');
    // Sin PII: el mensaje solo expone la cota, no el contenido.
    assert.doesNotMatch(JSON.stringify(r.errores), /xxxxxxxxxx/, 'sin volcar el contenido');
  }
}

// --- 3 · límites exactos siguen siendo válidos (borde no restrictivo)
{
  const r = c.__Captura_v2_validar_real(base({ nombre: 'n'.repeat(LIM.TEXTO.nombre), observaciones: 'o'.repeat(LIM.TEXTO.observaciones) }), {});
  assert.equal(r.ok, true, 'exactamente en el tope debe aceptarse');
}

// --- 4 · actualizacion sobredimensionada → CAMPO_INVALIDO
{
  const a = { id: 'EC-001', rutOriginal: 'x'.repeat(LIM.ACTUALIZACION_MAX_CHARS + 1000),
    atenciones: [], campos: { OBSERVACIONES: { anterior: 'A', valor: 'B' } } };
  const r = c.__Captura_v2_validar_real({ captureId: CID, accion: 'actualizarDatos', rut: '12.345.678-5', profesional: 'PROFESIONAL UNO', actualizacion: a }, {});
  assert.equal(r.ok, false, 'actualizacion gigante rechazada');
  assert.ok((r.errores || []).some(e => e.codigo === 'CAMPO_INVALIDO' && e.campo === 'actualizacion'), 'CAMPO_INVALIDO actualizacion');
}

// --- 5 · profundidad de actualizacion (helper defensivo)
{
  const prof = c.Captura_v2_profundidad_({ a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } });
  assert.ok(prof > LIM.ACTUALIZACION_MAX_PROFUNDIDAD, 'mide anidamiento profundo');
  assert.ok(c.Captura_v2_profundidad_({ a: 1, b: 'x' }) <= 2, 'estructura plana');
}

// --- 6 · consistencia contrato ↔ transporte (Form directo NO salta topes)
{
  const gordo = { accion: 'nuevoIngreso', rut: '12345678-5', nombre: 'x'.repeat(LIM.TEXTO.nombre + 1) };
  const t = c.Form_validarPayloadTransporte_(gordo);
  assert.equal(t.ok, false, 'transporte rechaza nombre largo');
  assert.ok(t.errores.some(e => e.codigo === 'NOMBRE_LARGO'), 'código NOMBRE_LARGO');
  const ok = c.Form_validarPayloadTransporte_({ accion: 'nuevoIngreso', rut: '12345678-5', nombre: 'x'.repeat(LIM.TEXTO.nombre) });
  assert.ok(!ok.errores || ok.errores.every(e => e.codigo !== 'NOMBRE_LARGO'), 'en el tope el transporte acepta');
}

// --- 7 · FUZZ: entradas hostiles nunca lanzan; siempre {ok, errores}
{
  const hostiles = [
    0, -1, NaN, Infinity, true, false, null, undefined, [], {}, [[]], { a: [1, { b: 2 }] },
    'x'.repeat(50), '=IMPORTXML("http://x","//y")', '+SUM(A1:A9)', '-1+2', '@foo', '\t=CMD()',
    { anidado: { mas: [1, 2, { a: 'b' }] } }
  ];
  const campos = c.CAPTURA_V2.CAMPOS;
  for (const campo of campos) {
    for (const valor of hostiles) {
      const payload = base({}); payload[campo] = valor;
      let r;
      try { r = c.__Captura_v2_validar_real(payload, {}); }
      catch (e) { assert.fail('Captura_v2_validar_ lanzó con ' + campo + ' (índice hostil): ' + e.message); }
      assert.equal(typeof r.ok, 'boolean', 'ok booleano (' + campo + ')');
      assert.ok(Array.isArray(r.errores), 'errores array (' + campo + ')');
    }
  }
  // Payload raíz hostil.
  for (const raiz of [null, undefined, 42, 'texto', [], true]) {
    const r = c.__Captura_v2_validar_real(raiz, {});
    assert.equal(r.ok, false, 'raíz no objeto rechazada');
    assert.equal(r.errores[0].codigo, 'SINTAXIS_INVALIDA');
  }
}

// --- 8 · fuente única de cotas
{
  assert.equal(LIM.TEXTO.nombre, 200);
  assert.equal(LIM.TEXTO.observaciones, 2000);
  assert.equal(LIM.TEXTO.telefonos, 300);
  assert.equal(LIM.TEXTO.profesional, 120);
}

console.log('input_hardening_v0170: PASS');
