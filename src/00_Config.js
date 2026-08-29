/**
 * Sistema ECICEP Unificado — 00_Config
 * Configuración centralizada. Única fuente de verdad de constantes.
 * Sin lógica de negocio ni operaciones I/O (testeable en node y GAS).
 *
 * Convención de nombres globales:
 *   ECICEP / HOJAS / MODELO_PACIENTE / ESTADOS / SINONIMOS_* / CFG_*  (datos)
 *   Utl_ / Norm_ / Log_ / Modelo_ / Pruebas_                          (funciones)
 *
 * v2.0 (ETAPA 2.5): modelo entidad/evento, demografía REM, motor de
 * estratificación configurable, sectores geográficos ≠ estratificación.
 */

// ---------------------------------------------------------------------------
// Identificación del proyecto
// ---------------------------------------------------------------------------
var ECICEP = {
  NOMBRE: 'Sistema ECICEP Unificado',
  VERSION: '0.8.9.6',
  AMBIENTE: 'DESARROLLO', // DESARROLLO | PRODUCCION
  SPREADSHEET_ID: '1OEV2za6VbPG7CHU4Pd71Nzi4smy3eizqjrLCRq7UggE',
  TZ: 'America/Santiago'
};

// Son los diálogos/public-dialog y sidebars públicos. Fuente única usada por
// _pruS_menu/_pruS_plantillas (GAS) y _pruebas_dialogos_v087 (node).
// Todo `showModalDialog(output, TITULO)` DEBE llevar 2 argumentos; las
// sidebars usan showSidebar(output.setTitle(...)) (1 argumento, correcto).
//   tipo: 'modal' → Ui.showModalDialog(htmlEval, titulo)
//         'sidebar' → Ui.showSidebar(htmlEval.setTitle(titulo))
var UICFG_DIALOGOS = [
  { opener: 'UI_instalarSistema', plantilla: 'Instalador', tipo: 'modal' },
  { opener: 'UI_abrirLog', plantilla: 'LogVisor', tipo: 'modal' },
  { opener: 'UI_centroPruebas', plantilla: 'CentroPruebas', tipo: 'modal' },
  { opener: 'UI_abrirDashboard', plantilla: 'Dashboard', tipo: 'modal' },
  { opener: 'UI_configuracion', plantilla: 'Configuracion', tipo: 'modal' },
  { opener: 'UI_configuracionEstratificacion', plantilla: 'Configuracion', tipo: 'modal' },
  { opener: 'UI_configuracionResponsables', plantilla: 'Configuracion', tipo: 'modal' },
  { opener: 'UI_abrirControles', plantilla: 'Controles', tipo: 'modal' },
  { opener: 'UI_generarRem', plantilla: 'RemGenerador', tipo: 'modal' },
  { opener: 'UI_verRem', plantilla: 'RemVista', tipo: 'modal' },
  { opener: 'UI_backup', plantilla: 'Backup', tipo: 'modal' },
  { opener: 'UI_abrirAcercaDe', plantilla: 'AcercaDe', tipo: 'modal' },
  { opener: 'UI_panelControl', plantilla: 'Sidebar', tipo: 'sidebar' },
  { opener: 'UI_abrirBuscador', plantilla: 'Sidebar', tipo: 'sidebar' },
  { opener: 'UI_abrirRevision', plantilla: 'Sidebar', tipo: 'sidebar' },
  { opener: 'UI_abrirFicha', plantilla: 'Sidebar', tipo: 'sidebar' }
];

// ---------------------------------------------------------------------------
// Hojas del sistema (DEC-013; inventario completo en MODELO-EVENTOS.md §7)
//   ETAPA 2 creó: CONFIG, PACIENTES, LOG, CONFLICTOS, FUENTES.
//   Las demás se crean en su etapa; NO todas automáticamente.
// ---------------------------------------------------------------------------
var HOJAS = {
  CONFIG: 'CONFIG',
  PACIENTES: 'PACIENTES',       // base consolidada (entidad, estado vigente)
  EVENTOS: 'EVENTOS',           // historial de actividad (ETAPA 3)
  STAGING_IMPORT: 'STAGING_IMPORT', // zona de importación controlada (ETAPA 3)
  LOG: 'LOG',
  CONFLICTOS: 'CONFLICTOS',
  FUENTES: 'FUENTES',
  PROFESIONALES: 'PROFESIONALES', // catálogo central de profesionales (fuente de verdad)
  RESPONSABLES: 'RESPONSABLES',   // responsables por sector (acumulables, hoja oculta)
  REM_SALIDA: 'REM_SALIDA',       // reporte REM generado (interna; la construye 14_REM.js)
  HOJA_PREDETERMINADA: 'Hoja 1' // la elimina el instalador solo si está vacía
};

// Columnas del catálogo central de profesionales (fuente de verdad para
// Dupla y validaciones; REM conserva el texto libre del evento).
var COLUMNAS_PROFESIONALES = ['CODIGO', 'NOMBRE', 'TIPO_ROL', 'ACTIVO'];

// Asociaciones responsables ↔ sector (modelo ACUMULABLE: un sector puede tener
// N responsables y un responsable puede estar en N sectores). SECTOR guarda el
// nombre corto ('AMARILLO'); CODIGO_RESPONSABLE enlaza al catálogo PROFESIONALES
// cuando aplica (o 'R_'+clave para responsables externos al catálogo).
var COLUMNAS_RESPONSABLES = ['SECTOR', 'CODIGO_RESPONSABLE', 'NOMBRE_RESPONSABLE', 'CORREO', 'ACTIVO'];

// Sectores geográficos sobre los que se asignan responsables (conjunto cerrado).
var SECTORES_RESPONSABLES = ['AMARILLO', 'NARANJO', 'VERDE'];

// ---------------------------------------------------------------------------
// Hojas de ingreso y vistas sectoriales (ETAPA 3b / corrección arquitectónica)
//   - Nombre OFICIAL: INGRESO_NARANJO (ortografía canónica); INGRESO_NARANJA
//     se mantiene como alias aceptado para compatibilidad.
//   - El sector NUNCA se digita: lo define la hoja.
//   - INGRESO_COLUMNAS es el CONTRATO ÚNICO compartido por instalador,
//     sembrador y adaptador (DEC-029).
// ---------------------------------------------------------------------------
var HOJAS_INGRESO = {
  'INGRESO_NARANJO': 'NARANJO',
  'INGRESO_NARANJA': 'NARANJO', // alias aceptado
  'INGRESO_AMARILLO': 'AMARILLO',
  'INGRESO_VERDE': 'VERDE'
};

var HOJAS_SECTOR = ['SECTOR_NARANJO', 'SECTOR_AMARILLO', 'SECTOR_VERDE'];

// ---------------------------------------------------------------------------
// CONTRATO FÍSICO DE HOJAS (v0.8.9.4 — NORMALIZACIÓN DEFINITIVA).
// LAYOUT_VISUAL: fila 1 = TÍTULO/IDENTIDAD · fila 2 = SECCIONES ·
//                fila 3 = ENCABEZADOS REALES (filtro nativo) · fila 4+ = DATOS.
// LAYOUT_SIMPLE: fila 1 = encabezados · fila 2+ = datos.
// Ningún módulo puede asumir "fila 1 = encabezados" ni "fila 3 = encabezados"
// de forma dispersa: debe consultar Modelo_headerRow()/Modelo_dataStartRow()
// o leer con Modelo_leerBloqueCabecera().
// ---------------------------------------------------------------------------
var CONTRATO_LAYOUT_VISUAL = { tituloRow: 1, seccionesRow: 2, encabezadosRow: 3, datosDesdeRow: 4 };
var CONTRATO_LAYOUT_SIMPLE = { tituloRow: 0, seccionesRow: 0, encabezadosRow: 1, datosDesdeRow: 2 };

// Hojas con diseño visual (título + secciones + encabezados en fila 3 + datos en 4+).
// Las restantes (EVENTOS, CONFLICTOS, CONFIG, FUENTES, LOG, PROFESIONALES,
// RESPONSABLES, CAT_VIGENCIA_EXAMENES, STAGING_IMPORT, REM_SALIDA, INICIO)
// usan LAYOUT_SIMPLE: encabezados en fila 1, datos desde fila 2.
var LAYOUT_HOJAS_VISUALES = [HOJAS.PACIENTES]
  .concat(Object.keys(HOJAS_INGRESO), HOJAS_SECTOR);

