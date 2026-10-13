/**
 * Sistema ECICEP — Web App de captura.
 * CapturaWeb es la única interfaz operativa. Google Forms funciona detrás de
 * ella como cola durable interna y nunca se publica como interfaz paralela.
 *
 * Flujo vigente (captura V4; contrato docs/CONTRATO_CAPTURA_V2.md):
 *   CapturaWeb.html → WebApp_capturarRecibirDurable → FormResponse.submit()
 *     → Form_worker_ → CapturaIngress_adapterForms_ → Captura_v2_enviar_.
 * La recepción responde RECIBIDO después de persistir. El worker es el único
 * mutador clínico del transporte y deriva captureId de formId + responseId.
 *
 * AISLAMIENTO: este módulo NO crea bases ni lógica paralela. El código es
 * autónomo y portátil: utiliza el contexto del proyecto (SpreadsheetApp.getActive()
 * cuando hay hoja activa) y la configuración existente (00_Config.js). No hay
 * IDs hardcodeados de DEMO ni de producción; el destino de escritura sigue la
 * lógica normal del proyecto Apps Script corriendo.
 *
 * Frontera de acceso (DEC-110):
 *   · CAPTURA — anónima/universal. `WebApp_capturarRecibirDurable`,
 *     `WebApp_estadoInicial`, `WebApp_verificarRecepcion` y `api_webappEstado`
 *     se sirven por el QR estable SIN sesión de operador (sin OPSESS).
 *   · OPERADOR / ADMINISTRACIÓN — exigen sesión OPSESS y el secreto
 *     independiente `ECICEP_OPERATOR_SECRET_SHA256`. Toda RPC operativa es
 *     interna (sufijo `_`) y sólo se alcanza por el gateway único
 *     `WebApp_operadorRpc` (ver `src/37_OperadorAuth.js`).
 *   · `ECICEP_ACCESS_TOKEN` — compatibilidad/trazabilidad legacy: NO es
 *     autenticación ni abre la operación; se inyecta en servidor y nunca viaja
 *     en la URL.
 *
 *   Referencia histórica: DEC-101/DEC-102 (acceso universal concedido siempre)
 *   describen el estado previo; DEC-110 los acota a la CAPTURA pública.
 *
 * Nota doGet: un proyecto Apps Script admite UN SOLO doGet. Este enruta las
 * consultas de webhook de solo lectura y las vistas Web; toda mutación remota
 * requiere doPost y habilitación explícita.
 */

// ---------------------------------------------------------------------------
// CONTROL DE ACCESO — frontera DEC-110
//   · CAPTURA: anónima/universal. El QR estable abre la captura sin OPSESS.
//   · OPERADOR/ADMIN: exige sesión OPSESS + secreto independiente
//     `ECICEP_OPERATOR_SECRET_SHA256`, servido por el gateway único
//     `WebApp_operadorRpc` (src/37_OperadorAuth.js). Toda RPC operativa es
//     interna (sufijo `_`) y no es invocable por google.script.run.
//   · ECICEP_ACCESS_TOKEN: compatibilidad/trazabilidad legacy, NO autenticación.
//
//   Referencia histórica: DEC-101/DEC-102 concedían acceso universal a TODA
//   función (revertían la separación de capacidades de DEC-097). DEC-110 los
//   acota: la concesión universal queda sólo para la CAPTURA pública.
//
//   Las claves siguientes se conservan para enlaces, QR impresos y pestañas ya
//   abiertas; se inyectan en servidor y nunca viajan en la URL. El token del
//   webhook es independiente y no se comparte aquí.
// ---------------------------------------------------------------------------

/** Claves que contienen (o contuvieron) la credencial legacy de trazabilidad.
 *  Todas son equivalentes; NO autentican la operación (DEC-110). */
var WEBAPP_CLAVES_ACCESO_ = [
  'ECICEP_ACCESS_TOKEN', 'CAPTURA_ACCESS_TOKEN', 'OPERADOR_ACCESS_TOKEN', 'LEGACY_ACCESS_TOKEN'
];

/** Alias legacy de trazabilidad: SIEMPRE concede (DEC-102, hoy acotado por
 *  DEC-110). No es autenticación: la frontera de la OPERACIÓN es el gateway
 *  `WebApp_operadorRpc`, que exige OPSESS. Aquí sólo se conserva la concesión
 *  para no romper comprobaciones heredadas del código servidor; la CAPTURA
 *  pública ya es anónima por diseño.
 *
 *  DEC-102 (corrección del incidente «api_buscar_: se requiere autorización»):
 *  la credencial se inyecta en cada vista, pero una pestaña cacheada, un token
 *  vacío o un valor heredado NUNCA deben bloquear una acción. Conceder siempre
 *  eliminó la clase de fallo que dejó el sistema inaccesible (DEC-097 → DEC-101
 *  → DEC-102). Desde DEC-110 esto sólo alcanza a la CAPTURA; la operación usa
 *  OPSESS. */
function WebApp_autorizar_(token) { return true; }

/** Alias legacy de trazabilidad (DEC-110): NO autentica la operación. */
function WebApp_autorizarBuscador_(token) { return WebApp_autorizar_(token); }
/** Alias legacy del canal de captura (DEC-110): mismo criterio, sin capacidades. */
function WebApp_autorizarCaptura_(token) { return WebApp_autorizar_(token); }

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

