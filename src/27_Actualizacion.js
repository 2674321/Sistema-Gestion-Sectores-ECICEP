/**
 * Sistema ECICEP Unificado — 27_Actualizacion
 * Enriquecimiento seguro de PACIENTES existentes (FASE S5, DEC-057).
 *
 * PRINCIPIO: no se reinventa el modelo ni se inferen datos. La operación
 * "⚙️ Instalar / reparar sistema" (etapa `Instalar_pEnriquecimiento`) puede
 * COMPLETAR únicamente campos demográficos vacíos
 * (`SEXO`, `FECHA_NACIMIENTO`) de un paciente ya existente, tomando el dato de
 * una FUENTE VÁLIDA (hojas INGRESO_* del entorno — "fuente de datos operativa").
 *
 * REGLAS INVARIABLES:
 *   1. IDENTIDAD: match por RUT canónico exacto (misma clave que PACIENTES).
 *      Ante inconsistencia entre fuentes → REQUIERE_REVISION, sin escritura.
 *   2. PARCIAL: solo llena campos VACÍOS; jamás sobrescribe datos existentes
 *      ni campos no autorizados (NOMBRE, RUT, TELEFONOS, SECTOR, etc.).
 *   3. NO INFERIR: `SEXO` solo desde valor canónico válido (M|F|OTRO, con
 *      sinónimo confirmado); nunca por nombre/profesión/señales indirectas.
 *   4. EDAD: nunca se almacena (DECISIONES), se deriva de `FECHA_NACIMIENTO`
 *      en vivo (`Utl_edadDesde`, consciente del cumpleaños).
 *   5. IDEMPOTENCIA: segunda ejecución = sin cambios nuevos (no duplica,
 *      no crea pacientes, no genera eventos espurios).
 *   6. TRAZABILIDAD: append a `FUENTE` (origen exacto), estampa
 *      `FECHA_ACTUALIZACION` y registro `Log_info` (sin PII innecesaria).
 *
 * Las funciones PURAS (sin GAS) se prueban en node; los wrappers GAS son
 * capas delgadas de lectura/escritura.
 */

// Campos autorizados para enriquecimiento demográfico en S5 (única fuente).
var CAMPOS_ENRIQUECIMIENTO = ['SEXO', 'FECHA_NACIMIENTO'];

function Act_enriquecimientoCampos() {
  return CAMPOS_ENRIQUECIMIENTO.slice();
}

/**
 * PURA: campos enriquecibles que el paciente tiene VACÍOS.
 * @returns {Array} lista de campos entre CAMPOS_ENRIQUECIMIENTO vacíos.
 */
function Act_camposVacios(paciente) {
  var salida = [];
  CAMPOS_ENRIQUECIMIENTO.forEach(function (campo) {
    if (Utl_vacio(Utl_texto(paciente ? paciente[campo] : ''))) salida.push(campo);
  });
  return salida;
}

/**
 * PURA: candidato demográfico listo para persistir o '' si no es válido.
 *  - SEXO: Norm_normalizarSexo ('' si desconocido → NO se inventa).
 *  - FECHA_NACIMIENTO: ISO válida (años [1900..2040]) o ''.
 */
function Act_normalizarCandidato(campo, raw) {
  if (campo === 'SEXO') return Norm_normalizarSexo(raw);
  if (campo === 'FECHA_NACIMIENTO') {
    var f = Norm_normalizarFecha(raw, {
      min: CFG_FECHAS.ANO_MIN_NACIMIENTO,
      max: CFG_FECHAS.ANO_MAX
    });
    return f && f.estado === 'VALIDA' ? f.iso : '';
  }
  return '';
}

/**
 * PURA: consolida los orígenes demográficos leídos desde bloques de hojas
 * INGRESO_* (shape de Modelo_leerBloqueCabecera: índice 0 = encabezados).
 * Por cada RUT canónico exacto consolida SEXO/FECHA_NACIMIENTO:
 *   - primer valor válido visto → se conserva (y su FUENTE);
 *   - un segundo valor válido IGUAL → consistente (idempotente);
 *   - un segundo valor válido DIFERENTE → conflicto=true (REQUIERE_REVISION).
 * @param {Array} bloques [{hoja, headerRow, val:[[...],...]}]
 * @returns {{rut: {SEXO:{valor,fuente,conflicto},
 *                    FECHA_NACIMIENTO:{valor,fuente,conflicto}}}}
 */
