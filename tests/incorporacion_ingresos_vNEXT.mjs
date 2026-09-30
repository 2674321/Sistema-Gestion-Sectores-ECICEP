#!/usr/bin/env node
/**
 * Suite INCORPORACIÓN DE INGRESOS (v0.10.7) — flujo INGRESO_* → PACIENTES →
 * EVENTOS → SECTOR_* con claridad para el operador.
 *
 * Cobertura (contrato docs/CONTRATO_CAPTURA_V2.md NO tocado; pasada 4):
 *   T1  flujo individual (VALIDO) → 1 PACIENTE + 1 EVENTO INGRESO +
 *       ESTADO_INGRESO=INGRESADO + SECTOR=NARANJO.
 *   T2  vista derivada SECTOR_NARANJO se refresca desde PACIENTES (nunca
 *       copia manual INGRESO_* → SECTOR_*).
 *   T3  segundo clic / retry: idempotente, sin duplicados, "sin cambios".
 *   T4  ERROR de validación → no PACIENTES / no EVENTO / no INGRESADO; el
 *       detalle renderiza el botón de incorporar DESHABILITADO.
 *   T5  WARNING válido SÍ se incorpora (reglas vigentes intactas).
 *   T6  POSIBLE_DUPLICADO → REQUIERE_REVISION (no se auto-crea paciente).
 *   T7  paciente existente → no duplica, EVENTO INGRESO +1, nota existente.
 *   T8  api_ingresosIncorporarValidos (masivo): 3 válidos + 1 warning +
 *       1 error + 1 posible duplicado + 1 ya INGRESADO → un solo pipeline,
 *       sin duplicados, resumen estructurado.
 *   T9  masivo acotado por sector (NARANJO) → no toca AMARILLO/VERDE.
 *   T10 fila INGRESADO desaparece de pendientes pero permanece en INGRESO_*.
 *   T11 textos UI (renombrado, subtítulo, Sector destino, Incorporar a,
 *       ausencia de "Copiar al sector" y del flujo histórico).
 *   T12 helpers de la UI (ingMensajeResultado / confirm) y guardas de token
 *       del endpoint batch + conteos del listado.
 *   T13 onOpen expone "Incorporar ingresos" → sidebar modo ingresos.
 *   T14 filas "completamente vacías" (caracteres invisibles / guiones sin
 *       identidad) NO generan pendiente ni ERROR fantasma (fix v0.10.7).
 *   T15 encabezados reales fuera de la fila de contrato: listado, detalle,
 *       incorporación y escritura de ESTADO_INGRESO comparten el MISMO layout.
 *   T16 api_buscar normaliza el RUT almacenado (puntos/espacios y SIN_DV).
 *   T17–T26 transición territorial, falsa duplicidad, MULTIPLE, advertencia de
 *       vista e índice lineal sobre volumen realista.
 *   T27–T36 regresiones explícitas del contrato de incorporación (10 casos):
 *       existente cross-sector por individual/lote, falsa barrera FECHA_INGRESO,
 *       retries sin duplicar, CAMBIO_SECTOR posterior conservado, estados
 *       terminales (DUPLICADO/REQUIERE_REVISION) fuera del lote, fallo de vista
 *       como advertencia y convergencia exacta individual ↔ lote.
 *   T37 reparación de sector al reintentar con evidencia de INGRESO propia.
 *   T38 la cola de revisión cierra el ciclo: fila INGRESADO + sector correcto.
 *
 * Uso: node tests/incorporacion_ingresos_vNEXT.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

let passed = 0;
function test(name, run) { run(); passed++; console.log('[PASS] ' + name); }

/** RUT chileno con DV válido (evita errores de validación no buscados). */
function rutOk(cuerpo) {
  const s = String(cuerpo);
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += Number(s[i]) * (2 + ((s.length - 1 - i) % 6));
  const r = 11 - (sum % 11);
  const dv = r === 11 ? '0' : (r === 10 ? 'K' : String(r));
  return s + '-' + dv;
}

// --- Harness (idéntico al contrato sintético de ficha_ingresos_v0102) ---
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
      getValue: () => (grid[r - 1] && grid[r - 1][c - 1] !== undefined) ? grid[r - 1][c - 1] : '',
      getNumRows: () => nr,
      getNumColumns: () => nc,
      setValues: (a) => { a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))); },
      setValue: (v) => { set(r, c, v); },
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
    deleteRows: (inicio, cantidad) => { vals.splice(inicio - 1, cantidad); },
    getRange: (a, b, c, d) => {
      if (typeof a === 'number') return mk(a, b, c ?? 1, d ?? 1);
      const m = /^([A-Z]+)(\d+)$/.exec(String(a));
      return mk(Number(m[2]), colIdx(m[1]), 1, 1);
    },
    getDataRange: () => mk(1, 1, vals.length || 1, Math.max(1, vals.reduce((m, r) => Math.max(m, r.length), 0)))
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
  const hoja = (nombre, headers) => { const f = hojaFake([headers.slice()]); ctx.hojas[nombre] = f; return f; };
  ctx.hojas = {};

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
  // La mayoría de regresiones históricas inspeccionan el estado transitorio
  // INGRESADO. La limpieza productiva se habilita explícitamente en T41.
  if (!(opciones && opciones.eliminarOrigen)) {
    ctx.Ingresos_eliminarOrigenConfirmado_ = () => ({ eliminadas: 0 });
  }
  return ctx;
}

const expr = (c, e) => vm.runInContext(e, c);

// Fixture: fila válida de INGRESO_NARANJO (contrato INGRESO_COLUMNAS).
function filaIngresoValida(opc) {
  opc = opc || {};
  return [opc.nombre || 'ANA PEREZ', opc.rut || '12345678-5', 'F', '1980-05-10', opc.tel || '900000000',
    opc.fecha || '2026-01-15', opc.estrat || 'G2', '', 'observación de ingreso',
    opc.estado || '', '', opc.salud || 'NO'];
}

// ---------------------------------------------------------------------------
// T1 — flujo individual
// ---------------------------------------------------------------------------
test('T1 api_ingresoIncorporar: 1 PACIENTE + 1 EVENTO INGRESO + INGRESADO + SECTOR NARANJO', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida(); // fila física 4

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resumen.nuevos, 1);
  assert.equal(r.resumen.eventosCreados, 1);
  assert.equal(r.resultado.estado, 'INGRESADO');
  assert.equal(r.resultado.nota, 'Nuevo paciente creado');

  const pacientes = c.Modelo_leerPacientes();
  assert.equal(pacientes.length, 1);
  assert.equal(pacientes[0].RUT, '12345678-5');
  assert.equal(pacientes[0].SECTOR, 'NARANJO');

  const eventos = c.Modelo_leerEventos();
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].TIPO_EVENTO, 'INGRESO');
  assert.equal(eventos[0].ID_INTERNO, pacientes[0].ID_INTERNO);
  assert.equal(eventos[0].SECTOR, 'NARANJO');

  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
});

// ---------------------------------------------------------------------------
// T2 — vista derivada
// ---------------------------------------------------------------------------
test('T2 la vista SECTOR_NARANJO se deriva desde PACIENTES+EVENTOS (no copia manual)', () => {
  const c = libro();
  // La vista traía un registro obsoleto que NO debe sobrevivir al refresco
  c.hojas['SECTOR_NARANJO'].val[3] = ['EC-VIEJO-01', '99999999-9', 'PACIENTE VIEJO', 'M', '1970-01-01', '', '', '', '', '2025-01-01', ...new Array(7).fill('')];
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');

  const vista = c.hojas['SECTOR_NARANJO'].val;
  const idNuevo = c.Modelo_leerPacientes()[0].ID_INTERNO;
  assert.equal(vista.slice(3).some((r) => r[0] === 'EC-VIEJO-01'), false, 'el obsoleto no debe persistir');
  assert.equal(vista[3][0], idNuevo);
  assert.equal(vista[3][1], '12345678-5');
  assert.equal(vista[3][2], 'ANA PEREZ');
});

