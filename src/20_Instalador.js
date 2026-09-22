/**
 * Sistema ECICEP — 20_Instalador
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
  { id: 'fuentes',      nombre: 'Cargando datos de fuentes',   fn: 'Instalar_pFuentes' },
  { id: 'amarillo',     nombre: 'Cargando sector amarillo',    fn: 'Instalar_pAmarillo' },
  { id: 'visual',       nombre: 'Aplicando diseño de hojas',    fn: 'Instalar_pVisual' },
  { id: 'validaciones', nombre: 'Activando reglas de ingreso',  fn: 'Instalar_pValidaciones' },
  { id: 'limpieza',     nombre: 'Revisando hojas adicionales',  fn: 'Instalar_pLimpieza' },
  { id: 'diseno',       nombre: 'Ajustando el libro',           fn: 'Instalar_pDiseno' },
  { id: 'inicio',       nombre: 'Preparando la portada',        fn: 'Instalar_pInicio' },
  { id: 'menu',         nombre: 'Configurando menú',            fn: 'Instalar_pMenu' },
  { id: 'enriquecimiento', nombre: 'Enriqueciendo datos de pacientes', fn: 'Instalar_pEnriquecimiento' },
  { id: 'derivados',    nombre: 'Actualizando estratificación', fn: 'Instalar_pDerivados' },
  { id: 'verificar',    nombre: 'Verificación final',           fn: 'Instalar_pVerificar' }
];

/** Solo las etapas que realmente escriben toman LockService. Las fases
 *  omitidas y el inventario de hojas adicionales son de solo lectura. */
var INSTALAR_ETAPAS_MUTAN = {};
['migraciones', 'estructura', 'fuentes', 'amarillo', 'enriquecimiento', 'visual', 'validaciones',
  'diseno', 'inicio', 'menu', 'derivados'].forEach(function (id) {
  INSTALAR_ETAPAS_MUTAN[id] = true;
});

