import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHarness } from './helpers/forms_v254_harness.mjs';

// v0.17.0: helpers privados de activación reubicados en 38_Release.js.
const releaseSrc = fs.readFileSync(new URL('../src/38_Release.js', import.meta.url), 'utf8');
const canalSrc = fs.readFileSync(new URL('../src/36_FormsCanal.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../src/appsscript.json', import.meta.url), 'utf8'));

const TOKEN = 'ya29.TOKEN-SECRETO-DE-PRUEBA';
const API = 'https://forms.googleapis.com/v1/forms';

// Bloque de helpers privados de activación (backup + Forms API + bootstrap).
const activacionSrc = releaseSrc.slice(releaseSrc.indexOf('function Operacion_asegurarBackupActivacion_'));

const checkSrc = releaseSrc.slice(
  releaseSrc.indexOf('function Operacion_checkRelease_'),
  releaseSrc.indexOf('function Operacion_preflightRelease_')
);

// Solo Operacion_preflightRelease_, sin las funciones UI que la siguen.
const preflightSrc = (() => {
  const i = releaseSrc.indexOf('function Operacion_preflightRelease_');
  assert.ok(i >= 0, 'existe Operacion_preflightRelease_');
  const resto = releaseSrc.slice(i);
  const s = resto.slice(1).search(/\nfunction\s+/);
  return s >= 0 ? resto.slice(0, s + 1) : resto;
})();

// Solo Operacion_preflightBloqueosNoReparables_.
const reparablesSrc = (() => {
  const i = releaseSrc.indexOf('function Operacion_preflightBloqueosNoReparables_');
  const resto = releaseSrc.slice(i);
  const s = resto.slice(1).search(/\nfunction\s+/);
  return s >= 0 ? resto.slice(0, s + 1) : resto;
})();

function entorno(o) {
  o = o || {};
  const L = [], FETCHES = [];
  const props = Object.assign({}, o.props || {});
  const forms = new Set(o.accesibles || []);
  let trigger = !!o.triggerPresente;
  let crea = 0, aperturas = 0;

  const ctx = {
    console: { log: (m) => { L.push('log:' + m); } },
    GOOGLE_FORMS_CONFIG: { TITULO: 'Captura ECICEP', SCHEMA_VERSION: 2, ACTIVATION_WINDOW: { CLAVE: 'W' } },
    Operacion_ventanaActivacionAbierta_: () => ({ ok: true, abierta: true }),
    WebApp_operadorConfigurado_: () => true,
    Form_propEscribir_: (k, v) => { L.push('prop:' + k); if (!o.escribeNoGuarda) props[k] = String(v); },
    Form_formId_: () => props.GOOGLE_FORM_ID || '',
    Backup_triggerInstalado_: () => { L.push('trigger:consulta'); return trigger; },
    Backup_programar_: (dia, hora) => { L.push('programar:' + dia + '@' + hora); trigger = true; },
    _config_leerValores_: () => ({ BACKUP_DIA: 'DOMINGO', BACKUP_HORA: '3' }),
    FormApp: {
      openById: (id) => {
        L.push('open:' + id);
        aperturas++;
        if (!forms.has(id)) throw new Error('FORM_NO_ACCESIBLE');
        return { id: id };
      },
      create: (titulo) => {
        crea++;
        L.push('create:' + titulo);
        if (o.createFalla) throw new Error('FORM_APP_NO_DISPONIBLE');
        if (!o.createNoPropaga) forms.add('FORM-NUEVO');
        return { getId: () => 'FORM-NUEVO' };
      }
    },
    ScriptApp: { getOAuthToken: () => TOKEN },
    UrlFetchApp: {
      fetch: (url, opts) => {
        L.push('fetch:' + url);
        FETCHES.push({ url: url, opts: opts });
        if (o.fetchFalla) throw new Error('fetch-falla');
        try { const id = String(JSON.parse(String(o.cuerpo || '')).formId || '').trim(); if (id) forms.add(id); } catch (e) {}
        return { getResponseCode: () => o.codigo, getContentText: () => o.cuerpo };
      }
    },
    Utilities: { sleep: (ms) => { L.push('sleep:' + ms); } }
  };

  vm.createContext(ctx);
  vm.runInContext(activacionSrc, ctx);
  return { ctx, L, props, FETCHES, aperturas: () => aperturas, crea: () => crea };
}

