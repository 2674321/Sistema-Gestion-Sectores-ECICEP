#!/usr/bin/env node
// Regresiones reproducibles de la revisión post-entrega. Solo datos sintéticos.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
function backend() {
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  for (const f of readdirSync(new URL('src/', root)).filter(f => /\.(js|gs)$/.test(f)).sort()) {
    vm.runInContext(read('src/' + f), ctx, { filename: f });
  }
  return ctx;
}
let passed = 0;
function test(name, run) { run(); passed++; console.log('[PASS] ' + name); }
function sheet(headers) {
  const rows = [Array.from(headers)];
  return { rows, getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
    getRange(r, c, h, w) { return {
      getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => rows[r+i-1]?.[c+j-1] ?? '')),
      setValues(values) {
        assert.equal(values.length, h);
        values.forEach((row, i) => {
          assert.equal(row.length, w);
          rows[r+i-1] ??= Array(headers.length).fill('');
          row.forEach((v,j) => { rows[r+i-1][c+j-1] = v; });
        });
      }
    }; }
  };
}
const payload = { captureId: 'Cp2-' + 'a'.repeat(32), accion: 'nuevoIngreso', rut: '12345678-5',
  nombre: 'PERSONA FICTICIA', fechaNacimiento: '1990-01-01', sector: 'VERDE',
  fechaIngreso: '2026-09-01', profesional: 'Matrona/o' };
