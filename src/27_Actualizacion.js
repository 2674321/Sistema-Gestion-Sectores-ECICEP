/**
 * Sistema ECICEP — 27_Actualizacion
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
 * @returns {ok, dryRun, totalPacientes, revisados, enriquecidos, aplicados,
 *            sinVacias, conflictos, noEncontrados, sinCambios, errores,
 *            detalle:[]}
 */
function Act_enriquecerPacientes(opciones) {
  opciones = opciones || {};
  var dryRun = opciones.dryRun !== false;
  var resumen = {
    ok: true, dryRun: dryRun,
    totalPacientes: 0, revisados: 0, sinVacias: 0,
    enriquecidos: 0, aplicados: 0,
    conflictos: 0, noEncontrados: 0, sinCambios: 0, errores: 0,
    detalle: []
  };

  var pacientes = Modelo_leerPacientes();
  if (dryRun) pacientes = pacientes.map(function (p) { return Object.assign({}, p); });
  resumen.totalPacientes = pacientes.length;
  var porRut = Act_leerOrigenesDemograficos();
  var escrituras = []; // {idxDato, paciente}

  pacientes.forEach(function (p, ix) {
    if (opciones.soloRut) {
      var solo = Utl_texto(opciones.soloRut).toUpperCase();
      if (Utl_texto(p.RUT).toUpperCase() !== solo) return;
    }
    if (!Act_camposVacios(p).length) { resumen.sinVacias++; return; } // sin huecos

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
    var esquema = Modelo_asegurarEsquemaPacientes_();
    if (!esquema.ok) {
      resumen.ok = false;
      resumen.errores = 1;
      resumen.motivo = 'ESQUEMA_PACIENTES_INCOMPATIBLE: ' + esquema.motivo;
      return resumen;
    }
    var hojaP = Modelo_hoja(HOJAS.PACIENTES);
    Utl_escribirBloque(hojaP, Modelo_dataStartRow(HOJAS.PACIENTES), 1,
      pacientes.map(Modelo_filaDesdeObjeto));
    Modelo_invalidarLecturas();
    Log_info('Actualizacion', 'enriquecerPacientes',
      JSON.stringify({
        dryRun: dryRun, totalPacientes: resumen.totalPacientes,
        revisados: resumen.revisados, enriquecidos: resumen.enriquecidos,
        aplicados: resumen.aplicados, sinCambios: resumen.sinCambios,
        conflictos: resumen.conflictos, noEncontrados: resumen.noEncontrados,
        sinVacias: resumen.sinVacias, errores: resumen.errores
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
      totalPacientes: resumen.totalPacientes,
      revisados: resumen.revisados,
      enriquecibles: resumen.enriquecidos,
      aplicables: resumen.aplicados,
      sinCambios: resumen.sinCambios,
      conflictos: resumen.conflictos,
      sinOrigen: resumen.noEncontrados,
      errores: resumen.errores
    }
  };
}

// ---------------------------------------------------------------------------
// ACTUALIZACIÓN de datos desde fuentes (FASE S6, v0.9.7 — DEC-064)
// "Actualizar" es el mecanismo de MANTENIMIENTO completo del sistema:
//   1) estructura (reparación idempotente + alineación vistas sectoriales)
//   2) limpieza de hojas residuales
//   3) datos desde fuentes autorizadas (merge conservador de existentes + nuevos)
//   4) Amarillo (importación desde Drive, ANTES de vistas e INICIO)
//   5) demografía (SEXO/FECHA_NACIMIENTO fill-only)
//   6) derivados (estratificación + controles)
//   7) vistas + secciones visuales + formato condicional + validaciones + diseño
//   8) INICIO + colorear RUT + rebuild menú
//   9) verificación final (8 hojas críticas) + resumen trazable
// Un dato vigente no se sobrescribe jamás y nada se infiere.
//
// REGLAS DEL MERGE (conservador, idempotente):
//   1. fuente vacía/inválida NUNCA destruye un dato existente;
//   2. campos de estado-fecha (ULTIMO_CONTROL/ULTIMO_SEGUIMIENTO): se conserva
//      la fecha MÁS RECIENTE válida;
//   3. campos demográficos (SEXO/FECHA_NACIMIENTO): fill-only; si la fuente
//      diverge de un valor vigente → REQUIERE_REVISION, sin sobrescribir;
//   4. campos de contexto (PROFESIONAL_SEGUIMIENTO, PREINGRESO,
//      DUPLA_INGRESO, TELEFONOS, OBSERVACIONES): fill-only;
//   5. IDENTIDAD, NOMBRE, SECTOR, ESTADO y campos técnicos jamás se escriben
//      desde una fuente (derivados/revisión humana);
//   6. trazabilidad: append a FUENTE + FECHA_ACTUALIZACION.
//   7. PROXIMO_CONTROL es manual: una fuente no rellena una agenda borrada.
//
// MODO SNAPSHOT_ACTUAL (opciones.modo, usado por Instalar): política de CARGA
// inicial/reinstalación que además permite:
//   a. TELEFONOS: REEMPLAZA el consolidado cuando la fuente trae un teléfono
//      válido no vacío (el teléfono vigente de la dupla es la fuente de verdad);
//   b. ESTRATIFICACION: REEMPLAZA cuando la fuente trae una G1/G2/G3 válida.
// NUNCA aplica a SEXO/FECHA_NACIMIENTO (siguen fill-only) ni a SALUD_MENTAL.
//
// SALUD_MENTAL: campo de captura clínica de la dupla. El merge JAMÁS lo escribe
// ni modifica en pacientes existentes (no se infiere, no se sobrescribe); solo
// llega a pacientes NUEVOS a través del pipeline (INGRESO_* → PACIENTES).
// ---------------------------------------------------------------------------

var CAMPOS_MERGE_FUENTE = [
  'SEXO', 'FECHA_NACIMIENTO',
  'ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO',
  'PROFESIONAL_SEGUIMIENTO',
  'PREINGRESO', 'DUPLA_INGRESO', 'TELEFONOS', 'OBSERVACIONES'
];

function Act_camposMerge() {
  return CAMPOS_MERGE_FUENTE.slice();
}

var _CAMPOS_MERGE_FECHA_MAX = ['ULTIMO_CONTROL', 'ULTIMO_SEGUIMIENTO'];

/**
 * PURA: aplica el merge conservador de UNA fila normalizada sobre UN paciente.
 * Si `paciente.FUENTE`/`FECHA_ACTUALIZACION` deben estamparse, lo hace el
 * orquestador (mantiene PII y trazabilidad en un solo lugar).
 * @param {Object} paciente objeto PACIENTES (mutable)
 * @param {Object} n fila.NORMALIZADO (valores canónicos de la fuente)
 * @param {Object} [opciones] {modo:'NORMAL_COTIDIANO'|'SNAPSHOT_ACTUAL'}
 *   SNAPSHOT_ACTUAL (Instalar): reemplaza TELEFONOS y ESTRATIFICACION (G válida)
 *   vigentes de la fuente; el resto se comporta igual que el modo cotidiano.
 * @returns {aplicados:[{campo, valor}], conflictos:[{campo}]}
 */
function Act_mergearPaciente(paciente, n, opciones) {
  var aplicados = [], conflictos = [];
  opciones = opciones || {};
  var snapshot = opciones.modo === 'SNAPSHOT_ACTUAL';
  if (!paciente || !n) return { aplicados: aplicados, conflictos: conflictos };

  // 2) fechas de estado: se conserva la MÁS RECIENTE válida (nunca borra)
  _CAMPOS_MERGE_FECHA_MAX.forEach(function (campo) {
    var actual = Utl_texto(paciente[campo]);
    var can = Utl_texto(n[campo]);
    if (!can) return; // fuente sin dato: no aporta ni destruye
    if (can > actual) {
      paciente[campo] = can;
      aplicados.push({ campo: campo, valor: can });
    }
  });

  // 3) demografía: fill-only; divergencia → conflicto (conserva el vigente)
  //    En SNAPSHOT_ACTUAL sigue siendo fill-only: jamás se pisa un valor.
  ['SEXO', 'FECHA_NACIMIENTO'].forEach(function (campo) {
    var actual = Utl_texto(paciente[campo]);
    var can = Utl_texto(n[campo]);
    if (campo === 'SEXO') can = Norm_normalizarSexo(can); // defensivo: canónicos, sin falsos conflictos
    if (!can) return; // vacío o inválido en la fuente: no se inventa
    if (Utl_texto(actual) === '') {
      paciente[campo] = can;
      aplicados.push({ campo: campo, valor: can });
    } else if (actual !== can) {
      conflictos.push({ campo: campo });
    }
  });

  // 4) contexto: fill-only; en SNAPSHOT_ACTUAL TELEFONOS vigente de la fuente
  //    reemplaza al consolidado (única excepción explícita de la política).
  CAMPOS_MERGE_FUENTE.forEach(function (campo) {
    if (campo === 'SEXO' || campo === 'FECHA_NACIMIENTO') return;
    if (_CAMPOS_MERGE_FECHA_MAX.indexOf(campo) !== -1) return;
    if (campo === 'SALUD_MENTAL') return; // defensivo: jamás se escribe en existentes
    var actual = Utl_texto(paciente[campo]);
    var can = Utl_texto(n[campo]);
    if (!can) return;
    if (snapshot && campo === 'TELEFONOS') {
      // Reemplaza el consolidado solo cuando la fuente trae un valor distinto:
      // reescribir el mismo valor marca la fila como "actualizada" y hace crecer
      // FUENTE en cada Instalar repetido sin producir cambio real (B9).
      if (can === actual) return;
      paciente[campo] = can;
      aplicados.push({ campo: campo, valor: can });
      return;
    }
    if (actual === '') {
      paciente[campo] = can;
      aplicados.push({ campo: campo, valor: can });
    }
  });

  // 5) SNAPSHOT_ACTUAL: ESTRATIFICACION vigente de la fuente (solo G1/G2/G3
  //    válidas) reemplaza a la consolidada. En modo cotidiano jamás se toca.
  if (snapshot) {
    var canE = Norm_normalizarEstratificacion(n.ESTRATIFICACION);
    if (canE && Utl_texto(paciente.ESTRATIFICACION) !== canE) {
      paciente.ESTRATIFICACION = canE;
      aplicados.push({ campo: 'ESTRATIFICACION', valor: canE });
    }
  }

  return { aplicados: aplicados, conflictos: conflictos };
}

/**
 * PURA: aplica el merge sobre TODAS las filas de staging contra los pacientes
 * existentes (match por RUT canónico exacto, misma clave que S5). Solo filas
 * validas (no ERROR) y no se tocan pacientes nuevos ni filas sin RUT.
 * Registro: el `resultado` vuelve con revisados/actualizados/sinCambios/
 * conflictos/campos y detalle mínimo (ID + campos), sin PII.
 * @param {Array} staging filas normalizadas (Fuentes_leerStagingAutorizado)
 * @param {Array} pacientes objetos PACIENTES (se mutan los tocados)
 * @param {Object} [opciones] {modo} — se propaga a Act_mergearPaciente
 * @returns {revisados, actualizados, sinCambios, conflictos, campos, detalle}
 */
function Act_mergearPacientesDesdeStaging(staging, pacientes, opciones) {
  var reporte = {
    revisados: 0, actualizados: 0, sinCambios: 0, conflictos: 0, campos: 0, detalle: []
  };
  var porRut = {};
  (pacientes || []).forEach(function (p) {
    var k = Utl_texto(p.RUT).toUpperCase();
    if (k) porRut[k] = p;
  });
  (staging || []).forEach(function (fila) {
    if (!fila || !fila.NORMALIZADO || !fila.NORMALIZADO.RUT) return;
    if (fila.ESTADO_VALIDACION === 'ERROR') return; // inválidas jamás alimentan
    var n = fila.NORMALIZADO;
    var paciente = porRut[Utl_texto(n.RUT).toUpperCase()];
    if (!paciente) return;
    reporte.revisados++;
    var fuente = Fuentes_fuenteOrigen(fila);
    var res = Act_mergearPaciente(paciente, n, opciones);
    if (res.aplicados.length) {
      reporte.actualizados++;
      reporte.campos += res.aplicados.length;
      reporte.detalle.push({
        id: Utl_texto(paciente.ID_INTERNO),
        campos: res.aplicados.map(function (a) { return a.campo; })
      });
    }
    if (res.conflictos.length) {
      reporte.conflictos++;
      reporte.detalle.push({
        id: Utl_texto(paciente.ID_INTERNO),
        conflictos: res.conflictos.map(function (c) { return c.campo + ':FUENTES_DIVERGENTES'; })
      });
    }
    if (res.aplicados.length || res.conflictos.length) {
      paciente.FUENTE = Act_appendFuente(paciente.FUENTE, [fuente]);
      if (res.aplicados.length) paciente.FECHA_ACTUALIZACION = new Date();
      if (res.conflictos.length && paciente.REQUIERE_REVISION !== true) paciente.REQUIERE_REVISION = true;
    } else {
      reporte.sinCambios++;
    }
  });
  return reporte;
}

/** PURA: resumen breve para el toast del menú Actualizar. */
function Act_resumenActualizacionTexto(reporte) {
  var r = reporte || {};
  var fu = r.fuentes || {};
  var res = fu.resumen || {};
  var m = res.merge || {};
  var partes = [];
  if (res.nuevos) partes.push('nuevos ' + res.nuevos);
  if (m.actualizados) partes.push('actualizados ' + m.actualizados);
  var enr = r.enriquecimiento || {};
  if (enr.enriquecidos) partes.push('demografía ' + enr.enriquecidos);
  if (m.conflictos) partes.push('revisión ' + m.conflictos);
  return partes.length ? partes.join(' · ') : 'sin cambios';
}

/**
 * GAS: ACTUALIZAR sistema — mecanismo de mantenimiento completo (v0.9.6).
 * Cadena única, con una sola implementación compartida (sin duplicar lógica):
 *  1. ESTRUCTURA: reparación idempotente (el instalador CREA; aquí se repara);
 *  2. DATOS: fuentes autorizadas → nuevos registros + actualización de existentes;
 *  3. DEMOGRAFÍA: enriquecimiento S5 (SEXO/FECHA_NACIMIENTO desde INGRESO_*);
 *  4. DERIVADOS: estratificación + próximos controles;
 *  5. VISTAS + FORMATO.
 * ✓ Nunca sobrescribe un dato válido · nunca infiere · nunca crea estructura
 * desde el instalador (separación S12) · idempotente.
 * @param {Object} opciones {ejecutar:boolean=true}
 * @returns {ok, ejecucion, estructura, fuentes, enriquecimiento, derivados,
 *          vistas, formato, resumen}
 */
function Act_actualizarSistema(opciones) {
  opciones = opciones || {};
  var ejecutar = opciones.ejecutar !== false;
  var t0 = Date.now();
  var reporte = {
    ok: true,
    ejecucion: 'ACT-' + Date.now().toString(36).toUpperCase(),
    dryRun: !ejecutar,
    estructura: null, fuentes: null, enriquecimiento: null,
    derivados: null, correcciones: null, vistas: null, formato: null,
    amarillo: null, verificacion: null,
    resumen: {}, detalleErrores: {},
    _errores: []
  };
  function registrarFallo(fase, detalle) {
    if (reporte._errores.indexOf(fase) === -1) reporte._errores.push(fase);
    reporte.detalleErrores[fase] = detalle && detalle.message
      ? detalle.message : String(detalle || 'Error no detallado');
  }

  // 1) ESTRUCTURA (reparación idempotente; nunca destructiva a datos)
  if (ejecutar) try {
    reporte.estructura = Modelo_asegurarEsquemaPacientes_();
    if (reporte.estructura && reporte.estructura.ok === false)
      registrarFallo('estructura', reporte.estructura.motivo);
    reporte.alineacion = Modelo_alinearVistasSectoriales_();
    if (reporte.alineacion && reporte.alineacion.errores && reporte.alineacion.errores.length)
      registrarFallo('estructura', reporte.alineacion.errores.join('; '));
  } catch (e) {
    reporte.estructura = { ok: false, motivo: e && e.message ? e.message : String(e) };
    registrarFallo('estructura', e);
  }

  // 2) INVENTARIO de hojas adicionales: no elimina hojas del usuario.
  if (ejecutar && typeof Modelo_limpiarHojasResiduales === 'function') {
    try { reporte.inventario = Modelo_limpiarHojasResiduales(Modelo_ss()); }
    catch (eL) { registrarFallo('inventario', eL); }
  }

  // 3) DATOS desde fuentes autorizadas
  try { reporte.fuentes = Fuentes_cargaReal({ ejecutar: ejecutar, actualizar: true }); }
  catch (eF) { reporte.fuentes = { ok: false, motivo: eF && eF.message || String(eF) }; }
  if (reporte.fuentes && reporte.fuentes.ok === false)
    registrarFallo('fuentes', reporte.fuentes.motivo);

  // 4) AMARILLO — importar desde Drive ANTES de vistas e INICIO (el orden importa)
  if (ejecutar && typeof Amarillo_importarTodo_ === 'function') {
    try { reporte.amarillo = Amarillo_importarTodo_(true); }
    catch (eA) { reporte.amarillo = { ok: false, motivo: eA && eA.message || String(eA) }; }
    if (reporte.amarillo && reporte.amarillo.ok === false)
      registrarFallo('amarillo', reporte.amarillo.motivo);
  }

  // 5) DEMOGRAFÍA (fill-only, S5)
  if (typeof Act_enriquecerPacientes === 'function') {
    try { reporte.enriquecimiento = Act_enriquecerPacientes({ dryRun: !ejecutar }); }
    catch (eEn) { reporte.enriquecimiento = { ok: false, motivo: eEn && eEn.message || String(eEn) }; }
    if (reporte.enriquecimiento &&
        (reporte.enriquecimiento.ok === false || reporte.enriquecimiento.errores > 0))
      registrarFallo('enriquecimiento', reporte.enriquecimiento.motivo ||
        (reporte.enriquecimiento.errores + ' pacientes con error'));
  }

  // 6) DERIVADOS
  var derivErrores = [];
  if (ejecutar) try { reporte.derivados = { estratificacion: Estrat_recalcularTodos_() }; } catch (eE) { derivErrores.push('estratificación: ' + (eE && eE.message || eE)); }
  if (ejecutar) try { reporte.derivados = reporte.derivados || {}; reporte.derivados.controles = Control_recalcularTodos(); } catch (eC) { derivErrores.push('controles: ' + (eC && eC.message || eC)); }
  if (reporte.derivados && reporte.derivados.estratificacion && reporte.derivados.estratificacion.ok === false)
    derivErrores.push('estratificación: ' + (reporte.derivados.estratificacion.motivo || 'error'));
  if (reporte.derivados && reporte.derivados.controles && reporte.derivados.controles.ok === false)
    derivErrores.push('controles: ' + (reporte.derivados.controles.motivo || 'error'));
  if (derivErrores.length) registrarFallo('derivados', derivErrores.join('; '));

  // Las fuentes pueden volver a adelantar la caché de una atención cuya fecha
  // fue corregida. EVENTOS auditado conserva la fecha efectiva de referencia.
  if (ejecutar) try { reporte.correcciones = Captura_reconciliarFechasCorregidas_(); } catch (eR) {
    reporte.correcciones = { ok: false, motivo: eR && eR.message ? eR.message : String(eR) };
    registrarFallo('correcciones', eR);
  }
  if (reporte.correcciones && reporte.correcciones.ok === false)
    registrarFallo('correcciones', reporte.correcciones.motivo);

  // 7) VISTAS (refresh después de Amarillo + datos)
  if (ejecutar) try { reporte.vistas = Modelo_refrescarVistasSectores_(); } catch (eV) {
    reporte.vistas = { ok: false, motivo: eV && eV.message ? eV.message : String(eV) };
    registrarFallo('vistas', eV);
  }
  if (reporte.vistas && reporte.vistas.ok === false)
    registrarFallo('vistas', reporte.vistas.motivo);

  // 8) SECCIONES VISuales (barras de sección en fila 2 de todas las hojas visuales)
  if (ejecutar && typeof HVis_aplicarTodasLasSecciones === 'function') {
    try { reporte.seccionesVisuales = HVis_aplicarTodasLasSecciones(); }
    catch (eSV) { reporte.seccionesVisuales = { ok: false, motivo: eSV && eSV.message || String(eSV) }; }
    var seccionesFallidas = (reporte.seccionesVisuales && reporte.seccionesVisuales.resultados || [])
      .filter(function (x) { return x.ok === false; });
    if (reporte.seccionesVisuales && (reporte.seccionesVisuales.ok === false || seccionesFallidas.length))
      registrarFallo('seccionesVisuales', reporte.seccionesVisuales.motivo ||
        seccionesFallidas.map(function (x) { return x.hoja + ': ' + (x.motivo || 'error'); }).join('; '));
  }

  // 8b) FORMATO DE INGRESOS (formato específico para hojas INGRESO_* —不同于 secciones)
  if (ejecutar && typeof HVis_formatearIngresos === 'function') {
    try { reporte.formato = HVis_formatearIngresos(); }
    catch (eF) { reporte.formato = { ok: false, motivo: eF && eF.message || String(eF) }; }
    if (reporte.formato &&
        (reporte.formato.ok === false || (reporte.formato._fallidas || []).length))
      registrarFallo('formato', reporte.formato.motivo ||
        (reporte.formato._fallidas || []).join('; '));
  }

  // 9) FORMATO CONDICIONAL (reglas de color por campo)
  if (ejecutar) {
    try { reporte.formatoCondicional = Hojas_formatoCondicional(Modelo_ss()); }
    catch (eC) { reporte.formatoCondicional = { ok: false, motivo: eC && eC.message || String(eC) }; }
    if (reporte.formatoCondicional &&
        (reporte.formatoCondicional.ok === false || (reporte.formatoCondicional.errores || []).length))
      registrarFallo('formatoCondicional', reporte.formatoCondicional.motivo ||
        (reporte.formatoCondicional.errores || []).join('; '));
  }

  // 10) VALIDACIONES (dropdowns, date pickers) — re-aplicar para que nuevos registros
  //     reciban las mismas reglas que la instalación. Idempotente.
  if (ejecutar && typeof Modelo_validarIngresos === 'function') {
    try { reporte.validaciones = Modelo_validarIngresos(Modelo_ss()); }
    catch (eVx) { reporte.validaciones = { ok: false, motivo: eVx && eVx.message || String(eVx) }; }
    if (reporte.validaciones &&
        (reporte.validaciones.ok === false || (reporte.validaciones.fallidas || []).length))
      registrarFallo('validaciones', reporte.validaciones.motivo ||
        (reporte.validaciones.fallidas || []).join('; '));
  }

  // 11) DISEÑO DEL LIBRO (colores pestaña, frozen, banding, encabezado, orden, ocultamiento)
  if (ejecutar && typeof Modelo_aplicarDiseno === 'function') {
    try { reporte.diseno = Modelo_aplicarDiseno(); }
    catch (eD) { reporte.diseno = { ok: false, motivo: eD && eD.message || String(eD) }; }
    if (reporte.diseno && (reporte.diseno.ok === false || (reporte.diseno.fallidas || []).length))
      registrarFallo('diseno', reporte.diseno.motivo || (reporte.diseno.fallidas || []).join('; '));
  }

  // 12) INICIO (hoja dashboard) — refrescar después de Amarillo + derivados
  if (ejecutar && typeof Modelo_disenoHojas === 'function') {
    try { reporte.inicio = Modelo_disenoHojas(); }
    catch (eI) { reporte.inicio = { ok: false, motivo: eI && eI.message || String(eI) }; }
    if (reporte.inicio && reporte.inicio.ok === false)
      registrarFallo('inicio', reporte.inicio.motivo);
  }

  // 12b) Colorear RUT en INGRESO_* (coherencia visual)
  if (ejecutar && typeof Hojas_colorearRutIngresos === 'function') {
    try { reporte.rutColoreados = Hojas_colorearRutIngresos(); }
    catch (eR) { registrarFallo('rutColoreados', eR); }
    if (reporte.rutColoreados && (reporte.rutColoreados.fallidas || []).length)
      registrarFallo('rutColoreados', reporte.rutColoreados.fallidas.join('; '));
  }

  // 13) REBUILD MENÚ (si hubo cambios en items, reflejarlos)
  if (ejecutar && typeof onOpen === 'function') {
    try { onOpen(); } catch (eM) { /* best effort */ }
  }

  // 14) VERIFICACIÓN FINAL — comprobar integridad de las 8 hojas críticas
  if (ejecutar) {
    try {
      var ss = Modelo_ss();
      var criticas = [HOJAS.PACIENTES, HOJAS.EVENTOS, HOJAS_SECTOR[0], HOJAS_SECTOR[1],
        HOJAS_SECTOR[2], Object.keys(HOJAS_INGRESO)[0], Object.keys(HOJAS_INGRESO)[1],
        Object.keys(HOJAS_INGRESO)[2]];
      var faltan = [];
      criticas.forEach(function (nombre) {
        if (!ss.getSheetByName(nombre)) faltan.push(nombre);
      });
      if (faltan.length) {
        reporte.verificacion = { ok: false, faltan: faltan };
        registrarFallo('verificación', 'Faltan hojas: ' + faltan.join(', '));
      } else {
        reporte.verificacion = { ok: true, hojasCriticas: criticas.length };
      }
    } catch (eVf) { reporte.verificacion = { ok: false, motivo: eVf && eVf.message || String(eVf) }; registrarFallo('verificación', eVf); }
  }

  // Consolidar ok global
  if (reporte._errores.length) reporte.ok = false;

  // 6) RESUMEN consolidado (trazabilidad)
  var fu = reporte.fuentes || {};
  var res = fu.resumen || {};
  var m = res.merge || {};
  var enr = reporte.enriquecimiento || {};
  var deriv = reporte.derivados || {};
  reporte.resumen = {
    fuentesRevisadas: res.fuentesRevisadas || 0,
    registros: res.registros || 0,
    nuevos: res.nuevos || 0,
    existentes: res.existentes || 0,
    yaImportadas: res.yaImportadas || 0,
    actualizados: m.actualizados || 0,
    sinCambiosMerge: m.sinCambios || 0,
    conflictos: (m.conflictos || 0) + (res.revision || 0) + (enr.conflictos || 0),
    camposActualizados: m.campos || 0,
    enriquecidos: enr.enriquecidos || 0,
    estructuraMigrada: !!(reporte.estructura && reporte.estructura.migrada),
    estratificaciones: (deriv.estratificacion && deriv.estratificacion.recalculados) || 0,
    controlesRecalculados: (deriv.controles && deriv.controles.cambios) || 0,
    errores: reporte._errores,
    detalleErrores: reporte.detalleErrores,
    ms: Date.now() - t0
  };

  if (ejecutar) {
    var registrar = reporte.ok ? Log_info : Log_error;
    registrar('Actualizacion', 'actualizarSistema', JSON.stringify(reporte.resumen),
      { ejecucion: reporte.ejecucion, dryRun: false });
    Log_flush();
  }
  return reporte;
}
