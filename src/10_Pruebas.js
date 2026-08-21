/**
 * Sistema ECICEP Unificado — 10_Pruebas
 * Pruebas deterministas del núcleo (DEC-016). Usan EXCLUSIVAMENTE datos
 * ficticios (11_DatosPrueba) y no dependen de hojas, red ni hora actual.
 * Corren igual en Apps Script (menú ECICEP → 🧪) y en node local
 * (tests/ejecutar_local.mjs).
 */

/**
 * Ejecuta todas las suites. @returns {total, pasados, fallidos, detalles:[{nombre,ok,error}]}
 */
function Pruebas_ejecutarTodo() {
  var detalles = [];
  var t = function (nombre, fn) {
    try { fn(); detalles.push({ nombre: nombre, ok: true }); }
    catch (e) { detalles.push({ nombre: nombre, ok: false, error: e && e.message ? e.message : String(e) }); }
  };
  var A = {
    cierto: function (cond, msg) { if (!cond) throw new Error(msg || 'condición falsa'); },
    igual: function (obtenido, esperado, msg) {
      if (obtenido !== esperado) throw new Error((msg || '') + ' · esperado=' + JSON.stringify(esperado) + ' obtenido=' + JSON.stringify(obtenido));
    },
    arreglos: function (obtenido, esperado, msg) {
      var a = JSON.stringify(obtenido), b = JSON.stringify(esperado);
      if (a !== b) throw new Error((msg || '') + ' · esperado=' + b + ' obtenido=' + a);
    }
  };

  _pruebas_rut(t, A);
  _pruebas_telefonos(t, A);
  _pruebas_fechas(t, A);
  _pruebas_nombres(t, A);
  _pruebas_encabezados(t, A);
  _pruebas_estados(t, A);
  _pruebas_estratificacion(t, A);
  _pruebas_sectores(t, A);
  _pruebas_sexos(t, A);
  _pruebas_tipos_evento(t, A);
  _pruebas_staging(t, A);
  _pruebas_identificacion(t, A);
  _pruebas_duplicados_lote(t, A);
  _pruebas_eventos_staging(t, A);
  _pruebas_utilidades(t, A);

  var pasados = detalles.filter(function (d) { return d.ok; }).length;
  return { total: detalles.length, pasados: pasados, fallidos: detalles.length - pasados, detalles: detalles };
}

