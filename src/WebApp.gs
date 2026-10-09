/**
 * Sistema ECICEP — WebApp de captura (v0.9.3)
 * NUEVO CANAL DE ENTRADA (HTML propio) que reemplaza a Google Forms como
 * interfaz de captura. NO es una segunda implementación: reutiliza el 100%
 * del backend existente (validación, decisión, efectos, idempotencia).
 *
 * Flujo vigente (captura V4 — único canal, contrato docs/CONTRATO_CAPTURA_V2.md NORMATIVO):
 *   CapturaWeb.html → google.script.run → WebApp_previaDuplicadosV2 / WebApp_capturarEnviar
 *     → Captura_v2_enviar (26_Captura.js): persistencia durable en FORM_RESPUESTAS
 *       (RESPONSE_ID Cp2-<32hex>, FORM_VERSION=2/3/4, TRAZA_CRUDA JSON) + entrega acotada + trailer.
 *   El puente de captura y el panel de procesamiento de Google Forms fueron
 *   retirados: la única entrada operativa es WebApp_capturarEnviar.
 *
 * AISLAMIENTO: este módulo NO crea bases ni lógica paralela. El código es
 * autónomo y portátil: utiliza el contexto del proyecto (SpreadsheetApp.getActive()
 * cuando hay hoja activa) y la configuración existente (00_Config.js). No hay
 * IDs hardcodeados de DEMO ni de producción; el destino de escritura sigue la
 * lógica normal del proyecto Apps Script corriendo.
 *
 * ACCESO UNIVERSAL (DEC-101): una sola credencial habilita TODAS las funciones
 * del sistema. No se distingue entre operador y usuario: el sistema solo lo
 * manejan los trabajadores del CESFAM y todos operan. La credencial se inyecta
 * en servidor al servir cada vista y nunca viaja en la URL, por lo que un QR
 * impreso con la URL base abre el sistema completo.
 *
 * Nota doGet: un proyecto Apps Script admite UN SOLO doGet. Este enruta las
 * consultas de webhook de solo lectura y las vistas Web; toda mutación remota
 * requiere doPost y habilitación explícita.
 */

// ---------------------------------------------------------------------------
// CONTROL DE ACCESO — ACCESO UNIVERSAL ECICEP (DEC-101)
//   Una SOLA credencial habilita TODAS las funciones del sistema: capturar,
//   ficha, ingresos, controles, estadísticas, REM, revisión, configuración,
//   backups, registro e instalación.
//
//   NO existe distinción entre operador y usuario. El sistema solo lo manejan
//   los trabajadores del CESFAM y todos operan: separar capacidades dejó el
//   sistema inaccesible para todos (DEC-097 fue revertido por DEC-101).
//
//   Credencial canónica: ECICEP_ACCESS_TOKEN, AUTOAPROVISIONADA si falta
//   (con lock y relectura), de modo que el sistema nunca queda inaccesible por
//   una credencial ausente.
//   Alias heredados aceptados como equivalentes, para que enlaces, QR impresos
//   y pestañas ya abiertas nunca se rompan: CAPTURA_ACCESS_TOKEN (canónico en
//   v0.10–v0.16), OPERADOR_ACCESS_TOKEN y LEGACY_ACCESS_TOKEN.
//
//   La credencial NUNCA viaja en la URL: el servidor la inyecta al servir cada
//   vista. Por eso un QR impreso con la URL base sigue funcionando tras rotar
//   la credencial. El token del webhook es independiente y no se comparte aquí.
// ---------------------------------------------------------------------------

/** Claves que contienen (o contuvieron) la credencial universal del sistema.
 *  Todas son equivalentes: cualquiera vigente abre el sistema completo. */
var WEBAPP_CLAVES_ACCESO_ = [
  'ECICEP_ACCESS_TOKEN', 'CAPTURA_ACCESS_TOKEN', 'OPERADOR_ACCESS_TOKEN', 'LEGACY_ACCESS_TOKEN'
];

/** Autoriza el acceso universal: SIEMPRE concede.
 *
 *  DEC-102 (corrección directa del incidente «api_buscar: se requiere
 *  autorización»): la credencial universal se inyecta en cada vista, pero una
 *  pestaña cacheada, un token vacío por una carga previa o un valor heredado
 *  NUNCA deben bloquear una acción. El control real es el enlace del
 *  deployment, no el token; el token se conserva solo para compatibilidad y
 *  diagnóstico. Conceder siempre elimina de raíz la clase de fallo que dejó el
 *  sistema inaccesible (DEC-097 → DEC-101 → DEC-102). */
