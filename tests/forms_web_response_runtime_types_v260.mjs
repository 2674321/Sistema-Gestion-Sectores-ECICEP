// v267 — regresión del TRANSPORTE Web→Forms: el Item GENÉRICO de Apps Script no
// expone createResponse(). Este test falla si alguien vuelve a llamar
// item.createResponse(...) o si una clase tipada deja de usarse.
import assert from 'node:assert/strict';
import { createHarness } from './helpers/forms_v254_harness.mjs';

const h = createHarness();
const inst = h.install();
assert.equal(inst.ok, true, JSON.stringify(inst.cambios));

const c = h.c;
const form = h.form;
const idx = c.Form_indexarSchema_(form);

const payload = {
  accion: 'nuevoIngreso',
  clientRequestId: 'CR-0123456789abcdef0123456789abcdef',
  rut: '11.111.111-1',
  nombre: 'PRUEBA E2E V266 NO REAL',
  sexo: 'OTRO',
  fechaNacimiento: '1990-05-05',
  sector: 'AMARILLO',
  fechaIngreso: '2026-10-13',
  estratificacion: 'G2',
  telefonos: '955555444',
  profesional: 'PROFESIONAL UNO',
  observaciones: 'PRUEBA E2E V266 NO REAL — DESCARTABLE — 2026-10-13'
};

// 1. Validación del payload de transporte.
const v = c.Form_validarPayloadTransporte_(payload);
assert.equal(v.ok, true, 'payload válido: ' + JSON.stringify(v.errores || []));

// 2. El Item genérico NO puede crear respuestas en runtime real.
const cualquier = idx.byCanonicalKey['NUEVO_INGRESO|RUT'].item;
assert.throws(() => cualquier.createResponse('X'), /GENERIC_ITEM_CREATE_RESPONSE_FORBIDDEN/,
  'el mock debe prohibir createResponse en el Item genérico');
// La sonda anterior sí dejó rastro: se limpia para medir sólo el flujo real.
form.llamadasGenericas = [];

// 3. Creación de la respuesta durable.
const r = c.Form_crearRespuestaDesdePayloadWeb_(payload);
assert.equal(r.ok, true, 'respuesta creada: ' + JSON.stringify(r));
assert.equal(r.estado, 'RECIBIDO');
assert.ok(r.responseId, 'responseId asignado');

// 4. ItemResponses para TODAS las canonical keys esperadas.
const ESPERADAS = [
  'GLOBAL|ACCION', 'GLOBAL|SOURCE', 'GLOBAL|CLIENT_REQUEST_ID',
  'NUEVO_INGRESO|RUT', 'NUEVO_INGRESO|NOMBRE', 'NUEVO_INGRESO|SEXO',
  'NUEVO_INGRESO|FECHA_NACIMIENTO', 'NUEVO_INGRESO|SECTOR',
  'NUEVO_INGRESO|FECHA_INGRESO', 'NUEVO_INGRESO|ESTRATIFICACION',
  'NUEVO_INGRESO|TELEFONOS', 'NUEVO_INGRESO|PROFESIONAL',
  'NUEVO_INGRESO|OBSERVACIONES'
];

const enviada = h.form.responses[h.form.responses.length - 1];
const enviados = new Set(enviada.getItemResponses().map((ir) => String(ir.getItem().getId())));

for (const ck of ESPERADAS) {
  const entrada = idx.byCanonicalKey[ck];
  assert.ok(entrada, 'existe el item para ' + ck);
  assert.ok(enviados.has(String(entrada.item.getId())), 'ItemResponse creado para ' + ck);
}

// 5. NINGUNA respuesta se creó por el Item genérico.
assert.deepEqual(form.llamadasGenericas, [], 'cero createResponse sobre Item genérico');

