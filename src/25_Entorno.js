/**
 * Sistema ECICEP Unificado — 25_Entorno
 * Estrategia DEV + DEMO (v0.9.1 — DEC-049).
 *
 * MISMO código en ambos entornos; la identidad se deriva del Spreadsheet
 * activo (getId()), NUNCA del nombre visible de la hoja:
 *   DEV  → desarrollo continuo (@HEAD)  — Spreadsheet 1OEV…
 *   DEMO → versión estable fijada         — Spreadsheet 1Iyv…
 *
 * Reglas:
 *   - Entorno_detectar(ssId) es la ÚNICA fuente de identidad.
 *   - Entorno_validarProcesamiento() bloquea (ERROR_CONFIG_ENTORNO) cuando el
 *     Spreadsheet activo es desconocido o cuando el FORM_ID configurado
 *     pertenece a OTRO entorno (Form DEV nunca escribe DEMO y viceversa).
 *   - Backups: carpeta por entorno ('ECICEP_Backups_<ENV>' o BACKUP_FOLDER_ID
 *     del entorno) — DEV y DEMO jamás comparten carpeta.
 *   - No duplica configuración clínica (G1/G2/G3, frecuencias, responsables…)
 *     que sigue viviendo en el sistema existente.
 *   - Los recursos reales de DEMO (Form y carpeta) se crean manualmente;
 *     mientras estén vacíos el diagnóstico lo reporta.
 */

// ---------------------------------------------------------------------------
// NÚCLEO PURO — identidad y recursos
// ---------------------------------------------------------------------------

/** PURA: nombres de entornos registrados. */
function Entorno_lista() {
  return Object.keys(ENTORNOS);
}

/** PURA: datos de un entorno (o null si no existe). */
function Entorno_datos(nombre) {
  var n = Utl_texto(nombre).toUpperCase();
  return ENTORNOS[n] ? ENTORNOS[n] : null;
}

/** PURA: entorno al que pertenece un Spreadsheet por su ID. */
function Entorno_detectar(ssId) {
  var id = Utl_texto(ssId).trim();
  if (!id) return 'DESCONOCIDO';
  if (ENTORNOS.DEV && Utl_texto(ENTORNOS.DEV.SPREADSHEET_ID).trim() === id) return 'DEV';
  if (ENTORNOS.DEMO && Utl_texto(ENTORNOS.DEMO.SPREADSHEET_ID).trim() === id) return 'DEMO';
  return 'DESCONOCIDO';
}

/** PURA: ¿el libro pertenece al entorno indicado? */
function Entorno_esLibro(ssId, entorno) {
  return Entorno_detectar(ssId) === Utl_texto(entorno).toUpperCase();
}

/** PURA: entorno dueño de un FORM_ID registrado ('' si no está en ENTORNOS). */
function Entorno_duenoForm(formId) {
  var f = Utl_texto(formId).trim();
  if (!f) return '';
  var lista = Entorno_lista();
  for (var i = 0; i < lista.length; i++) {
    if (Utl_texto(ENTORNOS[lista[i]].FORM_ID).trim() === f) return lista[i];
  }
  return '';
}

/** PURA: valor esperado de un recurso del entorno (SPREADSHEET_ID | FORM_ID |
 *  BACKUP_FOLDER_ID). Devuelve '' si no está configurado. */
function Entorno_recursoEsperado(entorno, campo) {
  var d = Entorno_datos(entorno);
  return d && d[campo] !== undefined ? Utl_texto(d[campo]).trim() : '';
}

/**
 * PURA: puerta de validación de entorno para procesar respuestas del Form.
 * Devuelve ok=false con motivo ERROR_CONFIG_ENTORNO cuando:
 *   - no hay Spreadsheet activo identificable, o
 *   - el Spreadsheet no pertenece a DEV ni a DEMO, o
 *   - el FORM_ID configurado pertenece a OTRO entorno (aislamiento cruzado).
 * No modifica nada: es solo una decisión.
 */
function Entorno_validarProcesamiento(ssId, formId, cfg) {
  cfg = cfg || {};
  var ss = Utl_texto(ssId).trim();
  var entorno = Entorno_detectar(ss);
  var res = { ok: true, entorno: entorno, ssId: ss, motivo: '', detalle: '', aviso: '' };
  if (!ss) {
    res.ok = false; res.motivo = 'ERROR_CONFIG_ENTORNO';
    res.detalle = 'Sin Spreadsheet activo identificable para resolver el entorno';
    return res;
  }
  if (entorno === 'DESCONOCIDO') {
    res.ok = false; res.motivo = 'ERROR_CONFIG_ENTORNO';
    res.detalle = 'El Spreadsheet activo no pertenece a DEV ni a DEMO';
    return res;
  }
  var form = Utl_texto(formId).trim();
  if (form) {
    var dueno = Entorno_duenoForm(form);
    if (dueno && dueno !== entorno) {
      res.ok = false; res.motivo = 'ERROR_CONFIG_ENTORNO';
      res.detalle = 'Form del entorno ' + dueno + ' configurado desde el entorno ' + entorno + ': procesamiento bloqueado';
      return res;
    }
    if (!dueno) {
      res.aviso = 'FORM_ID no registrado en ENTORNOS: no se puede verificar el aislamiento del Form (crear/configurar el recurso del entorno)';
    }
  }
  if (cfg.exigirForm && !form) {
    res.ok = false; res.motivo = 'ERROR_CONFIG_ENTORNO';
    res.detalle = 'No hay FORM_ID configurado para el entorno ' + entorno;
    return res;
  }
  return res;
}