const INGRESO_COLUMNAS = [
  'NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)',
  'FECHA DE INGRESO', 'ESTRATIFICACION', 'DUPLA INGRESO', 'OBSERVACIONES',
  'ESTADO_INGRESO', 'NOTA_SISTEMA'
];

// Campos operativos que el usuario completa en una hoja de ingreso.
// ESTADO_INGRESO / NOTA_SISTEMA son columnas del SISTEMA (no se importan).
const CAMPOS_INGRESO_OPERATIVOS = [
  'NOMBRE', 'RUT', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS',
  'ESTRATIFICACION', 'FECHA_INGRESO', 'DUPLA_INGRESO', 'OBSERVACIONES'
];

// Columnas de la hoja EVENTOS (orden compartido por instalador y escritor)
var COLUMNAS_EVENTOS = [
  'ID_EVENTO', 'ID_INTERNO', 'RUT', 'NOMBRE', 'FECHA_EVENTO', 'TIPO_EVENTO',
  'SECTOR', 'RIESGO_G', 'PROFESIONAL', 'PROFESIONAL_TIPO', 'DESCRIPCION',
  'CANTIDAD', 'OBSERVACIONES', 'FUENTE', 'REGISTRADO_POR', 'FECHA_REGISTRO'
];

// Columnas de las vistas operativas SECTOR_* (derivadas de PACIENTES+EVENTOS,
// NUNCA bases independientes — corrección arquitectónica ETAPA 3b).
// ETAPA 4: + ID_INTERNO (enlace a ficha), SEXO, EDAD (derivada),
// ULTIMO_EVENTO (derivado de EVENTOS en el refresco).
var COLUMNAS_SECTOR_VISTA = [
  'ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'EDAD', 'TELEFONOS', 'RUT_DV_VALIDO',
  'ESTRATIFICACION', 'ESTADO', 'FECHA_INGRESO',
  'ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL', 'PROXIMO_CONTROL',
  'ULTIMO_EVENTO', 'OBSERVACIONES'
];

// ---------------------------------------------------------------------------
// DESIGN SYSTEM ECICEP v0.8.9.6 — ÚNICA ESPECIFICACIÓN VISUAL GLOBAL.
// Toda función visual (22_HojasVisual, 06_Modelo, 17_Hojas, 08_Dashboard,
// 14_REM, 20_Instalador) consume ESTA fuente. Prohibido repetir/derivar
// colores, tamaños, alturas o anchos arbitrariamente en los módulos.
//
// Paleta VIBRANTE pero COHERENTE: cada familia se construye sobre UN matiz
// (hue HSL) con luminancias descendentes. La diferencia entre hojas es el
// COLOR DE IDENTIDAD del sector, no una estructura visual distinta.
//   barra (identidad) → secciones → encabezados (mismo matiz, más claros).
//   El COLOR CLÍNICO (vigente/próximo/vencido) es independiente (ver ESTADOS).
// ---------------------------------------------------------------------------

// Tipografía: una única fuente por semántica (Parte 3).
const DESIGN_SYSTEM = {
  // --- Tipografía ---
  FUENTES: {
    encabezados: 'Arial',   // hojas de datos (lectura densa)
    titulo: 'Arial',        // barra de identidad
    dashboard: 'Inter',     // paneles HTML / REM
    inicio: 'Sora'          // INICIO (marca)
  },
  // --- Tamaños por nivel semántico (Parte 3/11) ---
  TIPOGRAFIA: {
    titulo: 12,      // barra de identidad (fila 1)
    seccion: 10,     // barra de sección (fila 2)
    encabezado: 12,  // fila de encabezados (fila 3)
    datos: 10,       // fila de datos
    nota: 9,         // notas guía / indicadores
    meta: 9,         // metadatos (REM, INICIO)
    indicador: 22    // valores KPI (INICIO)
  },
  // --- Alturas estándar (Parte 8) ---
  ALTURAS: {
    barra: 28,            // barra de identidad
    seccion: 26,          // barra de sección
    buscador: 24,         // (legacy, INICIO)
    encabezadoVisual: 42, // encabezados en hojas visuales
    encabezadoSimple: 30, // encabezados en hojas simples
    dato: 21              // fila de datos
  },
  // --- Alineación y envoltura comunes ---
  CENTRO: 'CENTER',
  MEDIO: 'MIDDLE',
  // --- Bordes ---
  BORDES: {
    titulo: '#D8DEE4',
    seccion: '#C9D2DA',
    datos: '#E2E8EE'
  },
  // --- Superficies (datos neutros, Parte 4 "datos: neutro") ---
  SUPERFICIE: {
    datos: '#FFFFFF',
    datosAlterno: '#F1F3F6',
    residuo: '#F4F6F8',        // restos de secciones previas (al limpiar)
    total: '#E5F1F2'           // filas de totales (REM, cuadros)
  },
  // --- Encabezados (Parte 6): especificación única, una fuente de verdad ---
  ENCABEZADOS: {
    fondo: '#0E5C68',       // barra de encabezado (idéntica en TODAS las hojas)
    tinta: '#FFFFFF',
    peso: 'bold',
    wrap: true,
    horizontal: 'CENTER',
    vertical: 'MIDDLE',
    borde: '#D8DEE4'
  },
  // --- MARCA del sistema (azul institution), usada en pestañas, INICIO, REM ---
  MARCA: {
    sistema: '#0E5C68',
    sistemaProfundo: '#0B3C49',
    sistemaBarra: '#0E4A5C',
    sistemaBorde: '#1B7A8A',
    sistemaClaro: '#3E8A96',
    agua: '#9FD8CF',        // acento teal claro (INICIO barra superior)
    gris: '#5B6472',
    muted: '#7E93A3',
    borde: '#C9D4DC',
    ventana: '#F7F8FA',
    blanco: '#FFFFFF',
    indicador: '#35C28F',   // acento verde de estado operativo
    tecnico: '#8A93A3',     // pestañas de hojas técnicas internas
    reporte: '#6B5CA8',     // pestaña del informe REM (única púrpura)
    texto: '#12242E'
  },
  // --- ESTADOS CLÍNICOS (Parte 5): independientes del color de organización.
  // Representan SOLO el estado del paciente (semáforo), jamás el sector. ---
  ESTADOS: {
    VENCIDO:  { fondo: '#F8D7DA', tinta: '#842029' }, // 🔴
    PROXIMO:  { fondo: '#FFF3CD', tinta: '#664D03' }, // 🟡
    VIGENTE:  { fondo: '#D4EDDA', tinta: '#0E6B45' }, // 🟢
    REVISION: { fondo: '#FBF3D6', tinta: '#664D03' },
    ERROR:    { fondo: '#FBE4E4', tinta: '#842029' },
    OK:       { fondo: '#E3F3EA', tinta: '#0E6B45' },
    ALERTA:   { fondo: '#FDE7B8', tinta: '#7A5400' },
    INFO:     { fondo: '#EAF3FA', tinta: '#0B3C49' }
  }
};

// Pestañas / identidad por familia (Parte 4) — profundidad constante por matiz.
const IDENTIDAD = {
  GENERAL: '#0E5C68',        // azul de sistema (PACIENTES, EVENTOS)
  AMARILLO: '#C79A00',
  NARANJO: '#E8730A',
  VERDE: '#2E8B57'
};

// Rampas vibrantes por familia: barra → secciones → encabezados, mismas
// luminancias relativas para que TODAS las hojas luzcan del mismo sistema.
const RAMPA = (function () {
  function hex(h, s, L) {
    s /= 100; L /= 100;
    var c = (1 - Math.abs(2 * L - 1)) * s;
    var hp = (h % 360) / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
    var m = L - c / 2;
    function p(v) { var t = Math.round((v + m) * 255).toString(16).toUpperCase(); return t.length < 2 ? '0' + t : t; }
    return '#' + p(r) + p(g) + p(b);
  }
  var fam = {
    GENERAL: { h: 200, s: 72, barra: 57, A: 66, B: 72, C: 69, enc: 85 },
    AMARILLO: { h: 42, s: 85, barra: 57, A: 66, B: 72, C: 69, enc: 85 },
    NARANJO: { h: 27, s: 85, barra: 57, A: 66, B: 72, C: 69, enc: 85 },
    VERDE: { h: 152, s: 62, barra: 57, A: 66, B: 72, C: 69, enc: 85 }
  };
  var out = {};
  Object.keys(fam).forEach(function (f) {
    var c = fam[f];
    out[f] = {
      barra: hex(c.h, c.s, c.barra),
      seccion: [hex(c.h, c.s, c.A), hex(c.h, c.s, c.B), hex(c.h, c.s, c.C)],
      encabezado: hex(c.h, c.s, c.enc)
    };
  });
  return out;
})();

