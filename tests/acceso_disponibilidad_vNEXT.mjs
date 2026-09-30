#!/usr/bin/env node
/**
 * Guardián de DISPONIBILIDAD del acceso (DEC-102).
 *
 * `seguridad_webapp_capacidades_vNEXT.mjs` fija el CONTRATO del acceso. Esta
 * suite fija el otro lado, que es el que interés cuando algo se rompió en
 * producción: que ninguna función pueda quedar inaccesible por la credencial.
 *
 * Historia: DEC-097 separó CAPTURA de OPERADOR y bloqueó todas las vistas no
 * captura; DEC-101 lo corrigió con una credencial autoaprovisionada, pero
 * `WebApp_claveUniversal_` seguía lanzando si no conseguía el lock y `doGet` la
 * llamaba sin try/catch, de modo que dos cargas simultáneas sobre un almacén de
 * propiedades recién vacío podían devolver 500 en TODAS las vistas. Además
 * `WebApp_accesoUniversalActivo_` devolvía `false` en ese mismo caso y denegaba
 * 11 funciones de `28_IA.js`.
 *
 * Lo que se verifica aquí:
 *  1. Resolver la credencial nunca lanza: degrada a cadena vacía.
 *  2. `doGet` sirve TODAS las vistas declaradas aunque la credencial sea
 *     inobtenible, incluso si el accessor llega a lanzar.
 *  3. El acceso universal sigue activo aunque Script Properties esté roto.
 *  4. `WebApp_autorizar` concede ante cualquier entrada, sin excepción.
 *  5. El mapa de vistas es la fuente única y está sincronizado con los
 *     archivos HTML reales.
 *  6. Guarda estructural: nadie reintroduce un acceso fail-closed por token.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const src = new URL('../src/', import.meta.url);
const leer = (n) => readFileSync(new URL(n, src), 'utf8');
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(src).filter(x => /\.(?:js|gs)$/.test(x)).sort()) {
  vm.runInContext(leer(f), c, { filename: f });
}

const props = new Map();
c.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => props.get(k) || '',
    setProperty: (k, v) => props.set(k, v)
  })
};
c.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
c.Utilities = {
  formatDate: () => '',
  getUuid: () => '0123456789abcdef0123456789abcdef',
  sleep: () => {}
};
c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
c.ContentService = { createTextOutput: texto => ({ tipo: 'texto', texto }) };
c.HtmlService = {
  createTemplateFromFile: n => ({
    archivo: n,
    evaluate() { return { tipo: 'html', vars: this, setTitle() { return this }, addMetaTag() { return this } }; }
  })
};

const VISTAS = Object.keys(c.WebApp_vistasMapa_());

// --- 1. Resolver la credencial nunca lanza ----------------------------------
{
  const original = c.PropertiesService;
  // 1a. Script Properties inaccesible.
  c.PropertiesService = { getScriptProperties: () => { throw new Error('sin propiedades'); } };
  assert.equal(c.WebApp_claveUniversal_(), '', 'props rotas → credencial vacía, sin lanzar');
  assert.equal(c.WebApp_accesoUniversalActivo_(), true, 'el acceso sigue activo con props rotas');
  c.PropertiesService = original;

  // 1b. Lock tomado por otra petición: agota los reintentos y degrada.
  const lockOriginal = c.LockService, utilsOriginal = c.Utilities;
  let intentos = 0;
  c.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  c.Utilities = Object.assign({}, utilsOriginal, { sleep: () => { intentos++; } });
  props.clear();
  assert.equal(c.WebApp_claveUniversal_(), '', 'lock no disponible → credencial vacía, sin lanzar');
  assert.ok(intentos > 0, 'sí reintenta la lectura antes de rendirse');
  c.LockService = lockOriginal;
  c.Utilities = utilsOriginal;

  // 1c. Falla al generar el valor: no debe propagarse.
  c.Utilities = Object.assign({}, utilsOriginal, { getUuid: () => { throw new Error('sin uuid'); } });
  props.clear();
  assert.equal(c.WebApp_claveUniversal_(), '', 'getUuid falla → credencial vacía, sin lanzar');
  c.Utilities = utilsOriginal;

  // 1d. Camino feliz: se autoaprovisiona una credencial de 64 hex.
  props.clear();
  const creada = c.WebApp_claveUniversal_();
  assert.equal(creada.length, 64, 'sin credencial previa se autoaprovisiona una de 64');
  assert.equal(props.get('ECICEP_ACCESS_TOKEN'), creada, 'queda persistida en la clave canónica');
  assert.equal(c.WebApp_claveUniversal_(), creada, 'ya no se regenera en la siguiente lectura');
}

// --- 2. doGet sirve todas las vistas aunque la credencial sea inobtenible ----
{
  const ACCESO_REAL = c.WebApp_claveUniversal_;
  // 2a. El accessor devuelve vacío (props rotas).
  c.WebApp_claveUniversal_ = () => '';
  for (const v of VISTAS) {
    const r = c.doGet({ parameter: { vista: v } });
    assert.equal(r.tipo, 'html', 'vista ' + v + ' se sirve sin credencial');
  }
  // 2b. El accessor llega a lanzar: doGet no debe propagar el error.
  c.WebApp_claveUniversal_ = () => { throw new Error('boom'); };
  for (const v of VISTAS) {
    const r = c.doGet({ parameter: { vista: v } });
    assert.equal(r.tipo, 'html', 'vista ' + v + ' se sirve aunque la credencial lance');
  }
  c.WebApp_claveUniversal_ = ACCESO_REAL;
  const captura = c.doGet({ parameter: {} });
  assert.equal(captura.tipo, 'html', 'la captura (vista por defecto) también se sirve');
  assert.equal(c.doGet({ parameter: { vista: 'no-existe' } }).tipo, 'texto',
    'una vista inexistente responde texto, no un error');
}

// --- 3. El acceso universal no depende de la credencial ---------------------
assert.equal(c.WebApp_accesoUniversalActivo_(), true, 'acceso universal activo con credencial presente');
props.clear();
assert.equal(c.WebApp_accesoUniversalActivo_(), true, 'acceso universal activo sin credencial');

// --- 4. WebApp_autorizar concede ante cualquier entrada ---------------------
for (const entrada of [undefined, null, '', 'corta', 'd'.repeat(64), 'no-hex', 0, 1, {}, [], true]) {
  assert.equal(c.WebApp_autorizar(entrada), true, 'autoriza siempre (' + JSON.stringify(entrada) + ')');
  assert.equal(c.WebApp_autorizarBuscador(entrada), true, 'guard de buscador siempre concede');
  assert.equal(c.WebApp_autorizarCaptura(entrada), true, 'guard de captura siempre concede');
}

// --- 5. El mapa de vistas es la fuente única y está sincronizado ------------
{
  const archivos = new Set(readdirSync(src));
  assert.deepEqual(VISTAS.slice().sort(), [
    'backups', 'configuracion', 'controles', 'estadisticas', 'ficha', 'generarRem',
    'ingresos', 'instalar', 'pacientes', 'portal', 'registro', 'rem', 'revision'
  ], 'agregar o quitar una vista obliga a actualizar esta suite');
  for (const [vista, archivo] of Object.entries(c.WebApp_vistasMapa_())) {
    assert.ok(archivos.has(archivo + '.html'), 'la vista ' + vista + ' apunta a un HTML existente (' + archivo + ')');
  }
  assert.ok(!VISTAS.includes('captura'), 'captura se sirve por su propia rama de doGet');
}

// --- 6. Guarda estructural: nada reintroduce un acceso fail-closed ----------
{
  const web = leer('WebApp.gs');
  assert.doesNotMatch(web, /throw new Error\(['"]ACCESO_/,
    'resolver el acceso no puede lanzar un error de acceso');
  assert.match(web, /try \{ acceso = WebApp_claveUniversal_\(\) \|\| ''; \} catch/,
    'doGet resuelve la credencial con try/catch');
  for (const f of readdirSync(src).filter(x => /\.(?:js|gs)$/.test(x) && x !== 'WebApp.gs')) {
    assert.doesNotMatch(leer(f), /WebApp_accesoUniversalValido_\(/,
      f + ' no debe validar la credencial para decidir si una acción procede');
  }
  assert.doesNotMatch(web, /return !!WebApp_claveUniversal_\(\)/,
    'WebApp_accesoUniversalActivo_ no puede depender de resolver la credencial');
}

console.log('Disponibilidad del acceso vNEXT: PASS (' + VISTAS.length +
  ' vistas siempre servibles; la credencial nunca bloquea)');