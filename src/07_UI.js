/**
 * Sistema ECICEP — 07_UI
 * Interfaz DENTRO de Google Sheets (DEC-012: Sheets es la interfaz principal).
 * Menú consolidado: operación clínica y mantenimiento del sistema.
 */

/** Menú principal. Se ejecuta automáticamente al abrir el spreadsheet.
 *  Superficie: cinco flujos operativos y mantenimiento.
 *  v0.14: el menú Sistema expone SOLO {Actualizar sistema, Instalar / reparar}.
 *  La reparación visual y la reconstrucción de INICIO son capacidades internas
 *  del instalador (motor único de Presentación), no acciones principales.
 *  UI_reconstruirInicio_ / UI_repararPresentacion_ se conservan como wrappers
 *  internos deprecated para compatibilidad (34_LibroUX).
 *  onOpen NUNCA escribe celdas de INICIO (ni A1 ni Y1): solo menús + toast.
 *  Todo mantenimiento de INICIO vive en Inicio_*.
 *  INICIO se abre desde su pestaña (sin item propio). */
function onOpen() {
  try {
    var ui = _UI_get_();

    ui.createMenu('ECICEP')
      .addItem('Captura', 'UI_abrirFormularioCaptura_')
      .addItem('Buscar paciente', 'UI_abrirBuscador_')
      .addItem('Controles', 'UI_abrirControles_')
      .addItem('Estadísticas', 'UI_abrirDashboard_')
      .addItem('Incorporar ingresos', 'UI_abrirIngresos_')
      .addToUi();

    ui.createMenu('Sistema')
      .addItem('Actualizar sistema', 'UI_actualizarSistema_')
      .addItem('Instalar / reparar', 'UI_instalarSistema_')
      .addItem('Google Forms', 'UI_menuGoogleForms_')
      .addToUi();

    // v0.14: onOpen no muta INICIO. Sin lecturas ni escrituras sobre la
    // portada (título/versión los gestiona Inicio_construir_ dentro del
    // motor de Presentación). Solo menús + toast.
    var mostrarToast = true;
    try {
      var up = PropertiesService.getUserProperties(), clave = 'ECICEP_TOAST_VERSION';
      mostrarToast = up.getProperty(clave) !== ECICEP.VERSION;
      if (mostrarToast) up.setProperty(clave, ECICEP.VERSION);
    } catch (eP) {}
    if (mostrarToast) Utl_toast_('info', 'v' + ECICEP.VERSION + ' listo — menú disponible arriba a la derecha', 4);
    return { ok: true };
  } catch (e) {
    // Los disparadores simples no tienen dónde mostrar el error, pero el
    // instalador sí necesita saber si el menú realmente quedó disponible.
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** URL centralizada de la Web App de captura. Única fuente de verdad.
 *  Si ECICEP.WEB_APP_URL está configurado, lo usa; si no, cae en
 *  ScriptApp.getService().getUrl() (funciona en /exec, puede fallar
 *  desde un script vinculado si el deployment no es el operativo). */
function ECICEP_webAppUrl_() {
  var configurada = Utl_texto_(ECICEP.WEB_APP_URL).trim();
  if (configurada) return configurada;
  return ScriptApp.getService().getUrl();
}

/** Captura: acceso explícito por clic, QR y copia de la misma URL operativa.
 * Abrir automáticamente una pestaña desde la RPC pierde el gesto del usuario
 * y es bloqueado por navegadores de otras cuentas. */
function UI_abrirFormularioCaptura_() {
  return UI_mostrarQR_();
}

/** Alias conservado para accesos anteriores; una única pantalla de Captura.
 * El QR siempre apunta a la Web App estable. Google Forms es transporte durable
 * interno y su URL de respondedor nunca se distribuye a operadores. */
function UI_mostrarQR_() {
  var urlQR = WebApp_urlCaptura_();
  if (!urlQR) throw new Error('No se pudo preparar el enlace de captura');
  var t = HtmlService.createTemplateFromFile('QRFormulario');
  t.QR_URL = urlQR;
  t.WEB_APP_URL = urlQR;
  _UI_get_().showModalDialog(t.evaluate().setWidth(440).setHeight(640), 'Captura');
}

/** ⚙ Instalar sistema: dialog con progreso REAL por etapas (Instalador.html). */
function UI_instalarSistema_() {
  var t = HtmlService.createTemplateFromFile('Instalador');
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz_(), 'yyyyMMdd-HHmm');
  t.TOKEN_ACCESO = WebApp_claveUniversal_();
  t.PORTAL_URL = '';
  _UI_get_().showModalDialog(t.evaluate()
    .setTitle('Instalaci\u00f3n del sistema').setWidth(760).setHeight(720),
    'Instalaci\u00f3n del sistema');
}

/** 🔍 Diagnóstico de instalación (dry-run): informa qué cambiaría sin aplicarlo. */
function UI_instalarDiagnosticar_() {
  var r = Instalar_diagnosticar_();
  if (!r.ok) {
    _UI_get_().alert('Error', r.motivo || 'Error en diagnóstico', _UI_get_().ButtonSet.OK);
    return;
  }
  var d = r.diagnostico;
  var lineas = [];
  lineas.push('=== ECICEP v' + ECICEP.VERSION + ' — Diagnóstico ===');
  lineas.push('');
  lineas.push('ESTRUCTURA: ' + d.estructura.existentes.length + ' hojas OK, ' + d.estructura.faltantes.length + ' faltantes');
  if (d.estructura.faltantes.length) lineas.push('  Faltan: ' + d.estructura.faltantes.join(', '));
  lineas.push('');
  lineas.push('VERSIONADO (INST-1):');
  if (d.versionado) {
    var ver = d.versionado;
    lineas.push('  Aplicación v' + ECICEP.VERSION + ' · Instalador ' + SISTEMA_VERSION_INSTALADOR);
    lineas.push('  Esquema: leído ' + ver.version + ' · esperado ' + ver.objetivo);
    lineas.push('  Estado: ' + ver.estado +
      (ver.pendientes.length ? ' · migraciones pendientes: ' + ver.pendientes.join(', ') : '') +
      (ver.sectoresDivergentes.length ? ' · SECTOR_* divergentes: ' + ver.sectoresDivergentes.join(', ') : ''));
  } else {
    lineas.push('  no disponible');
  }
  lineas.push('');
  lineas.push('SECCIONES VISUALES:');
  var seccPend = 0;
  Object.keys(d.secciones).forEach(function (h) {
    var s = d.secciones[h];
    if (s.ok && s.configurada) {
      var est = s.estadoActual || {};
      if (est.estructura !== 'OK') seccPend++;
      lineas.push('  ' + h + ': ' + (est.estructura || 'N/A'));
    }
  });
  if (seccPend === 0) lineas.push('  Todas correctas');
  if (d.presentacion) {
    lineas.push('PRESENTACIÓN: ' + d.presentacion.hojasCorrectas + ' hojas correctas, ' +
      d.presentacion.hojasPendientes + ' con ajustes pendientes');
    lineas.push('  Layout ' + d.presentacion.categorias.layout + ' · Validaciones ' +
      d.presentacion.categorias.validaciones + ' · Pestañas ' + d.presentacion.categorias.tabs +
      ' · Anchos ' + d.presentacion.categorias.anchos + ' · Freeze ' + d.presentacion.categorias.freeze);
  }
  lineas.push('');
  lineas.push('CONFLICTOS: ' + (d.conflictos.oculta ? 'oculta (OK)' : 'visible (requiere ocultar)'));
  lineas.push('VALIDACIONES: ' + d.validaciones.aplicadas + ' aplicadas');
  lineas.push('FORMATO: ' + d.formato.aplicados + ' reglas');
  lineas.push('OCULTAS: ' + d.ocultas.ocultadas + ' columnas técnicas');
  lineas.push('');
  if (d.resumen.fasesPendientes.length) {
    lineas.push('⚠ Cambios pendientes: ' + d.resumen.fasesPendientes.length);
    d.resumen.fasesPendientes.forEach(function (p) { lineas.push('  · ' + p); });
  } else {
    lineas.push('✓ Sistema al día — no se requieren cambios');
  }
  lineas.push('');
  lineas.push('Para aplicar cambios estructurales: Sistema → Instalar / reparar sistema');
  _UI_get_().alert('🔍 Diagnóstico', lineas.join('\n'), _UI_get_().ButtonSet.OK);
}

/** 🔄 Actualizar sistema: mantenimiento completo de datos y derivados (S6, DEC-064).
 *  Mecanismo real de actualización: estructura + registros nuevos + campos de
 *  pacientes existentes + derivados + vistas + formato. Nunca sobrescribe un
 *  dato vigente ni infiere; la estructura la CREA el instalador (aquí se
 *  repara de forma idempotente). Implementación única: Act_actualizarSistema_().
 *  Estructura/instalación completa → "Sistema → Instalar / reparar". */
function UI_actualizarSistema_() {
  var ui = _UI_get_();
  var msg = 'Actualizar sistema\n\n' +
    'Actualiza:\n' +
    '  · pacientes nuevos desde las fuentes autorizadas;\n' +
    '  · campos vacíos de pacientes existentes (solo desde dato válido);\n' +
    '  · estructura del modelo (repara columnas faltantes, no destruye);\n' +
    '  · demografía (sexo y fecha de nacimiento);\n' +
    '  · estratificación y vistas (conserva las fechas agendadas);\n' +
    '  · vistas sectoriales y formato.\n\n' +
    'No sobrescribe un dato vigente y no infiere datos.\n' +
    '¿Desea ejecutar la actualización?';
  var resp = ui.alert('🔄 Actualizar sistema', msg, ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;
  UI_actualizarTodo_();
}

/** 🔄 Actualizar todo (lógica real de "Actualizar sistema", S6): ejecuta la
 *  cadena de mantenimiento Act_actualizarSistema_ (estructura + fuentes +
 *  enriquecimiento demográfico + derivados + vistas + formato) e informa el
 *  resumen consolidado. La importancia del resumen vive en 27_Actualizacion. */
function UI_actualizarTodo_(opciones) {
  Utl_toast_('info', 'Actualizando sistema…', 45);
  var r = Act_actualizarSistema_(opciones || {});
  var fases = r.resumen && r.resumen.errores || [];
  // v0.14 §24/§99: datos OK + presentación pendiente NO es error.
  var presentacionPendiente = r.advertencias && r.advertencias.indexOf('PRESENTACION_PENDIENTE') !== -1;
  var msj = (r.ok === false)
    ? 'Actualización incompleta (' + fases.slice(0, 3).join(', ') +
      (fases.length > 3 ? ' y ' + (fases.length - 3) + ' más' : '') + ') — revisar el Registro'
    : (presentacionPendiente
      ? 'Actualización completada · presentación pendiente de reparación — ' + Act_resumenActualizacionTexto_(r)
      : 'Actualizado — ' + Act_resumenActualizacionTexto_(r));
  Utl_toast_(r.ok === false ? 'error' : 'ok', msj, 10);
  return r;
}

/** 📄 Registro del Sistema: visor visual del LOG (la hoja queda interna). */
function UI_abrirLog_() {
  var t = HtmlService.createTemplateFromFile('LogVisor');
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz_(), 'yyyyMMdd-HHmm');
  t.TOKEN_ACCESO = WebApp_claveUniversal_();
  t.PORTAL_URL = '';
  t.REM_URL = '';
  t.DASH_URL = '';
  t.GENERAR_REM_URL = '';
  _UI_get_().showModalDialog(t.evaluate().setTitle('Registro del Sistema')
    .setWidth(1180).setHeight(720), 'Registro del Sistema');
}

/** Endpoint visor LOG: últimos registros + conteos por nivel. */
function api_logLeer_(limite, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var h = Modelo_hoja_(HOJAS.LOG);
    if (!h || h.getLastRow() < 2) return { ok: true, registros: [], resumen: { total: 0, errores: 0, advertencias: 0, informacion: 0 } };
    var max = Math.min(Number(limite) || 500, 2000);
    var ultima = h.getLastRow();
    var desde = Math.max(2, ultima - max + 1);
    var vals = h.getRange(desde, 1, ultima - desde + 1, Math.min(h.getLastColumn(), 7)).getValues();
    var tz = _UI_tz_();
    var registros = vals.map(function (f) {
      return {
        fechaIso: f[0] instanceof Date ? Utilities.formatDate(f[0], tz, 'yyyy-MM-dd HH:mm:ss') : Utl_texto_(f[0]),
        nivel: Utl_texto_(f[1]).toUpperCase(),
        modulo: Utl_texto_(f[2]),
        accion: Utl_texto_(f[3]),
        resultado: Utl_texto_(f[4]),
        duracionMs: f[5],
        contexto: Utl_texto_(f[6])
      };
    });
    var errores = 0, adv = 0, info = 0;
    registros.forEach(function (r) {
      if (r.nivel === 'ERROR') errores++;
      else if (r.nivel === 'WARNING') adv++;
      else info++;
    });
    return { ok: true, registros: registros,
             resumen: { total: registros.length, errores: errores, advertencias: adv, informacion: info } };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Flujo INGRESO_* → PACIENTES + EVENTOS con resumen comprensible (Parte 3.7). */
function UI_procesarIngresos_() {
  var r = Utl_medir_(Ingresos_procesarTodasLasHojas_);
  Log_info_('UI', 'procesarIngresos', JSON.stringify(r.resultado), null, r.ms);
  Log_flush_();
  var texto = Ingresos_resumenTexto_(r.resultado);
  if ((r.resultado.revision || 0) > 0) {
    texto += '\n\n⚠ ' + r.resultado.revision + ' caso(s) en la Cola de revisión.';
  }
  _UI_get_().alert(texto, _UI_get_().ButtonSet.OK);
}

/** Diagnóstico: por qué fallan los ingresos (encabezados, mapeo, errores). */
function UI_diagnosticarIngresos_() {
  Ingresos_diagnosticar_();
  var hoja = Modelo_ss_().getSheetByName('DIAGNOSTICO');
  if (hoja) SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(hoja);
}

/** Un solo clic: instala, siembra ficticios, procesa y refresca vistas. */
/** Sembrar prueba: siembra pacientes ficticios de demostración (úsase desde
 *  el Centro de Pruebas, no en el flujo normal). */
function UI_sembrarFicticios_() {
  Utl_toast_('info', 'Sembrando datos de prueba…', 15);
  var sembradas = Sembrar_ficticios_();
  Log_info_('UI', 'sembrarFicticios', 'sembradas=' + sembradas);
  Log_flush_();
  Utl_toast_('ok', 'Sembradas ' + sembradas + ' filas de prueba', 8);
  return sembradas;
}

function UI_demoCompleta_() {
  Utl_toast_('info', 'Preparando demostración…', 15);
  var pasos = {};
  pasos.estructura = Modelo_crearEstructura_();
  pasos.sembradas = Sembrar_ficticios_();
  pasos.proceso = Ingresos_procesarTodasLasHojas_({});
  pasos.vistas = Modelo_refrescarVistasSectores_();
  Log_info_('UI', 'demoCompleta', JSON.stringify(pasos.proceso));
  Log_flush_();
  Utl_toast_('ok', 'Demo lista · Sembradas: ' + pasos.sembradas +
    ' · Ingresados: ' + ((pasos.proceso.nuevos || 0) + (pasos.proceso.existentes || 0)) +
    ' · Eventos: ' + (pasos.proceso.eventosCreados || 0), 20);
}

// ===========================================================================
// ETAPA 5 — Fuentes reales
// ===========================================================================

function UI_diagnosticarFuentes_() {
  var resultado = Fuentes_diagnosticarFuentes_();

  // escribir reporte en DIAGNOSTICO
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaD = ss.getSheetByName('DIAGNOSTICO_FUENTES');
  if (!hojaD) hojaD = ss.insertSheet('DIAGNOSTICO_FUENTES');
  hojaD.clearContents();
  Utl_escribirBloque_(hojaD, 1, 1, [[
    'FUENTE','SECTOR','HOJA','EXISTE','ENCAB.FILA','RECONOCIDAS','FALTANTES','DESCONOCIDAS','FILAS_DATOS','NOTA'
  ]]);
  var fila = 2;
  resultado.fuentes.forEach(function (fuente) {
    if (fuente.error || fuente.motivo) {
      Utl_escribirBloque_(hojaD, fila, 1, [[
        fuente.nombre, fuente.sector, '', '', '', '', '', '', '', fuente.error || fuente.motivo
      ]]);
      fila++;
      return;
    }
    fuente.hojas.forEach(function (h) {
      Utl_escribirBloque_(hojaD, fila, 1, [[
        fuente.nombre,
        fuente.sector,
        h.nombre || '',
        h.existe === false ? 'NO EXISTE' : (h.vacia ? 'VACÍA' : 'SÍ'),
        h.encabezadoFila || '',
        h.columnasReconocidas ? h.columnasReconocidas.join(', ') : '',
        h.columnasFaltantes && h.columnasFaltantes.length ? h.columnasFaltantes.join(', ') : '',
        h.desconocidas && h.desconocidas.length ? h.desconocidas.join(' | ') : '',
        h.filasDatosAprox !== undefined ? h.filasDatosAprox : '',
        ''
      ]]);
      fila++;
    });
  });
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(hojaD);
  Utl_toast_('ok', 'Diagnóstico escrito en DIAGNOSTICO_FUENTES', 8);
}

/** Núcleo headless del sembrado (reutilizado por webhook). */
function Sembrar_ficticios_() {
  var casos = DATASET_STAGING.casos;
  var porHoja = {};
  Object.keys(casos).forEach(function (nombre) {
    var c = casos[nombre];
    var sector = Norm_normalizarSector_(c.origen.sector).sector;
    var hojaNombre = Ingresos_hojaParaSector_(sector);
    if (!hojaNombre) return;
    if (!porHoja[hojaNombre]) porHoja[hojaNombre] = [];
    porHoja[hojaNombre].push(c.valores);
  });
  var total = 0;
  Object.keys(porHoja).forEach(function (hojaNombre) {
    var hoja = Modelo_ss_().getSheetByName(hojaNombre);
    if (!hoja) return;
    var filas = porHoja[hojaNombre].map(function (v) {
      // orden según _INGRESO_ENCABEZADOS (operativos + sistema)
      return [
        Utl_texto_(v.NOMBRE), Utl_texto_(v.RUT), Utl_texto_(v.SEXO),
        Utl_texto_(v.FECHA_NACIMIENTO), Utl_texto_(v.TELEFONOS || v.TELEFONO),
        Utl_texto_(v.FECHA_INGRESO), Utl_texto_(v.ESTRATIFICACION),
        Utl_texto_(v.DUPLA_INGRESO), Utl_texto_(v.OBSERVACIONES),
        'PENDIENTE', 'DATOS DE PRUEBA (ficticio)'
      ];
    });
    total += Utl_escribirBloque_(hoja, hoja.getLastRow() + 1, 1, filas);
  });
  Log_info_('Sembrar', 'ficticios', total + ' filas');
  return total;
}

/** Un solo clic: instala, siembra ficticios, procesa y refresca vistas. */
/** Incluye un archivo HTML (tokens/componentes) dentro de una plantilla. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Abre una vista HTML como dialog ancho (dashboard / REM). */
function _ui_dialogo_(nombre, titulo) {
  var t = HtmlService.createTemplateFromFile(nombre);
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz_(), 'yyyyMMdd-HHmm');
  t.TOKEN_ACCESO = WebApp_claveUniversal_();
  t.PORTAL_URL = '';
  t.REM_URL = '';
  t.DASH_URL = '';
  t.GENERAR_REM_URL = '';
  var html = t.evaluate().setTitle(titulo).setWidth(1180).setHeight(720);
  _UI_get_().showModalDialog(html, titulo);
}

/** Abre la sidebar en un modo concreto: 'centro' (panel), 'pacientes' (buscador+ficha),
 *  'revision' (cola) o 'ficha' (abre directamente la ficha de la persona). */
function _ui_sidebar_(modo, titulo, idInicial) {
  var t = HtmlService.createTemplateFromFile('Sidebar');
  t.modo = modo;
  t.ID_INICIAL = idInicial || '';
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz_(), 'yyyyMMdd-HHmm');
  t.TOKEN_INVITACION = WebApp_claveUniversal_();
  t.PORTAL_URL = '';
  _UI_get_().showSidebar(t.evaluate().setTitle(titulo));
}

