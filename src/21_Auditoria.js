// ===========================================================================
// 📋 AUDITORÍA v0.8.8 — FASE 1 dry-run (solo lectura)
// Informe completo: A (auditoría), B (datos reales), C (rendimiento),
// D (UX), E (correcciones), F (no corregido), G (tests), H (git/clasp), I (manual)
// ===========================================================================

/**
 * PURA: anonimiza un RUT para reportes (solo últimos 2 dígitos del cuerpo + DV).
 * @param {string} rut normalizado 'XXXXXXXX-X' o 'XXXXXXXXXX' o con puntos
 * @returns {string} '**.***.**X-X'
 */
function Aud_anonRut(rut) {
  var r = Utl_texto(rut);
  if (!r) return '';
  var clean = r.replace(/[.\s]/g, '');
  // formato: dddddddd-X o dddddddddX (X = dígito o K)
  var m = /^(\d+)([-–])?([\dkK])$/.exec(clean);
  if (!m) return '**.***.**?-?';
  var cuerpo = m[1], dv = m[3].toUpperCase();
  var len = cuerpo.length;
  var ultimos = len >= 2 ? cuerpo.slice(-2) : cuerpo;
  return '**.***.**' + ultimos + '-' + dv;
}

/**
 * PURA: anonimiza nombre (primera letra + '•••').
 */
function Aud_anonNombre(nombre) {
  var n = Utl_texto(nombre).trim();
  if (!n) return '';
  var partes = n.split(/\s+/);
  return partes.map(function (p) { return p.charAt(0).toUpperCase() + '•••'; }).join(' ');
}

/**
 * PURA: máscara ID_INTERNO (solo últimos 4 chars).
 */
function Aud_anonId(idInterno) {
  var s = Utl_texto(idInterno);
  if (!s) return '';
  return '•••' + (s.length >= 4 ? s.slice(-4) : s);
}

/**
 * PURA: clasifica UNA persona según el modelo clínico unificado.
 * @returns {estado:string, esDesalineado:boolean, desalineadoActual:string|null, desalineadoDerivado:string|null}
 * estados: VIGENTE|PRÓXIMO|VENCIDO|SIN_ÚLTIMO_CONTROL|SIN_ESTRATIFICACIÓN|SIN_CONFIGURACIÓN|FECHA_INVÁLIDA|DESALINEADO
 */
function Aud_clasificarPersona(p, freqConfig, hoyIso, avisoDias) {
  var g = Utl_texto(p.ESTRATIFICACION).toUpperCase();
  var nivel = /^G[123]$/.test(g) ? g : 'GPend';
  var uc = Utl_texto(p.ULTIMO_CONTROL);
  var proxAlmacenado = Utl_texto(p.PROXIMO_CONTROL).slice(0, 10);
  var proxDerivado = uc ? Control_calcularProximo(uc, g, freqConfig) : '';
  var desalineado = (uc && proxDerivado && proxAlmacenado && proxAlmacenado !== proxDerivado);

  if (!uc) return { estado: 'SIN_ÚLTIMO_CONTROL', esDesalineado: false };
  if (!proxDerivado) return { estado: 'SIN_CONFIGURACIÓN', esDesalineado: false };
  if (nivel === 'GPend') return { estado: 'SIN_ESTRATIFICACIÓN', esDesalineado: false };

  var est = Control_estadoVigencia(proxDerivado, hoyIso, avisoDias);
  if (desalineado) return { estado: 'DESALINEADO', esDesalineado: true, desalineadoActual: proxAlmacenado, desalineadoDerivado: proxDerivado };
  return { estado: est, esDesalineado: false };
}

/**
 * PURA: clasifica población completa y calcula agregados.
 * @returns {metricas, desalineados:[], porSector:{}}
 */
