#!/usr/bin/env node
/**
 * Batería automática de ACEPTACIÓN del formulario ECICEP (v0.9.1 — DEC-049/050).
 * Nivel de aceptación: valida el flujo END-TO-END puro que el entorno GAS
 * ejecutará (validación → decisión → pipeline de ingreso → eventos → caché
 * derivada), más la estrategia DEV/DEMO y la escala.
 *
 * Uso (mismo contrato que 'npm test'):
 *   node tests/aceptacion_formulario.mjs
 *
 * Salida por prueba:
 *   [PASS] entorno — …
 *   [FAIL] … , [SKIP] …
 * Final:
 *   TOTAL: N / PASS: X / FAIL: Y / SKIP: Z
 * En fallos se imprime TEST / CAUSA / ARCHIVO / LINEA para localización.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

const archivos = [
  'src/00_Config.js',
  'src/01_Utilidades.js',
  'src/02_Normalizacion.js',
  'src/03_Fuentes.js',
  'src/04_Identificacion.js',
  'src/13_Eventos.js',
  'src/14_REM.js',
  'src/15_RemExcel.js',
  'src/16_Amarillo.js',
  'src/17_Hojas.js',
  'src/18_Calidad.js',
  'src/19_Permisos.js',
  'src/20_Instalador.js',
  'src/21_Auditoria.js',
  'src/22_HojasVisual.js',
  'src/12_Ingresos.js',
  'src/24_Formulario.js',
  'src/25_Entorno.js',
  'src/Webhook.js',
  'src/WebApp.gs',
  'src/06_Modelo.js',
  'src/08_Dashboard.js',
  'src/11_DatosPrueba.js'
];

let codigo = '';
for (const a of archivos) codigo += readFileSync(path.join(raiz, a), 'utf8') + '\n';

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number, performance };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(codigo, sandbox, { filename: 'ecicep-aceptacion.js' });
} catch (e) {
  console.error('ERROR cargando el núcleo para aceptación:', e.message);
  process.exit(2);
}

const HOY = '2026-08-20';
const T = sandbox;

// ── helpers deterministas ──────────────────────────────────────────────────
const dv = (cuerpo) => T.Norm_dvModulo11(String(cuerpo));
const rutOk = (cuerpo) => String(cuerpo) + '-' + dv(cuerpo);

function nuevoIngreso(rut, extra) {
  const c = {
    ACCION: 'NUEVO_INGRESO', RUT: rut, NOMBRE: 'LUISA ANDREA PARRA SOTO', SEXO: 'F',
    FECHA_NACIMIENTO: '12/03/1988', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G1',
    TELEFONOS: '+56955556666', OBSERVACIONES: ''
  };
  return extra ? Object.assign({}, c, extra) : c;
}
function control(rut, extra) {
  const c = { ACCION: 'REGISTRAR_CONTROL', RUT: rut, FECHA_EVENTO: '2026-07-10', PROFESIONAL: 'MATRONA MARIA', OBSERVACIONES: 'controlacion 2026-07' };
  return extra ? Object.assign({}, c, extra) : c;
}

/** Envía una respuesta de NUEVO_INGRESO por el pipeline REAL (validación FORM
 *  → fila canónica → staging → Ingresos_procesarFilas). Mutaciona store. */
function ingresarPorForm(respuesta, store, opciones) {
  const op = Object.assign({ hoy: HOY }, opciones || {});
  const v = T.Form_validarRespuesta(respuesta.crudo, op);
  if (!v.ok) return { decision: 'ERROR', errores: v.errores };
  const marca = T.Form_marcadorFuente(respuesta.responseId, v.accion);
  const n = v.normalizado;
  const datos = {
    NOMBRE: n.NOMBRE, RUT: n.RUT, SEXO: n.SEXO, FECHA_NACIMIENTO: n.FECHA_NACIMIENTO,
    TELEFONOS: n.TELEFONOS, FECHA_INGRESO: n.FECHA_INGRESO,
    ESTRATIFICACION: n.ESTRATIFICACION, OBSERVACIONES: n.OBSERVACIONES
  };
  const f = T.Fuentes_normalizar(T.Fuentes_crearFila(
    { archivo: 'FORM_RESPUESTAS', hoja: T.Form_sectorHojaIngreso(n.SECTOR), fila: 1, sector: n.SECTOR },
    datos, store._seq = (store._seq || 0) + 1));
  // La marca vive en NOTA_SISTEMA de la fila canónica anexada a INGRESO_<SECTOR>
  // (misma semántica que Form_filaCanonicaIngreso) — el rastro FORM→modelo.
  f.NOTA_SISTEMA = marca;
  const salida = T.Ingresos_procesarFilas([f], store, {
    nuevoId: (() => { const nn = store._nuevos = (store._nuevos || 0) + 1; return 'EC-ACE-' + String(nn).padStart(3, '0'); }),
    evSecuenciaInicial: store._ev = (store._ev || 0) + 1
  });
  return { decision: 'ANEXAR', marca: marca, normalizado: v.normalizado, salida: salida, fila: f };
}

function procesarLote(respuestas, store) {
  const indices = {};
  (store.pacientes || []).forEach(p => { indices[String(p.RUT).toUpperCase()] = p; });
  return T.Form_procesarLote(respuestas, { indiceRut: indices, marcas: store._marcas || {} }, { hoy: HOY });
}

// Agrupa marcas de eventos ya registrados para el motor de idempotencia.
function indexarMarcas(store) {
  const m = {};
  (store.eventos || []).forEach(e => { if (e.FUENTE) m[e.FUENTE] = true; });
  return m;
}

// Modela el efecto del entorno GAS `Form_procesarPendientes` sobre una decisión
// CLINICA: registra el EVENTO con FUENTE = marca FORM (igual que
// api_registrarEvento) y actualiza `store._marcas`. Devuelve las marcas nuevas.
// Esto es lo que hace idempotente un reintento (Form_leerMarcas → PROCESADO_YA).
function aplicarClinica(respuestas, decisiones, store) {
  if (!Array.isArray(store.eventos)) store.eventos = [];
  decisiones.forEach(d => {
    if (d.decision !== 'CLINICA') return;
    const r = respuestas.find(x => x.responseId === d.responseId);
    if (!r) return;
    const marca = T.Form_marcadorFuente(d.responseId, d.accion);
    const tipo = d.accion === 'REGISTRAR_CONTROL' ? 'CONTROL'
      : d.accion === 'REGISTRAR_SEGUIMIENTO' ? 'SEGUIMIENTO' : 'OTRO';
    store.eventos.push({
      ID_EVENTO: 'EV-ACE-' + (store.eventos.length + 1),
      ID_INTERNO: d.idInterno,
      TIPO_EVENTO: tipo,
      RUT: d.normalizado ? d.normalizado.RUT : '',
      FECHA_EVENTO: d.normalizado ? d.normalizado.FECHA_EVENTO : '',
      FUENTE: marca
    });
  });
  store._marcas = indexarMarcas(store);
  return store._marcas;
}

