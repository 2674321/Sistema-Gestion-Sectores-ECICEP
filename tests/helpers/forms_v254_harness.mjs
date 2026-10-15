import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const SOURCES = [
  '00_Config.js', '01_Utilidades.js', '02_Normalizacion.js', '17_Hojas.js',
  '24_Formulario.js', '26_Captura.js', '29_ActualizacionCaptura.js',
  '30_Ingesta.js', '36_FormsCanal.js'
];

const TYPES = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', PAGE_BREAK: 'PAGE_BREAK', LIST: 'LIST',
  DATE: 'DATE', PARAGRAPH_TEXT: 'PARAGRAPH_TEXT', TEXT: 'TEXT'
};

/** v267: el Item GENÉRICO de Apps Script NO expone createResponse(). Sólo las
 *  clases concretas lo hacen. El harness lo refleja para que el bug no vuelva. */
class MockTypedItem {
  constructor(item) { this.item = item; }
  getId() { return this.item.getId(); }
  getTitle() { return this.item.getTitle(); }
  getType() { return this.item.getType(); }
  createResponse(value) { return new MockItemResponse(this.item, value); }
}
class MockListItem extends MockTypedItem {
  createResponse(value) {
    const v = String(value);
    const existe = this.item.choices.some((c) => String(c && c.getValue ? c.getValue() : c) === v);
    if (!existe) throw new Error('LIST_VALUE_NOT_FOUND');
    return new MockItemResponse(this.item, v);
  }
}
class MockDateItem extends MockTypedItem {
  createResponse(value) {
    if (!(value instanceof Date) || isNaN(value.getTime())) throw new Error('FORM_DATE_RESPONSE_INVALID');
    return new MockItemResponse(this.item, value);
  }
}

class MockItem {
  constructor(form, type) {
    this.form = form; this.type = type; this.title = ''; this.required = false;
    this.choices = []; this.id = String(form.nextItemId++);
  }
  getId() { return this.id; }
  getType() { return this.type; }
  getTitle() { return this.title; }
  getHelpText() { return ''; }
  setTitle(v) { this.title = String(v); return this; }
  setHelpText() { return this; }
  setRequired(v) { this.required = !!v; return this; }
  isRequired() { return this.required; }
  createChoice(value, target) { return { getValue: () => String(value), value: String(value), target }; }
  setChoices(v) { this.choices = v.slice(); return this; }
  getChoices() { return this.choices.slice(); }
  setGoToPage(v) { this.goToPage = v; return this; }
  /** Prohibido: en runtime real esto no existe. */
  createResponse() {
    this.form.llamadasGenericas.push({ itemId: this.id, tipo: this.type });
    throw new Error('GENERIC_ITEM_CREATE_RESPONSE_FORBIDDEN');
  }
  _as(tipo, clase) {
    if (this.type !== tipo) throw new Error('FORM_ITEM_TYPE_MISMATCH:' + String(this.type));
    return new clase(this);
  }
  asTextItem() { return this._as(TYPES.TEXT, MockTypedItem); }
  asParagraphTextItem() { return this._as(TYPES.PARAGRAPH_TEXT, MockTypedItem); }
  asListItem() { return this._as(TYPES.LIST, MockListItem); }
  asMultipleChoiceItem() { return this._as(TYPES.MULTIPLE_CHOICE, MockTypedItem); }
  asDateItem() { return this._as(TYPES.DATE, MockDateItem); }
  asPageBreakItem() { return this; }
}

class MockItemResponse {
  constructor(item, value) { this.item = item; this.value = value; }
  getItem() { return this.item; }
  getResponse() { return this.value; }
}

class MockResponse {
  constructor(form) {
    this.form = form; this.itemResponses = []; this.id = '';
    this.timestamp = new Date(form.clock += 1000);
  }
  withItemResponse(r) { this.itemResponses.push(r); return this; }
  submit() {
    if (!this.id) this.id = 'resp-' + String(++this.form.nextResponseId).padStart(4, '0');
    if (!this.form.responses.includes(this)) this.form.responses.push(this);
    return this;
  }
  getId() { return this.id; }
  getTimestamp() { return this.timestamp; }
  getItemResponses() { return this.itemResponses.slice(); }
}

