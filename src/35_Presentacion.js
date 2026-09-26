/**
 * Sistema ECICEP — 35_Presentacion
 * Motor de presentación del libro por SUBTAREAS REANUDABLES.
 *
 * Problema resuelto (hotfix 0.12.1): la fase "Presentación del libro" (etapa
 * 'diseno') excedía el límite de ejecución de Apps Script porque ejecutaba en
 * UN solo RPC Modelo_aplicarDiseno() + Libro_repararPresentacion_({forzar:true}),
 * forzando la reescritura visual completa de todas las hojas en cada
 * instalación.
 *
 * Solución:
 *  - Plan de subtareas con presupuesto de tiempo por RPC
 *    (PRESUPUESTO_PRESENTACION_MS). Cada RPC procesa las subtareas que entren
 *    en el presupuesto y responde {continuar:true, cursor, progreso, subetapa}.
 *  - El cursor se persiste en CacheService por clave de EJECUCION del cliente:
 *    el cliente re-invoca la MISMA etapa con el mismo _EJEC y el servidor
 *    continúa exactamente donde quedó. Cada subtarea es idempotente: si una
 *    RPC muere después de escribir pero antes de persistir, el reintento
 *    vuelve a ejecutar la misma subtarea sin efecto colateral.
 *  - Fast-paths "hoja correcta = cero escrituras": se compara el estado real
 *    antes de escribir (estilos de encabezado, banding, anchos, formatos
 *    numéricos, validaciones, notas y colores de RUT).
 *  - Sin fuerza global: se eliminó el {forzar:true} compartido; una hoja con
 *    secciones sin pintar se detecta (HVis_yaFormateada / HVis_pendientesVisual)
 *    y se repara solo esa hoja.
 *
 *  v0.14: el instalador tiene UNA fase principal de presentación ('diseno').
 *  Las antiguas fases top-level 'visual' e 'inicio' fueron absorbidas: la
 *  estructura superior vive en las subtareas formato:* (Presentacion_-
 *  formatearHoja_ → HVis_reconciliarHoja) e INICIO es la subtarea 'inicio'
 *  de este mismo plan. Instalar_pVisual / Instalar_pInicio quedan como
 *  wrappers deprecated de compatibilidad (20_Instalador).
 *
 *  La etapa 'validaciones' (puertas INGRESO_*) es dueña exclusiva de sus reglas;
 *  este motor NO las duplica.
 */

var PRESUPUESTO_PRESENTACION_MS = 20000;

/** v0.14 §81 — contrato de modos del motor único. AUTO (Instalar/Actualizar:
 *  diagnostica y repara selectivamente) · REPARAR (botón del instalador) ·
 *  FORZAR_INICIO (opción avanzada del instalador) · PROFUNDO (paridad +
 *  validaciones/number-formats/condicionales profundas + verificación INICIO,
 *  sin escribir si no hay drift). */
var PRESENTACION_MODO = {
  AUTO: 'AUTO',
  REPARAR: 'REPARAR',
  FORZAR_INICIO: 'FORZAR_INICIO',
  PROFUNDO: 'PROFUNDO'
};

var PRESENTACION_CACHE_PREFIJO = 'ECICEP_INST_PRES';
var PRESENTACION_LAYOUT_PROP = 'ECICEP_PRESENTACION_LAYOUT_V014';
var PRESENTACION_LAYOUT_VERSION = '0.15.0';
var PRESENTACION_ETAPAS_REANUDABLES = { diseno: true };

/* --------------------------- Plan por hoja --------------------------- */

