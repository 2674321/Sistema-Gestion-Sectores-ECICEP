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

for (const sector of ['NARANJO', 'AMARILLO', 'VERDE']) test('T' + (n + 1) + ' trigger acepta INGRESO_' + sector, () => {
  const c = contexto(); let llamada = null;
  c.Ingresos_layoutHoja_ = () => ({ hr: 3, mapa: { estadoIdx: 10 } });
  c.Ingresos_incorporarPorEstadoManual_ = (h, f) => { llamada = [h, f]; return { ok: true }; };
  const hoja = { getName: () => 'INGRESO_' + sector };
  const rango = { getNumRows: () => 1, getNumColumns: () => 1, getSheet: () => hoja,
    getRow: () => 8, getColumn: () => 11 };
  assert.equal(c.ECICEP_onEditIngreso({ range: rango, value: 'INGRESADO' }).ok, true);
  assert.deepEqual(llamada, ['INGRESO_' + sector, 8]);
});

test('T4 doble edición detecta evidencia y no procesa otra vez', () => {
  const c = contexto(); let procesos = 0;
  c.Ingresos_layoutHoja_ = () => ({ hr: 3, mapa: { estadoIdx: 2 } });
  c.Modelo_hoja = () => ({ getLastRow: () => 9,
    getRange: () => ({ getValue: () => 'INGRESADO' }) });
  c.Ingresos_evidenciaFila_ = () => ({ ok: true, idInterno: 'EC-X', idEvento: 'EV-X' });
  c.Ingresos_procesarFila = () => { procesos++; };
  c.Modelo_refrescarVistasSectores_ = () => ({});
  const r = c.Ingresos_incorporarPorEstadoManual_('INGRESO_VERDE', 8, { bajoLock: true });
  assert.equal(r.ok, true); assert.equal(r.yaIncorporado, true); assert.equal(procesos, 0);
});

for (const [titulo, estado] of [['T5 error validación', 'ERROR'], ['T6 posible duplicado', 'REQUIERE_REVISION']]) test(titulo, () => {
  const c = contexto(); let temporal = '';
  c.Ingresos_layoutHoja_ = () => ({ hr: 3, mapa: { estadoIdx: 2 } });
  c.Modelo_hoja = () => ({ getLastRow: () => 9, getRange: (_r, _c, nr) => nr
    ? { setValues: v => { temporal = v[0][0]; } } : { getValue: () => 'INGRESADO' } });
  c.Ingresos_evidenciaFila_ = () => ({ ok: false, motivo: 'SIN_EVENTO_INGRESO' });
  c.Ingresos_procesarFila = () => ({ resultado: { estado: estado, nota: 'resultado real' }, resumen: {} });
  const r = c.Ingresos_incorporarPorEstadoManual_('INGRESO_VERDE', 8, { bajoLock: true });
  assert.equal(temporal, 'PENDIENTE'); assert.equal(r.ok, false); assert.equal(r.estado, estado);
});

test('T7 ya ingresado real exige paciente y evento consistentes', () => {
  const c = contexto();
  c.Eventos_buscarPorFuente_ = fuente => ({ idEvento: 'EV-1', idInterno: 'EC-1', tipo: 'INGRESO', fuente });
  c.Modelo_buscarPaciente = id => ({ idx: 0, obj: { ID_INTERNO: id, SECTOR: 'VERDE' } });
  const r = c.Ingresos_evidenciaFila_('INGRESO_VERDE', 4);
  assert.equal(r.ok, true); assert.equal(r.idInterno, 'EC-1');
});

test('T8 ingresado falso queda detectable', () => {
  const c = contexto(); c.Eventos_buscarPorFuente_ = () => null;
  assert.equal(c.Ingresos_evidenciaFila_('INGRESO_VERDE', 4).motivo, 'SIN_EVENTO_INGRESO');
});

test('T9 reconciliar falso reutiliza la ruta de dominio bajo el mismo lock', () => {
  const c = contexto(); let llamada = null;
  c.Ingresos_diagnosticarIngresados_ = () => ({ casos: [{ hoja: 'INGRESO_VERDE', fila: 4, clasificacion: 'INGRESADO_FALSO', sector: 'VERDE' }] });
  c.Ecicep_conLock_ = fn => fn();
  c.Ingresos_incorporarPorEstadoManual_ = (h, f, o) => { llamada = [h, f, o.bajoLock]; return { ok: true }; };
  const r = c.Ingresos_reconciliarIngresados_({ reparar: true });
  assert.equal(r.ok, true); assert.deepEqual(llamada, ['INGRESO_VERDE', 4, true]);
});

