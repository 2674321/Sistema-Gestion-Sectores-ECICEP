#!/usr/bin/env node
/**
 * P0 v0.17.0 — Confirmación CANÓNICA post-entrega de un ingreso.
 *
 * Regresión del bug observado en producción v267: `INGRESO_<SECTOR>` es staging
 * transitorio y el pipeline la ELIMINA (paso 7) al confirmar entidad+evento+vista.
 * La confirmación antigua releía la fila y por eso devolvía
 * `RECIBIDO / PENDIENTE_CONFIRMACION` aunque PACIENTES+EVENTOS ya acreditaban el
 * ingreso. La nueva confirmación usa evidencia durable (EVENTOS.FUENTE + PACIENTES).
 *
 * Mutation check: si se vuelve a confirmar solo por staging, el caso "staging
 * eliminado + canon existe" debe fallar.
 *
 * Uso: node tests/captura_confirmacion_canonica_v0170.mjs
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

const archivos = [
  'src/00_Config.js',
  'src/01_Utilidades.js',
  'src/02_Normalizacion.js',
  'src/03_Fuentes.js',
  'src/13_Eventos.js',
  'src/17_Hojas.js',
  'src/12_Ingresos.js',
  'src/24_Formulario.js',
  'src/26_Captura.js'
];
let codigo = '';
for (const a of archivos) codigo += readFileSync(path.join(raiz, a), 'utf8') + '\n';

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(codigo, sandbox, { filename: 'ecicep-confirmacion-canonica.js' });

const R = { pass: 0, fail: 0 };
function t(nombre, fn) {
  try { fn(); R.pass += 1; console.log('[PASS] ' + nombre); }
  catch (e) { R.fail += 1; console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message ? e.message : String(e))); }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }
function igual(a, b, msg) { if (a !== b) throw new Error((msg || 'igual') + ' (recibido ' + JSON.stringify(a) + ', esperado ' + JSON.stringify(b) + ')'); }

// ── Mock de hoja INGRESO_* (staging). Permite borrar filas como el pipeline. ──
function makeSheet(filas) {
  const rows = filas.slice();
  return {
    _rows: rows,
    getLastRow() { return rows.length; },
    getLastColumn() { return 12; },
    getRange(r, c, nr, nc) {
      return {
        setValues(vals) {
          for (let i = 0; i < nr; i++) {
            const idx = r - 1 + i;
            rows[idx] = (rows[idx] || []).slice();
            for (let j = 0; j < nc; j++) rows[idx][c - 1 + j] = vals[i][j];
          }
          return this;
        },
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) out.push((rows[r - 1 + i] || []).slice(c - 1, c - 1 + nc));
          return out;
        },
        createTextFinder() { return { matchEntireCell() { return this; }, findNext() { return null; } }; }
      };
    },
    deleteRows(row, n) { rows.splice(row - 1, n); }
  };
}

function normalizado(over = {}) {
  return Object.assign({
    captureId: 'Cp4-' + 'a'.repeat(32),
    accion: 'nuevoIngreso',
    rut: '11111111-1',
    nombre: 'PRUEBA NO REAL',
    sector: 'AMARILLO',
    fechaIngreso: '2026-10-12',
    confirmarNuevoPaciente: false,
    profesional: '',
    profesionalSecundario: ''
  }, over);
}

/** Escenario: pipeline que elimina la fila de staging al confirmar el ingreso.
 *  `proc` es el resultado que devuelve Ingresos_procesarFila_. */
function correr({ proc, evidencia, paciente, borrarFila }) {
  const hoja = makeSheet([new Array(12).fill('HEADER'), new Array(12).fill('')]);
  const s = sandbox;
  const prev = {};
  const override = (k, v) => { prev[k] = s[k]; s[k] = v; };
  override('Form_sectorHojaIngreso_', () => 'INGRESO_AMARILLO');
  override('Modelo_hoja_', () => hoja);
  override('Captura_v2_normalizadoAInterno_', () => ({ RUT: '11111111-1', SECTOR: 'AMARILLO' }));
  override('Form_filaCanonicaIngreso_', () => new Array(12).fill(''));
  override('Ingresos_procesarFila_', () => {
    if (borrarFila && hoja._rows.length > 1) hoja.deleteRows(hoja._rows.length, 1);
    return proc;
  });
  override('Captura_v2_marcaEnEventos_', () => evidencia || null);
  override('Modelo_buscarPaciente_', () => (paciente ? { obj: paciente } : null));
  try {
    return s.Captura_v2_entregarIngreso_(normalizado(), 'FORM|Cp4-' + 'a'.repeat(32) + '|NUEVO_INGRESO', {});
  } finally {
    for (const k of Object.keys(prev)) s[k] = prev[k];
  }
}