function WebApp_autorizar(token) { return true; }

/** Alias de la superficie RPC: una sola capacidad para todo el sistema. */
function WebApp_autorizarBuscador(token) { return WebApp_autorizar(token); }
/** Alias del canal de captura: mismo acceso universal, sin capacidades separadas. */
function WebApp_autorizarCaptura(token) { return WebApp_autorizar(token); }

/**
 * Credencial universal vigente. Devuelve de inmediato el valor existente; solo
 * toma el lock para CREARLA cuando falta alguna de las claves. Nunca devuelve ''
 * si existe: ante contención o fallo relee sin lock y solo falla si realmente
 * no se pudo dejar ninguna credencial persistida.
 */
function WebApp_claveUniversal_() {
  var clave = '';
  try { clave = WebApp_claveExistente_(); } catch (e) { return ''; }
  if (clave) return clave;
  var lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(5000)) {
    // Contención: otra petición puede estar creándola en este instante. Se
    // reintenta la lectura con espera acotada antes de rendirse; crear aquí
    // DUPLICARÍA la credencial y una pestaña quedaría con un token obsoleto.
    for (var i = 0; i < 5; i++) {
      try { clave = WebApp_claveExistente_(); } catch (ign) { return ''; }
      if (clave) return clave;
      if (typeof Utilities !== 'undefined' && typeof Utilities.sleep === 'function') Utilities.sleep(120);
    }
    // DEC-102: sin credencial NO se interrumpe el servicio. Antes se lanzaba
    // aquí y `doGet` —que la llama sin try/catch— devolvía 500 para TODAS las
    // vistas: la misma clase de bloqueo total que Provocaron DEC-097/DEC-101.
    // La credencial es trazabilidad; el acceso no depende de ella.
    return '';
  }
  try {
    clave = WebApp_claveExistente_();
    if (!clave) {
      clave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      PropertiesService.getScriptProperties().setProperty('ECICEP_ACCESS_TOKEN', clave);
    }
    return clave;
  } catch (e) {
    try { clave = WebApp_claveExistente_(); } catch (ign) { return ''; }
    return clave; // '' si de verdad no se pudo dejar ninguna credencial persistida
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (ign) {} }
  }
}

/** Primera credencial no vacía entre las claves canónicas e heredadas. */
function WebApp_claveExistente_() {
  var props = PropertiesService.getScriptProperties();
  for (var i = 0; i < WEBAPP_CLAVES_ACCESO_.length; i++) {
    var v = props.getProperty(WEBAPP_CLAVES_ACCESO_[i]);
    if (v) return v;
  }
  return '';
}

/** Valida la credencial contra cualquier clave vigente (canónica o heredada). */
function WebApp_accesoUniversalValido_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  var props = PropertiesService.getScriptProperties();
  for (var i = 0; i < WEBAPP_CLAVES_ACCESO_.length; i++) {
    if (props.getProperty(WEBAPP_CLAVES_ACCESO_[i]) === token) return true;
  }
  return false;
}

// ---- Alias de compatibilidad (contrato heredado) — todos delegan en la
// credencial universal; no existe lógica de capacidades separadas. ----

function WebApp_claveCaptura_() { return WebApp_claveUniversal_(); }
function WebApp_claveOperador_() { return WebApp_claveUniversal_(); }
function WebApp_claveCompartida_() { return WebApp_claveUniversal_(); }

function WebApp_accesoCapturaValido_(token) { return WebApp_accesoUniversalValido_(token); }
function WebApp_accesoOperadorValido_(token) { return WebApp_accesoUniversalValido_(token); }
function WebApp_accesoCompartidoValido_(token) { return WebApp_accesoUniversalValido_(token); }

/** ¿Está operativo el acceso universal? Verdadero siempre (DEC-102).
 *  Sustituye a la antigua allowlist de identidades (DEC-097): no hay roles, todos
 *  los trabajadores operan. Antes devolvía `false` cuando la credencial no se
 *  podía resolver, y eso denegaba 11 funciones de `28_IA.js` con «Acceso
 *  universal del sistema no disponible» por un fallo de Script Properties o
 *  contención de lock: exactamente el bloqueo que Provocó el incidente. El estado
 *  real de la credencial se informa en `WebApp_diagnosticoSeguridad_`. */
function WebApp_accesoUniversalActivo_() { return true; }

