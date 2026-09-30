/**
 * Sistema ECICEP — 19_Permisos
 *
 * ⚠ ESTO NO ES UNA PANTALLA DE PERMISOS DEL SISTEMA.
 *
 * Desde v0.16.0 (DEC-097) el sistema es de ACCESO LIBRE: quien abre el
 * enlace usa el sistema entero sin iniciar sesión, sin credencial y sin
 * autorizar nada. No hay ningún punto del flujo donde un usuario tenga que
 * ver "Google quiere acceder a tus datos". Los scopes ya están declarados en
 * `appsscript.json` y los concede el PROPIETARIO una sola vez, al desplegar.
 *
 * Lo que queda en este archivo es una utilidad opcional del PROPIETARIO:
 * dispara en un clic cada servicio usado por el sistema, de modo que Google
 * muestre un único consentimiento con todos los scopes y ninguna función
 * quede después bloqueada por un permiso que falte. No la necesita nadie
 * para usar ECICEP, y no está en ningún menú: se ejecuta desde el editor.
 *
 * Para ejecutarla una vez: editor de Apps Script → selector de funciones →
 * `ECICEP_autorizar` → Ejecutar.
 */

/** Función no-op para probar el scope de Triggers sin dejar artefactos. */
function ECICEP_noop() {}

/**
 * 🔑 Prueba real de cada servicio usado por el sistema (utilidad del
 * PROPIETARIO, opcional). Al terminar, todo el sistema está autorizado de una
 * sola vez. No modifica el acceso de las personas al sistema.
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

  paso('Propiedades (script)', function () {
    var p = PropertiesService.getScriptProperties();
    p.setProperty('ECICEP_TEST', 'ok');
    p.deleteProperty('ECICEP_TEST');
  });

  paso('Caché (script)', function () {
    var c = CacheService.getScriptCache();
    c.put('ECICEP_TEST', 'ok', 1);
    c.get('ECICEP_TEST');
    c.remove('ECICEP_TEST');
  });

  paso('Lock (bloqueo)', function () {
    var lock = LockService.getScriptLock();
    lock.tryLock(1000);
    lock.releaseLock();
  });

  paso('HTML (servir templates)', function () {
    HtmlService.createTemplate('ok').evaluate().getTitle();
  });

  paso('Zona horaria del proyecto', function () {
    Session.getScriptTimeZone();
  });

  var resumen = '🔑 CONSENTIMIENTO DE SCOPES (propietario)\n\n' + out.join('\n') +
    '\n\nEsto concede permisos de Google a la CUENTA PROPIETARIA del script. ' +
    'No tiene relación con el acceso de las personas al sistema: ECICEP es de ' +
    'acceso libre y nadie tiene que autorizar nada para usarlo.';
  try {
    _UI_get().alert(resumen);
  } catch (eSinUi) {
    Logger.log(resumen); // ejecución desde el editor
  }
  Log_info('Permisos', 'autorizar', out.join(' | '));
  Log_flush();
  return out;
}
