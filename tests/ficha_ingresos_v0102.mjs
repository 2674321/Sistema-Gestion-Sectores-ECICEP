#!/usr/bin/env node
// Suite ficha de paciente 2.0 + incorporación controlada de ingresos (v0.10.2).
// Bloquea el propósito funcional de la tercera pasada:
//   A  INGRESO_* → PACIENTES → EVENTOS → vistas SECTOR_* (promoción por el
//      pipeline único; NUNCA se escribe SECTOR_* directo).
//   B  api_ingresoIncorporar idempotente (2º clic sin duplicar nada).
//   C  Ficha unificada (api_ficha) sobre el modelo + pendiente por RUT.
//   D  Guardado optimista (api_fichaGuardarCambios): campo → actualizarCampos_,
//      SECTOR → CAMBIO_SECTOR, conflicto → FICHA_CAMBIO, enum → CAMPO_INVALIDO.
//   E  api_registrarEvento delega al dominio (escribe evento + sincroniza últimos).
//   F  Guards de token en los endpoints nuevos.
// Only synthetic data; no hojas, red ni dependencias externas reales.
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
      // Modeling the write-behind of Sheets for the in-memory harness
      setValues: (a) => { a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))); },
      setValue: (v) => { set(r, c, v); },
      // Execution of the EDAD formula in the sector views is deferred in tests
      setFormulas: (a) => { a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, String(v || '').replace(/^=/, '=F:')))); },
      setNumberFormat: () => {},
      setFontWeight: () => {}, setBackground: () => {}, setFontColor: () => {},
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, ''); }
    };
  };
  const colIdx = (a1) => { let n = 0; for (const ch of a1) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  return {
    get val() { return vals; },
    getLastRow: () => vals.length,
    getLastColumn: () => vals.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => 1000,
    getRange: (a, b, c, d) => {
      if (typeof a === 'number') return mk(a, b, c ?? 1, d ?? 1);
      const m = /^([A-Z]+)(\d+)$/.exec(String(a));
      return mk(Number(m[2]), colIdx(m[1]), 1, 1);
    }
  };
}