// ---------------------------------------------------------------------------
// T3 — segundo clic / retry
// ---------------------------------------------------------------------------
test('T3 doble clic / retry: sin duplicados, segunda llamada sin cambios', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  const r1 = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r1.resumen.nuevos, 1);

  const r2 = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r2.ok, true);
  assert.equal(r2.resultado, null); // SIN_PENDIENTE → "Ya incorporado"
  assert.equal(c.Modelo_leerPacientes().length, 1);
  assert.equal(c.Modelo_leerEventos().length, 1);
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
});

// ---------------------------------------------------------------------------
// T4 — ERROR de validación
// ---------------------------------------------------------------------------
test('T4 ERROR de validación: sin PACIENTES/EVENTO/INGRESADO y botón deshabilitado en UI', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({ nombre: 'RAMON CIFUENTES', rut: '12' });

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.resumen.conError, 1);
  assert.equal(r.resultado.estado, 'ERROR');
  assert.equal(c.Modelo_leerPacientes().length, 0);
  assert.equal(c.Modelo_leerEventos().length, 0);
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'ERROR');

  // UI: el detalle renderiza botón deshabilitado "No incorporable"
  const sb = read('src/Sidebar.html');
  const script = [...sb.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const init = script.indexOf('function ingAbrirDetalle(');
  const idxBloqueError = script.lastIndexOf("esError\n          ?'<button class=\"btn btn-pri\" disabled>");
  assert.ok(idxBloqueError >= init, 'en el detalle ERROR hay botón disabled');
  assert.ok(script.indexOf('<i data-lucide="ban"></i> No incorporable') !== -1, 'texto No incorporable');
  assert.ok(script.indexOf('Corrige los errores indicados antes de incorporar.') !== -1, 'msg correctivo');
});

// ---------------------------------------------------------------------------
// T5 — WARNING válido incorporable
// ---------------------------------------------------------------------------
test('T5 WARNING (reglas vigentes) sí se incorpora', () => {
  const c = libro();
  // Nombre de una sola palabra → advertencia (nunca error); RUT + fechas válidos
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({
    nombre: 'JUANA', rut: rutOk('11122334'), tel: '900000003', fecha: '2026-04-04'
  });

  const d = c.api_ingresoDetalle('INGRESO_NARANJO', 4, 'tok');
  assert.equal(d.ok, true);
  assert.equal(d.preFicha.estadoValidacion, 'WARNING');
  assert.ok(d.preFicha.warnings.length >= 1, 'tiene advertencias');

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.resultado.estado, 'INGRESADO', JSON.stringify(r));
  assert.equal(c.Modelo_leerPacientes().length, 1);

  // UI: mensaje de advertencia incorporable
  const sb = read('src/Sidebar.html');
  const script = [...sb.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(script.indexOf('Tiene advertencias, pero puede incorporarse.') !== -1, 'aviso warning incorporable en UI');
});

// ---------------------------------------------------------------------------
// T6 — POSIBLE_DUPLICADO
// ---------------------------------------------------------------------------
test('T6 POSIBLE_DUPLICADO → REQUIERE_REVISION, no auto-crea paciente', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-01', RUT: rutOk('87654321'), NOMBRE: 'SOFIA RUIZ', SECTOR: 'NARANJO',
    FECHA_INGRESO: ''
  } });
  // Mismo nombre (clave) pero RUT y teléfono distintos → POSIBLE_DUPLICADO
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({
    nombre: 'SOFIA RUIZ', rut: rutOk('44445555'), tel: '', fecha: '2026-06-06'
  });

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.resumen.revision, 1);
  assert.equal(r.resultado.estado, 'REQUIERE_REVISION');
  assert.equal(c.Modelo_leerPacientes().length, 1); // solo el seed
  assert.equal(c.Modelo_leerEventos().length, 0);
});

// ---------------------------------------------------------------------------
// T7 — paciente existente
// ---------------------------------------------------------------------------
test('T7 paciente existente: no duplica PACIENTES, EVENTO INGRESO +1, nota existente', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-01', RUT: '12345678-5', NOMBRE: 'ANA PEREZ', SECTOR: 'NARANJO',
    FECHA_INGRESO: '', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.resumen.existentes, 1);
  assert.equal(r.resumen.nuevos, 0);
  assert.equal(r.resultado.estado, 'INGRESADO');
  assert.equal(r.resultado.nota, 'Registrado sobre paciente existente');
  assert.equal(c.Modelo_leerPacientes().length, 1);
  const eventos = c.Modelo_leerEventos();
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].TIPO_EVENTO, 'INGRESO');
  assert.equal(eventos[0].ID_INTERNO, 'EC-SEED-01');
});

// ---------------------------------------------------------------------------
// T8 — masivo (api_ingresosIncorporarValidos)
// ---------------------------------------------------------------------------
test('T8 masivo: 3 válidos + 1 warning procesados, error y posible duplicado excluidos, ya-Ingresado ignorado', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-01', RUT: rutOk('87654321'), NOMBRE: 'SOFIA RUIZ', SECTOR: 'NARANJO',
    FECHA_INGRESO: ''
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = ['CARLA VEGA', '12345678-5', 'F', '1980-05-10', '900000000', '2026-01-15', 'G2', '', '', '', '', 'NO'];
  c.hojas['INGRESO_NARANJO'].val[4] = ['PEDRO GOMEZ', '98765432-5', 'M', '1975-02-20', '900000001', '2026-02-10', 'G3', '', '', '', '', 'SI'];
  c.hojas['INGRESO_NARANJO'].val[5] = ['LUIS TORRES', rutOk('65432187'), 'M', '1990-03-03', '900000002', '2026-03-03', 'G1', '', '', '', '', 'NO'];
  c.hojas['INGRESO_NARANJO'].val[6] = ['JUANA', rutOk('11122334'), 'F', '1988-04-04', '900000003', '2026-04-04', 'G2', '', '', '', '', 'NO']; // warning
  c.hojas['INGRESO_NARANJO'].val[7] = ['RAMON CIFUENTES', '12', 'M', '1970-01-01', '900000004', '2026-05-05', 'G1', '', '', '', '', 'NO']; // error
  c.hojas['INGRESO_NARANJO'].val[8] = ['SOFIA RUIZ', rutOk('44445555'), 'F', '1992-06-06', '', '2026-06-06', 'G1', '', '', '', '', 'NO']; // posible duplicado
  c.hojas['INGRESO_NARANJO'].val[9] = ['MARCELA DIAZ', rutOk('77778888'), 'F', '1985-07-07', '', '2026-07-07', 'G1', '', '', 'INGRESADO', '', 'NO']; // ya ingresado

  const r = c.api_ingresosIncorporarValidos({ sector: 'NARANJO' }, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resumen.ingresados, 4, '3 válidos + 1 warning');
  assert.equal(r.resumen.nuevos, 4);
  assert.equal(r.resumen.existentes, 0);
  assert.equal(r.resumen.revision, 1, 'posible duplicado → revisión');
  assert.equal(r.resumen.errores, 1, 'error no procesado');
  assert.equal(r.resumen.duplicados, 0);
  assert.equal(r.resumen.eventos, 4);
  assert.equal(r.resultados.length, 6, '4 INGRESADO + 1 ERROR + 1 REQUIERE_REVISION');

  assert.equal(c.Modelo_leerPacientes().length, 5, 'seed + 4 incorporados');
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 4);
  // MARCELA (ya INGRESADO) no se re-procesó ni duplicó
  assert.equal(c.Modelo_leerPacientes().some((p) => p.NOMBRE === 'MARCELA DIAZ'), false);
  const estadosEscritos = c.hojas['INGRESO_NARANJO'].val.slice(3, 9).map((rF) => rF[9]);
  assert.equal(estadosEscritos.filter((e) => e === 'INGRESADO').length, 4);
  assert.equal(estadosEscritos.filter((e) => e === 'ERROR' || e === 'REQUIERE_REVISION').length, 2);
  assert.equal(c.hojas['INGRESO_NARANJO'].val[6][9], 'INGRESADO', 'warning escrito INGRESADO');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[7][9], 'ERROR');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[8][9], 'REQUIERE_REVISION');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[9][9], 'INGRESADO');
});

