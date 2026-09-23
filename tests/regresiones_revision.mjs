#!/usr/bin/env node
// Regresiones reproducibles de la revisión post-entrega. Solo datos sintéticos.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
// Valida cada método, pero REVENTA cualquier método inexistente: así una API
// inventada (p.ej. DataValidationBuilder.setDateValid) no puede pasar en local
// mientras el runtime real de Apps Script la rechaza.
function _builderEstricto(nombre, metodos) {
  const base = {};
  for (const m of metodos) base[m] = undefined;
  const p = new Proxy(base, {
    get(t, prop) {
      if (typeof prop === 'symbol') return t[prop];
      if (prop === 'build') return () => ({});
      if (prop in t) return () => p;
      throw new Error(nombre + '.' + String(prop) + ' no existe en la API de Apps Script');
    }
  });
  return p;
}
const DATAVALIDATION_METODOS = ['copy', 'requireCheckbox', 'requireDate', 'requireDateAfter',
  'requireDateBefore', 'requireDateBetween', 'requireDateEqualTo', 'requireDateNotBetween',
  'requireDateOnOrAfter', 'requireDateOnOrBefore', 'requireFormulaSatisfied',
  'requireNumberBetween', 'requireNumberEqualTo', 'requireNumberGreaterThan',
  'requireNumberGreaterThanOrEqualTo', 'requireNumberLessThan', 'requireNumberLessThanOrEqualTo',
  'requireNumberNotBetween', 'requireNumberNotEqualTo', 'requireTextContains',
  'requireTextDoesNotContain', 'requireTextDoesNotMatchRegex', 'requireTextEquals',
  'requireTextMatchesRegex', 'requireValueInList', 'requireValueInRange',
  'setAllowInvalid', 'setHelpText', 'build'];
const FORMATORULE_METODOS = ['copy', 'whenCellIsEmpty', 'whenCellNotEmpty', 'whenDateAfter',
  'whenDateBefore', 'whenDateBetween', 'whenDateEqualTo', 'whenFormulaSatisfied',
  'whenNumberBetween', 'whenNumberEqualTo', 'whenNumberGreaterThan',
  'whenNumberGreaterThanOrEqualTo', 'whenNumberLessThan', 'whenNumberLessThanOrEqualTo',
  'whenTextContains', 'whenTextDoesNotContain', 'whenTextEndsWith', 'whenTextEqualTo',
  'whenTextStartsWith', 'setBackground', 'setBold', 'setFontColor', 'setFontFamily',
  'setFontStyle', 'setItalic', 'setRanges', 'setStrikethrough', 'setUnderline', 'build'];
