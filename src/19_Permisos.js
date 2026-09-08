/**
 * Sistema ECICEP — 19_Permisos
 * Autorización CONSOLIDADA: ejecuta UNA VEZ (desde el editor o desde el menú
 * ⚙️ Sistema → 🔑 Autorizar permisos) y Google pedirá un único consentimiento
 * con TODOS los scopes del sistema. Así ninguna función queda después
 * bloqueada por un permiso que falte, sin depender de pruebas manuales.
 */

/** Función no-op para probar el scope de Triggers sin dejar artefactos. */
function ECICEP_noop() {}

/**
 * 🔑 Ejecuta una prueba real de cada servicio usado por el sistema.
 * Al terminar, todo el sistema está autorizado de una sola vez.
 * @returns {Array<string>} líneas ✓/✕ por servicio (y alert si hay UI).
 */
function ECICEP_autorizar() {
  var out = [];
  function paso(nombre, fn) {
    try { fn(); out.push('✓ ' + nombre); }
    catch (e) { out.push('✕ ' + nombre + ': ' + (e && e.message || e)); }
  }

  paso('Hojas de cálculo', function () {
    Modelo_ss().getSheets().length;
  });

  paso('Drive (crear/borrar archivo)', function () {
    var f = DriveApp.createFile('ECICEP_PERMISOS.txt', 'ok', MimeType.PLAIN_TEXT);
    f.setTrashed(true);
  });

  paso('Documentos (crear/borrar)', function () {
    var d = DocumentApp.create('ECICEP_PERMISOS');
    d.getBody().setText('ok');
    d.saveAndClose();
    DriveApp.getFileById(d.getId()).setTrashed(true);
  });

  paso('Triggers (crear/borrar)', function () {
    ScriptApp.newTrigger('ECICEP_noop').timeBased().after(60 * 1000).create();
    /* deleteTrigger directo sobre el objeto recién creado lanza un quirk de
       GAS; localizarlo vía getProjectTriggers (referencia fresca) sí funciona */
    var borrado = false;
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'ECICEP_noop') {
        ScriptApp.deleteTrigger(t); borrado = true;
      }
    });
    if (!borrado) throw new Error('no se pudo localizar el trigger de prueba');
  });

  paso('URL Fetch', function () {
    UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis',
      { muteHttpExceptions: true });
  });

  paso('Zona horaria del proyecto', function () {
    Session.getScriptTimeZone();
  });

  var resumen = '🔑 AUTORIZACIÓN DEL SISTEMA\n\n' + out.join('\n') +
    '\n\nSi todo está ✓, ninguna función volverá a pedir permisos.';
  try {
    SpreadsheetApp.getUi().alert(resumen);
  } catch (eSinUi) {
    Logger.log(resumen); // ejecución desde el editor
  }
  Log_info('Permisos', 'autorizar', out.join(' | '));
  Log_flush();
  return out;
}
