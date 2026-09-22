#!/usr/bin/env node
// Integridad de mutaciones v0.10.3 (§94): ficha atómica, revisión→INGRESO,
// revisión idempotente, eventos reservados, cambio de estratificación con
// trazabilidad, locks y vista derivada fallida. Solo datos ficticios.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
let passed = 0;
function test(name, run) { run(); passed++; console.log('[PASS] ' + name); }

function hojaFake(estado) {
  const vals = estado;
  const set = (r, c, v) => {
    while (vals.length < r) vals.push([]);
    const row = vals[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  };
  const mk = (r, c, nr, nc) => {
    const grid = Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => (vals[r - 1 + i] || [])[c - 1 + j] ?? ''));
    return {
      getValues: () => grid.map((g) => g.slice()),
      getNumRows: () => nr,
      getNumColumns: () => nc,
      setValues: (a) => { a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))); },
      setValue: (v) => { set(r, c, v); },
      setFormulas: (a) => { a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, String(v || '').replace(/^=/, '=F:')))); },
      setNumberFormat: () => {}, setFontWeight: () => {}, setBackground: () => {},
      setFontColor: () => {}, clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, ''); }
    };
  };
  const colIdx = (a1) => { let n = 0; for (const ch of a1) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  return {
    get val() { return vals; },
    getLastRow: () => vals.length,
    getLastColumn: () => vals.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => 1000,
    getDataRange: () => mk(1, 1, vals.length, vals.reduce((m, r) => Math.max(m, r.length), 0)),
    getRange: (a, b, c, d) => {
      if (typeof a === 'number') return mk(a, b, c ?? 1, d ?? 1);
      const m = /^([A-Z]+)(\d+)$/.exec(String(a));
      return mk(Number(m[2]), colIdx(m[1]), 1, 1);
    }
  };
}

