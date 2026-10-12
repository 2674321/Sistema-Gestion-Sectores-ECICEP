#!/usr/bin/env node
// vNEXT — DEC-104: ningún campo aceptado por el contrato se pierde al persistir.
// E2E real: payload → Captura_v2_validar → normalizadoAInterno → entrega contra
// hojas en memoria → pipeline → lectura de vuelta de PACIENTES/EVENTOS.
// No se comprueba el payload: se comprueba el dato leído de la hoja.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const CATALOGO = ['MEDICO/A', 'ENFERMERA/O', 'TENS', 'MATRONA/O', 'PSICOLOGO/A', 'ASISTENTE SOCIAL'];

// ── Hoja en memoria: getRange/setValues por rango, layout plano y visual ──
function hojaFake(vals) {
  const set = (r, c, v) => {
    while (vals.length < r) vals.push([]);
    const row = vals[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  };
  const mk = (r, c, nr, nc) => ({
    getValues: () => Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => (vals[r - 1 + i] || [])[c - 1 + j] ?? '')),
    setValues: a => a.forEach((row, i) => row.forEach((v, j) => set(r + i, c + j, v))),
    setValue: v => set(r, c, v),
    setNumberFormat: () => {}, setFontWeight: () => {}, setBackground: () => {},
    setFontColor: () => {}, clearContent: () => {},
    getNumRows: () => nr, getNumColumns: () => nc,
    // Búsqueda de duplicados por marca en INGRESO_* (idempotencia §22).
    createTextFinder: buscado => ({
      matchEntireCell: () => ({
        findNext: () => {
          for (let i = 0; i < nr; i++) {
            const v = (vals[r - 1 + i] || [])[c - 1];
            if (String(v) === String(buscado)) return { getRow: () => r + i, getValue: () => v };
          }
          return null;
        }
      })
    })
  });
  return {
    get val() { return vals; },
    getName: () => vals.__nombre || '',
    getLastRow: () => vals.length,
    getLastColumn: () => vals.reduce((m, r) => Math.max(m, r.length), 0),
    getMaxRows: () => 1000,
    getMaxColumns: () => vals.reduce((m, r) => Math.max(m, r.length), 0),
    getRange: (a, b, c, d) => {
      if (typeof a === 'number') return mk(a, b, c ?? 1, d ?? 1);
      const m = /^([A-Z]+)(\d+)$/.exec(String(a));
      let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
      return mk(Number(m[2]), n, 1, 1);
    },
    getDataRange: () => mk(1, 1, vals.length || 1, Math.max(1, vals.reduce((m, r) => Math.max(m, r.length), 0))),
    // El guard de esquema de EVENTOS debe poder añadir columnas en libros viejos.
    insertColumnsAfter: (col, n) => {
      for (const fila of vals) for (let i = 0; i < n; i++) fila.splice(col + i, 0, '');
    },
    deleteColumns: () => {}
  };
}