/** ¿Está operativo el acceso legacy de trazabilidad? Verdadero siempre (DEC-110,
 *  heredero de DEC-102). NO es el gate de la operación: desde DEC-110 la
 *  administración se sirve por el gateway OPSESS. Este flag sólo describe la
 *  disponibilidad de la credencial legacy para diagnóstico/UI heredada.
 *  Sustituye a la antigua allowlist de identidades (DEC-097). Antes devolvía
 *  `false` cuando la credencial no se
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
  return ECICEP_webAppUrl_();
}

/** URL de una vista operativa. Sin credencial en la URL (DEC-110): la operación
 *  se autentica con OPSESS, no con el token. */
function WebApp_urlVista_(vista) {
  var base = WebApp_urlCompartida_();
  if (!base) return '';
  var v = Utl_texto_(vista).trim();
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
    return _wh_despachar_(e, 'GET');
  }
  var p = e && e.parameter || {};
  var vista = String(p.vista || 'captura').trim();
  // DEC-110: el QR estable sirve la CAPTURA sin credencial y sin OPSESS. El
  // servidor inyecta el token legacy sólo como trazabilidad; la operación
  // (ficha, ingresos, REM, configuración, etc.) se autentica con OPSESS en el
  // cliente. Un `?acceso=` heredado en un enlace viejo se ignora sin efecto.
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

/** Sirve la única interfaz operativa de captura. Google Forms queda detrás de
 *  esta pantalla como transporte durable interno; su URL no se publica. */
function WebApp_servirCaptura_(accesoUniversal) {
  var plantilla = HtmlService.createTemplateFromFile('CapturaWeb');
  plantilla.CAPTURA_ACCESO = accesoUniversal || '';
  plantilla.TOKEN_ACCESO = accesoUniversal || '';
  plantilla.TOKEN_INVITACION = accesoUniversal || '';
  plantilla.MODO_OPERADOR = false;
  plantilla.PORTAL_URL = WebApp_urlVista_('portal');
  plantilla.FICHA_URL = WebApp_urlVista_('ficha');
  plantilla.REM_URL = '';
  plantilla.DASH_URL = '';
  plantilla.GENERAR_REM_URL = '';
  plantilla.BUILD = Utilities.formatDate(new Date(), ECICEP.TZ, 'yyyyMMdd-HHmm');
  plantilla.PAGE_BUILD = WebApp_buildActual_();
  plantilla.SECCION = 'TODAS';
  plantilla.modo = 'ficha';
  plantilla.ID_INICIAL = '';
  return plantilla.evaluate()
    .setTitle('ECICEP — Captura de datos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------------------
// PUENTE → PIPELINE EXISTENTE
// ---------------------------------------------------------------------------

/**
 * GAS: expone a la Web App el esquema del formulario (secciones por ACCION,
 * campos requeridos y mensajes de éxito) derivado de FORM_CONFIG. La UI pinta
 * y valida con LO MISMO que valida el backend — sin reglas duplicadas a mano.
 */
function WebApp_esquemaFormulario_(acceso) {
  return Form_esquemaFormulario_();
}

/**
 * GAS: versión reducida y legible de un paciente para mostrar en la Web App.
 * Cuidado de privacidad: NO se expone TELEFONOS ni OBSERVACIONES al navegador;
 * solo identidad y fechas de operación (los datos que el formulario ya conoce).
 */
function WebApp_resumenPaciente_(p) {
  if (!p) return null;
  return {
    idInterno: p.ID_INTERNO || '',
    nombre: Utl_texto_(p.NOMBRE),
    rut: Utl_texto_(p.RUT),
    sexo: Utl_texto_(p.SEXO),
    fechaNacimiento: Utl_texto_(p.FECHA_NACIMIENTO),
    sector: Utl_texto_(p.SECTOR),
    estratificacion: Utl_texto_(p.ESTRATIFICACION),
    fechaIngreso: Utl_texto_(p.FECHA_INGRESO)
  };
}

function api_webappEstado(acceso) {
  return {
    ok: true,
    version: ECICEP.VERSION,
    build: WebApp_buildActual_(),
    entorno: typeof Entorno_actualGAS_ !== 'undefined' ? Entorno_actualGAS_().entorno : 'DESCONOCIDO',
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
  try {
    var profesionales = WebApp_profesionalesDropdown_();
    if (!profesionales || !profesionales.length) {
      return { ok: false, codigo: 'CATALOGO_PROFESIONALES_NO_DISPONIBLE', motivo: 'No fue posible cargar el catálogo de profesionales' };
    }
    return {
      ok: true,
      esquema: Form_esquemaFormulario_(),
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
function WebApp_profesionalesDropdown_() {
  try {
    if (typeof Captura_v2_catalogo_ !== 'function') return [];
    return Captura_v2_catalogo_()
      .filter(function (c) { return c && c.ACTIVO !== false && (c.NOMBRE_CANONICO || c.NOMBRE || c.CODIGO); })
      .map(function (c) { return c.NOMBRE_CANONICO || c.NOMBRE || c.CODIGO; });
  } catch (e) {
    return [];
  }
}
