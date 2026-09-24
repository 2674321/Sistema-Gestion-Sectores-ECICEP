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
 * La etapa 'validaciones' (puertas INGRESO_*) es dueña exclusiva de sus reglas;
 * este motor NO las duplica. INICIO se mantiene en su propia etapa ('inicio').
 */

var PRESUPUESTO_PRESENTACION_MS = 20000;

var PRESENTACION_CACHE_PREFIJO = 'ECICEP_INST_PRES';
var PRESENTACION_LAYOUT_PROP = 'ECICEP_PRESENTACION_LAYOUT_V0122';
var PRESENTACION_LAYOUT_VERSION = '0.12.2';
var PRESENTACION_ETAPAS_REANUDABLES = { diseno: true };

/** Plan de la etapa "Presentación del libro", en orden de ejecución. La
 *  subtarea 'base' es la única que invoca Modelo_aplicarDiseno (ahora con
 *  fast-paths internos); el resto son responsabilidades únicas que históricamente
 *  ejecutaba Libro_repararPresentacion_ en un solo RPC. */
var PRESENTACION_SUBPLAN_DISENO = [
  { id: 'base',               nombre: 'Diseño base del libro' },
  { id: 'formato:PACIENTES',  nombre: 'Formato de datos · PACIENTES' },
  { id: 'formato:INGRESO',    nombre: 'Formato de datos · puertas INGRESO' },
  { id: 'formato:SECTOR',     nombre: 'Formato de datos · vistas SECTOR' },
  { id: 'formato:EVENTOS',    nombre: 'Formato de datos · EVENTOS y auxiliares' },
  { id: 'validaciones:extras', nombre: 'Reglas complementarias (no puertas)' },
  { id: 'condicionales',       nombre: 'Indicadores y estados visuales' },
  { id: 'notas',              nombre: 'Notas de ayuda en encabezados' },
  { id: 'accesorios',         nombre: 'Protecciones, visibilidad y ayudas' },
  { id: 'verificar',          nombre: 'Verificación final de presentación' }
];

function Presentacion_esReanudable_(etapaId) {
  return !!PRESENTACION_ETAPAS_REANUDABLES[etapaId];
}

function Presentacion_progreso_(cursor, total) {
  var completadas = Math.min(Math.max(cursor, 0), total);
  return { actual: completadas, total: total,
    enCurso: completadas < total ? completadas + 1 : total };
}

function Presentacion_fingerprintEsperado_() {
  return PRESENTACION_SUBPLAN_DISENO.map(function (t) { return t.id; }).join('|') +
    '|FORMATO_CAMPOS|' + PRESENTACION_LAYOUT_VERSION;
}
function Presentacion_layoutVigente_() {
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
    return pendientes === 0;
  } catch (eD) { return false; }
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