test('T10 vista stale refresca solo el sector afectado', () => {
  const c = contexto(); let sectores = null;
  c.Ingresos_diagnosticarIngresados_ = () => ({ casos: [{ hoja: 'INGRESO_AMARILLO', fila: 4, clasificacion: 'DERIVADO_DESACTUALIZADO', sector: 'AMARILLO' }] });
  c.Ecicep_conLock_ = fn => fn(); c.Modelo_refrescarVistasSectores_ = s => { sectores = s; return {}; };
  c.Ingresos_reconciliarIngresados_({ reparar: true });
  assert.deepEqual(Array.from(sectores), ['AMARILLO']);
});

test('T11 trigger ignora otra hoja', () => {
  const c = contexto(); let llamadas = 0; c.Ingresos_incorporarPorEstadoManual_ = () => { llamadas++; };
  const r = { getNumRows: () => 1, getNumColumns: () => 1, getSheet: () => ({ getName: () => 'PACIENTES' }), getRow: () => 4, getColumn: () => 1 };
  c.ECICEP_onEditIngreso({ range: r, value: 'INGRESADO' }); assert.equal(llamadas, 0);
});

test('T12 trigger ignora otra columna', () => {
  const c = contexto(); let llamadas = 0; c.Ingresos_layoutHoja_ = () => ({ hr: 3, mapa: { estadoIdx: 10 } });
  c.Ingresos_incorporarPorEstadoManual_ = () => { llamadas++; };
  const r = { getNumRows: () => 1, getNumColumns: () => 1, getSheet: () => ({ getName: () => 'INGRESO_VERDE' }), getRow: () => 4, getColumn: () => 2 };
  c.ECICEP_onEditIngreso({ range: r, value: 'INGRESADO' }); assert.equal(llamadas, 0);
});

test('T13 trigger ignora edición multicelda', () => {
  const c = contexto(); let llamadas = 0; c.Ingresos_incorporarPorEstadoManual_ = () => { llamadas++; };
  const r = { getNumRows: () => 2, getNumColumns: () => 1, getSheet: () => ({ getName: () => 'INGRESO_VERDE' }) };
  c.ECICEP_onEditIngreso({ range: r, value: 'INGRESADO' }); assert.equal(llamadas, 0);
});

test('T14 instalación conserva uno y elimina solo duplicados propios', () => {
  const c = contexto(), borrados = [];
  const propio = id => ({ id, getHandlerFunction: () => 'ECICEP_onEditIngreso', getEventType: () => 'ON_EDIT' });
  const ajeno = { getHandlerFunction: () => 'OTRO', getEventType: () => 'ON_EDIT' };
  c.ScriptApp = { EventType: { ON_EDIT: 'ON_EDIT' }, getProjectTriggers: () => [propio(1), propio(2), ajeno],
    deleteTrigger: t => borrados.push(t.id), newTrigger: () => { throw Error('no debe crear'); } };
  const r = c.Triggers_asegurarIngresoOnEdit_();
  assert.equal(r.total, 1); assert.deepEqual(borrados, [2]);
});

test('T15 y T16 la ruta ya incorporada no duplica PACIENTES ni EVENTO INGRESO', () => {
  const c = contexto(); let pacientes = 0, eventos = 0;
  c.Ingresos_layoutHoja_ = () => ({ hr: 3, mapa: { estadoIdx: 2 } });
  c.Modelo_hoja = () => ({ getLastRow: () => 9, getRange: () => ({ getValue: () => 'INGRESADO' }) });
  c.Ingresos_evidenciaFila_ = () => ({ ok: true, idInterno: 'EC-1', idEvento: 'EV-1' });
  c.Modelo_agregarPacientes_ = () => pacientes++; c.Modelo_agregarEventos_ = () => eventos++;
  c.Modelo_refrescarVistasSectores_ = () => ({});
  c.Ingresos_incorporarPorEstadoManual_('INGRESO_NARANJO', 8, { bajoLock: true });
  c.Ingresos_incorporarPorEstadoManual_('INGRESO_NARANJO', 8, { bajoLock: true });
  assert.equal(pacientes, 0); assert.equal(eventos, 0);
});

console.log('INGRESADO manual v0.11.0 — ' + n + '/' + n + ' PASS');
