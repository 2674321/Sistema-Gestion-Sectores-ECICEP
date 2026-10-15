// v270 (§30) — Semántica del DV del RUT congelada con fixtures SINTÉTICOS.
// El módulo 11 chileno usa factores 2..7 que se repiten desde la derecha. Este
// test impide "correcciones" erróneas que crean que los factores son 2..9.
// Fixtures sintéticos (dígitos repetidos/patrones), nunca RUTs reales.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c = vm.createContext({ console, JSON, Date, Math, Object, String, Number, Array, RegExp, parseInt, parseFloat, isNaN });
for (const f of ['01_Utilidades.js', '02_Normalizacion.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src', f), 'utf8'), c, { filename: f });
}

// Implementación de referencia independiente (factores 2..7 cíclicos).
function dvReferencia(cuerpo) {
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : (resto === 10 ? 'K' : String(resto));
}

// 1 · La función productiva coincide con la referencia en un rango sintético.
for (let n = 1000000; n < 1000200; n++) {
  const s = String(n);
  assert.equal(c.Norm_dvModulo11_(s), dvReferencia(s), 'DV divergente para ' + s);
}

// 2 · Fixtures conocidos (cuerpo → DV) con DV correcto.
const OK = [['11111111', '1'], ['12345670', 'K'], ['12345678', '5'], ['5126663', '3'], ['1000005', 'K']];
for (const [cuerpo, dv] of OK) {
  const r = c.Norm_normalizarRut_(cuerpo + '-' + dv);
  assert.equal(r.estado, 'OK', cuerpo + '-' + dv + ' debe ser OK: ' + JSON.stringify(r));
  assert.equal(r.dvCalculado, dv, 'DV calculado ' + cuerpo);
  assert.equal(r.rut, cuerpo + '-' + dv, 'RUT normalizado');
}

// 3 · El caso citado por el megaprompt (§30) valida según el algoritmo vigente.
assert.equal(c.Norm_normalizarRut_('11.111.111-1').estado, 'OK', '11.111.111-1');

// 4 · DV erróneo → INVALIDO con el esperado, sin mutar el original.
const malo = c.Norm_normalizarRut_('9999999-9');
assert.equal(malo.estado, 'INVALIDO', 'DV erróneo rechazado');
assert.equal(malo.dvCalculado, '3', 'esperado 3');
assert.equal(malo.original, '9999999-9', 'original conservado');
assert.equal(c.Norm_normalizarRut_('11111111-2').estado, 'INVALIDO', 'DV erróneo 11.111.111-2');

// 5 · Cuerpo sin DV → SIN_DV y NUNCA inventa el dígito.
const sinDv = c.Norm_normalizarRut_('12345678');
assert.equal(sinDv.estado, 'SIN_DV', 'sin DV no es OK ni INVALIDO');
assert.equal(sinDv.dvCalculado, '5', 'calcula el DV pero no lo agrega');
assert.equal(sinDv.rut, '12345678', 'no se inventa el DV');

console.log('rut_fixtures_v270: PASS');