// Tinta sobre superficies tintadas (contraste ≥4.5:1 en todas las rampas).
const TINTA_SECCION = '#0B3C49';

// Tinta del texto de DATOS y de títulos sobre superficies claras/medias.
const TINTA_DATOS = '#12242E';

// Colores de las BARRAS DE SECCIÓN (fila 2). Para las hojas de SECTOR se usa
// la rampa de la familia (ver PALETA_SECCION); para PACIENTES/EVENTOS, la
// familia GENERAL (azul de sistema) con variantes de luminancia por sección.
const COLORES_SECCION = {
  IDENTIDAD: RAMPA.GENERAL.seccion[0],
  DATOS_PERSONALES: RAMPA.GENERAL.seccion[0],
  IDENTIFICACION: RAMPA.GENERAL.seccion[2],
  SECTORIZACION: RAMPA.GENERAL.seccion[1],
  ESTRATIFICACION: RAMPA.GENERAL.seccion[2],
  INGRESO: RAMPA.GENERAL.seccion[2],
  CONTROLES: RAMPA.GENERAL.seccion[2],
  CONTROLES_SEGUIMIENTO: RAMPA.GENERAL.seccion[2],
  CLINICO: RAMPA.GENERAL.seccion[1],
  TECNICO: RAMPA.GENERAL.seccion[1],
  OBSERVACIONES: RAMPA.GENERAL.seccion[1],
  EVENTO: RAMPA.GENERAL.seccion[2],
  AUDITORIA: RAMPA.GENERAL.seccion[1]
};

// Identificación de las hojas (fila 1, barra de título): familia del sector.
// PACIENTES/EVENTOS = azul de sistema (GENERAL). Las secciones internas de
// SECTOR_*/INGRESO_* derivan de la MISMA familia por sector (Parte 4/13/14).
const COLORES_SECTOR = {
  AMARILLO: RAMPA.AMARILLO.barra,
  NARANJO: RAMPA.NARANJO.barra,
  VERDE: RAMPA.VERDE.barra,
  PACIENTES: RAMPA.GENERAL.barra,
  EVENTOS: RAMPA.GENERAL.barra,
  DEFECTO: RAMPA.GENERAL.barra
};

// Rampas internas de SECTOR_*/INGRESO_* (barra + secciones + encabezado) por
// familia: cada hoja queda monocromática dentro de su sector y coherente con
// las demás hojas del mismo sector (Parte 4).
const PALETA_SECCION = {
  AMARILLO: {
    barra: RAMPA.AMARILLO.barra,
    seccion: RAMPA.AMARILLO.seccion,
    encabezado: RAMPA.AMARILLO.encabezado
  },
  NARANJO: {
    barra: RAMPA.NARANJO.barra,
    seccion: RAMPA.NARANJO.seccion,
    encabezado: RAMPA.NARANJO.encabezado
  },
  VERDE: {
    barra: RAMPA.VERDE.barra,
    seccion: RAMPA.VERDE.seccion,
    encabezado: RAMPA.VERDE.encabezado
  }
};

// Tamaños ESTANDARIZADOS de las barras superiores (Parte 3). Consume
// DESIGN_SYSTEM.TIPOGRAFIA (una sola fuente de verdad).
const PULIDO_BARRAS = {
  titulo: DESIGN_SYSTEM.TIPOGRAFIA.titulo,
  seccion: DESIGN_SYSTEM.TIPOGRAFIA.seccion
};

// Parámetros de diseño de la fila de ENCABEZADOS (Parte 6). Consume
// DESIGN_SYSTEM (tipografía + alturas). Ya no hay hex dispersos en los módulos.
// La fila de encabezados es UNIFORME en todas las hojas: fondo sistema con
// tinta blanca (una sola especificación; el color de identidad vive en la
// barra 1 y las secciones 2).
const PULIDO_ENCABEZADO = {
  fuente: DESIGN_SYSTEM.TIPOGRAFIA.encabezado,
  peso: DESIGN_SYSTEM.ENCABEZADOS.peso,
  wrap: DESIGN_SYSTEM.ENCABEZADOS.wrap,
  tinta: DESIGN_SYSTEM.ENCABEZADOS.tinta,
  fondo: DESIGN_SYSTEM.ENCABEZADOS.fondo,
  alturaVisual: DESIGN_SYSTEM.ALTURAS.encabezadoVisual, // 42
  alturaSimple: DESIGN_SYSTEM.ALTURAS.encabezadoSimple, // 30
  alturaDato: DESIGN_SYSTEM.ALTURAS.dato            // 21
};

// Anchos de columna por tipo de campo (Parte 2.4/2.5): el primer patrón que
// coincida por substring (en orden) gana. 'NOMBRE' amplio para lectura;
// campos técnicos compactos; fechas con ancho para 'dd/MM/yyyy'.
const ANCHOS_COLUMNA = [
  { clave: 'NOMBRE_NORMALIZADO', ancho: 150 },
  { clave: 'NOMBRE', ancho: 240 },
  { clave: 'RUT', ancho: 110 },
  { clave: 'ID_INTERNO', ancho: 135 },
  { clave: 'ID_EVENTO', ancho: 135 },
  { clave: 'ID_PROVISIONAL', ancho: 150 },
  { clave: 'FECHA', ancho: 110 },
  { clave: 'TELEFON', ancho: 135 },
  { clave: 'OBSERVACION', ancho: 270 },
  { clave: 'ESTRATIFICACION', ancho: 130 },
  { clave: 'ESTRAT_', ancho: 130 },
  { clave: 'PROXIMO_CONTROL', ancho: 115 },
  { clave: 'ULTIMO', ancho: 115 },
  { clave: 'COMPOSICION_CONTROL', ancho: 150 },
  { clave: 'CONDICIONES', ancho: 200 },
  { clave: 'PATOLOG', ancho: 220 },
  { clave: 'DUPLA', ancho: 150 },
  { clave: 'PROFESIONAL', ancho: 165 },
  { clave: 'EMAIL', ancho: 180 },
  { clave: 'CORREO', ancho: 180 },
  { clave: 'DESCRIPCION', ancho: 220 },
  { clave: 'NOTA', ancho: 210 },
  { clave: 'DETALLE', ancho: 210 },
  { clave: 'NORMALIZADO', ancho: 170 },
  { clave: 'ERRORES', ancho: 170 },
  { clave: 'WARNINGS', ancho: 170 },
  { clave: 'VALORES_ORIGINALES', ancho: 180 },
  { clave: 'IDENTIFICACION', ancho: 170 },
  { clave: 'ARCHIVO', ancho: 180 },
  { clave: 'FUENTE', ancho: 170 },
  { clave: 'HOJAS', ancho: 160 },
  { clave: 'EXAMEN', ancho: 170 },
  { clave: 'VIGENCIA', ancho: 100 },
  { clave: 'UNIDAD', ancho: 90 },
  { clave: 'ACTIVO', ancho: 80 },
  { clave: 'CODIGO', ancho: 100 },
  { clave: 'CLAVE', ancho: 160 },
  { clave: 'VALOR', ancho: 360 },
  { clave: 'SECTOR', ancho: 100 },
  { clave: 'SEXO', ancho: 55 },
  { clave: 'EDAD', ancho: 55 },
  { clave: 'ESTADO', ancho: 125 },
  { clave: 'TIPO', ancho: 100 },
  { clave: 'REGISTRO', ancho: 115 },
  { clave: 'DEFAULT', ancho: 130 }
];

