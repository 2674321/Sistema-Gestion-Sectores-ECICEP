#!/usr/bin/env node
// v0.14.1 — Modos de datos del merge: CONSERVADOR preserva, SNAPSHOT_ACTUAL
// reemplaza solo TELEFONOS/ESTRATIFICACION (G válida), con tipos de cambio,
// idempotencia, preview sin PII y reparación sin escrituras de datos.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };
const base = () => ({ ID_INTERNO: 'P-1', RUT: '11111111-1', TELEFONOS: '+56911111111',
  ESTRATIFICACION: 'G2', SEXO: 'M', FECHA_NACIMIENTO: '1980-01-01',
  OBSERVACIONES: 'nota manual', SALUD_MENTAL: 'NO', ULTIMO_CONTROL: '2026-08-01',
  ULTIMO_SEGUIMIENTO: '', FUENTE: 'ORIG' });
const fuente = () => ({ RUT: '11111111-1', TELEFONOS: '+56922222222', ESTRATIFICACION: 'G3',
  SEXO: 'F', FECHA_NACIMIENTO: '1990-05-05', OBSERVACIONES: 'otra nota', SALUD_MENTAL: 'SI',
  ULTIMO_CONTROL: '2026-05-01', ULTIMO_SEGUIMIENTO: '2026-09-01' });

// T1: modos canónicos únicos.
assert.deepEqual(Object.keys(c.FUENTES_MODO).sort(),
  ['CONSERVADOR', 'CONSERVAR', 'INICIAL', 'SNAPSHOT_ACTUAL']);
assert.equal(c.Fuentes_normalizarModo_('snapshot_actual'), 'SNAPSHOT_ACTUAL');
assert.equal(c.Fuentes_normalizarModo_(undefined), 'CONSERVADOR');
ok('T1 FUENTES_MODO canónicos y normalización (solo snapshot reemplaza)');

// T2: CONSERVADOR preserva teléfono; SNAPSHOT lo reemplaza.
{
  const p = base();
  const r = c.Act_mergearPaciente(p, fuente(), { modo: 'CONSERVADOR' });
  assert.equal(p.TELEFONOS, '+56911111111');
  assert.ok(!r.aplicados.some(a => a.campo === 'TELEFONOS'));
  const p2 = base();
  const r2 = c.Act_mergearPaciente(p2, fuente(), { modo: 'SNAPSHOT_ACTUAL' });
  assert.equal(p2.TELEFONOS, '+56922222222');
  const t = r2.aplicados.find(a => a.campo === 'TELEFONOS');
  assert.equal(t && t.tipo, 'REEMPLAZO_SNAPSHOT');
  ok('T2 teléfono: conservador mantiene, snapshot reemplaza (tipado)');
}

// T3: estratificación G2 vs G3 (solo G válida en snapshot).
{
  const p = base();
  c.Act_mergearPaciente(p, fuente(), { modo: 'CONSERVADOR' });
  assert.equal(p.ESTRATIFICACION, 'G2');
  const p2 = base();
  c.Act_mergearPaciente(p2, fuente(), { modo: 'SNAPSHOT_ACTUAL' });
  assert.equal(p2.ESTRATIFICACION, 'G3');
  const p3 = base();
  c.Act_mergearPaciente(p3, { ...fuente(), ESTRATIFICACION: 'G9' }, { modo: 'SNAPSHOT_ACTUAL' });
  assert.equal(p3.ESTRATIFICACION, 'G2', 'G inválida no reemplaza ni en snapshot');
  ok('T3 estratificación: conservador G2, snapshot G3 válida, G9 ignorada');
}

// T4: SEXO/FECHA_NACIMIENTO fill-only + conflicto (ambos modos).
for (const modo of ['CONSERVADOR', 'SNAPSHOT_ACTUAL']) {
  const p = base();
  const r = c.Act_mergearPaciente(p, fuente(), { modo });
  assert.equal(p.SEXO, 'M', modo);
  assert.equal(p.FECHA_NACIMIENTO, '1980-01-01', modo);
  assert.ok(r.conflictos.some(x => x.campo === 'SEXO'), modo + ' conflicto SEXO');
  assert.ok(r.conflictos.some(x => x.campo === 'FECHA_NACIMIENTO'), modo + ' conflicto FN');
}
ok('T4 sexo/nacimiento fill-only con conflicto en ambos modos');

// T5: SALUD_MENTAL y OBSERVACIONES protegidas (ambos modos).
for (const modo of ['CONSERVADOR', 'SNAPSHOT_ACTUAL']) {
  const p = base();
  const r = c.Act_mergearPaciente(p, fuente(), { modo });
  assert.equal(p.SALUD_MENTAL, 'NO', modo);
  assert.equal(p.OBSERVACIONES, 'nota manual', modo);
  assert.ok(!r.aplicados.some(a => a.campo === 'SALUD_MENTAL' || a.campo === 'OBSERVACIONES'), modo);
}
ok('T5 salud mental y observaciones existentes protegidas');

// T6: fechas solo avanzan (nunca retroceden).
{
  const p = base(); // ULTIMO_CONTROL 2026-08-01; fuente trae 2026-05-01 (más antigua)
  const r = c.Act_mergearPaciente(p, fuente(), { modo: 'CONSERVADOR' });
  assert.equal(p.ULTIMO_CONTROL, '2026-08-01', 'fuente antigua no retrocede');
  assert.equal(p.ULTIMO_SEGUIMIENTO, '2026-09-01', 'fecha nueva sí avanza');
  const f = r.aplicados.find(a => a.campo === 'ULTIMO_SEGUIMIENTO');
  assert.equal(f && f.tipo, 'FECHA_MAX');
  ok('T6 fechas max: antigua ignorada, reciente aplicada (tipada)');
}