function Act_leerOrigenesDesdeBloques(bloques) {
  var porRut = {};
  (bloques || []).forEach(function (bloque) {
    var val = bloque && bloque.val;
    if (!val || val.length < 2) return;
    var mapa = Ingresos_mapearEncabezadosHoja(val[0]);
    var iRut = mapa.campos['RUT'];
    var iSexo = mapa.campos['SEXO'];
    var iNac = mapa.campos['FECHA_NACIMIENTO'];
    if (iRut === undefined) return; // hoja sin RUT: no es fuente demográfico segura
    var hr = bloque.headerRow || Modelo_headerRow(bloque.hoja);
    for (var j = 1; j < val.length; j++) {
      var rutN = Norm_normalizarRut(val[j][iRut]);
      if (!rutN.rut) continue;
      var clave = rutN.rut.toUpperCase();
      var filaFisica = hr + j;
      if (!porRut[clave]) {
        porRut[clave] = {
          SEXO: { valor: '', fuente: '', conflicto: false },
          FECHA_NACIMIENTO: { valor: '', fuente: '', conflicto: false }
        };
      }
      var origen = porRut[clave];
      var fuente = 'ENRIQUECIMIENTO|' + bloque.hoja + '|' + filaFisica;
      CAMPOS_ENRIQUECIMIENTO.forEach(function (campo) {
        var idx = campo === 'SEXO' ? iSexo : iNac;
        if (idx === undefined) return;
        var can = Act_normalizarCandidato(campo, val[j][idx]);
        if (!can) return; // valor vacío/inválido en la fila: no aporta
        var slot = origen[campo];
        if (slot.valor === '') {
          slot.valor = can;
          slot.fuente = fuente;
        } else if (slot.valor === can) {
          // consistente; se conserva la primera fuente
        } else {
          slot.conflicto = true; // datos divergentes → REQUIERE_REVISION
        }
      });
    }
  });
  return porRut;
}

/**
 * GAS: lee los orígenes demográficos desde las hojas INGRESO_* reales.
 * Solo hojas con encabezados compatibles (RUT + SEXO/FECHA_NACIMIENTO).
 */
function Act_leerOrigenesDemograficos() {
  var bloques = [];
  Object.keys(HOJAS_INGRESO).forEach(function (nombreHoja) {
    var hoja = Modelo_hoja(nombreHoja);
    if (!hoja) return;
    var val = Modelo_leerBloqueCabecera(nombreHoja, hoja);
    if (val && val.length >= 2) {
      bloques.push({ hoja: nombreHoja, headerRow: Modelo_headerRow(nombreHoja), val: val });
    }
  });
  return Act_leerOrigenesDesdeBloques(bloques);
}

/**
 * PURA: aplica enriquecimiento demográfico a UN paciente (muta). Solo llena
 * campos vacíos autorizados con valores canónicos consistentes de la fuente.
 * @param {Object} paciente objeto PACIENTES (mutable)
 * @param {Object} origen entrada de Act_leerOrigenesDesdeBloques (por RUT)
 * @returns {aplicados:[{campo,valor,fuente}], bloqueos:[{campo,motivo}]}
 */
function Act_aplicarEnriquecimiento(paciente, origen) {
  var aplicados = [], bloqueos = [];
  if (!origen) return { aplicados: aplicados, bloqueos: bloqueos };
  Act_camposVacios(paciente).forEach(function (campo) {
    var slot = origen[campo];
    if (!slot) return;
    if (slot.conflicto) {
      bloqueos.push({ campo: campo, motivo: 'FUENTES_INCONSISTENTES' });
      return;
    }
    if (!slot.valor) return; // sin dato canónico válido en la fuente
    paciente[campo] = slot.valor;
    aplicados.push({ campo: campo, valor: slot.valor, fuente: slot.fuente });
  });
  return { aplicados: aplicados, bloqueos: bloqueos };
}

/** PURA: append de fuentes (origen exacto) a FUENTE sin duplicar. */
function Act_appendFuente(fuenteActual, fuentesNuevas) {
  var actual = Utl_texto(fuenteActual).trim();
  var nuevas = (fuentesNuevas || []).filter(function (f) { return Utl_texto(f).trim(); });
  if (!nuevas.length) return actual;
  var presente = actual ? actual.split(';') : [];
  nuevas.forEach(function (f) {
    if (presente.indexOf(f) === -1) presente.push(f);
  });
  return presente.join(';');
}