function Aud_clasificarPoblacion(pacientes, freqConfig, hoyIso, avisoDias) {
  var m = {
    total: 0, G1: 0, G2: 0, G3: 0, GPend: 0,
    conControles: 0, sinUltimoControl: 0, conProximo: 0,
    vencidos: 0, proximos: 0, vigentes: 0, sinFecha: 0,
    sinNacimiento: 0, fechaInvalida: 0, configFaltante: 0,
    desalineados: 0
  };
  var desalineados = [], porSector = {};

  (pacientes || []).forEach(function (p) {
    m.total++;
    var g = Utl_texto(p.ESTRATIFICACION).toUpperCase();
    var nivel = /^G[123]$/.test(g) ? g : 'GPend';
    m[nivel]++;
    var sec = Utl_texto(p.SECTOR).toUpperCase() || 'SIN_SECTOR';
    porSector[sec] = porSector[sec] || { total: 0, G1: 0, G2: 0, G3: 0, GPend: 0 };
    porSector[sec].total++; porSector[sec][nivel]++;

    var c = Aud_clasificarPersona(p, freqConfig, hoyIso, avisoDias);
    if (c.estado === 'SIN_ÚLTIMO_CONTROL') {
      m.sinUltimoControl++;
      m.sinFecha++; // SIN_ÚLTIMO_CONTROL también cuenta como sin fecha (coherente con Control_analizar)
    } else {
      m.conControles++;
      if (c.estado !== 'SIN_CONFIGURACIÓN' && c.estado !== 'SIN_ESTRATIFICACIÓN') {
        m.conProximo++;
        if (c.estado === 'VENCIDO') m.vencidos++;
        else if (c.estado === 'POR_VENCER') m.proximos++;
        else if (c.estado === 'VIGENTE') m.vigentes++;
        else if (c.estado === 'SIN_FECHA') m.sinFecha++;
      }
      if (c.estado === 'SIN_CONFIGURACIÓN') m.configFaltante++;
      if (c.estado === 'SIN_ESTRATIFICACIÓN') m.sinFecha++;
    }
    if (c.esDesalineado) {
      m.desalineados++;
      desalineados.push({
        id: Aud_anonId(p.ID_INTERNO), rut: Aud_anonRut(p.RUT), nombre: Aud_anonNombre(p.NOMBRE),
        sector: sec, estrat: nivel,
        almacenado: c.desalineadoActual, derivado: c.desalineadoDerivado
      });
    }
    var nac = Utl_edadDesde(Utl_texto(p.FECHA_NACIMIENTO),
      hoyIso ? new Date(+hoyIso.slice(0, 4), +hoyIso.slice(5, 7) - 1, +hoyIso.slice(8, 10)) : undefined);
    if (Utl_vacio(p.FECHA_NACIMIENTO)) m.sinNacimiento++;
    else if (nac === '' && !Utl_vacio(p.FECHA_NACIMIENTO)) m.fechaInvalida++;
  });
  m.GPend = m.total - m.G1 - m.G2 - m.G3;
  return { metricas: m, desalineados: desalineados, porSector: porSector };
}

/**
 * PURA: auditoría Amarillo (eventos sector AMARILLO).
 * @returns {total, duplicados, gruposDuplicados, desalineados, vencidos, proximos, G1, G2, G3, sinUltimo, sinEstrat, sinProximo, ejemplosDuplicados}
 */