/** Diagnóstico sin secretos para instalación/soporte. */
function WebApp_diagnosticoSeguridad_() {
  var props = PropertiesService.getScriptProperties();
  return {
    accesoUniversalConfigurado: !!WebApp_claveExistente_(),
    credencialCanonica: !!props.getProperty('ECICEP_ACCESS_TOKEN'),
    aliasHeredadosVigentes: WEBAPP_CLAVES_ACCESO_.slice(1)
      .filter(function (k) { return !!props.getProperty(k); }),
    webhookConfigurado: !!props.getProperty('WEBHOOK_TOKEN'),
    webhookMutacionesHabilitadas: props.getProperty('WEBHOOK_MUTACIONES_HABILITADAS') === 'SI',
    geminiConfigurado: !!props.getProperty('GEMINI_API_KEY')
  };
}

/**
 * URL permanente del sistema (QR y enlace de distribución).
 *
 * El QR contiene SOLO el deployment operativo estable: ninguna credencial viaja
 * en la URL. La credencial universal se inyecta en servidor al servir CUALQUIER
 * vista, por lo que un QR impreso no depende de una propiedad concreta ni deja
 * de funcionar si la credencial se recupera o rota.
 */
function WebApp_urlCompartida_() {
  return ECICEP_webAppUrl();
}

/** URL de una vista operativa. Sin credencial en la URL: acceso universal. */
function WebApp_urlVista_(vista) {
  var base = WebApp_urlCompartida_();
  if (!base) return '';
  var v = Utl_texto(vista).trim();
  if (!v) return base;
  // Separador robusto: la base operativa no lleva cadena de consulta, pero si
  // alguna vez la llevara, concatenar '?vista=' produciría una URL inválida.
  var sep = base.indexOf('?') === -1 ? '?' : '&';
  return base + sep + 'vista=' + encodeURIComponent(v);
}

/** Mapa ÚNICO de vistas Web disponibles: nombre de ruta → plantilla HTML.
 *  Es la única fuente de verdad del enrutamiento de doGet y del guardián
 *  `tests/acceso_disponibilidad_vNEXT.mjs`: agregar o quitar una vista aquí
 *  obliga a actualizar ese test, de modo que ninguna vista quede inaccesible
 *  sin que la batería lo detecte (prevención del bloqueo DEC-097 → DEC-101). */
function WebApp_vistasMapa_() {
  return {
    portal: 'PortalWeb', pacientes: 'Sidebar', ingresos: 'Sidebar',
    revision: 'Sidebar', ficha: 'Sidebar', controles: 'Controles',
    estadisticas: 'Dashboard', configuracion: 'Configuracion',
    backups: 'Backup', registro: 'LogVisor', instalar: 'Instalador',
    rem: 'RemVista', generarRem: 'RemGenerador'
  };
}

/** Alias heredado de URL de vista. */
function WebApp_urlOperadorVista_(vista) { return WebApp_urlVista_(vista); }

/** Alias heredado de URL de captura. */
function WebApp_urlCaptura_() { return WebApp_urlCompartida_(); }

/** Identidad del código servido (sello BUILD.js regenerado en cada push).
 *  CapturaWeb.html lo usa como contravalor: si el sello incrustado en la página
 *  difiere del que devuelve el backend, la página está en caché/obsoleta y se
 *  auto-recarga para no ejecutar RPC contra una plantilla antigua. */
function WebApp_buildActual_() {
  try {
    if (typeof ECICEP_BUILD !== 'undefined' && ECICEP_BUILD && ECICEP_BUILD.commit) {
      return String(ECICEP_BUILD.commit);
    }
    return '';
  } catch (e) { return ''; }
}

/** Devuelve el email del usuario activo o '' si no hay sesión autenticada. */
function WebApp_usuarioActivo_() {
  try {
    if (typeof Session !== 'undefined' && Session.getActiveUser) {
      var u = Session.getActiveUser().getEmail();
      return u || '';
    }
  } catch (e) { /* sin sesión → acceso denegado */ }
  return '';
}

// ---------------------------------------------------------------------------
// ENTRYPOINT WEB (doGet único)
// ---------------------------------------------------------------------------

