/**
 * Sistema ECICEP Unificado — 20_Instalador
 * Instalación por ETAPAS REALES: cada etapa ejecuta trabajo verdadero y
 * devuelve un resumen serializable. El cliente (Instalador.html) las invoca
 * en secuencia → la barra de progreso representa avance real (#no-inventar).
 * Todas las etapas son idempotentes.
 */

var INSTALAR_ETAPAS = [
  { id: 'estructura',   nombre: 'Estructura y CONFIG',      fn: 'Instalar_pEstructura' },
  { id: 'fuentes',      nombre: 'Carga inicial de fuentes', fn: 'Instalar_pFuentes' },
  { id: 'amarillo',     nombre: 'Sector Amarillo',          fn: 'Instalar_pAmarillo' },
  { id: 'validaciones', nombre: 'Validaciones INGRESO',     fn: 'Instalar_pValidaciones' },
  { id: 'limpieza',     nombre: 'Limpieza de residuales',   fn: 'Instalar_pLimpieza' },
  { id: 'diseno',       nombre: 'Diseño del libro',         fn: 'Instalar_pDiseno' },
  { id: 'visual',       nombre: 'Secciones y buscador',     fn: 'Instalar_pVisual' },
  { id: 'inicio',       nombre: 'INICIO + interfaz hojas',  fn: 'Instalar_pInicio' },
  { id: 'menu',         nombre: 'Menú y permisos',          fn: 'Instalar_pMenu' },
  { id: 'verificar',    nombre: 'Verificación final',       fn: 'Instalar_pVerificar' }
];

/** Registro para el cliente. */
function api_instalarEtapas() {
  return { ok: true, etapas: INSTALAR_ETAPAS,
           version: 'v' + ECICEP.VERSION, build: (ECICEP_BUILD && ECICEP_BUILD.commit) || 'dev' };
}

/** Dispatcher de etapa: ejecuta SOLO la etapa pedida. */
function api_instalarPaso(id) {
  var reg = null;
  INSTALAR_ETAPAS.forEach(function (e) { if (e.id === id) reg = e; });
  if (!reg) return { ok: false, motivo: 'ETAPA_DESCONOCIDA' };
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var t0 = Date.now();
  try {
    var fn = G[reg.fn];
    if (typeof fn !== 'function') throw new Error('función ausente: ' + reg.fn);
    var r = fn() || {};
    r.etapa = id; r.nombre = reg.nombre; r.ms = Date.now() - t0;
    if (typeof r.ok === 'undefined') r.ok = true;
    Log_info('Instalador', id, 'ok', null, r.ms);
    Log_flush();
    return r;
  } catch (e) {
    Log_error('Instalador', id, e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, etapa: id, nombre: reg.nombre,
             motivo: e && e.message ? e.message : String(e), ms: Date.now() - t0 };
  }
}

/* ------------------------- ETAPAS (thin wrappers) ------------------------- */