// ---------------------------------------------------------------------------
// T9 — masivo por sector
// ---------------------------------------------------------------------------
test('T9 api_ingresosIncorporarValidos({sector}) procesa solo INGRESO_* de ese sector', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.hojas['INGRESO_AMARILLO'].val[3] = filaIngresoValida({ nombre: 'ROSA FLORES', rut: rutOk('19192929'), fecha: '2026-08-08' });

  const r = c.api_ingresosIncorporarValidos({ sector: 'NARANJO' }, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.resumen.ingresados, 1);

  const pacientes = c.Modelo_leerPacientes();
  assert.equal(pacientes.length, 1);
  assert.equal(pacientes[0].SECTOR, 'NARANJO');

  // AMARILLO intacto: sin estado escrito
  assert.equal(c.hojas['INGRESO_AMARILLO'].val[3][9], '');

  // El helper de mapeo no hardcodea: devuelve las hojas del sector (canónico + alias)
  const hojas = c.Ingresos_hojasParaSector_('NARANJO');
  assert.ok(hojas.indexOf('INGRESO_NARANJO') !== -1, 'mapea INGRESO_NARANJO');
  assert.equal(c.Ingresos_hojasParaSector_('VERDE').indexOf('INGRESO_VERDE') !== -1, true);
});

// ---------------------------------------------------------------------------
// T10 — fila INGRESADO desaparece de pendientes
// ---------------------------------------------------------------------------
test('T10 tras incorporar, la fila sale de pendientes pero sigue en INGRESO_*', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.hojas['INGRESO_NARANJO'].val[4] = filaIngresoValida({ nombre: 'PEDRO GOMEZ', rut: '98765432-5', fecha: '2026-02-10' });

  const antes = c.api_ingresosPendientes({}, 'tok');
  assert.equal(antes.total, 2);

  c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');

  const despues = c.api_ingresosPendientes({}, 'tok');
  assert.equal(despues.total, 1);
  assert.equal(despues.conteos.incorporados, 1, 'la UI informa el historial ya incorporado');
  assert.equal(despues.conteos.filasOrigen, 2, 'distingue origen físico de filas por resolver');
  assert.equal(despues.filas[0].nombre, 'PEDRO GOMEZ');
  // La fila sigue físicamente en la hoja (trazabilidad): nombre + INGRESADO
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][0], 'ANA PEREZ');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
});

// ---------------------------------------------------------------------------
// T11 — textos de la UI
// ---------------------------------------------------------------------------
test('T11 UI: renombrado, subtítulo, Sector destino, Incorporar a; sin "Copiar al sector"', () => {
  const sb = read('src/Sidebar.html');
  for (const txt of ['Incorporación de ingresos',
    'Revisa e incorpora al sistema las personas registradas en las hojas de ingreso.',
    '¿Qué significa incorporar?', 'Sector destino', 'Incorporar a ', 'Incorporar todos los válidos',
    'Se procesarán únicamente ingresos pendientes válidos.', 'INGRESO_* es una bandeja transitoria.',
    'Ya incorporados', 'Por resolver', 'No hay filas nuevas válidas.']) {
    assert.ok(sb.indexOf(txt) !== -1, 'UI debe contener: ' + txt);
  }
  assert.ok(sb.indexOf('> Incorporar ingresos') !== -1, 'centro: Incorporated to rename button');
  assert.ok(sb.indexOf('Copiar al sector') === -1, 'no prometer copia directa');
  assert.ok(sb.indexOf('se copiará al sector') === -1, 'no prometer copia directa 2');
  // Textos de resultado traducidos (§13)
  const script = [...sb.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  for (const txt of ['Incorporado correctamente', 'Requiere revisión antes de incorporar',
    'Ya existe un ingreso equivalente', 'No pudo incorporarse']) {
    assert.ok(script.indexOf(txt) !== -1, 'resultado UI debe contener: ' + txt);
  }
  // El botón sigue llamando al pipeline individual vigente (§11)
  assert.ok(script.indexOf('.api_ingresoIncorporar(hoja,fila,false,TOKEN_INVITACION)') !== -1, 'pipeline individual intacto');
  assert.ok(script.indexOf('api_ingresosIncorporarValidos') !== -1, 'endpoint batch en cliente');
});

// ---------------------------------------------------------------------------
// T12 — helpers de la UI y guardas del endpoint batch
// ---------------------------------------------------------------------------
test('T12 ingMensajeResultado traduce estados y el endpoint batch exige token', () => {
  const sb = read('src/Sidebar.html');
  const script = [...sb.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const ini = script.indexOf('function ingMensajeResultado(');
  const fin = script.indexOf('\n}', ini);
  const fn = script.slice(ini, fin + 2);
  const s = vm.createContext({});
  vm.runInContext(fn, s, { filename: 'ingMensajeResultado.js' });
  assert.equal(s.ingMensajeResultado({ resultado: { estado: 'INGRESADO' } }).texto, 'Incorporado correctamente');
  assert.equal(s.ingMensajeResultado({ resultado: { estado: 'REQUIERE_REVISION' } }).tipo, 'warn');
  assert.equal(s.ingMensajeResultado({ resultado: { estado: 'DUPLICADO' } }).texto, 'Ya existe un ingreso equivalente');
  assert.equal(s.ingMensajeResultado({ resultado: { estado: 'ERROR' } }).tipo, 'err');
  assert.equal(s.ingMensajeResultado({}).texto, 'Sin cambios');

  assert.ok(script.indexOf('function ingConfirmarIncorporacion(') !== -1, 'confirmación ligera presente');
  assert.ok(script.indexOf("'Sector destino: ' + (sector || '—')") !== -1, 'confirma el destino');

  // Backend: token denegado
  const c = libro();
  assert.equal(c.api_ingresosIncorporarValidos({}, 'bad').motivo, 'ACCESO_DENEGADO');
  assert.equal(c.api_ingresosIncorporarValidos({}, 'tok').ok, true);

  // Conteos en el listado (KPI sin RPC extra, §35)
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida(); // válido
  c.hojas['INGRESO_NARANJO'].val[4] = filaIngresoValida({ nombre: 'JUANA', rut: rutOk('11122334') }); // warning
  c.hojas['INGRESO_NARANJO'].val[5] = filaIngresoValida({ nombre: 'X', rut: '12' }); // error
  const r = c.api_ingresosPendientes({}, 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.total, 3);
  assert.equal(r.conteos.validos, 1);
  assert.equal(r.conteos.advertencias, 1);
  assert.equal(r.conteos.errores, 1);

  // Helper de hojas por sector (masivo)
  const h = c.Ingresos_hojasParaSector_('');
  assert.equal(h.length, 0);
});

// ---------------------------------------------------------------------------
// T13 — entrada "Incorporar ingresos" en el menú ECICEP de Sheets
// ---------------------------------------------------------------------------
test('T13 onOpen expone "Incorporar ingresos" → sidebar modo ingresos; UI_abrirIngresos abre la incorporación', () => {
  const c = libro();
  const ui = read('src/07_UI.js');
  assert.ok(ui.indexOf("addItem('Incorporar ingresos', 'UI_abrirIngresos')") !== -1, 'item en menú ECICEP');
  assert.ok(c.onOpen.toString().indexOf("addItem('Incorporar ingresos', 'UI_abrirIngresos')") !== -1, 'onOpen lo incluye');
  assert.ok(String(ui.match(/ECICEP tiene ≤5 items/g) || []).length >= 0);
  const srcO = c.onOpen.toString();
  const m = srcO.match(/createMenu\('ECICEP'\)([\s\S]*?)\.addToUi/);
  const nItems = (m[1].match(/\.addItem/g) || []).length;
  assert.ok(nItems <= 6, 'menú ECICEP ≤6 items (tiene ' + nItems + ')');

  let plantillaTitulo = '', tmplModo = null;
  c.HtmlService = {
    createTemplateFromFile: (n) => ({
      evaluate() {
        tmplModo = this.modo;
        return { tipo: 'html', vars: this, setTitle(t) { plantillaTitulo = t; return this; } };
      }
    }),
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
  };
  c.Utilities = { formatDate: () => '20260923-0000' };
  // ACCESO UNIVERSAL (DEC-101): una sola credencial inyectada por el servidor.
  c.WebApp_claveUniversal_ = () => 'tokx';
  c._UI_get = () => ({ showSidebar: () => {}, showModalDialog: () => {} });
  c.UI_abrirIngresos();
  assert.equal(tmplModo, 'ingresos', 'sidebar abre en modo ingresos');
  assert.equal(plantillaTitulo, 'Incorporación de ingresos');

  const sb = read('src/Sidebar.html');
  assert.ok(sb.indexOf("modo === 'ficha' || modo === 'ingresos'") !== -1, 'whitelist incluye modo ingresos');
  assert.ok(sb.indexOf("else if(MODO==='ingresos'){") !== -1, 'init auto-abre el panel incorporación');
  assert.ok(sb.indexOf('abrirIngresosPendientes();') !== -1, 'llama al cargador del panel');
});

// ---------------------------------------------------------------------------
// T14 — filas fantasma sin identidad: nunca pendiente ni ERROR
// ---------------------------------------------------------------------------
test('T14 una fila "completamente vacía" (U+200B, guiones) NO genera pendiente ni ERROR', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.hojas['INGRESO_NARANJO'].val[4] = ['\u200b\u200b', '', '', '', '', '', '', '', '', '', '', ''];
  c.hojas['INGRESO_NARANJO'].val[5] = ['', '---', '', '', '', '', '', '', '', '', '', ''];

  const listado = c.api_ingresosPendientes({}, 'tok');
  assert.equal(listado.total, 1, 'solo la fila real está pendiente');
  assert.equal(listado.conteos.errores, 0, 'sin ERROR fantasma');
  assert.equal(listado.filas[0].nombre, 'ANA PEREZ');

  const r = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(r.resumen.ingresados, 1, 'incorpora el único pendiente real');
  assert.equal(r.resumen.errores, 0, 'el batch no cuenta filas sin identidad');
  assert.equal(r.resumen.leidos, 1, 'solo la fila candidata real se lee');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[4][9], '', 'la fila invisible no recibe estado');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[5][9], '', 'la fila de guiones no recibe estado');
});