/** 🏠 Centro de funciones: accesos directos (listado simple, sin cargas). */
function UI_panelControl_() { _ui_sidebar_('centro', 'Funciones ECICEP'); }

/** 👤 Pacientes ECICEP: buscador + ficha. */
function UI_abrirBuscador_() { _ui_sidebar_('pacientes', 'Pacientes ECICEP'); }

/** 📥 Incorporación de ingresos: sidebar directamente en el panel de
 *  incorporación (individual + "Incorporar todos los válidos"). */
function UI_abrirIngresos_() { _ui_sidebar_('ingresos', 'Incorporación de ingresos'); }

/** 📋 Cola de Revisión: sidebar exclusivo del módulo de revisión. */
function UI_abrirRevision_() { _ui_sidebar_('revision', 'Cola de Revisión'); }

/** 👥 Duplicados por RUT: lista grupos con mismo RUT y permite unir. */
function UI_duplicados_(){
  var r=Api_duplicadosListar_();
  if(!r.ok){ _UI_get_().alert('Duplicados: '+r.motivo); return; }
  if(!r.totalGrupos){ _UI_get_().alert('Duplicados por RUT','Sin duplicados por RUT en PACIENTES.', _UI_get_().ButtonSet.OK); return; }
  var msg='Grupos duplicados: '+r.totalGrupos+' ('+r.totalDuplicados+' registros)\n\n';
  r.grupos.slice(0,10).forEach(function(g){
    msg+=g.rut+' x'+g.cantidad+' -> '+g.registros.map(function(x){return x.paciente.NOMBRE.substring(0,20)+'['+x.paciente.ID_INTERNO+']';}).join(' | ')+'\n';
  });
  if(r.totalGrupos>10) msg+='... y '+(r.totalGrupos-10)+' grupos mas. Ver LOG para detalle.\n';
  msg+='\nPara unir: ECICEP > Personas > Duplicados guarda el primero y reasigna eventos de los otros (marca REQUIERE_REVISION).';
  Log_info_('Duplicados','listar', JSON.stringify(r.grupos.slice(0,5).map(function(g){return g.rut+':'+g.cantidad;})));
  Log_flush_();
  _UI_get_().alert('Duplicados por RUT', msg, _UI_get_().ButtonSet.OK);
}

/** ⚙ Configuración: abre el diálogo de administración. La hoja CONFIG
 *  permanece OCULTA (no se muestra). Usa una función desde menú, jamás la hoja. */
function _ui_configuracion_(seccion) {
  // Re-prende el ocultamiento de CONFIG (idempotente) por si quedó visible.
  try {
    var cfg = Modelo_hoja_(HOJAS.CONFIG);
    if (cfg && !cfg.isSheetHidden()) cfg.hideSheet();
  } catch (e) {}
  var t = HtmlService.createTemplateFromFile('Configuracion');
  t.SECCION = seccion || 'TODAS';
  t.TOKEN_ACCESO = WebApp_claveUniversal_();
  t.PORTAL_URL = '';
  _UI_get_().showModalDialog(t.evaluate()
    .setTitle('Configuración').setWidth(900).setHeight(680), 'Configuración');
}

function UI_configuracion_() { _ui_configuracion_('TODAS'); }
/** 🎯 Estratificación: abre CONFIG filtrado a frecuencias/reglas de control. */
function UI_configuracionEstratificacion_() { _ui_configuracion_('ESTRATIFICACION'); }
/** 👨‍⚕️ Responsables y correos: abre CONFIG filtrado a responsables/correos. */
function UI_configuracionResponsables_() { _ui_configuracion_('CORREOS_RESPONSABLES'); }

/** 🧪 Centro de Pruebas: única entrada al diagnóstico del sistema. */
function UI_centroPruebas_() { _ui_dialogo_('CentroPruebas', 'Centro de Pruebas'); }

function UI_abrirDashboard_() { _ui_dialogo_('Dashboard', 'Estadísticas'); }

function UI_verRem_() { _ui_dialogo_('RemVista', 'REM vista de trabajo'); }

/** Generador REM: dialog estilo Panel (reemplaza los prompt nativos). */
function UI_generarRem_() { _ui_dialogo_('RemGenerador', 'Generar REM'); }

/** Acerca de: dialog con datos del sistema. */
function UI_abrirAcercaDe_() { _ui_dialogo_('AcercaDe', 'Acerca de ECICEP'); }

/** 🩺 Controles por persona: modal 50/50 (tabla de personas con controles
 *  pendientes a la izquierda; búsqueda + acciones + detalle a la derecha).
 *  Al abrir carga automáticamente la lista de personas pendientes
 *  (VENCIDO / POR_VENCER / SIN_FECHA): es la única lectura automática del
 *  modal, luego todo es bajo demanda. Sin KPIs ni estadísticas. */
function UI_abrirControles_() {
  var t = HtmlService.createTemplateFromFile('Controles');
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz_(), 'yyyyMMdd-HHmm');
  t.TOKEN_ACCESO = WebApp_claveUniversal_();
  t.PORTAL_URL = '';
  t.FICHA_URL = '';
  var html = t.evaluate().setTitle('Controles por persona')
    .setWidth(1160).setHeight(760);
  _UI_get_().showModalDialog(html, 'Controles por persona');
}

/** 🔎 Abre la ficha de una persona directamente (sidebar modo 'ficha'). */
function UI_abrirFicha_(idInterno) {
  var id = Utl_texto_(idInterno).trim();
  if (!id) return false;
  _ui_sidebar_('ficha', 'Pacientes ECICEP', id);
  return true;
}

/** Endpoint: datos para la vista "Acerca de". Solo OPERADOR. */
function api_acercaDe_(token) {
  if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = _UI_tz_();
  var pacHoja = ss.getSheetByName(HOJAS.PACIENTES);
  var evsHoja = ss.getSheetByName(HOJAS.EVENTOS);
  var pacIni = Modelo_dataStartRow_(HOJAS.PACIENTES);
  var pacCount = pacHoja && pacHoja.getLastRow() >= pacIni ? pacHoja.getLastRow() - pacIni + 1 : 0;
  var evsIni = Modelo_dataStartRow_(HOJAS.EVENTOS);
  var evsCount = evsHoja && evsHoja.getLastRow() >= evsIni ? evsHoja.getLastRow() - evsIni + 1 : 0;
  var nombre = '', institucion = '';
  try {
    var h = ss.getSheetByName(HOJAS.CONFIG);
    if (h && h.getLastRow() > 1) {
      var vals = Utl_leerBloque_(h);
      for (var i = 1; i < vals.length; i++) {
        var k = Utl_texto_(vals[i][0]), v = Utl_texto_(vals[i][1]);
        if (k === 'GENERAL_NOMBRE_SISTEMA') nombre = v;
        if (k === 'GENERAL_INSTITUCION') institucion = v;
      }
    }
  } catch (e) {}
  return {
    nombre: nombre || 'ECICEP',
    institucion: institucion || 'CESFAM San Juan',
    version: ECICEP.VERSION,
    pacientes: pacCount,
    eventos: evsCount,
    fecha: Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm"),
    estratificacion: CFG_ESTRATIFICACION.REGLA_DISPONIBLE
      ? 'Activa (regla ' + Utl_texto_(CFG_ESTRATIFICACION.VERSION_REGLA) + ')'
      : 'Manual / sin regla',
    ambiente: 'Producción'
  };
}

