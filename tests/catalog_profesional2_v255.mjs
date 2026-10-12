// v255 (M10) — catálogo de profesionales ÚNICO: PROFESIONAL y PROFESIONAL2
// reciben las mismas opciones normalizadas/deduplicadas en todas las secciones.
import assert from 'node:assert/strict';
import { createHarness255 } from './helpers/forms_v255_harness.mjs';

const h = createHarness255();
h.c.Captura_v2_catalogo = () => [
  { NOMBRE_CANONICO: 'PROF A', ACTIVO: true },
  { NOMBRE_CANONICO: 'PROF B', ACTIVO: true },
  { NOMBRE_CANONICO: 'PROF A', ACTIVO: true }
];
const inst = h.c.Form_operativoInstalar();
assert.equal(inst.ok, true, JSON.stringify(inst.cambios));
assert.equal(inst.catalogo.profesionales, 2, 'profesionales deduplicados (M10)');

const esquema = h.c.Form_esquemaCanonial_();
const idx = h.c.Form_indexarSchema_(h.form);
let revisados = 0;
for (const sec of esquema.secciones) {
  for (const campo of ['PROFESIONAL', 'PROFESIONAL2']) {
    if (esquema.campos[sec].indexOf(campo) === -1) continue;
    const item = idx.byCanonicalKey[h.c.Form_claveCanonicaItem_(sec, campo)].item;
    const valores = item.getChoices().map(ch => ch.getValue());
    assert.deepEqual(valores, ['PROF A', 'PROF B'], sec + '|' + campo + ' catálogo inconsistente');
    revisados++;
  }
}
assert.ok(revisados >= 6, 'PROFESIONAL y PROFESIONAL2 presentes en varias secciones');
console.log('catalog_profesional2_v255: PASS');
