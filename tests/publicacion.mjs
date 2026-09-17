#!/usr/bin/env node
// Prueba el workflow sin red, sin clasp real y sin modificar BUILD del proyecto.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
let passed = 0;
for (const scenario of ['argumento', 'ausente', 'testsFallan', 'revision', 'publicar']) {
  const dir = mkdtempSync(join(tmpdir(), 'ecicep-publicacion-'));
  try {
    for (const folder of ['tools', 'src', 'bin']) mkdirSync(join(dir, folder));
    writeFileSync(join(dir, 'tools/push_y_abrir.sh'), readFileSync(new URL('tools/push_y_abrir.sh', root)));
    writeFileSync(join(dir, 'src/00_Config.js'), "var ECICEP = { WEB_APP_URL: 'https://script.google.com/macros/s/OPERATIVO_FICTICIO/exec' };\n");
    const executable = (name, body) => writeFileSync(join(dir, 'bin', name), '#!/bin/bash\n' + body, { mode: 0o755 });
    executable('node', 'if [ "$1" = "tools/verificar.mjs" ]; then exit "${TEST_EXIT:-0}"; fi\nexec "$REAL_NODE" "$@"\n');
    executable('clasp', 'echo "$*" >> "$CALL_LOG"\nif [ "$1" = deployments ]; then\n echo "- CABECERA_FICTICIA @HEAD"\n [ "$SCENARIO" = ausente ] || echo "- OPERATIVO_FICTICIO @191"\nfi\nexit 0\n');
    executable('git', 'if [ "$1" = rev-parse ]; then echo abc123; fi\n');
    executable('xdg-open', 'echo "$1" >> "$CALL_LOG"\n');
    const args = scenario === 'argumento' ? ['--desconocido'] : scenario === 'publicar' ? ['--publish'] : [];
    const log = join(dir, 'calls');
    writeFileSync(log, '');
    const r = spawnSync('bash', ['tools/push_y_abrir.sh', ...args], { cwd: dir, encoding: 'utf8',
      env: { ...process.env, PATH: join(dir, 'bin') + ':' + process.env.PATH, REAL_NODE: process.execPath,
        CALL_LOG: log, SCENARIO: scenario, TEST_EXIT: scenario === 'testsFallan' ? '1' : '0' } });
    const calls = readFileSync(log, 'utf8');
    if (['argumento', 'ausente', 'testsFallan'].includes(scenario)) {
      assert.notEqual(r.status, 0, r.stdout + r.stderr);
      assert.doesNotMatch(calls, /push|deploy --/);
    } else {
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(calls, /push --force/);
      if (scenario === 'publicar') {
        assert.match(calls, /deploy --deploymentId OPERATIVO_FICTICIO/);
        assert.match(calls, /OPERATIVO_FICTICIO\/exec/);
      } else {
        assert.doesNotMatch(calls, /deploy --/);
        assert.match(calls, /CABECERA_FICTICIA\/dev/);
      }
    }
    passed++; console.log('[PASS] publicación: ' + scenario);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`Publicación — ${passed}/${passed}`);
