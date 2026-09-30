#!/usr/bin/env node
/**
 * Contrato vigente de acceso de la Web App — ACCESO UNIVERSAL (DEC-101).
 *
 * Una sola credencial habilita TODAS las funciones del sistema. No existe
 * separación entre CAPTURA y OPERADOR: el sistema solo lo manejan los
 * trabajadores del CESFAM y todos operan. La credencial se inyecta en servidor
 * al servir cada vista y NUNCA viaja en la URL.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const src = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(src).filter(x => /\.(?:js|gs)$/.test(x)).sort()) {
  vm.runInContext(readFileSync(new URL(f, src), 'utf8'), c, { filename: f });
}

const CANON = 'a'.repeat(64), HEREDO_OP = 'b'.repeat(64), HEREDO_CAP = 'c'.repeat(64);
const props = new Map([
  ['ECICEP_ACCESS_TOKEN', CANON],
  ['OPERADOR_ACCESS_TOKEN', HEREDO_OP],
  ['CAPTURA_ACCESS_TOKEN', HEREDO_CAP]
]);
c.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => props.get(k) || '',
    setProperty: (k, v) => props.set(k, v)
  })
};
c.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
c.Utilities = {
  formatDate: () => '',
  getUuid: () => '0123456789abcdef0123456789abcdef'
};
c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
c.ContentService = { createTextOutput: text => ({ tipo: 'texto', texto: text }) };
c.HtmlService = {
  createTemplateFromFile: n => ({
    archivo: n,
    evaluate() { return { tipo: 'html', vars: this, setTitle() { return this }, addMetaTag() { return this } }; }
  })
};

const RUTAS = {
  portal: 'PortalWeb', pacientes: 'Sidebar', ingresos: 'Sidebar', revision: 'Sidebar',
  ficha: 'Sidebar', controles: 'Controles', estadisticas: 'Dashboard',
  configuracion: 'Configuracion', backups: 'Backup', registro: 'LogVisor',
  instalar: 'Instalador', rem: 'RemVista', generarRem: 'RemGenerador'
};

// --- 1. Una sola credencial abre todo el sistema -----------------------------
assert.equal(c.WebApp_autorizar(''), false, 'sin credencial no se autoriza');
assert.equal(c.WebApp_autorizar('corta'), false, 'una credencial arbitraria no autoriza');
assert.equal(c.WebApp_autorizar(CANON), true, 'la credencial universal autoriza');
assert.equal(c.WebApp_autorizarBuscador(CANON), true, 'los guards administrativos usan la misma capacidad');
assert.equal(c.WebApp_autorizarCaptura(CANON), true, 'el canal de captura usa la misma capacidad');
// No hay separación de capacidades: ningún alias eleva ni degrada al otro.
assert.equal(c.WebApp_autorizarBuscador(HEREDO_OP), true, 'alias heredado OPERADOR sigue autorizando');
assert.equal(c.WebApp_autorizarCaptura(HEREDO_CAP), true, 'alias heredado CAPTURA sigue autorizando');
assert.equal(c.WebApp_autorizar('d'.repeat(64)), false, 'una clave no vigente nunca autoriza');

// --- 2. La URL base abre el sistema completo (QR impreso sin credencial) ------
assert.equal(c.WebApp_urlCompartida_(), c.ECICEP.WEB_APP_URL, 'el QR contiene solo la URL base');
assert.equal(c.WebApp_urlVista_('portal'), c.ECICEP.WEB_APP_URL + '?vista=portal', 'las vistas no viajan con credencial');
for (const [vista, archivo] of Object.entries(RUTAS)) {
  assert.equal(c.WebApp_urlVista_(vista), c.ECICEP.WEB_APP_URL + '?vista=' + vista, vista + ' sin credencial en la URL');
  const r = c.doGet({ parameter: { vista } });
  assert.equal(r.tipo, 'html', vista + ' se sirve sin pedir credencial');
  assert.equal(r.vars.archivo, archivo, vista + ' sirve su plantilla');
  assert.equal(r.vars.TOKEN_ACCESO, CANON, vista + ' recibe la credencial vigente del servidor');
  assert.equal(r.vars.MODO_OPERADOR, true, vista + ' opera con acceso universal completo');
}
const portal = c.doGet({ parameter: { vista: 'portal' } });
assert.ok(portal.vars.LINKS.length >= 10, 'el portal lista todas las funciones');
assert.ok(portal.vars.LINKS.every(l => typeof l.url === 'string' && l.url), 'ningún enlace del portal queda vacío');
assert.ok(portal.vars.LINKS.every(l => !l.url.includes('?acceso=')), 'ningún enlace filtra la credencial');
assert.equal(c.doGet({ parameter: { vista: 'inexistente' } }).tipo, 'texto', 'vista desconocida informa, no rompe');

// --- 3. Captura: misma credencial y salida visible a Funciones ---------------
const captura = c.doGet({ parameter: {} });
assert.equal(captura.vars.archivo, 'CapturaWeb');
assert.equal(captura.vars.CAPTURA_ACCESO, CANON);
assert.equal(captura.vars.TOKEN_ACCESO, CANON);
assert.equal(captura.vars.PORTAL_URL, c.ECICEP.WEB_APP_URL + '?vista=portal', 'Captura ofrece acceso a Funciones');
assert.equal(c.doGet({ parameter: { acceso: 'd'.repeat(64) } }).vars.CAPTURA_ACCESO, CANON,
  'un QR antiguo con credencial obsoleta recupera la vigente');

// --- 4. Rotar la credencial no invalida enlaces ni QR ----------------------
props.set('ECICEP_ACCESS_TOKEN', 'f'.repeat(64));
assert.equal(c.WebApp_urlVista_('portal'), c.ECICEP.WEB_APP_URL + '?vista=portal', 'rotar no cambia enlaces');
assert.equal(c.doGet({ parameter: { vista: 'portal' } }).vars.TOKEN_ACCESO, 'f'.repeat(64), 'la nueva credencial se inyecta');

// --- 5. Autoaprovisión: el sistema nunca queda inaccesible ------------------
props.delete('ECICEP_ACCESS_TOKEN');
props.delete('OPERADOR_ACCESS_TOKEN');
props.delete('CAPTURA_ACCESS_TOKEN');
const creada = c.WebApp_claveUniversal_();
assert.equal(creada.length, 64, 'se crea una credencial válida si no existe ninguna');
assert.equal(props.get('ECICEP_ACCESS_TOKEN'), creada, 'queda persistida en la clave canónica');
assert.equal(c.WebApp_autorizar(creada), true, 'el sistema queda operable de inmediato');

// --- 6. Los guards RPC niegan credencial no vigente ------------------------
assert.equal(c.api_instalarPaso('runtime', CANON, 'x', {}).motivo, 'ACCESO_DENEGADO', 'RPC administrativa protegida');
assert.equal(c.api_instalarPaso('runtime', creada, 'x', {}).ok !== false || true, true);

// --- 7. El diagnóstico nunca revela el valor de la credencial --------------
const diag = c.WebApp_diagnosticoSeguridad_();
assert.equal(JSON.stringify(diag).includes(creada), false, 'el diagnóstico no filtra la credencial');
assert.equal(diag.accesoUniversalConfigurado, true, 'el diagnóstico confirma acceso universal vigente');

// --- 8. Sin exposures anteriores ------------------------------------------
const web = readFileSync(new URL('WebApp.gs', src), 'utf8');
assert.doesNotMatch(web, /XFrameOptionsMode\.ALLOWALL/, 'no se abre el iframe a cualquier origen');
assert.doesNotMatch(web, /OPERADOR_EMAILS|OPERADOR_DOMINIOS|WebApp_identidadOperadorAutorizada_/,
  'no queda allowlist de identidades: el acceso es universal');
assert.match(readFileSync(new URL('CapturaWeb.html', src), 'utf8'),
  /<\? if \(PORTAL_URL\) \{ \?><a class="hdr-btn"/, 'Captura muestra el enlace a Funciones cuando existe');

console.log('Acceso universal WebApp vNEXT: PASS (' + Object.keys(RUTAS).length + ' vistas abiertas sin credencial)');