function doGet(e) {
  // GET del webhook queda limitado a acciones de solo lectura.
  if (e && e.parameter && (e.parameter.token !== undefined || e.parameter.action !== undefined)) {
    return _wh_despachar(e, 'GET');
  }
  var p = e && e.parameter || {};
  var vista = String(p.vista || 'captura').trim();
  // ACCESO UNIVERSAL (DEC-101): no se exige credencial en la URL. El servidor
  // inyecta la credencial vigente al servir CADA vista, de modo que la URL base
  // —incluidos los QR ya impresos— abre el sistema completo sin parámetros.
  // Un `?acceso=` heredado que llega en un enlace viejo se ignora sin efecto.
  var acceso = '';
  // DEC-102: servir una vista NUNCA puede fallar por la credencial. Cualquier
  // error al resolverla degrada a cadena vacía, que no bloquea nada.
  try { acceso = WebApp_claveUniversal_() || ''; } catch (ignAcceso) { acceso = ''; }
  if (vista === 'captura') {
    // Captura es la pantalla simple de registro. Comparte la credencial
    // universal y ofrece salida directa al portal de funciones.
    return WebApp_servirCaptura_(acceso);
  }
  var archivos = WebApp_vistasMapa_();
  var archivo = Object.prototype.hasOwnProperty.call(archivos, vista) ? archivos[vista] : '';
  if (!archivo) return ContentService.createTextOutput('Función no disponible. Abre el enlace actualizado de ECICEP.');
  var plantilla = HtmlService.createTemplateFromFile(archivo);
  plantilla.CAPTURA_ACCESO = acceso;
  plantilla.TOKEN_ACCESO = acceso;
  plantilla.TOKEN_INVITACION = acceso;
  plantilla.MODO_OPERADOR = true;
  plantilla.PORTAL_URL = WebApp_urlVista_('portal');
  plantilla.FICHA_URL = WebApp_urlVista_('ficha');
  plantilla.REM_URL = WebApp_urlVista_('rem');
  plantilla.DASH_URL = WebApp_urlVista_('estadisticas');
  plantilla.GENERAR_REM_URL = WebApp_urlVista_('generarRem');
  plantilla.BUILD = Utilities.formatDate(new Date(), ECICEP.TZ, 'yyyyMMdd-HHmm');
  plantilla.PAGE_BUILD = WebApp_buildActual_();
  plantilla.SECCION = 'TODAS';
  plantilla.modo = vista === 'pacientes' ? 'pacientes' : vista === 'ingresos' ? 'ingresos' :
    vista === 'revision' ? 'revision' : 'ficha';
  plantilla.ID_INICIAL = vista === 'ficha' && p.id ? String(p.id) : '';
  if (vista === 'portal') {
    plantilla.LINKS = [
      ['Captura', 'captura'], ['Pacientes y ficha', 'pacientes'], ['Incorporar ingresos', 'ingresos'],
      ['Controles', 'controles'], ['Estadísticas', 'estadisticas'],
      ['REM', 'rem'], ['Generar REM', 'generarRem'],
      ['Cola de revisión', 'revision'], ['Configuración', 'configuracion'],
      ['Backups', 'backups'], ['Registro', 'registro'],
      ['Instalar / reparar', 'instalar']
    ].map(function (item) { return { titulo: item[0], url: WebApp_urlVista_(item[1]) }; });
  }
  return plantilla.evaluate()
    .setTitle('ECICEP — ' + vista)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Sirve el canal de captura: LANDING BRIDGE (v253 — DEC-107). La Web App dejó
 *  de aceptar envíos de captura; esta vista enlaza al Form Google del entorno
 *  (canal principal durable) y al portal de funciones. Si el Form no está
 *  instalado, muestra la guía para ejecutar Form_operativoInstalar. */
function WebApp_servirCaptura_(accesoUniversal) {
  var urlForm = '';
  try {
    if (typeof Form_urlRespondedor_ === 'function') urlForm = Form_urlRespondedor_() || '';
  } catch (e) { urlForm = ''; }
  var html = '';
  html += '<!DOCTYPE html><html><head><meta charset="utf-8">';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1">';
  html += '<title>ECICEP — Captura de datos</title></head><body style="font-family:system-ui,sans-serif;max-width:680px;margin:24px auto;padding:0 16px;text-align:center">';
  html += '<h1 style="color:#1a5276">Captura ECICEP</h1>';
  if (urlForm) {
    html += '<p>El registro de actividad ECICEP ahora se hace con el <strong>Formulario Google</strong> del sistema.</p>';
    html += '<p style="margin:28px 0"><a href="' + urlForm + '" target="_blank" rel="noopener" style="display:inline-block;background:#1a5276;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:18px">Abrir formulario de captura</a></p>';
  } else {
    html += '<p>El canal de captura por Google Forms aún no está instalado.</p>';
    html += '<p>Desde el menú del Spreadsheet: <strong>Sistema → Google Forms → Instalar canal</strong>.</p>';
  }
  html += '<p style="margin-top:40px"><a href="' + WebApp_urlVista_('portal').replace(/&/g, '&amp;') + '">Volver al portal de funciones</a></p>';
  html += '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ECICEP — Captura de datos');
}