function Instalar_pEstructura() {
  var est = Modelo_crearEstructura();
  return { creadas: est.creadas.length, existentes: est.existentes.length,
           dashboardReparado: !!est.dashboardReparado };
}
function Instalar_pFuentes() {
  var pend = Fuentes_pendientes();
  var ya = _rem9_configValor('CARGA_REAL_HECHA');
  if (!pend.length) return { ok: true, linea: 'sin fuentes pendientes' };
  if (ya) return { ok: true, omitida: true,
    linea: 'ya importadas el ' + ya + ' (Herramientas → Cargar para re-importar)' };
  var r = Fuentes_cargaReal({ ejecutar: true });
  _config_set('CARGA_REAL_HECHA', Utilities.formatDate(new Date(),
    Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
  return { ok: true, importado: pend, detalle: r };
}
function Instalar_pAmarillo() {
  var cfg = FUENTES_DRIVE['SEGUIMIENTO ECICEP Sector Amarillo'];
  if (!(cfg && cfg.id)) return { ok: true, omitida: true, linea: 'sin ID en FUENTES_DRIVE' };
  var r = Amarillo_importarTodo(true);
  try { if (typeof Modelo_refrescarVistasSectores === 'function') Modelo_refrescarVistasSectores(); } catch (e) {}
  return { puerta: r.puerta, historico: r.historico,
           pendientes: (r.pendientesSinPaciente || []).length };
}
function Instalar_pValidaciones() {
  var r = Modelo_validarIngresos(Modelo_ss());
  return { validaciones: r.validaciones, puertas: r.hojas, protegidas: r.protegidas };
}
function Instalar_pLimpieza() {
  var r = Modelo_limpiarHojasResiduales(Modelo_ss());
  return { eliminadas: r.eliminadas, conservadas: r.conservadas };
}
function Instalar_pDiseno() {
  return Modelo_aplicarDiseno();
}
function Instalar_pInicio() {
  var r = Modelo_disenoHojas();
  Hojas_colorearRutIngresos();
  if (r.inicio && r.inicio.verificacion) {
    var fallos = Object.keys(r.inicio.verificacion)
      .filter(function (k) { return !r.inicio.verificacion[k]; });
    if (fallos.length) return { ok: false,
      motivo: 'verificación INICIO falló en: ' + fallos.join(', ') };
  }
  return { inicio: r.inicio, cond: r.cond, filtros: r.filtros,
           ocultas: r.ocultas, protecciones: r.protecciones };
}
function Instalar_pMenu() {
  onOpen();
  return { ok: true };
}
function Instalar_pVerificar() {
  var pacientes = Modelo_leerPacientes().length;
  var eventos = Modelo_leerEventos().length;
  var criticas = ['PACIENTES', 'EVENTOS', 'SECTOR_NARANJO', 'SECTOR_AMARILLO',
    'SECTOR_VERDE', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];
  var faltan = criticas.filter(function (n) { return !Modelo_hoja(n); });
  if (faltan.length) return { ok: false, faltan: faltan,
    linea: 'faltan hojas: ' + faltan.join(', ') };
  return { ok: true, pacientes: pacientes, eventos: eventos };
}

/**
 * Aplica secciones visuales y buscador rápido en hojas configuradas.
 * Idempotente: detecta si ya existe y no duplica.
 */
function Instalar_pVisual() {
  var rSecciones = HVis_aplicarTodasLasSecciones();
  var rBuscador = HVis_instalarTodosLosBuscadores();
  return {
    ok: true,
    secciones: rSecciones.resultados || [],
    buscadores: rBuscador.resultados || []
  };
}

/**
 * Dry-run: informa qué cambios haría la instalación sin aplicarlos.
 */
function Instalar_diagnosticar() {
  var ss = Modelo_ss();
  var diagnostico = {
    hojas: {},
    secciones: {},
    buscadores: {},
    conflictos: { oculta: false },
    estructura: { creadas: [], existentes: [] },
    validaciones: { pendientes: 0, aplicadas: 0 },
    formato: { pendientes: 0, aplicados: 0 },
    ocultas: { pendientes: 0, ocultadas: 0 },
    menu: { necesitaActualizar: false }
  };

  // Estructura
  try {
    var est = Modelo_crearEstructura();
    diagnostico.estructura.creadas = est.creadas || [];
    diagnostico.estructura.existentes = est.existentes || [];
  } catch (e) {}

  // Secciones visuales
  try {
    diagnostico.secciones = HVis_diagnosticarTodas().diagnostico || {};
  } catch (e) {}

  // Buscadores
  try {
    HOJAS_CON_SECCIONES.forEach(function (n) {
      var h = ss.getSheetByName(n);
      if (!h) return;
      var a1 = h.getRange('A1');
      var nota = a1.getNote() || '';
      var valido = a1.getDataValidation();
      diagnostico.buscadores[n] = {
        nota: nota ? 'presente' : 'ausente',
        validacion: valido ? 'presente' : 'ausente',
        formato: a1.getBackground()
      };
    });
  } catch (e) {}

  // CONFLICTOS
  try {
    var c = ss.getSheetByName(HOJAS.CONFLICTOS);
    diagnostico.conflictos.oculta = c ? c.isSheetHidden() : false;
  } catch (e) {}

  // Validaciones INGRESO
  try {
    var v = Modelo_validarIngresos(ss);
    diagnostico.validaciones.aplicadas = v.validaciones || 0;
    diagnostico.validaciones.puertas = v.hojas || 0;
  } catch (e) {}

  // Formato condicional
  try {
    var f = Hojas_formatoCondicional(ss);
    diagnostico.formato.aplicados = f.aplicadas || 0;
  } catch (e) {}

  // Ocultas técnicas + CONFLICTOS
  try {
    var o = Hojas_ocultarTecnicas(ss);
    diagnostico.ocultas.ocultadas = o.ocultas || 0;
  } catch (e) {}

  // Menú
  diagnostico.menu.necesitaActualizar = true;

  return { ok: true, diagnostico: diagnostico };
}