const plano = (o) => JSON.parse(JSON.stringify(o));
const boot = (e) => plano(e.ctx.Operacion_bootstrapFormProduccion_());
const cuenta = (L, p) => L.filter((x) => x.indexOf(p) === 0).length;

// ---------------------------------------------------------------------------
// EXISTENTE: reutiliza el Form configurado si abre
// ---------------------------------------------------------------------------

let e = entorno({ props: { GOOGLE_FORM_ID: 'FORM-VIEJO' }, accesibles: ['FORM-VIEJO'] });
let r = boot(e);
assert.deepEqual(r, { ok: true, creado: false, metodo: 'EXISTING' });
assert.equal(e.crea(), 0, 'no crea otro Form');
assert.equal(cuenta(e.L, 'fetch:'), 0, 'no usa la API si no hace falta');
assert.equal(cuenta(e.L, 'prop:'), 0, 'no reescribe el ID sin necesidad');
assert.equal(e.aperturas(), 1, 'una sola apertura de verificación');

// ---------------------------------------------------------------------------
// FORMAPP: Form previo inaccesible → crea, verifica y recién ahí persiste
// ---------------------------------------------------------------------------

e = entorno({ props: { GOOGLE_FORM_ID: 'FORM-VIEJO' }, accesibles: [] });
r = boot(e);
assert.deepEqual(r, { ok: true, creado: true, metodo: 'FORMAPP' });
assert.equal(e.crea(), 1, 'crea exactamente un Form');
assert.equal(e.props.GOOGLE_FORM_ID, 'FORM-NUEVO', 'persiste el nuevo ID');
assert.equal(cuenta(e.L, 'fetch:'), 0, 'FormApp funcionó: no llega a la API');
assert.ok(e.L.indexOf('open:FORM-NUEVO') < e.L.indexOf('prop:GOOGLE_FORM_ID'), 'persiste después de verificar');

// ---------------------------------------------------------------------------
// FORMS API v1: fallback cuando FormApp.create falla
// ---------------------------------------------------------------------------

e = entorno({ createFalla: true, codigo: 200, cuerpo: JSON.stringify({ formId: 'FORM-NUEVO' }), accesibles: [] });
r = boot(e);
assert.deepEqual(r, { ok: true, creado: true, metodo: 'FORMS_API' });
assert.equal(e.FETCHES.length, 1, 'un solo intento de API');
const call = e.FETCHES[0];
assert.equal(call.url, API, 'endpoint exacto de Forms API v1');
assert.equal(call.opts.method, 'POST');
assert.equal(call.opts.contentType, 'application/json');
assert.equal(call.opts.muteHttpExceptions, true);
assert.equal(call.opts.headers.Authorization, 'Bearer ' + TOKEN, 'usa el OAuth token');
const cuerpoPost = JSON.parse(call.opts.payload);
assert.equal(cuerpoPost.info.title, 'Captura ECICEP');
assert.equal(cuerpoPost.info.documentTitle, 'Captura ECICEP');
assert.equal(e.crea(), 1, 'intentó FormApp primero');
assert.equal(e.props.GOOGLE_FORM_ID, 'FORM-NUEVO');
assert.ok(e.L.indexOf('open:FORM-NUEVO') < e.L.indexOf('prop:GOOGLE_FORM_ID'), 'verifica antes de persistir');
assert.doesNotMatch(JSON.stringify(r), new RegExp(TOKEN), 'no filtra el token en el resultado');
assert.doesNotMatch(e.L.join(' '), new RegExp(TOKEN), 'no filtra el token en el log');

// ---------------------------------------------------------------------------
// FAIL: clasificación de la API y fail-closed
// ---------------------------------------------------------------------------