// ---------------------------------------------------------------------------
function _pruebas_rut(t, A) {
  DATASET_NORMALIZACION.ruts.forEach(function (caso) {
    t('RUT: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarRut(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.igual(r.rut, caso[2], 'rut');
    });
  });
  t('RUT: DV calculado para cuerpo sin DV', function () {
    var r = Norm_normalizarRut('72910265');
    A.igual(r.dvCalculado, Norm_dvModulo11('72910265'), 'dvCalculado coherente con módulo 11');
    A.cierto(r.rut.indexOf('-') === -1, 'no se inventa DV');
  });
  t('RUT: validarRut true/false', function () {
    A.cierto(Norm_validarRut('12.345.678-5'), 'válido');
    A.cierto(!Norm_validarRut('12345678-4'), 'inválido');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_telefonos(t, A) {
  DATASET_NORMALIZACION.telefonos.forEach(function (caso) {
    t('TEL: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarTelefono(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.arreglos(r.telefonos, caso[2], 'telefonos');
      A.arreglos(r.observaciones, caso[3], 'observaciones');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_fechas(t, A) {
  DATASET_NORMALIZACION.fechas.forEach(function (caso) {
    t('FECHA: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarFecha(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.igual(r.iso, caso[2], 'iso');
    });
  });
  t('FECHA: objeto Date válido', function () {
    var r = Norm_normalizarFecha(new Date(2025, 4, 13));
    A.igual(r.estado, 'VALIDA', 'estado');
    A.igual(r.iso, '2025-05-13', 'iso');
  });
  t('FECHA: Date con serial corrupto (año imposible)', function () {
    var r = Norm_normalizarFecha(new Date(2793723, 0, 1)); // serial corrupto visto en fuentes
    A.igual(r.estado, 'INVALIDA', 'estado');
    A.cierto(r.fecha === null, 'sin fecha inventada');
  });
  t('FECHA: MES_ANO no inventa día', function () {
    var r = Norm_normalizarFecha('05/2026');
    A.cierto(r.fecha === null, 'fecha null');
    A.igual(r.iso, '2026-05', 'iso mes/año');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_nombres(t, A) {
  DATASET_NORMALIZACION.nombres.forEach(function (caso) {
    t('NOMBRE: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarNombre(caso[0]);
      A.igual(r.nombre, caso[1], 'nombre');
    });
  });
  t('NOMBRE: clave de matching sin tildes', function () {
    A.igual(Norm_claveNombre('María Ñancú'), 'MARIA NANCU', 'clave sin tildes');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_encabezados(t, A) {
  DATASET_NORMALIZACION.encabezados.forEach(function (caso) {
    t('ENC: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_mapearEncabezado(caso[0]);
      A.igual(r.canonico, caso[1], 'canonico');
      A.igual(r.conocido, caso[2], 'conocido');
      A.igual(r.ambiguo, caso[3], 'ambiguo');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_estados(t, A) {
  DATASET_NORMALIZACION.estados.forEach(function (caso) {
    t('ESTADO: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarEstado(caso[0]), caso[1], 'estado normalizado');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_estratificacion(t, A) {
  DATASET_NORMALIZACION.estratificaciones.forEach(function (caso) {
    t('ESTRAT: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarEstratificacion(caso[0]), caso[1], 'estratificación');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_sectores(t, A) {
  DATASET_NORMALIZACION.sectores.forEach(function (caso) {
    t('SECTOR: ' + JSON.stringify(caso[0]), function () {
      var r = Norm_normalizarSector(caso[0]);
      A.igual(r.estado, caso[1], 'estado');
      A.igual(r.sector, caso[2], 'sector');
    });
  });
  t('SECTOR: dimensiones independientes sector≠G', function () {
    // Un paciente del Sector Amarillo puede ser G3: no existe lógica que cruce ambas.
    A.igual(Norm_normalizarSector('Amarillo').sector, 'AMARILLO', 'sector');
    A.igual(Norm_normalizarEstratificacion('G3'), 'G3', 'estratificación independiente');
    A.igual(Norm_normalizarSector('G3').estado, 'INVALIDO', 'G no es un sector');
  });
}

// ---------------------------------------------------------------------------
function _pruebas_sexos(t, A) {
  DATASET_NORMALIZACION.sexos.forEach(function (caso) {
    t('SEXO: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarSexo(caso[0]), caso[1], 'sexo normalizado');
    });
  });
}

// ---------------------------------------------------------------------------
function _pruebas_tipos_evento(t, A) {
  DATASET_NORMALIZACION.tiposEvento.forEach(function (caso) {
    t('TIPO EV: ' + JSON.stringify(caso[0]), function () {
      A.igual(Norm_normalizarTipoEvento(caso[0]), caso[1], 'tipo de evento');
    });
  });
}

// ===========================================================================
// ETAPA 3 — staging / identificación / duplicados / eventos
// ===========================================================================

function _stagingCaso(nombreCaso, secuencia) {
  var caso = DATASET_STAGING.casos[nombreCaso];
  var f = Fuentes_crearFila(caso.origen, caso.valores, secuencia);
  return Fuentes_normalizar(f);
}

function _pruebas_staging(t, A) {
  t('STAGING: creación con ID determinista y trazabilidad', function () {
    var f = Fuentes_crearFila(DATASET_STAGING.casos.nuevoOk.origen, DATASET_STAGING.casos.nuevoOk.valores, 7);
    A.igual(f.ID_PROVISIONAL, 'SG-0007', 'id');
    A.igual(f.HOJA_ORIGEN, 'INGRESO_VERDE', 'hoja');
    A.igual(f.ESTADO_VALIDACION, 'PENDIENTE', 'estado inicial');
  });
  t('STAGING: valores originales intactos tras normalizar', function () {
    var f = _stagingCaso('nuevoOk', 1);
    A.igual(f.VALORES_ORIGINALES.NOMBRE, 'Carla Beatriz Muñoz Rojas', 'original conservado');
    A.igual(f.VALORES_ORIGINALES.RUT, '15234987-4', 'original rut');
    A.cierto(f.NORMALIZADO !== f.VALORES_ORIGINALES, 'normalizado separado');
  });
  t('STAGING: fila limpia → OK y campos canónicos', function () {
    var f = _stagingCaso('nuevoOk', 2);
    A.igual(f.ESTADO_VALIDACION, 'OK', 'estado');
    A.igual(f.NORMALIZADO.NOMBRE, 'CARLA BEATRIZ MUÑOZ ROJAS', 'nombre');
    A.igual(f.NORMALIZADO.SECTOR, 'VERDE', 'sector');
    A.igual(f.NORMALIZADO.ESTRATIFICACION, 'G2', 'estratificación');
    A.igual(f.NORMALIZADO.FECHA_INGRESO, '2026-03-05', 'fecha ingreso');
    A.igual(f.NORMALIZADO.TELEFONOS, '968112233', 'teléfono');
    A.igual(f.NORMALIZADO.RUT_ESTADO, 'OK', 'rut estado');
  });
  t('STAGING: fuente origen archivo|hoja|fila', function () {
    var f = _stagingCaso('nuevoOk', 3);
    A.igual(Fuentes_fuenteOrigen(f), 'PRUEBA_INGRESO_VERDE|INGRESO_VERDE|2', 'fuente');
  });
  t('STAGING: estructura detecta campos críticos ausentes', function () {
    var r = Fuentes_validarEstructura({ NOMBRE: 'Alguien' }, ['RUT', 'NOMBRE']);
    A.cierto(!r.ok && r.faltantes.indexOf('RUT') !== -1, 'RUT faltante');
    A.cierto(Fuentes_validarEstructura({ RUT: 'x', NOMBRE: 'y' }).ok, 'completo ok');
  });
  t('STAGING: RUT inválido → ERROR sin crash', function () {
    var f = _stagingCaso('rutInvalido', 4);
    A.igual(f.ESTADO_VALIDACION, 'ERROR', 'estado');
    A.igual(f.ERRORES[0].campo, 'RUT', 'campo');
    A.cierto(f.ERRORES[0].mensaje.indexOf('DV') !== -1, 'mensaje DV');
  });
  t('STAGING: RUT ausente → ERROR', function () {
    var f = _stagingCaso('rutAusente', 5);
    A.cierto(f.ERRORES.some(function (e) { return e.campo === 'RUT' && /ausente/.test(e.mensaje); }), 'error RUT');
  });
  t('STAGING: RUT sin DV → WARNING (no bloquea)', function () {
    var f = _stagingCaso('sinDvCoincide', 6);
    A.igual(f.NORMALIZADO.RUT_ESTADO, 'SIN_DV', 'estado rut');
    A.cierto(f.WARNINGS.some(function (w) { return w.campo === 'RUT'; }), 'warning presente');
    A.igual(f.ESTADO_VALIDACION, 'WARNING', 'estado global');
  });
  t('STAGING: nombre de una palabra → WARNING; vacío → ERROR', function () {
    var f1 = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 1 }, { NOMBRE: 'Unicornio', RUT: '11111111-1', SECTOR: 'VERDE', FECHA_INGRESO: '01/02/2026' }, 8);
    Fuentes_normalizar(f1);
    A.cierto(f1.WARNINGS.some(function (w) { return w.campo === 'NOMBRE'; }), 'warning nombre corto');
    var f2 = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 2 }, { NOMBRE: '', RUT: '11111111-1', SECTOR: 'VERDE' }, 9);
    Fuentes_normalizar(f2);
    A.cierto(f2.ERRORES.some(function (e) { return e.campo === 'NOMBRE'; }), 'error nombre vacío');
  });
  t('STAGING: teléfono deformado → WARNING PARCIAL con ambos números', function () {
    var f = _stagingCaso('telefonoDeformado', 10);
    A.cierto(f.WARNINGS.some(function (w) { return w.campo === 'TELEFONOS'; }), 'warning');
    A.igual(f.NORMALIZADO.TELEFONOS, '86273266/94561465', 'telefonos conservados');
  });
  t('STAGING: fecha inválida → ERROR trazable, no crash', function () {
    var f = _stagingCaso('fechaInvalida', 11);
    A.igual(f.ESTADO_VALIDACION, 'ERROR', 'estado');
    A.cierto(f.ERRORES.some(function (e) { return e.campo === 'FECHA_INGRESO'; }), 'error fecha');
  });
  t('STAGING: sector inválido y sector ausente → ERROR', function () {
    var f = _stagingCaso('sectorInvalido', 12);
    A.cierto(f.ERRORES.some(function (e) { return e.campo === 'SECTOR'; }), 'sector ROSARIO');
    var g = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 1 }, { NOMBRE: 'Alguien Dos', RUT: '11111111-1' }, 13);
    Fuentes_normalizar(g);
    A.cierto(g.ERRORES.some(function (e) { return e.campo === 'SECTOR' && /ausente/.test(e.mensaje); }), 'sector ausente');
  });
  t('STAGING: alias NARANJA aceptado → NARANJO', function () {
    var f = _stagingCaso('aliasNaranja', 14);
    A.igual(f.NORMALIZADO.SECTOR, 'NARANJO', 'canonico');
    A.igual(f.ESTADO_VALIDACION, 'OK', 'sin errores por alias');
  });
  t('STAGING: G3 como sector → ERROR; G3 sí vale como estratificación', function () {
    var f = _stagingCaso('g3ComoSector', 15);
    A.cierto(f.ERRORES.some(function (e) { return e.campo === 'SECTOR'; }), 'G3 no es sector');
    A.igual(f.NORMALIZADO.ESTRATIFICACION, 'G3', 'estratificación independiente intacta');
  });
  t('STAGING: sexo no reconocido → WARNING y descartado', function () {
    var f = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 1 }, { NOMBRE: 'Lola Landa Larga', RUT: '14141414-3', SEXO: 'INDETERMINADO', SECTOR: 'VERDE', FECHA_INGRESO: '01/02/2026' }, 16);
    Fuentes_normalizar(f);
    A.igual(f.NORMALIZADO.SEXO, '', 'sexo vacío');
    A.cierto(f.WARNINGS.some(function (w) { return w.campo === 'SEXO'; }), 'warning sexo');
  });
  t('STAGING: estratificación no clasificable conserva original + WARNING', function () {
    var f = _stagingCaso('estratBasura', 17);
    A.igual(f.NORMALIZADO.ESTRATIFICACION, '', 'clasificada vacía');
    A.igual(f.NORMALIZADO.ESTRAT_ORIGEN, 'Z', 'origen conservado');
    A.cierto(f.WARNINGS.some(function (w) { return w.campo === 'ESTRATIFICACION'; }), 'warning pendiente');
  });
  t('STAGING: preingreso textual semántico se conserva', function () {
    var f = _stagingCaso('preingresoTexto', 18);
    A.igual(f.NORMALIZADO.PREINGRESO, 'NO APLICA', 'texto conservado');
  });
}

// ---------------------------------------------------------------------------

function _pruebas_identificacion(t, A) {
  var indices = Iden_construirIndices(DATASET_STAGING.base);

  t('IDEN: índices construidos desde base ficticia', function () {
    A.igual(Object.keys(indices.porRut).length, 4, 'ruts indexados');
    A.igual(Object.keys(indices.porCuerpo).length, 4, 'cuerpos únicos');
    A.igual(indices.porCuerpo['22222222'][0].ID_INTERNO, 'EC-TEST-0004', 'cuerpo del registro sucio');
  });
  t('IDEN: match exacto por RUT completo', function () {
    var f = _stagingCaso('existenteRut', 20);
    var r = Iden_identificar(f.NORMALIZADO, indices);
    A.igual(r.resultado, 'MATCH_EXACTO', 'resultado');
    A.igual(r.idPaciente, 'EC-TEST-0001', 'paciente');
    A.igual(r.confianza, 'ALTA', 'confianza');
  });
  t('IDEN: SIN_DV + cuerpo + nombre → MATCH_PARCIAL', function () {
    var f = _stagingCaso('sinDvCoincide', 21);
    var r = Iden_identificar(f.NORMALIZADO, indices);
    A.igual(r.resultado, 'MATCH_PARCIAL', 'resultado');
    A.igual(r.idPaciente, 'EC-TEST-0003', 'paciente');
    A.igual(r.confianza, 'MEDIA', 'confianza');
  });
  t('IDEN: SIN_DV cuerpo coincide pero nombre difiere → REVISIÓN', function () {
    var n = { RUT: '5555555', RUT_ESTADO: 'SIN_DV', NOMBRE_CLAVE: 'OTRA PERSONA DISTINTA', TELEFONOS: '' };
    var r = Iden_identificar(n, indices);
    A.igual(r.resultado, 'REQUIERE_REVISION', 'conservador');
  });
  t('IDEN: cuerpo existe con DV distinto en base → REVISIÓN (dato sucio)', function () {
    var f = _stagingCaso('cuerpoConDvDistinto', 22);
    var r = Iden_identificar(f.NORMALIZADO, indices);
    A.igual(r.resultado, 'REQUIERE_REVISION', 'nunca auto-decidir');
    A.igual(r.idPaciente, 'EC-TEST-0004', 'candidato señalado');
  });
  t('IDEN: nombre + teléfono → MATCH_PARCIAL', function () {
    var f = _stagingCaso('nombreTelefono', 23);
    var r = Iden_identificar(f.NORMALIZADO, indices);
    A.igual(r.resultado, 'MATCH_PARCIAL', 'resultado');
    A.igual(r.idPaciente, 'EC-TEST-0002', 'paciente');
  });
  t('IDEN: solo nombre idéntico → POSIBLE_DUPLICADO (BAJA)', function () {
    var f = _stagingCaso('posibleDuplicadoNombre', 24);
    var r = Iden_identificar(f.NORMALIZADO, indices);
    A.igual(r.resultado, 'POSIBLE_DUPLICADO', 'no agresivo');
    A.igual(r.idPaciente, 'EC-TEST-0002', 'candidato');
    A.igual(r.confianza, 'BAJA', 'confianza');
  });
  t('IDEN: paciente nuevo real → SIN_MATCH', function () {
    var f = _stagingCaso('nuevoOk', 25);
    var r = Iden_identificar(f.NORMALIZADO, indices);
    A.igual(r.resultado, 'SIN_MATCH', 'nuevo');
  });
}

// ---------------------------------------------------------------------------

function _pruebas_duplicados_lote(t, A) {
  t('LOTE: duplicado exacto por RUT explicado y no destructivo', function () {
    var a = _stagingCaso('dupLoteA', 30), b = _stagingCaso('dupLoteB', 31), c = _stagingCaso('nuevoOk', 32);
    var antes = [a.ID_PROVISIONAL, b.ID_PROVISIONAL, c.ID_PROVISIONAL];
    var dups = Iden_detectarDuplicadosLote([a, b, c]);
    A.igual(dups.length, 1, 'un par detectado');
    A.igual(dups[0].a, 'SG-0030', 'par a');
    A.igual(dups[0].b, 'SG-0031', 'par b');
    A.igual(dups[0].criterio, 'RUT completo idéntico', 'criterio');
    A.igual(dups[0].confianza, 'ALTA', 'confianza');
    A.arreglos([a.ID_PROVISIONAL, b.ID_PROVISIONAL, c.ID_PROVISIONAL], antes, 'filas intactas');
  });
  t('LOTE: solo nombre dentro del lote → BAJA', function () {
    var x = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 1 }, { NOMBRE: 'Pedro Paramo Perez', RUT: '17171717-5', SECTOR: 'VERDE' }, 33);
    var y = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 2 }, { NOMBRE: 'PEDRO PARAMO PEREZ', RUT: '19191919-K', SECTOR: 'VERDE' }, 34);
    Fuentes_normalizar(x); Fuentes_normalizar(y);
    var dups = Iden_detectarDuplicadosLote([x, y]);
    A.igual(dups.length, 1, 'par por nombre');
    A.igual(dups[0].confianza, 'BAJA', 'solo nombre');
    A.igual(dups[0].criterio, 'Solo nombre idéntico', 'criterio');
  });
  t('LOTE: personas distintas → sin duplicados', function () {
    var a = _stagingCaso('dupLoteA', 35), c = _stagingCaso('nuevoOk', 36);
    A.igual(Iden_detectarDuplicadosLote([a, c]).length, 0, 'vacío');
  });
}

// ---------------------------------------------------------------------------

function _pruebas_eventos_staging(t, A) {
  var indices = Iden_construirIndices(DATASET_STAGING.base);

  t('EVENTO: fila con ERROR de validación bloqueada', function () {
    var f = _stagingCaso('rutInvalido', 40);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, indices);
    var r = Ev_desdeStaging(f);
    A.cierto(!r.ok && r.motivo === 'VALIDACION_ERROR', 'gate validación');
  });
  t('EVENTO: identificación pendiente bloqueada', function () {
    var f = _stagingCaso('nuevoOk', 41); // sin RESULTADO_IDENTIFICACION
    var r = Ev_desdeStaging(f);
    A.igual(r.motivo, 'IDENTIFICACION_PENDIENTE', 'gate orden de etapas');
  });
  t('EVENTO: REQUIERE_REVISION bloqueada', function () {
    var f = _stagingCaso('cuerpoConDvDistinto', 42);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, indices);
    var r = Ev_desdeStaging(f);
    A.igual(r.motivo, 'IDENTIFICACION_REQUIERE_REVISION', 'caso dudoso → humano decide');
  });
  t('EVENTO: POSIBLE_DUPLICADO bloqueada salvo confirmación explícita', function () {
    var f = _stagingCaso('posibleDuplicadoNombre', 43);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, indices);
    var r1 = Ev_desdeStaging(f);
    A.igual(r1.motivo, 'IDENTIFICACION_POSIBLE_DUPLICADO', 'bloqueada');
    var r2 = Ev_desdeStaging(f, { confirmarNuevo: true });
    A.cierto(r2.ok, 'override consciente permitido');
    A.cierto(r2.evento.ES_NUEVO_PACIENTE === true, 'nuevo tras override');
  });
  t('EVENTO: nuevo paciente → evento INGRESO completo y trazable', function () {
    var f = _stagingCaso('nuevoOk', 44);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, indices);
    var r = Ev_desdeStaging(f, { secuencia: 1 });
    A.cierto(r.ok, 'creado');
    var ev = r.evento;
    A.igual(ev.ID_EVENTO, 'EV-0001', 'id determinista');
    A.igual(ev.ID_INTERNO, '', 'entidad por crear en consolidación');
    A.igual(ev.TIPO_EVENTO, 'INGRESO', 'tipo por defecto');
    A.igual(ev.FECHA_EVENTO, '2026-03-05', 'fecha evento');
    A.igual(ev.SECTOR, 'VERDE', 'sector del evento');
    A.igual(ev.RIESGO_G, 'G2', 'snapshot riesgo');
    A.igual(ev.FUENTE, 'PRUEBA_INGRESO_VERDE|INGRESO_VERDE|2', 'trazabilidad');
    A.cierto(ev.FECHA_REGISTRO === null, 'la fija el sistema al escribir');
  });
  t('EVENTO: match existente conserva ID_INTERNO', function () {
    var f = _stagingCaso('existenteRut', 45);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, indices);
    var r = Ev_desdeStaging(f, { tipoEvento: 'CONTROL', fechaIso: '2026-04-20' });
    A.cierto(r.ok, 'creado');
    A.igual(r.evento.ID_INTERNO, 'EC-TEST-0001', 'enlazado');
    A.igual(r.evento.TIPO_EVENTO, 'CONTROL', 'tipo explícito');
    A.cierto(!r.evento.ES_NUEVO_PACIENTE, 'no nuevo');
  });
  t('EVENTO: los cuatro tipos del programa quedan como eventos independientes', function () {
    var f = _stagingCaso('nuevoOk', 46);
    f.RESULTADO_IDENTIFICACION = { resultado: 'SIN_MATCH', idPaciente: '', criterio: '', confianza: '' };
    var salida = Ev_variosDesdeStaging(f, DATASET_STAGING.eventosTipos.map(function (op) {
      return { tipoEvento: op.tipoEvento, fechaIso: op.fechaIso };
    }));
    A.cierto(salida.ok, 'todos creados');
    A.arreglos(salida.eventos.map(function (e) { return e.TIPO_EVENTO; }),
      ['INGRESO', 'CONTROL', 'SEGUIMIENTO', 'PLAN_CUIDADO'], 'tipos');
    A.arreglos(salida.eventos.map(function (e) { return e.FECHA_EVENTO; }),
      ['2026-03-05', '2026-06-09', '2026-07-01', '2026-07-15'], 'fechas independientes');
  });
  t('EVENTO: tipo inválido y fecha ausente bloquean', function () {
    var f = _stagingCaso('nuevoOk', 60);
    f.RESULTADO_IDENTIFICACION = { resultado: 'SIN_MATCH', idPaciente: '', criterio: '', confianza: '' };
    A.igual(Ev_desdeStaging(f, { tipoEvento: 'SUPERVISION', fechaIso: '2026-01-01' }).motivo, 'TIPO_EVENTO_INVALIDO', 'tipo');
    var sinFecha = Fuentes_crearFila(f.ARCHIVO_ORIGEN ? { archivo: f.ARCHIVO_ORIGEN, hoja: f.HOJA_ORIGEN, fila: f.FILA_ORIGEN } : {}, { NOMBRE: f.VALORES_ORIGINALES.NOMBRE, RUT: f.VALORES_ORIGINALES.RUT, SECTOR: 'VERDE' }, 61);
    Fuentes_normalizar(sinFecha);
    sinFecha.RESULTADO_IDENTIFICACION = { resultado: 'SIN_MATCH', idPaciente: '', criterio: '', confianza: '' };
    A.igual(Ev_desdeStaging(sinFecha).motivo, 'FECHA_EVENTO_AUSENTE', 'fecha');
  });
}

var _salida_contador_n = 0;
function salida_contador() { _salida_contador_n += 1; return _salida_contador_n - 1; }

var _salida_contador_n = 0;
function salida_contador() { _salida_contador_n += 1; return _salida_contador_n - 1; }

// ---------------------------------------------------------------------------

function _pruebas_utilidades(t, A) {
  t('UTL: claveAlnum de encabezados reales', function () {
    A.igual(Utl_claveAlnum('FECHA PROX. CONTROL'), 'FECHAPROXCONTROL');
    A.igual(Utl_claveAlnum('MEDICO /DUPLA'), 'MEDICODUPLA');
    A.igual(Utl_claveAlnum('TELÉFONO'), 'TELEFONO');
  });
  t('UTL: partir() divide bloques exactos', function () {
    var b = Utl_partir([1, 2, 3, 4, 5], 2);
    A.igual(b.length, 3, 'cantidad de bloques');
    A.igual(b[2].length, 1, 'tamaño último bloque');
  });
  t('UTL: agruparPor agrupa por clave', function () {
    var g = Utl_agruparPor([{ s: 'A' }, { s: 'B' }, { s: 'A' }], function (x) { return x.s; });
    A.igual(g.get('A').length, 2, 'grupo A');
    A.igual(g.get('B').length, 1, 'grupo B');
  });
  t('UTL: vacío seguro', function () {
    A.cierto(Utl_vacio(null) && Utl_vacio('   ') && Utl_vacio(''), 'vacíos detectados');
    A.igual(Utl_texto(null), '', 'texto nulo');
  });
}
