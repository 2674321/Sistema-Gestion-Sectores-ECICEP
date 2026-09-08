/**
 * Sistema ECICEP Unificado — 20_Instalador
 * Instalación por ETAPAS REALES: cada etapa ejecuta trabajo verdadero y
 * devuelve un resumen serializable. El cliente (Instalador.html) las invoca
 * en secuencia → la barra de progreso representa avance real (#no-inventar).
 * Todas las etapas son idempotentes.
 */

var INSTALAR_ETAPAS = [
  { id: 'runtime',      nombre: 'Verificando el entorno',       fn: 'Instalar_pRuntime' },
  { id: 'diagnostico',  nombre: 'Diagnóstico previo',           fn: 'Instalar_pDiagnostico' },
  { id: 'versionado',   nombre: 'Versionando el sistema',       fn: 'Instalar_pVersionado' },
  { id: 'migraciones',  nombre: 'Aplicando migraciones',        fn: 'Instalar_pMigraciones' },
  { id: 'estructura',   nombre: 'Preparando estructura',        fn: 'Instalar_pEstructura' },
  { id: 'fuentes',      nombre: 'Importando fuentes',           fn: 'Instalar_pFuentes' },
  { id: 'amarillo',     nombre: 'Integrando sector amarillo',   fn: 'Instalar_pAmarillo' },
  { id: 'visual',       nombre: 'Aplicando diseño de hojas',    fn: 'Instalar_pVisual' },
  { id: 'validaciones', nombre: 'Activando reglas de ingreso',  fn: 'Instalar_pValidaciones' },
  { id: 'limpieza',     nombre: 'Depurando datos residuales',   fn: 'Instalar_pLimpieza' },
  { id: 'diseno',       nombre: 'Ajustando el libro',           fn: 'Instalar_pDiseno' },
  { id: 'inicio',       nombre: 'Preparando la portada',        fn: 'Instalar_pInicio' },
  { id: 'menu',         nombre: 'Configurando menú',            fn: 'Instalar_pMenu' },
  { id: 'enriquecimiento', nombre: 'Enriqueciendo datos de pacientes', fn: 'Instalar_pEnriquecimiento' },
  { id: 'verificar',    nombre: 'Verificación final',           fn: 'Instalar_pVerificar' }
];

/** Etapas que MODIFICAN el libro (mutan). Solo lectura: runtime, diagnostico,
 *  versionado y verificar → en ellas NO se toma LockService. */
var INSTALAR_ETAPAS_MUTAN = {};
['migraciones', 'estructura', 'fuentes', 'amarillo', 'visual', 'validaciones',
 'limpieza', 'diseno', 'inicio', 'menu', 'enriquecimiento'].forEach(function (id) {
  INSTALAR_ETAPAS_MUTAN[id] = true;
});

/** Registro para el cliente. */
function api_instalarEtapas() {
  return { ok: true, etapas: INSTALAR_ETAPAS,
           version: 'v' + ECICEP.VERSION, build: (ECICEP_BUILD && ECICEP_BUILD.commit) || 'dev',
           instalador: SISTEMA_VERSION_INSTALADOR,
           schemaVersion: String(SISTEMA_VERSION_SCHEMA_ACTUAL) };
}

/** Dispatcher de etapa: ejecuta SOLO la etapa pedida.
 *  Etapas mutantes toman LockService (requiere exclusividad; si está ocupado
 *  por otro proceso responde CONCURRENCIA y el cliente reintenta). */
function api_instalarPaso(id) {
  var reg = null;
  INSTALAR_ETAPAS.forEach(function (e) { if (e.id === id) reg = e; });
  if (!reg) return { ok: false, motivo: 'ETAPA_DESCONOCIDA' };
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var lock = null;
  if (INSTALAR_ETAPAS_MUTAN[id] && typeof LockService !== 'undefined') {
    try {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) {
        return { ok: false, etapa: id, nombre: reg.nombre, motivo: 'CONCURRENCIA',
                 linea: 'Otro proceso está modificando el sistema; reintente en unos segundos' };
      }
    } catch (eLock) { lock = null; } // sin LockService (node/pruebas) → avanza
  }
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
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (eR) { /* best effort */ } }
  }
}

