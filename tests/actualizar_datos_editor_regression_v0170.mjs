#!/usr/bin/env node
// Regresión P0 — ACTUALIZAR_DATOS: la acción se selecciona con <select id="accion">
// desde v254 (4814e15). EditorPaciente quedó consultando radios inexistentes
// (input[name="accion"]:checked) => activo() siempre false => la ficha completa
// nunca se activaba y solo se veían los campos genéricos (tel/prof/obs).
//
// Esta suite ejecuta el <script> REAL de src/EditorPaciente.html en un DOM
// realista (NO radios) y bloquea la reintroducción de la regresión:
//   A. NUEVO_INGRESO → editor oculto.
//   B. change → ACTUALIZAR_DATOS → editor visible y Cargar habilitado.
//   C. change a REGISTRAR_CONTROL → editor oculto y estado reseteado.
//   D. MUTACIÓN: volver activo() a radios => la ficha NO se activa (test falla).
//   E. Render completo: 18 campos de ficha + controles + ≥6 grupos.
//   F. Campos vacíos siguen existiendo como inputs vacíos.
//   G. Cambios diferenciales: solo el campo modificado viaja en el payload.
//   H. Controles de atención (REGISTRAR/CORREGIR) presentes y por acción.
//   I. En captura pública, Actualizar usa los campos operativos y jamás invoca
//      la lectura privada de ficha ni abre el login de operador.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extraerScriptEditor, crearHarness } from './helpers/editor_dom_harness.mjs';

const html = readFileSync(new URL('../src/EditorPaciente.html', import.meta.url), 'utf8');
const SOURCE = extraerScriptEditor(html);

const CAMPOS = ['RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS', 'SECTOR', 'ESTADO',
  'FECHA_INGRESO', 'PREINGRESO', 'DUPLA_INGRESO', 'PROFESIONAL_SEGUIMIENTO', 'CONDICIONES', 'OTRAS_PATOLOGIAS',
  'PROXIMO_CONTROL', 'COMPOSICION_CONTROL', 'OBSERVACIONES', 'SALUD_MENTAL'];

function fichaSintetica(overrides = {}) {
  const campos = {
    RUT: '11.111.111-1', NOMBRE: 'PACIENTE SINTETICO', SEXO: 'F', FECHA_NACIMIENTO: '1980-01-01',
    TELEFONOS: '+56911111111', TELEFONO_OBS: 'CONTACTO SINTETICO', SECTOR: 'AMARILLO', ESTADO: 'INGRESADO',
    FECHA_INGRESO: '2025-01-10', PREINGRESO: 'NO_APLICA', DUPLA_INGRESO: 'EQUIPO TEST',
    PROFESIONAL_SEGUIMIENTO: 'PROF TEST', CONDICIONES: 'COND1', OTRAS_PATOLOGIAS: 'OTRA TEST',
    PROXIMO_CONTROL: '2026-10-20', COMPOSICION_CONTROL: 'CONTROL TEST', OBSERVACIONES: 'OBS TEST', SALUD_MENTAL: 'NO',
    ...overrides
  };
  return {
    ok: true, id: 'P-SYNTH', rutOriginal: '11111111-1', campos,
    ultimos: { CONTROL: { idEvento: 'EV-C', fecha: '2026-09-01' }, SEGUIMIENTO: { idEvento: 'EV-S', fecha: '2026-08-15' } },
    ultimoControl: '2026-09-01', ultimoSeguimiento: '2026-08-15', estratificacion: 'G2',
    condiciones: [{ codigo: 'COND1', nombre: 'Condición 1' }]
  };
}

function montar() {
  const h = crearHarness({ source: SOURCE });
  h.fireDOMContentLoaded();
  return h;
}

let ok = 0;
function test(name, fn) { fn(); ok++; console.log('[PASS] ' + name); }

