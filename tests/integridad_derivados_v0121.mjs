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
function idxCampo(c, campo) { return c.Modelo_campos().indexOf(campo); }

test('T1 backfill recalcula solo caches desincronizados (EVENTOS como fuente)', () => {
  const c = contexto(); let escrito = null;
  const pacientes = [
    { ID_INTERNO: 'EC-1', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '', FECHA_ACTUALIZACION: null },
    { ID_INTERNO: 'EC-2', ULTIMO_CONTROL: '2026-01-01', ULTIMO_SEGUIMIENTO: '2026-01-01', FECHA_ACTUALIZACION: null }
  ];
  c.Modelo_leerPacientes = () => pacientes;
  c.Modelo_leerEventosCampos = () => [
    { ID_INTERNO: 'EC-1', TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: '2026-09-01' },
    { ID_INTERNO: 'EC-2', TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: '2026-01-01' },
    { ID_INTERNO: 'EC-2', TIPO_EVENTO: 'SEGUIMIENTO', FECHA_EVENTO: '2026-01-01' },
    { ID_INTERNO: 'EC-9', TIPO_EVENTO: 'OTRO', FECHA_EVENTO: '2030-01-01' }
  ];
  c.Modelo_hayCorreccionesFecha_ = () => false;
  c.Modelo_dataStartRow = () => 2;
  c.Modelo_hoja = () => ({ getRange: () => ({ setValues: v => { escrito = v; } }) });
  c.Modelo_invalidarLecturas = () => {};
  const r = c.Control_recalcularCaches_();
  assert.equal(r.ok, true); assert.equal(r.total, 2); assert.equal(r.cambios, 1);
  assert.equal(r.modo, 'CACHE_CALCULADA');
  const ultC = idxCampo(c, 'ULTIMO_CONTROL'), ultS = idxCampo(c, 'ULTIMO_SEGUIMIENTO');
  assert.equal(escrito[0][ultC], '2026-09-01'); assert.equal(escrito[0][ultS], '');
  assert.equal(escrito[1][ultC], '2026-01-01'); assert.equal(escrito[1][ultS], '2026-01-01');
});

test('T2 backfill es idempotente: segunda pasada sin cambios ni escritura', () => {
  const c = contexto(); let llamado = false;
  c.Modelo_leerPacientes = () => [
    { ID_INTERNO: 'EC-1', ULTIMO_CONTROL: '2026-09-01', ULTIMO_SEGUIMIENTO: '', FECHA_ACTUALIZACION: null }
  ];
  c.Modelo_leerEventosCampos = () => [{ ID_INTERNO: 'EC-1', TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: '2026-09-01' }];
  c.Modelo_hayCorreccionesFecha_ = () => false;
  c.Modelo_dataStartRow = () => 2;
  c.Modelo_hoja = () => ({ getRange: () => ({ setValues: v => { llamado = true; } }) });
  c.Modelo_invalidarLecturas = () => {};
  const r = c.Control_recalcularCaches_();
  assert.equal(r.cambios, 0); assert.equal(llamado, false);
});

test('T3 reparación converge caches y acciona CACHES sin falsear derivados', () => {
  const c = contexto(); let llamadas = 0;
  const estadoBase = { ingresosFalsos: 0, ingresosInconsistentes: 0, vistasPendientes: 0,
    estratificacionPendiente: 0, vistas: { sectoresAfectados: [] }, eventosHuerfanos: 0,
    captureIdsDuplicados: 0, fuentesDuplicadas: 0, pacientesSinSector: 0 };
  c.Integridad_diagnosticarDerivados_ = () => {
    llamadas++;
    return llamadas === 1
      ? Object.assign({ ok: false, derivadosOk: false, cachesPendientes: 530 }, estadoBase)
      : Object.assign({ ok: true, derivadosOk: true, cachesPendientes: 0 }, estadoBase);
  };
  c.Control_recalcularCaches_ = () => ({ ok: true, total: 530, cambios: 530, modo: 'CACHE_CALCULADA' });
  c.Sistema_guardarAuditoria_ = () => {};
  const r = c.Integridad_repararDerivados_({ reparar: true, bajoLock: true });
  assert.equal(r.ok, true); assert.equal(r.motivo, '');
  assert.ok(r.acciones.indexOf('CACHES') >= 0); assert.equal(r.caches.cambios, 530);
  assert.equal(r.integridadCompleta, true);
});

