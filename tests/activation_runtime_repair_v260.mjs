import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// v0.17.0: los helpers privados de activación viven ahora en 38_Release.js como
// `Operacion_*_` (la superficie pública temporal ECICEP_* fue retirada).
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

// Bloque de helpers privados de activación (backup + bootstrap + API).
const activacionSrc = releaseSrc.slice(releaseSrc.indexOf('function Operacion_asegurarBackupActivacion_'));

function entorno(o) {
  o = o || {};
  const L = [];
  const props = Object.assign({}, o.props || {});
  const abiertos = new Set(o.abiertos || []);
  let trigger = !!o.triggerPresente;

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
    Utilities: { sleep: () => { L.push('sleep'); } }
  };

  vm.createContext(ctx);
  vm.runInContext(helperSrc, ctx);
  vm.runInContext(activacionSrc, ctx);
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
let r = res(e, 'Operacion_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: true, creado: false });
assert.equal(cuenta(e.L, 'programar:'), 0, 'trigger presente: no reprograma');

// 2. Trigger ausente → usa la API oficial y conserva día/hora configurados.
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, config: () => ({ BACKUP_DIA: 'MARTES', BACKUP_HORA: '21' }) });
r = res(e, 'Operacion_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: true, creado: true });
assert.ok(e.L.indexOf('programar:MARTES@21') >= 0, 'conserva la configuración día/hora');
assert.equal(cuenta(e.L, 'trigger:consulta'), 2, 'verifica antes y después de reparar');

// 3. Sin configuración → defaults DOMINGO / 3; hora inválida → 3.
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' } });
r = res(e, 'Operacion_asegurarBackupActivacion_');
assert.equal(r.ok, true);
assert.ok(e.L.indexOf('programar:DOMINGO@3') >= 0, 'default día/hora');
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, config: () => ({ BACKUP_DIA: 'SÁBADO', BACKUP_HORA: 'nope' }) });
r = res(e, 'Operacion_asegurarBackupActivacion_');
assert.equal(r.ok, true);
assert.ok(e.L.indexOf('programar:SÁBADO@3') >= 0, 'hora inválida cae a 3');

// 4. Fail-closed: si la programación lanza, o si no queda instalado.
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, programarFalla: true });
r = res(e, 'Operacion_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: false, motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' });
e = entorno({ triggerPresente: false, props: { GOOGLE_FORM_ID: 'FORM-CONOCIDO' }, programarNoop: true });
r = res(e, 'Operacion_asegurarBackupActivacion_');
assert.deepEqual(r, { ok: false, motivo: 'BACKUP_TRIGGER_REPAIR_FAILED' });

// 5. No crea respaldos, no borra archivos, no cambia retención.
assert.doesNotMatch(activacionSrc, /Backup_crear_|Backup_podar_|BACKUP_MANTENER/);
assert.doesNotMatch(activacionSrc, /ScriptApp\.newTrigger|deleteTrigger|DriveApp/);

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
assert.equal(bloqueos.length, 0, 'publicación: reparable antes de instalar');
assert.ok(bloqueos.indexOf('FORM_PUBLISHED') < 0, 'FORM_PUBLISHED es reparable por el instalador');
assert.ok(bloqueos.indexOf('FORM_ACCEPTING_RESPONSES') < 0, 'FORM_ACCEPTING_RESPONSES es reparable por el instalador');
bloqueos = nomes(e, [{ nombre: 'FORM_COLUMNS_CURRENT', estado: 'BLOCK' }, { nombre: 'FORM_SUBMIT_TRIGGER_COUNT', estado: 'BLOCK' }, { nombre: 'FORM_WORKER_TRIGGER_COUNT', estado: 'BLOCK' }]);
assert.deepEqual(bloqueos, [], 'los reparables previos siguen reparables');

// ---------------------------------------------------------------------------
// SIN LEGACY EN EL CAMINO CRÍTICO
// ---------------------------------------------------------------------------

assert.doesNotMatch(activacionSrc, /Form_legacyReconciliarDryRun_/, 'sin reconciliación legacy profunda');
assert.doesNotMatch(activacionSrc, /Form_migrarTrailerLegacy_/, 'sin migración legacy en activación');

console.log('activation_runtime_repair_v260: PASS');