/** Endpoint: catálogo de profesionales + selección del paciente. */
function api_duplaAbrir_(idInterno, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var pacientes = Modelo_leerPacientesCampos_(['ID_INTERNO', 'DUPLA_INGRESO']);
    var p = null;
    for (var i = 0; i < pacientes.length; i++) {
      if (Utl_texto_(pacientes[i].ID_INTERNO) === Utl_texto_(idInterno)) { p = pacientes[i]; break; }
    }
    var seleccionados = p ? Utl_texto_(p.DUPLA_INGRESO).split(';').map(function (s) {
      return s.trim().toUpperCase();
    }).filter(function (s) { return s; }) : [];
    return {
      ok: true,
      catalogo: Profesionales_catalogo_().filter(function (c) { return c.ACTIVO; })
        .map(function (c) { return { CODIGO: c.CODIGO, NOMBRE: c.NOMBRE }; }),
      seleccionados: seleccionados
    };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: guarda la dupla del paciente como códigos separados por ';'. */
function api_duplaGuardar_(idInterno, codigos, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    codigos = (codigos || []).map(function (c) { return String(c).trim().toUpperCase(); }).filter(Boolean);
    var dupla = codigos.join('; ');
    var pacientes = Modelo_leerPacientesCampos_(['ID_INTERNO']);
    var idx = -1;
    for (var i = 0; i < pacientes.length; i++) {
      if (Utl_texto_(pacientes[i].ID_INTERNO) === Utl_texto_(idInterno)) { idx = i; break; }
    }
    if (idx === -1) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
    pacientes[idx].DUPLA_INGRESO = dupla;
    var hoja = Modelo_hoja_(HOJAS.PACIENTES);
    var colDupla = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf('DUPLA_INGRESO') + 1;
    hoja.getRange(Modelo_filaFisica_(HOJAS.PACIENTES, idx), colDupla).setValue(dupla);
    Modelo_invalidarLecturas_();
    Log_info_('Dupla', 'guardar', idInterno + ' → ' + dupla);
    Log_flush_();
    return { ok: true, cantidad: codigos.length, dupla: dupla };
  } catch (e) {
    Log_error_('Dupla', 'guardar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/* ---------------------- Administración de CONFIG (diálogo) ---------------------- */

/** Claves técnicas del sistema: el operador no las edita desde el diálogo. */
var CONFIG_PROTEGIDAS = {
  VERSION: true, AMBIENTE: true, SPREADSHEET_ID: true, NIVEL_LOG: true,
  TTL_CACHE_SEG: true, ANO_MIN_FECHAS: true, ANO_MAX_FECHAS: true
};

/** Endpoint: lista las claves de CONFIG con sección, tipo, descripción y protección. */
function api_configListar_(token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var hoja = Modelo_hoja_(HOJAS.CONFIG);
    var filas = [];
    if (hoja && hoja.getLastRow() > 1) {
      var vals = Utl_leerBloque_(hoja);
      for (var i = 1; i < vals.length; i++) {
        var k = Utl_texto_(vals[i][0]);
        if (!k) continue;
        // RESPONSABLE_<SECTOR> (legacy 1 correo / sector) pasó al panel acumulable
        // de la sección CORREOS_RESPONSABLES: aquí se ocultan para no editarlos
        // como texto plano y duplicar el mantenimiento (#13 → DEC-039).
        if (/^RESPONSABLE_(NARANJO|AMARILLO|VERDE)$/.test(k)) continue;
        var esSecreta = Config_esSecreto_(k);
        filas.push({ clave: k, valor: Config_valorPublico_(k, vals[i][1]),
                     valorPresente: Utl_texto_(vals[i][1]) ? true : false,
                     descripcion: Utl_texto_(vals[i][2]),
                     protegida: Config_estaProtegida_(k) || esSecreta,
                     secreta: esSecreta,
                     seccion: Config_seccionDe_(k),
                     tipo: Config_tipoDe_(k),
                     opciones: Config_opcionesDe_(k) });
      }
    }
    return { ok: true, config: filas, version: ECICEP.VERSION,
             secciones: ['ESTRATIFICACION', 'CORREOS_RESPONSABLES', 'COMUNES', 'ADMINISTRADOR', 'OTRAS'],
             hojaOculta: hoja ? hoja.isSheetHidden() : false };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: guarda el valor de una clave NO protegida (con validación). */
function api_configGuardar_(clave, valor, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var k = Utl_texto_(clave).trim();
    if (!k) return { ok: false, motivo: 'CLAVE_VACIA' };
    if (Config_estaProtegida_(k) || Config_esSecreto_(k)) return { ok: false, motivo: 'CLAVE_PROTEGIDA: ' + k };
    var v = String(valor == null ? '' : valor);
    var problema = Config_validarValor_(k, v);
    if (problema) return { ok: false, motivo: 'Valor inválido (' + k + '): ' + problema };
    _config_set_(k, v);
    Modelo_invalidarLecturas_();
    Log_info_('Config', 'guardar', k);
    Log_flush_();
    return { ok: true };
  } catch (e) {
    Log_error_('Config', 'guardar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: agrega una clave nueva (no puede duplicar). */
function api_configAgregar_(clave, valor, descripcion, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var k = Utl_texto_(clave).trim();
    if (!k) return { ok: false, motivo: 'CLAVE_VACIA' };
    if (Config_estaProtegida_(k) || Config_esSecreto_(k)) return { ok: false, motivo: 'CLAVE_PROTEGIDA: ' + k };
    var v = String(valor == null ? '' : valor);
    var problema = Config_validarValor_(k, v);
    if (problema) return { ok: false, motivo: 'Valor inválido (' + k + '): ' + problema };
    var hoja = Modelo_hoja_(HOJAS.CONFIG);
    var duplicada = false;
    if (hoja && hoja.getLastRow() > 1) {
      var vals = Utl_leerBloque_(hoja);
      for (var i = 1; i < vals.length; i++) if (Utl_texto_(vals[i][0]) === k) { duplicada = true; break; }
    }
    if (duplicada) return { ok: false, motivo: 'CLAVE_DUPLICADA: ' + k };
    // Alta única: clave, valor y descripción van en el mismo setValues de
    // _config_set_ (evita getLastRow + setValue de la descripción).
    _config_set_(k, v, Utl_texto_(descripcion));
    Modelo_invalidarLecturas_();
    Log_info_('Config', 'agregar', k);
    Log_flush_();
    return { ok: true };
  } catch (e) {
    Log_error_('Config', 'agregar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: elimina una clave NO protegida de CONFIG. */
function api_configEliminar_(clave, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var k = Utl_texto_(clave).trim();
    if (!k) return { ok: false, motivo: 'CLAVE_VACIA' };
    if (Config_estaProtegida_(k)) return { ok: false, motivo: 'CLAVE_PROTEGIDA: ' + k };
    var hoja = Modelo_hoja_(HOJAS.CONFIG);
    var eliminada = false;
    if (hoja && hoja.getLastRow() > 1) {
      var vals = Utl_leerBloque_(hoja);
      for (var i = 1; i < vals.length; i++) {
        if (Utl_texto_(vals[i][0]) === k) { hoja.deleteRow(i + 1); eliminada = true; break; }
      }
    }
    Modelo_invalidarLecturas_();
    Log_info_('Config', 'eliminar', k + (eliminada ? '' : ' (no encontrada)'));
    Log_flush_();
    return { ok: true, eliminada: eliminada };
  } catch (e) {
    Log_error_('Config', 'eliminar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/* ---------------------------------------------------------------------------
 * Responsables por sector (ACUMULABLES, DEC-039)
 *   Hoja oculta RESPONSABLES: SECTOR | CODIGO_RESPONSABLE | NOMBRE | CORREO | ACTIVO
 *   - api_responsablesListar_      → lectura + diagnóstico (dry-run, NO escribe)
 *   - api_responsablesGuardarSector_ → reescritura atómica validada de un sector
 * ------------------------------------------------------------------------- */

/** Asegura que la hoja RESPONSABLES exista (la crea con encabezados si falta). */
function _responsables_asegurarHoja_() {
  var ss = Modelo_ss_();
  var hoja = ss.getSheetByName(HOJAS.RESPONSABLES);
  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.RESPONSABLES);
    Utl_escribirBloque_(hoja, 1, 1, [COLUMNAS_RESPONSABLES]);
  }
  return hoja;
}

/** Lee todas las asociaciones canónicas de RESPONSABLES (sin tocar catálogo). */
function _responsables_leer_() {
  var hoja = Modelo_ss_().getSheetByName(HOJAS.RESPONSABLES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return Responsables_mapear_(Utl_leerBloque_(hoja));
}

/** Lee los correos legacy RESPONSABLE_<SECTOR> de CONFIG → {SEC:'correo'}. */
function _responsables_leerLegacy_() {
  var hoja = Modelo_hoja_(HOJAS.CONFIG);
  var legacy = {};
  if (!hoja || hoja.getLastRow() < 2) return legacy;
  Utl_leerBloque_(hoja).forEach(function (r) {
    var k = Utl_texto_(r[0]);
    if (/^RESPONSABLE_(NARANJO|AMARILLO|VERDE)$/.test(k))
      legacy[k.replace('RESPONSABLE_', '')] = Utl_texto_(r[1]).trim();
  });
  return legacy;
}

/** Reescritura atómica de toda la hoja RESPONSABLES (ya validada). */
function _responsables_escribirTodo_(lista) {
  var hoja = _responsables_asegurarHoja_();
  if (hoja.getLastRow() > 1)
    hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS_RESPONSABLES.length).clear();
  if (lista.length) {
    var filas = lista.map(function (r) {
      return [Utl_texto_(r.sector).toUpperCase(), r.codigo, r.nombre, r.correo, r.activo !== false];
    });
    Utl_escribirBloque_(hoja, 2, 1, filas);
  }
  Modelo_invalidarLecturas_();
}

/** Endpoint: lectura + diagnóstico/dry-run de responsables (NO modifica datos).
 *  No carga PACIENTES/EVENTOS: solo la hoja RESPONSABLES, el catálogo
 *  PROFESIONALES y las claves legacy de CONFIG. */
function api_responsablesListar_(token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var lista = _responsables_leer_();
    var profesionales = Profesionales_catalogo_();
    var legacy = _responsables_leerLegacy_();
    var diagnostico = Responsables_diagnostico_(lista, profesionales, legacy);
    return { ok: true, lista: lista, profesionales: profesionales,
             sectores: SECTORES_RESPONSABLES, legacy: legacy, diagnostico: diagnostico };
  } catch (e) {
    Log_error_('Responsables', 'listar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: guarda de forma atómica y validada TODAS las asociaciones de un
 *  sector. filas = [{codigo, nombre, correo, activo}] (reemplazan las del
 *  sector). Eliminar una asociación aquí NO elimina al profesional del catálogo
 *  PROFESIONALES. No sobreescribe otros sectores. */
function api_responsablesGuardarSector_(sector, filas, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var sec = Utl_texto_(sector).toUpperCase();
    var profesionales = Profesionales_catalogo_();
    var val = Responsables_validarSector_(sec, filas, profesionales);
    if (!val.ok) return { ok: false, errores: val.errores };
    var resto = _responsables_leer_().filter(function (r) { return r.sector !== sec; });
    var nuevas = (filas || []).map(function (f) {
      return { sector: sec, codigo: Utl_texto_(f.codigo).trim().toUpperCase(),
               nombre: Utl_texto_(f.nombre).trim(), correo: Utl_texto_(f.correo).trim(),
               activo: f.activo !== false };
    });
    _responsables_escribirTodo_(resto.concat(nuevas));
    Log_info_('Responsables', 'guardarSector', sec + ' → ' + nuevas.length +
      (val.inactivos.length ? ' (inactivos catálogo: ' + val.inactivos.join(',') + ')' : ''));
    Log_flush_();
    return { ok: true, cantidad: nuevas.length, inactivos: val.inactivos };
  } catch (e) {
    Log_error_('Responsables', 'guardarSector', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Navegación a hoja por nombre, con whitelist del diseño del libro.
 *  CONFIG queda EXCLUIDA: se administra solo vía el diálogo (menú/función). */
function api_irA_(nombreHoja) {
  try {
    var permitidas = {};
    MODELO_DISENO.forEach(function (d) { permitidas[d.nombre] = true; });
    var nombre = Utl_texto_(nombreHoja).trim();
    if (!permitidas[nombre] || nombre === HOJAS.CONFIG)
      return { ok: false, motivo: 'HOJA_NO_PERMITIDA' };
    var h = Modelo_hoja_(nombre);
    if (!h) return { ok: false, motivo: 'HOJA_NO_EXISTE' };
    if (h.isSheetHidden()) h.showSheet();
    Modelo_ss_().setActiveSheet(h);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Zona horaria del script cacheada por invocación (getScriptTimeZone() es
 *  un RPC; cachear la evita en maps masivos sobre pacientes/eventos).
 *  Mismo patrón que _MEMO_HOJAS y _UI_CACHE. */
var _TZ_CACHE = '';
function _UI_tz_() {
  if (!_TZ_CACHE && typeof Session !== 'undefined' && Session.getScriptTimeZone) {
    try { _TZ_CACHE = Session.getScriptTimeZone(); } catch (e) { _TZ_CACHE = 'America/Santiago'; }
  }
  return _TZ_CACHE;
}

/** Fecha → 'YYYY-MM-DD' en zona horaria del proyecto (nunca UTC por defecto).
 *  Acepta tz explícito (el del llamador) para evitar reconsultar por fila. */
function _ui_isoFecha_(v, tz) {
  var t = tz || _UI_tz_();
  if (v instanceof Date) return Utilities.formatDate(v, t, 'yyyy-MM-dd');
  return Utl_texto_(v).slice(0, 10);
}

/** CONFIG de controles en UNA lectura de CONFIG: {freq, aviso}.
 *  Antes cada endpoint leía CONFIG 2 veces: Control_leerFrecuencia_() + el
 *  barrido de AVISO_CONTROL_DIAS. Sin caché módulo: la administración puede
 *  escribir CONFIG en la misma sesión. Fallback idéntico a la versión doble
 *  (frecuencia por defecto y aviso=7 cuando CONFIG no existe o no define). */
var _CONTROL_CAMPOS_PACIENTES = ['ID_INTERNO', 'NOMBRE', 'RUT', 'SECTOR',
  'ESTRATIFICACION', 'ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO', 'FECHA_NACIMIENTO', 'PROXIMO_CONTROL'];
function _UI_controlConfig_() {
  var aviso = 7, bloque = [];
  try {
    var hC = Modelo_hoja_(HOJAS.CONFIG);
    if (hC && hC.getLastRow() > 1) bloque = Utl_leerBloque_(hC);
  } catch (e) {}
  var freq = Control_frecuenciaConfig_(bloque);
  if (bloque.length > 1) {
    bloque.slice(1).forEach(function (f) {
      if (Utl_texto_(f[0]) === 'AVISO_CONTROL_DIAS') aviso = parseInt(f[1], 10) || 7;
    });
  }
  return { freq: freq, aviso: aviso };
}

/* ---------------------- Panel de Control: controles por persona ---------------------- */

/** Endpoint: consulta "Controles por persona" paginada.
 *  Filtros sobre paciente (sector + término por ID/RUT/nombre) + estados de
 *  vigencia (opts.estados / opts.pendientes) y luego límite.
 *  @param {Object} [opts] — {sector, termino, estados, pendientes, inicio, limite}
 *  @returns {{ok:boolean, filas:Array, total:number, desde:number, hasta:number,
 *             limite:number, sectores:Array, fechaIso:string}} */
function api_controlPanel_(opts, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var p = opts || {};
    if (typeof p === 'string') p = { sector: p }; // compat con firma antigua
    var tz = _UI_tz_();
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var pacientes = Modelo_leerPacientesCampos_(_CONTROL_CAMPOS_PACIENTES);
    var cfg = _UI_controlConfig_();
    var freq = cfg.freq;
    var aviso = cfg.aviso;
    var res = Control_consultarControles_(pacientes, freq, hoyIso, p, aviso);
    return {
      ok: true,
      filas: res.filas,
      total: res.total,
      desde: res.desde,
      hasta: res.hasta,
      limite: res.limite,
      sectores: res.sectores,
      fechaIso: hoyIso
    };
  } catch (e) {
    Log_error_('PanelControl', 'listar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** LOCK-INTERNO (v0.10.5 §19/§20): registra CONTROL/SEGUIMIENTO desde Panel con
 *  idempotencia por operacionId. El FUENTE transporta UI_PANEL_CONTROL|<opId>;
 *  un reintento con el MISMO opId encuentra el evento ya creado y reusa. La
 *  agenda (PRÓXIMO_CONTROL) sigue siendo manual: nunca se toca aquí. */
function Control_registrarDesdePanel_(idInterno, tipo, fechaIso, operacionId) {
  var fuente = 'UI_PANEL_CONTROL' + (operacionId ? '|' + operacionId : '');
  var objetivo = Modelo_buscarPaciente_(idInterno);
  var proximo = (objetivo && objetivo.obj) ? (objetivo.obj.PROXIMO_CONTROL || '') : '';
  var previo = Eventos_buscarPorFuente_(fuente);
  if (previo && previo.idEvento) {
    return { ok: true, reusado: true, proximo: proximo, evento: { id: previo.idEvento, tipo: tipo, fecha: fechaIso } };
  }
  var r = Eventos_registrarPaciente_({
    idInterno: idInterno,
    tipoEvento: tipo,
    fecha: fechaIso,
    profesional: '',
    descripcion: tipo === 'CONTROL' ? 'Control registrado desde Panel' : 'Seguimiento registrado desde Panel',
    observaciones: '',
    fuente: fuente
  }, { fuenteTransporte: 'api_controlActualizarUltimo_' });
  if (r && r.ok === false) return r;
  return {
    ok: true,
    reusado: false,
    proximo: proximo,
    evento: (r && r.evento) ? r.evento : { tipo: tipo, fecha: fechaIso }
  };
}

/** Endpoint: actualiza ÚLTIMO CONTROL / ÚLTIMO SEGUIMIENTO de una persona y
 *  conserva PRÓXIMO_CONTROL: la agenda se edita manualmente.
 *  Además, crea el EVENTO correspondiente (fuente de verdad única).
 *  Serializado (Ecicep_conLock_) e idempotente por operacionId (v0.10.5 §19/§20):
 *  tras guardar, un fallo de vista derivada NO devuelve error (§23). */
function api_controlActualizarUltimo_(idInterno, tipo, fechaIso, token, operacionId) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var tipoUp = Utl_texto_(tipo).toUpperCase();
    if (tipoUp !== 'CONTROL' && tipoUp !== 'SEGUIMIENTO') return { ok: false, motivo: 'TIPO_INVALIDO' };
    var nf = Norm_normalizarFecha_(fechaIso);
    if (nf.estado !== 'VALIDA') return { ok: false, motivo: 'FECHA_INVALIDA' };
    return Ecicep_conLock_(function () {
      return Control_registrarDesdePanel_(idInterno, tipoUp, nf.iso, operacionId);
    });
  } catch (e) {
    Log_error_('PanelControl', 'actualizarUltimo', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// API UNIFICADA — Actualización de campos de paciente
// ---------------------------------------------------------------------------

/** Campos que el usuario puede editar directamente. */
var _CAMPOS_EDITABLES_PACIENTE = [
  'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS',
  'SECTOR', 'ESTRATIFICACION', 'ESTADO', 'DUPLA_INGRESO',
  'PROFESIONAL_SEGUIMIENTO', 'PREINGRESO', 'FECHA_INGRESO',
  'OBSERVACIONES', 'CONDICIONES', 'OTRAS_PATOLOGIAS',
  'PROXIMO_CONTROL', 'COMPOSICION_CONTROL', 'SALUD_MENTAL'
];

/**
 * API unificada para actualizar campos editables de un paciente.
 * Usada por: formulario web (ACTUALIZAR_DATOS), ficha de paciente,
 * y cualquier otra interfaz que necesite modificar datos.
 *
 * @param {string} idInterno ID_INTERNO del paciente
 * @param {Object} campos Campos a actualizar { CAMPO: valor, ... }
 * @param {string} [token] Token de autorización (opcional)
 * @returns {{ ok: boolean, motivo?: string, paciente?: Object }}
 */
function api_actualizarPaciente_(idInterno, campos, token) {
  try {
    if (typeof WebApp_autorizarBuscador_ === 'function' && !WebApp_autorizarBuscador_(token)) {
      return { ok: false, motivo: 'NO_AUTORIZADO' };
    }
    // Delegación al dominio (31_Ficha): SECTOR = EVENTO CAMBIO_SECTOR;
    // no-op (SIN_CAMBIOS) cuando el sector no cambia (§21, OkV-c3).
    return Paciente_aplicarCampos_(idInterno, campos, { fuente: 'UI_FICHA' });
  } catch (e) {
    Log_error_('Paciente', 'actualizar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Campos mínimos del Diagnóstico de control: los que consumen
 *  Control_analizar_, Control_filasPanel_ y el barrido de desalineados
 *  (= _CONTROL_CAMPOS_PACIENTES + PROXIMO_CONTROL). */
var _DIAGNOSTICO_CAMPOS_PACIENTES = _CONTROL_CAMPOS_PACIENTES.slice();
/** Campos mínimos del análisis de duplicados Amarillo (FUENTE + entidad + fecha). */
var _DIAGNOSTICO_CAMPOS_EVENTOS_AMARILLO = ['ID_INTERNO', 'TIPO_EVENTO', 'FECHA_EVENTO', 'FUENTE', 'NOMBRE', 'SECTOR'];

/** Diagnóstico integral del modelo clínico de control (dry-run por defecto).
 *  NO modifica datos cuando dryRun=true (default). Devuelve métricas reales,
 *  alertas de PROXIMO_CONTROL, estado del sector Amarillo y acciones sugeridas. */
function api_diagnosticoControl_(dryRun, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var tz = _UI_tz_();
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var pacientes = Modelo_leerPacientesCampos_(_DIAGNOSTICO_CAMPOS_PACIENTES);
    var cfg = _UI_controlConfig_();
    var freq = cfg.freq;
    var aviso = cfg.aviso;
    var anal = Control_analizar_(pacientes, freq, hoyIso, aviso);
    var panel = Control_filasPanel_(pacientes, freq, hoyIso, aviso);

    var inconsistentes = [];
    panel.filas.forEach(function (f) {
      if (!f.ultimoControl) return;
      if (f.estado === 'SIN_FECHA' && !f.proximo) {
        inconsistentes.push(f.idInterno + ': con último control pero sin próxima atención agendada');
      }
    });

    // La fecha agendada manualmente no tiene que coincidir con una frecuencia.
    var desalineados = 0, ejemplosDes = [];

    var dedupSr = null;
    try {
      var eventoAmarillo = Modelo_leerEventosCampos_(_DIAGNOSTICO_CAMPOS_EVENTOS_AMARILLO).filter(function (e) {
        return Utl_texto_(e.SECTOR).toUpperCase() === 'AMARILLO';
      });
      dedupSr = Amarillo_analizarDuplicados_(eventoAmarillo);
    } catch (eD) {}

    /* Acciones sugeridas (solo lectura, no se ejecutan aquí) */
    var acciones = [];
    var m = anal.metricas;
    if (m.sinUltimoControl > 0) acciones.push('Registrar últimos controles de ' + m.sinUltimoControl + ' persona(s) sin último control.');
    if (m.vencidos > 0) acciones.push(m.vencidos + ' control(es) vencidos: priorizar gestión por sector.');
    if (m.sinFecha > 0) acciones.push('Agendar manualmente la próxima atención desde Captura o ficha.');

    if (dedupSr && dedupSr.gruposDuplicados > 0) acciones.push(dedupSr.gruposDuplicados + ' grupo(s) de duplicados en eventos Amarillo — revisar dedup.');
    if (!acciones.length) acciones.push('Modelo clínico de control consistente: sin acciones pendientes.');

    if (dryRun === false) {
      /* Aplicativo: corrige PROXIMO_CONTROL derivado (idempotente). */
      var res = Control_recalcularTodos_();
      return { ok: true, dryRun: false, aplicado: res.cambios,
               resumen: res, ocasiones: acciones, fechaIso: hoyIso,
               metricas: m, porSector: anal.porSector, dedup: dedupSr ? {
                 analizados: dedupSr.analizados, gruposDuplicados: dedupSr.gruposDuplicados,
                 eliminar: dedupSr.eliminar } : null };
    }

    return { ok: true, dryRun: true, metricas: m, porSector: anal.porSector,
             inconsistentes: inconsistentes, desalineados: desalineados,
             ejemplosDesalineados: ejemplosDes, dedup: dedupSr ? {
               analizados: dedupSr.analizados, gruposDuplicados: dedupSr.gruposDuplicados,
               eliminar: dedupSr.eliminar } : null,
             acciones: acciones, frecuencia: freq, fechaIso: hoyIso };
  } catch (e) {
    Log_error_('Diagnostico', 'control', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/**
 * Endpoint dashboard: UNA sola llamada con todo lo necesario para que el
 * cliente filtre localmente y la UI reaccione instantánea. Payload mínimo
 * por fila; sin datos derivados precalculados (#25: se computan en cliente).
 */
function api_dashboardDatos_(token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var tz = _UI_tz_();
    var pacientes = Modelo_leerPacientesCampos_(
      ['ID_INTERNO', 'SECTOR', 'ESTRATIFICACION', 'REQUIERE_REVISION', 'CONDICIONES', 'FECHA_INGRESO', 'PROXIMO_CONTROL'])
      .filter(function (p) { return Utl_texto_(p.ID_INTERNO).trim() !== ''; })
      .map(function (p) {
        return { sector: Utl_texto_(p.SECTOR), est: Utl_texto_(p.ESTRATIFICACION),
                 rev: (p.REQUIERE_REVISION === true || p.REQUIERE_REVISION === 'TRUE'),
                 cond: Utl_texto_(p.CONDICIONES), fi: _ui_isoFecha_(p.FECHA_INGRESO, tz),
                 pc: _ui_isoFecha_(p.PROXIMO_CONTROL, tz) };
      });
    var eventos = Modelo_leerEventosCampos_(['TIPO_EVENTO', 'SECTOR', 'FECHA_EVENTO'])
      .map(function (e) {
        return { tipo: Utl_texto_(e.TIPO_EVENTO), sector: Utl_texto_(e.SECTOR),
                 f: _ui_isoFecha_(e.FECHA_EVENTO, tz) };
      });
    var catalogo = CATALOGO_CONDICIONES_ECICEP.filter(function (c) { return c.ACTIVA; })
      .map(function (c) { return { codigo: c.CODIGO, nombre: c.NOMBRE_CANONICO }; });
    return { ok: true, pacientes: pacientes, eventos: eventos, catalogo: catalogo,
             generadoEn: _ui_isoFecha_(new Date(), tz) };
  } catch (e) {
    Log_error_('Dashboard', 'api_dashboardDatos_', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint vista de trabajo REM: calcula el informe AL VUELO (modo MES o
 *  GENERAL) sin leer ni crear la hoja REM_SALIDA. Solo lectura de PACIENTES y
 *  EVENTOS; 100% serializable. Modo 'MES' → Bloque A + censo con indicadores
 *  del mes; 'GENERAL' → censo histórico del sector. `actividad` restringe el
 *  censo a pacientes con al menos un evento en el período ('' = todos). */
function api_remVista_(anio, mes, sector, modo, actividad, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    anio = Number(anio); mes = Number(mes);
    if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
    var filtro = Rem_bucketSector_(Utl_texto_(sector).trim() === '' ? 'todos' : sector);
    var datos = _rem9_datos_(anio, mes, filtro);
    var v = Rem9_armarVistaDatos_(datos, {
      anio: anio, mes: mes, sector: filtro,
      modo: Utl_texto_(modo).toUpperCase() === 'GENERAL' ? 'GENERAL' : 'MES',
      actividad: (actividad === true || actividad === 1 || actividad === '1' || actividad === 'true')
    });
    Log_info_('REM', 'vista', v.meta.modo + ' · ' + filtro + ' · pacientes=' + v.meta.pacientes +
             ' · atenciones=' + v.meta.atenciones);
    Log_flush_();
    return { ok: true, tablas: v.tablas, notas: v.notas, meta: v.meta };
  } catch (e) {
    Log_error_('REM', 'vista', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint sidebar: búsqueda por RUT exacto o nombre (no agresiva). */
/** Endpoint sidebar: búsqueda de pacientes.
 *  Contrato común RPC (v0.10.5): distingue "sin resultados" ({ok:true,filas:[]})
 *  de "la RPC falló" ({ok:false,codigo,motivo,filas:[]}). */
function api_buscar_(termino, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) {
      return { ok: false, codigo: 'ACCESO_DENEGADO', motivo: 'ACCESO_DENEGADO', filas: [] };
    }
    var filas = Bus_buscarPacientes_(
      Modelo_leerPacientesCampos_(['ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'ESTADO', 'ESTRATIFICACION']),
      termino, 25).map(function (p) {
      return { id: p.ID_INTERNO, rut: p.RUT, nombre: p.NOMBRE,
               sector: p.SECTOR, estado: p.ESTADO, estrat: p.ESTRATIFICACION };
    });
    return { ok: true, filas: filas };
  } catch (e) {
    Log_error_('Buscar', 'api_buscar_', e && e.message ? e.message : String(e));
    return { ok: false, codigo: 'BUSQUEDA_FALLO', motivo: e && e.message ? e.message : String(e), filas: [] };
  }
}

/** Endpoint sidebar: ficha consolidada + historial desde EVENTOS.
 *  Contrato: NUNCA retorna null/undefined. Siempre retorna {ok:true|false,...},
 *  con error unificado en {ok:false, codigo, motivo}. */
function api_ficha_(idInterno, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, codigo: 'ACCESO_DENEGADO', motivo: 'ACCESO_DENEGADO' };
    var r = Ficha_construir_(idInterno, { incluirIngresoPendiente: true });
    if (r && r.ok === false) {
      return {
        ok: false,
        codigo: Utl_texto_(r.code || 'FICHA_FALLO'),
        motivo: Utl_texto_(r.message || r.motivo || 'FICHA_FALLO')
      };
    }
    return r;
  } catch (e) {
    return {
      ok: false,
      codigo: 'FICHA_FALLO',
      motivo: e && e.message ? e.message : String(e)
    };
  }
}

/**
 * Endpoint ingresos pendientes (módulo ficha 2.0): listado paginado con
 * filtros sector/término/estado. Reutiliza el pipeline de staging existente
 * (Ingresos_listarPendientes_) — nunca una segunda normalización.
 */
function api_ingresosPendientes_(opciones, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var r = Ingresos_listarPendientes_(opciones || {});
    return { ok: true, filas: r.filas, total: r.total, inicio: r.inicio, limite: r.limite, conteos: r.conteos };
  } catch (e) {
    Log_error_('Ingresos', 'pendientes', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/**
 * Endpoint detalle de un ingreso pendiente (pre-ficha): UNA lectura acotada a
 * la fila pedida, sin escanear la hoja completa.
 */
function api_ingresoDetalle_(nombreHoja, filaFisica, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    return Ingresos_detallePendiente_(nombreHoja, filaFisica);
  } catch (e) {
    Log_error_('Ingresos', 'detalle', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/**
 * Endpoint incorporar un ingreso pendiente (ficha 2.0): procesa SOLO esa fila
 * vía el pipeline único (INGRESO → PACIENTES → EVENTOS → vistas SECTOR_*).
 * Idempotente y con exclusión mutua (Ecicep_conLock_): el 2º clic obtiene
 * resultado null (motivo 'SIN_PENDIENTE') sin duplicar nada.
 */
function api_ingresoIncorporar_(nombreHoja, filaFisica, confirmarNuevo, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    return Ecicep_conLock_(function () {
      return Ingresos_procesarFila_(nombreHoja, filaFisica, { confirmarNuevo: confirmarNuevo === true });
    });
  } catch (e) {
    Log_error_('Ingresos', 'incorporar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/**
 * Endpoint incorporación MASIVA de los ingresos pendientes VÁLIDOS (v0.10.7).
 * Un solo pipeline (Ingresos_incorporarValidos_ → Ingresos_procesarTodasLasHojas_)
 * bajo un solo lock: NUNCA N RPC desde el cliente. `opciones.sector` acota a
 * las hojas INGRESO_* de ese sector. Devuelve un resumen estructurado (no
 * texto) para pintar el resultado real de cada fila ("qué pasó con cada fila").
 */
function api_ingresosIncorporarValidos_(opciones, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    return Ecicep_conLock_(function () {
      var salida = Ingresos_incorporarValidos_(opciones || {});
      return {
        ok: true,
        resumen: salida.resumen || {},
        resultados: salida.resultados || []
      };
    });
  } catch (e) {
    Log_error_('Ingresos', 'incorporarValidos', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/**
 * Endpoint guardado OPTIMISTA de la ficha (concurrencia, #76/#77):
 * cambios = {CAMPO: {anterior, valor}}. Valida contra el valor actual antes
 * de escribir; SECTOR se descompone hacia CAMBIO_SECTOR. Lock de exclusión
 * mutua para las operaciones compuestas.
 */
function api_fichaGuardarCambios_(idInterno, cambios, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    return Ecicep_conLock_(function () {
      return Ficha_guardarCambios_(idInterno, cambios);
    });
  } catch (e) {
    Log_error_('Ficha', 'guardarCambios', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint sidebar: registra un evento para un paciente existente y
 *  sincroniza la caché de estado vigente en PACIENTES.
 *  v0.10.5 §21: serializado (Ecicep_conLock_) e idempotente — si el payload
 *  trae operacionId, FUENTE=fuente|operacionId y un retry con el mismo ID
 *  reusa el evento ya creado en lugar de duplicar. */
function api_registrarEvento_(payload, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    payload = payload || {};
    var opId = payload.operacionId;
    if (opId) {
      var fu = Utl_texto_(payload.fuente || 'UI_FICHA');
      if (fu.indexOf(opId) === -1) payload.fuente = fu + '|' + opId;
    }
    return Ecicep_conLock_(function () {
      if (opId) {
        var previo = Eventos_buscarPorFuente_(payload.fuente);
        if (previo && previo.idEvento) {
          return { ok: true, reusado: true, evento: { id: previo.idEvento, tipo: payload.tipoEvento, fecha: payload.fecha } };
        }
      }
      return Eventos_registrarPaciente_(payload, { fuenteTransporte: 'api_registrarEvento_' });
    });
  } catch (e) {
    Log_error_('Ficha', 'registrarEvento', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint sidebar: lista casos ABIERTOS con comparación origen vs candidato. */
/** GAS: índice de columnas de CONFLICTOS por encabezado (evita magic numbers). */
function Revision_indiceColumnas_(encabezados) {
  var idx = {};
  (encabezados || []).forEach(function (h, i) { idx[Utl_claveAlnum_(h)] = i; });
  return idx;
}

/** Endpoint cola de revisión.
 *  Contrato común RPC (v0.10.5): distingue "cola vacía" ({ok:true,casos:[],metricas:{}})
 *  de "la RPC falló" ({ok:false,codigo,motivo,casos:[],metricas:{}}).
 *  Columnas de CONFLICTOS resueltas por encabezado (no f[5]/f[6]/f[8]/f[9]). */
function api_revisionListar_(token) {
  var metricasVacias = { abiertos: 0, resueltos: 0, esMismo: 0, esOtro: 0, pendientes: 0 };
  try {
    if (!WebApp_autorizarBuscador_(token)) {
      return { ok: false, codigo: 'ACCESO_DENEGADO', motivo: 'ACCESO_DENEGADO', casos: [], metricas: metricasVacias };
    }
    var hoja = Modelo_hoja_(HOJAS.CONFLICTOS);
    if (!hoja || hoja.getLastRow() < 2) return { ok: true, casos: [], metricas: metricasVacias };
    var bloque = Utl_leerBloque_(hoja);
    if (bloque.length < 2) return { ok: true, casos: [], metricas: metricasVacias };
    var idx = Revision_indiceColumnas_(bloque[0]);
    var cEstado = idx['ESTADOREVISION'];
    var cDetalle = idx['DETALLE'];
    var cResuelto = idx['RESUELTOPOR'];
    var cTipo = idx['TIPO'];
    var pacientes = Modelo_leerPacientesCampos_(['ID_INTERNO', 'RUT', 'NOMBRE', 'TELEFONOS', 'SECTOR', 'ESTRATIFICACION', 'ESTADO']);
    var porId = {};
    pacientes.forEach(function (p) { porId[Utl_texto_(p.ID_INTERNO)] = p; });

    var casos = [], metricas = { abiertos: 0, resueltos: 0, esMismo: 0, esOtro: 0, pendientes: 0 };
    bloque.slice(1).forEach(function (f, i) {
      var estado = Utl_texto_(cEstado >= 0 ? f[cEstado] : '');
      if (estado === 'RESUELTO') {
        metricas.resueltos += 1;
        // La decisión (CONFIRMAR_MATCH / RECHAZAR_MATCH) queda en RESUELTO_POR.
        var resueltoPor = Utl_texto_(cResuelto >= 0 ? f[cResuelto] : '');
        metricas[resueltoPor.indexOf('CONFIRMAR') !== -1 ? 'esMismo' : 'esOtro'] += 1;
        return;
      }
      if (estado !== 'ABIERTO') return;
      var datos = null;
      try { datos = JSON.parse(cDetalle >= 0 ? f[cDetalle] : ''); } catch (e) { return; }
      if (!datos) return;
      metricas.abiertos += 1;

      var cand = datos.candidatoId ? porId[datos.candidatoId] : null;
      var vo = datos.valoresOriginales || {};
      casos.push({
        indice: i + 2,
        tipo: cTipo >= 0 ? Utl_texto_(f[cTipo]) : '',
        criterio: datos.criterio || '',
        confianza: datos.confianza || '',
        idProvisional: datos.idProvisional || '',
        origen: {
          nombre: vo.NOMBRE || '', rut: vo.RUT || '', telefono: vo.TELEFONOS || '',
          sector: datos.sectorOrigen || '', estrat: vo.ESTRATIFICACION || '',
          fechaIngreso: vo.FECHA_INGRESO || '',
          fuente: (datos.origen ? datos.origen.hoja : '') + ' fila ' + (datos.origen ? datos.origen.fila : '')
        },
        candidato: cand ? {
          id: cand.ID_INTERNO, nombre: cand.NOMBRE, rut: cand.RUT,
          telefono: cand.TELEFONOS, sector: cand.SECTOR,
          estrat: cand.ESTRATIFICACION, estado: cand.ESTADO
        } : null
      });
    });
    metricas.pendientes = metricas.abiertos;
    return { ok: true, casos: casos, metricas: metricas };
  } catch (e) {
    Log_error_('Revision', 'listar', e && e.message ? e.message : String(e));
    return { ok: false, codigo: 'REVISION_FALLO', motivo: e && e.message ? e.message : String(e), casos: [], metricas: metricasVacias };
  }
}

/** Endpoint sidebar: aplica la decisión humana sobre un caso ABIERTO. */
function api_revisionResolver_(indiceHoja, decision, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    var hoja = Modelo_hoja_(HOJAS.CONFLICTOS);
    if (!hoja) return { ok: false, motivo: 'SIN_HOJA' };
    // Mutación compuesta (PACIENTES + EVENTOS + CONFLICTOS): exclusión mutua.
    return Ecicep_conLock_(function () { return _api_revisionResolverLocked_(indiceHoja, decision); });
  } catch (e) {
    Log_error_('Revision', 'resolver', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** LOCK-INTERNO: cuerpo real de api_revisionResolver_ (nunca lockea). */
function _api_revisionResolverLocked_(indiceHoja, decision) {
    var hoja = Modelo_hoja_(HOJAS.CONFLICTOS);
    // Lectura única del bloque: la fila del caso y (si aplica) las hermanas del
    // mismo origen se derivan del mismo getDataRange (una lectura por acción).
    var bloqueConflictos = Utl_leerBloque_(hoja);
    if (!bloqueConflictos.length) return { ok: false, motivo: 'SIN_DATOS' };
    var idxC = Revision_indiceColumnas_(bloqueConflictos[0]);
    var cEstado = idxC['ESTADOREVISION'];
    var cDetalle = idxC['DETALLE'];
    var cResuelto = idxC['RESUELTOPOR'];
    if (cEstado < 0 || cDetalle < 0 || cResuelto < 0) return { ok: false, motivo: 'COLUMNAS_INVALIDAS' };
    var filaVal = bloqueConflictos[indiceHoja - 1] || [];
    if (Utl_texto_(filaVal[cEstado]) !== 'ABIERTO') return { ok: false, motivo: 'CONFLICTO_YA_RESUELTO' };
    var datos = JSON.parse(filaVal[cDetalle]);
    if (decision !== 'CONFIRMAR_MATCH' && decision !== 'RECHAZAR_MATCH') {
      return { ok: false, motivo: 'DECISION_INVALIDA' };
    }

    var prep = Rev_prepararResolucion_(datos, decision, { nuevoId: Modelo_nuevoIdInterno_ });
    if (!prep.ok) return { ok: false, motivo: prep.motivo };

    var contexto = { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'revision-' + decision.toLowerCase() };
    var destinoId = '';
    if (prep.accion === 'CREAR') {
      Modelo_agregarPacientes_([prep.pacienteNuevo], contexto);
      destinoId = prep.pacienteNuevo.ID_INTERNO;
    } else {
      destinoId = datos.candidatoId;
    }

    // CICLO CERRADO: además del EVENTO de INGRESO, el resolver debe dejar el
    // paciente en el sector de la fila de origen. Antes solo se registraba el
    // evento y PACIENTES.SECTOR quedaba en el sector anterior (fila huérfana).
    // El CAMBIO_SECTOR viaja en la MISMA escritura (lote único) y solo aplica si
    // el destino es un sector operativo y el paciente no está ya en él.
    var destinoSector = Utl_texto_(prep.filaStaging && prep.filaStaging.NORMALIZADO
      ? prep.filaStaging.NORMALIZADO.SECTOR : datos.sectorOrigen).toUpperCase().trim();
    var eventosResolucion = [prep.evento];
    var sectorAnterior = '', sectorNuevo = '', sectorCambio = false;
    var planCambio = null;
    var pacDestino = destinoId ? Modelo_buscarPaciente_(destinoId) : null;
    if (pacDestino && pacDestino.obj && destinoSector &&
        HOJAS_SECTOR.indexOf('SECTOR_' + destinoSector) >= 0 &&
        Utl_texto_(pacDestino.obj.SECTOR).toUpperCase() !== destinoSector) {
      planCambio = Paciente_prepararCambioSector_(pacDestino.obj, destinoSector, {
        fuente: (prep.filaStaging ? Fuentes_fuenteOrigen_(prep.filaStaging) : 'REVISION') + '|CAMBIO_SECTOR',
        fechaEvento: prep.filaStaging
          ? (Control_aIso_(prep.filaStaging.NORMALIZADO.FECHA_INGRESO) ||
             Utl_texto_(prep.filaStaging.NORMALIZADO.FECHA_INGRESO)) : '',
        registradoPor: _ingresosUsuarioActual_()
      });
      if (planCambio && planCambio.ok && !planCambio.sinCambios && planCambio.evento) {
        planCambio.idx = pacDestino.idx;
        eventosResolucion.push(planCambio.evento);
        sectorAnterior = planCambio.anterior;
        sectorNuevo = planCambio.nuevo;
        sectorCambio = true;
      } else planCambio = null;
    }
    // Misma atomicidad compensatoria del pipeline principal: si el append de
    // EVENTOS falla, PACIENTES vuelve a su sector anterior.
    if (planCambio) Ingresos_persistirCambiosSector_([planCambio], false);
    try {
      Modelo_agregarEventos_(eventosResolucion, _ingresosUsuarioActual_(), contexto);
    } catch (errEventos) {
      if (planCambio) {
        try { Ingresos_persistirCambiosSector_([planCambio], true); }
        catch (errRollback) {
          Log_error_('Revision', 'rollback-sector',
            errRollback && errRollback.message ? errRollback.message : String(errRollback));
        }
      }
      throw errEventos;
    }

    // No cerrar el caso como resuelto hasta comprobar evidencia canónica y
    // sector vigente. Una ejecución "Completada" sin estas pruebas no es éxito.
    var fuenteResolucion = prep.filaStaging ? Fuentes_fuenteOrigen_(prep.filaStaging) : '';
    var evidenciaResolucion = fuenteResolucion && Modelo_leerEventosCampos_([
      'ID_EVENTO', 'ID_INTERNO', 'TIPO_EVENTO', 'FUENTE'
    ]).some(function (ev) {
      return Utl_texto_(ev.FUENTE) === fuenteResolucion &&
        Utl_texto_(ev.ID_INTERNO) === destinoId &&
        Utl_texto_(ev.TIPO_EVENTO).toUpperCase() === 'INGRESO';
    });
    var pacienteConfirmado = destinoId ? Modelo_buscarPaciente_(destinoId) : null;
    if (!evidenciaResolucion ||
        !pacienteConfirmado || !pacienteConfirmado.obj ||
        Utl_texto_(pacienteConfirmado.obj.SECTOR).toUpperCase() !== destinoSector) {
      throw new Error('INCORPORACION_REVISION_NO_CONFIRMADA');
    }

    // trazabilidad completa (ESTADO_REVISION + RESUELTO_POR por encabezado)
    var ahora = new Date();
    var celdaEstado = cEstado + 1, celdaResuelto = cResuelto + 1;
    if (Math.abs(cEstado - cResuelto) === 1) {
      var cMin = Math.min(cEstado, cResuelto);
      var par = cEstado < cResuelto
        ? ['RESUELTO', _ingresosUsuarioActual_() + ' · ' + decision + ' · ' + ahora.toISOString() + ' → ' + destinoId]
        : [_ingresosUsuarioActual_() + ' · ' + decision + ' · ' + ahora.toISOString() + ' → ' + destinoId, 'RESUELTO'];
      hoja.getRange(indiceHoja, cMin + 1, 1, 2).setValues([par]);
    } else {
      hoja.getRange(indiceHoja, celdaEstado).setValue('RESUELTO');
      hoja.getRange(indiceHoja, celdaResuelto).setValue(_ingresosUsuarioActual_() + ' · ' + decision + ' · ' + ahora.toISOString() + ' → ' + destinoId);
    }

    // hermanas duplicadas de la MISMA fila origen (idempotencia por origen):
    // se cierran sin reprocesar — la decisión ya se aplicó una sola vez.
    // Escritura por bloques contiguos (regla del proyecto: no celdas en loops).
    var claveOrig = Rev_claveOrigen_(datos);
    var hermanas = 0;
    var filasHermana = [];
    if (claveOrig && bloqueConflictos.length > 1) {
      bloqueConflictos.slice(1).forEach(function (sf, i) {
        var filaAbs = i + 2;
        if (filaAbs === indiceHoja) return;
        if (Utl_texto_(sf[cEstado]) !== 'ABIERTO') return;
        if (Rev_claveOrigenDesdeFila_(sf) !== claveOrig) return;
        filasHermana.push(filaAbs);
        hermanas++;
      });
    }
    if (filasHermana.length) {
      var usuarioRev = _ingresosUsuarioActual_();
      Utl_gruposContiguosFilas_(filasHermana).forEach(function (grupo) {
        var n = grupo.length;
        var traza2 = [];
        for (var i = 0; i < n; i++) {
          traza2.push(['RESUELTO', usuarioRev + ' · ' + decision + ' · ' + ahora.toISOString() +
            ' → ' + destinoId + ' (hermana del mismo origen)']);
        }
        if (Math.abs(cEstado - cResuelto) === 1) {
          var cMin2 = Math.min(cEstado, cResuelto);
          var par2 = cEstado < cResuelto ? traza2 : traza2.map(function (fila) { return [fila[1], fila[0]]; });
          hoja.getRange(grupo[0], cMin2 + 1, n, 2).setValues(par2);
        } else {
          hoja.getRange(grupo[0], celdaEstado, n, 1).setValue('RESUELTO');
          hoja.getRange(grupo[0], celdaResuelto, n, 1).setValue(usuarioRev + ' · ' + decision + ' · ' + ahora.toISOString() +
            ' → ' + destinoId + ' (hermana del mismo origen)');
        }
      });
    }

    // FILA DE ORIGEN: queda INGRESADO en su hoja INGRESO_* para no quedar
    // huérfana (ya resuelta) en la cola de revisión ni en el listado de lote.
    var estadoOrigen = { ok: false, verificadas: 0 };
    if (datos.origen && HOJAS_INGRESO[datos.origen.hoja] && datos.origen.fila) {
      try {
        var resultadoEstadoOrigen = {
          hoja: datos.origen.hoja, filaOrigen: datos.origen.fila,
          estado: 'INGRESADO', nota: 'Ingresado vía cola de revisión (' + decision + ')'
        };
        estadoOrigen = Ingresos_escribirEstados_([resultadoEstadoOrigen]);
      } catch (errEstado) {
        Log_error_('Revision', 'resolver-estado',
          errEstado && errEstado.message ? errEstado.message : String(errEstado));
      }
    }

    // Solo las vistas afectadas (origen y destino): nunca un refresh total.
    var vistasCrudas = [];
    if (sectorCambio && sectorAnterior) vistasCrudas.push(sectorAnterior);
    if (destinoSector) vistasCrudas.push(destinoSector);
    var vistas = vistasCrudas.filter(function (s, i) {
      return HOJAS_SECTOR.indexOf('SECTOR_' + s) >= 0 && vistasCrudas.indexOf(s) === i;
    });
    var advertencias = [];
    var filasOrigenEliminadas = 0;
    try {
      if (vistas.length) Modelo_refrescarVistasSectores_(vistas);
      var verificacionVista = [{ estado: 'INGRESADO', idInterno: destinoId,
        sectorVigente: destinoSector, sectorDestino: destinoSector }];
      Ingresos_confirmarVistas_(verificacionVista);
      if (verificacionVista[0].vistaSectorConfirmada !== true) {
        advertencias.push('VISTA_SECTOR_PENDIENTE');
      } else if (estadoOrigen.ok && estadoOrigen.verificadas === 1 &&
                 datos.origen && HOJAS_INGRESO[datos.origen.hoja] && datos.origen.fila) {
        var limpiezaOrigen = Ingresos_eliminarOrigenConfirmado_([{
          estado: 'INGRESADO', vistaSectorConfirmada: true, estadoIngresoConfirmado: true,
          hoja: datos.origen.hoja, filaOrigen: datos.origen.fila,
          rutOrigen: (datos.valoresOriginales || {}).RUT || ''
        }]);
        filasOrigenEliminadas = limpiezaOrigen.eliminadas || 0;
        if (limpiezaOrigen.fallidas && limpiezaOrigen.fallidas.length) {
          advertencias.push('ORIGEN_ELIMINACION_INCIERTA');
        }
      } else if (!estadoOrigen.ok) {
        advertencias.push('ESTADO_INGRESO_PENDIENTE');
      }
    } catch (errVista) {
      advertencias.push('VISTA_SECTOR_PENDIENTE');
      Log_warning_('Revision', 'refrescar-sector',
        errVista && errVista.message ? errVista.message : String(errVista));
    }
    Log_info_('Revision', decision, prep.accion + ' · caso fila ' + indiceHoja + ' → ' + destinoId +
      (sectorCambio ? ' · ' + sectorAnterior + ' → ' + sectorNuevo : '') +
      (hermanas ? ' · +' + hermanas + ' hermanas del mismo origen' : ''));
    Log_flush_();
    return { ok: true, accion: prep.accion, destinoId: destinoId,
      sectorCambio: sectorCambio, sectorAnterior: sectorAnterior, sectorNuevo: sectorNuevo,
      advertencias: advertencias, filasOrigenEliminadas: filasOrigenEliminadas };
}

/** FASE 4.0 — limpieza segura del dataset ficticio. */
function UI_vaciarDatosPrueba_() {
  var ui = _UI_get_();
  var colecta = Limpieza_colectar_();

  // cuenta pacientes/eventos afectados ANTES de borrar nada
  var ruts = colecta.ruts;
  var pacientes = Modelo_leerPacientes_().filter(function (p) { return Limpieza_esPacienteDePrueba_(p, ruts); });
  var ids = {};
  pacientes.forEach(function (p) { ids[Utl_texto_(p.ID_INTERNO)] = true; });
  var eventos = Modelo_leerEventos_().filter(function (e) {
    return (ids[Utl_texto_(e.ID_INTERNO)] || ruts.indexOf(Utl_texto_(e.RUT).toUpperCase()) !== -1) &&
           Utl_texto_(e.FUENTE).indexOf('HOJA_INGRESO') === 0;
  });

  if (!colecta.totalFilas && !pacientes.length && !eventos.length) {
    ui.alert('No hay datos identificados como prueba. Nada que eliminar.');
    return;
  }
  var resp = ui.alert(
    'LIMPIEZA DE DATOS DE PRUEBA',
    'Se eliminarán únicamente registros identificados como DATOS DE PRUEBA.\n\n' +
      'Filas de ingreso marcadas: ' + colecta.totalFilas + '\n' +
      'Pacientes: ' + pacientes.length + '\n' +
      'Eventos: ' + eventos.length + '\n\n¿Continuar?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var r = Limpieza_ejecutar_(colecta);
  if (r && r.codigo === 'SERVICIO_OCUPADO') {
    Log_info_('UI', 'vaciarDatosPrueba', 'SERVICIO_OCUPADO: no se reescribió nada');
    Log_flush_();
    ui.alert('NO SE REALIZÓ LA LIMPIEZA\n\nOtro operador está escribiendo en este instante ' +
      '(captura en curso). No se borró nada: vuelve a intentarlo en unos segundos.');
    return;
  }
  Log_info_('UI', 'vaciarDatosPrueba', JSON.stringify(r));
  Log_flush_();
  ui.alert(
    'LIMPIEZA COMPLETADA\n\n' +
    'Filas de ingreso eliminadas: ' + r.filasIngreso + '\n' +
    'Pacientes eliminados: ' + r.pacientes + '\n' +
    'Eventos eliminados: ' + r.eventos + '\n\n' +
    'SECTOR_* refrescadas.');
}

// ===========================================================================
// ETAPA 5 — Carga real controlada (análisis + ejecución con gate)
// ===========================================================================

function UI_analisisCarga_() {
  Utl_toast_('info', 'Analizando fuentes reales (no escribe nada)…', 15);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = Fuentes_cargaReal_({ ejecutar: false });
  var res = r.resumen;

  var hojaR = ss.getSheetByName('CARGA_ANALISIS');
  if (!hojaR) hojaR = ss.insertSheet('CARGA_ANALISIS');
  hojaR.clearContents();
  Utl_escribirBloque_(hojaR, 1, 1, [[
    'FUENTE|HOJA','FILA','VALIDACIÓN','RUT','NOMBRE','SECTOR','ESTRAT','GATE','NOTA'
  ]]);
  r.detalle.forEach(function (d, i) {
    Utl_escribirBloque_(hojaR, i + 2, 1, [[
      d.fuenteOrigen || '', d.fila || '', d.estado || '', d.rut || '',
      d.nombre || '', d.sector || '', d.estratificacion || '',
      d.gate || '', d.nota || ''
    ]]);
  });

  Log_info_('UI', 'analisisCarga', JSON.stringify(res));
  Log_flush_();
  ss.setActiveSheet(hojaR);
  var ui = _UI_get_();
  ui.alert(
    'ANÁLISIS DE CARGA — DRY RUN (no escribió nada)\n\n' +
    'Registros pendientes: ' + (res.leidos - (res.yaImportadas || 0)) + '\n\n' +
    Ingresos_resumenTexto_(res) + '\n\n' +
    'Para escribir la carga usa 🚀 EJECUTAR CARGA REAL.');
}

function UI_ejecutarCarga_() {
  var ui = _UI_get_();
  var resp = ui.alert(
    '🚀 EJECUTAR CARGA REAL',
    'Esto escribirá datos REALES en PACIENTES y EVENTOS.\n\n' +
    'Se procesarán únicamente las hojas autorizadas.\n' +
    'Los errores y REQUIERE_REVISION quedan excluidos.\n' +
    'La operación tiene idempotencia (no duplica).\n\n' +
    '¿Confirmas la ejecución?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  Utl_toast_('info', 'Cargando…', 30);

  var r = Fuentes_cargaReal_({ ejecutar: true });
  var res = r.resumen;

  Log_info_('UI', 'ejecutarCarga', JSON.stringify({
    leidos: res.leidos, nuevos: res.nuevos, existentes: res.existentes,
    revision: res.revision, conError: res.conError, eventos: res.eventosCreados
  }));
  Log_flush_();

  var texto = Ingresos_resumenTexto_(res);
  if ((res.revision || 0) > 0) texto += '\n\n⚠ ' + res.revision + ' caso(s) en la Cola de revisión.';
  ui.alert('CARGA COMPLETADA ✓\n\n' + texto);
}

// ===========================================================================
// ETAPA 5-INCIDENTE — Recuperación selectiva
// ===========================================================================

function UI_recuperarInventario_() {
  var ui = _UI_get_();
  var resp = ui.prompt(
    'RECUPERACIÓN — Paso 1: Inventario',
    'Pega el prefijo de fuente a investigar\n(ej: ECICEP NARANJO o PCTS. ECICEP):',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var prefijo = resp.getResponseText().trim();
  if (!prefijo) return;

  var conteo = Recuperar_inventario_(prefijo);
  var hoja = Modelo_ss_().getSheetByName('RECUPERACION');
  if (hoja) Modelo_ss_().setActiveSheet(hoja);
  ui.alert(
    'INVENTARIO GENERADO\n\n' +
    'Pacientes afectados: ' + conteo.pacientes + '\n' +
    'Eventos afectados: ' + conteo.eventos + '\n\n' +
    'Revisa la hoja RECUPERACION.\n' +
    'Si confirmas que TODOS deben eliminarse,\n' +
    'usa ⚠️ Recuperación: ejecutar reversión.');
}

function UI_recuperarEjecutar_() {
  var ui = _UI_get_();
  var resp = ui.prompt(
    '⚠️ REVERSIÓN SELECTIVA',
    'Pega el MISMO prefijo de fuente usado en el inventario:',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var prefijo = resp.getResponseText().trim();
  if (!prefijo) return;

  var conf = ui.alert(
    '⚠️ CONFIRMAR REVERSIÓN',
    'Esto eliminará PERMANENTEMENTE los registros identificados.\n' +
    'Solo se eliminan los del inventario (prefijo: ' + prefijo + ').\n\n' +
    '¿Confirmas?',
    ui.ButtonSet.YES_NO);
  if (conf !== ui.Button.YES) return;

  var r = Recuperar_ejecutar_(prefijo);
  if (r && r.codigo === 'SERVICIO_OCUPADO') {
    ui.alert('NO SE REALIZÓ LA REVERSIÓN\n\nOtro operador está escribiendo en este instante ' +
      '(captura en curso). No se eliminó nada: vuelve a intentarlo en unos segundos.');
    return;
  }
  ui.alert(
    'REVERSIÓN COMPLETADA\n\n' +
    'Pacientes eliminados: ' + r.pacientesEliminados + '\n' +
    'Eventos eliminados: ' + r.eventosEliminados + '\n' +
    'SECTOR_* refrescadas.');
}

// ===========================================================================
// Esquema PACIENTES — migración manual/verificable desde el menú
// ===========================================================================

function UI_migrarEsquemaPacientes_() {
  var ui = _UI_get_();
  try {
    var r = Modelo_asegurarEsquemaPacientes_();
    if (!r.ok) {
      ui.alert('❌ ESQUEMA INCOMPATIBLE\n\n' + r.motivo +
        '\n\nNO se modificó nada.\nRevisar los encabezados de PACIENTES manualmente.');
      return;
    }
    var repar = Modelo_repararCamposTecnicos_();
    if (!r.migrada && repar.reparados === 0 && repar.marcadosRevision === 0) {
      ui.alert('✅ TODO LIMPIO\n\nEsquema alineado (' + Modelo_campos_().length +
        ' columnas) y sin filas con datos inconsistentes.\nNo se requiere ninguna acción.');
      return;
    }
    var msg = '';
    if (r.migrada) {
      msg += '🔧 MIGRACIÓN COMPLETADA\n\nColumnas insertadas: ' + r.insertadas.join(', ') + '\n\n';
    }
    msg += '🧹 LIMPIEZA APLICADA\nFilas reparadas: ' + repar.reparados +
      '\nMarcadas para revisión (FUENTE vacía): ' + repar.marcadosRevision;
    if (repar.sospechosas && repar.sospechosas.length) {
      msg += '\n\n⚠️ Trazabilidad perdida en:\n' + repar.sospechosas.slice(0, 10).map(function (s) {
        return 'Fila ' + s.fila + ' · ' + s.nombre + ' (' + s.rut + ')';
      }).join('\n');
    }
    ui.alert(msg);
  } catch (e) {
    ui.alert('ERROR: ' + (e && e.message ? e.message : String(e)));
  }
}

// ===========================================================================
// Integridad de trazabilidad (FUENTE como contrato)
// ===========================================================================

/** Diagnóstico SOLO LECTURA: detecta FUENTE vacía y cierres indebidos. */
function UI_diagnosticoTrazabilidad_() {
  var ui = _UI_get_();
  try {
    var r = Modelo_diagnosticoTrazabilidad_();
    var msg = '🔎 INTEGRIDAD DE TRAZABILIDAD\n\n' +
      'Total pacientes: ' + r.total + '\n' +
      'OK: ' + r.ok + '\n' +
      'Con FUENTE vacía: ' + r.conFuenteVacia + '\n' +
      'FUENTE vacía + REQUIERE_REVISION=false: ' + r.conFuenteVaciaRevisionFalse + '\n' +
      '(solo reporte — no se corrigió nada)';
    if (r.incompletas.length) {
      msg += '\n\n⚠️ TRAZABILIDAD_INCOMPLETA:\n' + r.incompletas.slice(0, 10).map(function (p) {
        return 'Fila ' + p.fila + ' · ' + p.nombre + ' (' + p.rut + ')' +
          (p.requiereRevision ? '' : ' · ⚠️ cerrada sin origen');
      }).join('\n');
      if (r.incompletas.length > 10) msg += '\n… y ' + (r.incompletas.length - 10) + ' más';
    }
    ui.alert(msg);
  } catch (e) {
    ui.alert('ERROR: ' + (e && e.message ? e.message : String(e)));
  }
}

// ===========================================================================
// REM mensual — la interfaz oficial es el dialog RemGenerador (UI_generarRem_,
// definido junto a los demás openers). Esta sección se conserva vacía a
// propósito: la generación vive en 14_REM.js y la UI en RemGenerador.html.
// ===========================================================================

// ===========================================================================
// ETAPA 8E — Selector de patologías ECICEP
// ===========================================================================

/** Endpoint sidebar: devuelve catálogo + condiciones actuales del paciente. */
function api_patologiasAbrir_(idInterno, token) {
  if (!WebApp_autorizarBuscador_(token)) return { catalogo: [], seleccionadas: [], otrasPatologias: '', error: 'ACCESO_DENEGADO' };
  var catalogo = CATALOGO_CONDICIONES_ECICEP.filter(function (c) { return c.ACTIVA; }).map(function (c) {
    return { codigo: c.CODIGO, nombre: c.NOMBRE_CANONICO, peso: c.PONDERACION };
  });
  var pacientes = Modelo_leerPacientesCampos_(['ID_INTERNO', 'CONDICIONES', 'OTRAS_PATOLOGIAS']);
  var paciente = null;
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto_(pacientes[i].ID_INTERNO) === Utl_texto_(idInterno)) { paciente = pacientes[i]; break; }
  }
  var seleccionadas = paciente && paciente.CONDICIONES ? Utl_texto_(paciente.CONDICIONES).split(';').filter(Boolean) : [];
  var otras = paciente && paciente.OTRAS_PATOLOGIAS ? Utl_texto_(paciente.OTRAS_PATOLOGIAS) : '';
  return { catalogo: catalogo, seleccionadas: seleccionadas, otrasPatologias: otras };
}

/** PURA: valida que los códigos existan en el catálogo y elimina duplicados. */
function Condiciones_validarSeleccion_(codigos, catalogo) {
  var validos = [], invalidos = [];
  var vistos = {};
  (codigos || []).forEach(function (codigo) {
    var limpio = Utl_texto_(codigo).toUpperCase().trim();
    if (!limpio) return;
    if (vistos[limpio]) return;
    vistos[limpio] = true;
    var existe = catalogo.some(function (c) {
      return c.ACTIVA && c.CODIGO.toUpperCase() === limpio;
    });
    if (existe) validos.push(limpio);
    else invalidos.push(limpio);
  });
  return { validos: validos, invalidos: invalidos };
}

/** Endpoint sidebar: valida y guarda las patologías del paciente.
 *  v0.10.5 §22: serializado (Ecicep_conLock_) igual que el resto de mutaciones
 *  compuestas del operador; no crea locks anidados (el dominio nunca lockea). */
function api_patologiasGuardar_(idInterno, codigosSeleccionados, otrasPatologias, token) {
  try {
    if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO' };
    // Delegación al dominio (31_Ficha): validación única + escritura única +
    // recálculo de estratificación + refresco acotado del sector.
    return Ecicep_conLock_(function () {
      return Patologias_guardarPaciente_(idInterno, codigosSeleccionados, otrasPatologias);
    });
  } catch (e) {
    Log_error_('Patologias', 'guardar', e && e.message ? e.message : String(e));
    Log_flush_();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

function _calcularPuntaje_(codigos) {
  var total = 0;
  (codigos || []).forEach(function (codigo) {
    for (var i = 0; i < CATALOGO_CONDICIONES_ECICEP.length; i++) {
      if (CATALOGO_CONDICIONES_ECICEP[i].CODIGO === codigo && CATALOGO_CONDICIONES_ECICEP[i].ACTIVA) {
        total += CATALOGO_CONDICIONES_ECICEP[i].PONDERACION || 1; break;
      }
    }
  });
  return total;
}

// ===========================================================================
// 🧪 Centro de Pruebas — registro declarativo + ejecutor con informe
// ===========================================================================

var PRUEBAS_SISTEMA = [
  { id: 'hojas',        modulo: 'SISTEMA',    nombre: 'Hojas críticas presentes',      fn: '_pruS_hojas_' },
  { id: 'config',       modulo: 'SISTEMA',    nombre: 'CONFIG sembrado',               fn: '_pruS_config_' },
  { id: 'menu',         modulo: 'SISTEMA',    nombre: 'Funciones del menú globales',   fn: '_pruS_menu_' },
  { id: 'plantillas',   modulo: 'INTERFAZ',   nombre: 'Sidebars y dialogs compilables',fn: '_pruS_plantillas_' },
  { id: 'ficha',        modulo: 'INTERFAZ',   nombre: 'Ficha: 5 pestañas y paneles',   fn: '_pruS_ficha_' },
  { id: 'estadisticas', modulo: 'INTERFAZ',   nombre: 'Estadísticas operativa',        fn: '_pruS_estadisticas_' },
  { id: 'validaciones', modulo: 'DATOS',      nombre: 'Validaciones en INGRESO',       fn: '_pruS_validaciones_' },
  { id: 'catalogos',    modulo: 'DATOS',      nombre: 'Catálogo vigencias',            fn: '_pruS_catalogos_' },
  { id: 'formatos',     modulo: 'DATOS',      nombre: 'Formato de fechas PACIENTES',   fn: '_pruS_formatos_' },
  { id: 'protecciones', modulo: 'DATOS',      nombre: 'Protecciones sistema',          fn: '_pruS_protecciones_' },
  { id: 'remDatos',     modulo: 'REM',        nombre: 'REM generado disponible',       fn: '_pruS_remDatos_' },
  { id: 'pdf',          modulo: 'REM',        nombre: 'Exportador PDF',                fn: '_pruS_pdf_' },
  { id: 'traza',        modulo: 'INTEGRIDAD', nombre: 'Trazabilidad FUENTE',           fn: '_pruS_traza_' },
  { id: 'consistencia', modulo: 'INTEGRIDAD', nombre: 'Consistencia entre sectores',   fn: '_pruS_consistencia_' },
  { id: 'calidad',      modulo: 'INTEGRIDAD', nombre: 'Calidad de datos (auditoría)',  fn: '_pruS_calidad_' },
  { id: 'auditoria',    modulo: 'AUDITORIA',  nombre: 'Auditoría v0.8.8 (dry-run)',    fn: '_pruS_auditoria_' }
];

/** Registro para el cliente (checkboxes agrupados por módulo). */
function api_pruebasRegistro_(token) {
  if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO', pruebas: [] };
  return { ok: true, pruebas: PRUEBAS_SISTEMA };
}

/** Ejecuta SOLO las pruebas pedidas (#9). Cada check es inteligente cuando
 *  puede (#11): evalúa funcionamiento real, no solo existencia. Registra en LOG (#10). */
function api_pruebasSistema_(ids, token) {
  if (!WebApp_autorizarBuscador_(token)) return { ok: false, motivo: 'ACCESO_DENEGADO', resultados: [], resumen: { total: 0 } };
  var t0 = Date.now();
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var pedidos = (ids && ids.length) ? ids : PRUEBAS_SISTEMA.map(function (p) { return p.id; });
  var resultados = pedidos.map(function (id) {
    var reg = null;
    PRUEBAS_SISTEMA.forEach(function (p) { if (p.id === id) reg = p; });
    if (!reg) return { id: id, estado: 'ERROR', detalle: 'Prueba desconocida', ms: 0 };
    var t1 = Date.now();
    try {
      var fn = G[reg.fn];
      if (typeof fn !== 'function') throw new Error('función ausente: ' + reg.fn);
      var r = fn() || {};
      r.id = id; r.modulo = reg.modulo; r.nombre = reg.nombre;
      r.ms = Date.now() - t1;
      if (!r.estado) r.estado = 'OK';
      return r;
    } catch (e) {
      return { id: id, modulo: reg.modulo, nombre: reg.nombre, estado: 'ERROR',
               detalle: e && e.message ? e.message : String(e), ms: Date.now() - t1 };
    }
  });
  var contar = function (e) {
    return resultados.filter(function (r) { return r.estado === e; }).length;
  };
  var resumen = { total: resultados.length, ok: contar('OK'), warn: contar('WARN'),
                  error: contar('ERROR'), skip: contar('SKIP') };
  Log_info_('Pruebas', 'ejecutar', JSON.stringify(resumen), null, Date.now() - t0);
  Log_flush_();
  return { ok: true, resultados: resultados, resumen: resumen, duracion: Date.now() - t0 };
}

/* ---- Checks individuales: devuelven {estado:OK|WARN|ERROR|SKIP, detalle} ---- */

function _pruS_hojas_() {
  var crit = ['PACIENTES', 'EVENTOS', 'SECTOR_NARANJO', 'SECTOR_AMARILLO',
              'SECTOR_VERDE', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];
  var faltan = crit.filter(function (n) { return !Modelo_hoja_(n); });
  if (faltan.length) return { estado: 'ERROR',
    detalle: 'Faltan hojas operativas: ' + faltan.join(', ') };

  var problemas = [], okInternas = [];
  MODELO_DISENO.filter(function (d) { return d.oculta; }).forEach(function (d) {
    var h = Modelo_hoja_(d.nombre);
    if (!h) { problemas.push('\u274c ' + d.nombre + ' no existe'); return; }
    if (!h.isSheetHidden()) { problemas.push('\u26a0 ' + d.nombre + ' existe pero est\u00e1 VISIBLE'); }
    else okInternas.push(d.nombre + ' oculta \u2713');
  });
  if (problemas.length) return { estado: 'WARN', detalle: problemas.join(' \u00b7 ') };
  return { estado: 'OK',
           detalle: crit.length + ' operativas · internas OK: ' + okInternas.length };
}
function _pruS_config_() {
  var h = Modelo_hoja_(HOJAS.CONFIG);
  if (!h) return { estado: 'ERROR', detalle: 'Sin hoja CONFIG' };
  var req = ['GENERAL_NOMBRE_SISTEMA', 'GENERAL_INSTITUCION', 'DASHBOARD_TITULO',
             'REM_INCLUIR_INDICADORES', 'PACIENTES_MIN_BUSQUEDA'];
  var valores = {};
  Utl_leerBloque_(h).forEach(function (f) { valores[Utl_texto_(f[0])] = f[1]; });
  var faltan = req.filter(function (k) { return !(k in valores); });
  return faltan.length
    ? { estado: 'ERROR', detalle: 'Faltan claves: ' + faltan.join(', ') }
    : { estado: 'OK', detalle: req.length + ' claves verificadas' };
}
function _pruS_menu_() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var fns = (UICFG_DIALOGOS || []).map(function (d) { return d.opener; });
  var faltan = fns.filter(function (n) { return typeof G[n] !== 'function'; });
  return faltan.length
    ? { estado: 'ERROR', detalle: 'Ausentes: ' + faltan.join(', ') }
    : { estado: 'OK', detalle: fns.length + ' funciones globales' };
}
function _pruS_plantillas_() {
  var errores = [], vistos = {};
  (UICFG_DIALOGOS || []).forEach(function (d) {
    if (vistos[d.plantilla]) return;
    vistos[d.plantilla] = true;
    try {
      var t = HtmlService.createTemplateFromFile(d.plantilla);
      t.modo = 'centro'; t.BUILD = ''; t.ID_INICIAL = '';
      t.TOKEN_ACCESO = ''; t.TOKEN_INVITACION = ''; t.CAPTURA_ACCESO = '';
      t.PORTAL_URL = ''; t.FICHA_URL = ''; t.REM_URL = '';
      t.DASH_URL = ''; t.GENERAR_REM_URL = ''; t.SECCION = '';
      t.QR_URL = ''; t.WEB_APP_URL = ''; t.LINKS = []; t.PAGE_BUILD = '';
      t.evaluate().getContent();
    } catch (e) { errores.push(d.plantilla + ': ' + (e && e.message || e)); }
  });
  return errores.length
    ? { estado: 'ERROR', detalle: errores.join(' · ') }
    : { estado: 'OK', detalle: Object.keys(vistos).length + ' plantillas compilan' };
}
function _pruS_ficha_() {
  try {
    var t = HtmlService.createTemplateFromFile('Sidebar');
    t.modo = 'pacientes'; t.BUILD = ''; t.ID_INICIAL = '';
    t.TOKEN_INVITACION = ''; t.PORTAL_URL = '';
    var cont = t.evaluate().getContent();
    var tabs = (cont.match(/class="tab/g) || []).length;
    var panes = (cont.match(/class="pane/g) || []).length;
    var refs = [], re = /data-pane="([^"]+)"/g, m;
    while ((m = re.exec(cont))) refs.push(m[1]);
    var faltan = refs.filter(function (r) {
      return cont.indexOf('id="' + r + '"') === -1;
    });
    if (tabs === 5 && panes === 5 && refs.length === 5 && faltan.length === 0) {
      return { estado: 'OK', detalle: '5 pestañas y 5 paneles coherentes (la 5ª es Dupla)' };
    }
    return { estado: 'ERROR', detalle: 'tabs=' + tabs + ' panes=' + panes +
             ' refs=' + refs.length + ' sin-panel=' + faltan.join(',') };
  } catch (e) {
    return { estado: 'ERROR', detalle: (e && e.message || String(e)) };
  }
}
function _pruS_estadisticas_() {
  /* Verificación ligera (<1s): estructura legible, no el payload completo.
     El payload completo ya lo ejercita el Panel cada vez que se abre. */
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  if (typeof G.api_dashboardDatos_ !== 'function')
    return { estado: 'ERROR', detalle: 'api_dashboardDatos_ ausente' };
  var hP = Modelo_hoja_(HOJAS.PACIENTES);
  var hE = Modelo_hoja_(HOJAS.EVENTOS);
  if (!hP || !hE) return { estado: 'ERROR', detalle: 'Faltan hojas PACIENTES/EVENTOS' };
  var iniP = Modelo_dataStartRow_(HOJAS.PACIENTES);
  var iniE = Modelo_dataStartRow_(HOJAS.EVENTOS);
  var filasP = Math.max((hP.getLastRow() >= iniP ? hP.getLastRow() - iniP + 1 : 0), 0);
  var filasE = Math.max((hE.getLastRow() >= iniE ? hE.getLastRow() - iniE + 1 : 0), 0);
  if (filasP > 0) {
    var muestra = hP.getRange(iniP, 1, 1, 1).getValue(); // primera celda de datos legible
    if (!muestra && muestra !== '') return { estado: 'WARN', detalle: 'lectura de datos devolvió valor inválido' };
  }
  return { estado: 'OK',
           detalle: 'pacientes=' + filasP + ' · eventos=' + filasE +
                    ' (payload completo verificado por el Panel al abrirse)' };
}
function _pruS_validaciones_() {
  var ss = Modelo_ss_(), total = 0, con = 0, sin = [];
  Object.keys(HOJAS_INGRESO).forEach(function (n) {
    try {
      var h = ss.getSheetByName(n);
      if (!h || h.isSheetHidden()) return;
      total++;
      var col = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
      var ini = Modelo_dataStartRow_(n);
      var hasta = Math.min(Math.max(h.getLastRow(), ini), ini + 28);
      var validaciones = h.getRange(ini, col, hasta - ini + 1, 1).getDataValidations();
      var tiene = validaciones.some(function (v) { return v[0]; });
      if (tiene) con++; else sin.push(n);
    } catch (eI) { sin.push(n + ' (error: ' + (eI && eI.message || eI) + ')'); }
  });
  if (!total) return { estado: 'WARN', detalle: 'sin puertas INGRESO visibles' };
  return con === total
    ? { estado: 'OK', detalle: con + '/' + total + ' puertas validadas' }
    : { estado: 'WARN',
        detalle: con + '/' + total + ' validadas · sin validación: ' + sin.join(', ') +
                 ' — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_catalogos_() {
  var h = Modelo_hoja_('CAT_VIGENCIA_EXAMENES');
  if (!h) return { estado: 'ERROR', detalle: 'Hoja CAT_VIGENCIA_EXAMENES ausente' };
  var enc = (Utl_leerBloque_(h)[0] || []).map(function (c) { return Utl_texto_(c); });
  var esperados = _MODELO_HOJAS_DEF['CAT_VIGENCIA_EXAMENES'];
  var ok = esperados.every(function (e, i) { return enc[i] === e; });
  return ok
    ? { estado: 'OK', detalle: Math.max(h.getLastRow() - 1, 0) + ' exámenes configurados' }
    : { estado: 'ERROR', detalle: 'Encabezados incorrectos: ' + enc.join(',') };
}
function _pruS_formatos_() {
  var h = Modelo_hoja_(HOJAS.PACIENTES);
  var ini = Modelo_dataStartRow_(HOJAS.PACIENTES);
  if (!h || h.getLastRow() < ini) return { estado: 'WARN', detalle: 'PACIENTES sin datos' };
  var col = MODELO_PACIENTE.map(function (c) { return c.campo; })
            .indexOf('FECHA_ACTUALIZACION') + 1;
  var nf = h.getRange(ini, col).getNumberFormat();
  return String(nf).indexOf('dd') !== -1
    ? { estado: 'OK', detalle: nf }
    : { estado: 'WARN', detalle: 'Formato actual "' + nf + '" — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_protecciones_() {
  var n = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (k) {
    var h = Modelo_ss_().getSheetByName(k);
    if (!h) return;
    n += h.getProtections(SpreadsheetApp.ProtectionType.RANGE)
          .filter(function (p) { return p.getDescription() === 'ECICEP-SISTEMA'; }).length;
  });
  return n >= 6
    ? { estado: 'OK', detalle: n + ' columnas del sistema marcadas' }
    : { estado: 'WARN', detalle: n + '/6 — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_remDatos_() {
  var d = new Date();
  var r = api_remVista_(d.getFullYear(), d.getMonth() + 1, 'TODOS', 'MES');
  return r && r.ok
    ? { estado: 'OK', detalle: 'REM al vuelo: ' + r.meta.pacientes +
        ' pacientes del censo · ' + r.meta.atenciones + ' atenciones del mes' }
    : { estado: 'WARN', detalle: (r && r.motivo) || 'sin datos' };
}
function _pruS_pdf_() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  if (typeof G.REM_exportarPdf_ !== 'function')
    return { estado: 'ERROR', detalle: 'REM_exportarPdf_ ausente' };
  return { estado: 'SKIP',
           detalle: 'Exportación manual: Consultar REM → Descargar PDF (evita archivos de prueba)' };
}
function _pruS_traza_() {
  var d = Modelo_diagnosticoTrazabilidad_();
  return d.conFuenteVacia === 0
    ? { estado: 'OK', detalle: d.total + ' pacientes con trazabilidad completa' }
    : { estado: 'WARN', detalle: d.conFuenteVacia + ' sin FUENTE (' +
        d.conFuenteVaciaRevisionFalse + ' cerradas sin origen)' };
}

// ===========================================================================
// 🏠 Panel de Control — agregadores puros (testeables)
// ===========================================================================

var PANEL_SECTORES = ['NARANJO', 'AMARILLO', 'VERDE'];

/** PURA: resumen por sector a partir de filas mínimas normalizadas.
 *  pacientes:[{sector,rev}] · eventos:[{tipo,sector,f}]
 *  Cobertura por volumen real (sin inventar importaciones):
 *  ≥50 Operativo · >0 Cobertura parcial · 0 Sin datos. */
/** PURA: KPIs del Panel de Control en pases lineales sobre PACIENTES/EVENTOS
 *  crudos (o "ligeros"). No construye arreglos intermedios completos: cada
 *  conteo se agrega en una sola pasada sobre las filas originales (menos
 *  alocaciones que mapear el dataset completo a objetos antes de contar).
 *  Retorna {pacientes, ingresosHoy, eventosMes, porRevisar, estratPendiente,
 *           sectores, ultimos, _ultimaActF} — ultimaAct se formatea en el
 *  llamador GAS (necesita Utilities, fuera del alcance puro). */
function _centro_resumen_(pacientes, eventos, hoyIso, tz) {
  var secs = {};
  PANEL_SECTORES.forEach(function (s) {
    secs[s] = { sector: s, pacientes: 0, ingresos7d: 0, porRevisar: 0, cobertura: 'SIN DATOS' };
  });
  var limite = '';
  if (hoyIso) {
    var d = new Date(+hoyIso.slice(0, 4), +hoyIso.slice(5, 7) - 1, +hoyIso.slice(8, 10));
    d.setDate(d.getDate() - 6); // ventana de 7 días incluyendo hoy
    limite = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
             '-' + String(d.getDate()).padStart(2, '0');
  }
  var mesActual = hoyIso ? hoyIso.slice(0, 7) : '';
  var n = 0, porRevisar = 0, estratPendiente = 0, ultimaActF = null;
  (pacientes || []).forEach(function (p) {
    n++;
    var rev = (p.REQUIERE_REVISION === true || p.REQUIERE_REVISION === 'TRUE');
    if (rev) porRevisar++;
    var sec = secs[Utl_texto_(p.SECTOR).toUpperCase()];
    if (sec) { sec.pacientes++; if (rev) sec.porRevisar++; }
    var est = Utl_texto_(p.ESTRATIFICACION).trim().toUpperCase();
    if (est === '' || est === 'G') estratPendiente++;
    if (p.FECHA_ACTUALIZACION instanceof Date &&
        (!ultimaActF || p.FECHA_ACTUALIZACION > ultimaActF)) ultimaActF = p.FECHA_ACTUALIZACION;
  });
  var ingresosHoy = 0, eventosMes = 0, top = [];
  (eventos || []).forEach(function (e) {
    var f = _ui_isoFecha_(e.FECHA_EVENTO, tz);
    var tipo = Utl_texto_(e.TIPO_EVENTO).toUpperCase();
    if (f === hoyIso && tipo === 'INGRESO') ingresosHoy++;
    if (f.slice(0, 7) === mesActual) eventosMes++;
    var sec2 = secs[Utl_texto_(e.SECTOR).toUpperCase()];
    if (sec2 && tipo === 'INGRESO' && limite && f >= limite && f <= hoyIso) sec2.ingresos7d++;
    if (f && f.length >= 10) {
      var item = { f: f, tipo: tipo, hora: f.length >= 16 ? f.slice(11, 16) : '',
                   iniciales: _panel_iniciales_(e.NOMBRE) };
      if (top.length < 4) { top.push(item); top.sort(_centro_topDesc_); }
      else if (f > top[3].f) { top[3] = item; top.sort(_centro_topDesc_); }
    }
  });
  PANEL_SECTORES.forEach(function (k) {
    var s = secs[k];
    s.cobertura = s.pacientes >= 50 ? 'Operativo'
                : s.pacientes > 0 ? 'Cobertura parcial' : 'Sin datos';
  });
  var ultimos = top.map(function (x) {
    return { fechaIso: x.f, hora: x.hora, tipo: x.tipo, iniciales: x.iniciales };
  });
  return { pacientes: n, ingresosHoy: ingresosHoy, eventosMes: eventosMes,
           porRevisar: porRevisar, estratPendiente: estratPendiente,
           sectores: PANEL_SECTORES.map(function (k) { return secs[k]; }),
           ultimos: ultimos, _ultimaActF: ultimaActF };
}

/** PURA: comparador desc por fecha ISO para el top-4 de actividad reciente. */
function _centro_topDesc_(a, b) { return b.f < a.f ? -1 : 1; }

/** PURA: iniciales discretas para actividad reciente (sin nombre completo). */
function _panel_iniciales_(nombre) {
  return Utl_texto_(nombre).trim().split(/\s+/).slice(0, 2)
    .map(function (w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ');
}


/** Consistencia transversal entre sectores (#5): conteos, duplicados por RUT,
 *  pacientes sin sector y pendientes de importación Amarillo. */
function _pruS_consistencia_() {
  var pacientes = Modelo_leerPacientesCampos_(['SECTOR', 'RUT']);
  var porSector = {}, sinSector = 0, dups = {};
  var vistos = {};
  pacientes.forEach(function (p) {
    var s = Utl_texto_(p.SECTOR).toUpperCase() || '(SIN SECTOR)';
    porSector[s] = (porSector[s] || 0) + 1;
    if (s === '(SIN SECTOR)') sinSector++;
    var rut = Utl_texto_(p.RUT).toUpperCase();
    if (rut && vistos[rut]) dups[rut] = (dups[rut] || 0) + 1;
    vistos[rut] = true;
  });
  var detalle = Object.keys(porSector).sort().map(function (s) {
    return s + ': ' + porSector[s];
  }).join(' · ');
  var nDup = Object.keys(dups).length;
  if (nDup) return { estado: 'ERROR',
    detalle: detalle + ' · ' + nDup + ' RUT duplicados: ' + Object.keys(dups).slice(0, 3).join(', ') };
  if (sinSector) return { estado: 'WARN',
    detalle: detalle + ' · ' + sinSector + ' sin sector' };
  var amarillo = porSector['AMARILLO'] || 0;
  var extra = amarillo < 100 ? ' · ⚠ Sector Amarillo con ' + amarillo +
    ' registros (fuente de 1.091 pendiente de importar)' : '';
  return { estado: amarillo < 100 ? 'WARN' : 'OK',
           detalle: detalle + extra };
}


/** Auditoría de calidad como prueba del Centro: WARN si hay problemas. */
function _pruS_calidad_() {
  var a = Calidad_auditarTodo_();
  if (a.conProblemas === 0)
    return { estado: 'OK', detalle: a.totalPacientes + ' pacientes · ' +
      a.totalEventos + ' eventos sin problemas de calidad' };
  return { estado: a.resumenTipos['RUT_INVALIDO'] || a.resumenTipos['EVENTO_HUERFANO']
? 'ERROR' : 'WARN',
            detalle: a.conProblemas + ' entidades con problemas: ' +
              Object.keys(a.resumenTipos).map(function (k) {
                return k + '=' + a.resumenTipos[k]; }).join(' · ') +
              ' — usa Herramientas → Auditar calidad y sincronizar Cola' };
}

/**
 * Check Centro de Pruebas: Auditoría v0.8.8 dry-run (solo lectura, tiempo real).
 * Devuelve OK/WARN/ERROR con detalle del reporte.
 */
function _pruS_auditoria_() {
  try {
    var r = Auditoria_ejecutar_();
    if (!r.ok) return { estado: 'ERROR', detalle: 'Auditoría falló: ' + r.motivo };
    var m = r.datos.personas;
    var linea = 'Personas: ' + m.total + ' · G1:' + m.G1 + ' G2:' + m.G2 + ' G3:' + m.G3 +
      ' · Sin último: ' + m.sinUltimoControl + ' · Vencidos: ' + m.vencidos +
      ' · Próximos: ' + m.proximos + ' · Vigentes: ' + m.vigentes +
      ' · Desalineados: ' + m.desalineados +
      ' · Amarillo eventos: ' + r.datos.amarillo.total +
      ' · Resp: ' + r.datos.responsables.asociaciones + ' (' + r.datos.responsables.unicos + ' únicos)' +
      ' · Prof: ' + r.datos.profesionales.activos + ' activos / ' + r.datos.profesionales.inexistentesEnCatalogo + ' inexistentes' +
      ' · Config: ' + r.datos.config.total + ' claves (' + r.datos.config.grupos.DESCONOCIDA.length + ' desconocidas, ' + r.datos.config.grupos.LEGACY.length + ' legacy)' +
      ' · ' + r.datos.duracionMs + ' ms';
    var estado = (m.vencidos > 0 || m.desalineados > 0 || r.datos.amarillo.gruposDuplicados > 0 ||
      r.datos.responsables.correosInvalidos > 0 || r.datos.profesionales.inexistentesEnCatalogo > 0 ||
      r.datos.config.grupos.DESCONOCIDA.length > 0) ? 'WARN' : 'OK';
    return { estado: estado, detalle: linea };
  } catch (e) {
    return { estado: 'ERROR', detalle: e && e.message ? e.message : String(e) };
  }
}

/** Menú Sistema → Google Forms: acciones operativas. */
function UI_menuGoogleForms_() {
  var ui = _UI_get_();
  ui.createMenu('Google Forms — Canal ECICEP')
    .addItem('Mostrar QR de CapturaWeb', 'UI_mostrarQR_')
    .addItem('Estado operativo', 'UI_formCanalEstado_')
    .addItem('Diagnóstico (solo lectura)', 'UI_formCanalDiagnostico_')
    .addItem('Legacy dry-run', 'UI_formCanalLegacyDryRun_')
    .addItem('Instalar/reparar canal (ventana)', 'UI_formCanalInstalarSeguro_')
    .addItem('Sincronizar catálogos (ventana)', 'UI_formCanalCatalogosSeguro_')
    .addSeparator()
    .addItem('Volver al menú de ECICEP', 'onOpen')
    .addToUi();
}

function UI_formCanalAlert_(titulo, lineas) {
  _UI_get_().alert(titulo, lineas.join('\n'), _UI_get_().ButtonSet.OK);
}

/** Solo agregados; nunca expone IDs, URLs internas, secretos ni PII. */
function UI_formCanalEstado_() {
  var e = Form_operativoEstado_();
  var b = e.backlog || {}, l = b.legacy || {};
  UI_formCanalAlert_('Google Forms — estado', [
    'Canal configurado: ' + (e.instalado ? 'sí' : 'no'),
    'Schema: ' + e.schemaVersion + ' / ' + GOOGLE_FORMS_CONFIG.SCHEMA_VERSION,
    'Form accesible: ' + (e.responsesDisponible ? 'sí' : 'no'),
    'Trigger submit: ' + (e.triggerOnFormSubmit === null ? 'n/d' : e.triggerOnFormSubmit),
    'Trigger worker: ' + (e.triggerWorker === null ? 'n/d' : e.triggerWorker),
    'Backlog actual: ' + ((b.pending || 0) + (b.retryable || 0)),
    'Legacy: ' + (l.total || 0) + ' total / ' + (l.review || 0) + ' review / ' + (l.terminal || 0) + ' terminal',
    'Oldest pending actual (min): ' + (b.oldestPendingMin || 0)
  ]);
  return { ok: true };
}

function UI_formCanalDiagnostico_() {
  var d = Form_operativoDiagnosticar_();
  var lineas = (d.checks || []).map(function (c) {
    var detalle = c.detalle;
    if (c.nombre === 'form_id') detalle = c.ok ? 'Configurado' : 'Sin Form configurado';
    if (c.nombre === 'url') detalle = c.ok ? 'Disponible (interna)' : 'Sin URL interna';
    return (c.ok ? 'OK ' : 'FALLO ') + c.nombre + ': ' + detalle;
  });
  if (!(d.estado && d.estado.formId)) {
    lineas.unshift('CANAL_GOOGLE_FORMS_NO_ACTIVADO');
    lineas.push('Configure GOOGLE_FORM_ID únicamente durante la ventana de activación.');
  }
  UI_formCanalAlert_('Google Forms — diagnóstico', lineas);
  return { ok: d.ok };
}

function UI_formCanalLegacyDryRun_() {
  var r = Form_migrarTrailerLegacy_({ dryRun: true });
  UI_formCanalAlert_('Legacy — dry-run', ['Filas: ' + r.totalFilas, 'Legacy: ' + r.legacyDetectadas,
    'Parciales: ' + r.legacyParciales, 'Completas: ' + r.legacyCompletas,
    'Terminal: ' + r.terminal, 'Review: ' + r.review, 'Ambiguas: ' + r.ambiguas,
    'Columnas requeridas: ' + (r.requiereColumnas.join(', ') || 'ninguna')]);
  return r;
}

function UI_formCanalInstalarSeguro_() {
  var ventana = Operacion_ventanaActivacionAbierta_();
  if (!ventana.ok) { UI_formCanalAlert_('Operación bloqueada', [ventana.motivo]); return ventana; }
  if (!Form_formId_()) { var sinId = { ok: false, motivo: 'FORM_ID_REQUIRED' }; UI_formCanalAlert_('Operación bloqueada', [sinId.motivo]); return sinId; }
  var diag = Form_operativoDiagnosticar_();
  if (diag.estado && diag.estado.form && diag.estado.form.error) {
    var inaccesible = { ok: false, motivo: 'FORM_NO_ACCESIBLE' };
    UI_formCanalAlert_('Operación bloqueada', [inaccesible.motivo]); return inaccesible;
  }
  try {
    var form = FormApp.openById(Form_formId_());
    var schema = Form_auditarSchema_(form);
    if (!schema.seguro) {
      var ambiguo = { ok: false, motivo: 'FORM_SCHEMA_REQUIRES_REVIEW' };
      UI_formCanalAlert_('Operación bloqueada', [ambiguo.motivo]); return ambiguo;
    }
  } catch (e) {
    var noAbre = { ok: false, motivo: 'FORM_NO_ACCESIBLE' };
    UI_formCanalAlert_('Operación bloqueada', [noAbre.motivo]); return noAbre;
  }
  var dry = Form_operativoReparar_({ dryRun: true });
  if ((diag.checks || []).some(function (c) { return c.nombre === 'form_id' && !c.ok; })) return { ok: false, motivo: 'FORM_NO_ACCESIBLE' };
  var ui = _UI_get_();
  var conf = ui.alert('Confirmar ventana técnica', 'Se adoptará únicamente el GOOGLE_FORM_ID configurado. Dry-run: ' + (dry.necesitaCambio ? 'requiere cambios' : 'sin cambios') + '. ¿Continuar?', ui.ButtonSet.YES_NO);
  if (conf !== ui.Button.YES) return { ok: false, motivo: 'CANCELADO' };
  var r = Form_operativoInstalar_({ crearNuevo: false, adoptarExistente: true });
  if (!r.ok) { UI_formCanalAlert_('Instalación segura', ['Falló: ' + (r.motivo || 'ERROR')]); return r; }
  var post = Form_operativoDiagnosticar_();
  var checksSanitizados = (post.checks || []).map(function (c) {
    var detalle = c.detalle;
    if (c.nombre === 'form_id') detalle = c.ok ? 'Configurado' : 'Sin Form configurado';
    if (c.nombre === 'url') detalle = c.ok ? 'Disponible (interna)' : 'Sin URL interna';
    return { nombre: c.nombre, ok: !!c.ok, detalle: detalle };
  });
  var checks = checksSanitizados.map(function (c) { return (c.ok ? 'OK ' : 'FALLO ') + c.nombre + ': ' + c.detalle; });
  if (!post.ok) {
    var falloPost = { ok: false, motivo: 'POST_INSTALL_DIAGNOSTIC_FAILED', checks: checksSanitizados };
    UI_formCanalAlert_('Instalación incompleta', ['POST_INSTALL_DIAGNOSTIC_FAILED'].concat(checks));
    return falloPost;
  }
  UI_formCanalAlert_('Instalación segura', ['Completada'].concat(checks));
  return { ok: true, motivo: 'INSTALADO_Y_DIAGNOSTICADO', checks: checksSanitizados };
}

function UI_formCanalCatalogosSeguro_() {
  var ventana = Operacion_ventanaActivacionAbierta_();
  if (!ventana.ok) { UI_formCanalAlert_('Operación bloqueada', [ventana.motivo]); return ventana; }
  if (!Form_formId_()) return { ok: false, motivo: 'FORM_ID_REQUIRED' };
  var dry = Form_syncCatalogos_({ simular: true });
  if (!dry.ok) return dry;
  var ui = _UI_get_();
  var conf = ui.alert('Confirmar catálogos', 'Dry-run: ' + dry.cambios.length + ' cambio(s). ¿Aplicar?', ui.ButtonSet.YES_NO);
  if (conf !== ui.Button.YES) return { ok: false, motivo: 'CANCELADO' };
  var r = Form_syncCatalogos_({ simular: false });
  UI_formCanalAlert_('Catálogos', [r.ok ? 'Sincronización completada' : ('Falló: ' + (r.motivo || 'ERROR'))]);
  return r;
}