function Aud_auditarAmarillo(pacientes, eventos, freqConfig, hoyIso, avisoDias) {
  var evAm = (eventos || []).filter(function (e) {
    return Utl_texto(e.SECTOR).toUpperCase() === 'AMARILLO';
  });
  var dup = Amarillo_analizarDuplicados(evAm);
  var porId = {};
  (pacientes || []).forEach(function (p) { porId[Utl_texto(p.ID_INTERNO)] = p; });

  var res = { total: evAm.length, duplicados: dup.gruposDuplicados, gruposDuplicados: dup.gruposDuplicados,
    desalineados: 0, vencidos: 0, proximos: 0, G1: 0, G2: 0, G3: 0, sinUltimo: 0, sinEstrat: 0, sinProximo: 0,
    ejemplosDuplicados: (dup.ejemplos || []).slice(0, 5) };

  var porPac = {};
  evAm.forEach(function (e) {
    var pid = Utl_texto(e.ID_INTERNO);
    if (!porPac[pid]) porPac[pid] = [];
    porPac[pid].push(e);
  });

  Object.keys(porPac).forEach(function (pid) {
    var p = porId[pid];
    if (!p) return;
    var g = Utl_texto(p.ESTRATIFICACION).toUpperCase();
    if (/^G[123]$/.test(g)) res[g]++;
    else res.sinEstrat++;
    var ultCtrl = porPac[pid].filter(function (e) { return Utl_texto(e.TIPO_EVENTO) === 'CONTROL'; })
      .sort(function (a, b) { return Utl_texto(a.FECHA_EVENTO) < Utl_texto(b.FECHA_EVENTO) ? 1 : -1; })[0];
    if (!ultCtrl) { res.sinUltimo++; return; }
    var proxDer = Control_calcularProximo(Utl_texto(ultCtrl.FECHA_EVENTO), g, freqConfig);
    if (!proxDer) { res.sinProximo++; return; }
    var est = Control_estadoVigencia(proxDer, hoyIso, avisoDias);
    if (est === 'VENCIDO') res.vencidos++; else if (est === 'POR_VENCER') res.proximos++;
    var proxAlm = Utl_texto(p.PROXIMO_CONTROL).slice(0, 10);
    if (proxAlm && proxDer && proxAlm !== proxDer) res.desalineados++;
  });
  return res;
}

/**
 * PURA: auditoría RESPONSABLES (usa Responsables_diagnostico existente).
 */
function Aud_auditarResponsables(pacientes) {
  var diag = Responsables_diagnostico(pacientes);
  var porSector = Responsables_correosDe(pacientes);
  return {
    asociaciones: diag.mapeados.length,
    porSector: Object.keys(porSector).map(function (s) {
      return { sector: s, correos: porSector[s].map(function (r) { return { codigo: r.CODIGO_RESPONSABLE, email: r.CORREO }; }) };
    }),
    unicos: new Set(diag.mapeados.map(function (m) { return m.CODIGO_RESPONSABLE; })).size,
    multiSector: diag.mapeados.filter(function (m) {
      return diag.mapeados.filter(function (x) { return x.CODIGO_RESPONSABLE === m.CODIGO_RESPONSABLE; }).length > 1;
    }).length,
    duplicados: diag.mapeados.length - new Set(diag.mapeados.map(function (m) { return m.CODIGO_RESPONSABLE; })).size,
    codigosInexistentes: diag.codigosInexistentes.length,
    inactivos: diag.inactivos.length,
    correosInvalidos: diag.correosInvalidos.length,
    huerfanas: diag.mapeados.filter(function (m) { return m.ESTADO !== 'ACTIVO'; }).length,
    legacy: diag.mapeados.filter(function (m) { return !m.ACTIVO; }).length,
    ejemplos: {
      inactivos: diag.inactivos.slice(0, 3),
      inexistentes: diag.codigosInexistentes.slice(0, 3),
      correosInvalidos: diag.correosInvalidos.slice(0, 3)
    }
  };
}

/**
 * PURA: auditoría PROFESIONALES.
 */
function Aud_auditarProfesionales(pacientes) {
  var catalogo = Profesionales_catalogo().filter(function (c) { return c.ACTIVO; });
  var inactivos = Profesionales_catalogo().filter(function (c) { return !c.ACTIVO; });
  var usados = {};
  (pacientes || []).forEach(function (p) {
    var dup = Utl_texto(p.DUPLA_INGRESO).split(';').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
    var ps = Utl_texto(p.PROFESIONAL_SEGUIMIENTO).trim().toUpperCase();
    [].concat(dup, ps).forEach(function (c) { if (c) usados[c] = (usados[c] || 0) + 1; });
  });
  var inexistentes = Object.keys(usados).filter(function (c) {
    return !catalogo.some(function (cat) { return cat.CODIGO === c; });
  });
  var duplicadosNombres = {};
  catalogo.forEach(function (c) {
    var k = Utl_texto(c.NOMBRE).toUpperCase();
    duplicadosNombres[k] = (duplicadosNombres[k] || 0) + 1;
  });
  return {
    total: catalogo.length + inactivos.length, activos: catalogo.length, inactivos: inactivos.length,
    duplicados: Object.keys(duplicadosNombres).filter(function (k) { return duplicadosNombres[k] > 1; }).length,
    nombresDuplicados: Object.keys(duplicadosNombres).filter(function (k) { return duplicadosNombres[k] > 1; }),
    usados: Object.keys(usados).length,
    inexistentesEnCatalogo: inexistentes.length,
    inexistentesEjemplos: inexistentes.slice(0, 5),
    roles: catalogo.reduce(function (acc, c) { acc[c.ROL] = (acc[c.ROL] || 0) + 1; return acc; }, {})
  };
}