function libro() {
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, JSON, Date, Math });
  const orden = ['src/00_Config.js', 'src/01_Utilidades.js', 'src/02_Normalizacion.js',
    'src/03_Fuentes.js', 'src/04_Identificacion.js', 'src/13_Eventos.js', 'src/14_REM.js',
    'src/15_RemExcel.js', 'src/16_Amarillo.js', 'src/17_Hojas.js', 'src/18_Calidad.js',
    'src/12_Ingresos.js', 'src/24_Formulario.js', 'src/25_Entorno.js', 'src/06_Modelo.js',
    'src/26_Captura.js', 'src/29_ActualizacionCaptura.js', 'src/31_Ficha.js'];
  const resto = readdirSync(new URL('src/', root)).filter(f => /\.(js|gs)$/.test(f)).sort()
    .map(f => 'src/' + f).filter(f => orden.indexOf(f) === -1);
  for (const f of orden.concat(resto)) vm.runInContext(read(f), ctx, { filename: f });

  ctx.Session = { getActiveUser: () => ({ getEmail: () => 'tester@ecicep.cl' }) };
  ctx.Log_info = () => {};
  ctx.Log_error = (...a) => { if (process.env.DEBUG) console.log('   [log]', ...a); };
  ctx.Log_warning = () => {}; ctx.Log_flush = () => {};
  ctx.HVis_formatearIngresos = () => ({ ok: true, migrado: false });
  ctx.hojas = {};
  const E = e => vm.runInContext(e, ctx);

  // EVENTOS/CONFLICTOS/CONFIG: encabezados en la fila 1 (hoja plana).
  const plana = (nombre, headers) => {
    const f = hojaFake([headers.slice()]); f.__nombre = nombre; ctx.hojas[nombre] = f; return f;
  };
  // INGRESO_*/SECTOR_*/PACIENTES: banner + encabezados (datos desde la fila 4).
  const visual = (nombre, headers) => {
    const vals = [[], [], headers.slice()]; vals.__nombre = nombre;
    const f = hojaFake(vals); ctx.hojas[nombre] = f; return f;
  };

  visual('PACIENTES', E('MODELO_PACIENTE.map(function(c){return c.campo;})'));
  plana('EVENTOS', E('COLUMNAS_EVENTOS'));
  visual('INGRESO_NARANJO', E('INGRESO_COLUMNAS'));
  visual('INGRESO_AMARILLO', E('INGRESO_COLUMNAS'));
  visual('INGRESO_VERDE', E('INGRESO_COLUMNAS'));
  visual('SECTOR_NARANJO', E('COLUMNAS_SECTOR_VISTA'));
  visual('SECTOR_AMARILLO', E('COLUMNAS_SECTOR_VISTA'));
  visual('SECTOR_VERDE', E('COLUMNAS_SECTOR_VISTA'));
  plana('CONFLICTOS', ['FECHA_DETECCION', 'TIPO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'DETALLE',
    'FUENTE_A', 'FUENTE_B', 'ESTADO_REVISION', 'RESUELTO_POR']);
  plana('CONFIG', ['CLAVE', 'VALOR', 'DESCRIPCION']);
  plana('PROFESIONALES', E('COLUMNAS_PROFESIONALES'));
  plana('RESPONSABLES', E('COLUMNAS_RESPONSABLES'));

  ctx.Modelo_ss = () => ({ getSheetByName: n => ctx.hojas[n] || null, getSheets: () => Object.values(ctx.hojas) });
  // Necesario: sin SpreadsheetApp, Ingresos_escribirEstados_ no escribe nada.
  ctx.SpreadsheetApp = {
    getActiveSpreadsheet: () => null, openById: () => null,
    BorderStyle: { SOLID_THICK: 1, SOLID: 2, DOTTED: 3, DASHED: 4, DOUBLE: 5 },
    WrapStrategy: { WRAP: 1, OVERFLOW: 2, CLIP: 3, CLAMP: 4 },
    newDataValidation: () => ({ build: () => ({}) }),
    newConditionalFormatRule: () => ({ build: () => ({}) })
  };
  ctx.Captura_v2_catalogo = () => CATALOGO;
  ctx.Captura_v2_ahora = () => '2026-09-04 10:00:00';
  ctx.Ingresos_eliminarOrigenConfirmado_ = () => ({ eliminadas: 0 });
  ctx.Hojas_asegurarCapacidadGestionada_ = () => {};
  return ctx;
}

const RUT_A = '11111111-1';
const RUT_B = '22222222-2';
const hex = c => 'Cp2-' + c.repeat(32);

function payload(over = {}) {
  return Object.assign({
    captureId: hex('a'),
    accion: 'nuevoIngreso',
    rut: RUT_A,
    nombre: 'JUAN PÉREZ GÓMEZ',
    sexo: 'M',
    fechaNacimiento: '1988-03-12',
    sector: 'AMARILLO',
    fechaIngreso: '2026-09-01',
    estratificacion: 'G2',
    telefonos: '990600712',
    profesional: 'MATRONA/O',
    profesionalSecundario: 'MEDICO/A',
    observaciones: 'Ingreso por control'
  }, over);
}