class MockForm {
  constructor(id = 'FORM-CONOCIDO') {
    this.id = id; this.items = []; this.responses = []; this.nextItemId = 1;
    this.nextResponseId = 0; this.clock = Date.UTC(2026, 9, 12, 12, 0, 0);
    this.title = 'Captura ECICEP';
    this.published = true; this.acceptingResponses = true;
    this.llamadasGenericas = [];
  }
  // v260: publicación explícita (expone la API real de Forms en runtime).
  setPublished(v) { this.published = !!v; return this; }
  isPublished() { return this.published; }
  setAcceptingResponses(v) { this.acceptingResponses = !!v; return this; }
  isAcceptingResponses() { return this.acceptingResponses; }
  add(type) { const x = new MockItem(this, type); this.items.push(x); return x; }
  addMultipleChoiceItem() { return this.add(TYPES.MULTIPLE_CHOICE); }
  addPageBreakItem() { return this.add(TYPES.PAGE_BREAK); }
  addListItem() { return this.add(TYPES.LIST); }
  addDateItem() { return this.add(TYPES.DATE); }
  addParagraphTextItem() { return this.add(TYPES.PARAGRAPH_TEXT); }
  addTextItem() { return this.add(TYPES.TEXT); }
  deleteItem(item) { this.items.splice(this.items.indexOf(item), 1); return this; }
  getItems() { return this.items.slice(); }
  getId() { return this.id; }
  setTitle(v) { this.title = String(v); return this; }
  getTitle() { return this.title; }
  setDescription() { return this; }
  setConfirmationMessage() { return this; }
  setShowLinkToRespondAgain() { return this; }
  setRequireLogin() { return this; }
  setAllowResponseEdits() { return this; }
  setCollectEmail() { return this; }
  setIsQuiz() { return this; }
  getPublishedUrl() { return 'https://docs.google.com/forms/d/' + this.id + '/viewform'; }
  getEditUrl() { return 'https://docs.google.com/forms/d/' + this.id + '/edit'; }
  createResponse() { return new MockResponse(this); }
  getResponses(since) {
    if (!since) return this.responses.slice();
    const t = since.getTime(); return this.responses.filter(r => r.timestamp.getTime() >= t);
  }
}

class MockSheet {
  constructor() { this.headers = []; this.hidden = false; }
  hideSheet() { this.hidden = true; }
  getLastColumn() { return this.headers.length; }
  getRange(row, col, rows, cols) {
    return {
      setValues: values => { if (row === 1) this.headers = values[0].slice(); return this; },
      getValues: () => [this.headers.slice(col - 1, col - 1 + cols)]
    };
  }
}