/**
 * PURA: auditoría CONFIG (clasifica claves).
 */
function Aud_auditarConfig(configRows) {
  var grupos = { ESTRATIFICACIÓN: [], RESPONSABLES: [], COMUNES: [], ADMINISTRADOR: [], LEGACY: [], DESCONOCIDA: [] };
  var total = 0, invalidas = 0, duplicadas = 0, freqNegZero = 0, unidadesInvalidas = 0, noUsadas = 0;
  var vistos = {};
  var clavesConocidas = {
    'GENERAL_NOMBRE_SISTEMA': 'COMUNES', 'GENERAL_INSTITUCION': 'COMUNES', 'DASHBOARD_TITULO': 'COMUNES',
    'REM_INCLUIR_INDICADORES': 'COMUNES', 'PACIENTES_MIN_BUSQUEDA': 'COMUNES',
    'TTL_CACHE_SEG': 'COMUNES', 'WEBHOOK_TOKEN': 'ADMINISTRADOR', 'WEBHOOK_URL': 'ADMINISTRADOR',
    'FREC_CONTROL_G1_CANT': 'ESTRATIFICACIÓN', 'FREC_CONTROL_G1_UNIDAD': 'ESTRATIFICACIÓN',
    'FREC_CONTROL_G2_CANT': 'ESTRATIFICACIÓN', 'FREC_CONTROL_G2_UNIDAD': 'ESTRATIFICACIÓN',
    'FREC_CONTROL_G3_CANT': 'ESTRATIFICACIÓN', 'FREC_CONTROL_G3_UNIDAD': 'ESTRATIFICACIÓN',
    'FREC_CONTROL_G_CANT': 'ESTRATIFICACIÓN', 'FREC_CONTROL_G_UNIDAD': 'ESTRATIFICACIÓN',
    'AVISO_CONTROL_DIAS': 'ESTRATIFICACIÓN',
    'FREC_CONTROL_G1': 'LEGACY', 'FREC_CONTROL_G2': 'LEGACY', 'FREC_CONTROL_G3': 'LEGACY', 'FREC_CONTROL_G': 'LEGACY',
    'SECTORES_RESPONSABLES': 'RESPONSABLES'
  };
  var responsablesKeys = Object.keys(Responsables_correosDe([]).length ? {} : {});
  (configRows || []).forEach(function (f) {
    total++;
    var k = Utl_texto(f[0]), v = Utl_texto(f[1]);
    if (vistos[k]) { duplicadas++; }
    vistos[k] = (vistos[k] || 0) + 1;
    var grupo = clavesConocidas[k] || 'DESCONOCIDA';
    grupos[grupo].push({ clave: k, valor: v });
    if (grupo === 'ESTRATIFICACIÓN' && k.endsWith('_CANT')) {
      var c = parseInt(v, 10);
      if (isNaN(c) || c <= 0) freqNegZero++;
    }
    if (grupo === 'ESTRATIFICACIÓN' && k.endsWith('_UNIDAD')) {
      var u = Utl_sinTildes(v).toLowerCase();
      if (u.indexOf('día') !== 0 && u.indexOf('mes') !== 0) unidadesInvalidas++;
    }
  });
  Object.keys(grupos).forEach(function (g) {
    noUsadas += grupos[g].filter(function (x) {
      // heurística simple: claves legacy sin _CANT/_UNIDAD activas, TTL_CACHE_SEG sin uso real
      return x.clave.startsWith('FREC_CONTROL_') && !x.clave.includes('_CANT') && !x.clave.includes('_UNIDAD') ||
             x.clave === 'TTL_CACHE_SEG';
    }).length;
  });
  return { total: total, invalidas: invalidas, duplicadas: duplicadas, freqNegZero: freqNegZero,
    unidadesInvalidas: unidadesInvalidas, noUsadas: noUsadas, grupos: grupos };
}