// A — acción por defecto: editor oculto.
test('A: NUEVO_INGRESO mantiene el editor oculto y Cargar habilitado', () => {
  const h = montar();
  assert.equal(h.document.getElementById('editorPaciente').hidden, true, 'editorPaciente debe estar oculto');
  assert.equal(h.document.getElementById('edCargar').disabled, false, 'Cargar debe estar operativo');
});

// B — cambio a ACTUALIZAR_DATOS: editor visible.
test('B: change a ACTUALIZAR_DATOS activa el editor por <select>', () => {
  const h = montar();
  h.setAccion('ACTUALIZAR_DATOS');
  h.fireAllTimers();
  assert.equal(h.document.getElementById('editorPaciente').hidden, false, 'editorPaciente debe mostrarse');
  assert.equal(h.document.getElementById('edCargar').disabled, false, 'Cargar habilitado');
  assert.equal(h.document.getElementById('edCampos').hidden, true, 'sin ficha cargada, #edCampos oculto');
});

// C — salir de ACTUALIZAR_DATOS: editor oculto y reset.
test('C: salir a REGISTRAR_CONTROL oculta el editor y resetea el estado', () => {
  const h = montar();
  h.setAccion('ACTUALIZAR_DATOS'); h.fireAllTimers();
  h.document.getElementById('rut').value = '11.111.111-1';
  h.document.getElementById('edCargar').click();
  h.resolverCarga(fichaSintetica());
  assert.equal(h.document.getElementById('edCampos').hidden, false, 'ficha cargada visible');
  h.editor.reset();                 // lo que invoca el listener de CapturaWeb
  h.setAccion('REGISTRAR_CONTROL');
  h.fireAllTimers();
  assert.equal(h.document.getElementById('editorPaciente').hidden, true, 'editor oculto al salir');
  assert.equal(h.document.getElementById('edCampos').hidden, true, 'estado reset (DOM vacío)');
  assert.equal(h.editor.hayCambios(), false, 'sin cambios pendientes tras reset');
});

// D — mutación de causa raíz: si activo() vuelve a radios, la ficha NO se activa.
test('D (mutación): activo() con radios NO activa la ficha', () => {
  const mutante = SOURCE.replace(
    /function accionActual_\(\)\{[\s\S]*?\}/,
    'function accionActual_(){var r=document.querySelector(\'input[name="accion"]:checked\');return r?String(r.value||\'\'):\'\';}'
  );
  assert.notEqual(mutante, SOURCE, 'la mutación debe aplicarse sobre accionActual_()');
  const h = crearHarness({ source: mutante });
  h.fireDOMContentLoaded();
  h.setAccion('ACTUALIZAR_DATOS'); h.fireAllTimers();
  assert.equal(h.document.getElementById('editorPaciente').hidden, true,
    'con radios (inexistentes) el editor debe permanecer oculto => reproduce la regresión');
});

// E — render completo de la ficha.
test('E: carga la ficha completa (18 campos, ≥6 grupos) y todos los controles', () => {
  const h = montar();
  h.setAccion('ACTUALIZAR_DATOS'); h.fireAllTimers();
  h.document.getElementById('rut').value = '11.111.111-1';
  h.document.getElementById('edCargar').click();
  h.resolverCarga(fichaSintetica());
  const dom = h.document.getElementById('edCampos');
  assert.equal(dom.hidden, false, 'la ficha debe renderizarse');
  for (const k of CAMPOS) {
    const el = h.document.getElementById('ed_' + k);
    assert.ok(el, 'falta el control ed_' + k);
  }
  const campos = h.camposRenderizados().filter(el => CAMPOS.includes(el.id.slice(3)));
  assert.equal(campos.length, 18, 'deben existir exactamente 18 campos de ficha');
  const grupos = h.gruposRenderizados();
  assert.ok(grupos.length >= 6, 'grupos renderizados (' + grupos.length + ') deben ser ≥6 incluyendo controles');
  // Controles de atención presentes.
  for (const id of ['ed_modo_CONTROL', 'ed_fecha_CONTROL', 'ed_modo_SEGUIMIENTO', 'ed_fecha_SEGUIMIENTO']) {
    assert.ok(h.document.getElementById(id), 'falta control de atención ' + id);
  }
});

