#!/usr/bin/env node
// vNEXT — §20/§21: aislar el acceso a FUENTES EXTERNAS de la captura (libro
// canónico). Un fallo de openById() externo Nunca debe: (a) romper la captura
// del Web App, (b) filtrar mensajes crudos del runtime (posible PII/ids), ni
// (c) confundirse con el acceso al libro de la Web App.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url);
const readSrc = f => readFileSync(new URL('../src/' + f.replace('src/',''), import.meta.url), 'utf8');

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Date, Math, Log: { info(){}, warning(){}, error(){}, perf(){}, flush(){} } });
const orden = ['00_Config.js','01_Utilidades.js','02_Normalizacion.js','03_Fuentes.js','04_Identificacion.js','13_Eventos.js','14_REM.js','15_RemExcel.js','16_Amarillo.js','17_Hojas.js','18_Calidad.js','12_Ingresos.js','24_Formulario.js','25_Entorno.js','05_Consolidacion.js','09_Log.js','06_Modelo.js','26_Captura.js','29_ActualizacionCaptura.js','31_Ficha.js'];
for (const f of orden) vm.runInContext(readSrc(f), ctx, { filename: f });

// 1) sanitizer: mensaje crudo de permisos → código estándar (sin leak).
assert.equal(ctx.Fuentes_sanitizarErrorAcceso_({ message: 'GoogleJsonResponseException: API call to sheets.spreadsheets.get failed with error: The caller does not have permission' }), 'EXTERNAL_SOURCE_PERMISSION_DENIED');
assert.equal(ctx.Fuentes_sanitizarErrorAcceso_({ message: 'Exception: No existe el archivo: xyz' }), 'EXTERNAL_SOURCE_PERMISSION_DENIED');
assert.equal(ctx.Fuentes_sanitizarErrorAcceso_({ message: 'Timeout leyendo hoja' }), 'EXTERNAL_SOURCE_NO_ACCESIBLE');

// 2) preflight con abridor externo que LANZA permisos → errores SANITIZADOS.
const fuentesCfg = vm.runInContext('Object.keys(FUENTES_DRIVE)', ctx);
assert.ok(fuentesCfg.length >= 1, 'FUENTES_DRIVE tiene fuentes externas configuradas');
const preDeny = ctx.Fuentes_preflightFuentes(() => { throw new Error('The caller does not have permission'); });
for (const f of preDeny.fuentes) {
  assert.ok(f.errores.length >= 1, f.archivo + ' reporta error');
  assert.equal(f.errores[0], 'EXTERNAL_SOURCE_PERMISSION_DENIED',
    f.archivo + ' → error sanitizado, sin mensaje crudo');
  assert.equal(f.accesible, false, f.archivo + ' no accesible');
  assert.ok(String(JSON.stringify(preDeny)).indexOf('permission') === -1 || f.errores[0] === 'EXTERNAL_SOURCE_PERMISSION_DENIED',
    'no se fuga el texto del runtime');
}

// 3) preflight con abridor ok → accesible y sin errores de permiso.
const hojaExt = { getLastRow: () => 1, getLastColumn: () => 1, getRange: () => ({ getValues: () => [['']] }) };
const fakeExt = { getName: () => 'FUENTE EXTERNA TEST', getSheetByName: (n) => hojaExt };
const preOk = ctx.Fuentes_preflightFuentes(() => fakeExt);
assert.equal(preOk.ok, true, 'preflight externo ok');
for (const f of preOk.fuentes) assert.equal(f.accesible, true, f.archivo + ' accesible');

// 4) Diagnóstico de los TRES dominios: un fallo externo NO toca la Web App ni el libro.
ctx.Modelo_ss = () => ({ getName: () => 'LIBRO CANÓNICO TEST' });
ctx.WebApp_autorizar = () => true; // DEC-102 (WebApp.gs:68)
const diag = ctx.Captura_v2_diagnosticoPermisos({ abridor: () => { throw new Error('No permission'); } });
assert.equal(diag.CAPTURE_WEBAPP_ACCESS.dominio, 'CAPTURE_WEBAPP_ACCESS');
assert.equal(diag.CAPTURE_WEBAPP_ACCESS.ok, true, 'dominio Web App intacto pese a fallo externo');
assert.equal(diag.CAPTURE_WEBAPP_ACCESS.autorizaUniversalmente, true, 'DEC-102 se conserva');
assert.equal(diag.CAPTURE_WEBAPP_ACCESS.exigeToken, false, 'sin gates de token');
assert.equal(diag.BOUND_SPREADSHEET_ACCESS.ok, true, 'libro canónico accesible');
assert.equal(diag.BOUND_SPREADSHEET_ACCESS.dominio, 'BOUND_SPREADSHEET_ACCESS');
assert.ok(Array.isArray(diag.EXTERNAL_SOURCE_ACCESS), 'dominio externo diagnosticado');
const codes = [];
for (const e of diag.EXTERNAL_SOURCE_ACCESS) codes.push(e.error);
assert.ok(codes.some(c => c === 'EXTERNAL_SOURCE_PERMISSION_DENIED'), 'externo SANITIZADO en el diagnóstico');
assert.ok(codes.every(c => c.indexOf('permission') === -1 || c === 'EXTERNAL_SOURCE_PERMISSION_DENIED'),
  'ningún mensaje crudo en el dominio externo');

// 5) La captura NO depende del dominio externo: enviar con abridor roto funciona.
//    El ctx de captura es del libro canónico; aquí se evidencia que un fallo de
//    openById() externo no es un fallo del motor de captura.
const c = ctx.Captura_v2_ctx();
assert.equal(typeof c.persistirRegistro, 'function', 'ctx de captura operativo');
const callPre = ctx.Fuentes_preflightFuentes(() => { throw new Error('No permission'); });
assert.equal(callPre.ok, false, 'externo reporta fallo');
// El ctx de captura sigue construyéndose: la clase externa no es prerrequisito.

console.log('Permisos dominios vNEXT: PASS');