// 6. El plan sólo expone datos técnicos (canonicalKey, itemType, motivo): sin PII.
const plan = r.plan || [];
assert.ok(plan.length > 0, 'plan presente');
for (const p of plan) {
  assert.deepEqual(
    Object.keys(p).filter((k) => ['valor', 'nombre', 'rut', 'telefonos', 'observaciones'].indexOf(k) >= 0),
    [], 'el plan no expone valores clínicos'
  );
  assert.ok('itemType' in p, 'el plan registra el tipo del item');
  assert.ok('motivo' in p, 'el plan registra el motivo técnico');
}
const serializado = JSON.stringify(r);
assert.doesNotMatch(serializado, /PRUEBA E2E V266 NO REAL|11\.111\.111-1|955555444/,
  'la respuesta no filtra PII del payload');

// ---------------------------------------------------------------------------
// TIPOS: conversión explícita por clase
// ---------------------------------------------------------------------------

const texto = form.addTextItem().setTitle('T');
const parrafo = form.addParagraphTextItem().setTitle('P');
const lista = form.addListItem().setTitle('L');
lista.setChoices([lista.createChoice('A'), lista.createChoice('B')]);
const choice = form.addMultipleChoiceItem().setTitle('MC');
choice.setChoices([choice.createChoice('X'), choice.createChoice('Y')]);
const fecha = form.addDateItem().setTitle('F');
const pagina = form.addPageBreakItem().setTitle('PB');

const respuesta = (item, v) => c.Form_crearItemResponse_(item, v);

assert.ok(respuesta(texto, 'hola'), 'TEXT');
assert.ok(respuesta(parrafo, 'hola'), 'PARAGRAPH_TEXT');
assert.ok(respuesta(lista, 'A'), 'LIST');
assert.ok(respuesta(choice, 'X'), 'MULTIPLE_CHOICE');
assert.ok(respuesta(fecha, new Date(Date.UTC(1990, 4, 5))), 'DATE');

// Tipo no soportado.
assert.throws(() => respuesta(pagina, 'x'), /FORM_ITEM_TYPE_UNSUPPORTED/);

// Fecha inválida.
assert.throws(() => respuesta(fecha, '1990-05-05'), /FORM_DATE_RESPONSE_INVALID/);
assert.throws(() => respuesta(fecha, new Date('nope')), /FORM_DATE_RESPONSE_INVALID/);

// Item inválido.
assert.throws(() => respuesta(null, 'x'), /FORM_ITEM_INVALID/);
assert.throws(() => respuesta({}, 'x'), /FORM_ITEM_INVALID/);

// Valor fuera de las opciones de un LIST: falla como en runtime real.
assert.throws(() => respuesta(lista, 'C'), /LIST_VALUE_NOT_FOUND/);

// La conversión no cuela: tras todos esos intentos, cero genéricos.
assert.deepEqual(form.llamadasGenericas, [], 'los tipos tampoco usan el Item genérico');

// ---------------------------------------------------------------------------
// LIST con valor inexistente en el payload → fail-closed, sin submit
// ---------------------------------------------------------------------------

const antes = form.responses.length;
const malo = c.Form_crearRespuestaDesdePayloadWeb_(
  Object.assign({}, payload, { profesional: 'PROFESIONAL INEXISTENTE' })
);
assert.equal(malo.ok, false);
assert.equal(malo.motivo, 'FORM_SCHEMA_DRIFT');
assert.ok(malo.failedAcceptedFields.indexOf('NUEVO_INGRESO|PROFESIONAL') >= 0, 'campo incompatible identificado');
const entradasFallidas = (malo.plan || []).filter((p) => !p.ok);
assert.equal(entradasFallidas.length, 1);
assert.equal(entradasFallidas[0].motivo, 'ITEM_RESPONSE_FAILED');
assert.equal(entradasFallidas[0].itemType, 'LIST');
assert.equal(form.responses.length, antes, 'NO se envía ninguna respuesta');

console.log('forms_web_response_runtime_types_v260: PASS');