function libro(opciones) {
  const ctx = vm.createContext({ console: console });
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
  // El formato visual de las hojas ya está normalizado en estos libros sintéticos
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

  const expr = (e) => vm.runInContext(e, ctx);
  const campos = (v) => expr(v);
  const hoja = (nombre, headers) => {
    const f = hojaFake([headers.slice()]);
    ctx.hojas[nombre] = f;
    return f;
  };
  ctx.hojas = {};

  // Estructura del libro sintético (headers canónicos idénticos al contrato)
  const PAC = campos('MODELO_PACIENTE.map(function(c){return c.campo;})');
  const pHeaders = new Array(3).fill().map(() => []);
  pHeaders[2] = PAC;
  ctx.hojas['PACIENTES'] = hojaFake(pHeaders);

  const hojaVisual = (nombre, headers) => {
    const vals = new Array(3).fill().map(() => []);
    vals[2] = headers.slice();
    const f = hojaFake(vals);
    ctx.hojas[nombre] = f;
    return f;
  };

  hoja('EVENTOS', campos('COLUMNAS_EVENTOS'));
  // Verdad física del contrato: las puertas INGRESO_* y las vistas SECTOR_*
  // son hojas VISUALES (encabezados en fila 3, datos desde fila 4) — lo agrega
  // HojasVisual al catálogo de layout en tiempo de carga.
  hojaVisual('INGRESO_NARANJO', campos('INGRESO_COLUMNAS'));
  hojaVisual('INGRESO_AMARILLO', campos('INGRESO_COLUMNAS'));
  hojaVisual('INGRESO_VERDE', campos('INGRESO_COLUMNAS'));
  hojaVisual('SECTOR_NARANJO', campos('COLUMNAS_SECTOR_VISTA'));
  hojaVisual('SECTOR_AMARILLO', campos('COLUMNAS_SECTOR_VISTA'));
  hojaVisual('SECTOR_VERDE', campos('COLUMNAS_SECTOR_VISTA'));
  hoja('STAGING_IMPORT', ['ID_PROVISIONAL', 'ARCHIVO_ORIGEN', 'HOJA_ORIGEN', 'FILA_ORIGEN', 'SECTOR_ORIGEN', 'ESTADO_VALIDACION', 'ERRORES', 'WARNINGS', 'IDENTIFICACION', 'VALORES_ORIGINALES', 'NORMALIZADO', 'FUENTE']);
  hoja('CONFLICTOS', ['FECHA_DETECCION', 'TIPO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'DETALLE', 'FUENTE_A', 'FUENTE_B', 'ESTADO_REVISION', 'RESUELTO_POR']);
  hoja('PROFESIONALES', campos('COLUMNAS_PROFESIONALES'));
  hoja('RESPONSABLES', campos('COLUMNAS_RESPONSABLES'));
  const cfgF = hojaFake([['CLAVE', 'VALOR', 'DESCRIPCION']]);
  ctx.hojas['CONFIG'] = cfgF;

  ctx.Modelo_ss = () => ({ getSheetByName: (n) => ctx.hojas[n] || null });

  if (opciones && opciones.paciente) {
    const p = opciones.paciente;
    const hojaP = ctx.hojas['PACIENTES'];
    const fila = PAC.map((c) => p[c] !== undefined ? p[c] : '');
    hojaP.val.push(fila); // fila física 4 (visual layout)
  }
  return ctx;
}

const expr = (c, e) => vm.runInContext(e, c);

// ---------------------------------------------------------------------------
// A — promoción del ingreso por el pipeline único
// ---------------------------------------------------------------------------
function filaIngresoNaranjo() {
  return ['ANA PEREZ', '12345678-5', 'F', '1980-05-10', '900000000',
    '2026-01-15', 'G2', '', 'observación de ingreso', '', '', 'NO'];
}

test('A: api_ingresoIncorporar promueve INGRESO_* → PACIENTES → EVENTOS → SECTOR_*', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoNaranjo(); // fila física 4

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resumen.nuevos, 1);
  assert.equal(r.resumen.eventosCreados, 1);
  assert.equal(r.resultado.estado, 'INGRESADO');

  const pacientes = c.Modelo_leerPacientes();
  assert.equal(pacientes.length, 1);
  assert.equal(pacientes[0].RUT, '12345678-5');
  assert.equal(pacientes[0].SECTOR, 'NARANJO');
  assert.equal(pacientes[0].FECHA_INGRESO, '2026-01-15');
  assert.equal(pacientes[0].SALUD_MENTAL, 'NO');

  const eventos = c.Modelo_leerEventos();
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].TIPO_EVENTO, 'INGRESO');
  assert.equal(eventos[0].ID_INTERNO, pacientes[0].ID_INTERNO);
  assert.equal(eventos[0].SECTOR, 'NARANJO');

  // Estado de vuelta en la hoja de ingreso (fila 4, col ESTADO_INGRESO=10)
  const hojaIng = c.hojas['INGRESO_NARANJO'].val;
  assert.equal(hojaIng[3][9], 'INGRESADO');

  // Vista sectorial regenerada a partir de PACIENTES+EVENTOS (nunca escrita directa)
  const vista = c.hojas['SECTOR_NARANJO'].val;
  assert.equal(vista[2][0], 'ID_INTERNO');
  assert.equal(vista[3][0], pacientes[0].ID_INTERNO);
  assert.equal(vista[3][1], '12345678-5');
  assert.equal(vista[3][2], 'ANA PEREZ');
  assert.equal(vista[3][10], '2026-01-15'); // FECHA_INGRESO
});

test('A: api_ingresoIncorporar es idempotente — el 2º clic no duplica', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoNaranjo();
  const r1 = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r1.resumen.nuevos, 1);

  const r2 = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r2.ok, true);
  assert.equal(r2.resultado, null); // sin pendiente
  assert.equal(c.Modelo_leerPacientes().length, 1);
  assert.equal(c.Modelo_leerEventos().length, 1);
});

test('A: no se escribe jamás SECTOR_* directo — solo se regenera desde el modelo', () => {
  const c = libro();
  // Simula una vista con datos previos (posición obsoleta del mismo paciente)
  const vista = c.hojas['SECTOR_NARANJO'].val;
  vista[3] = ['EC-VIEJO-01', '99999999-9', 'PACIENTE VIEJO', 'M', '1970-01-01', '', '', '', '', '2025-01-01', ...new Array(7).fill('')];
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoNaranjo();
  c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');

  const vistaf = c.hojas['SECTOR_NARANJO'].val;
  // La vista ya no contiene el valor obsoleto: se reescribió desde PACIENTES
  assert.equal(vistaf.slice(3).some((r) => r[0] === 'EC-VIEJO-01'), false);
  assert.equal(vistaf[3][1], '12345678-5');
});

