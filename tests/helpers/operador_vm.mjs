// Helper de pruebas v255 — contexto VM con la app cargada y mocks de GAS.
// Permite ejercitar captura pública y gateway de operador sin tocar Google.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

export const sha256Hex = s => crypto.createHash('sha256').update(String(s)).digest('hex');

export function crearContextoOperador() {
  const src = new URL('../../src/', import.meta.url);
  const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  for (const f of readdirSync(src).filter(x => /\.(?:js|gs)$/.test(x)).sort()) {
    vm.runInContext(readFileSync(new URL(f, src), 'utf8'), c, { filename: f });
  }

  const store = new Map();
  const cache = {
    _store: store,
    get(k) { const e = store.get(String(k)); if (!e) return null; if (e.exp && Date.now() > e.exp) { store.delete(String(k)); return null; } return e.v; },
    put(k, v, ttl) { store.set(String(k), { v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 }); },
    remove(k) { store.delete(String(k)); }
  };
  let cacheOn = true;
  c.CacheService = { getScriptCache: () => (cacheOn ? cache : null) };
  const props = new Map();
  c.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => props.get(k) || '',
    setProperty: (k, v) => props.set(k, String(v)),
    deleteProperty: k => props.delete(k)
  }) };
  c.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: (alg, txt) => Array.from(crypto.createHash('sha256').update(String(txt)).digest()),
    getUuid: () => crypto.randomUUID(),
    formatDate: () => ''
  };
  c.Session = { getActiveUser: () => ({ getEmail: () => 'operador@ecicep.cl' }) };
  c.ContentService = { createTextContent: () => ({}), createTextOutput: t => ({ tipo: 'text', t }) };
  c.HtmlService = {
    createTemplateFromFile: n => {
      const t = { archivo: n, getCode: () => '' };
      t.evaluate = () => ({ tipo: 'html', vars: t, setTitle() { return this; }, addMetaTag() { return this; } });
      return t;
    }
  };

  return {
    c, cache, props,
    setCacheOn(v) { cacheOn = !!v; },
    get cacheOn() { return cacheOn; }
  };
}
