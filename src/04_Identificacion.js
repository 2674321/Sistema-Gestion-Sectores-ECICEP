/**
 * Sistema ECICEP Unificado — 04_Identificacion
 * Identificación de pacientes y detección explicable de duplicados.
 *
 * Separación estricta (ETAPA 3):
 *   1. IDENTIFICAR → ¿existe una identidad suficientemente confiable?
 *   2. DEDUPLICAR EN LOTE → ¿dos filas del mismo lote son la misma persona?
 *
 * Nunca elimina ni fusiona registros: solo clasifica con criterio y confianza
 * explícitos. Los casos ambiguos terminan en REQUIERE_REVISION. El matching
 * agresivo por nombre está prohibido por diseño: nombre solo = candidato a revisión.
 */

/**
 * Construye índices de búsqueda desde un array de pacientes (estado actual).
 * @returns {porRut:{}, porCuerpo:{}, porNombre:{}}
 */
function Iden_construirIndices(pacientes) {
  var porRut = {}, porCuerpo = {}, porNombre = {};
  (pacientes || []).forEach(function (p) {
    var rut = Utl_texto(p.RUT).toUpperCase().replace(/\s+/g, '');
    if (rut) porRut[rut] = p; // última entrada gana (entrada ordenada = determinista)
    var cuerpo = rut.split('-')[0];
    if (/^\d{6,9}$/.test(cuerpo)) {
      if (!porCuerpo[cuerpo]) porCuerpo[cuerpo] = [];
      porCuerpo[cuerpo].push(p);
    }
    var clave = Norm_claveNombre(p.NOMBRE);
    if (clave) {
      if (!porNombre[clave]) porNombre[clave] = [];
      porNombre[clave].push(p);
    }
  });
  return { porRut: porRut, porCuerpo: porCuerpo, porNombre: porNombre };
}

/**
 * Determina si el registro normalizado corresponde a un paciente existente.
 * @param {Object} n NORMALIZADO de una fila de staging
 * @param {Object} indices resultado de Iden_construirIndices
 * @returns {resultado:'MATCH_EXACTO'|'MATCH_PARCIAL'|'POSIBLE_DUPLICADO'|
 *                    'SIN_MATCH'|'REQUIERE_REVISION',
 *           idPaciente:'', paciente:null, criterio:'', confianza:''}
 */
function Iden_identificar(n, indices) {
  var res = { resultado: 'SIN_MATCH', idPaciente: '', paciente: null, criterio: '', confianza: '' };
  if (!n || !indices) return res;

  // --- Nivel fuerte: RUT completo exacto ---
  if (n.RUT_ESTADO === 'OK' && indices.porRut[n.RUT]) {
    res.resultado = 'MATCH_EXACTO';
    res.criterio = 'RUT completo idéntico';
    res.confianza = 'ALTA';
    res.paciente = indices.porRut[n.RUT];
    res.idPaciente = res.paciente.ID_INTERNO;
    return res;
  }

  // --- Cuerpo de RUT presente en la base ---
  var cuerpo = Utl_texto(n.RUT).split('-')[0];
  var candidatosCuerpo = (/^\d{6,9}$/.test(cuerpo) && indices.porCuerpo[cuerpo]) ? indices.porCuerpo[cuerpo] : null;

  if (n.RUT_ESTADO === 'OK' && candidatosCuerpo) {
    // RUT entrante válido pero el cuerpo existe con otro RUT guardado:
    // datos inconsistentes → nunca auto-decidir.
    res.resultado = 'REQUIERE_REVISION';
    res.criterio = 'Cuerpo de RUT existe en base con DV distinto';
    res.confianza = 'BAJA';
    res.paciente = candidatosCuerpo[0];
    res.idPaciente = res.paciente.ID_INTERNO;
    return res;
  }

  if (n.RUT_ESTADO === 'SIN_DV' && candidatosCuerpo) {
    if (candidatosCuerpo.length === 1 && n.NOMBRE_CLAVE &&
        Norm_claveNombre(candidatosCuerpo[0].NOMBRE) === n.NOMBRE_CLAVE) {
      res.resultado = 'MATCH_PARCIAL';
      res.criterio = 'Cuerpo de RUT + nombre coinciden';
      res.confianza = 'MEDIA';
      res.paciente = candidatosCuerpo[0];
      res.idPaciente = res.paciente.ID_INTERNO;
      return res;
    }
    res.resultado = 'REQUIERE_REVISION';
    res.criterio = candidatosCuerpo.length > 1
      ? 'Cuerpo de RUT coincide con varios pacientes'
      : 'Cuerpo de RUT coincide pero el nombre difiere';
    res.confianza = 'BAJA';
    res.paciente = candidatosCuerpo[0] || null;
    res.idPaciente = res.paciente ? res.paciente.ID_INTERNO : '';
    return res;
  }

  // --- Matching débil controlado ---
  if (n.NOMBRE_CLAVE && indices.porNombre[n.NOMBRE_CLAVE]) {
    var cands = indices.porNombre[n.NOMBRE_CLAVE];
    var telsEntrantes = Utl_texto(n.TELEFONOS).split('/');
    var matchTel = null;
    for (var i = 0; i < cands.length && !matchTel; i++) {
      var telsBase = Utl_texto(cands[i].TELEFONOS).split('/');
      for (var j = 0; j < telsEntrantes.length; j++) {
        if (telsEntrantes[j] && telsBase.indexOf(telsEntrantes[j]) !== -1) { matchTel = cands[i]; break; }
      }
    }
    if (matchTel) {
      res.resultado = 'MATCH_PARCIAL';
      res.criterio = 'Nombre + teléfono coinciden';
      res.confianza = 'MEDIA';
      res.paciente = matchTel;
      res.idPaciente = matchTel.ID_INTERNO;
      return res;
    }
    if (cands.length === 1) {
      res.resultado = 'POSIBLE_DUPLICADO';
      res.criterio = 'Solo nombre idéntico';
      res.confianza = 'BAJA';
      res.paciente = cands[0];
      res.idPaciente = cands[0].ID_INTERNO;
      return res;
    }
    res.resultado = 'REQUIERE_REVISION';
    res.criterio = 'Nombre coincide con varios pacientes';
    res.confianza = 'BAJA';
    return res;
  }

  return res; // SIN_MATCH → candidato a paciente nuevo
}