// ---------------------------------------------------------------------------
// TERMINOLOGÍA OFICIAL v0.8.9.5 (Parte 6): diccionario de términos del
// proyecto. Regla: un término por contexto; NO alternar sinónimos en la
// misma funcionalidad.
//   PACIENTE    → entidad de atención (base PACIENTES, ficha, estratificación)
//   PERSONA     → término genérico de navegación (menú "Personas")
//   INGRESO     → entrada de un paciente por la puerta de un sector
//   CONTROL     → control clínico registrado (EVENTOS)
//   SEGUIMIENTO → seguimiento a distancia registrado (EVENTOS)
//   ESTRATIFICACIÓN → nivel de riesgo G1/G2/G3 (con tilde en UI)
//   RESPONSABLE → profesional/equipo que responde por un sector
//   SECTOR      → zona territorial del CESFAM (NARANJO/AMARILLO/VERDE)
// ---------------------------------------------------------------------------
const TERMINOLOGIA = {
  PACIENTE: 'PACIENTE',
  PERSONA: 'PERSONA',
  INGRESO: 'INGRESO',
  CONTROL: 'CONTROL',
  SEGUIMIENTO: 'SEGUIMIENTO',
  ESTRATIFICACION: 'ESTRATIFICACIÓN',
  RESPONSABLE: 'RESPONSABLE',
  SECTOR: 'SECTOR',
  ETIQUETAS: {
    BUSCAR: 'Buscar paciente',
    FICHA: 'Ficha del paciente',
    COLAREVISION: 'Cola de revisión',
    PROCESAR: 'Procesar ingresos',
    CONTROLES: 'Controles por persona'
  }
};

// ---------------------------------------------------------------------------
// Configuración declarativa de secciones visuales por tipo de hoja.
// Cada sección agrupa columnas reales existentes; NO inventa columnas.
// Las claves de columna deben coincidir exactamente con los modelos.
// Los colores DE ORGANIZACIÓN se toman de COLORES_SECCION (nunca de las
// familias semánticas clínicas de las filas).
// ---------------------------------------------------------------------------
const SECCIONES_HOJAS = {
  INGRESO: [
    {
      id: 'datosPersonales',
      nombre: 'DATOS PERSONALES',
      color: COLORES_SECCION.DATOS_PERSONALES,
      columnas: ['NOMBRE', 'RUT', 'SEXO', 'FECHA DE NACIMIENTO', 'TELEFONO(S)']
    },
    {
      id: 'identificacion',
      nombre: 'IDENTIFICACIÓN',
      color: COLORES_SECCION.IDENTIFICACION,
      columnas: ['FECHA DE INGRESO', 'ESTADO_INGRESO', 'NOTA_SISTEMA']
    },
    {
      id: 'sectorizacion',
      nombre: 'SECTORIZACIÓN',
      color: COLORES_SECCION.SECTORIZACION,
      columnas: ['ESTRATIFICACION']
    },
    {
      id: 'controlesSeguimiento',
      nombre: 'CONTROLES / SEGUIMIENTO',
      color: COLORES_SECCION.CONTROLES,
      columnas: ['DUPLA INGRESO', 'OBSERVACIONES']
    }
  ],
  PACIENTES: [
    {
      id: 'identidad',
      nombre: 'IDENTIDAD',
      color: COLORES_SECCION.IDENTIDAD,
      columnas: ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'FECHA_NACIMIENTO', 'TELEFONOS', 'TELEFONO_OBS']
    },
    {
      id: 'sectorizacion',
      nombre: 'SECTORIZACIÓN',
      color: COLORES_SECCION.SECTORIZACION,
      columnas: ['SECTOR', 'ESTRATIFICACION', 'ESTADO']
    },
    {
      id: 'ingreso',
      nombre: 'INGRESO',
      color: COLORES_SECCION.INGRESO,
      columnas: ['DUPLA_INGRESO', 'PROFESIONAL_SEGUIMIENTO', 'PREINGRESO', 'FECHA_INGRESO']
    },
    {
      id: 'controles',
      nombre: 'CONTROLES',
      color: COLORES_SECCION.CONTROLES,
      columnas: ['ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL', 'PROXIMO_CONTROL', 'COMPOSICION_CONTROL']
    },
    {
      id: 'clinico',
      nombre: 'CLÍNICO',
      color: COLORES_SECCION.CLINICO,
      columnas: ['CONDICIONES', 'OTRAS_PATOLOGIAS', 'OBSERVACIONES']
    },
    {
      id: 'tecnico',
      nombre: 'TÉCNICO',
      color: COLORES_SECCION.TECNICO,
      columnas: ['NOMBRE_NORMALIZADO', 'RUT_DV_VALIDO', 'RUT_SIN_DV', 'ESTRAT_ORIGEN', 'ESTRAT_CALCULADA', 'ESTRAT_FECHA_CALCULO', 'FUENTE', 'FECHA_ACTUALIZACION', 'REQUIERE_REVISION']
    }
  ],
  SECTOR_VISTA: [
    {
      id: 'identidad',
      nombre: 'IDENTIDAD',
      color: COLORES_SECCION.IDENTIDAD,
      columnas: ['ID_INTERNO', 'RUT', 'NOMBRE', 'SEXO', 'EDAD', 'TELEFONOS', 'RUT_DV_VALIDO']
    },
    {
      id: 'sectorizacion',
      nombre: 'SECTORIZACIÓN',
      color: COLORES_SECCION.SECTORIZACION,
      columnas: ['ESTRATIFICACION', 'ESTADO', 'FECHA_INGRESO']
    },
    {
      id: 'controles',
      nombre: 'CONTROLES',
      color: COLORES_SECCION.CONTROLES,
      columnas: ['ULTIMO_SEGUIMIENTO', 'ULTIMO_CONTROL', 'PROXIMO_CONTROL', 'ULTIMO_EVENTO']
    },
    {
      id: 'observaciones',
      nombre: 'OBSERVACIONES',
      color: COLORES_SECCION.TECNICO,
      columnas: ['OBSERVACIONES']
    }
  ],
  EVENTOS: [
    {
      id: 'evento',
      nombre: 'EVENTO',
      color: COLORES_SECCION.CONTROLES,
      columnas: ['ID_EVENTO', 'TIPO_EVENTO', 'FECHA_EVENTO', 'DESCRIPCION', 'CANTIDAD', 'OBSERVACIONES']
    },
    {
      id: 'identidad',
      nombre: 'IDENTIDAD',
      color: COLORES_SECCION.IDENTIDAD,
      columnas: ['ID_INTERNO', 'RUT', 'NOMBRE', 'SECTOR']
    },
    {
      id: 'clinico',
      nombre: 'CLÍNICO',
      color: COLORES_SECCION.CLINICO,
      columnas: ['RIESGO_G', 'PROFESIONAL', 'PROFESIONAL_TIPO']
    },
    {
      id: 'auditoria',
      nombre: 'AUDITORÍA',
      color: COLORES_SECCION.TECNICO,
      columnas: ['FUENTE', 'REGISTRADO_POR', 'FECHA_REGISTRO']
    }
  ]
};

// Hojas que reciben el sistema visual (prioritarias).
var HOJAS_CON_SECCIONES = [
  'INGRESO_NARANJO', 'INGRESO_AMARILLO', 'INGRESO_VERDE',
  'PACIENTES',
  'SECTOR_NARANJO', 'SECTOR_AMARILLO', 'SECTOR_VERDE',
  'EVENTOS'
];

// Mapeo hoja → tipo de secciones
const TIPO_SECCIONES_POR_HOJA = {
  'INGRESO_NARANJO': 'INGRESO',
  'INGRESO_AMARILLO': 'INGRESO',
  'INGRESO_VERDE': 'INGRESO',
  'PACIENTES': 'PACIENTES',
  'SECTOR_NARANJO': 'SECTOR_VISTA',
  'SECTOR_AMARILLO': 'SECTOR_VISTA',
  'SECTOR_VERDE': 'SECTOR_VISTA',
  'EVENTOS': 'EVENTOS'
};