// T7: segunda ejecución con mismas fuentes = 0 cambios (idempotencia).
{
  const p = base();
  const fila = { ESTADO_VALIDACION: 'OK', NORMALIZADO: fuente() };
  const r1 = c.Act_mergearPacientesDesdeStaging([fila], [p], { modo: 'CONSERVADOR' });
  assert.ok(r1.actualizados >= 1, 'primera completa vacíos');
  const fu = p.FUENTE;
  const r2 = c.Act_mergearPacientesDesdeStaging([{ ESTADO_VALIDACION: 'OK', NORMALIZADO: fuente() }], [p], { modo: 'CONSERVADOR' });
  assert.equal(r2.actualizados, 0, 'segunda sin cambios');
  assert.equal(r2.conflictos, 1, 'paciente con divergencias sigue en revisión (contador por paciente)');
  assert.equal(p.FUENTE, fu, 'FUENTE no crece en ejecuciones idénticas');
  ok('T7 idempotencia: 2.ª pasada 0 cambios, FUENTE estable');
}

// T8: resumen de impacto por tipos (solo conteos).
{
  const p = { ID_INTERNO: 'P-9', RUT: '99999999-9', TELEFONOS: '', ESTRATIFICACION: '',
    SEXO: '', FECHA_NACIMIENTO: '', OBSERVACIONES: '', SALUD_MENTAL: '', FUENTE: '' };
  const fila = { ESTADO_VALIDACION: 'OK', NORMALIZADO: { RUT: '99999999-9', TELEFONOS: '+56900000000',
    ESTRATIFICACION: 'G1', SEXO: 'F', FECHA_NACIMIENTO: '2000-01-01', OBSERVACIONES: 'x',
    ULTIMO_CONTROL: '2026-09-01', ULTIMO_SEGUIMIENTO: '' } };
  const r = c.Act_mergearPacientesDesdeStaging([fila], [p], { modo: 'SNAPSHOT_ACTUAL' });
  const imp = c.Act_resumenImpactoMerge_(r);
  assert.ok(imp.fillOnly >= 3, 'fills contados');
  assert.equal(imp.fechasAdelantadas, 1);
  assert.equal(imp.reemplazosSnapshot, 2, 'teléfono + estratificación');
  assert.ok(!JSON.stringify(imp).includes('+569'), 'impacto sin PII');
  ok('T8 impacto: fillOnly/fechas/reemplazos/conflictos en conteos (' +
    imp.fillOnly + '/' + imp.fechasAdelantadas + '/' + imp.reemplazosSnapshot + '/' + imp.conflictos + ')');
}

// T9: preview del endpoint sin PII y sin escribir.
{
  assert.equal(c.api_fuentesImpacto('', 'CONSERVADOR').motivo, 'ACCESO_DENEGADO');
  c.WebApp_autorizarBuscador = t => t === 'x';
  // (comparación por JSON: el objeto nace en el realm vm)
  assert.equal(JSON.stringify(c.api_fuentesImpacto('x', 'CONSERVAR').impacto),
    JSON.stringify({ nuevos: 0, existentes: 0, fillOnly: 0, fechasAdelantadas: 0,
      reemplazosSnapshot: 0, conflictos: 0 }));
  const real = c.Fuentes_cargaReal;
  c.Fuentes_cargaReal = () => ({ ok: true, ejecucionId: 'EJ-1',
    resumen: { nuevos: 2, registros: 5, merge: { tipos: { FILL_ONLY: 3, FECHA_MAX: 1, REEMPLAZO_SNAPSHOT: 0 }, conflictos: 1 } } });
  const pv = c.api_fuentesImpacto('x', 'CONSERVADOR');
  c.Fuentes_cargaReal = real;
  assert.equal(pv.ok, true);
  assert.equal(pv.impacto.nuevos, 2);
  assert.equal(pv.impacto.fillOnly, 3);
  assert.ok(!('detalle' in pv), 'preview sin detalle por fila (sin PII)');
  ok('T9 api_fuentesImpacto: auth, CONSERVAR en ceros, preview en conteos');
}

// T10: reparar presentación / reconstruir INICIO no tocan datos.
for (const fn of ['Libro_repararPresentacion_', 'UI_reconstruirInicio']) {
  const s = c[fn].toString();
  for (const w of ['Fuentes_cargaReal', 'Amarillo_importarTodo_', 'Modelo_agregarPacientes_',
    'Ingresos_procesarTodasLasHojas_', 'Act_mergearPaciente'])
    assert.ok(!s.includes(w), fn + ' sin ' + w);
}
ok('T10 reparación visual e INICIO sin escrituras de datos');

// T11: Actualizar sistema no usa snapshot por defecto.
{
  const s = c.Act_actualizarSistema.toString();
  assert.ok(!s.includes('SNAPSHOT_ACTUAL'), 'actualizar cotidiano, sin snapshot');
  ok('T11 Actualizar sistema conservador por defecto');
}

console.log('Fuentes modos producción v0.14 — %d/%d PASS', n, 11);
if (n !== 11) process.exit(1);