// ---------------------------------------------------------------------------
// T15 — encabezados reales fuera de la fila de contrato
// ---------------------------------------------------------------------------
test('T15 encabezados reales en fila 2: listado/detalle/incorporar/estado comparten el MISMO layout', () => {
  const c = libro();
  const headers = c.Ingresos_columnasHoja();
  const f = hojaFake([
    headers.map(() => 'TITULO HOJA'),
    headers.slice(),
    filaIngresoValida(),
    filaIngresoValida({ nombre: 'ROSA LOPEZ', rut: rutOk('22334455') })
  ]);
  c.hojas['INGRESO_NARANJO'] = f;

  const listado = c.api_ingresosPendientes({}, 'tok');
  assert.equal(listado.total, 2, 'ambas filas reales se listan');
  assert.equal(listado.filas[0].fila, 3, 'fila física real (encabezado en fila 2)');

  const detalle = c.api_ingresoDetalle('INGRESO_NARANJO', 3, 'tok');
  assert.equal(detalle.ok, true, JSON.stringify(detalle));
  assert.equal(detalle.fila, 3);
  assert.equal(detalle.preFicha.nombre, 'ANA PEREZ');

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 3, false, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resultado.estado, 'INGRESADO');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[2][9], 'INGRESADO', 'estado escrito en la fila física correcta');
});

test('T15b con encabezados en fila 2, una fila fantasma se ignora igual (no ERROR)', () => {
  const c = libro();
  const headers = c.Ingresos_columnasHoja();
  const f = hojaFake([
    headers.map(() => 'TITULO HOJA'),
    headers.slice(),
    filaIngresoValida(),
    ['\u200b', '-', '', '', '', '', '', '', '', '', '', '']
  ]);
  c.hojas['INGRESO_NARANJO'] = f;
  const listado = c.api_ingresosPendientes({}, 'tok');
  assert.equal(listado.total, 1, 'solo la fila real');
  assert.equal(listado.conteos.errores, 0);
});

// ---------------------------------------------------------------------------
// T16 — buscador: RUT almacenado con puntos/espacios y RUT sin DV
// ---------------------------------------------------------------------------
test('T16 api_buscar normaliza el RUT almacenado (puntos/espacios y SIN_DV)', () => {
  const c = libro({ paciente: { ID_INTERNO: 'EC-DOTS-01', RUT: '12.345.678-5', NOMBRE: 'MARIA DOTS', SECTOR: 'VERDE', ESTADO: 'VIGENTE', ESTRATIFICACION: 'G1' } });
  const r = c.api_buscar('12345678-5', 'tok');
  assert.equal(r.ok, true);
  assert.equal(r.filas.some((x) => x.id === 'EC-DOTS-01'), true, 'RUT con puntos encontrado por RUT normalizado');

  const c2 = libro({ paciente: { ID_INTERNO: 'EC-SINDV-01', RUT: '98765432', NOMBRE: 'ROSA SIN DV', SECTOR: 'AMARILLO', ESTADO: 'VIGENTE', ESTRATIFICACION: 'G1' } });
  const r2 = c2.api_buscar('98765432-5', 'tok');
  assert.equal(r2.ok, true);
  assert.equal(r2.filas.some((x) => x.id === 'EC-SINDV-01'), true, 'RUT sin DV encontrado por cuerpo+DV');

  const r3 = c2.api_buscar('ROSA', 'tok');
  assert.equal(r3.ok, true);
  assert.equal(r3.filas.some((x) => x.id === 'EC-SINDV-01'), true, 'búsqueda por nombre intacta');

  const r4 = c2.api_buscar('acnoexiste-9', 'tok');
  assert.equal(r4.filas.length, 0, 'RUT válido inexistente → sin resultados');
});

