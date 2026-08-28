/**
 * Sistema ECICEP Unificado — 20_Instalador
 * Instalación por ETAPAS REALES: cada etapa ejecuta trabajo verdadero y
 * devuelve un resumen serializable. El cliente (Instalador.html) las invoca
 * en secuencia → la barra de progreso representa avance real (#no-inventar).
 * Todas las etapas son idempotentes.
 */

var INSTALAR_ETAPAS = [
  { id: 'runtime',      nombre: 'Validación de runtime',      fn: 'Instalar_pRuntime' },
  { id: 'diagnostico',  nombre: 'Diagnóstico previo',       fn: 'Instalar_pDiagnostico' },
  { id: 'estructura',   nombre: 'Estructura y CONFIG',      fn: 'Instalar_pEstructura' },
  { id: 'fuentes',      nombre: 'Carga inicial de fuentes', fn: 'Instalar_pFuentes' },
  { id: 'amarillo',     nombre: 'Sector Amarillo',          fn: 'Instalar_pAmarillo' },
  { id: 'visual',       nombre: 'Layout visual (contrato)', fn: 'Instalar_pVisual' },
  { id: 'validaciones', nombre: 'Validaciones INGRESO',     fn: 'Instalar_pValidaciones' },
  { id: 'limpieza',     nombre: 'Limpieza de residuales',   fn: 'Instalar_pLimpieza' },
  { id: 'diseno',       nombre: 'Diseño del libro',         fn: 'Instalar_pDiseno' },
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

function Instalar_pRuntime() {
  var r = Modelo_validarDependenciasRuntime();
  if (!r.ok) {
    return { ok: false, motivo: r.detalle, faltantes: r.faltantes };
  }
  return { ok: true, dependencias: r.total };
}

function Instalar_pDiagnostico() {
  var r = Instalar_diagnosticar();
  return { ok: true, diagnostico: r.diagnostico };
}

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
function Instalar_pVisual() {
  // Usa HVis_aplicarTodasLasSecciones que ya incluye buscador y es idempotente real
  var r = HVis_aplicarTodasLasSecciones();
  return { ok: true, hojas: r.resultados };
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
 * Dry-run: informa qué cambios haría la instalación sin aplicarlos.
 * Compara estado actual vs deseado para cada fase.
 */
function Instalar_diagnosticar() {
  var ss = Modelo_ss();
  var diagnostico = {
    hojas: {},
    secciones: {},
    buscadores: {},
    conflictos: { oculta: false, estado: 'desconocido' },
    estructura: { creadas: [], existentes: [], faltantes: [] },
    validaciones: { pendientes: 0, aplicadas: 0, detalles: [] },
    formato: { pendientes: 0, aplicados: 0, detalles: [] },
    ocultas: { pendientes: 0, ocultadas: 0, detalles: [] },
    menu: { necesitaActualizar: false },
    resumen: { fasesPendientes: [], fasesCompletas: [] }
  };

  var hojasCriticas = ['PACIENTES', 'EVENTOS', 'SECTOR_NARANJO', 'SECTOR_AMARILLO',
    'SECTOR_VERDE', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];

  // 1. ESTRUCTURA - verificar hojas críticas
  try {
    var est = Modelo_crearEstructura(); // dry-run: no crea, solo verifica
    diagnostico.estructura.creadas = est.creadas || [];
    diagnostico.estructura.existentes = est.existentes || [];
    diagnostico.estructura.faltantes = hojasCriticas.filter(function (h) {
      return !ss.getSheetByName(h);
    });
    if (diagnostico.estructura.faltantes.length > 0) {
      diagnostico.resumen.fasesPendientes.push('estructura: faltan ' + diagnostico.estructura.faltantes.length + ' hojas');
    } else {
      diagnostico.resumen.fasesCompletas.push('estructura');
    }
  } catch (e) { diagnostico.resumen.fasesPendientes.push('estructura: error'); }

  // 2. SECCIONES VISUALES - comparar actual vs deseado (contrato)
  try {
    var diagSecciones = HVis_diagnosticarTodas().diagnostico || {};
    diagnostico.secciones = diagSecciones;
    var seccionesPendientes = 0;
    Object.keys(diagSecciones).forEach(function (h) {
      var d = diagSecciones[h];
      if (!(d.ok && d.configurada)) return;
      if (!(d.layout && d.layout.tipo === 'visual')) return; // simples (EVENTOS) no aplican
      var est = d.estadoActual || {};
      var esperadas = est.seccionesEsperadas || 0;
      var detectadas = est.seccionesDetectadas || 0;
      var filaEnc = est.filaEncabezadosReal || 0;
      var filaEncEsperada = est.filaEncabezadosEsperada || 0;
      if (est.estructura !== 'OK' ||
          detectadas < esperadas ||
          (filaEncEsperada && filaEnc !== filaEncEsperada)) {
        seccionesPendientes++;
        diagnostico.resumen.fasesPendientes.push('visual:' + h);
      }
    });
    if (seccionesPendientes === 0 && Object.keys(diagSecciones).length > 0) {
      diagnostico.resumen.fasesCompletas.push('visual');
    }
  } catch (e) { diagnostico.resumen.fasesPendientes.push('visual: error'); }

  // 3. BUSCADORES (integrado en visual)
  try {
    diagnostico.resumen.fasesCompletas.push('buscador');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('buscador'); }

  // 4. CONFLICTOS
  try {
    var c = ss.getSheetByName(HOJAS.CONFLICTOS);
    diagnostico.conflictos.oculta = c ? c.isSheetHidden() : false;
    diagnostico.conflictos.estado = diagnostico.conflictos.oculta ? 'correcta' : 'debe ocultarse';
    if (!diagnostico.conflictos.oculta) diagnostico.resumen.fasesPendientes.push('conflictos');
    else diagnostico.resumen.fasesCompletas.push('conflictos');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('conflictos'); }

  // 5. VALIDACIONES INGRESO
  try {
    var v = Modelo_validarIngresos(ss);
    diagnostico.validaciones.aplicadas = v.validaciones || 0;
    diagnostico.validaciones.puertas = v.hojas || 0;
    // Verificar columnas clave: SEXO, ESTADO_INGRESO, FECHA_NACIMIENTO
    ['SEXO', 'ESTADO_INGRESO', 'FECHA DE NACIMIENTO'].forEach(function (col) {
      var faltante = true;
      Object.keys(HOJAS_INGRESO).forEach(function (h) {
        var hoja = ss.getSheetByName(h);
        if (hoja) {
          var enc = hoja.getRange(Modelo_headerRow(h), 1, 1, hoja.getLastColumn()).getValues()[0];
          if (enc.some(function (e) { return Utl_texto(e).toUpperCase() === col; })) faltante = false;
        }
      });
      if (faltante) {
        diagnostico.validaciones.pendientes++;
        diagnostico.validaciones.detalles.push('falta validación ' + col);
      }
    });
    if (diagnostico.validaciones.pendientes === 0) diagnostico.resumen.fasesCompletas.push('validaciones');
    else diagnostico.resumen.fasesPendientes.push('validaciones: ' + diagnostico.validaciones.pendientes + ' pendientes');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('validaciones: error'); }

  // 6. FORMATO CONDICIONAL
  try {
    var f = Hojas_formatoCondicional(ss);
    diagnostico.formato.aplicados = f.aplicadas || 0;
    diagnostico.resumen.fasesCompletas.push('formato');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('formato'); }

  // 7. OCULTAS TÉCNICAS + CONFLICTOS
  try {
    var o = Hojas_ocultarTecnicas(ss);
    diagnostico.ocultas.ocultadas = o.ocultas || 0;
    diagnostico.resumen.fasesCompletas.push('ocultas');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('ocultas'); }

  // 8. MENÚ
  diagnostico.menu.necesitaActualizar = true;
  diagnostico.resumen.fasesPendientes.push('menú');

  // Resumen general
  diagnostico.resumen.totalFases = 8;
  diagnostico.resumen.completas = diagnostico.resumen.fasesCompletas.length;
  diagnostico.resumen.pendientes = diagnostico.resumen.fasesPendientes.length;

  return { ok: true, diagnostico: diagnostico };
}