// ---------------------------------------------------------------------------
// INST-1 (DEC-059): VERSIONADO Y MIGRACIONES DEL ESQUEMA.
// Fuente única de versiones: 00_Config (SISTEMA_VERSION_SCHEMA_ACTUAL /
// SISTEMA_VERSION_INSTALADOR). La versión instalada se PERSISTE en CONFIG
// (claves SCHEMA_VERSION y LAST_MIGRATION) y la escribe EXCLUSIVAMENTE este
// motor. Una clave ausente ≡ esquema legado '0' (sin versionar).
// ---------------------------------------------------------------------------

/** Registro de migraciones: cadena determinista desde → hasta.
 *  Migrar SIEMPRE por nombre/campo (flecha del esquema canónico), nunca por
 *  posiciones mágicas. Cada migración es idempotente y verificable. */
var REGISTRO_MIGRACIONES = [
  {
    id: 'MIG-001',
    desde: '0',                 // '0' = esquema heredado pre-INST-1 (sin versionar)
    hasta: '1',
    fn: 'Mig_run001',
    descripcion: 'Alinear vistas SECTOR_* al esquema canónico (15→16 columnas, ' +
      'S10-FIX). Protege la regresión BUG-E2E-003 en instalaciones heredadas.'
  }
];

/** PURA: determinista → cuáles migraciones faltan entre la versión actual y el
 *  objetivo canónico, en orden de aplicación (desde ascendente y por id.).
 *  Versión ausente/vacía ≡ '0'. Objetivo por defecto = SISTEMA_VERSION_SCHEMA_ACTUAL.
 *  @returns {Array} registros pendientes. */