export function createHarness({ malformed = false, responseCount = 0, noKnownForm = false, publishThrows = false, acceptingThrows = false } = {}) {
  const quiet = { log() {}, warn() {}, error() {}, info() {} };
  const c = vm.createContext({ console: quiet, JSON, Date, Math, Object, String, Number, Array, RegExp });
  for (const f of SOURCES) {
    vm.runInContext(readFileSync(new URL('src/' + f, ROOT), 'utf8'), c, { filename: f });
  }

  const props = new Map();
  const forms = new Map();
  const form = new MockForm();
  forms.set(form.id, form);
  // v260: fallos de publicación simulables sin debilitar el camino de producción.
  if (publishThrows) form.setPublished = function () { throw new Error('setPublished-falla'); };
  if (acceptingThrows) form.setAcceptingResponses = function () { throw new Error('setAcceptingResponses-falla'); };
  let createCount = 0;
  const openIds = [];
  if (!noKnownForm) props.set('GOOGLE_FORM_ID', form.id);
  if (malformed) {
    form.addPageBreakItem().setTitle('NUEVO_INGRESO');
    form.addTextItem().setTitle('Nombre completo');
    form.addTextItem().setTitle('Nombre completo');
  }
  for (let i = 0; i < responseCount; i++) form.createResponse().submit();

  c.FormApp = {
    ItemType: TYPES,
    PageNavigationType: { SUBMIT: 'SUBMIT', RESTART: 'RESTART' },
    openById(id) { openIds.push(String(id)); if (!forms.has(id)) throw new Error('FORM_NO_ACCESIBLE'); return forms.get(id); },
    create(title) {
      createCount++;
      const f = new MockForm('FORM-CREADO-' + createCount); f.title = title; forms.set(f.id, f); return f;
    }
  };
  c.PropertiesService = { getScriptProperties: () => ({
    getProperty: k => props.get(k) || '', setProperty: (k, v) => props.set(k, String(v))
  }) };
  const sheet = new MockSheet();
  const ss = {
    getSheetByName: n => n === c.HOJAS.FORM_RESPUESTAS ? sheet : null,
    insertSheet: () => sheet
  };
  c.SpreadsheetApp = { getActiveSpreadsheet: () => ss };

  const triggers = [];
  c.ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger(handler) {
      const t = { handler, getHandlerFunction: () => handler };
      const b = {
        forForm() { return b; }, onFormSubmit() { return b; }, timeBased() { return b; },
        everyMinutes() { return b; }, create() { triggers.push(t); return t; }
      };
      return b;
    }
  };

  let lockAnswers = [];
  let lockCalls = 0;
  c.LockService = { getScriptLock: () => { lockCalls++; return ({
    tryLock: () => lockAnswers.length ? lockAnswers.shift() : true,
    releaseLock() {}
  }); } };
  c.Control_aIso_ = d => d instanceof Date ? d.toISOString() : String(d || '');
  // v267: el catálogo cubre a los profesionales que usa `payloadFor`, porque en
  // runtime real un ListItem rechaza un valor fuera de sus opciones.
  c.Captura_v2_catalogo_ = () => [
    { NOMBRE_CANONICO: 'PROFESIONAL UNO', ACTIVO: true },
    { NOMBRE_CANONICO: 'PROFESIONAL DOS', ACTIVO: true }
  ];
  // v268: el validador REAL queda disponible para las pruebas de contrato. El stub
  // de abajo mantiene el aislamiento del canal, pero la frontera contractual
  // debe probarse contra el validador productivo.
  c.__Captura_v2_validar_real = c.Captura_v2_validar_;
  c.Captura_v2_validar_ = p => ({ ok: true, normalizado: p, errores: [] });
  c.Norm_normalizarRut_ = r => ({ estado: 'OK', rut: String(r).replace(/\./g, '').toUpperCase() });
  const patients = [{ ID_INTERNO: 'EC-001', RUT: '12345678-5', TELEFONOS: '999999999',
    TELEFONO_OBS: 'MADRE CONTESTA', PROXIMO_CONTROL: '2026-11-01',
    OBSERVACIONES: 'ANTERIOR', SALUD_MENTAL: 'NO' }];
  c.Modelo_leerPacientes_ = () => patients;
  c.CapturaIngress_ctx_ = () => ({ catalogo: [], leerPacientes: () => patients });
  c.WebApp_autorizarCaptura_ = () => false;
  const processed = new Set();
  const pipelineCalls = [];
  let pipelineBehavior = null;
  c.CapturaIngress_enviar_ = payload => {
    pipelineCalls.push(payload);
    if (pipelineBehavior) return pipelineBehavior(payload, processed, pipelineCalls);
    if (processed.has(payload.captureId)) return { ok: true, data: { estado: 'DUPLICADO' } };
    processed.add(payload.captureId);
    return { ok: true, data: { estado: 'PROCESADO' } };
  };

  return {
    c, form, props, triggers, sheet, forms, openIds, processed, pipelineCalls, patients,
    get createCount() { return createCount; },
    get lockCalls() { return lockCalls; },
    setLockSequence(values) { lockAnswers = values.slice(); },
    setPipelineBehavior(fn) { pipelineBehavior = fn; },
    addForm(id) { const f = new MockForm(id); forms.set(id, f); return f; },
    install(options) { return c.Form_operativoInstalar_(options); }
  };
}

