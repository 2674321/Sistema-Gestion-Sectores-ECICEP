#!/usr/bin/env node
// v0.15.0 — P0 opciones/persistencia/verificación (§21 casos 1-19):
// propagación forzarInicio, fast-path con INICIO viejo, fingerprint global,
// persistencia solo tras PASS, pVerificar con Presentación, UI sin legado.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
const src = n => readFileSync(new URL(n, root), 'utf8');
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };
c.PropertiesService = { getScriptProperties: () => ({
  getProperty: () => '', setProperty: () => {}, deleteProperty: () => {} }) };
c.Utilities = { getUuid: () => '12345678-1234-4123-8123-123456789abc', formatDate: () => '' };
c.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
const clave = c.WebApp_claveCompartida_();
c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
c.Mig_schemaLeido = () => '2';
c.Instalar_asegurarBackup_ = () => ({ ok: true, creado: false });
c.Log_info = () => {}; c.Log_error = () => {}; c.Log_flush = () => {};

// T1+2+5: full install transmite forzarInicio; pDiseno reenvía; force borra INICIO.
{
  let pasoArgs = null, borrados = 0;
  const realPaso = c.Presentacion_ejecutarPaso_;
  c.Presentacion_ejecutarPaso_ = (etapa, ej, op) => { pasoArgs = [etapa, ej, op]; return { ok: true }; };
  const realBorrar = c.Inicio_borrarLayout_;
  c.Inicio_borrarLayout_ = () => { borrados++; };
  assert.equal(c.api_instalarPaso('diseno', clave, 'EJ-F', { forzarInicio: true }).ok, true);
  assert.equal(pasoArgs[0], 'diseno');
  assert.equal(pasoArgs[2] && pasoArgs[2].forzarInicio, true, 'opciones llegan al motor');
  assert.equal(borrados, 1, 'force invalida INICIO_LAYOUT_PROP');
  c.Presentacion_ejecutarPaso_ = realPaso;
  c.Inicio_borrarLayout_ = realBorrar;
  assert.match(src('20_Instalador.js'), /return Presentacion_ejecutarPaso_\('diseno', ejecucion, opciones \|\| \{\}\);/);
  ok('T1/T2/T5 forzarInicio viaja full install → pDiseno → motor e invalida INICIO');
}

// T3+4: ejecutarPaso recibe opciones; subtarea inicio fuerza el builder.
{
  let borrados = 0;
  const constr = [];
  c.Inicio_borrarLayout_ = () => { borrados++; };
  c.Inicio_construir_ = (ss, op) => { constr.push(op && op.forzar); return { ok: true }; };
  c.Modelo_ss = () => ({});
  const r = c.Presentacion_ejecutarTarea_({ id: 'inicio', nombre: 'Portada INICIO' }, { forzarInicio: true });
  assert.equal(r.ok, true);
  assert.equal(borrados, 1);
  assert.deepEqual(constr, [true], 'builder con {forzar:true}');
  borrados = 0; constr.length = 0;
  const r2 = c.Presentacion_ejecutarTarea_({ id: 'inicio', nombre: 'Portada INICIO' }, {});
  assert.equal(r2.ok, true);
  assert.equal(borrados, 0, 'sin force no se borra');
  assert.deepEqual(constr, [false]);
  ok('T3/T4 subtarea inicio usa {forzar:true} solo con force explícito');
}

// T6: retry preserva opciones (estático, complementa suites HTML).
{
  const html = src('Instalador.html');
  assert.match(html, /function opcionesInstalacion\(\)/);
  assert.match(html, /_OPCIONES_EJECUCION=opcionesInstalacion\(\)/);
  assert.doesNotMatch(html, /llamarPresentacion\(er\.etapa,er\.ix,false\)/);
  ok('T6 opcionesInstalacion() + retry con opciones exactas');
}

// T7: HVis OK + INICIO viejo → Presentación NO se omite.
{
  const props = new Map();
  c.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => props.get(k) || '', setProperty: (k, v) => props.set(k, v),
    deleteProperty: k => { props.delete(k); } }) };
  props.set(vm.runInContext('PRESENTACION_LAYOUT_PROP', c),
    JSON.stringify({ version: vm.runInContext('PRESENTACION_LAYOUT_VERSION', c),
      fingerprint: c.Presentacion_fingerprintEsperado_() }));
  c.Modelo_ss = () => ({ getSheetByName: () => ({}) });
  c.HVis_diagnosticarTodas = () => ({ diagnostico: {} });
  c.Inicio_layoutVigente_ = () => false;
  c.HVis_compararFamilia_ = () => ({ ok: true, cantidadDiferencias: 0, diferencias: [] });
  assert.equal(c.Presentacion_layoutVigente_({}), false, 'INICIO viejo impide el fast-path');
  c.Inicio_layoutVigente_ = () => true;
  assert.equal(c.Presentacion_layoutVigente_({}), true, 'todo convergente sí se omite');
  ok('T7 fast-path exige INICIO vigente (no solo HVis)');
}

