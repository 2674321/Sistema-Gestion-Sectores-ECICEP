// Harness v255 — extiende el harness v254 con:
//  · hoja de datos real (FORM_RESPUESTAS con filas y trailer),
//  · CacheService con TTL (dedupe por CLIENT_REQUEST_ID / recuperación de ACK),
//  · helpers para construir respuestas durables y filas de cola.
//
// No reimplementa el canal: usa SIEMPRE las funciones productivas cargadas por
// el harness v254. Los builders son sólo andamiaje de prueba.
import { createHarness, payloadFor } from './forms_v254_harness.mjs';

class MockDataSheet {
  constructor(headers) {
    this.headers = headers.slice();
    this.rows = [];            // filas de datos (sin encabezado)
    this.hidden = false;
  }
  hideSheet() { this.hidden = true; }
  getLastColumn() { return this.headers.length; }
  getLastRow() { return this.rows.length + 1; }
  getRange(row, col, nrows, ncols) {
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < nrows; r++) {
          const rr = (row - 1) + r;
          const src = rr === 0 ? self.headers : (self.rows[rr - 1] || []);
          const line = [];
          for (let c = 0; c < ncols; c++) {
            const v = src[(col - 1) + c];
            line.push(v === undefined ? '' : v);
          }
          out.push(line);
        }
        return out;
      },
      setValues(values) {
        for (let r = 0; r < values.length; r++) {
          const rr = (row - 1) + r;
          if (rr === 0) { self.headers = values[r].slice(); continue; }
          const line = self.rows[rr - 1] || (self.rows[rr - 1] = []);
          for (let c = 0; c < values[r].length; c++) line[(col - 1) + c] = values[r][c];
        }
        return this;
      }
    };
  }
}

function makeCache() {
  const store = new Map();
  return {
    _store: store,
    get(k) {
      const e = store.get(k);
      if (!e) return null;
      if (e.exp && Date.now() > e.exp) { store.delete(k); return null; }
      return e.v;
    },
    put(k, v, ttl) {
      store.set(String(k), { v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 });
    },
    remove(k) { store.delete(String(k)); }
  };
}

/** Crea el harness v255 (usa el harness v254 como base). */
export function createHarness255(opts = {}) {
  const h = createHarness(opts);
  // Reloj cercano a "ahora" para que la recuperación de ACK (ventana 6 h)
  // encuentre las respuestas recientes.
  h.form.clock = Date.now() - 60 * 1000;
  const cache = makeCache();
  h.cache = cache;
  h.c.CacheService = { getScriptCache: () => cache };
  const headers = (h.c.FORM_RESPUESTAS_COLUMNAS || []).slice();
  const sheet = new MockDataSheet(headers);
  h.dataSheet = sheet;
  h.c.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: n => n === h.c.HOJAS.FORM_RESPUESTAS ? sheet : null,
      insertSheet: () => sheet
    })
  };
  h.colIndex = (nombre) => headers.indexOf(nombre);
  return h;
}

/** Construye una fila de FORM_RESPUESTAS por nombre de columna. */
export function filaCola(h, mapa) {
  const row = h.dataSheet.headers.map(() => '');
  for (const k of Object.keys(mapa)) {
    const i = h.colIndex(k);
    if (i >= 0) row[i] = mapa[k];
  }
  return row;
}

/** Agrega una fila de cola. Si no se entrega RESPONSE_ID, se calcula por
 *  captureId a partir del formId + responseId del Form. */
export function agregarFila(h, mapa) {
  const row = filaCola(h, mapa);
  h.dataSheet.rows.push(row);
  return { fila: h.dataSheet.rows.length, row };
}

export function captureIdDe(h, responseId) {
  return h.c.CapturaIngress_captureId_(h.form.id, responseId);
}

/** Prepara una respuesta del Form con sus item responses (incluye transporte). */
export function respuestaConCampos(h, action, i, { clientRequestId = '', source = '', responseId = '' } = {}) {
  const p = payloadFor(action, i);
  const r = h.c.Form_crearRespuestaDesdePayloadWeb_(Object.assign({}, p, {
    clientRequestId: clientRequestId || undefined, source: source || undefined
  }));
  if (!r.ok) throw new Error('crearRespuesta falló: ' + JSON.stringify(r));
  const resp = h.form.responses[h.form.responses.length - 1];
  if (responseId) resp.id = responseId;
  return resp;
}