export function payloadFor(action, i = 0) {
  const base = { accion: action, rut: '12.345.678-5', profesional: 'PROFESIONAL UNO',
    profesionalSecundario: 'PROFESIONAL DOS', observaciones: 'OBS ' + i };
  if (action === 'nuevoIngreso') return { ...base, nombre: 'PERSONA ' + i, sexo: 'F',
    fechaNacimiento: '1980-01-02', sector: 'AMARILLO', fechaIngreso: '2026-10-12',
    estratificacion: 'G2', saludMental: 'NO', telefonos: '999999999', proximoControl: '2026-11-05' };
  if (action === 'registrarControl' || action === 'registrarSeguimiento') {
    return { ...base, fechaEvento: '2026-10-12', proximoControl: '2026-11-06' };
  }
  return { ...base, actualizacion: { id: 'EC-001', rutOriginal: '12345678-5', atenciones: [], campos: {
    TELEFONOS: { anterior: '999999999', valor: '988888888' },
    TELEFONO_OBS: { anterior: 'MADRE CONTESTA', valor: 'HIJA CONTESTA' },
    PROXIMO_CONTROL: { anterior: '2026-11-01', valor: '2026-12-01' },
    SALUD_MENTAL: { anterior: 'NO', valor: 'SI' },
    OBSERVACIONES: { anterior: 'ANTERIOR', valor: 'NUEVA' }
  } } };
}

export function assertInstallerIdempotent() {
  const h = createHarness();
  let last;
  for (let i = 0; i < 10; i++) { last = h.install(); assert.equal(last.ok, true); }
  assert.equal(h.createCount, 0, 'adopta el Form conocido; no crea otro');
  assert.equal(h.form.getItems().filter(x => x.getType() === TYPES.PAGE_BREAK).length, 4);
  assert.equal(new Set(h.form.getItems().map(x => x.getId())).size, h.form.getItems().length, 'itemIds únicos');
  assert.equal(h.triggers.filter(t => t.handler === 'Form_onFormSubmit_').length, 1);
  assert.equal(h.triggers.filter(t => t.handler === 'Form_worker_').length, 1);
  const idx = h.c.Form_indexarSchema_(h.form);
  for (const sec of h.c.Form_esquemaCanonial_().secciones) {
    for (const campo of h.c.Form_esquemaCanonial_().campos[sec]) {
      const title = h.c.GOOGLE_FORMS_CONFIG.CAMPOS[campo].etiqueta;
      assert.ok(idx.byKey[sec + '|' + title], sec + '|' + campo);
      assert.equal(idx.byKey[sec + '|' + title].item.isRequired(), h.c.Form_campoRequerido_(sec, campo));
    }
  }
  const itemMap = JSON.parse(h.props.get('GOOGLE_FORM_ITEM_MAP'));
  const canonicalMap = JSON.parse(h.props.get('GOOGLE_FORM_CANONICAL_ITEM_MAP'));
  assert.ok(Object.values(itemMap).includes('ACCION'));
  assert.equal(Object.keys(itemMap).length, 37, 'ACCION + 34 campos canónicos + 2 transporte global');
  assert.equal(canonicalMap['GLOBAL|ACCION'], h.c.Form_construirCanonicalItemMap_(h.form)['GLOBAL|ACCION']);
  assert.equal(Object.keys(canonicalMap).length, 37);
  assert.equal(h.form.getItems().filter(x => x.getTitle() === 'Enviar respuesta').length, 0);
  for (const page of h.form.getItems().filter(x => x.getType() === TYPES.PAGE_BREAK)) assert.equal(page.goToPage, 'SUBMIT');
  const rutId = canonicalMap['NUEVO_INGRESO|RUT'];
  const rutItem = h.form.getItems().find(x => x.getId() === rutId);
  const totalAntesRenombre = h.form.getItems().length;
  rutItem.setTitle('RUT visible renombrado');
  assert.equal(h.install().ok, true);
  assert.equal(h.form.getItems().length, totalAntesRenombre, 'el título visible no define identidad ni duplica ítems');
  assert.equal(JSON.parse(h.props.get('GOOGLE_FORM_CANONICAL_ITEM_MAP'))['NUEVO_INGRESO|RUT'], rutId);
  return h;
}