function Mig_pendientesPura(actual, registro, objetivo) {
  registro = (registro === undefined || registro === null) ? REGISTRO_MIGRACIONES : registro;
  registro = registro || [];
  actual = Utl_texto(actual);
  if (actual.trim() === '') actual = '0';
  var actualN = Number(actual) || 0;
  var objetivoN = (objetivo === undefined || objetivo === null) ? SISTEMA_VERSION_SCHEMA_ACTUAL : objetivo;
  objetivoN = Number(objetivoN) || 0;
  return registro.filter(function (m) {
    var desdeN = (m.desde !== undefined && m.desde !== null) ? Number(m.desde) : Number.NaN;
    var hastaN = (m.hasta !== undefined && m.hasta !== null) ? Number(m.hasta) : Number.NaN;
    return !isNaN(desdeN) && !isNaN(hastaN) &&
           hastaN > actualN && desdeN >= actualN && hastaN <= objetivoN;
  }).sort(function (a, b) {
    if (Number(a.desde) !== Number(b.desde)) return Number(a.desde) - Number(b.desde);
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
}

/** PURA: clasifica el estado de la instalación desde un snapshot de escaneo
 *  (véase Modelo_escanearEstructura). Solo lecturas/derivaciones; nunca escribe.
 *  Estados: NUEVA | VIGENTE | ANTIGUA | DIVERGENTE | INCOMPLETA | DESCONOCIDA.
 *  @returns { estado, version, objetivo, hayDatos, pendientes[], sectoresDivergentes[],
 *             faltantes[], accion } */
function Mig_clasificarInstalacion(snapshot, schemaVersion, registro) {
  snapshot = snapshot || { hojas: {}, criticasPresentes: [], criticasFaltantes: [], config: {} };
  var cfg = snapshot.config || {};
  var version = (schemaVersion === undefined || schemaVersion === null)
    ? (cfg.SCHEMA_VERSION === undefined ? '' : cfg.SCHEMA_VERSION)
    : schemaVersion;
  version = Utl_texto(version).trim();
  if (version === '') version = '0';
  var objetivo = String(SISTEMA_VERSION_SCHEMA_ACTUAL);
  var objetivoN = Number(objetivo) || 0;
  var versionN = Number(version);
  var defectuosa = isNaN(versionN) || String(versionN) !== version;
  var falta = snapshot.criticasFaltantes || [];
  var hayDatos = false;
  (snapshot.criticasPresentes || []).forEach(function (n) {
    var info = snapshot.hojas[n];
    if (info && info.ultimaFila >= Modelo_dataStartRow(n)) hayDatos = true;
  });
  var sectores = [];
  (HOJAS_SECTOR || []).forEach(function (n) {
    var info = snapshot.hojas[n];
    if (!info || !info.encabezados || !info.encabezados.length) return;
    if (Modelo_esquemaVistaDivergente(info.encabezados)) sectores.push(n);
  });
  var pendientes = Mig_pendientesPura(version, registro);
  var estado;
  if (falta.length) estado = 'INCOMPLETA';
  else if (defectuosa) estado = 'DESCONOCIDA';
  else if (versionN > objetivoN) estado = 'DIVERGENTE';
  else if (version === '0' && !hayDatos) estado = 'NUEVA';
  else if (pendientes.length || sectores.length) estado = 'ANTIGUA';
  else estado = 'VIGENTE';
  return {
    estado: estado,
    version: version,
    objetivo: objetivo,
    hayDatos: hayDatos,
    pendientes: pendientes.map(function (m) { return m.id; }),
    sectoresDivergentes: sectores,
    faltantes: falta,
    accion: estado === 'VIGENTE' ? 'ninguna'
      : (estado === 'DIVERGENTE' || estado === 'DESCONOCIDA') ? 'manual'
      : (estado === 'INCOMPLETA') ? 'reparar' : 'migrar'
  };
}

/** Núcleo de ejecución de migraciones. Escrituras SOLO si ctx.persistir.
 *  Idempotente: si una migración falla se DETIENE la cadena y NO se marca como
 *  aplicada; SCHEMA_VERSION avanza únicamente tras cada éxito, de modo que una
 *  re-ejecución retoma exactamente donde quedó.
 *  @param {Array} registro registro de migraciones (default REGISTRO_MIGRACIONES)
 *  @param {Object} ctx { schemaVersion, pendientes?, persistir, objetivo, g } */
function Mig_ejecutarDeclaradas(registro, ctx) {
  ctx = ctx || {};
  var G = ctx.g || ((typeof globalThis !== 'undefined') ? globalThis : this);
  var lib = (registro === undefined || registro === null) ? REGISTRO_MIGRACIONES : registro;
  lib = lib || [];
  var version = ctx.schemaVersion === undefined ? '0' : Utl_texto(ctx.schemaVersion);
  if (version.trim() === '') version = '0';
  var pendientes = ctx.pendientes || Mig_pendientesPura(version, lib, ctx.objetivo);
  var secuencia = [];
  pendientes.forEach(function (m) {
    if (typeof m === 'string') {
      for (var i = 0; i < lib.length; i++) {
        if (lib[i].id === m) { secuencia.push(lib[i]); break; }
      }
    } else { secuencia.push(m); }
  });
  var aplicadas = [];
  var vActual = version;
  function fallo(reg, motivo) {
    return { ok: false, aplicadas: aplicadas, versionInicial: version,
             versionFinal: vActual, migracion: reg && reg.id, motivo: motivo,
             linea: 'la migración ' + (reg && reg.id) + ' no aplicó: ' + motivo };
  }
  for (var j = 0; j < secuencia.length; j++) {
    var reg = secuencia[j];
    if (!reg) continue;
    var fn = G[reg.fn];
    if (typeof fn !== 'function') return fallo(reg, 'FUNCION_AUSENTE:' + reg.fn);
    var r;
    try { r = fn(ctx); } catch (e) { return fallo(reg, (e && e.message) || String(e)); }
    if (!r) r = {};
    if (r.ok === false) return fallo(reg, r.motivo || 'MIG_FALLIDA');
    aplicadas.push(reg.id);
    vActual = String(reg.hasta);
    if (ctx.persistir) {
      _inst_configEscribir('LAST_MIGRATION', reg.id);
      _inst_configEscribir('SCHEMA_VERSION', vActual);
    }
  }
  return { ok: true, aplicadas: aplicadas, versionInicial: version,
           versionFinal: aplicadas.length ? vActual : version,
           linea: aplicadas.length
             ? 'migraciones aplicadas: ' + aplicadas.join(', ') + ' (esquema ' + version + '→' + vActual + ')'
             : 'sin migraciones pendientes (esquema ' + version + ' vigente)' };
}

/** GAS: versión de esquema persistida en CONFIG. Ausente/ilegible ≡ '0'. */
function Mig_schemaLeido() {
  var v = Utl_texto(_rem9_configValor('SCHEMA_VERSION')).trim();
  return v === '' ? '0' : v;
}

/** GAS: escribe una clave de CONFIG del motor de versionado. */
function _inst_configEscribir(clave, valor) {
  _config_set(clave, valor);
}

/** GAS: ejecuta las migraciones pendientes REALES con la defensa de regresión:
 *  si el esquema ya está en la versión objetivo pero las vistas SECTOR_*
 *  quedaron divergentes (BUG-E2E-003), fuerza la re-aplicación idempotente de
 *  MIG-001. Persiste SCHEMA_VERSION/LAST_MIGRATION solo tras cada éxito. */
function Mig_ejecutarPersistente() {
  var snap = Modelo_escanearEstructura();
  var v = Mig_clasificarInstalacion(snap, null, REGISTRO_MIGRACIONES);
  var pendientes = v.pendientes.slice();
  if (v.estado === 'ANTIGUA' && v.version === v.objetivo && v.sectoresDivergentes.length) {
    REGISTRO_MIGRACIONES.forEach(function (m) {
      if (m.id === 'MIG-001' && pendientes.indexOf('MIG-001') === -1) pendientes.push('MIG-001');
    });
  }
  return Mig_ejecutarDeclaradas(REGISTRO_MIGRACIONES,
    { schemaVersion: v.version, pendientes: pendientes, persistir: true });
}

/** GAS: MIG-001 — alinear vistas SECTOR_* al esquema canónico (15→16, S10-FIX).
 *  Idempotente y por nombre. Se tolera HOJA_NO_EXISTE (estructura la crea);
 *  encabezados irreconocibles → falla (requiere revisión, no se adivina nada). */
function Mig_run001() {
  var res = { ok: true, alineadas: [], yaCanonicas: [], sinObjeto: [] };
  HOJAS_SECTOR.forEach(function (n) {
    var r = Modelo_alinearVistaSector(n);
    if (!r.ok) {
      if (r.motivo === 'HOJA_NO_EXISTE' || r.motivo === 'SIN_ENCABEZADOS') {
        res.sinObjeto.push(n);
        return;
      }
      res.ok = false;
      res.motivo = 'MIG-001:' + n + ':' + (r.motivo || '');
      return;
    }
    if (r.alineado) res.alineadas.push(n); else res.yaCanonicas.push(n);
  });
  if (!res.ok) return res;
  Log_info('Instalador', 'MIG-001',
    'SECTOR_* alineados: ' + res.alineadas.join(',') + ' canónicas: ' + res.yaCanonicas.join(','));
  return res;
}

/** Política INST-1 del Webhook 'instalar': detección → reparación de estructura
 *  crítica si falta → migraciones desde la versión persistida. Reutiliza el
 *  mismo pipeline del instalador (única fuente de verdad). */
function Instalar_ejecutarPolitica() {
  try {
    var snap = Modelo_escanearEstructura();
    var v = Mig_clasificarInstalacion(snap, null, REGISTRO_MIGRACIONES);
    if (v.estado === 'DIVERGENTE') {
      return { ok: false, motivo: 'ESQUEMA_DIVERGENTE', estado: v.estado, detalle: v,
        linea: 'El esquema instalado (' + v.version + ') es más nuevo que este código (' + v.objetivo + '); no se modifica nada.' };
    }
    if (v.estado === 'DESCONOCIDA') {
      return { ok: false, motivo: 'VERSION_DESCONOCIDA', estado: v.estado, detalle: v,
        linea: 'SCHEMA_VERSION ilegible (' + v.version + '); se requiere revisión manual.' };
    }
    if (v.estado === 'INCOMPLETA') {
      var est = Modelo_crearEstructura();
      snap = Modelo_escanearEstructura();
      v = Mig_clasificarInstalacion(snap, null, REGISTRO_MIGRACIONES);
      v.estructuraReparada = est.creadas || [];
    }
    var m = Mig_ejecutarPersistente();
    return { ok: m.ok, estado: v.estado, versionAntes: v.version,
             versionDespues: m.versionFinal || m.versionInicial,
             aplicadas: m.aplicadas || [], linea: m.linea, detalle: v,
             motivo: m.motivo, migracion: m.migracion };
  } catch (e) {
    return { ok: false, motivo: (e && e.message) || String(e) };
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

function Instalar_pVersionado() {
  var snap = Modelo_escanearEstructura();
  var v = Mig_clasificarInstalacion(snap, null, REGISTRO_MIGRACIONES);
  return { ok: true, versionado: {
    app: ECICEP.VERSION,
    instalador: SISTEMA_VERSION_INSTALADOR,
    esquemaLeido: v.version,
    esquemaEsperado: v.objetivo,
    estado: v.estado,
    hayDatos: v.hayDatos,
    pendientes: v.pendientes,
    sectoresDivergentes: v.sectoresDivergentes,
    faltantes: v.faltantes,
    accion: v.accion } };
}

function Instalar_pMigraciones() {
  var r = Mig_ejecutarPersistente();
  return { ok: r.ok, linea: r.linea, aplicadas: r.aplicadas || [],
           versionInicial: r.versionInicial, versionFinal: r.versionFinal,
           motivo: r.motivo, migracion: r.migracion };
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
  var v = Mig_clasificarInstalacion(Modelo_escanearEstructura(), null, REGISTRO_MIGRACIONES);
  return { ok: true, pacientes: pacientes, eventos: eventos,
           schemaVersion: v.version, esquemaOK: v.estado === 'VIGENTE', estado: v.estado };
}

/** (S5/S11, DEC-057) Etapa de enriquecimiento demográfico de PACIENTES dentro
 *  del instalador: completa SOLO campos vacíos (SEXO/FECHA_NACIMIENTO) desde
 *  hojas INGRESO_* con fuente consistente; idempotente; no crea pacientes ni
 *  eventos. Reporta métricas S11: totalPacientes, revisados, enriquecidos,
 *  sinCambios, conflictos (requieren revisión), noEncontrados (sin fuente) y
 *  errores. */
function Instalar_pEnriquecimiento() {
  var r = Act_enriquecerPacientes({ dryRun: false });
  if (!r || r.ok === false) {
    return { ok: false, linea: (r && r.motivo) ? r.motivo : 'error en enriquecimiento' };
  }
  var lineas = [];
  lineas.push('Pacientes revisados: ' + (r.revisados || 0) + ' de ' + (r.totalPacientes || 0));
  if (r.enriquecidos) lineas.push('Actualizados: ' + r.enriquecidos + ' (' + (r.aplicados || 0) + ' campos)');
  else lineas.push('Actualizados: sin campos demográficos vacíos con fuente');
  if (r.sinCambios) lineas.push('Sin cambio: ' + r.sinCambios);
  if (r.sinVacias) lineas.push('Sin huecos que enriquecer: ' + r.sinVacias);
  if (r.conflictos) lineas.push('Requieren revisión: ' + r.conflictos);
  if (r.noEncontrados) lineas.push('Sin fuente (quedan faltantes): ' + r.noEncontrados);
  lineas.push('Errores: ' + (r.errores || 0));
  return { ok: true, totalPacientes: r.totalPacientes || 0, revisados: r.revisados || 0,
           enriquecidos: r.enriquecidos || 0, aplicados: r.aplicados || 0,
           sinCambios: r.sinCambios || 0, sinVacias: r.sinVacias || 0,
           conflictos: r.conflictos || 0, noEncontrados: r.noEncontrados || 0,
           errores: r.errores || 0, linea: lineas.join(' · ') };
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
    versionado: null,
    validaciones: { pendientes: 0, aplicadas: 0, detalles: [] },
    formato: { pendientes: 0, aplicados: 0, detalles: [] },
    ocultas: { pendientes: 0, ocultadas: 0, detalles: [] },
    menu: { necesitaActualizar: false },
    resumen: { fasesPendientes: [], fasesCompletas: [] }
  };

  var hojasCriticas = ['PACIENTES', 'EVENTOS', 'SECTOR_NARANJO', 'SECTOR_AMARILLO',
    'SECTOR_VERDE', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];

  // 1. ESTRUCTURA - verificar hojas (escaneo SOLO LECTURA: no crear/reparar)
  try {
    var snap = Modelo_escanearEstructura(ss); // dry-run: no modifica nada
    diagnostico.estructura.creadas = []; // el diagnóstico jamás crea hojas
    diagnostico.estructura.existentes = Object.keys(snap.hojas).filter(function (h) {
      return snap.hojas[h] !== null;
    });
    diagnostico.estructura.faltantes = snap.criticasFaltantes || [];
    if (diagnostico.estructura.faltantes.length > 0) {
      diagnostico.resumen.fasesPendientes.push('estructura: faltan ' + diagnostico.estructura.faltantes.length + ' hojas');
    } else {
      diagnostico.resumen.fasesCompletas.push('estructura');
    }
  } catch (e) { diagnostico.resumen.fasesPendientes.push('estructura: error'); }

  // 2. VERSIONADO (INST-1): versión de esquema, estado y migraciones pendientes
  try {
    var ver = Mig_clasificarInstalacion(Modelo_escanearEstructura(ss), null, REGISTRO_MIGRACIONES);
    diagnostico.versionado = ver;
    if (ver.estado !== 'VIGENTE') {
      diagnostico.resumen.fasesPendientes.push('versionado: ' + ver.estado +
        (ver.pendientes.length ? ' (' + ver.pendientes.join(', ') + ')' : ''));
    } else {
      diagnostico.resumen.fasesCompletas.push('versionado');
    }
  } catch (e) { diagnostico.resumen.fasesPendientes.push('versionado: error'); }

  // 3. SECCIONES VISUALES - comparar actual vs deseado (contrato)
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

  // 4. BUSCADORES (integrado en visual, verificado arriba)
  // no requiere diagnóstico separado

  // 5. CONFLICTOS
  try {
    var c = ss.getSheetByName(HOJAS.CONFLICTOS);
    diagnostico.conflictos.oculta = c ? c.isSheetHidden() : false;
    diagnostico.conflictos.estado = diagnostico.conflictos.oculta ? 'correcta' : 'debe ocultarse';
    if (!diagnostico.conflictos.oculta) diagnostico.resumen.fasesPendientes.push('conflictos');
    else diagnostico.resumen.fasesCompletas.push('conflictos');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('conflictos'); }

  // 6. VALIDACIONES INGRESO
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

  // 7. FORMATO CONDICIONAL
  try {
    var f = Hojas_formatoCondicional(ss);
    diagnostico.formato.aplicados = f.aplicadas || 0;
    diagnostico.resumen.fasesCompletas.push('formato');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('formato'); }

  // 8. OCULTAS TÉCNICAS + CONFLICTOS
  try {
    var o = Hojas_ocultarTecnicas(ss);
    diagnostico.ocultas.ocultadas = o.ocultas || 0;
    diagnostico.resumen.fasesCompletas.push('ocultas');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('ocultas'); }

  // 9. MENÚ - always safe to re-apply, not a diagnostic item
  diagnostico.menu.necesitaActualizar = false;

  // Resumen general
  diagnostico.resumen.totalFases = 7;
  diagnostico.resumen.completas = diagnostico.resumen.fasesCompletas.length;
  diagnostico.resumen.pendientes = diagnostico.resumen.fasesPendientes.length;

  return { ok: true, diagnostico: diagnostico };
}