var PRESENTACION_FAMILIAS_INGRESO = ['INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];

/** (§6) UNA subtarea por hoja grande. Las hojas técnicas (LOG, CONFIG, …) se
 *  mantienen con formato mínimo en 'base'; aquí solo se formatean las hojas
 *  visuales por nombre exacto, para que el runner respete el presupuesto.
 *  Sin el alias INGRESO_NARANJA (sinónimo de captura, no hoja física). DEC-086. */
var PRESENTACION_HOJAS_FORMATO =
  ['PACIENTES']
    .concat(PRESENTACION_FAMILIAS_INGRESO)
    .concat(HOJAS_SECTOR || [])
    .concat(['EVENTOS']);

// El presupuesto es de 20 s por RPC y se evalúa ENTRE subtareas: con 'inicio' al
// final, una sola invocación agotaba el presupuesto formateando hojas y la
// portada quedaba sin construir (regresión 2026-09-25: "Se excedió el tiempo de
// ejecución" y la hoja INICIO sin cambios). 'inicio' va inmediatamente después de
// 'base' para que la portada quede al día en la primera invocación.
var PRESENTACION_SUBPLAN_DISENO = [{ id: 'base', nombre: 'Diseño base del libro' },
  { id: 'inicio', nombre: 'Portada INICIO' }]
  .concat(PRESENTACION_HOJAS_FORMATO.map(function (nombre) {
    return { id: 'formato:' + nombre, nombre: 'Formato visual · ' + nombre };
  }))
  .concat([
    { id: 'validaciones:extras', nombre: 'Reglas complementarias (no puertas)' },
    { id: 'condicionales', nombre: 'Indicadores y estados visuales' },
    { id: 'notas', nombre: 'Notas de ayuda en encabezados' },
    { id: 'accesorios', nombre: 'Protecciones, visibilidad y ayudas' },
    { id: 'paridad:INGRESO', nombre: 'Paridad visual INGRESO' },
    { id: 'paridad:SECTOR', nombre: 'Paridad visual SECTOR' },
    { id: 'verificar', nombre: 'Verificación final de presentación' }
  ]);

function Presentacion_esReanudable_(etapaId) {
  return !!PRESENTACION_ETAPAS_REANUDABLES[etapaId];
}

function Presentacion_progreso_(cursor, total) {
  var completadas = Math.min(Math.max(cursor, 0), total);
  return { actual: completadas, total: total,
    enCurso: completadas < total ? completadas + 1 : total };
}

/** (§10) Fingerprint derivado del contenido real del contrato visual: si cambia
 *  FORMATO_CAMPOS, SECCIONES_HOJAS, HOJAS_UX, CONTRATO_LAYOUT_VISUAL, una
 *  plantilla o el contrato de INICIO, el hash cambia. No es un literal.
 *  v0.15 §8: incluye el fingerprint de INICIO → cambiar el contrato de la
 *  portada invalida automáticamente Presentación (rebuild en la instalación). */
function Presentacion_fingerprintEsperado_() {
  var contrato = {
    plan: PRESENTACION_SUBPLAN_DISENO.map(function (t) { return t.id; }),
    formatoTipos: FORMATO_TIPOS || {},
    formatoCampos: FORMATO_CAMPOS || {},
    secciones: SECCIONES_HOJAS || {},
    ux: HOJAS_UX || {},
    layout: CONTRATO_LAYOUT_VISUAL || {},
    plantillaIngreso: PLANTILLA_VISUAL_INGRESO || {},
    plantillaSector: PLANTILLA_VISUAL_SECTOR || {},
    inicioFingerprint: (typeof Inicio_fingerprintEsperado_ === 'function')
      ? Inicio_fingerprintEsperado_() : 'sin-inicio'
  };
  return 'pp014|' + Utl_fnv1a32_(JSON.stringify(contrato));
}
/** v0.15 §7: el fast-path exige TODO convergente. Opciones de fuerza
 *  (FORZAR_INICIO/PROFUNDO/forzar*) nunca se omiten, y una Presentación
 *  vigente requiere además INICIO vigente + paridad INGRESO/SECTOR: con INICIO
 *  viejo la etapa corre (no se declara PRESENTACION_VIGENTE en falso). */
function Presentacion_layoutVigente_(opciones) {
  opciones = opciones || {};
  if (opciones.forzarPresentacion === true || opciones.forzarInicio === true ||
      opciones.modoPresentacion === 'FORZAR_INICIO' || opciones.modoPresentacion === 'PROFUNDO')
    return false;
  var props = Libro_propiedades_(), raw = '';
  try { raw = props && props.getProperty(PRESENTACION_LAYOUT_PROP); } catch (eP) {}
  if (!raw) return false;
  var meta;
  try { meta = JSON.parse(raw); } catch (eJ) { return false; }
  if (!meta || meta.version !== PRESENTACION_LAYOUT_VERSION ||
      meta.fingerprint !== Presentacion_fingerprintEsperado_()) return false;
  var d = Libro_leerDirty_();
  if (d.VISUAL || d.VALIDACIONES || d.ESTRUCTURA) return false;
  try {
    var diag = HVis_diagnosticarTodas(), pendientes = 0;
    Object.keys(diag.diagnostico || {}).forEach(function (k) {
      var v = diag.diagnostico[k], p = v && v.estadoActual && v.estadoActual.visual;
      pendientes += p ? (p.cantidadPendientes || 0) : 0;
    });
    if (pendientes !== 0) return false;
  } catch (eD) { return false; }
  try {
    var hI = Modelo_ss().getSheetByName('INICIO');
    if (typeof Inicio_layoutVigente_ === 'function' && !Inicio_layoutVigente_(hI)) return false;
  } catch (eI) { return false; }
  try {
    var fam = Presentacion_familiasParidad_();
    if (typeof HVis_compararFamilia_ === 'function') {
      var pi = HVis_compararFamilia_(fam.ingreso);
      var ps = HVis_compararFamilia_(fam.sector);
      if (!pi || !pi.ok || !ps || !ps.ok) return false;
    }
  } catch (eP2) { return false; }
  return true;
}
function Presentacion_guardarLayout_() {
  var props = Libro_propiedades_(); if (!props) return;
  try { props.setProperty(PRESENTACION_LAYOUT_PROP, JSON.stringify({
    version: PRESENTACION_LAYOUT_VERSION,
    fingerprint: Presentacion_fingerprintEsperado_()
  })); } catch (e) {}
}
function Presentacion_invalidarLayout_() {
  var props = Libro_propiedades_();
  try { if (props) props.deleteProperty(PRESENTACION_LAYOUT_PROP); } catch (e) {}
}

/* ------------------------- Persistencia del cursor ------------------------ */

function Presentacion_cache_() {
  try {
    if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
      return CacheService.getScriptCache();
    }
  } catch (e) { /* entorno sin CacheService (pruebas node) */ }
  return null;
}