/** Registro para el cliente. */
function api_instalarEtapas(acceso) {
  if (!WebApp_autorizarBuscador(acceso)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  return { ok: true, etapas: INSTALAR_ETAPAS,
           version: 'v' + ECICEP.VERSION, build: (ECICEP_BUILD && ECICEP_BUILD.commit) || 'dev',
           instalador: SISTEMA_VERSION_INSTALADOR,
           schemaVersion: String(SISTEMA_VERSION_SCHEMA_ACTUAL) };
}

/** Previa de solo lectura antes de ofrecer una reparación. */
function api_instalarDiagnostico(acceso) {
  if (!WebApp_autorizarBuscador(acceso)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  try { return Instalar_diagnosticar(); }
  catch (e) { return { ok: false, motivo: e && e.message ? e.message : String(e) }; }
}

/** Memoria de respaldo dentro de la misma invocación (fallback a CacheService
 *  entre RPC del cliente secuencial). */
var _INSTALAR_BACKUP_MEMO = {};

/** Asegura UN respaldo completo del libro ANTES de la primera etapa mutante de
 *  una ejecución de instalación (B4). Idempotente por clave de ejecución
 *  (CacheService 30 min + memo de invocación): si la clave ya existe, no crea
 *  otro. Si el respaldo real falla → {ok:false} y NINGUNA etapa escribe.
 *  En entornos sin GAS (pruebas node) se omite sin bloquear. */
function Instalar_asegurarBackup_(ejecucion) {
  var clave = 'ECICEP_INST_BK|' + Utl_texto(ejecucion);
  if (!ejecucion) clave = 'ECICEP_INST_BK|LEGACY_' + Math.floor(Date.now() / 60000);
  var cache = null;
  if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
    try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  }
  var previo = null;
  if (cache && cache.get) { try { previo = cache.get(clave); } catch (e) { previo = null; } }
  if (previo) return { ok: true, skip: true, nombre: String(previo) };
  if (_INSTALAR_BACKUP_MEMO[clave]) return { ok: true, skip: true, nombre: _INSTALAR_BACKUP_MEMO[clave] };
  if (typeof SpreadsheetApp === 'undefined' || typeof DriveApp === 'undefined') {
    return { ok: true, skip: true, sinRespaldo: true };
  }
  try {
    var r = Backup_crear('PRE_INSTALAR');
    if (!r || r.ok === false) {
      return { ok: false, motivo: r && r.motivo ? r.motivo : 'BACKUP_FALLIDO' };
    }
    var nombre = r.nombre || 'PRE_INSTALAR';
    _INSTALAR_BACKUP_MEMO[clave] = nombre;
    if (cache && cache.put) { try { cache.put(clave, String(nombre), 1800); } catch (e) { /* best effort */ } }
    return { ok: true, creado: true, nombre: nombre };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Dispatcher de etapa: ejecuta SOLO la etapa pedida.
 *  Etapas mutantes toman LockService (requiere exclusividad; si está ocupado
 *  por otro proceso responde CONCURRENCIA y el cliente reintenta). Además, la
 *  PRIMERA etapa mutante de una ejecución crea un respaldo real previo
 *  (B4): si el respaldo falla, la etapa responde BACKUP_FALLIDO sin escribir. */
function api_instalarPaso(id, acceso, ejecucion) {
  if (!WebApp_autorizarBuscador(acceso)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  var reg = null;
  INSTALAR_ETAPAS.forEach(function (e) { if (e.id === id) reg = e; });
  if (!reg) return { ok: false, motivo: 'ETAPA_DESCONOCIDA' };
  if (INSTALAR_ETAPAS_MUTAN[id]) {
    var incompatible = Instalar_versionIncompatible_({ version: Mig_schemaLeido(),
      objetivo: String(SISTEMA_VERSION_SCHEMA_ACTUAL) });
    if (incompatible) return { ok: false, etapa: id, nombre: reg.nombre, motivo: incompatible };
  }
  var respaldo = null;
  if (INSTALAR_ETAPAS_MUTAN[id]) {
    var bk = Instalar_asegurarBackup_(ejecucion);
    if (!bk.ok) {
      return { ok: false, etapa: id, nombre: reg.nombre, motivo: 'BACKUP_FALLIDO',
        linea: 'No se pudo crear el respaldo previo del libro: ' + bk.motivo };
    }
    respaldo = bk.creado ? bk.nombre : null;
  }
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var lock = null;
  if (INSTALAR_ETAPAS_MUTAN[id]) {
    if (typeof LockService === 'undefined') {
      return { ok: false, etapa: id, nombre: reg.nombre, motivo: 'LOCK_NO_DISPONIBLE',
        linea: 'No se pudo asegurar el acceso exclusivo al libro' };
    }
    try {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) {
        return { ok: false, etapa: id, nombre: reg.nombre, motivo: 'CONCURRENCIA',
                 linea: 'Otro proceso está modificando el sistema; reintente en unos segundos' };
      }
    } catch (eLock) {
      if (lock) { try { lock.releaseLock(); } catch (eR) {} }
      return { ok: false, etapa: id, nombre: reg.nombre, motivo: 'LOCK_NO_DISPONIBLE',
        linea: 'No se pudo asegurar el acceso exclusivo al libro: ' + (eLock && eLock.message || eLock) };
    }
  }
  var t0 = Date.now();
  try {
    var fn = G[reg.fn];
    if (typeof fn !== 'function') throw new Error('función ausente: ' + reg.fn);
    var r = fn() || {};
    r.etapa = id; r.nombre = reg.nombre; r.ms = Date.now() - t0;
    if (respaldo) r.respaldo = respaldo;
    if (typeof r.ok === 'undefined') r.ok = true;
    if (r.ok === false) Log_error('Instalador', id, r.motivo || r.linea || 'La etapa informó error');
    else Log_info('Instalador', id, 'ok', null, r.ms);
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
  },
  {
    id: 'MIG-002',
    desde: '1',
    hasta: '2',
    fn: 'Mig_run002',
    descripcion: 'Campo SALUD_MENTAL (SI | NO | vacío) en PACIENTES (30→31 ' +
      'columnas), vistas SECTOR_* (16→17) y columna SALUD_MENTAL en INGRESO_*.'
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
  var incompatible = Instalar_versionIncompatible_(v);
  if (incompatible) return { ok: false, motivo: incompatible, versionInicial: v.version,
    versionFinal: v.version, aplicadas: [] };
  var pendientes = v.pendientes.slice();
  if (v.estado === 'ANTIGUA' && v.version === v.objetivo && v.sectoresDivergentes.length) {
    REGISTRO_MIGRACIONES.forEach(function (m) {
      if (m.id === 'MIG-001' && pendientes.indexOf('MIG-001') === -1) pendientes.push('MIG-001');
    });
  }
  return Mig_ejecutarDeclaradas(REGISTRO_MIGRACIONES,
    { schemaVersion: v.version, pendientes: pendientes, persistir: true });
}

/** No escribir con una versión ilegible o más nueva, aun si faltan hojas y
 *  la clasificación principal informa INCOMPLETA. */
function Instalar_versionIncompatible_(v) {
  var version = String(v.version);
  if (!/^\d+$/.test(version)) return 'VERSION_DESCONOCIDA';
  if (Number(version) > Number(v.objetivo)) return 'ESQUEMA_DIVERGENTE';
  return '';
}

/** GAS: MIG-002 — campo SALUD_MENTAL en PACIENTES (30→31), vistas SECTOR_*
 *  (16→17) y columna SALUD_MENTAL en INGRESO_*. Idempotente y por nombre:
 *  reutiliza asegurarEsquemaPacientes / alinearVistasSectoriales y solo agrega
 *  el encabezado cuando la hoja lo tiene ausente. Se tolera INGRESO_* sin hoja
 *  (la estructura la crea con INGRESO_COLUMNAS vigente). */
function Mig_run002() {
  var res = { ok: true, esquema: null, alineadas: [], yaCanonicas: [],
    ingresosActualizados: [], ingresosSinHoja: [] };
  var e = Modelo_asegurarEsquemaPacientes_();
  if (!e.ok) {
    if (e.motivo === 'SIN_HOJA_PACIENTES') {
      res.ok = false; res.motivo = 'MIG-002:SIN_HOJA_PACIENTES';
      return res;
    }
    if (!e.insertar || !e.insertar.length) {
      res.ok = false; res.motivo = 'MIG-002:' + (e.motivo || 'ESQUEMA_INCOMPATIBLE');
      return res;
    }
  }
  res.esquema = e;
  var v = Modelo_alinearVistasSectoriales_();
  res.alineadas = v.alineadas;
  res.yaCanonicas = v.yaCanonicas;
  if (v.errores.length) {
    res.ok = false; res.motivo = 'MIG-002:SECTOR:' + v.errores.join(',');
    return res;
  }
  var a = _mig002_asegurarIngresosSaludMental();
  res.ingresosActualizados = a.actualizadas;
  res.ingresosSinHoja = a.sinHoja;
  res.ingresosRevision = a.revision;
  if (!a.ok) {
    res.ok = false;
    res.motivo = 'MIG-002:INGRESOS_REVISION:' + (a.revision || []).join(';');
    return res;
  }
  Log_info('Instalador', 'MIG-002',
    'PACIENTES 31 campos · SECTOR_* 17 · INGRESO_* SALUD_MENTAL');
  return res;
}

/** GAS (helper MIG-002): asegura el encabezado SALUD_MENTAL en las hojas
 *  INGRESO_* POR NOMBRE y orden canónico (nunca por posición mágica, B5).
 *  Casos:
 *   - ya existe SALUD_MENTAL        → idempotente, no toca nada;
 *   - solo falta la SALUD_MENTAL final y la celda posterior a NOTA_SISTEMA
 *     está vacía                     → escribe el encabezado;
 *   - cualquier otra divergencia (encabezado canónico ausente o desordenado,
 *     o columna ocupada tras NOTA_SISTEMA) → `revision` y BLOQUEA la
 *     migración: no se escribe a ciegas sobre una columna ajena. */
function _mig002_asegurarIngresosSaludMental() {
  var res = { ok: true, actualizadas: [], sinHoja: [], revision: [] };
  var canonicos = INGRESO_COLUMNAS.slice(0, INGRESO_COLUMNAS.length - 1);
  Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
    var hoja = Modelo_hoja(nombre);
    if (!hoja) { res.sinHoja.push(nombre); return; }
    var hr = Modelo_headerRow(nombre);
    var ancho = Math.max(hoja.getLastColumn() || 0, 1);
    var fila = hoja.getRange(hr, 1, 1, ancho).getValues()[0];
    var headers = fila.map(function (v) { return Utl_colapsarEspacios(Utl_texto(v)).toUpperCase(); });
    if (headers.indexOf('SALUD_MENTAL') !== -1) return;
    var indice = {};
    canonicos.forEach(function (cm, i) { indice[cm] = headers.indexOf(cm.toUpperCase()); });
    for (var i = 0; i < canonicos.length; i++) {
      if (indice[canonicos[i]] === -1) {
        res.revision.push(nombre + ': ausente el encabezado canónico "' + canonicos[i] + '"');
        res.ok = false;
        return;
      }
      if (i > 0 && indice[canonicos[i]] < indice[canonicos[i - 1]]) {
        res.revision.push(nombre + ': orden canónico alterado en "' + canonicos[i] + '"');
        res.ok = false;
        return;
      }
    }
    var posSM = indice.NOTA_SISTEMA + 1;
    var ocupado = Utl_texto(fila[posSM]).trim() !== '';
    if (ocupado) {
      res.revision.push(nombre + ': columna posterior a NOTA_SISTEMA ocupada ("' + Utl_texto(fila[posSM]) + '")');
      res.ok = false;
      return;
    }
    hoja.getRange(hr, posSM + 1).setValue('SALUD_MENTAL');
    res.actualizadas.push(nombre);
  });
  return res;
}
 /** GAS: MIG-001 — alinear vistas SECTOR_* al esquema canónico (15→16, S10-FIX).
 *  Idempotente y por nombre. Se tolera HOJA_NO_EXISTE (estructura la crea);
 *  encabezados irreconocibles → falla (requiere revisión, no se adivina nada). */
function Mig_run001() {
  var res = { ok: true, alineadas: [], yaCanonicas: [], sinObjeto: [] };
  HOJAS_SECTOR.forEach(function (n) {
    var r = Modelo_alinearVistaSector_(n);
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
    // Respaldo completo previo a cualquier mutación (B4). Si falla → se aborta
    // sin escribir: nada se arriesga en una reparación automática.
    var bk = Instalar_asegurarBackup_('WEBHOOK_INSTALAR');
    if (!bk.ok) {
      return { ok: false, motivo: 'BACKUP_FALLIDO',
        linea: 'No se pudo crear el respaldo previo del libro: ' + bk.motivo };
    }
    var snap = Modelo_escanearEstructura();
    var v = Mig_clasificarInstalacion(snap, null, REGISTRO_MIGRACIONES);
    var incompatible = Instalar_versionIncompatible_(v);
    if (incompatible === 'ESQUEMA_DIVERGENTE') {
      return { ok: false, motivo: 'ESQUEMA_DIVERGENTE', estado: v.estado, detalle: v,
        linea: 'El esquema instalado (' + v.version + ') es más nuevo que este código (' + v.objetivo + '); no se modifica nada.' };
    }
    if (incompatible === 'VERSION_DESCONOCIDA') {
      return { ok: false, motivo: 'VERSION_DESCONOCIDA', estado: v.estado, detalle: v,
        linea: 'SCHEMA_VERSION ilegible (' + v.version + '); se requiere revisión manual.' };
    }
    if (v.estado === 'INCOMPLETA') {
      var est = Modelo_crearEstructura_();
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
  return { ok: r.ok !== false, diagnostico: r.diagnostico, motivo: r.motivo || '' };
}

function Instalar_pVersionado() {
  var snap = Modelo_escanearEstructura();
  var v = Mig_clasificarInstalacion(snap, null, REGISTRO_MIGRACIONES);
  var incompatible = Instalar_versionIncompatible_(v);
  return { ok: !incompatible, motivo: incompatible, versionado: {
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
  var est = Modelo_crearEstructura_();
  return { creadas: est.creadas.length, existentes: est.existentes.length,
           dashboardReparado: !!est.dashboardReparado };
}
function Instalar_pFuentes() {
  // Instalar CARGA los datos reales vigentes de los sectores reutilizando el
  // pipeline de Fuentes_cargaReal (única fuente de verdad). Secuencia de
  // seguridad: análisis dry-run (sin escrituras) → si la fuente es válida,
  // ejecución con política SNAPSHOT_ACTUAL (reinstalación / carga inicial).
  // La ejecución REUTILIZA el análisis dry-run (ejecucionId → UNA lectura real
  // de fuentes; evita drift entre la previa y la escritura).
  var analisis;
  try { analisis = Fuentes_cargaReal({ ejecutar: false, actualizar: true, modo: 'SNAPSHOT_ACTUAL' }); }
  catch (e) { return { ok: false, motivo: e && e.message ? e.message : String(e) }; }
  if (analisis.ok === false) return { ok: false, motivo: analisis.motivo, resumen: analisis.resumen };
  var ejecucion;
  try {
    ejecucion = Fuentes_cargaReal({ ejecutar: true, actualizar: true, modo: 'SNAPSHOT_ACTUAL',
      ejecucionId: analisis.ejecucionId });
  } catch (e2) { return { ok: false, motivo: e2 && e2.message ? e2.message : String(e2) }; }
  if (ejecucion.ok === false) return { ok: false, motivo: ejecucion.motivo, resumen: ejecucion.resumen };
  var res = ejecucion.resumen || {};
  return { ok: true, modo: 'SNAPSHOT_ACTUAL', resumen: res,
    linea: 'registros ' + res.registros + ' · nuevos ' + res.nuevos +
      ' · existentes ' + res.existentes + ' · en revisión ' + res.revision };
}
function Instalar_pAmarillo() {
  // Sector Amarillo desde Drive (Amarillo_importarTodo_: puerta INGRESO_AMARILLO
  // + histórico idempotente). La fuente ausente no es un fallo bloqueante: se
  // informa para diagnóstico sin duplicar lógica.
  var r;
  try { r = Amarillo_importarTodo_(true); }
  catch (e) { return { ok: false, motivo: e && e.message ? e.message : String(e) }; }
  if (!r || r.ok === false) return { ok: false, motivo: r.motivo || (r && r.linea) || 'No se pudo cargar el sector amarillo' };
  return { ok: true, aplicaHistorico: true, puerta: r.puerta, historico: r.historico };
}
function Instalar_pValidaciones() {
  var r = Modelo_validarIngresos(Modelo_ss());
  return { ok: r.ok !== false && !(r.fallidas || []).length,
           validaciones: r.validaciones, puertas: r.hojas, protegidas: r.protegidas,
           motivo: (r.fallidas || []).join('; ') || r.motivo || '' };
}
function Instalar_pLimpieza() {
  var r = Modelo_limpiarHojasResiduales(Modelo_ss());
  return { ok: true, candidatas: r.candidatas, eliminadas: r.eliminadas,
           conservadas: r.conservadas, linea: 'No se eliminaron hojas en la instalación' };
}
function Instalar_pDiseno() {
  var r = Modelo_aplicarDiseno();
  r.ok = r.ok !== false && !(r.fallidas || []).length;
  if (!r.ok) r.motivo = (r.fallidas || []).join('; ') || r.motivo || 'Diseño incompleto';
  return r;
}
function Instalar_pVisual() {
  // Instalar/reparar es responsable de REPARAR inconsistencias existentes:
  // fuerza el formato aunque HVis_yaFormateada identifique un fast-path
  // (SAS-025: vista migrada 15→16 con la sección OBSERVACIONES sin pintar).
  var r = HVis_aplicarTodasLasSecciones({ forzar: true });
  var fallos = (r.resultados || []).filter(function (x) { return x.ok === false; });
  return { ok: r.ok !== false && fallos.length === 0, hojas: r.resultados,
           motivo: fallos.length ? 'Diseño incompleto en: ' + fallos.map(function (x) { return x.hoja; }).join(', ') : (r.motivo || '') };
}
function Instalar_pInicio() {
  var r = Modelo_disenoHojas();
  var rut = Hojas_colorearRutIngresos();
  var errores = (r.cond && r.cond.errores || []).slice();
  (rut.fallidas || []).forEach(function (fallo) { errores.push('RUT: ' + fallo); });
  if (r.inicio && r.inicio.verificacion) {
    var fallos = Object.keys(r.inicio.verificacion)
      .filter(function (k) { return !r.inicio.verificacion[k]; });
    if (fallos.length) errores.push('verificación INICIO: ' + fallos.join(', '));
  }
  return { ok: errores.length === 0, motivo: errores.join('; '), inicio: r.inicio,
           cond: r.cond, rut: rut, filtros: r.filtros, ocultas: r.ocultas,
           protecciones: r.protecciones };
}
function Instalar_pMenu() {
  // La Web App no tiene interfaz de Sheets: allí el menú se crea al abrir el
  // libro, no durante esta RPC. No informar una configuración inexistente.
  try { SpreadsheetApp.getUi(); }
  catch (e) { return { ok: true, omitida: true,
    linea: 'Menú de Sheets omitido; se crea al abrir la hoja de cálculo' }; }
  var resultado = onOpen();
  if (resultado && resultado.ok === false) return resultado;
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
  return { ok: v.estado === 'VIGENTE', pacientes: pacientes, eventos: eventos,
           schemaVersion: v.version, esquemaOK: v.estado === 'VIGENTE', estado: v.estado,
           motivo: v.estado === 'VIGENTE' ? '' : 'Esquema no vigente: ' + v.estado };
}

/** (S5/S11, DEC-057) Etapa de enriquecimiento demográfico de PACIENTES dentro
 *  del instalador: completa SOLO campos vacíos (SEXO/FECHA_NACIMIENTO) desde
 *  hojas INGRESO_* con fuente consistente; idempotente; no crea pacientes ni
 *  eventos. Reporta métricas S11: totalPacientes, revisados, enriquecidos,
 *  sinCambios, conflictos (requieren revisión), noEncontrados (sin fuente) y
 *  errores. */
function Instalar_pEnriquecimiento() {
  // Enriquecimiento demográfico de PACIENTES reutilizando Act_enriquecerPacientes
  // (fill-only SEXO/FECHA_NACIMIENTO desde INGRESO_*; no crea pacientes ni
  // eventos; idempotente). Misma implementación que ACTUALIZAR.
  var r;
  try { r = Act_enriquecerPacientes({ dryRun: false }); }
  catch (e) { return { ok: false, motivo: e && e.message ? e.message : String(e) }; }
  return { ok: r.ok !== false, resumen: r };
}

/** Calcula derivados (estratificación + controles) para que INICIO muestre
 *  datos reales desde la primera instalación. Idempotente. */
function Instalar_pDerivados() {
  var estrat = { recalculados: 0, total: 0 };
  var ctrl = { cambios: 0, total: 0 };
  var errores = [];
  try { estrat = Estrat_recalcularTodos_() || estrat; } catch (eE) { errores.push('estratificación: ' + (eE && eE.message || eE)); }
  try { ctrl = Control_recalcularTodos() || ctrl; } catch (eC) { errores.push('controles: ' + (eC && eC.message || eC)); }
  if (estrat.ok === false) errores.push('estratificación: ' + (estrat.motivo || 'error'));
  if (ctrl.ok === false) errores.push('controles: ' + (ctrl.motivo || 'error'));
  var lineas = [];
  lineas.push('Estratificación: ' + (estrat.recalculados || 0) + '/' + (estrat.total || 0) + ' recalculados');
  lineas.push('Controles: ' + (ctrl.cambios || 0) + '/' + (ctrl.total || 0) + ' actualizados');
  if (errores.length) lineas.push('Errores: ' + errores.join('; '));
  return { ok: errores.length === 0, estrat: estrat, controles: ctrl, errores: errores,
           motivo: errores.join('; '), linea: lineas.join(' · ') };
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
    ver.bloqueo = Instalar_versionIncompatible_(ver);
    diagnostico.versionado = ver;
    if (ver.estado !== 'VIGENTE' || ver.bloqueo) {
      diagnostico.resumen.fasesPendientes.push('versionado: ' + (ver.bloqueo || ver.estado) +
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
      // SAS-025: HVis_diagnosticarDisenio ya expone est.visual (pendientesVisual):
      // una hoja con la última columna de una sección sin color debe quedar
      // pendiente aunque estructura y secciones detectadas coincidan.
      var pendientesVisuales = (est.visual && Array.isArray(est.visual.pendientes))
        ? est.visual.pendientes : [];
      if (est.estructura !== 'OK' ||
          detectadas < esperadas ||
          (filaEncEsperada && filaEnc !== filaEncEsperada) ||
          pendientesVisuales.length > 0) {
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

  // 6. VALIDACIONES INGRESO: inspeccionar la regla de la primera fila de
  // datos. Nunca ejecutar Modelo_validarIngresos desde un diagnóstico.
  try {
    var columnasConRegla = ['ESTADO_INGRESO', 'ESTRATIFICACION', 'SEXO',
      'FECHA DE NACIMIENTO', 'FECHA DE INGRESO'];
    Object.keys(HOJAS_INGRESO).forEach(function (nombre) {
      var hoja = ss.getSheetByName(nombre);
      if (!hoja || hoja.isSheetHidden()) return;
      diagnostico.validaciones.puertas = (diagnostico.validaciones.puertas || 0) + 1;
      var ini = Modelo_dataStartRow(nombre);
      columnasConRegla.forEach(function (col) {
        var idx = INGRESO_COLUMNAS.indexOf(col) + 1;
        var tiene = idx > 0 && hoja.getMaxRows() >= ini &&
          !!hoja.getRange(ini, idx).getDataValidation();
        if (tiene) diagnostico.validaciones.aplicadas++;
        else {
          diagnostico.validaciones.pendientes++;
          diagnostico.validaciones.detalles.push(nombre + ': ' + col);
        }
      });
    });
    if (diagnostico.validaciones.pendientes === 0) diagnostico.resumen.fasesCompletas.push('validaciones');
    else diagnostico.resumen.fasesPendientes.push('validaciones: ' + diagnostico.validaciones.pendientes + ' pendientes');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('validaciones: error'); }

  // 7. FORMATO CONDICIONAL: contar reglas existentes, sin reescribirlas.
  try {
    var hojasFormato = [HOJAS.PACIENTES].concat(Object.keys(HOJAS_INGRESO), HOJAS_SECTOR, [HOJAS.CONFLICTOS]);
    hojasFormato.forEach(function (nombre) {
      var hoja = ss.getSheetByName(nombre);
      if (!hoja) return;
      var umbral = nombre === HOJAS.PACIENTES ? Modelo_dataStartRow(nombre) : Modelo_headerRow(nombre);
      if (hoja.getLastRow() < umbral) return;
      var cantidad = hoja.getConditionalFormatRules().length;
      var esperadas = nombre === HOJAS.PACIENTES ? 10
        : nombre === HOJAS.CONFLICTOS ? 2
        : Object.prototype.hasOwnProperty.call(HOJAS_INGRESO, nombre) ? 3 : 9;
      diagnostico.formato.aplicados += cantidad;
      if (cantidad < esperadas) {
        diagnostico.formato.pendientes++;
        diagnostico.formato.detalles.push(nombre + ': ' + cantidad + '/' + esperadas + ' reglas');
      }
    });
    if (diagnostico.formato.pendientes) diagnostico.resumen.fasesPendientes.push('formato: ' + diagnostico.formato.pendientes + ' hojas');
    else diagnostico.resumen.fasesCompletas.push('formato');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('formato: error'); }

  // 8. COLUMNAS TÉCNICAS: solo consultar visibilidad.
  try {
    [{ nombre: HOJAS.PACIENTES, cols: [1, 7, 22, 23, 24, 25, 26, 27, 28] },
     { nombre: HOJAS.EVENTOS, cols: [1, 2, 14, 15, 16] }].forEach(function (cfg) {
      var hoja = ss.getSheetByName(cfg.nombre);
      if (!hoja) return;
      cfg.cols.forEach(function (col) {
        if (hoja.isColumnHiddenByUser(col)) diagnostico.ocultas.ocultadas++;
        else {
          diagnostico.ocultas.pendientes++;
          diagnostico.ocultas.detalles.push(cfg.nombre + ': columna ' + col);
        }
      });
    });
    if (diagnostico.ocultas.pendientes) diagnostico.resumen.fasesPendientes.push('ocultas: ' + diagnostico.ocultas.pendientes + ' columnas');
    else diagnostico.resumen.fasesCompletas.push('ocultas');
  } catch (e) { diagnostico.resumen.fasesPendientes.push('ocultas: error'); }

  // 9. MENÚ - always safe to re-apply, not a diagnostic item
  diagnostico.menu.necesitaActualizar = false;

  // Resumen general
  diagnostico.resumen.totalFases = 7;
  diagnostico.resumen.completas = diagnostico.resumen.fasesCompletas.length;
  diagnostico.resumen.pendientes = diagnostico.resumen.fasesPendientes.length;

  return { ok: true, diagnostico: diagnostico };
}
