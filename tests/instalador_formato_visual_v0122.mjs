#!/usr/bin/env node
// v0.12.2 — contrato del instalador, formato declarativo e idempotencia visual.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(new URL('../src/', import.meta.url)).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(read('src/' + f), c, { filename: f });
const E = expr => vm.runInContext(expr, c);
let n = 0;
function ok(nombre) { n++; console.log('[PASS] T' + n + ' ' + nombre); }
function funcionFuente(src, nombre) {
  const ini = src.indexOf('function ' + nombre + '('); assert.ok(ini >= 0, nombre);
  let llave = src.indexOf('{', ini), nivel = 0;
  for (let i = llave; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}' && --nivel === 0) return src.slice(ini, i + 1);
  }
  throw new Error('función incompleta: ' + nombre);
}
const cfg = read('src/00_Config.js'), modelo = read('src/06_Modelo.js');
const hojas = read('src/17_Hojas.js'), ux = read('src/34_LibroUX.js');
const presentacion = read('src/35_Presentacion.js'), html = read('src/Instalador.html');

// 1. Hoja correcta = cero escrituras (anchos).
let escrituras = 0;
const etiquetas = ['ID_EVENTO', 'RUT', 'FECHA_EVENTO'];
const hojaCorrecta = {
  getName: () => 'EVENTOS', getLastRow: () => 1, getLastColumn: () => etiquetas.length,
  getRange: () => ({ getValues: () => [etiquetas] }),
  getColumnWidth: i => c.Modelo_anchoColumna(etiquetas[i - 1]),
  setColumnWidth: () => { escrituras++; }
};
c._modelo_anchosHoja(hojaCorrecta); assert.equal(escrituras, 0); ok('hoja correcta no reescribe anchos');

// 2–8. Contrato canónico por nombre real.
assert.equal(c.Formato_especificacionCampo_('RUT').formato, '@'); ok('RUT se conserva como texto');
assert.equal(c.Formato_especificacionCampo_('TELEFONO(S)').formato, '@'); ok('teléfono se conserva como texto');
assert.equal(c.Formato_especificacionCampo_('FECHA_EVENTO').formato, 'dd/MM/yyyy'); ok('fecha usa dd/MM/yyyy');
assert.equal(c.Formato_especificacionCampo_('FECHA_REGISTRO').formato, 'dd/MM/yyyy HH:mm'); ok('fecha-hora usa dd/MM/yyyy HH:mm');
const obs = c.Formato_especificacionCampo_('OBSERVACIONES'); assert.equal(obs.wrap, true); assert.equal(obs.alineacion, 'LEFT'); ok('observaciones envuelven y alinean a la izquierda');
assert.equal(c.Formato_especificacionCampo_('ESTADO_INGRESO').alineacion, 'CENTER'); ok('estado queda centrado y editable');
assert.equal(c.Modelo_anchoColumna('PROXIMO_CONTROL'), 115); assert.equal(c.Modelo_anchoColumna('NOMBRE'), 220); ok('anchos se resuelven por nombre');

// 9. Las puertas tienen un único owner de validaciones.
const fVal = funcionFuente(ux, 'Hojas_aplicarValidaciones_');
assert.doesNotMatch(fVal, /Object\.keys\(HOJAS_INGRESO\)/);
assert.match(modelo, /function Modelo_validarIngresos\(ss, opciones\)/); ok('validaciones INGRESO no se duplican');

// 10. Formato acotado al uso + buffer, nunca toda la hoja.
const acotada = { getMaxRows: () => 1000, getLastRow: () => 10 };
assert.equal(c.Hojas_filasGestionadas_(acotada, 'EVENTOS', { buffer: 20 }), 29); ok('rango gestionado acota filas y buffer');

// 11. Notas por bloque.
assert.match(funcionFuente(ux, 'Hojas_aplicarNotas_'), /setNotes\(\[deseadas\]\)/); ok('notas de encabezado se escriben en batch');

// 12. Reglas condicionales equivalentes se omiten.
function regla(formula, fondo) {
  const rango = { getA1Notation: () => 'A2:A20', getSheet: () => ({ getName: () => 'EVENTOS' }) };
  const condicion = {
    getCriteriaType: () => 'CUSTOM_FORMULA', getCriteriaValues: () => [formula],
    getBackground: () => fondo, getFontColor: () => '', getBold: () => false,
    getItalic: () => false, getStrikethrough: () => false, getUnderline: () => false
  };
  return { getBooleanCondition: () => condicion, getRanges: () => [rango] };
}
assert.equal(c.Hojas_reglasCondicionalesCoinciden_([regla('=$A2="X"', '#fff')], [regla('=$A2="X"', '#fff')]), true);
assert.equal(c.Hojas_reglasCondicionalesCoinciden_([regla('=$A2="X"', '#fff')], [regla('=$A2="Y"', '#fff')]), false); ok('firma omite reglas condicionales equivalentes');

