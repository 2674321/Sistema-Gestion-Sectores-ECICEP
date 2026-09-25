#!/usr/bin/env node
// Hotfix 0.12.1 — Presentación del libro por subtareas REANUDABLES.
// Cubre: plan y presupuesto, caché de cursor (null-safe), reanudación por
// RPC con {continuar:true}, fallo que NO persiste cursor, Instalar_pVisual
// sin fuerza global, fast-paths "cero escrituras" y literales del instalador.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = (m) => { n++; console.log('[PASS] ' + m); };
const L = (expr) => vm.runInContext(expr, c);
const DISENO = L('DESIGN_SYSTEM');
const fecha = c.Modelo_headerRow('EVENTOS') === 1 ? '' : '';

// --- T1: plan de la etapa diseno ---
const plan = c.PRESENTACION_SUBPLAN_DISENO;
assert.ok(Array.isArray(plan) && plan.length === 17, '17 subtareas (sin alias INGRESO_NARANJA)');
assert.equal(plan[0].id, 'base');
assert.equal(plan[16].id, 'verificar');
assert.deepEqual(Array.from(plan, t => t.id), [
  'base', 'formato:PACIENTES', 'formato:INGRESO_NARANJO',
  'formato:INGRESO_AMARILLO', 'formato:INGRESO_VERDE', 'formato:SECTOR_NARANJO',
  'formato:SECTOR_AMARILLO', 'formato:SECTOR_VERDE', 'formato:EVENTOS',
  'validaciones:extras', 'condicionales', 'notas', 'accesorios', 'inicio',
  'paridad:INGRESO', 'paridad:SECTOR', 'verificar'
]);
ok('T1 plan: 17 subtareas (una por hoja real, sin alias INGRESO_NARANJA), base primero y verificar al final');

// --- T2: presupuesto y reanudabilidad ---
assert.equal(c.PRESUPUESTO_PRESENTACION_MS, 20000);
ok('T2 presupuesto de presentación = 20000 ms');
assert.equal(c.Presentacion_esReanudable_('diseno'), true);
for (const id of ['visual', 'validaciones', 'inicio', 'estructura', ''])
  assert.equal(c.Presentacion_esReanudable_(id), false, id);
ok('T3 solo la etapa diseno es reanudable');

// --- T4: claves de caché ---
assert.equal(c.Presentacion_cacheClave_('INST-a12_B'), 'ECICEP_INST_PRES|INST-a12_B');
assert.equal(c.Presentacion_cacheClave_('x y/z'), 'ECICEP_INST_PRES|x_y_z');
assert.equal(c.Presentacion_cacheClave_(''), 'ECICEP_INST_PRES|VACIA');
assert.equal(c.Presentacion_cacheClave_(undefined), 'ECICEP_INST_PRES|VACIA');
ok('T4 clave de ejecución normalizada y con respaldo VACIA');

// --- T5: caché null-safe sin CacheService ---
assert.equal(c.Presentacion_cacheLeer_('x'), null);
assert.doesNotThrow(() => c.Presentacion_cacheGuardar_('x', 'diseno', 1, 10));
assert.doesNotThrow(() => c.Presentacion_cacheLimpiar_('x'));
ok('T5 sin CacheService el motor no falla (pruebas node)');