// Envío por el MISMO entrypoint que usa WebApp_capturarEnviar: valida,
// persiste el registro durable, ejecuta la entrega con reintentos y aplica los
// hooks post-entrega (agenda, contacto). El trailer se guarda en memoria.
function enviar(ctx, p) {
  const registros = ctx.__registros || (ctx.__registros = new Map());
  const c = Object.assign({}, ctx.Captura_v2_ctx('tok'), {
    usuario: 'tester@ecicep.cl',
    ahora: () => '2026-09-04 10:00:00',
    maxReintentos: 3,
    catalogo: CATALOGO,
    buscarRegistro: cid => registros.get(cid) || null,
    persistirRegistro: reg => {
      if (registros.has(reg.captureId)) return { ok: false, motivo: 'DUPLICADO' };
      registros.set(reg.captureId, JSON.parse(JSON.stringify(reg)));
      return { ok: true };
    },
    actualizarTrailer: (cid, cambios) => {
      const reg = registros.get(cid);
      if (!reg) return { ok: false, motivo: 'SIN_REGISTRO' };
      Object.assign(reg, cambios);
      return { ok: true };
    }
  });
  const res = ctx.Captura_v2_enviar(p, c);
  if (process.env.DEBUG) console.log('   [dbg] ' + JSON.stringify(res.data || res.errors));
  assert.equal(res.ok, true, 'enviar: ' + JSON.stringify(res.errors || res));
  return res.data;
}

function eventoIngreso(ctx) {
  return ctx.Modelo_leerEventos().find(e => e.TIPO_EVENTO === 'INGRESO');
}