// F — campos vacíos siguen existiendo (no se filtran por verdad).
test('F: los campos vacíos se renderizan como controles vacíos editables', () => {
  const h = montar();
  h.setAccion('ACTUALIZAR_DATOS'); h.fireAllTimers();
  h.document.getElementById('rut').value = '11.111.111-1';
  h.document.getElementById('edCargar').click();
  h.resolverCarga(fichaSintetica({ TELEFONO_OBS: '', OTRAS_PATOLOGIAS: '', PROXIMO_CONTROL: '', SALUD_MENTAL: '', ESTADO: '' }));
  for (const k of ['TELEFONO_OBS', 'OTRAS_PATOLOGIAS', 'PROXIMO_CONTROL', 'SALUD_MENTAL', 'ESTADO']) {
    const el = h.document.getElementById('ed_' + k);
    assert.ok(el, 'el campo vacío ' + k + ' debe seguir existiendo');
    assert.equal(el.value, '', k + ' debe estar vacío');
  }
});

// G — cambios diferenciales: solo lo modificado viaja.
test('G: el payload contiene únicamente el campo modificado', () => {
  const h = montar();
  h.setAccion('ACTUALIZAR_DATOS'); h.fireAllTimers();
  h.document.getElementById('rut').value = '11.111.111-1';
  h.document.getElementById('edCargar').click();
  h.resolverCarga(fichaSintetica());
  h.document.getElementById('ed_TELEFONOS').value = '+56922222222';
  const a = h.editor.payload();
  assert.equal(JSON.stringify(a.campos), JSON.stringify({ TELEFONOS: { anterior: '+56911111111', valor: '+56922222222' } }));
  assert.equal(a.id, 'P-SYNTH');
  assert.equal(a.rutOriginal, '11111111-1');
});

// H — atenciones: Registrar/Corregir viajan como cambios de atención.
test('H: una atención Registrada se incluye en el payload del editor', () => {
  const h = montar();
  h.setAccion('ACTUALIZAR_DATOS'); h.fireAllTimers();
  h.document.getElementById('rut').value = '11.111.111-1';
  h.document.getElementById('edCargar').click();
  h.resolverCarga(fichaSintetica());
  const modo = h.document.getElementById('ed_modo_CONTROL');
  modo.value = 'REGISTRAR';
  h.document.getElementById('ed_fecha_CONTROL').value = '2026-10-01';
  const a = h.editor.payload();
  assert.equal(a.atenciones.length, 1);
  assert.equal(JSON.stringify(a.atenciones[0]), JSON.stringify({ tipo: 'CONTROL', modo: 'REGISTRAR', fecha: '2026-10-01', idEvento: '', anterior: '' }));
});

test('I: captura pública actualiza sin cargar ficha ni pedir sesión', () => {
  const h = crearHarness({ source: SOURCE, modoOperador: false });
  h.fireDOMContentLoaded();
  h.setAccion('ACTUALIZAR_DATOS'); h.fireAllTimers();
  assert.equal(h.document.getElementById('editorPaciente').hidden, true,
    'el editor con lectura de ficha debe quedar oculto en captura pública');
  for (const id of ['secTel', 'secAgenda', 'secObs']) {
    assert.equal(h.document.getElementById(id).style.display || '', '', id + ' debe quedar disponible');
  }
  assert.equal(h.editor.validar(), true, 'el editor privado no bloquea el envío público');
  assert.equal(h.editor.payload(), null, 'la captura pública no construye payload con PII precargada');
  h.document.getElementById('edCargar').click();
  assert.equal(h.rpc.metodo, '', 'la captura pública jamás llama WebApp_cargarPacienteEdicion');
});

console.log('actualizar_datos_editor_regression_v0170: ' + ok + '/' + ok);