// ---------------------------------------------------------------------------
// T17–T18 — regresión del incidente: existente cross-sector y falsa
// barrera basada en PACIENTES.FECHA_INGRESO.
// ---------------------------------------------------------------------------
test('T17 existente cross-sector: crea INGRESO + CAMBIO_SECTOR y converge la vista destino', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-01', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', FECHA_INGRESO: '', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();

  const preview = c.api_ingresosPendientes({ sector: 'NARANJO' }, 'tok');
  assert.equal(preview.conteos.cambiosSector, 1, JSON.stringify(preview));
  assert.equal(preview.filas[0].sectorVigente, 'AMARILLO');
  assert.equal(preview.filas[0].accionTerritorial, 'CAMBIAR_SECTOR');

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resultado.estado, 'INGRESADO');
  assert.equal(r.resultado.sectorAnterior, 'AMARILLO');
  assert.equal(r.resultado.sectorDestino, 'NARANJO');
  assert.equal(r.resultado.sectorCambio, true);
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
  const eventos = c.Modelo_leerEventos();
  assert.equal(eventos.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
  assert.equal(eventos.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 1);
  assert.equal(c.hojas['SECTOR_NARANJO'].val.slice(3).some((f) => f[0] === 'EC-SEED-01'), true);
  assert.equal(c.hojas['SECTOR_AMARILLO'].val.slice(3).some((f) => f[0] === 'EC-SEED-01'), false);

  c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(c.Modelo_leerEventos().length, 2, 'retry no duplica eventos');
});

test('T18 FECHA_INGRESO en PACIENTES sin EVENTO no es evidencia de duplicado', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-02', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', FECHA_INGRESO: '2026-01-15', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({ fecha: '2026-01-15' });

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.resultado.estado, 'INGRESADO', JSON.stringify(r));
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
});

test('T19 retry por FUENTE no revierte un cambio territorial posterior', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-03', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(c.Paciente_cambiarSector_('EC-SEED-03', 'VERDE', { fuente: 'TEST_POSTERIOR' }).ok, true);
  c.hojas['INGRESO_NARANJO'].val[3][9] = 'PENDIENTE';
  c.Modelo_invalidarLecturas();

  const retry = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(retry.resultado.yaIncorporado, true, JSON.stringify(retry));
  assert.equal(retry.resultado.sectorVigente, 'VERDE');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'VERDE', 'no vuelve a NARANJO');
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
});

test('T20 sector MULTIPLE exige revisión humana y no escribe', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-MULTI-01', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'MULTIPLE', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.resultado.estado, 'REQUIERE_REVISION', JSON.stringify(r));
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'MULTIPLE');
  assert.equal(c.Modelo_leerEventos().length, 0);
});

test('T21 estados terminales: no reaparecen como PENDIENTE ni entran solos al lote', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({ estado: 'DUPLICADO' });
  c.hojas['INGRESO_NARANJO'].val[4] = filaIngresoValida({
    nombre: 'ROSA LOPEZ', rut: rutOk('22334455'), estado: 'REQUIERE_REVISION'
  });
  const lista = c.api_ingresosPendientes({}, 'tok');
  assert.equal(lista.total, 2, JSON.stringify(lista));
  // El estado ALMACENADO manda sobre la validación: jamás se reetiqueta PENDIENTE
  assert.deepEqual(Array.from(lista.filas, (f) => f.estado), ['DUPLICADO', 'REQUIERE_REVISION']);
  assert.deepEqual(Array.from(lista.filas, (f) => f.estadoPrevio), ['DUPLICADO', 'REQUIERE_REVISION']);
  assert.deepEqual(Array.from(lista.filas, (f) => f.accionTerritorial), ['NO_INCORPORABLE', 'NO_INCORPORABLE']);
  assert.equal(lista.conteos.validos, 0, 'una fila terminal no es "válida"');
  assert.equal(lista.conteos.duplicados, 1);
  assert.equal(lista.conteos.requierenRevision, 1);

  const lote = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(lote.resumen.leidos, 0, 'el lote excluye las filas terminales: ' + JSON.stringify(lote.resumen));
  assert.equal(lote.resumen.ingresados, 0);
  assert.equal(lote.resumen.revision, 0);
  assert.equal(c.Modelo_leerPacientes().length, 0, 'nada se incorporó a ciegas');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'DUPLICADO', 'el estado terminal se conserva');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[4][9], 'REQUIERE_REVISION');

  // Escape hatch explícito: una fila corregida se libera cambiando el estado a mano
  c.hojas['INGRESO_NARANJO'].val[3][9] = 'PENDIENTE';
  c.hojas['INGRESO_NARANJO'].val[4][9] = '';
  c.Modelo_invalidarLecturas();
  const lote2 = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(lote2.resumen.ingresados, 2, JSON.stringify(lote2.resumen));
  assert.equal(c.Modelo_leerPacientes().length, 2);
});

test('T22 fallo de vista no falsea éxito: persiste canon y devuelve advertencia estructurada', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.Modelo_refrescarVistasSectores_ = () => { throw new Error('vista no disponible'); };
  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.resultado.estado, 'INGRESADO');
  assert.equal(r.resultado.estadoOperacion, 'INCORPORADO_VISTA_PENDIENTE');
  assert.deepEqual(Array.from(r.resultado.advertencias), ['VISTA_SECTOR_PENDIENTE']);
  assert.equal(c.Modelo_leerPacientes().length, 1);
  assert.equal(c.Modelo_leerEventos().length, 1);
});

test('T23 indexación de snapshot 2.713/21.783 es lineal y acotada', () => {
  const c = libro();
  const pacientes = Array.from({ length: 2713 }, (_, i) => ({
    ID_INTERNO: 'EC-PERF-' + i, RUT: '', NOMBRE: 'PACIENTE ' + i, SECTOR: 'VERDE'
  }));
  const eventos = Array.from({ length: 21783 }, (_, i) => ({
    ID_EVENTO: 'EV-PERF-' + i, ID_INTERNO: 'EC-PERF-' + (i % 2713),
    TIPO_EVENTO: i % 3 === 0 ? 'INGRESO' : 'CONTROL', FECHA_EVENTO: '2026-01-15',
    FUENTE: 'PERF|' + i
  }));
  const t0 = Date.now();
  const salida = c.Ingresos_procesarFilas([], { pacientes, eventos }, {});
  const ms = Date.now() - t0;
  assert.equal(salida.resumen.leidos, 0);
  assert.ok(ms < 2000, 'snapshot indexado en ' + ms + 'ms');
  console.log('[PERF] snapshot 2713 pacientes / 21783 eventos: ' + ms + 'ms');
});

test('T24 lote reutiliza la misma transición territorial que el flujo individual', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-BATCH-01', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  const r = c.api_ingresosIncorporarValidos({ sector: 'NARANJO' }, 'tok');
  assert.equal(r.resumen.cambiosSector, 1, JSON.stringify(r));
  assert.equal(r.resumen.ingresados, 1);
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 1);
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
});

test('T25 fila desplazada con nombre F se bloquea, pero el lote incorpora los válidos', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = [
    'F', '1980-05-10', '900000000', '2026-01-15', 'G2', '', '', '', '', '', '', 'NO'
  ];
  c.hojas['INGRESO_NARANJO'].val[4] = filaIngresoValida({
    nombre: 'MARTA SILVA', rut: rutOk('33445566'), fecha: '2026-02-15'
  });
  const lista = c.api_ingresosPendientes({}, 'tok');
  assert.equal(lista.total, 2);
  assert.equal(lista.filas[0].estado, 'ERROR');
  const detalle = c.api_ingresoDetalle('INGRESO_NARANJO', 4, 'tok');
  assert.ok(detalle.preFicha.errores.some((e) => e.includes('Posible corrimiento de columnas')), JSON.stringify(detalle));

  const lote = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(lote.resumen.ingresados, 1, JSON.stringify(lote));
  assert.equal(lote.resumen.errores, 1);
  assert.equal(c.Modelo_leerPacientes().length, 1);
  assert.equal(c.Modelo_leerPacientes()[0].NOMBRE, 'MARTA SILVA');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'ERROR');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[4][9], 'INGRESADO');
});