// ---------------------------------------------------------------------------
// B — pendientes: listado / detalle / búsqueda por RUT (contrato de ficha 2.0)
// ---------------------------------------------------------------------------
test('B: api_ingresosPendientes devuelve filas + total + paginación', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoNaranjo();
  c.hojas['INGRESO_NARANJO'].val[4] = ['PEDRO GOMEZ', '98765432-5', 'M', '1975-02-20', '900000001', '2026-02-10', 'G3', '', '', '', '', 'SI'];

  const r = c.api_ingresosPendientes({ sector: 'NARANJO' }, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.total, 2);
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[0].nombre, 'ANA PEREZ');
  assert.equal(r.filas[1].nombre, 'PEDRO GOMEZ');

  const pag = c.api_ingresosPendientes({ inicio: 1, limite: 1 }, 'tok').filas;
  assert.equal(pag.length, 1);
  assert.equal(pag[0].nombre, 'PEDRO GOMEZ');
});

test('B: api_ingresoDetalle entrega la pre-ficha de la fila pedida', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoNaranjo();
  const d = c.api_ingresoDetalle('INGRESO_NARANJO', 4, 'tok');
  assert.equal(d.ok, true);
  assert.equal(d.preFicha.nombre, 'ANA PEREZ');
  assert.equal(d.preFicha.sector, 'NARANJO');
  assert.equal(d.preFicha.fechaIngreso, '2026-01-15');
});

test('B: la ficha reporta el ingreso pendiente por RUT antes de incorporarlo', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoNaranjo();
  c.hojas['INGRESO_NARANJO'].val[4] = ['PEDRO GOMEZ', '98765432-5', 'M', '1975-02-20', '900000001', '2026-02-10', 'G3', '', '', '', '', 'SI'];

  // Incorporar solo a PEDRO (fila 5); ANA (fila 4) queda pendiente
  c.api_ingresoIncorporar('INGRESO_NARANJO', 5, false, 'tok');
  assert.equal(c.Ingresos_buscarPendientesPorRut('12345678-5').length, 1);
  assert.equal(c.Ingresos_buscarPendientesPorRut('98765432-5').length, 0);

  // Incorporar ANA y confirmar que su ficha ya no reporta pendiente
  c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  const idAna = c.Modelo_leerPacientes().filter((p) => p.RUT === '12345678-5')[0].ID_INTERNO;
  const fichaA = c.api_ficha(idAna, 'tok');
  assert.equal(fichaA.ok, true);
  assert.equal(fichaA.ficha.meta.tieneIngresoPendiente, false);
  assert.equal(typeof fichaA.ficha.meta.ingresoPendiente, 'object');
  assert.equal(fichaA.ficha.meta.fuente, 'HOJA_INGRESO|INGRESO_NARANJO|4');
});

// ---------------------------------------------------------------------------
// C — guardado optimista de la ficha
// ---------------------------------------------------------------------------
function libroConPaciente() {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoNaranjo();
  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true);
  return c;
}

test('C: actualizarCampos_ reescribe el paciente y refresca el sector', () => {
  const c = libroConPaciente();
  const id = c.Modelo_leerPacientes()[0].ID_INTERNO;
  const r = c.api_fichaGuardarCambios(id, {
    TELEFONOS: { anterior: '900000000', valor: '911111111' }
  }, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.cambiosAplicados.indexOf('TELEFONOS') !== -1, true);
  const p = c.Modelo_leerPacientes()[0];
  assert.equal(p.TELEFONOS, '911111111');
  assert.equal(c.hojas['SECTOR_NARANJO'].val[3][6], '911111111');
});

