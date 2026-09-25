#!/usr/bin/env node
// v0.14.0 — Presupuesto de llamadas del constructor de INICIO.
// El tiempo de ejecución de Apps Script es un límite DURO por RPC: la portada
// se construye dentro de una subtarea del plan de presentación. Este suite
// cuenta las llamadas a la API de Sheets que emite Inicio_construir_ con un
// doble instrumentado y fija un techo, de modo que una zona visual nueva no
// pueda volver a empujar la portada fuera del presupuesto (regresión 2026-09-25:
// "Se excedió el tiempo de ejecución" y la hoja INICIO sin cambios).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// --- Doble de la API de Sheets con conteo de llamadas -------------------------
const conteo = new Map();
const METODOS_RANGO = ['merge', 'unmerge', 'setValue', 'setValues', 'setFormula', 'setFormulaR1C1',
  'setBackground', 'setBackgrounds', 'setFontColor', 'setFontColors', 'setFontFamily', 'setFontFamilies',
  'setFontWeight', 'setFontWeights', 'setFontSize', 'setFontSizes', 'setHorizontalAlignment',
  'setHorizontalAlignments', 'setVerticalAlignment', 'setVerticalAlignments', 'setBorder', 'setWrap',
  'setNumberFormat', 'setNumberFormats', 'setNote', 'clear', 'clearContent', 'clearFormat', 'breakApart',
  'getValue', 'getValues', 'getFormula', 'getBackground', 'getBackgrounds', 'getMergedRanges',
  'getFontColor', 'getFontSize', 'getFontWeight', 'getHorizontalAlignment', 'getVerticalAlignment',
  'getRowHeight', 'getColumnWidth', 'getDataValidation'];
const METODOS_HOJA = ['getRange', 'getRangeList', 'setColumnWidth', 'setRowHeight', 'setFrozenRows',
  'setFrozenColumns', 'getFrozenRows', 'getFrozenColumns', 'getMaxRows', 'getMaxColumns', 'getLastRow',
  'getLastColumn', 'insertRowsAfter', 'insertColumnsAfter', 'showRows', 'showColumns', 'setTabColor',
  'getTabColor', 'setConditionalFormatRules', 'getConditionalFormatRules', 'clear', 'setName', 'getName',
  'getDataRange', 'getRangeList', 'setHiddenGridlines', 'showSheet', 'hideSheet',
  'autoResizeColumns', 'setHiddenGridlines', 'setRowHeights', 'setColumnWidths',
  'getRowHeights', 'getColumnWidths'];
function dobleRango() {
  const r = {};
  for (const m of METODOS_RANGO) r[m] = function () {
    conteo.set(m, (conteo.get(m) || 0) + 1);
    if (m === 'getValue' || m === 'getFormula') return '';
    if (m === 'getBackground') return '#FFFFFF';
    if (m === 'getBackgrounds') return [];
    if (m === 'getMergedRanges') return [];
    if (m === 'getValues') return [[]];
    if (m === 'getRowHeight' || m === 'getColumnWidth') return 38;
    if (m === 'breakApart') return undefined;
    return r;
  };
  return r;
}
const hoja = {};
for (const m of METODOS_HOJA) hoja[m] = function () {
  conteo.set(m, (conteo.get(m) || 0) + 1);
  if (m === 'getMaxRows') return 38;
  if (m === 'getMaxColumns') return 30;
  if (m === 'getFrozenRows') return 2;
  if (m === 'getFrozenColumns') return 0;
  if (m === 'getTabColor') return '#0B3C49';
  if (m === 'getDataRange' || m === 'getRangeList') return dobleRango();
  return dobleRango();
};
const ss = {
  getSheetByName: () => hoja,
  getSheets: () => [hoja],
  insertSheet: () => hoja,
  getActiveSheet: () => hoja
};
const props = new Map();
const c = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  SpreadsheetApp: { BorderStyle: { SOLID: 'SOLID' }, getUi: () => null, flush: () => {} },
  Utilities: { formatDate: () => '01-01-2026 00:00', sleep: () => {} },
  PropertiesService: { getScriptProperties: () => null }
});
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
c.Modelo_ss = () => ss;
c.Libro_propiedades_ = () => ({
  getProperty: k => (props.has(k) ? props.get(k) : null),
  setProperty: (k, v) => { props.set(k, v); },
  deleteProperty: k => { props.delete(k); }
});
c.Libro_limpiarDirty_ = () => {};
c.Libro_estaDirty_ = () => false;
c.ECICEP = { VERSION: '0.13.0', TZ: 'America/Santiago' };
c.WebApp_urlVista_ = () => '#vista';
c.WebApp_urlCaptura_ = () => '#captura';
c.Inicio_calcularMetricas_ = () => ({
  fecha: '2026-09-25T12:00:00.000Z', stale: false, pacientes: 12, eventos: 34,
  revision: 2, vencidos: 1, porVencer: 3, sinProximaAtencion: 1, pendientesIngreso: 2,
  rutInvalidos: 0, ultimaAuditoria: '2026-09-24T12:00:00.000Z', ultimoBackup: '2026-09-24T13:00:00.000Z',
  salud: { estado: 'OK', datos: { ok: true }, integridad: { ok: true } },
  sectores: {
    NARANJO: { pacientes: 5, pendientesIngreso: 1, revision: 1, proximaAtencion: 1 },
    AMARILLO: { pacientes: 4, pendientesIngreso: 1, revision: 1, proximaAtencion: 1 },
    VERDE: { pacientes: 3, pendientesIngreso: 0, revision: 0, proximaAtencion: 1 }
  }
});
c.Inicio_verificar_ = () => ({ ok: true, fallos: [] });