/** PURA: carpeta lógica de backups del entorno (por ID si está configurada,
 *  si no por nombre derivado). Aísla DEV de DEMO. */
function Entorno_carpetaEsperada(entorno) {
  var d = Entorno_datos(entorno);
  if (!d) return '';
  var id = Utl_texto(d.BACKUP_FOLDER_ID).trim();
  if (id) return id;
  return 'ECICEP_Backups_' + Utl_texto(d.NOMBRE);
}

/** PURA: entorno dueño de una carpeta de backups (por nombre derivado). */
function Entorno_clasificarCarpeta(nombre) {
  var n = Utl_texto(nombre).trim();
  var lista = Entorno_lista();
  for (var i = 0; i < lista.length; i++) {
    if (n === 'ECICEP_Backups_' + lista[i]) return lista[i];
  }
  return 'DESCONOCIDO';
}

/**
 * PURA: diagnóstico de entorno para el panel y para la batería de aceptación.
 * Devuelve {entorno, ssId, esperadoId, checks:[{nombre, ok, detalle}]} sin
 * efectos. `extra` puede traer {trigger:bool, mapeo:int, formAccesible:bool,
 * procesador:bool, carpetaBackup:string} medidos por el llamador GAS.
 */
function Entorno_diagnostico(ssId, formId, extra) {
  extra = extra || {};
  var entorno = Entorno_detectar(ssId);
  var esperadoId = Entorno_recursoEsperado(entorno, 'SPREADSHEET_ID');
  var formEsperado = Entorno_recursoEsperado(entorno, 'FORM_ID');
  var checks = [];

  checks.push({
    nombre: 'entorno', ok: entorno !== 'DESCONOCIDO' && entorno !== '',
    detalle: entorno === 'DESCONOCIDO'
      ? 'Spreadsheet no registrado en ENTORNOS'
      : 'Entorno: ' + entorno + ' (' + Entorno_datos(entorno).ETIQUETA + ')'
  });

  checks.push({
    nombre: 'spreadsheet', ok: Entorno_esLibro(ssId, entorno),
    detalle: 'Spreadsheet ' + (esperadoId ? (esperadoId === ssId ? '✓ ' + ssId : '✗ esperado ' + esperadoId) : 'sin ID registrado')
  });

  checks.push({
    nombre: 'form', ok: !Utl_vacio(formEsperado) && formId === formEsperado,
    detalle: !formEsperado
      ? 'Sin FORM_ID registrado para ' + entorno + ' (pendiente manual)'
      : (formId === formEsperado ? 'Form ' + formEsperado : 'Form esperado ' + formEsperado + ' ≠ configurado ' + formId)
  });

  if (extra.carpetaBackup) {
    var carpeta = extra.carpetaBackup;
    var duena = String(carpeta).indexOf('ECICEP_Backups_') === 0 ? Entorno_clasificarCarpeta(carpeta) : extra.carpetaBackup;
    var esperada = Entorno_carpetaEsperada(entorno);
    checks.push({
      nombre: 'backup', ok: esperada === carpeta || duena === entorno,
      detalle: 'Backup esperado: ' + (esperada || 'n/d') + ' · actual: ' + carpeta
    });
  }

  if (extra.mapeo !== undefined) {
    checks.push({
      nombre: 'mapeo', ok: extra.mapeo >= 0 && (extra.campos === undefined || extra.mapeo === extra.campos),
      detalle: 'Preguntas del Form mapeadas: ' + extra.mapeo + (extra.campos !== undefined ? '/' + extra.campos : '')
    });
  }

  if (extra.trigger !== undefined) {
    checks.push({
      nombre: 'trigger', ok: !!extra.trigger,
      detalle: extra.trigger ? 'Trigger Form_onFormSubmit instalado' : 'Sin trigger de envío (captura bajo demanda)'
    });
  }

  if (extra.procesador !== undefined) {
    checks.push({
      nombre: 'procesador', ok: !!extra.procesador,
      detalle: extra.procesador ? 'Procesador de pendientes disponible' : 'Procesador no disponible'
    });
  }

  return {
    entorno: entorno, ssId: ssId, esperadoId: esperadoId,
    formEsperado: formEsperado, ok: checks.every(function (c) { return c.ok; }),
    checks: checks
  };
}

// ---------------------------------------------------------------------------
// WRAPPERS GAS — libro activo
// ---------------------------------------------------------------------------

/** GAS: resuelve el entorno del libro ACTIVO (sin abrir por ID el propio libro).
 *  En un script vinculado, getActiveSpreadsheet() es el libro correcto. */
function Entorno_actualGAS() {
  var ssId = '';
  if (typeof SpreadsheetApp === 'undefined') return { ssId: ssId, entorno: 'DESCONOCIDO', coincide: false };
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    try { ss = SpreadsheetApp.openById(ECICEP.SPREADSHEET_ID); } catch (e) { ss = null; }
  }
  if (ss) ssId = ss.getId();
  var entorno = Entorno_detectar(ssId);
  return {
    ssId: ssId, entorno: entorno,
    coincide: entorno !== 'DESCONOCIDO' && Entorno_esLibro(ssId, entorno)
  };
}