function Presentacion_cacheClave_(ejecucion) {
  var sufijo = Utl_texto(ejecucion).trim().replace(/[^A-Za-z0-9_-]/g, '_');
  if (!sufijo) sufijo = 'VACIA';
  return PRESENTACION_CACHE_PREFIJO + '|' + sufijo;
}

function Presentacion_cacheLeer_(ejecucion) {
  var cache = Presentacion_cache_();
  if (!cache || !cache.get) return null;
  try {
    var raw = cache.get(Presentacion_cacheClave_(ejecucion));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function Presentacion_cacheGuardar_(ejecucion, etapa, cursor, total) {
  var cache = Presentacion_cache_();
  if (!cache || !cache.put) return;
  try {
    cache.put(Presentacion_cacheClave_(ejecucion),
      JSON.stringify({ etapa: etapa, cursor: cursor, total: total }), 3600);
  } catch (e) { /* best effort */ }
}

function Presentacion_cacheLimpiar_(ejecucion) {
  var cache = Presentacion_cache_();
  if (!cache || !cache.remove) return;
  try { cache.remove(Presentacion_cacheClave_(ejecucion)); } catch (e) { /* best effort */ }
}

/* ----------------------------- Subtareas ----------------------------- */

var _PRESENTACION_VERIFICACION_MEMO = null;

/** Hojas físicas de cada familia para la paridad (sin el alias INGRESO_NARANJA,
 *  que es sinónimo de captura, no una hoja). DEC-086. */
function Presentacion_familiasParidad_() {
  return {
    ingreso: PRESENTACION_FAMILIAS_INGRESO,
    sector: HOJAS_SECTOR || []
  };
}

/** Resultado de la última verificación de presentación (leído por la UI para
 *  decidir el estado final). Se rellena en la subtarea 'verificar'. */
function Presentacion_VerificacionResultado_() {
  return _PRESENTACION_VERIFICACION_MEMO;
}

/** Ejecuta UNA subtarea. Devuelve {ok, detalle} o {ok:false, motivo}.
 *  v0.15 §6: recibe opciones (modoDatos/confirmar + modos de presentación);
 *  la subtarea `inicio` invalida y fuerza el builder cuando corresponde. */
function Presentacion_ejecutarTarea_(tarea, opciones) {
  if (!tarea || !tarea.id) return { ok: false, motivo: 'TAREA_SIN_ID' };
  opciones = opciones || {};
  try {
    var r;
    switch (tarea.id) {
      case 'base':
        r = Modelo_aplicarDiseno();
        break;
      case 'validaciones:extras':
        // Complemento sin duplicar las puertas INGRESO_*, que son de la etapa
        // 'validaciones' (Modelo_validarIngresos). Fast-path: hoja con reglas
        // ya presentes = cero escrituras → ideal para reinstalaciones.
        r = Hojas_aplicarValidaciones_(Modelo_ss(),
          { hojas: [HOJAS.PACIENTES].concat(HOJAS_SECTOR) });
        break;
      case 'notas':
        r = Hojas_aplicarNotas_(Modelo_ss());
        break;
      case 'condicionales':
        r = Hojas_formatoCondicional(Modelo_ss());
        break;
      case 'accesorios':
        var ss = Modelo_ss();
        var rut = Hojas_colorearRutIngresos(ss);
        r = { ok: !(rut.fallidas || []).length, rut: rut,
          ocultas: Hojas_ocultarTecnicas(ss), protecciones: Hojas_proteger(ss),
          filtros: Hojas_filtros(ss), motivo: (rut.fallidas || []).join('; ') };
        break;
      case 'inicio':
        // v0.15 §6: forzarInicio (opción avanzada o modo FORZAR_INICIO) borra el
        // layout guardado y reconstruye explícitamente; si no, el builder
        // decide (fast-path solo si el contrato vigente converge).
        // viaPlan: el writer omite las comparaciones de paridad (las calculan
        // las subtareas paridad:* y las refresca el `verificar` final).
        var forceInicio = opciones.forzarInicio === true ||
          opciones.modoPresentacion === 'FORZAR_INICIO' ||
          (typeof PRESENTACION_MODO !== 'undefined' &&
            opciones.modoPresentacion === PRESENTACION_MODO.FORZAR_INICIO);
        if (forceInicio && typeof Inicio_borrarLayout_ === 'function') Inicio_borrarLayout_();
        var opInicio = {};
        for (var kInicio in opciones) opInicio[kInicio] = opciones[kInicio];
        opInicio.viaPlan = true;
        r = Inicio_construir_(Modelo_ss(), { forzar: forceInicio === true, escribir: opInicio });
        break;
      case 'paridad:INGRESO':
        r = HVis_compararFamilia_(Presentacion_familiasParidad_().ingreso);
        break;
      case 'paridad:SECTOR':
        r = HVis_compararFamilia_(Presentacion_familiasParidad_().sector);
        break;
      case 'verificar':
        _PRESENTACION_VERIFICACION_MEMO = Presentacion_verificar_();
        r = { ok: true, detalle: _PRESENTACION_VERIFICACION_MEMO };
        break;
      default:
        if (tarea.id.indexOf('formato:') === 0) {
          r = Presentacion_formatearHoja_(tarea.id.slice('formato:'.length));
          break;
        }
        r = { ok: false, motivo: 'TAREA_DESCONOCIDA' };
    }
    if (!r) r = { ok: true };
    // Las subtareas 'paridad:*' y 'verificar' NO fallan por divergencias: solo
    // reportan (el estado final lo decide Presentacion_verificar_). Modelo igual
    // que 'notas'/'condicionales'.
    if (r.ok === false || (r.fallidas && r.fallidas.length)) {
      if (tarea.id === 'paridad:INGRESO' || tarea.id === 'paridad:SECTOR' ||
          tarea.id === 'verificar') {
        _PRESENTACION_VERIFICACION_MEMO = r.detalle || r;
        return { ok: true, detalle: r.detalle || r };
      }
      // v0.14.2 §6: prioridad motivo → linea → errores → fallidas → fallback.
      // r.errores antes se perdía y la UI mostraba solo el fallback genérico.
      var motivoFallo = r.motivo || r.linea ||
        (r.errores && r.errores.join('; ')) || (r.fallidas && r.fallidas.join('; ')) ||
        ('Falló la subtarea ' + tarea.nombre);
      var fallo = { ok: false, motivo: motivoFallo };
      if (r.codigo) fallo.codigo = r.codigo;
      return fallo;
    }
    return { ok: true, detalle: r };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

function Presentacion_formatearGrupo_(nombres) {
  var aplicados = 0, errores = [];
  nombres.forEach(function (nombre) {
    try {
      var r = Presentacion_formatearHoja_(nombre);
      aplicados += r.aplicados || 0;
      (r.errores || []).forEach(function (e) { errores.push(e); });
    } catch (e) { errores.push(nombre + ': ' + (e && e.message || e)); }
  });
  return { ok: errores.length === 0, aplicados: aplicados, errores: errores };
}

/** Formatos + estructura superior de UNA hoja (bounded, zero-write si ya
 *  coincide). v0.14: subtarea por hoja canónica — absorbe la antigua fase
 *  top-level 'visual': primero reconcilia la estructura superior vía
 *  HVis_reconciliarHoja_ (diagnose-first; repara drift de filas, secciones,
 *  encabezados y FREEZE, con firma anti-no-convergencia), luego anchos +
 *  formatos numéricos + semántica. Devuelve motivo estructurado y métricas
 *  por fase (estructuraMs/anchosMs/formatosMs/semanticaMs, no sensibles).
 *  Un solo plan, un solo owner por propiedad (§17). */
function Presentacion_formatearHoja_(nombre) {
  var ss = Modelo_ss(), h = ss.getSheetByName(nombre);
  if (!h) return { ok: true, aplicados: 0, motivo: 'sin hoja' };
  var errores = [], codigoFallo = '', t0 = Date.now();
  var ms = { estructuraMs: 0, anchosMs: 0, formatosMs: 0, semanticaMs: 0 };
  if (typeof HVis_reconciliarHoja === 'function') {
    try {
      var rec = HVis_reconciliarHoja(h);
      ms.estructuraMs = Date.now() - t0;
      // v0.14.2 §6: el motivo estructurado del reconciliador (hoja · propiedad
      // · actual/esperado) viaja tal cual; sin él la UI quedaba a ciegas.
      if (rec && rec.ok === false) errores.push(rec.motivo || (nombre + ': estructura superior (' +
        ((rec.detalles || []).join('; ') || 'pendiente') + ')'));
      if (rec && rec.codigo) codigoFallo = rec.codigo;
    } catch (eR) { ms.estructuraMs = Date.now() - t0; errores.push(nombre + ': estructura superior (' + (eR && eR.message || eR) + ')'); }
  }
  var t1 = Date.now();
  _modelo_anchosHoja(h);
  ms.anchosMs = Date.now() - t1;
  var t2 = Date.now();
  var f = Hojas_aplicarFormatosNumero_(ss, { hojas: [nombre] });
  ms.formatosMs = Date.now() - t2;
  var t3 = Date.now();
  var s = Hojas_aplicarSemanticaColumnas_(h);
  ms.semanticaMs = Date.now() - t3;
  var todos = errores.concat(f.errores || []).concat(s.errores || []);
  var out = {
    ok: errores.length === 0 && f.ok !== false && s.ok !== false,
    aplicados: (f.aplicados || 0) + (s.columnas || 0),
    errores: todos,
    motivo: todos.join('; '),
    estructuraMs: ms.estructuraMs, anchosMs: ms.anchosMs,
    formatosMs: ms.formatosMs, semanticaMs: ms.semanticaMs
  };
  if (codigoFallo) out.codigo = codigoFallo;
  return out;
}

/** Verificación final (§7): la presentación solo está OK cuando no quedan
 *  pendientes visuales Y la paridad INGRESO/SECTOR e INICIO convergen. NO
 *  consulta: solo lecturas de diagnóstico (arrays batch). */
function Presentacion_verificar_() {
  var diag = HVis_diagnosticarTodas();
  var pendientes = 0, porHoja = {}, advertencias = [], diferencias = [];
  Object.keys(diag.diagnostico || {}).forEach(function (k) {
    var v = diag.diagnostico[k], p = v && v.estadoActual && v.estadoActual.visual;
    var n = p ? (p.cantidadPendientes || 0) : 0;
    pendientes += n; porHoja[k] = n;
    if (n) advertencias.push(k + ': ' + n + ' pendientes');
  });
  var ss = Modelo_ss();
  var familias = Presentacion_familiasParidad_();
  var paridadIngreso = (typeof HVis_compararFamilia_ === 'function')
    ? HVis_compararFamilia_(familias.ingreso)
    : { ok: true, cantidadDiferencias: 0, diferencias: [] };
  var paridadSector = (typeof HVis_compararFamilia_ === 'function')
    ? HVis_compararFamilia_(familias.sector)
    : { ok: true, cantidadDiferencias: 0, diferencias: [] };
  var hInicio = ss.getSheetByName ? ss.getSheetByName('INICIO') : null;
  var inicio = hInicio && typeof Inicio_diagnosticarVisual_ === 'function'
    ? Inicio_diagnosticarVisual_(hInicio) : { ok: true, diferencias: [] };
  (paridadIngreso.diferencias || []).forEach(function (d) {
    diferencias.push('PARIDAD_INGRESO:' + (d.hoja || '') + ':' + (d.propiedad || ''));
  });
  (paridadSector.diferencias || []).forEach(function (d) {
    diferencias.push('PARIDAD_SECTOR:' + (d.hoja || '') + ':' + (d.propiedad || ''));
  });
  (inicio.diferencias || []).forEach(function (d) { diferencias.push('INICIO:' + d); });
  Object.keys(porHoja).forEach(function (k) { if (porHoja[k]) diferencias.push('HOJA:' + k); });
  // v0.15 §12: la paridad ya calculada aquí se refleja en el bloque INFO de
  // INICIO (2 escrituras puntuales con skip-if-equal; el writer la omite en
  // plan para no duplicar las 6 firmas).
  try {
    if (hInicio && typeof hInicio.getRange === 'function') {
      var infoPar = [['AI47', paridadIngreso.ok === true], ['AI48', paridadSector.ok === true]];
      infoPar.forEach(function (x) {
        var celda = hInicio.getRange(x[0]);
        var texto = x[1] ? 'PASS' : 'DIVERGENTE';
        var actual = '';
        try { actual = Utl_texto(celda.getValue()); } catch (eL) {}
        if (actual !== texto) {
          try { celda.setValue(texto); } catch (eW) {}
        }
      });
    }
  } catch (eInfo) {}
  var porPropiedad = {}, topDivergencias = [];
  diferencias.forEach(function (d) {
    var root = Utl_texto(d).replace(/^(?:PARIDAD_(?:INGRESO|SECTOR):[^:]*|INICIO|HOJA):/, '').split('[')[0].split('.')[0] || 'otra';
    if (!root) root = 'otra';
    porPropiedad[root] = (porPropiedad[root] || 0) + 1;
  });
  topDivergencias = Object.keys(porPropiedad)
    .filter(function (k) { return porPropiedad[k] > 0; })
    .sort(function (a, b) { return porPropiedad[b] - porPropiedad[a]; })
    .slice(0, 4)
    .map(function (k) { return k + '×' + porPropiedad[k]; });
  var ok = pendientes === 0 && paridadIngreso.ok && paridadSector.ok && inicio.ok;
  return {
    ok: ok, pendientes: pendientes, porHoja: porHoja,
    paridadIngreso: paridadIngreso, paridadSector: paridadSector,
    inicio: inicio, diferencias: diferencias, advertencias: advertencias,
    porPropiedad: porPropiedad, topDivergencias: topDivergencias
  };
}

/* ------------------------------ Runner ------------------------------ */

/** Orquesta una etapa reanudable. Instalar_pDiseno delega aquí.
 *  v0.15 §6: recibe opciones y las entrega a cada subtarea (la subtarea
 *  `inicio` necesita forzarInicio/modoPresentacion). */
function Presentacion_ejecutarPaso_(etapaId, ejecucion, opciones) {
  if (!Presentacion_esReanudable_(etapaId)) {
    return { ok: false, etapa: etapaId, motivo: 'PRESENTACION_ETAPA_DESCONOCIDA' };
  }
  opciones = opciones || {};
  var plan = PRESENTACION_SUBPLAN_DISENO;
  var estado = Presentacion_cacheLeer_(ejecucion);
  var cursor = (estado && estado.etapa === etapaId) ? (Number(estado.cursor) || 0) : 0;
  if (cursor < 0 || cursor >= plan.length) cursor = 0;

  if (cursor === 0 && Presentacion_layoutVigente_(opciones)) {
    Presentacion_cacheLimpiar_(ejecucion);
    return { ok: true, etapa: etapaId, nombre: 'Presentación del libro',
      continuar: false, cursor: plan.length,
      progreso: Presentacion_progreso_(plan.length, plan.length), subetapa: null,
      tareasEjecutadas: 0, omitida: true, motivo: 'PRESENTACION_VIGENTE', ms: 0 };
  }

  var t0 = Date.now(), emitidas = 0;
  while (cursor < plan.length) {
    var tarea = plan[cursor];
    var r = Presentacion_ejecutarTarea_(tarea, opciones);
    if (r.ok === false) {
      // No se persiste el cursor: el reintento vuelve a la MISMA subtarea
      // (idempotencia → no hay pérdida ni trabajo duplicado con efecto).
      return {
        ok: false, etapa: etapaId, nombre: 'Presentación del libro',
        cursor: cursor, progreso: Presentacion_progreso_(cursor, plan.length),
        subetapa: { id: tarea.id, nombre: tarea.nombre },
        motivo: r.motivo || ('Subetapa ' + tarea.nombre + ' falló'),
        ms: Date.now() - t0
      };
    }
    cursor++; emitidas++;
    if (Date.now() - t0 >= PRESUPUESTO_PRESENTACION_MS) break;
  }

  var fin = cursor >= plan.length;
  if (fin) {
    Presentacion_cacheLimpiar_(ejecucion);
    // v0.15 §9: persistencia SOLO si la verificación final realmente pasa.
    // Guardar un layout incompleto como vigente ocultaba el drift (la
    // siguiente instalación declaraba PRESENTACION_VIGENTE en falso).
    var ver = _PRESENTACION_VERIFICACION_MEMO;
    var convergio = ver && ver.ok === true;
    if (convergio) {
      Presentacion_guardarLayout_();
      Libro_limpiarDirty_('VISUAL'); Libro_limpiarDirty_('VALIDACIONES');
      Libro_limpiarDirty_('ESTRUCTURA');
    } else {
      Presentacion_invalidarLayout_();
    }
  }
  else Presentacion_cacheGuardar_(ejecucion, etapaId, cursor, plan.length);
  var res = {
    ok: true, etapa: etapaId, nombre: 'Presentación del libro',
    continuar: !fin, cursor: cursor,
    progreso: Presentacion_progreso_(cursor, plan.length),
    subetapa: fin ? null : { id: plan[cursor].id, nombre: plan[cursor].nombre },
    tareasEjecutadas: emitidas, ms: Date.now() - t0,
    verificacion: _PRESENTACION_VERIFICACION_MEMO
  };
  if (fin && !(_PRESENTACION_VERIFICACION_MEMO && _PRESENTACION_VERIFICACION_MEMO.ok === true)) {
    res.advertencia = true;
    res.presentacionCompleta = false;
  } else if (fin) {
    res.presentacionCompleta = true;
  }
  return res;
}