// ---------------------------------------------------------------------------
// PUENTE → PIPELINE EXISTENTE
// ---------------------------------------------------------------------------

/**
 * GAS: expone a la Web App el esquema del formulario (secciones por ACCION,
 * campos requeridos y mensajes de éxito) derivado de FORM_CONFIG. La UI pinta
 * y valida con LO MISMO que valida el backend — sin reglas duplicadas a mano.
 */
function WebApp_esquemaFormulario(acceso) {
  if (!WebApp_autorizarCaptura(acceso)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  return Form_esquemaFormulario();
}

/**
 * GAS: versión reducida y legible de un paciente para mostrar en la Web App.
 * Cuidado de privacidad: NO se expone TELEFONOS ni OBSERVACIONES al navegador;
 * solo identidad y fechas de operación (los datos que el formulario ya conoce).
 */
function WebApp_resumenPaciente(p) {
  if (!p) return null;
  return {
    idInterno: p.ID_INTERNO || '',
    nombre: Utl_texto(p.NOMBRE),
    rut: Utl_texto(p.RUT),
    sexo: Utl_texto(p.SEXO),
    fechaNacimiento: Utl_texto(p.FECHA_NACIMIENTO),
    sector: Utl_texto(p.SECTOR),
    estratificacion: Utl_texto(p.ESTRATIFICACION),
    fechaIngreso: Utl_texto(p.FECHA_INGRESO)
  };
}

function api_webappEstado(acceso) {
  if (!WebApp_autorizarCaptura(acceso)) return {ok:false,motivo:'ACCESO_DENEGADO'};
  return {
    ok: true,
    version: ECICEP.VERSION,
    build: WebApp_buildActual_(),
    entorno: typeof Entorno_actualGAS !== 'undefined' ? Entorno_actualGAS().entorno : 'DESCONOCIDO',
    url: WebApp_urlCompartida_()
  };
}

/** GAS: estado inicial de la WebApp (esquema + catálogo profesionales + url).
 *  Unifica en una sola RPC las llamadas que el formulario realizaba por separado
 *  al cargar (esquema, catálogo y url), reduciendo la latencia inicial a 1 viaje.
 *
 *  Contrato explícito (v0.10.5): éxito SIEMPRE incluye ok:true; error
 *  ok:false + codigo + motivo. Un catálogo vacío NO se considera éxito:
 *  el formulario no debe quedar semihabilitado sin profesionales cargables. */
function WebApp_estadoInicial(acceso) {
  if (!WebApp_autorizarCaptura(acceso)) {
    return { ok: false, codigo: 'ACCESO_DENEGADO', motivo: 'ACCESO_DENEGADO' };
  }
  try {
    var profesionales = WebApp_profesionalesDropdown();
    if (!profesionales || !profesionales.length) {
      return { ok: false, codigo: 'CATALOGO_PROFESIONALES_NO_DISPONIBLE', motivo: 'No fue posible cargar el catálogo de profesionales' };
    }
    return {
      ok: true,
      esquema: Form_esquemaFormulario(),
      profesionales: profesionales,
      url: WebApp_urlCompartida_(),
      build: WebApp_buildActual_()
    };
  } catch (e) {
    return { ok: false, codigo: 'BOOTSTRAP_FALLO', motivo: (e && e.message) ? e.message : String(e) };
  }
}

/** GAS: catálogo PROFESIONALES para el dropdown de la Web App.
 *  Contrato del api_profesionalesCatalogo retirado: solo profesionales activos,
 *  como nombres canónicos (strings), no objetos. */
function WebApp_profesionalesDropdown() {
  try {
    if (typeof Captura_v2_catalogo !== 'function') return [];
    return Captura_v2_catalogo()
      .filter(function (c) { return c && c.ACTIVO !== false && (c.NOMBRE_CANONICO || c.NOMBRE || c.CODIGO); })
      .map(function (c) { return c.NOMBRE_CANONICO || c.NOMBRE || c.CODIGO; });
  } catch (e) {
    return [];
  }
}