const clasifica = (codigo, cuerpo) => {
  const t = entorno({ createFalla: true, codigo: codigo, cuerpo: cuerpo, accesibles: [] });
  return { r: boot(t), t: t };
};
assert.equal(clasifica(401, '{}').r.motivo, 'FORM_API_AUTH_REQUIRED');
assert.equal(clasifica(403, '{}').r.motivo, 'FORM_API_AUTH_REQUIRED');
assert.equal(clasifica(500, '{"error":"boom"}').r.motivo, 'FORM_API_CREATE_FAILED');
assert.equal(clasifica(200, '{}').r.motivo, 'FORM_API_INVALID_RESPONSE');
assert.equal(clasifica(200, 'no-json').r.motivo, 'FORM_API_INVALID_RESPONSE');
assert.equal(clasifica(200, JSON.stringify({ formId: '   ' })).r.motivo, 'FORM_API_INVALID_RESPONSE');
e = entorno({ createFalla: true, fetchFalla: true, accesibles: [] });
r = boot(e);
assert.equal(r.ok, false);
assert.equal(r.motivo, 'FORM_API_CREATE_FAILED');
assert.equal(cuenta(e.L, 'prop:'), 0, 'no persiste nada');

// Verificación agotada: 5 intentos, 4 esperas, sin persistir.
e = entorno({ createNoPropaga: true, accesibles: [] });
r = boot(e);
assert.equal(r.ok, false);
assert.equal(r.motivo, 'FORM_BOOTSTRAP_VERIFY_FAILED');
assert.equal(cuenta(e.L, 'open:FORM-NUEVO'), 5, '5 intentos de verificación');
assert.equal(cuenta(e.L, 'sleep:750'), 4, 'espera 750 ms entre intentos');
assert.equal(cuenta(e.L, 'prop:'), 0, 'no persiste sin verificar');

// Property write/read mismatch.
e = entorno({ escribeNoGuarda: true, accesibles: [] });
r = boot(e);
assert.equal(r.ok, false);
assert.equal(r.motivo, 'FORM_BOOTSTRAP_PROPERTY_VERIFY_FAILED');

// ---------------------------------------------------------------------------
// PUBLICACIÓN (instalador oficial)
// ---------------------------------------------------------------------------

const h = createHarness();
const inst = h.install();
assert.equal(inst.ok, true);
assert.equal(h.form.isPublished(), true, 'setPublished(true) cuando la API existe');
assert.equal(h.form.isAcceptingResponses(), true, 'setAcceptingResponses(true) cuando la API existe');

const hp = createHarness({ publishThrows: true });
const instPub = hp.install();
assert.equal(instPub.ok, false, 'excepción de publish → instalación falla');
assert.equal(instPub.motivo, 'FORM_PUBLISH_FAILED');

const ha = createHarness({ acceptingThrows: true });
const instAcc = ha.install();
assert.equal(instAcc.ok, false, 'excepción de accepting → instalación falla');
assert.equal(instAcc.motivo, 'FORM_ACCEPTING_RESPONSES_FAILED');

assert.match(canalSrc, /form\.setRequireLogin\(false\)/, 'sin login en el Form');
assert.match(canalSrc, /form\.setCollectEmail\(false\)/, 'sin correo en el Form');
assert.match(canalSrc, /typeof form\.setPublished === 'function'/, 'publicación condicionada por disponibilidad de API');
assert.match(canalSrc, /typeof form\.setAcceptingResponses === 'function'/, 'respuestas condicionadas por disponibilidad de API');

// ---------------------------------------------------------------------------
// ESTADO DE PUBLICACIÓN Y DIAGNÓSTICO
// ---------------------------------------------------------------------------

const pub = plano(h.c.Form_estadoPublicacion_(h.form));
assert.deepEqual(pub, { accesible: true, publicado: true, aceptaRespuestas: true });
const sinApi = plano(h.c.Form_estadoPublicacion_({}));
assert.deepEqual(sinApi, { accesible: true, publicado: null, aceptaRespuestas: null }, 'sin introspección: null, nunca false');
assert.equal(plano(h.c.Form_estadoPublicacion_(null)).accesible, false);

