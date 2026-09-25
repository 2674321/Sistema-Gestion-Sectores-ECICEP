#!/usr/bin/env node
// v0.14 — Arquitectura visual: motor único de presentación, sin pipelines
// paralelos, etapas consolidadas, Actualizar vía motor + advertencias,
// Modelo reducido, modos de presentación y opciones del instalador.
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

// T1: UNA fase principal de presentación (sin visual/inicio top-level).
{
  const ids = c.INSTALAR_ETAPAS.map(e => e.id);
  assert.ok(!ids.includes('visual'), 'sin fase principal visual');
  assert.ok(!ids.includes('inicio'), 'sin fase principal inicio');
  assert.ok(ids.includes('diseno'), 'etapa diseno (motor único) existe');
  assert.equal(typeof c.Instalar_pVisual, 'function', 'wrapper compat pVisual');
  assert.equal(typeof c.Instalar_pInicio, 'function', 'wrapper compat pInicio');
  assert.ok(!c.INSTALAR_ETAPAS_MUTAN.visual && !c.INSTALAR_ETAPAS_MUTAN.inicio);
  ok('T1 instalador con UNA fase de presentación; wrappers compat conservados');
}

// T2: Actualizar NO implementa pipeline visual propio.
{
  const s = c.Act_actualizarSistema.toString();
  for (const fn of ['HVis_aplicarTodasLasSecciones', 'HVis_formatearIngresos',
    'Hojas_formatoCondicional', 'Modelo_validarIngresos', 'Modelo_aplicarDiseno',
    'Modelo_disenoHojas', 'Hojas_colorearRutIngresos', 'Inicio_refrescarSiNecesario_'])
    assert.ok(!s.includes(fn), 'Actualizar no llama ' + fn);
  assert.ok(s.includes('Libro_mantenimiento_'), 'Actualizar invoca el motor único');
  assert.ok(s.includes('Libro_marcarDirty_'), 'Actualizar marca dirty flags');
  assert.ok(s.includes('PRESENTACION_PENDIENTE'), 'fallo visual = advertencia');
  ok('T2 Actualizar reutiliza el motor único con dirty flags y advertencias');
}

// T3: Modelo_aplicarDiseno reducido (sin segundo motor visual).
{
  const s = src('06_Modelo.js').match(/function Modelo_aplicarDiseno\(\)[\s\S]*?\n\}/)[0];
  assert.ok(s.includes('Modelo_esHojaVisual'), 'distingue hojas visuales');
  assert.ok(!/if \(d\.banda\) \{\s*\n\s*_modelo_aplicarBanda\(h\);/.test(s),
    'banding no incondicional');
  ok('T3 Modelo_aplicarDiseno sin banding/header/freeze en hojas visuales');
}

// T4: subtarea por hoja absorbe la estructura superior.
{
  const s = src('35_Presentacion.js');
  assert.ok(s.includes('HVis_reconciliarHoja'), 'formato:* reconcilia secciones');
  assert.ok(s.includes('Presentacion_formatearHoja_'), 'reparación por hoja existe');
  ok('T4 subtarea por hoja con estructura superior absorbida');
}

// T5: contrato de modos del motor.
{
  assert.deepEqual(Object.keys(c.PRESENTACION_MODO).sort(),
    ['AUTO', 'FORZAR_INICIO', 'PROFUNDO', 'REPARAR']);
  ok('T5 PRESENTACION_MODO con AUTO/REPARAR/FORZAR_INICIO/PROFUNDO');
}

// T6: api_instalarPaso backward-compatible con las opciones v0.14.
{
  const props = new Map();
  c.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => props.get(k) || '', setProperty: (k, v) => props.set(k, v) }) };
  c.Utilities = { getUuid: () => '12345678-1234-4123-8123-123456789abc', formatDate: () => '' };
  c.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
  c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  c.Instalar_asegurarBackup_ = () => ({ ok: true, creado: false });
  c.Log_info = () => {}; c.Log_error = () => {}; c.Log_flush = () => {};
  let invalidados = 0;
  c.Presentacion_invalidarLayout_ = () => { invalidados++; };
  c.Presentacion_ejecutarPaso_ = () => ({ ok: true, continuar: false });
  const clave = c.WebApp_claveCompartida_();
  assert.equal(c.api_instalarPaso('diseno', clave, 'EJ-A').ok, true, 'sin opciones (AUTO)');
  assert.equal(c.api_instalarPaso('diseno', clave, 'EJ-B', { modoPresentacion: 'REPARAR' }).ok, true);
  assert.equal(invalidados, 0, 'REPARAR no invalida');
  assert.equal(c.api_instalarPaso('diseno', clave, 'EJ-C', { forzarInicio: true }).ok, true);
  assert.equal(invalidados, 1, 'forzarInicio invalida el layout');
  assert.equal(c.api_instalarPaso('diseno', clave, 'EJ-D', { modoPresentacion: 'PROFUNDO' }).ok, true);
  assert.equal(invalidados, 2, 'PROFUNDO invalida el layout');
  assert.equal(c.api_instalarPaso('diseno', clave, 'EJ-E', { forzarPresentacion: true }).ok, true,
    'opción legacy sigue vigente');
  ok('T6 api_instalarPaso acepta modoPresentacion/forzarInicio (backward-compatible)');
}

// T7: instalador HTML con jerarquía, grupos y opciones avanzadas.
{
  const html = src('Instalador.html');
  assert.match(html, /id="optForzarInicio"/);
  assert.match(html, /id="optProfundo"/);
  assert.match(html, /GRUPOS_ETAPAS/);
  assert.match(html, /function opcionesPresentacion\(\)/);
  assert.match(html, /modoPresentacion/);
  ok('T7 HTML: grupos de fases + opciones avanzadas cableadas al motor');
}

console.log('Arquitectura visual v0.14 — %d/%d PASS', n, 7);
if (n !== 7) process.exit(1);