export function assertExplicitAdoption() {
  const h = createHarness();
  h.props.set('GOOGLE_FORM_ID', 'FORM-A');
  const b = h.addForm('FORM-B');
  const r = h.install({ formId: 'FORM-B', adoptarExistente: true });
  assert.equal(r.ok, true); assert.equal(r.formId, 'FORM-B'); assert.equal(h.props.get('GOOGLE_FORM_ID'), 'FORM-B');
  assert.equal(h.openIds[0], 'FORM-B'); assert.equal(h.createCount, 0); assert.ok(b.items.length > 0);
  const empty = createHarness({ noKnownForm: true });
  const re = empty.install({ adoptarExistente: true });
  assert.equal(re.ok, false); assert.equal(re.motivo, 'FORM_ID_REQUIRED'); assert.equal(empty.createCount, 0);
  const invalid = createHarness();
  const ri = invalid.install({ formId: 'NO-EXISTE', adoptarExistente: true });
  assert.equal(ri.ok, false); assert.equal(ri.motivo, 'FORM_CONOCIDO_NO_ACCESIBLE'); assert.equal(invalid.createCount, 0);
}

export function assertMigrations() {
  const empty = createHarness({ malformed: true });
  const a = empty.install();
  assert.equal(a.ok, true); assert.equal(a.schemaReconstruido, true); assert.equal(empty.form.responses.length, 0);
  const used = createHarness({ malformed: true, responseCount: 1 });
  const beforeItems = used.form.items.length, beforeResponses = used.form.responses.length;
  const b = used.install();
  assert.equal(b.ok, false); assert.equal(b.motivo, 'FORM_SCHEMA_REQUIRES_REVIEW');
  assert.equal(used.form.items.length, beforeItems); assert.equal(used.form.responses.length, beforeResponses);
}

export function assertDurableAndWorker() {
  const h = assertInstallerIdempotent();
  const before = h.pipelineCalls.length;
  const locksBefore = h.lockCalls;
  for (const action of ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos']) {
    const received = h.c.WebApp_capturarRecibirDurable(payloadFor(action));
    assert.equal(received.ok, true); assert.equal(received.estado, 'RECIBIDO'); assert.ok(received.data.responseId);
  }
  assert.equal(h.form.responses.length, 4, 'una respuesta durable por acción');
  assert.equal(h.pipelineCalls.length, before, 'recepción no toca pipeline clínico');
  assert.equal(h.lockCalls, locksBefore, 'recepción no toma lock clínico');
  const signal = h.c.Form_onFormSubmit_({ response: h.form.responses.at(-1) });
  assert.equal(signal.ok, true); assert.equal(signal.queued, true);
  assert.equal(h.pipelineCalls.length, before, 'onFormSubmit solo señala; no toca pipeline clínico');
  assert.equal(h.lockCalls, locksBefore, 'onFormSubmit no toma lock clínico');
  h.triggers.splice(0, h.triggers.length, ...h.triggers.filter(t => t.handler !== 'Form_onFormSubmit_'));
  const w = h.c.Form_worker_({ max: 20, yaProcesado: cid => h.processed.has(cid) });
  assert.equal(w.procesadas, 4, 'worker procesa respuestas programáticas sin eventos');
  assert.equal(h.pipelineCalls.length, before + 4);
  return h;
}