for (const reorder of [false, true]) test('Captura real: persistir, releer y actualizar trailer ' + (reorder ? 'con columnas reordenadas y extras' : 'canónico'), () => {
  const c = backend();
  const headers = Array.from(c.Form_columnas());
  if (reorder) { headers.reverse(); headers.splice(4, 0, 'DATO_EXTRA'); }
  const h = sheet(headers);
  c.Modelo_hoja = () => h;
  c.Captura_v2_ahora = () => '2026-09-16 10:00:00';
  const reg = c.Captura_v2_nuevoRegistro(payload, { usuario: 'test', fechaRecepcion: '2026-09-16' });
  assert.equal(c.Captura_v2_persistirRegistro(reg).ok, true);
  let found = c.Captura_v2_buscarRegistro(payload.captureId);
  assert.equal(found.estado, 'RECIBIDO');
  assert.equal(found.fechaIngreso, '2026-09-01');
  if (reorder) h.rows[1][headers.indexOf('DATO_EXTRA')] = 'CONSERVAR';
  assert.equal(c.Captura_v2_actualizarTrailer(payload.captureId, { estado: 'PROCESADO', idInterno: 'FICTICIO' }, found).ok, true);
  found = c.Captura_v2_buscarRegistro(payload.captureId);
  assert.equal(found.estado, 'PROCESADO');
  assert.equal(found.idInterno, 'FICTICIO');
  assert.equal(found.normalizado.nombre, payload.nombre);
  if (reorder) assert.equal(h.rows[1][headers.indexOf('DATO_EXTRA')], 'CONSERVAR');
});
for (const defect of ['ausente', 'duplicado']) test('Esquema ' + defect + ' rechaza escritura antes de persistir', () => {
  const c = backend();
  const headers = Array.from(c.Form_columnas());
  if (defect === 'ausente') headers.splice(headers.indexOf('ESTADO'), 1);
  else headers.push('ESTADO');
  const h = sheet(headers); c.Modelo_hoja = () => h;
  const reg = c.Captura_v2_nuevoRegistro(payload, { usuario: 'test', fechaRecepcion: '2026-09-16' });
  assert.equal(c.Captura_v2_persistirRegistro(reg).ok, false);
  assert.equal(h.rows.length, 1);
});
test('Reparación no reetiqueta filas pobladas con otro orden', () => {
  const c = backend();
  const h = sheet(Array.from(c.Form_columnas()).reverse());
  h.rows.push(Array(h.rows[0].length).fill('CONSERVAR'));
  const before = JSON.stringify(h.rows);
  c.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => h }) };
  assert.equal(c.Form_instalar().motivo, 'ESQUEMA_CAPTURA_REQUIERE_REVISION');
  assert.equal(JSON.stringify(h.rows), before);
});
test('Actualizar contacto no solicita identidad que el payload V2 omite', () => {
  const c = backend(); const s = c.Form_esquemaFormulario().ACTUALIZAR_DATOS;
  assert.equal(s.secciones.ident, false);
  assert.deepEqual(Array.from(s.camposRequeridos).sort(), ['PROFESIONAL','RUT']);
});
test('Simulación del orquestador no llama a ningún escritor', () => {
  const c = backend(); const calls = [];
  for (const name of ['Modelo_asegurarEsquemaPacientes','Modelo_alinearVistasSectoriales',
    'Modelo_limpiarHojasResiduales','Amarillo_importarTodo','Estrat_recalcularTodos',
    'Control_recalcularTodos','Modelo_refrescarVistasSectores','HVis_aplicarTodasLasSecciones',
    'HVis_formatearIngresos','Hojas_formatoCondicional','Modelo_validarIngresos',
    'Modelo_aplicarDiseno','Modelo_disenoHojas','Hojas_colorearRutIngresos','onOpen','Log_info','Log_flush']) {
    c[name] = () => { calls.push(name); return { ok: true }; };
  }
  c.Fuentes_cargaReal = o => { assert.equal(o.ejecutar, false); return { ok: true, resumen: {} }; };
  c.Act_enriquecerPacientes = o => { assert.equal(o.dryRun, true); return { ok: true }; };
  const r = c.Act_actualizarSistema({ ejecutar: false });
  assert.equal(r.ok, true); assert.equal(r.dryRun, true);
  assert.deepEqual(calls, []);
});
function actualizacionSimulada() {
  const c = backend();
  c.Modelo_ss = () => ({ getSheetByName: () => ({}) });
  c.Modelo_asegurarEsquemaPacientes = () => ({ ok: true });
  c.Modelo_alinearVistasSectoriales = () => ({ errores: [] });
  c.Modelo_limpiarHojasResiduales = () => ({ candidatas: [], eliminadas: [] });
  c.Fuentes_cargaReal = () => ({ ok: true, resumen: {} });
  c.Amarillo_importarTodo = () => ({ ok: true });
  c.Act_enriquecerPacientes = () => ({ ok: true, errores: 0 });
  c.Estrat_recalcularTodos = () => ({ ok: true, recalculados: 0 });
  c.Control_recalcularTodos = () => ({ ok: true, cambios: 0 });
  c.Captura_reconciliarFechasCorregidas_ = () => ({ ok: true });
  c.Modelo_refrescarVistasSectores = () => ({});
  c.HVis_aplicarTodasLasSecciones = () => ({ ok: true, resultados: [] });
  c.HVis_formatearIngresos = () => ({});
  c.Hojas_formatoCondicional = () => ({ errores: [] });
  c.Modelo_validarIngresos = () => ({ fallidas: [] });
  c.Modelo_aplicarDiseno = () => ({ fallidas: [] });
  c.Modelo_disenoHojas = () => ({ ok: true });
  c.Hojas_colorearRutIngresos = () => 0;
  c.onOpen = () => {};
  c.Log_info = () => {}; c.Log_error = () => {}; c.Log_flush = () => {};
  return c;
}
test('Actualizar informa fallo devuelto por Amarillo, sin éxito falso', () => {
  const c = actualizacionSimulada();
  const logs = [];
  c.Log_error = (_, __, detail) => logs.push(JSON.parse(detail));
  c.Amarillo_importarTodo = () => ({ ok: false, motivo: 'FUENTE_NO_DISPONIBLE' });
  const r = c.Act_actualizarSistema({ ejecutar: true });
  assert.equal(r.ok, false);
  assert.ok(r.resumen.errores.includes('amarillo'));
  assert.equal(r.resumen.detalleErrores.amarillo, 'FUENTE_NO_DISPONIBLE');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].detalleErrores.amarillo, 'FUENTE_NO_DISPONIBLE');
});
test('Actualizar informa excepciones de vistas y fallos parciales de diseño', () => {
  const c = actualizacionSimulada();
  c.Modelo_refrescarVistasSectores = () => { throw Error('VISTA_SIMULADA'); };
  c.Modelo_aplicarDiseno = () => ({ fallidas: ['PACIENTES: DISEÑO_SIMULADO'] });
  const r = c.Act_actualizarSistema({ ejecutar: true });
  assert.equal(r.ok, false);
  assert.deepEqual(Array.from(r.resumen.errores), ['vistas', 'diseno']);
  assert.equal(r.resumen.detalleErrores.vistas, 'VISTA_SIMULADA');
  assert.match(r.resumen.detalleErrores.diseno, /DISEÑO_SIMULADO/);
});
test('Actualizar informa fallos parciales de validación y secciones', () => {
  const c = actualizacionSimulada();
  c.Modelo_validarIngresos = () => ({ fallidas: ['INGRESO_VERDE: REGLA_SIMULADA'] });
  c.HVis_aplicarTodasLasSecciones = () => ({ ok: true, resultados: [{ hoja: 'PACIENTES', ok: false, motivo: 'SECCION_SIMULADA' }] });
  const r = c.Act_actualizarSistema({ ejecutar: true });
  assert.equal(r.ok, false);
  assert.ok(r.resumen.errores.includes('validaciones'));
  assert.ok(r.resumen.errores.includes('seccionesVisuales'));
  assert.match(r.resumen.detalleErrores.seccionesVisuales, /PACIENTES/);
});
test('Actualizar informa formato de ingreso incompleto', () => {
  const c = actualizacionSimulada();
  c.HVis_formatearIngresos = () => ({ INGRESO_VERDE: 'LEGADO → ERROR', _fallidas: ['INGRESO_VERDE: FORMATO_SIMULADO'] });
  const r = c.Act_actualizarSistema({ ejecutar: true });
  assert.equal(r.ok, false);
  assert.equal(r.resumen.detalleErrores.formato, 'INGRESO_VERDE: FORMATO_SIMULADO');
});
test('Actualizar captura fallo de fuentes también en simulación', () => {
  const c = actualizacionSimulada();
  c.Fuentes_cargaReal = () => { throw Error('FUENTE_SIMULADA'); };
  const r = c.Act_actualizarSistema({ ejecutar: false });
  assert.equal(r.ok, false);
  assert.deepEqual(Array.from(r.resumen.errores), ['fuentes']);
  assert.equal(r.resumen.detalleErrores.fuentes, 'FUENTE_SIMULADA');
});
test('La interfaz identifica las fases que fallaron', () => {
  const c = actualizacionSimulada(), mensajes = [];
  c.Act_actualizarSistema = () => ({ ok: false, resumen: { errores: ['vistas', 'diseno'] } });
  c.Utl_toast = (tipo, mensaje) => mensajes.push({ tipo, mensaje });
  c.UI_actualizarTodo();
  assert.equal(mensajes.at(-1).tipo, 'error');
  assert.match(mensajes.at(-1).mensaje, /vistas, diseno/);
});
test('Enriquecimiento simulado conserva el objeto memoizado', () => {
  const c = backend(); const p = { ID_INTERNO: 'FICTICIO', RUT: '12345678-5', SEXO: '', FECHA_NACIMIENTO: '' };
  const before = JSON.stringify(p);
  c.Modelo_leerPacientes = () => [p];
  c.Act_leerOrigenesDemograficos = () => ({ '12345678-5': {
    SEXO: { valor: 'F', fuente: 'PRUEBA', conflicto: false },
    FECHA_NACIMIENTO: { valor: '1990-01-01', fuente: 'PRUEBA', conflicto: false }
  } });
  const r = c.Act_enriquecerPacientes({ dryRun: true });
  assert.equal(r.enriquecidos, 1); assert.equal(JSON.stringify(p), before);
});
test('Carga de fuentes simulada conserva memo y no registra logs persistentes', () => {
  const c = backend(); const p = { ID_INTERNO: 'FICTICIO', RUT: '12345678-5', SEXO: '' };
  c.Modelo_leerPacientes = () => [p]; c.Modelo_leerEventos = () => [];
  c.Fuentes_leerStagingAutorizado = () => [];
  c.Fuentes_contarHojasAutorizadas = () => ({ hojas: 0 });
  c.Act_mergearPacientesDesdeStaging = (_, patients) => { patients[0].SEXO = 'F'; return {}; };
  c.Ingresos_procesarFilas = () => ({ resumen: {}, resultados: [] });
  c.Log_info = () => { throw Error('No escribir logs'); };
  assert.equal(c.Fuentes_cargaReal({ ejecutar: false, actualizar: true }).ok, true);
  assert.equal(p.SEXO, '');
});
test('Esquema incompatible detiene importación antes de anexar eventos', () => {
  const c = backend(); let eventos = 0;
  c.Modelo_leerPacientes = () => []; c.Modelo_leerEventos = () => [];
  c.Fuentes_leerStagingAutorizado = () => [];
  c.Fuentes_contarHojasAutorizadas = () => ({ hojas: 0 });
  c.Act_mergearPacientesDesdeStaging = () => ({ actualizados: 0, conflictos: 0 });
  c.Ingresos_procesarFilas = () => ({ resumen: {}, resultados: [], pacientesNuevos: [{}], eventos: [{}] });
  c.Modelo_asegurarEsquemaPacientes = () => ({ ok: false, motivo: 'prueba' });
  c.Modelo_agregarEventos = () => { eventos++; };
  const r = c.Fuentes_cargaReal({ ejecutar: true, actualizar: true });
  assert.equal(r.ok, false); assert.equal(r.motivo, 'ESQUEMA_PACIENTES_INCOMPATIBLE');
  assert.equal(eventos, 0); assert.equal(r.resumen.escritosPacientes, false);
});
function ui() {
  const elements = new Map(); const requests = []; const writes = [];
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, attrs: {}, innerHTML: '',
      textContent: '', classList: { toggle() {}, add() {}, remove() {} },
      setAttribute(k,v) { this.attrs[k] = v; }, addEventListener() {} });
    return elements.get(id);
  };
  const c = vm.createContext({ document: { getElementById: el, querySelectorAll: () => [] },
    Intl, Date: class extends Date { constructor(...a) { super(...(a.length ? a : ['2026-09-16T01:00:00Z'])); } },
    _esc: String, _refrescarIconos() {}, _fmtFecha: String, _chipSector: String, toast() {},
    setTimeout, clearTimeout, setLoading() {}, _btnCargando: () => () => {},
    google: { script: { get run() { const req = {}; return {
      withSuccessHandler(f) { req.ok=f; return this; }, withFailureHandler(f) { req.fail=f; return this; },
      api_controlPanel(q) { requests.push({ ...req, q }); },
      api_controlActualizarUltimo(...args) { writes.push({ ...req, args }); }
    }; } } }
  });
  const script = [...read('src/Controles.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(script, c);
  return { c, requests, writes, el };
}
test('Filtros rápidos se agrupan y descartan la respuesta obsoleta', () => {
  const { c, requests, el } = ui();
  el('fSec').value = 'VERDE'; c.consultar(true);
  el('fSec').value = 'AMARILLO'; c.consultar(true);
  assert.equal(requests.length, 1);
  requests[0].ok({ ok: true, filas: [{ idInterno: 'OBSOLETO' }], total: 1 });
  assert.equal(requests.length, 2); assert.equal(requests[1].q.sector, 'AMARILLO');
  assert.equal(c.CTRL.filas.length, 0);
  requests[1].ok({ ok: true, filas: [], total: 0 });
  assert.equal(el('contenido').attrs['aria-busy'], 'false');
});
test('Fallo de consulta obsoleta también ejecuta el último filtro', () => {
  const { c, requests, el } = ui();
  el('fTermino').value = 'FICTICIO'; c.consultar(true);
  requests[0].fail({ message: 'red' });
  assert.equal(requests.length, 2); assert.equal(requests[1].q.termino, 'FICTICIO');
});
test('Paginar no duplica llamadas ni mezcla páginas', () => {
  const { c, requests } = ui();
  c.pintar = () => {};
  requests[0].ok({ ok: true, filas: [{ idInterno: 'A' }], total: 2 });
  c.consultar(false); c.consultar(false);
  assert.equal(requests.length, 2); assert.equal(requests[1].q.inicio, 1);
  requests[1].ok({ ok: true, filas: [{ idInterno: 'B' }], total: 2 });
  assert.equal(c.CTRL.inicio, 2); assert.equal(c.CTRL.filas.length, 2);
});
test('Control usa fecha de Chile y evita doble envío concurrente', () => {
  const { c, writes } = ui(); c.CTRL.sel = 'FICTICIO';
  c.registrar('CONTROL'); c.registrar('CONTROL');
  assert.equal(writes.length, 1); assert.equal(writes[0].args[2], '2026-09-15');
  writes[0].fail({ message: 'red' }); c.registrar('CONTROL');
  assert.equal(writes.length, 2);
});
console.log(`Revisión post-entrega — ${passed}/${passed}`);
