import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const wrapperSrc = fs.readFileSync(
  new URL('../src/99_ActivacionTemporal.js', import.meta.url),
  'utf8'
);
const releaseSrc = fs.readFileSync(
  new URL('../src/38_Release.js', import.meta.url),
  'utf8'
);

// Solo el helper de blockers reparables, sin las funciones UI que lo siguen.
const helperSrc = (() => {
  const i = releaseSrc.indexOf('function Operacion_preflightBloqueosNoReparables_');
  assert.ok(i >= 0, 'existe Operacion_preflightBloqueosNoReparables_');
  const resto = releaseSrc.slice(i);
  const s = resto.slice(1).search(/\nfunction\s+/);
  return s >= 0 ? resto.slice(0, s + 1) : resto;
})();

function entorno(o) {
  o = o || {};
  const L = [];
  const props = Object.assign({}, o.props || {});
  const abiertos = new Set(o.abiertos || []);
  let trigger = !!o.triggerPresente;
  const cola = (o.preflight || []).slice();
  if (o.prodAccesible !== false) abiertos.add('FORM-CONOCIDO');

  const ctx = {
    console: { log: (m) => { L.push('log:' + m); } },
    GOOGLE_FORMS_CONFIG: {
      TITULO: 'Captura ECICEP',
      SCHEMA_VERSION: 2,
      ACTIVATION_WINDOW: { CLAVE: 'ECICEP_ACTIVATION_WINDOW' }
    },
    Operacion_ventanaActivacionAbierta_: o.ventana || (() => ({ ok: true, abierta: true })),
    Form_propEscribir_: (k, v) => { L.push('prop:' + k); props[k] = String(v); },
    Form_formId_: () => props.GOOGLE_FORM_ID || '',
    WebApp_operadorConfigurado_: o.operador || (() => true),
    Backup_triggerInstalado_: () => { L.push('trigger:consulta'); return trigger; },
    Backup_programar_: (dia, hora) => {
      L.push('programar:' + dia + '@' + hora);
      if (o.programarFalla) throw new Error('programar-falla');
      if (!o.programarNoop) trigger = true;
    },
    _config_leerValores_: o.config || (() => ({})),
    FormApp: {
      openById: (id) => {
        L.push('open:' + id);
        if (!abiertos.has(id)) throw new Error('no-accesible');
        return { id: id };
      },
      create: (titulo) => {
        L.push('create:' + titulo);
        if (o.createFalla) throw new Error('create-falla');
        abiertos.add('FORM-CREADO');
        return { getId: () => 'FORM-CREADO' };
      }
    },
    ScriptApp: { getOAuthToken: () => 'TOKEN' },
    UrlFetchApp: {
      fetch: () => {
        L.push('fetch');
        if (o.fetchFalla) throw new Error('fetch-falla');
        return { getResponseCode: () => 200, getContentText: () => '{"formId":"FORM-CREADO"}' };
      }
    },
    Utilities: { sleep: () => { L.push('sleep'); } },
    Operacion_preflightRelease_: () => {
      L.push('preflight');
      return cola.length ? cola.shift() : { checks: [], resultado: 'ACTIVE_HEALTHY' };
    },
    Form_operativoInstalar_: () => {
      L.push('instalar');
      return o.instalar ? o.instalar() : { ok: true };
    },
    Form_operativoDiagnosticar_: () => {
      L.push('diag');
      return o.diag ? o.diag() : { ok: true, estado: { triggerOnFormSubmit: true, triggerWorker: true } };
    }
  };

  vm.createContext(ctx);
  vm.runInContext(helperSrc, ctx);
  vm.runInContext(wrapperSrc, ctx);
  return { ctx, L, props };
}

const plano = (o) => JSON.parse(JSON.stringify(o));
const res = (e, nombre) => plano(e.ctx[nombre]());
const nomes = (e, checks) => Array.from(e.ctx.Operacion_preflightBloqueosNoReparables_({ checks: checks }).map(function (c) { return c.nombre; }));
const cuenta = (L, p) => L.filter(function (x) { return x.indexOf(p) === 0; }).length;

// ---------------------------------------------------------------------------
// BACKUP TRIGGER
// ---------------------------------------------------------------------------