test('C: SECTOR se descompone hacia CAMBIO_SECTOR (evento escrito, vistas movidas)', () => {
  const c = libroConPaciente();
  const id = c.Modelo_leerPacientes()[0].ID_INTERNO;
  const evAntes = c.Modelo_leerEventos().length;

  const r = c.api_fichaGuardarCambios(id, {
    SECTOR: { anterior: 'NARANJO', valor: 'AMARILLO' }
  }, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.sectorCambio, true);

  const p = c.Modelo_leerPacientes()[0];
  assert.equal(p.SECTOR, 'AMARILLO');
  const eventos = c.Modelo_leerEventos();
  assert.equal(eventos.length, evAntes + 1);
  assert.equal(eventos[evAntes].TIPO_EVENTO, 'CAMBIO_SECTOR');
  assert.equal(eventos[evAntes].SECTOR, 'AMARILLO');

  // Vistas: NARANJO queda sin el paciente; AMARILLO lo muestra
  assert.equal(c.hojas['SECTOR_NARANJO'].val.slice(3).some((r) => r[0] === id), false);
  assert.equal(c.hojas['SECTOR_AMARILLO'].val[3][0], id);
});

test('C: conflicto optimista — anterior desactualizado → FICHA_CAMBIO', () => {
  const c = libroConPaciente();
  const id = c.Modelo_leerPacientes()[0].ID_INTERNO;
  // Estado real cambió por fuera (p.ej. otro usuario)
  c.api_actualizarPaciente(id, { TELEFONOS: '922222222' }, 'tok');
  const r = c.api_fichaGuardarCambios(id, {
    TELEFONOS: { anterior: '900000000', valor: '933333333' }
  }, 'tok');
  assert.equal(r.ok, false);
  assert.equal(r.motivo.indexOf('FICHA_CAMBIO') === 0, true);
});

test('C: enums estrictos — SALUD_MENTAL fuera del catálogo → CAMPO_INVALIDO', () => {
  const c = libroConPaciente();
  const id = c.Modelo_leerPacientes()[0].ID_INTERNO;
  const r = c.api_fichaGuardarCambios(id, {
    SALUD_MENTAL: { anterior: 'NO', valor: 'QUIZAS' }
  }, 'tok');
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'CAMPO_INVALIDO:SALUD_MENTAL');
  assert.equal(c.Modelo_leerPacientes()[0].SALUD_MENTAL, 'NO');
});

test('C: validación de fecha — PROXIMO_CONTROL en 2041 supera ANO_MAX=2040', () => {
  const c = libroConPaciente();
  const id = c.Modelo_leerPacientes()[0].ID_INTERNO;
  const r = c.api_fichaGuardarCambios(id, {
    PROXIMO_CONTROL: { anterior: '', valor: '2041-05-10' }
  }, 'tok');
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.codigo, 'CAMPO_INVALIDO:PROXIMO_CONTROL');
});

// ---------------------------------------------------------------------------
// D — api_registrarEvento delega al dominio y sincroniza últimos
// ---------------------------------------------------------------------------
test('D: api_registrarEvento escribe CONTROL y sincroniza ULTIMO_CONTROL', () => {
  const c = libroConPaciente();
  const p0 = c.Modelo_leerPacientes()[0];
  const r = c.api_registrarEvento({
    idInterno: p0.ID_INTERNO, tipoEvento: 'CONTROL',
    fecha: '2026-06-20', descripcion: 'Control de rutina'
  }, 'tok');
  assert.equal(r.ok, true);
  const p = c.Modelo_leerPacientes()[0];
  assert.equal(p.ULTIMO_CONTROL, '2026-06-20');
  const eventos = c.Modelo_leerEventos();
  assert.equal(eventos.length, 2);
  assert.equal(eventos[1].TIPO_EVENTO, 'CONTROL');
});

// ---------------------------------------------------------------------------
// E — guards de token en los endpoints nuevos
// ---------------------------------------------------------------------------
test('E: endpoints de la ficha/ingresos exigen token válido', () => {
  const c = libro();
  assert.equal(c.api_ingresosPendientes({}, 'bad').motivo, 'ACCESO_DENEGADO');
  assert.equal(c.api_ingresoDetalle('INGRESO_NARANJO', 2, 'bad').motivo, 'ACCESO_DENEGADO');
  assert.equal(c.api_ingresoIncorporar('INGRESO_NARANJO', 2, false, 'bad').motivo, 'ACCESO_DENEGADO');
  assert.equal(c.api_fichaGuardarCambios('x', {}, 'bad').motivo, 'ACCESO_DENEGADO');
  assert.equal(c.api_ficha('x', 'bad').ok, false);
  assert.equal(JSON.stringify(c.api_revisionListar('bad')), '{"casos":[],"metricas":{}}');
});

console.log('\nficha_ingresos_v0102 — ' + passed + '/' + passed + ' PASS');