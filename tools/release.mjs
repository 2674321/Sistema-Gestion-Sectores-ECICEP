#!/usr/bin/env node
// ECICEP — release multiplataforma (equivalente Node de push_y_abrir.sh).
// Modos (exactamente uno; por defecto --check):
//   --check    gates locales read-only (git limpio, rama, verifier, diff-check,
//              manifest/release-gate, RPC público, scope audit, docs).
//   --push     --check + BUILD.js + validar Script ID + `clasp push --force` +
//              comprobar remoto. NO publica versión.
//   --publish  --push + exigir backup reciente + deployment existente (mismo ID
//              que ECICEP.WEB_APP_URL) + `clasp deploy` sobre ese deployment.
//              NUNCA crea un deployment nuevo. Muta producción: exige
//              ECICEP_PUBLISH_CONFIRM=1 y evidencia de backup reciente.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runVerifier, buildManifest, writeManifest } from './release_manifest.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.includes('--publish') ? 'publish' : (args.includes('--push') ? 'push' : 'check');
const allowDirty = process.env.ECICEP_RELEASE_ALLOW_DIRTY === '1';

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const run = (cmd, a) => spawnSync(cmd, a, { cwd: root, encoding: 'utf8' });
const fail = (reason, extra) => { console.error(`RELEASE_${mode.toUpperCase()}_FAIL ${reason}` + (extra ? ' ' + extra : '')); process.exit(1); };
const ok = (m) => console.log('  ok  ' + m);

function gitClean() {
  const s = git('status', '--porcelain');
  if (s && !allowDirty) fail('DIRTY_TREE', '(usa ECICEP_RELEASE_ALLOW_DIRTY=1 para forzar)');
  const d = run('git', ['diff', '--check']);
  if (d.status !== 0) fail('DIFF_CHECK_FAILED', (d.stdout || '') + (d.stderr || ''));
  ok('git limpio y diff-check');
}

function branchGate() {
  const b = git('branch', '--show-current');
  const valida = ['master'].includes(b) || /^(release|codex|hardening)\//.test(b);
  if (!valida) fail('BRANCH_INVALIDA', b);
  ok('rama ' + b);
}

function verifierGate() {
  const report = runVerifier();
  if (report.failed !== 0 || report.syntaxFailures !== 0) fail('VERIFIER_FALLOS', `failed=${report.failed} syntax=${report.syntaxFailures}`);
  ok(`verifier ${report.suites} suites / 0 fallos`);
  return report;
}

function manifestGate(report) {
  const m = buildManifest({ stage: mode === 'publish' ? 'FINAL' : 'RC', verifier: report });
  if (m.gitSha !== git('rev-parse', 'HEAD')) fail('MANIFEST_SHA_DIVERGE');
  if (!m.releaseGate.testsMatchVerifier) fail('MANIFEST_TESTS_DIVERGE');
  ok(`manifest ${m.appVersion} ${m.gitSha.slice(0, 12)} (${m.contracts.decisionsThrough})`);
  return m;
}

function nodeTestGate(rel, etiqueta) {
  const r = run(process.execPath, [rel]);
  if (r.status !== 0) fail(etiqueta + '_FALLÓ', (r.stdout || '') + (r.stderr || ''));
  ok(etiqueta + ' PASS');
}

function docsGate(version) {
  const dir = path.join(root, 'docs');
  if (!fs.existsSync(path.join(dir, 'ESTADO_ACTUAL.md'))) fail('FALTA_ESTADO_ACTUAL');
  const estado = fs.readFileSync(path.join(dir, 'ESTADO_ACTUAL.md'), 'utf8');
  if (!estado.includes('v' + version)) fail('ESTADO_ACTUAL_SIN_VERSION', 'v' + version);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  if (!readme.includes('v' + version)) fail('README_SIN_VERSION', 'v' + version);
  ok('docs consistentes (v' + version + ')');
}

function configRuntime() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'src/00_Config.js'), 'utf8'), ctx);
  const url = ctx.ECICEP && ctx.ECICEP.WEB_APP_URL;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url || '')) fail('WEB_APP_URL_INVALIDA');
  return { url, deployId: url.replace(/\/exec$/, '').split('/').pop() };
}

function scriptIdGate() {
  const expected = '1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI';
  const actual = JSON.parse(fs.readFileSync(path.join(root, '.clasp.json'), 'utf8')).scriptId;
  if (actual !== expected) fail('SCRIPT_ID_DIVERGE', actual);
  ok('Script ID esperado');
}

function regenerarBuild() {
  let commit = git('rev-parse', '--short', 'HEAD');
  const dirty = run('git', ['diff', '--quiet', 'HEAD', '--', 'src']);
  if (dirty.status !== 0) commit += '-dirty';
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');
  fs.writeFileSync(path.join(root, 'src/BUILD.js'), `var ECICEP_BUILD = { commit: '${commit}', fecha: '${fecha}' };\n`);
  ok('BUILD.js ' + commit);
}

// ---------------------------------------------------------------------------
console.log(`RELEASE_MODE ${mode}`);
gitClean();
branchGate();
const report = verifierGate();
const manifest = manifestGate(report);
nodeTestGate('tests/rpc_public_surface_v255.mjs', 'RPC público');
nodeTestGate('tests/oauth_scopes_v270.mjs', 'scope audit');
docsGate(manifest.appVersion);
const { url, deployId } = configRuntime();
ok('deployment operativo ' + deployId);

if (mode === 'check') {
  console.log('RELEASE_CHECK_PASS');
  process.exit(0);
}

// ---- push ----------------------------------------------------------------
regenerarBuild();
writeManifest({ stage: mode === 'publish' ? 'FINAL' : 'RC', verifier: report });
scriptIdGate();
const push = run('clasp', ['push', '--force']);
if (push.status !== 0) fail('CLASP_PUSH_FALLÓ', (push.stdout || '') + (push.stderr || ''));
ok('clasp push --force');
const remoto = run('clasp', ['status']);
if (remoto.status !== 0) fail('CLASP_STATUS_FALLÓ', (remoto.stdout || '') + (remoto.stderr || ''));
ok('remoto sincronizado');

if (mode === 'push') {
  console.log('RELEASE_PUSH_PASS');
  process.exit(0);
}

// ---- publish -------------------------------------------------------------
if (process.env.ECICEP_PUBLISH_CONFIRM !== '1') fail('PUBLISH_SIN_CONFIRMACION', '(exporta ECICEP_PUBLISH_CONFIRM=1)');
const evidencia = process.env.ECICEP_BACKUP_RECENT;
if (!evidencia) fail('BACKUP_RECIENTE_SIN_EVIDENCIA', '(exporta ECICEP_BACKUP_RECENT=<ISO/ref>)');
ok('backup reciente: ' + evidencia);

const dep = run('clasp', ['deployments']);
if (dep.status !== 0) fail('CLASP_DEPLOYMENTS_FALLÓ');
const encontrado = (dep.stdout || '').split('\n').some(l => l.split(/\s+/)[1] === deployId);
if (!encontrado) fail('DEPLOYMENT_NO_ENCONTRADO', deployId + ' — NO se crea uno nuevo');
const deploy = run('clasp', ['deploy', '--deploymentId', deployId]);
if (deploy.status !== 0) fail('CLASP_DEPLOY_FALLÓ', (deploy.stdout || '') + (deploy.stderr || ''));
ok('deploy sobre ' + deployId + ' (mismo /exec)');
console.log(`RELEASE_PUBLISH_PASS ${url}`);