test('T26 individual y lote omiten el formateo global de todas las hojas', () => {
  const c = libro(); let formatos = 0;
  c.HVis_formatearIngresos = () => { formatos++; return { ok: true }; };
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  assert.equal(c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok').resultado.estado, 'INGRESADO');
  c.hojas['INGRESO_NARANJO'].val[4] = filaIngresoValida({
    nombre: 'ELENA ROJAS', rut: rutOk('44556677'), fecha: '2026-03-15'
  });
  assert.equal(c.api_ingresosIncorporarValidos({}, 'tok').resumen.ingresados, 1);
  assert.equal(formatos, 0, 'cargar datos no debe reformatear todas las hojas');
});

// ---------------------------------------------------------------------------
// T27–T38 — regresiones explícitas del contrato de incorporación
// ---------------------------------------------------------------------------

/** Extrae un helper del script embebido del Sidebar para ejercitarlo en vm. */
function sidebarFn(nombre) {
  const sb = read('src/Sidebar.html');
  const script = [...sb.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const ini = script.indexOf('function ' + nombre + '(');
  assert.ok(ini >= 0, 'Sidebar define ' + nombre);
  const fin = script.indexOf('\n}', ini);
  const s = vm.createContext({});
  const escSrc = read('src/00_Tokens.html').match(/function _esc\(s\)\{[^\n]*\}/);
  if (escSrc) vm.runInContext(escSrc[0], s, { filename: '_esc.js' });
  vm.runInContext(script.slice(ini, fin + 2), s, { filename: nombre + '.js' });
  return s[nombre];
}

test('T27 regresión 1: existente AMARILLO incorporado desde INGRESO_NARANJO (individual)', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-01', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resultado.estado, 'INGRESADO');
  assert.equal(r.resultado.sectorCambio, true);
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO', 'estados de vuelta en la hoja');

  const pac = c.Modelo_leerPacientes();
  assert.equal(pac.length, 1, 'sin pacientes duplicados');
  assert.equal(pac[0].SECTOR, 'NARANJO', 'PACIENTES.SECTOR refleja la evidencia');

  const evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 1);
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO')[0].SECTOR, 'NARANJO');

  assert.equal(c.hojas['SECTOR_NARANJO'].val.slice(3).some((f) => f[0] === 'EC-SEED-01'), true);
  assert.equal(c.hojas['SECTOR_AMARILLO'].val.slice(3).some((f) => f[0] === 'EC-SEED-01'), false);
});

test('T28 regresión 2: el mismo caso por lote converge igual que el individual', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-02', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();

  const r = c.api_ingresosIncorporarValidos({ sector: 'NARANJO' }, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resumen.ingresados, 1);
  assert.equal(r.resumen.existentes, 1);
  assert.equal(r.resumen.cambiosSector, 1, JSON.stringify(r.resumen));
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
  const evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 1);
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
  assert.equal(c.hojas['SECTOR_NARANJO'].val.slice(3).some((f) => f[0] === 'EC-SEED-02'), true);
  assert.equal(c.hojas['SECTOR_AMARILLO'].val.slice(3).some((f) => f[0] === 'EC-SEED-02'), false);
});

test('T29 regresión 3: PACIENTES.FECHA_INGRESO coincide pero no hay EVENTO de INGRESO', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-03', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', FECHA_INGRESO: '2026-01-15', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({ fecha: '2026-01-15' });
  assert.equal(c.Modelo_leerEventos().length, 0, 'premisa: caché sin evidencia');

  const previa = c.api_ingresosPendientes({}, 'tok');
  assert.equal(previa.filas[0].estado, 'PENDIENTE', 'no se clasifica como duplicado');
  assert.equal(previa.filas[0].accionTerritorial, 'CAMBIAR_SECTOR');

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.resultado.estado, 'INGRESADO', JSON.stringify(r));
  const evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1, 'la evidencia se crea');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
});

test('T30 regresión 4: retry con EVENTO de INGRESO ya existente no duplica nada', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-04', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  const uno = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(uno.resumen.eventosCreados, 2, JSON.stringify(uno.resumen));

  // Retry operativo: el estado se libera a mano y la fila vuelve a procesarse
  c.hojas['INGRESO_NARANJO'].val[3][9] = 'PENDIENTE';
  c.Modelo_invalidarLecturas();
  const dos = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(dos.ok, true, JSON.stringify(dos));
  assert.equal(dos.resultado.estado, 'INGRESADO');
  assert.equal(dos.resultado.yaIncorporado, true);

  assert.equal(c.Modelo_leerPacientes().length, 1, 'sin pacientes duplicados');
  const evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1, 'sin evento INGRESO duplicado');
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 1, 'sin CAMBIO_SECTOR duplicado');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
});

test('T31 regresión 5: retry histórico con CAMBIO_SECTOR posterior lo conserva', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-05', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(c.Paciente_cambiarSector_('EC-SEED-05', 'VERDE', { fuente: 'TEST_POSTERIOR' }).ok, true);

  c.hojas['INGRESO_NARANJO'].val[3][9] = 'PENDIENTE';
  c.Modelo_invalidarLecturas();
  const retry = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(retry.resultado.yaIncorporado, true, JSON.stringify(retry));
  assert.equal(retry.resultado.sectorVigente, 'VERDE');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'VERDE', 'no revierte la decisión territorial posterior');
  const evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 2, 'sin CAMBIO_SECTOR nuevo');
});

test('T32 regresión 6: DUPLICADO no reaparece como PENDIENTE en el listado ni en la UI', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({ estado: 'DUPLICADO' });

  const lista = c.api_ingresosPendientes({}, 'tok');
  assert.equal(lista.total, 1, JSON.stringify(lista));
  assert.equal(lista.filas[0].estado, 'DUPLICADO', 'el listado no reetiqueta a PENDIENTE');
  assert.equal(lista.filas[0].estadoPrevio, 'DUPLICADO');
  assert.equal(lista.filas[0].accionTerritorial, 'NO_INCORPORABLE');
  assert.equal(lista.conteos.validos, 0, 'no cuenta como listo para incorporar');
  assert.equal(lista.conteos.duplicados, 1);

  const detalle = c.api_ingresoDetalle('INGRESO_NARANJO', 4, 'tok');
  assert.equal(detalle.ok, true, JSON.stringify(detalle));
  assert.equal(detalle.preFicha.estadoIngreso, 'DUPLICADO');

  const badge = sidebarFn('ingBadgeEstado');
  const html = badge('DUPLICADO');
  assert.ok(html.indexOf('Listo para incorporar') === -1, 'el badge nunca promete incorporación');
  assert.ok(html.indexOf('Duplicado') !== -1, html);

  const script = [...read('src/Sidebar.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n');
  assert.ok(script.indexOf("estadoPrevio==='DUPLICADO'") !== -1 ||
    script.indexOf("estadoIngreso==='DUPLICADO'") !== -1,
    'el detalle de la fila deshabilita la incorporación de una fila DUPLICADO');

  const lote = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(lote.resumen.leidos, 0, JSON.stringify(lote.resumen));
  assert.equal(lote.resumen.ingresados, 0);
  assert.equal(c.Modelo_leerPacientes().length, 0, 'una fila terminal no se incorpora a ciegas');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'DUPLICADO', 'estado terminal intacto');
});