const SPREADSHEETAPP_MOCK = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => null }),
  openById: () => null,
  BorderStyle: { SOLID_THICK: 'SOLID_THICK', SOLID: 'SOLID', DOTTED: 'DOTTED', DASHED: 'DASHED', DOUBLE: 'DOUBLE' },
  WrapStrategy: { WRAP: 'WRAP', OVERFLOW: 'OVERFLOW', CLIP: 'CLIP', CLAMP: 'CLAMP' },
  newDataValidation: () => _builderEstricto('DataValidationBuilder', DATAVALIDATION_METODOS),
  newConditionalFormatRule: () => _builderEstricto('ConditionalFormatRuleBuilder', FORMATORULE_METODOS)
};
function backend() {
  const ctx = vm.createContext({ console: { log() {}, error() {} } });
  for (const f of readdirSync(new URL('src/', root)).filter(f => /\.(js|gs)$/.test(f)).sort()) {
    vm.runInContext(read('src/' + f), ctx, { filename: f });
  }
  ctx.SpreadsheetApp = SPREADSHEETAPP_MOCK;
  return ctx;
}
let passed = 0;
function test(name, run) { run(); passed++; console.log('[PASS] ' + name); }
// Las constantes top-level (const/let) del contexto VM NO son propiedades del
// objeto ctx (solo las function lo son). Se leen con vm.runInContext.
const ctxExpr = (c, expr) => vm.runInContext(expr, c);
function sheet(headers) {
  const rows = [Array.from(headers)];
  return { rows, getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
    getRange(r, c, h, w) { const rango = {
      getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => rows[r+i-1]?.[c+j-1] ?? '')),
      createTextFinder(buscado) { let exacto = false; return {
        matchEntireCell(v) { exacto = !!v; return this; },
        findNext() {
          for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
            const actual = String(rows[r + i - 1]?.[c + j - 1] ?? '');
            if (exacto ? actual === String(buscado) : actual.includes(String(buscado)))
              return { getRow: () => r + i, getColumn: () => c + j };
          }
          return null;
        }
      }; },
      setValues(values) {
        assert.equal(values.length, h);
        values.forEach((row, i) => {
          assert.equal(row.length, w);
          rows[r+i-1] ??= Array(headers.length).fill('');
          row.forEach((v,j) => { rows[r+i-1][c+j-1] = v; });
        });
      }
    }; return rango; }
  };
}
// Hoja visual genérica: rejilla de valores en memoria + estilos separados,
// con registro de operaciones para verificar qué se escribe y qué se salta.
// Soporta el flujo completo de HVis_normalizarLayout en estado 'OK' (sin
// insertRows/deleteRows) y las lecturas de HVis_pendientesVisual.
function hojaVisual(nombre, opts) {
  const filas = (opts.filas || []).map(f => Array.from(f));
  const ancho = opts.ancho || Math.max(1, ...filas.map(f => f.length));
  const estilo = { bg: {}, fc: {}, fw: {}, fs: {}, rh: {} };
  const ops = [];
  const vacio = v => v === '' || v == null;
  const bg = (r, c) => estilo.bg[r + ':' + c] ?? '#ffffff';
  const fc = (r, c) => estilo.fc[r + ':' + c] ?? '#000000';
  const fw = (r, c) => estilo.fw[r + ':' + c] ?? 'normal';
  const fs = (r, c) => estilo.fs[r + ':' + c] ?? 10;
  function rango(r, c, h, w) {
    const numR = h === undefined ? 1 : h;
    const numC = w === undefined ? 1 : w;
    const rg = {
      getValues: () => Array.from({ length: numR }, (_, i) =>
        Array.from({ length: numC }, (_, j) => (filas[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValues(vals) {
        vals.forEach((row, i) => {
          (filas[r - 1 + i] = filas[r - 1 + i] || []);
          row.forEach((v, j) => { filas[r - 1 + i][c - 1 + j] = v; });
        });
        ops.push(['setValues', r, c, numR, numC]);
        return rg;
      },
      setValue(v) { (filas[r - 1] = filas[r - 1] || [])[c - 1] = v; ops.push(['setValue', r, c, v]); return rg; },
      merge() { ops.push(['merge', r, c, numR, numC]); return rg; },
      breakApart() { ops.push(['breakApart', r, c]); return rg; },
      clear() { for (let i = 0; i < numR; i++) for (let j = 0; j < numC; j++) delete (filas[r - 1 + i] || [])[c - 1 + j]; ops.push(['clear', r, c]); return rg; },
      setBackground(v) { estilo.bg[r + ':' + c] = v; return rg; },
      setBackgrounds(vals) { vals.forEach((row, i) => row.forEach((v, j) => { estilo.bg[(r + i) + ':' + (c + j)] = v; })); return rg; },
      getBackground: () => bg(r, c),
      getBackgrounds: () => Array.from({ length: numR }, (_, i) => Array.from({ length: numC }, (_, j) => bg(r + i, c + j))),
      setFontColor(v) { estilo.fc[r + ':' + c] = v; return rg; },
      setFontColors(vals) { vals.forEach((row, i) => row.forEach((v, j) => { estilo.fc[(r + i) + ':' + (c + j)] = v; })); return rg; },
      getFontColor: () => fc(r, c),
      getFontColors: () => Array.from({ length: numR }, (_, i) => Array.from({ length: numC }, (_, j) => fc(r + i, c + j))),
      setFontWeight(v) { estilo.fw[r + ':' + c] = v; return rg; },
      setFontWeights(vals) { vals.forEach((row, i) => row.forEach((v, j) => { estilo.fw[(r + i) + ':' + (c + j)] = v; })); return rg; },
      getFontWeight: () => fw(r, c),
      getFontWeights: () => Array.from({ length: numR }, (_, i) => Array.from({ length: numC }, (_, j) => fw(r + i, c + j))),
      setFontSize(v) { estilo.fs[r + ':' + c] = v; return rg; },
      setFontSizes(vals) { vals.forEach((row, i) => row.forEach((v, j) => { estilo.fs[(r + i) + ':' + (c + j)] = v; })); return rg; },
      getFontSize: () => fs(r, c),
      getFontSizes: () => Array.from({ length: numR }, (_, i) => Array.from({ length: numC }, (_, j) => fs(r + i, c + j))),
      setHorizontalAlignment() { return rg; }, setVerticalAlignment() { return rg; },
      setHorizontalAlignments() { return rg; }, setVerticalAlignments() { return rg; },
      setBorder() { ops.push(['border', r, c, numR, numC]); return rg; },
      setBorders() { ops.push(['borders', r, c, numR, numC]); return rg; },
      setNumberFormat() { return rg; }, setWrapStrategy() { return rg; }
    };
    return rg;
  }
  const hoja = {
    getName: () => nombre,
    getLastRow: () => { for (let i = filas.length; i > 0; i--) if (filas[i - 1].some(v => !vacio(v))) return i; return 0; },
    getLastColumn: () => ancho,
    getRange: rango,
    insertRowsBefore() { ops.push(['insertBefore']); },
    deleteRows() { ops.push(['deleteRows']); },
    setRowHeight(row, h) { estilo.rh[row] = h; ops.push(['rowH', row, h]); },
    getRowHeight: row => estilo.rh[row] ?? 28,
    setFrozenRows(n) { ops.push(['frozen', 'rows', n]); },
    setFrozenColumns(n) { ops.push(['frozen', 'cols', n]); },
    _filas: filas, _ops: ops, _estilo: estilo
  };
  return hoja;
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
  for (const name of ['Modelo_asegurarEsquemaPacientes_','Modelo_alinearVistasSectoriales_',
    'Modelo_limpiarHojasResiduales','Amarillo_importarTodo_','Estrat_recalcularTodos_',
    'Control_recalcularTodos','Modelo_refrescarVistasSectores_','HVis_aplicarTodasLasSecciones',
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
  c.Modelo_asegurarEsquemaPacientes_ = () => ({ ok: true });
  c.Modelo_alinearVistasSectoriales_ = () => ({ errores: [] });
  c.Modelo_limpiarHojasResiduales = () => ({ candidatas: [], eliminadas: [] });
  c.Fuentes_cargaReal = () => ({ ok: true, resumen: {} });
  c.Amarillo_importarTodo_ = () => ({ ok: true });
  c.Act_enriquecerPacientes = () => ({ ok: true, errores: 0 });
  c.Estrat_recalcularTodos_ = () => ({ ok: true, recalculados: 0 });
  c.Control_recalcularTodos = () => ({ ok: true, cambios: 0 });
  c.Captura_reconciliarFechasCorregidas_ = () => ({ ok: true });
  c.Modelo_refrescarVistasSectores_ = () => ({});
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
  c.Amarillo_importarTodo_ = () => ({ ok: false, motivo: 'FUENTE_NO_DISPONIBLE' });
  const r = c.Act_actualizarSistema({ ejecutar: true });
  assert.equal(r.ok, false);
  assert.ok(r.resumen.errores.includes('amarillo'));
  assert.equal(r.resumen.detalleErrores.amarillo, 'FUENTE_NO_DISPONIBLE');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].detalleErrores.amarillo, 'FUENTE_NO_DISPONIBLE');
});
test('Actualizar informa excepciones de vistas y fallos parciales de diseño', () => {
  const c = actualizacionSimulada();
  c.Modelo_refrescarVistasSectores_ = () => { throw Error('VISTA_SIMULADA'); };
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
test('Estratificación de ficha conserva nivel de fuente si no hay cálculo y limpia caché', () => {
  const c = backend(), p = { ID_INTERNO: 'P-1', ESTRATIFICACION: 'G2', CONDICIONES: '' };
  let guardado, invalidaciones = 0;
  c.Modelo_hoja = () => ({ getRange: () => ({ setValues: v => { guardado = v[0][0]; } }) });
  c.Modelo_leerPacientes = () => [p];
  c.Modelo_filaFisica = () => 4;
  c.Modelo_filaDesdeObjeto = obj => [obj.ESTRATIFICACION];
  c.Modelo_invalidarLecturas = () => { invalidaciones++; };
  c.Modelo_refrescarVistasSectores_ = () => {};
  c.Estrat_evaluar = () => ({ estado: 'SIN_DATOS', resultado: '', puntaje: 0, regla: '' });
  const r = c.Estrat_recalcularPaciente_('P-1');
  assert.equal(r.resultado, 'G2'); assert.equal(guardado, 'G2');
  assert.equal(invalidaciones, 1);
});
test('Recálculo masivo invalida lectura y registra cambio de estratificación', () => {
  const c = backend(), p = { ID_INTERNO: 'P-1', ESTRATIFICACION: '', CONDICIONES: 'HTA' };
  let guardado, invalidaciones = 0, guardadoEvento = null;
  c.Modelo_hoja = () => ({ getRange: () => ({ setValues: v => { guardado = v[0][0]; } }) });
  c.Modelo_leerPacientes = () => [p];
  c.Modelo_filaDesdeObjeto = obj => [obj.ESTRATIFICACION];
  c.Modelo_invalidarLecturas = () => { invalidaciones++; };
  c.Modelo_refrescarVistasSectores_ = () => {};
  c.Log_info = () => {}; c.Log_flush = () => {};
  c.Estrat_evaluar = () => ({ estado: 'CALCULADO', resultado: 'G1' });
  c.Modelo_agregarEventos_ = eventos => { guardadoEvento = eventos[0]; return 1; };
  const r = c.Estrat_recalcularTodos_();
  assert.equal(r.recalculados, 1); assert.equal(guardado, 'G1');
  assert.equal(invalidaciones, 1);
  assert.equal(guardadoEvento.TIPO_EVENTO, 'CAMBIO_ESTRATIFICACION');
  assert.equal(guardadoEvento.RIESGO_G, 'G1');
  assert.equal(guardadoEvento.DESCRIPCION, ' → G1 · RECALCULO_MASIVO');
});
test('INICIO cuenta pendientes solo en filas con paciente y usa total real en porcentajes', () => {
  const c = backend();
  const formula = c.Hojas_formulaIndicador('ESTRAT_PEND');
  assert.match(formula, /^=MAX\(0;COUNTA\(PACIENTES!A4:A\)/);
  for (const nivel of ['G1', 'G2', 'G3'])
    assert.ok(formula.includes('COUNTIFS(PACIENTES!A4:A;"<>";PACIENTES!I4:I;"' + nivel + '")'));
  const hoja = read('src/17_Hojas.js');
  assert.match(hoja, /MAX\(COUNTA\(PACIENTES!/);
  assert.equal(c.Dash_calidadDatos([
    { ESTRATIFICACION: 'G1' }, { ESTRATIFICACION: '' },
    { ESTRATIFICACION: 'G' }, { ESTRATIFICACION: 'G0' }
  ]).estratPendiente, 3);
});
test('Estadísticas omite filas vacías de PACIENTES y conserva estratificación válida', () => {
  const c = backend();
  c.Modelo_leerPacientesCampos = () => [
    { ID_INTERNO: 'P-1', SECTOR: 'VERDE', ESTRATIFICACION: 'G2' },
    { ID_INTERNO: '', SECTOR: '', ESTRATIFICACION: '' }
  ];
  c.Modelo_leerEventosCampos = () => [];
  c._UI_tz = () => 'America/Santiago';
  c._ui_isoFecha = () => '';
  c.WebApp_autorizarBuscador = () => true;
  const r = c.api_dashboardDatos();
  assert.equal(r.ok, true); assert.equal(r.pacientes.length, 1);
  assert.equal(r.pacientes[0].est, 'G2');
});
test('Estadísticas considera pendientes los niveles no canónicos en la interfaz', () => {
  const html = read('src/Dashboard.html');
  const funcion = html.match(/function esPendiente\(est\)\{[^\n]+\}/)?.[0];
  assert.ok(funcion);
  const esPendiente = vm.runInNewContext('(' + funcion + ')');
  for (const valor of ['', 'G', 'G0', 'PENDIENTE', 'G4']) assert.equal(esPendiente(valor), true, valor);
  for (const valor of ['G1', 'g2', ' G3 ']) assert.equal(esPendiente(valor), false, valor);
});
test('El diseño de instalación oculta cuadrícula y ajusta filas ocupadas', () => {
  const c = backend(), calls = [];
  c.MODELO_DISENO = [{ nombre: 'EVENTOS', color: '#123456', banda: true }];
  const hoja = {
    getName: () => 'EVENTOS', getLastColumn: () => 2, getLastRow: () => 5,
    setTabColor: v => calls.push(['tab',v]), setFrozenRows: () => {},
    setHiddenGridlines: v => calls.push(['grid',v]),
    setRowHeights: (...v) => calls.push(['rows',...v]), isSheetHidden: () => false
  };
  c.Modelo_ss = () => ({ getActiveSheet: () => hoja,
    getSheetByName: name => name === 'EVENTOS' ? hoja : null,
    setActiveSheet: () => {}, moveActiveSheet: () => {} });
  c._modelo_estilizarEncabezado = (_, color) => calls.push(['header',color]);
  c._modelo_aplicarBanda = () => calls.push(['band']);
  const r = c.Modelo_aplicarDiseno();
  assert.equal(r.fallidas.length, 0);
  assert.ok(calls.some(x => x[0] === 'header' && x[1] === '#123456'));
  assert.ok(calls.some(x => x[0] === 'grid' && x[1] === true));
  assert.ok(calls.some(x => x[0] === 'rows' && x[1] === 2 && x[2] === 4));
});
test('Instalar no inmoviliza parcialmente las barras de título combinadas', () => {
  const c = backend(), llamadas = [];
  c.MODELO_DISENO = [
    { nombre: 'SECTOR_NARANJO', color: '#aabbcc', congelarCols: 3 },
    { nombre: 'EVENTOS', color: '#123456', congelarCols: 2 }
  ];
  function hoja(nombre, congeladas) {
    return { getName: () => nombre, getLastColumn: () => 0,
      setTabColor: () => {}, setFrozenRows: () => {},
      getFrozenColumns: () => congeladas,
      setFrozenColumns: n => {
        llamadas.push([nombre, n]);
        if (nombre === 'SECTOR_NARANJO' && n > 0)
          throw Error('No se pueden inmovilizar columnas que solo contengan parte de una celda combinada');
      },
      isSheetHidden: () => false };
  }
  const hojas = { SECTOR_NARANJO: hoja('SECTOR_NARANJO', 2), EVENTOS: hoja('EVENTOS', 0) };
  c.Modelo_ss = () => ({ getActiveSheet: () => hojas.EVENTOS,
    getSheetByName: nombre => hojas[nombre] || null,
    setActiveSheet: () => {}, moveActiveSheet: () => {} });
  const r = c.Modelo_aplicarDiseno();
  assert.equal(r.fallidas.length, 0);
  assert.deepEqual(llamadas, [['SECTOR_NARANJO', 0], ['EVENTOS', 2]]);
});
test('Instalar formatea fechas por encabezado físico y conserva otras columnas', () => {
  const c = backend(), fechas = [];
  const hoja = { getName: () => 'CONFLICTOS', getLastRow: () => 1,
    getLastColumn: () => 3, getMaxRows: () => 10,
    getRange(fila, col) { return {
      getValues: () => [['RUT', 'FECHA_DETECCION', 'TIPO']],
      setNumberFormat: formato => fechas.push([fila, col, formato])
    }; }
  };
  c._modelo_formatoSencillo(hoja, ['FECHA_DETECCION', 'TIPO', 'RUT']);
  assert.deepEqual(fechas, [[2, 2, 'dd/MM/yyyy']]);
});
test('Instalar no oculta datos clínicos al formatear PACIENTES', () => {
  const c = backend(), ocultas = [], anchos = [], fechas = [];
  const cadena = { setFontWeight: () => cadena, setBackground: () => cadena,
    setFontColor: () => cadena };
  const hoja = { setFrozenRows: () => {}, getRange: (_, col) => ({
    ...cadena, setNumberFormat: formato => fechas.push([col, formato]) }),
    getMaxRows: () => 20, setColumnWidth: col => anchos.push(col),
    hideColumns: (...args) => ocultas.push(args) };
  c._modelo_formatearPacientes(hoja);
  assert.equal(anchos.length, 31);
  assert.deepEqual(ocultas, []);
  assert.ok(fechas.some(([col, formato]) => col === 5 && formato === 'dd/MM/yyyy'));
  assert.ok(fechas.some(([col, formato]) => col === 30 && formato === 'dd/MM/yyyy HH:mm'));
});
test('Instalar reabre solo el bloque clínico ocultado por el grupo heredado', () => {
  const c = backend(), visibles = [];
  const hoja = { isColumnHiddenByUser: col => col <= 12,
    showColumns: (col, cantidad) => visibles.push([col, cantidad]) };
  assert.equal(c._modelo_repararGrupoPacientes(hoja), true);
  assert.deepEqual(visibles, [[2, 5], [8, 5]]);
  visibles.length = 0;
  hoja.isColumnHiddenByUser = col => col === 1;
  assert.equal(c._modelo_repararGrupoPacientes(hoja), false);
  assert.deepEqual(visibles, []);
});
test('Instalar retira un grupo heredado solo si coincide exactamente', () => {
  const c = backend(), operaciones = [];
  const grupo = { getRange: () => ({ getColumn: () => 1, getNumColumns: () => 12 }),
    expand: () => operaciones.push('expand'), remove: () => operaciones.push('remove') };
  const hoja = { getColumnGroupDepth: () => 1, getColumnGroup: () => grupo,
    showColumns: (col, n) => operaciones.push([col, n]) };
  assert.equal(c._modelo_repararGrupoPacientes(hoja), true);
  assert.deepEqual(operaciones, ['expand', 'remove', [2, 5], [8, 5]]);
});
test('Validaciones de PACIENTES respetan el tamaño de la hoja', () => {
  const c = backend(); let escritas = 0;
  c.SpreadsheetApp = { newDataValidation: () => { throw Error('No debe validar fuera de la hoja'); } };
  const hoja = { getLastColumn: () => 2, getMaxRows: () => 3,
    getRange: () => ({ getValues: () => [['SEXO', 'SECTOR']],
      setDataValidation: () => { escritas++; } }) };
  assert.equal(c._modelo_validacionesPacientes(hoja), 0);
  assert.equal(escritas, 0);
});
test('Semáforo de próximo control genera fórmulas válidas para ambas vistas', () => {
  const c = backend();
  assert.equal(c.Hojas_formulaProximoControl('Q', 4, 'VENCIDO'), '=AND($Q4<>"",$Q4<TODAY())');
  assert.equal(c.Hojas_formulaProximoControl('N', 4, 'PROXIMO'), '=AND($N4<>"",$N4>=TODAY(),$N4<=TODAY()+7)');
  assert.equal(c.Hojas_formulaProximoControl('N', 4, 'VIGENTE'), '=AND($N4<>"",$N4>TODAY()+7)');
});
test('DataValidationBuilder del harness rechaza APIs inexistentes (setDateValid)', () => {
  const c = backend();
  const b = c.SpreadsheetApp.newDataValidation();
  assert.ok(b.requireDate() === b);
  assert.ok(b.requireValueInList(['A']) === b);
  assert.ok(b.build());
  assert.throws(() => c.SpreadsheetApp.newDataValidation().setDateValid(true),
    /DataValidationBuilder\.setDateValid no existe en la API de Apps Script/);
  assert.throws(() => c.SpreadsheetApp.newDataValidation().metodoInexistente(),
    /DataValidationBuilder/);
});
test('Portada: picker FECHA_NACIMIENTO completa Hojas_formatoCondicional sin API inventada', () => {
  const c = backend();
  const rango = { setDataValidation: () => {}, setNote: () => {}, setNumberFormat: () => {} };
  const hoja = { getLastRow: () => 10, getMaxRows: () => 100, getLastColumn: () => 30,
    getRange: () => rango, setConditionalFormatRules: () => {} };
  const r = c.Hojas_formatoCondicional({ getSheetByName: () => hoja });
  assert.equal(r.errores.length, 0, 'errores: ' + r.errores.join(' | '));
  assert.ok(r.aplicadas >= 1, 'aplicó al menos una regla/validación');
});
// --- SAS-025: vista SECTOR migrada 15→16 sin formatear la columna OBSERVACIONES ---
function sectorMigrada(nombre, sector, conObs) {
  const fila2 = new Array(16).fill('');
  fila2[0] = 'IDENTIDAD';
  fila2[8] = 'SECTORIZACIÓN';
  fila2[11] = 'CONTROLES';
  if (conObs) fila2[15] = 'OBSERVACIONES';
  const filas = [
    ['SECTOR ' + sector],
    fila2,
    ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'EDAD', 'TELEFONOS', 'RUT_DV_VALIDO',
      'ESTRATIFICACION', 'ESTADO', 'FECHA_INGRESO', 'ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL',
      'PROXIMO_CONTROL', 'ULTIMO_EVENTO', 'OBSERVACIONES'],
    ['P-1', '12345678-5', 'PERSONA FICTICIA', 'F', '01/01/1990',
      '', '', '', 'G1', 'VIGENTE', '01/09/2026',
      '', '', '', '', 'nota clínica']
  ];
  return hojaVisual(nombre, { filas });
}
for (const sector of ['NARANJO', 'AMARILLO', 'VERDE'])
  test('SAS-025: ' + sector + ' migrado 15→16 repara la sección OBSERVACIONES col 16', () => {
    const c = backend();
    const nombre = 'SECTOR_' + sector;
    const hoja = sectorMigrada(nombre, sector, false);
    // Cadena equivalente a Instalar_pVisual → HVis_aplicarTodasLasSecciones({forzar:true})
    // → HVis_aplicarSecciones(hoja, {forzar:true}) para la hoja del sector.
    const r = c.HVis_aplicarSecciones(hoja, { forzar: true });
    assert.equal(r.ok, true, 'ok=' + r.ok + ' advertencias=' + JSON.stringify(r.advertencias));
    assert.equal(r.advertencias.length, 0, 'sin advertencias: ' + JSON.stringify(r.advertencias));
    const fila2 = hoja.getRange(2, 1, 1, 16).getValues()[0];
    assert.equal(fila2[0], 'IDENTIDAD');
    assert.equal(fila2[8], 'SECTORIZACIÓN');
    assert.equal(fila2[11], 'CONTROLES');
    assert.equal(fila2[15], 'OBSERVACIONES', sector + ' col16 debe pintarse');
    const rampa = ctxExpr(c, 'PALETA_SECCION')[sector].seccion;
    const esperado = rampa[3 % rampa.length];
    assert.equal(hoja.getRange(2, 16).getBackground().toUpperCase(), esperado.toUpperCase());
    assert.equal(hoja.getRange(4, 1).getValues()[0][0], 'P-1', 'datos intactos');
    assert.equal(hoja.getRange(4, 16).getValues()[0][0], 'nota clínica', 'datos intactos');
    assert.equal(hoja._ops.filter(o => o[0] === 'insertBefore').length, 0);
    assert.equal(hoja._ops.filter(o => o[0] === 'deleteRows').length, 0);
  });
test('SAS-025: Instalar/reparar fuerza el formato visual (forzar:true)', () => {
  const c = backend();
  let optsRecibidas = null;
  c.HVis_aplicarTodasLasSecciones = opts => { optsRecibidas = opts; return { ok: true, resultados: [] }; };
  assert.equal(c.Instalar_pVisual().ok, true);
  assert.equal(optsRecibidas.forzar, true);
  assert.deepEqual(Array.from(Object.keys(optsRecibidas)).sort(), ['forzar']);
});
test('SAS-025: HVis_yaFormateada devuelve false si falta la sección OBSERVACIONES', () => {
  const c = backend();
  const incompleta = sectorMigrada('SECTOR_NARANJO', 'NARANJO', false);
  assert.equal(c.HVis_yaFormateada(incompleta), false, 'migrada sin OBSERVACIONES → false');
  const completa = sectorMigrada('SECTOR_NARANJO', 'NARANJO', true);
  assert.equal(c.HVis_yaFormateada(completa), true, 'canónica completa → true');
});
test('SAS-025: hoja completa usa fast-path sin reescribir y forzar la reformatea', () => {
  const c = backend();
  const hoja = sectorMigrada('SECTOR_NARANJO', 'NARANJO', true);
  const r = c.HVis_normalizarLayout(hoja);
  assert.equal(r.fast, true);
  assert.equal(r.secciones, 4);
  assert.equal(hoja._ops.filter(o => o[0] === 'setValues').length, 0, 'fast-path no reescribe');
  const rf = c.HVis_normalizarLayout(hoja, { forzar: true });
  assert.equal(rf.fast, undefined);
  assert.ok(hoja._ops.some(o => o[0] === 'setValues'), 'forzar reescribe filas');
  assert.equal(rf.secciones, 4);
});
test('SAS-025: HVis_pendientesVisual detecta la ÚLTIMA columna de una sección multicolumna', () => {
  const c = backend();
  const sector = 'NARANJO';
  const nombre = 'SECTOR_NARANJO';
  const hoja = sectorMigrada(nombre, sector, true);
  const rampa = ctxExpr(c, 'PALETA_SECCION')[sector].seccion;
  const secciones = c.HVis_obtenerSecciones(nombre);
  const plan = c.HVis_calcularPlan(nombre, secciones, c.HVis_mapaColumnas(hoja.getRange(3, 1, 1, 16).getValues()[0]));
  hoja.getRange(1, 1).setBackground(ctxExpr(c, 'COLORES_SECTOR')[sector]);
  hoja.getRange(1, 1).setFontColor(ctxExpr(c, 'TINTA_SECCION'));
  hoja.getRange(1, 1).setFontSize(ctxExpr(c, 'PULIDO_BARRAS').titulo);
  hoja.setRowHeight(1, ctxExpr(c, 'DESIGN_SYSTEM').ALTURAS.barra);
  plan.secciones.forEach((sec, ix) => {
    const color = rampa[ix % rampa.length];
    for (let col = sec.colInicio; col <= sec.colFin; col++) {
      hoja.getRange(2, col).setBackground(col === 15 ? '#000000' : color);
    }
  });
  hoja.setRowHeight(2, ctxExpr(c, 'DESIGN_SYSTEM').ALTURAS.seccion);
  for (let col = 1; col <= 16; col++) {
    hoja.getRange(3, col).setBackground(ctxExpr(c, 'PULIDO_ENCABEZADO').fondo);
    hoja.getRange(3, col).setFontColor(ctxExpr(c, 'PULIDO_ENCABEZADO').tinta);
    hoja.getRange(3, col).setFontWeight('bold');
    hoja.getRange(3, col).setFontSize(ctxExpr(c, 'PULIDO_ENCABEZADO').fuente);
  }
  hoja.setRowHeight(3, ctxExpr(c, 'PULIDO_ENCABEZADO').alturaVisual);
  const r = c.HVis_pendientesVisual(hoja);
  assert.ok(r.pendientes.length >= 1, 'debe reportar pendientes: ' + JSON.stringify(r.pendientes));
  assert.ok(r.pendientes.some(m => m.indexOf('cols 15') !== -1),
    'debe detectar la col 15 aunque la 12 sea correcta: ' + JSON.stringify(r.pendientes));
  // y NO debe reportar un falso positivo por col 12/13/14 (correctas)
  assert.ok(!r.pendientes.some(m => /cols.*(1[2-4])/.test(m)), JSON.stringify(r.pendientes));
});
test('SAS-025: aplicar forzar dos veces es idempotente (sin duplicar filas/secciones/datos)', () => {
  const c = backend();
  const hoja = sectorMigrada('SECTOR_NARANJO', 'NARANJO', false);
  const datosAntes = JSON.stringify(hoja.getRange(4, 1, 1, 16).getValues()[0]);
  const r1 = c.HVis_aplicarSecciones(hoja, { forzar: true });
  assert.equal(r1.ok, true);
  assert.equal(r1.insertadas || 0, 0);
  assert.equal(r1.borradas || 0, 0);
  const fila2_1 = hoja.getRange(2, 1, 1, 16).getValues()[0];
  const r2 = c.HVis_aplicarSecciones(hoja, { forzar: true });
  assert.equal(r2.ok, true);
  assert.equal(r2.insertadas || 0, 0);
  assert.equal(r2.borradas || 0, 0);
  assert.deepEqual(hoja.getRange(2, 1, 1, 16).getValues()[0], fila2_1);
  assert.equal(JSON.stringify(hoja.getRange(4, 1, 1, 16).getValues()[0]), datosAntes);
  // 2 ejecuciones × (1 merge título + 4 merges de sección) = 10 merges, sin duplicar.
  assert.equal(hoja._ops.filter(o => o[0] === 'merge').length, 10);
  assert.equal(hoja._ops.filter(o => o[0] === 'insertBefore').length, 0);
  assert.equal(hoja._ops.filter(o => o[0] === 'deleteRows').length, 0);
});
test('La coloración de RUT informa el fallo de una hoja sin ocultarlo', () => {
  const c = backend();
  const hoja = { getLastRow: () => 4, getRange: () => { throw Error('FORMATO_RUT_SIMULADO'); } };
  c.SpreadsheetApp = { getActiveSpreadsheet: () => ({
    getSheetByName: nombre => nombre === 'INGRESO_VERDE' ? hoja : null
  }) };
  const r = c.Hojas_colorearRutIngresos();
  assert.equal(r.coloreadas, 0);
  assert.match(r.fallidas.join('; '), /INGRESO_VERDE: FORMATO_RUT_SIMULADO/);
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
  c.Fuentes_preflightFuentes = () => ({ ok: true, fuentes: [], bloqueantes: [] });
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
  c.Fuentes_preflightFuentes = () => ({ ok: true, fuentes: [], bloqueantes: [] });
  c.Act_mergearPacientesDesdeStaging = () => ({ actualizados: 0, conflictos: 0 });
  c.Ingresos_procesarFilas = () => ({ resumen: {}, resultados: [], pacientesNuevos: [{}], eventos: [{}] });
  c.Modelo_asegurarEsquemaPacientes_ = () => ({ ok: false, motivo: 'prueba' });
  c.Modelo_agregarEventos_ = () => { eventos++; };
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
  /* Runtime común §28/§35: stub del wrapper de lectura (1 reintento en transporte). */
  vm.runInContext(`globalThis.ECICEP_lectura = function (nombre, args, ok, fail) {
    var run = google.script.run.withSuccessHandler(ok).withFailureHandler(fail);
    run[nombre].apply(run, args || []);
  };`, c);
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
