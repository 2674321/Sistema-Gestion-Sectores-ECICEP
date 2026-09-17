#!/usr/bin/env node
// Regresiones del instalador: acceso compartido, diagnóstico previo y fallos reales.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
const props = new Map();
c.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props.get(k) || '', setProperty: (k, v) => props.set(k, v)
}) };
c.Utilities = { getUuid: () => '12345678-1234-4123-8123-123456789abc', formatDate: () => '' };
c.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
const clave = c.WebApp_claveCompartida_();
assert.equal(c.api_instalarEtapas('').motivo, 'ACCESO_DENEGADO');
assert.equal(c.api_instalarDiagnostico('').motivo, 'ACCESO_DENEGADO');
assert.equal(c.api_instalarPaso('runtime', '').motivo, 'ACCESO_DENEGADO');
assert.equal(c.api_instalarEtapas(clave).ok, true);
c.Instalar_diagnosticar = () => ({ ok: true, diagnostico: { resumen: { fasesPendientes: [] } } });
assert.equal(c.api_instalarDiagnostico(clave).ok, true);
let llamadas = 0;
c.Instalar_pRuntime = () => { llamadas++; return { ok: false, motivo: 'FALLO_SIMULADO' }; };
c.Log_error = () => {}; c.Log_flush = () => {};
assert.equal(c.api_instalarPaso('runtime', clave).motivo, 'FALLO_SIMULADO');
assert.equal(llamadas, 1);
assert.equal(c.api_instalarPaso('runtime', '').motivo, 'ACCESO_DENEGADO');
assert.equal(llamadas, 1);
c.HVis_aplicarTodasLasSecciones = () => ({ ok: true, resultados: [{ hoja: 'PACIENTES', ok: false }] });
assert.equal(c.Instalar_pVisual().ok, false);
c.Modelo_leerPacientes = () => []; c.Modelo_leerEventos = () => [];
c.Modelo_hoja = () => ({});
c.Modelo_escanearEstructura = () => ({});
c.Mig_clasificarInstalacion = () => ({ estado: 'INCOMPLETA', version: '1' });
assert.equal(c.Instalar_pVerificar().ok, false);
const html = readFileSync(new URL('Instalador.html', root), 'utf8');
assert.match(html, /data-acceso="<\?= TOKEN_ACCESO \?>"/);
assert.match(html, /\.api_instalarEtapas\(ECICEP_ACCESO\)/);
assert.match(html, /\.api_instalarDiagnostico\(ECICEP_ACCESO\)/);
assert.match(html, /\.api_instalarPaso\(etapa\.id,ECICEP_ACCESO\)/);
assert.match(html, /function iniciarInstalacion\(\)/);
assert.doesNotMatch(html, /function cargarEtapas\(\)\s*\{[\s\S]*?ejecutarSecuencia\(0\);[\s\S]*?function marcar/);
assert.equal(c.doGet ? typeof c.doGet : '', 'function');
console.log('[PASS] instalador protegido, diagnóstico previo y fallos detectados');
