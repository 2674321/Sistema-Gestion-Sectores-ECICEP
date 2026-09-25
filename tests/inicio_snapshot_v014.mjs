#!/usr/bin/env node
// v0.14 — Snapshot de INICIO: conteos G1/G2/G3 y próximos 30 días en el mismo
// recorrido (sin lecturas redundantes), sin PII (solo agregados) y sin
// fórmulas vivas en KPIs/sectores/prioridades/estado.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// --- Ficticios con PII marcada (nunca deben salir del snapshot) ---------------
const PII_NOMBRE = 'JUAN PEREZ FICTICIO';
const PII_RUT = '12345678-5';
const PACIENTES = [
  { ID_INTERNO: 'P-1', RUT: PII_RUT, SECTOR: 'NARANJO', ESTRATIFICACION: 'G1',
    REQUIERE_REVISION: true, RUT_DV_VALIDO: 'TRUE', PROXIMO_CONTROL: '2026-09-01' },
  { ID_INTERNO: 'P-2', RUT: '87654321-0', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2',
    REQUIERE_REVISION: false, RUT_DV_VALIDO: 'TRUE', PROXIMO_CONTROL: '2026-10-10' },
  { ID_INTERNO: 'P-3', RUT: '11222333-4', SECTOR: 'VERDE', ESTRATIFICACION: 'G3',
    REQUIERE_REVISION: false, RUT_DV_VALIDO: false, PROXIMO_CONTROL: '' },
  { ID_INTERNO: 'P-4', RUT: '44555666-7', SECTOR: 'NARANJO', ESTRATIFICACION: '',
    REQUIERE_REVISION: false, RUT_DV_VALIDO: 'TRUE', PROXIMO_CONTROL: '2027-01-01' }
].map(p => ({ ...p, NOMBRE: PII_NOMBRE }));
c.Utilities = { formatDate: () => '2026-09-25' };
c.Modelo_leerPacientesCampos = () => PACIENTES;
c.Modelo_leerEventosCampos = () => [{ ID_EVENTO: 'E-1' }, { ID_EVENTO: 'E-2' }];
c.Modelo_ss = () => ({ getSheetByName: () => null });
c.Sistema_estadoSalud_ = () => ({ estado: 'OK', datos: { ok: true }, integridad: { ok: true },
  triggers: { ingresoOnEdit: true, backup: true } });
c.Sistema_ultimaAuditoria_ = () => ({ fecha: '2026-09-24' });
c.Backup_estadoOperativo_ = () => ({ ultima: '2026-09-24' });

// T1: el snapshot cuenta G1/G2/G3/pendiente y próximos 30 días en una pasada.
const m = c.Inicio_calcularMetricas_();
assert.equal(m.pacientes, 4);
assert.equal(m.eventos, 2);
assert.equal(m.g1, 1); assert.equal(m.g2, 1); assert.equal(m.g3, 1);
assert.equal(m.estratificacionPendiente, 1, 'G/pendiente sin inferir');
assert.equal(m.vencidos, 1, 'PROXIMO_CONTROL < hoy');
assert.equal(m.porVencer, 1, 'próximos 30 días en el mismo recorrido');
assert.equal(m.sinProximaAtencion, 1);
assert.equal(m.revision, 1);
assert.equal(m.rutInvalidos, 1);
ok('T1 snapshot con G1/G2/G3/pendiente y próximos-30 en un solo recorrido');

// T2: el snapshot NO incluye PII.
assert.ok(!JSON.stringify(m).includes(PII_NOMBRE), 'sin nombres en el snapshot');
assert.ok(!JSON.stringify(m).includes(PII_RUT), 'sin RUT en el snapshot');
ok('T2 snapshot sin PII (solo agregados)');

// T3: la escritura pinta agregados, sin PII y sin fórmulas vivas.
const escritas = [];
let formulas = 0;
const rango = () => {
  const r = {};
  for (const met of ['setValue', 'setValues', 'setBackground', 'setFontColor',
    'setFontWeight', 'setFontSize', 'setHorizontalAlignment', 'setVerticalAlignment']) {
    r[met] = v => {
      if (met === 'setValue' || met === 'setValues') escritas.push(JSON.stringify(v));
      return r;
    };
  }
  r.setFormula = f => { formulas++; escritas.push(JSON.stringify(f)); return r; };
  return r;
};
const hoja = { getRange: () => rango() };
const w = c.Inicio_escribirMetricas_(m, hoja);
assert.equal(w.ok, true);
assert.equal(formulas, 0, 'KPIs/sectores/estado sin fórmulas vivas');
assert.ok(escritas.length > 5, 'métricas escritas (' + escritas.length + ')');
assert.ok(!escritas.join(' ').includes(PII_NOMBRE), 'sin nombres escritos');
assert.ok(!escritas.join(' ').includes(PII_RUT), 'sin RUT escritos');
assert.ok(escritas.join(' ').includes('ADVERTENCIA'), 'estado general real (no provisional)');
ok('T3 escritura agregada, sin PII, sin fórmulas, sin copy provisional');

// T4: la construcción no deja copy provisional (el escritor pinta lo real).
{
  const src = readFileSync(new URL('34_LibroUX.js', root), 'utf8');
  assert.doesNotMatch(src, /en preparación/);
  ok('T4 ningún "en preparación" en la portada');
}

console.log('Inicio snapshot v0.14 — %d/%d PASS', n, 4);
if (n !== 4) process.exit(1);
