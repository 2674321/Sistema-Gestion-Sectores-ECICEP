/**
 * Sistema ECICEP — 07_UI
 * Interfaz DENTRO de Google Sheets (DEC-012: Sheets es la interfaz principal).
 * ETAPA 2: solo menú base con acciones existentes. La experiencia completa
 * (INICIO/DASHBOARD/FICHA/SEGUIMIENTO, búsquedas y botones) llega en ETAPA 4.
 */

/** Menú principal. Se ejecuta automáticamente al abrir el spreadsheet.
 *  Estructura oficial: un nombre = una función = una interfaz = una finalidad.
 *  Menús minimalistas (fase de optimización S8): tres grupos (Captura / ECICEP /
 *  Sistema) con nombres cortos y sin emojis en cada elemento. Las utilidades de
 *  desarrollo (Diagnóstico, Centro de Pruebas) no se exponen en el menú operativo. */
function onOpen() {
  try {
    var ui = _UI_get();

    ui.createMenu('Captura')
      .addItem('Abrir formulario', 'UI_abrirFormularioCaptura')
      .addItem('Mostrar QR', 'UI_mostrarQR')
      .addToUi();

    ui.createMenu('ECICEP')
      .addItem('Inicio', 'UI_panelControl')
      .addSubMenu(ui.createMenu('Personas')
        .addItem('Buscar / Ficha', 'UI_abrirBuscador')
        .addItem('Cola de revisión', 'UI_abrirRevision')
        .addItem('Ingresos', 'UI_procesarIngresos')
        .addItem('Duplicados por RUT', 'UI_duplicados'))
      .addSubMenu(ui.createMenu('Seguimiento')
        .addItem('Controles por persona', 'UI_abrirControles'))
      .addSubMenu(ui.createMenu('Reportes')
        .addItem('Estadísticas', 'UI_abrirDashboard')
        .addItem('Generar REM', 'UI_generarRem')
        .addItem('Consultar REM', 'UI_verRem'))
      .addSubMenu(ui.createMenu('Configuración')
        .addItem('Configuración', 'UI_configuracion')
        .addItem('Estratificación', 'UI_configuracionEstratificacion')
        .addItem('Responsables y correos', 'UI_configuracionResponsables')
        .addItem('Autorizar permisos', 'ECICEP_autorizar'))
      .addToUi();

    ui.createMenu('Sistema')
      .addItem('Actualizar', 'UI_actualizarSistema')
      .addItem('Instalar / reparar', 'UI_instalarSistema')
      .addItem('Backups', 'UI_backup')
      .addItem('Formularios', 'UI_formularioPanel')
      .addItem('Registro del sistema', 'UI_abrirLog')
      .addItem('Acerca de', 'UI_abrirAcercaDe')
      .addToUi();

    Utl_toast('info', 'v' + ECICEP.VERSION + ' listo — menú disponible arriba a la derecha', 4);
  } catch (e) { /* entorno sin UI */ }
}

/** URL centralizada de la Web App de captura. Única fuente de verdad.
 *  Si ECICEP.WEB_APP_URL está configurado, lo usa; si no, cae en
 *  ScriptApp.getService().getUrl() (funciona en /exec, puede fallar
 *  desde un script vinculado si el deployment no es el operativo). */
function ECICEP_webAppUrl() {
  var configurada = Utl_texto(ECICEP.WEB_APP_URL).trim();
  if (configurada) return configurada;
  return ScriptApp.getService().getUrl();
}

/** 📋 Abrir formulario de captura en nueva pestaña. */
function UI_abrirFormularioCaptura() {
  var url = ECICEP_webAppUrl();
  var html = '<html><body><script>'
    + 'var a=document.createElement("a");a.href="' + url + '";a.target="_blank";'
    + 'document.body.appendChild(a);a.click();google.script.host.close();'
    + '</script></body></html>';
  _UI_get().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(10).setHeight(10),
    'Abriendo formulario...');
}

/** 📱 Mostrar QR del formulario de captura en sidebar. */
function UI_mostrarQR() {
  var url = ECICEP_webAppUrl();
  var t = HtmlService.createTemplateFromFile('QRFormulario');
  t.QR_URL = url;
  t.WEB_APP_URL = url;
  _UI_get().showSidebar(t.evaluate().setTitle('📱 QR — Formulario ECICEP'));
}

/** ⚙ Instalar sistema: dialog con progreso REAL por etapas (Instalador.html). */
function UI_instalarSistema() {
  var t = HtmlService.createTemplateFromFile('Instalador');
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz(), 'yyyyMMdd-HHmm');
  _UI_get().showModalDialog(t.evaluate()
    .setTitle('Instalaci\u00f3n del sistema').setWidth(560).setHeight(640),
    'Instalaci\u00f3n del sistema');
}

/** 📥 Panel de administración del formulario complementario (FormularioPanel.html). */
function UI_formularioPanel() {
  var t = HtmlService.createTemplateFromFile('FormularioPanel');
  _UI_get().showModalDialog(t.evaluate()
    .setTitle('📥 Formularios').setWidth(520).setHeight(520),
    '📥 Formularios');
}