/**
 * Detecta duplicados DENTRO de un lote de filas ya normalizadas.
 * Explicable y no destructivo: solo reporta pares con criterio y confianza.
 * @returns [{a:idProvA, b:idProvB, criterio, confianza, resultado:'POSIBLE_DUPLICADO'}]
 */
function Iden_detectarDuplicadosLote(filas) {
  var salida = [];
  var fs = filas || [];
  function telsDe(n) { return Utl_texto(n.TELEFONOS).split('/'); }
  function compartenTel(a, b) {
    var ta = telsDe(a), tb = telsDe(b);
    for (var i = 0; i < ta.length; i++) {
      if (ta[i] && tb.indexOf(ta[i]) !== -1) return true;
    }
    return false;
  }
  for (var i = 0; i < fs.length; i++) {
    for (var j = i + 1; j < fs.length; j++) {
      var a = fs[i].NORMALIZADO, b = fs[j].NORMALIZADO;
      if (!a || !b) continue;
      var criterio = '', confianza = '';

      if (a.RUT_ESTADO === 'OK' && a.RUT_ESTADO === b.RUT_ESTADO && a.RUT && a.RUT === b.RUT) {
        criterio = 'RUT completo idéntico'; confianza = 'ALTA';
      } else if (
        a.RUT_CUERPO && a.RUT_CUERPO === b.RUT_CUERPO &&
        /^\d{6,9}$/.test(a.RUT_CUERPO)
      ) {
        criterio = 'Cuerpo de RUT idéntico'; confianza = 'MEDIA';
      } else if (a.NOMBRE_CLAVE && a.NOMBRE_CLAVE === b.NOMBRE_CLAVE) {
        if (compartenTel(a, b)) { criterio = 'Nombre + teléfono'; confianza = 'MEDIA'; }
        else { criterio = 'Solo nombre idéntico'; confianza = 'BAJA'; }
      } else {
        continue; // sin parecido suficiente: no reportar
      }
      salida.push({
        a: fs[i].ID_PROVISIONAL,
        b: fs[j].ID_PROVISIONAL,
        criterio: criterio,
        confianza: confianza,
        resultado: 'POSIBLE_DUPLICADO'
      });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// ETAPA 4 — Búsqueda operativa
// ---------------------------------------------------------------------------

/**
 * Búsqueda NO agresiva para la interfaz:
 *   1. Si el término parece RUT → match exacto por RUT normalizado.
 *   2. Si no → pacientes cuyo nombre normalizado CONTIENE el término.
 * Nunca fusiona ni decide: solo lista candidatos.
 * @returns [{ID_INTERNO, RUT, NOMBRE, SECTOR, ESTADO, ESTRATIFICACION}]
 */
function Bus_buscarPacientes(pacientes, termino, limite) {
  var t = Utl_colapsarEspacios(Utl_texto(termino));
  if (!t) return [];
  var tope = limite || 25;
  var salida = [];
  var rut = Norm_normalizarRut(t);
  if (rut.estado === 'OK') {
    for (var i = 0; i < (pacientes || []).length && salida.length < tope; i++) {
      if (Utl_texto(pacientes[i].RUT).toUpperCase() === rut.rut) salida.push(pacientes[i]);
    }
    return salida;
  }
  var clave = Norm_claveNombre(t);
  for (var j = 0; j < (pacientes || []).length && salida.length < tope; j++) {
    var claveP = Norm_claveNombre(pacientes[j].NOMBRE);
    if (claveP && claveP.indexOf(clave) !== -1) salida.push(pacientes[j]);
  }
  return salida;
}