// 1. Trigger presente → NO reprograma.
let e = entorno({ triggerPresente: true, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' } });
let r = res(e, 'ECICEP_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: true, creado: false });
assert.equal(cuenta(e.L, 'programar:'), 0, 'trigger presente: no reprograma');

// 2. Trigger ausente → usa la API oficial y conserva día/hora configurados.
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, config: () => ({ BACKUP_DIA: 'MARTES', BACKUP_HORA: '21' }) });
r = res(e, 'ECICEP_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: true, creado: true });
assert.ok(e.L.indexOf('programar:MARTES@21') >= 0, 'conserva la configuración día/hora');
assert.equal(cuenta(e.L, 'trigger:consulta'), 2, 'verifica antes y después de reparar');

// 3. Sin configuración → defaults DOMINGO / 3; hora inválida → 3.
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' } });
r = res(e, 'ECICEP_asegurarBackupActivacion_');
assert.equal(r.ok, true);
assert.ok(e.L.indexOf('programar:DOMINGO@3') >= 0, 'default día/hora');
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, config: () => ({ BACKUP_DIA: 'SÁBADO', BACKUP_HORA: 'nope' }) });
r = res(e, 'ECICEP_asegurarBackupActivacion_');
assert.equal(r.ok, true);
assert.ok(e.L.indexOf('programar:SÁBADO@3') >= 0, 'hora inválida cae a 3');

// 4. Fail-closed: si la programación lanza, o si no queda instalado.
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, programarFalla: true });
r = res(e, 'ECICEP_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: false, motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' });
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, programarNoop: true });
r = res(e, 'ECICEP_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: false, motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' });

// 5. No crea respaldos, no borra archivos, no cambia retención.
assert.doesNotMatch(wrapperSrc, /Backup_crear_|Backup_podar_|BACKUP_MANTENER/);
assert.doesNotMatch(wrapperSrc, /ScriptApp\.newTrigger|deleteTrigger|DriveApp/);

// ---------------------------------------------------------------------------
// PREFLIGHT: QUÉ ES REPARABLE
// ---------------------------------------------------------------------------

e = entorno({});

// 6. FORM_SCHEMA_CURRENT es reparable por el instalador ANTES de instalar.
let bloqueos = nomes(e, [{ nombre: 'FORM_SCHEMA_CURRENT', estado: 'BLOCK' }]);
assert.deepEqual(bloqueos, [], 'FORM_SCHEMA_CURRENT reparable en preflight inicial');

// 7. BACKUP_TRIGGER_PRESENT y FORM_ACCESSIBLE siguen siendo no reparables.
bloqueos = nomes(e, [{ nombre: 'BACKUP_TRIGGER_PRESENT', estado: 'BLOCK' }]);
assert.deepEqual(bloqueos, ['BACKUP_TRIGGER_PRESENT'], 'BACKUP_TRIGGER_PRESENT no reparable');
bloqueos = nomes(e, [{ nombre: 'FORM_ACCESSIBLE', estado: 'BLOCK' }]);
assert.deepEqual(bloqueos, ['FORM_ACCESSIBLE'], 'FORM_ACCESSIBLE no reparable');
bloqueos = nomes(e, [{ nombre: 'FORM_PUBLISHED', estado: 'BLOCK' }, { nombre: 'FORM_ACCEPTING_RESPONSES', estado: 'BLOCK' }]);
assert.deepEqual(bloqueos, ['FORM_PUBLISHED', 'FORM_ACCEPTING_RESPONSES'], 'publicación no reparable');
bloqueos = nomes(e, [{ nombre: 'FORM_COLUMNS_CURRENT', estado: 'BLOCK' }, { nombre: 'FORM_SUBMIT_TRIGGER_COUNT', estado: 'BLOCK' }, { nombre: 'FORM_WORKER_TRIGGER_COUNT', estado: 'BLOCK' }]);
assert.deepEqual(bloqueos, [], 'los reparables previos siguen reparables');

// ---------------------------------------------------------------------------
// FLUJO COMPLETO ECICEP_ACTIVAR_AHORA
// ---------------------------------------------------------------------------

const base = {
  props: {},
  triggerPresente: false,
  config: () => ({ BACKUP_DIA: 'JUEVES', BACKUP_HORA: '4' }),
  preflight: [
    { checks: [{ nombre: 'FORM_SCHEMA_CURRENT', estado: 'BLOCK' }] },
    { checks: [], resultado: 'ACTIVE_HEALTHY' }
  ]
};

