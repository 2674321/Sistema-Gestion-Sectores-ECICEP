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

// El filtro real de blockers reparables, sin las funciones UI que lo siguen.
const helperSrc = (() => {
  const i = releaseSrc.indexOf('function Operacion_preflightBloqueosNoReparables_');
  assert.ok(i >= 0, 'existe Operacion_preflightBloqueosNoReparables_');
  const resto = releaseSrc.slice(i);
  const s = resto.slice(1).search(/\nfunction\s+/);
  return s >= 0 ? resto.slice(0, s + 1) : resto;
})();

const PROD = '1tRDqhbNRZB_bGUo5qp5dbz5_gN27CS2ULN9NSOdN1wo';
const regexProd = new RegExp(PROD);

/** Cuerpo textual de una función del wrapper (para guardas estáticas). */
function cuerpo(nombre) {
  const i = wrapperSrc.indexOf('function ' + nombre + '(');
  assert.ok(i >= 0, 'existe ' + nombre);
  const resto = wrapperSrc.slice(i);
  const abierto = resto.indexOf('{');
  let nivel = 0, fin = resto.length;
  for (let k = abierto; k < resto.length; k++) {
    if (resto[k] === '{') nivel++;
    else if (resto[k] === '}') { nivel--; if (nivel === 0) { fin = k + 1; break; } }
  }
  return resto.slice(0, fin);
}

function entorno(o) {
  o = o || {};
  const L = [];
  const props = Object.assign({}, o.props || {});
  let trigger = !!o.triggerPresente;
  let prodAperturas = 0;
  const cola = (o.preflight || []).slice();
  const prodAccesible = o.prodAccesible !== false;

  const ctx = {
    console: { log: (m) => { L.push('log:' + m); } },
    GOOGLE_FORMS_CONFIG: {
      TITULO: 'Captura ECICEP',
      SCHEMA_VERSION: 2,
      ACTIVATION_WINDOW: { CLAVE: 'ECICEP_ACTIVATION_WINDOW' }
    },
    Operacion_ventanaActivacionAbierta_: () => ({ ok: true, abierta: true }),
    Form_propEscribir_: (k, v) => {
      L.push('prop:' + k);
      if (o.escribeFalla) throw new Error('escribe-falla');
      if (o.escribeNoGuarda) return;
      props[k] = String(v);
    },
    Form_formId_: () => props.GOOGLE_FORM_ID || '',
    WebApp_operadorConfigurado_: o.operador || (() => true),
    Backup_triggerInstalado_: () => { L.push('trigger:consulta'); return trigger; },
    Backup_programar_: (dia, hora) => { L.push('programar:' + dia + '@' + hora); trigger = true; },
    _config_leerValores_: () => ({}),
    FormApp: {
      openById: (id) => {
        L.push('open:' + (id === PROD ? 'PROD' : id));
        if (!prodAccesible) throw new Error('no-accesible');
        if (o.caeAlVerificar && prodAperturas >= 1) throw new Error('no-accesible');
        prodAperturas++;
        return { id: id };
      },
      create: (titulo) => { L.push('create:' + titulo); return { getId: () => 'FORM-ALTERNO' }; }
    },
    Operacion_preflightRelease_: () => {
      L.push('preflight');
      return cola.length ? cola.shift() : { checks: [], resultado: 'ACTIVE_HEALTHY' };
    },
    Form_operativoInstalar_: () => { L.push('instalar'); return { ok: true }; },
    Form_operativoDiagnosticar_: () => {
      L.push('diag');
      return { ok: true, estado: { triggerOnFormSubmit: true, triggerWorker: true } };
    }
  };

  vm.createContext(ctx);
  vm.runInContext(helperSrc, ctx);
  vm.runInContext(wrapperSrc, ctx);
  return { ctx, L, props };
}

const plano = (o) => JSON.parse(JSON.stringify(o));
const cuenta = (L, p) => L.filter(function (x) { return x.indexOf(p) === 0; }).length;

// 1. Existe el helper y fija el ID exacto autorizado.
const cuerpoConfig = cuerpo('ECICEP_configurarFormProduccion_');
assert.match(cuerpoConfig, new RegExp('^function ECICEP_configurarFormProduccion_\\(\\)'), 'existe ECICEP_configurarFormProduccion_');
assert.ok(cuerpoConfig.indexOf("'" + PROD + "'") >= 0, 'contiene el ID exacto de producción');

// 2. Llama FormApp.openById; 3. escribe GOOGLE_FORM_ID; 4. verifica persistencia.
let e = entorno({});
let r = plano(e.ctx.ECICEP_configurarFormProduccion_());
assert.deepEqual(r, { ok: true });
assert.equal(e.props.GOOGLE_FORM_ID, PROD, 'escribe GOOGLE_FORM_ID con el ID de producción');
assert.equal(cuenta(e.L, 'open:PROD'), 2, 'abre y vuelve a verificar el Form objetivo');
assert.ok(e.L.indexOf('prop:GOOGLE_FORM_ID') >= 0, 'escribe la propiedad');
assert.ok(e.ctx.Form_formId_() === PROD, 'la propiedad persiste');

// 5. El resultado del helper NO devuelve el ID.
assert.doesNotMatch(JSON.stringify(r), regexProd, 'el helper no devuelve el ID');

// Fail-closed del helper de configuración.
e = entorno({ prodAccesible: false });
r = plano(e.ctx.ECICEP_configurarFormProduccion_());
assert.deepEqual(r, { ok: false, motivo: 'FORM_PRODUCTION_NOT_ACCESSIBLE' });
assert.equal(cuenta(e.L, 'prop:GOOGLE_FORM_ID'), 0, 'no escribe si el Form objetivo no abre');