// T8+9: fingerprint global depende de INICIO; V014 obsoleto.
{
  const a = c.Presentacion_fingerprintEsperado_();
  const realFp = c.Inicio_fingerprintEsperado_;
  c.Inicio_fingerprintEsperado_ = () => 'pro015|00000000';
  const b = c.Presentacion_fingerprintEsperado_();
  c.Inicio_fingerprintEsperado_ = realFp;
  assert.notEqual(a, b, 'cambio de contrato INICIO invalida Presentación');
  assert.doesNotMatch(src('34_LibroUX.js'), /PANEL_OPERATIVO_V014[^0-9]/, 'V014 obsoleto fuera de historial');
  ok('T8/T9 fingerprint global incluye INICIO; V014 obsoleto');
}

// T11+12+13: verificación false NO guarda NI limpia; true SÍ (end-to-end con hojas).
{
  const hojas = ['PACIENTES', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE',
    'SECTOR_NARANJO', 'SECTOR_AMARILLO', 'SECTOR_VERDE', 'EVENTOS'];
  const fishing = {};
  hojas.forEach(h => { fishing[h] = 0; });
  c.Modelo_aplicarDiseno = () => ({ ok: true });
  c.Hojas_aplicarValidaciones_ = () => ({ ok: true });
  c.Hojas_aplicarNotas_ = () => ({ ok: true });
  c.Hojas_formatoCondicional = () => ({ ok: true });
  c.Hojas_colorearRutIngresos = () => ({ fallidas: [] });
  c.Hojas_ocultarTecnicas = () => ({});
  c.Hojas_proteger = () => ({});
  c.Hojas_filtros = () => ({});
  c.Inicio_construir_ = () => ({ ok: true });
  c.HVis_compararFamilia_ = () => ({ ok: true, cantidadDiferencias: 0, diferencias: [] });
  c.HVis_diagnosticarTodas = () => ({ diagnostico: {} });
  c.Presentacion_formatearHoja_ = nombre => { fishing[nombre]++; return { ok: true, aplicados: 0 }; };
  c.Presentacion_layoutVigente_ = () => false;
  c.Presentacion_verificar_ = () => ({ ok: false, diferencias: ['INICIO:PENDIENTE'] });
  const LPROP = vm.runInContext('PRESENTACION_LAYOUT_PROP', c);
  const props = new Map([[LPROP, 'vigente-falso']]);
  c.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => props.get(k) || '', setProperty: (k, v) => props.set(k, v),
    deleteProperty: k => { props.delete(k); } }) };
  const r = c.Presentacion_ejecutarPaso_('diseno', 'EJ-P0', {});
  assert.equal(r.ok, true);
  assert.equal(r.advertencia, true, 'plan termina con advertencia estructurada');
  assert.equal(r.presentacionCompleta, false);
  assert.equal(props.has(LPROP), false, 'NO guarda layout incompleto');
  assert.ok(hojas.every(h => fishing[h] === 1), 'una subtarea por hoja');
  c.Presentacion_verificar_ = () => ({ ok: true, diferencias: [] });
  const r2 = c.Presentacion_ejecutarPaso_('diseno', 'EJ-P1', {});
  assert.equal(r2.presentacionCompleta, true, 'PASS persiste');
  assert.ok(props.has(LPROP), 'layout guardado tras PASS');
  ok('T11/T12/T13 persistencia solo tras PASS (con conteo por hoja)');
}

// T14+15+16: pVerificar certifica Presentación.
{
  const salud = { operativo: true, estado: 'OK', integridad: { pacientes: 1, eventos: 2 },
    datos: { schemaLeido: '2', ok: true }, automatizaciones: { ingreso: { estado: 'OK' } }, avisos: [] };
  c.Sistema_estadoSalud_ = () => salud;
  c.Presentacion_verificar_ = () => ({ ok: false, diferencias: ['INICIO:X'] });
  const r = c.Instalar_pVerificar();
  assert.equal(r.ok, true, 'salud manda en ok');
  assert.equal(r.presentacionCompleta, false);
  assert.equal(r.estado, 'ADVERTENCIA', 'visual incompleto => ADVERTENCIA');
  assert.ok(r.presentacion && r.presentacion.diferencias, 'incluye INICIO/paridad');
  c.Presentacion_verificar_ = () => ({ ok: true });
  const r2 = c.Instalar_pVerificar();
  assert.equal(r2.presentacionCompleta, true);
  assert.equal(r2.estado, 'OK');
  ok('T14/T15/T16 verificar certifica INICIO+paridad; incompleto => ADVERTENCIA');
}

// T17+18+19: UI sin legado visual, instalacion con opciones, retry sin false.
{
  const html = src('Instalador.html');
  assert.doesNotMatch(html, /etapa==='visual'/, 'sin fase visual eliminada');
  assert.match(html, /_OPCIONES_EJECUCION=opcionesInstalacion\(\)/);
  assert.match(html, /modoDatos:.*confirmarSnapshot/, 'instalación combina datos+visual');
  assert.doesNotMatch(html, /llamarPresentacion\(er\.etapa,er\.ix,false\)/, 'retry no sustituye opciones');
  ok('T17/T18/T19 UI: sin visual, opcionesInstalacion() en full install, retry exacto');
}

console.log('Instalador presentación opciones v0.15 — %d/%d PASS', n, 8);
if (n !== 8) process.exit(1);