// --- T6: reanudación entre RPC con cursor persistido ---
const cacheSingleton = {
  map: new Map(),
  get: function (k) { return this.map.has(k) ? this.map.get(k) : null; },
  put: function (k, v) { this.map.set(k, v); },
  remove: function (k) { this.map.delete(k); }
};
c.CacheService = { getScriptCache: () => cacheSingleton };
let seqBase = 0, seqVer = 0, seqCond = 0;
const seqAcc = { rut: 0, ocultas: 0, protecciones: 0, filtros: 0 };
const subtareasOriginales = {
  condicionales: c.Hojas_formatoCondicional,
  rut: c.Hojas_colorearRutIngresos,
  ocultas: c.Hojas_ocultarTecnicas,
  protecciones: c.Hojas_proteger,
  filtros: c.Hojas_filtros,
  inicio: c.Inicio_construir_,
  paridad: c.HVis_compararFamilia_
};
c.Modelo_aplicarDiseno = () => { seqBase++; return { ok: true }; };
c.HVis_diagnosticarTodas = () => { seqVer++; return { diagnostico: {} }; };
c.Hojas_formatoCondicional = () => { seqCond++; return { ok: true, aplicadas: 0, errores: [] }; };
c.Hojas_colorearRutIngresos = () => { seqAcc.rut++; return { coloreadas: 0, fallidas: [] }; };
c.Hojas_ocultarTecnicas = () => { seqAcc.ocultas++; return { ocultas: 0 }; };
c.Hojas_proteger = () => { seqAcc.protecciones++; return { protecciones: 0 }; };
c.Hojas_filtros = () => { seqAcc.filtros++; return { filtros: 0 }; };
c.Modelo_ss = () => ({ getSheetByName: () => null });
c.Inicio_construir_ = () => ({ ok: true });
c.HVis_compararFamilia_ = () => ({ ok: true, cantidadDiferencias: 0, diferencias: [] });
const presupOriginal = c.PRESUPUESTO_PRESENTACION_MS;
c.PRESUPUESTO_PRESENTACION_MS = 0; // forzar UNA subtarea por RPC
const ejec = 'INST-reanudable-1';
const T = plan.length;
for (let k = 1; k <= T; k++) {
  const r = c.Instalar_pDiseno(ejec);
  assert.equal(r.ok, true, 'llamada ' + k);
  if (k < T) {
    assert.equal(r.continuar, true, 'continúa tras llamada ' + k);
    assert.equal(r.cursor, k, 'cursor ' + k);
    assert.equal(r.progreso.actual, k, 'actual = subtareas completadas');
    assert.equal(r.progreso.enCurso, k + 1, 'enCurso = siguiente subtarea');
    assert.equal(r.progreso.total, T);
    assert.equal(r.subetapa.id, plan[k].id, 'subetapa ' + k);
    assert.equal(r.tareasEjecutadas, 1, 'una subtarea por RPC en ' + k);
  } else {
    assert.equal(r.continuar, false, 'finaliza');
    assert.equal(r.cursor, T);
    assert.equal(r.progreso.actual, T);
    assert.equal(r.progreso.enCurso, T);
    assert.equal(r.progreso.total, T);
    assert.equal(r.subetapa, null);
  }
}
assert.equal(seqBase, 1, 'base se ejecuta una sola vez');
assert.equal(seqCond, 1, 'condicionales se ejecuta una sola vez');
assert.deepEqual(seqAcc, { rut: 1, ocultas: 1, protecciones: 1, filtros: 1 },
  'accesorios ejecuta cada responsabilidad una sola vez');
assert.equal(seqVer, 1, 'verificar se ejecuta una sola vez');
assert.equal(cacheSingleton.map.size, 0, 'cursor limpio al terminar');
Object.assign(c, {
  Hojas_formatoCondicional: subtareasOriginales.condicionales,
  Hojas_colorearRutIngresos: subtareasOriginales.rut,
  Hojas_ocultarTecnicas: subtareasOriginales.ocultas,
  Hojas_proteger: subtareasOriginales.protecciones,
  Hojas_filtros: subtareasOriginales.filtros,
  Inicio_construir_: subtareasOriginales.inicio,
  HVis_compararFamilia_: subtareasOriginales.paridad
});
ok('T6 reanudación: ' + T + ' RPC (una por hoja + inicio + 2 paridades + verificar), progreso real y caché limpiada al final');

// --- T7: subtarea que falla NO persiste el cursor ni avanza ---
const cacheFallida = new Map();
const cacheSingleton2 = {
  map: cacheFallida,
  get: function (k) { return this.map.has(k) ? this.map.get(k) : null; },
  put: function (k, v) { this.map.set(k, v); },
  remove: function (k) { this.map.delete(k); }
};
c.CacheService = { getScriptCache: () => cacheSingleton2 };
c.Modelo_aplicarDiseno = () => ({ fallidas: ['PACIENTES: error'] });
const rf = c.Instalar_pDiseno(ejec);
assert.equal(rf.ok, false);
assert.match(rf.motivo, /PACIENTES: error/);
assert.equal(rf.cursor, 0, 'no avanza');
assert.equal(rf.subetapa.id, 'base');
assert.equal(rf.progreso.actual, 0, 'ninguna subtarea completada');
assert.equal(rf.progreso.enCurso, 1, 'primera subtarea en curso');
assert.equal(rf.progreso.total, T);
assert.equal(cacheFallida.size, 0, 'fallo no persiste cursor');
ok('T7 fallo en base: ok=false, cursor 0 y caché intacta (reintento idempotente)');

