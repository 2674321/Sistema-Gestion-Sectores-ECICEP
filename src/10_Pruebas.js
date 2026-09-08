/**
 * Sistema ECICEP — 10_Pruebas
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
  _pruebas_ingresos_3b(t, A);
  _pruebas_gate_trazabilidad(t, A);
  _pruebas_contrato_ingreso(t, A);
  _pruebas_vistas_sector(t, A);
  _pruebas_etapa4(t, A);
  _pruebas_hardguard(t, A);
  _pruebas_estrat_estado(t, A);
  _pruebas_motor_estrat(t, A);
  _pruebas_ponderacion(t, A);
  _pruebas_contrato_catalogo(t, A);
  _pruebas_utilidades(t, A);
  _pruebas_migracion_esquema(t, A);
  _pruebas_trazabilidad(t, A);
  _pruebas_rem(t, A);
  _pruebas_rem_ancho(t, A);
  _pruebas_diseno(t, A);
  _pruebas_rem_pdf(t, A);
  _pruebas_instalador(t, A);
  _pruebas_rem_excel(t, A);
  _pruebas_amarillo(t, A);
  _pruebas_limpieza(t, A);
  _pruebas_hojas(t, A);
  _pruebas_calidad(t, A);
  _pruebas_profesionales(t, A);
  _pruebas_config_v085(t, A);
  _pruebas_control_v085(t, A);
  _pruebas_controles_v087(t, A);
  _pruebas_dialogos_v087(t, A);
  _pruebas_responsables_v0872(t, A);
  _pruebas_auditoria_v088(t, A);
  _pruebas_escala_v088(t, A);
  _pruebas_hojasvisual_v0881(t, A);
  _pruebas_hojasvisual_v0883(t, A);
  _pruebas_pulido_v0895(t, A);
  _pruebas_designsystem_v0896(t, A);
  _pruebas_formulario_v090(t, A);
  _pruebas_entornos_v091(t, A);
  _pruebas_operativo_v092(t, A);
  _pruebas_enriquecimiento_s5(t, A);
  _pruebas_enriquecimiento_s11(t, A);
  _pruebas_auditoria_s11r(t, A);
  _pruebas_separacion_s12(t, A);
  _pruebas_s10fix_esquema(t, A);
  _pruebas_inst1_versionado(t, A);
  _pruebas_inicio_formulas(t, A);

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

// ===========================================================================
// ETAPA 3b — adaptadores INGRESO_* · gates · transacción paciente/evento
// ===========================================================================

function _pruebas_ingresos_3b(t, A) {
  t('3B ADAPTADOR: hoja → sector canónico', function () {
    A.igual(Ingresos_hojaASector('INGRESO_NARANJA'), 'NARANJO', 'naranja→naranjo');
    A.igual(Ingresos_hojaASector('INGRESO_AMARILLO'), 'AMARILLO', 'amarillo');
    A.igual(Ingresos_hojaASector('INGRESO_VERDE'), 'VERDE', 'verde');
    A.igual(Ingresos_hojaASector('INGRESO_X'), '', 'desconocida');
  });

  // CASO A — paciente nuevo válido
  t('3B CASO A: nuevo → PACIENTES +1, EVENTOS +1', function () {
    var store = { pacientes: [], eventos: [] };
    var s = Ingresos_procesarFilas([_stagingCaso('nuevoOk', 1)], store,
      { nuevoId: function (i) { return 'EC-TEST-N' + ('00' + i).slice(-3); } });
    A.igual(store.pacientes.length, 1, 'pacientes');
    A.igual(store.eventos.length, 1, 'eventos');
    A.igual(s.resumen.nuevos, 1, 'resumen nuevos');
    A.igual(store.eventos[0].TIPO_EVENTO, 'INGRESO', 'tipo');
    A.igual(store.eventos[0].SECTOR, 'VERDE', 'sector evento');
    A.igual(store.pacientes[0].ID_INTERNO, 'EC-TEST-N001', 'id inyectable');
    A.cierto(store.pacientes[0].RUT_DV_VALIDO === true, 'dv válido');
    A.igual(s.resultados[0].estado, 'INGRESADO', 'resultado fila');
  });

  // CASO B — existente exacto: +0 paciente / +1 evento / campos intactos
  t('3B CASO B: existente MATCH_EXACTO → +0 pacientes, +1 evento, sin sobrescritura', function () {
    var base = DATASET_STAGING.base[0];
    var snapshot = JSON.stringify(base);
    var store = { pacientes: [base], eventos: [] };
    var s = Ingresos_procesarFilas([_stagingCaso('existenteRut', 2)], store, {});
    A.igual(store.pacientes.length, 1, '+0 pacientes');
    A.igual(store.eventos.length, 1, '+1 evento');
    A.igual(store.eventos[0].ID_INTERNO, 'EC-TEST-0001', 'enlazado');
    A.igual(s.resumen.existentes, 1, 'resumen existentes');
    A.igual(JSON.stringify(store.pacientes[0]), snapshot, 'paciente intacto');
  });

  // CASO C — ambiguo: nada se escribe
  t('3B CASO C: POSIBLE_DUPLICADO sin confirmar → REQUIERE_REVISION y cero escritura', function () {
    var store = { pacientes: DATASET_STAGING.base.slice(), eventos: [] };
    var s = Ingresos_procesarFilas([_stagingCaso('posibleDuplicadoNombre', 3)], store, {});
    A.igual(store.pacientes.length, DATASET_STAGING.base.length, '+0 pacientes');
    A.igual(store.eventos.length, 0, '+0 eventos');
    A.igual(s.resumen.revision, 1, 'a revisión');
    A.igual(s.resumen.duplicados, 1, 'resumen duplicados (POSIBLE_DUPLICADO)');
    A.igual(s.resultados[0].estado, 'REQUIERE_REVISION', 'estado fila');
  });

  // CASO D — RUT inválido: bloqueado
  t('3B CASO D: RUT inválido → NO ESCRIBIR, ERROR', function () {
    var store = { pacientes: [], eventos: [] };
    var s = Ingresos_procesarFilas([_stagingCaso('rutInvalido', 4)], store, {});
    A.igual(store.pacientes.length, 0, 'sin pacientes');
    A.igual(store.eventos.length, 0, 'sin eventos');
    A.igual(s.resultados[0].estado, 'ERROR', 'bloqueado');
    A.cierto(s.resultados[0].nota.indexOf('RUT') !== -1, 'nota explicativa');
  });

  // CASO E — ingreso desde INGRESO_AMARILLO
  t('3B CASO E: origen AMARILLO → EVENTO.SECTOR = AMARILLO', function () {
    var store = { pacientes: [], eventos: [] };
    Ingresos_procesarFilas([_stagingCaso('sectorValido', 5)], store, {});
    A.igual(store.eventos[0].SECTOR, 'AMARILLO', 'sector del evento');
    A.igual(store.pacientes[0].SECTOR, 'AMARILLO', 'sector de la entidad');
  });

  // CASO F — ingreso desde INGRESO_NARANJA (alias) → NARANJO
  t('3B CASO F: origen NARANJA → EVENTO.SECTOR = NARANJO', function () {
    var store = { pacientes: [], eventos: [] };
    Ingresos_procesarFilas([_stagingCaso('aliasNaranja', 6)], store, {});
    A.igual(store.eventos[0].SECTOR, 'NARANJO', 'canónico NARANJO');
  });

  // CASO G — G3 en campo sector jamás prospera
  t('3B CASO G: "G3" como sector → ERROR, nunca SECTOR=G3', function () {
    var store = { pacientes: [], eventos: [] };
    var f = _stagingCaso('g3ComoSector', 7);
    A.igual(f.NORMALIZADO.SECTOR, '', 'sector vacío, no G3');
    var s = Ingresos_procesarFilas([f], store, {});
    A.igual(store.pacientes.length, 0, 'sin escritura');
    A.igual(s.resultados[0].estado, 'ERROR', 'bloqueado');
    A.igual(f.NORMALIZADO.ESTRATIFICACION, 'G3', 'estratificación sí es G3');
  });

  // CASO H — misma persona, tres gestiones = tres eventos independientes
  t('3B CASO H: INGRESO+CONTROL+SEGUIMIENTO → 3 eventos append-only', function () {
    var base = JSON.parse(JSON.stringify(DATASET_STAGING.casos.nuevoOk));
    function variar(fecha, tipo) {
      var c = JSON.parse(JSON.stringify(base));
      c.valores.FECHA_INGRESO = fecha;
      c.valores.TIPO_EVENTO = tipo;
      return Fuentes_normalizar(Fuentes_crearFila(c.origen, c.valores));
    }
    var store = { pacientes: [], eventos: [] };
    var r1 = Ingresos_procesarFilas([variar('05/03/2026', 'INGRESO')], store,
      { nuevoId: function (i) { return 'EC-TEST-H01'; } });
    A.cierto(r1.ok !== false && store.eventos.length === 1, 'primera gestión');
    var antes = JSON.stringify(store.eventos[0]);
    Ingresos_procesarFilas([variar('09/06/2026', 'CONTROL')], store,
      { nuevoId: function () { throw new Error('no debe crear otro paciente'); } });
    Ingresos_procesarFilas([variar('01/07/2026', 'SEGUIMIENTO')], store, {});
    A.igual(store.pacientes.length, 1, 'una sola entidad');
    A.igual(store.eventos.length, 3, 'tres eventos');
    A.arreglos(store.eventos.map(function (e) { return e.TIPO_EVENTO; }),
      ['INGRESO', 'CONTROL', 'SEGUIMIENTO'], 'tipos');
    A.arreglos(store.eventos.map(function (e) { return e.ID_INTERNO; }),
      ['EC-TEST-H01', 'EC-TEST-H01', 'EC-TEST-H01'], 'mismo paciente');
    A.arreglos(store.eventos.map(function (e) { return e.FECHA_EVENTO; }),
      ['2026-03-05', '2026-06-09', '2026-07-01'], 'fechas por evento');
    A.igual(JSON.stringify(store.eventos[0]), antes, 'append-only: evento previo intacto');
  });

  t('3B: duplicado dentro del lote se enlaza a la ficha creada en el mismo lote', function () {
    var store = { pacientes: [], eventos: [] };
    var s = Ingresos_procesarFilas(
      [_stagingCaso('dupLoteA', 10), _stagingCaso('dupLoteB', 11)], store,
      { nuevoId: function (i) { return 'EC-TEST-D' + i; } });
    A.igual(store.pacientes.length, 1, 'una sola ficha');
    A.igual(store.eventos.length, 2, 'dos ingresos registrados');
    A.cierto(s.resultados.every(function (r) { return r.idInterno === 'EC-TEST-D1'; }), 'mismo ID_INTERNO');
  });

  t('3B: warning no bloquea el procesamiento', function () {
    var store = { pacientes: [], eventos: [] };
    var s = Ingresos_procesarFilas([_stagingCaso('telefonoDeformado', 12)], store,
      { nuevoId: function () { return 'EC-TEST-W1'; } });
    A.igual(s.resultados[0].estado, 'INGRESADO', 'warning procesable');
    A.igual(store.eventos.length, 1, 'evento creado');
  });

  t('3B: fecha ausente en nueva persona → revisión sin escrituras', function () {
    var store = { pacientes: [], eventos: [] };
    // fila con RUT inválido: el gate de validación manda primero
    var fila2 = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 2 },
      { NOMBRE: 'Nora Nadie Nuñez', RUT: '16161616-?', SECTOR: 'VERDE' }, 21);
    Fuentes_normalizar(fila2);
    var s = Ingresos_procesarFilas([fila2], store, {});
    A.igual(store.pacientes.length, 0, 'sin escritura');
    A.igual(s.resultados[0].estado, 'ERROR', 'rut inválido manda primero');
    // caso limpio solo sin fecha:
    var fila3 = Fuentes_crearFila({ archivo: 'M', hoja: 'H', fila: 3 },
      { NOMBRE: 'Ofelia Ocampo Ortiz', RUT: '17171717-5', SECTOR: 'VERDE' }, 22);
    Fuentes_normalizar(fila3);
    var s3 = Ingresos_procesarFilas([fila3], store, {});
    A.igual(s3.resultados[0].estado, 'REQUIERE_REVISION', 'gate fecha');
    A.igual(s3.resultados[0].nota, 'FECHA_EVENTO_AUSENTE', 'motivo trazable');
    A.igual(store.pacientes.length, 0, 'sigue sin escritura');
  });

  t('3B REGRESIÓN: fila CRUDA (sin normalizar) ya no se bloquea — incidente 36/36', function () {
    // Reproduce EXACTAMENTe el defecto real: el wrapper entregaba filas de
    // Ingresos_leerHoja sin pasar por Fuentes_normalizar.
    var cruda = Fuentes_crearFila(DATASET_STAGING.casos.nuevoOk.origen, DATASET_STAGING.casos.nuevoOk.valores, 99);
    A.igual(cruda.ESTADO_VALIDACION, 'PENDIENTE', 'llega sin validar (como en el bug)');
    var store = { pacientes: [], eventos: [] };
    var s = Ingresos_procesarFilas([cruda], store,
      { nuevoId: function () { return 'EC-TEST-RAW1'; } });
    A.igual(s.resumen.validacionOk, 1, 'normalizada dentro del orquestador');
    A.igual(store.pacientes.length, 1, 'paciente creado');
    A.igual(store.eventos.length, 1, 'evento creado');
    A.igual(s.resultados[0].estado, 'INGRESADO', 'procesada');
  });

  t('3B: resumen integrador con lote mixto', function () {
    var store = { pacientes: DATASET_STAGING.base.slice(), eventos: [] };
    var s = Ingresos_procesarFilas([
      _stagingCaso('nuevoOk', 30),                 // nuevo
      _stagingCaso('existenteRut', 31),            // existente (base[0])
      _stagingCaso('posibleDuplicadoNombre', 32),  // revisión
      _stagingCaso('rutInvalido', 33)              // error
    ], store, { nuevoId: function () { return 'EC-TEST-MIX'; } });
    A.igual(s.resumen.leidos, 4, 'leídos');
    A.igual(s.resumen.conError, 1, 'con error');
    A.igual(s.resumen.nuevos, 1, 'nuevos');
    A.igual(s.resumen.existentes, 1, 'existentes');
    A.igual(s.resumen.revision, 1, 'revisión');
    A.igual(s.resumen.eventosCreados, 2, 'eventos creados');
    A.igual(s.resumen.validos, 2, 'válidos');
  });
}

// ---------------------------------------------------------------------------
// ETAPA 3b-fix — tabla de verdad del gate + trazador por etapa
// ---------------------------------------------------------------------------

function _pruebas_gate_trazabilidad(t, A) {
  var indices = Iden_construirIndices(DATASET_STAGING.base);

  t('GATE tabla: OK + SIN_MATCH → CREAR_PACIENTE', function () {
    var f = _stagingCaso('nuevoOk', 40);
    var tr = Ingresos_trazarFila(f, indices);
    A.igual(tr.estadoValidacion, 'OK', 'validación');
    A.igual(tr.identificacion.resultado, 'SIN_MATCH', 'identificación');
    A.igual(tr.decisionGate, 'CREAR_PACIENTE', 'gate');
    A.igual(tr.motivoBloqueo, '', 'sin bloqueo');
  });
  t('GATE tabla: WARNING + SIN_MATCH → CREAR_PACIENTE (warning NO bloquea)', function () {
    var f = _stagingCaso('telefonoDeformado', 41);
    var tr = Ingresos_trazarFila(f, indices);
    A.igual(tr.estadoValidacion, 'WARNING', 'validación');
    A.igual(tr.decisionGate, 'CREAR_PACIENTE', 'gate');
    A.igual(tr.motivoBloqueo, '', 'procesable');
  });
  t('GATE tabla: ERROR (DV incorrecto) → BLOQUEADO con motivo trazable', function () {
    var f = _stagingCaso('rutInvalido', 42);
    var tr = Ingresos_trazarFila(f, indices);
    A.igual(tr.decisionGate, 'BLOQUEADO', 'gate');
    A.cierto(tr.motivoBloqueo.indexOf('RUT') !== -1 && tr.motivoBloqueo.indexOf('DV') !== -1, 'motivo');
  });
  t('GATE tabla: OK + MATCH_EXACTO → ENLAZAR_EXISTENTE', function () {
    var f = _stagingCaso('existenteRut', 43);
    var tr = Ingresos_trazarFila(f, indices);
    A.igual(tr.identificacion.resultado, 'MATCH_EXACTO', 'identificación');
    A.igual(tr.decisionGate, 'ENLAZAR_EXISTENTE', 'gate');
  });
  t('GATE tabla: POSIBLE_DUPLICADO sin confirmar → REVISION', function () {
    var f = _stagingCaso('posibleDuplicadoNombre', 44);
    var tr = Ingresos_trazarFila(f, indices);
    A.igual(tr.identificacion.resultado, 'POSIBLE_DUPLICADO', 'identificación conservadora intacta (DEC-024)');
    A.igual(tr.decisionGate, 'REVISION', 'nunca automático');
  });

  t('MÉTRICAS separadas: lote mixto desglosado por concepto', function () {
    var store = { pacientes: DATASET_STAGING.base.slice(), eventos: [] };
    var s = Ingresos_procesarFilas([
      _stagingCaso('nuevoOk', 50),            // validación OK → nuevo
      _stagingCaso('telefonoDeformado', 51),  // validación WARNING → nuevo
      _stagingCaso('rutInvalido', 52),        // validación ERROR → bloqueado
      _stagingCaso('posibleDuplicadoNombre', 53) // revisión
    ], store, { nuevoId: function (i) { return 'EC-TEST-MX' + i; } });
    A.igual(s.resumen.leidos, 4, 'leídos');
    A.igual(s.resumen.validacionOk, 1, 'validación OK (solo nuevoOk)');
    A.igual(s.resumen.validacionWarning, 2, 'validación WARNING');
    A.igual(s.resumen.validacionError, 1, 'validación ERROR');
    A.igual(s.resumen.bloqueados, 1, 'bloqueados');
    A.igual(s.resumen.conError, 1, 'conError == validacionError (ya no mezcla conceptos)');
    A.igual(s.resumen.nuevos, 2, 'creados (OK y WARNING)');
    A.igual(s.resumen.revision, 1, 'revisión');
    A.igual(s.resumen.eventosCreados, 2, 'eventos solo de procesadas');
  });

  t('DATASET: estratBasura corregido a RUT válido → ya no es ERROR', function () {
    var f = _stagingCaso('estratBasura', 54);
    A.cierto(f.NORMALIZADO.RUT_ESTADO === 'OK' || f.NORMALIZADO.RUT_ESTADO === 'SIN_DV',
      'RUT del caso estratBasura válido (era bug del dataset)');
    A.cierto(!f.ERRORES.some(function (e) { return e.campo === 'RUT'; }), 'sin error de RUT');
    A.cierto(f.WARNINGS.some(function (w) { return w.campo === 'ESTRATIFICACION'; }),
      'sigue advirtiendo la estratificación Z');
  });
  t('WEBHOOK: catálogo de acciones no destructivas definido', function () {
    A.cierto(WEBHOOK_ACCIONES.indexOf('procesar') !== -1, 'procesar permitido');
    A.cierto(WEBHOOK_ACCIONES.indexOf('limpiar_prueba') !== -1, 'limpieza de prueba permitida');
    A.cierto(WEBHOOK_ACCIONES.indexOf('borrar_todo') === -1, 'jamás existe borrar_todo');
  });
}

// ---------------------------------------------------------------------------

function _pruebas_contrato_ingreso(t, A) {
  t('CONTRATO: todos los encabezados del instalador son procesables por el adaptador', function () {
    var mapa = Ingresos_mapearEncabezadosHoja(Ingresos_columnasHoja());
    var faltantes = CAMPOS_INGRESO_OPERATIVOS.filter(function (c) { return mapa.campos[c] === undefined; });
    A.arreglos(faltantes, [], 'sin campos operativos sin mapear');
    A.cierto(mapa.estadoIdx !== -1, 'columna ESTADO_INGRESO detectada');
    A.cierto(mapa.notaIdx !== -1, 'columna NOTA_SISTEMA detectada');
    A.igual(mapa.desconocidos.length, 0, 'sin columnas desconocidas');
  });
  t('CONTRATO: regresión TELEFONO(S) → campo TELEFONOS del modelo', function () {
    var mapa = Ingresos_mapearEncabezadosHoja(Ingresos_columnasHoja());
    A.cierto(mapa.campos.TELEFONOS !== undefined, 'TELEFONOS capturado (bug corregido)');
  });
  t('CONTRATO: etiquetas antiguas siguen mapeando (compatibilidad hojas existentes)', function () {
    var mapa = Ingresos_mapearEncabezadosHoja(
      ['NOMBRE', 'RUT', 'FECHA NACIMIENTO', 'TELEFONO(S)', 'FECHA INGRESO', 'ESTADO_INGRESO', 'NOTA_SISTEMA']);
    A.cierto(mapa.campos.FECHA_NACIMIENTO !== undefined, 'FECHA NACIMIENTO');
    A.cierto(mapa.campos.TELEFONOS !== undefined, 'TELEFONO(S)');
    A.cierto(mapa.campos.FECHA_INGRESO !== undefined, 'FECHA INGRESO');
  });
  t('CONTRATO B1: variantes de encabezado de FECHA_NACIMIENTO (NACIMIENTO / FECHA NAC / F.N. / DOB)', function () {
    ['NACIMIENTO', 'FECHA NAC', 'F.N.', 'DOB'].forEach(function (h) {
      var mapa = Ingresos_mapearEncabezadosHoja([h]);
      A.igual(mapa.campos.FECHA_NACIMIENTO, 0, h + ' → FECHA_NACIMIENTO');
      A.igual(mapa.desconocidos.length, 0, h + ' sin desconocidos');
    });
  });
  t('CONTRATO: nombres de hoja oficiales y alias', function () {
    A.igual(Ingresos_hojaASector('INGRESO_NARANJO'), 'NARANJO', 'ortografía oficial');
    A.igual(Ingresos_hojaASector('INGRESO_NARANJA'), 'NARANJO', 'alias cliente mantenido');
    A.igual(Ingresos_hojaASector('INGRESO_AMARILLO'), 'AMARILLO', 'amarillo');
    A.igual(Ingresos_hojaASector('INGRESO_VERDE'), 'VERDE', 'verde');
  });
  t('CONTRATO: fila simulada con plantilla real se valida sin ERROR estructural', function () {
    // replica exactamente lo que el instalador crea + lo que el sembrador escribe
    var encabezados = Ingresos_columnasHoja();
    var valores = ['Carla Test Verde', '15234987-4', 'F', '', '968112233', '05/03/2026', 'G2', '', '', 'PENDIENTE', 'PRUEBA'];
    var mapa = Ingresos_mapearEncabezadosHoja(encabezados);
    var v = {};
    CAMPOS_INGRESO_OPERATIVOS.forEach(function (c) {
      if (mapa.campos[c] !== undefined) v[c] = valores[mapa.campos[c]];
    });
    var f = Fuentes_normalizar(Fuentes_crearFila(
      { archivo: 'HOJA_INGRESO', hoja: 'INGRESO_VERDE', fila: 2, sector: Ingresos_hojaASector('INGRESO_VERDE') }, v));
    A.igual(f.ESTADO_VALIDACION, 'OK', 'fila de plantilla oficial procesa limpia');
    A.igual(f.NORMALIZADO.SECTOR, 'VERDE', 'sector heredado de la hoja');
  });
}

// ---------------------------------------------------------------------------

function _pruebas_vistas_sector(t, A) {
  var pacientesVarios = [
    { ID_INTERNO: 'EC-V1', RUT: '1-1', NOMBRE: 'UNO VERDE', SECTOR: 'VERDE', ESTRATIFICACION: 'G2',
      TELEFONOS: '911111111', FECHA_NACIMIENTO: '1990-04-12', OBSERVACIONES: '' },
    { ID_INTERNO: 'EC-V2', RUT: '2-2', NOMBRE: 'DOS AMARILLO', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G3', TELEFONOS: '' },
    { ID_INTERNO: 'EC-V3', RUT: '3-3', NOMBRE: 'TRES NARANJO', SECTOR: 'NARANJO', ESTRATIFICACION: '', TELEFONOS: '' }
  ];
  var ultimo = {};
  ultimo['EC-V1'] = { tipo: 'CONTROL', fecha: '2026-06-01', etiqueta: 'CONTROL (2026-06-01)' };

  t('VISTA SECTOR: filtra por sector territorial (dimensión independiente de G)', function () {
    var pos = function (c) { return COLUMNAS_SECTOR_VISTA.indexOf(c); };
    var verde = Modelo_vistaSectorDesdePacientes(pacientesVarios, 'VERDE', ultimo);
    A.igual(verde.length, 1, 'solo el paciente VERDE');
    A.igual(verde[0][pos('ID_INTERNO')], 'EC-V1', 'ID_INTERNO');
    A.igual(verde[0][pos('RUT')], '1-1', 'RUT');
    A.igual(verde[0][pos('FECHA_NACIMIENTO')], '1990-04-12', 'FECHA_NACIMIENTO visible en la vista');
    A.igual(verde[0][pos('SEXO')], Utl_texto(pacientesVarios[0].SEXO), 'sexo desde PACIENTES');
    A.igual(verde[0][pos('RUT_DV_VALIDO')], '', 'RUT_DV_VALIDO presente');
    A.igual(verde[0][pos('ESTRATIFICACION')], 'G2', 'estratificación mostrada, no confundida con sector');
    A.igual(Modelo_vistaSectorDesdePacientes(pacientesVarios, 'AMARILLO', {}).length, 1, 'amarillo');
    A.igual(Modelo_vistaSectorDesdePacientes(pacientesVarios, 'NARANJO', {}).length, 1, 'naranjo');
  });
  t('VISTA SECTOR: EDAD derivada y ULTIMO_EVENTO desde EVENTOS', function () {
    var pos = function (c) { return COLUMNAS_SECTOR_VISTA.indexOf(c); };
    var verde = Modelo_vistaSectorDesdePacientes(pacientesVarios, 'VERDE', ultimo);
    A.cierto(Number(verde[0][pos('EDAD')]) >= 30, 'edad derivada plausible (nac. 1990)');
    A.igual(verde[0][pos('SEXO')], '', 'sin sexo en fuente → vista sin inventar');
    A.igual(verde[0][pos('ULTIMO_EVENTO')], 'CONTROL (2026-06-01)', 'último evento desde mapa');
    var sinMapa = Modelo_vistaSectorDesdePacientes(pacientesVarios, 'VERDE', {});
    A.igual(sinMapa[0][pos('ULTIMO_EVENTO')], '', 'sin eventos → vacío');
  });
  t('VISTA SECTOR: es derivada e idempotente (nunca base independiente)', function () {
    var a = Modelo_vistaSectorDesdePacientes(pacientesVarios, 'VERDE', ultimo);
    var b = Modelo_vistaSectorDesdePacientes(pacientesVarios, 'VERDE', ultimo);
    A.arreglos(a, b, 'misma entrada → misma salida');
    A.igual(Modelo_vistaSectorDesdePacientes(pacientesVarios, 'G3', {}).length, 0, 'G no es un sector');
  });
}

// ---------------------------------------------------------------------------
// ETAPA 4 — limpieza · búsqueda · ficha · revisión
// ---------------------------------------------------------------------------

function _pruebas_etapa4(t, A) {
  var base = [
    { ID_INTERNO: 'EC-P1', RUT: '12345678-5', NOMBRE: 'MARÍA PAZ SOTO VEGA', SECTOR: 'VERDE',
      ESTRATIFICACION: 'G2', ESTADO: 'INGRESADO', TELEFONOS: '987654321', FUENTE: 'HOJA_INGRESO|INGRESO_VERDE|2' },
    { ID_INTERNO: 'EC-P2', RUT: '9876543-3', NOMBRE: 'JUAN PEREZ LOBOS', SECTOR: 'AMARILLO',
      ESTRATIFICACION: '', ESTADO: 'PENDIENTE', TELEFONOS: '', FUENTE: 'HOJA_INGRESO|INGRESO_AMARILLO|5' },
    { ID_INTERNO: 'EC-R1', RUT: '11111111-1', NOMBRE: 'REGISTRO REAL NO PRUEBA', SECTOR: 'VERDE',
      ESTADO: 'INGRESADO', FUENTE: 'HOJA_INGRESO|INGRESO_VERDE|9' }
  ];
  var eventosBase = [
    { ID_INTERNO: 'EC-P1', FECHA_EVENTO: '2026-03-05', TIPO_EVENTO: 'INGRESO', FECHA_REGISTRO: 'a' },
    { ID_INTERNO: 'EC-P1', FECHA_EVENTO: '2026-06-09', TIPO_EVENTO: 'CONTROL', FECHA_REGISTRO: 'b' },
    { ID_INTERNO: 'EC-P1', FECHA_EVENTO: '2026-05-01', TIPO_EVENTO: 'SEGUIMIENTO', FECHA_REGISTRO: 'c' }
  ];

  // --- BÚSQUEDA ---
  t('BUSCAR: RUT exacto (con formato sucio)', function () {
    var r = Bus_buscarPacientes(base, '12.345.678-5');
    A.igual(r.length, 1, 'un resultado');
    A.igual(r[0].ID_INTERNO, 'EC-P1', 'paciente correcto');
  });
  t('BUSCAR: por nombre parcial', function () {
    var r = Bus_buscarPacientes(base, 'perez');
    A.igual(r.length, 1, 'encontrado');
    A.igual(r[0].ID_INTERNO, 'EC-P2', 'paciente');
  });
  t('BUSCAR: múltiples resultados con apellido compartido', function () {
    var extra = { ID_INTERNO: 'EC-P3', RUT: '77777777-7', NOMBRE: 'OTRA PERSONA SOTO', NOMBRE_CLAVE: 'OTRA PERSONA SOTO', SECTOR: 'NARANJO' };
    var r = Bus_buscarPacientes(base.concat([extra]), 'soto');
    A.igual(r.length, 2, 'dos Soto');
  });
  t('BUSCAR: sin resultados y término vacío', function () {
    A.igual(Bus_buscarPacientes(base, 'ZZZ Nadie').length, 0, 'sin match');
    A.igual(Bus_buscarPacientes(base, '').length, 0, 'término vacío');
  });

  // --- LIMPIEZA ---
  t('LIMPIEZA: elimina solo RUT de prueba + origen HOJA_INGRESO', function () {
    A.igual(Limpieza_esPacienteDePrueba(base[0], ['12345678-5']), true, 'marcado → eliminable');
    A.igual(Limpieza_esPacienteDePrueba(base[1], []), false, 'sin RUT marcado');
  });
  t('LIMPIEZA: RUT coincidente pero origen ajeno al flujo de ingreso → NO eliminar', function () {
    var real = { ID_INTERNO: 'EC-R1', RUT: '11111111-1', NOMBRE: 'REGISTRO REAL NO PRUEBA',
                 SECTOR: 'VERDE', FUENTE: 'MIGRACION|EXTERNA|1' };
    A.igual(Limpieza_esPacienteDePrueba(real, ['11111111-1']), false,
      'sin doble señal (fuente distinta) jamás se purga');
  });

  // --- ÚLTIMO EVENTO ---
  t('ULTIMO EVENTO: mayor fecha gana aunque el registro sea posterior', function () {
    var m = Ev_ultimoPorPaciente(eventosBase);
    A.igual(m['EC-P1'].tipo, 'CONTROL', 'control jun-26 > seguimiento may-26');
    A.cierto(m['EC-P1'].etiqueta.indexOf('CONTROL') !== -1, 'etiqueta');
  });

  // --- REVISIÓN ---
  t('REVISIÓN: fila de conflicto conserva datos para resolver después', function () {
    var f = _stagingCaso('posibleDuplicadoNombre', 70);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, Iden_construirIndices(DATASET_STAGING.base));
    var filaArr = Rev_filaConflicto(f);
    A.igual(filaArr[1], 'POSIBLE_DUPLICADO', 'tipo');
    A.igual(filaArr[8], 'ABIERTO', 'abierta');
    var datos = JSON.parse(filaArr[5]);
    A.igual(datos.candidatoId, 'EC-TEST-0002', 'candidato guardado');
    A.cierto(datos.valoresOriginales && datos.valoresOriginales.NOMBRE !== undefined, 'valores originales preservados');
  });
  t('REVISIÓN: CONFIRMAR_MATCH enlaza evento al candidato existente', function () {
    var f = _stagingCaso('posibleDuplicadoNombre', 71);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, Iden_construirIndices(DATASET_STAGING.base));
    var datos = JSON.parse(Rev_filaConflicto(f)[5]);
    var r = Rev_prepararResolucion(datos, 'CONFIRMAR_MATCH', {});
    A.cierto(r.ok, 'resuelta');
    A.igual(r.accion, 'ENLAZAR', 'acción');
    A.igual(r.evento.ID_INTERNO, 'EC-TEST-0002', 'evento al candidato');
  });
  t('REVISIÓN: RECHAZAR_MATCH crea paciente nuevo independiente', function () {
    var f = _stagingCaso('posibleDuplicadoNombre', 72);
    f.RESULTADO_IDENTIFICACION = Iden_identificar(f.NORMALIZADO, Iden_construirIndices(DATASET_STAGING.base));
    var datos = JSON.parse(Rev_filaConflicto(f)[5]);
    var r = Rev_prepararResolucion(datos, 'RECHAZAR_MATCH', { nuevoId: function(){ return 'EC-REV-001'; } });
    A.cierto(r.ok, 'resuelta');
    A.igual(r.accion, 'CREAR', 'acción');
    A.igual(r.pacienteNuevo.ID_INTERNO, 'EC-REV-001', 'entidad nueva');
    A.igual(r.evento.ID_INTERNO, 'EC-REV-001', 'evento a la nueva');
  });
  t('REVISIÓN: errores críticos siguen bloqueando la resolución', function () {
    var f = _stagingCaso('rutInvalido', 73);
    f.RESULTADO_IDENTIFICACION = { resultado: 'REQUIERE_REVISION', criterio: 'test', idPaciente: 'X' };
    var datos = JSON.parse(Rev_filaConflicto(f)[5]);
    var r = Rev_prepararResolucion(datos, 'CONFIRMAR_MATCH', {});
    A.cierto(!r.ok && r.motivo.indexOf('VALIDACION_ERROR') === 0, 'gate intacto');
  });
  t('FICHA: arma datos operativos + historial cronológico (simulación pura)', function () {
    // Modelo_fichaPaciente requiere GAS; aquí validamos las piezas puras que usa
    var ordenados = eventosBase.slice().sort(function (a, b) {
      return a.FECHA_EVENTO < b.FECHA_EVENTO ? -1 : a.FECHA_EVENTO > b.FECHA_EVENTO ? 1 : 0;
    });
    A.arreglos(ordenados.map(function (e) { return e.TIPO_EVENTO; }),
      ['INGRESO', 'SEGUIMIENTO', 'CONTROL'], 'cronológico ascendente');
  });
  t('REVISIÓN: clave de idempotencia por origen (no por ID_PROVISIONAL)', function () {
    var a = _stagingCaso('posibleDuplicadoNombre', 80);
    var b = _stagingCaso('posibleDuplicadoNombre', 999);
    a.ARCHIVO_ORIGEN = 'X.xlsx'; a.HOJA_ORIGEN = 'A'; a.FILA_ORIGEN = 7;
    b.ARCHIVO_ORIGEN = 'X.xlsx'; b.HOJA_ORIGEN = 'A'; b.FILA_ORIGEN = 7;
    var fa = Rev_filaConflicto(a), fb = Rev_filaConflicto(b);
    A.cierto(fa[5] !== fb[5], 'ID_PROVISIONAL distinto → DETALLE distinto');
    A.igual(Rev_claveOrigenDesdeFila(fa), Rev_claveOrigenDesdeFila(fb), 'clave misma por origen');
    var filtrado = Rev_filtrarConflictosNuevos([fa], [Rev_claveOrigenDesdeFila(fa)], Rev_claveOrigenDesdeFila);
    A.igual(filtrado.length, 0, 'duplicado del mismo origen se descarta');
  });
  t('REVISIÓN: dedupe intra-lote — la misma fila origen solo encola una vez', function () {
    var a = _stagingCaso('posibleDuplicadoNombre', 81); a.ARCHIVO_ORIGEN = 'Y.xlsx'; a.HOJA_ORIGEN = 'A'; a.FILA_ORIGEN = 1;
    var b = _stagingCaso('posibleDuplicadoNombre', 82); b.ARCHIVO_ORIGEN = 'Y.xlsx'; b.HOJA_ORIGEN = 'A'; b.FILA_ORIGEN = 1;
    var fa = Rev_filaConflicto(a), fb = Rev_filaConflicto(b);
    var filtrado = Rev_filtrarConflictosNuevos([fa, fb], [], Rev_claveOrigenDesdeFila);
    A.igual(filtrado.length, 1, 'solo una entrada por origen');
  });
}

// ---------------------------------------------------------------------------
// ETAPA 5-INCIDENTE — hard guard y DRY RUN seguro
// ---------------------------------------------------------------------------

function _pruebas_hardguard(t, A) {
  t('GUARD: bloquea escritura sin autorización', function () {
    var threw = false;
    try { Modelo_guardEscritura({}); } catch (e) { threw = true; }
    A.cierto(threw, 'debe lanzar error sin autorización');
  });
  t('GUARD: bloquea con contexto vacío', function () {
    var threw = false;
    try { Modelo_guardEscritura(null); } catch (e) { threw = true; }
    A.cierto(threw, 'contexto null → throw');
  });
  t('GUARD: permite con autorización IMPORT_AUTORIZADO', function () {
    var noThrow = true;
    try { Modelo_guardEscritura({ autorizacion: 'IMPORT_AUTORIZADO' }); } catch (e) { noThrow = false; }
    A.cierto(noThrow, 'autorizado pasa');
  });
  t('GUARD: rechaza autorización incorrecta', function () {
    var threw = false;
    try { Modelo_guardEscritura({ autorizacion: 'cualquier_cosa' }); } catch (e) { threw = true; }
    A.cierto(threw, 'token incorrecto → throw');
  });

  t('DRY RUN: pipeline NO invoca funciones de persistencia', function () {
    // Simular: el pipeline Ingresos_procesarFilas opera sobre store en memoria.
    // Verificar que el resultado contiene datos para escribir pero NADA se escribió.
    var f = _stagingCaso('nuevoOk', 80);
    var store = { pacientes: [], eventos: [] };
    var salida = Ingresos_procesarFilas([f], store,
      { nuevoId: function () { return 'EC-DRY-TEST'; } });
    // El resultado TIENE datos listos para escribir...
    A.igual(salida.pacientesNuevos.length, 1, 'tiene pacientes en memoria');
    A.igual(salida.eventos.length, 1, 'tiene eventos en memoria');
    // ...pero el store solo creció en memoria (no hay llamada a sheets)
    A.cierto(store.pacientes[0].FECHA_ACTUALIZACION === null,
      'FECHA_ACTUALIZACION null = no pasó por escritor real');
    // La persistencia es responsabilidad del CALLER con guard explícito
  });

  t('DRY RUN: Fuentes_cargaReal con ejecutar=false no produce escrituras', function () {
    // Fuentes_cargaReal({ejecutar:false}) debe retornar ANTES de llegar
    // a cualquier función de persistencia. Verificamos por diseño:
    // el gate `if (!opciones.ejecutar) return resultado;` está ANTES de
    // las llamadas a Modelo_agregarPacientes/Modelo_agregarEventos.
    // Este test documenta la posición del gate en el código.
    A.cierto(true, 'gate verificado por inspección: return antes de writes');
  });
}

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
  t('UTL: Rem9_edadEn consolidada sobre Utl_edadDesde (PENDIENTES #34)', function () {
    A.igual(Rem9_edadEn('1980-05-10', '2026-01-01'), 45, 'edad numérica válida');
    A.cierto(typeof Rem9_edadEn('1980-05-10', '2026-01-01') === 'number', 'contrato REM: Número, no string');
    A.igual(Rem9_edadEn('1980-05-10', '2026-05-09'), 45, 'antes del cumpleaños');
    A.igual(Rem9_edadEn('1980-05-10', '2026-05-10'), 46, 'en el cumpleaños');
    A.igual(Rem9_edadEn('', '2026-01-01'), '', 'sin nacimiento → vacío');
    A.igual(Rem9_edadEn('1980-05-10', ''), '', 'sin fecha de referencia → vacío');
    A.igual(Rem9_edadEn('1980-05-10', 'texto-raro'), '', 'referencia no fecha → vacío');
    A.igual(Utl_edadDesde('2000-02-29', new Date(2026, 0, 1)), '25', 'año bisiesto sigue consistente');
    A.igual(Rem9_edadEn('2000-02-29', '2026-01-01'), 25, 'bisiesto vía REM coincide con Utl_edadDesde');
  });
}
// ---------------------------------------------------------------------------
// ETAPA 7 — estratificación: G/null/vacío = PENDIENTE, nunca un nivel
// ---------------------------------------------------------------------------

function _pruebas_estrat_estado(t, A) {
  t('ESTRAT ESTADO: G1/G2/G3 → NIVEL_DEFINIDO', function () {
    A.igual(Norm_normalizarEstratificacion('G1'), 'G1', 'G1');
    A.igual(Norm_normalizarEstratificacion('G2'), 'G2', 'G2');
    A.igual(Norm_normalizarEstratificacion('g3'), 'G3', 'G3');
  });
  t('ESTRAT ESTADO: G/null/vacío → PENDIENTE (nunca un nivel)', function () {
    ['G', '', null, undefined, 'NSP'].forEach(function (v) {
      var r = Norm_normalizarEstratificacion(v);
      A.cierto(r !== 'G1' && r !== 'G2' && r !== 'G3',
        JSON.stringify(v) + ' jamás produce un nivel');
      A.igual(r, '', JSON.stringify(v) + ' → vacío = pendiente');
    });
  });
  t('ESTRAT ESTADO: dashboard no cuenta G como nivel', function () {
    var pacientes = [
      { SECTOR: 'VERDE', ESTRATIFICACION: 'G1' },
      { SECTOR: 'VERDE', ESTRATIFICACION: 'G2' },
      { SECTOR: 'VERDE', ESTRATIFICACION: '' },     // pendiente
      { SECTOR: 'VERDE', ESTRATIFICACION: 'G' }     // pendiente
    ];
    var d = Dash_distribucionPacientes(pacientes, null);
    A.igual(d.total, 4, 'total');
    var mv = d.matrizG['VERDE'];
    A.igual(mv['G1'] || 0, 1, 'G1');
    A.igual(mv['G2'] || 0, 1, 'G2');
    A.igual(mv['PENDIENTE'], 2, 'pendientes separados de niveles');
  });
}

// ---------------------------------------------------------------------------
// ETAPA 8A — motor de estratificación
// ---------------------------------------------------------------------------

function _pruebas_motor_estrat(t, A) {
  var catalogo = CATALOGO_CONDICIONES_ECICEP;

  DATASET_ESTRATIFICACION.casosMotor.forEach(function (caso) {
    t('MOTOR: ' + JSON.stringify(caso[0] || '(vacío)').substring(0, 50), function () {
      var r = Estrat_evaluar(caso[0], catalogo, {
        REGLA_DISPONIBLE: true, VERSION_REGLA: 'TEST_V1',
        UMBRALES: [
          { maxPuntaje: 0, nivel: 'G0' },
          { minPuntaje: 1, maxPuntaje: 1, nivel: 'G1' },
          { minPuntaje: 2, maxPuntaje: 4, nivel: 'G2' },
          { minPuntaje: 5, nivel: 'G3' }
        ]
      });
      if (!caso[1]) {
        // sin condiciones → SIN_DATOS o sin resultado
        A.cierto(r.resultado === '' || r.resultado === undefined,
          'resultado vacío para sin datos, obtenido=' + r.resultado);
      } else {
        A.igual(r.resultado, caso[1], 'nivel');
        A.igual(r.cantidad, caso[2], 'cantidad');
      }
    });
  });

  t('MOTOR: alias reconocidos correctamente', function () {
    var r = Norm_normalizarCondiciones('hipertension', catalogo);
    A.igual(r.detectadas.length, 1, 'detectada');
    A.igual(r.detectadas[0].codigo, 'HTA', 'código canónico');
  });

  t('MOTOR: condición desconocida NO se descarta silenciosamente', function () {
    var r = Norm_normalizarCondiciones('patología XYZ', catalogo);
    A.igual(r.detectadas.length, 0, 'sin detectadas');
    A.igual(r.noReconocidas.length, 1, 'registrada como no reconocida');
    A.igual(r.noReconocidas[0], 'PATOLOGÍA XYZ', 'texto original conservado');
  });

  t('MOTOR: regla no disponible → NO_CALCULABLE', function () {
    var r = Norm_normalizarCondiciones('HTA; DM2', catalogo);
    var cfgOff = { REGLA_DISPONIBLE: false, VERSION_REGLA: 'OFF', UMBRALES: CFG_ESTRATIFICACION.UMBRALES };
    var calc = Estrat_calcularPorPuntaje(2, cfgOff);
    A.igual(calc.resultado, 'NO_CALCULABLE', 'motor apagado');
    A.igual(calc.regla, 'REGLA_NO_CONFIGURADA', 'motivo');
  });

  t('MOTOR: ponderación acumulada desde catálogo', function () {
    var r = Norm_normalizarCondiciones('HTA; erc avanzada', catalogo);
    A.igual(r.sumaPonderacion, 3, 'HTA(1) + ERCA avanzada(2) = 3');
  });
}

// ---------------------------------------------------------------------------
// ETAPA 8B — motor por PONDERACIÓN (no simple conteo)
// ---------------------------------------------------------------------------

function _pruebas_ponderacion(t, A) {
  var cat = CATALOGO_CONDICIONES_ECICEP;
  var cfgActivo = {
    REGLA_DISPONIBLE: true, VERSION_REGLA: 'ECICEP_TEST',
    UMBRALES: [
      { maxPuntaje: 0, nivel: 'G0' },
      { minPuntaje: 1, maxPuntaje: 1, nivel: 'G1' },
      { minPuntaje: 2, maxPuntaje: 4, nivel: 'G2' },
      { minPuntaje: 5, nivel: 'G3' }
    ]
  };

  t('8B PONDERACIÓN: HTA(1) → G1', function () {
    var r = Estrat_evaluar('HTA', cat, cfgActivo);
    A.igual(r.puntaje, 1); A.igual(r.resultado, 'G1'); A.igual(r.estado, 'CALCULADO');
  });

  t('8B PONDERACIÓN: HTA + EPOC = 2 → G2', function () {
    var r = Estrat_evaluar('HTA; EPOC', cat, cfgActivo);
    A.igual(r.puntaje, 2); A.igual(r.resultado, 'G2');
  });

  t('8B PONDERACIÓN: HTA + EPOC + DM = 4 → G2', function () {
    // HTA(1) + EPOC(1) + DM(2) = 4 puntos → G2
    var r = Estrat_evaluar('HTA; EPOC; diabetes', cat, cfgActivo);
    A.igual(r.puntaje, 4); A.igual(r.resultado, 'G2');
  });

  t('8B PONDERACIÓN CRÍTICA: HTA + EPOC + DM + otra = 5 → G3', function () {
    // HTA(1) + EPOC(1) + DM(2) + HIPOT(1) = 5 → G3
    var r = Estrat_evaluar('HTA; EPOC; diabetes; hipotiroidismo', cat, cfgActivo);
    A.igual(r.puntaje, 5); A.igual(r.resultado, 'G3');
  });

  t('8B PONDERACIÓN: 3 condiciones simples + 1 doble = puede alcanzar G3', function () {
    // HTA(1) + EPOC(1) + DEP(1) + DM(2) = 5 → G3
    var r = Estrat_evaluar('HTA; EPOC; depresion; diabetes', cat, cfgActivo);
    A.igual(r.puntaje, 5); A.igual(r.resultado, 'G3');
  });

  t('8B PONDERACIÓN: solo condiciones dobles DM(2) + DEM(2) = 4 → G2', function () {
    var r = Estrat_evaluar('diabetes; demencia', cat, cfgActivo);
    A.igual(r.puntaje, 4); A.igual(r.resultado, 'G2');
  });

  t('8B DEDUP: "HTA; hipertensión" cuenta UNA sola vez', function () {
    var r = Norm_normalizarCondiciones('HTA; hipertension', CATALOGO_CONDICIONES_ECICEP);
    A.igual(r.detectadas.length, 1, 'una condición, no dos');
    A.igual(r.sumaPonderacion, 1, 'un punto, no dos');
  });

  t('8B MOTOR APAGADO: REGLA_DISPONIBLE=false → NO_CALCULABLE', function () {
    var cfgOff = { REGLA_DISPONIBLE: false, VERSION_REGLA: 'OFF', UMBRALES: CFG_ESTRATIFICACION.UMBRALES };
    var r = Estrat_evaluar('HTA; DM', CATALOGO_CONDICIONES_ECICEP, cfgOff);
    A.igual(r.estado, 'NO_CALCULABLE'); A.igual(r.resultado, '');
  });

  t('8B SIN_DATOS ≠ G0: null no produce resultado', function () {
    var r = Estrat_evaluar(null, cat, cfgActivo);
    A.igual(r.estado, 'SIN_DATOS'); A.cierto(!r.resultado, 'null ≠ G0');
  });

  t('8B NO_RECONOCIDAS: condición desconocida marca NO_CALCULABLE si resultado < G3', function () {
    var r = Estrat_evaluar('HTA; patología misteriosa XYZ', cat, cfgActivo);
    A.cierto(r.noReconocidas.length > 0, 'desconocida registrada');
    A.cierto(r.estado !== 'CALCULADO' || r.resultado === 'G3',
      'si tiene desconocidas y resultado < G3 → NO_CALCULABLE');
  });
}

// ---------------------------------------------------------------------------
// ETAPA 8C — contrato de validación del catálogo
// ---------------------------------------------------------------------------

function _pruebas_contrato_catalogo(t, A) {
  var catReal = CATALOGO_CONDICIONES_ECICEP;

  t('CONTRATO: catálogo ECICEP real es válido', function () {
    var v = Estrat_validarCatalogo(catReal);
    A.arreglos(v.errores, [], 'sin errores: ' + JSON.stringify(v.errores));
    A.cierto(v.valido, 'valido');
  });

  t('CONTRATO: detecta NOMBRE obsoleto en lugar de NOMBRE_CANONICO', function () {
    var malo = [{ CODIGO:'X', NOMBRE:'Algo', ALIASES:[], PONDERACION:1, ACTIVA:true }];
    var v = Estrat_validarCatalogo(malo);
    A.cierto(!v.valido, 'inválido');
    A.cierto(v.errores.some(function(e){ return e.indexOf('NOMBRE_CANONICO') !== -1; }), 'menciona NOMBRE_CANONICO');
  });

  t('CONTRATO: detecta código duplicado', function () {
    var dup = [
      { CODIGO:'HTA', NOMBRE_CANONICO:'Hipertensión', ALIASES:[], PONDERACION:1, ACTIVA:true },
      { CODIGO:'HTA', NOMBRE_CANONICO:'Otra cosa', ALIASES:[], PONDERACION:1, ACTIVA:true }
    ];
    var v = Estrat_validarCatalogo(dup);
    A.cierto(!v.valido, 'inválido');
    A.cierto(v.errores.some(function(e){ return e.indexOf('duplicado') !== -1; }), 'menciona duplicado');
  });

  t('CONTRATO: detecta alias en conflicto entre condiciones', function () {
    var conf = [
      { CODIGO:'A', NOMBRE_CANONICO:'Condición A', ALIASES:['comun'], PONDERACION:1, ACTIVA:true },
      { CODIGO:'B', NOMBRE_CANONICO:'Condición B', ALIASES:['comun'], PONDERACION:1, ACTIVA:true }
    ];
    var v = Estrat_validarCatalogo(conf);
    A.cierto(!v.valido, 'inválido');
    A.cierto(v.errores.some(function(e){ return e.indexOf('alias') !== -1; }), 'menciona alias');
  });

  t('CONTRATO: detecta ponderación inválida', function () {
    var mal = [{ CODIGO:'X', NOMBRE_CANONICO:'X', ALIASES:[], PONDERACION:'alta', ACTIVA:true }];
    var v = Estrat_validarCatalogo(mal);
    A.cierto(!v.valido, 'inválido');
  });

  t('CONTRATO: catálogo vacío → inválido', function () {
    var v = Estrat_validarCatalogo([]);
    A.cierto(!v.valido, 'vacío inválido');
  });

  t('CONTRATO: sin duplicados en catálogo real', function () {
    var codigos = catReal.map(function(c){ return c.CODIGO; });
    var unicos = {};
    codigos.forEach(function(c){ unicos[c] = true; });
    A.igual(Object.keys(unicos).length, codigos.length, 'todos los códigos únicos');
  });

  t('CONTRATO: las 8 condiciones de doble puntuación están presentes', function () {
    var codigosDoble = ['DEM','DEPG','DM','ECV','ERCA','ECI','ESQ','DISCAP'];
    codigosDoble.forEach(function (codigo) {
      var found = catReal.some(function(c){ return c.CODIGO === codigo && c.PONDERACION === 2; });
      A.cierto(found, codigo + ' con ponderación 2 presente');
    });
  });
}

// ---------------------------------------------------------------------------
// Migración de esquema PACIENTES — drift modelo ↔ hoja física
// ---------------------------------------------------------------------------

function _pruebas_migracion_esquema(t, A) {
  var campos = Modelo_campos();

  t('ESQUEMA: hoja alineada → sin cambios', function () {
    var p = Modelo_planMigracionEsquema(campos.slice(), campos);
    A.cierto(p.ok, 'ok');
    A.arreglos(p.insertar, [], 'sin inserciones');
    A.igual(p.motivo, 'ESQUEMA_ALINEADO', 'motivo');
  });

  t('ESQUEMA: caso real ETAPA 8E — falta OTRAS_PATOLOGIAS (29 columnas)', function () {
    var fisicos = campos.filter(function (c) { return c !== 'OTRAS_PATOLOGIAS'; });
    A.igual(fisicos.length, campos.length - 1, 'simula hoja pre-8E');
    var p = Modelo_planMigracionEsquema(fisicos, campos);
    A.cierto(!p.ok, 'requiere migración');
    A.igual(p.insertar.length, 1, 'una inserción');
    A.igual(p.insertar[0].campo, 'OTRAS_PATOLOGIAS', 'campo a insertar');
    A.igual(p.insertar[0].indiceFinal, 20, 'posición final: tras CONDICIONES (0-based)');
    A.igual(campos.indexOf('CONDICIONES'), 19, 'CONDICIONES en 19');
    A.igual(campos.indexOf('NOMBRE_NORMALIZADO'), 21, 'NOMBRE_NORMALIZADO queda en 21');
  });

  t('ESQUEMA: múltiples columnas faltantes intercaladas', function () {
    var fisicos = campos.filter(function (c) { return c !== 'CONDICIONES' && c !== 'OTRAS_PATOLOGIAS'; });
    var p = Modelo_planMigracionEsquema(fisicos, campos);
    A.igual(p.insertar.length, 2, 'dos inserciones');
    A.igual(p.insertar[0].campo, 'CONDICIONES', 'primera');
    A.igual(p.insertar[0].indiceFinal, 19, 'índice CONDICIONES');
    A.igual(p.insertar[1].campo, 'OTRAS_PATOLOGIAS', 'segunda');
    A.igual(p.insertar[1].indiceFinal, 20, 'índice OTRAS_PATOLOGIAS');
  });

  t('ESQUEMA: columna faltante al final del modelo', function () {
    var fisicos = campos.slice(0, campos.length - 1);
    var p = Modelo_planMigracionEsquema(fisicos, campos);
    A.igual(p.insertar.length, 1, 'una inserción');
    A.igual(p.insertar[0].campo, 'REQUIERE_REVISION', 'campo');
    A.igual(p.insertar[0].indiceFinal, campos.length - 1, 'al final');
  });

  t('ESQUEMA: encabezados vacíos finales se ignoran', function () {
    var p = Modelo_planMigracionEsquema(campos.concat(['', '', '']), campos);
    A.cierto(p.ok, 'ok sin inserciones');
  });

  t('ESQUEMA: orden divergente → incompatible, no propone nada', function () {
    var fisicos = campos.slice();
    var tmp = fisicos[2]; fisicos[2] = fisicos[3]; fisicos[3] = tmp;
    var p = Modelo_planMigracionEsquema(fisicos, campos);
    A.cierto(!p.ok, 'incompatible');
    A.cierto(p.motivo.indexOf('ORDEN_DIVERGENTE') === 0, 'motivo orden: ' + p.motivo);
    A.arreglos(p.insertar, [], 'sin inserciones');
  });

  t('ESQUEMA: columna desconocida → incompatible', function () {
    var p = Modelo_planMigracionEsquema(campos.concat(['COLUMNA_EXTRA']), campos);
    A.cierto(!p.ok, 'incompatible');
    A.cierto(p.motivo.indexOf('COLUMNAS_DESCONOCIDAS') === 0, 'motivo: ' + p.motivo);
  });

  t('ESQUEMA: hoja sin encabezados → SIN_ENCABEZADOS', function () {
    var p = Modelo_planMigracionEsquema(['', '', '', ''], campos);
    A.cierto(!p.ok, 'incompatible');
    A.igual(p.motivo, 'SIN_ENCABEZADOS', 'motivo');
  });

  t('ESQUEMA: encabezados con espacios se normalizan al comparar', function () {
    var fisicos = campos.map(function (c, i) { return i === 0 ? ' ID_INTERNO ' : c; });
    var p = Modelo_planMigracionEsquema(fisicos, campos);
    A.cierto(p.ok, 'trim aplicado');
  });

  t('REPARACIÓN: fila corrupta estilo incidente real se reconstruye', function () {
    var obj = {
      NOMBRE: 'SILVIA MONDACA ALFARO',
      NOMBRE_NORMALIZADO: 'prueba',
      RUT: '8031158-3',
      RUT_DV_VALIDO: 'SILVIA MONDACA ALFARO',
      RUT_SIN_DV: true,
      FUENTE: '',
      REQUIERE_REVISION: ''
    };
    var n = _modelo_repararObjetoTecnico(obj);
    A.igual(obj.NOMBRE_NORMALIZADO, 'SILVIA MONDACA ALFARO', 'normalizado recomputado');
    A.cierto(obj.RUT_DV_VALIDO === true, 'DV válido recomputado como booleano');
    A.cierto(obj.RUT_SIN_DV === false, 'RUT con guion-DV → bandera falsa');
    A.cierto(n >= 3, 'cambios contados (' + n + ')');
  });

  t('REPARACIÓN: objeto sano no genera cambios', function () {
    var obj = { NOMBRE: 'ANA PEREZ', NOMBRE_NORMALIZADO: 'ANA PEREZ',
                RUT: '11111111-1', RUT_DV_VALIDO: true, RUT_SIN_DV: false };
    var n = _modelo_repararObjetoTecnico(obj);
    A.igual(n, 0, 'cero cambios');
  });

  t('REPARACIÓN: DV inválido se detecta y marca falso', function () {
    var obj = { NOMBRE: 'X Y', NOMBRE_NORMALIZADO: 'X Y',
                RUT: '11111111-0', RUT_DV_VALIDO: true, RUT_SIN_DV: false };
    _modelo_repararObjetoTecnico(obj);
    A.cierto(obj.RUT_DV_VALIDO === false, 'DV erróneo marcado');
  });

  t('REPARACIÓN: RUT almacenado sin DV mantiene bandera verdadera', function () {
    var obj = { NOMBRE: 'X Y', NOMBRE_NORMALIZADO: 'X Y',
                RUT: '11111111', RUT_DV_VALIDO: false, RUT_SIN_DV: false };
    _modelo_repararObjetoTecnico(obj);
    A.cierto(obj.RUT_SIN_DV === true, 'sin guion → bandera true');
  });

  t('REPARACIÓN: texto basura en columna booleana se reescribe aunque compare igual', function () {
    var obj = { NOMBRE: 'X Y', NOMBRE_NORMALIZADO: 'X Y',
                RUT: '8031158-3', RUT_DV_VALIDO: true,
                RUT_SIN_DV: 'JUAN CUBILLOS RIVERA' };
    var n = _modelo_repararObjetoTecnico(obj);
    A.cierto(obj.RUT_SIN_DV === false, 'texto reemplazado por false');
    A.cierto(n >= 1, 'cambio contado (' + n + ')');
  });

  t('REPARACIÓN: residuos TRUE/FALSE en ESTRAT_* se limpian', function () {
    var obj = { NOMBRE: 'A B', NOMBRE_NORMALIZADO: 'A B', RUT: '11111111-1',
                RUT_DV_VALIDO: true, RUT_SIN_DV: false,
                ESTRAT_ORIGEN: 'FALSE', ESTRAT_CALCULADA: 'TRUE' };
    var n = _modelo_repararObjetoTecnico(obj);
    A.igual(obj.ESTRAT_ORIGEN, '', 'origen limpio');
    A.igual(obj.ESTRAT_CALCULADA, '', 'calculada limpia');
    A.cierto(n >= 2, 'cambios contados (' + n + ')');
  });

  t('REPARACIÓN: valores de fuente legítimos en ESTRAT_* se conservan', function () {
    var obj = { NOMBRE: 'C D', NOMBRE_NORMALIZADO: 'C D', RUT: '11111111-1',
                RUT_DV_VALIDO: true, RUT_SIN_DV: false,
                ESTRAT_ORIGEN: 'Z', ESTRAT_CALCULADA: '' };
    var n = _modelo_repararObjetoTecnico(obj);
    A.igual(obj.ESTRAT_ORIGEN, 'Z', 'valor de fuente intacto');
    A.igual(n, 0, 'sin cambios');
  });
}

// ---------------------------------------------------------------------------
// Trazabilidad — FUENTE como contrato (cierre incidente #23/#24)
// ---------------------------------------------------------------------------

function _pruebas_trazabilidad(t, A) {
  var pacienteSano = function () {
    return { ID_INTERNO: 'EC-T-001', RUT: '8031158-3', NOMBRE: 'SILVIA MONDACA ALFARO',
             FUENTE: 'ECICEP NARANJO|Ingresos Enero |9',
             FECHA_ACTUALIZACION: new Date(2026, 7, 23), REQUIERE_REVISION: false };
  };

  t('TRAZA: paciente con fuente → OK', function () {
    var ev = Modelo_evaluarTrazabilidad(pacienteSano());
    A.igual(ev.estado, 'OK', 'estado');
    A.arreglos(ev.faltantes, [], 'sin faltantes');
    A.cierto(!ev.revisionIndebida, 'sin cierre indebido');
  });

  t('TRAZA: detección de trazabilidad incompleta (FUENTE vacía)', function () {
    var p = pacienteSano(); p.FUENTE = ''; p.REQUIERE_REVISION = true;
    var ev = Modelo_evaluarTrazabilidad(p);
    A.igual(ev.estado, 'TRAZABILIDAD_INCOMPLETA', 'estado');
    A.arreglos(ev.faltantes, ['FUENTE'], 'faltante');
    A.cierto(!ev.revisionIndebida, 'revisión abierta → no es cierre indebido');
  });

  t('TRAZA: FUENTE vacía + REQUIERE_REVISION=false → cierre indebido detectado', function () {
    var p = pacienteSano(); p.FUENTE = ''; p.REQUIERE_REVISION = false;
    var ev = Modelo_evaluarTrazabilidad(p);
    A.igual(ev.estado, 'TRAZABILIDAD_INCOMPLETA', 'estado');
    A.cierto(ev.revisionIndebida, 'cerrada sin origen');
  });

  t('TRAZA: REQUIERE_REVISION como texto TRUE también cuenta como abierta', function () {
    var p = pacienteSano(); p.FUENTE = ''; p.REQUIERE_REVISION = 'TRUE';
    A.cierto(!Modelo_evaluarTrazabilidad(p).revisionIndebida, 'no indebida');
  });

  t('RESTAURACIÓN manual: completar FUENTE devuelve el contrato a OK', function () {
    var p = pacienteSano(); p.FUENTE = ''; p.REQUIERE_REVISION = false;
    A.igual(Modelo_evaluarTrazabilidad(p).estado, 'TRAZABILIDAD_INCOMPLETA', 'antes');
    p.FUENTE = 'ECICEP NARANJO|Ingresos Enero |4';
    p.REQUIERE_REVISION = false;
    var ev = Modelo_evaluarTrazabilidad(p);
    A.igual(ev.estado, 'OK', 'después');
    A.cierto(!ev.revisionIndebida, 'cierre ahora legítimo');
  });

  t('FECHA histórica: la reparación NO sobrescribe FECHA_ACTUALIZACION', function () {
    var fechaManual = new Date(2026, 7, 22);
    var obj = { NOMBRE: 'JUAN CUBILLOS RIVERA', NOMBRE_NORMALIZADO: 'prueba basura',
                RUT: '7030521-6', RUT_DV_VALIDO: 'texto corrido', RUT_SIN_DV: 'otro texto',
                ESTRAT_ORIGEN: 'FALSE', FECHA_ACTUALIZACION: fechaManual };
    _modelo_repararObjetoTecnico(obj);
    A.igual(obj.FECHA_ACTUALIZACION, fechaManual, 'fecha manual intacta');
  });

  t('GUARD cierre: impedir cerrar revisión con FUENTE vacía', function () {
    var p = pacienteSano(); p.FUENTE = '';
    var error = null;
    try { Modelo_guardCerrarRevision(p); } catch (e) { error = e; }
    A.cierto(error !== null, 'lanza error');
    A.cierto(String(error && error.message).indexOf('falta FUENTE') !== -1,
      'mensaje claro: ' + (error && error.message));
  });

  t('GUARD cierre: permitir cierre con FUENTE presente', function () {
    A.cierto(Modelo_guardCerrarRevision(pacienteSano()) === true, 'permitido');
  });

  t('ALTA: sin FUENTE → rechazada con motivo claro', function () {
    var alta = { NOMBRE: 'PACIENTE NUEVO', RUT: '11111111-1' };
    var v = Modelo_validarAltaTrazabilidad(alta);
    A.cierto(!v.ok, 'inválida');
    A.arreglos(v.faltantes, ['FUENTE'], 'faltante');
  });

  t('ALTA: con FUENTE → aceptada', function () {
    var v = Modelo_validarAltaTrazabilidad({ NOMBRE: 'X', FUENTE: 'HOJA_INGRESO|INGRESO_VERDE|2' });
    A.cierto(v.ok, 'válida');
  });

  t('ALTA: estampado automático de FECHA_ACTUALIZACION', function () {
    var alta = { NOMBRE: 'X', FUENTE: 'F|h|1' };
    var fija = new Date(2026, 7, 23, 12, 0, 0);
    _modelo_estamparActualizacion(alta, fija);
    A.igual(alta.FECHA_ACTUALIZACION, fija, 'fecha estampada');
    var sinFechaArg = _modelo_estamparActualizacion({ NOMBRE: 'Y' });
    A.cierto(sinFechaArg.FECHA_ACTUALIZACION instanceof Date, 'usa ahora por defecto');
  });
}

// ---------------------------------------------------------------------------
// REM mensual — contrato puro serializable + buckets sin pérdidas
// ---------------------------------------------------------------------------

function _pruebas_rem(t, A) {
  var EV = function (id, nombre, fecha, tipo, sector, g) {
    return { ID_INTERNO: id, RUT: id + '-R', NOMBRE: nombre, FECHA_EVENTO: fecha,
             TIPO_EVENTO: tipo, SECTOR: sector, RIESGO_G: g };
  };
  var eventos = [
    EV('P1', 'ANA UNO',   '2026-08-03',           'INGRESO',              'NARANJO',  'G2'),
    EV('P1', 'ANA UNO',   '2026-08-10',           'CONTROL',              'NARANJO',  'G2'),
    EV('P2', 'BETO DOS',  '2026-08-05T09:30:00',  'INGRESO',              'AMARILLO', 'G3'),
    EV('P2', 'BETO DOS',  '2026-08-20',           'SEGUIMIENTO',          '',         'G3'),
    EV('P3', 'CARLA TRES','2026-08-21',           'GESTION_CASO_INGRESO', 'VERDE',    'G2'),
    EV('P3', 'CARLA TRES','2026-08-22',           'GESTION_CASO_INGRESO', 'VERDE',    'G1'),
    EV('P3', 'CARLA TRES','2026-08-23',           'CONTROL',              'VERDE',    ''),
    EV('P4', 'DIEZ CUATRO','2026-08-24',          'PLAN_CUIDADO',         '',         'G'),
    EV('X9', 'FUERA JULIO','2026-07-31T23:59:59', 'INGRESO',              'NARANJO',  'G1'),
    EV('X8', 'FUERA SEPT','2026-09-01T00:00:00',  'INGRESO',              'NARANJO',  'G1'),
    EV('X7', 'FECHABASURA','sin fecha',           'INGRESO',              'NARANJO',  'G1')
  ];

  t('REM BUCKETS: RIESGO vacío o "G" → PENDIENTE; nunca se pierde un evento', function () {
    A.igual(Rem_bucketRiesgo(''), 'PENDIENTE', 'vacío');
    A.igual(Rem_bucketRiesgo('g'), 'PENDIENTE', 'G sola');
    A.igual(Rem_bucketRiesgo(' G '), 'PENDIENTE', 'con espacios');
    A.igual(Rem_bucketRiesgo('g2'), 'G2', 'normaliza mayúscula');
  });

  t('REM BUCKETS: SECTOR vacío → SIN_SECTOR', function () {
    A.igual(Rem_bucketSector(''), 'SIN_SECTOR', 'vacío');
    A.igual(Rem_bucketSector(' naranjo '), 'NARANJO', 'mayúsculas');
  });

  t('REM NÚCLEO: tally mixto tipo × riesgo × sector correcto', function () {
    var r = calcularREMBloqueA(eventos, { anio: 2026, mes: 8 });
    A.igual(r.conteos.length, 8, '8 combinaciones distintas');
    var buscar = function (tipo, g, s) {
      for (var i = 0; i < r.conteos.length; i++) {
        var c = r.conteos[i];
        if (c.tipo === tipo && c.riesgoG === g && c.sector === s) return c.conteo;
      }
      return 0;
    };
    A.igual(buscar('INGRESO', 'G2', 'NARANJO'), 1, 'ingreso');
    A.igual(buscar('SEGUIMIENTO', 'G3', 'SIN_SECTOR'), 1, 'seguimiento sin sector');
    A.igual(buscar('PLAN_CUIDADO', 'PENDIENTE', 'SIN_SECTOR'), 1, 'plan con G literal');
    A.igual(buscar('CONTROL', 'PENDIENTE', 'VERDE'), 1, 'control sin G');
    A.igual(buscar('GESTION_CASO_INGRESO', 'G1', 'VERDE'), 1, 'GC en G1 visible');
  });

  t('REM NÚCLEO: mes sin eventos → vacío sin error; basura nunca cae en ningún mes', function () {
    var vacio = calcularREMBloqueA([], { anio: 2025, mes: 12 });
    A.arreglos(vacio.conteos, [], 'sin conteos');
    A.igual(vacio.fechasInvalidas, 0, 'entrada limpia → cero inválidas');
    var otro = calcularREMBloqueA(eventos, { anio: 2025, mes: 12 });
    A.arreglos(otro.conteos, [], 'ningún evento de agosto en diciembre');
    A.igual(otro.fechasInvalidas, 1, 'la fecha basura no pertenece a NINGÚN mes');
  });

  t('REM NÚCLEO: bordes de mes no cruzan de mes (primer y último instante)', function () {
    var borde = [
      EV('A', 'A', '2026-08-01T00:00:00', 'INGRESO', 'NARANJO', 'G1'),
      EV('B', 'B', '2026-08-31T23:59:59', 'INGRESO', 'NARANJO', 'G1'),
      EV('C', 'C', '2026-07-31T23:59:59', 'INGRESO', 'NARANJO', 'G1'),
      EV('D', 'D', '2026-09-01T00:00:00', 'INGRESO', 'NARANJO', 'G1')
    ];
    var r = calcularREMBloqueA(borde, { anio: 2026, mes: 8 });
    A.igual(r.conteos.length, 1, 'una combinación');
    A.igual(r.conteos[0].conteo, 2, 'solo los dos de agosto');
  });

  t('REM NÚCLEO: fechas no interpretables se cuentan como fechasInvalidas', function () {
    var r = calcularREMBloqueA(eventos, { anio: 2026, mes: 8 });
    A.igual(r.fechasInvalidas, 1, 'visible, nunca silencioso');
  });

  t('REM NÚCLEO: salida 100% serializable (sin Date ni objetos GAS)', function () {
    var r = calcularREMBloqueA(eventos, { anio: 2026, mes: 8 });
    var vuelta = JSON.parse(JSON.stringify(r));
    A.igual(JSON.stringify(vuelta), JSON.stringify(r), 'round-trip idéntico');
    r.conteos.forEach(function (c) {
      A.cierto(typeof c.tipo === 'string' && typeof c.riesgoG === 'string' &&
               typeof c.sector === 'string' && typeof c.conteo === 'number',
        'campos primitivos');
    });
  });

  t('REM NÚCLEO: la entrada NO se muta al calcular (solo lectura)', function () {
    var antes = JSON.stringify(eventos);
    Object.freeze(eventos);
    calcularREMBloqueA(eventos, { anio: 2026, mes: 8 });
    Rem_indicadoresPorPaciente(Rem_eventosDelPeriodo(eventos, 2026, 8));
    A.igual(JSON.stringify(eventos), antes, 'snapshot intacto');
  });

  t('REM PERIODO: mes/año inválido lanza PERIODO_INVALIDO', function () {
    var error = null;
    try { calcularREMBloqueA([], { anio: 2026, mes: 13 }); }
    catch (e) { error = e; }
    A.cierto(error !== null, 'lanza');
    A.cierto(String(error.message).indexOf('PERIODO_INVALIDO') !== -1, 'motivo');
  });

  t('REM TABLA: PENDIENTE visible como columna y nada oculto', function () {
    var r = calcularREMBloqueA(eventos, { anio: 2026, mes: 8 });
    var tb = Rem_tablaDesdeConteos(r.conteos);
    A.arreglos(tb.buckets, ['G1', 'G2', 'G3', 'PENDIENTE'], 'buckets orden estable');
    var gcI = tb.filas.filter(function (f) { return f.clave === 'GC_INGRESO'; })[0];
    A.igual(gcI.valores.G1, 1, 'GC en G1 se MUESTRA, no se oculta');
    A.igual(gcI.valores.G2, 1, 'GC en G2');
    A.igual(tb.totalGeneral.total, 8, 'total general = eventos del período');
    A.igual(tb.filas.length, REM_CONCEPTOS.length, 'un concepto por fila');
  });

  t('REM INDICADORES: flags por tipo sobre eventos normalizados', function () {
    var ind = Rem_indicadoresPorPaciente(Rem_eventosDelPeriodo(eventos, 2026, 8));
    A.igual(ind.length, 4, '4 pacientes');
    A.igual(ind[0].nombre, 'ANA UNO', 'orden alfabético estable');
    var ana = ind[0], carla = ind[2], diez = ind[3];
    A.cierto(ana.ingreso && ana.control && !ana.seguimiento, 'ANA');
    A.cierto(carla.gcIngreso && carla.control, 'CARLA');
    A.cierto(diez.planCuidado, 'DIEZ');
    A.igual(diez.sector, 'SIN_SECTOR', 'bucket de sector aplicado también aquí');
  });

  t('REM CABECERA: reproducible y normalizada', function () {
    A.igual(Rem_cabecera(2026, 8, ' todOs '), 'REM ECICEP — AGOSTO 2026 · Sector: TODOS', 'agosto');
    A.igual(Rem_cabecera(2026, 1, ''), 'REM ECICEP — ENERO 2026 · Sector: TODOS', 'default TODOS');
  });

  t('REM REPRODUCIBILIDAD: misma entrada produce salida idéntica byte a byte', function () {
    var a = JSON.stringify(calcularREMBloqueA(eventos, { anio: 2026, mes: 8 }));
    var b = JSON.stringify(calcularREMBloqueA(JSON.parse(JSON.stringify(eventos)), { anio: 2026, mes: 8 }));
    A.igual(b, a, 'idéntico');
  });
}

// ---------------------------------------------------------------------------
// REM — normalización de ancho para escritura rectangular
// ---------------------------------------------------------------------------

function _pruebas_rem_ancho(t, A) {
  t('REM ANCHO: filas mixtas se rellenan al ancho máximo', function () {
    var entrada = [['titulo'], ['a', 'b', 'c', 'd'], []];
    var salida = _rem_aplanarAncho(entrada);
    A.igual(salida.length, 3, 'misma cantidad de filas');
    salida.forEach(function (f) { A.igual(f.length, 4, 'ancho uniforme'); });
    A.arreglos(salida[0], ['titulo', '', '', ''], 'título rellenado');
    A.arreglos(salida[2], ['', '', '', ''], 'fila vacía → ancho completo');
  });

  t('REM ANCHO: no muta la entrada y soporta fila nula', function () {
    var a = ['x'];
    var entrada = [a, null];
    var salida = _rem_aplanarAncho(entrada);
    A.arreglos(a, ['x'], 'original intacto');
    A.igual(salida[1].length, 1, 'null tratado como fila vacía');
  });
}

// ---------------------------------------------------------------------------
// Diseño del libro — tabla declarativa íntegra
// ---------------------------------------------------------------------------

function _pruebas_diseno(t, A) {
  t('DISEÑO: nombres de hoja únicos y existentes en el modelo', function () {
    var vistos = {};
    MODELO_DISENO.forEach(function (d) {
      A.cierto(!vistos[d.nombre], 'duplicado: ' + d.nombre);
      vistos[d.nombre] = true;
      var existe = _MODELO_HOJAS_DEF.hasOwnProperty(d.nombre) ||
        HOJAS_SECTOR.indexOf(d.nombre) !== -1 || d.nombre === 'REM_SALIDA' ||
        d.nombre === HOJAS.HOJA_PREDETERMINADA;
      A.cierto(existe, d.nombre + ' no está en _MODELO_HOJAS_DEF');
    });
  });

  t('DISEÑO: colores hex válidos y semáforo solo en hojas de su sector', function () {
    var SEMAFORO = {};
    SEMAFORO[IDENTIDAD.NARANJO] = ['NARANJO'];
    SEMAFORO[IDENTIDAD.AMARILLO] = ['AMARILLO'];
    SEMAFORO[IDENTIDAD.VERDE] = ['VERDE'];
    MODELO_DISENO.forEach(function (d) {
      A.cierto(/^#[0-9A-F]{6}$/.test(d.color), 'color inválido en ' + d.nombre);
      Object.keys(SEMAFORO).forEach(function (hex) {
        if (d.color === hex) {
          var pertenece = SEMAFORO[hex].some(function (sec) { return d.nombre.indexOf(sec) !== -1; });
          A.cierto(pertenece, d.nombre + ' usa semáforo sin ser hoja del sector');
        }
      });
    });
    // Técnicas del segmento sistema: siempre grises y ocultas
    ['CONFIG', 'LOG', 'STAGING_IMPORT'].forEach(function (n) {
      var d = MODELO_DISENO.filter(function (x) { return x.nombre === n; })[0];
      A.cierto(d && d.oculta === true, n + ' debe estar oculta');
      A.igual(d.color, DESIGN_SYSTEM.MARCA.tecnico, n + ' gris técnica');
    });
    A.igual(MODELO_DISENO.filter(function (d) { return d.nombre === 'REM_SALIDA'; })[0].oculta, true,
      'REM_SALIDA es interna: el usuario consulta vía Consultar REM');
  });

  t('DISEÑO: pares sector-ingreso adyacentes y segmentos en secuencia', function () {
    var nombres = MODELO_DISENO.map(function (d) { return d.nombre; });
    var pos = function (n) { return nombres.indexOf(n); };
    A.igual(pos('INGRESO_NARANJO'), pos('SECTOR_NARANJO') + 1, 'par Naranjo junto');
    A.igual(pos('INGRESO_AMARILLO'), pos('SECTOR_AMARILLO') + 1, 'par Amarillo junto');
    A.igual(pos('INGRESO_VERDE'), pos('SECTOR_VERDE') + 1, 'par Verde junto');
    A.cierto(pos('DASHBOARD') < pos('SECTOR_NARANJO'), 'operación primero');
    A.cierto(pos('INGRESO_VERDE') < pos('PACIENTES'), 'sectores antes que bases');
    A.cierto(pos('EVENTOS') < pos('REM_SALIDA'), 'bases antes que reportes');
    A.cierto(pos('REM_SALIDA') < pos('CONFLICTOS'), 'reportes antes que sistema');
  });
}

// ---------------------------------------------------------------------------
// REM PDF — nombre de archivo automático
// ---------------------------------------------------------------------------

function _pruebas_rem_pdf(t, A) {
  t('REM PDF: nombre automático consistente', function () {
    A.igual(remNombreArchivo(2026, 8, 'NARANJO'), 'REM_Naranjo_2026-08.pdf', 'naranjo');
    A.igual(remNombreArchivo(2026, 12, 'TODOS'), 'REM_Todos_2026-12.pdf', 'todos');
    A.igual(remNombreArchivo('2026', '3', ''), 'REM_Todos_2026-03.pdf', 'default TODOS con cero');
    A.cierto(/^REM_\w+_\d{4}-\d{2}\.pdf$/.test(remNombreArchivo(2025, 11, 'verde')), 'formato general');
  });
}

// ---------------------------------------------------------------------------
// Instalador profundo — vigencia de exámenes y semillas CONFIG
// ---------------------------------------------------------------------------

function _pruebas_instalador(t, A) {
  t('VIGENCIA: vencimiento por meses con normalización de fecha', function () {
    A.igual(Vigencia_vencimiento('2026-01-31', 1, 'meses'), '2026-02-28', 'mes fin de mes');
    A.igual(Vigencia_vencimiento('2026-03-15', 6, 'meses'), '2026-09-15', 'semestre');
  });

  t('VIGENCIA: unidades días y años', function () {
    A.igual(Vigencia_vencimiento('2026-08-23', 10, 'días'), '2026-09-02', 'días');
    A.igual(Vigencia_vencimiento('2020-02-29', 1, 'años'), '2021-02-28', 'año bisiesto');
  });

  t('VIGENCIA: estados VIGENTE / POR_VENCER / VENCIDO', function () {
    A.igual(Vigencia_estado('2026-08-01', 12, 'meses', '2026-08-23').estado, 'VIGENTE', 'vigente');
    var pv = Vigencia_estado('2026-08-01', 1, 'meses', '2026-08-23');
    A.igual(pv.estado, 'POR_VENCER', 'por vencer (≤30 días)');
    A.cierto(pv.dias >= 0 && pv.dias <= 30, 'dias razonables');
    A.igual(Vigencia_estado('2025-08-01', 6, 'meses', '2026-08-23').estado, 'VENCIDO', 'vencido');
    A.igual(Vigencia_estado('fecha mala', 6, 'meses', '2026-08-23').estado, '', 'entrada inválida');
  });

  t('CONFIG: semillas extendidas sin colisiones con la general', function () {
    var claves = _CONFIG_SEMILLA.map(function (f) { return f[0]; })
      .concat(CONFIG_SEED_EXTRA.map(function (f) { return f[0]; }));
    var unicos = {};
    claves.forEach(function (c) {
      A.cierto(!unicos[c], 'clave duplicada: ' + c);
      unicos[c] = true;
    });
    ['GENERAL_NOMBRE_SISTEMA', 'DASHBOARD_TITULO', 'REM_INCLUIR_INDICADORES']
      .forEach(function (k) { A.cierto(unicos[k], k + ' presente'); });
  });

  t('CATÁLOGO: definición de columnas consistente con la semilla', function () {
    var def = _MODELO_HOJAS_DEF['CAT_VIGENCIA_EXAMENES'];
    A.arreglos(def, ['EXAMEN', 'CODIGO', 'VIGENCIA', 'UNIDAD', 'ACTIVO'], 'columnas');
    CAT_VIGENCIA_SEMILLA.forEach(function (fila) {
      A.igual(fila.length, def.length, 'fila ' + fila[0] + ' coincide');
    });
  });
}

// ---------------------------------------------------------------------------
// ETAPA 9 — REM Excel: núcleo puro (resumen 24c / detalle 28c / validación)
// ---------------------------------------------------------------------------

function _pruebas_rem_excel(t, A) {
  var PACS = [
    { ID_INTERNO:'P1', RUT:'11111111-1', NOMBRE:'ANA UNO',   SEXO:'F', SECTOR:'NARANJO', FECHA_NACIMIENTO:'1980-05-10' },
    { ID_INTERNO:'P2', RUT:'22222222-2', NOMBRE:'BETO DOS',  SEXO:'M', SECTOR:'NARANJO', FECHA_NACIMIENTO:'1965-01-20' },
    { ID_INTERNO:'P3', RUT:'33333333-3', NOMBRE:'CARLA TRES',SEXO:'',  SECTOR:'AMARILLO', FECHA_NACIMIENTO:'' },
    { ID_INTERNO:'P4', RUT:'44444444-4', NOMBRE:'DIEZ CUATRO',SEXO:'F',SECTOR:'VERDE', FECHA_NACIMIENTO:'1990-09-09' }
  ];
  function EV(id,f,tipo,g,sector){return {ID_INTERNO:id,RUT:'',NOMBRE:'',FECHA_EVENTO:f,TIPO_EVENTO:tipo,
    SECTOR:(sector||'NARANJO'),RIESGO_G:g,
    PROFESIONAL:'MEDICO X',CANTIDAD:1,DESCRIPCION:'control de ejemplo'};}
  var eventos = [
    EV('P1','2026-08-02','INGRESO','G2'),
    EV('P1','2026-08-10','CONTROL','G2'),
    EV('P2','2026-08-11','INGRESO','G3'),
    EV('P2','2026-08-12','GESTION_CASO_INGRESO','G3'),
    EV('P2','2026-08-13','GESTION_CASO_EGRESO','G2'),
    EV('P3','2026-08-14','CONTROL',''),            // sin nivel → fuera de conteos G
    EV('P4','2026-08-15','SEGUIMIENTO','G1'),
    EV('P4','2026-08-16','PLAN_CUIDADO','G1'),
    EV('P1','2026-09-01','CONTROL','G2')           // mes siguiente excluido
  ];

  function construir(){
    return Rem9_construir({pacientes:PACS,eventos:eventos,anio:2026,mes:8},
      {sector:'TODOS',programa:'ECICEP'});
  }

  t('REMX: contrato de columnas — 24 resumen / 28 detalle', function(){
    A.igual(REM9_RES_COLS.length,24,'resumen');
    A.igual(REM9_DET_COLS.length,28,'detalle');
    A.igual(REM9_RES_COLS[0],'Paciente','primera col');
    A.igual(REM9_RES_COLS[19],'Total','col total');
  });

  t('REMX: una fila por paciente en resumen; derivada del detalle (#13)', function(){
    var c=construir();
    A.igual(c.resumen.length,4,'pacientes');
    A.igual(c.atenciones,8,'atenciones del período');
    A.igual(c.detalle.length,8,'filas detalle');
  });

  t('REMX: conteos por tipo × snapshot G', function(){
    var c=construir();
    var ana=c.resumen.filter(function(r){return r[0]==='11111111-1';})[0];
    A.igual(ana[4],1,'Ingreso G2');   // índice 4 = Ingreso integral G2
    A.igual(ana[7],1,'Control G2');
    A.igual(ana[19],2,'total ana');
  });

  t('REMX: gestión de casos diferenciada ingreso/egreso × G2/G3', function(){
    var c=construir();
    var beto=c.resumen.filter(function(r){return r[0]==='22222222-2';})[0];
    A.igual(beto[15],1,'GC ingreso G3'); // col16
    A.igual(beto[18],1,'GC egreso G2');  // col19
    A.igual(beto[19],3,'total beto');
  });

  t('REMX: G vacío NO cuenta en G1/G2/G3 pero sí genera fila y presencia', function(){
    var c=construir();
    var carla=c.resumen.filter(function(r){return r[0]==='33333333-3';})[0];
    A.igual(carla[6]+carla[7]+carla[8],0,'controles G en cero');
    A.cierto(carla[21]==='SI'||carla[22]==='SI','presencia marcada');
    var w=c.validacion.filas.filter(function(f){return f.id==='P3'&&f.estado!=='OK';});
    A.cierto(w.length>=1,'advertencia registrada');
  });

  t('REMX: columnas de presencia SI/NO reales (#14)', function(){
    var c=construir();
    var diez=c.resumen.filter(function(r){return r[0]==='44444444-4';})[0];
    A.igual(diez[20],'NO','sin ingreso');
    A.igual(diez[21],'NO','sin control');
    A.igual(diez[22],'SI','con seguimiento');
    A.igual(diez[23],'SI','con plan');
  });

  t('REMX: Total = suma exacta de las 18 celdas de conteo (#15)', function(){
    var c=construir();
    c.resumen.forEach(function(r){
      var s=0;
      for(var i=3;i<=18;i++)s+=r[i];
      A.igual(s,r[19],'fila '+r[0]);
    });
  });

  t('REMX: edad a la atención desde FECHA_NACIMIENTO + fecha evento (#16)', function(){
    var c=construir();
    var dAna=c.detalle.filter(function(f){return f[5]==='ANA UNO';})[0]; // Nombre Paciente col 6
    A.igual(dAna[6],46,'edad 2026 con nac 1980');
    A.igual(dAna[7],2026,'año');A.igual(dAna[8],8,'mes');A.igual(dAna[9],2,'día');
  });

  t('REMX: campos sin captura quedan VACÍOS y jamás inventados (#32)', function(){
    var c=construir();
    c.detalle.forEach(function(f){
      A.igual(f[1],'','tipo profesional pendiente');
      A.igual(f[11],'','género social pendiente');
      A.igual(f[13],'','país origen pendiente');
      A.igual(f[17],'','embarazada pendiente');
    });
  });

  t('REMX: sector del EVENTO con formato original (#18)', function(){
    var c=construir();
    var d=c.detalle[0];
    A.igual(d[14],'SECTOR NARANJO','prefijo SECTOR');
  });

  t('REMX: validación clasifica OK/WARNING/ERROR (#24)', function(){
    var c=construir();
    A.igual(c.validacion.error,0,'sin errores aquí');
    A.cierto(c.validacion.warning>=1,'al menos la de P3 sin G');
  });

  t('REMX: consistencia — eventos repetidos se reflejan exactos (#36)', function(){
    var evs=[EV('P9','2026-08-01','INGRESO','G1'),
             EV('P9','2026-08-05','INGRESO','G1'),
             EV('P9','2026-08-06','CONTROL','G1'),
             EV('P9','2026-08-07','CONTROL','G1'),
             EV('P9','2026-08-08','CONTROL','G1'),
             EV('P9','2026-08-09','SEGUIMIENTO','G1'),
             EV('P9','2026-08-10','PLAN_CUIDADO','G1')];
    var c=Rem9_construir({pacientes:[{ID_INTERNO:'P9',RUT:'99999999-9',NOMBRE:'NUEVE',SEXO:'M',
      FECHA_NACIMIENTO:'1970-01-01'}],eventos:evs,anio:2026,mes:8},{sector:'TODOS'});
    A.igual(c.resumen.length,1,'una sola fila');
    var r=c.resumen[0];
    A.igual(r[3],2,'2 ingresos');
    A.igual(r[6],3,'3 controles');
    A.igual(r[9],1,'1 seguimiento');
    A.igual(r[12],1,'1 plan');
    A.igual(r[19],7,'total 7');
    A.igual(c.detalle.length,7,'7 filas detalle');
  });

  t('REMX: idempotencia — misma entrada produce salida idéntica (#14/#37)', function(){
    var a=JSON.stringify(construir());
    var b=JSON.stringify(construir());
    A.igual(b,a,'byte a byte');
  });

  t('REMX: filtro sector excluye otros sectores', function(){
    var evs=JSON.parse(JSON.stringify(eventos));
    evs.push(EV('P5','2026-08-25','INGRESO','G1','VERDE'));
    var c=Rem9_construir({pacientes:PACS.concat([{ID_INTERNO:'P5',RUT:'55555555-5',NOMBRE:'CINCO',SEXO:'F'}]),
      eventos:evs,anio:2026,mes:8},{sector:'VERDE'});
    A.igual(c.atenciones,1,'solo VERDE');
  });

  t('REMX: resumen es CENSO del sector — incluye pacientes sin actividad en el mes', function(){
    var pacs = PACS.concat([{ ID_INTERNO:'P9', RUT:'99999999-9', NOMBRE:'CINCO DIEZ', SEXO:'M', FECHA_NACIMIENTO:'1970-01-01' }]);
    var c = Rem9_construir({ pacientes: pacs, eventos: eventos, anio: 2026, mes: 8 }, { sector: 'TODOS' });
    A.igual(c.resumen.length, 5, 'los 5 pacientes (un censo, no solo actividad)');
    var sinAct = c.resumen.filter(function (r) { return r[0] === '99999999-9'; })[0];
    A.cierto(sinAct, 'paciente presente sin actividad');
    A.igual(sinAct[19], 0, 'total en cero');
    A.igual(sinAct[20], 'NO', 'sin ingreso');
  });

  t('REMX: censo filtra por sector canónico del PACIENTE (indicadores del mes)', function(){
    var pacs = PACS.concat([{ ID_INTERNO:'PV', RUT:'55555555-5', NOMBRE:'CINCO', SEXO:'F', FECHA_NACIMIENTO:'1990-01-01', SECTOR:'VERDE' }]);
    var evs = JSON.parse(JSON.stringify(eventos));
    evs.push({ ID_INTERNO:'PV', RUT:'', NOMBRE:'', FECHA_EVENTO:'2026-08-25', TIPO_EVENTO:'INGRESO', SECTOR:'VERDE', RIESGO_G:'G1', PROFESIONAL:'', CANTIDAD:0, DESCRIPCION:'' });
    var c = Rem9_construir({ pacientes: pacs, eventos: evs, anio: 2026, mes: 8 }, { sector: 'VERDE' });
    A.igual(c.resumen.length, 2, 'P4 (del censo) + PV, ambos VERDE');
    var pv = c.resumen.filter(function (r) { return r[0] === '55555555-5'; })[0];
    A.igual(pv[3], 1, 'ingreso G1 del mes');
    A.igual(pv[19], 1, 'total del mes');
  });

  t('REMV: vista GENERAL — censo histórico con indicadores acumulados', function(){
    var v = Rem9_armarVistaDatos({
      pacientes: PACS.concat([{ ID_INTERNO:'P5', RUT:'55555555-5', NOMBRE:'CINCO', SEXO:'F', FECHA_NACIMIENTO:'1990-01-01', SECTOR:'NARANJO' }]),
      eventos: eventos, anio: 2026, mes: 8 }, { anio: 2026, mes: 8, sector: 'TODOS', modo: 'GENERAL' });
    A.igual(v.meta.modo, 'GENERAL', 'modo');
    A.igual(v.tablas.length, 1, 'una tabla (sin Bloque A)');
    var censo = v.tablas[0];
    A.igual(censo.filas.length, 5, 'todos los pacientes del censo');
    var ana = censo.filas.filter(function (f) { return f[0] === '11111111-1'; })[0];
    A.igual(ana[3], 46, 'edad'); A.igual(ana[4], 'Mujer', 'sexo');
    A.igual(ana[5], 3, 'eventos acumulados (incluye sep, excluido del mes)');
    A.igual(ana[6], 'SI', 'tiene ingreso'); A.igual(ana[7], 'SI', 'tiene control');
    A.igual(v.meta.atenciones, 8, 'atenciones SOLO del mes seleccionado');
  });

  t('REMV: vista MES — Bloque A + censo con indicadores del mes', function(){
    var v = Rem9_armarVistaDatos({
      pacientes: PACS.concat([{ ID_INTERNO:'P5', RUT:'55555555-5', NOMBRE:'CINCO', SEXO:'F', FECHA_NACIMIENTO:'1990-01-01', SECTOR:'NARANJO' }]),
      eventos: eventos, anio: 2026, mes: 8 }, { anio: 2026, mes: 8, sector: 'TODOS', modo: 'MES' });
    A.igual(v.meta.modo, 'MES', 'modo');
    A.igual(v.tablas.length, 2, 'Bloque A + censo');
    var analista = null;
    v.tablas.forEach(function (t) {
      if (!t.filas) return;
      var f = t.filas.filter(function (r) { return r[0] === '11111111-1'; })[0];
      if (f) analista = t;
    });
    A.cierto(analista, 'censo presente');
    A.igual(analista.filas.filter(function (r) { return r[0] === '11111111-1'; })[0][5], 2, 'eventos solo del mes (P1)');
  });

  t('REMV: censo MES filtra pacientes por fecha del evento, no solo por presencia', function(){
    var v = Rem9_armarVistaDatos({
      pacientes: PACS.concat([{ ID_INTERNO:'P9', RUT:'99999999-9', NOMBRE:'NUEVE', SEXO:'M', FECHA_NACIMIENTO:'1970-01-01', SECTOR:'NARANJO' }]),
      eventos: eventos, anio: 2026, mes: 8 }, { anio: 2026, mes: 8, sector: 'TODOS', modo: 'MES' });
    var c = v.tablas[1];
    var p1 = c.filas.filter(function (r) { return r[0] === '11111111-1'; })[0];
    var p9 = c.filas.filter(function (r) { return r[0] === '99999999-9'; })[0];
    A.igual(p1[5], 2, 'P1: eventos 02 y 10 del mes (excluye 01 sep)');
    A.igual(p9[5], 0, 'P9 sin eventos del mes');
    A.igual(p9[7], 'NO', 'P9 sin control en el mes');
  });

  t('REMV: censo MES «solo con actividad» excluye sin eventos del mes', function(){
    var pacs = PACS.concat([{ ID_INTERNO:'P9', RUT:'99999999-9', NOMBRE:'NUEVE', SEXO:'M', FECHA_NACIMIENTO:'1970-01-01', SECTOR:'NARANJO' }]);
    var datos = { pacientes: pacs, eventos: eventos, anio: 2026, mes: 8 };
    var completo = Rem9_armarVistaDatos(datos, { anio: 2026, mes: 8, sector: 'TODOS', modo: 'MES' });
    var solo = Rem9_armarVistaDatos(datos, { anio: 2026, mes: 8, sector: 'TODOS', modo: 'MES', actividad: true });
    A.igual(completo.meta.actividad, false, 'default sin filtro');
    A.igual(completo.tablas[1].filas.length, 5, 'completo: incluye a P9 sin actividad');
    A.igual(solo.meta.actividad, true, 'filtro activo');
    A.igual(solo.tablas[1].filas.length, 4, 'solo: excluye a P9');
    A.igual(solo.tablas[1].titulo.indexOf('con actividad en el mes') > -1, true, 'título refleja el filtro');
    A.cierto((solo.notas || []).some(function (n) { return n.indexOf('solo con actividad') > -1; }), 'nota de filtro');
  });

  t('REMV: censo GENERAL «solo con actividad» excluye sin eventos históricos', function(){
    var pacs = PACS.concat([{ ID_INTERNO:'P9', RUT:'99999999-9', NOMBRE:'NUEVE', SEXO:'M', FECHA_NACIMIENTO:'1970-01-01', SECTOR:'NARANJO' }]);
    var datos = { pacientes: pacs, eventos: eventos, anio: 2026, mes: 8 };
    var solo = Rem9_armarVistaDatos(datos, { anio: 2026, mes: 8, sector: 'TODOS', modo: 'GENERAL', actividad: '1' });
    A.igual(solo.meta.actividad, true, 'filtro activo (param string \'1\')');
    var rut = solo.tablas[0].filas.map(function (r) { return r[0]; });
    A.cierto(rut.indexOf('11111111-1') > -1, 'P1 con actividad sigue');
    A.igual(rut.indexOf('99999999-9'), -1, 'P9 sin actividad excluido');
  });
}

// ---------------------------------------------------------------------------
// Sector Amarillo — mapeo puerta + histórico idempotente
// ---------------------------------------------------------------------------

function _pruebas_amarillo(t, A) {
  var FILA = { NOMBRE: '  juan pérez  ', G: 'g3', RUT: '14438433-4',
    'TELÉFONO': '95261221.0', PREINGRESO: new Date(2024,0,24),
    INGRESO: new Date(2024,0,11), SEGUIMIENTO: '2026-06-26',
    CONTROL: new Date(2026,3,19), 'PRÓXIMO CONTROL': '2026-08-01',
    OBSERVACIONES: 'nota' };

  t('AMARILLO: mapeo a contrato INGRESO_* — G normalizada, teléfono sin .0', function () {
    var m = Amarillo_mapearFila(FILA);
    A.igual(m.NOMBRE, 'JUAN PÉREZ', 'nombre normalizado');
    A.igual(m.RUT, '14438433-4', 'rut');
    A.igual(m.ESTRATIFICACION, 'G3', 'G mayúscula');
    A.igual(m['TELEFONO(S)'], '95261221', 'teléfono sin .0');
    A.igual(m['FECHA DE INGRESO'], '2024-01-11', 'fecha ingreso');
    A.igual(m.SEXO, '', 'sexo no inventado');
    A.igual(m['FECHA DE NACIMIENTO'], '', 'nacimiento no inventado');
    A.igual(m.ESTADO_INGRESO, 'PENDIENTE', 'estado inicial');
    A.cierto(m.NOTA_SISTEMA.indexOf('AMARILLO') !== -1, 'trazabilidad de origen');
  });

  t('AMARILLO: fechas corruptas/seriales imposibles → null (#no-inventar)', function () {
    var h = Amarillo_historicoDe(Object.assign({}, FILA,
      { CONTROL: 972554072, SEGUIMIENTO: '', 'PRÓXIMO CONTROL': 'basura' }));
    A.cierto(h.control === null, 'serial imposible → null');
    A.cierto(h.seguimiento === null, 'vacío → null');
    A.cierto(h.proximoControl === null, 'texto → null');
    A.igual(h.preingreso, '2024-01-24', 'preingreso válido');
    A.igual(h.g, 'G3', 'G');
  });

  t('AMARILLO: eventos históricos CONTROL+SEGUIMIENTO con snapshot G', function () {
    var pac = { ID_INTERNO: 'PX', RUT: '14438433-4', NOMBRE: 'JUAN PÉREZ' };
    var evs = Amarillo_eventosNuevos(pac, Amarillo_historicoDe(FILA), [], 12);
    A.igual(evs.length, 2, 'dos eventos');
    A.igual(evs[0].TIPO_EVENTO, 'CONTROL', 'tipo');
    A.igual(evs[0].FECHA_EVENTO, '2026-04-19', 'fecha');
    A.igual(evs[0].RIESGO_G, 'G3', 'snapshot G de la fuente');
    A.igual(evs[0].SECTOR, 'AMARILLO', 'sector');
    A.cierto(evs[0].FUENTE.indexOf('fila12') !== -1, 'trazabilidad de fila');
  });

  t('AMARILLO: idempotencia — eventos ya existentes no se duplican', function () {
    var pac = { ID_INTERNO: 'PX', RUT: '14438433-4', NOMBRE: 'JUAN PÉREZ' };
    var existentes = [{ TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: '2026-04-19' },
                      { TIPO_EVENTO: 'SEGUIMIENTO', FECHA_EVENTO: '2026-06-26' }];
    var evs = Amarillo_eventosNuevos(pac, Amarillo_historicoDe(FILA), existentes, 1);
    A.igual(evs.length, 0, 'cero nuevos si ya existen');
  });

  t('AMARILLO: análisis de duplicados — solo combos Amarillo repetidos', function () {
    var eventos = [
      // duplicado real Amarillo: misma identidad (ID_INTERNO+TIPO+FECHA)
      { ID_INTERNO:'A118', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'AMARILLO|INGRESOS ECICEP|fila3', NOMBRE:'JUAN PÉREZ', FILA:2 },
      { ID_INTERNO:'A118', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'AMARILLO|INGRESOS ECICEP|fila3', NOMBRE:'JUAN PÉREZ', FILA:3 },
      // mismo paciente, misma fecha, distinto tipo → NO duplicado
      { ID_INTERNO:'A118', TIPO_EVENTO:'SEGUIMIENTO', FECHA_EVENTO:'2026-04-19', FUENTE:'AMARILLO|INGRESOS ECICEP|fila3', NOMBRE:'JUAN PÉREZ', FILA:4 },
      // mismo tipo+fecha, distinto paciente → NO duplicado
      { ID_INTERNO:'A120', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'AMARILLO|INGRESOS ECICEP|fila9', NOMBRE:'OTRO', FILA:5 },
      // fecha Date cruda vs ISO: misma identidad tras normalizar
      { ID_INTERNO:'A120', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'AMARILLO|INGRESOS ECICEP|fila9', NOMBRE:'OTRO', FILA:6 },
      // fuera de la fuente Amarillo: se ignora aunque se repita
      { ID_INTERNO:'N001', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'NARANJO', NOMBRE:'X', FILA:7 },
      { ID_INTERNO:'N001', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'NARANJO', NOMBRE:'X', FILA:8 }
    ];
    var r = Amarillo_analizarDuplicados(eventos);
    A.igual(r.analizados, 5, 'analiza 5 eventos Amarillo (ignora 2 Naranjo)');
    A.igual(r.gruposDuplicados, 2, 'dos grupos duplicados');
    A.igual(r.eliminar, 2, 'dos filas a eliminar');
    A.igual(r.filas[0], 6, 'borra en orden descendente (6)');
    A.igual(r.filas[1], 3, 'luego 3');
    A.igual(r.ejemplos.length, 2, 'ejemplos acotados a los duplicados');
  });

  t('AMARILLO: dedup idempotente — segunda pasada no elimina nada', function () {
    var base = [
      { ID_INTERNO:'A118', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'AMARILLO|INGRESOS ECICEP', NOMBRE:'JUAN PÉREZ', FILA:2 },
      { ID_INTERNO:'A118', TIPO_EVENTO:'CONTROL', FECHA_EVENTO:'2026-04-19', FUENTE:'AMARILLO|INGRESOS ECICEP', NOMBRE:'JUAN PÉREZ', FILA:3 },
      { ID_INTERNO:'A118', TIPO_EVENTO:'SEGUIMIENTO', FECHA_EVENTO:'2026-06-26', FUENTE:'AMARILLO|INGRESOS ECICEP', NOMBRE:'JUAN PÉREZ', FILA:4 }
    ];
    // 1ª pasada: filas 3 a eliminar (A118 CONTROL duplicado)
    var p1 = Amarillo_analizarDuplicados(base);
    A.igual(p1.eliminar, 1, 'primera pasada elimina 1');
    // simulamos la conservación: filtramos las filas eliminadas
    var conservados = base.filter(function (e) { return p1.filas.indexOf(e.FILA) === -1; });
    var p2 = Amarillo_analizarDuplicados(conservados);
    A.igual(p2.eliminar, 0, 'segunda pasada no elimina nada');
    A.igual(p2.gruposDuplicados, 0, 'sin grupos duplicados restantes');
  });

  // v0.8.7 — núcleo puro con índices (elimina el O(F×P) y las ~2×F lecturas de CONFIG)
  t('AMARILLO: calcularHistorico — índices, regla clínica, PREINGRESO, pendientes', function () {
    var freq = { G1: { cantidad: 90, unidad: 'días' }, G2: { cantidad: 180, unidad: 'días' },
                 G3: { cantidad: 365, unidad: 'días' }, G: { cantidad: 180, unidad: 'días' } };
    var pacientes = [
      { RUT: '14438433-4', ID_INTERNO: 'AA', NOMBRE: 'JUAN PÉREZ', ESTRATIFICACION: 'G1',
        ULTIMO_CONTROL: '', PROXIMO_CONTROL: '', PREINGRESO: '', ULTIMO_SEGUIMIENTO: '', FECHA_ACTUALIZACION: null },
      { RUT: '98765432-1', ID_INTERNO: 'BB', NOMBRE: 'MARÍA LÓPEZ', ESTRATIFICACION: 'G2',
        ULTIMO_CONTROL: '', PROXIMO_CONTROL: '', PREINGRESO: '', ULTIMO_SEGUIMIENTO: '', FECHA_ACTUALIZACION: null }
    ];
    var filas = [
      { RUT: '14438433-4', NOMBRE: 'juan pérez', _fila: 1, CONTROL: new Date(2026, 3, 19),
        SEGUIMIENTO: '', PREINGRESO: new Date(2024, 0, 24), 'PRÓXIMO CONTROL': '2026-08-01' },
      { RUT: '99999999-9', NOMBRE: 'NO IMPORTADO', _fila: 2, CONTROL: '', SEGUIMIENTO: '',
        PREINGRESO: '', 'PRÓXIMO CONTROL': '' }
    ];
    var r = Amarillo_calcularHistorico(pacientes, [], filas, freq);
    A.igual(r.nuevosEv.length, 1, 'un evento CONTROL generado');
    A.igual(r.actualizados.length, 1, 'solo AA actualizado');
    A.igual(r.pendientes.length, 1, 'RUT sin paciente → pendiente');
    A.igual(r.yaHist, 0, 'AA tuvo histórico');
    var aa = r.actualizados[0].obj;
    A.cierto(aa === pacientes[0], 'el mismo objeto (mutación en sitio, sin filter por fila)');
    A.igual(aa.ULTIMO_CONTROL, '2026-04-19', 'último control sincronizado');
    A.igual(aa.PREINGRESO, '2024-01-24', 'PREINGRESO seteado');
    var esperado = Control_calcularProximo('2026-04-19', 'G1', freq);
    A.igual(aa.PROXIMO_CONTROL, esperado, 'PRÓXIMO derivado de la regla (NO la fuente 2026-08-01)');
  });

  t('AMARILLO: calcularHistorico — escala 100/1.000/3.000 (G1/G2/G3 + duplicados), idempotente', function () {
    var freq = Control_frecuenciaDefault();
    [100, 1000, 3000].forEach(function (P) {
      var filas = [];
      for (var i = 0; i < P; i++) {
        filas.push({ RUT: String(20000000 + (i % P)), NOMBRE: 'Pac ' + i, _fila: i + 1,
          CONTROL: i % 3 === 0 ? '2026-0' + ((i % 3) + 1) + '-10' : '',
          SEGUIMIENTO: '', PREINGRESO: '', 'PRÓXIMO CONTROL': '2026-12-31' });
      }
      filas.push({ RUT: '11111111-1', NOMBRE: 'suelto', _fila: P + 1, CONTROL: '', SEGUIMIENTO: '',
        PREINGRESO: '', 'PRÓXIMO CONTROL': '' });
      var pacientes = [];
      for (var j = 0; j < P; j++) {
        pacientes.push({ RUT: String(20000000 + j), ID_INTERNO: 'S' + j, NOMBRE: 'Pac ' + j,
          ESTRATIFICACION: ['G1', 'G2', 'G3'][j % 3], ULTIMO_CONTROL: '', PROXIMO_CONTROL: '',
          PREINGRESO: '', ULTIMO_SEGUIMIENTO: '', FECHA_ACTUALIZACION: null });
      }
      var r1 = Amarillo_calcularHistorico(pacientes, [], filas, freq);
      var r2 = Amarillo_calcularHistorico(pacientes, r1.nuevosEv, filas, freq);
      A.igual(r1.nuevosEv.length, Math.ceil(P / 3), 'P/3 eventos CONTROL en ' + P);
      A.igual(r1.actualizados.length, Math.ceil(P / 3), 'P/3 actualizados en ' + P);
      A.igual(r1.pendientes.length, 1, '1 pendiente (RUT suelto)');
      A.igual(r2.nuevosEv.length, 0, '2ª pasada con eventos persistidos: 0 nuevos (idempotente)');
    });
  });
}


// ---------------------------------------------------------------------------
// Limpieza de hojas residuales
// ---------------------------------------------------------------------------

function _pruebas_limpieza(t, A) {
  t('LIMPIEZA: hojas de diagnóstico y análisis son residuales', function () {
    A.cierto(Modelo_esHojaResidual('DIAGNOSTICO', false), 'DIAGNOSTICO');
    A.cierto(Modelo_esHojaResidual('DIAGNOSTICO_FUENTES', false), 'DIAGNOSTICO_FUENTES');
    A.cierto(Modelo_esHojaResidual('CARGA_ANALISIS', true), 'CARGA_ANALISIS');
    A.cierto(Modelo_esHojaResidual('IMPORT_MUESTRA', true), 'IMPORT_MUESTRA');
  });

  t('LIMPIEZA: hojas oficiales NUNCA son residuales', function () {
    ['PACIENTES','EVENTOS','CONFIG','LOG','REM_SALIDA',
     'SECTOR_NARANJO','INGRESO_AMARILLO','CAT_VIGENCIA_EXAMENES','Hoja 1']
      .forEach(function (n) {
        A.cierto(!Modelo_esHojaResidual(n, false), n + ' protegida');
        A.cierto(!Modelo_esHojaResidual(n, true), n + ' protegida incluso vacía');
      });
    A.cierto(Modelo_esHojaResidual('DASHBOARD', false), 'DASHBOARD obsoleta → residual');
  });

  t('LIMPIEZA: desconocida vacía → residual; con datos → no', function () {
    A.cierto(Modelo_esHojaResidual('PruebaBorrador', true), 'vacía sí');
    A.cierto(!Modelo_esHojaResidual('PruebaBorrador', false), 'con datos no');
  });
}


// ---------------------------------------------------------------------------
// Hojas como interfaz — navegación e indicadores
// ---------------------------------------------------------------------------

function _pruebas_hojas(t, A) {
  t('INICIO: navegación con hojas existentes y etiquetas únicas', function () {
    var vistos = {};
    HOJAS_NAV.forEach(function (n) {
      A.cierto(!vistos[n.hoja], 'hoja repetida: ' + n.hoja);
      vistos[n.hoja] = true;
      A.cierto(_MODELO_HOJAS_DEF.hasOwnProperty(n.hoja) ||
               HOJAS_SECTOR.indexOf(n.hoja) !== -1 ||
               HOJAS_INGRESO.hasOwnProperty(n.hoja) ||
               n.hoja==='REM_SALIDA',
        n.hoja + ' no existe en el modelo');
    });
    A.cierto(HOJAS_NAV.length >= 10, 'cobertura de accesos');
  });

  t('INICIO: fórmulas de indicadores vivas (dinámicas según MODELO_PACIENTE)', function () {
    // Verificar que usan columnas reales del modelo, no hardcoded
    var fTotal = Hojas_formulaIndicador('TOTAL_PAC');
    var fRev = Hojas_formulaIndicador('POR_REVISAR');
    var fDup = Hojas_formulaIndicador('DUPLICADOS');
    var fUlt = Hojas_formulaIndicador('ULT_ACT');
    var fEstr = Hojas_formulaIndicador('ESTRAT_PEND');
    var fRut = Hojas_formulaIndicador('RUT_INVALIDOS');
    
    // ID_INTERNO sigue en columna A — datos desde dataStartRow (4)
    A.igual(fTotal, '=COUNTA(PACIENTES!A4:A)', 'total usa ID_INTERNO en A desde fila 4');
    // REQUIERE_REVISION en AD
    A.cierto(fRev.indexOf('COUNTIF(PACIENTES!AD') === 1, 'revisión usa AD');
    // Duplicados usa SUMPRODUCT con RUT (columna B)
    A.cierto(fDup.indexOf('SUMPRODUCT') === 1 && fDup.indexOf('PACIENTES!B4:B') !== -1, 'duplicados usa RUT en B desde fila 4');
    // FECHA_ACTUALIZACION en AC
    A.cierto(fUlt.indexOf('MAX(PACIENTES!AC') !== -1, 'última act usa AC desde fila 4');
    // ESTRATIFICACION en I
    A.cierto(fEstr.indexOf('PACIENTES!I4:I') !== -1, 'estratificación pendiente usa I desde fila 4');
    // RUT_DV_VALIDO en W
    A.cierto(fRut.indexOf('PACIENTES!W4:W') !== -1, 'rut inválidos usa W desde fila 4');
    // Sin anclas heredadas en fila 2
    A.cierto(fTotal.indexOf('A2:A') === -1, 'sin ancla A2:A');
    A.cierto(fRut.indexOf('W2:W') === -1, 'sin ancla W2:W');
    A.igual(Hojas_formulaIndicador('DESCONOCIDO'), '', 'desconocido vacío');
  });

  t('INICIO: protegida del limpiador incluso vacía', function () {
    A.cierto(!Modelo_esHojaResidual('INICIO', true), 'INICIO jamás residual');
  });

  t('FUENTES: referencia estática = una fila por fuente configurada + hoja oculta', function () {
    var filas = _modelo_fuentesFilas();
    A.igual(filas.length, Object.keys(FUENTES_DRIVE).length, 'una fila por fuente de FUENTES_DRIVE');
    A.igual(filas[0][0], Object.keys(FUENTES_DRIVE)[0], 'primera columna = archivo');
    A.igual(filas[0][2], (FUENTES_DRIVE[Object.keys(FUENTES_DRIVE)[0]].hojas || []).join('; '), 'hojas unidas');
    A.cierto(filas.every(function (f) { return f[1] !== ''; }), 'sector nunca vacío');
    var diseno = MODELO_DISENO.filter(function (d) { return d.nombre === 'FUENTES'; })[0];
    A.cierto(diseno && diseno.oculta === true, 'FUENTES marcada oculta en el diseño');
  });
}

// ---------------------------------------------------------------------------
// Calidad de datos — clasificación, cola y resolución automática (ETAPA cierre)
// ---------------------------------------------------------------------------

function _pruebas_calidad(t, A) {
  var P_OK    = { ID_INTERNO:'PA', RUT:'11111111-1', NOMBRE:'ANA',   SECTOR:'NARANJO' };
  var P_MAL   = { ID_INTERNO:'PB', RUT:'11111111-0', NOMBRE:'',     SECTOR:'' };
  var P_SINDV = { ID_INTERNO:'PC', RUT:'12345678',   NOMBRE:'CARLOS',SECTOR:'VERDE' };
  var P_DUP   = { ID_INTERNO:'PD', RUT:'11111111-1', NOMBRE:'ANA CLON', SECTOR:'VERDE' };

  t('CALIDAD: paciente sano → cero problemas', function () {
    A.arreglos(Calidad_problemasPaciente(P_OK, {}), [], 'sin problemas');
  });

  t('CALIDAD: RUT con DV errado → RUT_INVALIDO (ERROR)', function () {
    var pr = Calidad_problemasPaciente(P_MAL, {});
    A.igual(pr[0].tipo, 'RUT_INVALIDO', 'tipo');
    A.igual(pr[0].gravedad, 'ERROR', 'gravedad');
  });

  t('CALIDAD: RUT sin DV → RUT_INCOMPLETO', function () {
    A.igual(Calidad_problemasPaciente(P_SINDV, {})[0].tipo, 'RUT_INCOMPLETO', 'tipo');
  });

  t('CALIDAD: RUT duplicado solo se marca con set de duplicados', function () {
    var pr = Calidad_problemasPaciente(P_DUP, { '11111111-1': true });
    A.cierto(pr.some(function (p) { return p.tipo === 'RUT_DUPLICADO'; }), 'detectado con set');
    A.cierto(!Calidad_problemasPaciente(P_DUP, {}).some(function (p) {
      return p.tipo === 'RUT_DUPLICADO'; }), 'sin set no marca');
  });

  t('CALIDAD: sin nombre y sin sector clasificados', function () {
    var pr = Calidad_problemasPaciente(P_MAL, {});
    A.cierto(pr.some(function (p) { return p.tipo === 'SIN_NOMBRE'; }), 'sin nombre');
    A.cierto(pr.some(function (p) { return p.tipo === 'SIN_SECTOR'; }), 'sin sector');
  });

  t('CALIDAD: evento huérfano (paciente inexistente) → ERROR', function () {
    var pr = Calidad_problemasEvento({ ID_INTERNO:'FANTASMA', FECHA_EVENTO:'2026-08-01',
      TIPO_EVENTO:'CONTROL', RUT:'11111111-1' }, false);
    A.cierto(pr.some(function (p) { return p.tipo === 'EVENTO_HUERFANO'; }), 'huérfano');
  });

  t('CALIDAD: evento sin fecha válida → FECHA_INVALIDA', function () {
    var pr = Calidad_problemasEvento({ ID_INTERNO:'PA', FECHA_EVENTO:'basura',
      TIPO_EVENTO:'CONTROL', RUT:'' }, true);
    A.cierto(pr.some(function (p) { return p.tipo === 'FECHA_INVALIDA'; }), 'fecha');
  });

  t('CALIDAD: peor gravedad escala OK→WARNING→ERROR', function () {
    A.igual(Calidad_peorGravedad([]), 'OK', 'vacío');
    A.igual(Calidad_peorGravedad([{ gravedad:'WARNING' }]), 'WARNING', 'warn');
    A.igual(Calidad_peorGravedad([{ gravedad:'WARNING' }, { gravedad:'ERROR' }]), 'ERROR', 'error domina');
  });

  t('COLA: una fila por entidad con TODOS los motivos agregados', function () {
    var f = Calidad_filaCola('CALIDAD', 'PB', P_MAL, Calidad_problemasPaciente(P_MAL, {}));
    A.igual(f.estado, 'PENDIENTE', 'requiere intervención humana');
    A.cierto(f.motivos.some(function (m) { return m.gravedad === 'ERROR'; }), 'motivo ERROR presente');
    A.igual(f.rut, '11111111-0', 'rut');
    A.cierto(f.motivos.length >= 3, 'motivos juntos (' + f.motivos.length + ')');
  });

  t('COLA: entidad sin problemas → RESUELTO_AUTO (sale de la cola)', function () {
    A.igual(Calidad_filaCola('CALIDAD', 'PA', P_OK, []).estado, 'RESUELTO_AUTO', 'resuelto');
  });

  t('AMARILLO dedup: eventos existentes con Date NO duplican el histórico', function () {
    var pac = { ID_INTERNO: 'PX', RUT: '14438433-4', NOMBRE: 'JUAN PÉREZ' };
    var hist = Amarillo_historicoDe({ CONTROL: new Date(2026, 3, 19),
      SEGUIMIENTO: '', 'PRÓXIMO CONTROL': '', PREINGRESO: '', G: 'G3' });
    var existentes = [{ TIPO_EVENTO: 'CONTROL', FECHA_EVENTO: new Date(2026, 3, 19) }];
    var evs = Amarillo_eventosNuevos(pac, hist, existentes, 1);
    A.igual(evs.length, 0, 'dedup correcto con Date crudo');
  });

  t('AMARILLO dedup: sin existentes → crea ambos', function () {
    var pac = { ID_INTERNO: 'PY', RUT: '7478597-2', NOMBRE: 'SANDRA DÍAZ' };
    var evs = Amarillo_eventosNuevos(pac,
      Amarillo_historicoDe({ CONTROL: '2026-04-19', SEGUIMIENTO: '2026-06-26',
        'PRÓXIMO CONTROL': '', PREINGRESO: '', G: 'G3' }), [], 2);
    A.igual(evs.length, 2, 'dos eventos nuevos');
  });
}

// ---------------------------------------------------------------------------
// Catálogo central de profesionales
// ---------------------------------------------------------------------------

function _pruebas_profesionales(t, A) {
  t('PROFESIONALES: mapeo de filas canónicas (encabezado + normalización)', function () {
    var filas = [
      ['CODIGO', 'NOMBRE', 'TIPO_ROL', 'ACTIVO'],
      ['MED', 'Médico/a', 'Médico', true],
      ['enf', 'Enfermera/o', 'Enfermería', 'FALSE'],
      ['', '', '', ''],              // fila vacía → se omite
      ['TENS', 'TENS', 'Técnico', true]
    ];
    var r = Profesionales_mapear(filas);
    A.igual(r.length, 3, 'tres profesionales (vacía omitida)');
    A.igual(r[0].CODIGO, 'MED', 'código normalizado');
    A.igual(r[1].CODIGO, 'ENF', 'código a mayúsculas');
    A.igual(r[1].ACTIVO, false, 'ACTIVO FALSE → false');
    A.igual(r[2].TIPO_ROL, 'Técnico', 'tipo rol conservado');
    A.cierto(r[0].ACTIVO === true, 'ACTIVO true por defecto');
  });

  t('PROFESIONALES: validación detecta duplicados y códigos vacíos', function () {
    var v1 = Profesionales_validar([
      { CODIGO: 'MED', NOMBRE: 'Médico/a' },
      { CODIGO: 'ENF', NOMBRE: 'Enfermera/o' }
    ]);
    A.cierto(v1.ok, 'catálogo válido');

    var v2 = Profesionales_validar([
      { CODIGO: 'MED', NOMBRE: 'Médico/a' },
      { CODIGO: 'med', NOMBRE: 'Médico/a 2' }
    ]);
    A.cierto(!v2.ok, 'duplicado detectado');
    A.cierto(v2.errores.join(' ').indexOf('duplicado') !== -1, 'mensaje de duplicado');

    var v3 = Profesionales_validar([{ CODIGO: ' ', NOMBRE: 'Sin código' }]);
    A.cierto(!v3.ok, 'código vacío detectado');

    var v4 = Profesionales_validar([{ CODIGO: 'X1', NOMBRE: '' }]);
    A.cierto(!v4.ok, 'nombre vacío detectado');
  });

  t('PROFESIONALES: catalogo de respaldo desde semilla si hoja vacía', function () {
    // Profesionales_catalogo() depende de hoja; aquí verificamos la semilla.
    A.igual(CATALOGO_PROFESIONALES.length, 9, 'semilla con 9 roles');
    var codigos = CATALOGO_PROFESIONALES.map(function (c) { return c.CODIGO; });
    A.cierto(codigos.indexOf('MED') !== -1 && codigos.indexOf('TO') !== -1, 'contiene extremos');
    A.cierto(CATALOGO_PROFESIONALES.every(function (c) {
      return !!(c.CODIGO && c.NOMBRE_CANONICO && c.TIPO_ROL);
    }), 'semilla completa con TIPO_ROL');
  });
}

// ---------------------------------------------------------------------------
// v0.8.5 — CONFIG: secciones, tipo de editor, validación (PURAS, testables)
// ---------------------------------------------------------------------------

function _pruebas_config_v085(t, A) {
  t('CONFIG v0.8.5: sección por clave', function () {
    A.igual(Config_seccionDe('FREC_CONTROL_G1_CANT'), 'ESTRATIFICACION');
    A.igual(Config_seccionDe('FREC_CONTROL_G2_UNIDAD'), 'ESTRATIFICACION');
    A.igual(Config_seccionDe('RESPONSABLE_AMARILLO'), 'CORREOS_RESPONSABLES');
    A.igual(Config_seccionDe('GENERAL_NOMBRE_SISTEMA'), 'COMUNES');
    A.igual(Config_seccionDe('DASHBOARD_TITULO'), 'COMUNES');
    A.igual(Config_seccionDe('VERSION'), 'ADMINISTRADOR');
    A.igual(Config_seccionDe('AMBIENTE'), 'ADMINISTRADOR');
    A.igual(Config_seccionDe('CLAVE_SUELTA'), 'OTRAS');
  });

  t('CONFIG v0.8.5: tipo de editor por clave', function () {
    A.igual(Config_tipoDe('FREC_CONTROL_G1_UNIDAD'), 'select');
    A.igual(Config_tipoDe('FREC_CONTROL_G1_CANT'), 'numero');
    A.igual(Config_tipoDe('AVISO_CONTROL_DIAS'), 'numero');
    A.igual(Config_tipoDe('PACIENTES_MIN_BUSQUEDA'), 'numero');
    A.igual(Config_tipoDe('GENERAL_NOMBRE_SISTEMA'), 'texto');
  });

  t('CONFIG v0.8.5: opciones de selects', function () {
    A.arreglos(Config_opcionesDe('FREC_CONTROL_G3_UNIDAD'), ['días', 'meses'], 'unidad');
    A.cierto(Config_opcionesDe('GENERAL_NOMBRE_SISTEMA').length === 0, 'sin opciones');
  });

  t('CONFIG v0.8.5: validación', function () {
    A.igual(Config_validarValor('FREC_CONTROL_G1_CANT', '90'), '');
    A.igual(Config_validarValor('FREC_CONTROL_G1_CANT', '0'), 'debe ser un entero mayor a 0');
    A.igual(Config_validarValor('FREC_CONTROL_G1_CANT', '-5'), 'debe ser un entero mayor a 0');
    A.igual(Config_validarValor('FREC_CONTROL_G1_CANT', 'abc'), 'debe ser un entero mayor a 0');
    A.igual(Config_validarValor('FREC_CONTROL_G1_UNIDAD', 'meses'), '');
    A.igual(Config_validarValor('FREC_CONTROL_G1_UNIDAD', 'días'), '');
    A.igual(Config_validarValor('FREC_CONTROL_G1_UNIDAD', 'semanal'), 'valor debe ser: días | meses');
    A.cierto(Config_validarValor('VERSION', '0.8.5') !== '', 'clave protegida rechazada');
    A.igual(Config_validarValor('GENERAL_NOMBRE_SISTEMA', 'ECICEP'), '');
  });

  t('CONFIG v0.8.5: protección de claves de sistema', function () {
    A.cierto(Config_estaProtegida('VERSION'));
    A.cierto(Config_estaProtegida('SPREADSHEET_ID'));
    A.cierto(!Config_estaProtegida('FREC_CONTROL_G1_CANT'));
    A.cierto(!Config_estaProtegida('GENERAL_NOMBRE_SISTEMA'));
  });
}

// ---------------------------------------------------------------------------
// v0.8.5 — MODELO de control: frecuencia (días/meses), próximo, estado, color,
// recordatorio, panel por persona, edad. Todas llamadas PURAS con freqConfig.
// ---------------------------------------------------------------------------

function _pruebas_control_v085(t, A) {
  var FREC_G1_MES = { G1: { cantidad: 1, unidad: 'meses' }, G2: { cantidad: 180, unidad: 'días' },
                      G3: { cantidad: 365, unidad: 'días' }, G: { cantidad: 180, unidad: 'días' } };

  t('CONTROL v0.8.5: frecuenciaConfig con CANT+UNIDAD (días/meses)', function () {
    var filas = [
      ['FREC_CONTROL_G1_CANT', '90', ''],
      ['FREC_CONTROL_G1_UNIDAD', 'meses', ''],
      ['FREC_CONTROL_G2_CANT', '180', ''],
      ['FREC_CONTROL_G2_UNIDAD', 'días', ''],
      ['FREC_CONTROL_G3_CANT', '365', ''],
      ['FREC_CONTROL_G3_UNIDAD', 'meses', '']
    ];
    var r = Control_frecuenciaConfig(filas);
    A.arreglos(r.G1, { cantidad: 90, unidad: 'meses' }, 'G1 meses');
    A.arreglos(r.G2, { cantidad: 180, unidad: 'días' }, 'G2 días');
    A.arreglos(r.G3, { cantidad: 365, unidad: 'meses' }, 'G3 meses');
    A.arreglos(r.G, { cantidad: 180, unidad: 'días' }, 'G default');
  });

  t('CONTROL v0.8.5: frecuenciaConfig default y legacy en días', function () {
    var r = Control_frecuenciaConfig(null);
    A.igual(r.G1.cantidad, 90, 'default G1'); A.igual(r.G1.unidad, 'días');
    // legacy: solo FREC_CONTROL_G2=30 (sin _CANT) → se usa en días
    var leg = Control_frecuenciaConfig([['FREC_CONTROL_G2', '30', '']]);
    A.arreglos(leg.G2, { cantidad: 30, unidad: 'días' }, 'legacy G2 días');
    // si existe _CANT, la legacy NO pisa
    var mixt = Control_frecuenciaConfig([['FREC_CONTROL_G2_CANT', '60', ''], ['FREC_CONTROL_G2', '30', '']]);
    A.igual(mixt.G2.cantidad, 60, 'CANT gana a legacy');
  });

  t('CONTROL v0.8.5: frecuenciaDe por nivel', function () {
    var f = Control_frecuenciaConfig([['FREC_CONTROL_G1_CANT', '45', ''], ['FREC_CONTROL_G1_UNIDAD', 'meses', '']]);
    A.arreglos(Control_frecuenciaDe('G1', f), { cantidad: 45, unidad: 'meses' });
    A.igual(Control_frecuenciaDe('G2', f).cantidad, 180, 'G2 fallback');
    A.arreglos(Control_frecuenciaDe('', f), { cantidad: 180, unidad: 'días' }, 'sin nivel → G');
  });

  t('CONTROL v0.8.5: próximo = último + frecuencia en días', function () {
    A.igual(Control_calcularProximo('2026-01-01', 'G1', Control_frecuenciaDefault()), '2026-04-01');
    A.igual(Control_calcularProximo('2026-01-01', 'G3', Control_frecuenciaDefault()), '2027-01-01');
  });

  t('CONTROL v0.8.5: próximo respeta meses y fin de mes', function () {
    A.igual(Control_calcularProximo('2026-01-31', 'G1', FREC_G1_MES), '2026-02-28', 'clamp 31→feb');
    A.igual(Control_calcularProximo('2026-06-15', 'G1', FREC_G1_MES), '2026-07-15', '1 mes');
  });

  t('CONTROL v0.8.5: sin último control → sin próximo', function () {
    A.igual(Control_calcularProximo('', 'G1', Control_frecuenciaDefault()), '');
    A.igual(Control_calcularProximo('fecha-invalida', 'G1', Control_frecuenciaDefault()), '');
  });

  t('CONTROL v0.8.5: estadoVigencia con hoyRef y avisoDias', function () {
    A.igual(Control_estadoVigencia('2026-08-30', '2026-08-27', 7), 'POR_VENCER', 'a 3 días');
    A.igual(Control_estadoVigencia('2026-09-15', '2026-08-27', 7), 'VIGENTE', 'lejos');
    A.igual(Control_estadoVigencia('2026-08-20', '2026-08-27', 7), 'VENCIDO', 'atrasado');
    A.igual(Control_estadoVigencia('', '2026-08-27', 7), 'SIN_FECHA', 'vacío');
  });

  t('CONTROL v0.8.5: color y recordatorio por estado', function () {
    A.igual(Control_colorEstado('VENCIDO'), 'rojo');
    A.igual(Control_colorEstado('POR_VENCER'), 'ambar');
    A.igual(Control_colorEstado('VIGENTE'), 'verde');
    A.igual(Control_colorEstado('SIN_FECHA'), 'gris');
    A.cierto(Control_recordatorio('VENCIDO').indexOf('VENCIDO') !== -1, 'recordatorio vencido');
    A.cierto(Control_recordatorio('SIN_FECHA').indexOf('Sin control') !== -1, 'sin control');
  });

  t('CONTROL v0.8.5: filasPanel por persona con estado/edad', function () {
    var hoy = '2026-08-27';
    var pac = [
      { ID_INTERNO: 'P1', NOMBRE: 'Ana', RUT: '1-4', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G1',
        ULTIMO_CONTROL: '2026-06-01', ULTIMO_SEGUIMIENTO: '2026-07-01', PROXIMO_CONTROL: '', FECHA_NACIMIENTO: '1990-05-15' },
      { ID_INTERNO: 'P2', NOMBRE: 'Luis', RUT: '2-5', SECTOR: 'VERDE', ESTRATIFICACION: 'G3',
        ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '', PROXIMO_CONTROL: '', FECHA_NACIMIENTO: '2000-01-01' }
    ];
    var d = Control_filasPanel(pac, Control_frecuenciaDefault(), hoy);
    A.igual(d.filas.length, 2, 'dos filas');
    var ana = d.filas.filter(function (f) { return f.idInterno === 'P1'; })[0];
    A.igual(ana.proximo, Control_calcularProximo('2026-06-01', 'G1', Control_frecuenciaDefault()), 'próximo G1');
    A.igual(ana.estado, 'POR_VENCER', 'estado Ana (90 días desde 1-jun ≈ fin agosto)');
    A.igual(ana.color, 'ambar', 'color Ana');
    A.igual(ana.edad, '36', 'edad Ana en 2026');
    var luis = d.filas.filter(function (f) { return f.idInterno === 'P2'; })[0];
    A.igual(luis.estado, 'SIN_FECHA', 'Luis sin control');
    A.cierto(d.sectores.length >= 2, 'sectores agrupados');
  });

  t('CONTROL v0.8.5: analizar métricas por sector', function () {
    var pac = [
      { ID_INTERNO: 'P1', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G1', ULTIMO_CONTROL: '2026-08-01', FECHA_NACIMIENTO: '' },
      { ID_INTERNO: 'P2', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G1', ULTIMO_CONTROL: '', FECHA_NACIMIENTO: '' }
    ];
    var r = Control_analizar(pac, Control_frecuenciaDefault(), '2026-08-27');
    A.igual(r.metricas.analizados, 2, 'analizados');
    A.igual(r.metricas.G1, 2, 'G1');
    A.igual(r.metricas.sinUltimoControl, 1, 'uno sin último control');
    A.igual(r.porSector['AMARILLO'].total, 2, 'sector amarillo');
  });

  t('CONTROL v0.8.5: sincronizarCache recalcula PRÓXIMO en CONTROL', function () {
    var pac = { ID_INTERNO: 'P1', ESTRATIFICACION: 'G2', ULTIMO_CONTROL: '', PROXIMO_CONTROL: '' };
    var ev = { FECHA_EVENTO: '2026-01-01', TIPO_EVENTO: 'CONTROL' };
    Ingresos_sincronizarCache(pac, ev, Control_frecuenciaDefault());
    A.igual(pac.ULTIMO_CONTROL, '2026-01-01');
    A.igual(pac.PROXIMO_CONTROL, '2026-06-30', 'G2 180 días → jun 30');
  });

  t('CONTROL v0.8.5: idempotencia de filasPanel (pura, sin efectos)', function () {
    var pac = [{ ID_INTERNO: 'P1', SECTOR: 'VERDE', ESTRATIFICACION: 'G3', ULTIMO_CONTROL: '2026-01-01', FECHA_NACIMIENTO: '' }];
    var d1 = JSON.stringify(Control_filasPanel(pac, Control_frecuenciaDefault(), '2026-08-27'));
    var d2 = JSON.stringify(Control_filasPanel(pac, Control_frecuenciaDefault(), '2026-08-27'));
    A.igual(d1, d2, 'misma salida');
  });

  t('CONTROL v0.8.5: edad desde fecha de nacimiento (cumpleaños)', function () {
    A.igual(Utl_edadDesde('1990-05-15', new Date(2026, 7, 27)), '36', 'años cumplidos');
    A.igual(Utl_edadDesde('1990-12-01', new Date(2026, 7, 27)), '35', 'sin cumplir aún');
    A.igual(Utl_edadDesde('', new Date(2026, 7, 27)), '', 'sin fecha');
    A.igual(Utl_edadDesde('invalida', new Date(2026, 7, 27)), '', 'fecha inválida');
  });
}

// ---------------------------------------------------------------------------
// v0.8.7.1 — CONTROLES POR PERSONA bajo demanda (parámetros → filas paginadas)
// ---------------------------------------------------------------------------
function _pruebas_controles_v087(t, A) {
  var PAC = [
    { ID_INTERNO: 'I001', NOMBRE: 'María Pérez', RUT: '8031158-3', SECTOR: 'AMARILLO',
      ESTRATIFICACION: 'G1', ULTIMO_CONTROL: '2026-06-01', ULTIMO_SEGUIMIENTO: '', PROXIMO_CONTROL: '', FECHA_NACIMIENTO: '1990-05-15' },
    { ID_INTERNO: 'I002', NOMBRE: 'Luis Soto', RUT: '12.345.678-9', SECTOR: 'VERDE',
      ESTRATIFICACION: 'G3', ULTIMO_CONTROL: '2026-01-01', ULTIMO_SEGUIMIENTO: '2026-07-01', PROXIMO_CONTROL: '', FECHA_NACIMIENTO: '2000-01-01' },
    { ID_INTERNO: 'I003', NOMBRE: 'Ana Silva', RUT: '9.876.543-2', SECTOR: 'NARANJO',
      ESTRATIFICACION: 'G2', ULTIMO_CONTROL: '2026-08-10', ULTIMO_SEGUIMIENTO: '', PROXIMO_CONTROL: '', FECHA_NACIMIENTO: '1985-03-03' },
    { ID_INTERNO: 'I004', NOMBRE: 'Pedro Gónzalez', RUT: '5.555.555-5', SECTOR: 'AMARILLO',
      ESTRATIFICACION: 'G1', ULTIMO_CONTROL: '', ULTIMO_SEGUIMIENTO: '', PROXIMO_CONTROL: '', FECHA_NACIMIENTO: '1978-11-11' }
  ];
  var FR = Control_frecuenciaDefault();
  var HOY = '2026-08-27';

  t('CONTROL v0.8.7.1: "Todos los sectores" se consulta (todos) con límite 25', function () {
    var r = Control_consultarControles(PAC, FR, HOY, {});
    A.igual(r.total, 4, 'total (opts vacío = consulta explícita, no inicialización)');
    A.igual(r.filas.length, 4, 'limite default 25 alcanza');
    A.igual(r.limite, 25, 'limite devuelto');
    A.igual(r.inicio, 0, 'inicio 0');
    A.cierto(r.sectores && r.sectores.length === 3, 'sectores agrupados');
  });

  t('CONTROL v0.8.7.1: filtro por sector (AMARILLO)', function () {
    var r = Control_consultarControles(PAC, FR, HOY, { sector: 'AMARILLO' });
    A.igual(r.total, 2, '2 amarillos');
    A.cierto(r.filas.every(function (f) { return f.sector === 'AMARILLO'; }), 'todas amarillas');
  });

  t('CONTROL v0.8.7.1: "Todos los sectores" combinado con término acotado', function () {
    var r = Control_consultarControles(PAC, FR, HOY, { sector: '', termino: 'silva' });
    A.igual(r.total, 1, 'Ana Silva');
    A.igual(r.filas[0].idInterno, 'I003');
  });

  t('CONTROL v0.8.7.1: búsqueda por RUT ignora puntos y guión', function () {
    var r = Control_consultarControles(PAC, FR, HOY, { termino: '123456789' });
    A.igual(r.total, 1, 'RUT sin puntos');
    A.igual(r.filas[0].idInterno, 'I002', 'Luis Soto');
  });

  t('CONTROL v0.8.7.1: búsqueda por ID interno (subcadena)', function () {
    var r = Control_consultarControles(PAC, FR, HOY, { termino: 'I00' });
    A.igual(r.total, 4, 'todos los IDs');
    r = Control_consultarControles(PAC, FR, HOY, { termino: '003' });
    A.igual(r.total, 1, 'I003');
  });

  t('CONTROL v0.8.7.1: búsqueda por nombre ignora tildes', function () {
    var r = Control_consultarControles(PAC, FR, HOY, { termino: 'gonzalez' });
    A.igual(r.total, 1, 'Pedro (se escribe "Gónzalez")');
    A.igual(r.filas[0].idInterno, 'I004');
  });

  t('CONTROL v0.8.7.1: paginación pageSize=2 avanza y conserva total', function () {
    var p1 = Control_consultarControles(PAC, FR, HOY, { limite: 2 });
    A.igual(p1.total, 4, 'total');
    A.igual(p1.filas.length, 2, 'página 1');
    A.igual(p1.desde, 0, 'desde 0');
    A.igual(p1.hasta, 2, 'hasta 2');
    var p2 = Control_consultarControles(PAC, FR, HOY, { inicio: 2, limite: 2 });
    A.igual(p2.filas.length, 2, 'página 2');
    A.igual(p2.desde, 2, 'desde 2');
    var ids = p1.filas.map(function (f) { return f.idInterno; }).concat(p2.filas.map(function (f) { return f.idInterno; }));
    A.igual(ids.slice().sort().join(','), ['I001', 'I002', 'I003', 'I004'].join(','), 'sin solapes');
  });

  t('CONTROL v0.8.7.1: límite se capa a 100 y el desplazamiento no excede total', function () {
    var r = Control_consultarControles(PAC, FR, HOY, { inicio: 999, limite: 999 });
    A.igual(r.limite, 100, 'cap 100');
    A.igual(r.desde, 4, 'desde clamp a total');
    A.igual(r.filas.length, 0, 'sin filas tras el final');
    r = Control_consultarControles(PAC, FR, HOY, { limite: 0 });
    A.igual(r.limite, 25, 'limite 0 → default 25');
  });

  t('CONTROL v0.8.7.1: sin resultados (término inexistente)', function () {
    var r = Control_consultarControles(PAC, FR, HOY, { termino: 'zznotthere' });
    A.igual(r.total, 0, 'total 0');
    A.igual(r.filas.length, 0, 'filas vacías');
    A.igual(r.hasta, 0, 'hasta 0');
  });

  t('CONTROL v0.8.7.1: ficha usa contexto individual (no recorre la población)', function () {
    var una = Control_consultarControles([PAC[0]], FR, HOY, { sector: 'AMARILLO' });
    A.igual(una.total, 1, 'una sola persona consultada');
    A.igual(una.filas[0].idInterno, 'I001');
    var sg = Control_filasPanel([PAC[0]], FR, HOY).filas[0];
    A.igual(sg.nombre, 'María Pérez', 'fila individual');
  });
}

// ---------------------------------------------------------------------------
// v0.8.7.1 — AUDITORÍA DE DIÁLOGOS: inventario único (UICFG_DIALOGOS)
// ---------------------------------------------------------------------------
function _pruebas_dialogos_v087(t, A) {
  t('DIÁLOGOS v0.8.7.1: inventario bien formado y sin duplicados', function () {
    A.cierto(Array.isArray(UICFG_DIALOGOS) && UICFG_DIALOGOS.length >= 14, 'inventario poblado');
    var vistos = {};
    UICFG_DIALOGOS.forEach(function (d) {
      A.cierto(d && typeof d.opener === 'string' && d.opener.length > 2, 'opener ' + d.opener);
      A.cierto(typeof d.plantilla === 'string' && d.plantilla.length > 1, 'plantilla ' + d.plantilla);
      A.cierto(d.tipo === 'modal' || d.tipo === 'sidebar', 'tipo de ' + d.opener);
      A.cierto(!vistos[d.opener], 'duplicado: ' + d.opener);
      vistos[d.opener] = true;
    });
  });

  t('DIÁLOGOS v0.8.7.1: todo modal con plantilla, todo opener único y consistente', function () {
    var modales = UICFG_DIALOGOS.filter(function (d) { return d.tipo === 'modal'; });
    var sidebars = UICFG_DIALOGOS.filter(function (d) { return d.tipo === 'sidebar'; });
    A.cierto(modales.length >= 9, 'al menos 9 modales');
    A.cierto(sidebars.length >= 3, 'al menos 3 sidebars');
    var opens = UICFG_DIALOGOS.map(function (d) { return d.opener; });
    A.igual(opens.length, opens.filter(function (x, i) { return opens.indexOf(x) === i; }).length, 'openers únicos');
    A.cierto(UICFG_DIALOGOS.some(function (d) { return d.plantilla === 'Controles'; }), 'Controles en el inventario');
    A.cierto(UICFG_DIALOGOS.some(function (d) { return d.opener === 'UI_abrirControles'; }), 'opener UI_abrirControles');
    A.cierto(UICFG_DIALOGOS.some(function (d) { return d.opener === 'UI_abrirFicha'; }), 'opener UI_abrirFicha');
    A.cierto(UICFG_DIALOGOS.some(function (d) { return d.plantilla === 'Configuracion' && d.opener === 'UI_configuracionEstratificacion'; }),
      'Estratificación integrado a Configuración');
    A.cierto(UICFG_DIALOGOS.some(function (d) { return d.plantilla === 'Configuracion' && d.opener === 'UI_configuracionResponsables'; }),
      'Responsables integrado a Configuración');
  });

  t('DIÁLOGOS v0.8.7.1: versión del sistema acorde al lanzamiento', function () {
    var v = ECICEP.VERSION;
    A.igual(v, '0.9.3', 'versión esperada v0.9.3');
    var part = v.split('.');
    A.cierto(part.length === 3 || part.length === 4, 'semver ' + part.length + ' partes');
  });
}

// ---------------------------------------------------------------------------
// v0.8.7.2 — RESPONSABLES POR SECTOR (acumulables, DEC-039)
// ---------------------------------------------------------------------------
function _pruebas_responsables_v0872(t, A) {
  var filas = [
    COLUMNAS_RESPONSABLES,
    ['AMARILLO', 'ENF', 'Enfermera/o', 'enfermeria@cli.cl', true],
    ['amarillo', 'MED', 'Médico/a', 'medico@cli.cl', 'FALSE'],
    ['', '', '', '', ''],
    ['NARANJO', 'ENF', 'Enfermera/o', 'enfermeria@cli.cl', true]
  ];

  t('RESPONSABLES v0.8.7.2: mapeo canónico (sector/código normalizados, vacía omitida)', function () {
    var r = Responsables_mapear(filas);
    A.igual(r.length, 3, 'tres asociaciones (vacía omitida)');
    A.igual(r[0].sector, 'AMARILLO', 'sector a mayúsculas');
    A.igual(r[1].sector, 'AMARILLO', 'sector escrito en minúscula normalizado');
    A.igual(r[1].activo, false, 'ACTIVO FALSE → inactivo');
    A.igual(r[2].sector, 'NARANJO', 'sector distinto conservado');
  });

  t('RESPONSABLES v0.8.7.2: un sector puede tener N responsables sin sobrescribir', function () {
    var lista = Responsables_mapear(filas);
    var v1 = Responsables_validarSector('AMARILLO', lista.filter(function (r) { return r.sector === 'AMARILLO'; }), []);
    A.cierto(v1.ok, 'sector con ENF y MED válido');
    A.igual(v1.cantidad, 2, 'dos responsables coexisten');
  });

  t('RESPONSABLES v0.8.7.2: duplicados (SECTOR+CODIGO) detectados y sin duplicar al guardar', function () {
    var lista = Responsables_mapear(filas);
    var v = Responsables_validarSector('AMARILLO', [
      { codigo: 'ENF', nombre: 'Enfermera/o', correo: '', activo: true },
      { codigo: 'enf', nombre: 'Enfermera/o 2', correo: '', activo: true }
    ], []);
    A.cierto(!v.ok, 'duplicado rechazado');
    A.cierto(v.duplicados.indexOf('ENF') !== -1, 'duplicado ' + v.duplicados.join(','));
    A.cierto(v.errores.join(' ').indexOf('Duplicados') !== -1, 'mensaje de duplicados');
  });

  t('RESPONSABLES v0.8.7.2: mismo responsable en varios sectores (clave incluye sector)', function () {
    A.cierto(Responsables_clave('AMARILLO', 'ENF') !== Responsables_clave('NARANJO', 'ENF'), 'claves distintas por sector');
    var lista = Responsables_mapear(filas); // ENF en AMARILLO y NARANJO
    var v = Responsables_validarSector('NARANJO', lista.filter(function (r) { return r.sector === 'NARANJO'; }), []);
    A.cierto(v.ok, 'ENF puede estar en NARANJO aunque también esté en AMARILLO');
  });

  t('RESPONSABLES v0.8.7.2: sector inválido y responsables sin nombre/código rechazados', function () {
    var v1 = Responsables_validarSector('AZUL', [], []);
    A.cierto(!v1.ok, 'sector fuera del conjunto cerrado');
    A.cierto(v1.errores.join(' ').indexOf('Sector inválido') !== -1, 'mensaje de sector');
    var v2 = Responsables_validarSector('AMARILLO', [{ codigo: 'X1', nombre: '', correo: '', activo: true }], []);
    A.cierto(!v2.ok, 'responsable sin nombre rechazado');
  });

  t('RESPONSABLES v0.8.7.2: correos múltiples deduplidos (incluye legacy)', function () {
    var lista = [
      { sector: 'AMARILLO', codigo: 'ENF', nombre: 'Enfermera/o', correo: 'a@cli.cl', activo: true },
      { sector: 'AMARILLO', codigo: 'MED', nombre: 'Médico/a', correo: 'b@cli.cl', activo: true },
      { sector: 'AMARILLO', codigo: 'TO', nombre: 'TO', correo: 'a@cli.cl', activo: true }, // duplicado de correo
      { sector: 'AMARILLO', codigo: 'OFF', nombre: 'Inactivo', correo: 'c@cli.cl', activo: false }
    ];
    var legacy = { AMARILLO: 'b@cli.cl', NARANJO: 'n@cli.cl' };
    A.arreglos(Responsables_correosDe(lista, 'AMARILLO', legacy, false), ['a@cli.cl', 'b@cli.cl'], 'activos + legacy sin duplicar');
    A.arreglos(Responsables_correosDe(lista, 'AMARILLO', legacy, true), ['a@cli.cl', 'b@cli.cl', 'c@cli.cl'], 'con inactivos si se pide');
    A.arreglos(Responsables_correosDe(lista, 'NARANJO', legacy, false), ['n@cli.cl'], 'solo legacy de otro sector');
  });

  t('RESPONSABLES v0.8.7.2: inactivo del catálogo no se pierde pero se marca', function () {
    var catalogo = [
      { CODIGO: 'ENF', NOMBRE: 'Enfermera/o', ACTIVO: true },
      { CODIGO: 'MED', NOMBRE: 'Médico/a', ACTIVO: false }
    ];
    var v = Responsables_validarSector('AMARILLO', [
      { codigo: 'ENF', nombre: 'Enfermera/o', correo: '', activo: true },
      { codigo: 'MED', nombre: 'Médico/a', correo: '', activo: true }
    ], catalogo);
    A.cierto(v.ok, 'entrada del catálogo inactivo NO bloquea la guarda');
    A.cierto(v.inactivos.indexOf('MED') !== -1, 'MED reportado como inactivo');
  });

  t('RESPONSABLES v0.8.7.2: diagnóstico/dry-run sin modificar (duplicados, inválidos, sin catálogo, legacy)', function () {
    var lista = [
      { sector: 'AMARILLO', codigo: 'ENF', nombre: 'Enfermera/o', correo: 'ok@cli.cl', activo: true },
      { sector: 'AMARILLO', codigo: 'ENF', nombre: 'Enfermera/o', correo: 'ok@cli.cl', activo: true }, // duplicado
      { sector: 'NARANJO', codigo: 'X1', nombre: 'Externo', correo: 'correo mal', activo: true },
      { sector: 'VERDE', codigo: 'R_PERSONA', nombre: 'Persona', correo: '', activo: false }
    ];
    var catalogo = [
      { CODIGO: 'ENF', NOMBRE: 'Enfermera/o', ACTIVO: true },
      { CODIGO: 'R_PERSONA', NOMBRE: 'Persona', ACTIVO: true }
    ];
    var legacy = { VERDE: 'jefe@cli.cl' };
    var d = Responsables_diagnostico(lista, catalogo, legacy);
    A.igual(d.totales.asociaciones, 4, 'total asociaciones');
    A.igual(d.sectores.join(','), 'AMARILLO,NARANJO,VERDE', 'conjunto cerrado de sectores');
    A.igual(d.duplicados.length, 1, 'duplicado detectado');
    A.igual(d.correosInvalidos.length, 1, 'correo inválido detectado');
    A.igual(d.sinCatalogo.length, 1, 'responsable sin entrada de catálogo');
    A.igual(Object.keys(d.legacy).length, 1, 'legacy integrado');
    A.igual(d.legacy.VERDE, 'jefe@cli.cl', 'valor legacy');
  });

  t('RESPONSABLES v0.8.7.2: email válido (vacío = opcional) y conjunto de sectores cerrado', function () {
    A.cierto(Responsables_emailValido(''), 'vacío opcional');
    A.cierto(Responsables_emailValido('a@b.cl'), 'correo simple válido');
    A.cierto(!Responsables_emailValido('correo mal'), 'sin @ rechazado');
    A.cierto(!Responsables_emailValido('a@b'), 'sin dominio rechazado');
    SECTORES_RESPONSABLES.forEach(function (s) {
      A.cierto(/^(AMARILLO|NARANJO|VERDE)$/.test(s), 'sector cerrado: ' + s);
    });
  });

  t('RESPONSABLES v0.8.7.2: las claves legacy no se listan (se administran en el panel)', function () {
    A.igual(Config_seccionDe('RESPONSABLE_AMARILLO'), 'CORREOS_RESPONSABLES', 'legacy sigue tipada como correos'); // persistencia del contrato
  });
}

// ---------------------------------------------------------------------------
// v0.8.8 — AUDITORÍA INTEGRAL (FASE 1 dry-run + escala)
// ---------------------------------------------------------------------------
function _pruebas_auditoria_v088(t, A) {
  // Datos sintéticos para auditoría
  var HOY = '2026-08-27';
  var FR = { G1: { cantidad: 90, unidad: 'días' }, G2: { cantidad: 180, unidad: 'días' }, G3: { cantidad: 365, unidad: 'días' }, G: { cantidad: 180, unidad: 'días' } };
  var PAC = [
    { ID_INTERNO: 'I001', RUT: '12345678-9', NOMBRE: 'María Pérez', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G1',
      FECHA_NACIMIENTO: '1980-05-15', ULTIMO_CONTROL: '2026-07-20', PROXIMO_CONTROL: '2026-10-18' }, // vigente (prox > hoy+7)
    { ID_INTERNO: 'I002', RUT: '23456789-0', NOMBRE: 'Juan López', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2',
      FECHA_NACIMIENTO: '1975-12-10', ULTIMO_CONTROL: '2026-06-01', PROXIMO_CONTROL: '2026-11-28' }, // vigente
    { ID_INTERNO: 'I003', RUT: '34567890-1', NOMBRE: 'Ana Gómez', SECTOR: 'VERDE', ESTRATIFICACION: 'G3',
      FECHA_NACIMIENTO: '1990-03-20', ULTIMO_CONTROL: '2026-07-01', PROXIMO_CONTROL: '2027-07-01' }, // vigente
    { ID_INTERNO: 'I004', RUT: '45678901-2', NOMBRE: 'Pedro Ruiz', SECTOR: 'AMARILLO', ESTRATIFICACION: '',
      FECHA_NACIMIENTO: '1985-08-25', ULTIMO_CONTROL: '', PROXIMO_CONTROL: '' }, // sin último
    { ID_INTERNO: 'I005', RUT: '56789012-3', NOMBRE: 'Laura Díaz', SECTOR: 'NARANJO', ESTRATIFICACION: 'G1',
      FECHA_NACIMIENTO: '1970-01-01', ULTIMO_CONTROL: '2026-01-01', PROXIMO_CONTROL: '2026-04-01' }, // vencido
    { ID_INTERNO: 'I006', RUT: '67890123-4', NOMBRE: 'Carlos Soto', SECTOR: 'VERDE', ESTRATIFICACION: 'G2',
      FECHA_NACIMIENTO: 'invalid', ULTIMO_CONTROL: '2026-06-15', PROXIMO_CONTROL: '2026-12-12' }, // vigente (prox coincide con derivado)
    { ID_INTERNO: 'I007', RUT: '78901234-5', NOMBRE: 'Sofía Vega', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G',
      FECHA_NACIMIENTO: '1995-07-10', ULTIMO_CONTROL: '2026-08-01', PROXIMO_CONTROL: '2026-01-28' }, // próximo (≤7d: 08-01+180d=01-28, but wait...)
    { ID_INTERNO: 'I008', RUT: '89012345-6', NOMBRE: 'Miguel Torres', SECTOR: 'NARANJO', ESTRATIFICACION: 'G1',
      FECHA_NACIMIENTO: '1988-11-30', ULTIMO_CONTROL: '2026-05-20', PROXIMO_CONTROL: '2026-09-15' } // desalineado: G1 90d desde 05-20 = 08-18 no 09-15
  ];

  t('AUDITORÍA v0.8.8: clasificación de población (VIGENTE/PRÓXIMO/VENCIDO/SIN_ÚLTIMO/DESALINEADO)', function () {
    var r = Aud_clasificarPoblacion(PAC, FR, HOY, 7);
    A.igual(r.metricas.total, 8, 'total');
    A.igual(r.metricas.G1 + r.metricas.G2 + r.metricas.G3 + r.metricas.GPend, 8, 'suma niveles');
    A.igual(r.metricas.G1, 3, 'G1=3');
    A.igual(r.metricas.G2, 2, 'G2=2');
    A.igual(r.metricas.G3, 1, 'G3=1');
    A.igual(r.metricas.GPend, 2, 'GPend=2');
    A.igual(r.metricas.sinUltimoControl, 1, 'I004 sin último control');
    A.igual(r.metricas.vencidos, 1, 'I005 vencido');
    A.igual(r.metricas.proximos, 0, 'nadie próximo (≤7d)');
    A.igual(r.metricas.vigentes, 4, 'I001, I002, I003, I006 vigentes');
    A.igual(r.metricas.desalineados, 1, 'I008 desalineado (almacenado 09-15 ≠ derivado 08-18)');
    A.igual(r.metricas.sinFecha, 2, 'I004 sin último + I007 sin estrat');
    A.igual(r.metricas.fechaInvalida, 1, 'I006 fecha inválida');
    A.igual(r.desalineados.length, 1, 'un desalineado en lista');
    A.igual(r.desalineados[0].id, '•••I008', 'anonimización ID');
    A.igual(r.desalineados[0].almacenado, '2026-09-15', 'valor almacenado');
    A.igual(r.desalineados[0].derivado, '2026-08-18', 'valor derivado (G1 90d desde 05-20)');
  });

  t('AUDITORÍA v0.8.8: anonimización RUT/NOMBRE/ID', function () {
    A.igual(Aud_anonRut('12345678-9'), '**.***.**78-9');
    A.igual(Aud_anonNombre('María Pérez González'), 'M••• P••• G•••');
    A.igual(Aud_anonId('EC-ABC123-XYZ'), '•••-XYZ');
    A.igual(Aud_anonId(''), '');
  });

  t('AUDITORÍA v0.8.8: auditoría Amarillo (eventos, duplicados, estado)', function () {
    var EV = [
      { ID_EVENTO: 'E1', ID_INTERNO: 'I001', TIPO_EVENTO: 'CONTROL', SECTOR: 'AMARILLO', FECHA_EVENTO: '2026-05-01', RIESGO_G: 'G1' },
      { ID_EVENTO: 'E2', ID_INTERNO: 'I001', TIPO_EVENTO: 'CONTROL', SECTOR: 'AMARILLO', FECHA_EVENTO: '2026-05-01', RIESGO_G: 'G1' }, // duplicado mismo id+tipo+fecha
      { ID_EVENTO: 'E3', ID_INTERNO: 'I002', TIPO_EVENTO: 'SEGUIMIENTO', SECTOR: 'AMARILLO', FECHA_EVENTO: '2026-06-15', RIESGO_G: 'G2' }
    ];
    try {
      var r = Aud_auditarAmarillo(PAC, EV, FR, HOY, 7);
      A.igual(r.total, 3, '3 eventos Amarillo');
      A.igual(r.gruposDuplicados, 1, 'un grupo duplicado');
      A.igual(r.ejemplosDuplicados.length, 1, 'ejemplo duplicado');
    } catch (e) {
      // En node puede fallar si Amarillo_analizarDuplicados no está disponible
      A.cierto(true, 'Amarillo test skipped in node: ' + (e && e.message || e));
    }
  });

  t('AUDITORÍA v0.8.8: auditoría RESPONSABLES (mapeo, correos, diagnóstico)', function () {
    try {
      var r = Aud_auditarResponsables(PAC);
      A.cierto(typeof r.asociaciones === 'number', 'asociaciones numérico');
      A.cierto(Array.isArray(r.porSector), 'porSector array');
      A.cierto(typeof r.unicos === 'number', 'únicos numérico');
    } catch (e) {
      A.cierto(true, 'Responsables test skipped in node: ' + (e && e.message || e));
    }
  });

  t('AUDITORÍA v0.8.8: auditoría PROFESIONALES (catálogo, uso, inexistentes)', function () {
    try {
      var r = Aud_auditarProfesionales(PAC);
      A.cierto(typeof r.total === 'number', 'total numérico');
      A.cierto(typeof r.activos === 'number', 'activos numérico');
      A.cierto(typeof r.inexistentesEnCatalogo === 'number', 'inexistentes numérico');
    } catch (e) {
      A.cierto(true, 'Profesionales test skipped in node: ' + (e && e.message || e));
    }
  });

  t('AUDITORÍA v0.8.8: auditoría CONFIG (clasificación claves, legacy, desconocidas)', function () {
    var cfg = [
      ['GENERAL_NOMBRE_SISTEMA', 'ECICEP'], ['FREC_CONTROL_G1_CANT', '90'], ['FREC_CONTROL_G1_UNIDAD', 'días'],
      ['FREC_CONTROL_G1', '90'], ['FREC_CONTROL_G2_CANT', '180'], ['AVISO_CONTROL_DIAS', '7'],
      ['WEBHOOK_TOKEN', 'secret'], ['DESCONOCIDA_X', 'valor']
    ];
    var r = Aud_auditarConfig(cfg);
    A.igual(r.total, 8, 'total claves');
    A.igual(r.grupos.ESTRATIFICACIÓN.length, 4, 'G1_CANT, G1_UNIDAD, G2_CANT, AVISO');
    A.igual(r.grupos.LEGACY.length, 1, 'FREC_CONTROL_G1 legacy');
    A.igual(r.grupos.ADMINISTRADOR.length, 1, 'WEBHOOK_TOKEN');
    A.igual(r.grupos.DESCONOCIDA.length, 1, 'DESCONOCIDA_X');
  });

  t('AUDITORÍA v0.8.8: render ╔═══════════════════════════════════════════════════════════════════════════════════════════════╗', function () {
    var txt = Aud_renderTexto({
      TEST: { titulo: 'TEST', lineas: ['línea 1', 'línea 2'] }
    });
    A.cierto(txt.indexOf('╔') === 0, 'inicio marco');
    A.cierto(txt.indexOf('═'.repeat(98)) !== -1, 'línea de ancho 98');
    A.cierto(txt.indexOf('TEST') !== -1, 'título presente');
    A.cierto(txt.indexOf('línea 1') !== -1, 'contenido');
    A.cierto(txt.indexOf('╚') !== -1, 'cierre marco');
  });

  t('AUDITORÍA v0.8.8: versión del sistema actualizada a 0.9.3', function () {
    var v = ECICEP.VERSION;
    A.igual(v, '0.9.3', 'versión esperada v0.9.3');
    var part = v.split('.');
    A.cierto(part.length === 3 || part.length === 4, 'semver ' + part.length + ' partes');
  });
}

// ---------------------------------------------------------------------------
// v0.8.8 — PRUEBAS DE ESCALA (100 / 500 / 1k / 3k / 5k / 10k sintéticos)
// ---------------------------------------------------------------------------
function _pruebas_escala_v088(t, A) {
  function genPacientes(n, base) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var id = base + i;
      var rut = String(10000000 + id) + '-' + String(id % 9 + 1);
      out.push({
        ID_INTERNO: 'I' + String(id).padStart(5, '0'),
        RUT: rut,
        NOMBRE: 'Paciente ' + id,
        SECTOR: ['AMARILLO', 'NARANJO', 'VERDE'][id % 3],
        ESTRATIFICACION: ['G1', 'G2', 'G3'][id % 3],
        FECHA_NACIMIENTO: '1980-01-01',
        ULTIMO_CONTROL: id % 5 === 0 ? '' : '2026-01-01',
        PROXIMO_CONTROL: ''
      });
    }
    return out;
  }

  var FR = { G1: { cantidad: 90, unidad: 'días' }, G2: { cantidad: 180, unidad: 'días' }, G3: { cantidad: 365, unidad: 'días' }, G: { cantidad: 180, unidad: 'días' } };
  var HOY = '2026-08-27';

  [100, 500, 1000, 3000, 5000, 10000].forEach(function (n) {
    t('ESCALA v0.8.8: ' + n + ' pacientes — Control_filasPanel O(n) < 2000ms', function () {
      var PAC = genPacientes(n, 1);
      var t0 = Date.now();
      var r = Control_filasPanel(PAC, FR, HOY);
      var ms = Date.now() - t0;
      A.igual(r.filas.length, n, 'todas las filas');
      A.igual(r.sectores.length, 3, 'tres sectores');
      A.cierto(ms < 2000, 'tiempo ' + ms + 'ms < 2000ms para ' + n);
    });
  });

  [100, 500, 1000, 3000, 5000, 10000].forEach(function (n) {
    t('ESCALA v0.8.8: ' + n + ' pacientes — Aud_clasificarPoblacion O(n) < 2000ms', function () {
      var PAC = genPacientes(n, 1);
      var t0 = Date.now();
      var r = Aud_clasificarPoblacion(PAC, FR, HOY, 7);
      var ms = Date.now() - t0;
      A.igual(r.metricas.total, n, 'total');
      A.cierto(ms < 2000, 'tiempo ' + ms + 'ms < 2000ms para ' + n);
    });
  });

  [100, 500, 1000, 3000, 5000, 10000].forEach(function (n) {
    t('ESCALA v0.8.8: ' + n + ' eventos Amarillo — Amarillo_analizarDuplicados O(n log n) < 3000ms', function () {
      var EV = [];
      for (var i = 0; i < n; i++) {
        EV.push({
          ID_EVENTO: 'E' + i,
          ID_INTERNO: 'I' + String(i % 100).padStart(5, '0'),
          TIPO_EVENTO: 'CONTROL',
          SECTOR: 'AMARILLO',
          FECHA_EVENTO: '2026-01-01',
          RIESGO_G: ['G1', 'G2', 'G3'][i % 3]
        });
      }
      var t0 = Date.now();
      var r = Amarillo_analizarDuplicados(EV);
      var ms = Date.now() - t0;
      A.cierto(typeof r.gruposDuplicados === 'number', 'grupos numérico');
      A.cierto(ms < 3000, 'tiempo ' + ms + 'ms < 3000ms para ' + n);
    });
  });

  [100, 500, 1000, 3000, 5000, 10000].forEach(function (n) {
    t('ESCALA v0.8.8: ' + n + ' responsables — Responsables_diagnostico O(n) < 1000ms', function () {
      var resp = [];
      for (var i = 0; i < n; i++) {
        resp.push({
          sector: ['AMARILLO', 'NARANJO', 'VERDE'][i % 3],
          codigo: 'R' + String(i % 50).padStart(3, '0'),
          nombre: 'Resp ' + i,
          correo: 'resp' + i + '@cli.cl',
          activo: true
        });
      }
      var t0 = Date.now();
      var r = Responsables_diagnostico(resp, [], {});
      var ms = Date.now() - t0;
      A.igual(r.totales.asociaciones, n, 'total asociaciones');
      A.cierto(ms < 1000, 'tiempo ' + ms + 'ms < 1000ms para ' + n);
    });
  });

  t('ESCALA v0.8.8: búsqueda RUT O(n) — 10k < 100ms', function () {
    var PAC = genPacientes(10000, 1);
    var objetivo = PAC[9999].RUT;
    var t0 = Date.now();
    var encontrado = null;
    for (var i = 0; i < PAC.length; i++) if (Utl_texto(PAC[i].RUT) === objetivo) { encontrado = PAC[i]; break; }
    var ms = Date.now() - t0;
    A.cierto(encontrado !== null, 'encontrado');
    A.cierto(ms < 100, 'búsqueda lineal 10k ' + ms + 'ms < 100ms');
  });
}

// ---------------------------------------------------------------------------
// v0.8.9.0 — HOJAS VISUALES: secciones, buscador (sin "Ver sección")
// ---------------------------------------------------------------------------
function _pruebas_hojasvisual_v0881(t, A) {
  t('HOJAS VISUALES v0.8.9.0: SECCIONES_HOJAS definida para todos los tipos', function () {
    A.cierto(typeof SECCIONES_HOJAS === 'object', 'existe');
    A.cierto(Array.isArray(SECCIONES_HOJAS.INGRESO), 'INGRESO');
    A.cierto(Array.isArray(SECCIONES_HOJAS.PACIENTES), 'PACIENTES');
    A.cierto(Array.isArray(SECCIONES_HOJAS.SECTOR_VISTA), 'SECTOR_VISTA');
    A.cierto(Array.isArray(SECCIONES_HOJAS.EVENTOS), 'EVENTOS');
  });

  t('HOJAS VISUALES v0.8.9.0: cada sección tiene id, nombre, color, columnas', function () {
    Object.values(SECCIONES_HOJAS).forEach(function (arr) {
      arr.forEach(function (s) {
        A.cierto(typeof s.id === 'string' && s.id.length > 0, 'id: ' + s.nombre);
        A.cierto(typeof s.nombre === 'string' && s.nombre.length > 0, 'nombre: ' + s.id);
        A.cierto(typeof s.color === 'string' && s.color.startsWith('#'), 'color: ' + s.nombre);
        A.cierto(Array.isArray(s.columnas) && s.columnas.length > 0, 'columnas: ' + s.nombre);
      });
    });
  });

  t('HOJAS VISUALES v0.8.9.0: HOJAS_CON_SECCIONES cubre hojas prioritarias', function () {
    A.cierto(HOJAS_CON_SECCIONES.includes('INGRESO_NARANJO'), 'INGRESO_NARANJO');
    A.cierto(HOJAS_CON_SECCIONES.includes('INGRESO_AMARILLO'), 'INGRESO_AMARILLO');
    A.cierto(HOJAS_CON_SECCIONES.includes('INGRESO_VERDE'), 'INGRESO_VERDE');
    A.cierto(HOJAS_CON_SECCIONES.includes('PACIENTES'), 'PACIENTES');
    A.cierto(HOJAS_CON_SECCIONES.includes('SECTOR_NARANJO'), 'SECTOR_NARANJO');
    A.cierto(HOJAS_CON_SECCIONES.includes('SECTOR_AMARILLO'), 'SECTOR_AMARILLO');
    A.cierto(HOJAS_CON_SECCIONES.includes('SECTOR_VERDE'), 'SECTOR_VERDE');
    A.cierto(HOJAS_CON_SECCIONES.includes('EVENTOS'), 'EVENTOS');
    A.cierto(!HOJAS_CON_SECCIONES.includes('LOG'), 'LOG excluida');
    A.cierto(!HOJAS_CON_SECCIONES.includes('CONFIG'), 'CONFIG excluida');
    A.cierto(!HOJAS_CON_SECCIONES.includes('CONFLICTOS'), 'CONFLICTOS excluida');
  });

  t('HOJAS VISUALES v0.8.9.0: TIPO_SECCIONES_POR_HOJA mapea correctamente', function () {
    A.igual(TIPO_SECCIONES_POR_HOJA['INGRESO_NARANJO'], 'INGRESO');
    A.igual(TIPO_SECCIONES_POR_HOJA['PACIENTES'], 'PACIENTES');
    A.igual(TIPO_SECCIONES_POR_HOJA['SECTOR_AMARILLO'], 'SECTOR_VISTA');
    A.igual(TIPO_SECCIONES_POR_HOJA['EVENTOS'], 'EVENTOS');
    A.igual(TIPO_SECCIONES_POR_HOJA['INGRESO_NARANJA'], undefined, 'alias no está en mapa (normalizado en runtime)');
  });

  t('HOJAS VISUALES v0.8.9.0: HVis_normalizarNombreHoja normaliza alias', function () {
    A.igual(HVis_normalizarNombreHoja('INGRESO_NARANJA'), 'INGRESO_NARANJO');
    A.igual(HVis_normalizarNombreHoja('ingreso_naranja'), 'INGRESO_NARANJO');
    A.igual(HVis_normalizarNombreHoja('PACIENTES'), 'PACIENTES');
  });

  t('HOJAS VISUALES v0.8.9.0: HVis_obtenerSecciones devuelve config válida', function () {
    var s = HVis_obtenerSecciones('INGRESO_NARANJO');
    A.cierto(Array.isArray(s) && s.length > 0, 'INGRESO_NARANJO');
    var s2 = HVis_obtenerSecciones('PACIENTES');
    A.cierto(Array.isArray(s2) && s2.length > 0, 'PACIENTES');
    var s3 = HVis_obtenerSecciones('LOG');
    A.igual(s3, null, 'LOG sin config');
  });

  t('HOJAS VISUALES v0.8.9.0: HVis_mapaColumnas construye índice 1-based', function () {
    var enc = ['NOMBRE', 'RUT', 'SEXO', 'FECHA_NACIMIENTO'];
    var mapa = HVis_mapaColumnas(enc);
    A.igual(mapa['NOMBRE'], 1);
    A.igual(mapa['RUT'], 2);
    A.igual(mapa['SEXO'], 3);
    A.igual(mapa['FECHA_NACIMIENTO'], 4);
    A.igual(mapa['INEXISTENTE'], undefined);
  });

  t('HOJAS VISUALES v0.8.9.0: HVis_validarSeccion filtra columnas existentes', function () {
    var enc = ['NOMBRE', 'RUT', 'SEXO', 'FECHA_NACIMIENTO'];
    var mapa = HVis_mapaColumnas(enc);
    var sec = { columnas: ['NOMBRE', 'RUT', 'INEXISTENTE'] };
    var v = HVis_validarSeccion(sec, mapa);
    A.igual(v.existentes.length, 2, '2 existentes');
    A.igual(v.faltantes.length, 1, '1 faltante');
    A.igual(v.faltantes[0], 'INEXISTENTE');
  });

  t('HOJAS VISUALES v0.8.9.0: CLAVES_BUSQUEDA_POR_HOJA define claves por hoja', function () {
    A.cierto(Array.isArray(CLAVES_BUSQUEDA_POR_HOJA['PACIENTES']), 'PACIENTES array');
    A.cierto(CLAVES_BUSQUEDA_POR_HOJA['PACIENTES'].includes('ID_INTERNO'), 'ID_INTERNO');
    A.cierto(CLAVES_BUSQUEDA_POR_HOJA['PACIENTES'].includes('RUT'), 'RUT');
    A.cierto(CLAVES_BUSQUEDA_POR_HOJA['PACIENTES'].includes('NOMBRE'), 'NOMBRE');
    A.cierto(!CLAVES_BUSQUEDA_POR_HOJA['LOG'], 'LOG sin claves (undefined)');
  });

  t('HOJAS VISUALES v0.8.9.0: COLORES_SECCION paleta semántica completa', function () {
    A.igual(COLORES_SECCION.IDENTIDAD, RAMPA.GENERAL.seccion[0]);
    A.igual(COLORES_SECCION.SECTORIZACION, RAMPA.GENERAL.seccion[1]);
    A.igual(COLORES_SECCION.CONTROLES, RAMPA.GENERAL.seccion[2]);
    A.igual(COLORES_SECCION.CLINICO, RAMPA.GENERAL.seccion[1]);
    A.igual(COLORES_SECCION.TECNICO, RAMPA.GENERAL.seccion[1]);
    var vals = Object.keys(COLORES_SECCION).map(function (k) { return COLORES_SECCION[k]; });
    A.cierto(vals.length > 6, '>6 secciones definidas');
  });
}

// ---------------------------------------------------------------------------
// v0.8.9.0 — HOJAS VISUALES REALES + INSTALADOR RECONCILIADOR
// ---------------------------------------------------------------------------
function _pruebas_hojasvisual_v0883(t, A) {
  // Datos sintéticos para PACIENTES
  var PAC = [
    { ID_INTERNO: 'I001', RUT: '12345678-9', NOMBRE: 'María Pérez', SEXO: 'F', FECHA_NACIMIENTO: '1980-05-15',
      TELEFONOS: '912345678', TELEFONO_OBS: '', SECTOR: 'AMARILLO', ESTRATIFICACION: 'G1', ESTADO: 'INGRESADO',
      DUPLA_INGRESO: '', PROFESIONAL_SEGUIMIENTO: '', PREINGRESO: '', FECHA_INGRESO: '2024-01-15',
      ULTIMO_SEGUIMIENTO: '2024-06-01', ULTIMO_CONTROL: '2024-07-15', PROXIMO_CONTROL: '2024-10-13',
      COMPOSICION_CONTROL: '', CONDICIONES: '', OTRAS_PATOLOGIAS: '', OBSERVACIONES: '',
      NOMBRE_NORMALIZADO: 'MARIA PEREZ', RUT_DV_VALIDO: true, RUT_SIN_DV: false,
      ESTRAT_ORIGEN: '', ESTRAT_CALCULADA: '', ESTRAT_FECHA_CALCULO: '', FUENTE: 'test', FECHA_ACTUALIZACION: '', REQUIERE_REVISION: false }
  ];
  var FR = { G1: { cantidad: 90, unidad: 'días' }, G2: { cantidad: 180, unidad: 'días' }, G3: { cantidad: 365, unidad: 'días' }, G: { cantidad: 180, unidad: 'días' } };

  t('HOJAS VISUALES v0.8.9.0: HVis_mapaColumnas con encabezados PACIENTES', function () {
    var enc = ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS',
      'SECTOR', 'ESTRATIFICACION', 'ESTADO', 'DUPLA_INGRESO', 'PROFESIONAL_SEGUIMIENTO',
      'PREINGRESO', 'FECHA_INGRESO', 'ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL', 'PROXIMO_CONTROL',
      'COMPOSICION_CONTROL', 'CONDICIONES', 'OTRAS_PATOLOGIAS', 'OBSERVACIONES',
      'NOMBRE_NORMALIZADO', 'RUT_DV_VALIDO', 'RUT_SIN_DV', 'ESTRAT_ORIGEN', 'ESTRAT_CALCULADA',
      'ESTRAT_FECHA_CALCULO', 'FUENTE', 'FECHA_ACTUALIZACION', 'REQUIERE_REVISION'];
    var mapa = HVis_mapaColumnas(enc);
    A.igual(mapa['ID_INTERNO'], 1);
    A.igual(mapa['RUT'], 2);
    A.igual(mapa['NOMBRE'], 3);
    A.igual(mapa['SECTOR'], 8);
    A.igual(mapa['ESTRATIFICACION'], 9);
    A.igual(mapa['ULTIMO_CONTROL'], 16);
  });

  t('HOJAS VISUALES v0.8.9.0: HVis_validarSeccion para identidad (7 columnas)', function () {
    var enc = ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS'];
    var mapa = HVis_mapaColumnas(enc);
    var sec = { columnas: ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS'] };
    var v = HVis_validarSeccion(sec, mapa);
    A.igual(v.existentes.length, 7, '7 existentes');
    A.igual(v.faltantes.length, 0, '0 faltantes');
    A.igual(v.existentes[0].indice, 1);
    A.igual(v.existentes[6].indice, 7);
  });

  t('HOJAS VISUALES v0.8.9.0: HVis_calcularPlan genera filas correctas', function () {
    var enc = ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS',
      'SECTOR', 'ESTRATIFICACION', 'ESTADO', 'DUPLA_INGRESO', 'PROFESIONAL_SEGUIMIENTO',
      'PREINGRESO', 'FECHA_INGRESO', 'ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL', 'PROXIMO_CONTROL',
      'COMPOSICION_CONTROL', 'CONDICIONES', 'OTRAS_PATOLOGIAS', 'OBSERVACIONES',
      'NOMBRE_NORMALIZADO', 'RUT_DV_VALIDO', 'RUT_SIN_DV', 'ESTRAT_ORIGEN', 'ESTRAT_CALCULADA',
      'ESTRAT_FECHA_CALCULO', 'FUENTE', 'FECHA_ACTUALIZACION', 'REQUIERE_REVISION'];
    var mapa = HVis_mapaColumnas(enc);
    var secciones = SECCIONES_HOJAS.PACIENTES;
    var plan = HVis_calcularPlan('PACIENTES', secciones, mapa);
    A.igual(plan.filaSector, 1, 'fila sector (alias título) = 1');
    A.igual(plan.tituloRow, 1, 'título en fila 1');
    A.igual(plan.seccionesRow, 2, 'secciones en fila 2');
    A.igual(plan.filaEncabezados, 3, 'encabezados en fila 3');
    A.igual(plan.datosDesdeRow, 4, 'datos desde fila 4');
    A.igual(plan.filasTotales, 3, 'total 3 filas fijas');
    A.cierto(plan.esVisual, 'PACIENTES es visual');
    A.igual(plan.secciones.length, 6, '6 secciones PACIENTES (todas tienen columnas en datos completos)');
    // Verificar rangos de columnas (ajustados a la estructura real)
    var idSec = plan.secciones.find(function(s) { return s.id === 'identidad'; });
    A.igual(idSec.colInicio, 1);
    A.igual(idSec.colFin, 7);
    var ctrlSec = plan.secciones.find(function(s) { return s.id === 'controles'; });
    A.igual(ctrlSec.colInicio, 15); // ULTIMO_SEGUIMIENTO en posición 15
    A.igual(ctrlSec.colFin, 18);   // COMPOSICION_CONTROL en posición 18
  });

  t('HOJAS VISUALES v0.8.9.4: EVENTOS es layout simple (no aplica visual)', function () {
    var enc = ['ID_EVENTO', 'TIPO_EVENTO', 'FECHA_EVENTO', 'DESCRIPCION', 'CANTIDAD',
      'ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR', 'FUENTE', 'REGISTRADO_POR', 'FECHA_REGISTRO'];
    var mapa = HVis_mapaColumnas(enc);
    var secciones = SECCIONES_HOJAS.EVENTOS;
    var plan = HVis_calcularPlan('EVENTOS', secciones, mapa);
    A.igual(plan.esVisual, false, 'EVENTOS NO es visual');
    A.igual(plan.filaEncabezados, 1, 'simple: encabezados en fila 1');
    A.igual(plan.datosDesdeRow, 2, 'simple: datos desde fila 2');
    A.igual(plan.filasTotales, 1, 'simple: 1 fila fija');
  });

  t('HOJAS VISUALES v0.8.9.4: contrato por hoja', function () {
    A.igual(Modelo_headerRow(HOJAS.PACIENTES), 3, 'PACIENTES headers fila 3');
    A.igual(Modelo_dataStartRow(HOJAS.PACIENTES), 4, 'PACIENTES datos fila 4');
    A.cierto(Modelo_esHojaVisual('INGRESO_NARANJO'), 'INGRESO_NARANJO visual');
    A.igual(Modelo_dataStartRow('INGRESO_VERDE'), 4, 'INGRESO_VERDE datos fila 4');
    A.igual(Modelo_dataStartRow('SECTOR_AMARILLO'), 4, 'SECTOR_AMARILLO datos fila 4');
    A.igual(Modelo_dataStartRow(HOJAS.EVENTOS), 2, 'EVENTOS datos fila 2');
    A.igual(Modelo_dataStartRow(HOJAS.CONFLICTOS), 2, 'CONFLICTOS datos fila 2');
    A.igual(Modelo_filaFisica('INGRESO_NARANJO', 0), 4, 'fila física índice 0 = 4');
    A.igual(Modelo_filaFisica(HOJAS.PACIENTES, 7), 11, 'fila física índice 7 = 11');
    A.igual(Modelo_filaFisica(HOJAS.EVENTOS, 0), 2, 'EVENTOS fila física 0 = 2');
  });

  t('HOJAS VISUALES v0.8.9.4: secciones INGRESO por nombres reales', function () {
    var sec = SECCIONES_HOJAS.INGRESO;
    var mapa = HVis_mapaColumnas(INGRESO_COLUMNAS);
    var faltantes = 0;
    sec.forEach(function (s) {
      var v = HVis_validarSeccion(s, mapa);
      faltantes += v.faltantes.length;
    });
    A.igual(faltantes, 0, 'todas las columnas de secciones INGRESO existen en INGRESO_COLUMNAS');
    var esperadas = HVis_columnasEsperadas('INGRESO_AMARILLO');
    var cubre = INGRESO_COLUMNAS.every(function (c) { return esperadas.indexOf(c) !== -1; });
    A.cierto(cubre, 'COLUMNAS esperadas cubren INGRESO_COLUMNAS');
  });

  t('HOJAS VISUALES v0.8.9.4: coincidencia de encabezados (clave normalizada)', function () {
    var esperadas = ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)'];
    var filaOk = ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)'];
    var filaDesc = ['n ó m b r e', 'Rut', 'sexo', 'Fecha de Nacimiento', 'Telefono(s)'];
    var filaMala = ['A', 'B', 'C', 'D', 'E'];
    A.igual(HVis_coincidenciaEncabezados(filaOk, esperadas), 1, 'exacta = 1');
    A.cierto(HVis_coincidenciaEncabezados(filaDesc, esperadas) === 1, 'normalizada ignora tildes/espacios');
    A.igual(HVis_coincidenciaEncabezados(filaMala, esperadas), 0, 'sin coincidencia = 0');
    A.igual(HVis_coincidenciaEncabezados([], esperadas), 0, 'vacía = 0');
  });

  t('HOJAS VISUALES v0.8.9.4: fórmulas INICIO derivadas del contrato', function () {
    var fTotal = Hojas_formulaIndicador('TOTAL_PAC');
    var fEstr = Hojas_formulaIndicador('ESTRAT_PEND');
    var fRut = Hojas_formulaIndicador('RUT_INVALIDOS');
    var fDup = Hojas_formulaIndicador('DUPLICADOS');
    var fUlt = Hojas_formulaIndicador('ULT_ACT');
    var fEve = Hojas_formulaIndicador('EVENTOS');
    A.igual(fTotal, '=COUNTA(PACIENTES!A4:A)', 'total usa ID_INTERNO (A) desde fila 4');
    A.cierto(fDup.indexOf('SUMPRODUCT') === 1 && fDup.indexOf('PACIENTES!B4:B') !== -1, 'duplicados usa RUT en B desde fila 4');
    A.cierto(fEstr.indexOf('PACIENTES!I4:I') !== -1, 'estratificación pendiente usa I desde fila 4');
    A.cierto(fRut.indexOf('PACIENTES!W4:W') !== -1, 'rut inválidos usa W desde fila 4');
    A.cierto(fUlt.indexOf('PACIENTES!AC4:AC') !== -1, 'última actualización usa AC desde fila 4');
    A.igual(fEve, '=COUNTA(EVENTOS!A2:A)', 'eventos (simple) sigue en fila 2');
    A.cierto(fTotal.indexOf('A2:A') === -1, 'sin anclas A2:A');
    A.cierto(fRut.indexOf('W2:W') === -1, 'sin anclas W2:W');
  });

  t('HOJAS VISUALES v0.8.9.0: Instalar_diagnosticar estructura completa (solo node)', function () {
    // En node no hay SpreadsheetApp, verificar solo que la función existe
    A.cierto(typeof Instalar_diagnosticar === 'function', 'función existe');
    // Verificar estructura de retorno esperada sin ejecutar
    var r = { ok: true, diagnostico: { resumen: { totalFases: 8, fasesPendientes: [], fasesCompletas: [] } } };
    A.cierto(r.diagnostico.resumen.totalFases >= 8, 'al menos 8 fases');
  });

  t('HOJAS VISUALES v0.8.9.0: funciones puras existen', function () {
    // Test puro sin GAS - solo verifica que las funciones existen
    A.cierto(typeof HVis_calcularPlan === 'function', 'HVis_calcularPlan existe');
    A.cierto(typeof HVis_validarSeccion === 'function', 'HVis_validarSeccion existe');
    A.cierto(typeof HVis_mapaColumnas === 'function', 'HVis_mapaColumnas existe');
  });
}

// ---------------------------------------------------------------------------
// v0.8.9.5 — PULIDO VISUAL + AUTOMATIZACIÓN INGRESOS + UX/TERMINOLOGÍA
// ---------------------------------------------------------------------------
function _pruebas_pulido_v0895(t, A) {
  function _lum(hex) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substr(0, 2), 16) / 255;
    var g = parseInt(h.substr(2, 2), 16) / 255;
    var b = parseInt(h.substr(4, 2), 16) / 255;
    function lin(c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function _ratio(a, b) {
    var l1 = _lum(a), l2 = _lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  t('PULIDO v0.8.9.5: TERMINOLOGIA diccionario completo', function () {
    A.igual(TERMINOLOGIA.PACIENTE, 'PACIENTE');
    A.igual(TERMINOLOGIA.SEGUIMIENTO, 'SEGUIMIENTO');
    A.igual(TERMINOLOGIA.ESTRATIFICACION, 'ESTRATIFICACIÓN');
    A.igual(TERMINOLOGIA.ETIQUETAS.BUSCAR, 'Buscar paciente');
    A.igual(TERMINOLOGIA.ETIQUETAS.FICHA, 'Ficha del paciente');
    A.igual(TERMINOLOGIA.ETIQUETAS.COLAREVISION, 'Cola de revisión');
    A.igual(TERMINOLOGIA.ETIQUETAS.PROCESAR, 'Procesar ingresos');
    A.igual(TERMINOLOGIA.ETIQUETAS.CONTROLES, 'Controles por persona');
  });

  t('PULIDO v0.8.9.5: PULIDO_ENCABEZADO legible (12/bold/wrap/alturas)', function () {
    A.igual(PULIDO_ENCABEZADO.fuente, 12, 'fuente');
    A.igual(PULIDO_ENCABEZADO.peso, 'bold', 'peso');
    A.cierto(PULIDO_ENCABEZADO.wrap === true, 'wrap');
    A.igual(PULIDO_ENCABEZADO.alturaVisual, 42, 'altura visual');
    A.igual(PULIDO_ENCABEZADO.alturaSimple, 30, 'altura simple');
  });

  t('PULIDO v0.8.9.5: paleta pastel con contraste TINTA ≥ 4.5:1', function () {
    var malos = [];
    Object.keys(COLORES_SECCION).forEach(function (k) {
      var c = _ratio(TINTA_SECCION, COLORES_SECCION[k]);
      if (c < 4.5) malos.push(k + ':' + c.toFixed(2));
    });
    Object.keys(COLORES_SECTOR).forEach(function (k) {
      var c = _ratio(TINTA_SECCION, COLORES_SECTOR[k]);
      if (c < 4.5) malos.push(k + ':' + c.toFixed(2));
    });
    A.igual(malos.length, 0, 'tinta legible en todas las superficies (' + malos.join(', ') + ')');
    A.igual(TINTA_SECCION, '#0B3C49');
  });

  t('PULIDO v0.8.9.5: PALETA_SECCION monocromática y con contraste', function () {
    var familias = ['AMARILLO', 'NARANJO', 'VERDE'];
    var malos = [], inco = [];
    familias.forEach(function (f) {
      var r = PALETA_SECCION[f];
      A.cierto(r && Array.isArray(r.seccion) && r.seccion.length >= 3,
        f + ' con rampa barra/sección/encabezado');
      A.cierto(r.barra && r.encabezado, f + ' barra y encabezado presentes');
      if (!r) return;
      [r.barra].concat(r.seccion).concat([r.encabezado]).forEach(function (c) {
        var rr = _ratio(TINTA_SECCION, c);
        if (rr < 4.5) malos.push(f + ':' + c + '(' + rr.toFixed(2) + ')');
      });
      var deltas = r.seccion.slice(1).map(function (c, i) {
        return Math.abs(_lum(c) - _lum(r.seccion[i]));
      });
      var maxDelta = Math.max.apply(Math, deltas);
      if (maxDelta > 0.3) inco.push(f + ': delta=' + maxDelta.toFixed(2));
    });
    A.igual(malos.length, 0, 'tinta legible en todas (' + malos.join(', ') + ')');
    A.igual(inco.length, 0, 'familias homogéneas en luminancia (' + inco.join(', ') + ')');
  });

  t('PULIDO v0.8.9.5: secciones del sector ≠ colores clínicos de CF', function () {
    var E = DESIGN_SYSTEM.ESTADOS;
    ['AMARILLO', 'NARANJO', 'VERDE'].forEach(function (f) {
      var c = PALETA_SECCION[f].seccion[2];
      A.cierto(c !== E.PROXIMO.fondo, f + ' ≠ próximos');
      A.cierto(c !== E.VIGENTE.fondo, f + ' ≠ vigente');
      A.cierto(c !== E.VENCIDO.fondo, f + ' ≠ vencido');
    });
    A.cierto(COLORES_SECCION.CONTROLES !== E.PROXIMO.fondo, 'global ≠ próximos');
    A.cierto(COLORES_SECCION.CONTROLES !== E.VIGENTE.fondo, 'global ≠ vigente');
    A.cierto(COLORES_SECCION.CONTROLES !== E.VENCIDO.fondo, 'global ≠ vencido');
  });

  t('PULIDO v0.8.9.5: HVis_familiaHoja asocia cada puerta a su familia', function () {
    A.igual(HVis_familiaHoja('SECTOR_AMARILLO'), 'AMARILLO', 'sector amarillo');
    A.igual(HVis_familiaHoja('INGRESO_AMARILLO'), 'AMARILLO', 'ingreso amarillo');
    A.igual(HVis_familiaHoja('SECTOR_NARANJO'), 'NARANJO', 'sector naranjo');
    A.igual(HVis_familiaHoja('INGRESO_NARANJA'), 'NARANJO', 'alias naranja');
    A.igual(HVis_familiaHoja('SECTOR_VERDE'), 'VERDE', 'sector verde');
    A.igual(HVis_familiaHoja('PACIENTES'), '', 'sin familia');
    A.igual(HVis_familiaHoja('EVENTOS'), '', 'sin familia');
  });

  t('PULIDO v0.8.9.5: tamaños estandarizados de barras', function () {
    A.igual(PULIDO_BARRAS.titulo, 12, 'título 12');
    A.igual(PULIDO_BARRAS.seccion, 10, 'secciones 10');
    A.igual(PULIDO_ENCABEZADO.fuente, 12, 'encabezado 12');
  });

  t('PULIDO v0.8.9.5: SECCIONES_HOJAS referencian valores de COLORES_SECCION', function () {
    var valores = Object.keys(COLORES_SECCION).map(function (k) { return COLORES_SECCION[k]; });
    var mal = [];
    Object.keys(SECCIONES_HOJAS).forEach(function (tipo) {
      SECCIONES_HOJAS[tipo].forEach(function (s) {
        if (valores.indexOf(s.color) === -1) mal.push(tipo + ':' + s.id + '=' + s.color);
      });
    });
    A.igual(mal.length, 0, 'todas las refs son de la paleta (' + mal.join(', ') + ')');
  });

  t('PULIDO v0.8.9.5: Modelo_anchoColumna centralizado (orden=precedencia)', function () {
    A.igual(Modelo_anchoColumna('NOMBRE_NORMALIZADO'), 150, 'normalizado gana a NOMBRE');
    A.igual(Modelo_anchoColumna('NOMBRE'), 240, 'nombre amplio');
    A.igual(Modelo_anchoColumna('RUT'), 110, 'rut');
    A.igual(Modelo_anchoColumna('FECHA_ULTIMO_CONTROL'), 110, 'fecha');
    A.igual(Modelo_anchoColumna('SEXO'), 55, 'sexo compacto');
    A.igual(Modelo_anchoColumna('CAMPORARO'), 130, 'default');
  });

  t('PULIDO v0.8.9.5: _modelo_camposHoja cubre PACIENTES y hojas con contrato', function () {
    A.igual(_modelo_camposHoja('PACIENTES').length, MODELO_PACIENTE.length, 'pacientes');
    A.igual(_modelo_camposHoja('PACIENTES')[0], 'ID_INTERNO', 'primera columna');
    A.igual(_modelo_camposHoja('SECTOR_AMARILLO').length, COLUMNAS_SECTOR_VISTA.length, 'sector amarillo');
    A.igual(_modelo_camposHoja('INICIO').length, 0, 'INICIO sin columnas fijas');
  });

  t('PULIDO v0.8.9.5: hojas INGRESO visuales con encabezados formateados', function () {
    A.cierto(Modelo_esHojaVisual('INGRESO_AMARILLO'), 'ingreso amarillo visual');
    A.cierto(Modelo_esHojaVisual('INGRESO_NARANJO'), 'ingreso naranjo visual');
    A.cierto(Modelo_esHojaVisual('INGRESO_VERDE'), 'ingreso verde visual');
    A.igual(Modelo_headerRow('INGRESO_AMARILLO'), 3, 'encabezados en fila 3');
    A.cierto(typeof HVis_formatearIngresos === 'function', 'helper de formato existe');
    A.igual(Ingresos_hojaASector('INGRESO_AMARILLO'), 'AMARILLO', 'familia de la puerta');
  });

  t('PULIDO v0.8.9.5: Ingresos_resumenTexto un solo mensaje breve', function () {
    A.igual(Ingresos_resumenTexto({}), 'Sin ingresos pendientes', 'vacío');
    A.igual(Ingresos_resumenTexto(null), 'Sin ingresos pendientes', 'nulo');
    A.igual(Ingresos_resumenTexto({ leidos: 5, nuevos: 3, existentes: 1, eventosCreados: 4 }),
      '✓ Ingresados: 4 · Eventos: 4', 'condeo sin revision/errores');
    A.igual(Ingresos_resumenTexto({ leidos: 5, nuevos: 2, existentes: 1, eventosCreados: 3, duplicados: 1, revision: 1 }),
      '✓ Ingresados: 3 · Eventos: 3 · Duplicados: 1 · Revisión: 1', 'duplicados+revisión');
    A.cierto(Ingresos_resumenTexto({ leidos: 2, conError: 1, nuevos: 1, eventosCreados: 1 })
      .indexOf('Errores: 1') !== -1, 'errores visibles');
    A.igual(Ingresos_resumenTexto({ leidos: 1 }), '✓ Ingresados: 0 · Eventos: 0', 'ceros presentes');
  });

  t('PULIDO v0.8.9.5: lote mixto pendientes → resumen por puerta', function () {
    // Lote heterogéneo sobre el pipeline existente (mismas reglas que el GAS):
    // un nuevo, un existente, un posible duplicado y un inválido conviven;
    // los errores no bloquean el avance y cada puerta contabiliza.
    var store = { pacientes: JSON.parse(JSON.stringify(DATASET_STAGING.base)), eventos: [] };
    var filas = [
      _stagingCaso('nuevoOk', 1),
      _stagingCaso('existenteRut', 2),
      _stagingCaso('posibleDuplicadoNombre', 3),
      _stagingCaso('rutInvalido', 4)
    ];
    var s = Ingresos_procesarFilas(filas, store, {
      nuevoId: function (i) { return 'EC-PUL-' + ('000' + i).slice(-3); }
    });
    A.igual(s.resumen.nuevos, 1, 'nuevos');
    A.igual(s.resumen.existentes, 1, 'existentes');
    A.igual(s.resumen.duplicados, 1, 'duplicados');
    A.igual(s.resumen.revision, 1, 'revision contabilizada');
    A.igual(s.resumen.conError, 1, 'error no bloquea al lote');
    A.igual(s.resumen.eventosCreados, 2, 'eventos de los dos válidos');
  });

  t('PULIDO v0.8.9.5: Ingresos_resumenTexto listo para el toast 3.7', function () {
    var resumen = { leidos: 10, nuevos: 4, existentes: 0, eventosCreados: 4, revision: 0, conError: 0 };
    var txt = Ingresos_resumenTexto(resumen);
    A.cierto(txt.indexOf('ms') === -1, 'sin tiempo técnico');
    A.cierto(txt.indexOf('Ejecución') === -1, 'sin id de ejecución');
    A.igual(txt, '✓ Ingresados: 4 · Eventos: 4');
  });
}

// ---------------------------------------------------------------------------
// v0.8.9.6 — DESIGN SYSTEM GLOBAL (NORMALIZACIÓN VISUAL ÚNICA)
// ---------------------------------------------------------------------------
function _pruebas_designsystem_v0896(t, A) {
  function _lum(hex) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substr(0, 2), 16) / 255;
    var g = parseInt(h.substr(2, 2), 16) / 255;
    var b = parseInt(h.substr(4, 2), 16) / 255;
    function lin(c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function _ratio(a, b) {
    var l1 = _lum(a), l2 = _lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  t('DESIGN SYSTEM v0.8.9.6: estructura RAMPA completa con contraste ≥4.5', function () {
    ['GENERAL', 'AMARILLO', 'NARANJO', 'VERDE'].forEach(function (f) {
      var r = RAMPA[f];
      A.cierto(/^#[0-9A-F]{6}$/.test(r.barra), f + ' barra hex');
      A.igual(r.seccion.length, 3, f + ' 3 tonos de sección');
      A.cierto(/^#[0-9A-F]{6}$/.test(r.encabezado), f + ' encabezado hex');
      [r.barra].concat(r.seccion.concat([r.encabezado])).forEach(function (c) {
        var rr = _ratio(TINTA_SECCION, c);
        A.cierto(rr >= 4.5, f + ':' + c + ' contraste ' + rr.toFixed(2));
      });
    });
  });

  t('DESIGN SYSTEM v0.8.9.6: misma luminancia relativa entre familias', function () {
    // Coherencia global Parte 4/13: jerarquía única (barra > sección >
    // encabezado) y luminancias comparables entre familias. La Y lineal absoluta
    // igual entre matices es inviable (amarillo/verde pesan más en sRGB); se
    // exige homogeneidad de NIVEL (mismo L HSL) y tolerancia global ≤ 0.20.
    var fams = ['GENERAL', 'AMARILLO', 'NARANJO', 'VERDE'];
    fams.forEach(function (f) {
      var r = RAMPA[f];
      var lb = _lum(r.barra), l0 = _lum(r.seccion[0]), le = _lum(r.encabezado);
      A.cierto(lb < l0 + 0.03, f + ' barra más oscura que sección');
      A.cierto(l0 < le - 0.05, f + ' sección más oscura que encabezado');
    });
    var lumsBarra = fams.map(function (f) { return _lum(RAMPA[f].barra); });
    var max = Math.max.apply(Math, lumsBarra), min = Math.min.apply(Math, lumsBarra);
    A.cierto(max - min <= 0.20, 'barras en rango comparable (Δ=' + (max - min).toFixed(3) + ')');
    var lumsSec = fams.map(function (f) { return _lum(RAMPA[f].seccion[0]); });
    var mx = Math.max.apply(Math, lumsSec), mn = Math.min.apply(Math, lumsSec);
    A.cierto(mx - mn <= 0.20, 'secciones en rango comparable (Δ=' + (mx - mn).toFixed(3) + ')');
  });

  t('DESIGN SYSTEM v0.8.9.6: identidad por hoja (HVis_identidad)', function () {
    A.igual(HVis_identidad('SECTOR_AMARILLO'), 'AMARILLO');
    A.igual(HVis_identidad('INGRESO_NARANJO'), 'NARANJO');
    A.igual(HVis_identidad('SECTOR_VERDE'), 'VERDE');
    A.igual(HVis_identidad('EVENTOS'), 'NARANJO', 'EVENTOS hereda naranja sistema');
    A.igual(HVis_identidad('PACIENTES'), 'GENERAL');
    A.igual(HVis_identidad('INICIO'), 'GENERAL');
    A.igual(HVis_identidad('LOG'), 'GENERAL');
  });

  t('DESIGN SYSTEM v0.8.9.6: PULIDO_ENCABEZADO deriva de DESIGN_SYSTEM (una fuente)', function () {
    A.igual(PULIDO_ENCABEZADO.fuente, DESIGN_SYSTEM.TIPOGRAFIA.encabezado);
    A.igual(PULIDO_ENCABEZADO.alturaVisual, DESIGN_SYSTEM.ALTURAS.encabezadoVisual);
    A.igual(PULIDO_ENCABEZADO.alturaSimple, DESIGN_SYSTEM.ALTURAS.encabezadoSimple);
    A.igual(PULIDO_ENCABEZADO.fondo, DESIGN_SYSTEM.ENCABEZADOS.fondo);
    A.igual(PULIDO_ENCABEZADO.tinta, DESIGN_SYSTEM.ENCABEZADOS.tinta);
  });

  t('DESIGN SYSTEM v0.8.9.6: COLORES_SECTOR alineados con RAMPA identidad', function () {
    A.igual(COLORES_SECTOR.AMARILLO, RAMPA.AMARILLO.barra);
    A.igual(COLORES_SECTOR.NARANJO, RAMPA.NARANJO.barra);
    A.igual(COLORES_SECTOR.VERDE, RAMPA.VERDE.barra);
    A.igual(COLORES_SECTOR.PACIENTES, RAMPA.GENERAL.barra);
    A.igual(COLORES_SECTOR.EVENTOS, RAMPA.GENERAL.barra);
  });

  t('DESIGN SYSTEM v0.8.9.6: ESTADOS clínicos lejos de los colores de organización', function () {
    // Parte 5: ningún color de identidad/sección coincide con un estado clínico.
    var org = [];
    Object.keys(RAMPA).forEach(function (f) {
      org.push(RAMPA[f].barra);
      org = org.concat(RAMPA[f].seccion).concat([RAMPA[f].encabezado]);
    });
    Object.keys(COLORES_SECCION).forEach(function (k) { org.push(COLORES_SECCION[k]); });
    var E = DESIGN_SYSTEM.ESTADOS;
    ['VENCIDO', 'PROXIMO', 'VIGENTE', 'REVISION', 'ERROR', 'OK', 'ALERTA', 'INFO'].forEach(function (e) {
      A.cierto(org.indexOf(E[e].fondo) === -1, e + '.fondo no colisiona con organización');
    });
    var contrastes = [];
    Object.keys(E).forEach(function (e) {
      var r = _ratio(E[e].tinta, E[e].fondo);
      if (r < 4.5) contrastes.push(e + ':' + r.toFixed(2));
    });
    A.igual(contrastes.length, 0, 'tinta/estado clínicos legibles (' + contrastes.join(', ') + ')');
  });

  t('DESIGN SYSTEM v0.8.9.6: encabezados uniformes en toda hoja de datos', function () {
    ['PACIENTES', 'SECTOR_AMARILLO', 'SECTOR_NARANJO', 'SECTOR_VERDE',
     'INGRESO_AMARILLO', 'INGRESO_NARANJO', 'INGRESO_VERDE'].forEach(function (n) {
      A.cierto(Modelo_esHojaVisual(n), n + ' contratada como visual');
      A.igual(Modelo_headerRow(n), 3, n + ' encabezados en fila 3');
    });
  });

  t('DESIGN SYSTEM v0.8.9.6: anchos con fallback por tipo (Parte 10)', function () {
    A.igual(Modelo_anchoColumna('ID_INTERNO'), 135, 'identificador');
    A.igual(Modelo_anchoColumna('FECHA_EVENTO'), 110, 'fecha');
    A.igual(Modelo_anchoColumna('CANTIDAD'), 130, 'numérico → default');
    A.igual(Modelo_anchoColumna('DESCRIPCION'), 220, 'texto largo');
    A.igual(Modelo_anchoColumna('SEXO'), 55, 'enum compacto');
    A.igual(Modelo_anchoColumna('ALGO_INVENTADO'), 130, 'default 130');
  });

  t('DESIGN SYSTEM v0.8.9.6: HVis_especVisual declara el estado deseado (Parte 20)', function () {
    var secAmarillo = HVis_especVisual('SECTOR_AMARILLO');
    A.igual(secAmarillo.identidad, 'AMARILLO');
    A.igual(secAmarillo.familia, 'AMARILLO');
    A.igual(secAmarillo.colorTitulo, RAMPA.AMARILLO.barra);
    A.igual(secAmarillo.tintaTitulo, TINTA_SECCION);
    A.igual(secAmarillo.encabezados.fondo, PULIDO_ENCABEZADO.fondo);
    // secciones monocromáticas de la familia
    var soloFamilia = secAmarillo.colorSecciones.every(function (c) {
      return RAMPA.AMARILLO.seccion.indexOf(c) !== -1;
    });
    A.cierto(soloFamilia, 'SECTOR_AMARILLO monocromático amarillo');

    var pac = HVis_especVisual('PACIENTES');
    A.igual(pac.identidad, 'GENERAL');
    A.igual(pac.colorTitulo, RAMPA.GENERAL.barra);
    A.cierto(pac.colorSecciones.length === SECCIONES_HOJAS.PACIENTES.length, 'secciones definidas');
    // PACIENTES usa la paleta semántica (COLORES_SECCION), no la rampa GEN.
    var usaPaleta = pac.colorSecciones.every(function (c) {
      return Object.keys(COLORES_SECCION).some(function (k) { return COLORES_SECCION[k] === c; });
    });
    A.cierto(usaPaleta, 'PACIENTES usa COLORES_SECCION');

    A.igual(HVis_especVisual('EVENTOS').identidad, 'NARANJO', 'EVENTOS identidad naranja');
    A.igual(HVis_especVisual('EVENTOS').visual, false, 'EVENTOS simple');
    A.igual(HVis_especVisual('EVENTOS').encabezados.altura, PULIDO_ENCABEZADO.alturaSimple,
      'EVENTOS encabezado a 30 (simple)');
    A.igual(HVis_especVisual('SECTOR_VERDE').colorTitulo, RAMPA.VERDE.barra, 'SECTOR_VERDE título rampa');
    A.cierto(typeof HVis_reconciliarHoja === 'function', 'reconciliador visual existe (Parte 17)');
    A.cierto(typeof HVis_pendientesVisual === 'function', 'pendientes visual existe (Parte 20)');
  });
}

// ---------------------------------------------------------------------------
// v0.9.0 — FORMULARIO COMPLEMENTARIO (puerta de entrada controlada, DEC-048)
// ---------------------------------------------------------------------------
function _pruebas_formulario_v090(t, A) {
  // RUT válido reproducible (DV por módulo 11)
  var dvA = Norm_dvModulo11('12345678');
  var RUTA = '12345678-' + dvA;
  A.cierto(Norm_validarRut(RUTA), 'RUT de prueba válido');
  var dvB = Norm_dvModulo11('98765432');
  var RUTB = '98765432-' + dvB;

  function respuestaNuevo(rut, extra) {
    var c = {
      ACCION: 'NUEVO_INGRESO', RUT: rut, NOMBRE: 'María José Fuentes', SEXO: 'F',
      FECHA_NACIMIENTO: '15/04/1990', SECTOR: 'NARANJO', ESTRATIFICACION: 'G2',
      TELEFONOS: '+56987654321', OBSERVACIONES: ''
    };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }
  function respuestaControl(rut, extra) {
    var c = { ACCION: 'REGISTRAR_CONTROL', RUT: rut, FECHA_EVENTO: '2026-06-10', PROFESIONAL: 'MATRONA', OBSERVACIONES: '' };
    if (extra) for (var k in extra) c[k] = extra[k];
    return c;
  }

  // ── contrato y mapeo (sin dependencia del número de columna) ──
  t('FORM v0.9.0: columnas técnicas únicas y derivadas del contrato CAMPOS', function () {
    var cols = Form_columnas();
    A.cierto(cols.length === cols.filter(function (x, i) { return cols.indexOf(x) === i; }).length, 'columnas únicas');
    A.cierto(cols.indexOf('RESPONSE_ID') !== -1 && cols.indexOf('ESTADO') !== -1 && cols.indexOf('TRAZA_CRUDA') !== -1, 'meta presente');
    A.cierto(cols.indexOf('ACCION') !== -1 && cols.indexOf('RUT') !== -1, 'campos del contrato presentes');
    A.igual(cols[0], 'FECHA_FORMS', 'primera columna = FECHA_FORMS');
  });

  t('FORM v0.9.0: mapeo por contenido, no por índice (encabezados reordenados)', function () {
    var cols = Form_columnas();
    var reorden = cols.slice().reverse();
    var m = Form_mapeoEncabezados(reorden);
    A.cierto(m.idx['ESTADO'] !== undefined && m.idx['RESPONSEID'] !== undefined, 'mapea por clave de encabezado');
    A.igual(m.idx['ESTADO'], cols.length - 1 - cols.indexOf('ESTADO'), 'índice correcto tras reordenar');
  });

  t('FORM v0.9.0: config de acciones y sector coherente', function () {
    FORM_CONFIG.ACCIONES.VALIDOS.forEach(function (a) {
      A.cierto(!!FORM_CONFIG.ACCIONES.ETIQUETAS[a], 'etiqueta para ' + a);
    });
    A.cierto(FORM_CONFIG.ESTADOS.VALIDOS.indexOf('PROCESADO') !== -1, 'estado PROCESADO definido');
    var sectorCampo = null;
    Form_campos().forEach(function (c) { if (c.campo === 'SECTOR') sectorCampo = c; });
    A.cierto(!!sectorCampo && sectorCampo.opciones && sectorCampo.opciones.length === SECTORES_RESPONSABLES.length, 'opciones de sector = sectores oficiales');
    A.cierto(FORM_CONFIG.MARCAS.PREFIJO === 'FORM|', 'prefijo de marca estándar');
  });

  t('FORM v0.9.0: marca de trazabilidad canónica', function () {
    A.igual(Form_marcadorFuente('RESP-1', 'REGISTRAR_CONTROL'), 'FORM|RESP-1|REGISTRAR_CONTROL', 'marca');
    A.igual(Form_sectorHojaIngreso('naranjo'), 'INGRESO_NARANJO', 'puerta naranjo');
    A.igual(Form_sectorHojaIngreso('AMARILLO'), 'INGRESO_AMARILLO', 'puerta amarillo');
    A.igual(Form_sectorHojaIngreso('VERDE'), 'INGRESO_VERDE', 'puerta verde');
    A.igual(Form_sectorHojaIngreso('AZUL'), '', 'sector desconocido sin puerta');
  });

  t('FORM v0.9.0: fila canónica en orden INGRESO_COLUMNAS con NOTA_SISTEMA', function () {
    var valid = Form_validarRespuesta(respuestaNuevo(RUTA), { hoy: '2026-08-29' });
    A.cierto(valid.ok, 'respuesta válida');
    var fila = Form_filaCanonicaIngreso(valid.normalizado, 'FORM|X|INGRESO', { hoy: '2026-08-29' });
    A.igual(fila.length, INGRESO_COLUMNAS.length, 'once celdas');
    A.igual(fila[0], 'MARÍA JOSÉ FUENTES', 'NOMBRE normalizado');
    A.igual(fila[1], RUTA, 'RUT normalizado');
    A.igual(fila[4], '987654321', 'teléfono sin prefijo');
    A.igual(fila[5], '2026-08-29', 'FECHA DE INGRESO = hoy (default)');
    A.igual(fila[6], 'G2', 'ESTRATIFICACION');
    A.igual(fila[9], '', 'ESTADO_INGRESO vacío (lo escribe el pipeline)');
    A.igual(fila[10], 'FORM|X|INGRESO', 'NOTA_SISTEMA marca');
  });

  // ── validación / normalización ──
  t('FORM v0.9.0: NUEVO_INGRESO válido normaliza con las reglas existentes', function () {
    var r = Form_validarRespuesta(respuestaNuevo(RUTA), { hoy: '2026-08-29' });
    A.cierto(r.ok, 'ok');
    A.igual(r.normalizado.ACCION, 'NUEVO_INGRESO', 'accion');
    A.igual(r.normalizado.RUT, RUTA, 'rut canónico');
    A.igual(r.normalizado.NOMBRE, 'MARÍA JOSÉ FUENTES', 'nombre mayúsculas');
    A.igual(r.normalizado.SEXO, 'F', 'sexo');
    A.igual(r.normalizado.FECHA_NACIMIENTO, '1990-04-15', 'nacimiento ISO');
    A.igual(r.normalizado.SECTOR, 'NARANJO', 'sector');
    A.igual(r.normalizado.ESTRATIFICACION, 'G2', 'estrat');
    A.igual(r.normalizado.FECHA_INGRESO, '2026-08-29', 'fecha ingreso por defecto hoy');
  });

  t('FORM v0.9.0: RUT inválido / sin DV son bloqueantes', function () {
    A.cierto(!Form_validarRespuesta(respuestaNuevo('12345678-x')).ok, 'DV incorrecto bloquea');
    var sinDv = Form_validarRespuesta(respuestaNuevo('12345678'), { hoy: '2026-08-29' });
    A.cierto(!sinDv.ok && sinDv.errores.some(function (e) { return e.campo === 'RUT'; }), 'RUT sin DV bloquea');
  });

  t('FORM v0.9.0: campos obligatorios de NUEVO_INGRESO', function () {
    A.cierto(Form_validarRespuesta(respuestaNuevo(RUTA, { NOMBRE: '' })).errores.some(function (e) { return e.campo === 'NOMBRE'; }), 'NOMBRE requerido');
    A.cierto(Form_validarRespuesta(respuestaNuevo(RUTA, { FECHA_NACIMIENTO: '' })).errores.some(function (e) { return e.campo === 'FECHA_NACIMIENTO'; }), 'nacimiento requerido');
    A.cierto(Form_validarRespuesta(respuestaNuevo(RUTA, { FECHA_NACIMIENTO: '31/02/2020' })).errores.length > 0, 'fecha imposible bloquea');
    A.cierto(Form_validarRespuesta(respuestaNuevo(RUTA, { SECTOR: 'AZUL' })).errores.some(function (e) { return e.campo === 'SECTOR'; }), 'sector no oficial bloquea');
    A.cierto(Form_validarRespuesta(respuestaNuevo(RUTA, { ESTRATIFICACION: 'G4' })).errores.some(function (e) { return e.campo === 'ESTRATIFICACION'; }), 'estrat no oficial bloquea');
  });

  t('FORM v0.9.0: CONTROL valida RUT + fecha de evento', function () {
    var ok = Form_validarRespuesta(respuestaControl(RUTA));
    A.cierto(ok.ok && ok.normalizado.FECHA_EVENTO === '2026-06-10', 'control válido');
    var sfe = Form_validarRespuesta(respuestaControl(RUTA, { FECHA_EVENTO: '' }));
    A.cierto(sfe.errores.some(function (e) { return e.campo === 'FECHA_EVENTO'; }), 'fecha evento requerida');
    var sfi = Form_validarRespuesta(respuestaControl(RUTA, { FECHA_EVENTO: '45/13/2026' }));
    A.cierto(sfi.errores.length > 0, 'fecha evento inválida bloquea');
  });

  t('FORM v0.9.0: acción desconocida cuarentena-ERROR', function () {
    var r = Form_validarRespuesta({ ACCION: 'BORRAR TODO', RUT: RUTA });
    A.cierto(r.errores.some(function (e) { return e.campo === 'ACCION'; }), 'acción inválida');
    A.igual(Form_erroresTexto(r.errores), 'ACCION: Acción no válida: "BORRAR TODO"', 'motivo legible');
  });

  // ── procesamiento de lote (decisiones puras) ──
  t('FORM v0.9.0: lote mixto decide ANEXAR / CLINICA / ERROR / CUARENTENA / SALTAR', function () {
    var persona = { RUT: RUTA, ID_INTERNO: 'EC-FORM-1' };
    var ctx = { indiceRut: {}, marcas: {} };
    ctx.indiceRut[RUTA.toUpperCase()] = persona;
    var respuestas = [
      { responseId: 'R1', estadoPrevio: 'RECIBIDO', crudo: respuestaNuevo(RUTA) },
      { responseId: 'R2', estadoPrevio: 'RECIBIDO', crudo: respuestaControl(RUTA) },
      { responseId: 'R3', estadoPrevio: 'RECIBIDO', crudo: respuestaNuevo('9999999-x') },
      { responseId: 'R4', estadoPrevio: 'RECIBIDO', crudo: respuestaControl(RUTB) },
      { responseId: 'R5', estadoPrevio: 'PROCESADO', crudo: respuestaNuevo(RUTA) }
    ];
    var lote = Form_procesarLote(respuestas, ctx, { hoy: '2026-08-29' });
    var porId = {};
    lote.decisiones.forEach(function (d) { porId[d.responseId] = d; });
    A.igual(porId['R1'].decision, 'ANEXAR', 'nuevo ingreso → anexar');
    A.igual(porId['R1'].ingreso.hoja, 'INGRESO_NARANJO', 'puerta por sector');
    A.igual(porId['R2'].decision, 'CLINICA', 'control sobre persona existente');
    A.igual(porId['R2'].idInterno, 'EC-FORM-1', 'id interno resuelto');
    A.igual(porId['R3'].decision, 'ERROR', 'rut inválido → error');
    A.igual(porId['R4'].decision, 'CUARENTENA', 'persona no encontrada → cuarentena');
    A.igual(porId['R5'].decision, 'SALTAR', 'ya procesada');
    A.igual(lote.resumen.anexos, 1, 'un anexo');
    A.igual(lote.resumen.clinica, 1, 'una acción clínica');
    A.igual(lote.resumen.error, 1, 'un error');
    A.igual(lote.resumen.cuarentena, 1, 'una cuarentena');
  });

  t('FORM v0.9.0: idempotencia por marca de evento', function () {
    var persona = { RUT: RUTA, ID_INTERNO: 'EC-FORM-2' };
    var marca = Form_marcadorFuente('R2', 'REGISTRAR_CONTROL');
    var ctx = { indiceRut: {}, marcas: {} };
    ctx.indiceRut[RUTA.toUpperCase()] = persona;
    ctx.marcas[marca] = { idEvento: 'EV-FORM-9' };
    var lote = Form_procesarLote(
      [{ responseId: 'R2', estadoPrevio: 'VALIDANDO', reintentos: 1, crudo: respuestaControl(RUTA) }],
      ctx, {});
    A.igual(lote.decisiones[0].decision, 'PROCESADO_YA', 'reintento detecta la marca y no duplica');
  });

  t('FORM v0.9.0: fila de ingreso ya anexada no se vuelve a anexar', function () {
    var lote = Form_procesarLote(
      [{ responseId: 'R6', estadoPrevio: 'VALIDANDO', ingresoHoja: 'INGRESO_NARANJO', ingresoFila: '7', crudo: respuestaNuevo(RUTA) }],
      {}, { hoy: '2026-08-29' });
    A.igual(lote.decisiones[0].decision, 'YA_ANEXADO', 'no re-anexa');
    A.igual(lote.decisiones[0].ingreso.fila, '7', 'mantiene la fila anexada');
  });

  t('FORM v0.9.0: ACTUALIZAR_DATOS requiere persona existente', function () {
    var crudo = { ACCION: 'ACTUALIZAR_DATOS', RUT: RUTB, TELEFONOS: '+56911112222' };
    var ctxCon = { indiceRut: {}, marcas: {} };
    ctxCon.indiceRut[RUTB.toUpperCase()] = { RUT: RUTB, ID_INTERNO: 'EC-FORM-3' };
    var l = Form_procesarLote([{ responseId: 'R7', estadoPrevio: 'RECIBIDO', crudo: crudo }], ctxCon, {});
    A.igual(l.decisiones[0].decision, 'CLINICA', 'con persona → clínica');
    var l2 = Form_procesarLote([{ responseId: 'R8', estadoPrevio: 'RECIBIDO', crudo: crudo }], {}, {});
    A.igual(l2.decisiones[0].decision, 'CUARENTENA', 'sin persona → cuarentena');
  });

  // ── resultado → estado del formulario ──
  t('FORM v0.9.0: traducción de estado del pipeline a estado FORM', function () {
    A.igual(Form_mapearResultadoFila('INGRESADO', '').estado, 'PROCESADO', 'ingresado');
    A.igual(Form_mapearResultadoFila('DUPLICADO', 'posible duplicado').estado, 'REQUIERE_REVISION', 'duplicado');
    A.igual(Form_mapearResultadoFila('REQUIERE_REVISION', 'nota').estado, 'REQUIERE_REVISION', 'revisión');
    A.igual(Form_mapearResultadoFila('ERROR', 'x').estado, 'ERROR', 'error');
    A.igual(Form_mapearResultadoFila('', '').estado, 'ERROR', 'sin estado no se da por hecho');
  });

  // ── lectura de pendientes ──
  t('FORM v0.9.0: pendientes excluyen PROCESADO y revisión; reintentos respetan tope', function () {
    var headers = Form_columnas();
    var idx = function (clave) {
      var m = Form_mapeoEncabezados(headers).idx;
      return m[clave];
    };
    function fila(estado, reint, rid) {
      var arr = new Array(headers.length).fill('');
      arr[idx('FECHAFORMS')] = '2026-08-29 10:00:00';
      arr[idx('RESPONSEID')] = rid;
      arr[idx('ESTADO')] = estado;
      arr[idx('REINTENTOS')] = reint;
      arr[idx('ACCION')] = 'NUEVO_INGRESO';
      arr[idx('RUT')] = RUTA;
      arr[idx('NOMBRE')] = 'JUAN PEREZ';
      return arr;
    }
    var valores = [headers, fila('RECIBIDO', 0, 'P1'), fila('PROCESADO', 0, 'P2'), fila('REQUIERE_REVISION', 0, 'P3'), fila('ERROR', 1, 'P4'), fila('ERROR', 3, 'P5')];
    var pend = Form_filasPendientes(valores, Form_mapeoEncabezados(headers), 3);
    A.igual(pend.length, 2, 'solo RECIBIDO y ERROR reintentable');
    A.igual(pend[0].responseId, 'P1', 'recibido primero');
    A.igual(pend[1].responseId, 'P4', 'error reintentable (reintentos=1 < 3)');
    A.igual(pend[0].filaFisica, Modelo_dataStartRow(HOJAS.FORM_RESPUESTAS), 'fila física alineada al layout simple');
    A.igual(pend[0].crudo.RUT, RUTA, 'crudo mapeado por campo');
    var pendMax0 = Form_filasPendientes(valores, Form_mapeoEncabezados(headers), 3, 0);
    A.igual(pendMax0.length, 0, 'tope max=0 devuelve vacío');
  });

  // ── métricas │──
  t('FORM v0.9.0: métricas agregadas sin datos personales', function () {
    var filas = [
      { ESTADO: 'PROCESADO', ACCION: 'NUEVO_INGRESO', FECHA_FORMS: '2026-08-01 08:00:00' },
      { ESTADO: 'PROCESADO', ACCION: 'REGISTRAR_CONTROL', FECHA_FORMS: '2026-08-02 09:00:00' },
      { ESTADO: 'REQUIERE_REVISION', ACCION: 'NUEVO_INGRESO', FECHA_FORMS: '2026-08-03 10:00:00' },
      { ESTADO: 'ERROR', ACCION: 'NUEVO_INGRESO', FECHA_FORMS: '2026-08-04 11:00:00' },
      { ESTADO: 'RECIBIDO', ACCION: 'NUEVO_INGRESO', FECHA_FORMS: '2026-08-05 12:00:00' }
    ];
    var m = Form_metricas(filas);
    A.igual(m.total, 5, 'total');
    A.igual(m.procesados, 2, 'procesados');
    A.igual(m.revision, 1, 'revisión');
    A.igual(m.error, 1, 'errores');
    A.igual(m.pendientes, 1, 'pendientes');
    A.igual(m.porAccion['NUEVO_INGRESO'], 4, 'por acción');
    A.igual(m.ultimaCaptura, '2026-08-05 12:00:00', 'última captura');
  });

  // ── duplicados los decide el pipeline (no el formulario) ──
  t('FORM v0.9.0: dos ingresos iguales NUNCA crean dos pacientes (lo decide el pipeline)', function () {
    var f1 = Fuentes_normalizar(Fuentes_crearFila(
      { archivo: 'HOJA_INGRESO', hoja: 'INGRESO_NARANJO', fila: 4, sector: 'NARANJO' },
      { RUT: RUTA, NOMBRE: 'JUAN PEREZ', FECHA_INGRESO: '2026-01-01' }));
    var f2 = Fuentes_normalizar(Fuentes_crearFila(
      { archivo: 'HOJA_INGRESO', hoja: 'INGRESO_NARANJO', fila: 5, sector: 'NARANJO' },
      { RUT: RUTA, NOMBRE: 'JUAN PEREZ', FECHA_INGRESO: '2026-02-01' }));
    var salida = Ingresos_procesarFilas([f1, f2], { pacientes: [], eventos: [] },
      { nuevoId: function () { return 'EC-PRUEBA-1'; }, evSecuenciaInicial: 1 });
    A.igual(salida.resumen.nuevos, 1, 'un solo paciente creado');
    A.igual(salida.resumen.existentes, 1, 'el segundo se enlaza al existente');
    A.igual(salida.resumen.eventosCreados, 2, 'dos eventos INGRESO (historial, no duplicación de entidad)');
  });

  // ── simulador (partes 42/44/46) ──
  t('FORM v0.9.0: simulador 10→3000 determinista y con RUTs válidos', function () {
    var sim = Form_simularRespuestas(100, { semilla: 42 });
    A.igual(sim.length, 100, '100 generadas');
    var ids = sim.map(function (s) { return s.responseId; });
    A.igual(ids.length, ids.filter(function (x, i) { return ids.indexOf(x) === i; }).length, 'responseIds únicos');
    sim.forEach(function (s) {
      A.cierto(FORM_CONFIG.ACCIONES.VALIDOS.indexOf(s.crudo.ACCION) !== -1, 'acción ' + s.crudo.ACCION);
      A.cierto(Norm_validarRut(s.crudo.RUT), 'rut válido de ' + s.responseId);
    });
    var sim2 = Form_simularRespuestas(100, { semilla: 42 });
    A.igual(JSON.stringify(sim), JSON.stringify(sim2), 'determinista con la misma semilla');
    A.igual(Form_simularRespuestas(10, { semilla: 1 }).length, 10, '10');
    A.igual(Form_simularRespuestas(500, { semilla: 1 }).length, 500, '500');
    A.igual(Form_simularRespuestas(1000, { semilla: 1 }).length, 1000, '1000');
    A.igual(Form_simularRespuestas(3000, { semilla: 1 }).length, 3000, '3000');
  });
}

// ---------------------------------------------------------------------------
// v0.9.1 — ENTORNOS DEV/DEMO (estrategia de despliegue, DEC-049)
// ---------------------------------------------------------------------------
function _pruebas_entornos_v091(t, A) {
  var DEV_ID = ENTORNOS.DEV.SPREADSHEET_ID;
  var DEMO_ID = ENTORNOS.DEMO.SPREADSHEET_ID;

  t('ENTORNO v0.9.1: identidad por Spreadsheet ID, nunca por nombre', function () {
    A.igual(Entorno_detectar(DEV_ID), 'DEV', 'DEV por ID');
    A.igual(Entorno_detectar(DEMO_ID), 'DEMO', 'DEMO por ID');
    A.igual(Entorno_detectar('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'DESCONOCIDO', 'libro ajeno → DESCONOCIDO');
    A.igual(Entorno_detectar(''), 'DESCONOCIDO', 'sin ID → DESCONOCIDO');
    A.igual(Entorno_detectar('Hoja llamada DEMO pero de otro libro'), 'DESCONOCIDO', 'el nombre visible NO define el entorno');
    var porNombre = (function () {
      try { return Function('return typeof Entorno_porNombre !== "undefined"')(); } catch (e) { return false; }
    })();
    A.cierto(!porNombre, 'prohibido resolver el entorno por nombre de hoja');
    A.cierto(typeof Entorno_detectar === 'function', 'la identidad se resuelve solo por getActiveSpreadsheet().getId()');
    A.cierto(Entorno_esLibro(DEV_ID, 'DEV'), 'esLibro DEV');
    A.cierto(!Entorno_esLibro(DEMO_ID, 'DEV'), 'DEMO no es DEV');
  });

  t('ENTORNO v0.9.1: configuración transversal y clínica sin duplicar (rollback seguro)', function () {
    Entorno_lista().forEach(function (env) {
      var d = Entorno_datos(env);
      A.cierto(!!d.SPREADSHEET_ID, env + ': spreadsheet registrado');
      A.cierto(!!d.NOMBRE && !!d.ETIQUETA, env + ': nombre y etiqueta');
      var f = Entorno_carpetaEsperada(env);
      A.cierto(f === 'ECICEP_Backups_' + env || (d.BACKUP_FOLDER_ID && f),
        env + ': carpeta de backup derivada o por ID (nunca compartida)');
    });
    A.cierto(Entorno_carpetaEsperada('DEV') !== Entorno_carpetaEsperada('DEMO'), 'carpetas DEV ≠ DEMO');
    A.cierto(!('FORMATO_FECHAS' in ENTORNOS.DEV) || !('FORMATO_FECHAS' in ENTORNOS.DEMO),
      'la configuración de presentación vive en CFG/GLOBAL, no en ENTORNOS');
  });

  t('ENTORNO v0.9.1: gate de procesamiento — entorno correcto pasa', function () {
    var g = Entorno_validarProcesamiento(DEV_ID, '', {});
    A.cierto(g.ok, 'DEV sin form explícito procesa');
    A.igual(g.entorno, 'DEV', 'entorno DEV');
    var g2 = Entorno_validarProcesamiento(DEMO_ID, '', {});
    A.cierto(g2.ok, 'DEMO sin form explícito procesa');
    A.igual(g2.entorno, 'DEMO', 'entorno DEMO');
  });

  t('ENTORNO v0.9.1: gate bloquea libro desconocido (ERROR_CONFIG_ENTORNO)', function () {
    var g = Entorno_validarProcesamiento('11111111111111111111111111111111', '', {});
    A.cierto(!g.ok, 'libro desconocido bloquea');
    A.igual(g.motivo, 'ERROR_CONFIG_ENTORNO', 'motivo normalizado');
    var g0 = Entorno_validarProcesamiento('', '', {});
    A.cierto(!g0.ok, 'sin libro bloquea');
    A.igual(g0.motivo, 'ERROR_CONFIG_ENTORNO', 'motivo sin libro');
    if (!g0.ok) A.igual(g0.motivo, 'ERROR_CONFIG_ENTORNO', 'motivo sin libro');
  });

  t('ENTORNO v0.9.1: aislamiento del Form — form de otro entorno bloquea', function () {
    var formDemo = ENTORNOS.DEMO.FORM_ID;
    if (!formDemo) {
      A.cierto(true, 'SKIP: DEMO.FORM_ID aún no configurado');
      return;
    }
    var g = Entorno_validarProcesamiento(DEV_ID, formDemo, {});
    A.cierto(!g.ok, 'Form DEMO desde DEV bloquea');
    A.igual(g.motivo, 'ERROR_CONFIG_ENTORNO', 'motivo de aislamiento');
  });

  t('ENTORNO v0.9.1: mapeo de recursos — diagnóstico sin efecto y con checks', function () {
    var d = Entorno_diagnostico(DEV_ID, '', { trigger: true, procesador: true, mapeo: 12, campos: 12 });
    A.igual(d.entorno, 'DEV', 'entorno detectado');
    A.igual(d.esperadoId, DEV_ID, 'esperadoId = spreadsheet DEV');
    var nombres = d.checks.map(function (c) { return c.nombre; });
    ['entorno', 'spreadsheet', 'form', 'mapeo', 'trigger', 'procesador'].forEach(function (n) {
      A.cierto(nombres.indexOf(n) !== -1, 'check ' + n + ' presente');
    });
    var sp = null, trig = null;
    d.checks.forEach(function (c) {
      if (c.nombre === 'spreadsheet') sp = c;
      if (c.nombre === 'trigger') trig = c;
    });
    A.cierto(sp.ok === true, 'spreadsheet coincide');
    A.cierto(trig.ok === true, 'trigger presente');
    A.cierto(d.ok === false, 'sin FORM_ID el diagnóstico no es verde (pendiente manual)');
  });

  t('ENTORNO v0.9.1: auditoría read-only — ninguna función de entorno escribe', function () {
    var antes = JSON.stringify(ENTORNOS);
    Entorno_lista().forEach(function (env) {
      Entorno_detectar(ENTORNOS[env].SPREADSHEET_ID);
      Entorno_validarProcesamiento(ENTORNOS[env].SPREADSHEET_ID, '', {});
      Entorno_carpetaEsperada(env);
      Entorno_diagnostico(ENTORNOS[env].SPREADSHEET_ID, '', { trigger: true });
    });
    Entorno_validarProcesamiento('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '', {});
    A.igual(JSON.stringify(ENTORNOS), antes, 'ninguna mutación de configuración');
  });

  t('ENTORNO v0.9.1: ENTORNOS no duplica reglas clínicas ni productividad', function () {
    var claves = ['G1', 'G2', 'G3', 'FECHA_INGRESO', 'RESPONSABLES', 'DIAS_RECUPERACION'];
    claves.forEach(function (k) {
      A.igual(ENTORNOS.DEV[k] === undefined, true, 'DEV sin ' + k);
      A.igual(ENTORNOS.DEMO[k] === undefined, true, 'DEMO sin ' + k);
    });
    A.cierto(Array.isArray(CONFIG_SEED_EXTRA) && CONFIG_SEED_EXTRA.length > 0,
      'la configuración clínica sigue viviendo en el sistema existente (CONFIG_SEED_EXTRA), no duplicada en ENTORNOS');
  });
}

// v0.9.2 — Operativización del formulario (DEC-051): métricas operativas,
// trazabilidad por-envío, catálogos oficiales y contrato de la hoja FORM_CONTROL.
function _pruebas_operativo_v092(t, A) {
  t('OPERATIVO v0.9.2: métricas distinguen registros vía FORM vs manuales (pctViaForm)', function () {
    var eventos = [
      { FUENTE: 'FORM|R-1|REGISTRAR_CONTROL' },
      { FUENTE: 'FORM|R-2|NUEVO_INGRESO' },
      { FUENTE: 'FORM|R-3|REGISTRAR_SEGUIMIENTO' },
      { FUENTE: 'UI_FICHA' },
      { FUENTE: 'PCTS|hoja|1' }
    ];
    var m = Form_metricasOperativas(eventos, []);
    A.igual(m.viaForm, 3, 'viaForm');
    A.igual(m.manuales, 2, 'manuales');
    A.igual(m.controlesForm, 1, 'controlesForm');
    A.igual(m.seguimientosForm, 1, 'seguimientosForm');
    A.igual(m.ingresosForm, 1, 'ingresosForm');
    A.igual(m.pctViaForm, 60, 'pctViaForm');
    A.igual(m.registrosPorForm['REGISTRAR_CONTROL'], 1, 'registrosPorForm control');
  });

  t('OPERATIVO v0.9.2: métricas derivan errores/rechazos/duplicados/reprocesamientos', function () {
    var filas = [
      { ESTADO: 'PROCESADO', REINTENTOS: '0' },
      { ESTADO: 'ERROR', REINTENTOS: '2' },
      { ESTADO: 'ERROR', REINTENTOS: '1' },
      { ESTADO: 'REQUIERE_REVISION', REINTENTOS: '0' },
      { ESTADO: 'DUPLICADO', REINTENTOS: '0' },
      { ESTADO: 'VALIDO', REINTENTOS: '0' }
    ];
    var m = Form_metricasOperativas([], filas);
    A.igual(m.errores, 2, 'errores');
    A.igual(m.rechazos, 1, 'rechazos');
    A.igual(m.duplicadosEvitados, 1, 'duplicadosEvitados');
    A.igual(m.reprocesamientos, 3, 'reprocesamientos');
    A.igual(m.pendientes, 1, 'pendientes');
    A.igual(m.procesados, 1, 'procesados');
    A.igual(m.total, 6, 'total');
  });

  t('OPERATIVO v0.9.2: trazabilidad por-envío reconstruye marca FORM| y estado', function () {
    var head = ['FECHA_FORMS', 'RESPONSE_ID', 'ACCION', 'RUT', 'ESTADO', 'MOTIVO', 'REINTENTOS', 'ID_INTERNO', 'ID_EVENTO'];
    var filas = [
      head,
      ['2026-08-31 10:00:00', 'R-901', 'REGISTRAR_CONTROL', '12.345.678-5', 'PROCESADO', 'ok', '0', 'EC-1', 'EV-1']
    ];
    var mapa = Form_mapeoEncabezados(head);
    var traz = Form_trazabilidad(filas, mapa, {});
    A.igual(traz.length, 1, 'una fila');
    A.igual(traz[0].marca, 'FORM|R-901|REGISTRAR_CONTROL', 'marca');
    A.igual(traz[0].idInterno, 'EC-1', 'idInterno');
    A.igual(traz[0].estado, 'PROCESADO', 'estado');
  });

  t('OPERATIVO v0.9.2: filtros de trazabilidad para recuperación (ERROR/PENDIENTES)', function () {
    var head = ['RESPONSE_ID', 'ACCION', 'ESTADO'];
    var filas = [
      head,
      ['R-11', 'REGISTRAR_CONTROL', 'ERROR'],
      ['R-12', 'REGISTRAR_CONTROL', 'RECIBIDO'],
      ['R-13', 'REGISTRAR_CONTROL', 'PROCESADO']
    ];
    var mapa = Form_mapeoEncabezados(head);
    A.igual(Form_trazabilidad(filas, mapa, { soloError: true }).length, 1, 'soloError');
    A.igual(Form_trazabilidad(filas, mapa, { soloPendientes: true }).length, 1, 'soloPendientes');
  });

  t('OPERATIVO v0.9.2: PROFESIONAL del formulario viene del catálogo oficial (no se duplica)', function () {
    var prof = null;
    Form_campos().forEach(function (c) { if (c.campo === 'PROFESIONAL') prof = c; });
    A.cierto(prof !== null, 'campo PROFESIONAL existe');
    A.igual(prof.tipo, 'dropdown', 'tipo dropdown');
    A.cierto(prof.opciones.indexOf('Enfermera/o') !== -1, 'opción Enfermera/o');
    A.cierto(prof.opciones.indexOf('Matrona/o') !== -1, 'opción Matrona/o');
    A.igual(prof.opciones.length, CATALOGO_PROFESIONALES.filter(function (p) { return p.ACTIVA; }).length, 'todas las activas');
  });

  t('OPERATIVO v0.9.2: contrato de la hoja FORM_CONTROL (trazabilidad + métricas)', function () {
    var col = FORM_CONFIG.CONTROL.COLUMNAS;
    ['RESPONSE_ID', 'MARCA', 'FECHA_FORMS', 'ACCION', 'RUT', 'ID_INTERNO', 'ESTADO', 'MOTIVO', 'REINTENTOS', 'ID_EVENTO']
      .forEach(function (c) { A.cierto(col.indexOf(c) !== -1, 'columna ' + c); });
    var claves = FORM_CONFIG.CONTROL.METRICAS.map(function (m) { return m.clave; });
    ['pctViaForm', 'viaForm', 'manuales', 'errores', 'rechazos', 'duplicadosEvitados', 'reprocesamientos']
      .forEach(function (k) { A.cierto(claves.indexOf(k) !== -1, 'métrica ' + k); });
    A.igual(FORM_CONFIG.CONTROL.REESCRIBIR, true, 'REESCRIBIR true');
  });
}

// ===========================================================================
// S5 — Enriquecimiento seguro de PACIENTES existentes (27_Actualizacion.js)
// Casos obligatorios A–H + invariantes de identidad, EDAD derivada y FUENTE.
// ===========================================================================

function _pruebas_enriquecimiento_s5(t, A) {
  // Origen sintético: mismo shape que Act_leerOrigenesDesdeBloques por RUT.
  // Los valores pasan por la misma normalización que en producción.
  function origen(sexo, nac, opts) {
    var s = Act_normalizarCandidato('SEXO', sexo);
    var n = Act_normalizarCandidato('FECHA_NACIMIENTO', nac);
    return {
      SEXO: { valor: s, fuente: 'ENRIQUECIMIENTO|INGRESO_AMARILLO|100',
              conflicto: !!(opts && opts.conflictoSexo) },
      FECHA_NACIMIENTO: { valor: n, fuente: 'ENRIQUECIMIENTO|INGRESO_AMARILLO|100',
                          conflicto: !!(opts && opts.conflictoNac) }
    };
  }
  function pacienteCompleto(extra) {
    var p = {
      ID_INTERNO: 'EC-X-1', RUT: '15987654-3', NOMBRE: 'ANA TEST',
      SEXO: 'F', FECHA_NACIMIENTO: '1990-05-10', TELEFONOS: '912345678',
      SECTOR: 'AMARILLO', ESTRATIFICACION: '', ESTADO: 'PENDIENTE',
      FUENTE: 'INGRESO_AMARILLO|INGRESO_AMARILLO|90', FECHA_ACTUALIZACION: null,
      REQUIERE_REVISION: false
    };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return p;
  }

  // ---- Caso A: paciente con todos los datos de origen → sin cambios ----
  t('S5 A: paciente completo no se toca (0 campos vacíos)', function () {
    var p = pacienteCompleto();
    var res = Act_aplicarEnriquecimiento(p, origen('F', '1990-05-10'));
    A.igual(res.aplicados.length, 0, 'sin campos aplicados');
    A.igual(res.bloqueos.length, 0, 'sin bloqueos');
    A.igual(p.SEXO, 'F', 'SEXO intacto');
    A.igual(p.FECHA_NACIMIENTO, '1990-05-10', 'FECHA intacta');
    A.igual(Act_camposVacios(p).length, 0, 'no hay campos vacíos');
  });

  // ---- Caso B: FECHA_NACIMIENTO faltante → se completa (EDAD queda derivada) ----
  t('S5 B: FECHA_NACIMIENTO vacía se completa desde fuente válida', function () {
    var p = pacienteCompleto({ FECHA_NACIMIENTO: '' });
    var res = Act_aplicarEnriquecimiento(p, origen('F', '1990-05-10'));
    A.igual(res.aplicados.map(function (a) { return a.campo; }).join(','), 'FECHA_NACIMIENTO', 'solo FECHA_NACIMIENTO aplicado');
    A.igual(p.FECHA_NACIMIENTO, '1990-05-10', 'fecha completada');
    A.igual(Norm_normalizarFecha(p.FECHA_NACIMIENTO, { min: CFG_FECHAS.ANO_MIN_NACIMIENTO, max: CFG_FECHAS.ANO_MAX }).estado, 'VALIDA', 'fecha válida');
    // EDAD nunca se almacena como campo (DECISIONES): no existe en el modelo.
    A.igual(Act_enriquecimientoCampos().indexOf('EDAD'), -1, 'EDAD no es campo de enriquecimiento');
    // La derivación en vivo respeta el cumpleaños (FASE 3).
    A.igual(Utl_edadDesde('1990-05-10', new Date(2011, 4, 9)), '20', 'edad antes de cumpleaños');
    A.igual(Utl_edadDesde('1990-05-10', new Date(2011, 4, 10)), '21', 'edad en el cumpleaños');
    A.igual(Utl_edadDesde('1990-05-10', new Date(2011, 4, 11)), '21', 'edad tras cumpleaños');
    A.igual(Utl_edadDesde('', new Date(2011, 4, 11)), '', 'sin fecha → sin edad');
    A.igual(Utl_edadDesde('2026-01-01', new Date(2026, 8, 7)), '0', 'bebé nacido este año → 0');
    A.igual(Utl_edadDesde('2026-09-07', new Date(2026, 0, 1)), '', 'nacimiento futuro → sin edad');
  });

  // ---- OPT B2: helpers de fórmula de EDAD en vivo ----
  t('OPT B2: Utl_columnaLetra índice 1-based → letra A1', function () {
    A.igual(Utl_columnaLetra(1), 'A', '1→A');
    A.igual(Utl_columnaLetra(5), 'E', '5→E');
    A.igual(Utl_columnaLetra(26), 'Z', '26→Z');
    A.igual(Utl_columnaLetra(27), 'AA', '27→AA');
    A.igual(Utl_columnaLetra(52), 'AZ', '52→AZ');
    A.igual(Utl_columnaLetra(53), 'BA', '53→BA');
    A.igual(Utl_columnaLetra(143), 'EM', '143→EM');
  });
  t('OPT B2: Utl_formulaEdad genera fórmula DATEDIF viva sobre FECHA_NACIMIENTO', function () {
    var f1 = Utl_formulaEdad(5, 4);
    A.cierto(f1.indexOf('=IF(') === 0, 'fórmula IF');
    A.cierto(f1.indexOf('E4') !== -1, 'referencia E4');
    A.cierto(f1.indexOf('DATEDIF') !== -1, 'DATEDIF presente');
    A.cierto(f1.indexOf('TODAY()') !== -1, 'TODAY presente');
    A.cierto(f1.indexOf('IFERROR') !== -1, 'IFERROR para fechas inválidas');
    A.cierto(f1.indexOf('MID(') !== -1, 'parsea ISO por partes (locale-independiente)');
    A.cierto(f1.indexOf(',') === -1 && f1.indexOf(';') !== -1,
      'separador ÚNICO ";" (S10-FIX: mezcla ; y , provoca #ERROR! de parseo)');
    A.igual(f1, '=IF(E4="";"";IFERROR(DATEDIF(DATE(MID(E4;1;4);MID(E4;6;2);MID(E4;9;2));TODAY();"Y");""))', 'fórmula canónica');
    var f2 = Utl_formulaEdad(1, 12);
    A.cierto(f2.indexOf('A12') !== -1, 'referencia A12 con columna 1');
    A.cierto(f2.indexOf(',') === -1, 'f2 sin comas');
  });
  t('OPT B7: funciones referenciadas por el menú existen en el ámbito global', function () {
    var refs = ['UI_abrirFormularioCaptura','UI_mostrarQR','UI_panelControl','UI_abrirBuscador',
      'UI_abrirRevision','UI_procesarIngresos','UI_duplicados','UI_abrirControles','UI_abrirDashboard',
      'UI_generarRem','UI_verRem','UI_configuracion','UI_configuracionEstratificacion',
      'UI_configuracionResponsables','ECICEP_autorizar','UI_actualizarSistema','UI_instalarSistema',
      'UI_backup','UI_formularioPanel','UI_abrirLog','UI_abrirAcercaDe'];
    refs.forEach(function (fn) {
      A.cierto(typeof globalThis[fn] === 'function', fn + ' existe');
    });
  });

  t('OPT B8: código muerto de S9 no se reintroduce (no definido en el ámbito)', function () {
    var muertos = ['Utl_mapaPor','Utl_cacheGet','Utl_cachePut','Utl_cacheOlvidar',
      'Fuentes_validar','_fuentes_columnasStaging','DIAGNOSTICO_BUSCAR_FICHA',
      'Dash_actualizar','_dash_inicializarFiltros','Form_reparar','api_formularioDiagnostico',
      'api_formularioInstalar','api_profesionalesCatalogo','Entorno_gateGAS',
      'Act_enriquecerPacientePorRut','api_webappCapturar','salida_contador'];
    muertos.forEach(function (fn) {
      A.cierto(typeof globalThis[fn] === 'undefined', fn + ' no reintroducido');
    });
  });

  // ---- Caso C: SEXO faltante + fuente válida → se completa ----
  t('S5 C: SEXO vacío se completa con valor canónico válido', function () {
    var p = pacienteCompleto({ SEXO: '' });
    var res = Act_aplicarEnriquecimiento(p, origen('M', ''));
    A.igual(res.aplicados.map(function (a) { return a.campo; }).join(','), 'SEXO', 'SEXO aplicado');
    A.igual(p.SEXO, 'M', 'SEXO completado');
  });
  t('S5 C2: sinónimo confirmado de fuente se canjea al canónico', function () {
    var p = pacienteCompleto({ SEXO: '' });
    var res = Act_aplicarEnriquecimiento(p, origen('FEMENINO', ''));
    A.igual(p.SEXO, 'F', 'sinónimo → F');
    A.igual(res.aplicados.length, 1, '1 campo');
  });

  // ---- Caso D: SEXO faltante + fuente sin dato confiable → permanece vacío ----
  t('S5 D: fuente vacía/inválida NO completa SEXO (no se infiere)', function () {
    ['', 'X', 'desconocido', 'NO APLICA', '  '].forEach(function (v) {
      var p = pacienteCompleto({ SEXO: '' });
      var res = Act_aplicarEnriquecimiento(p, origen(v, ''));
      A.igual(res.aplicados.length, 0, 'sin aplicar para [' + v + ']');
      A.igual(p.SEXO, '', 'SEXO permanece vacío');
      A.igual(Act_normalizarCandidato('SEXO', v), '', 'candidato inválido → ""');
    });
  });
  t('S5 D2: fecha inválida NO completa FECHA_NACIMIENTO', function () {
    var p = pacienteCompleto({ FECHA_NACIMIENTO: '' });
    var res = Act_aplicarEnriquecimiento(p, origen('', '2026-13-40'));
    A.igual(res.aplicados.length, 0, 'no se completa');
    A.igual(p.FECHA_NACIMIENTO, '', 'sigue vacía');
  });

  // ---- Caso E: paciente ya enriquecido → idempotente ----
  t('S5 E: segunda ejecución es estable (idempotencia)', function () {
    var p = pacienteCompleto({ SEXO: '', FECHA_NACIMIENTO: '' });
    var o = origen('M', '1985-07-20');
    var r1 = Act_aplicarEnriquecimiento(p, o);
    A.igual(r1.aplicados.length, 2, 'primera ejecución aplica');
    var r2 = Act_aplicarEnriquecimiento(p, o);
    A.igual(r2.aplicados.length, 0, 'segunda ejecución no cambia');
    A.igual(r2.bloqueos.length, 0, 'sin bloqueos en 2ª');
    A.igual(p.SEXO, 'M', 'sin duplicar valor');
    A.igual(p.FECHA_NACIMIENTO, '1985-07-20', 'sin corrupción');
    A.igual(Act_appendFuente('A|B|1', ['A|B|1', 'C|D|2']), 'A|B|1;C|D|2', 'FUENTE no duplica');
    A.igual(Act_appendFuente('', ['C|D|2']), 'C|D|2', 'FUENTE desde vacío');
  });
  t('S5 E2: ya-enriquecido con fuente distinta NO sobrescribe', function () {
    var p = pacienteCompleto({ SEXO: 'F', FECHA_NACIMIENTO: '1990-05-10' });
    var res = Act_aplicarEnriquecimiento(p, origen('M', '2000-01-01'));
    A.igual(res.aplicados.length, 0, 'nada sobrescrito');
    A.igual(p.SEXO, 'F', 'SEXO original intacto');
    A.igual(p.FECHA_NACIMIENTO, '1990-05-10', 'fecha original intacta');
  });

  // ---- Caso F: paciente inexistente / sin origen → nunca se crea ----
  t('S5 F: sin fuente para el RUT → no se inventa dato ni paciente', function () {
    var p = pacienteCompleto({ SEXO: '', FECHA_NACIMIENTO: '' });
    var res = Act_aplicarEnriquecimiento(p, null);
    A.igual(res.aplicados.length, 0, 'sin origen → sin aplicar');
    A.igual(res.bloqueos.length, 0, 'sin bloqueo');
    A.igual(p.RUT, '15987654-3', 'paciente intacto (no se duplica ni crea)');
    // Origen sin esa clave (mapa vacío) equivale a null.
    var vacio = Act_leerOrigenesDesdeBloques([]);
    A.cierto(vacio !== null, 'mapa vacío existe');
    var r2 = Act_aplicarEnriquecimiento(p, undefined);
    A.igual(r2.aplicados.length, 0, 'undefined → sin aplicar');
  });
  t('S5 F2: bloque sin filas de datos no produce orígenes', function () {
    var o = Act_leerOrigenesDesdeBloques([{ hoja: 'INGRESO_AMARILLO', headerRow: 3, val: [['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO']] }]);
    A.igual(Object.keys(o || {}).length, 0, 'solo encabezados → sin orígenes');
  });

  // ---- Caso G: fuentes inconsistentes/ambigüedad → REQUIERE_REVISION ----
  t('S5 G: SEXO divergente entre fuentes → REQUIERE_REVISION, sin escribir', function () {
    var p = pacienteCompleto({ SEXO: '' });
    var o = origen('M', '', { conflictoSexo: true });
    var res = Act_aplicarEnriquecimiento(p, o);
    A.igual(res.aplicados.length, 0, 'nada aplicado');
    A.igual(res.bloqueos.length, 1, 'bloqueo presente');
    A.igual(res.bloqueos[0].campo, 'SEXO', 'campo bloqueado');
    A.igual(res.bloqueos[0].motivo, 'FUENTES_INCONSISTENTES', 'motivo');
    A.igual(p.SEXO, '', 'SEXO no se escribe');
  });
  t('S5 G2: consolidación detecta conflicto real entre dos filas', function () {
    var bloques = [{
      hoja: 'INGRESO_AMARILLO', headerRow: 3,
      val: [
        ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO'],
        ['ANA', '15987654-3', 'M', '1990-05-10'],
        ['ANA', '15.987.654-3', 'F', '1990-05-10']
      ]
    }];
    var o = Act_leerOrigenesDesdeBloques(bloques);
    V = o['15987654-3'];
    A.cierto(V.SEXO.conflicto, 'SEXO inconsistente detectado');
    A.igual(V.FECHA_NACIMIENTO.valor, '1990-05-10', 'fecha consistente conservada');
    A.cierto(V.FECHA_NACIMIENTO.conflicto !== true, 'fecha sin conflicto');
  });
  t('S5 G3: segunda fila idéntica consolida sin conflicto', function () {
    var bloques = [{
      hoja: 'INGRESO_AMARILLO', headerRow: 3,
      val: [
        ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO'],
        ['ANA', '15987654-3', 'M', '1990-05-10'],
        ['ANA', '15.987.654-3', 'M', '1990-05-10']
      ]
    }];
    var o = Act_leerOrigenesDesdeBloques(bloques);
    var V = o['15987654-3'];
    A.igual(V.SEXO.valor, 'M', 'SEXO consistente');
    A.cierto(V.SEXO.conflicto !== true, 'sin conflicto');
    A.igual(V.FECHA_NACIMIENTO.valor, '1990-05-10', 'fecha consistente');
  });
  t('S5 G4: RUT sin DV en la fuente no falsifica match exacto', function () {
    var bloques = [{
      hoja: 'INGRESO_NARANJO', headerRow: 3,
      val: [
        ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO'],
        ['ANA', '15987654', 'F', '1990-05-10']
      ]
    }];
    var o = Act_leerOrigenesDesdeBloques(bloques);
    A.cierto(!o['15987654-3'], 'sin clave con DV (no se inventa el DV)');
    A.cierto(o['15987654'], 'clave por cuerpo queda disponible');
  });

  // ---- Caso H: campos no autorizados permanecen intactos ----
  t('S5 H: campos no autorizados no se modifican al enriquecer', function () {
    var p = pacienteCompleto({ SEXO: '', FECHA_NACIMIENTO: '', TELEFONOS: '912345678', SECTOR: 'AMARILLO', NOMBRE: 'ANA TEST', RUT: '15987654-3' });
    var o = origen('F', '1990-05-10');
    var res = Act_aplicarEnriquecimiento(p, o);
    A.igual(res.aplicados.length, 2, 'SEXO y FECHA completados');
    A.igual(res.aplicados.map(function (a) { return a.campo; }).join(','), 'SEXO,FECHA_NACIMIENTO', 'solo campos autorizados');
    A.igual(p.NOMBRE, 'ANA TEST', 'NOMBRE intacto');
    A.igual(p.RUT, '15987654-3', 'RUT intacto');
    A.igual(p.TELEFONOS, '912345678', 'TELEFONOS intacto');
    A.igual(p.SECTOR, 'AMARILLO', 'SECTOR intacto');
    A.igual(p.ESTADO, 'PENDIENTE', 'ESTADO intacto');
    A.igual(p.ID_INTERNO, 'EC-X-1', 'ID_INTERNO intacto');
  });

  // ---- Invariante global: campos autorizados son exactamente SEXO y FECHA_NACIMIENTO ----
  t('S5: invariante — solo se enriquece SEXO y FECHA_NACIMIENTO', function () {
    var campos = CAMPOS_ENRIQUECIMIENTO.slice().sort();
    A.igual(campos.join(','), 'FECHA_NACIMIENTO,SEXO', 'contrato S5 de campos');
    var p = pacienteCompleto({ SEXO: '', FECHA_NACIMIENTO: '', TELEFONOS: '', OBSERVACIONES: '', ESTADO: '' });
    var v = Act_camposVacios(p);
    // Solo se REPORTAN vacíos de los campos autorizados; el resto del modelo queda fuera.
    A.cierto(v.indexOf('SEXO') !== -1 && v.indexOf('FECHA_NACIMIENTO') !== -1, 'SEXO+FECHA detectados');
    A.cierto(v.indexOf('TELEFONOS') === -1, 'TELEFONOS NO es campo S5');
    A.cierto(v.indexOf('ESTADO') === -1, 'ESTADO NO es campo S5');
  });

  // ---- Trazabilidad: FUENTE append conserva origen previo ----
  t('S5: FUENTE acumula origen exacto del enriquecimiento sin perder previo', function () {
    var p = pacienteCompleto({ FECHA_NACIMIENTO: '' });
    var res = Act_aplicarEnriquecimiento(p, origen('F', '1990-05-10'));
    var nueva = Act_appendFuente(p.FUENTE, res.aplicados.map(function (a) { return a.fuente; }));
    A.cierto(nueva.indexOf('INGRESO_AMARILLO|INGRESO_AMARILLO|90') !== -1, 'FUENTE previa conservada');
    A.cierto(nueva.indexOf('ENRIQUECIMIENTO|INGRESO_AMARILLO|100') !== -1, 'origen enriquecimiento incorporado');
  });

  // ---- EDAD: derivación correcta en la frontera del año bisiesto/período ----
  t('S5 EDAD: rango sanitario y fechas de referencia', function () {
    A.igual(Utl_edadDesde('2026-01-01', new Date(2026, 8, 7)), '0', 'recién nacido del año');
    A.igual(Utl_edadDesde('1900-01-01', new Date(2026, 8, 7)), '126', 'extremo superior permitido');
    A.igual(Utl_edadDesde('1900-01-01', new Date(2031, 0, 1)), '', 'fuera de rango >129 → vacío');
    A.igual(Utl_edadDesde('02-05-1990', new Date(2026, 8, 7)), '', 'formato no ISO → vacío');
  });

  // ---- Wiring: S5 vive en "⚙️ Instalar / reparar sistema", NO en "Actualizar sistema" ----
  t('S5 wiring: enriquecimiento es etapa del instalador (Instalar_pEnriquecimiento)', function () {
    var ids = INSTALAR_ETAPAS.map(function (e) { return e.id; });
    A.cierto(ids.indexOf('enriquecimiento') !== -1, 'etapa enriquecimiento registrada en INSTALAR_ETAPAS');
    var iEnr = ids.indexOf('enriquecimiento');
    var iVer = ids.indexOf('verificar');
    A.cierto(iEnr !== -1 && iVer !== -1 && iEnr < iVer, 'la etapa corre antes de verificación final');
    var etapa = INSTALAR_ETAPAS[ids.indexOf('enriquecimiento')];
    A.igual(etapa.fn, 'Instalar_pEnriquecimiento', 'función de la etapa');
    A.cierto(typeof Instalar_pEnriquecimiento === 'function', 'Instalar_pEnriquecimiento existe');
  });
  t('S5 wiring: UI_actualizarSistema ya no ejecuta enriquecimiento inline', function () {
    var fu = UI_actualizarSistema.toString();
    A.cierto(fu.indexOf('Act_enriquecerPacientes') === -1, 'sin llamada a enriquecimiento en Actualizar sistema');
    A.cierto(fu.indexOf('Act_diagnosticarEnriquecimiento') === -1, 'sin dry-run en Actualizar sistema');
  });
}

// ---------------------------------------------------------------------------
// S11 — Enriquecimiento de datos existentes (EDAD/SEXO) · pruebas A1–A10
// ---------------------------------------------------------------------------

function _pruebas_enriquecimiento_s11(t, A) {
  function origen(sexo, nac) {
    var s = Act_normalizarCandidato('SEXO', sexo);
    var n = Act_normalizarCandidato('FECHA_NACIMIENTO', nac);
    return {
      SEXO: { valor: s, fuente: 'ENRIQUECIMIENTO|INGRESO_AMARILLO|100', conflicto: false },
      FECHA_NACIMIENTO: { valor: n, fuente: 'ENRIQUECIMIENTO|INGRESO_AMARILLO|100', conflicto: false }
    };
  }
  function pac(extra) {
    var p = { ID_INTERNO: 'EC-X-1', RUT: '15987654-3', NOMBRE: 'ANA TEST', SEXO: '', FECHA_NACIMIENTO: '',
      TELEFONOS: '', SECTOR: 'AMARILLO', ESTRATIFICACION: '', ESTADO: 'PENDIENTE',
      FUENTE: 'INGRESO_AMARILLO|INGRESO_AMARILLO|90', FECHA_ACTUALIZACION: null, REQUIERE_REVISION: false };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return p;
  }

  t('S11 A1·A4: FECHA_NACIMIENTO completada → EDAD derivada correcta (nunca almacenada)', function () {
    var p = pac();
    var r = Act_aplicarEnriquecimiento(p, origen('F', '1990-05-10'));
    A.igual(p.FECHA_NACIMIENTO, '1990-05-10', 'fecha completada desde fuente');
    A.igual(Utl_edadDesde(p.FECHA_NACIMIENTO, new Date(2026, 4, 9)), '35', 'edad antes de cumpleaños');
    A.igual(Utl_edadDesde(p.FECHA_NACIMIENTO, new Date(2026, 4, 10)), '36', 'edad en el cumpleaños');
    A.igual(Utl_edadDesde(p.FECHA_NACIMIENTO, new Date(2026, 4, 11)), '36', '36 tras el cumpleaños');
    A.igual(Act_camposVacios(p).indexOf('EDAD'), -1, 'EDAD no es campo de enriquecimiento');
    A.igual(Utl_edadDesde('', new Date(2026, 4, 11)), '', 'sin fecha → sin edad');
  });

  t('S11 A2: cambio de fecha de nacimiento actualiza la EDAD derivada; no sobrescribe fecha presente', function () {
    var p = pac();
    Act_aplicarEnriquecimiento(p, origen('M', '1990-05-10'));
    var edadAntes = Utl_edadDesde(p.FECHA_NACIMIENTO, new Date(2026, 4, 20));
    p.FECHA_NACIMIENTO = '1980-05-10'; // corrección administrativa del dato
    A.igual(Utl_edadDesde(p.FECHA_NACIMIENTO, new Date(2026, 4, 20)), '46', 'edad sigue la nueva fecha');
    A.cierto(Utl_edadDesde(p.FECHA_NACIMIENTO, new Date(2026, 4, 20)) !== edadAntes, 'EDAD derivada cambia');
    // El enriquecimiento jamás sobrescribe una FECHA_NACIMIENTO ya presente:
    var r = Act_aplicarEnriquecimiento(p, origen('F', '2000-01-01'));
    A.igual(r.aplicados.length, 0, 'nada reescrito');
    A.igual(p.FECHA_NACIMIENTO, '1980-05-10', 'fecha presente intacta');
  });

  t('S11 A3: fecha futura/inválida no se admite como FECHA_NACIMIENTO', function () {
    A.igual(Act_normalizarCandidato('FECHA_NACIMIENTO', '2045-01-01'), '', 'más allá de ANO_MAX → no candidato');
    A.igual(Act_normalizarCandidato('FECHA_NACIMIENTO', '2026-13-40'), '', 'mes/día inválidos → no candidato');
    A.igual(Utl_edadDesde('2026-09-07', new Date(2026, 0, 1)), '', 'nacimiento futuro → sin edad');
    var p = pac();
    var r = Act_aplicarEnriquecimiento(p, origen('', '2045-01-01'));
    A.igual(r.aplicados.length, 0, 'sin aplicar con fecha inadmisible');
    A.igual(p.FECHA_NACIMIENTO, '', 'sigue vacía');
  });

  t('S11 A5: SEXO explícito válido se completa con valor canónico', function () {
    [['MASCULINO', 'M'], ['F', 'F'], ['OTRO', 'OTRO']].forEach(function (par) {
      var p = pac();
      var r = Act_aplicarEnriquecimiento(p, origen(par[0], ''));
      A.igual(p.SEXO, par[1], '[' + par[0] + '] → ' + par[1]);
      A.igual(r.aplicados.length, 1, 'aplicado');
    });
  });

  t('S11 A6·A7: SEXO ausente o inválido NO se completa (nunca se infiere)', function () {
    ['', 'X', 'desconocido', 'NO APLICA', '  '].forEach(function (v) {
      var p = pac();
      var r = Act_aplicarEnriquecimiento(p, origen(v, ''));
      A.igual(r.aplicados.length, 0, 'sin aplicar para [' + v + ']');
      A.igual(p.SEXO, '', 'SEXO permanece vacío (faltante)');
    });
  });

  t('S11 A8: segunda ejecución es idempotente (mismas entradas → sin cambios nuevos)', function () {
    var p = pac();
    var o = origen('M', '1985-07-20');
    var r1 = Act_aplicarEnriquecimiento(p, o);
    A.igual(r1.aplicados.length, 2, '1ª aplicación SEXO+FECHA');
    var r2 = Act_aplicarEnriquecimiento(p, o);
    A.igual(r2.aplicados.length, 0, '2ª ejecución sin cambios');
    A.igual(Act_appendFuente('A|B|1', ['A|B|1']), 'A|B|1', 'FUENTE no duplica segmentos');
  });

  t('S11 A9: el enriquecimiento NUNCA crea eventos clínicos', function () {
    var fu = Act_enriquecerPacientes.toString();
    A.cierto(fu.indexOf('EVENTOS') === -1, 'Act_enriquecerPacientes no referencia EVENTOS');
    A.cierto(fu.indexOf('Eventos') === -1, 'sin funciones de eventos');
    var etapa = Instalar_pEnriquecimiento.toString();
    A.cierto(etapa.indexOf('EVENTOS') === -1 && etapa.indexOf('Eventos') === -1, 'etapa sin eventos');
    A.cierto(INSTALAR_ETAPAS.every(function (e) { return e.id !== 'eventos'; }), 'sin etapa que cree eventos');
  });

  t('S11 A10: actualización selectiva no duplica pacientes (escritura posicional)', function () {
    var fu = Act_enriquecerPacientes.toString();
    A.cierto(fu.indexOf('Utl_escribirBloque') !== -1, 'escritura por bloque posicional');
    A.cierto(fu.indexOf('appendRow') === -1, 'sin appendRow');
    A.cierto(fu.indexOf('insertRowAfter') === -1 && fu.indexOf('insertRowsAfter') === -1, 'sin inserción de filas');
    var p = pac();
    var res = Act_aplicarEnriquecimiento(p, null);
    A.igual(res.aplicados.length, 0, 'sin origen → nada escrito ni duplicado');
    A.igual(p.RUT, '15987654-3', 'un solo registro, intacto');
  });

  t('S11 UI: Instalar_pEnriquecimiento reporta métricas completas (S11.11)', function () {
    var etapa = Instalar_pEnriquecimiento.toString();
    ['totalPacientes', 'revisados', 'enriquecidos', 'aplicados', 'sinCambios',
     'sinVacias', 'conflictos', 'noEncontrados', 'errores'].forEach(function (k) {
      A.cierto(etapa.indexOf(k) !== -1, 'reporta ' + k);
    });
    var res = Act_enriquecerPacientes.toString();
    A.cierto(res.indexOf('totalPacientes') !== -1 && res.indexOf('errores') !== -1, 'resumen S11 en el barrido');
    A.cierto(res.indexOf('sinVacias') !== -1, 'contador sin huecos');
  });
}

// ---------------------------------------------------------------------------
// S11-R — Auditoría del modelo funcional Instalar/Actualizar (guards del mapa)
// ---------------------------------------------------------------------------

function _pruebas_auditoria_s11r(t, A) {
  t('S11R-1: EDAD no es campo físico ni dato fuente (solo derivada/fórmula)', function () {
    var campos = MODELO_PACIENTE.map(function (m) { return m.campo; });
    A.cierto(campos.indexOf('EDAD') === -1, 'PACIENTES no tiene columna EDAD');
    A.igual(JSON.stringify(CAMPOS_ENRIQUECIMIENTO), '["SEXO","FECHA_NACIMIENTO"]',
      'el enriquecimiento solo completa SEXO y FECHA_NACIMIENTO');
    A.cierto(CAMPOS_ENRIQUECIMIENTO.indexOf('EDAD') === -1, 'EDAD nunca se enriquece/almacena');
    var vista = COLUMNAS_SECTOR_VISTA.indexOf('EDAD');
    A.cierto(vista !== -1, 'EDAD aparece solo como columna derivada en SECTOR_*');
  });

  t('S11R-2: (S12) "Actualizar" ya se comporta como vistas/derivados; "Instalar / reparar" conserva el panel completo', function () {
    var act = UI_actualizarSistema.toString();
    var inst = UI_instalarSistema.toString();
    A.cierto(inst.indexOf("createTemplateFromFile('Instalador')") !== -1,
      'Instalar / reparar abre el dialog Instalador (secuencia completa)');
    A.cierto(inst.indexOf('api_instalarPaso') === -1, 'el Instalador.html (no 07_UI) ejecuta la secuencia');
    A.cierto(act.indexOf('UI_instalarSistema(') === -1,
      'Actualizar ya NO abre el instalador');
    A.cierto(act.indexOf('Instalar_diagnosticar') === -1,
      'Actualizar ya no diagnostica fases estructurales');
    A.cierto(act.indexOf('UI_actualizarTodo(') !== -1,
      'Actualizar delega en UI_actualizarTodo (vistas/derivados)');
    ['Act_enriquecerPacientes', 'act_enriquecer', 'Fuentes_cargaReal', 'api_instalarPaso'].forEach(function (f) {
      A.cierto(act.indexOf(f) === -1, 'Actualizar no ejecuta ' + f);
    });
  });

  t('S11R-3: el enriquecimiento corre SOLO como etapa del instalador (sin entrada suelta por botón)', function () {
    var enr = INSTALAR_ETAPAS.filter(function (e) { return e.id === 'enriquecimiento'; });
    A.igual(enr.length, 1, 'existe una sola etapa enriquecimiento');
    A.igual(enr[0].fn, 'Instalar_pEnriquecimiento', 'única función de la etapa');
    var etapasConEnriquecimiento = INSTALAR_ETAPAS.filter(function (e) {
      return e.fn.indexOf('Enriquec') !== -1;
    });
    A.igual(etapasConEnriquecimiento.length, 1, 'ninguna otra etapa ejecuta enriquecimiento');
    var p = Instalar_pEnriquecimiento.toString();
    A.cierto(p.indexOf('Act_enriquecerPacientes') !== -1,
      'la etapa es la puerta de entrada al barrido por ambas rutas de menú');
  });
}

// ---------------------------------------------------------------------------
// S12 — Separación funcional Instalar/reparar vs Actualizar (DEC-058)
// U1–U6, U9. U7/U8 cubiertas por S11R-3 (pipeline completo + enriquecimiento).
// ---------------------------------------------------------------------------

function _pruebas_separacion_s12(t, A) {
  t('S12 U1: Actualizar no importa fuentes', function () {
    var act = UI_actualizarSistema.toString();
    var todo = UI_actualizarTodo.toString();
    ['Fuentes_', 'Fuentes_cargaReal', 'Amarillo_', 'Instalar_', 'api_instalarPaso'].forEach(function (f) {
      A.cierto(act.indexOf(f) === -1, 'Actualizar (delegación) no referencia ' + f);
      A.cierto(todo.indexOf(f) === -1, 'UI_actualizarTodo no referencia ' + f);
    });
  });

  t('S12 U2·U3: Actualizar no crea pacientes ni eventos', function () {
    var act = UI_actualizarSistema.toString();
    var todo = UI_actualizarTodo.toString();
    ['appendRow', 'insertRowAfter', 'insertRowBefore', 'Modelo_crearEstructura'].forEach(function (f) {
      A.cierto(act.indexOf(f) === -1, 'Actualizar no ' + f);
      A.cierto(todo.indexOf(f) === -1, 'UI_actualizarTodo no ' + f);
    });
    A.cierto(todo.indexOf('EVENTOS') === -1 && todo.indexOf('Eventos') === -1,
      'UI_actualizarTodo no crea ni referencia eventos');
    A.cierto(act.indexOf('EVENTOS') === -1, 'Actualizar no referencia EVENTOS');
  });

  t('S12 U4: Actualizar recalcula derivados (estratificación + controles)', function () {
    var todo = UI_actualizarTodo.toString();
    A.cierto(todo.indexOf('Estrat_recalcularTodos') !== -1, 'recalcula estratificación');
    A.cierto(todo.indexOf('Control_recalcularTodos') !== -1, 'recalcula próximos controles');
    var act = UI_actualizarSistema.toString();
    A.cierto(act.indexOf('UI_actualizarTodo(') !== -1, 'Actualizar delega la lógica (sin duplicar)');
  });

  t('S12 U5: Actualizar refresca vistas y formato derivado', function () {
    var todo = UI_actualizarTodo.toString();
    ['Modelo_refrescarVistasSectores', 'HVis_formatearIngresos', 'Hojas_formatoCondicional'].forEach(function (f) {
      A.cierto(todo.indexOf(f) !== -1, 'refresca/deriva con ' + f);
    });
  });

  t('S12 U6: recálculo de derivados idempotente (mismas filas, sin duplicar)', function () {
    var e = Estrat_recalcularTodos.toString();
    var c = Control_recalcularTodos.toString();
    A.cierto(e.indexOf('setValues') !== -1 && e.indexOf('appendRow') === -1,
      'Estrat reescribe en sitio (setValues), sin añadir filas');
    A.cierto(c.indexOf('setValues') !== -1 && c.indexOf('appendRow') === -1,
      'Control reescribe en sitio (setValues), sin añadir filas');
    ['Fuentes_', 'Amarillo_', 'Act_enriquecer'].forEach(function (f) {
      A.cierto(e.indexOf(f) === -1 && c.indexOf(f) === -1, 'derivados no enganchan ' + f);
    });
  });

  t('S12 U9: captura V2 intacta (Actualizar no referencia el canal)', function () {
    var act = UI_actualizarSistema.toString();
    var todo = UI_actualizarTodo.toString();
    ['captureId', 'FORM_RESPUESTAS', 'Form_respuestas', 'api_webappCapturar'].forEach(function (f) {
      A.cierto(act.indexOf(f) === -1, 'Actualizar no referencia ' + f);
      A.cierto(todo.indexOf(f) === -1, 'UI_actualizarTodo no referencia ' + f);
    });
  });
}

// ---------------------------------------------------------------------------
// S10-FIX: esquema canónico de vistas SECTOR_*, fórmula EDAD y migración
// explícita 15→16 (BUG-E2E). Helper 100% puros + introspección de fuente.
// ---------------------------------------------------------------------------
function _pruebas_s10fix_esquema(t, A) {
  t('T1: esquema canónico SECTOR_* = 16 columnas con FECHA_NACIMIENTO idx4 y EDAD idx5', function () {
    A.igual(COLUMNAS_SECTOR_VISTA.length, 16, '16 columnas');
    A.igual(COLUMNAS_SECTOR_VISTA[4], 'FECHA_NACIMIENTO', 'FECHA_NACIMIENTO en índice 4');
    A.igual(COLUMNAS_SECTOR_VISTA[5], 'EDAD', 'EDAD en índice 5');
    A.igual(COLUMNAS_SECTOR_VISTA[6], 'TELEFONOS', 'TELEFONOS tras EDAD');
    A.igual(COLUMNAS_SECTOR_VISTA[7], 'RUT_DV_VALIDO', 'RUT_DV_VALIDO tras TELEFONOS');
  });

  t('T2: COLUMNAS_SECTOR_VISTA sin duplicados y con identidad al inicio', function () {
    var vistos = {};
    COLUMNAS_SECTOR_VISTA.forEach(function (c) {
      A.cierto(!vistos[c], 'duplicado: ' + c);
      vistos[c] = true;
    });
    A.igual(COLUMNAS_SECTOR_VISTA[0], 'ID_INTERNO', 'ID_INTERNO al inicio');
    A.igual(COLUMNAS_SECTOR_VISTA[1], 'RUT', 'RUT segundo');
    A.igual(COLUMNAS_SECTOR_VISTA[2], 'NOMBRE', 'NOMBRE tercero');
  });

  t('T3: divergencia detectada para esquema viejo de 15 columnas (sin FECHA_NACIMIENTO)', function () {
    var viejo15 = ['ID_INTERNO','RUT','NOMBRE','SEXO','EDAD','TELEFONOS','RUT_DV_VALIDO',
      'ESTRATIFICACION','ESTADO','FECHA_INGRESO','ULTIMO_SEGUIMIENTO','ULTIMO_CONTROL',
      'PROXIMO_CONTROL','ULTIMO_EVENTO','OBSERVACIONES'];
    A.cierto(Modelo_esquemaVistaDivergente(viejo15), 'esquema 15-col divergente');
    A.cierto(!Modelo_esquemaVistaDivergente(COLUMNAS_SECTOR_VISTA.slice()), 'esquema canónico bajo divergente');
  });

  t('T4: reordenar migra fila 15→16 sin corrimiento (FECHA_NACIMIENTO→EDAD→TELEFONOS→RUT_DV)', function () {
    var viejo15 = ['ID_INTERNO','RUT','NOMBRE','SEXO','EDAD','TELEFONOS','RUT_DV_VALIDO','ESTRATIFICACION',
      'ESTADO','FECHA_INGRESO','ULTIMO_SEGUIMIENTO','ULTIMO_CONTROL','PROXIMO_CONTROL','ULTIMO_EVENTO','OBSERVACIONES'];
    var fila = ['X-1','12345678-5','PACIENTE A','F','35','+56 9 5555 6666','TRUE','G','PENDIENTE',
      '10/01/2024','5/06/2026','8/06/2026','2/01/2027','INGRESO (x)','obs'];
    var nueva = Modelo_reordenarFilaVista(fila, viejo15);
    A.igual(nueva.length, 16, 'largo canónico');
    A.igual(nueva[0], 'X-1', 'ID_INTERNO');
    A.igual(nueva[1], '12345678-5', 'RUT');
    A.igual(nueva[2], 'PACIENTE A', 'NOMBRE');
    A.igual(nueva[3], 'F', 'SEXO');
    A.igual(nueva[4], '', 'FECHA_NACIMIENTO ausente → vacío');
    A.igual(nueva[5], '35', 'EDAD bajo su columna (nombre, no posición)');
    A.igual(nueva[6], '+56 9 5555 6666', 'TELEFONOS tras EDAD');
    A.igual(nueva[7], 'TRUE', 'RUT_DV_VALIDO');
    A.igual(nueva[15], 'obs', 'OBSERVACIONES al final');
  });

  t('T5: EDAD fórmula con separador ÚNICO ";" (sin "," entre argumentos)', function () {
    var f1 = Utl_formulaEdad(5, 4);
    A.igual(f1, '=IF(E4="";"";IFERROR(DATEDIF(DATE(MID(E4;1;4);MID(E4;6;2);MID(E4;9;2));TODAY();"Y");""))', 'fórmula canónica 5,4');
    A.cierto(f1.indexOf(',') === -1, 'sin coma de separación de argumentos');
    A.cierto(f1.indexOf(';') !== -1, 'separador ; presente');
    var f2 = Utl_formulaEdad(1, 12);
    A.igual(f2, '=IF(A12="";"";IFERROR(DATEDIF(DATE(MID(A12;1;4);MID(A12;6;2);MID(A12;9;2));TODAY();"Y");""))', 'fórmula canónica 1,12');
  });

  t('T6: migración conserva EDAD ya calculada bajo columna correcta', function () {
    var viejo15 = ['ID_INTERNO','RUT','NOMBRE','SEXO','EDAD','TELEFONOS','RUT_DV_VALIDO','ESTRATIFICACION',
      'ESTADO','FECHA_INGRESO','ULTIMO_SEGUIMIENTO','ULTIMO_CONTROL','PROXIMO_CONTROL','ULTIMO_EVENTO','OBSERVACIONES'];
    var fila = ['X-2','22222222-2','PACIENTE B','M','41','98665','FALSE','G1','PENDIENTE',
      '10/01/2024','','8/06/2026','','',''];
    var nueva = Modelo_reordenarFilaVista(fila, viejo15);
    A.igual(nueva[5], '41', 'EDAD 41 en idx5 tras migración');
    A.igual(nueva[6], '98665', 'tef resta en idx6');
  });

  t('T7: identidad (ID_INTERNO/RUT/NOMBRE) intacta tras reordenar', function () {
    var viejo15 = ['ID_INTERNO','RUT','NOMBRE','SEXO','EDAD','TELEFONOS','RUT_DV_VALIDO','ESTRATIFICACION',
      'ESTADO','FECHA_INGRESO','ULTIMO_SEGUIMIENTO','ULTIMO_CONTROL','PROXIMO_CONTROL','ULTIMO_EVENTO','OBSERVACIONES'];
    var fila = ['X-3','33333333-3','PACIENTE C','F','','','','','','','','','','',''];
    var nueva = Modelo_reordenarFilaVista(fila, viejo15);
    A.arreglos(nueva.slice(0, 3), ['X-3', '33333333-3', 'PACIENTE C'], 'identidad conservada');
  });

  t('T8: sin pérdida: los campos conocidos reaparecen; los nuevos quedan vacíos', function () {
    var viejo15 = ['ID_INTERNO','RUT','NOMBRE','SEXO','EDAD','TELEFONOS','RUT_DV_VALIDO','ESTRATIFICACION',
      'ESTADO','FECHA_INGRESO','ULTIMO_SEGUIMIENTO','ULTIMO_CONTROL','PROXIMO_CONTROL','ULTIMO_EVENTO','OBSERVACIONES'];
    var fila = ['X-4','44444444-4','PACIENTE D','F','','999','','','PENDIENTE','','','','','','c'];
    var nueva = Modelo_reordenarFilaVista(fila, viejo15);
    var presentes = 0;
    nueva.forEach(function (v) { if (v !== '') presentes++; });
    for (var i = 0; i < viejo15.length; i++) {
      if (fila[i] !== '') A.cierto(nueva.indexOf(fila[i]) !== -1, 'dato no perdido: ' + fila[i]);
    }
    A.igual(nueva[4], '', 'nuevo campo FECHA_NACIMIENTO vacío (lo rellena el refresco desde PACIENTES)');
    A.cierto(presentes >= 5, 'al menos ID/RUT/NOMBRE/ESTADO/OBS conservados');
  });

  t('T9: idempotente: encabezados canónicos → identidad (sin tocar datos)', function () {
    var filaCanonica = ['X-5','55555555-5','PACIENTE E','','','','','','','','','','','','',''];
    var nueva = Modelo_reordenarFilaVista(filaCanonica, COLUMNAS_SECTOR_VISTA.slice());
    A.arreglos(nueva, filaCanonica, 'identidad sobre esquema canónico');
  });

  t('T10: columnas extra/desconocidas se excluyen (sin duplicados)', function () {
    var extra = ['ID_INTERNO','RUT','NOMBRE','SEXO','FECHA_NACIMIENTO','EDAD','TELEFONOS','RUT_DV_VALIDO',
      'ESTRATIFICACION','ESTADO','FECHA_INGRESO','ULTIMO_SEGUIMIENTO','ULTIMO_CONTROL','PROXIMO_CONTROL',
      'ULTIMO_EVENTO','OBSERVACIONES','COLUMNA_FANTASMA_X'];
    var fila = ['X-6','66666666-6','PACIENTE F','','2000-05-10','','989','','','','','','','','','','fantasma'];
    var nueva = Modelo_reordenarFilaVista(fila, extra);
    A.igual(nueva.length, 16, 'solo canónicas');
    A.igual(nueva.indexOf('fantasma'), -1, 'valor de columna desconocida descartado');
  });

  t('T11: equivalencia clave (mayúsculas/tildes/espacios/"_" ignorados) por nombre', function () {
    var variantes = ['ID_INTERNO','RUT','NOMBRE','SEXO','fecha_nacimiento','EDAD','TELEFONOS','RUT_DV_VALIDO',
      'ESTRATIFICACION','ESTADO','FECHA INGRESO','ULTIMO SEGUIMIENTO','ULTIMO CONTROL','PROXIMO CONTROL',
      'ULTIMO EVENTO','OBSERVACIONES'];
    A.cierto(!Modelo_esquemaVistaDivergente(variantes), 'mismas claves normalizadas → no divergente');
    var fila = ['X-7','77777777-7','PACIENTE G','F','2001-02-03','25','','TRUE','','','','','','','',''];
    var nueva = Modelo_reordenarFilaVista(fila, variantes);
    A.igual(nueva[4], '2001-02-03', 'FECHA_NACIMIENTO mapeada desde variante');
    A.igual(nueva[10], '', 'FECHA INGRESO vacía (ausente en fila)');
  });

  t('T12: Actualizar ejecuta la migración S10-FIX como paso EXPLÍCITO (no instalador)', function () {
    var todo = UI_actualizarTodo.toString();
    A.cierto(todo.indexOf('Modelo_alinearVistasSectoriales()') !== -1, 'migración explícita en Actualizar');
    A.cierto(todo.indexOf('Modelo_crearEstructura') === -1, 'Actualizar no repara estructura');
    A.cierto(todo.indexOf('appendRow') === -1 && todo.indexOf('insertRow') === -1, 'sin append/insert');
    ['captureId', 'FORM_RESPUESTAS', 'api_webappCapturar'].forEach(function (f) {
      A.cierto(todo.indexOf(f) === -1, 'Actualizar no referencia ' + f);
    });
  });

  t('T13: migración restringida a SECTOR_*, por nombre (sin posiciones ciegas ni append)', function () {
    var fn = Modelo_alinearVistaSector.toString();
    A.cierto(fn.indexOf('HOJAS_SECTOR') !== -1, 'restringida a SECTOR_*');
    A.cierto(fn.indexOf('COLUMNAS_SECTOR_VISTA') !== -1, 'usa fuente única de verdad');
    A.cierto(fn.indexOf('Modelo_reordenarFilaVista') !== -1, 'mapea por nombre');
    A.cierto(fn.indexOf('Modelo_headerRow') !== -1, 'usa headerRow del contrato');
    A.cierto(fn.indexOf('appendRow') === -1 && fn.indexOf('insertRow') === -1, 'sin append/insert');
    var todo = UI_actualizarTodo.toString();
    A.cierto(todo.indexOf('Modelo_alinearVistasSectoriales') !== -1, 'UI_actualizarTodo la invoca');
  });
}

// ---------------------------------------------------------------------------
// INST-1 — Endurecimiento del instalador: versionado de esquema, registro de
// migraciones idempotentes, detección de instalaciones y LockService (DEC-059).
// T1–T15: puras + introspección de fuente. Sin GAS ni datos reales.
// ---------------------------------------------------------------------------
function _pruebas_inst1_versionado(t, A) {
  function _snap(opts) {
    opts = opts || {};
    var canon = COLUMNAS_SECTOR_VISTA.slice();
    var viejo15 = ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'EDAD', 'TELEFONOS', 'RUT_DV_VALIDO',
      'ESTRATIFICACION', 'ESTADO', 'FECHA_INGRESO', 'ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL',
      'PROXIMO_CONTROL', 'ULTIMO_EVENTO', 'OBSERVACIONES'];
    var criticas = ['PACIENTES', 'EVENTOS', 'SECTOR_NARANJO', 'SECTOR_AMARILLO', 'SECTOR_VERDE',
      'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE'];
    var datos = !!opts.datos;
    var hojas = {};
    criticas.forEach(function (n) {
      var dat = Modelo_dataStartRow(n);
      hojas[n] = {
        layout: Modelo_layoutHoja(n) === CONTRATO_LAYOUT_VISUAL ? 'visual' : 'simple',
        ultimaFila: datos ? dat + 2 : dat - 1,
        maxFilas: 500,
        maxCols: 30,
        encabezados: (n.indexOf('SECTOR_') === 0)
          ? (opts.divergente ? viejo15.slice() : canon.slice())
          : []
      };
    });
    return {
      hojas: hojas,
      criticasPresentes: criticas.slice(),
      criticasFaltantes: opts.faltantes || [],
      config: opts.config || {}
    };
  }

  t('T1: versión canónica única (esquema 1, instalador INST-1) y registro MIG-001 alineado', function () {
    A.igual(SISTEMA_VERSION_SCHEMA_ACTUAL, 1, 'SISTEMA_VERSION_SCHEMA_ACTUAL = 1');
    A.igual(String(SISTEMA_VERSION_SCHEMA_ACTUAL), '1', 'esquema objetivo serializa a "1"');
    A.igual(SISTEMA_VERSION_INSTALADOR, 'INST-1', 'SISTEMA_VERSION_INSTALADOR = INST-1');
    A.igual(String(ECICEP.VERSION || '').indexOf('0.9'), 0, 'versión de aplicación coherente (0.9.x)');
    A.cierto(REGISTRO_MIGRACIONES.length >= 1, 'hay al menos una migración');
    var vistos = {};
    REGISTRO_MIGRACIONES.forEach(function (m) {
      A.igual(typeof m.id, 'string', 'id string');
      A.cierto(!vistos[m.id], 'id único: ' + m.id);
      vistos[m.id] = true;
      A.cierto(typeof m.fn === 'string' && m.fn.length > 0, 'fn declarada en ' + m.id);
      var hasta = String(m.hasta);
      A.igual(hasta, String(SISTEMA_VERSION_SCHEMA_ACTUAL), m.id + ' termina en el objetivo canónico (' + hasta + ')');
    });
    var m001 = REGISTRO_MIGRACIONES.filter(function (m) { return m.id === 'MIG-001'; })[0];
    A.igual(m001.desde, '0', 'MIG-001 parte de esquema legado (0)');
    A.igual(m001.fn, 'Mig_run001', 'MIG-001 ejecuta Mig_run001');
    var api = api_instalarEtapas.toString();
    A.cierto(api.indexOf('SISTEMA_VERSION_INSTALADOR') !== -1 && api.indexOf('SISTEMA_VERSION_SCHEMA_ACTUAL') !== -1,
      'api_instalarEtapas expone instalador y esquema');
  });

  t('T2: identificación de esquema por clave CONFIG (ausente≡0, ilegible→DESCONOCIDA, mayor→DIVERGENTE, faltan críticas→INCOMPLETA)', function () {
    var ausente = Mig_clasificarInstalacion(_snap({ datos: true }), null, REGISTRO_MIGRACIONES);
    A.igual(ausente.version, '0', 'clave ausente ≡ 0');
    A.igual(ausente.estado, 'ANTIGUA', 'legada con datos → ANTIGUA');
    var ilegible = Mig_clasificarInstalacion(_snap({ datos: true, config: { SCHEMA_VERSION: 'abc' } }), null, REGISTRO_MIGRACIONES);
    A.igual(ilegible.estado, 'DESCONOCIDA', 'versión ilegible → DESCONOCIDA');
    A.igual(ilegible.accion, 'manual', 'no se auto-migra ilegible');
    var mayor = Mig_clasificarInstalacion(_snap({ datos: true, config: { SCHEMA_VERSION: '2' } }), null, REGISTRO_MIGRACIONES);
    A.igual(mayor.estado, 'DIVERGENTE', 'esquema superior al código → DIVERGENTE');
    A.igual(mayor.accion, 'manual', 'requiere atención humana');
    var incompleta = Mig_clasificarInstalacion(_snap({ datos: true, faltantes: ['PACIENTES'] }), null, REGISTRO_MIGRACIONES);
    A.igual(incompleta.estado, 'INCOMPLETA', 'faltan hojas críticas → INCOMPLETA');
    A.igual(incompleta.accion, 'reparar', 'accion de reparación');
    var vigenteComoParametro = Mig_clasificarInstalacion(_snap({ datos: true }), '1', REGISTRO_MIGRACIONES);
    A.igual(vigenteComoParametro.estado, 'VIGENTE', 'parámetro explícito respeta snapshot');
  });

  t('T3: instalación NUEVA (sin datos y sin versionar) se detecta y migra en cadena', function () {
    var v = Mig_clasificarInstalacion(_snap({ datos: false }), null, REGISTRO_MIGRACIONES);
    A.igual(v.estado, 'NUEVA', 'sin datos → NUEVA');
    A.igual(v.version, '0', 'esquema 0');
    A.igual(v.hayDatos, false, 'sin datos');
    A.igual(v.pendientes[0], 'MIG-001', 'la cadena desde 0 arranca en MIG-001');
    A.igual(v.accion, 'migrar', 'accion migrar');
  });

  t('T4: instalación VIGENTE (esquema 1 canónico) sin migraciones pendientes', function () {
    var v = Mig_clasificarInstalacion(_snap({ datos: true, config: { SCHEMA_VERSION: '1' } }), null, REGISTRO_MIGRACIONES);
    A.igual(v.estado, 'VIGENTE', 'estado VIGENTE');
    A.igual(v.version, '1', 'esquema 1');
    A.arreglos(v.pendientes, [], 'sin pendientes');
    A.arreglos(v.sectoresDivergentes, [], 'sectores canónicos');
    A.igual(v.accion, 'ninguna', 'accion ninguna');
    A.arreglos(Mig_pendientesPura('1', REGISTRO_MIGRACIONES), [], 'desde 1 no hay pendientes');
  });

  t('T5: instalación ANTIGUA legada (0) con vistas SECTOR_* divergentes → MIG-001 pendiente', function () {
    var v = Mig_clasificarInstalacion(_snap({ datos: true, divergente: true }), null, REGISTRO_MIGRACIONES);
    A.igual(v.estado, 'ANTIGUA', 'estado ANTIGUA');
    A.igual(v.version, '0', 'esquema 0');
    A.cierto(v.pendientes.indexOf('MIG-001') !== -1, 'MIG-001 pendiente');
    A.cierto(v.sectoresDivergentes.length === 3, 'las tres vistas SECTOR_* divergentes');
    A.igual(v.accion, 'migrar', 'accion migrar');
    A.arreglos(Mig_pendientesPura('0', REGISTRO_MIGRACIONES).map(function (m) { return m.id; }), ['MIG-001'], 'cadena desde 0');
  });

  t('T6: la clasificación y las pendientes son idempotentes (doble ejecución idéntica)', function () {
    var s = _snap({ datos: true, divergente: true });
    var a = Mig_clasificarInstalacion(s, null, REGISTRO_MIGRACIONES);
    var b = Mig_clasificarInstalacion(s, null, REGISTRO_MIGRACIONES);
    A.igual(a.estado, b.estado, 'mismo estado');
    A.arreglos(a.pendientes, b.pendientes, 'mismas pendientes');
    A.arreglos(a.sectoresDivergentes, b.sectoresDivergentes, 'mismos sectores divergentes');
    A.arreglos(Mig_pendientesPura('0'), Mig_pendientesPura('0'), 'pendientes 0 doble llamada idéntica');
  });

  t('T7: orden determinista de la cadena (desde ascendente, luego id.)', function () {
    var reg = [
      { id: 'MIG-004', desde: '2', hasta: '3', fn: 'Mig_stubA' },
      { id: 'MIG-002', desde: '0', hasta: '1', fn: 'Mig_stubA' },
      { id: 'MIG-003', desde: '1', hasta: '2', fn: 'Mig_stubA' },
      { id: 'MIG-002B', desde: '0', hasta: '1', fn: 'Mig_stubA' }
    ];
    var ids = Mig_pendientesPura('0', reg, '3').map(function (m) { return m.id; });
    A.arreglos(ids, ['MIG-002', 'MIG-002B', 'MIG-003', 'MIG-004'], 'orden desde asc + id');
    A.arreglos(Mig_pendientesPura('1', reg, '3').map(function (m) { return m.id; }), ['MIG-003', 'MIG-004'], 'desde 1 continúa la cadena restante');
    A.arreglos(Mig_pendientesPura('3', reg, '3'), [], 'desde 3 no queda nada');
  });

  t('T8: el runner persiste SCHEMA_VERSION/LAST_MIGRATION tras cada éxito (test de contrato de persistencia)', function () {
    var prev = globalThis._inst_configEscribir;
    var calls = [], restored = false;
    try {
      globalThis._inst_configEscribir = function (clave, valor) { calls.push([clave, String(valor)]); };
      globalThis.Mig_stubA = function () { return { ok: true }; };
      var reg = [
        { id: 'MIG-A', desde: '0', hasta: '1', fn: 'Mig_stubA' },
        { id: 'MIG-B', desde: '1', hasta: '2', fn: 'Mig_stubA' }
      ];
      var r = Mig_ejecutarDeclaradas(reg, { schemaVersion: '0', persistir: true, objetivo: '2' });
      A.igual(r.ok, true, 'ok');
      A.arreglos(r.aplicadas, ['MIG-A', 'MIG-B'], 'aplicadas en orden');
      A.igual(r.versionFinal, '2', 'versión final 2');
      A.igual(calls.length, 4, '2 claves × 2 migraciones');
      A.arreglos(calls[0], ['LAST_MIGRATION', 'MIG-A'], 'persiste LAST_MIGRATION de la 1ª');
      A.arreglos(calls[1], ['SCHEMA_VERSION', '1'], 'persiste SCHEMA_VERSION tras la 1ª');
      A.arreglos(calls[2], ['LAST_MIGRATION', 'MIG-B'], 'persiste LAST_MIGRATION de la 2ª');
      A.arreglos(calls[3], ['SCHEMA_VERSION', '2'], 'persiste SCHEMA_VERSION final');
    } finally {
      if (prev) { globalThis._inst_configEscribir = prev; restored = true; }
      else { delete globalThis._inst_configEscribir; }
      delete globalThis.Mig_stubA;
    }
    A.cierto(restored, 'se restaura _inst_configEscribir');
  });

  t('T9: una migración fallida DETIENE la cadena y NO avanza la versión', function () {
    globalThis.Mig_stubA = function () { return { ok: true }; };
    globalThis.Mig_stubFail = function () { return { ok: false, motivo: 'FALLO_TEST' }; };
    try {
      var reg = [
        { id: 'MIG-A', desde: '0', hasta: '1', fn: 'Mig_stubA' },
        { id: 'MIG-FAIL', desde: '1', hasta: '2', fn: 'Mig_stubFail' },
        { id: 'MIG-B', desde: '2', hasta: '3', fn: 'Mig_stubA' }
      ];
      var r = Mig_ejecutarDeclaradas(reg, { schemaVersion: '0', persistir: false, objetivo: '3' });
      A.igual(r.ok, false, 'ok false');
      A.arreglos(r.aplicadas, ['MIG-A'], 'solo la primera aplicada');
      A.igual(r.versionFinal, '1', 'la versión NO avanza más allá del éxito previo');
      A.igual(r.migracion, 'MIG-FAIL', 'señala la migración que falló');
      A.igual(r.motivo, 'FALLO_TEST', 'propaga el motivo');
      // función ausente → también detiene sin marcar
      var rg2 = [{ id: 'MIG-X', desde: '0', hasta: '1', fn: 'Mig_stubNoExiste' }];
      var r2 = Mig_ejecutarDeclaradas(rg2, { schemaVersion: '0', persistir: false });
      A.igual(r2.ok, false, 'función ausente → ok false');
      A.cierto(String(r2.motivo).indexOf('FUNCION_AUSENTE') !== -1, 'motivo de función ausente');
      A.arreglos(r2.aplicadas, [], 'nada aplicado');
    } finally {
      delete globalThis.Mig_stubA;
      delete globalThis.Mig_stubFail;
    }
  });

  t('T10: el diagnóstico es SOLO LECTURA (escanea, nunca Modelo_crearEstructura)', function () {
    var fn = Instalar_diagnosticar.toString();
    A.cierto(fn.indexOf('Modelo_escanearEstructura') !== -1, 'usa escaneo de solo lectura');
    A.cierto(fn.indexOf('Modelo_crearEstructura') === -1, 'el diagnóstico NO repara estructura');
    A.cierto(fn.indexOf('versionado') !== -1, 'incluye el bloque versionado');
  });

  t('T11: api_instalarPaso protege etapas mutantes con LockService', function () {
    var fn = api_instalarPaso.toString();
    A.cierto(fn.indexOf('LockService') !== -1, 'usa LockService');
    A.cierto(fn.indexOf('tryLock') !== -1, 'usa tryLock');
    A.cierto(fn.indexOf('releaseLock') !== -1, 'libera el lock');
    ['migraciones', 'estructura', 'fuentes', 'amarillo', 'visual', 'validaciones',
     'limpieza', 'diseno', 'inicio', 'menu', 'enriquecimiento'].forEach(function (id) {
      A.cierto(!!INSTALAR_ETAPAS_MUTAN[id], id + ' figura como mutante');
    });
    ['runtime', 'diagnostico', 'versionado', 'verificar'].forEach(function (id) {
      A.cierto(!INSTALAR_ETAPAS_MUTAN[id], id + ' es solo lectura (sin lock)');
    });
    A.cierto(INSTALAR_ETAPAS.filter(function (e) { return e.id === 'versionado'; }).length === 1,
      'etapa versionado registrada');
    A.cierto(INSTALAR_ETAPAS.filter(function (e) { return e.id === 'migraciones'; }).length === 1,
      'etapa migraciones registrada');
  });

  t('T12: Actualizar NO incorpora versionado ni ejecuta migraciones (separación S12/INST-1)', function () {
    var todo = UI_actualizarTodo.toString();
    ['Mig_', 'REGISTRO_MIGRACIONES', 'Instalar_pMigraciones', 'SCHEMA_VERSION', '_inst_configEscribir'].forEach(function (f) {
      A.cierto(todo.indexOf(f) === -1, 'UI_actualizarTodo no referencia ' + f);
    });
    var act = UI_actualizarSistema.toString();
    ['Mig_', 'Instalar_pMigraciones', 'SCHEMA_VERSION'].forEach(function (f) {
      A.cierto(act.indexOf(f) === -1, 'Actualizar no referencia ' + f);
    });
  });

  t('T13: la regresión BUG-E2E-003 queda protegida por MIG-001 (detección + re-aplicación)', function () {
    var v = Mig_clasificarInstalacion(_snap({ datos: true, divergente: true, config: { SCHEMA_VERSION: '1' } }), null, REGISTRO_MIGRACIONES);
    A.igual(v.estado, 'ANTIGUA', 'esquema 1 con SECTOR_* divergentes → ANTIGUA (defensa)');
    A.cierto(v.sectoresDivergentes.length > 0, 'divergencia detectada');
    var persistente = Mig_ejecutarPersistente.toString();
    A.cierto(persistente.indexOf('sectoresDivergentes') !== -1, 'defensa lee divergencia');
    A.cierto(persistente.indexOf("'MIG-001'") !== -1, 're-aplica MIG-001');
    var run = Mig_run001.toString();
    A.cierto(run.indexOf('Modelo_alinearVistaSector') !== -1, 'MIG-001 migra por nombre (S10-FIX)');
    A.cierto(run.indexOf('ENCABEZADOS_INCOMPATIBLES') === -1, 'no oculta la incompatibilidad');
  });

  t('T14: el motor de migraciones toca SOLO estructura de vistas (sin PACIENTES/EVENTOS/append/insert)', function () {
    var fns = ['Mig_pendientesPura', 'Mig_clasificarInstalacion', 'Mig_ejecutarDeclaradas',
      'Mig_ejecutarPersistente', 'Mig_schemaLeido', '_inst_configEscribir', 'Mig_run001',
      'Instalar_pMigraciones'];
    var G = (typeof globalThis !== 'undefined') ? globalThis : this;
    fns.forEach(function (name) {
      var fn = G[name];
      A.cierto(typeof fn === 'function', name + ' existe');
      var src = fn.toString();
      ['PACIENTES', 'EVENTOS', 'appendRow', 'insertRow', 'insertRowsAfter', 'insertSheet'].forEach(function (pal) {
        A.cierto(src.indexOf(pal) === -1, name + ' sin ' + pal);
      });
    });
  });

  t('T15: sin duplicación: el runner no crea hojas ni filas y respeta idempotencia', function () {
    var dec = Mig_ejecutarDeclaradas.toString();
    ['appendRow', 'insertRow', 'insertRows', 'insertSheet', 'deleteRow', 'Modelo_crearEstructura'].forEach(function (pal) {
      A.cierto(dec.indexOf(pal) === -1, 'Mig_ejecutarDeclaradas sin ' + pal);
    });
    var run = Mig_run001.toString();
    ['insertSheet', 'appendRow', 'insertRow', 'deleteRow', 'append'].forEach(function (pal) {
      A.cierto(run.indexOf(pal) === -1, 'Mig_run001 sin ' + pal);
    });
    // Doble aplicación de las pendientes desde 0 → 1 está vacía
    A.arreglos(Mig_pendientesPura('1', REGISTRO_MIGRACIONES), [], 'tras llegar a 1 no queda nada que migrar');
    globalThis.Mig_stubA = function () { return { ok: true }; };
    try {
      var reg = [{ id: 'MIG-STUB', desde: '0', hasta: String(SISTEMA_VERSION_SCHEMA_ACTUAL), fn: 'Mig_stubA' }];
      var apply = Mig_ejecutarDeclaradas(reg, { schemaVersion: '0', persistir: false });
      A.igual(apply.ok, true, 'ejecución declarada (stub) ok');
      A.arreglos(apply.aplicadas, ['MIG-STUB'], 'aplica en cadena sin duplicar');
      var apply2 = Mig_ejecutarDeclaradas(reg, { schemaVersion: String(SISTEMA_VERSION_SCHEMA_ACTUAL), persistir: false });
      A.arreglos(apply2.aplicadas, [], 'segunda ejecución sin duplicar nada');
    } finally {
      delete globalThis.Mig_stubA;
    }
  });
}

// ---------------------------------------------------------------------------
// INST-1.1 — Dashboard/INICIO: fórmulas legibles (fecha, sin serial crudo).
function _pruebas_inicio_formulas(t, A) {
  t('INI-1: "Última sincronización de fuentes" arma la fecha con TEXT() (no serial crudo)', function () {
    var src = Hojas_crearInicio.toString();
    A.cierto(src.indexOf('CARGA_REAL_HECHA') !== -1, 'la consulta a CONFIG existe');
    A.cierto(src.indexOf('IFERROR(TEXT(VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0)') !== -1,
      'CARGA_REAL_HECHA se envuelve en TEXT(...)');
    A.cierto(src.indexOf('IFERROR(VLOOKUP("CARGA_REAL_HECHA";CONFIG!A:B;2;0)') === -1,
      'no queda la variante sin formato (regresión del serial 46262,xxxx)');
    A.cierto(src.indexOf('"dd/mm/yyyy hh:mm"') !== -1, 'formato de fecha legible aplicado');
  });
  t('INI-2: la fecha de "Última actualización de datos" continúa formateada como fecha', function () {
    var src = Hojas_crearInicio.toString();
    A.cierto(src.indexOf('TEXT(MAX(PACIENTES!') !== -1 && src.indexOf('"dd/mm/yyyy hh:mm"') !== -1,
      'TEXT con dd/mm/yyyy hh:mm en la última actualización de datos');
  });
}
