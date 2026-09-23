#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
function contexto() {
  const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
    vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
  return c;
}
let n = 0;
function test(nombre, fn) { fn(); n++; console.log('[PASS] ' + nombre); }

test('integridad detecta evento huérfano y caché desactualizada sin PII', () => {
  const c = contexto();
  c.Modelo_leerPacientesCampos = () => [{ ID_INTERNO: 'EC-1', SECTOR: 'VERDE', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '' }];
  c.Modelo_leerEventosCampos = () => [
    { ID_INTERNO: 'EC-1', TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: '2026-09-01' },
    { ID_INTERNO: 'EC-X', TIPO_EVENTO: 'OTRO', FECHA_EVENTO: '2026-09-02' }
  ];
  c.Ingresos_diagnosticarIngresados_ = () => ({ conteos: { INGRESADO_FALSO: 0, INCONSISTENTE: 0, DERIVADO_DESACTUALIZADO: 0 } });
  const r = c.Integridad_diagnosticarDerivados_();
  assert.equal(r.ok, false); assert.equal(r.eventosHuerfanos, 1); assert.equal(r.cachesPendientes, 1);
  assert.equal(JSON.stringify(r).includes('NOMBRE'), false);
});

test('estado de salud expone versión, schema, hojas, integridad y triggers', () => {
  const c = contexto();
  const nombres = new Set(['PACIENTES', 'EVENTOS', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE',
    'SECTOR_NARANJO', 'SECTOR_AMARILLO', 'SECTOR_VERDE']);
  c.Modelo_ss = () => ({ getSheetByName: n => nombres.has(n) ? {} : null });
  c.Integridad_diagnosticarDerivados_ = () => ({ ok: true, ingresosFalsos: 0, eventosHuerfanos: 0, vistasPendientes: 0, cachesPendientes: 0 });
  c.Triggers_diagnosticarIngresoOnEdit_ = () => ({ estado: 'OK' }); c.Backup_triggerInstalado = () => false;
  const r = c.Sistema_estadoSalud_();
  assert.equal(r.ok, true); assert.equal(r.schema, 2); assert.equal(r.hojas.ingresos, 3); assert.equal(r.hojas.sectores, 3);
});

test('Log_perf conserva solo métricas técnicas permitidas', () => {
  const c = contexto(); c.CFG_LOG.NIVEL = 'DEBUG';
  c.Log_perf('Prueba', 'operacion', { sector: 'VERDE', cantidad: 2, duracionMs: 7,
    nombre: 'NO VERSIONAR', rut: 'NO VERSIONAR' });
  const fila = c._LOG_BUFFER[c._LOG_BUFFER.length - 1];
  assert.equal(fila[4], 'PERF'); assert.match(fila[6], /VERDE/);
  assert.doesNotMatch(fila[6], /nombre|rut|NO VERSIONAR/i);
});

test('invalidación selectiva conserva memos no afectados', () => {
  const c = contexto(), borradas = [];
  c.CacheService = { getScriptCache: () => ({ remove: k => borradas.push(k) }) };
  c._MEMO_HOJAS.PACIENTES = [['ID_INTERNO'], ['EC-1']]; c._MEMO_HOJAS.EVENTOS = [['ID_EVENTO']];
  c._MODELO_INDICES.PACIENTES_POR_ID = { 'EC-1': 1 }; c._MODELO_INDICES.EVENTOS_POR_ID_INTERNO = {};
  c.Modelo_invalidarLecturas(['PACIENTES']);
  assert.equal(c._MEMO_HOJAS.PACIENTES, undefined); assert.ok(c._MEMO_HOJAS.EVENTOS);
  assert.equal(c._MODELO_INDICES.PACIENTES_POR_ID, undefined); assert.ok(c._MODELO_INDICES.EVENTOS_POR_ID_INTERNO);
  assert.equal(borradas.length, 1); assert.match(borradas[0], /PACIENTES/);
});

test('runtime común expone normalización y mensajes humanos', () => {
  const html = readFileSync(new URL('00_OperadorRuntime.html', root), 'utf8');
  for (const fn of ['ECICEP_errorDe', 'ECICEP_mensajeUsuario', 'ECICEP_esReintentable', 'ECICEP_esAccesoDesactualizado'])
    assert.match(html, new RegExp('window\\.' + fn + ' = ' + fn));
  assert.match(html, /otra operación\. Intenta nuevamente/);
});

console.log('Integridad / observabilidad v0.11.0 — ' + n + '/' + n + ' PASS');