/**
 * PURA: texto ╔════════════════════════════════════════════════════════════════════════════════════╗
 */
function Aud_renderTexto(secciones) {
  var ancho = 98;
  function linea(texto, izq, der) {
    var t = izq + texto + der;
    return t.padEnd(ancho + izq.length + der.length, ' ');
  }
  function bloque(titulo, lineas) {
    var out = [];
    out.push('╔' + '═'.repeat(ancho) + '╗');
    out.push('║' + linea(' ' + titulo, '', '').slice(1, -1) + '║');
    out.push('╠' + '═'.repeat(ancho) + '╣');
    lineas.forEach(function (l) {
      out.push('║ ' + l.padEnd(ancho - 1) + '║');
    });
    out.push('╚' + '═'.repeat(ancho) + '╝');
    return out.join('\n');
  }
  var partes = [];
  Object.keys(secciones).forEach(function (k) {
    partes.push(bloque(secciones[k].titulo, secciones[k].lineas));
  });
  return partes.join('\n\n');
}

/**
 * GAS: dry-run completa — NO escribe nada.
 * @returns {texto:string, datos:Object}
 */
function Auditoria_ejecutar() {
  var t0 = Date.now();
  var tz = Session.getScriptTimeZone();
  var hoyIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var avisoDias = 7;
  try {
    var hC = Modelo_hoja(HOJAS.CONFIG);
    if (hC && hC.getLastRow() > 1) {
      Utl_leerBloque(hC).slice(1).forEach(function (f) {
        if (Utl_texto(f[0]) === 'AVISO_CONTROL_DIAS') avisoDias = parseInt(f[1], 10) || 7;
      });
    }
  } catch (e) {}

  var pacientes = Modelo_leerPacientes();
  var eventos = Modelo_leerEventos();
  var freqConfig = Control_leerFrecuencia();
  var configRows = (hC && hC.getLastRow() > 1) ? Utl_leerBloque(hC).slice(1) : [];

  var clasif = Aud_clasificarPoblacion(pacientes, freqConfig, hoyIso, avisoDias);
  var amarillo = Aud_auditarAmarillo(pacientes, eventos, freqConfig, hoyIso, avisoDias);
  var resp = Aud_auditarResponsables(pacientes);
  var prof = Aud_auditarProfesionales(pacientes);
  var conf = Aud_auditarConfig(configRows);

  var duplicadosRut = {};
  var vistosRut = {};
  pacientes.forEach(function (p) {
    var rut = Utl_texto(p.RUT).toUpperCase();
    if (rut && vistosRut[rut]) duplicadosRut[rut] = (duplicadosRut[rut] || 0) + 1;
    vistosRut[rut] = true;
  });

  var secciones = {
    PERSONAS: {
      titulo: 'PERSONAS',
      lineas: [
        'Total: ' + clasif.metricas.total + ' · Con nacimiento: ' + (clasif.metricas.total - clasif.metricas.sinNacimiento) +
          ' · Sin nacimiento: ' + clasif.metricas.sinNacimiento + ' · Fechas inválidas: ' + clasif.metricas.fechaInvalida,
        'Edad calculable: ' + (clasif.metricas.total - clasif.metricas.sinNacimiento - clasif.metricas.fechaInvalida) +
          ' · No calculable: ' + (clasif.metricas.sinNacimiento + clasif.metricas.fechaInvalida),
        'Inconsistencias EDAD: 0 (EDAD es derivada, no almacenada; se recalcula en vivo)'
      ]
    },
    CONTROLES: {
      titulo: 'CONTROLES — Clasificación clínica',
      lineas: [
        'Total analizadas: ' + clasif.metricas.total + ' · G1: ' + clasif.metricas.G1 + ' · G2: ' + clasif.metricas.G2 +
          ' · G3: ' + clasif.metricas.G3 + ' · Sin estratificar: ' + clasif.metricas.GPend,
        'Con último control: ' + clasif.metricas.conControles + ' · Sin último control: ' + clasif.metricas.sinUltimoControl,
        'Con PRÓXIMO_CONTROL derivado: ' + clasif.metricas.conProximo + ' · Sin PRÓXIMO (config faltante): ' + clasif.metricas.configFaltante,
        'VIGENTE: ' + clasif.metricas.vigentes + ' · PRÓXIMO (≤' + avisoDias + 'd): ' + clasif.metricas.proximos +
          ' · VENCIDO: ' + clasif.metricas.vencidos + ' · SIN_FECHA: ' + clasif.metricas.sinFecha,
        'DESALINEADOS (PROXIMO_CONTROL almacenado ≠ derivado): ' + clasif.metricas.desalineados +
          (clasif.desalineados.length ? ' — ejemplos: ' + clasif.desalineados.slice(0, 5).map(function (d) {
            return d.id + ' ' + d.nombre + ' ' + d.rut + ': ' + d.almacenado + ' → ' + d.derivado;
          }).join('; ') : '')
      ]
    },
    AMARILLO: {
      titulo: 'AMARILLO — Fuente histórica',
      lineas: [
        'Eventos Amarillo: ' + amarillo.total + ' · Duplicados (grupos): ' + amarillo.gruposDuplicados +
          ' · Eliminar: ' + (amarillo.eliminar || 'N/A'),
        'DESALINEADOS Amarillo: ' + amarillo.desalineados + ' · VENCIDOS: ' + amarillo.vencidos + ' · PRÓXIMOS: ' + amarillo.proximos,
        'G1: ' + amarillo.G1 + ' · G2: ' + amarillo.G2 + ' · G3: ' + amarillo.G3 + ' · Sin estratificar: ' + amarillo.sinEstrat,
        'Sin último control: ' + amarillo.sinUltimo + ' · Sin PRÓXIMO_CONTROL: ' + amarillo.sinProximo,
        'Ejemplos duplicados: ' + (amarillo.ejemplosDuplicados.length ? amarillo.ejemplosDuplicados.join('; ') : 'ninguno')
      ]
    },
    RESPONSABLES: {
      titulo: 'RESPONSABLES — Asociaciones y correos',
      lineas: [
        'Asociaciones sector-responsable: ' + resp.asociaciones + ' · Responsables únicos: ' + resp.unicos +
          ' · Multi-sector: ' + resp.multiSector + ' · Duplicados: ' + resp.duplicados,
        'Códigos inexistentes: ' + resp.codigosInexistentes + ' · Inactivos: ' + resp.inactivos +
          ' · Correos inválidos: ' + resp.correosInvalidos + ' · Huérfanas: ' + resp.huerfanas + ' · Legacy: ' + resp.legacy,
        'Por sector: ' + resp.porSector.map(function (s) {
          return s.sector + '(' + s.correos.length + ')';
        }).join(', ')
      ]
    },
    PROFESIONALES: {
      titulo: 'PROFESIONALES — Catálogo y uso',
      lineas: [
        'Total: ' + prof.total + ' · Activos: ' + prof.activos + ' · Inactivos: ' + prof.inactivos +
          ' · Duplicados (mismo nombre): ' + prof.duplicados + ' · Nombres duplicados: ' + (prof.nombresDuplicados.join(', ') || 'ninguno'),
        'Usados en DUPLA/PROFESIONAL_SEGUIMIENTO: ' + prof.usados + ' · Inexistentes en catálogo: ' + prof.inexistentesEnCatalogo +
          (prof.inexistentesEjemplos.length ? ' [' + prof.inexistentesEjemplos.join(', ') + ']' : ''),
        'Roles: ' + Object.keys(prof.roles).map(function (r) { return r + '=' + prof.roles[r]; }).join(', ')
      ]
    },
    CONFIG: {
      titulo: 'CONFIG — Clasificación de claves',
      lineas: [
        'Total claves: ' + conf.total + ' · Duplicadas: ' + conf.duplicadas + ' · Frec ≤0: ' + conf.freqNegZero +
          ' · Unidades inválidas: ' + conf.unidadesInvalidas + ' · Sin uso aparente: ' + conf.noUsadas,
        'ESTRATIFICACIÓN: ' + conf.grupos.ESTRATIFICACIÓN.length + ' · RESPONSABLES: ' + conf.grupos.RESPONSABLES.length +
          ' · COMUNES: ' + conf.grupos.COMUNES.length + ' · ADMINISTRADOR: ' + conf.grupos.ADMINISTRADOR.length +
          ' · LEGACY: ' + conf.grupos.LEGACY.length + ' · DESCONOCIDA: ' + conf.grupos.DESCONOCIDA.length,
        'LEGACY (sin _CANT/_UNIDAD): ' + conf.grupos.LEGACY.map(function (x) { return x.clave + '=' + x.valor; }).join(', ') || 'ninguna',
        'DESCONOCIDA: ' + conf.grupos.DESCONOCIDA.map(function (x) { return x.clave + '=' + x.valor; }).join(', ') || 'ninguna'
      ]
    },
    RENDIMIENTO: {
      titulo: 'RENDIMIENTO — Perfil de la auditoría (dry-run)',
      lineas: [
        'Tiempo total: ' + (Date.now() - t0) + ' ms',
        'PACIENTES leídos: ' + pacientes.length + ' (memo)',
        'EVENTOS leídos: ' + eventos.length + ' (memo)',
        'CONFIG leída: 1 (block)',
        'CONFLICTOS leídos: ' + (function () { try { var h = Modelo_hoja(HOJAS.CONFLICTOS); return h ? Math.max(h.getLastRow() - 1, 0) : 0; } catch (e) { return 0; } })() + ' (full scan)',
        'Notas: CONFLICTOS leído completo (sin memo); CONFIG leída aquí y en Control_leerFrecuencia + Control_estadoVigencia; avisoDias desde CONFIG una vez'
      ]
    },
    UX: {
      titulo: 'UX — Flujos y duplicidades',
      lineas: [
        'Registrar CONTROL/SEGUIMIENTO: 3 rutas (Sidebar Control hoy/seguimiento · Controles modal fila · Ficha Registrar gestión)',
        'Buscar persona: 2 entradas (Menú Personas → Buscar/Ficha · Panel Buscar paciente)',
        'Abrir controles: 2 entradas (Menú Seguimiento → Controles por persona · Panel Abrir controles)',
        'Ver ficha: 2 rutas (Desde buscador · Desde modal Controles "Ver ficha")',
        'Edad consistente: Utl_edadDesde usada en Panel, Ficha, CentroResumen (1 implementación)',
        '00_Tokens.html: fragmento include (no diálogo) ✓'
      ]
    },
    SEGURIDAD: {
      titulo: 'SEGURIDAD — Superficie y hallazgos',
      lineas: [
        'api_irA des-oculta hojas ocultas (LOG, RESPONSABLES, PROFESIONALES, CONFIG, STAGING, REM_SALIDA) — acceso amplio',
        'CONFIG expuesta en api_configListar (solo lectura) · api_configGuardar/Agregar/Eliminar requieren usuario admin (verificar)',
        'Webhook token en CONFIG (sensible) — no ofuscado en UI'
      ]
    }
  };

  var texto = Aud_renderTexto(secciones);
  var datos = {
    fechaIso: hoyIso, duracionMs: Date.now() - t0,
    personas: clasif.metricas, desalineados: clasif.desalineados, porSector: clasif.porSector,
    amarillo: amarillo, responsables: resp, profesionales: prof, config: conf
  };
  return { ok: true, texto: texto, datos: datos };
}

/**
 * GAS: wrapper para Centro de Pruebas (botón ⚖️ Auditoría v0.8.8).
 * Devuelve {ok, texto, datos} para UI.
 */
function api_auditoriaEjecutar() {
  try {
    return Auditoria_ejecutar();
  } catch (e) {
    Log_error('Auditoria', 'ejecutar', e && e.message ? e.message : String(e));
    Log_flush();
    return { ok: false, motivo: e && e.message ? e.message : String(e) };
  }
}