/**
 * GAS: barrido de enriquecimiento sobre PACIENTES.
 * Orden: leer pacientes → leer orígenes demográficos (INGRESO_*) → aplicar
 * solo campos vacíos con fuente consistente → estampar FUENTE/FECHA → escribir
 * en UNA llamada → trazar por Log. dryRun=true (default) NO escribe nada.
 * @param {Object} opciones {dryRun:boolean, soloRut?:string}
 * @returns {ok, dryRun, revisados, enriquecidos, aplicados, conflictos,
 *            noEncontrados, sinOrigen, sinCambios, detalle:[]}
 */
function Act_enriquecerPacientes(opciones) {
  opciones = opciones || {};
  var dryRun = opciones.dryRun !== false;
  var resumen = {
    ok: true, dryRun: dryRun,
    revisados: 0, enriquecidos: 0, aplicados: 0,
    conflictos: 0, noEncontrados: 0, sinCambios: 0,
    detalle: []
  };

  var pacientes = Modelo_leerPacientes();
  var porRut = Act_leerOrigenesDemograficos();
  var escrituras = []; // {idxDato, paciente}

  pacientes.forEach(function (p, ix) {
    if (opciones.soloRut) {
      var solo = Utl_texto(opciones.soloRut).toUpperCase();
      if (Utl_texto(p.RUT).toUpperCase() !== solo) return;
    }
    if (!Act_camposVacios(p).length) return; // nada que enriquecer

    var origen = porRut[Utl_texto(p.RUT).toUpperCase()];
    if (!origen) { resumen.noEncontrados++; return; }

    resumen.revisados++;
    var res = Act_aplicarEnriquecimiento(p, origen);

    if (res.aplicados.length) {
      resumen.enriquecidos++;
      resumen.aplicados += res.aplicados.length;
      resumen.detalle.push({
        id: Utl_texto(p.ID_INTERNO),
        campos: res.aplicados.map(function (a) { return a.campo; }),
        fuentes: res.aplicados.map(function (a) { return a.fuente; })
      });
      p.FUENTE = Act_appendFuente(p.FUENTE, res.aplicados.map(function (a) { return a.fuente; }));
      p.FECHA_ACTUALIZACION = new Date();
      escrituras.push({ idxDato: ix, paciente: p });
    }

    if (res.bloqueos.length) {
      resumen.conflictos++;
      resumen.detalle.push({
        id: Utl_texto(p.ID_INTERNO),
        bloqueos: res.bloqueos.map(function (b) { return b.campo + ':' + b.motivo; })
      });
      if (p.REQUIERE_REVISION !== true && p.REQUIERE_REVISION !== 'TRUE') {
        p.REQUIERE_REVISION = true;
        escrituras.push({ idxDato: ix, paciente: p });
      }
    }
  });

  resumen.sinCambios = resumen.revisados - resumen.enriquecidos - resumen.conflictos;

  if (!dryRun && escrituras.length) {
    var esquema = Modelo_asegurarEsquemaPacientes();
    if (!esquema.ok) {
      resumen.ok = false;
      resumen.motivo = 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo;
      return resumen;
    }
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    Utl_escribirBloque(hojaP, Modelo_dataStartRow(HOJAS.PACIENTES), 1,
      pacientes.map(Modelo_filaDesdeObjeto));
    Log_info('Actualizacion', 'enriquecerPacientes',
      JSON.stringify({
        dryRun: dryRun, enriquecidos: resumen.enriquecidos,
        aplicados: resumen.aplicados, conflictos: resumen.conflictos
      }));
  }

  return resumen;
}

/**
 * GAS: diagnóstico dry-run de cuántos
 * pacientes tienen demografía vacía y con fuente disponible/conflictiva.
 * Útil para el reporte previo a aplicar cambios.
 */
function Act_diagnosticarEnriquecimiento() {
  var resumen = Act_enriquecerPacientes({ dryRun: true });
  return {
    campos: CAMPOS_ENRIQUECIMIENTO.slice(),
    resumen: {
      revisados: resumen.revisados,
      enriquecibles: resumen.enriquecidos,
      aplicables: resumen.aplicados,
      conflictos: resumen.conflictos,
      sinOrigen: resumen.noEncontrados
    }
  };
}