// Claves de búsqueda válidas por hoja (para buscador rápido)
const CLAVES_BUSQUEDA_POR_HOJA = {
  'INGRESO_NARANJO': ['RUT', 'NOMBRE'],
  'INGRESO_AMARILLO': ['RUT', 'NOMBRE'],
  'INGRESO_VERDE': ['RUT', 'NOMBRE'],
  'PACIENTES': ['ID_INTERNO', 'RUT', 'NOMBRE'],
  'SECTOR_NARANJO': ['ID_INTERNO', 'RUT', 'NOMBRE'],
  'SECTOR_AMARILLO': ['ID_INTERNO', 'RUT', 'NOMBRE'],
  'SECTOR_VERDE': ['ID_INTERNO', 'RUT', 'NOMBRE'],
  'EVENTOS': ['ID_EVENTO', 'ID_INTERNO', 'RUT', 'NOMBRE']
};

// Marcador que identifica inequívocamente datos ficticios (limpieza 4.0)
const MARCA_DATOS_PRUEBA = 'DATOS DE PRUEBA';

// ---------------------------------------------------------------------------
// Sectores geográficos (permanentes) — DEC-018
//   Son división territorial del CESFAM, NO niveles de riesgo.
//   La estratificación G1/G2/G3 es otra dimensión completamente independiente.
//   Canonical interno = NARANJO (así lo escriben las fuentes); "NARANJA"
//   aceptado como alias de entrada hasta confirmar rotulación oficial (#12).
// ---------------------------------------------------------------------------
const SECTORES = {
  OPERATIVOS: ['NARANJO', 'AMARILLO', 'VERDE'],
  VALIDOS: ['NARANJO', 'AMARILLO', 'VERDE', 'MULTIPLE'], // MULTIPLE solo transitorio del sistema
  ALIAS: {
    'NARANJA': 'NARANJO'
  },
  POR_ARCHIVO: {
    'SEGUIMIENTO ECICEP SECTOR AMARILLO': 'AMARILLO',
    'ECICEP NARANJO': 'NARANJO',
    'PCTS. ECICEP DESDE 2023': 'VERDE'
  }
};

// ---------------------------------------------------------------------------
// Fuentes reales (Drive) — IDs de los spreadsheets de origen
// ---------------------------------------------------------------------------
const FUENTES_DRIVE = {
  'SEGUIMIENTO ECICEP Sector Amarillo': {
    id: '1iAVwLW2JXf-hYKwZVWZvhGzbX6z21WAzCCWHUef8Zto',
    sector: 'AMARILLO',
    hojas: ['INGRESOS ECICEP']
  },
  'ECICEP NARANJO': {
    id: '17cNcOTdn8qupYchtc10ouMG45ve_BpaZZmTGEdos-4Q',
    sector: 'NARANJO',
    hojas: ['LISTADO 2025', 'Ingresos 2025 - 2026', 'Ingresos Enero ', 'Ingreso Febrero']
  },
  'PCTS. ECICEP DESDE 2023': {
    id: '1T9a8Z85iIvjZU1mq2wbGPTgrJo48e-CdkP95p5d0lSE',
    sector: 'VERDE',
    hojas: ['PLANILLA ECICEP SECTOR VERDE', 'PLANILLA PRE INGRESOS', 'GESTOR DE CASO', 'CONTROLES PENDIENTES', 'INASISTENTES A INGRESOS'],
    excluir: ['NO LLENAR'] // duplicado histórico (DEC-009)
  }
};

// Hojas autorizadas para la primera carga real controlada (ETAPA 5)
// Las excluidas (LISTADO 2025, INASISTENTES, GESTOR DE CASO) NO se procesan.
var HOJAS_AUTORIZADAS_CARGA = {
  'ECICEP NARANJO': ['Ingresos Enero ', 'Ingreso Febrero', 'Ingresos 2025 - 2026'],
  'PCTS. ECICEP DESDE 2023': ['PLANILLA ECICEP SECTOR VERDE', 'PLANILLA PRE INGRESOS', 'CONTROLES PENDIENTES']
};

const FUENTES_EXCLUIDAS = [
  { fuente: 'LISTADO 2025', motivo: 'RUTs sin DV — requieren tratamiento específico', condicion: 'Completar DVs o resolver vía cola de revisión' },
  { fuente: 'INASISTENTES A INGRESOS', motivo: 'Sin encabezados compatibles', condicion: 'Definir estructura o mapeo manual' },
  { fuente: 'GESTOR DE CASO', motivo: 'Flujo diferente al ingreso estándar ECICEP', condicion: 'Analizar modelo de eventos para gestión de casos' }
];

const TIPOS_EVENTO = {
  VALIDOS: [
    'INGRESO', 'CONTROL', 'SEGUIMIENTO', 'PLAN_CUIDADO',
    'GESTION_CASO_INGRESO', 'GESTION_CASO_EGRESO', 'EGRESO',
    'CAMBIO_SECTOR', 'CAMBIO_ESTRATIFICACION', 'LLAMADO', 'OTRO'
  ],
  SINONIMOS: {
    'PLAN DE CUIDADO': 'PLAN_CUIDADO',
    'PLAN': 'PLAN_CUIDADO',
    'GESTION DE CASO INGRESO': 'GESTION_CASO_INGRESO',
    'GESTION CASOS INGRESO': 'GESTION_CASO_INGRESO',
    'INGRESO GESTION DE CASO': 'GESTION_CASO_INGRESO',
    'GESTION DE CASO EGRESO': 'GESTION_CASO_EGRESO',
    'GESTION CASOS EGRESO': 'GESTION_CASO_EGRESO',
    'EGRESO GESTION DE CASO': 'GESTION_CASO_EGRESO',
    'SEGUIMIENTO A DISTANCIA': 'SEGUIMIENTO',
    'CAMBIO DE SECTOR': 'CAMBIO_SECTOR',
    'CAMBIO DE ESTRATIFICACION': 'CAMBIO_ESTRATIFICACION'
  }
};

const ESTADOS_INGRESO = {
  VALIDOS: ['PENDIENTE', 'VALIDANDO', 'LISTO', 'INGRESADO', 'DUPLICADO', 'REQUIERE_REVISION', 'ERROR']
};

// ---------------------------------------------------------------------------
// Sexo (REM lo requiere; fuentes actuales no lo traen)
// ---------------------------------------------------------------------------
const SEXOS = {
  VALIDOS: ['M', 'F', 'OTRO'],
  SINONIMOS: {
    'MASCULINO': 'M', 'HOMBRE': 'M', 'VARON': 'M',
    'FEMENINO': 'F', 'MUJER': 'F'
  }
};

