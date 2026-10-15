#!/usr/bin/env node
/**
 * P0 v0.17.0 — Barrera anti-inyección de fórmulas en Google Sheets.
 *
 * La captura pública escribe texto externo en celdas (FORM_RESPUESTAS,
 * INGRESO_*, PACIENTES, EVENTOS). Un texto como `=IMPORTXML(...)` sería
 * evaluado por Sheets si llega crudo a setValue/setValues. Este test verifica:
 *   1. el helper `Utl_textoSeguroCelda_` en los casos exigidos por la auditoría;
 *   2. que la frontera de persistencia de captura lo aplique a los campos libres;
 *   3. guardas estáticas de que el texto externo no esquiva la barrera.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const raiz = new URL('../', import.meta.url);
const utilSrc = fs.readFileSync(new URL('src/01_Utilidades.js', raiz), 'utf8');
const capturaSrc = fs.readFileSync(new URL('src/26_Captura.js', raiz), 'utf8');

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(utilSrc, sandbox, { filename: '01_Utilidades.js' });
vm.runInContext('var CAPTURA_V2 = { LEGACY: { nuevoIngreso: "NUEVO_INGRESO", registrarControl: "CONTROL" } };', sandbox);
vm.runInContext('function Form_marcadorFuente_(c, a) { return "FORM|" + c + "|" + a; }', sandbox);

function extraer(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  assert.ok(i >= 0, 'existe ' + nombre);
  const resto = src.slice(i);
  const s = resto.slice(1).search(/\nfunction\s+/);
  return s >= 0 ? resto.slice(0, s + 1) : resto;
}
vm.runInContext(extraer(capturaSrc, 'Captura_v2_marca_'), sandbox);
vm.runInContext(extraer(capturaSrc, 'Captura_v2_normalizadoAInterno_'), sandbox);

const seguro = sandbox.Utl_textoSeguroCelda_;
const aInterno = sandbox.Captura_v2_normalizadoAInterno_;

let pass = 0, fail = 0;
function t(nombre, fn) {
  try { fn(); console.log('[PASS] ' + nombre); pass++; }
  catch (e) { console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message || e)); fail++; }
}
const neutro = (v) => { assert.equal(typeof v, 'string'); assert.ok(v.startsWith("'"), 'debe neutralizarse: ' + JSON.stringify(v)); };

// 1. Casos exigidos: deben quedar como TEXTO literal.
[
  '=IMPORTXML("http://x","//a")',
  '=HYPERLINK("http://x")',
  '+SUM(A1:A9)',
  '-1+2',
  '@foo',
  '  =CMD(...)',
  '\t=...',
  '\r\n=EVIL()'
].forEach((v, i) => {
  t('helper neutraliza caso ' + (i + 1) + ' ' + JSON.stringify(v.slice(0, 18)), () => neutro(seguro(v)));
});

// 2. Contenido inocuo intacto (no modificar fechas/seriales/enums/sistema).
t('helper preserva contenido inocuo', () => {
  ['2020-01-01', 'M', 'FORM|abc|NUEVO_INGRESO', 'Juan Pérez', '12345', 'Estratificación G1'].forEach((v) => {
    assert.equal(seguro(v), v, 'no debe alterar ' + JSON.stringify(v));
  });
});

// 3. No toca valores no-string (números/fechas/booleanos deliberados).
t('helper no toca no-string', () => {
  assert.equal(seguro(42), 42);
  assert.equal(seguro(-1), -1);
  assert.equal(seguro(true), true);
  const d = new Date('2020-01-01T00:00:00Z');
  assert.equal(seguro(d), d);
  assert.equal(seguro(''), '');
  assert.equal(seguro(null), null);
});

// 4. La frontera de persistencia de captura ataca campos libres externos.
t('normalizadoAInterno neutraliza campos libres', () => {
  const norm = {
    accion: 'nuevoIngreso', rut: '1-9', nombre: '=IMPORTXML("x")',
    telefonos: '+SUM(1)', telefonoObs: '@foo', profesional: '-1+2',
    profesionalSecundario: '\t=HYPERLINK("x")', observaciones: '  =CMD(1)',
    fechaNacimiento: '1990-05-05', fechaIngreso: '2024-01-01', sector: 'VERDE',
    sexo: 'F', estratificacion: 'G1', saludMental: 'SI', fechaEvento: '2024-02-02'
  };
  const out = aInterno(norm, { marca: 'FORM|Cp2-abc|NUEVO_INGRESO' });
  ['NOMBRE', 'TELEFONOS', 'TELEFONO_OBS', 'PROFESIONAL', 'PROFESIONAL2', 'OBSERVACIONES'].forEach((k) => neutro(out[k]));
  // Fechas, enums y marca del sistema intactos.
  assert.equal(out.FECHA_NACIMIENTO, '1990-05-05');
  assert.equal(out.FECHA_INGRESO, '2024-01-01');
  assert.equal(out.FECHA_EVENTO, '2024-02-02');
  assert.equal(out.SEXO, 'F');
  assert.equal(out.SECTOR, 'VERDE');
  assert.equal(out.ESTRATIFICACION, 'G1');
  assert.equal(out.MARCA, 'FORM|Cp2-abc|NUEVO_INGRESO');
});

// 5. Guardas estáticas: la barrera está aplicada en la frontera correcta.
t('guarda estática: TR-1 usa la barrera en los campos libres', () => {
  const fn = extraer(capturaSrc, 'Captura_v2_normalizadoAInterno_');
  ['NOMBRE', 'TELEFONOS', 'TELEFONO_OBS', 'PROFESIONAL', 'PROFESIONAL2', 'OBSERVACIONES'].forEach((k) => {
    assert.match(fn, new RegExp(k + ':\\s*Utl_textoSeguroCelda_'), 'sin barrera en ' + k);
  });
});

t('guarda estática: FORM_RESPUESTAS e ingreso pasan por TR-1', () => {
  const persistir = extraer(capturaSrc, 'Captura_v2_persistirRegistro_');
  assert.match(persistir, /Captura_v2_normalizadoAInterno_/, 'persistirRegistro debe usar TR-1');
  const ingreso = extraer(capturaSrc, 'Captura_v2_entregarIngreso_');
  assert.match(ingreso, /Captura_v2_normalizadoAInterno_/, 'entregarIngreso debe usar TR-1');
  const evento = extraer(capturaSrc, 'Captura_v2_entregarEvento_');
  assert.match(evento, /Utl_textoSeguroCelda_/, 'el evento directo debe neutralizar observaciones/profesional');
  assert.doesNotMatch(evento, /observaciones:\s*norm\.observaciones\s*\|\|/, 'observaciones cruda prohibida');
});

console.log('\nTOTAL=' + (pass + fail) + ' PASS=' + pass + ' FAIL=' + fail);
process.exitCode = fail ? 1 : 0;
