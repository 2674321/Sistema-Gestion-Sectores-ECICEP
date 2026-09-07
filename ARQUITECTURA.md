# ARQUITECTURA — Sistema ECICEP Unificado

> Estado documental: consolidación de la arquitectura vigente. Los hitos ETAPA 2/2.5/3 y las versiones 0.x se conservan como historial; no describen por sí solos el estado operativo actual.

## Visión general funcional

```text
   SECTOR NARANJO        SECTOR AMARILLO       SECTOR VERDE
  [INGRESO_…][SECTOR_…] [INGRESO_…][SECTOR_…] [INGRESO_…][SECTOR_…]
        │  puertas de entrada controladas + superficies operativas
        └───────────────┬───────────┴───────────────────┘
                        ▼
      VALIDACIÓN → NORMALIZACIÓN → IDENTIFICACIÓN → CONSOLIDACIÓN
                        │  (explicable, reversible vía MAPA_ORIGEN)
           ┌────────────┴────────────┐
           ▼                         ▼
      PACIENTES (entidad)       EVENTOS (actividad, append-only)
           └────────────┬────────────┘
                        ▼
     DASHBOARD (análisis dinámico) · REM (agregación mensual) · SEGUIMIENTO
                        │
                   LOG + métricas
```

Detalle del modelo paciente/evento: **MODELO-EVENTOS.md**.

## Módulos Apps Script (archivos planos numerados — patrón clasp)

| Archivo | Responsabilidad | No hace |
|---|---|---|
| `00_Config.gs` | IDs hojas, mapa canónico de columnas, sinonimos, estados, constantes | lógica |
| `01_Utilidades.gs` | Batch helpers, cache, fechas, texto genérico | negocio |
| `02_Normalizacion.gs` | RUT(DV mód11), teléfono, fecha, nombre, encabezados. **Funciones puras** | I/O Sheets |
| `03_Fuentes.gs` | Lectura de hojas fuente, detección de encabezado/separadores, validador estructural pre-import | consolidar |
| `04_Identificacion.gs` | Claves de match, scoring, cola de revisión | escribir BASE |
| `05_Consolidacion.gs` | Merge multi-fuente con conflictos; DRY RUN integrado | decidir solo |
| `06_Modelo.gs` | Acceso a PACIENTES (lectura por bloques, índices) + instalación/reparación de estructura de hojas | normalizar |
| `07_UI.gs` | Interfaz Sheets-nativa (DEC-012): menú ECICEP, toasts, navegación. Sidebar/dialog solo si una interacción lo justifica | lógica pesada |
| `08_Dashboard.gs` | KPIs: pendientes, próximos controles, por sector/estratificación | — |
| `09_Log.gs` | Logging INFO/WARNING/ERROR/DEBUG a hoja LOG con búfer + escritura por lotes (DEC-014) | — |
| `10_Pruebas.js` | Suites deterministas del núcleo (corren en GAS y en node, DEC-016) | — |
| `11_DatosPrueba.js` | Dataset ficticio único para las pruebas (sin datos reales) | — |
| `24_Formulario.js` | Backend de captura Web App: validación, decisión, persistencia en `FORM_RESPUESTAS`, procesamiento idempotente, métricas/trazabilidad y wrappers GAS | escritura clínica fuera del pipeline |
| `25_Entorno.js` | Utilidades históricas o de transición relacionadas con identidad/configuración del proyecto, si todavía existen en el código | crear ambientes operativos paralelos |

**Roadmap de módulos futuros** (se crean en su etapa, no antes):
`03b_ValidadorEstructura` (reporte APTO/ADVERTENCIAS/REVISIÓN), `12_Ingresos`
(procesador hojas INGRESO_*), `13_Eventos` (registro/consulta EVENTOS + sync
caché PACIENTES), `14_Estratificacion` (motor regla-configurable, apagado hasta
regla oficial), `15_Dashboard` (agregaciones on-demand), `16_Rem` (generador).

Dependencia estricta hacia abajo: UI/Dashboard → Modelo → Normalización → Utilidades.
La normalización nunca llama a SpreadsheetApp (testeable sin hoja real).

## Estado de implementación

### ETAPA 2 ✅
- Núcleo completo: Config v1, Utilidades, Normalización pura, Log por lotes,
  Modelo con instalación idempotente, menú ECICEP, 85 pruebas verdes.

### ETAPA 2.5 ✅ (refinamiento funcional — diseño)
- Modelo entidad/evento definido (`MODELO-EVENTOS.md`); PACIENTES ampliado a
  **29 campos** (sexo, fecha nacimiento, condiciones, estrat origen/calculada).
