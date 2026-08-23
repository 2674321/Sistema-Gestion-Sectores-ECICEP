/**
 * Sistema ECICEP Unificado — Webhook (ETAPA 4)
 * Puente de ejecución remota: permite lanzar las operaciones del sistema
 * desde una URL autorizada (usado por el asistente de desarrollo para
 * ejecutar él mismo instalar/sembrar/procesar sin menús manuales).
 *
 * Seguridad (control operativo, ver DEC-012/020):
 *   - Requiere WEBHOOK_TOKEN en Script Properties (menú 🔑 Configurar acceso).
 *   - Ejecuta SIEMPRE como propietario del despliegue.
 *   - Solo expone acciones no destructivas; limpiar_prueba mantiene la doble
 *     señal y borra únicamente datos marcados como prueba.
 */

var WEBHOOK_ACCIONES = [
  'estado', 'instalar', 'sembrar', 'procesar',
  'refrescar', 'diagnosticar', 'limpiar_prueba',
  'diagnosticar_fuentes', 'importar_muestra',
  'carga_analisis', 'carga_ejecutar'
];

function doPost(e) { return _wh_despachar(e); }
function doGet(e) { return _wh_despachar(e); }

function _wh_salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _wh_despachar(e) {
  try {
    var esperado = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');
    var recibido = e && e.parameter ? Utl_texto(e.parameter.token) : '';
    if (!esperado) return _wh_salida({ ok: false, motivo: 'TOKEN_NO_CONFIGURADO (usa 🔑 en el menú)' });
    if (!recibido || recibido !== esperado) return _wh_salida({ ok: false, motivo: 'NO_AUTORIZADO' });

    var accion = Utl_texto(e.parameter.action).toLowerCase();
    if (WEBHOOK_ACCIONES.indexOf(accion) === -1) {
      return _wh_salida({ ok: false, motivo: 'ACCIÓN_INVALIDA', acciones: WEBHOOK_ACCIONES });
    }

    var t0 = Date.now();
    var resultado;
    switch (accion) {
      case 'estado':
        resultado = {
          version: ECICEP.VERSION,
          ambiente: ECICEP.AMBIENTE,
          pacientes: Modelo_hoja(HOJAS.PACIENTES) ? Math.max(Modelo_hoja(HOJAS.PACIENTES).getLastRow() - 1, 0) : 0,
          eventos: Modelo_hoja(HOJAS.EVENTOS) ? Math.max(Modelo_hoja(HOJAS.EVENTOS).getLastRow() - 1, 0) : 0
        };
        break;
      case 'instalar':    resultado = Modelo_crearEstructura(); break;
      case 'sembrar':     resultado = Sembrar_ficticios(); break;
      case 'procesar':    resultado = Ingresos_procesarTodasLasHojas({}); break;
      case 'refrescar':   resultado = Modelo_refrescarVistasSectores(); break;
      case 'diagnosticar': resultado = Ingresos_diagnosticar(); break;
      case 'diagnosticar_fuentes': resultado = Fuentes_diagnosticarFuentes(); break;
      case 'diag_ficha':
        var pacientes = Modelo_leerPacientes();
        var testId = pacientes.length ? Utl_texto(pacientes[0].ID_INTERNO) : '';
        var encontrado = null;
        for (var pi = 0; pi < pacientes.length; pi++) {
          if (Utl_texto(pacientes[pi].ID_INTERNO) === testId) { encontrado = pacientes[pi]; break; }
        }
        resultado = {
          totalPacientes: pacientes.length,
          headers: Object.keys(pacientes[0] || {}).slice(0, 8),
          primeros3Ids: pacientes.slice(0, 3).map(function (p) { return { id: p.ID_INTERNO, tipo: typeof p.ID_INTERNO }; }),
          testId: testId,
          testIdTipo: typeof testId,
          testEncontrado: !!encontrado,
          tieneCONDICIONES: pacientes.length > 0 ? 'CONDICIONES' in pacientes[0] : false,
          tieneOTRAS_PAT: pacientes.length > 0 ? 'OTRAS_PATOLOGIAS' in pacientes[0] : false
        };
        break;
      case 'importar_muestra':
        resultado = Fuentes_importarMuestra(
          e.parameter.archivo || '', e.parameter.hoja || '', parseInt(e.parameter.cantidad || '10', 10));
        break;
      case 'carga_analisis':
        resultado = Fuentes_cargaReal({ ejecutar: false });
        break;
      case 'carga_ejecutar':
        resultado = Fuentes_cargaReal({ ejecutar: true });
        break;
      case 'limpiar_prueba':
        resultado = Limpieza_ejecutar(Limpieza_colectar());
        break;
      default:
        return _wh_salida({ ok: false, motivo: 'ACCIÓN_INVALIDA' });
    }
    Log_info('Webhook', accion, 'ok', null, Date.now() - t0);
    Log_flush();
    return _wh_salida({
      ok: true, accion: accion, version: ECICEP.VERSION,
      ms: Date.now() - t0, resultado: resultado
    });
  } catch (err) {
    try { Log_error('Webhook', 'despachar', err && err.message ? err.message : String(err)); Log_flush(); } catch (e2) {}
    return _wh_salida({ ok: false, motivo: err && err.message ? err.message : String(err) });
  }
}

/** Menú 🔑: guarda el token compartido (pegarlo también al asistente). */
function UI_configurarWebhook() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'ACCESO REMOTO ECICEP',
    'Pega el token acordado con el asistente (mínimo 20 caracteres).\n' +
    'Quedará guardado en Script Properties (no en el código).',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var token = Utl_texto(resp.getResponseText()).trim();
  if (token.length < 20) { ui.alert('Token demasiado corto (mínimo 20).'); return; }
  PropertiesService.getScriptProperties().setProperty('WEBHOOK_TOKEN', token);
  ui.alert('Token guardado.\n\nRecuerda publicar/actualizar la aplicación web\n(Ejecutar como: yo · Acceso: cualquiera con el enlace)\ny compartir la URL …/exec con el asistente.');
}

// v0.4.1