export function assertLockAndOverlap() {
  const h = assertInstallerIdempotent();
  h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', 1));
  h.props.set('GOOGLE_FORM_CURSOR', '2026-10-12T00:00:00.000Z');
  h.setLockSequence([false, true]);
  const busy = h.c.Form_worker_({ max: 20, yaProcesado: cid => h.processed.has(cid) });
  assert.equal(busy.motivo, 'DEFERRED_LOCK_BUSY');
  assert.equal(h.props.get('GOOGLE_FORM_CURSOR'), '2026-10-12T00:00:00.000Z', 'lock busy no mueve cursor');
  const recovered = h.c.Form_worker_({ max: 20, yaProcesado: cid => h.processed.has(cid) });
  assert.equal(recovered.procesadas, 1); assert.equal(h.processed.size, 1);

  const h2 = assertInstallerIdempotent();
  for (let i = 0; i < 4; i++) h2.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', i));
  const ids = h2.form.responses.map(r => h2.c.CapturaIngress_captureId_(h2.form.id, r.id));
  let failedOnce = false;
  h2.setPipelineBehavior((p, done) => {
    if (p.captureId === ids[1] && !failedOnce) { failedOnce = true; return { ok: false, errors: [{ codigo: 'TEMPORAL' }] }; }
    if (done.has(p.captureId)) return { ok: true, data: { estado: 'DUPLICADO' } };
    done.add(p.captureId); return { ok: true, data: { estado: 'PROCESADO' } };
  });
  const first = h2.c.Form_worker_({ max: 20, yaProcesado: cid => h2.processed.has(cid) });
  assert.equal(first.procesadas, 3); assert.equal(first.retryable, 1);
  assert.equal(h2.props.get('GOOGLE_FORM_CURSOR'), h2.form.responses[0].timestamp.toISOString(), 'cursor se detiene antes de T1 retryable');
  const second = h2.c.Form_worker_({ max: 20, yaProcesado: cid => h2.processed.has(cid) });
  assert.equal(second.procesadas, 1, 'el overlap recupera T1');
  assert.equal(h2.processed.size, 4); assert.equal(h2.pipelineCalls.length, 5, 'solo T1 se reintenta');
}

export function assertConcurrency() {
  const result = {};
  for (const n of [5, 10, 20, 50]) {
    const h = assertInstallerIdempotent();
    const ids = new Set();
    for (let i = 0; i < n; i++) {
      const r = h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', i), i % 3 === 0 ? '' : 'sin-sheet');
      assert.equal(r.ok, true); ids.add(r.data.responseId);
    }
    assert.equal(ids.size, n); assert.equal(h.form.responses.length, n); assert.equal(h.pipelineCalls.length, 0);
    assert.equal(h.lockCalls, 0, 'recepción concurrente no toma lock clínico');
    const w = h.c.Form_worker_({ max: 100, yaProcesado: cid => h.processed.has(cid) });
    assert.equal(w.procesadas, n); assert.equal(h.processed.size, n); assert.equal(w.errores, 0);
    result[n] = { recibidas: n, procesadas: n, perdidas: 0, duplicadas: 0, serviceBusy: 0 };
  }
  return result;
}

export function assertPermissions() {
  const h = assertInstallerIdempotent();
  for (const acceso of ['admin', 'editor-sheet', 'usuario-sin-sheet']) {
    const r = h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', acceso), acceso);
    assert.equal(r.ok, true, acceso);
  }
  assert.equal(h.pipelineCalls.length, 0);
  const receiver = String(h.c.WebApp_capturarRecibirDurable);
  assert.doesNotMatch(receiver, /Session|getActiveUser|allowlist|SpreadsheetApp/);
}