- Config v0.3: sectores geográficos permanentes ≠ estratificación (DEC-018),
  tipos de evento, estados de ingreso, motor G apagado hasta regla oficial.
- Normalizadores nuevos: sector (alias NARANJA→NARANJO), sexo, tipo evento.
- Diseños aprobados: DASHBOARD (filtros dinámicos, trazabilidad), REM (mapa de
  trazabilidad campo a campo), ESTRATIFICACIÓN (motor data-driven), protecciones.
- ⬜ ETAPA 3: staging, validador estructural, identificación/deduplicación,
  hoja EVENTOS y sincronización de caché.

### ETAPA 3 — estado por componente

| Componente | Estado | Nota |
|---|---|---|
| Estructura STAGING_IMPORT | **IMPLEMENTADO** | `Fuentes_crearFila/normalizar/validar/validarEstructura` + hoja añadida al instalador; I/O batch (`Fuentes_guardarFilas`) |
| Validador estructural | **IMPLEMENTADO** | ERROR/WARNING/OK trazables por campo; sin crashes (fechas corruptas, RUT malos, sector inválido, G-como-sector, incompatibilidad origen) |
| Normalización aplicada | **IMPLEMENTADO** | Reutiliza Norm_* 1:1; originales siempre conservados |
| Identificación | **IMPLEMENTADO** | MATCH_EXACTO/PARCIAL/POSIBLE_DUPLICADO/SIN_MATCH/REQUIERE_REVISION con criterio+confianza (DEC-024) |
| Duplicados en lote | **IMPLEMENTADO** | Explicables y no destructivos |
| Transformación a EVENTOS | **IMPLEMENTADO** | Ev_desdeStaging con gates; escritura real vía Ingresos_procesarTodasLasHojas |
| Adaptador INGRESO_* → staging | **IMPLEMENTADO (3b)** | Sector derivado de la hoja (HOJAS_INGRESO); contradicciones declaradas como ERROR; idempotente (filas INGRESADO se saltan) |
| Transacción PACIENTES/EVENTOS | **IMPLEMENTADO (3b)** | Gates explícitos por fila; nuevo→crea entidad+evento enlazado; existente→solo evento (sin sobrescritura); append-only garantizado; escrituras batch |
| Ejecución controlada desde el sheet | **IMPLEMENTADO (3b)** | Menú ECICEP: 📥 Procesar ingresos · 🧪 Sembrar datos ficticios (prueba) |
| Ejecución real verificada en el spreadsheet | ✅ **VERIFICADA (EJ-MT3IJ7RG)**: 18 leídos = 3 OK + 11 WARNING + 4 ERROR intencionales; 11 pacientes nuevos + 3 enlazados; 14 eventos; SECTOR_* refrescadas |
| Captura histórica basada en Google Forms | **OBSOLETA / HISTÓRICA** | Canal utilizado en versiones anteriores. `Form_onFormSubmit`, `FormApp`, `FORM_ID` y `onFormSubmit` no forman parte de la operación actual. Su presencia eventual en código debe tratarse como compatibilidad/deuda histórica, no como canal activo.