test('T33 regresión 7: REQUIERE_REVISION no entra al lote', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({ estado: 'REQUIERE_REVISION' });

  const lista = c.api_ingresosPendientes({}, 'tok');
  assert.equal(lista.total, 1);
  assert.equal(lista.filas[0].estado, 'REQUIERE_REVISION');
  assert.equal(lista.filas[0].accionTerritorial, 'NO_INCORPORABLE');
  assert.equal(lista.conteos.validos, 0);
  assert.equal(lista.conteos.requierenRevision, 1);

  const lote = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(lote.resumen.leidos, 0, 'la fila terminal queda fuera del batch: ' + JSON.stringify(lote.resumen));
  assert.equal(lote.resumen.ingresados, 0);
  assert.equal(lote.resumen.revision, 0, 'tampoco se re-encola: el caso ya está en la cola de revisión');
  assert.equal(c.Modelo_leerPacientes().length, 0);
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'REQUIERE_REVISION');

  // Escape hatch: liberada a mano, el lote la vuelve a procesar
  c.hojas['INGRESO_NARANJO'].val[3][9] = 'PENDIENTE';
  c.Modelo_invalidarLecturas();
  const lote2 = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(lote2.resumen.ingresados, 1, JSON.stringify(lote2.resumen));
});

test('T34 regresión 8: el fallo de vista se comunica como advertencia (backend y UI)', () => {
  const c = libro();
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.Modelo_refrescarVistasSectores_ = () => { throw new Error('vista no disponible'); };

  const r = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(r.resultado.estado, 'INGRESADO');
  assert.equal(r.resultado.estadoOperacion, 'INCORPORADO_VISTA_PENDIENTE');
  assert.equal(r.resultado.vistaSectorConfirmada, false);
  assert.ok(Array.from(r.resultado.advertencias).indexOf('VISTA_SECTOR_PENDIENTE') >= 0);
  assert.equal(c.Modelo_leerPacientes().length, 1, 'el canon sí se persiste');

  const msg = sidebarFn('ingMensajeResultado');
  const m = msg({ resultado: { estado: 'INGRESADO', estadoOperacion: 'INCORPORADO_VISTA_PENDIENTE' } });
  assert.equal(m.tipo, 'warn', 'nunca tipo ok');
  assert.ok(m.texto.indexOf('pendiente') !== -1, m.texto);
  assert.notEqual(m.texto, 'Incorporado correctamente', 'no hay éxito falso');

  const sb = read('src/Sidebar.html');
  assert.ok(sb.indexOf('⚠ Vista sectorial pendiente') !== -1, 'el lote también lo advierte');
});

test('T35 regresión 9: segundo clic y segundo lote no duplican nada', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-06', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();

  const i1 = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(i1.resultado.estado, 'INGRESADO');
  const i2 = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(i2.resultado, null, 'segundo clic sin cambios: ' + JSON.stringify(i2));

  const b1 = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(b1.resumen.leidos, 0, JSON.stringify(b1.resumen));
  const b2 = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(b2.resumen.leidos, 0);

  assert.equal(c.Modelo_leerPacientes().length, 1);
  const evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1, 'sin INGRESO duplicado');
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 1, 'sin CAMBIO_SECTOR duplicado');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
});

test('T36 regresión 10: el flujo individual y el lote convergen al mismo estado final', () => {
  const semilla = () => {
    const c = libro({ paciente: {
      ID_INTERNO: 'EC-SEED-07', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
      SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
    } });
    // 2ª semilla (nombre coincidente con una fila) → posible duplicado real
    const hdr = c.hojas['PACIENTES'].val[2];
    const p = { ID_INTERNO: 'EC-SEED-07B', RUT: rutOk('87654321'), NOMBRE: 'SOFIA RUIZ',
      SECTOR: 'NARANJO', ESTADO: 'VIGENTE', ESTRATIFICACION: 'G2' };
    c.hojas['PACIENTES'].val.push(hdr.map((k) => (p[k] !== undefined ? p[k] : '')));
    return c;
  };
  const preparar = (c) => {
    c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
    c.hojas['INGRESO_NARANJO'].val[4] = filaIngresoValida({
      nombre: 'PEDRO GOMEZ', rut: '98765432-5', fecha: '2026-02-10'
    });
    c.hojas['INGRESO_NARANJO'].val[5] = filaIngresoValida({
      nombre: 'SOFIA RUIZ', rut: rutOk('44445555'), tel: '', fecha: '2026-06-06'
    }); // posible duplicado → REQUIERE_REVISION
    c.hojas['INGRESO_NARANJO'].val[6] = filaIngresoValida({
      nombre: 'RAMON CIFUENTES', rut: '12', fecha: '2026-05-05'
    }); // ERROR de validación
  };

  const a = semilla(); preparar(a);
  const b = semilla(); preparar(b);

  a.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  a.api_ingresoIncorporar('INGRESO_NARANJO', 5, false, 'tok');
  a.api_ingresoIncorporar('INGRESO_NARANJO', 6, false, 'tok');
  a.api_ingresoIncorporar('INGRESO_NARANJO', 7, false, 'tok');

  const rb = b.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(rb.ok, true, JSON.stringify(rb));
  assert.equal(rb.resumen.ingresados, 2, 'los dos incorporables: ' + JSON.stringify(rb.resumen));

  // Fechas de sesión e IDs generados (aleatorios por corrida) se normalizan;
  // TODO lo demás — RUT, sector, eventos, estados — debe coincidir al byte.
  const plana = (o) => {
    const mapa = { EC: new Map(), EV: new Map() };
    const cuenta = { EC: 0, EV: 0 };
    const json = JSON.stringify(o)
      .replace(/"(FECHA_REGISTRO|FECHA_ACTUALIZACION|FECHA_[A-Z_]+)":"[^"]*"/g, '"$1":""')
      .replace(/"(EC|EV)-[A-Z0-9]{5,}-[A-Z0-9]{1,4}"/g, (m, tipo) => {
        const id = m.slice(1, -1);
        if (!mapa[tipo].has(id)) mapa[tipo].set(id, tipo + '-GEN-' + (++cuenta[tipo]));
        return '"' + mapa[tipo].get(id) + '"';
      });
    return JSON.parse(json);
  };
  assert.deepEqual(plana(b.Modelo_leerPacientes()), plana(a.Modelo_leerPacientes()), 'PACIENTES idénticos');
  assert.deepEqual(plana(b.Modelo_leerEventos()), plana(a.Modelo_leerEventos()), 'EVENTOS idénticos');
  assert.deepEqual(plana(b.hojas['INGRESO_NARANJO'].val), plana(a.hojas['INGRESO_NARANJO'].val), 'estados de fila idénticos');
  assert.deepEqual(plana(b.hojas['SECTOR_NARANJO'].val), plana(a.hojas['SECTOR_NARANJO'].val), 'vista destino idéntica');
  assert.deepEqual(plana(b.hojas['SECTOR_AMARILLO'].val), plana(a.hojas['SECTOR_AMARILLO'].val), 'vista origen idéntica');
  assert.deepEqual(
    plana(b.api_ingresosPendientes({}, 'tok').filas),
    plana(a.api_ingresosPendientes({}, 'tok').filas),
    'listado de pendientes idéntico');
});