// ---------------------------------------------------------------------------
// Modelo canónico del paciente v2 (orden = columnas en PACIENTES)
//   tecnico:true → columna técnica (agrupada/oculta al usuario)
//   Estado VIGENTE = caché derivada de EVENTOS (ver MODELO-EVENTOS.md §3)
// ---------------------------------------------------------------------------
var MODELO_PACIENTE = [
  { campo: 'ID_INTERNO',             tipo: 'id',     obligatorio: true,  tecnico: true,  descripcion: 'Identificador interno estable generado por el sistema', regla: 'EC-<base36 tiempo>-<aleatorio>' },
  { campo: 'RUT',                    tipo: 'texto',  obligatorio: true,  tecnico: false, descripcion: 'RUT normalizado cuerpo-DV', regla: 'Norm_normalizarRut: sin puntos, DV mayúscula; sin DV en fuente → solo cuerpo con bandera RUT_SIN_DV' },
  { campo: 'NOMBRE',                 tipo: 'texto',  obligatorio: true,  tecnico: false, descripcion: 'Nombre del paciente', regla: 'Mayúsculas, espacios colapsados, conserva tildes' },
  { campo: 'SEXO',                   tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Sexo registrado (REM)', regla: 'M | F | OTRO | vacío' },
  { campo: 'FECHA_NACIMIENTO',       tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha de nacimiento (base de EDAD/tramos derivados para REM)', regla: 'ISO yyyy-MM-dd' },
  { campo: 'TELEFONOS',              tipo: 'lista',  obligatorio: false, tecnico: false, descripcion: 'Teléfonos normalizados', regla: 'Separados por "/" sin espacios; prefijo país 56 removido' },
  { campo: 'TELEFONO_OBS',           tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Anotaciones del teléfono original (ej: familiar que contesta)', regla: 'Texto libre tal cual la fuente' },
  { campo: 'SECTOR',                 tipo: 'enum',   obligatorio: true,  tecnico: false, descripcion: 'Sector territorial VIGENTE (dimensión independiente de G)', regla: 'NARANJO | AMARILLO | VERDE | MULTIPLE (transitorio)' },
  { campo: 'ESTRATIFICACION',        tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Estratificación VIGENTE: prioridad según cantidad de patologías', regla: 'G1 | G2 | G3 | vacío ("G" sola/NSP quedan vacíos hasta confirmación)' },
  { campo: 'ESTADO',                 tipo: 'enum',   obligatorio: false, tecnico: false, descripcion: 'Estado canónico del paciente en el flujo ECICEP', regla: 'Ver ESTADOS.VALIDOS' },
  { campo: 'DUPLA_INGRESO',          tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Dupla médico+profesional del ingreso', regla: 'Texto normalizado libre' },
  { campo: 'PROFESIONAL_SEGUIMIENTO',tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Profesional asignado al seguimiento', regla: 'Texto normalizado libre' },
  { campo: 'PREINGRESO',             tipo: 'fecha|texto', obligatorio: false, tecnico: false, descripcion: 'Fecha de preingreso o su estado (NO_APLICA, PENDIENTE)', regla: 'Fecha ISO si es parseable; si no, texto de estado en mayúsculas' },
  { campo: 'FECHA_INGRESO',          tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Fecha de ingreso a ECICEP', regla: 'ISO yyyy-MM-dd; inválida → vacío + REQUIERE_REVISION' },
  { campo: 'ULTIMO_SEGUIMIENTO',     tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Caché del último EVENTO SEGUIMIENTO', regla: 'ISO yyyy-MM-dd' },
  { campo: 'ULTIMO_CONTROL',         tipo: 'fecha',  obligatorio: false, tecnico: false, descripcion: 'Caché del último EVENTO CONTROL', regla: 'ISO yyyy-MM-dd' },
  { campo: 'PROXIMO_CONTROL',        tipo: 'fecha|texto', obligatorio: false, tecnico: false, descripcion: 'Próximo control agendado', regla: 'ISO si es parseable; si no, texto tal cual + flag' },
  { campo: 'COMPOSICION_CONTROL',    tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Composición del próximo control (M+E, M+N, M/PS...)', regla: 'Texto normalizado libre' },
  { campo: 'OBSERVACIONES',          tipo: 'texto',  obligatorio: false, tecnico: false, descripcion: 'Observaciones libres', regla: 'Texto conservado' },
  { campo: 'CONDICIONES',            tipo: 'lista',  obligatorio: false, tecnico: true,  descripcion: 'Patologías ECICEP seleccionadas del catálogo', regla: 'Códigos canónicos separados por ";" — provienen de CATALOGO_CONDICIONES_ECICEP' },
  { campo: 'OTRAS_PATOLOGIAS',       tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Otras condiciones NO incluidas en catálogo ECICEP', regla: 'Texto libre separado por salto de línea; no reciben ponderación automática' },
  { campo: 'NOMBRE_NORMALIZADO',     tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Nombre sin tildes para búsqueda y matching', regla: 'Utl_sinTildes(NOMBRE)' },
  { campo: 'RUT_DV_VALIDO',          tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'false → DV incorrecto según módulo 11', regla: 'Norm_validarRut' },
  { campo: 'RUT_SIN_DV',             tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'true → la fuente no traía DV (ej: LISTADO Naranjo)', regla: 'Norm_normalizarRut' },
  { campo: 'ESTRAT_ORIGEN',          tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Valor original de la fuente para comparar vs calculada', regla: 'Conservado tal cual' },
  { campo: 'ESTRAT_CALCULADA',       tipo: 'texto',  obligatorio: false, tecnico: true,  descripcion: 'Salida del motor de estratificación', regla: 'G1|G2|G3|"" (motor apagado hasta regla oficial)' },
  { campo: 'ESTRAT_FECHA_CALCULO',   tipo: 'fecha',  obligatorio: false, tecnico: true,  descripcion: 'Fecha del cálculo y versión de regla aplicada', regla: 'ISO con hora' },
  { campo: 'FUENTE',                 tipo: 'texto',  obligatorio: true,  tecnico: true,  descripcion: 'Origen exacto de cada dato consolidado', regla: '"archivo|hoja|fila" separados por ";" si hay múltiples' },
  { campo: 'FECHA_ACTUALIZACION',    tipo: 'fecha',  obligatorio: true,  tecnico: true,  descripcion: 'Última modificación hecha por el sistema', regla: 'ISO con hora' },
  { campo: 'REQUIERE_REVISION',      tipo: 'bool',   obligatorio: false, tecnico: true,  descripcion: 'Marca de calidad: conflictos, fechas inválidas, DV erróneo, discrepancia G', regla: 'La asigna integración/consolidación/motor' }
];

// Columnas de fecha en formato hoja (dd/MM/yyyy al instalar)
const MODELO_COLUMNAS_FECHA = [
  'PREINGRESO', 'FECHA_NACIMIENTO', 'FECHA_INGRESO', 'ULTIMO_SEGUIMIENTO',
  'ULTIMO_CONTROL', 'PROXIMO_CONTROL', 'ESTRAT_FECHA_CALCULO', 'FECHA_ACTUALIZACION'
];

// ---------------------------------------------------------------------------
// Estados canónicos del paciente (PENDIENTES #6: lista cerrada por confirmar;
// variantes detectadas en levantamiento ya mapeadas)
// ---------------------------------------------------------------------------
const ESTADOS = {
  VALIDOS: ['PENDIENTE', 'AGENDADO', 'INGRESADO', 'NO_CONTESTA', 'FALLECIDO', 'NSP'],
  SINONIMOS: {
    'INGRESADA': 'INGRESADO',
    'INGRESADAO': 'INGRESADO',
    'INGREASO': 'INGRESADO',
    'FALLECIDA': 'FALLECIDO',
    'NO CONTESTA': 'NO_CONTESTA',
    'N/C': 'NO_CONTESTA',
    'NC': 'NO_CONTESTA'
  }
};

// ---------------------------------------------------------------------------
// Sinónimos de encabezados (solo equivalencias CONFIRMADAS en levantamiento,
// ver FUENTES-DATOS.md §4). Claves comparadas vía Utl_claveAlnum.
// Equivalencias ambiguas NO van aquí: DUPLA (LISTADO Naranjo = disciplina),
// PROFESIONAL mezclada (Naranjo), COLUMN 12, COLUMNA 1, EVALUACIÓN DE PIE,
// ASISTENCIA, PATOLOGIAS, QUIEN DERIVA, MOTIVO, FECHA DE LLAMADO (→ eventos).
// ---------------------------------------------------------------------------
const SINONIMOS_ENCABEZADOS = {
  'NOMBRE': 'NOMBRE',
  'NOMBRES': 'NOMBRE',
  'USUARIO': 'NOMBRE',
  'NOMBRE PACIENTE': 'NOMBRE',
  'RUT': 'RUT',
  'SEXO': 'SEXO',
  'TELEFONO': 'TELEFONO',
  'TELEFONOS': 'TELEFONO',
  'FONO': 'TELEFONO',
  'CELULAR': 'TELEFONO',
  'ESTRATIFICACION': 'ESTRATIFICACION',
  'G': 'ESTRATIFICACION',            // confirmado: encabezado "G" en Sector Amarillo
  'PREINGRESO': 'PREINGRESO',
  'PRE INGRESO': 'PREINGRESO',
  'INGRESO': 'FECHA_INGRESO',        // confirmado: Amarillo usa INGRESO como fecha
  'FECHA DE INGRESO': 'FECHA_INGRESO',
  'FECHA INGRESO': 'FECHA_INGRESO',
  'J': 'FECHA_INGRESO',              // confirmado: encabezado "J" en Naranjo consolidada
  'FECHA NACIMIENTO': 'FECHA_NACIMIENTO',
  'FECHA DE NACIMIENTO': 'FECHA_NACIMIENTO',
  'DUPLA INGRESO': 'DUPLA_INGRESO',
  'MEDICO DUPLA': 'DUPLA_INGRESO',   // "MEDICO /DUPLA" tras quitar puntuación
  'SEGUIMIENTO': 'ULTIMO_SEGUIMIENTO',
  'SEGUIMIENTO TELEFONICO': 'ULTIMO_SEGUIMIENTO',
  'CONTROL': 'ULTIMO_CONTROL',
  'PROXIMO CONTROL': 'PROXIMO_CONTROL',
  'FECHA PROX CONTROL': 'PROXIMO_CONTROL',
  'PROXIMA FECHA CONTROL': 'PROXIMO_CONTROL',
  'PROFESIONAL': 'PROFESIONAL_SEGUIMIENTO',
  'PREFESIONAL': 'PROFESIONAL_SEGUIMIENTO', // typo confirmado en Verde (preingresos)
  'OBSERVACIONES': 'OBSERVACIONES',
  'OTROS': 'OBSERVACIONES',
  'OBSERVACION': 'OBSERVACIONES'
};

// Encabezados presentes en las fuentes pero aún sin destino definido
// (PENDIENTES #4/#11/#15): conocidos-pero-sin-mapeo.
const ENCABEZADOS_SIN_DESTINO = [
  'DUPLA', 'COLUMN 12', 'COLUMNA 1', 'EVALUACION DE PIE', 'ASISTENCIA',
  'PATOGIAS', 'PATOLOGIAS', 'QUIEN DERIVA', 'MOTIVO', 'FECHA',
  'OBSERVACION EXAMENES SOLICITADOS', 'OBSERVACION PENDIENTE',
  'MEDICO DUPLA INGRESO', 'ESTATIFICACION', 'FECHA DE LLAMADO'
];

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------
var CFG_FECHAS = {
  ANO_MIN: 2015,           // eventos: fuera de rango → fecha inválida (no se corrige en silencio)
  ANO_MAX: 2040,
  ANO_MIN_NACIMIENTO: 1900, // fechas de nacimiento admiten años mucho más antiguos
  FORMATO_HOJA: 'dd/MM/yyyy',
  ZONA: ECICEP.TZ
};

// ---------------------------------------------------------------------------
// Estratificación automática (ESTRATIFICACION.md)
//   REGLA_DISPONIBLE=false hasta recibir tabla oficial cantidad→G. Motor APAGADO.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Estratificación automática (ESTRATIFICACION.md)
//   REGLA_DISPONIBLE=false hasta recibir tabla oficial. Motor APAGADO.
//   El catálogo de condiciones y sus ponderaciones son DATOS, no código.
//   Cuando llegue la regla oficial del programa ECICEP, reemplazar el catálogo.
// ---------------------------------------------------------------------------
var CFG_ESTRATIFICACION = {
  REGLA_DISPONIBLE: true,
  VERSION_REGLA: 'v1.0-MINSAL',
  MOTIVO_SIN_REGLA: '',
  // Regla por PUNTAJE PONDERADO (no simple conteo):
  // puntaje = suma de ponderaciones · 0→G0 · 1→G1 · 2–4→G2 · ≥5→G3
  UMBRALES: [
    { maxPuntaje: 0, nivel: 'G0' },
    { minPuntaje: 1, maxPuntaje: 1, nivel: 'G1' },
    { minPuntaje: 2, maxPuntaje: 4, nivel: 'G2' },
    { minPuntaje: 5, nivel: 'G3' }
  ]
};

// Catálogo ECICEP COMPLETO — extraído de la calculadora oficial (ecicep.cl/WallTech).
// 8 condiciones de DOBLE puntuación (peso 2). Resto peso 1.
// Fuente: Calculadora ECICEP + MINSAL RPE Nº4 + Marco Operativo SS Maule.
const CATALOGO_CONDICIONES_ECICEP = [
  // === SALUD MENTAL ===
  { CODIGO:'DROGAS', NOMBRE_CANONICO:'Consumo perjudicial o dependiente de drogas', ALIASES:['consumo drogas','policonsumo','drogas','Z72.2','F11','F12','F14','F19'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ALCOHOL', NOMBRE_CANONICO:'Consumo perjudicial o dependiente de alcohol', ALIASES:['alcohol','alcoholismo','F10','Z71.4'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'DEPG', NOMBRE_CANONICO:'Depresión grave', ALIASES:['depresion grave','depresion grave sin psicosis','depresion grave con psicosis','depresion refractaria','F33.2','F33.3'], PONDERACION:2, ACTIVA:true },
  { CODIGO:'DEP', NOMBRE_CANONICO:'Depresión leve o moderada', ALIASES:['depresion','depresion leve','depresion moderada','F33.4','F33.8','F33.9'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ESQ', NOMBRE_CANONICO:'Esquizofrenia', ALIASES:['esquizofrenia','trastorno esquizotipico','trastorno delirante','F20','F21','F22','F23'], PONDERACION:2, ACTIVA:true },
  { CODIGO:'SUENO', NOMBRE_CANONICO:'Trastornos del sueño', ALIASES:['trastorno del sueno','insomnio','F51','G47'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'MALTRATO', NOMBRE_CANONICO:'Maltrato / VIF / Abuso sexual / Ideación suicida', ALIASES:['maltrato','vif','abuso sexual','ideacion suicida','intento suicida','T74','Y07'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ANSIEDAD', NOMBRE_CANONICO:'Ansiedad', ALIASES:['ansiedad','trastorno ansioso','fobias','TOC','F40','F41','F42'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'PERSON', NOMBRE_CANONICO:'Trastorno de la personalidad', ALIASES:['trastorno personalidad','F60','F61','F62','F68','F69'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'TCA', NOMBRE_CANONICO:'Trastornos alimentarios', ALIASES:['anorexia','bulimia','trastorno alimentario','F50'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'OTROS_SM', NOMBRE_CANONICO:'Otros trastornos de salud mental', ALIASES:['otros salud mental','F63','F64','F65','F66'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'TABACO', NOMBRE_CANONICO:'Tabaquismo', ALIASES:['tabaquismo','tabaco','fumador','F17'], PONDERACION:1, ACTIVA:true },

  // === METABÓLICAS ===
  { CODIGO:'DM', NOMBRE_CANONICO:'Diabetes Mellitus', ALIASES:['diabetes mellitus','diabetes','dm','dm1','dm2','diabetes tipo 1','diabetes tipo 2','diabetes mellitus tipo 2','E10','E11','E14'], PONDERACION:2, ACTIVA:true },
  { CODIGO:'DLP', NOMBRE_CANONICO:'Dislipidemia', ALIASES:['dislipidemia','dislipemia','E78'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'OBE', NOMBRE_CANONICO:'Obesidad', ALIASES:['obesidad','E66'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'TIRO', NOMBRE_CANONICO:'Trastornos tiroideos', ALIASES:['hipotiroidismo','hipertiroidismo','tiroideo','tiroides','hipot','E03','E05'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'HURI', NOMBRE_CANONICO:'Hiperuricemia / Gota', ALIASES:['gota','hiperuricemia','M10'], PONDERACION:1, ACTIVA:true },

  // === CARDIOVASCULAR ===
  { CODIGO:'HTA', NOMBRE_CANONICO:'Hipertensión arterial', ALIASES:['hipertension','hta','presion alta','I10','I11','I12','I13'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ECI', NOMBRE_CANONICO:'Enfermedad cardiovascular / IAM / Cardiopatía isquémica', ALIASES:['iam','infarto','cardiopatia isquemica','angina','enfermedad cardiovascular','I20','I21','I25'], PONDERACION:2, ACTIVA:true },
  { CODIGO:'FA', NOMBRE_CANONICO:'Fibrilación auricular / Flutter', ALIASES:['fibrilacion auricular','fa','flutter','arritmia auricular','I48'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'IC', NOMBRE_CANONICO:'Insuficiencia cardíaca', ALIASES:['insuficiencia cardiaca','ic','I50'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ECV', NOMBRE_CANONICO:'Enfermedad cerebrovascular / ACV / AVE', ALIASES:['acv','ave','accidente vascular','cerebrovascular','I64','I67','G46'], PONDERACION:2, ACTIVA:true },
  { CODIGO:'TIA', NOMBRE_CANONICO:'Isquemia cerebral transitoria (TIA)', ALIASES:['tia','isquemia cerebral transitoria','G45'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ARR', NOMBRE_CANONICO:'Arritmia cardíaca / Taquicardia paroxística', ALIASES:['arritmia','taquicardia','I47','I49.9'], PONDERACION:1, ACTIVA:true },

  // === RESPIRATORIAS ===
  { CODIGO:'ASMA', NOMBRE_CANONICO:'Asma', ALIASES:['asma','J45','J46'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'EPOC', NOMBRE_CANONICO:'Enfermedad pulmonar obstructiva crónica', ALIASES:['epoc','bronquitis cronica','enfisema','J44'], PONDERACION:1, ACTIVA:true },

  // === RENALES ===
  { CODIGO:'ERC', NOMBRE_CANONICO:'Enfermedad renal crónica', ALIASES:['erc','enfermedad renal cronica','N15','N19'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ERCA', NOMBRE_CANONICO:'Enfermedad renal crónica avanzada', ALIASES:['erc avanzada','erca','enfermedad renal cronica avanzada','insuficiencia renal terminal','N18'], PONDERACION:2, ACTIVA:true },

  // === PROSTÁTICA ===
  { CODIGO:'HPB', NOMBRE_CANONICO:'Hipertrofia prostática benigna', ALIASES:['prostata','hipertrofia prostatica','N40'], PONDERACION:1, ACTIVA:true },

  // === DIGESTIVAS ===
  { CODIGO:'HEPA', NOMBRE_CANONICO:'Enfermedad hepática crónica', ALIASES:['hepatitis cronica','cirrosis','enfermedad hepatica','K74'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ENTERO', NOMBRE_CANONICO:'Enteritis crónica / Colitis ulcerosa / Crohn', ALIASES:['crohn','colitis ulcerosa','enteritis cronica','K50','K51'], PONDERACION:1, ACTIVA:true },

  // === REUMATOLÓGICAS ===
  { CODIGO:'AR', NOMBRE_CANONICO:'Artritis reumatoidea', ALIASES:['artritis reumatoide','ar','M05','M06'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'ARTROSIS', NOMBRE_CANONICO:'Artrosis de rodilla, cadera u otro tipo', ALIASES:['artrosis','gonartrosis','coxartrosis','M15','M16','M17'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'NEURO_DOLOR', NOMBRE_CANONICO:'Dolor neuropático / Fibromialgia', ALIASES:['fibromialgia','dolor neuropatico','M79.7','G50'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'LUPUS', NOMBRE_CANONICO:'Lupus eritematoso sistémico', ALIASES:['lupus','les','M32'], PONDERACION:1, ACTIVA:true },

  // === NEUROLÓGICAS ===
  { CODIGO:'DEM', NOMBRE_CANONICO:'Demencia', ALIASES:['demencia','alzheimer','F00','F01','F03'], PONDERACION:2, ACTIVA:true },
  { CODIGO:'EPI', NOMBRE_CANONICO:'Epilepsia', ALIASES:['epilepsia','G40'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'EM', NOMBRE_CANONICO:'Esclerosis múltiple', ALIASES:['esclerosis multiple','G35'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'PK', NOMBRE_CANONICO:'Parkinsonismo', ALIASES:['parkinson','parkinsonismo','G20'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'RM', NOMBRE_CANONICO:'Retraso mental', ALIASES:['retraso mental','discapacidad intelectual','F70','F71'], PONDERACION:1, ACTIVA:true },

  // === HEMATOLÓGICAS ===
  { CODIGO:'ANE', NOMBRE_CANONICO:'Anemia crónica', ALIASES:['anemia','D50','D64'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'COAG', NOMBRE_CANONICO:'Otros defectos de la coagulación', ALIASES:['coagulacion','hemofilia','D68'], PONDERACION:1, ACTIVA:true },

  // === INFECCIOSAS ===
  { CODIGO:'TBC', NOMBRE_CANONICO:'Tuberculosis', ALIASES:['tuberculosis','tbc','A15'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'VIH', NOMBRE_CANONICO:'Infección por VIH / SIDA', ALIASES:['vih','sida','B24'], PONDERACION:1, ACTIVA:true },

  // === SENSORIALES ===
  { CODIGO:'RETINO', NOMBRE_CANONICO:'Catarata / Retinopatía', ALIASES:['catarata','retinopatia','H25','H26'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'CEGUERA', NOMBRE_CANONICO:'Ceguera', ALIASES:['ceguera','H54'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'GLAUCOMA', NOMBRE_CANONICO:'Glaucoma', ALIASES:['glaucoma','H40'], PONDERACION:1, ACTIVA:true },
  { CODIGO:'HIPOACUSIA', NOMBRE_CANONICO:'Presbiacusia / Hipoacusia', ALIASES:['hipoacusia','presbiacusia','sordera','H90'], PONDERACION:1, ACTIVA:true },

  // === SOCIOECONÓMICAS ===
  { CODIGO:'SOCIOEC', NOMBRE_CANONICO:'Dificultades socioeconómicas o psicosociales', ALIASES:['dificultades sociales','vulnerabilidad social','Z55','Z60'], PONDERACION:1, ACTIVA:true },

  // === FUNCIONAL ===
  { CODIGO:'DISCAP', NOMBRE_CANONICO:'Función limitada / Discapacidad / Dependencia', ALIASES:['discapacidad','dependencia','funcion limitada','Z74','Z99'], PONDERACION:2, ACTIVA:true },

  // === ONCOLÓGICAS ===
  { CODIGO:'CA', NOMBRE_CANONICO:'Malignidad (cáncer)', ALIASES:['cancer','malignidad','tumor','neoplasia','C00-C97'], PONDERACION:1, ACTIVA:true },

  // === CUTÁNEAS ===
  { CODIGO:'ULCERA', NOMBRE_CANONICO:'Úlcera crónica de la piel', ALIASES:['ulcera','ulcera cronica','L97'], PONDERACION:1, ACTIVA:true }
];

// Catálogo de profesionales CESFAM — SEMILLA de la hoja PROFESIONALES.
// La hoja oculta PROFESIONALES es la fuente de verdad editable vía diálogo;
// esta constante solo siembra/valida valores iniciales y actúa de respaldo.
const CATALOGO_PROFESIONALES = [
  { CODIGO:'MED',  NOMBRE_CANONICO:'Médico/a',            TIPO_ROL:'Médico',     ACTIVA:true },
  { CODIGO:'ENF',  NOMBRE_CANONICO:'Enfermera/o',         TIPO_ROL:'Enfermería', ACTIVA:true },
  { CODIGO:'TENS', NOMBRE_CANONICO:'TENS',                TIPO_ROL:'Técnico',    ACTIVA:true },
  { CODIGO:'MAT',  NOMBRE_CANONICO:'Matrona/o',           TIPO_ROL:'Matronería', ACTIVA:true },
  { CODIGO:'PSI',  NOMBRE_CANONICO:'Psicólogo/a',         TIPO_ROL:'Psicología', ACTIVA:true },
  { CODIGO:'ASIST',NOMBRE_CANONICO:'Asistente Social',    TIPO_ROL:'Asistencia Social', ACTIVA:true },
  { CODIGO:'NUTRI',NOMBRE_CANONICO:'Nutricionista',       TIPO_ROL:'Nutrición',  ACTIVA:true },
  { CODIGO:'KINE', NOMBRE_CANONICO:'Kinesiólogo/a',       TIPO_ROL:'Kinesiología', ACTIVA:true },
  { CODIGO:'TO',   NOMBRE_CANONICO:'Terapeuta Ocupacional',TIPO_ROL:'Terapia Ocupacional', ACTIVA:true }
];


// ---------------------------------------------------------------------------
// Logging (DEC-014): búfer en memoria + escritura por lotes
// ---------------------------------------------------------------------------
var CFG_LOG = {
  HOJA: HOJAS.LOG,
  NIVEL: 'INFO',           // DEBUG < INFO < WARNING < ERROR (DEBUG se descarta)
  MAX_BUFFER: 50,          // auto-flush al alcanzar N entradas
  MAX_FILAS_HOJA: 5000     // recorte del histórico
};

// ---------------------------------------------------------------------------
// Caché (DEC-015): solo índices/parámetros de lectura, TTL corto,
// invalidación explícita al escribir. Nunca datos en curso de modificación.
// ---------------------------------------------------------------------------
var CFG_CACHE = {
  PREFIJO: 'ECICEP:v' + ECICEP.VERSION.replace(/\./g, '') + ':',
  TTL_DEFECTO_SEG: 60
};