test('T4 pacientes sin sector se clasifican como solo-reporte, no como pendientes de vista', () => {
  const c = contexto();
  c.SpreadsheetApp = {};
  const vistaIds = { SECTOR_VERDE: [['EC-A']] };
  c.Modelo_ss = () => ({
    getSheetByName: nombre => vistaIds[nombre]
      ? { getLastRow: () => 3, getRange: (_r, _c, _n) => ({ getValues: () => vistaIds[nombre] }) } : null
  });
  c.Modelo_dataStartRow = () => 2;
  const pacientes = [
    { ID_INTERNO: 'EC-A', SECTOR: 'VERDE', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '', CONDICIONES: '', ESTRATIFICACION: 'G2' },
    { ID_INTERNO: 'EC-S', SECTOR: '', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '', CONDICIONES: '', ESTRATIFICACION: 'G2' },
    { ID_INTERNO: 'EC-M', SECTOR: 'MULTIPLE', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '', CONDICIONES: '', ESTRATIFICACION: 'G2' }
  ];
  const vistas = c.Integridad_diagnosticarVistas_(pacientes);
  assert.equal(vistas.pendientes, 0); assert.equal(vistas.sinSector, 2);
  c.Modelo_leerPacientesCampos = () => pacientes;
  c.Modelo_leerEventosCampos = () => [];
  c.Ingresos_diagnosticarIngresados_ = () => ({ ok: true, error: false,
    conteos: { INGRESADO_FALSO: 0, INCONSISTENTE: 0, DERIVADO_DESACTUALIZADO: 0 }, casos: [] });
  c.Captura_diagnosticarCaptureIdsDuplicados_ = () => ({ duplicados: 0 });
  c.Estrat_evaluar = () => ({ estado: 'CALCULADO', resultado: 'G2' });
  const r = c.Integridad_diagnosticarDerivados_();
  assert.equal(r.vistasPendientes, 0); assert.equal(r.pacientesSinSector, 2);
  assert.equal(r.derivadosOk, true); assert.equal(r.evidenciaSoloReporte, true); assert.equal(r.ok, false);
});

test('T5 DERIVADOS_DESACTUALIZADO renovable (sector con vista) sigue bloqueando', () => {
  const c = contexto();
  c.Modelo_leerPacientesCampos = () => [];
  c.Modelo_leerEventosCampos = () => [];
  c.Ingresos_diagnosticarIngresados_ = () => ({ ok: true, error: false,
    conteos: { INGRESADO_FALSO: 0, INCONSISTENTE: 0, DERIVADO_DESACTUALIZADO: 1 },
    casos: [{ hoja: 'INGRESO_AMARILLO', fila: 4, clasificacion: 'DERIVADO_DESACTUALIZADO', sector: 'AMARILLO' }] });
  c.Captura_diagnosticarCaptureIdsDuplicados_ = () => ({ duplicados: 0 });
  c.Estrat_evaluar = () => ({ estado: 'CALCULADO', resultado: 'G2' });
  const r = c.Integridad_diagnosticarDerivados_();
  assert.equal(r.vistasPendientes, 1); assert.equal(r.pacientesSinSector, 0);
  assert.equal(r.derivadosOk, false);
});

test('T6 reparación con sin-sector pendiente es advertencia, no error de instalación', () => {
  const c = contexto(); let llamadas = 0;
  const estadoBase = { ingresosFalsos: 0, ingresosInconsistentes: 0, vistasPendientes: 0,
    estratificacionPendiente: 0, vistas: { sectoresAfectados: [] }, eventosHuerfanos: 0,
    captureIdsDuplicados: 0, fuentesDuplicadas: 0, cachesPendientes: 0 };
  c.Integridad_diagnosticarDerivados_ = () => {
    llamadas++;
    return llamadas === 1
      ? Object.assign({ ok: false, derivadosOk: true, pacientesSinSector: 3 }, estadoBase)
      : Object.assign({ ok: false, derivadosOk: true, pacientesSinSector: 3 }, estadoBase);
  };
  c.Sistema_guardarAuditoria_ = () => {};
  const r = c.Integridad_repararDerivados_({ reparar: true, bajoLock: true });
  assert.equal(r.ok, true); assert.equal(r.motivo, '');
  assert.equal(r.advertencia, true);
  assert.ok(r.avisos.indexOf('PACIENTES_SIN_SECTOR:3') >= 0);
  assert.match(r.linea, /PACIENTES_SIN_SECTOR:3/);
  assert.equal(r.integridadCompleta, false);
});

test('T7 DERIVADOS_PENDIENTES real tras reparar sigue siendo error explícito', () => {
  const c = contexto(); let llamadas = 0;
  const estadoBase = { ingresosFalsos: 0, ingresosInconsistentes: 0, cachesPendientes: 2,
    estratificacionPendiente: 0, vistas: { sectoresAfectados: [] }, eventosHuerfanos: 0,
    captureIdsDuplicados: 0, fuentesDuplicadas: 0, pacientesSinSector: 0 };
  c.Integridad_diagnosticarDerivados_ = () => {
    llamadas++;
    const despues = llamadas > 1;
    return Object.assign({ ok: false, derivadosOk: !despues,
      vistasPendientes: despues ? 2 : 0, cachesPendientes: despues ? 2 : 0 }, estadoBase);
  };
  c.Control_recalcularCaches_ = () => ({ ok: true, cambios: 0 });
  c.Sistema_guardarAuditoria_ = () => {};
  const r = c.Integridad_repararDerivados_({ reparar: true, bajoLock: true });
  assert.equal(r.ok, false); assert.equal(r.advertencia, false);
  assert.match(r.motivo, /^DERIVADOS_PENDIENTES/);
  assert.match(r.motivo, /cachesPendientes=2/);
  assert.match(r.motivo, /vistasPendientes=2/);
});

console.log('Integridad derivados v0.12.1 — ' + n + '/' + n + ' PASS');