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
 * Nota doGet: un proyecto Apps Script admite UN SOLO doGet. Este enruta las
 * consultas de webhook de solo lectura y las vistas Web; toda mutación remota
 * requiere doPost y habilitación explícita.
 */

// ---------------------------------------------------------------------------
// CONTROL DE ACCESO — CAPACIDADES SEPARADAS
//   v0.10.7 (DEC-071): Incorporación de ingresos clara para el operador —
//     incorporación individual y masiva de válidos reutilizando el pipeline único;
//   v0.10.6 (DEC-070): Controles y seguimientos por persona (selector 100% cliente) + REM sin loader falso;
//   v0.10.5 (DEC-069 supera DEC-068/DEC-067): fiabilidad operativa + lecturas acotadas;
//   v0.16.0 (DEC-097): CAPTURA y OPERADOR vuelven a ser capacidades distintas.
//   CAPTURA_ACCESS_TOKEN solo permite registrar; OPERADOR_ACCESS_TOKEN o una
//   identidad explícitamente permitida habilita vistas administrativas. El
//   token del webhook es independiente y nunca se comparte en URLs públicas.
// ---------------------------------------------------------------------------

/** Autoriza exclusivamente operaciones de operador/administración. */
function WebApp_autorizar(token) {
  return WebApp_accesoOperadorValido_(token) || WebApp_identidadOperadorAutorizada_();
}

/** Boundary de operador usado por todos los api_* administrativos. */
function WebApp_autorizarBuscador(token) { return WebApp_autorizar(token); }
/** Boundary mínimo del canal de captura: nunca acepta token de operador por alias. */
function WebApp_autorizarCaptura(token) { return WebApp_accesoCapturaValido_(token); }

/**
 * Clave del canal de captura (CAPTURA_ACCESS_TOKEN).
 * Devuelve de inmediato el valor existente; solo toma el lock para CREAR la
 * clave cuando la propiedad falta. Nunca devuelve '' si la clave existe:
 * ante contención o fallo relee sin lock y solo falla si realmente no existe.
 */
function WebApp_claveCaptura_() {
  var props = PropertiesService.getScriptProperties();
  var clave = props.getProperty('CAPTURA_ACCESS_TOKEN');
  if (clave) return clave;
  var lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(5000)) {
    clave = props.getProperty('CAPTURA_ACCESS_TOKEN');
    if (!clave) throw new Error('ACCESO_UNIVERSAL_NO_INICIALIZADO');
    return clave;
  }
  try {
    clave = props.getProperty('CAPTURA_ACCESS_TOKEN');
    if (!clave) {
      clave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      props.setProperty('CAPTURA_ACCESS_TOKEN', clave);
    }
    return clave;
  } catch (e) {
    clave = props.getProperty('CAPTURA_ACCESS_TOKEN');
    if (!clave) throw e;
    return clave;
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (ign) {} }
  }
}

/** Valida CAPTURA_ACCESS_TOKEN. La clave legacy universal solo conserva Captura. */
function WebApp_accesoCapturaValido_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  var esperado = PropertiesService.getScriptProperties().getProperty('CAPTURA_ACCESS_TOKEN');
  if (!esperado) return false;
  if (token === esperado) return true;
  var legacy = PropertiesService.getScriptProperties().getProperty('LEGACY_ACCESS_TOKEN');
  return !!legacy && token === legacy;
}

/** OPERADOR_ACCESS_TOKEN nunca se crea ni se revela desde una ruta pública. */
function WebApp_claveOperador_() {
  return PropertiesService.getScriptProperties().getProperty('OPERADOR_ACCESS_TOKEN') || '';
}
function WebApp_accesoOperadorValido_(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false;
  var esperado = WebApp_claveOperador_();
  return !!esperado && token === esperado;
}
function WebApp_accesoCompartidoValido_(token) { return WebApp_accesoCapturaValido_(token); }

/** La sesión solo autoriza si su identidad figura explícitamente en propiedades.
 *  OPERADOR_EMAILS: lista separada por coma; OPERADOR_DOMINIOS: dominios permitidos. */