// --- T8: api_instalarPaso pasa el _EJEC al motor reanudable ---
c.PRESUPUESTO_PRESENTACION_MS = presupOriginal;
const props8 = new Map();
c.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props8.get(k) || '', setProperty: (k, v) => props8.set(k, v)
}) };
c.Utilities = { getUuid: () => '12345678-1234-4123-8123-123456789abc', formatDate: () => '' };
c.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
const visto = [];
const realPaso = c.Presentacion_ejecutarPaso_;
c.Presentacion_ejecutarPaso_ = function (etapa, ej) { visto.push([etapa, ej]); return { ok: true }; };
const clave = c.WebApp_claveCompartida_();
c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
c.Instalar_asegurarBackup_ = () => ({ ok: true, creado: false });
const rd = c.api_instalarPaso('diseno', clave, 'EJ-9');
assert.equal(rd.ok, true);
assert.deepEqual(Array.from(visto), [['diseno', 'EJ-9']]);
c.Presentacion_ejecutarPaso_ = realPaso;
ok('T8 dispatcher entrega la ejecución del cliente al motor (diseno no mutante)');

// --- T9: Instalar_pVisual sin fuerza global y agregando fallos ---
let opcionesCapturadas = 'NO_LLAMADO';
c.HVis_aplicarTodasLasSecciones = function (opciones) {
  opcionesCapturadas = opciones;
  return { ok: true, resultados: [{ hoja: 'CONFLICTOS', ok: false }] };
};
const rv = c.Instalar_pVisual();
assert.equal(rv.ok, false, 'repara y reporta hojas con fallos');
assert.equal(rv.motivo.includes('CONFLICTOS'), true);
assert.ok(opcionesCapturadas === undefined, 'sin {forzar:true}');
assert.doesNotMatch(readFileSync(new URL('20_Instalador.js', root), 'utf8'),
  /HVis_aplicarTodasLasSecciones\(\{/, 'Instalar_pVisual no fuerza globalmente');
ok('T9 Instalar_pVisual: sin forzar y agrega hojas con pendientes reales');

// --- T10: filas gestionadas bounded (INGRESO_VERDE = tier visual: dataStart 4) ---
const hja10 = { getMaxRows: () => 2000, getLastRow: () => 500 };
assert.equal(c.Hojas_filasGestionadas_(hja10, 'INGRESO_VERDE'), 747);   // 500+250 -> 750 - dataStart(4) + 1
assert.equal(c.Hojas_filasGestionadas_(hja10, 'INGRESO_VERDE', { buffer: 0 }), 497);
assert.equal(c.Hojas_filasGestionadas_(hja10, 'INGRESO_VERDE', { filaInicial: 10 }), 741);
assert.equal(c.Hojas_filasGestionadas_({ getMaxRows: () => 1, getLastRow: () => 1 }, 'INGRESO_VERDE'), 0);
assert.equal(c.Hojas_filasGestionadas_({}, 'INGRESO_VERDE'), 0);
ok('T10 filas gestionadas acotadas por getMaxRows con buffer y filaInicial');

// --- T11: encabezado ya correcto = cero escrituras ---
const estilo = L('PULIDO_ENCABEZADO');
const rangoEnc = {
  getBackgrounds: () => [new Array(1).fill(estilo.fondo)],
  getFontColors: () => [new Array(1).fill(estilo.tinta)],
  getFontWeights: () => [new Array(1).fill(estilo.peso)],
  getFontSizes: () => [new Array(1).fill(estilo.fuente)],
  getValues: () => [['ID_EVENTO']],
  setFontWeight() { return this; }, setFontSize() { return this; },
  setBackground() { return this; }, setFontColor() { return this; },
  setWrapStrategy() { return this; }, setVerticalAlignment() { return this; },
  setHorizontalAlignment() { return this; }, setBorder() { return this; }
};
let esc11 = 0;
const hoja11 = {
  getName: () => 'EVENTOS', getLastColumn: () => 1, getLastRow: () => 3,
  getColumnWidth: col => (col === 1 ? c.Modelo_anchoColumna('ID_EVENTO') : 0),
  setColumnWidth: () => { esc11++; },
  getRowHeight: r => (r === 1 ? estilo.alturaSimple : 0),
  setRowHeight: () => { esc11++; },
  getRange: (r, col, n1, n2) => rangoEnc
};
c._modelo_estilizarEncabezado(hoja11, DISENO.MARCA.sistema);
assert.equal(esc11, 0, 'cero escrituras si encabezado ya cumple el sistema');
ok('T11 estilizar encabezado: hoja correcta = cero escrituras');

// --- T12: banda correcta = cero escrituras ---
const cc = DISENO.SUPERFICIE;
const bandaOk = {
  getRange: () => ({ getRow: () => c.Modelo_dataStartRow('EVENTOS') }),
  getFirstRowColor: () => cc.datos, getSecondRowColor: () => cc.datosAlterno
};
let removidos = 0, aplicados = 0;
const hoja12 = {
  getName: () => 'EVENTOS', getLastColumn: () => 1, getLastRow: () => 100, getMaxRows: () => 100,
  getRange: () => ({ getBandings: () => [bandaOk, { remove: () => { removidos++; } }] }),
  applyRowBanding() { aplicados++; return { setFirstRowColor() { return this; }, setSecondRowColor() { return this; } }; }
};
c._modelo_aplicarBanda(hoja12);
assert.equal(removidos, 0); assert.equal(aplicados, 0);
const bandaRoja = { getRange: () => ({ getRow: () => 3 }),
  getFirstRowColor: () => cc.datos, getSecondRowColor: () => cc.datosAlterno,
  remove: () => { removidos++; } };
const hoja12b = {
  getName: () => 'EVENTOS', getLastColumn: () => 1, getLastRow: () => 100, getMaxRows: () => 100,
  getRange: () => ({
    getBandings: () => [bandaRoja, { remove: () => { removidos++; } }],
    applyRowBanding() { aplicados++; return { setFirstRowColor() { return this; }, setSecondRowColor() { return this; } }; }
  })
};
c._modelo_aplicarBanda(hoja12b);
assert.equal(removidos, 2); assert.equal(aplicados, 1);
ok('T12 banda: coincidente = cero escrituras; desplazada = se re-aplica');

// --- T13: formato de fecha cero escrituras (dd/MM/yyyy ya presente) ---
let f13 = 0;
const celda13 = { getNumberFormat: () => 'dd/MM/yyyy' };
const hoja13 = {
  getName: () => 'EVENTOS', getLastRow: () => 3, getMaxRows: () => 100, getLastColumn: () => 1,
  getRange: (...args) => {
    if (args.length === 4) return { getValues: () => [['FECHA_DETECCION']] };
    if (args.length === 2) return celda13;
    return { setNumberFormat: () => { f13++; } };
  }
};
c._modelo_formatoSencillo(hoja13, ['FECHA_DETECCION']);
assert.equal(f13, 0, 'sin reescritura si el formato ya es dd/MM/yyyy');
const celda13b = { getNumberFormat: () => '@' };
const hoja13b = {
  getName: () => 'EVENTOS', getLastRow: () => 3, getMaxRows: () => 100, getLastColumn: () => 1,
  getRange: (...args) => {
    if (args.length === 4 && args[0] === 1) return { getValues: () => [['FECHA_DETECCION']] };
    if (args.length === 2) return celda13b;
    return { setNumberFormat: () => { f13++; } };
  }
};
c._modelo_formatoSencillo(hoja13b, ['FECHA_DETECCION']);
assert.equal(f13, 1, 'reescribe solo si el formato difiere');
ok('T13 formato fechas: skip-if-correct acotado a filas gestionadas');

// --- T14: formatoNumero (LibroUX) cero escrituras y modo forzado ---
let f14 = 0, f14c = 0;
const hoja14 = {
  getLastRow: () => 3, getMaxRows: () => 100, getLastColumn: () => 1,
  getRange: (...args) => {
    if (args.length === 4 && args[0] === 1) return { getValues: () => [['FECHA_DETECCION']] };
    if (args.length === 4) return {
      getNumberFormats: () => Array.from({ length: args[2] }, () => ['dd/MM/yyyy HH:mm']),
      setNumberFormat: () => { f14++; }
    };
    if (args.length === 2) return { getNumberFormat: () => 'dd/MM/yyyy' };
    return { setNumberFormat: () => { f14++; } };
  }
};
const ss14 = { getSheetByName: (nm) => nm === 'EVENTOS' ? hoja14 : null };
const r14 = c.Hojas_aplicarFormatosNumero_(ss14, { hojas: ['EVENTOS'] });
assert.equal(r14.aplicados, 0);
assert.equal(f14, 0);
const hoja14c = {
  getLastRow: () => 3, getMaxRows: () => 100, getLastColumn: () => 1,
  getRange: (...args) => {
    if (args.length === 4 && args[0] === 1) return { getValues: () => [['FECHA_DETECCION']] };
    if (args.length === 2) return { getNumberFormat: () => 'dd/MM/yyyy' };
    return { setNumberFormat: () => { f14c++; } };
  }
};
const ss14c = { getSheetByName: (nm) => nm === 'EVENTOS' ? hoja14c : null };
const r14c = c.Hojas_aplicarFormatosNumero_(ss14c, { hojas: ['EVENTOS'], cantidad: 4 });
assert.equal(r14c.aplicados, 1);
assert.equal(f14c, 1, 'cantidad explícita = expansión forzada');
ok('T14 formatos numéricos: skip por defecto, cantidad explícita fuerza escritura');

// --- T15: validaciones ya coincidentes = cero escrituras (tier visual: hr 3/ini 4) ---
c.SpreadsheetApp = { newDataValidation: () => { throw new Error('no debe escribir'); } };
const dvCoincide = { getCriteria: () => 'VALUE_IN_LIST', getCriteriaValues: () => [['M', 'F', 'OTRO']] };
let f15 = 0;
const hoja15 = {
  getLastRow: () => 3, getMaxRows: () => 100, getLastColumn: () => 1,
  getRange: (...args) => {
    if (args.length === 4 && args[0] === 3) return { getValues: () => [['SEXO']] };
    if (args.length === 2) return { getDataValidation: () => dvCoincide };
    return { setDataValidation: () => { f15++; } };
  }
};
const ss15 = { getSheetByName: (nm) => nm === 'INGRESO_VERDE' ? hoja15 : null };
const r15 = c.Hojas_aplicarValidaciones_(ss15, { hojas: ['INGRESO_VERDE'] });
assert.equal(r15.aplicadas, 0);
assert.equal(f15, 0, 'regla igual presente = no reescribe');
const dvDistinta = { getCriteria: () => 'VALUE_IN_LIST', getCriteriaValues: () => [['M', 'F']] };
const hoja15b = {
  getLastRow: () => 3, getMaxRows: () => 100, getLastColumn: () => 1,
  getRange: (...args) => {
    if (args.length === 4 && args[0] === 3) return { getValues: () => [['SEXO']] };
    if (args.length === 2) return { getDataValidation: () => dvDistinta };
    return { setDataValidation: () => { f15++; } };
  }
};
const ss15b = { getSheetByName: (nm) => nm === 'INGRESO_VERDE' ? hoja15b : null };
c.SpreadsheetApp = { newDataValidation: () => ({ requireValueInList() { return this; }, requireDate() { return this; }, setAllowInvalid() { return this; }, build: () => ({}) }) };
const r15b = c.Hojas_aplicarValidaciones_(ss15b, { hojas: ['INGRESO_VERDE'] });
assert.equal(r15b.aplicadas, 1);
assert.equal(f15, 1, 'lista distinta sí se reescribe');
ok('T15 validaciones: coincide = skip; lista distinta = se corrige');

// --- T16: coloreado de RUT con fondo ya correcto = cero reescrituras ---
const rut = '12345678-5';
const normRut = c.Norm_normalizarRut(rut);
const rutValido = normRut.rut && c.Norm_validarRut(normRut.rut);
const esperado = rutValido ? DISENO.ESTADOS.OK.fondo : DISENO.ESTADOS.ERROR.fondo;
let f16 = 0;
const hoja16 = {
  getLastRow: () => 4, getMaxRows: () => 100,
  getRange: () => ({
    getValues: () => [[rut]],
    getBackgrounds: () => [[esperado]],
    setBackgrounds: () => { f16++; }
  })
};
const ss16 = { getSheetByName: (nm) => nm === 'INGRESO_VERDE' ? hoja16 : null };
const r16 = c.Hojas_colorearRutIngresos(ss16);
assert.equal(r16.coloreadas, 1);
assert.equal(r16.fallidas.length, 0);
assert.equal(f16, 0, 'RUT ya pintado del color esperado no se reescribe');
assert.equal(r16.reescritas, 1);
ok('T16 RUT: skip cuando el fondo ya corresponde; reescritas reportadas');

// --- T17: notas ya presentes = cero escrituras (tier visual: hr 3) ---
const notaRut = Object.create(null);
const hoja17 = {
  getLastRow: () => 3, getLastColumn: () => 1,
  getRange: (...args) => {
    if (args.length === 4) return {
      getValues: () => [['RUT']],
      getNotes: () => [['Formato: 12345678-5. ECICEP valida el dígito verificador.']],
      setNotes: () => { notaRut.set = true; }
    };
    return { getNote: () => 'Formato: 12345678-5. ECICEP valida el dígito verificador.', setNote: () => { notaRut.set = true; } };
  }
};
const ss17 = { getSheetByName: (nm) => nm === 'INGRESO_VERDE' ? hoja17 : null };
const r17 = c.Hojas_aplicarNotas_(ss17);
assert.equal(r17.aplicadas, 0);
assert.equal(notaRut.set, undefined, 'nota existente = no se reescribe');
ok('T17 notas: skip-if-equal');

// --- T18: Instalador.html soporta continuar sin romper literales ---
const html = readFileSync(new URL('Instalador.html', root), 'utf8');
assert.match(html, /function llamarPaso\(/);
assert.match(html, /r\.continuar===true/);
assert.match(html, /api_instalarPaso\(etapa\.id,ECICEP_ACCESO,_EJEC\)/);
assert.match(html, /_EJEC=nuevoEjecucion\(\);/);
assert.match(html, /marcar\(etapa\.id,aviso\?'ADVERTENCIA':'OK'\)/);
assert.match(html, /function reintentarUltimoError\(\)/);
assert.match(html, /Se conserva la ejecución, el cursor y el respaldo existente/);
assert.match(html, /llamarPresentacion\(er\.etapa,er\.ix,false\)/);
ok('T18 HTML: etapa reanudable con continuar y literales guardados');

// --- T19: invariantes de fuente del hotfix ---
const src35 = readFileSync(new URL('35_Presentacion.js', root), 'utf8');
assert.match(src35, /PRESENTACION_ETAPAS_REANUDABLES = \{ diseno: true \}/);
assert.match(src35, /ECICEP_INST_PRES/);
assert.match(src35, /Modelo_aplicarDiseno\(\)/);
assert.doesNotMatch(src35, /Libro_repararPresentacion_\(\)/ , 'el motor no repara forzando en un RPC');
const src20 = readFileSync(new URL('20_Instalador.js', root), 'utf8');
assert.match(src20, /return Presentacion_ejecutarPaso_\('diseno', ejecucion\);/);
assert.match(src20, /var r = fn\(ejecucion\)/);
const cfg = readFileSync(new URL('00_Config.js', root), 'utf8');
assert.match(cfg, /VERSION:\s*'0\.13\.0'/);
ok('T19 fuente: motor reanudable, sin fuerza global y VERSION 0.13.0');

console.log('Presentación reanudable v0.13.0 — ' + n + '/' + n + ' PASS');