e = entorno({ escribeFalla: true });
r = plano(e.ctx.ECICEP_configurarFormProduccion_());
assert.deepEqual(r, { ok: false, motivo: 'FORM_PRODUCTION_PROPERTY_WRITE_FAILED' });

e = entorno({ escribeNoGuarda: true });
r = plano(e.ctx.ECICEP_configurarFormProduccion_());
assert.deepEqual(r, { ok: false, motivo: 'FORM_PRODUCTION_PROPERTY_VERIFY_FAILED' });

e = entorno({ caeAlVerificar: true });
r = plano(e.ctx.ECICEP_configurarFormProduccion_());
assert.deepEqual(r, { ok: false, motivo: 'FORM_PRODUCTION_VERIFY_FAILED' });

// 6. Orden de activación: config objetivo → verificar ID → repairs → preflight → instalar → diag → post-preflight.
const pos = (t) => wrapperSrc.indexOf(t);
assert.ok(pos('WebApp_operadorConfigurado_()') < pos('ECICEP_configurarFormProduccion_()'), '3. configurar objetivo tras operador');
assert.ok(pos('ECICEP_configurarFormProduccion_()') < pos('if (!Form_formId_())'), '3 antes de 4 (verificar Form ID)');
assert.ok(pos('if (!Form_formId_())') < pos('ECICEP_asegurarBackupActivacion_()'), '4 antes de 5 (backup)');
assert.ok(pos('ECICEP_asegurarBackupActivacion_()') < pos('ECICEP_asegurarFormActivacion_()'), '5 antes de 6 (Form accesible)');
assert.ok(pos('ECICEP_asegurarFormActivacion_()') < pos('Operacion_preflightRelease_()'), '6 antes de 7 (preflight)');
assert.ok(pos('Operacion_preflightRelease_()') < pos('Form_operativoInstalar_('), '7 antes de 8 (instalar)');
assert.ok(pos('Form_operativoInstalar_(') < pos('Form_operativoDiagnosticar_()'), '8 antes de 9 (diagnóstico)');
assert.ok(pos('Form_operativoDiagnosticar_()') < wrapperSrc.lastIndexOf('Operacion_preflightRelease_()'), '9 antes de 10 (post-preflight)');

// 7. Si el Form objetivo no abre, el flujo completo para en FORM_CONFIG.
e = entorno({ prodAccesible: false });
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, false);
assert.equal(r.etapa, 'FORM_CONFIG');
assert.equal(r.motivo, 'FORM_PRODUCTION_NOT_ACCESSIBLE');
assert.equal(cuenta(e.L, 'preflight'), 0, 'sin preflight');
assert.equal(cuenta(e.L, 'instalar'), 0, 'sin instalar');
assert.equal(cuenta(e.L, 'create:'), 0, 'no crea Forms alternativos');

// 8. ECICEP_asegurarFormActivacion_ ya NO crea Forms alternativos.
assert.doesNotMatch(cuerpo('ECICEP_asegurarFormActivacion_'), /FormApp\.create/, 'la reparación no crea Formes');
assert.doesNotMatch(cuerpo('ECICEP_asegurarFormActivacion_'), /Form_propEscribir_/, 'la reparación no reescribe el ID');

// Flujo completo sano: configura el objetivo y llega a READY_FOR_DEPLOY.
e = entorno({
  preflight: [
    { checks: [{ nombre: 'FORM_SCHEMA_CURRENT', estado: 'BLOCK' }] },
    { checks: [], resultado: 'ACTIVE_HEALTHY' }
  ]
});
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, true);
assert.equal(r.estado, 'READY_FOR_DEPLOY');
assert.equal(e.props.GOOGLE_FORM_ID, PROD, 'el Form de producción quedó configurado');
assert.equal(cuenta(e.L, 'create:'), 0, 'el flujo completo no crea Forms');
assert.equal(r.repairs.formRecreated, false, 'no se recrea ningún Form');
assert.equal(r.legacy.estado, 'DEFERRED_POST_ACTIVATION');

// 5 (log). Ni el log ni el resultado filtran el ID.
const logs = e.L.filter(function (x) { return x.indexOf('log:') === 0; }).join(' ');
assert.doesNotMatch(logs, regexProd, 'el log no filtra el ID de producción');
assert.doesNotMatch(JSON.stringify(r), regexProd, 'el resultado no filtra el ID de producción');

// 9. Fast-path legacy intacto.
assert.doesNotMatch(wrapperSrc, /Form_legacyReconciliarDryRun_/, 'sin reconciliación legacy profunda');
assert.doesNotMatch(wrapperSrc, /Form_migrarTrailerLegacy_/, 'sin migración legacy en activación');

// 10. Post-preflight sigue siendo obligatorio.
e = entorno({
  preflight: [
    { checks: [] },
    { checks: [{ nombre: 'FORM_SCHEMA_CURRENT', estado: 'BLOCK' }] }
  ]
});
r = plano(e.ctx.ECICEP_ACTIVAR_AHORA());
assert.equal(r.ok, false);
assert.equal(r.etapa, 'POST_PREFLIGHT');
assert.equal(r.motivo, 'POST_RELEASE_PREFLIGHT_BLOCKED');
assert.notEqual(r.estado, 'READY_FOR_DEPLOY');

// Alcance: nada de deploy, QR, CapturaWeb ni acceso público en el wrapper.
assert.doesNotMatch(wrapperSrc, /clasp/i, 'sin clasp');
assert.doesNotMatch(wrapperSrc, /newDeployment|updateDeployment|\.deploy\s*\(/i, 'sin deploy');
assert.doesNotMatch(wrapperSrc, /\bqr\b|QR/i, 'sin cambios de QR');

console.log('activation_form_target_v260: PASS');