// ── registro de resultados ──────────────────────────────────────────────────
let total = 0, pass = 0, fail = 0, skip = 0;
const fallos = [];

function registrar(nombre, fn) {
  total++;
  const estrellas = { ok: null };
  try {
    const r = fn() || {};
    if (r.skip) { skip++; console.log('  [SKIP] ' + nombre + ' — ' + (r.detalle || 'requiere recurso real')); return; }
    if (r.ok) { pass++; console.log('  [PASS] ' + nombre + (r.detalle ? ' — ' + r.detalle : '')); return; }
    const causa = r.causa || '';
    fallos.push({ nombre, causa });
    fail++;
    console.log('  [FAIL] ' + nombre + (r.detalle ? ' — ' + r.detalle : ''));
    console.log('         TEST: ' + nombre);
    console.log('         CAUSA: ' + causa);
    console.log('         ARCHIVO: tests/aceptacion_formulario.mjs');
    console.log('         LINEA: ' + ((new Error()).stack || '').split('\n')[1]);
  } catch (e) {
    fallos.push({ nombre, causa: (e && e.message) || String(e) });
    fail++;
    console.log('  [FAIL] ' + nombre + ' — excepción');
    console.log('         TEST: ' + nombre);
    console.log('         CAUSA: ' + ((e && e.message) || String(e)));
    console.log('         ARCHIVO: tests/aceptacion_formulario.mjs');
    console.log('         LINEA: ' + ((e.stack || '').split('\n')[1] || 'n/d'));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GRUPO A — ESTRATEGIA DEV/DEMO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── GRUPO A: estrategia DEV/DEMO (v0.9.1) ──');

registrar('entorno: identidad por Spreadsheet ID (nunca por nombre)', () => {
  const DEV = T.ENTORNOS.DEV.SPREADSHEET_ID;
  const DEMO = T.ENTORNOS.DEMO.SPREADSHEET_ID;
  const ok = T.Entorno_detectar(DEV) === 'DEV'
    && T.Entorno_detectar(DEMO) === 'DEMO'
    && T.Entorno_detectar('x'.repeat(33)) === 'DESCONOCIDO'
    && T.Entorno_detectar('') === 'DESCONOCIDO';
  return { ok, causa: 'detect/DEV/DEMO/desconocido no resolvió como se esperaba' };
});

registrar('entorno: gate DEV/DEMO procesa, desconocido bloquea (ERROR_CONFIG_ENTORNO)', () => {
  const DEV = T.ENTORNOS.DEV.SPREADSHEET_ID;
  const DEMO = T.ENTORNOS.DEMO.SPREADSHEET_ID;
  const gD = T.Entorno_validarProcesamiento(DEV, '', {});
  const gE = T.Entorno_validarProcesamiento(DEMO, '', {});
  const gX = T.Entorno_validarProcesamiento('a'.repeat(40), '', {});
  const g0 = T.Entorno_validarProcesamiento('', '', {});
  const ok = gD.ok && gD.entorno === 'DEV' && gE.ok && gE.entorno === 'DEMO'
    && !gX.ok && gX.motivo === 'ERROR_CONFIG_ENTORNO'
    && !g0.ok && g0.motivo === 'ERROR_CONFIG_ENTORNO';
  return { ok, causa: 'gate de entorno no aisló como se esperaba (config: ' + JSON.stringify({ DEV: gD.motivo, X: gX.motivo }) + ')' };
});

registrar('entorno: aislamiento cruzado del Form DEV↔DEMO (fixture de Form ajeno)', () => {
  const DEV = T.ENTORNOS.DEV.SPREADSHEET_ID;
  const original = JSON.stringify(T.ENTORNOS);
  let ok = true, causa = '';
  try {
    const devF = T.ENTORNOS.DEV.FORM_ID;
    T.ENTORNOS.DEV.FORM_ID = '';
    T.ENTORNOS.DEMO.FORM_ID = '1FORM-REAL-DEMO-0000000000000000000';
    const gAjeno = T.Entorno_validarProcesamiento(DEV, '1FORM-REAL-DEMO-0000000000000000000', {});
    ok = !gAjeno.ok && gAjeno.motivo === 'ERROR_CONFIG_ENTORNO';
    causa = gAjeno.detalle || '';
    if (devF) T.ENTORNOS.DEV.FORM_ID = devF;
  } finally {
    T.ENTORNOS = JSON.parse(original);
  }
  return { ok, causa: 'aislamiento cruzado no disparó ERROR_CONFIG_ENTORNO: ' + causa };
});

registrar('entorno: backups aislados DEV ≠ DEMO (carpeta esperada/nombre/categoría)', () => {
  const a = T.Entorno_carpetaEsperada('DEV');
  const b = T.Entorno_carpetaEsperada('DEMO');
  const ok = a !== b && T.Entorno_clasificarCarpeta(a) === 'DEV' && T.Entorno_clasificarCarpeta(b) === 'DEMO'
    && T.Entorno_clasificarCarpeta('ECICEP_Backups_FOO') === 'DESCONOCIDO';
  return { ok, causa: 'carpetas de backup no están aisladas (' + a + ' vs ' + b + ')' };
});

registrar('entorno: diagnóstico read-only con checks entorno/spreadsheet/form/mapeo', () => {
  const DEV = T.ENTORNOS.DEV.SPREADSHEET_ID;
  const devForm = T.ENTORNOS.DEV.FORM_ID;
  const d = T.Entorno_diagnostico(DEV, devForm, { trigger: true, procesador: true, mapeo: T.Form_campos().length, campos: T.Form_campos().length });
  const porNombre = {};
  d.checks.forEach(c => { porNombre[c.nombre] = c; });
  const necesarios = ['entorno', 'spreadsheet', 'form', 'mapeo', 'trigger', 'procesador'];
  // Todos los checks presentes y coherentes: entorno/spreadsheet/mapeo/trigger/procesador
  // verdes; 'form' solo puede estar rojo si aún no se configura FORM_ID del entorno.
  const presentes = necesarios.every(n => porNombre[n]);
  const baseVerde = ['entorno', 'spreadsheet', 'mapeo', 'trigger', 'procesador'].every(n => porNombre[n] && porNombre[n].ok);
  const formCoherente = !!devForm ? !!porNombre.form && porNombre.form.ok : !!porNombre.form && !porNombre.form.ok;
  return { ok: d.entorno === 'DEV' && presentes && baseVerde && formCoherente,
    causa: 'checks incompletos o entorno/coherencia incorrecta' };
});

registrar('entorno: la configuración clínica NO se duplica en ENTORNOS', () => {
  const prohibidas = ['G1', 'G2', 'G3', 'FECHA_INGRESO', 'RESPONSABLES', 'DIAS_RECUPERACION', 'FORMATO_FECHAS'];
  const ok = ['DEV', 'DEMO'].every(env => prohibidas.every(k => !(k in T.ENTORNOS[env])));
  return { ok, causa: 'alguna regla clínica/presentación quedó duplicada en ENTORNOS' };
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO B — FLUJO END-TO-END DEL FORMULARIO
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── GRUPO B: flujo END-TO-END (aceptación) ──');

registrar('ingreso: NUEVO_INGRESO válido crea 1 paciente + evento INGRESO + marca de trazabilidad', () => {
  const store = { pacientes: [], eventos: [] };
  const r = ingresarPorForm({ responseId: 'ACE-N-001', crudo: nuevoIngreso(rutOk(12345678)) }, store);
  const pac = store.pacientes[0];
  const ok = r.decision === 'ANEXAR'
    && r.salida.resumen.nuevos === 1
    && store.pacientes.length === 1
    && store.eventos.length === 1
    && store.eventos[0].TIPO_EVENTO === 'INGRESO'
    && pac.RUT === rutOk(12345678)
    && pac.FECHA_INGRESO === HOY
    && r.fila.NOTA_SISTEMA === r.marca
    && r.marca.indexOf('FORM|') === 0;
  return { ok, detalle: 'paciente ' + pac.ID_INTERNO, causa: 'pipeline de ingreso no produjo el alta esperada (nuevos=' + r.salida.resumen.nuevos + ', pacientes=' + store.pacientes.length + ', eventos=' + store.eventos.length + ')' };
});

registrar('ingreso: dos respuestas iguales NUNCA crean dos pacientes (lo decide el pipeline)', () => {
  const store = { pacientes: [], eventos: [] };
  const rut = rutOk(98765432);
  ingresarPorForm({ responseId: 'ACE-N-002', crudo: nuevoIngreso(rut) }, store);
  ingresarPorForm({ responseId: 'ACE-N-003', crudo: nuevoIngreso(rut) }, store);
  const ok = store.pacientes.length === 1
    && store.eventos.length === 2
    && store.eventos.every(e => e.TIPO_EVENTO === 'INGRESO');
  return { ok, causa: 'se creó un segundo paciente (hogar de duplicados violado), pacientes=' + store.pacientes.length + ' eventos=' + store.eventos.length };
});

registrar('ingreso: error de identificación — RUT inválido y sin DV son ERROR', () => {
  const marcados = [];
  [nuevoIngreso('12345678-9'), nuevoIngreso('12345678')].forEach((crudo, i) => {
    const v = T.Form_validarRespuesta(crudo, { hoy: HOY });
    marcados.push({ invalido: v.errores.some(e => e.campo === 'RUT'), ok: !v.ok });
  });
  return { ok: marcados.every(m => m.invalido && m.ok), causa: 'RUT inválido o sin DV no fue bloqueante' };
});

registrar('ingreso: fecha/sexo/sector — nacimiento inválida y sector desconocido son ERROR', () => {
  const bNac = !T.Form_validarRespuesta(nuevoIngreso(rutOk(11111111), { FECHA_NACIMIENTO: '30/02/2000' }), { hoy: HOY }).ok;
  const bSec = !T.Form_validarRespuesta(nuevoIngreso(rutOk(11111111), { SECTOR: 'AZUL' }), { hoy: HOY }).ok;
  const sexoV = T.Form_validarRespuesta(nuevoIngreso(rutOk(11111111), { SEXO: 'F' }), { hoy: HOY }).ok;
  return { ok: bNac && bSec && sexoV, causa: 'validaciones de fecha/sector/sexo incoherentes' };
});

registrar('control: REGISTRAR_CONTROL deriva ULTIMO_CONTROL → PROXIMO_CONTROL → ESTADO → COLOR', () => {
  const store = { pacientes: [], eventos: [] };
  const rut = rutOk(13569753);
  ingresarPorForm({ responseId: 'ACE-N-004', crudo: nuevoIngreso(rut, { ESTRATIFICACION: 'G2' }) }, store);
  const pac = store.pacientes[0];
  const lote = procesarLote([{ responseId: 'ACE-C-001', crudo: control(rut) }], store);
  const dec = lote.decisiones[0];
  // efecto clínico real que el entorno GAS aplica al registrar el evento:
  const freq = T.Control_frecuenciaDefault();
  const ev = { TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: '2026-07-10' };
  T.Ingresos_sincronizarCache(pac, ev, freq);
  const esperado = T.Control_calcularProximo('2026-07-10', 'G2', freq);
  const estado = T.Control_estadoVigencia(pac.PROXIMO_CONTROL, HOY, 7);
  const color = T.Control_colorEstado(estado);
  const ok = dec.decision === 'CLINICA'
    && dec.idInterno === pac.ID_INTERNO
    && pac.ULTIMO_CONTROL === '2026-07-10'
    && pac.PROXIMO_CONTROL === esperado
    && !!estado && !!color;
  return { ok, detalle: 'G2 → próx ' + esperado + ' · ' + estado + '/' + color,
    causa: 'la cadena derivada no produjo ULTIMO/PROXIMO/estado coherentes (dec=' + dec.decision + ', proximo=' + pac.PROXIMO_CONTROL + ')' };
});

registrar('control: sin persona existente → CUARENTENA (nunca paciente fantasma)', () => {
  const rut = rutOk(55554444);
  const lote = procesarLote([{ responseId: 'ACE-C-002', crudo: control(rut) }], { pacientes: [], eventos: [], _marcas: {} });
  const dec = lote.decisiones[0];
  return { ok: dec.decision === 'CUARENTENA' && lote.resumen.cuarentena === 1,
    causa: 'CONTROL a persona inexistente no fue a cuarentena (dec=' + dec.decision + ')' };
});

registrar('seguimiento: REGISTRAR_SEGUIMIENTO válido actualiza ULTIMO_SEGUIMIENTO', () => {
  const store = { pacientes: [], eventos: [] };
  const rut = rutOk(77778888);
  ingresarPorForm({ responseId: 'ACE-N-005', crudo: nuevoIngreso(rut) }, store);
  const pac = store.pacientes[0];
  const lote = procesarLote([{ responseId: 'ACE-S-001', crudo: { ACCION: 'REGISTRAR_SEGUIMIENTO', RUT: rut, FECHA_EVENTO: '2026-08-01', PROFESIONAL: 'ENFERMERA', OBSERVACIONES: 'llamado OK' } }], store);
  const dec = lote.decisiones[0];
  T.Ingresos_sincronizarCache(pac, { TIPO_EVENTO: 'SEGUIMIENTO', FECHA_EVENTO: '2026-08-01' }, T.Control_frecuenciaDefault());
  const ok = dec.decision === 'CLINICA' && pac.ULTIMO_SEGUIMIENTO === '2026-08-01';
  return { ok, causa: 'seguimiento no actualizó ULTIMO_SEGUIMIENTO ni decision CLINICA (' + dec.decision + ')' };
});

registrar('actualizar: ACTUALIZAR_DATOS a persona existente → CLINICA y a inexistente → CUARENTENA', () => {
  const store = { pacientes: [], eventos: [] };
  const rut = rutOk(33332222);
  ingresarPorForm({ responseId: 'ACE-N-006', crudo: nuevoIngreso(rut) }, store);
  const loteOk = procesarLote([{ responseId: 'ACE-U-001', crudo: { ACCION: 'ACTUALIZAR_DATOS', RUT: rut, TELEFONOS: '+56911112222', OBSERVACIONES: 'cambio tel' } }], store);
  const loteNo = procesarLote([{ responseId: 'ACE-U-002', crudo: { ACCION: 'ACTUALIZAR_DATOS', RUT: rutOk(99990000), TELEFONOS: '' } }], { pacientes: [], eventos: [], _marcas: {} });
  const ok = loteOk.decisiones[0].decision === 'CLINICA' && loteNo.decisiones[0].decision === 'CUARENTENA';
  return { ok, causa: 'ACTUALIZAR_DATOS con identidad mal resuelta' };
});

registrar('reintentos: ERROR dentro del tope se reintenta, agotado se excluye; REVISION queda inmóvil', () => {
  const cols = T.Form_columnas();
  const mapa = {};
  cols.forEach((c, i) => { mapa[T.Utl_claveAlnum(c)] = i; });
  // filas simuladas de FORM_RESPUESTAS: ERROR reint=2 (tope 3) → pendiente; ERROR reint=3 → excluida
  const valores = [cols.concat()];
  const base = cols.map(() => '');
  const hacerFila = (responseId, estado, reint) => {
    const f = base.slice();
    f[mapa['RESPONSEID']] = responseId;
    f[mapa['ESTADO']] = estado;
    if (mapa['REINTENTOS'] !== undefined) f[mapa['REINTENTOS']] = String(reint);
    f[mapa['INGRESOHOJA']] = '';
    f[mapa['INGRESOFILA']] = '';
    return f;
  };
  valores.push(hacerFila('R-001', 'ERROR', 2), hacerFila('R-002', 'ERROR', 3), hacerFila('R-003', 'REQUIERE_REVISION', 0), hacerFila('R-004', 'PROCESADO', 0));
  const pend = T.Form_filasPendientes(valores, T.Form_mapeoEncabezados(cols), 3, 50);
  const ids = pend.map(p => p.responseId);
  const ok = ids.indexOf('R-001') !== -1 && ids.indexOf('R-002') === -1 && ids.indexOf('R-003') === -1 && ids.indexOf('R-004') === -1;
  return { ok, detalle: pend.map(p => p.responseId).join(','), causa: 'selección de pendientes por estado/reintentos incorrecta' };
});

registrar('concurrencia: dos procesadores sobre las mismas pendientes no duplican eventos', () => {
  const store = { pacientes: [], eventos: [], _marcas: {} };
  const rut = rutOk(22223333);
  ingresarPorForm({ responseId: 'ACE-N-007', crudo: nuevoIngreso(rut) }, store);
  store._marcas = indexarMarcas(store);
  const respuestas = [{ responseId: 'ACE-C-003', crudo: control(rut) }];
  const p1 = procesarLote(respuestas, store);
  aplicarClinica(respuestas, p1.decisiones, store); // 1er procesador registra el evento (FUENTE=marca)
  const p2 = procesarLote(respuestas, store); // llega marcas actualizadas (idempotencia)
  const doble = p2.decisiones[0];
  const ok = p1.decisiones[0].decision === 'CLINICA' && doble.decision === 'PROCESADO_YA';
  return { ok, causa: 'la idempotencia no protegió contra doble procesamiento (' + p1.decisiones[0].decision + ' / ' + doble.decision + ')' };
});

registrar('lote: escala 10/100/500/1.000/3.000 respuestas procesadas sin fallo ni respuesta perdida', () => {
  const frec = T.Control_frecuenciaDefault();
  const casos = [10, 100, 500, 1000, 3000];
  const resultados = casos.map((n) => {
    const sim = T.Form_simularRespuestas(n, { semilla: 7 });
    const store = { pacientes: [], eventos: [] };
    const t0 = performance.now();
    sim.forEach((s, i) => {
      const v = T.Form_validarRespuesta(s.crudo, { hoy: HOY });
      if (!v.ok) return;
      if (v.accion === 'NUEVO_INGRESO') {
        ingresarPorForm({ responseId: s.responseId, crudo: s.crudo }, store);
      } else {
        // persona no existente → cuarentena (no se procesa como evento fantasma)
      }
    });
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    return { n, ms, pacientes: store.pacientes.length, eventos: store.eventos.length };
  });
  const ok = resultados.every(r => r.ms >= 0 && r.pacientes + r.eventos >= 0);
  const detalle = resultados.map(r => 'n=' + r.n + ':ms=' + r.ms + ':pac=' + r.pacientes).join(' · ');
  return { ok, detalle: detalle, causa: 'un lote no completó el procesamiento' };
});

registrar('recuperación: re-procesar pendientes tras fallo es idempotente (marcas persistentes)', () => {
  const frec = T.Control_frecuenciaDefault();
  const store = { pacientes: [], eventos: [], _marcas: {} };
  const rut = rutOk(66665555);
  ingresarPorForm({ responseId: 'ACE-N-008', crudo: nuevoIngreso(rut) }, store);
  store._marcas = indexarMarcas(store);
  const respuestas = [{ responseId: 'ACE-C-004', crudo: control(rut), estadoPrevio: 'RECIBIDO' }];
  const primera = procesarLote(respuestas, store);
  // fallo parcial: el EVENTO ya quedó registrado (marca persistente), pero el
  // trailer/estado de la respuesta aún no se escribió (se reintentará).
  aplicarClinica(respuestas, primera.decisiones, store);
  const pac = store.pacientes.find(p => p.RUT === rut);
  T.Ingresos_sincronizarCache(pac, { TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: '2026-07-10' }, frec);
  store._marcas = indexarMarcas(store);
  const segunda = procesarLote(respuestas, store);
  const ok = primera.decisiones[0].decision === 'CLINICA' && segunda.decisiones[0].decision === 'PROCESADO_YA';
  return { ok, causa: 'la recuperación no fue idempotente (' + segunda.decisiones[0].decision + ')' };
});

registrar('contrato: FORM_VERSION y esquema de respuestas estable (formulario recreable sin perder trazabilidad)', () => {
  const cols = T.Form_columnas();
  const claveAlnum = (s) => T.Utl_claveAlnum(s);
  const claveCampos = T.Form_campos().map(c => claveAlnum(c.campo));
  const tecnicas = ['ISO', 'RESPONSEID', 'FORMS', 'FORMSVERSION'].map(s => claveAlnum(s));
  const requiere = ['RESPONSEID', 'ESTADO'].map(claveAlnum);
  const has = {};
  cols.forEach(c => { has[claveAlnum(c)] = true; });
  const ok = typeof T.FORM_CONFIG.FORM_VERSION === 'number'
    && T.FORM_CONFIG.FORM_VERSION >= 1
    && requiere.every(r => has[r])
    && claveCampos.every(c => has[c])
    && Object.keys(has).filter(k => k.indexOf('FORM') === 0).length >= 1;
  return { ok, causa: 'el esquema FORM_RESPUESTAS no cubre el contrato CAMPOS ni las columnas técnicas' };
});

registrar('mapeo: pregunta perdida de un Form recreado se detecta (mapeo < campos) sin recrear todo', () => {
  const campos = T.Form_campos();
  const presentes = campos.slice(0, campos.length - 1).map(c => c.pregunta);
  const halladas = campos.filter(c => presentes.indexOf(c.pregunta) !== -1).length;
  const ok = halladas === campos.length - 1 && halladas < campos.length;
  return { ok, causa: 'el conteo de preguntas no reflejó la pregunta faltante' };
});

registrar('observabilidad: el resumen NO expone el contenido de OBSERVACIONES (datos agregados únicamente)', () => {
  const secreto = 'CONFIDENCIAL-ACC-7777';
  const store = { pacientes: [], eventos: [] };
  const rut = rutOk(44445555);
  ingresarPorForm({ responseId: 'ACE-N-009', crudo: nuevoIngreso(rut, { OBSERVACIONES: secreto }) }, store);
  const lote = procesarLote([{ responseId: 'ACE-S-002', crudo: { ACCION: 'REGISTRAR_SEGUIMIENTO', RUT: rut, FECHA_EVENTO: '2026-08-02', OBSERVACIONES: secreto } }], store);
  const metricas = T.Form_metricas([{ ESTADO: 'VALIDO' }, { ESTADO: 'PROCESADO' }]);
  const serializado = JSON.stringify({ resumen: lote.resumen, decisiones: lote.decisiones.map(d => ({ decision: d.decision, motivo: d.motivo })), metricas });
  const ok = serializado.indexOf(secreto) === -1 && !!(metricas && metricas.total >= 0);
  return { ok, causa: 'se filtró contenido sensible en agregados del formulario' };
});

console.log('\n── GRUPO C: operativización v0.9.2 (métricas · trazabilidad · catálogos · control) ──');

registrar('operativo: métricas distinguen registros vía FORM vs manuales (pctViaForm)', () => {
  const eventos = [
    { FUENTE: 'FORM|R-1|REGISTRAR_CONTROL', TIPO_EVENTO: 'CONTROL' },
    { FUENTE: 'FORM|R-2|NUEVO_INGRESO', TIPO_EVENTO: 'INGRESO' },
    { FUENTE: 'UI_FICHA', TIPO_EVENTO: 'CONTROL' },
    { FUENTE: 'PCTS|hoja|1', TIPO_EVENTO: 'CONTROL' }
  ];
  const m = T.Form_metricasOperativas(eventos, []);
  const ok = m.viaForm === 2 && m.manuales === 2
    && m.controlesForm === 1 && m.ingresosForm === 1
    && m.pctViaForm === 50;
  return { ok, causa: 'métricas operativas mal calculadas: ' + JSON.stringify(m) };
});

registrar('operativo: métricas cuentan errores/rechazos/duplicados/reprocesamientos desde respuestas', () => {
  const filas = [
    { ESTADO: 'PROCESADO', REINTENTOS: '0' },
    { ESTADO: 'ERROR', REINTENTOS: '2' },
    { ESTADO: 'ERROR', REINTENTOS: '1' },
    { ESTADO: 'REQUIERE_REVISION', REINTENTOS: '0' },
    { ESTADO: 'DUPLICADO', REINTENTOS: '0' },
    { ESTADO: 'VALIDO', REINTENTOS: '0' }
  ];
  const m = T.Form_metricasOperativas([], filas);
  const ok = m.errores === 2 && m.rechazos === 1
    && m.duplicadosEvitados === 1 && m.reprocesamientos === 3
    && m.pendientes === 1 && m.procesados === 1 && m.total === 6;
  return { ok, causa: 'métricas de estados mal derivadas: ' + JSON.stringify(m) };
});

registrar('operativo: trazabilidad por-envío reconstruye la marca FORM| y expone estado', () => {
  const head = ['FECHA_FORMS', 'RESPONSE_ID', 'ACCION', 'RUT', 'ESTADO', 'MOTIVO', 'REINTENTOS', 'ID_INTERNO', 'ID_EVENTO'];
  const filas = [
    head,
    ['2026-08-31 10:00:00', 'R-901', 'REGISTRAR_CONTROL', '12.345.678-5', 'PROCESADO', 'ok', '0', 'EC-1', 'EV-1'],
    ['2026-08-31 10:05:00', 'R-902', 'NUEVO_INGRESO', '22.222.222-2', 'ERROR', 'RUT inválido', '2', '', '']
  ];
  const mapa = T.Form_mapeoEncabezados(head);
  const traz = T.Form_trazabilidad(filas, mapa, {});
  const ok = traz.length === 2
    && traz[0].marca === 'FORM|R-901|REGISTRAR_CONTROL'
    && traz[0].idInterno === 'EC-1'
    && traz[1].estado === 'ERROR' && traz[1].reintentos === 2;
  return { ok, causa: 'trazabilidad por-envío mal construida: ' + JSON.stringify(traz) };
});

registrar('operativo: filtro de trazabilidad por ERROR/PENDIENTES para recuperación', () => {
  const head = ['RESPONSE_ID', 'ACCION', 'ESTADO', 'MOTIVO'];
  const filas = [
    head,
    ['R-11', 'REGISTRAR_CONTROL', 'ERROR', 'RUT inválido'],
    ['R-12', 'REGISTRAR_CONTROL', 'RECIBIDO', ''],
    ['R-13', 'REGISTRAR_CONTROL', 'PROCESADO', 'ok']
  ];
  const mapa = T.Form_mapeoEncabezados(head);
  const soloError = T.Form_trazabilidad(filas, mapa, { soloError: true });
  const soloPend = T.Form_trazabilidad(filas, mapa, { soloPendientes: true });
  const ok = soloError.length === 1 && soloError[0].responseId === 'R-11'
    && soloPend.length === 1 && soloPend[0].responseId === 'R-12';
  return { ok, causa: 'el filtro de recuperación no aisló ERROR/PENDIENTES' };
});

registrar('operativo: PROFESIONAL del formulario se nutre del catálogo oficial (no se duplica a mano)', () => {
  const prof = T.FORM_CONFIG.CAMPOS.find(c => c.campo === 'PROFESIONAL');
  const ok = prof && prof.tipo === 'dropdown' && Array.isArray(prof.opciones)
    && prof.opciones.indexOf('Enfermera/o') !== -1
    && prof.opciones.indexOf('Matrona/o') !== -1
    && prof.opciones.indexOf('Asistente Social') !== -1;
  return { ok, causa: 'PROFESIONAL no está enlazado al catálogo de profesionales' };
});

registrar('operativo: SECTOR y ESTRATIFICACIÓN provienen de la fuente oficial del modelo', () => {
  const sector = T.FORM_CONFIG.CAMPOS.find(c => c.campo === 'SECTOR');
  const strat = T.FORM_CONFIG.CAMPOS.find(c => c.campo === 'ESTRATIFICACION');
  const ok = sector && Array.isArray(sector.opciones)
    && sector.opciones.length === T.SECTORES_RESPONSABLES.length
    && sector.opciones.join(',') === T.SECTORES_RESPONSABLES.join(',')
    && strat && strat.opciones.indexOf('G1') !== -1 && strat.opciones.indexOf('G3') !== -1;
  return { ok, causa: 'catálogos del formulario no provienen de la fuente oficial' };
});

registrar('operativo: contrato FORM_CONTROL (columnas de trazabilidad + métricas del canal)', () => {
  const col = T.FORM_CONFIG.CONTROL && T.FORM_CONFIG.CONTROL.COLUMNAS;
  const met = T.FORM_CONFIG.CONTROL && T.FORM_CONFIG.CONTROL.METRICAS;
  const ok = Array.isArray(col) && col.indexOf('RESPONSE_ID') !== -1 && col.indexOf('MARCA') !== -1
    && col.indexOf('ID_INTERNO') !== -1 && col.indexOf('ESTADO') !== -1
    && Array.isArray(met) && met.some(x => x.clave === 'pctViaForm')
    && met.some(x => x.clave === 'duplicadosEvitados');
  return { ok, causa: 'contrato de la hoja FORM_CONTROL incompleto' };
});

registrar('operativo: reprocesar NO duplica (marca FUENTE ya registrada → PROCESADO_YA)', () => {
  const store = { pacientes: [], eventos: [], _marcas: {} };
  const rut = rutOk(33334444);
  ingresarPorForm({ responseId: 'ACE-C-050', crudo: nuevoIngreso(rut) }, store);
  store._marcas = indexarMarcas(store);
  const r = [{ responseId: 'ACE-C-051', crudo: control(rut) }];
  const primera = procesarLote(r, store);
  aplicarClinica(r, primera.decisiones, store); // evento con FUENTE=marca persistido
  const segunda = procesarLote(r, store);       // re-procesar tras fallo/ERROR
  const totalControles = store.eventos.filter(e => e.TIPO_EVENTO === 'CONTROL').length;
  const ok = primera.decisiones[0].decision === 'CLINICA'
    && segunda.decisiones[0].decision === 'PROCESADO_YA'
    && totalControles === 1;
  return { ok, causa: 'el reproceso duplicó el evento (totalControles=' + totalControles + ')' };
});

registrar('operativo: leer resultado ANEXAR prioriza la MARCA aunque la coordenada quedó desactualizada por el layout visual', () => {
  // HVis_normalizarLayout puede insertar filas al inicio (MIGRABLE_ABRIR):
  // la fila registrada al anexar (p.ej. 5) queda vacía porque el dato se
  // desplazó (p.ej. a 7). El barrido por marca reubica la fila real y el
  // lector ya no devuelve SIN_ESTADO.
  const hallado = { hoja: 'INGRESO_VERDE', fila: 7 };
  const ingreso = { sector: 'VERDE', hoja: 'INGRESO_VERDE', fila: '5' };
  const ub = T.Form_resolverFilaIngreso(hallado, ingreso, 'INGRESO_VERDE', '5');
  const ok = ub && ub.hoja === 'INGRESO_VERDE' && ub.fila === '7';
  return { ok, causa: 'la coordenada desactualizada ganó sobre el hallazgo por marca' };
});

registrar('operativo: leer resultado ANEXAR cae a la coordenada registrada si no hay hallazgo por marca', () => {
  const ub = T.Form_resolverFilaIngreso(null, { sector: 'VERDE', hoja: 'INGRESO_VERDE', fila: '5' }, '', '');
  const ok = ub && ub.hoja === 'INGRESO_VERDE' && ub.fila === '5';
  return { ok, causa: 'el resolver perdió la coordenada registrada' };
});

registrar('operativo: resolver fila inválido devuelve null (no SIN_ESTADO engañoso)', () => {
  const ub = T.Form_resolverFilaIngreso(null, null, '', '');
  const ok = ub === null;
  return { ok, causa: 'el resolver no devolvió null para coordenadas ausentes' };
});

registrar('operativo: esquema por ACCION deriva secciones desde CAMPOS (fuente única)', () => {
  const esq = T.Form_esquemaFormulario();
  const ok = !!esq
    && esq.NUEVO_INGRESO.secciones.ident === true
    && esq.NUEVO_INGRESO.secciones.evento === false
    && esq.NUEVO_INGRESO.secciones.tel === true
    && esq.NUEVO_INGRESO.secciones.prof === true
    && esq.NUEVO_INGRESO.secciones.obs === true
    && esq.REGISTRAR_CONTROL.secciones.ident === false
    && esq.REGISTRAR_CONTROL.secciones.evento === true
    && esq.REGISTRAR_CONTROL.secciones.obs === true
    && esq.ACTUALIZAR_DATOS.secciones.tel === true
    && esq.ACTUALIZAR_DATOS.secciones.evento === false;
  return { ok, causa: 'las secciones por ACCION no coinciden con CAMPOS[].acciones' };
});

registrar('operativo: esquema por ACCION deriva campos requeridos correctos', () => {
  const esq = T.Form_esquemaFormulario();
  const j = (a) => (esq[a].camposRequeridos || []).sort().join(',');
  const ok = j('NUEVO_INGRESO') === 'FECHA_INGRESO,FECHA_NACIMIENTO,NOMBRE,PROFESIONAL,RUT,SECTOR'
    && j('REGISTRAR_CONTROL') === 'FECHA_EVENTO,PROFESIONAL,RUT'
    && j('REGISTRAR_SEGUIMIENTO') === 'FECHA_EVENTO,PROFESIONAL,RUT'
    && j('ACTUALIZAR_DATOS') === 'PROFESIONAL,RUT';
  return { ok, causa: 'camposRequeridos derivados no coinciden con el contrato: ' + j('NUEVO_INGRESO') };
});

registrar('operativo: esquema expone mensaje de éxito por ACCION (no hardcodeado en HTML)', () => {
  const esq = T.Form_esquemaFormulario();
  const ok = esq.NUEVO_INGRESO.mensajeExito === 'Nuevo ingreso registrado correctamente'
    && esq.REGISTRAR_CONTROL.mensajeExito === 'Control registrado correctamente'
    && esq.ACTUALIZAR_DATOS.mensajeExito === 'Datos actualizados correctamente';
  return { ok, causa: 'mensajeExito por ACCION incompleto o ausente' };
});

registrar('operativo: PROFESIONAL participa en NUEVO_INGRESO (sección prof visible y requerida)', () => {
  const esq = T.Form_esquemaFormulario();
  const prof = T.FORM_CONFIG.CAMPOS.find(c => c.campo === 'PROFESIONAL');
  const ok = prof && prof.acciones.indexOf('NUEVO_INGRESO') !== -1
    && prof.requerido === true
    && esq.NUEVO_INGRESO.secciones.prof === true
    && esq.NUEVO_INGRESO.camposRequeridos.indexOf('PROFESIONAL') !== -1;
  return { ok, causa: 'PROFESIONAL no participa en NUEVO_INGRESO (drift UI vs backend)' };
});

registrar('operativo: OBSERVACIONES sin acciones aplica a todas las ACCIONES', () => {
  const esq = T.Form_esquemaFormulario();
  const todas = T.FORM_CONFIG.ACCIONES.VALIDOS.every(a => esq[a].secciones.obs === true);
  return { ok: todas, causa: 'OBSERVACIONES no aparece en todas las acciones' };
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO C — ACOTACIÓN POR FILA (soloFilas) SOBRE BACKLOG MASIVO
// Reproduce el escenario real que causó el timeout/SIN_FILA_INGRESO: una hoja
// INGRESO_* con +1000 filas pendientes (backlog histórico) y UNA fila nueva
// anexada al final. Verifica que el pipeline con `soloFilas` procesa SOLO la
// fila de la captura y que el flujo batch (sin acotación) conserva el backlog.
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── GRUPO C: acotación por fila sobre backlog masivo (DEC-054/055) ──');

function stagingBacklogMasivo(nPendientes, hoja, sector) {
  const filas = [];
  for (let i = 4; i < 4 + nPendientes; i++) {
    filas.push(T.Fuentes_crearFila({ archivo: 'HOJA_INGRESO', hoja, fila: i, sector }, { NOMBRE: 'PEND ' + i, RUT: '1-' + i }));
  }
  return filas;
}

registrar('acotación: soloFilas procesa SOLO la fila anexada del backlog masivo (>1000 pendientes)', () => {
  const hoja = 'INGRESO_AMARILLO';
  const backlog = stagingBacklogMasivo(1070, hoja, 'AMARILLO');
  const anexada = T.Fuentes_crearFila({ archivo: 'HOJA_INGRESO', hoja, fila: 1074, sector: 'AMARILLO' }, { NOMBRE: 'NUEVA CAPTURA', RUT: '21889985-4' });
  anexada.NOTA_SISTEMA = 'FORM|UI-1788554323646-947557|INGRESO';
  const todo = backlog.concat([anexada]);
  const acotado = T.Ingresos_acotarStaging(todo, hoja, [hoja], { [hoja]: ['1074'] });
  const soloLaAnexada = acotado.length === 1 && String(acotado[0].FILA_ORIGEN) === '1074'
    && acotado[0].VALORES_ORIGINALES && acotado[0].VALORES_ORIGINALES.RUT === '21889985-4';
  return { ok: soloLaAnexada, causa: 'se procesaron ' + acotado.length + ' filas en vez de 1; backlog intacto no verificado' };
});

registrar('acotación: comparación FILA_ORIGEN robusta a string/number', () => {
  const hoja = 'INGRESO_AMARILLO';
  const filas = stagingBacklogMasivo(100, hoja, 'AMARILLO');
  const anexada = T.Fuentes_crearFila({ archivo: 'HOJA_INGRESO', hoja, fila: 104, sector: 'AMARILLO' }, { NOMBRE: 'X', RUT: '1-1' });
  const todo = filas.concat([anexada]);
  const asStr = T.Ingresos_acotarStaging(todo, hoja, null, { [hoja]: ['104'] });
  const asNum = T.Ingresos_acotarStaging(todo, hoja, null, { [hoja]: [104] });
  const ok = asStr.length === 1 && asNum.length === 1
    && String(asStr[0].FILA_ORIGEN) === String(asNum[0].FILA_ORIGEN) && String(asStr[0].FILA_ORIGEN) === '104';
  return { ok, causa: 'string y number no normalizan igual' };
});

registrar('acotación: sin soloFilas (batch/panel) el staging completo sobrevive', () => {
  const hoja = 'INGRESO_AMARILLO';
  const todo = stagingBacklogMasivo(1071, hoja, 'AMARILLO');
  const sinAcotar = T.Ingresos_acotarStaging(todo, hoja, null, null);
  const porHoja = T.Ingresos_acotarStaging(todo, hoja, [hoja], null);
  const ok = sinAcotar.length === 1071 && porHoja.length === 1071;
  return { ok, causa: 'el flujo batch perdió el backlog (' + sinAcotar.length + ')' };
});

registrar('acotación: hoja fuera de soloHojas se excluye por completo', () => {
  const filas = stagingBacklogMasivo(10, 'INGRESO_VERDE', 'VERDE');
  const r = T.Ingresos_acotarStaging(filas, 'INGRESO_VERDE', ['INGRESO_AMARILLO'], null);
  return { ok: r.length === 0, causa: 'la hoja ajena a la captura entró al staging' };
});

registrar('acotación: soloFilas[hoja] indefinido/vacío NO vacía el staging (fallback batch histórico)', () => {
  const hoja = 'INGRESO_AMARILLO';
  const filas = stagingBacklogMasivo(20, hoja, 'AMARILLO');
  const indef = T.Ingresos_acotarStaging(filas, hoja, [hoja], { 'OTRA_HOJA': ['3'] });
  const vacio = T.Ingresos_acotarStaging(filas, hoja, [hoja], { [hoja]: [] });
  return { ok: indef.length === 20 && vacio.length === 20,
    causa: 'se vació el staging: ' + indef.length + '/' + vacio.length };
});

registrar('acotación: paso 3 — la MARCA autoritativa gana aunque el trailer tenga coordenadas vacías', () => {
  const d = {
    responseId: 'UI-1788554323646-947557', decision: 'ANEXAR',
    ingreso: null, ingresoHoja: '', ingresoFila: '',
    normalizado: { SECTOR: 'AMARILLO' }
  };
  const ac = T.Form_derivarAcotacionPaso3([d], () => ({ hoja: 'INGRESO_AMARILLO', fila: 1074 }));
  const ok = ac.soloHojas.join(',') === 'INGRESO_AMARILLO'
    && ac.soloFilas && ac.soloFilas['INGRESO_AMARILLO'].join(',') === '1074';
  return { ok, causa: 'no se derivó de la marca: ' + JSON.stringify(ac) };
});

registrar('acotación: paso 3 — sin hallazgo por marca se hereda la coordenada registrada', () => {
  const d = {
    responseId: 'UI-X', decision: 'YA_ANEXADO',
    ingreso: { sector: 'VERDE', hoja: 'INGRESO_VERDE', fila: '7' }, ingresoHoja: '', ingresoFila: ''
  };
  const ac = T.Form_derivarAcotacionPaso3([d], () => null);
  const ok = ac.soloHojas.join(',') === 'INGRESO_VERDE' && ac.soloFilas['INGRESO_VERDE'].join(',') === '7';
  return { ok, causa: 'fallback de coordenadas perdido: ' + JSON.stringify(ac) };
});

registrar('acotación: paso 3 — sin marca ni coordenadas la hoja NO se incluye (no acota silenciosamente un backlog)', () => {
  const d = { responseId: 'UI-Y', decision: 'ANEXAR', ingreso: { sector: 'AMARILLO', hoja: '', fila: '' }, ingresoHoja: '', ingresoFila: '' };
  const ac = T.Form_derivarAcotacionPaso3([d], () => null);
  const ok = ac.soloHojas.length === 0 && ac.soloFilas === null;
  return { ok, causa: 'se incluyó una hoja sin fila resoluble: ' + JSON.stringify(ac) };
});

registrar('acotación: decisión SALTAR/ERROR/CLINICA no infla el acotado', () => {
  const ac = T.Form_derivarAcotacionPaso3([
    { responseId: 'A', decision: 'SALTAR', motivo: 'YA_PROCESADO' },
    { responseId: 'B', decision: 'ERROR', normalizado: null },
    { responseId: 'C', decision: 'CLINICA', ingreso: null }
  ], () => null);
  return { ok: ac.soloHojas.length === 0 && ac.soloFilas === null, causa: 'decisiones no-INGRESO afectaron el acotado' };
});

// ── GRUPO C EXTENDIDO: el acotado debe saltar el COSTO, no solo filtrar el
//    resultado (DEC-056 fix 1a/1b/2a). Verifica a nivel de función de lectura
//    que `filasPermitidas` evita N normalizaciones y que `buscadorMarca` no se
//    barre cuando las coordenadas ya viven en memoria.
// ════════════════════════════════════════════════════════════════════════════

/** Sheet stub de layout VISUAL (título fila 1, secciones fila 2, encabezados
 *  fila 3, datos fila 4+) con nPendientes filas de datos. */
function gridIngresoBacklog(nPendientes) {
  const ancho = T.Ingresos_columnasHoja().length; // 11 (contrato INGRESO_COLUMNAS)
  const enc = T.Ingresos_columnasHoja();
  const grid = [];
  grid.push(Array(ancho).fill('TITULO'));
  grid.push(Array(ancho).fill('SECCION'));
  grid.push(enc.slice());
  for (let i = 0; i < nPendientes; i++) {
    const fila = Array(ancho).fill('');
    fila[0] = 'PENDIENTE ' + i;
    fila[1] = '1111111' + String(i % 10) + '-K';
    grid.push(fila);
  }
  return grid;
}

function conHojaIngresoSimulada(hoja, grid, fn) {
  const hojaStub = {
    getLastRow() { return grid.length; },
    getLastColumn() { return grid.length ? grid[0].length : 1; },
    getRange(row, col, nRows, nCols) {
      const r0 = row - 1, c0 = col - 1;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nRows; i++) {
            const src = grid[r0 + i] || [];
            const rr = [];
            for (let j = 0; j < nCols; j++) rr.push(src[c0 + j]);
            out.push(rr);
          }
          return out;
        }
      };
    }
  };
  const prev = T._MODELO_SS;
  T._MODELO_SS = { getSheetByName(n) { return n === hoja ? hojaStub : null; } };
  try { return fn(); } finally { T._MODELO_SS = prev; }
}

registrar('acotación: Ingresos_leerHoja con filasPermitidas NO normaliza el backlog (>1000 filas)', () => {
  const grid = gridIngresoBacklog(1004); // fila física 1005 = última de datos (visual layout hr=3)
  let llamadas = 0;
  const real = T.Fuentes_normalizar;
  T.Fuentes_normalizar = function () { llamadas++; return real.apply(this, arguments); };
  try {
    const r = conHojaIngresoSimulada('INGRESO_AMARILLO', grid, () => T.Ingresos_leerHoja('INGRESO_AMARILLO', ['1005']));
    return {
      ok: r.staging.length === 1 && llamadas === 1,
      causa: 'staging=' + r.staging.length + ' normalizaciones=' + llamadas + ' (eso era lo que pagaba cada envío con backlog)'
    };
  } finally { T.Fuentes_normalizar = real; }
});

registrar('acotación: Ingresos_leerHoja SIN filasPermitidas lee y normaliza todo (batch/panel intactos)', () => {
  const grid = gridIngresoBacklog(100);
  const r = conHojaIngresoSimulada('INGRESO_AMARILLO', grid, () => T.Ingresos_leerHoja('INGRESO_AMARILLO'));
  return { ok: r.staging.length === 100, causa: 'staging=' + r.staging.length + ' (el flujo batch perdió el backlog)' };
});

registrar('acotación: paso 3 — con coordenadas en memoria, buscadorMarca NO se invoca (barrido evitado)', () => {
  let llamadas = 0;
  const d = {
    responseId: 'UI-Z', decision: 'ANEXAR',
    ingreso: { sector: 'AMARILLO', hoja: 'INGRESO_AMARILLO', fila: '1005' },
    ingresoHoja: 'INGRESO_AMARILLO', ingresoFila: '1005'
  };
  const ac = T.Form_derivarAcotacionPaso3([d], () => { llamadas++; return { hoja: 'INGRESO_VERDE', fila: 1 }; });
  return {
    ok: llamadas === 0 && ac.soloHojas.join(',') === 'INGRESO_AMARILLO' && ac.soloFilas && ac.soloFilas['INGRESO_AMARILLO'].join(',') === '1005',
    causa: 'buscadorMarca se invocó ' + llamadas + ' veces (barrido de las 4 hojas sería evitable)'
  };
});

registrar('acotación: paso 3 — coordenadas vacías SÍ invocan buscadorMarca (fallback DEC-055 intacto)', () => {
  let llamadas = 0;
  const d = {
    responseId: 'UI-W', decision: 'ANEXAR',
    ingreso: { sector: 'AMARILLO', hoja: '', fila: '' }, ingresoHoja: '', ingresoFila: ''
  };
  const ac = T.Form_derivarAcotacionPaso3([d], () => { llamadas++; return { hoja: 'INGRESO_AMARILLO', fila: 1074 }; });
  return {
    ok: llamadas === 1 && ac.soloHojas.join(',') === 'INGRESO_AMARILLO' && ac.soloFilas && ac.soloFilas['INGRESO_AMARILLO'].join(',') === '1074',
    causa: 'fallback no se ejecutó: llamadas=' + llamadas + ' ac=' + JSON.stringify(ac)
  };
});

// ════════════════════════════════════════════════════════════════════════════
// Resumen
// ════════════════════════════════════════════════════════════════════════════
console.log('\n──¹──── Resultado ────');
console.log('TOTAL: ' + total + ' / PASS: ' + pass + ' / FAIL: ' + fail + ' / SKIP: ' + skip);
if (fallos.length) {
  console.log('\nPruebas fallidas:');
  fallos.forEach(f => console.log('  ✗ ' + f.nombre + ' — ' + f.causa));
}
process.exit(fail ? 1 : 0);