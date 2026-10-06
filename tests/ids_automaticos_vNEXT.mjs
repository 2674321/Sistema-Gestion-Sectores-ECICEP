#!/usr/bin/env node
// vNEXT — DEC-104: los identificadores de producción no dependen de la
// posición del registro ni de un contador reiniciable.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} }, JSON, Date, Math });
for (const f of readdirSync(new URL('src/', root)).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(read('src/' + f), c, { filename: f });

let n = 0;
function t(nombre, fn) {
  n++;
  try { fn(); console.log('[PASS] T' + n + ' ' + nombre); }
  catch (e) {
    console.log('[FAIL] T' + n + ' ' + nombre);
    console.log('   CAUSA: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    process.exitCode = 1;
  }
}
const E = e => vm.runInContext(e, c);
const canonico = new RegExp('^EC-[A-Z0-9]{1,12}-[A-Z0-9]{4,6}$');
const canonicoEvento = new RegExp('^EV-[A-Z0-9]{1,12}-[A-Z0-9]{4}$');

// ─────────────────────────────────────────────────────────────────────────────
// T1 — ID_INTERNO: automático y con componente aleatorio
// ─────────────────────────────────────────────────────────────────────────────
t('T1 Modelo_nuevoIdInterno produce IDs automáticos con sufijo aleatorio', () => {
  const ids = new Set();
  for (let i = 0; i < 400; i++) {
    const id = E('Modelo_nuevoIdInterno()');
    assert.match(id, canonico, 'formato canónico EC-<tiempo>-<aleatorio>: ' + id);
    ids.add(id);
  }
  assert.ok(ids.size >= 399, 'la variación debe venir del aleatorio, no del reloj: ' + ids.size + '/400');
});

t('T2 Modelo_nuevoIdInterno NO depende del índice de fila', () => {
  const a = E('Modelo_nuevoIdInterno(1)');
  const b = E('Modelo_nuevoIdInterno(9999)');
  assert.notEqual(a, b, 'el índice no puede determinar la identidad');
  assert.ok(!/^EC-0{4,}/.test(b), 'no puede volver a EC-000001: ' + b);
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — colisión: nunca se reutiliza una identidad existente
// ─────────────────────────────────────────────────────────────────────────────
t('T3 Modelo_resolverIdInterno_ rechaza un ID ya ocupado', () => {
  c.__ocupados = { 'EC-EXISTENTE-AAAA': true };
  const r = E('Modelo_resolverIdInterno_("EC-EXISTENTE-AAAA", __ocupados)');
  assert.equal(r.ok, true, 'debe emitir un ID utilizable: ' + JSON.stringify(r));
  assert.notEqual(r.idInterno, 'EC-EXISTENTE-AAAA', 'no puede devolver la identidad ocupada');
  assert.match(r.idInterno, canonico, 'el reemplazo sigue siendo canónico: ' + r.idInterno);
  assert.ok(c.__ocupados[r.idInterno], 'el ID emitido queda reservado');
  assert.equal(c.__ocupados['EC-EXISTENTE-AAAA'], true, 'la marca previa no se altera');
});

t('T4 Modelo_resolverIdInterno_ respeta un ID histórico libre no canónico', () => {
  // IDs previos a DEC-104 ('EC-000012') siguen siendo válidos: no se reescriben.
  c.__ocupados = {};
  const r = E('Modelo_resolverIdInterno_("EC-000012", __ocupados)');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.idInterno, 'EC-000012', 'un ID histórico libre se conserva tal cual');
});

t('T5 Modelo_resolverIdInterno_ emite ID canónico cuando no hay dato previo', () => {
  c.__ocupados = {};
  const r = E('Modelo_resolverIdInterno_("", __ocupados)');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.idInterno, 'nunca devuelve un ID vacío');
  assert.match(r.idInterno, canonico, 'debe generar uno canónico: ' + r.idInterno);
});

t('T5b un ID no canónico YA OCUPADO se rechaza, no se devuelve en silencio', () => {
  c.__ocupados = { 'EC-000012': true };
  const r = E('Modelo_resolverIdInterno_("EC-000012", __ocupados)');
  assert.equal(r.ok, false, 'no puede devolver ok con una identidad repetida: ' + JSON.stringify(r));
  assert.equal(r.motivo, 'ID_INTERNO_DUPLICADO');
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — ID_EVENTO
// ─────────────────────────────────────────────────────────────────────────────
t('T6 Ev_nuevoId produce IDs automáticos con sufijo aleatorio', () => {
  const ids = new Set();
  for (let i = 0; i < 400; i++) {
    const id = E('Ev_nuevoId()');
    assert.match(id, canonicoEvento, 'formato canónico EV-<tiempo>-<aleatorio>: ' + id);
    ids.add(id);
  }
  assert.ok(ids.size >= 399, 'variación real entre llamadas: ' + ids.size + '/400');
});

t('T7 Ev_nuevoId NO admite secuencia por argumento posicional', () => {
  // La inyección de pruebas es explícita ({secuenciaTest}); un número suelto
  // no puede reintroducir IDs secuenciales en producción.
  for (const valor of [1, 5, 421, '7']) {
    const id = E('Ev_nuevoId(' + JSON.stringify(valor) + ')');
    assert.ok(!/^EV-\d{4}$/.test(id), 'no secuencial con ' + JSON.stringify(valor) + ': ' + id);
  }
});

t('T8 Ev_nuevoId conserva el modo tests por inyección explícita', () => {
  assert.equal(E('Ev_nuevoId({secuenciaTest: 5})'), 'EV-0005');
  assert.equal(E('Ev_nuevoId({secuenciaTest: 421})'), 'EV-0421');
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 — sin reléj ni POSICIÓN como identidad
// ─────────────────────────────────────────────────────────────────────────────
t('T9 el generador no usa Date.now() como identidad completa', () => {
  const a = E('Modelo_nuevoIdInterno()');
  const b = E('Modelo_nuevoIdInterno()');
  const sufijoA = a.split('-').pop(), sufijoB = b.split('-').pop();
  assert.notEqual(sufijoA, sufijoB, 'el sufijo debe variar aunque el reloj no: ' + a + ' / ' + b);
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 — ninguna ruta productiva conserva el fallback secuencial
// ─────────────────────────────────────────────────────────────────────────────
t('T10 Ev_nuevoId solo construye IDs secuenciales bajo la guarda de test', () => {
  const cuerpo = (() => {
    const src = read('src/13_Eventos.js');
    const i = src.indexOf('function Ev_nuevoId(');
    let nivel = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
      if (src[k] === '{') nivel++;
      else if (src[k] === '}' && --nivel === 0) return src.slice(i, k + 1);
    }
  })();
  assert.ok(cuerpo, 'no se encontró Ev_nuevoId');
  for (const linea of cuerpo.split('\n')) {
    // Solo el relleno secuencial ('0000' + n) es identidad posicional; el sufijo
    // automático también empieza por 'EV-' + y es legítimo.
    if (!/\(\s*'0{4}'\s*\+/.test(linea)) continue;
    assert.match(linea, /secuenciaTest|seqTest/,
      'relleno secuencial fuera de la guarda de test: ' + linea.trim());
  }
  assert.doesNotMatch(cuerpo, /EV-['"]\s*\+\s*(?:i|idx|fila|n)\b/i,
    'Ev_nuevoId no puede derivarse de un índice');
});

t('T10b el generador de ID_INTERNO no conserva fallback posicional', () => {
  for (const archivo of ['src/03_Fuentes.js', 'src/12_Ingresos.js']) {
    assert.doesNotMatch(read(archivo), /newId\s*:\s*[^,\n]*EC-['"]\s*\+/,
      archivo + ' conserva un generador posicional de ID_INTERNO');
  }
});

t('T11 el generador de staging usa tiempo + aleatorio, no solo tiempo', () => {
  const src = read('src/03_Fuentes.js');
  assert.match(src, /ID_PROVISIONAL[\s\S]{0,600}Utl_sufijoAleatorio\(6\)/,
    'ID_PROVISIONAL debe llevar sufijo aleatorio de 6 caracteres');
});

// ─────────────────────────────────────────────────────────────────────────────
// T12 — IDs de ejecución: dos ejecuciones simultáneas no colisionan
// ─────────────────────────────────────────────────────────────────────────────
t('T12 los IDs de ejecución llevan sufijo aleatorio además del reloj', () => {
  for (const archivo of ['src/03_Fuentes.js', 'src/12_Ingresos.js', 'src/27_Actualizacion.js']) {
    const lineas = read(archivo).split('\n')
      .filter(l => /(?:CARGA|ACT|EJ)-['"]?\s*\+?[^\n]*Date\.now\(\)/.test(l));
    assert.ok(lineas.length > 0, archivo + ' debe construir su ID de ejecución con el reloj');
    for (const linea of lineas) {
      assert.match(linea, /Utl_sufijoAleatorio\(/,
        archivo + ' genera un ID de ejecución solo con el reloj: ' + linea.trim());
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// T13 — captureId: lo genera el cliente con aleatoriedad, no por posición
// ─────────────────────────────────────────────────────────────────────────────
t('T13 captureId se construye con aleatoriedad criptográfica', () => {
  const src = read('src/CapturaWeb.html');
  assert.match(src, /getRandomValues/, 'captureId debe usar aleatoriedad criptográfica');
  assert.match(src, /_hex16/, 'debe existir el generador hexadecimal de 16 bytes');
  // Y no puede asignarse desde un contador, una longitud o una fecha.
  const asignaciones = src.match(/captureId\s*=\s*[^;\n]{0,120}/g) || [];
  const posicionales = asignaciones.filter(a => /(\+\s*\w+\s*\+\s*1|\.length\b|\bnew Date\b)/.test(a));
  assert.equal(posicionales.length, 0,
    'captureId no puede derivarse de una posición ni del reloj del cliente: ' +
    posicionales.join(' | '));
});

console.log('IDs automáticos vNEXT: ' + n + ' casos ejecutados');