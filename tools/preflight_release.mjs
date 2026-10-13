#!/usr/bin/env node
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const commands = [
  ['node', ['tools/verificar.mjs']],
  ['node', ['tools/auditar_v254.mjs']],
  ['node', ['tests/aceptacion_formulario.mjs']],
  ['node', ['tests/contrato_captura_v2.mjs']],
  ['node', ['tests/validar_html.mjs']],
  ['node', ['tests/no_placeholder_tests_all.mjs']],
  ['node', ['tests/xss_sinks_v260.mjs']],
  ['node', ['tests/seguridad_webapp_capacidades_vNEXT.mjs']],
  ['node', ['tests/rpc_public_surface_v255.mjs']],
  ['node', ['tests/forms_legacy_migration_v259.mjs']],
  ['node', ['tests/forms_legacy_health_v259.mjs']],
  ['node', ['tests/forms_menu_safe_ops_v259.mjs']],
  ['node', ['tests/concurrent_append_v260.mjs']],
  ['node', ['tests/cache_epoch_v260.mjs']],
  ['node', ['tests/review_invalid_payload_v260.mjs']],
  ['node', ['tests/release_preflight_v260.mjs', '--self-check']],
  ['node', ['tests/activation_assistant_v260.mjs']],
  ['node', ['tests/release_manifest_v260.mjs']]
];

export function versionGate(configText = fs.readFileSync(path.join(root, 'src/00_Config.js'), 'utf8'), readmeText = fs.readFileSync(path.join(root, 'README.md'), 'utf8')) {
  const version = configText.match(/VERSION:\s*'([^']+)'/)?.[1];
  if (version !== '0.17.0' || !readmeText.includes(`v${version}`)) return { ok: false, reason: 'VERSION_MISMATCH' };
  return { ok: true };
}

export function repositoryGate({ allowDirty = false } = {}) {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
  if (status && !allowDirty) return { ok: false, reason: 'DIRTY_TREE' };
  const diff = spawnSync('git', ['diff', '--check'], { cwd: root, encoding: 'utf8' });
  if (diff.status !== 0) return { ok: false, reason: 'DIFF_CHECK_FAILED', output: diff.stdout + diff.stderr };
  return { ok: true };
}

export function runPreflight({ allowDirty = false, commandRunner } = {}) {
  const gate = repositoryGate({ allowDirty });
  if (!gate.ok) return gate;
  const vg = versionGate();
  if (!vg.ok) return vg;
  const run = commandRunner || ((cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8' }));
  for (const [cmd, args] of commands) {
    const r = run(cmd, args);
    if (r.status !== 0) return { ok: false, reason: 'COMMAND_FAILED', command: [cmd, ...args].join(' '), output: (r.stdout || '') + (r.stderr || '') };
  }
  return { ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runPreflight({ allowDirty: process.env.ECICEP_PREFLIGHT_ALLOW_DIRTY === '1' });
  if (result.output) process.stdout.write(result.output.slice(-12000));
  console.log(result.ok ? 'RELEASE_PREFLIGHT_PASS' : `RELEASE_PREFLIGHT_FAIL ${result.reason}${result.command ? ' ' + result.command : ''}`);
  process.exitCode = result.ok ? 0 : 1;
}