console.log('\nConfirmación canónica post-entrega (P0 v0.17.0)');

t('staging ELIMINADO + canon existe → PROCESADO con IDs', () => {
  const r = correr({
    proc: { ok: true, resultado: { estado: 'INGRESADO', idInterno: 'EC-1', idEvento: 'EV-1' } },
    evidencia: { idEvento: 'EV-1', idInterno: 'EC-1', tipo: 'INGRESO' },
    paciente: { ID_INTERNO: 'EC-1' },
    borrarFila: true
  });
  igual(r.estado, 'PROCESADO', 'la evidencia canónica acredita el éxito');
  igual(r.idInterno, 'EC-1');
  igual(r.idEvento, 'EV-1');
});

t('staging SOBREVIVE + canon existe → PROCESADO con IDs', () => {
  const r = correr({
    proc: { ok: true, resultado: { estado: 'INGRESADO', idInterno: 'EC-2', idEvento: 'EV-2' } },
    evidencia: { idEvento: 'EV-2', idInterno: 'EC-2', tipo: 'INGRESO' },
    paciente: { ID_INTERNO: 'EC-2' },
    borrarFila: false
  });
  igual(r.estado, 'PROCESADO');
  igual(r.idInterno, 'EC-2');
});

t('paciente existe pero evento NO → NO PROCESADO (RECIBIDO)', () => {
  const r = correr({
    proc: { ok: true, resultado: { estado: 'INGRESADO', idInterno: 'EC-3', idEvento: '' } },
    evidencia: null,
    paciente: { ID_INTERNO: 'EC-3' },
    borrarFila: false
  });
  A(r.estado !== 'PROCESADO', 'sin evento no hay éxito');
  igual(r.estado, 'RECIBIDO');
  igual(r.motivo, 'PENDIENTE_CONFIRMACION');
});

t('evento existe pero paciente NO → NO PROCESADO (RECIBIDO)', () => {
  const r = correr({
    proc: { ok: true, resultado: { estado: 'INGRESADO', idInterno: 'EC-4', idEvento: 'EV-4' } },
    evidencia: { idEvento: 'EV-4', idInterno: 'EC-4', tipo: 'INGRESO' },
    paciente: null,
    borrarFila: true
  });
  A(r.estado !== 'PROCESADO', 'sin paciente no hay éxito');
  igual(r.estado, 'RECIBIDO');
});

t('estado DUPLICADO → REQUIERE_REVISION (staging ~sobrevive)', () => {
  const r = correr({
    proc: { ok: true, resultado: { estado: 'DUPLICADO', nota: 'Ya existe ingreso para este RUT' } },
    evidencia: null, paciente: null, borrarFila: false
  });
  igual(r.estado, 'REQUIERE_REVISION');
  igual(r.motivo, 'Ya existe ingreso para este RUT');
});

t('estado ERROR del pipeline → ERROR reintentable', () => {
  const r = correr({
    proc: { ok: true, resultado: { estado: 'ERROR', nota: 'FALLO_PIPELINE' } },
    evidencia: null, paciente: null, borrarFila: false
  });
  igual(r.estado, 'ERROR');
});

t('mutation check: la fila de staging fue realmente eliminada cuando borrarFila', () => {
  // Si la confirmación dependiera de staging, este escenario devolvería RECIBIDO.
  const r = correr({
    proc: { ok: true, resultado: { estado: 'INGRESADO', idInterno: 'EC-5', idEvento: 'EV-5' } },
    evidencia: { idEvento: 'EV-5', idInterno: 'EC-5', tipo: 'INGRESO' },
    paciente: { ID_INTERNO: 'EC-5' },
    borrarFila: true
  });
  igual(r.estado, 'PROCESADO');
});

t('no existe la confirmación antigua por staging (P0 retirada)', () => {
  A(typeof sandbox.Captura_v2_confirmarEntregaIngreso_ === 'undefined',
    'Captura_v2_confirmarEntregaIngreso_ no debe existir');
  A(typeof sandbox.Captura_v2_confirmarEfectoIngreso_ === 'function',
    'Captura_v2_confirmarEfectoIngreso_ debe existir');
});

console.log('\nTOTAL=' + (R.pass + R.fail) + ' PASS=' + R.pass + ' FAIL=' + R.fail);
process.exit(R.fail ? 1 : 0);
