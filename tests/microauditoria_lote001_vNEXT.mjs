#!/usr/bin/env node
/**
 * Regresión — microauditoría continua LOTE 001 (16-10-2026).
 *
 * Una prueba por microfix (MF-001…MF-010). Cada una reproduce el síntoma con
 * datos sintéticos y el código real de `src/`, sin hojas, red ni credenciales.
 * Con el código previo, cada caso falla; con el parche mínimo, pasa.
 *
 * Uso: node tests/microauditoria_lote001_vNEXT.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

function backend() {
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  for (const f of readdirSync(new URL('src/', root)).filter((f) => /\.(js|gs)$/.test(f)).sort()) {
    vm.runInContext(read('src/' + f), ctx, { filename: f });
  }
  return ctx;
}

let passed = 0, failed = 0;
function test(name, run) {
  try {
    run();
    passed++; console.log('  [PASS] ' + name);
  } catch (e) {
    failed++; console.log('  [FAIL] ' + name + '\n         ' + (e && e.message || e));
  }
}

// ── MF-001 · Dash_calidadDatos_ reconoce booleanos de hoja ('TRUE'/'FALSE') ──
test('MF-001: Dash_calidadDatos_ cuenta RUT inválido y REQUIERE_REVISION en string', () => {
  const c = backend();
  const r = c.Dash_calidadDatos_([
    { RUT: '11111111-1', RUT_DV_VALIDO: 'TRUE', RUT_SIN_DV: 'FALSE', SECTOR: 'VERDE', ESTRATIFICACION: 'G1', REQUIERE_REVISION: 'TRUE' },
    { RUT: '22222222-2', RUT_DV_VALIDO: 'FALSE', RUT_SIN_DV: 'FALSE', SECTOR: 'VERDE', ESTRATIFICACION: 'G1', REQUIERE_REVISION: 'FALSE' },
    { RUT: '', SECTOR: '', ESTRATIFICACION: '', REQUIERE_REVISION: '' }
  ]);
  assert.equal(r.sinRut, 1, 'sinRut');
  assert.equal(r.rutInvalido, 1, 'rutInvalido (RUT_DV_VALIDO="FALSE")');
  assert.equal(r.sinSector, 1, 'sinSector');
  assert.equal(r.estratPendiente, 1, 'estratPendiente');
  assert.equal(r.requiereRevision, 1, 'requiereRevision (="TRUE")');
});

// ── MF-002 · Ficha_prepararMutacion_ no fuerza DV válido sin editar RUT ──────
test('MF-002: prepararMutacion_ editar TELEFONOS no marca RUT_DV_VALIDO', () => {
  const c = backend();
  c.Modelo_buscarPaciente_ = () => ({ idx: 7, obj: {
    ID_INTERNO: 'EC-0001', RUT: '11111111-1', RUT_DV_VALIDO: false, RUT_SIN_DV: false,
    NOMBRE: 'JUAN PEREZ', TELEFONOS: '+56911111111', SECTOR: 'VERDE', ESTRATIFICACION: 'G1'
  } });
  c.Captura_edicionTexto_ = (o, k) => String(o[k] == null ? '' : o[k]);
  c.Paciente_validarCampo_ = (k, v) => ({ ok: true, valor: v });
  const plan = c.Ficha_prepararMutacion_('EC-0001', {
    TELEFONOS: { anterior: '+56911111111', valor: '+56922222222' }
  });
  assert.equal(plan.ok, true, 'plan ok');
  assert.equal(plan.tocados.indexOf('RUT'), -1, 'RUT no tocado');
  assert.equal(plan.final.RUT_DV_VALIDO, false, 'no debe forzar DV válido');
  assert.equal(plan.final.TELEFONOS, '+56922222222', 'teléfono actualizado');
});

// ── MF-003 · Ev_ultimoPorPaciente_ empata por timestamp, no por String(Date) ─
test('MF-003: Ev_ultimoPorPaciente_ gana el registro cronológicamente posterior', () => {
  const c = backend();
  const eventos = [
    { ID_INTERNO: 'P1', TIPO_EVENTO: 'A', FECHA_EVENTO: '2026-05-01', FECHA_REGISTRO: new Date(2025, 11, 31) }, // Wed (anterior)
    { ID_INTERNO: 'P1', TIPO_EVENTO: 'B', FECHA_EVENTO: '2026-05-01', FECHA_REGISTRO: new Date(2026, 0, 1) }     // Thu (posterior)
  ];
  const m = c.Ev_ultimoPorPaciente_(eventos);
  assert.equal(m['P1'].tipo, 'B', 'gana el registro posterior aunque su String ordena antes');
});

// ── MF-004 · Log_info_/warning_/error_ reenvían duracionMs ───────────────────
test('MF-004: Log_info_ persiste duracionMs en el búfer', () => {
  const c = backend();
  c.Log_info_('Mod', 'op', 'mensaje', {}, 123);
  const buf = vm.runInContext('_LOG_BUFFER', c);
  const ultima = buf[buf.length - 1];
  assert.equal(ultima[5], 123, 'columna DURACION_MS');
});

// ── MF-005 · Aud_auditarConfig_ acepta 'días'/'día' (sin tildes) ─────────────
test('MF-005: Aud_auditarConfig_ no marca "días" como unidad inválida', () => {
  const c = backend();
  assert.equal(c.Aud_auditarConfig_([['FREC_CONTROL_G1_UNIDAD', 'días']]).unidadesInvalidas, 0, 'días válida');
  assert.equal(c.Aud_auditarConfig_([['FREC_CONTROL_G1_UNIDAD', 'semanas']]).unidadesInvalidas, 1, 'semanas inválida');
});

// ── MF-006 · Instalar_pAmarillo_ no revienta si la fuente devuelve null ──────
test('MF-006: Instalar_pAmarillo_ con Amarillo_importarTodo_ null no lanza', () => {
  const c = backend();
  c.Amarillo_importarTodo_ = () => null;
  const r = c.Instalar_pAmarillo_();
  assert.equal(r.ok, false, 'resultado no exitoso');
  assert.equal(r.motivo, 'No se pudo cargar el sector amarillo', 'motivo por defecto');
});

// ── MF-007 · Hojas_colorearRutIngresos_ fast-path compara color sin distinguir
//           formato (#E3F3EA vs #e3f3ea) ─────────────────────────────────────
test('MF-007: colorearRutIngresos_ no reescribe si el color ya coincide (minúsculas)', () => {
  const c = backend();
  c.Modelo_dataStartRow_ = () => 4;
  c.Hojas_filasGestionadas_ = () => 1;
  let escrituras = 0;
  const range = {
    getValues: () => [['12345678-5']],
    getBackgrounds: () => [['#e3f3ea']],
    setBackgrounds: () => { escrituras++; }
  };
  const hoja = { getLastRow: () => 10, getRange: () => range };
  const ss = { getSheetByName: () => hoja };
  const r = c.Hojas_colorearRutIngresos_(ss);
  assert.equal(escrituras, 0, 'sin reescrituras cuando el fondo ya coincide');
  assert.equal(r.fallidas.length, 0, 'sin fallos');
});

// ── MF-008 · Aud_auditarProfesionales_ no reporta inactivos como inexistentes ─
test('MF-008: Aud_auditarProfesionales_ reconoce código de profesional inactivo', () => {
  const c = backend();
  c.Profesionales_catalogo_ = () => [
    { CODIGO: 'DR1', NOMBRE: 'Activo', TIPO_ROL: 'MEDICO', ACTIVO: true },
    { CODIGO: 'DR2', NOMBRE: 'Inactivo', TIPO_ROL: 'MEDICO', ACTIVO: false }
  ];
  const r = c.Aud_auditarProfesionales_([{ ID_INTERNO: 'P1', PROFESIONAL_SEGUIMIENTO: 'DR2', DUPLA_INGRESO: '' }]);
  assert.equal(r.inexistentesEnCatalogo, 0, 'un código inactivo del catálogo existe');
});

// ── MF-009 · _centro_resumen_ usa el criterio canónico de estratificación ────
test("MF-009: _centro_resumen_ cuenta G0/NSP/vacío/G como estratificación pendiente", () => {
  const c = backend();
  const r = c._centro_resumen_([
    { ESTRATIFICACION: 'G1' }, { ESTRATIFICACION: '' },
    { ESTRATIFICACION: 'G' }, { ESTRATIFICACION: 'G0' }, { ESTRATIFICACION: 'NSP' }
  ], [], '', '');
  assert.equal(r.estratPendiente, 4, 'solo G1 es válida');
});

// ── MF-010 · api_configEliminar_ bloquea claves secretas (no solo protegidas) ─
test('MF-010: api_configEliminar_ rechaza una clave secreta (WEBHOOK_TOKEN)', () => {
  const c = backend();
  c.WebApp_autorizarBuscador_ = () => true;
  const r = c.api_configEliminar_('WEBHOOK_TOKEN', 'token');
  assert.equal(r.ok, false, 'no elimina');
  assert.ok(String(r.motivo).indexOf('CLAVE_PROTEGIDA') === 0, 'motivo CLAVE_PROTEGIDA (fue ' + r.motivo + ')');
});

console.log('\nMICROAUDITORÍA LOTE 001 — Total: ' + (passed + failed) + ' · OK: ' + passed + ' · FALLAN: ' + failed);
process.exit(failed ? 1 : 0);