// 13. Orden contractual ya correcto = cero movimientos.
const nombres = Array.from(c.Hojas_ordenObjetivo_());
const sheets = nombres.map(nombre => ({ getName: () => nombre, isSheetHidden: () => false }));
let movimientos = 0;
const libroOrdenado = { getActiveSheet: () => sheets[0], getSheets: () => sheets,
  getSheetByName: nombre => sheets.find(s => s.getName() === nombre) || null,
  setActiveSheet: () => {}, moveActiveSheet: () => { movimientos++; } };
assert.equal(c.Hojas_ordenar_(libroOrdenado).ordenadas, 0); assert.equal(movimientos, 0); ok('orden correcto no mueve pestañas');

// 14. Las protecciones manuales no pertenecen al sistema.
assert.equal(c.Hojas_esProteccionEcicep_({ getDescription: () => 'ADMIN: no editar' }), false);
assert.equal(c.Hojas_esProteccionEcicep_({ getDescription: () => 'ECICEP:generada' }), true); ok('protección manual se preserva');

// 15. INICIO: owner y secuencia unlock → escritura → freeze final; Modelo no congela.
const inicioSrc = funcionFuente(ux, 'Inicio_construir_');
const iUnlock = inicioSrc.indexOf('h.setFrozenRows(0)'), iWrite = inicioSrc.indexOf("h.getRange('A1:X2')"), iFreeze = inicioSrc.lastIndexOf('h.setFrozenRows(2)');
assert.ok(iUnlock >= 0 && iUnlock < iWrite && iWrite < iFreeze);
const aplicarSrc = funcionFuente(modelo, 'Modelo_aplicarDiseno'); assert.match(aplicarSrc, /h\.getName\(\) !== 'INICIO'/); ok('INICIO conserva unlock→write→freeze 2/0 sin owner duplicado');

// 16. INICIO vigente usa fingerprint y no reconstruye.
const props = new Map();
c.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props.get(k) || '', setProperty: (k,v) => props.set(k,v), deleteProperty: k => props.delete(k) }) };
props.set(c.INICIO_LAYOUT_PROP, JSON.stringify({ version: c.INICIO_LAYOUT_VERSION, fingerprint: c.Inicio_fingerprintEsperado_() }));
const titulo = 'ECICEP                                            v' + E('ECICEP.VERSION') + ' · Build ' + (c.ECICEP_BUILD.commit || 'dev');
let mutacionesInicio = 0;
const hi = { getFrozenRows: () => 2, getFrozenColumns: () => 0, getTabColor: () => E('DESIGN_SYSTEM.MARCA.sistemaProfundo'),
  getRange: a1 => ({ getValue: () => a1 === 'A1' ? titulo : '', getFormula: () => a1 === 'A8' ? '=HYPERLINK("x";"CAPTURA")' : '', setValue: () => { mutacionesInicio++; } }),
  setTabColor: () => { mutacionesInicio++; } };
c.Inicio_refrescarSiNecesario_ = () => ({ ok: true, omitida: true });
const vigente = c.Inicio_construir_({ getSheetByName: () => hi });
assert.equal(vigente.omitida, true); assert.equal(mutacionesInicio, 0); ok('INICIO vigente no se reconstruye');

// 17. Retry conserva ejecución/cursor/respaldo.
const retry = funcionFuente(html, 'reintentarUltimoError');
assert.doesNotMatch(retry, /_EJEC\s*=/); assert.match(retry, /llamarPresentacion\(er\.etapa,er\.ix,false\)/); ok('retry conserva la ejecución y la subtarea');

// 18. Advertencia no equivale a error.
const adv = vm.runInNewContext('(' + funcionFuente(html, 'respuestaEsAdvertencia') + ')');
assert.equal(adv({ estado: 'ADVERTENCIA' }), true); assert.equal(adv({ ok: false, estado: 'ERROR' }), false); ok('advertencia se clasifica separada del error');

// 19. El motor visual no escribe valores clínicos.
assert.doesNotMatch(presentacion, /\.setValues?\s*\(/); assert.doesNotMatch(presentacion, /\.clear(Content)?\s*\(/); ok('presentación no altera datos clínicos');

// 20. Versión/layout correctos y esquema estable.
assert.equal(E('ECICEP.VERSION'), '0.12.2'); assert.equal(E('SISTEMA_VERSION_SCHEMA_ACTUAL'), 2);
assert.equal(E('HOJAS_UX.INICIO.frozenRows'), 2); assert.equal(E('HOJAS_UX.INICIO.frozenColumns'), 0); ok('v0.12.2 conserva schema 2 e INICIO 2/0');

assert.equal(n, 20);
console.log('Instalador y formato visual v0.12.2 — 20/20 PASS');