| Web App de captura | **ÚNICO canal operativo actual (regla arquitectónica)** | ⚠️ El flujo contractual anterior (`CapturaWeb.html` → `Form_capturarDesdeUI()` → `FORM_RESPUESTAS` → `Form_procesarPendientes()`, identificador `UI-`) fue **INVALIDADO** y no constituye especificación normativa. La especificación vigente es `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**, única fuente del contrato de captura). Sin segunda base de datos ni lógica paralela.
| Migración masiva | **BLOQUEADA** | Por diseño hasta validar el flujo completo con muestra controlada de datos reales |

Pruebas: **171 casos verdes** (143 ETAPA 2 + 36 ETAPA 3 + 13 ETAPA 3b + ajustes).
Las pruebas de integración con Spreadsheet real son manuales/documentadas (menú 🧪→📥) y no corren en node.

## Entorno operativo

El sistema funciona como **un único entorno operativo**: un proyecto Apps Script, un Spreadsheet, una Web App, un backend y un pipeline.

Los deployments, `/dev`, `/exec`, `@HEAD` y los números de versión de Apps Script son mecanismos técnicos de publicación. No representan DEV/DEMO/PROD como arquitectura.

Una referencia histórica como `@63` no debe documentarse como "producción" ni utilizarse para reconstruir el sistema. `@63` fue eliminado después de verificar sus dependencias reales.

**Versión canónica vigente:** `ECICEP.VERSION` en `src/00_Config.js:19` (single source of truth). El sistema operativo actual incluye el módulo de captura **V2** (`src/26_Captura.js`, contrato `docs/CONTRATO_CAPTURA_V2.md`), la Web App 100% V2 (`src/CapturaWeb.html`) y el layout visual de `PACIENTES` (`CONTRATO_LAYOUT_VISUAL`); sus invariantes de datos se definen en `CONTRATO_DATOS.md` (**NORMATIVO**). Stack `Google Sheets + Apps Script + CapturaWeb.html + 00_Tokens.html + WebApp.gs + 26_Captura.js + 24_Formulario.js` sin dependencias externas; `ECICEP.WEB_APP_URL` centralizada con fallback `ScriptApp.getService().getUrl()`.

## Canal de captura

La Web App es la única interfaz operativa de captura. El backend reutiliza el mismo pipeline ya existente. No existe un segundo canal de negocio que deba mantenerse en paralelo.

### S3 — Comportamiento del formulario web

El formulario web interpreta la respuesta del backend V2 con una única regla de
limpieza: **solo limpia el formulario cuando `data.estado === 'PROCESADO'`**
(aceptada + persistida + entregada). En `RECIBIDO`/`VALIDANDO`/`VALIDO`
(pendiente, p. ej. `PENDIENTE_ENTREGA`), `REQUIERE_REVISION` y `ERROR` el
formulario se conserva y se muestra un mensaje no ambiguo. El reintento
idéntico es inocuo (idempotencia A1/A2) porque el `captureId` se conserva
mientras el contenido no cambie. El envío está protegido contra doble clic
(`_enviando`), y un timeout de 60 s (que cubre también la verificación previa
de duplicados) desbloquea botón y spinner ante una respuesta colgada. El
`captureId` cumple estrictamente `Cp2-` + 32 hex minúsculas (§12). Detalles y
pruebas: `AUDITORIA_ESTABILIZACION.md` §8.

## Interfaz dentro de Google Sheets (DEC-012)

Sheets es la interfaz principal: menús personalizados, botones, listas
desplegables, formato condicional, vistas filtradas y navegación entre hojas.
HTML/sidebar/dialog únicamente como complemento justificado. Las hojas se
diseñan como interfaz (encabezados congelados, anchos, colores consistentes,
columnas técnicas agrupadas y ocultas). Fórmulas nativas cuando sean simples y
no penalicen rendimiento; Apps Script para procesamiento complejo.

### DESIGN SYSTEM (v0.8.9.6, DEC-046)

Una sola especificación visual en `00_Config.js` (`DESIGN_SYSTEM`): tipografía,
alturas (28/26/42/30/21), anchos con fallback, bordes, superficies, marca,
encabezados uniformes (#0E5C68/blanco en TODAS las hojas), estados clínicos
(`ESTADOS`) separados de la identidad de sector, y rampas de color por familia
(GENERAL/AMARILLO/NARANJO/VERDE) con jerarquía única barra→sección→encabezado.
Cero colores literales fuera de la configuración (verificado por grep).

- **Layout por contrato**: hoja visual = fila 1 barra de identidad, fila 2
  secciones, fila 3 encabezados, fila 4+ datos. Hoja simple = fila 1
  encabezados, fila 2+ datos.
- **Identidad por hoja** (`HVis_identidad`): SECTOR_*/INGRESO_* → su familia;
  EVENTOS → NARANJO; PACIENTES/técnicas → GENERAL. Las hojas de sector son
  monocromáticas por familia; PACIENTES conserva barras semánticas azules.
- **Reconciliación** (`22_HojasVisual`): `HVis_especVisual` (estado deseado,
  puro) + `HVis_pendientesVisual` (CAMBIOS PENDIENTES, solo lectura) +
  `HVis_reconciliarHoja` (aplicar→verificar). El diagnóstico del instalador
  reporta los pendientes por hoja.
- **Regla de escritura**: nunca `get/setValue` dentro de loops (bloques
  `setValues` con ranuras fila→valor); verificada con auditoría transversal.

## Hojas

Inventario completo y justificado: **MODELO-EVENTOS.md §7** (≈15 hojas).
Creadas hoy: CONFIG · PACIENTES · LOG · CONFLICTOS · FUENTES.

## Protecciones (control operativo, NO seguridad institucional)

> **Advertencia honesta:** la protección de hojas/rangos de Google Sheets es un
> mecanismo de control operativo contra errores accidentales. NO es una
> arquitectura de seguridad avanzada; no se dependerá de ocultar hojas como
> medida de protección, y la confidencialidad real se apoya en el control de
> acceso a la cuenta de Google del spreadsheet.

Plan por capas:

| Capa | Mecanismo |
|---|---|
| Hojas administrativas (CONFIG, LOG, FUENTES, REGLAS_ESTRATIFICACION, columnas técnicas) | Protección estricta, solo propietario/desarrollo |
| Columnas técnicas de PACIENTES/EVENTOS | Rango protegido siempre (el usuario jamás las edita) |
| SECTOR_* e INGRESO_* | Protección con editor = responsable del sector; otras áreas solo advertencia o lectura |
| Áreas de resultado (DASHBOARD, REM_SALIDA) | Protegidas: solo Apps Script escribe |

Limitación técnica documentada: los menús de Apps Script ejecutan con la
autoridad de quien hace clic — si un área le está protegida al usuario, la
escritura del script fallaría. Patrón adoptado: operaciones del sistema sobre
áreas protegidas se realizan mediante funciones instaladas/ejecutadas bajo
autorización del propietario (instalable triggers / ejecución por propietario),
y las áreas operativas de cada sector quedan editables SOLO para su responsable.
Asignación de responsables = correos por sector (PENDIENTES #13).

## Infraestructura remota identificada

| Recurso | ID | Estado |
|---|---|---|
| **Apps Script ligado (OFICIAL)** "Back-End Proyecto - Sectores - ECICEP - C.S.J" | `1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI` | Confirmado por desarrollador (DEC-007). Container-bound al Spreadsheet base. Contiene solo comentario de reserva. Manifest: tz America/Santiago, STACKDRIVER, V8, sin servicios avanzados (DEC-011) |
| Spreadsheet base "PROYECTO - Sectores - ECICEP - C.S.J" | `1OEV2za6VbPG7CHU4Pd71Nzi4smy3eizqjrLCRq7UggE` | **Vacío** (solo "Hoja 1" predeterminada, confirmado 2026-08-21). Listo para crear hojas del sistema en ETAPA 2 |
| Apps Script standalone "Proyecto sin título" | `1-b9YTL-u7x8M9eNeOBcqWEmMc1QYki2kaCfFBRe1508rdRTO7cC9hWvx` | Descartado (escombro de prueba, 6 stubs vacíos). NO usar |
| Copias importadas en Drive de NARANJO y PCTS 2023 | `17cNcOTd…`, `1T9a8Z85…` | Referencia; no usar como fuente directa |

⚠️ El `.clasp.json` de la raíz del workspace pertenece al proyecto de
**cotizaciones Servicitecnico** (mismo scriptId). NUNCA hacer push desde ahí.
El proyecto usa su propio `.clasp.json` local → script ligado, rootDir `src`
(DEC-010; fuera de Git a propósito, scriptId documentado arriba).

## Rendimiento (reglas desde el día 1)

- Lectura única por hoja: `getDataRange().getValues()` → procesamiento en memoria.
- Escrituras masivas: arrays con `setValues()`; jamás `setValue()` en loops.
- Índices en memoria (Map RUT→fila) reconstruidos por carga, cacheados 30–60 s
  (CacheService) con invalidación al escribir.
- LockService en escrituras concurrentes y en el log.
- Presupuesto objetivo: importación completa (~3.000 filas × 12 columnas) < 60 s,
  dentro de límites de cuota de Apps Script (6 min/ejecución).

## Modo simulación (DRY RUN)

Toda operación de escritura masiva acepta `modoSimulacion=true`:
procesa todo, reporta (válidos/duplicados/conflictos/revisión) y **no escribe**.
Obligatorio en la primera migración real.

## Entornos

Un solo proyecto Apps Script + un solo Spreadsheet, separación **lógica**:
hoja CONFIG distingue datos de prueba vs reales; dataset ficticio en
`datos_prueba/` para desarrollo local y pruebas de normalización.
(Ver DEC-008; tres proyectos independientes = sobrediseño para este volumen.)

## Herramientas del entorno (evaluación ETAPA 0)

| Herramienta | Veredicto |
|---|---|
| clasp 3.3.0 (instalado, autenticado) | ✅ Usar para sync; push solo tras verificar `.clasp.json` → script ligado |
| Python 3.12 + openpyxl 3.1.5 (local) | ✅ Análisis/validación estructural de Excel fuera de línea; ya usado en ETAPA 0 |
| Node v18 (local) | ✅ Runner de pruebas del núcleo (`tests/ejecutar_local.mjs`) — mismo runner que GAS |
| Git local | ✅ Repo inicializado; commits por etapa |
| Node/npm para linting .gs | ⏸️ Aplazado: `node --check` cubre sintaxis; evaluar en ETAPA 3+ si el código crece |
| GAS tests framework externos | ⏸️ No instalar; runner propio simple cumple (DEC-016) |
