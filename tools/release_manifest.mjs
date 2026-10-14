#!/usr/bin/env node
// Manifest de release derivado de FUENTES REALES (nunca de conteos manuales):
//  · versión/esquema/instalador y esquema del Form desde src/00_Config.js;
//  · decisiones hasta DEC-NN desde DECISIONES.md;
//  · SHA/rama desde git;
//  · suites/fallos desde `tools/verificar.mjs --json`.
// RELEASE_CANDIDATE.json es un artefacto local ignorado: versionarlo haría que
// su SHA quedara obsoleto en el mismo commit que intenta actualizarlo.
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

/** Corre el verificador completo y devuelve su reporte machine-readable. */
export function runVerifier() {
  const r = spawnSync(process.execPath, ['tools/verificar.mjs', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || '';
  try {
    return JSON.parse(line);
  } catch (e) {
    throw new Error('VERIFIER_REPORT_INVALID');
  }
}

/** Construye el manifest. `verifier` debe provenir de `runVerifier()` (o del
 *  mismo reporte); si falta, el gate `testsMatchVerifier` queda en false para
 *  que el release no declare un conteo que no puede demostrar. */
export function buildManifest({ generatedAt = new Date().toISOString(), stage = 'RC', verifier } = {}) {
  const cfg = read('src/00_Config.js');
  const appVersion = cfg.match(/VERSION:\s*'([^']+)'/)?.[1];
  const clinicalSchema = Number(cfg.match(/SISTEMA_VERSION_SCHEMA_ACTUAL\s*=\s*(\d+)/)?.[1]);
  const installerVersion = cfg.match(/SISTEMA_VERSION_INSTALADOR\s*=\s*'([^']+)'/)?.[1];
  const formsSchema = Number(cfg.match(/GOOGLE_FORMS_CONFIG\s*=\s*\{[\s\S]*?SCHEMA_VERSION:\s*(\d+)/)?.[1]);
  if (!appVersion || !clinicalSchema || !installerVersion || !formsSchema) throw new Error('VERSION_METADATA_INVALID');

  const decNums = [...read('DECISIONES.md').matchAll(/^## DEC-(\d+)/gm)].map(m => Number(m[1]));
  if (!decNums.length) throw new Error('DECISIONES_INVALIDAS');
  const decisionsThrough = 'DEC-' + Math.max(...decNums);

  const gitSha = git('rev-parse', 'HEAD');
  const branch = git('branch', '--show-current');
  const v = verifier || { suites: 0, passed: 0, failed: 0 };
  return {
    appVersion,
    releaseStage: stage,
    clinicalSchema,
    formsSchema,
    installerVersion,
    gitSha,
    branch,
    generatedAt,
    verifier: { suites: v.suites || 0, passed: v.passed || 0, failures: v.failed || 0 },
    contracts: { capture: 'V4', decisionsThrough },
    activation: { requiresAfterHours: true, productionMutated: null },
    releaseGate: {
      headMatchesSha: gitSha === git('rev-parse', 'HEAD'),
      testsMatchVerifier: !!verifier
    }
  };
}

export function writeManifest(options = {}) {
  const manifest = buildManifest(options);
  fs.writeFileSync(path.join(root, 'RELEASE_CANDIDATE.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

/** Apps Script impone un máximo de 200 VERSIONES existentes (no del número
 *  más alto). `clasp versions` lista una línea por versión; el conteo real es
 *  cuántas líneas hay, nunca max(versionNumber) (los números tienen huecos por
 *  versiones ya borradas). Parser tolerante a la cabecera "Found N versions."
 *  y a descripciones arbitrarias. */
export const APPS_SCRIPT_MAX_VERSIONS = 200;
export const APPS_SCRIPT_WARN_VERSIONS = 190;

export function parseClaspVersions(stdout) {
  const numbers = [];
  for (const linea of String(stdout || '').split('\n')) {
    const m = linea.match(/^\s*(\d+)\s*-\s*/);
    if (m) numbers.push(Number(m[1]));
  }
  return { count: numbers.length, numbers };
}

export function versionCapacity(count, { max = APPS_SCRIPT_MAX_VERSIONS, warn = APPS_SCRIPT_WARN_VERSIONS } = {}) {
  const n = Number(count) || 0;
  const free = max - n;
  if (n >= max) return { ok: false, level: 'LIMIT', count: n, free, reason: 'APPS_SCRIPT_VERSION_LIMIT_REACHED' };
  if (n >= warn) return { ok: true, level: 'NEAR', count: n, free, reason: 'APPS_SCRIPT_VERSION_LIMIT_NEAR' };
  return { ok: true, level: 'OK', count: n, free, reason: '' };
}

/** Preflight de capacidad ANTES del deploy: si el proyecto está lleno, NO se
 *  ejecuta `clasp deploy` (fail-closed). `runClasp` es inyectable para poder
 *  verificar que en el límite no se invoca el deploy. */
export function capacityGuardForDeploy({ versionStdout, deployId, max = APPS_SCRIPT_MAX_VERSIONS, warn = APPS_SCRIPT_WARN_VERSIONS, runClasp }) {
  const { count } = parseClaspVersions(versionStdout);
  const cap = versionCapacity(count, { max, warn });
  if (!cap.ok) return { ...cap, deployed: false, deployResult: null };
  const r = runClasp('clasp', ['deploy', '--deploymentId', deployId]);
  const deployed = !!r && r.status === 0;
  return { ...cap, deployed, deployResult: r, reason: deployed ? '' : 'CLASP_DEPLOY_FALLÓ' };
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stage = (process.argv.find(a => a.startsWith('--stage=')) || '').split('=')[1] || 'RC';
  const verifier = runVerifier();
  const m = writeManifest({ stage, verifier });
  console.log(`RELEASE_MANIFEST_WRITTEN ${m.appVersion} ${m.gitSha.slice(0, 12)} suites=${m.verifier.suites} failures=${m.verifier.failures} stage=${m.releaseStage}`);
}