function WebApp_identidadOperadorAutorizada_() {
  var email = WebApp_usuarioActivo_().toLowerCase();
  if (!email || email.indexOf('@') < 1) return false;
  var props = PropertiesService.getScriptProperties();
  var emails = String(props.getProperty('OPERADOR_EMAILS') || '').toLowerCase().split(',')
    .map(function (v) { return v.trim(); }).filter(Boolean);
  if (emails.indexOf(email) >= 0) return true;
  var dominio = email.split('@').pop();
  var dominios = String(props.getProperty('OPERADOR_DOMINIOS') || '').toLowerCase().split(',')
    .map(function (v) { return v.trim().replace(/^@/, ''); }).filter(Boolean);
  return dominios.indexOf(dominio) >= 0;
}

/** Diagnóstico sin secretos para instalación/soporte; no revela identidades. */
function WebApp_diagnosticoSeguridad_() {
  var props = PropertiesService.getScriptProperties();
  return {
    capturaConfigurada: !!props.getProperty('CAPTURA_ACCESS_TOKEN'),
    operadorTokenConfigurado: !!props.getProperty('OPERADOR_ACCESS_TOKEN'),
    operadorIdentidadesConfiguradas: !!(props.getProperty('OPERADOR_EMAILS') || props.getProperty('OPERADOR_DOMINIOS')),
    webhookConfigurado: !!props.getProperty('WEBHOOK_TOKEN'),
    webhookMutacionesHabilitadas: props.getProperty('WEBHOOK_MUTACIONES_HABILITADAS') === 'SI',
    geminiConfigurado: !!props.getProperty('GEMINI_API_KEY'),
    legacyPendienteRetiro: !!props.getProperty('LEGACY_ACCESS_TOKEN')
  };
}

/**
 * URL permanente de captura (QR y enlace de distribución).
 *
 * El QR contiene solo el deployment operativo estable. La capacidad mínima
 * de Captura se inyecta en servidor al servir esa ruta; por ello un QR
 * impreso no depende de una propiedad ni deja de funcionar si la credencial
 * interna se recupera o rota. Esto no eleva a Operador: las vistas distintas
 * de `captura` siguen exigiendo exclusivamente la capacidad de administración.
 */
function WebApp_urlCompartida_() {
  return ECICEP_webAppUrl();
}

/** URL de una vista operativa. Usa exclusivamente la capacidad OPERADOR. */
function WebApp_urlVista_(vista) {
  var clave = WebApp_claveOperador_();
  var url = clave ? ECICEP_webAppUrl() + '?acceso=' + encodeURIComponent(clave) : '';
  return url && vista ? url + '&vista=' + encodeURIComponent(vista) : url;
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
  var acceso = String(p.acceso || '').trim();
  var vista = String(p.vista || 'captura').trim();
  if (vista === 'captura') {
    // Captura es el canal público universal. No se confía en el token de la
    // URL: se entrega la capacidad vigente desde Script Properties. Así la URL
    // base y también los QR antiguos con un token obsoleto siguen funcionando.
    return WebApp_servirCaptura_(WebApp_claveCaptura_());
  }
  if (!WebApp_autorizar(acceso)) {
    return ContentService.createTextOutput('Enlace de ECICEP no válido. Solicita el enlace o QR actualizado desde el menú ECICEP.');
  }
  var archivos = {
    portal: 'PortalWeb', pacientes: 'Sidebar', ingresos: 'Sidebar',
    revision: 'Sidebar', ficha: 'Sidebar', controles: 'Controles',
    estadisticas: 'Dashboard', configuracion: 'Configuracion',
    backups: 'Backup', registro: 'LogVisor', instalar: 'Instalador', rem: 'RemVista',
    generarRem: 'RemGenerador'
  };
  var archivo = Object.prototype.hasOwnProperty.call(archivos, vista) ? archivos[vista] : '';
  if (!archivo) return ContentService.createTextOutput('Función no disponible. Abre el enlace actualizado de ECICEP.');
  var plantilla = HtmlService.createTemplateFromFile(archivo);
  var operador = acceso;
  plantilla.CAPTURA_ACCESO = '';
  plantilla.TOKEN_ACCESO = operador;
  plantilla.TOKEN_INVITACION = operador;
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

/** Sirve el canal de captura sin enlaces, token ni modo de operador. */
function WebApp_servirCaptura_(accesoCaptura) {
  var plantilla = HtmlService.createTemplateFromFile('CapturaWeb');
  plantilla.CAPTURA_ACCESO = accesoCaptura || '';
  plantilla.TOKEN_ACCESO = accesoCaptura || '';
  plantilla.TOKEN_INVITACION = accesoCaptura || '';
  plantilla.MODO_OPERADOR = false;
  plantilla.PORTAL_URL = '';
  plantilla.FICHA_URL = '';
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
