#!/usr/bin/env node
// v0.13.0 — §8 Reparar presentación = MISMO motor reanudable del instalador:
// item en el menú Sistema, wrapper fino sobre Presentacion_ejecutarPaso_
// (mismo plan, mismo cursor, mismo post-check) y cierre UI coherente.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../src/', import.meta.url);
const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
for (const f of readdirSync(root).filter(x => /\.(js|gs)$/.test(x)).sort())
  vm.runInContext(readFileSync(new URL(f, root), 'utf8'), c, { filename: f });
let n = 0;
const ok = m => { n++; console.log('[PASS] ' + m); };

// T1: el menú Sistema expone Reparar presentación → UI_repararPresentacion.
const srcO = c.onOpen.toString();
const mS = srcO.match(/createMenu\('Sistema'\)([\s\S]*?)\.addToUi/);
assert.ok(mS, 'menú Sistema existe');
assert.equal((mS[1].match(/\.addItem/g) || []).length, 3, 'Sistema tiene 3 items');
assert.match(mS[1], /addItem\('Reparar presentación', 'UI_repararPresentacion'\)/);
ok('T1 menú Sistema incluye Reparar presentación');

// T2: Libro_repararPresentacion_ delega en el motor reanudable con la clave.
let llamado = 0, etapaCap, claveCap;
c.Libro_repararEjecucion_ = () => 'MENU|T2';
c.Presentacion_ejecutarPaso_ = (etapa, clave) => {
  llamado++; etapaCap = etapa; claveCap = clave;
  return { ok: true, continuar: false, cursor: 18, tareasEjecutadas: 18, verificacion: { ok: true } };
};
const r2 = c.Libro_repararPresentacion_();
assert.equal(etapaCap, 'diseno');
assert.equal(claveCap, 'MENU|T2');
assert.equal(r2.ok, true);
ok('T2 wrapper fino delega en Presentacion_ejecutarPaso_(diseno, clave)');

// T3: el wrapper reanuda mientras el motor indique continuar.
let llamados = 0;
c.Presentacion_ejecutarPaso_ = () => {
  llamados++;
  return llamados < 2
    ? { ok: true, continuar: true, cursor: 5, subetapa: { id: 'formato:SECTOR_VERDE' } }
    : { ok: true, continuar: false, cursor: 18, verificacion: { ok: true } };
};
const r3 = c.Libro_repararPresentacion_();
assert.equal(llamados, 2, 'reanuda hasta terminar');
assert.equal(r3.continuar, false);
ok('T3 wrapper reanuda con el mismo cursor entre llamadas al motor');

// T4: verificación no convergente → cierre UI "presentación incompleta".
const alerts = [];
c._UI_get = () => ({ Button: { YES: 'YES' }, ButtonSet: { YES_NO: 1, OK: 2, CANCEL: 3 },
  alert: (t, m) => { alerts.push([t, m]); } });
c.Presentacion_layoutVigente_ = () => true;
c.Presentacion_ejecutarPaso_ = () => ({ ok: true, continuar: false, cursor: 18,
  verificacion: { ok: false, diferencias: [{ hoja: 'SECTOR_VERDE' }] } });
const r4 = c.UI_repararPresentacion();
const a4 = alerts[alerts.length - 1];
assert.ok(a4[0].toLowerCase().includes('incompleta'), 'título señala presentación incompleta');
assert.ok(a4[1].toLowerCase().includes('divergencia'), 'mensaje cuenta divergencias');
ok('T4 UI cierra con presentación incompleta según verificación');

// T5: fallo de subtarea → UI "Reparación incompleta" con motivo y re-intento.
c.Presentacion_layoutVigente_ = () => false;
let confirmo = false;
c._UI_get = () => ({ Button: { YES: 'YES' }, ButtonSet: { YES_NO: 1, OK: 2, CANCEL: 3 },
  alert: (t, m, bs) => { alerts.push([t, m]); confirmo = true; return 'YES'; } });
c.Presentacion_ejecutarPaso_ = () => ({ ok: false, continuar: false, motivo: 'formato:INGRESO_NARANJO falló' });
const r5 = c.UI_repararPresentacion();
assert.equal(confirmo, true, 'pide confirmación cuando el layout no está vigente');
const a5 = alerts[alerts.length - 1];
assert.equal(a5[0], 'Reparación incompleta');
assert.match(a5[1], /formato:INGRESO_NARANJO falló/);
ok('T5 fallo de subtarea llega como motivo y permite reintentar');

// T6: layout vigente → reparar responde sin rewrites y sin confirmar.
let confirmado2 = 0;
c._UI_get = () => ({ Button: { YES: 'YES' }, ButtonSet: { YES_NO: 1, OK: 2, CANCEL: 3 },
  alert: (t, m, bs) => { alerts.push([t, m]); if (t === 'Reparar presentación') confirmado2++; return 'NO'; } });
c.Presentacion_layoutVigente_ = () => true;
c.Presentacion_ejecutarPaso_ = () => ({ ok: true, continuar: false, cursor: 18, omitida: true,
  motivo: 'PRESENTACION_VIGENTE', verificacion: { ok: true } });
const r6 = c.UI_repararPresentacion();
assert.equal(confirmado2, 0, 'no confirma cuando la presentación ya está vigente');
assert.equal(r6.ok, true);
ok('T6 layout vigente → accion no reescribe el libro');

console.log('Reparar presentacion v0.13 — %d/%d PASS', n, 6);
if (n !== 6) process.exit(1);