// --- T1: el constructor completo cabe en el presupuesto de llamadas ---------
// Presupuesto de SERVIDOR: getRange/getRangeList solo devuelven handles locales
// y no representan un RPC a Sheets; el límite duro de la MÁQUINA es por llamada
// a la API que toca la hoja.
const contadorServidor = () => [...conteo.entries()]
  .filter(([k]) => k !== 'getRange' && k !== 'getRangeList')
  .reduce((a, [, v]) => a + v, 0);
conteo.clear();
const r = c.Inicio_construir_(ss, { forzar: true });
assert.equal(r.ok, true, 'la portada se construye');
const totalServer = contadorServidor();
const detalle = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([k, v]) => k + '=' + v).join(' ');
assert.ok(totalServer <= 260, 'presupuesto de RPC del constructor (server=' + totalServer + '; ' + detalle + ')');
ok('T1 Inicio_construir_ emite ' + totalServer + ' RPC de servidor (techo 260; antes ~720)');

// --- T2: las escrituras costosas van agrupadas, no celda por celda -----------
const settersPorCelda = ['setValue', 'setValues', 'setFormula', 'setBackground', 'setBackgrounds',
  'setFontColor', 'setFontColors', 'setFontWeight', 'setFontWeights', 'setFontSize', 'setFontSizes',
  'setHorizontalAlignment', 'setHorizontalAlignments', 'setVerticalAlignment', 'setVerticalAlignments',
  'setBorder', 'setWrap'];
const setters = settersPorCelda.reduce((a, k) => a + (conteo.get(k) || 0), 0);
assert.ok(setters <= 150, 'estilos y valores agrupados (setters=' + setters + ')');
assert.equal(conteo.get('setRowHeights') || 0, 1, '34 alturas en UNA llamada');
assert.equal(conteo.get('setColumnWidths') || 0, 1, '30 anchos en UNA llamada');
assert.equal(conteo.get('setRowHeight') || 0, 0, 'sin bucle por fila');
assert.equal(conteo.get('setColumnWidth') || 0, 0, 'sin bucle por columna');
ok('T2 estilos/valores agrupados: ' + setters + ' llamadas y dimensiones en 2 (techo 150)');

// --- T3: los merges del panel se crean todos y una sola vez ------------------
assert.equal(conteo.get('merge'), 72, '72 merges del contrato PANEL_OPERATIVO_V014');
ok('T3 los 72 merges del panel se crean explícitamente');

// --- T4: reconstruir dos veces seguidas también cabe en el presupuesto --------
conteo.clear();
c.Hojas_crearInicio = () => c.Inicio_construir_(ss, { forzar: true });
c.Hojas_crearInicio();
const reconstrucciones = contadorServidor();
assert.ok(reconstrucciones <= 260, 'segunda reconstrucción dentro del techo (' + reconstrucciones + ')');
ok('T4 reconstrucción completa repetida: ' + reconstrucciones + ' RPC (techo 260)');

console.log('Inicio rendimiento v0.14 — ' + n + '/' + n + ' PASS');