/** 🔍 Diagnóstico de instalación (dry-run): informa qué cambiaría sin aplicarlo. */
function UI_instalarDiagnosticar() {
  var r = Instalar_diagnosticar();
  if (!r.ok) {
    _UI_get().alert('Error', r.motivo || 'Error en diagnóstico', _UI_get().ButtonSet.OK);
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
  _UI_get().alert('🔍 Diagnóstico', lineas.join('\n'), _UI_get().ButtonSet.OK);
}

/** 🔄 Actualizar sistema: actualiza datos derivados y vistas (S12, DEC-058).
 *  Responsabilidad RESERVADA a derivados: NO importa fuentes, NO repara
 *  estructura, NO enriquece, NO toca captura ni FORM_RESPUESTAS.
 *  Implementación: delega en UI_actualizarTodo() (única lógica, sin copiar).
 *  Estructura/importación/enriquecimiento → "Sistema → Instalar / reparar". */
function UI_actualizarSistema() {
  var ui = _UI_get();
  var msg = 'Actualizar sistema\n\n' +
    'Actualiza:\n' +
    '  · vistas (SECTOR_*);\n' +
    '  · campos automáticos;\n' +
    '  · cálculos (estratificación y próximos controles);\n' +
    '  · indicadores/formato derivado.\n\n' +
    'No importa fuentes, no crea ni modifica registros clínicos.\n' +
    '¿Desea ejecutar la actualización?';
  var resp = ui.alert('🔄 Actualizar sistema', msg, ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;
  UI_actualizarTodo();
}

/** 🔄 Actualizar todo (lógica real de "Actualizar sistema", S12): recalcula
 *  estratificación + controles + refresca SECTOR_* + re-aplica formato.
 *  Solo toca datos derivados; idempotente sobre la fuente. */
function UI_actualizarTodo() {
  Utl_toast('info', 'Actualizando sistema…', 45);
  // S10-FIX: alineación explícita del esquema de SECTOR_* (migración idempotente
  // por nombre). Paso explícito de la fase, no un efecto lateral oculto: solo
  // replica el esquema canónico de las vistas derivadas.
  Modelo_alinearVistasSectoriales();
  var r1 = Estrat_recalcularTodos();
  var r2 = Control_recalcularTodos();
  Utl_medir(Modelo_refrescarVistasSectores);
  try {
    if (typeof HVis_formatearIngresos === 'function') HVis_formatearIngresos();
  } catch (e) { /* best effort */ }
  Utl_medir(function () {
    Hojas_formatoCondicional(SpreadsheetApp.getActiveSpreadsheet());
  });
  Utl_toast('ok', 'Actualizado — ' + r1.recalculados + ' estrat. · ' + r2.cambios + ' controles', 10);
}

/** 📄 Registro del Sistema: visor visual del LOG (la hoja queda interna). */
function UI_abrirLog() {
  var t = HtmlService.createTemplateFromFile('LogVisor');
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz(), 'yyyyMMdd-HHmm');
  _UI_get().showModalDialog(t.evaluate().setTitle('Registro del Sistema')
    .setWidth(1180).setHeight(720), 'Registro del Sistema');
}

/** Endpoint visor LOG: últimos registros + conteos por nivel. */
function api_logLeer(limite) {
  try {
    var h = Modelo_hoja(HOJAS.LOG);
    if (!h || h.getLastRow() < 2) return { ok: true, registros: [], resumen: { total: 0, errores: 0, advertencias: 0, informacion: 0 } };
    var max = Math.min(Number(limite) || 500, 2000);
    var ultima = h.getLastRow();
    var desde = Math.max(2, ultima - max + 1);
    var vals = h.getRange(desde, 1, ultima - desde + 1, Math.min(h.getLastColumn(), 7)).getValues();
    var tz = _UI_tz();
    var registros = vals.map(function (f) {
      return {
        fechaIso: f[0] instanceof Date ? Utilities.formatDate(f[0], tz, 'yyyy-MM-dd HH:mm:ss') : Utl_texto(f[0]),
        nivel: Utl_texto(f[1]).toUpperCase(),
        modulo: Utl_texto(f[2]),
        accion: Utl_texto(f[3]),
        resultado: Utl_texto(f[4]),
        duracionMs: f[5],
        contexto: Utl_texto(f[6])
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
function UI_procesarIngresos() {
  var r = Utl_medir(Ingresos_procesarTodasLasHojas);
  Log_info('UI', 'procesarIngresos', JSON.stringify(r.resultado), null, r.ms);
  Log_flush();
  var texto = Ingresos_resumenTexto(r.resultado);
  if ((r.resultado.revision || 0) > 0) {
    texto += '\n\n⚠ ' + r.resultado.revision + ' caso(s) en la Cola de revisión.';
  }
  _UI_get().alert(texto, _UI_get().ButtonSet.OK);
}

/** Diagnóstico: por qué fallan los ingresos (encabezados, mapeo, errores). */
function UI_diagnosticarIngresos() {
  Ingresos_diagnosticar();
  var hoja = Modelo_ss().getSheetByName('DIAGNOSTICO');
  if (hoja) SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(hoja);
}

/** Un solo clic: instala, siembra ficticios, procesa y refresca vistas. */
/** Sembrar prueba: siembra pacientes ficticios de demostración (úsase desde
 *  el Centro de Pruebas, no en el flujo normal). */
function UI_sembrarFicticios() {
  Utl_toast('info', 'Sembrando datos de prueba…', 15);
  var sembradas = Sembrar_ficticios();
  Log_info('UI', 'sembrarFicticios', 'sembradas=' + sembradas);
  Log_flush();
  Utl_toast('ok', 'Sembradas ' + sembradas + ' filas de prueba', 8);
  return sembradas;
}

function UI_demoCompleta() {
  Utl_toast('info', 'Preparando demostración…', 15);
  var pasos = {};
  pasos.estructura = Modelo_crearEstructura();
  pasos.sembradas = Sembrar_ficticios();
  pasos.proceso = Ingresos_procesarTodasLasHojas({});
  pasos.vistas = Modelo_refrescarVistasSectores();
  Log_info('UI', 'demoCompleta', JSON.stringify(pasos.proceso));
  Log_flush();
  Utl_toast('ok', 'Demo lista · Sembradas: ' + pasos.sembradas +
    ' · Ingresados: ' + ((pasos.proceso.nuevos || 0) + (pasos.proceso.existentes || 0)) +
    ' · Eventos: ' + (pasos.proceso.eventosCreados || 0), 20);
}

// ===========================================================================
// ETAPA 5 — Fuentes reales
// ===========================================================================

function UI_diagnosticarFuentes() {
  var resultado = Fuentes_diagnosticarFuentes();

  // escribir reporte en DIAGNOSTICO
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaD = ss.getSheetByName('DIAGNOSTICO_FUENTES');
  if (!hojaD) hojaD = ss.insertSheet('DIAGNOSTICO_FUENTES');
  hojaD.clearContents();
  Utl_escribirBloque(hojaD, 1, 1, [[
    'FUENTE','SECTOR','HOJA','EXISTE','ENCAB.FILA','RECONOCIDAS','FALTANTES','DESCONOCIDAS','FILAS_DATOS','NOTA'
  ]]);
  var fila = 2;
  resultado.fuentes.forEach(function (fuente) {
    if (fuente.error || fuente.motivo) {
      Utl_escribirBloque(hojaD, fila, 1, [[
        fuente.nombre, fuente.sector, '', '', '', '', '', '', '', fuente.error || fuente.motivo
      ]]);
      fila++;
      return;
    }
    fuente.hojas.forEach(function (h) {
      Utl_escribirBloque(hojaD, fila, 1, [[
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
  Utl_toast('ok', 'Diagnóstico escrito en DIAGNOSTICO_FUENTES', 8);
}

/** Núcleo headless del sembrado (reutilizado por webhook). */
function Sembrar_ficticios() {
  var casos = DATASET_STAGING.casos;
  var porHoja = {};
  Object.keys(casos).forEach(function (nombre) {
    var c = casos[nombre];
    var sector = Norm_normalizarSector(c.origen.sector).sector;
    var hojaNombre = Ingresos_hojaParaSector(sector);
    if (!hojaNombre) return;
    if (!porHoja[hojaNombre]) porHoja[hojaNombre] = [];
    porHoja[hojaNombre].push(c.valores);
  });
  var total = 0;
  Object.keys(porHoja).forEach(function (hojaNombre) {
    var hoja = Modelo_ss().getSheetByName(hojaNombre);
    if (!hoja) return;
    var filas = porHoja[hojaNombre].map(function (v) {
      // orden según _INGRESO_ENCABEZADOS (operativos + sistema)
      return [
        Utl_texto(v.NOMBRE), Utl_texto(v.RUT), Utl_texto(v.SEXO),
        Utl_texto(v.FECHA_NACIMIENTO), Utl_texto(v.TELEFONOS || v.TELEFONO),
        Utl_texto(v.FECHA_INGRESO), Utl_texto(v.ESTRATIFICACION),
        Utl_texto(v.DUPLA_INGRESO), Utl_texto(v.OBSERVACIONES),
        'PENDIENTE', 'DATOS DE PRUEBA (ficticio)'
      ];
    });
    total += Utl_escribirBloque(hoja, hoja.getLastRow() + 1, 1, filas);
  });
  Log_info('Sembrar', 'ficticios', total + ' filas');
  return total;
}

/** Un solo clic: instala, siembra ficticios, procesa y refresca vistas. */
/** Incluye un archivo HTML (tokens/componentes) dentro de una plantilla. */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/** Abre una vista HTML como dialog ancho (dashboard / REM). */
function _ui_dialogo(nombre, titulo) {
  var t = HtmlService.createTemplateFromFile(nombre);
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz(), 'yyyyMMdd-HHmm');
  var html = t.evaluate().setTitle(titulo).setWidth(1180).setHeight(720);
  _UI_get().showModalDialog(html, titulo);
}

/** Abre la sidebar en un modo concreto: 'centro' (panel), 'pacientes' (buscador+ficha),
 *  'revision' (cola) o 'ficha' (abre directamente la ficha de la persona). */
function _ui_sidebar(modo, titulo, idInicial) {
  var t = HtmlService.createTemplateFromFile('Sidebar');
  t.modo = modo;
  t.ID_INICIAL = idInicial || '';
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz(), 'yyyyMMdd-HHmm');
  _UI_get().showSidebar(t.evaluate().setTitle(titulo));
}

/** 🏠 Panel de Control: dashboard principal con accesos y estado general. */
function UI_panelControl() { _ui_sidebar('centro', 'Panel de Control'); }

/** 👤 Pacientes ECICEP: buscador + ficha. */
function UI_abrirBuscador() { _ui_sidebar('pacientes', 'Pacientes ECICEP'); }

/** 📋 Cola de Revisión: sidebar exclusivo del módulo de revisión. */
function UI_abrirRevision() { _ui_sidebar('revision', 'Cola de Revisión'); }

/** 👥 Duplicados por RUT: lista grupos con mismo RUT y permite unir. */
function UI_duplicados(){
  var r=Api_duplicadosListar();
  if(!r.ok){ _UI_get().alert('Duplicados: '+r.motivo); return; }
  if(!r.totalGrupos){ _UI_get().alert('Duplicados por RUT','Sin duplicados por RUT en PACIENTES.', _UI_get().ButtonSet.OK); return; }
  var msg='Grupos duplicados: '+r.totalGrupos+' ('+r.totalDuplicados+' registros)\n\n';
  r.grupos.slice(0,10).forEach(function(g){
    msg+=g.rut+' x'+g.cantidad+' -> '+g.registros.map(function(x){return x.paciente.NOMBRE.substring(0,20)+'['+x.paciente.ID_INTERNO+']';}).join(' | ')+'\n';
  });
  if(r.totalGrupos>10) msg+='... y '+(r.totalGrupos-10)+' grupos mas. Ver LOG para detalle.\n';
  msg+='\nPara unir: ECICEP > Personas > Duplicados guarda el primero y reasigna eventos de los otros (marca REQUIERE_REVISION). Ejecuta Api_duplicadosUnirPorRut(rut, idConservar) desde script si necesitas elegir.';
  Log_info('Duplicados','listar', JSON.stringify(r.grupos.slice(0,5).map(function(g){return g.rut+':'+g.cantidad;})));
  Log_flush();
  _UI_get().alert('Duplicados por RUT', msg, _UI_get().ButtonSet.OK);
}

/** ⚙ Configuración: abre el diálogo de administración. La hoja CONFIG
 *  permanece OCULTA (no se muestra). Usa una función desde menú, jamás la hoja. */
function _ui_configuracion(seccion) {
  // Re-prende el ocultamiento de CONFIG (idempotente) por si quedó visible.
  try {
    var cfg = Modelo_hoja(HOJAS.CONFIG);
    if (cfg && !cfg.isSheetHidden()) cfg.hideSheet();
  } catch (e) {}
  var t = HtmlService.createTemplateFromFile('Configuracion');
  t.SECCION = seccion || 'TODAS';
  _UI_get().showModalDialog(t.evaluate()
    .setTitle('Configuración').setWidth(900).setHeight(680), 'Configuración');
}

function UI_configuracion() { _ui_configuracion('TODAS'); }
/** 🎯 Estratificación: abre CONFIG filtrado a frecuencias/reglas de control. */
function UI_configuracionEstratificacion() { _ui_configuracion('ESTRATIFICACION'); }
/** 👨‍⚕️ Responsables y correos: abre CONFIG filtrado a responsables/correos. */
function UI_configuracionResponsables() { _ui_configuracion('CORREOS_RESPONSABLES'); }

/** 🧪 Centro de Pruebas: única entrada al diagnóstico del sistema. */
function UI_centroPruebas() { _ui_dialogo('CentroPruebas', 'Centro de Pruebas'); }

function UI_abrirDashboard() { _ui_dialogo('Dashboard', 'Estadísticas'); }

function UI_verRem() { _ui_dialogo('RemVista', 'REM vista de trabajo'); }

/** Generador REM: dialog estilo Panel (reemplaza los prompt nativos). */
function UI_generarRem() { _ui_dialogo('RemGenerador', 'Generar REM'); }

/** Acerca de: dialog con datos del sistema. */
function UI_abrirAcercaDe() { _ui_dialogo('AcercaDe', 'Acerca de ECICEP'); }

/** 🩺 Controles por persona: modal independiente de consulta BAJO DEMANDA.
 *  No lista población al abrir: se consulta solo cuando el usuario elige
 *  sector y/o escribe búsqueda. */
function UI_abrirControles() {
  var t = HtmlService.createTemplateFromFile('Controles');
  t.BUILD = Utilities.formatDate(new Date(), _UI_tz(), 'yyyyMMdd-HHmm');
  var html = t.evaluate().setTitle('Controles por persona')
    .setWidth(840).setHeight(680);
  _UI_get().showModalDialog(html, 'Controles por persona');
}

/** 🔎 Abre la ficha de una persona directamente (sidebar modo 'ficha'). */
function UI_abrirFicha(idInterno) {
  if (!idInterno) return false;
  _ui_sidebar('ficha', 'Pacientes ECICEP', String(idInterno));
  return true;
}

/** Endpoint: datos para la vista "Acerca de". */
function api_acercaDe() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = _UI_tz();
  var pacHoja = ss.getSheetByName(HOJAS.PACIENTES);
  var evsHoja = ss.getSheetByName(HOJAS.EVENTOS);
  var pacIni = Modelo_dataStartRow(HOJAS.PACIENTES);
  var pacCount = pacHoja && pacHoja.getLastRow() >= pacIni ? pacHoja.getLastRow() - pacIni + 1 : 0;
  var evsIni = Modelo_dataStartRow(HOJAS.EVENTOS);
  var evsCount = evsHoja && evsHoja.getLastRow() >= evsIni ? evsHoja.getLastRow() - evsIni + 1 : 0;
  var nombre = '', institucion = '';
  try {
    var h = ss.getSheetByName(HOJAS.CONFIG);
    if (h && h.getLastRow() > 1) {
      var vals = Utl_leerBloque(h);
      for (var i = 1; i < vals.length; i++) {
        var k = Utl_texto(vals[i][0]), v = Utl_texto(vals[i][1]);
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
      ? 'Activa (regla ' + Utl_texto(CFG_ESTRATIFICACION.VERSION_REGLA) + ')'
      : 'Manual / sin regla',
    ambiente: 'Producción'
  };
}

/** Endpoint: catálogo de profesionales + selección del paciente. */
function api_duplaAbrir(idInterno) {
  try {
    var pacientes = Modelo_leerPacientesCampos(['ID_INTERNO', 'DUPLA_INGRESO']);
    var p = null;
    for (var i = 0; i < pacientes.length; i++) {
      if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(idInterno)) { p = pacientes[i]; break; }
    }
    var seleccionados = p ? Utl_texto(p.DUPLA_INGRESO).split(';').map(function (s) {
      return s.trim().toUpperCase();
    }).filter(function (s) { return s; }) : [];
    return {
      ok: true,
      catalogo: Profesionales_catalogo().filter(function (c) { return c.ACTIVO; })
        .map(function (c) { return { CODIGO: c.CODIGO, NOMBRE: c.NOMBRE }; }),
      seleccionados: seleccionados
    };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: guarda la dupla del paciente como códigos separados por ';'. */
function api_duplaGuardar(idInterno, codigos) {
  try {
    codigos = (codigos || []).map(function (c) { return String(c).trim().toUpperCase(); }).filter(Boolean);
    var dupla = codigos.join('; ');
    var pacientes = Modelo_leerPacientesCampos(['ID_INTERNO']);
    var idx = -1;
    for (var i = 0; i < pacientes.length; i++) {
      if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(idInterno)) { idx = i; break; }
    }
    if (idx === -1) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
    pacientes[idx].DUPLA_INGRESO = dupla;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJAS.PACIENTES);
    var colDupla = MODELO_PACIENTE.map(function (c) { return c.campo; }).indexOf('DUPLA_INGRESO') + 1;
    hoja.getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), colDupla).setValue(dupla);
    Modelo_invalidarLecturas();
    Log_info('Dupla', 'guardar', idInterno + ' → ' + dupla);
    Log_flush();
    return { ok: true, cantidad: codigos.length, dupla: dupla };
  } catch (e) {
    Log_error('Dupla', 'guardar', e && e.message ? e.message : String(e));
    Log_flush();
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
function api_configListar() {
  try {
    var hoja = Modelo_hoja(HOJAS.CONFIG);
    var filas = [];
    if (hoja && hoja.getLastRow() > 1) {
      var vals = Utl_leerBloque(hoja);
      for (var i = 1; i < vals.length; i++) {
        var k = Utl_texto(vals[i][0]);
        if (!k) continue;
        // RESPONSABLE_<SECTOR> (legacy 1 correo / sector) pasó al panel acumulable
        // de la sección CORREOS_RESPONSABLES: aquí se ocultan para no editarlos
        // como texto plano y duplicar el mantenimiento (#13 → DEC-039).
        if (/^RESPONSABLE_(NARANJO|AMARILLO|VERDE)$/.test(k)) continue;
        filas.push({ clave: k, valor: Utl_texto(vals[i][1]),
                     descripcion: Utl_texto(vals[i][2]),
                     protegida: Config_estaProtegida(k),
                     seccion: Config_seccionDe(k),
                     tipo: Config_tipoDe(k),
                     opciones: Config_opcionesDe(k) });
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
function api_configGuardar(clave, valor) {
  try {
    var k = Utl_texto(clave).trim();
    if (!k) return { ok: false, motivo: 'CLAVE_VACIA' };
    if (Config_estaProtegida(k)) return { ok: false, motivo: 'CLAVE_PROTEGIDA: ' + k };
    var v = String(valor == null ? '' : valor);
    var problema = Config_validarValor(k, v);
    if (problema) return { ok: false, motivo: 'Valor inválido (' + k + '): ' + problema };
    _config_set(k, v);
    Modelo_invalidarLecturas();
    Log_info('Config', 'guardar', k);
    Log_flush();
    return { ok: true };
  } catch (e) {
    Log_error('Config', 'guardar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: agrega una clave nueva (no puede duplicar). */
function api_configAgregar(clave, valor, descripcion) {
  try {
    var k = Utl_texto(clave).trim();
    if (!k) return { ok: false, motivo: 'CLAVE_VACIA' };
    if (Config_estaProtegida(k)) return { ok: false, motivo: 'CLAVE_PROTEGIDA: ' + k };
    var v = String(valor == null ? '' : valor);
    var problema = Config_validarValor(k, v);
    if (problema) return { ok: false, motivo: 'Valor inválido (' + k + '): ' + problema };
    var hoja = Modelo_hoja(HOJAS.CONFIG);
    var duplicada = false;
    if (hoja && hoja.getLastRow() > 1) {
      var vals = Utl_leerBloque(hoja);
      for (var i = 1; i < vals.length; i++) if (Utl_texto(vals[i][0]) === k) { duplicada = true; break; }
    }
    if (duplicada) return { ok: false, motivo: 'CLAVE_DUPLICADA: ' + k };
    // Alta única: clave, valor y descripción van en el mismo setValues de
    // _config_set (evita getLastRow + setValue de la descripción).
    _config_set(k, v, Utl_texto(descripcion));
    Modelo_invalidarLecturas();
    Log_info('Config', 'agregar', k);
    Log_flush();
    return { ok: true };
  } catch (e) {
    Log_error('Config', 'agregar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: elimina una clave NO protegida de CONFIG. */
function api_configEliminar(clave) {
  try {
    var k = Utl_texto(clave).trim();
    if (!k) return { ok: false, motivo: 'CLAVE_VACIA' };
    if (Config_estaProtegida(k)) return { ok: false, motivo: 'CLAVE_PROTEGIDA: ' + k };
    var hoja = Modelo_hoja(HOJAS.CONFIG);
    var eliminada = false;
    if (hoja && hoja.getLastRow() > 1) {
      var vals = Utl_leerBloque(hoja);
      for (var i = 1; i < vals.length; i++) {
        if (Utl_texto(vals[i][0]) === k) { hoja.deleteRow(i + 1); eliminada = true; break; }
      }
    }
    Modelo_invalidarLecturas();
    Log_info('Config', 'eliminar', k + (eliminada ? '' : ' (no encontrada)'));
    Log_flush();
    return { ok: true, eliminada: eliminada };
  } catch (e) {
    Log_error('Config', 'eliminar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/* ---------------------------------------------------------------------------
 * Responsables por sector (ACUMULABLES, DEC-039)
 *   Hoja oculta RESPONSABLES: SECTOR | CODIGO_RESPONSABLE | NOMBRE | CORREO | ACTIVO
 *   - api_responsablesListar      → lectura + diagnóstico (dry-run, NO escribe)
 *   - api_responsablesGuardarSector → reescritura atómica validada de un sector
 * ------------------------------------------------------------------------- */

/** Asegura que la hoja RESPONSABLES exista (la crea con encabezados si falta). */
function _responsables_asegurarHoja() {
  var ss = Modelo_ss();
  var hoja = ss.getSheetByName(HOJAS.RESPONSABLES);
  if (!hoja) {
    hoja = ss.insertSheet(HOJAS.RESPONSABLES);
    Utl_escribirBloque(hoja, 1, 1, [COLUMNAS_RESPONSABLES]);
  }
  return hoja;
}

/** Lee todas las asociaciones canónicas de RESPONSABLES (sin tocar catálogo). */
function _responsables_leer() {
  var hoja = Modelo_ss().getSheetByName(HOJAS.RESPONSABLES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  return Responsables_mapear(Utl_leerBloque(hoja));
}

/** Lee los correos legacy RESPONSABLE_<SECTOR> de CONFIG → {SEC:'correo'}. */
function _responsables_leerLegacy() {
  var hoja = Modelo_hoja(HOJAS.CONFIG);
  var legacy = {};
  if (!hoja || hoja.getLastRow() < 2) return legacy;
  Utl_leerBloque(hoja).forEach(function (r) {
    var k = Utl_texto(r[0]);
    if (/^RESPONSABLE_(NARANJO|AMARILLO|VERDE)$/.test(k))
      legacy[k.replace('RESPONSABLE_', '')] = Utl_texto(r[1]).trim();
  });
  return legacy;
}

/** Reescritura atómica de toda la hoja RESPONSABLES (ya validada). */
function _responsables_escribirTodo(lista) {
  var hoja = _responsables_asegurarHoja();
  if (hoja.getLastRow() > 1)
    hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS_RESPONSABLES.length).clear();
  if (lista.length) {
    var filas = lista.map(function (r) {
      return [Utl_texto(r.sector).toUpperCase(), r.codigo, r.nombre, r.correo, r.activo !== false];
    });
    Utl_escribirBloque(hoja, 2, 1, filas);
  }
  Modelo_invalidarLecturas();
}

/** Endpoint: lectura + diagnóstico/dry-run de responsables (NO modifica datos).
 *  No carga PACIENTES/EVENTOS: solo la hoja RESPONSABLES, el catálogo
 *  PROFESIONALES y las claves legacy de CONFIG. */
function api_responsablesListar() {
  try {
    var lista = _responsables_leer();
    var profesionales = Profesionales_catalogo();
    var legacy = _responsables_leerLegacy();
    var diagnostico = Responsables_diagnostico(lista, profesionales, legacy);
    return { ok: true, lista: lista, profesionales: profesionales,
             sectores: SECTORES_RESPONSABLES, legacy: legacy, diagnostico: diagnostico };
  } catch (e) {
    Log_error('Responsables', 'listar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: guarda de forma atómica y validada TODAS las asociaciones de un
 *  sector. filas = [{codigo, nombre, correo, activo}] (reemplazan las del
 *  sector). Eliminar una asociación aquí NO elimina al profesional del catálogo
 *  PROFESIONALES. No sobreescribe otros sectores. */
function api_responsablesGuardarSector(sector, filas) {
  try {
    var sec = Utl_texto(sector).toUpperCase();
    var profesionales = Profesionales_catalogo();
    var val = Responsables_validarSector(sec, filas, profesionales);
    if (!val.ok) return { ok: false, errores: val.errores };
    var resto = _responsables_leer().filter(function (r) { return r.sector !== sec; });
    var nuevas = (filas || []).map(function (f) {
      return { sector: sec, codigo: Utl_texto(f.codigo).trim().toUpperCase(),
               nombre: Utl_texto(f.nombre).trim(), correo: Utl_texto(f.correo).trim(),
               activo: f.activo !== false };
    });
    _responsables_escribirTodo(resto.concat(nuevas));
    Log_info('Responsables', 'guardarSector', sec + ' → ' + nuevas.length +
      (val.inactivos.length ? ' (inactivos catálogo: ' + val.inactivos.join(',') + ')' : ''));
    Log_flush();
    return { ok: true, cantidad: nuevas.length, inactivos: val.inactivos };
  } catch (e) {
    Log_error('Responsables', 'guardarSector', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Navegación a hoja por nombre, con whitelist del diseño del libro.
 *  CONFIG queda EXCLUIDA: se administra solo vía el diálogo (menú/función). */
function api_irA(nombreHoja) {
  try {
    var permitidas = {};
    MODELO_DISENO.forEach(function (d) { permitidas[d.nombre] = true; });
    var nombre = Utl_texto(nombreHoja).trim();
    if (!permitidas[nombre] || nombre === HOJAS.CONFIG)
      return { ok: false, motivo: 'HOJA_NO_PERMITIDA' };
    var h = Modelo_hoja(nombre);
    if (!h) return { ok: false, motivo: 'HOJA_NO_EXISTE' };
    if (h.isSheetHidden()) h.showSheet();
    Modelo_ss().setActiveSheet(h);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Resumen operativo real para el Centro de Control (una llamada). */
function api_centroResumen() {
  try {
    var tz = _UI_tz();
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    // LECTORES LIGEROS: solo los campos que el panel necesita (evita alocar
    // objetos completos de PACIENTES ~30 cols y EVENTOS ~20 por cada apertura).
    var pacientes = Modelo_leerPacientesCampos(
      ['SECTOR', 'REQUIERE_REVISION', 'ESTRATIFICACION', 'FECHA_ACTUALIZACION']);
    var eventos = Modelo_leerEventosCampos(
      ['TIPO_EVENTO', 'SECTOR', 'FECHA_EVENTO', 'NOMBRE']);

    /* Contar conflictos abiertos directamente desde CONFLICTOS (sin re-leer PACIENTES) */
    var cola = 0;
    try {
      var hojaC = Modelo_hoja(HOJAS.CONFLICTOS);
      if (hojaC && hojaC.getLastRow() >= 2) {
        var filasC = Utl_leerBloque(hojaC).slice(1);
        for (var ci = 0; ci < filasC.length; ci++) {
          if (Utl_texto(filasC[ci][8]) === 'ABIERTO') cola++;
        }
      }
    } catch (eR) {}

    var r = _centro_resumen(pacientes, eventos, hoyIso, tz);
    r.ok = true;
    r.colaRevision = cola;
    r.ultimaAct = r._ultimaActF
      ? Utilities.formatDate(r._ultimaActF, tz, 'dd/MM/yyyy HH:mm')
      : 'sin cambios';
    delete r._ultimaActF;
    r.fechaIso = hoyIso;
    r.horaIso = Utilities.formatDate(new Date(), tz, 'HH:mm');
    return r;
  } catch (e) {
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Zona horaria del script cacheada por invocación (getScriptTimeZone() es
 *  un RPC; cachear la evita en maps masivos sobre pacientes/eventos).
 *  Mismo patrón que _MEMO_HOJAS y _UI_CACHE. */
var _TZ_CACHE = '';
function _UI_tz() {
  if (!_TZ_CACHE && typeof Session !== 'undefined' && Session.getScriptTimeZone) {
    try { _TZ_CACHE = Session.getScriptTimeZone(); } catch (e) { _TZ_CACHE = 'America/Santiago'; }
  }
  return _TZ_CACHE;
}

/** Fecha → 'YYYY-MM-DD' en zona horaria del proyecto (nunca UTC por defecto).
 *  Acepta tz explícito (el del llamador) para evitar reconsultar por fila. */
function _ui_isoFecha(v, tz) {
  var t = tz || _UI_tz();
  if (v instanceof Date) return Utilities.formatDate(v, t, 'yyyy-MM-dd');
  return Utl_texto(v).slice(0, 10);
}

/** CONFIG de controles en UNA lectura de CONFIG: {freq, aviso}.
 *  Antes cada endpoint leía CONFIG 2 veces: Control_leerFrecuencia() + el
 *  barrido de AVISO_CONTROL_DIAS. Sin caché módulo: la administración puede
 *  escribir CONFIG en la misma sesión. Fallback idéntico a la versión doble
 *  (frecuencia por defecto y aviso=7 cuando CONFIG no existe o no define). */
var _CONTROL_CAMPOS_PACIENTES = ['ID_INTERNO', 'NOMBRE', 'RUT', 'SECTOR',
  'ESTRATIFICACION', 'ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO', 'FECHA_NACIMIENTO'];
function _UI_controlConfig() {
  var aviso = 7, bloque = [];
  try {
    var hC = Modelo_hoja(HOJAS.CONFIG);
    if (hC && hC.getLastRow() > 1) bloque = Utl_leerBloque(hC);
  } catch (e) {}
  var freq = Control_frecuenciaConfig(bloque);
  if (bloque.length > 1) {
    bloque.slice(1).forEach(function (f) {
      if (Utl_texto(f[0]) === 'AVISO_CONTROL_DIAS') aviso = parseInt(f[1], 10) || 7;
    });
  }
  return { freq: freq, aviso: aviso };
}

/* ---------------------- Panel de Control: controles por persona ---------------------- */

/** Endpoint: consulta "Controles por persona" BAJO DEMANDA y paginada.
 *  No lista población al inicializar: hace falta sector y/o término explícito.
 *  Filtros sobre paciente (sector + término por ID/RUT/nombre) y luego límite.
 *  @param {Object} [opts] — {sector, termino, inicio, limite}
 *  @returns {{ok:boolean, filas:Array, total:number, desde:number, hasta:number,
 *             limite:number, sectores:Array, fechaIso:string}} */
function api_controlPanel(opts) {
  try {
    var p = opts || {};
    if (typeof p === 'string') p = { sector: p }; // compat con firma antigua
    var tz = _UI_tz();
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var pacientes = Modelo_leerPacientesCampos(_CONTROL_CAMPOS_PACIENTES);
    var cfg = _UI_controlConfig();
    var freq = cfg.freq;
    var aviso = cfg.aviso;
    var res = Control_consultarControles(pacientes, freq, hoyIso, p, aviso);
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
    Log_error('PanelControl', 'listar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint: actualiza ÚLTIMO CONTROL / ÚLTIMO SEGUIMIENTO de una persona y
 *  recalcula PRÓXIMO_CONTROL si corresponde (frecuencia de CONFIG).
 *  Además, crea el EVENTO correspondiente (fuente de verdad única). */
function api_controlActualizarUltimo(idInterno, tipo, fechaIso) {
  try {
    var tipoUp = Utl_texto(tipo).toUpperCase();
    if (tipoUp !== 'CONTROL' && tipoUp !== 'SEGUIMIENTO') return { ok: false, motivo: 'TIPO_INVALIDO' };
    var nf = Norm_normalizarFecha(fechaIso);
    if (nf.estado !== 'VALIDA') return { ok: false, motivo: 'FECHA_INVALIDA' };
    var encontrado = Modelo_buscarPaciente(idInterno);
    if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
    var objetivo = encontrado.obj, idx = encontrado.idx;
    var freq = _UI_controlConfig().freq;
    var evento = {
      ID_EVENTO: Ev_nuevoId(),
      ID_INTERNO: objetivo.ID_INTERNO,
      RUT: objetivo.RUT,
      NOMBRE: objetivo.NOMBRE,
      FECHA_EVENTO: nf.iso,
      TIPO_EVENTO: tipoUp,
      SECTOR: objetivo.SECTOR,
      RIESGO_G: objetivo.ESTRATIFICACION || '',
      PROFESIONAL: '',
      PROFESIONAL_TIPO: '',
      DESCRIPCION: tipoUp === 'CONTROL' ? 'Control agendado desde Panel' : 'Seguimiento agendado desde Panel',
      CANTIDAD: '',
      OBSERVACIONES: '',
      FUENTE: 'UI_PANEL_CONTROL',
      REGISTRADO_POR: _ingresosUsuarioActual(),
      FECHA_REGISTRO: null
    };
    Modelo_agregarEventos([evento], _ingresosUsuarioActual(), { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'panel-control' });
    if (tipoUp === 'CONTROL') {
      objetivo.ULTIMO_CONTROL = nf.iso;
      var prox = Control_calcularProximo(nf.iso, objetivo.ESTRATIFICACION, freq);
      if (prox) objetivo.PROXIMO_CONTROL = prox;
    } else {
      objetivo.ULTIMO_SEGUIMIENTO = nf.iso;
    }
    objetivo.FECHA_ACTUALIZACION = new Date();
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    hojaP.getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), 1, 1, MODELO_PACIENTE.length)
         .setValues([Modelo_filaDesdeObjeto(objetivo)]);
    Modelo_refrescarVistasSectores();
    Log_info('PanelControl', 'actualizarUltimo', tipoUp + ' → ' + objetivo.ID_INTERNO + ' (evento ' + evento.ID_EVENTO + ')');
    Log_flush();
    return { ok: true, proximo: objetivo.PROXIMO_CONTROL || '', evento: { id: evento.ID_EVENTO, fecha: evento.FECHA_EVENTO, tipo: evento.TIPO_EVENTO } };
  } catch (e) {
    Log_error('PanelControl', 'actualizarUltimo', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Campos mínimos del Diagnóstico de control: los que consumen
 *  Control_analizar, Control_filasPanel y el barrido de desalineados
 *  (= _CONTROL_CAMPOS_PACIENTES + PROXIMO_CONTROL). */
var _DIAGNOSTICO_CAMPOS_PACIENTES = _CONTROL_CAMPOS_PACIENTES.concat(['PROXIMO_CONTROL']);
/** Campos mínimos del análisis de duplicados Amarillo (FUENTE + entidad + fecha). */
var _DIAGNOSTICO_CAMPOS_EVENTOS_AMARILLO = ['ID_INTERNO', 'TIPO_EVENTO', 'FECHA_EVENTO', 'FUENTE', 'NOMBRE', 'SECTOR'];

/** Diagnóstico integral del modelo clínico de control (dry-run por defecto).
 *  NO modifica datos cuando dryRun=true (default). Devuelve métricas reales,
 *  alertas de PROXIMO_CONTROL, estado del sector Amarillo y acciones sugeridas. */
function api_diagnosticoControl(dryRun) {
  try {
    var tz = _UI_tz();
    var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    var pacientes = Modelo_leerPacientesCampos(_DIAGNOSTICO_CAMPOS_PACIENTES);
    var cfg = _UI_controlConfig();
    var freq = cfg.freq;
    var aviso = cfg.aviso;
    var anal = Control_analizar(pacientes, freq, hoyIso, aviso);
    var panel = Control_filasPanel(pacientes, freq, hoyIso, aviso);

    var inconsistentes = [];
    panel.filas.forEach(function (f) {
      if (!f.ultimoControl) return;
      if (f.estado === 'SIN_FECHA' && !f.proximo) {
        inconsistentes.push(f.idInterno + ': con último control pero sin próximo calculable');
      }
    });

    /* Alertas de PROXIMO_CONTROL desalineado: el actual difiere del derivado */
    var desalineados = 0, ejemplosDes = [];
    pacientes.forEach(function (p) {
      var deriv = Control_calcularProximo(p.ULTIMO_CONTROL, p.ESTRATIFICACION, freq);
      var actual = Utl_texto(p.PROXIMO_CONTROL).slice(0, 10);
      if (p.ULTIMO_CONTROL && deriv && actual && actual !== deriv) {
        desalineados++;
        if (ejemplosDes.length < 5) ejemplosDes.push(p.ID_INTERNO + ': ' + actual + ' ≠ ' + deriv);
      }
    });

    var dedupSr = null;
    try {
      var eventoAmarillo = Modelo_leerEventosCampos(_DIAGNOSTICO_CAMPOS_EVENTOS_AMARILLO).filter(function (e) {
        return Utl_texto(e.SECTOR).toUpperCase() === 'AMARILLO';
      });
      dedupSr = Amarillo_analizarDuplicados(eventoAmarillo);
    } catch (eD) {}

    /* Acciones sugeridas (solo lectura, no se ejecutan aquí) */
    var acciones = [];
    var m = anal.metricas;
    if (m.sinUltimoControl > 0) acciones.push('Registrar últimos controles de ' + m.sinUltimoControl + ' persona(s) sin último control.');
    if (m.vencidos > 0) acciones.push(m.vencidos + ' control(es) vencidos: priorizar gestión por sector.');
    if (m.configFaltante > 0) acciones.push('Revisar frecuencia configurada (hay ' + m.configFaltante + ' cálculo(s) sin próximo control).');
    if (desalineados > 0) acciones.push(desalineados + ' PRÓXIMO_CONTROL desalineado(s) con la frecuencia configurada — ejecutar «🔄 Actualizar todo».');
    if (dedupSr && dedupSr.gruposDuplicados > 0) acciones.push(dedupSr.gruposDuplicados + ' grupo(s) de duplicados en eventos Amarillo — revisar dedup.');
    if (!acciones.length) acciones.push('Modelo clínico de control consistente: sin acciones pendientes.');

    if (dryRun === false) {
      /* Aplicativo: corrige PROXIMO_CONTROL derivado (idempotente). */
      var res = Control_recalcularTodos();
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
    Log_error('Diagnostico', 'control', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/**
 * Endpoint dashboard: UNA sola llamada con todo lo necesario para que el
 * cliente filtre localmente y la UI reaccione instantánea. Payload mínimo
 * por fila; sin datos derivados precalculados (#25: se computan en cliente).
 */
function api_dashboardDatos() {
  try {
    var tz = _UI_tz();
    var pacientes = Modelo_leerPacientesCampos(
      ['SECTOR', 'ESTRATIFICACION', 'REQUIERE_REVISION', 'CONDICIONES', 'FECHA_INGRESO', 'PROXIMO_CONTROL'])
      .map(function (p) {
        return { sector: Utl_texto(p.SECTOR), est: Utl_texto(p.ESTRATIFICACION),
                 rev: (p.REQUIERE_REVISION === true || p.REQUIERE_REVISION === 'TRUE'),
                 cond: Utl_texto(p.CONDICIONES), fi: _ui_isoFecha(p.FECHA_INGRESO, tz),
                 pc: _ui_isoFecha(p.PROXIMO_CONTROL, tz) };
      });
    var eventos = Modelo_leerEventosCampos(['TIPO_EVENTO', 'SECTOR', 'FECHA_EVENTO'])
      .map(function (e) {
        return { tipo: Utl_texto(e.TIPO_EVENTO), sector: Utl_texto(e.SECTOR),
                 f: _ui_isoFecha(e.FECHA_EVENTO, tz) };
      });
    var catalogo = CATALOGO_CONDICIONES_ECICEP.filter(function (c) { return c.ACTIVA; })
      .map(function (c) { return { codigo: c.CODIGO, nombre: c.NOMBRE_CANONICO }; });
    return { ok: true, pacientes: pacientes, eventos: eventos, catalogo: catalogo,
             generadoEn: _ui_isoFecha(new Date(), tz) };
  } catch (e) {
    Log_error('Dashboard', 'api_dashboardDatos', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint vista de trabajo REM: calcula el informe AL VUELO (modo MES o
 *  GENERAL) sin leer ni crear la hoja REM_SALIDA. Solo lectura de PACIENTES y
 *  EVENTOS; 100% serializable. Modo 'MES' → Bloque A + censo con indicadores
 *  del mes; 'GENERAL' → censo histórico del sector. `actividad` restringe el
 *  censo a pacientes con al menos un evento en el período ('' = todos). */
function api_remVista(anio, mes, sector, modo, actividad) {
  try {
    anio = Number(anio); mes = Number(mes);
    if (!anio || !mes || mes < 1 || mes > 12) throw new Error('PERIODO_INVALIDO');
    var filtro = Rem_bucketSector(Utl_texto(sector).trim() === '' ? 'todos' : sector);
    var datos = _rem9_datos(anio, mes, filtro);
    var v = Rem9_armarVistaDatos(datos, {
      anio: anio, mes: mes, sector: filtro,
      modo: Utl_texto(modo).toUpperCase() === 'GENERAL' ? 'GENERAL' : 'MES',
      actividad: (actividad === true || actividad === 1 || actividad === '1' || actividad === 'true')
    });
    Log_info('REM', 'vista', v.meta.modo + ' · ' + filtro + ' · pacientes=' + v.meta.pacientes +
             ' · atenciones=' + v.meta.atenciones);
    Log_flush();
    return { ok: true, tablas: v.tablas, notas: v.notas, meta: v.meta };
  } catch (e) {
    Log_error('REM', 'vista', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint sidebar: búsqueda por RUT exacto o nombre (no agresiva). */
function api_buscar(termino) {
  return Bus_buscarPacientes(
    Modelo_leerPacientesCampos(['ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'ESTADO', 'ESTRATIFICACION']),
    termino, 25).map(function (p) {
    return { id: p.ID_INTERNO, rut: p.RUT, nombre: p.NOMBRE,
             sector: p.SECTOR, estado: p.ESTADO, estrat: p.ESTRATIFICACION };
  });
}

/** Endpoint sidebar: ficha consolidada + historial desde EVENTOS.
 *  Contrato: NUNCA retorna null/undefined. Siempre retorna {ok:true|false,...}
 */
function api_ficha(idInterno) {
  try {
    var pacientes = Modelo_leerPacientesCampos(_FICHA_CAMPOS_OPERATIVOS);
    var paciente = null;
    var idNormalizado = Utl_texto(idInterno).trim();

    for (var i = 0; i < pacientes.length; i++) {
      var idSheet = Utl_texto(pacientes[i].ID_INTERNO).trim();
      if (idSheet === idNormalizado) { paciente = pacientes[i]; break; }
    }

    if (!paciente) {
      return {
        ok: false,
        code: 'PACIENTE_NO_ENCONTRADO',
        message: 'No se encontró paciente con ID_INTERNO=' + JSON.stringify(idNormalizado),
        totalLeidos: pacientes.length
      };
    }

    var eventos = [];
    try {
      eventos = Modelo_leerEventosCampos(['ID_INTERNO', 'FECHA_EVENTO', 'TIPO_EVENTO',
        'SECTOR', 'RIESGO_G', 'PROFESIONAL', 'DESCRIPCION']).filter(function (e) {
        return Utl_texto(e.ID_INTERNO) === Utl_texto(idNormalizado);
      }).sort(function (a, b) {
        return Utl_texto(a.FECHA_EVENTO) < Utl_texto(b.FECHA_EVENTO) ? -1 :
               Utl_texto(a.FECHA_EVENTO) > Utl_texto(b.FECHA_EVENTO) ? 1 : 0;
      });
    } catch (evErr) {
      console.warn('Error leyendo eventos para ficha:', evErr.message);
      // continuar sin eventos pero con datos del paciente
    }

    var ficha = {};
    _FICHA_CAMPOS_OPERATIVOS.forEach(function (c) {
      var v = paciente[c];
      // convertir Date objects a ISO string para serialización
      if (v instanceof Date) {
        v = v.getFullYear() + '-' + ('0'+(v.getMonth()+1)).slice(-2) + '-' + ('0'+v.getDate()).slice(-2);
      }
      ficha[c] = v !== undefined && v !== null ? v : '';
    });

    ficha.EDAD = Utl_edadDesde(paciente.FECHA_NACIMIENTO);
    ficha.eventos = eventos.map(function (e) {
      var fechaEv = e.FECHA_EVENTO;
      if (fechaEv instanceof Date) {
        fechaEv = fechaEv.getFullYear() + '-' + ('0'+(fechaEv.getMonth()+1)).slice(-2) + '-' + ('0'+fechaEv.getDate()).slice(-2);
      }
      return { fecha: fechaEv, tipo: e.TIPO_EVENTO, sector: e.SECTOR,
               riesgo: e.RIESGO_G, profesional: e.PROFESIONAL, descripcion: e.DESCRIPCION };
    });

    /* Catálogo e información de selección en la MISMA llamada (menos RPC) */
    ficha.dupla = {
      catalogo: Profesionales_catalogo().filter(function (c) { return c.ACTIVO; })
        .map(function (c) { return { CODIGO: c.CODIGO, NOMBRE: c.NOMBRE }; }),
      seleccionados: (Utl_texto(paciente.DUPLA_INGRESO).split(';').map(function (s) {
        return s.trim().toUpperCase(); }).filter(function (s) { return s; }))
    };
    ficha.patologias = {
      catalogo: CATALOGO_CONDICIONES_ECICEP.filter(function (c) { return c.ACTIVA; }).map(function (c) {
        return { codigo: c.CODIGO, nombre: c.NOMBRE_CANONICO, peso: c.PONDERACION }; }),
      seleccionadas: paciente.CONDICIONES ? Utl_texto(paciente.CONDICIONES).split(';').filter(Boolean) : [],
      otrasPatologias: paciente.OTRAS_PATOLOGIAS ? Utl_texto(paciente.OTRAS_PATOLOGIAS) : ''
    };

    /* Seguimiento y controles consolidados (misma fuente que el Panel).
       Recalcula PRÓXIMO_CONTROL derivado, estado, color y recordatorio. */
    try {
      var tz = _UI_tz();
      var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      var cfg = _UI_controlConfig();
      var freq = cfg.freq;
      var aviso = cfg.aviso;
      var filasSeg = Control_filasPanel([paciente], freq, hoyIso, aviso).filas;
      ficha.seguimiento = (filasSeg && filasSeg[0]) || null;
    } catch (e) {
      ficha.seguimiento = null;
    }

    return { ok: true, ficha: ficha };

  } catch (e) {
    return {
      ok: false,
      code: 'ERROR_BACKEND',
      message: e && e.message ? e.message : String(e)
    };
  }
}

/** Endpoint sidebar: registra un evento para un paciente existente y
 *  sincroniza la caché de estado vigente en PACIENTES. */
function api_registrarEvento(payload) {
  try {
    var p = payload || {};
    if (TIPOS_EVENTO.VALIDOS.indexOf(p.tipoEvento) === -1) return { ok: false, motivo: 'TIPO_INVALIDO' };
    var fecha = Norm_normalizarFecha(p.fecha);
    if (fecha.estado !== 'VALIDA') return { ok: false, motivo: 'FECHA_INVALIDA' };

    var encontrado = Modelo_buscarPaciente(p.idInterno);
    if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
    var objetivo = encontrado.obj;
    var idx = encontrado.idx;

    var evento = {
      ID_EVENTO: Ev_nuevoId(),
      ID_INTERNO: objetivo.ID_INTERNO,
      RUT: objetivo.RUT,
      NOMBRE: objetivo.NOMBRE,
      FECHA_EVENTO: fecha.iso,
      TIPO_EVENTO: p.tipoEvento,
      SECTOR: objetivo.SECTOR,
      RIESGO_G: objetivo.ESTRATIFICACION || '',
      PROFESIONAL: p.profesional || '',
      PROFESIONAL_TIPO: '',
      DESCRIPCION: p.descripcion || '',
      CANTIDAD: '',
      OBSERVACIONES: p.observaciones || '',
      FUENTE: p.fuente || 'UI_FICHA',
      REGISTRADO_POR: (p.registradoPor !== undefined && p.registradoPor !== null)
        ? p.registradoPor : _ingresosUsuarioActual(),
      FECHA_REGISTRO: null
    };
    Modelo_agregarEventos([evento], _ingresosUsuarioActual(), { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'ficha-registro' });

    var freqReg = _UI_controlConfig().freq;
    Ingresos_sincronizarCache(objetivo, evento, freqReg);
    var esquema = Modelo_asegurarEsquemaPacientes();
    if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    hojaP.getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), 1, 1, MODELO_PACIENTE.length)
         .setValues([Modelo_filaDesdeObjeto(objetivo)]);

    Modelo_refrescarVistasSectores();
    Log_info('Ficha', 'registrarEvento', evento.TIPO_EVENTO + ' → ' + evento.ID_INTERNO);
    Log_flush();
    return { ok: true, evento: { tipo: evento.TIPO_EVENTO, fecha: evento.FECHA_EVENTO } };
  } catch (e) {
    Log_error('Ficha', 'registrarEvento', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** Endpoint sidebar: lista casos ABIERTOS con comparación origen vs candidato. */
function api_revisionListar() {
  var hoja = Modelo_hoja(HOJAS.CONFLICTOS);
  if (!hoja || hoja.getLastRow() < 2) return { casos: [], metricas: {} };
  var pacientes = Modelo_leerPacientesCampos(['ID_INTERNO', 'RUT', 'NOMBRE', 'TELEFONOS', 'SECTOR', 'ESTRATIFICACION', 'ESTADO']);
  var porId = {};
  pacientes.forEach(function (p) { porId[Utl_texto(p.ID_INTERNO)] = p; });

  var casos = [], metricas = { abiertos: 0, resueltos: 0, esMismo: 0, esOtro: 0, pendientes: 0 };
  Utl_leerBloque(hoja).slice(1).forEach(function (f, i) {
    var estado = Utl_texto(f[8]);
    if (estado === 'RESUELTO') {
      metricas.resueltos += 1;
      var dec = Utl_texto(f[6]).indexOf('CONFIRMAR') !== -1 ? 'esMismo' : 'esOtro';
      metricas[dec] += 1;
      return;
    }
    if (estado !== 'ABIERTO') return;
    var datos = null;
    try { datos = JSON.parse(f[5]); } catch (e) { return; }
    if (!datos) return;
    metricas.abiertos += 1;

    // buscar candidato
    var cand = datos.candidatoId ? porId[datos.candidatoId] : null;
    var vo = datos.valoresOriginales || {};
    casos.push({
      indice: i + 2,
      tipo: f[1],
      criterio: datos.criterio || '',
      confianza: datos.confianza || '',
      idProvisional: datos.idProvisional || '',
      // lado A: registro origen
      origen: {
        nombre: vo.NOMBRE || '', rut: vo.RUT || '', telefono: vo.TELEFONOS || '',
        sector: datos.sectorOrigen || '', estrat: vo.ESTRATIFICACION || '',
        fechaIngreso: vo.FECHA_INGRESO || '',
        fuente: (datos.origen ? datos.origen.hoja : '') + ' fila ' + (datos.origen ? datos.origen.fila : '')
      },
      // lado B: paciente candidato existente
      candidato: cand ? {
        id: cand.ID_INTERNO, nombre: cand.NOMBRE, rut: cand.RUT,
        telefono: cand.TELEFONOS, sector: cand.SECTOR,
        estrat: cand.ESTRATIFICACION, estado: cand.ESTADO
      } : null
    });
  });
  metricas.pendientes = metricas.abiertos;
  return { casos: casos, metricas: metricas };
}

/** Endpoint sidebar: aplica la decisión humana sobre un caso ABIERTO. */
function api_revisionResolver(indiceHoja, decision) {
  try {
    var hoja = Modelo_hoja(HOJAS.CONFLICTOS);
    if (!hoja) return { ok: false, motivo: 'SIN_HOJA' };
    // Lectura única del bloque: la fila del caso y (si aplica) las hermanas del
    // mismo origen se derivan del mismo getDataRange (una lectura por acción).
    var bloqueConflictos = Utl_leerBloque(hoja);
    if (!bloqueConflictos.length) return { ok: false, motivo: 'SIN_DATOS' };
    var filaVal = bloqueConflictos[indiceHoja - 1] || [];
    if (Utl_texto(filaVal[8]) !== 'ABIERTO') return { ok: false, motivo: 'CONFLICTO_YA_RESUELTO' };
    var datos = JSON.parse(filaVal[5]);
    if (decision !== 'CONFIRMAR_MATCH' && decision !== 'RECHAZAR_MATCH') {
      return { ok: false, motivo: 'DECISION_INVALIDA' };
    }

    var prep = Rev_prepararResolucion(datos, decision, { nuevoId: Modelo_nuevoIdInterno });
    if (!prep.ok) return { ok: false, motivo: prep.motivo };

    var contexto = { autorizacion: 'IMPORT_AUTORIZADO', operacion: 'revision-' + decision.toLowerCase() };
    var destinoId = '';
    if (prep.accion === 'CREAR') {
      Modelo_agregarPacientes([prep.pacienteNuevo], contexto);
      destinoId = prep.pacienteNuevo.ID_INTERNO;
    } else {
      destinoId = datos.candidatoId;
    }
    Modelo_agregarEventos([prep.evento], _ingresosUsuarioActual(), contexto);

    // trazabilidad completa (columnas 9-10 contiguas: una escritura)
    var ahora = new Date();
    hoja.getRange(indiceHoja, 9, 1, 2).setValues([
      ['RESUELTO', _ingresosUsuarioActual() + ' · ' + decision +
        ' · ' + ahora.toISOString() + ' → ' + destinoId]
    ]);

    // hermanas duplicadas de la MISMA fila origen (idempotencia por origen):
    // se cierran sin reprocesar — la decisión ya se aplicó una sola vez.
    // Escritura por bloques contiguos (regla del proyecto: no celdas en loops).
    var claveOrig = Rev_claveOrigen(datos);
    var hermanas = 0;
    var filasHermana = [];
    if (claveOrig && bloqueConflictos.length > 1) {
      bloqueConflictos.slice(1).forEach(function (sf, i) {
        var filaAbs = i + 2;
        if (filaAbs === indiceHoja) return;
        if (Utl_texto(sf[8]) !== 'ABIERTO') return;
        if (Rev_claveOrigenDesdeFila(sf) !== claveOrig) return;
        filasHermana.push(filaAbs);
        hermanas++;
      });
    }
    if (filasHermana.length) {
      var usuarioRev = _ingresosUsuarioActual();
      Utl_gruposContiguosFilas(filasHermana).forEach(function (grupo) {
        var n = grupo.length;
        // columnas 9-10 contiguas (estado + trazabilidad): un solo setValues
        var traza2 = [];
        for (var i = 0; i < n; i++) {
          traza2.push(['RESUELTO', usuarioRev + ' · ' + decision + ' · ' + ahora.toISOString() +
            ' → ' + destinoId + ' (hermana del mismo origen)']);
        }
        hoja.getRange(grupo[0], 9, n, 2).setValues(traza2);
      });
    }

    Modelo_refrescarVistasSectores();
    Log_info('Revision', decision, prep.accion + ' · caso fila ' + indiceHoja + ' → ' + destinoId +
      (hermanas ? ' · +' + hermanas + ' hermanas del mismo origen' : ''));
    Log_flush();
    return { ok: true, accion: prep.accion, destinoId: destinoId };
  } catch (e) {
    Log_error('Revision', decision, e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

/** FASE 4.0 — limpieza segura del dataset ficticio. */
function UI_vaciarDatosPrueba() {
  var ui = _UI_get();
  var colecta = Limpieza_colectar();

  // cuenta pacientes/eventos afectados ANTES de borrar nada
  var ruts = colecta.ruts;
  var pacientes = Modelo_leerPacientes().filter(function (p) { return Limpieza_esPacienteDePrueba(p, ruts); });
  var ids = {};
  pacientes.forEach(function (p) { ids[Utl_texto(p.ID_INTERNO)] = true; });
  var eventos = Modelo_leerEventos().filter(function (e) {
    return (ids[Utl_texto(e.ID_INTERNO)] || ruts.indexOf(Utl_texto(e.RUT).toUpperCase()) !== -1) &&
           Utl_texto(e.FUENTE).indexOf('HOJA_INGRESO') === 0;
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

  var r = Limpieza_ejecutar(colecta);
  Log_info('UI', 'vaciarDatosPrueba', JSON.stringify(r));
  Log_flush();
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

function UI_analisisCarga() {
  Utl_toast('info', 'Analizando fuentes reales (no escribe nada)…', 15);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r = Fuentes_cargaReal({ ejecutar: false });
  var res = r.resumen;

  var hojaR = ss.getSheetByName('CARGA_ANALISIS');
  if (!hojaR) hojaR = ss.insertSheet('CARGA_ANALISIS');
  hojaR.clearContents();
  Utl_escribirBloque(hojaR, 1, 1, [[
    'FUENTE|HOJA','FILA','VALIDACIÓN','RUT','NOMBRE','SECTOR','ESTRAT','GATE','NOTA'
  ]]);
  r.detalle.forEach(function (d, i) {
    Utl_escribirBloque(hojaR, i + 2, 1, [[
      d.fuenteOrigen || '', d.fila || '', d.estado || '', d.rut || '',
      d.nombre || '', d.sector || '', d.estratificacion || '',
      d.gate || '', d.nota || ''
    ]]);
  });

  Log_info('UI', 'analisisCarga', JSON.stringify(res));
  Log_flush();
  ss.setActiveSheet(hojaR);
  var ui = _UI_get();
  ui.alert(
    'ANÁLISIS DE CARGA — DRY RUN (no escribió nada)\n\n' +
    'Registros pendientes: ' + (res.leidos - (res.yaImportadas || 0)) + '\n\n' +
    Ingresos_resumenTexto(res) + '\n\n' +
    'Para escribir la carga usa 🚀 EJECUTAR CARGA REAL.');
}

function UI_ejecutarCarga() {
  var ui = _UI_get();
  var resp = ui.alert(
    '🚀 EJECUTAR CARGA REAL',
    'Esto escribirá datos REALES en PACIENTES y EVENTOS.\n\n' +
    'Se procesarán únicamente las hojas autorizadas.\n' +
    'Los errores y REQUIERE_REVISION quedan excluidos.\n' +
    'La operación tiene idempotencia (no duplica).\n\n' +
    '¿Confirmas la ejecución?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  Utl_toast('info', 'Cargando…', 30);

  var r = Fuentes_cargaReal({ ejecutar: true });
  var res = r.resumen;

  Log_info('UI', 'ejecutarCarga', JSON.stringify({
    leidos: res.leidos, nuevos: res.nuevos, existentes: res.existentes,
    revision: res.revision, conError: res.conError, eventos: res.eventosCreados
  }));
  Log_flush();

  var texto = Ingresos_resumenTexto(res);
  if ((res.revision || 0) > 0) texto += '\n\n⚠ ' + res.revision + ' caso(s) en la Cola de revisión.';
  ui.alert('CARGA COMPLETADA ✓\n\n' + texto);
}

// ===========================================================================
// ETAPA 5-INCIDENTE — Recuperación selectiva
// ===========================================================================

function UI_recuperarInventario() {
  var ui = _UI_get();
  var resp = ui.prompt(
    'RECUPERACIÓN — Paso 1: Inventario',
    'Pega el prefijo de fuente a investigar\n(ej: ECICEP NARANJO o PCTS. ECICEP):',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var prefijo = resp.getResponseText().trim();
  if (!prefijo) return;

  var conteo = Recuperar_inventario(prefijo);
  var hoja = Modelo_ss().getSheetByName('RECUPERACION');
  if (hoja) Modelo_ss().setActiveSheet(hoja);
  ui.alert(
    'INVENTARIO GENERADO\n\n' +
    'Pacientes afectados: ' + conteo.pacientes + '\n' +
    'Eventos afectados: ' + conteo.eventos + '\n\n' +
    'Revisa la hoja RECUPERACION.\n' +
    'Si confirmas que TODOS deben eliminarse,\n' +
    'usa ⚠️ Recuperación: ejecutar reversión.');
}

function UI_recuperarEjecutar() {
  var ui = _UI_get();
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

  var r = Recuperar_ejecutar(prefijo);
  ui.alert(
    'REVERSIÓN COMPLETADA\n\n' +
    'Pacientes eliminados: ' + r.pacientesEliminados + '\n' +
    'Eventos eliminados: ' + r.eventosEliminados + '\n' +
    'SECTOR_* refrescadas.');
}

// ===========================================================================
// Esquema PACIENTES — migración manual/verificable desde el menú
// ===========================================================================

function UI_migrarEsquemaPacientes() {
  var ui = _UI_get();
  try {
    var r = Modelo_asegurarEsquemaPacientes();
    if (!r.ok) {
      ui.alert('❌ ESQUEMA INCOMPATIBLE\n\n' + r.motivo +
        '\n\nNO se modificó nada.\nRevisar los encabezados de PACIENTES manualmente.');
      return;
    }
    var repar = Modelo_repararCamposTecnicos();
    if (!r.migrada && repar.reparados === 0 && repar.marcadosRevision === 0) {
      ui.alert('✅ TODO LIMPIO\n\nEsquema alineado (' + Modelo_campos().length +
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
function UI_diagnosticoTrazabilidad() {
  var ui = _UI_get();
  try {
    var r = Modelo_diagnosticoTrazabilidad();
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
// REM mensual — la interfaz oficial es el dialog RemGenerador (UI_generarRem,
// definido junto a los demás openers). Esta sección se conserva vacía a
// propósito: la generación vive en 14_REM.js y la UI en RemGenerador.html.
// ===========================================================================

// ===========================================================================
// ETAPA 8E — Selector de patologías ECICEP
// ===========================================================================

/** Endpoint sidebar: devuelve catálogo + condiciones actuales del paciente. */
function api_patologiasAbrir(idInterno) {
  var catalogo = CATALOGO_CONDICIONES_ECICEP.filter(function (c) { return c.ACTIVA; }).map(function (c) {
    return { codigo: c.CODIGO, nombre: c.NOMBRE_CANONICO, peso: c.PONDERACION };
  });
  var pacientes = Modelo_leerPacientesCampos(['ID_INTERNO', 'CONDICIONES', 'OTRAS_PATOLOGIAS']);
  var paciente = null;
  for (var i = 0; i < pacientes.length; i++) {
    if (Utl_texto(pacientes[i].ID_INTERNO) === Utl_texto(idInterno)) { paciente = pacientes[i]; break; }
  }
  var seleccionadas = paciente && paciente.CONDICIONES ? Utl_texto(paciente.CONDICIONES).split(';').filter(Boolean) : [];
  var otras = paciente && paciente.OTRAS_PATOLOGIAS ? Utl_texto(paciente.OTRAS_PATOLOGIAS) : '';
  return { catalogo: catalogo, seleccionadas: seleccionadas, otrasPatologias: otras };
}

/** PURA: valida que los códigos existan en el catálogo y elimina duplicados. */
function Condiciones_validarSeleccion(codigos, catalogo) {
  var validos = [], invalidos = [];
  var vistos = {};
  (codigos || []).forEach(function (codigo) {
    var limpio = Utl_texto(codigo).toUpperCase().trim();
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

/** Endpoint sidebar: valida y guarda las patologías del paciente. */
function api_patologiasGuardar(idInterno, codigosSeleccionados, otrasPatologias) {
  try {
    var val = Condiciones_validarSeleccion(codigosSeleccionados, CATALOGO_CONDICIONES_ECICEP);
    if (val.invalidos.length) return { ok: false, motivo: 'CÓDIGOS_INVALIDOS', invalidos: val.invalidos };

    var esquema = Modelo_asegurarEsquemaPacientes();
    if (!esquema.ok) return { ok: false, motivo: 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo };

    var encontrado = Modelo_buscarPaciente(idInterno);
    if (!encontrado) return { ok: false, motivo: 'PACIENTE_NO_ENCONTRADO' };
    var idx = encontrado.idx;
    var paciente = encontrado.obj;

    var anteriores = Utl_texto(paciente.CONDICIONES);
    var ahora = new Date();
    paciente.CONDICIONES = val.validos.join(';');
    paciente.OTRAS_PATOLOGIAS = Utl_texto(otrasPatologias).trim();
    paciente.FECHA_ACTUALIZACION = ahora;

    var estratRes = Estrat_evaluar(val.validos.join(';'), CATALOGO_CONDICIONES_ECICEP, CFG_ESTRATIFICACION);
    var estratValor = estratRes.estado === 'CALCULADO' ? String(estratRes.resultado) : '';
    var antEstrat = Utl_texto(paciente.ESTRATIFICACION);
    paciente.ESTRATIFICACION = estratValor;
    paciente.ESTRAT_ORIGEN = String(antEstrat || '');
    paciente.ESTRAT_CALCULADA = String(estratRes.resultado || '');
    paciente.ESTRAT_FECHA_CALCULO = ahora;

    // Condiciones + estratificación en UNA sola escritura de la fila física
    // (antes: dos setValues consecutivos al mismo rango → 1 RPC extra).
    Modelo_hoja(HOJAS.PACIENTES).getRange(Modelo_filaFisica(HOJAS.PACIENTES, idx), 1, 1, MODELO_PACIENTE.length)
         .setValues([Modelo_filaDesdeObjeto(paciente)]);

    Log_info('Patologias', 'guardar', 'paciente=' + idInterno + ' anteriores=[' + anteriores + '] nuevas=[' + val.validos.join(';') + ']');
    Log_flush();

    try { Modelo_refrescarVistasSectores(); } catch (eSec) { /* best effort */ }

    return { ok: true, condiciones: val.validos, cantidad: val.validos.length,
             puntaje: _calcularPuntaje(val.validos),
             estratificacion: estratValor || 'pendiente',
             estratRegla: estratRes.regla || '',
             esquemaMigrado: !!esquema.migrada };
  } catch (e) {
    Log_error('Patologias', 'guardar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}

function _calcularPuntaje(codigos) {
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
  { id: 'hojas',        modulo: 'SISTEMA',    nombre: 'Hojas críticas presentes',      fn: '_pruS_hojas' },
  { id: 'config',       modulo: 'SISTEMA',    nombre: 'CONFIG sembrado',               fn: '_pruS_config' },
  { id: 'menu',         modulo: 'SISTEMA',    nombre: 'Funciones del menú globales',   fn: '_pruS_menu' },
  { id: 'plantillas',   modulo: 'INTERFAZ',   nombre: 'Sidebars y dialogs compilables',fn: '_pruS_plantillas' },
  { id: 'ficha',        modulo: 'INTERFAZ',   nombre: 'Ficha: 5 pestañas y paneles',   fn: '_pruS_ficha' },
  { id: 'estadisticas', modulo: 'INTERFAZ',   nombre: 'Estadísticas operativa',        fn: '_pruS_estadisticas' },
  { id: 'validaciones', modulo: 'DATOS',      nombre: 'Validaciones en INGRESO',       fn: '_pruS_validaciones' },
  { id: 'catalogos',    modulo: 'DATOS',      nombre: 'Catálogo vigencias',            fn: '_pruS_catalogos' },
  { id: 'formatos',     modulo: 'DATOS',      nombre: 'Formato de fechas PACIENTES',   fn: '_pruS_formatos' },
  { id: 'protecciones', modulo: 'DATOS',      nombre: 'Protecciones sistema',          fn: '_pruS_protecciones' },
  { id: 'remDatos',     modulo: 'REM',        nombre: 'REM generado disponible',       fn: '_pruS_remDatos' },
  { id: 'pdf',          modulo: 'REM',        nombre: 'Exportador PDF',                fn: '_pruS_pdf' },
  { id: 'traza',        modulo: 'INTEGRIDAD', nombre: 'Trazabilidad FUENTE',           fn: '_pruS_traza' },
  { id: 'consistencia', modulo: 'INTEGRIDAD', nombre: 'Consistencia entre sectores',   fn: '_pruS_consistencia' },
  { id: 'calidad',      modulo: 'INTEGRIDAD', nombre: 'Calidad de datos (auditoría)',  fn: '_pruS_calidad' },
  { id: 'auditoria',    modulo: 'AUDITORIA',  nombre: 'Auditoría v0.8.8 (dry-run)',    fn: '_pruS_auditoria' }
];

/** Registro para el cliente (checkboxes agrupados por módulo). */
function api_pruebasRegistro() {
  return { ok: true, pruebas: PRUEBAS_SISTEMA };
}

/** Ejecuta SOLO las pruebas pedidas (#9). Cada check es inteligente cuando
 *  puede (#11): evalúa funcionamiento real, no solo existencia. Registra en LOG (#10). */
function api_pruebasSistema(ids) {
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
  Log_info('Pruebas', 'ejecutar', JSON.stringify(resumen), null, Date.now() - t0);
  Log_flush();
  return { ok: true, resultados: resultados, resumen: resumen, duracion: Date.now() - t0 };
}

/* ---- Checks individuales: devuelven {estado:OK|WARN|ERROR|SKIP, detalle} ---- */

function _pruS_hojas() {
  var crit = ['PACIENTES', 'EVENTOS', 'SECTOR_NARANJO', 'SECTOR_AMARILLO',
              'SECTOR_VERDE', 'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];
  var faltan = crit.filter(function (n) { return !Modelo_hoja(n); });
  if (faltan.length) return { estado: 'ERROR',
    detalle: 'Faltan hojas operativas: ' + faltan.join(', ') };

  var problemas = [], okInternas = [];
  MODELO_DISENO.filter(function (d) { return d.oculta; }).forEach(function (d) {
    var h = Modelo_hoja(d.nombre);
    if (!h) { problemas.push('\u274c ' + d.nombre + ' no existe'); return; }
    if (!h.isSheetHidden()) { problemas.push('\u26a0 ' + d.nombre + ' existe pero est\u00e1 VISIBLE'); }
    else okInternas.push(d.nombre + ' oculta \u2713');
  });
  if (problemas.length) return { estado: 'WARN', detalle: problemas.join(' \u00b7 ') };
  return { estado: 'OK',
           detalle: crit.length + ' operativas · internas OK: ' + okInternas.length };
}
function _pruS_config() {
  var h = Modelo_hoja(HOJAS.CONFIG);
  if (!h) return { estado: 'ERROR', detalle: 'Sin hoja CONFIG' };
  var req = ['GENERAL_NOMBRE_SISTEMA', 'GENERAL_INSTITUCION', 'DASHBOARD_TITULO',
             'REM_INCLUIR_INDICADORES', 'PACIENTES_MIN_BUSQUEDA'];
  var valores = {};
  Utl_leerBloque(h).forEach(function (f) { valores[Utl_texto(f[0])] = f[1]; });
  var faltan = req.filter(function (k) { return !(k in valores); });
  return faltan.length
    ? { estado: 'ERROR', detalle: 'Faltan claves: ' + faltan.join(', ') }
    : { estado: 'OK', detalle: req.length + ' claves verificadas' };
}
function _pruS_menu() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  var fns = (UICFG_DIALOGOS || []).map(function (d) { return d.opener; });
  var faltan = fns.filter(function (n) { return typeof G[n] !== 'function'; });
  return faltan.length
    ? { estado: 'ERROR', detalle: 'Ausentes: ' + faltan.join(', ') }
    : { estado: 'OK', detalle: fns.length + ' funciones globales' };
}
function _pruS_plantillas() {
  var errores = [], vistos = {};
  (UICFG_DIALOGOS || []).forEach(function (d) {
    if (vistos[d.plantilla]) return;
    vistos[d.plantilla] = true;
    try {
      var t = HtmlService.createTemplateFromFile(d.plantilla);
      t.modo = 'centro'; t.BUILD = ''; t.ID_INICIAL = '';
      t.evaluate().getContent();
    } catch (e) { errores.push(d.plantilla + ': ' + (e && e.message || e)); }
  });
  return errores.length
    ? { estado: 'ERROR', detalle: errores.join(' · ') }
    : { estado: 'OK', detalle: Object.keys(vistos).length + ' plantillas compilan' };
}
function _pruS_ficha() {
  try {
    var t = HtmlService.createTemplateFromFile('Sidebar');
    t.modo = 'pacientes'; t.BUILD = ''; t.ID_INICIAL = '';
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
function _pruS_estadisticas() {
  /* Verificación ligera (<1s): estructura legible, no el payload completo.
     El payload completo ya lo ejercita el Panel cada vez que se abre. */
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  if (typeof G.api_dashboardDatos !== 'function')
    return { estado: 'ERROR', detalle: 'api_dashboardDatos ausente' };
  var hP = Modelo_hoja(HOJAS.PACIENTES);
  var hE = Modelo_hoja(HOJAS.EVENTOS);
  if (!hP || !hE) return { estado: 'ERROR', detalle: 'Faltan hojas PACIENTES/EVENTOS' };
  var iniP = Modelo_dataStartRow(HOJAS.PACIENTES);
  var iniE = Modelo_dataStartRow(HOJAS.EVENTOS);
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
function _pruS_validaciones() {
  var ss = Modelo_ss(), total = 0, con = 0, sin = [];
  Object.keys(HOJAS_INGRESO).forEach(function (n) {
    try {
      var h = ss.getSheetByName(n);
      if (!h || h.isSheetHidden()) return;
      total++;
      var col = INGRESO_COLUMNAS.indexOf('ESTADO_INGRESO') + 1;
      var ini = Modelo_dataStartRow(n);
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
function _pruS_catalogos() {
  var h = Modelo_hoja('CAT_VIGENCIA_EXAMENES');
  if (!h) return { estado: 'ERROR', detalle: 'Hoja CAT_VIGENCIA_EXAMENES ausente' };
  var enc = (Utl_leerBloque(h)[0] || []).map(function (c) { return Utl_texto(c); });
  var esperados = _MODELO_HOJAS_DEF['CAT_VIGENCIA_EXAMENES'];
  var ok = esperados.every(function (e, i) { return enc[i] === e; });
  return ok
    ? { estado: 'OK', detalle: Math.max(h.getLastRow() - 1, 0) + ' exámenes configurados' }
    : { estado: 'ERROR', detalle: 'Encabezados incorrectos: ' + enc.join(',') };
}
function _pruS_formatos() {
  var h = Modelo_hoja(HOJAS.PACIENTES);
  var ini = Modelo_dataStartRow(HOJAS.PACIENTES);
  if (!h || h.getLastRow() < ini) return { estado: 'WARN', detalle: 'PACIENTES sin datos' };
  var col = MODELO_PACIENTE.map(function (c) { return c.campo; })
            .indexOf('FECHA_ACTUALIZACION') + 1;
  var nf = h.getRange(ini, col).getNumberFormat();
  return String(nf).indexOf('dd') !== -1
    ? { estado: 'OK', detalle: nf }
    : { estado: 'WARN', detalle: 'Formato actual "' + nf + '" — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_protecciones() {
  var n = 0;
  Object.keys(HOJAS_INGRESO).forEach(function (k) {
    var h = Modelo_ss().getSheetByName(k);
    if (!h) return;
    n += h.getProtections(SpreadsheetApp.ProtectionType.RANGE)
          .filter(function (p) { return p.getDescription() === 'ECICEP-SISTEMA'; }).length;
  });
  return n >= 6
    ? { estado: 'OK', detalle: n + ' columnas del sistema marcadas' }
    : { estado: 'WARN', detalle: n + '/6 — ejecuta Instalar / Reparar Sistema' };
}
function _pruS_remDatos() {
  var d = new Date();
  var r = api_remVista(d.getFullYear(), d.getMonth() + 1, 'TODOS', 'MES');
  return r && r.ok
    ? { estado: 'OK', detalle: 'REM al vuelo: ' + r.meta.pacientes +
        ' pacientes del censo · ' + r.meta.atenciones + ' atenciones del mes' }
    : { estado: 'WARN', detalle: (r && r.motivo) || 'sin datos' };
}
function _pruS_pdf() {
  var G = (typeof globalThis !== 'undefined') ? globalThis : this;
  if (typeof G.REM_exportarPdf !== 'function')
    return { estado: 'ERROR', detalle: 'REM_exportarPdf ausente' };
  return { estado: 'SKIP',
           detalle: 'Exportación manual: Consultar REM → Descargar PDF (evita archivos de prueba)' };
}
function _pruS_traza() {
  var d = Modelo_diagnosticoTrazabilidad();
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
 *           sectores, ultimos, _ultimaActF} — ultimaAct se formatea en
 *  api_centroResumen (necesita Utilities, fuera del alcance puro). */
function _centro_resumen(pacientes, eventos, hoyIso, tz) {
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
    var sec = secs[Utl_texto(p.SECTOR).toUpperCase()];
    if (sec) { sec.pacientes++; if (rev) sec.porRevisar++; }
    var est = Utl_texto(p.ESTRATIFICACION).trim().toUpperCase();
    if (est === '' || est === 'G') estratPendiente++;
    if (p.FECHA_ACTUALIZACION instanceof Date &&
        (!ultimaActF || p.FECHA_ACTUALIZACION > ultimaActF)) ultimaActF = p.FECHA_ACTUALIZACION;
  });
  var ingresosHoy = 0, eventosMes = 0, top = [];
  (eventos || []).forEach(function (e) {
    var f = _ui_isoFecha(e.FECHA_EVENTO, tz);
    var tipo = Utl_texto(e.TIPO_EVENTO).toUpperCase();
    if (f === hoyIso && tipo === 'INGRESO') ingresosHoy++;
    if (f.slice(0, 7) === mesActual) eventosMes++;
    var sec2 = secs[Utl_texto(e.SECTOR).toUpperCase()];
    if (sec2 && tipo === 'INGRESO' && limite && f >= limite && f <= hoyIso) sec2.ingresos7d++;
    if (f && f.length >= 10) {
      var item = { f: f, tipo: tipo, hora: f.length >= 16 ? f.slice(11, 16) : '',
                   iniciales: _panel_iniciales(e.NOMBRE) };
      if (top.length < 4) { top.push(item); top.sort(_centro_topDesc); }
      else if (f > top[3].f) { top[3] = item; top.sort(_centro_topDesc); }
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
function _centro_topDesc(a, b) { return b.f < a.f ? -1 : 1; }

/** PURA: iniciales discretas para actividad reciente (sin nombre completo). */
function _panel_iniciales(nombre) {
  return Utl_texto(nombre).trim().split(/\s+/).slice(0, 2)
    .map(function (w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ');
}


/** Consistencia transversal entre sectores (#5): conteos, duplicados por RUT,
 *  pacientes sin sector y pendientes de importación Amarillo. */
function _pruS_consistencia() {
  var pacientes = Modelo_leerPacientesCampos(['SECTOR', 'RUT']);
  var porSector = {}, sinSector = 0, dups = {};
  var vistos = {};
  pacientes.forEach(function (p) {
    var s = Utl_texto(p.SECTOR).toUpperCase() || '(SIN SECTOR)';
    porSector[s] = (porSector[s] || 0) + 1;
    if (s === '(SIN SECTOR)') sinSector++;
    var rut = Utl_texto(p.RUT).toUpperCase();
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
function _pruS_calidad() {
  var a = Calidad_auditarTodo();
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
function _pruS_auditoria() {
  try {
    var r = Auditoria_ejecutar();
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