h.form.published = false;
const diagNoPublico = h.c.Form_operativoDiagnosticar_();
assert.equal(diagNoPublico.ok, false, 'diagnóstico falla con isPublished=false');
h.form.published = true;
h.form.acceptingResponses = false;
const diagNoAcepta = h.c.Form_operativoDiagnosticar_();
assert.equal(diagNoAcepta.ok, false, 'diagnóstico falla con isAcceptingResponses=false');

// ---------------------------------------------------------------------------
// PREFLIGHT: PASS / BLOCK / WARN de publicación
// ---------------------------------------------------------------------------

function preflightCon(publicacion, extra) {
  extra = extra || {};
  const ctx = {
    console: { log() {} },
    ECICEP: { VERSION: '0.17.0', WEB_APP_URL: 'https://script.google.com/macros/s/X/exec', SPREADSHEET_ID: 'SS' },
    SISTEMA_VERSION_SCHEMA_ACTUAL: 2,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => 'SS' }) },
    Form_formId_: () => 'FORM-X',
    FormApp: { openById: () => { if (extra.formAccesible === false) throw new Error('no-accesible'); return {}; } },
    Form_auditarSchema_: () => ({ seguro: true }),
    Form_hojaRespuetas_: () => ({ getLastColumn: () => 0 }),
    Form_columnas_: () => [],
    Utl_claveAlnum_: (s) => String(s),
    ScriptApp: { getProjectTriggers: () => [] },
    WebApp_operadorConfigurado_: () => true,
    Form_backlogResumen_: () => ({ ok: true, legacy: { total: 0 } }),
    Modelo_escanearEstructura_: () => ({ criticasFaltantes: extra.drift ? ['PACIENTES'] : [] }),
    Modelo_ss_: () => ({}),
    Modelo_hoja_: () => ({ getLastRow: () => 1 }),
    HOJAS: { CONFLICTOS: 'CONFLICTOS' },
    Utl_leerBloque_: () => [[]],
    Revision_indiceColumnas_: () => ({ ESTADOREVISION: 0, TIPO: 1 }),
    Operacion_ventanaActivacionAbierta_: () => ({ ok: true }),
    Form_estadoPublicacion_: () => publicacion
  };
  vm.createContext(ctx);
  vm.runInContext(checkSrc, ctx);
  vm.runInContext(preflightSrc, ctx);
  vm.runInContext(reparablesSrc, ctx);
  const r = plano(ctx.Operacion_preflightRelease_());
  const por = (n) => (r.checks.find((c) => c.nombre === n) || {}).estado;
  const reparables = plano(ctx.Operacion_preflightBloqueosNoReparables_(r)).map((c) => c.nombre);
  return { r, por, reparables };
}

let p = preflightCon({ accesible: true, publicado: true, aceptaRespuestas: true });
assert.equal(p.por('FORM_PUBLISHED'), 'PASS');
assert.equal(p.por('FORM_ACCEPTING_RESPONSES'), 'PASS');

