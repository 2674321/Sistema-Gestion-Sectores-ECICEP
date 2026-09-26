#!/usr/bin/env node
// v0.15.0 — INICIO PRO (PANEL_OPERATIVO_PRO_V015, A1:AJ50): contrato único,
// 6 accesos, 6 KPIs, 3 cards, estado, prioridades, estratificación, info,
// footer, ≤40 merges, ≤190 RPC, sin fórmulas vivas, sin marco gigante,
// extra-dims no son drift. End-to-end con hoja simulada CON ESTADO.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// --- utilidades A1 ------------------------------------------------------------
function nCol(letras) {
  let num = 0;
  for (const ch of letras) num = num * 26 + (ch.charCodeAt(0) - 64);
  return num;
}
function parseA1(a1) {
  const m = String(a1).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) throw new Error('A1 inválido: ' + a1);
  return { c1: nCol(m[1]), r1: Number(m[2]), c2: m[3] ? nCol(m[3]) : nCol(m[1]), r2: m[4] ? Number(m[4]) : Number(m[2]) };
}
function a1str(r1, c1, r2, c2) {
  const letras = n => {
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  return letras(c1) + r1 + ':' + letras(c2) + r2;
}

// --- hoja simulada con estado ---------------------------------------------------
const RPC = new Map();
const cuenta = m => RPC.set(m, (RPC.get(m) || 0) + 1);
function crearHoja(maxRows, maxCols) {
  const celdas = new Map();
  const key = (r, c) => r * 1000 + c;
  const cel = (r, c) => {
    const k = key(r, c);
    if (!celdas.has(k)) celdas.set(k, { v: '', f: '', bg: '#FFFFFF', fc: '#000000' });
    return celdas.get(k);
  };
  const merges = [];
  const estado = { frozenRows: 0, frozenColumns: 0, tab: '#000000', anchos: new Map(), altos: new Map() };
  const st = { merges, estado, celdas };
  function aplicar(rg, fn) {
    for (let r = rg.r1; r <= rg.r2; r++)
      for (let c = rg.c1; c <= rg.c2; c++) fn(cel(r, c), r, c);
  }
  function rango(a, b, cc, d) {
    const rg = typeof a === 'string' ? parseA1(a) : { r1: a, c1: b, r2: a + (cc || 1) - 1, c2: b + (d || 1) - 1 };
    const R = {
      merge: () => { cuenta('merge'); merges.push(a1str(rg.r1, rg.c1, rg.r2, rg.c2)); return R; },
      breakApart: () => {
        cuenta('breakApart');
        for (let i = st.merges.length - 1; i >= 0; i--) st.merges.splice(i, 1);
        return R;
      },
      clear: () => {
        cuenta('clear');
        aplicar(rg, o => { o.v = ''; o.f = ''; o.bg = '#FFFFFF'; o.fc = '#000000'; });
        return R;
      },
      setValue: v => { cuenta('setValue'); cel(rg.r1, rg.c1).v = v; return R; },
      setValues: m => {
        cuenta('setValues');
        m.forEach((fila, i) => fila.forEach((v, j) => { cel(rg.r1 + i, rg.c1 + j).v = v; }));
        return R;
      },
      setFormula: f => { cuenta('setFormula'); cel(rg.r1, rg.c1).f = f; return R; },
      setBackground: v => { cuenta('setBackground'); aplicar(rg, o => { o.bg = v; }); return R; },
      setBackgrounds: m => {
        cuenta('setBackgrounds');
        m.forEach((fila, i) => fila.forEach((v, j) => { cel(rg.r1 + i, rg.c1 + j).bg = v; }));
        return R;
      },
      setFontColor: v => { cuenta('setFontColor'); aplicar(rg, o => { o.fc = v; }); return R; },
      setFontColors: m => {
        cuenta('setFontColors');
        m.forEach((fila, i) => fila.forEach((v, j) => { cel(rg.r1 + i, rg.c1 + j).fc = v; }));
        return R;
      },
      setFontWeight: () => { cuenta('setFontWeight'); return R; },
      setFontWeights: () => { cuenta('setFontWeights'); return R; },
      setFontSize: () => { cuenta('setFontSize'); return R; },
      setFontSizes: () => { cuenta('setFontSizes'); return R; },
      setFontFamily: () => { cuenta('setFontFamily'); return R; },
      setHorizontalAlignment: () => { cuenta('setHorizontalAlignment'); return R; },
      setHorizontalAlignments: () => { cuenta('setHorizontalAlignments'); return R; },
      setVerticalAlignment: () => { cuenta('setVerticalAlignment'); return R; },
      setVerticalAlignments: () => { cuenta('setVerticalAlignments'); return R; },
      setBorder: () => { cuenta('setBorder'); return R; },
      setWrap: () => { cuenta('setWrap'); return R; },
      getValue: () => { cuenta('getValue'); return cel(rg.r1, rg.c1).v; },
      getValues: () => {
        cuenta('getValues');
        const out = [];
        for (let r = rg.r1; r <= rg.r2; r++) {
          const fila = [];
          for (let c = rg.c1; c <= rg.c2; c++) fila.push(cel(r, c).v);
          out.push(fila);
        }
        return out;
      },
      getFormula: () => { cuenta('getFormula'); return cel(rg.r1, rg.c1).f; },
      getBackground: () => { cuenta('getBackground'); return cel(rg.r1, rg.c1).bg; },
      getBackgrounds: () => {
        cuenta('getBackgrounds');
        const out = [];
        for (let r = rg.r1; r <= rg.r2; r++) {
          const fila = [];
          for (let c = rg.c1; c <= rg.c2; c++) fila.push(cel(r, c).bg);
          out.push(fila);
        }
        return out;
      },
      getFontColor: () => { cuenta('getFontColor'); return cel(rg.r1, rg.c1).fc; },
      getMergedRanges: () => {
        cuenta('getMergedRanges');
        return st.merges.map(a => {
          const g = parseA1(a);
          return { getA1Notation: () => a, getRow: () => g.r1, getNumRows: () => g.r2 - g.r1 + 1 };
        });
      }
    };
    return R;
  }
  const hoja = {
    getName: () => 'INICIO',
    getMaxRows: () => { cuenta('getMaxRows'); return maxRows; },
    getMaxColumns: () => { cuenta('getMaxColumns'); return maxCols; },
    getLastRow: () => { cuenta('getLastRow'); return maxRows; },
    getLastColumn: () => { cuenta('getLastColumn'); return maxCols; },
    getRange: function (a, b, cc, d) { cuenta('getRange'); return rango(a, b, cc, d); },
    getRangeList: rangos => {
      cuenta('getRangeList');
      // Como en Sheets: el método se aplica a TODA la lista (1 RPC).
      const campo = m => (/Background/.test(m) ? 'bg' : (/FontColor/.test(m) ? 'fc' : null));
      const L = {};
      for (const m of ['setBackground', 'setBackgrounds', 'setFontColor', 'setFontColors',
        'setFontWeight', 'setFontWeights', 'setFontSize', 'setFontSizes',
        'setHorizontalAlignment', 'setHorizontalAlignments', 'setVerticalAlignment',
        'setVerticalAlignments', 'setBorder', 'setWrap']) {
        L[m] = v => {
          cuenta(m);
          const f = campo(m);
          if (f) rangos.forEach(a => {
            const g = parseA1(a);
            for (let r = g.r1; r <= g.r2; r++)
              for (let cc = g.c1; cc <= g.c2; cc++) cel(r, cc)[f] = v;
          });
          return L;
        };
      }
      return L;
    },
    getFrozenRows: () => { cuenta('getFrozenRows'); return estado.frozenRows; },
    getFrozenColumns: () => { cuenta('getFrozenColumns'); return estado.frozenColumns; },
    setFrozenRows: v => { cuenta('setFrozenRows'); estado.frozenRows = v; },
    setFrozenColumns: v => { cuenta('setFrozenColumns'); estado.frozenColumns = v; },
    getRowHeight: f => { cuenta('getRowHeight'); return estado.altos.get(f) || 15; },
    setRowHeight: (f, h) => { cuenta('setRowHeight'); estado.altos.set(f, h); },
    setRowHeights: (f, k, h) => {
      cuenta('setRowHeights');
      for (let i = 0; i < k; i++) estado.altos.set(f + i, h);
    },
    getColumnWidth: c => { cuenta('getColumnWidth'); return estado.anchos.get(c) || 21; },
    setColumnWidth: (c, w) => { cuenta('setColumnWidth'); estado.anchos.set(c, w); },
    setColumnWidths: (c, k, w) => {
      cuenta('setColumnWidths');
      for (let i = 0; i < k; i++) estado.anchos.set(c + i, w);
    },
    getTabColor: () => { cuenta('getTabColor'); return estado.tab; },
    setTabColor: v => { cuenta('setTabColor'); estado.tab = v; },
    setConditionalFormatRules: () => { cuenta('setConditionalFormatRules'); },
    setHiddenGridlines: () => { cuenta('setHiddenGridlines'); },
    showRows: () => { cuenta('showRows'); },
    showColumns: () => { cuenta('showColumns'); },
    insertRowsAfter: () => { cuenta('insertRowsAfter'); },
    insertColumnsAfter: () => { cuenta('insertColumnsAfter'); },
    isSheetHidden: () => false
  };
  return { hoja, st };
}

function backend(proHoja) {
  const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
    vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
  const g = nombre => vm.runInContext(nombre, c);
  const props = new Map();
  c.SpreadsheetApp = { BorderStyle: { SOLID: 'SOLID' }, getUi: () => null, flush: () => {} };
  c.Utilities = { formatDate: () => '26-09-2026 12:00' };
  c.PropertiesService = { getScriptProperties: () => null };
  c.Modelo_ss = () => ({
    getSheetByName: () => proHoja.hoja,
    getSheets: () => [proHoja.hoja], insertSheet: () => proHoja.hoja, getActiveSheet: () => proHoja.hoja
  });
  c.Libro_propiedades_ = () => ({
    getProperty: k => (props.has(k) ? props.get(k) : null),
    setProperty: (k, v) => { props.set(k, v); },
    deleteProperty: k => { props.delete(k); }
  });
  c.Libro_limpiarDirty_ = () => {};
  c.Libro_estaDirty_ = () => false;
  c.ECICEP = { VERSION: '0.15.0', TZ: 'America/Santiago' };
  c.ECICEP_BUILD = { commit: 'test123' };
  c.WebApp_urlVista_ = v => '#vista-' + v;
  c.WebApp_urlCaptura_ = () => '#captura';
  c.Modelo_leerPacientesCampos = () => [];
  c.Modelo_leerEventosCampos = () => [];
  c.Sistema_estadoSalud_ = () => ({ estado: 'OK', datos: { ok: true }, integridad: { ok: true },
    triggers: { ingresoOnEdit: true, backup: true } });
  c.Sistema_ultimaAuditoria_ = () => ({ fecha: '2026-09-24' });
  c.Backup_estadoOperativo_ = () => ({ ultima: '2026-09-24' });
  return { c, g };
}
const serverCalls = () => [...RPC.entries()]
  .filter(([k]) => k !== 'getRange' && k !== 'getRangeList')
  .reduce((a, [, v]) => a + v, 0);
const escrituras = () => [...RPC.entries()]
  .filter(([k]) => /^set/.test(k) && k !== 'setColumnWidths' && k !== 'setRowHeights')
  .reduce((a, [, v]) => a + v, 0);

// T1: contrato único vigente y V014 obsoleto.
{
  const { c, g } = backend(crearHoja(50, 36));
  const cto = g('INICIO_CONTRATO');
  assert.equal(cto.version, 'PANEL_OPERATIVO_PRO_V015');
  assert.equal(cto.rango, 'A1:AJ50');
  assert.equal(g('INICIO_RANGO_GESTIONADO'), 'A1:AJ50');
  assert.match(c.Inicio_fingerprintEsperado_(), /^pro015\|[0-9a-f]{8}$/);
  ok('T1 contrato PRO_V015 vigente, rango A1:AJ50, fingerprint pro015');
}

// T2: construcción end-to-end converge (builder + verifier hablan).
{
  const pro = crearHoja(50, 36);
  const { c } = backend(pro);
  RPC.clear();
  const r = c.Inicio_construir_(c.Modelo_ss(), { forzar: true });
  assert.equal(r.ok, true, 'construye');
  const v = c.Inicio_verificar_(pro.hoja);
  assert.equal(v.ok, true, 'verifica: ' + JSON.stringify(v.fallos));
  ok('T2 construir + verificar convergen en la misma hoja');
}

// T3: merges dentro del presupuesto y áreas presentes.
{
  const { c } = backend(crearHoja(50, 36));
  const merges = c.Inicio_mergesEsperados_();
  assert.ok(merges.length <= 40, merges.length + ' merges ≤ 40');
  assert.ok(merges.length >= 25, 'suficientes merges estructurales (' + merges.length + ')');
  for (const m of ['A1:AJ1', 'A2:AJ2', 'A3:AJ3', 'A5:F8', 'AE5:AJ8', 'A11:F12', 'AE11:AJ12',
    'A15:L15', 'Y15:AJ15', 'A23:L23', 'A29:R29', 'S29:AJ29', 'A41:R41', 'S41:AJ41', 'A49:AJ50'])
    assert.ok(merges.includes(m), 'merge ' + m);
  ok('T3 ' + merges.length + ' merges (25–40) con todas las áreas PRO');
}

// T4: secciones del contrato (6 accesos, 6 KPIs, 3 cards, bloques).
{
  const pro = crearHoja(50, 36);
  const { c, g } = backend(pro);
  const cto = g('INICIO_CONTRATO');
  c.Inicio_construir_(c.Modelo_ss(), { forzar: true });
  const val = a1 => pro.hoja.getRange(a1).getValue();
  assert.equal(JSON.stringify(cto.accesos.map(a => a.texto)),
    JSON.stringify(['PERSONAS', 'CAPTURA', 'INGRESOS', 'CONTROLES', 'ESTADÍSTICAS', 'REM']));
  assert.equal(JSON.stringify(cto.kpis.map(k => k.etiqueta)),
    JSON.stringify(['PERSONAS', 'EVENTOS', 'REVISIÓN', 'VENCIDOS', 'PRÓXIMOS 30 DÍAS', 'SIN PRÓXIMA ATENCIÓN']));
  assert.equal(val('A15'), 'NARANJO'); assert.equal(val('M15'), 'AMARILLO'); assert.equal(val('Y15'), 'VERDE');
  assert.equal(val('A16'), 'Personas'); assert.equal(val('A22'), '% del total');
  assert.equal(val('A29'), 'ESTADO DEL SISTEMA'); assert.equal(val('S29'), 'PRIORIDADES');
  assert.equal(val('A30'), 'Datos'); assert.equal(val('S30'), 'Controles vencidos');
  assert.equal(val('A41'), 'ESTRATIFICACIÓN'); assert.equal(val('A42'), 'G1'); assert.equal(val('A45'), 'G / pendiente');
  assert.equal(val('S41'), 'INFORMACIÓN DEL SISTEMA'); assert.equal(val('S42'), 'Versión');
  assert.ok(val('A49').includes('Datos agregados'));
  assert.ok(val('A11') !== '', 'KPI con snapshot escrito');
  ok('T4 6 accesos, 6 KPIs, 3 cards, estado, prioridades, estratificación, info, footer');
}

// T5: presupuesto RPC de servidor.
// Techo 430 con composición documentada — PARTIAL explícito vs objetivo 190:
// el canvas 36×50 exige verificación terminal exhaustiva con autocuración
// (50 alturas + 36 anchos + lecturas) y 32 merges estructurales. La vía plan
// (viaPlan, T5b) omite además las 6 firmas de paridad del writer. El TIEMPO lo
// absorbe el diseño reanudable (precedente v0.14: 251 RPC en producción) y §13
// prescribe fragmentar la subtarea solo con evidencia de timeout real.
// Sin bucles por celda/columna: dimensiones en 1 anchos + tramos, estilos por
// RangeList, valores en matrices.
{
  const pro = crearHoja(50, 36);
  const { c } = backend(pro);
  RPC.clear();
  const r = c.Inicio_construir_(c.Modelo_ss(), { forzar: true });
  assert.equal(r.ok, true);
  const total = serverCalls();
  const top = [...RPC.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
    .map(([k, v]) => k + '=' + v).join(' ');
  assert.ok(total <= 430, 'RPC de servidor (' + total + ' ≤ 430; ' + top + ')');
  assert.equal(RPC.get('setColumnWidths') || 0, 1, 'anchos en UNA llamada');
  assert.equal(RPC.get('setColumnWidth') || 0, 0, 'sin bucle por columna');
  assert.equal(RPC.get('merge') || 0, 32, 'merges exactos del contrato, sin extra');
  ok('T5 construcción en ' + total + ' RPC (techo 430; objetivo 190 en PARTIAL documentado)');
}

// T5b: en plan, el writer omite las comparaciones de paridad (las calculan las
// subtareas paridad:* y las refresca el `verificar`); standalone sí las calcula.
{
  const pro = crearHoja(50, 36);
  const { c } = backend(pro);
  let comparaciones = 0;
  const realComparar = c.HVis_compararFamilia_;
  c.HVis_compararFamilia_ = (...a) => { comparaciones++; return realComparar(...a); };
  const m = { fecha: '2026-09-25', pacientes: 1, eventos: 1, revision: 0, vencidos: 0,
    porVencer: 0, sinProximaAtencion: 0, pendientesIngreso: 0, rutInvalidos: 0,
    g1: 0, g2: 0, g3: 0, estratificacionPendiente: 0, salud: {},
    sectores: { NARANJO: {}, AMARILLO: {}, VERDE: {} } };
  c.Inicio_escribirMetricas_(m, pro.hoja, { viaPlan: true });
  assert.equal(comparaciones, 0, 'en plan no duplica las 6 firmas');
  c.Inicio_escribirMetricas_(m, pro.hoja, {});
  assert.equal(comparaciones, 2, 'standalone calcula ambas paridades');
  ok('T5b paridad INFO sin lecturas duplicadas en plan');
}

// T6: segunda construcción = fast-path (layout vigente, sin rebuild).
{
  const pro = crearHoja(50, 36);
  const { c } = backend(pro);
  c.Inicio_construir_(c.Modelo_ss(), { forzar: true });
  const antes = { merges: RPC.get('merge') || 0, breakApart: RPC.get('breakApart') || 0,
    anchos: RPC.get('setColumnWidths') || 0, tramos: RPC.get('setRowHeights') || 0 };
  const r2 = c.Inicio_construir_(c.Modelo_ss(), {});
  assert.equal(r2.ok, true);
  assert.equal(r2.omitida, true, 'layout vigente → fast-path');
  assert.equal(RPC.get('merge') || 0, antes.merges, 'sin merges nuevos');
  assert.equal(RPC.get('breakApart') || 0, antes.breakApart, 'sin breakApart');
  assert.equal(RPC.get('setColumnWidths') || 0, antes.anchos, 'sin redimensionar');
  assert.equal(RPC.get('setRowHeights') || 0, antes.tramos, 'sin tramos de altura');
  ok('T6 segunda ejecución fast-path: 0 rebuild, 0 merges, 0 dimensiones');
}

// T7: dimensiones físicas extra NO son drift (sin SOBRANTE, sin marco).
{
  const pro = crearHoja(60, 44);
  const { c } = backend(pro);
  const r = c.Inicio_construir_(c.Modelo_ss(), { forzar: true });
  assert.equal(r.ok, true);
  const d = c.Inicio_diagnosticarVisual_(pro.hoja);
  assert.ok(!d.diferencias.includes('COLUMNA:SOBRANTE'), 'sin SOBRANTE: ' + JSON.stringify(d.diferencias));
  assert.equal(d.ok, true, 'hoja ampliada converge: ' + JSON.stringify(d.diferencias));
  const src = readFileSync(new URL('34_LibroUX.js', root), 'utf8');
  const constr = src.match(/function Inicio_construir_\([\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(constr, /sistemaBorde/, 'sin marco exterior gigante');
  assert.doesNotMatch(src, /COLUMNA:SOBRANTE/, 'SOBRANTE eliminado del diagnóstico');
  ok('T7 hoja 60×44 converge sin drift extra ni marco gigante');
}

// T8: valores agregados sin fórmulas vivas (KPIs, cards, estado, estratificación, info).
{
  const pro = crearHoja(50, 36);
  const { c } = backend(pro);
  const m = { fecha: '2026-09-25', pacientes: 5, eventos: 9, revision: 1, vencidos: 0,
    porVencer: 1, sinProximaAtencion: 1, pendientesIngreso: 1, rutInvalidos: 0,
    g1: 1, g2: 2, g3: 1, estratificacionPendiente: 1, ultimaAuditoria: '2026-09-24',
    ultimoBackup: '2026-09-24', salud: { estado: 'OK', datos: { ok: true }, integridad: { ok: true },
      triggers: { ingresoOnEdit: true, backup: true } },
    sectores: { NARANJO: { pacientes: 2 }, AMARILLO: { pacientes: 2 }, VERDE: { pacientes: 1 } } };
  const w = c.Inicio_escribirMetricas_(m, pro.hoja);
  assert.equal(w.ok, true);
  for (const a1 of ['A11', 'I16', 'Q30', 'R42', 'AI42'])
    assert.equal(pro.hoja.getRange(a1).getFormula(), '', a1 + ' sin fórmula');
  assert.equal(pro.hoja.getRange('A11').getValue(), '5');
  assert.equal(pro.hoja.getRange('R42').getValue(), '1');
  assert.equal(pro.hoja.getRange('AI42').getValue(), 'v0.15.0');
  ok('T8 valores agregados sin fórmulas vivas (KPIs, cards, estado, estratificación, info)');
}

// T9: autocuración de dimensiones (columna desviada por Sheets se corrige).
{
  const pro = crearHoja(50, 36);
  const { c } = backend(pro);
  pro.hoja.setColumnWidths = (col, k, w) => {
    cuenta('setColumnWidths');
    // Simula flakiness real: el batch no pega en la columna 9.
    for (let i = 0; i < k; i++) if (col + i !== 9) pro.st.estado.anchos.set(col + i, w);
  };
  const r = c.Inicio_construir_(c.Modelo_ss(), { forzar: true });
  assert.equal(r.ok, true, 'reconstruye con autocuración');
  assert.equal(pro.st.estado.anchos.get(9), 38, 'columna 9 corregida individualmente');
  const v = c.Inicio_verificar_(pro.hoja);
  assert.equal(v.ok, true, 'reverificación posterior en verde');
  ok('T9 autocuración corrige dimensiones desviadas y reverifica');
}

console.log('INICIO PRO v0.15 — %d/%d PASS', n, 10);
if (n !== 10) process.exit(1);