// 8. Orden: backup → bootstrap → verificar ID → preflight → instalar → diag → post-preflight.
e = entorno(base);
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, true);
assert.equal(r.estado, 'READY_FOR_DEPLOY');
assert.equal(r.repairs.backupTrigger, true, 'reparó el trigger de respaldo');
assert.equal(r.repairs.formCreated, true, 'creó el Form de producción');
assert.equal(r.repairs.formCreationMethod, 'FORMAPP');
assert.equal(r.legacy.estado, 'DEFERRED_POST_ACTIVATION');
const orden = e.L.filter(function (x) { return ['programar:JUEVES@4', 'create:Captura ECICEP', 'preflight', 'instalar', 'diag'].indexOf(x) >= 0; });
assert.deepEqual(orden, ['programar:JUEVES@4', 'create:Captura ECICEP', 'preflight', 'instalar', 'diag', 'preflight'], 'orden de reparaciones y gates');
assert.doesNotMatch(JSON.stringify(r), /FORM-CREADO/, 'el resultado no filtra IDs');

// 9. Fail-closed por etapa antes del preflight.
e = entorno(Object.assign({}, base, { programarFalla: true }));
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, false);
assert.equal(r.etapa, 'BACKUP_REPAIR');
assert.equal(r.motivo, 'BACKUP_TRIGGER_REPAIR_FAILED');
assert.equal(cuenta(e.L, 'preflight'), 0, 'sin preflight tras fallo de respaldo');
assert.equal(cuenta(e.L, 'instalar'), 0, 'sin instalar tras fallo de respaldo');

e = entorno(Object.assign({}, base, { createFalla: true, fetchFalla: true }));
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, false);
assert.equal(r.etapa, 'FORM_BOOTSTRAP');
assert.equal(r.motivo, 'FORM_API_CREATE_FAILED');
assert.equal(cuenta(e.L, 'preflight'), 0, 'sin preflight tras fallo de Form');
assert.equal(cuenta(e.L, 'instalar'), 0, 'sin instalar tras fallo de Form');

// 10. Blocker no reparable en el preflight inicial → STOP sin instalar.
e = entorno(Object.assign({}, base, {
  preflight: [{ checks: [{ nombre: 'BACKUP_TRIGGER_PRESENT', estado: 'BLOCK' }] }]
}));
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, false);
assert.equal(r.etapa, 'PREFLIGHT');
const bloq = Array.from(r.bloqueos);
assert.deepEqual(bloq, ['BACKUP_TRIGGER_PRESENT']);
assert.equal(cuenta(e.L, 'instalar'), 0, 'sin instalar ante blocker no reparable');

// 11. Post-preflight sigue bloqueando CUALQUIER BLOCK (aunque sea reparable).
e = entorno(Object.assign({}, base, {
  preflight: [
    { checks: [{ nombre: 'FORM_SCHEMA_CURRENT', estado: 'BLOCK' }] },
    { checks: [{ nombre: 'FORM_SCHEMA_CURRENT', estado: 'BLOCK' }] }
  ]
}));
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, false);
assert.equal(r.etapa, 'POST_PREFLIGHT');
assert.equal(r.motivo, 'POST_RELEASE_PREFLIGHT_BLOCKED');
assert.notEqual(r.estado, 'READY_FOR_DEPLOY');
const bloq2 = Array.from(r.bloqueos);
assert.deepEqual(bloq2, ['FORM_SCHEMA_CURRENT']);

// 12. El log de salida no filtra IDs ni excepciones.
const logs = e.L.filter(function (x) { return x.indexOf('log:') === 0; }).join(' ');
assert.doesNotMatch(logs, /FORM-CREADO|Error:|e\.message/);

// ---------------------------------------------------------------------------
// FAST PATH LEGACY CONSERVADO
// ---------------------------------------------------------------------------

assert.doesNotMatch(wrapperSrc, /Form_legacyReconciliarDryRun_/, 'sin reconciliación legacy profunda');
assert.doesNotMatch(wrapperSrc, /Form_migrarTrailerLegacy_/, 'sin migración legacy en activación');

console.log('activation_runtime_repair_v260: PASS');