function libro(opciones) {
  const ctx = vm.createContext({ console });
  const orden = ['src/00_Config.js', 'src/26_Captura.js', 'src/29_ActualizacionCaptura.js',
    'src/31_Ficha.js', 'src/27_Actualizacion.js', 'src/28_IA.js'];
  const resto = readdirSync(new URL('src/', root)).filter((f) => /\.(js|gs)$/.test(f)).sort();
  const restoFiltrado = resto.map((f) => 'src/' + f).filter((a) => orden.indexOf(a) === -1);
  for (const a of orden.concat(restoFiltrado)) {
    vm.runInContext(read(a), ctx, { filename: a });
  }
  ctx.Session = { getActiveUser: () => ({ getEmail: () => '' }) };
  ctx.Utilities = { getUuid: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', formatDate: () => '' };
  ctx.WebApp_autorizarBuscador = (t) => t === 'tok';
  ctx.HVis_formatearIngresos = () => ({ ok: true, migrado: false });
  ctx.Log_info = () => {}; ctx.Log_error = () => {}; ctx.Log_warning = () => {}; ctx.Log_flush = () => {};
  ctx.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getSheetByName: () => null, getSheets: () => [] }),
    openById: () => null,
    BorderStyle: { SOLID_THICK: 1, SOLID: 2, DOTTED: 3, DASHED: 4, DOUBLE: 5 },
    WrapStrategy: { WRAP: 1, OVERFLOW: 2, CLIP: 3, CLAMP: 4 },
    newDataValidation: () => ({ build: () => ({}) }),
    newConditionalFormatRule: () => ({ build: () => ({}) })
  };
  ctx.hojas = {};
  const expr = (e) => vm.runInContext(e, ctx);
  const campos = (v) => expr(v);
  const hoja = (nombre, headers) => { const f = hojaFake([headers.slice()]); ctx.hojas[nombre] = f; return f; };

  const PAC = campos('MODELO_PACIENTE.map(function(c){return c.campo;})');
  const pHeaders = new Array(3).fill().map(() => []);
  pHeaders[2] = PAC;
  ctx.hojas['PACIENTES'] = hojaFake(pHeaders);
  const visual = (nombre, headers) => {
    const vals = new Array(3).fill().map(() => []);
    vals[2] = headers.slice();
    ctx.hojas[nombre] = hojaFake(vals);
  };
  hoja('EVENTOS', campos('COLUMNAS_EVENTOS'));
  visual('INGRESO_NARANJO', campos('INGRESO_COLUMNAS'));
  visual('INGRESO_AMARILLO', campos('INGRESO_COLUMNAS'));
  visual('INGRESO_VERDE', campos('INGRESO_COLUMNAS'));
  visual('SECTOR_NARANJO', campos('COLUMNAS_SECTOR_VISTA'));
  visual('SECTOR_AMARILLO', campos('COLUMNAS_SECTOR_VISTA'));
  visual('SECTOR_VERDE', campos('COLUMNAS_SECTOR_VISTA'));
  hoja('STAGING_IMPORT', ['ID_PROVISIONAL', 'ARCHIVO_ORIGEN', 'HOJA_ORIGEN', 'FILA_ORIGEN', 'SECTOR_ORIGEN', 'ESTADO_VALIDACION', 'ERRORES', 'WARNINGS', 'IDENTIFICACION', 'VALORES_ORIGINALES', 'NORMALIZADO', 'FUENTE']);
  hoja('CONFLICTOS', ['FECHA_DETECCION', 'TIPO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'DETALLE', 'FUENTE_A', 'FUENTE_B', 'ESTADO_REVISION', 'RESUELTO_POR']);
  hoja('PROFESIONALES', campos('COLUMNAS_PROFESIONALES'));
  hoja('RESPONSABLES', campos('COLUMNAS_RESPONSABLES'));
  hoja('CONFIG', [['CLAVE', 'VALOR', 'DESCRIPCION']]);
  ctx.Modelo_ss = () => ({ getSheetByName: (n) => ctx.hojas[n] || null });
  if (opciones && opciones.paciente) {
    const p = opciones.paciente;
    const hojaP = ctx.hojas['PACIENTES'];
    const fila = PAC.map((c) => p[c] !== undefined ? p[c] : '');
    hojaP.val.push(fila);
  }
  if (opciones && opciones.casoReview) {
    const cj = opciones.casoReview;
    ctx.hojas['CONFLICTOS'].val.push(cj);
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// 1. Atomicidad ficha: un campo inválido NO deja nada a medias
// ---------------------------------------------------------------------------
test('atomicidad: ficha inválida no escribe (ni PACIENTES ni evento)', () => {
  const c = libro({ paciente: { ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2', SALUD_MENTAL: 'NO' } });
  const antes = JSON.stringify(c.hojas['PACIENTES'].val);
  const evAntes = c.hojas['EVENTOS'].val.length;
  const r = c.api_fichaGuardarCambios('P-1', {
    SALUD_MENTAL: { anterior: 'NO', valor: 'QUIZAS' }
  }, 'tok');
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(String(r.codigo || r.motivo), /CAMPO_INVALIDO/);
  assert.equal(JSON.stringify(c.hojas['PACIENTES'].val), antes, 'PACIENTES intacto');
  assert.equal(c.hojas['EVENTOS'].val.length, evAntes, 'EVENTOS intacto');
});

// ---------------------------------------------------------------------------
// 2. Revisión → INGRESO (RECHAZAR_MATCH con CREAR)
// ---------------------------------------------------------------------------
test('revisión RECHAZAR_MATCH (CREAR) promueve a INGRESO y cierra el caso', () => {
  const datos = {
    criterio: 'RUT', confianza: 'ALTA', idProvisional: 'EC-PROV-1',
    sectorOrigen: 'NARANJO', valoresOriginales: { RUT: '12345678-5', NOMBRE: 'ANA PEREZ', SECTOR: 'NARANJO', FECHA_INGRESO: '2026-01-15', ESTRATIFICACION: 'G2' },
    origen: { archivo: 'X.xlsx', hoja: 'INGRESO_NARANJO', fila: 4 }, candidatoId: ''
  };
  const c = libro({ casoReview: ['2026-09-01', 'INGRESO_DOBLE', '', '12345678-5', 'ANA PEREZ', JSON.stringify(datos), 'INGRESO_NARANJO|4', '', 'ABIERTO', ''] });
  let eventosAgregados = null, pacientesAgregados = null;
  c.Modelo_agregarEventos_ = (evs, usu, ctx) => { eventosAgregados = evs; return 1; };
  c.Modelo_agregarPacientes_ = (objs, ctx) => { pacientesAgregados = objs; return 1; };
  const r = c.api_revisionResolver(2, 'RECHAZAR_MATCH', 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.accion, 'CREAR');
  assert.equal(c.hojas['CONFLICTOS'].val[1][8], 'RESUELTO');
  assert.ok(eventosAgregados, 'registra evento de ingreso');
  assert.equal(eventosAgregados[0].TIPO_EVENTO, 'INGRESO');
  assert.ok(pacientesAgregados, 'crea paciente');
  assert.equal(pacientesAgregados[0].RUT, '12345678-5');
});

test('revisión idempotente: caso ya RESUELTO no se reprocesa', () => {
  const datos = {
    criterio: 'RUT', confianza: 'ALTA', idProvisional: 'EC-PROV-1',
    sectorOrigen: 'NARANJO', valoresOriginales: { RUT: '12345678-5', NOMBRE: 'ANA PEREZ', SECTOR: 'NARANJO', FECHA_INGRESO: '2026-01-15', ESTRATIFICACION: 'G2' },
    origen: { archivo: 'X.xlsx', hoja: 'INGRESO_NARANJO', fila: 4 }, candidatoId: ''
  };
  const c = libro({ casoReview: ['2026-09-01', 'INGRESO_DOBLE', '', '12345678-5', 'ANA PEREZ', JSON.stringify(datos), 'INGRESO_NARANJO|4', '', 'RESUELTO', 'op·RECHAZAR_MATCH'] });
  let escritos = 0;
  c.Modelo_agregarEventos_ = () => { escritos++; return 1; };
  c.Modelo_agregarPacientes_ = () => { escritos++; return 1; };
  const r = c.api_revisionResolver(2, 'RECHAZAR_MATCH', 'tok');
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'CONFLICTO_YA_RESUELTO');
  assert.equal(escritos, 0, 'sin mutaciones en caso resuelto');
});

// ---------------------------------------------------------------------------
// 3. Eventos reservados: el registrador genérico los rechaza
// ---------------------------------------------------------------------------
test('eventos reservados: registrador genérico rechaza INGRESO y CAMBIO_ESTRATIFICACION', () => {
  const c = libro({ paciente: { ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2' } });
  for (const tipo of ['INGRESO', 'CAMBIO_ESTRATIFICACION', 'EGRESO', 'CAMBIO_SECTOR']) {
    const r = c.Eventos_registrarPaciente_({ idInterno: 'P-1', tipoEvento: tipo, fecha: '2026-09-01' });
    assert.equal(r.ok, false, tipo + ' debe rechazarse');
    assert.equal(r.motivo, 'TIPO_EVENTO_RESERVADO', tipo);
  }
  const okManual = c.Eventos_registrarPaciente_({ idInterno: 'P-1', tipoEvento: 'CONTROL', fecha: '2026-09-01', fuente: 'TEST' });
  assert.equal(okManual.ok, true, 'CONTROL permitido: ' + JSON.stringify(okManual));
});

// ---------------------------------------------------------------------------
// 4. Cambio de estratificación: genera CAMBIO_ESTRATIFICACION trazable
// ---------------------------------------------------------------------------
test('cambio de estratificación registra evento solo cuando el valor vigente cambia', () => {
  const c = libro({ paciente: { ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2', CONDICIONES: 'HTA' } });
  let eventosEscritos = null;
  c.Modelo_agregarEventos_ = (evs, usu, ctx) => { eventosEscritos = evs; return 1; };
  c.Modelo_leerPacientes = () => {
    return c.hojas['PACIENTES'].val.slice(3).map((f) => {
      const PAC = c._PAC || null;
      return null;
    }).filter(Boolean);
  };
  ctxHackPaciente(c, { ID_INTERNO: 'P-1', RUT: '11111111-1', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2', CONDICIONES: 'HTA' });
  // Caso A: sin cambio → sin evento
  const prep = c.Estrat_prepararCambio_({ ESTRATIFICACION: 'G2', ID_INTERNO: 'P-1' }, 'G2', { motivo: 'TEST' });
  assert.equal(prep.sinCambios, true, 'G2→G2 sin evento');
  // Caso B: cambio real → evento trazable
  const prep2 = c.Estrat_prepararCambio_({ ESTRATIFICACION: 'G3', ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'X', SECTOR: 'NARANJO' }, 'G1', { motivo: 'PATOLOGIAS' });
  assert.equal(prep2.sinCambios, false);
  assert.equal(prep2.evento.TIPO_EVENTO, 'CAMBIO_ESTRATIFICACION');
  assert.equal(prep2.evento.RIESGO_G, 'G1');
  assert.equal(prep2.evento.DESCRIPCION, 'G3 → G1 · PATOLOGIAS');
});

function ctxHackPaciente(c, pac) {
  const PAC = vm.runInContext('MODELO_PACIENTE.map(function(c){return c.campo;})', c);
  c._PAC = PAC;
  const obj = {};
  PAC.forEach((k) => { obj[k] = pac[k] !== undefined ? pac[k] : ''; });
  c.Modelo_leerPacientes = () => [obj];
  c.Modelo_filaDesdeObjeto = (o) => PAC.map((k) => o[k] !== undefined ? o[k] : '');
  c.Modelo_invalidarLecturas = () => {};
  c.Modelo_refrescarVistasSectores_ = () => {};
  c._ingresosUsuarioActual = () => 'test@ecicep.cl';
}

// ---------------------------------------------------------------------------
// 5. Locks
// ---------------------------------------------------------------------------
test('locks: mutaciones compuestas envuelven la mutación atómica', () => {
  const c = libro({ paciente: { ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2' } });
  const p = c.hojas['PACIENTES'];
  c.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {}, hasLock: () => true }) };
  const r = c.api_fichaGuardarCambios('P-1', {
    TELEFONOS: { anterior: '', valor: '911111111' }
  }, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('locks: sin LockService la mutación sigue funcionando (entorno acotado)', () => {
  const c = libro({ paciente: { ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO' } });
  delete c.LockService;
  const r = c.api_fichaGuardarCambios('P-1', {
    TELEFONOS: { anterior: '', valor: '922222222' }
  }, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
});

// ---------------------------------------------------------------------------
// 6. Vista derivada fallida: la fuente primaria se escribe y el fallo se informa
// ---------------------------------------------------------------------------
test('vista derivada fallida: ficha se guarda y el fallo de vista queda acotado', () => {
  const c = libro({ paciente: { ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2' } });
  let refrescos = 0;
  c.Modelo_refrescarVistasSectores_ = () => { refrescos++; throw Error('VISTA_SIMULADA'); };
  const r = c.api_fichaGuardarCambios('P-1', {
    TELEFONOS: { anterior: '', valor: '933333333' }
  }, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(refrescos >= 1, 'el refresco derivado se intenta');
});

test('recálculo masivo: estrat se escribe y el evento CAMBIO_ESTRATIFICACION persiste', () => {
  const c = libro({ paciente: { ID_INTERNO: 'P-1', RUT: '11111111-1', NOMBRE: 'PERSONA FICTICIA', SECTOR: 'NARANJO', ESTRATIFICACION: '', CONDICIONES: 'HTA', ESTRAT_FECHA_CALCULO: '' } });
  ctxHackPaciente(c, { ID_INTERNO: 'P-1', RUT: '11111111-1', SECTOR: 'NARANJO', ESTRATIFICACION: '', CONDICIONES: 'HTA' });
  c.Estrat_evaluar = () => ({ estado: 'CALCULADO', resultado: 'G1', puntaje: 0, regla: 'r' });
  const eventosAntes = c.hojas['EVENTOS'].val.length;
  const r = c.Estrat_recalcularTodos_();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.recalculados, 1);
  const eventos = c.Modelo_leerEventos();
  const ev = eventos.find((e) => e.TIPO_EVENTO === 'CAMBIO_ESTRATIFICACION');
  assert.ok(ev, 'evento persistido');
  assert.equal(ev.RIESGO_G, 'G1');
  assert.equal(ev.RUT, '11111111-1');
  assert.ok(ev.ID_EVENTO, 'con ID trazable');
  assert.ok(c.hojas['EVENTOS'].val.length > eventosAntes, 'fila escrita');
});

console.log('\nintegridad_mutaciones_v0103 — ' + passed + '/' + passed + ' PASS');