/** Ejecuta UNA subtarea. Devuelve {ok, detalle} o {ok:false, motivo}. */
function Presentacion_ejecutarTarea_(tarea) {
  if (!tarea || !tarea.id) return { ok: false, motivo: 'TAREA_SIN_ID' };
  try {
    var r;
    switch (tarea.id) {
      case 'base':
        r = Modelo_aplicarDiseno();
        break;
      case 'formato:PACIENTES':
        r = Presentacion_formatearGrupo_(['PACIENTES']);
        break;
      case 'formato:INGRESO':
        r = Presentacion_formatearGrupo_(Object.keys(HOJAS_INGRESO));
        break;
      case 'formato:SECTOR':
        r = Presentacion_formatearGrupo_(HOJAS_SECTOR);
        break;
      case 'formato:EVENTOS':
        r = Presentacion_formatearGrupo_(['EVENTOS', 'CONFLICTOS', 'REM_SALIDA',
          'FUENTES', 'CONFIG', 'LOG', 'FORM_RESPUESTAS']);
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
      case 'verificar':
        r = Presentacion_verificar_();
        break;
      default:
        r = { ok: false, motivo: 'TAREA_DESCONOCIDA' };
    }
    if (!r) r = { ok: true };
    if (r.ok === false || (r.fallidas && r.fallidas.length)) {
      return { ok: false, motivo: r.motivo || r.linea ||
        (r.fallidas && r.fallidas.join('; ')) || ('Falló la subtarea ' + tarea.nombre) };
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

/** Formatos numéricos + semántica de columnas de UNA hoja (bounded, zero-write
 *  si el número de la primera fila de datos ya coincide). */
function Presentacion_formatearHoja_(nombre) {
  var ss = Modelo_ss(), h = ss.getSheetByName(nombre);
  if (!h) return { ok: true, aplicados: 0, motivo: 'sin hoja' };
  _modelo_anchosHoja(h);
  var f = Hojas_aplicarFormatosNumero_(ss, { hojas: [nombre] });
  var s = Hojas_aplicarSemanticaColumnas_(h);
  return {
    ok: f.ok !== false && s.ok !== false,
    aplicados: (f.aplicados || 0) + (s.columnas || 0),
    errores: (f.errores || []).concat(s.errores || [])
  };
}

/** Verificación final: solo lecturas (HVis_diagnosticarTodas). No reporta un
 *  fallo duro si quedan pendientes: los consolida como advertencia (la fase
 *  siguiente de verificación del instalador audita el estado global). */
function Presentacion_verificar_() {
  var diag = HVis_diagnosticarTodas();
  var pendientes = 0, porHoja = {}, advertencias = [];
  Object.keys(diag.diagnostico || {}).forEach(function (k) {
    var v = diag.diagnostico[k], p = v && v.estadoActual && v.estadoActual.visual;
    var n = p ? (p.cantidadPendientes || 0) : 0;
    pendientes += n; porHoja[k] = n;
    if (n) advertencias.push(k + ': ' + n + ' pendientes');
  });
  return { ok: true, pendientes: pendientes, porHoja: porHoja, advertencias: advertencias };
}

/* ------------------------------ Runner ------------------------------ */

/** Orquesta una etapa reanudable. Instalar_pDiseno delega aquí. */
function Presentacion_ejecutarPaso_(etapaId, ejecucion) {
  if (!Presentacion_esReanudable_(etapaId)) {
    return { ok: false, etapa: etapaId, motivo: 'PRESENTACION_ETAPA_DESCONOCIDA' };
  }
  var plan = PRESENTACION_SUBPLAN_DISENO;
  var estado = Presentacion_cacheLeer_(ejecucion);
  var cursor = (estado && estado.etapa === etapaId) ? (Number(estado.cursor) || 0) : 0;
  if (cursor < 0 || cursor >= plan.length) cursor = 0;

  if (cursor === 0 && Presentacion_layoutVigente_()) {
    Presentacion_cacheLimpiar_(ejecucion);
    return { ok: true, etapa: etapaId, nombre: 'Presentación del libro',
      continuar: false, cursor: plan.length,
      progreso: Presentacion_progreso_(plan.length, plan.length), subetapa: null,
      tareasEjecutadas: 0, omitida: true, motivo: 'PRESENTACION_VIGENTE', ms: 0 };
  }

  var t0 = Date.now(), emitidas = 0;
  while (cursor < plan.length) {
    var tarea = plan[cursor];
    var r = Presentacion_ejecutarTarea_(tarea);
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
    Presentacion_guardarLayout_();
    Libro_limpiarDirty_('VISUAL'); Libro_limpiarDirty_('VALIDACIONES');
    Libro_limpiarDirty_('ESTRUCTURA');
  }
  else Presentacion_cacheGuardar_(ejecucion, etapaId, cursor, plan.length);
  return {
    ok: true, etapa: etapaId, nombre: 'Presentación del libro',
    continuar: !fin, cursor: cursor,
    progreso: Presentacion_progreso_(cursor, plan.length),
    subetapa: fin ? null : { id: plan[cursor].id, nombre: plan[cursor].nombre },
    tareasEjecutadas: emitidas, ms: Date.now() - t0
  };
}