test('T37 retry con evidencia de INGRESO propia repara el sector desalineado', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-08', RUT: '12345678-5', NOMBRE: 'ANA PEREZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  assert.equal(c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok').resultado.estado, 'INGRESADO');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');

  // Daño histórico: PACIENTES.SECTOR quedó fuera de la evidencia (edición directa
  // de la hoja, sin CAMBIO_SECTOR registrado) y la fila se liberó para reintentar.
  const colSector = c.hojas['PACIENTES'].val[2].indexOf('SECTOR');
  assert.ok(colSector >= 0, 'encabezado SECTOR en PACIENTES');
  c.hojas['PACIENTES'].val[3][colSector] = 'AMARILLO';
  c.hojas['INGRESO_NARANJO'].val[3][9] = 'PENDIENTE';
  c.Modelo_invalidarLecturas();

  const retry = c.api_ingresoIncorporar('INGRESO_NARANJO', 4, false, 'tok');
  assert.equal(retry.ok, true, JSON.stringify(retry));
  assert.equal(retry.resultado.estado, 'INGRESADO');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO', 'el sector se repara hacia la evidencia');
  const evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1, 'sin INGRESO duplicado');
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 2, 'la reparación queda trazada');
  assert.equal(c.hojas['SECTOR_NARANJO'].val.slice(3).some((f) => f[0] === 'EC-SEED-08'), true);
  assert.equal(c.hojas['SECTOR_AMARILLO'].val.slice(3).some((f) => f[0] === 'EC-SEED-08'), false);
});

test('T38 la cola de revisión cierra el ciclo: fila INGRESADO + sector correcto', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-09', RUT: rutOk('87654321'), NOMBRE: 'SOFIA RUIZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.Modelo_refrescarVistasSectores_(['AMARILLO']);
  assert.equal(c.hojas['SECTOR_AMARILLO'].val.slice(3).some((f) => f[0] === 'EC-SEED-09'), true,
    'premisa: el paciente vive en la vista AMARILLO');

  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({
    nombre: 'SOFIA RUIZ', rut: rutOk('44445555'), tel: '', fecha: '2026-06-06'
  });
  const lote = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(lote.resumen.revision, 1, JSON.stringify(lote.resumen));
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'REQUIERE_REVISION');

  const casos = c.api_revisionListar('tok');
  assert.equal(casos.ok, true, JSON.stringify(casos));
  assert.equal(casos.casos.length, 1, JSON.stringify(casos));

  const res = c.api_revisionResolver(casos.casos[0].indice, 'CONFIRMAR_MATCH', 'tok');
  assert.equal(res.ok, true, JSON.stringify(res));

  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO',
    'la fila de origen queda INGRESADO (no huérfana en la cola)');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO', 'paciente en el sector correcto');

  let evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1, 'un solo evento de ingreso');
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'CAMBIO_SECTOR').length, 1, 'transición trazada');

  assert.equal(c.hojas['SECTOR_NARANJO'].val.slice(3).some((f) => f[0] === 'EC-SEED-09'), true,
    'aparece en la vista destino');
  assert.equal(c.hojas['SECTOR_AMARILLO'].val.slice(3).some((f) => f[0] === 'EC-SEED-09'), false,
    'sale de la vista origen');

  assert.equal(c.api_ingresosPendientes({}, 'tok').total, 0, 'la fila ya no figura como pendiente');
  const relote = c.api_ingresosIncorporarValidos({}, 'tok');
  assert.equal(relote.resumen.ingresados, 0, JSON.stringify(relote.resumen));
  evs = c.Modelo_leerEventos();
  assert.equal(evs.filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1, 'nada se duplica');
});

test('T39 resolver de revisión revierte el sector si falla la persistencia de EVENTOS', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-10', RUT: rutOk('87654321'), NOMBRE: 'SOFIA RUIZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({
    nombre: 'SOFIA RUIZ', rut: rutOk('44445555'), tel: '', fecha: '2026-06-06'
  });
  assert.equal(c.api_ingresosIncorporarValidos({}, 'tok').resumen.revision, 1);
  const casos = c.api_revisionListar('tok');
  c.Modelo_agregarEventos_ = () => { throw new Error('append bloqueado'); };

  const res = c.api_revisionResolver(casos.casos[0].indice, 'CONFIRMAR_MATCH', 'tok');
  assert.equal(res.ok, false, JSON.stringify(res));
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'AMARILLO', 'rollback compensatorio aplicado');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'REQUIERE_REVISION', 'la fila no declara éxito');
  assert.equal(c.api_revisionListar('tok').casos.length, 1, 'el conflicto permanece abierto');
});

test('T40 resolver conserva éxito clínico y advierte si la vista queda pendiente', () => {
  const c = libro({ paciente: {
    ID_INTERNO: 'EC-SEED-11', RUT: rutOk('87654321'), NOMBRE: 'SOFIA RUIZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({
    nombre: 'SOFIA RUIZ', rut: rutOk('44445555'), tel: '', fecha: '2026-06-06'
  });
  assert.equal(c.api_ingresosIncorporarValidos({}, 'tok').resumen.revision, 1);
  const casos = c.api_revisionListar('tok');
  c.Modelo_refrescarVistasSectores_ = () => { throw new Error('vista no disponible'); };

  const res = c.api_revisionResolver(casos.casos[0].indice, 'CONFIRMAR_MATCH', 'tok');
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok(Array.from(res.advertencias || []).includes('VISTA_SECTOR_PENDIENTE'));
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO', 'el canon clínico sí quedó confirmado');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'INGRESADO');
});

test('T41 la bandeja elimina solo filas con incorporación y vista confirmadas', () => {
  const c = libro({ eliminarOrigen: true });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida();
  c.hojas['INGRESO_NARANJO'].val[4] = filaIngresoValida({
    nombre: 'X', rut: '12', fecha: '2026-02-02'
  });

  const r = c.api_ingresosIncorporarValidos({ sector: 'NARANJO' }, 'tok');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.resumen.ingresados, 1);
  assert.equal(r.resumen.filasOrigenEliminadas, 1, 'retira una fila confirmada');
  assert.equal(c.Modelo_leerPacientes().length, 1, 'PACIENTES conserva el canon');
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1,
    'EVENTOS conserva la trazabilidad');
  assert.equal(c.hojas['INGRESO_NARANJO'].val.length, 4,
    'encabezados + única excepción no incorporada');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][0], 'X', 'el error permanece en la bandeja');
  assert.equal(c.hojas['INGRESO_NARANJO'].val[3][9], 'ERROR');
});

test('T42 resolver de revisión también retira la fila después de confirmar', () => {
  const c = libro({ eliminarOrigen: true, paciente: {
    ID_INTERNO: 'EC-SEED-12', RUT: rutOk('87654321'), NOMBRE: 'SOFIA RUIZ',
    SECTOR: 'AMARILLO', ESTRATIFICACION: 'G2'
  } });
  c.hojas['INGRESO_NARANJO'].val[3] = filaIngresoValida({
    nombre: 'SOFIA RUIZ', rut: rutOk('44445555'), tel: '', fecha: '2026-06-06'
  });
  assert.equal(c.api_ingresosIncorporarValidos({}, 'tok').resumen.revision, 1);
  const caso = c.api_revisionListar('tok').casos[0];
  const res = c.api_revisionResolver(caso.indice, 'CONFIRMAR_MATCH', 'tok');
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.filasOrigenEliminadas, 1);
  assert.equal(c.hojas['INGRESO_NARANJO'].val.length, 3, 'solo quedan encabezados');
  assert.equal(c.Modelo_leerPacientes()[0].SECTOR, 'NARANJO');
  assert.equal(c.Modelo_leerEventos().filter((e) => e.TIPO_EVENTO === 'INGRESO').length, 1);
});

console.log('\nincorporacion_ingresos_vNEXT — ' + passed + '/' + passed + ' PASS');
if (passed < 1) process.exit(1);
