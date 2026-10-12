#!/usr/bin/env node
/**
 * Batería docs v255 (E23 / MEJORA 12) — Runbook y transporte durable completos.
 *
 * Los docs v255 nacieron como placeholders. Este test fija el contenido mínimo
 * exigido: el runbook debe cubrir ACK incierto, worker, backlog, Form down,
 * Sheet down, schema drift, permisos deployer, repair y rollback.
 *
 * Uso: node tests/runbook_completo_v255.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

let PASS = 0, FAIL = 0;
function t(nombre, fn) {
  try { fn(); PASS += 1; console.log('[PASS] ' + nombre); }
  catch (e) { FAIL += 1; console.log('[FAIL] ' + nombre); console.log('   CAUSA: ' + (e && e.message ? e.message : String(e))); }
}
function A(cond, msg) { if (!cond) throw new Error(msg || 'aserto falso'); }

const runbook = readFileSync(path.join(raiz, 'docs/RUNBOOK_CAPTURA.md'), 'utf8');
const transporte = readFileSync(path.join(raiz, 'docs/OPERACION_TRANSPORTE_DURABLE.md'), 'utf8');

console.log('─── Runbook (E23) ───');

const temas = [
  ['ACK incierto', /ACK incierto|Recepción incierta/i],
  ['worker', /worker/i],
  ['backlog', /backlog/i],
  ['Form caído', /Form caído|Form no accesible|FORM_NO_ACCESIBLE/i],
  ['Sheet caído', /Spreadsheet caído|Sheets/i],
  ['schema drift', /schema drift/i],
  ['permisos deployer', /deployer/i],
  ['reparación', /Form_operativoReparar_/],
  ['rollback', /rollback/i],
];
for (const [nombre, re] of temas) {
  t('runbook cubre: ' + nombre, () => A(re.test(runbook), 'falta la sección/tema: ' + nombre));
}

t('runbook no es placeholder (< 10 líneas)', () => {
  A(runbook.split('\n').filter((l) => l.trim()).length >= 10, 'runbook demasiado corto');
});

t('runbook referencia el contrato normativo', () => {
  A(runbook.includes('CONTRATO_CAPTURA_V2.md'), 'debe apuntar al contrato normativo');
});

t('runbook documenta dry-run de reparación', () => {
  A(/dryRun/.test(runbook), 'debe documentar dryRun');
});

t('runbook documenta los estados de captura', () => {
  ['RECIBIDO', 'EN_PROCESO', 'INCIERTO', 'NO_ENCONTRADO'].forEach((e) =>
    A(runbook.includes(e), 'falta el estado ' + e));
});

console.log('\n─── Transporte durable ───');

t('transporte no es placeholder', () => {
  A(transporte.split('\n').filter((l) => l.trim()).length >= 10, 'doc demasiado corto');
});

t('transporte diferencia RECIBIDO de PROCESADO', () => {
  A(/RECIBIDO\s*≠\s*PROCESADO|RECIBIDO != PROCESADO/.test(transporte), 'debe contrastar RECIBIDO vs PROCESADO');
});

t('transporte explica los tres identificadores', () => {
  ['clientRequestId', 'responseId', 'captureId'].forEach((id) =>
    A(transporte.includes(id), 'falta el identificador ' + id));
});

t('transporte documenta el índice CacheService y WebApp_verificarRecepcion', () => {
  A(transporte.includes('FORM_REQ:'), 'debe documentar FORM_REQ:<clientRequestId>');
  A(transporte.includes('WebApp_verificarRecepcion'), 'debe documentar WebApp_verificarRecepcion');
});

console.log('\nRunbook Completo v255 — TOTAL: ' + (PASS + FAIL) + ' · PASS: ' + PASS + ' · FAIL: ' + FAIL);
if (FAIL > 0) process.exit(1);
