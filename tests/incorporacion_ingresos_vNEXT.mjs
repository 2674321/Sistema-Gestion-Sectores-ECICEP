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
    'Se procesarán únicamente ingresos pendientes válidos.']) {
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
  assert.ok(nItems <= 5, 'menú ECICEP ≤5 items (tiene ' + nItems + ')');

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
  c.WebApp_claveOperador_ = () => 'tokx';
  c._UI_get = () => ({ showSidebar: () => {}, showModalDialog: () => {} });
  c.UI_abrirIngresos();
  assert.equal(tmplModo, 'ingresos', 'sidebar abre en modo ingresos');
  assert.equal(plantillaTitulo, 'Incorporación de ingresos');

  const sb = read('src/Sidebar.html');
  assert.ok(sb.indexOf("modo === 'ficha' || modo === 'ingresos'") !== -1, 'whitelist incluye modo ingresos');
  assert.ok(sb.indexOf("else if(MODO==='ingresos'){") !== -1, 'init auto-abre el panel incorporación');
  assert.ok(sb.indexOf('abrirIngresosPendientes();') !== -1, 'llama al cargador del panel');
});

console.log('\nincorporacion_ingresos_vNEXT — ' + passed + '/' + passed + ' PASS');
if (passed < 1) process.exit(1);