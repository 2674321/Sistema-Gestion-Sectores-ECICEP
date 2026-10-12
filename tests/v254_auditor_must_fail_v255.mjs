// v255 — meta-test del auditor v254: el auditor DEBE fallar ante una regresión
// real. Falla si `tools/auditar_v254.mjs` se volvió decorativo (siempre verde).
//
// Estrategia: se ejecuta el auditor real (debe pasar), y luego en un sandbox
// temporal se inyecta una regresión en `src/00_Config.js` (LOCK_WAIT_MS 750→7500)
// y se verifica que el auditor devuelve exit != 0.
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, symlinkSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const auditor = path.join(root, 'tools', 'auditar_v254.mjs');
assert.ok(existsSync(auditor), 'falta tools/auditar_v254.mjs');

function correr(dir) {
  const p = spawnSync(process.execPath, [auditor], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  return { status: p.status, out: (p.stdout || '') + (p.stderr || '') };
}

// 1) En el repo real, el auditor debe estar verde.
const base = correr(root);
assert.equal(base.status, 0, 'el auditor debe pasar en el repo real:\n' + base.out.slice(-600));

// 2) Sandbox: symlinks de tests/tools/docs + copia mutable de src con regresión.
const dir = mkdtempSync(path.join(tmpdir(), 'audit255-'));
try {
  for (const entry of readdirSync(root)) {
    if (entry === 'src' || entry === '.git') continue;
    const src = path.join(root, entry);
    symlinkSync(src, path.join(dir, entry), statSync(src).isDirectory() ? 'dir' : 'file');
  }
  cpSync(path.join(root, 'src'), path.join(dir, 'src'), { recursive: true });
  const canal = path.join(dir, 'src', '36_FormsCanal.js');
  writeFileSync(canal, readFileSync(canal, 'utf8').replaceAll("everyMinutes(5)", "everyMinutes(15)"));

  const regresado = correr(dir);
  assert.notEqual(regresado.status, 0, 'el auditor DEBE fallar ante una cadencia de worker debilitada');
  assert.match(regresado.out, /WORKER_TRIGGER: FAIL/, 'debe reportar la comprobación que falló');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('v254_auditor_must_fail_v255: PASS');