p = preflightCon({ accesible: true, publicado: false, aceptaRespuestas: false });
assert.equal(p.por('FORM_PUBLISHED'), 'BLOCK');
assert.equal(p.por('FORM_ACCEPTING_RESPONSES'), 'BLOCK');
assert.ok(p.reparables.indexOf('FORM_PUBLISHED') < 0, 'FORM_PUBLISHED es reparable por el instalador');
assert.ok(p.reparables.indexOf('FORM_ACCEPTING_RESPONSES') < 0, 'FORM_ACCEPTING_RESPONSES es reparable por el instalador');
const otros = preflightCon({ accesible: true, publicado: false, aceptaRespuestas: false }, { formAccesible: false, drift: true });
assert.ok(otros.reparables.indexOf('FORM_ACCESSIBLE') >= 0, 'FORM_ACCESSIBLE sigue bloqueando');
assert.ok(otros.reparables.indexOf('BACKUP_TRIGGER_PRESENT') >= 0, 'BACKUP_TRIGGER_PRESENT sigue bloqueando');
assert.ok(otros.reparables.indexOf('NO_SCHEMA_DRIFT') >= 0, 'NO_SCHEMA_DRIFT sigue bloqueando');
assert.ok(otros.reparables.indexOf('FORM_COLUMNS_CURRENT') < 0, 'FORM_COLUMNS_CURRENT sigue reparable');
assert.ok(otros.reparables.indexOf('FORM_SUBMIT_TRIGGER_COUNT') < 0, 'FORM_SUBMIT_TRIGGER_COUNT sigue reparable');
assert.ok(otros.reparables.indexOf('FORM_WORKER_TRIGGER_COUNT') < 0, 'FORM_WORKER_TRIGGER_COUNT sigue reparable');
assert.ok(otros.reparables.indexOf('FORM_SCHEMA_CURRENT') < 0, 'FORM_SCHEMA_CURRENT sigue reparable');

p = preflightCon({ accesible: false, publicado: null, aceptaRespuestas: null });
assert.equal(p.por('FORM_PUBLISHED'), 'WARN', 'sin introspección: WARN');
assert.equal(p.por('FORM_ACCEPTING_RESPONSES'), 'WARN', 'sin introspección: WARN');
assert.equal(p.r.checks.filter((c) => c.estado === 'WARN').length, 2, 'WARN no bloquea el preflight');
assert.ok(p.reparables.indexOf('FORM_PUBLISHED') < 0, 'WARN no se trata como blocker');

// ---------------------------------------------------------------------------
// MANIFIESTO Y SEGURIDAD
// ---------------------------------------------------------------------------

assert.ok(manifest.oauthScopes.indexOf('https://www.googleapis.com/auth/forms.body') >= 0, 'scope forms.body presente');
assert.ok(manifest.oauthScopes.indexOf('https://www.googleapis.com/auth/forms') >= 0, 'scope forms conservado');
assert.ok(manifest.oauthScopes.indexOf('https://www.googleapis.com/auth/drive') >= 0, 'scope drive conservado');
assert.ok(manifest.oauthScopes.indexOf('https://www.googleapis.com/auth/script.external_request') >= 0, 'scope external_request conservado');
assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING', 'executeAs intacto');
assert.equal(manifest.webapp.access, 'ANYONE_ANONYMOUS', 'acceso anónimo intacto');

// Ningún ID concreto de Google Form en el código.
assert.doesNotMatch(activacionSrc, /1tRDqhb/, 'sin el ID del Form manual anterior');
assert.doesNotMatch(activacionSrc, /docs\.google\.com\/forms\/d\//, 'sin URL de Form concreto');
assert.doesNotMatch(releaseSrc, /docs\.google\.com\/forms\/d\/[A-Za-z0-9_-]{10,}/, 'sin Form concreto en el release');
assert.doesNotMatch(canalSrc, /docs\.google\.com\/forms\/d\/[A-Za-z0-9_-]{10,}/, 'sin Form concreto en el canal');
assert.doesNotMatch(activacionSrc, /console\.log\([^)]*[Tt]oken/, 'nunca registra el token');
assert.doesNotMatch(activacionSrc, /clasp/i, 'sin clasp');
assert.doesNotMatch(activacionSrc, /newDeployment|updateDeployment|\.deploy\s*\(/i, 'sin deploy');
assert.doesNotMatch(activacionSrc, /\bqr\b|QR/i, 'sin cambios de QR');
assert.doesNotMatch(activacionSrc, /Form_legacyReconciliarDryRun_/, 'sin reconciliación legacy profunda');
assert.doesNotMatch(activacionSrc, /Form_migrarTrailerLegacy_/, 'sin migración legacy en activación');
assert.doesNotMatch(activacionSrc, /DriveApp|deleteForm|trashed/, 'no borra Forms previos');

console.log('form_bootstrap_production_v260: PASS');