export function assertRoundtrip() {
  const h = assertInstallerIdempotent();
  const results = {};
  for (const action of ['nuevoIngreso', 'registrarControl', 'registrarSeguimiento', 'actualizarDatos']) {
    const p = payloadFor(action);
    if (action === 'actualizarDatos') {
      Object.assign(p.actualizacion.campos, {
        NOMBRE: { anterior: '', valor: 'PACIENTE ACTUALIZADO' },
        SEXO: { anterior: '', valor: 'OTRO' },
        FECHA_NACIMIENTO: { anterior: '', valor: '1980-01-02' },
        SECTOR: { anterior: '', valor: 'VERDE' },
        ESTADO: { anterior: '', valor: 'INGRESADO' },
        FECHA_INGRESO: { anterior: '', valor: '2025-01-02' },
        PREINGRESO: { anterior: '', valor: 'NO_APLICA' },
        DUPLA_INGRESO: { anterior: '', valor: 'PROFESIONAL UNO / PROFESIONAL DOS' },
        PROFESIONAL_SEGUIMIENTO: { anterior: '', valor: 'PROFESIONAL UNO' },
        CONDICIONES: { anterior: '', valor: '' },
        OTRAS_PATOLOGIAS: { anterior: '', valor: 'OTRA' },
        COMPOSICION_CONTROL: { anterior: '', valor: 'PROFESIONAL UNO' }
      });
      p.actualizacion.atenciones = [{ tipo: 'CONTROL', modo: 'REGISTRAR', fecha: '2026-10-12', idEvento: '', anterior: '' }];
    }
    const r = h.c.Form_crearRespuestaDesdePayloadWeb_(p); assert.equal(r.ok, true);
    const response = h.form.responses.at(-1);
    const extracted = h.c.Form_extraerCampos_(response, {
      itemMap: JSON.parse(h.props.get('GOOGLE_FORM_ITEM_MAP')),
      titleMap: JSON.parse(h.props.get('GOOGLE_FORM_TITLE_MAP'))
    });
    const adapted = h.c.CapturaIngress_adapterForms_({ formId: h.form.id, responseId: response.id,
      timestamp: response.timestamp.toISOString(), accion: extracted.accion, campos: extracted.campos },
      { catalogo: [], hoy: '2026-10-12', leerPacientes: () => h.patients });
    assert.equal(adapted.ok, true, action + ': ' + JSON.stringify(adapted.errores));
    assert.equal(adapted.payload.accion, action); assert.equal(adapted.payload.profesional, p.profesional);
    assert.equal(adapted.payload.profesionalSecundario, p.profesionalSecundario);
    if (action === 'nuevoIngreso') {
      for (const key of ['nombre','sexo','fechaNacimiento','sector','fechaIngreso','estratificacion','saludMental','telefonos','proximoControl','observaciones'])
        assert.equal(adapted.payload[key], p[key], action + '.' + key);
    } else if (action === 'registrarControl' || action === 'registrarSeguimiento') {
      for (const key of ['fechaEvento','proximoControl','observaciones']) assert.equal(adapted.payload[key], p[key], action + '.' + key);
    } else {
      assert.deepEqual(JSON.parse(JSON.stringify(adapted.payload.actualizacion)), p.actualizacion,
        'actualización completa y atenciones sobreviven Web App → Form → worker');
    }
    results[action] = { ok: true, captureId: adapted.captureId };
  }
  return results;
}

export function assertMassAndObservability() {
  const h = assertInstallerIdempotent();
  for (let i = 0; i < 6; i++) h.c.WebApp_capturarRecibirDurable(payloadFor('nuevoIngreso', i));
  const ids = h.form.responses.map(r => h.c.CapturaIngress_captureId_(h.form.id, r.id));
  h.setPipelineBehavior((p, done) => {
    const i = ids.indexOf(p.captureId);
    if (i === 3) return { ok: false, errors: [{ codigo: 'TEMPORAL' }] };
    if (done.has(p.captureId)) return { ok: true, data: { estado: 'DUPLICADO' } };
    done.add(p.captureId); return { ok: true, data: { estado: 'PROCESADO' } };
  });
  const w = h.c.Form_worker_({ max: 20, yaProcesado: cid => h.processed.has(cid) });
  const summary = { responsesTotal: h.form.responses.length, processed: w.procesadas,
    retryable: w.retryable, review: w.review, terminal: w.terminal,
    backlog: w.retryable + w.review, oldestPendingMin: 0 };
  assert.equal(summary.responsesTotal, summary.processed + summary.retryable + summary.review + summary.terminal);
  assert.doesNotMatch(JSON.stringify(summary), /RUT|NOMBRE|12345678|PERSONA/);
  return summary;
}

export function assertQr() {
  const h = createHarness();
  const fixed = 'https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec';
  assert.equal(h.c.ECICEP.WEB_APP_URL, fixed);
  for (const formUrl of ['https://docs.google.com/forms/d/A/viewform', 'https://docs.google.com/forms/d/B/viewform']) {
    h.props.set('GOOGLE_FORM_URL', formUrl);
    assert.equal(h.c.ECICEP.WEB_APP_URL, fixed);
  }
}

export function runFullDryRun() {
  assertInstallerIdempotent(); assertMigrations(); assertDurableAndWorker(); assertLockAndOverlap();
  const concurrency = assertConcurrency(); assertPermissions(); const roundtrip = assertRoundtrip();
  const observability = assertMassAndObservability(); assertQr();
  return { concurrency, roundtrip, observability };
}