let n = 0;
function t(nombre, fn) {
  n++;
  try { fn(); console.log('[PASS] T' + n + ' ' + nombre); }
  catch (e) {
    console.log('[FAIL] T' + n + ' ' + nombre);
    console.log('   CAUSA: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 — profesionalSecundario: el campo aceptado por el contrato llega al EVENTO
// ─────────────────────────────────────────────────────────────────────────────
t('T1 profesionalSecundario persiste en EVENTOS.PROFESIONAL2 (no se pierde)', () => {
  const c = libro();
  const r = enviar(c, payload());
  assert.equal(r.estado, 'PROCESADO', JSON.stringify(r));
  const ev = eventoIngreso(c);
  assert.ok(ev, 'evento INGRESO creado');
  assert.equal(ev.PROFESIONAL, 'MATRONA/O', 'profesional principal');
  assert.equal(ev.PROFESIONAL2, 'MEDICO/A', 'profesional secundario persistido');
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — dos campos separados, no concatenados
// ─────────────────────────────────────────────────────────────────────────────
t('T2 PROFESIONAL y PROFESIONAL2 son columnas independientes (sin concatenar)', () => {
  const c = libro();
  enviar(c, payload());
  const ev = eventoIngreso(c);
  const cols = vm.runInContext('COLUMNAS_EVENTOS', c);
  assert.ok(cols.indexOf('PROFESIONAL') < cols.indexOf('PROFESIONAL2'),
    'PROFESIONAL2 va después de PROFESIONAL');
  assert.ok(!String(ev.PROFESIONAL).includes('MEDICO/A'), 'no se concatena en el principal');
  assert.equal(ev.PROFESIONAL2, 'MEDICO/A');
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — sin secundario no se inventa valor
// ─────────────────────────────────────────────────────────────────────────────
t('T3 ausencia de profesionalSecundario deja PROFESIONAL2 vacío', () => {
  const c = libro();
  const p = payload(); delete p.profesionalSecundario;
  enviar(c, p);
  const ev = eventoIngreso(c);
  assert.equal(ev.PROFESIONAL2, '', 'no debe inventarse un valor');
  assert.equal(ev.PROFESIONAL, 'MATRONA/O');
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — registrarControl
// ─────────────────────────────────────────────────────────────────────────────
t('T4 registrarControl persiste ambos profesionales en su evento', () => {
  const c = libro();
  enviar(c, payload());
  const r = enviar(c, {
    captureId: hex('1'), accion: 'registrarControl', rut: RUT_A,
    fechaEvento: '2026-09-15', profesional: 'ENFERMERA/O',
    profesionalSecundario: 'TENS', observaciones: 'Control de rutina'
  });
  assert.equal(r.estado, 'PROCESADO', JSON.stringify(r));
  const ev = c.Modelo_leerEventos().find(e => e.TIPO_EVENTO === 'CONTROL');
  assert.ok(ev, 'evento CONTROL creado');
  assert.equal(ev.PROFESIONAL, 'ENFERMERA/O');
  assert.equal(ev.PROFESIONAL2, 'TENS', 'secundario persistido en CONTROL');
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — registrarSeguimiento
// ─────────────────────────────────────────────────────────────────────────────
t('T5 registrarSeguimiento persiste ambos profesionales en su evento', () => {
  const c = libro();
  enviar(c, payload());
  const r = enviar(c, {
    captureId: hex('2'), accion: 'registrarSeguimiento', rut: RUT_A,
    fechaEvento: '2026-09-20', profesional: 'PSICOLOGO/A',
    profesionalSecundario: 'TENS'
  });
  assert.equal(r.estado, 'PROCESADO', JSON.stringify(r));
  const ev = c.Modelo_leerEventos().find(e => e.TIPO_EVENTO === 'SEGUIMIENTO');
  assert.ok(ev, 'evento SEGUIMIENTO creado');
  assert.equal(ev.PROFESIONAL2, 'TENS');
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — cada evento conserva SU propio par (no hay sangrado entre eventos)
// ─────────────────────────────────────────────────────────────────────────────
t('T6 eventos distintos conservan su propia dupla de profesionales', () => {
  const c = libro();
  enviar(c, payload({ profesional: 'MATRONA/O', profesionalSecundario: 'MEDICO/A' }));
  enviar(c, { captureId: hex('3'), accion: 'registrarControl', rut: RUT_A,
    fechaEvento: '2026-09-15', profesional: 'ENFERMERA/O', profesionalSecundario: 'TENS' });
  const evs = c.Modelo_leerEventos();
  const ing = evs.find(e => e.TIPO_EVENTO === 'INGRESO');
  const ctl = evs.find(e => e.TIPO_EVENTO === 'CONTROL');
  assert.equal(ing.PROFESIONAL2, 'MEDICO/A');
  assert.equal(ctl.PROFESIONAL2, 'TENS');
  assert.notEqual(ing.PROFESIONAL, ctl.PROFESIONAL);
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 — actualizarDatos (payload V4 del editor) con secundario propio
// ─────────────────────────────────────────────────────────────────────────────
t('T7 actualizarDatos persiste PROFESIONAL2 del evento no-INGRESO', () => {
  const c = libro();
  enviar(c, payload());
  const idInterno = c.Modelo_leerPacientes()[0].ID_INTERNO;
  const r = enviar(c, {
    captureId: 'Cp4-' + '4'.repeat(32),
    accion: 'actualizarDatos', rut: RUT_A,
    profesional: 'MEDICO/A', profesionalSecundario: 'MATRONA/O',
    observaciones: 'Ajuste de ficha',
    actualizacion: {
      id: idInterno, rutOriginal: RUT_A,
      campos: { OBSERVACIONES: { anterior: 'Ingreso por control', valor: 'Ingreso por control · ajuste' } },
      atenciones: [{ anterior: '', fecha: '2026-09-25', idEvento: '', modo: 'REGISTRAR', tipo: 'CONTROL' }]
    }
  });
  assert.equal(r.estado, 'PROCESADO', JSON.stringify(r));
  const ev = c.Modelo_leerEventos().find(e => e.PROFESIONAL2 === 'MATRONA/O' && e.TIPO_EVENTO !== 'INGRESO');
  assert.ok(ev, 'evento de actualización con secundario; tipos=' +
    JSON.stringify(c.Modelo_leerEventos().map(e => e.TIPO_EVENTO)));
  assert.equal(ev.PROFESIONAL, 'MEDICO/A');
});

// T8 — teléfono simple
// ─────────────────────────────────────────────────────────────────────────────
t('T8 teléfono simple se guarda limpio en TELEFONO(S)', () => {
  const c = libro();
  enviar(c, payload({ telefonos: '990600712' }));
  const pac = c.Modelo_leerPacientes()[0];
  assert.equal(pac.TELEFONOS, '990600712');
  assert.ok(!String(pac.TELEFONO_OBS || '').trim(), 'sin estructura no hay observaciones');
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 — REGRESIÓN: teléfono humano con espacios NO puede perderse
// ─────────────────────────────────────────────────────────────────────────────
t('T9 teléfono escrito con espacios conserva el número (no se descarta)', () => {
  const c = libro();
  enviar(c, payload({ telefonos: '9 6060 0712' }));
  const pac = c.Modelo_leerPacientes()[0];
  assert.equal(pac.TELEFONOS, '960600712',
    'el número debe quedar completo; antes se perdía entero. recibido: ' + JSON.stringify(pac.TELEFONOS));
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 — prefijo internacional con espacios
// ─────────────────────────────────────────────────────────────────────────────
t('T10 prefijo internacional con espacios conserva el número local', () => {
  const c = libro();
  enviar(c, payload({ telefonos: '+56 9 9060 0712' }));
  const pac = c.Modelo_leerPacientes()[0];
  assert.equal(pac.TELEFONOS, '990600712',
    'prefijo 56 y numero completo; recibido: ' + JSON.stringify(pac.TELEFONOS));
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 — REGLA DE ORO: lo que sí se descarta queda anotado, nunca en silencio
// ─────────────────────────────────────────────────────────────────────────────
t('T11 todo fragmento descartado queda anotado en TELEFONO_OBS', () => {
  const c = libro();
  // '9 / 59355587': el 9 no es un teléfono; el otro sí. Nada puede ser silencioso.
  enviar(c, payload({ telefonos: '9 / 59355587' }));
  const pac = c.Modelo_leerPacientes()[0];
  assert.equal(pac.TELEFONOS, '59355587', 'el número válido se conserva');
  const obs = String(pac.TELEFONO_OBS || '');
  assert.ok(obs.includes('NUMERO DESCARTADO'),
    'el descarte debe quedar anotado; recibido TELEFONO_OBS=' + JSON.stringify(obs));
});

// ─────────────────────────────────────────────────────────────────────────────
// T12 — anotación textual del contacto
// ─────────────────────────────────────────────────────────────────────────────
t('T12 anotación textual del teléfono (ESPOSO) queda persistida', () => {
  const c = libro();
  enviar(c, payload({ telefonos: '921728970 ESPOSO' }));
  const pac = c.Modelo_leerPacientes()[0];
  assert.equal(pac.TELEFONOS, '921728970');
  assert.ok(String(pac.TELEFONO_OBS || '').includes('ESPOSO'),
    'la anotación debe persistir; recibido: ' + JSON.stringify(pac.TELEFONO_OBS));
});

// ─────────────────────────────────────────────────────────────────────────────
// T13 — esquema preexistente sin PROFESIONAL2: se añade sin perder eventos
// ─────────────────────────────────────────────────────────────────────────────
t('T13 EVENTOS preexistente sin PROFESIONAL2 se migra sin perder filas', () => {
  const c = libro();
  // Libro real anterior a este cambio: EVENTOS sin la columna.
  const viejo = vm.runInContext('COLUMNAS_EVENTOS', c).filter(x => x !== 'PROFESIONAL2');
  const vals = [viejo.slice()];
  for (let i = 1; i <= 3; i++) {
    const f = ['EV-VIEJO-' + i, 'EC-VIEJO-' + i, RUT_A, 'JUAN PÉREZ GÓMEZ', 'CONTROL',
      '2026-01-0' + i, 'ENFERMERA/O', 'AMARILLO', 'NARANJO', '2026-01-0' + i];
    while (f.length < viejo.length) f.push('');
    vals.push(f);
  }
  vals.__nombre = 'EVENTOS';
  c.hojas['EVENTOS'] = hojaFake(vals);

  const r = enviar(c, payload());
  assert.equal(r.estado, 'PROCESADO', 'la entrega sigue funcionando tras migrar');

  const cols = c.hojas['EVENTOS'].val[0];
  assert.ok(cols.includes('PROFESIONAL2'), 'la columna se añade');
  assert.equal(cols[cols.length - 1], 'PROFESIONAL2', 'se añade al final, no se intercala');
  assert.deepEqual(Array.from(cols).slice(0, viejo.length), Array.from(viejo), 'el orden previo queda intacto');

  const eventos = c.Modelo_leerEventos();
  assert.equal(eventos.length, 4, '3 eventos previos + 1 nuevo, ninguno perdido');
  const viejos = eventos.filter(e => String(e.ID_EVENTO || '').startsWith('EV-VIEJO'));
  assert.equal(viejos.length, 3, 'los eventos históricos siguen legibles');
  assert.ok(viejos.every(e => !e.PROFESIONAL2), 'históricos sin secundario quedan vacíos');
});

t('T13b la migración de EVENTOS es idempotente (segunda pasada no cambia nada)', () => {
  const c = libro();
  const viejo = vm.runInContext('COLUMNAS_EVENTOS', c).filter(x => x !== 'PROFESIONAL2');
  const vals = [viejo.slice()];
  for (let i = 1; i <= 2; i++) {
    const f = ['EV-VIEJO-' + i, 'EC-VIEJO-' + i, RUT_A, 'JUAN', 'CONTROL',
      '2026-01-0' + i, 'ENFERMERA/O', 'AMARILLO', 'NARANJO', '2026-01-0' + i];
    while (f.length < viejo.length) f.push('');
    vals.push(f);
  }
  vals.__nombre = 'EVENTOS';
  c.hojas['EVENTOS'] = hojaFake(vals);

  const p1 = c.Modelo_asegurarEsquemaEventos_();
  assert.equal(p1.ok, true, 'la primera pasada migra');
  assert.equal(p1.migrada, true, 'la primera pasada informa migración');
  assert.deepEqual(Array.from(p1.insertadas), ['PROFESIONAL2']);
  const filasTrasP1 = JSON.stringify(c.hojas['EVENTOS'].val);

  const p2 = c.Modelo_asegurarEsquemaEventos_();
  assert.equal(p2.ok, true, 'la segunda pasada es correcta');
  assert.notEqual(p2.migrada, true, 'la segunda pasada no vuelve a migrar');
  assert.deepEqual(Array.from(p2.insertadas || []), [], 'no reinserta la columna');
  assert.equal(JSON.stringify(c.hojas['EVENTOS'].val), filasTrasP1,
    'ninguna fila histórica se reescribe en la segunda pasada');
});

// ─────────────────────────────────────────────────────────────────────────────
// T14 — idempotencia: el reintento con coordenadas previas no duplica
// ─────────────────────────────────────────────────────────────────────────────
t('T14 reintento con coordenadas previas no duplica paciente ni evento', () => {
  const c = libro();
  const r1 = enviar(c, payload());
  assert.equal(r1.estado, 'PROCESADO', JSON.stringify(r1));
  const r2 = enviar(c, payload());
  assert.equal(c.Modelo_leerPacientes().length, 1, 'un solo paciente');
  assert.equal(c.Modelo_leerEventos().filter(e => e.TIPO_EVENTO === 'INGRESO').length, 1,
    'un solo evento de ingreso');
  assert.equal(r2.estado, 'PROCESADO', 'el reintento es consistente');
});

// ─────────────────────────────────────────────────────────────────────────────
// T15 — dos altas no colisionan de identidad ni cruzan profesionales
// ─────────────────────────────────────────────────────────────────────────────
t('T15 dos altas con profesionales distintos no colisionan ni se cruzan', () => {
  const c = libro();
  enviar(c, payload({ rut: RUT_A, profesional: 'MATRONA/O', profesionalSecundario: 'MEDICO/A' }));
  enviar(c, payload({ captureId: hex('5'), rut: RUT_B,
    nombre: 'MARÍA LÓPEZ DÍAZ', profesional: 'TENS', profesionalSecundario: 'PSICOLOGO/A' }));
  const pacs = c.Modelo_leerPacientes();
  assert.equal(pacs.length, 2, 'dos pacientes');
  const ids = pacs.map(p => p.ID_INTERNO);
  assert.equal(new Set(ids).size, 2, 'IDs internos distintos: ' + JSON.stringify(ids));
  const evs = c.Modelo_leerEventos().filter(e => e.TIPO_EVENTO === 'INGRESO');
  assert.equal(evs.length, 2);
  // Array.from: los objetos vienen del realm del vm y deepStrictEqual compara
  // prototipos; un array de otro realm nunca es igual a uno de este.
  const par = Array.from(evs).map(e => [e.ID_INTERNO, e.PROFESIONAL, e.PROFESIONAL2]).sort();
  assert.deepEqual(Array.from(par).map(x => x[2]).sort(), ['MEDICO/A', 'PSICOLOGO/A'],
    'cada evento conserva SU secundario, sin cruce; recibido ' + JSON.stringify(par));
});

// ─────────────────────────────────────────────────────────────────────────────
// T16 — el par completo sobrevive en la fila INGRESO (DUPLA INGRESO)
// ─────────────────────────────────────────────────────────────────────────────
t('T16 la fila INGRESO conserva la dupla de profesionales', () => {
  const c = libro();
  enviar(c, payload());
  const ing = c.hojas['INGRESO_AMARILLO'];
  const fila = ing.val[ing.val.length - 1];
  const dupla = String(fila[7]);
  assert.ok(dupla.includes('MATRONA/O') && dupla.includes('MEDICO/A'),
    'DUPLA INGRESO debe contener ambos: ' + JSON.stringify(dupla));
});

console.log('Captura vNEXT · persistencia de campos: ' + n + ' casos ejecutados');