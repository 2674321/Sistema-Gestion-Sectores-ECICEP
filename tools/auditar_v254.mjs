#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync('src/CapturaWeb.html', 'utf8');
const forms = readFileSync('src/36_FormsCanal.js', 'utf8');
const config = readFileSync('src/00_Config.js', 'utf8');
const qr = readFileSync('src/07_UI.js', 'utf8');
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); }
function run(file) {
  const p = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  return { ok: p.status === 0, detail: (p.stderr || p.stdout || '').trim().slice(-800) };
}

check('UI_SELECTOR_DROPDOWN', /<select id="accion"/.test(html) && !/type="radio" name="accion"/.test(html));
check('DURABLE_RPC', /\.WebApp_capturarRecibirDurable\(datos,/.test(html) && !/\.WebApp_previaDuplicadosV2_\(datos,/.test(html));
check('FORM_EXPLICIT_ADOPTION', /opciones\.formId \|\| Form_formId_\(\)/.test(forms));
check('NO_ACCIDENTAL_FORM_CREATE', /opciones\.crearNuevo !== true/.test(forms));
check('GLOBAL_ACTION_CANONICAL', /GLOBAL\|ACCION/.test(forms));
check('CANONICAL_ITEM_MAP', /GOOGLE_FORM_CANONICAL_ITEM_MAP/.test(forms));
const installer = run('tests/forms_installer_idempotence_v254.mjs');
check('NO_ARTIFICIAL_SUBMIT_ITEM', installer.ok, installer.detail);
check('WORKER_TRIGGER', /newTrigger\('Form_worker_'\)[\s\S]*everyMinutes\(5\)/.test(forms));
const onSubmit = forms.slice(forms.indexOf('function Form_onFormSubmit_'), forms.indexOf('function Form_desdeCursor_'));
check('WORKER_ONLY_CLINICAL_PATH', !/Captura_v2_enviar_|CapturaIngress_enviar_|LockService|GOOGLE_FORM_CURSOR/.test(onSubmit));
check('LOCK_WAIT_SHORT', /LOCK_WAIT_MS:\s*750/.test(config) && !/tryLock\(12000\)/.test(forms));
const backlog = run('tests/worker_backlog_v254.mjs'); check('SAFE_CURSOR', backlog.ok, backlog.detail);
const roundtrip = run('tests/forms_roundtrip_v254.mjs'); check('ROUNDTRIP_4_ACTIONS', roundtrip.ok, roundtrip.detail);
check('NO_FIELD_LOSS', roundtrip.ok && /TELEFONO_OBS/.test(forms) && /SALUD_MENTAL/.test(forms), roundtrip.detail);
check('QR_STABLE', /AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/.test(config + qr));
const docs = run('tests/architecture_docs_consistency_v254.mjs'); check('DOCS_MATCH_CODE', docs.ok, docs.detail);
const placeholders = run('tests/no_placeholder_tests_v254.mjs'); check('NO_PLACEHOLDER_TESTS', placeholders.ok, placeholders.detail);

for (const r of results) console.log(r.name + ': ' + (r.ok ? 'PASS' : 'FAIL') + (r.ok || !r.detail ? '' : ' — ' + r.detail));
if (results.some(r => !r.ok)) process.exit(1);
console.log('AUDITAR_V254: PASS');
