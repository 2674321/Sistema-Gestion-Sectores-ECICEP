# ARQUITECTURA — Sistema ECICEP Unificado v0.1

> Estado: PROPUESTA (ETAPA 1). Basada en el levantamiento ETAPA 0 y en los
> patrones probados del proyecto de referencia CESFAM_SJ v2.

## Visión general

```text
Excel/Sheets fuentes (3 sectores)
        ↓  (importación controlada, staging)
   VALIDACIÓN ESTRUCTURAL
        ↓
   NORMALIZACIÓN (capa independiente, pura, testeable)
        ↓
   IDENTIFICACIÓN (RUT → fallbacks; dudosos a revisión)
        ↓
   CONSOLIDACIÓN (explicable, reversible, vía MAPA_ORIGEN)
        ↓
   BASE_ECICEP  ←→  UI (búsqueda / ficha / controles)  ←→  DASHBOARD
        ↓
   LOG + métricas
```

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

Dependencia estricta hacia abajo: UI/Dashboard → Modelo → Normalización → Utilidades.
La normalización nunca llama a SpreadsheetApp (testeable sin hoja real).

## Estado de implementación (fin ETAPA 2)

- ✅ `00_Config`: modelo canónico (24 campos con metadatos), sinonimos confirmados,
  encabezados ambiguos registrados, estados, fechas, log y caché.
- ✅ `01_Utilidades`: bloques batch, colecciones, medición, caché.
- ✅ `02_Normalizacion`: RUT (módulo 11), teléfono multi-formato, fechas tolerantes
  (VACIA/VALIDA/MES_ANO/INVALIDA/NO_RECONOCIDA), nombres, encabezados, estados,
  estratificación — capa pura.
- ✅ `09_Log`: búfer + flush por lotes + LockService + recorte histórico.
- ✅ `06_Modelo`: instalación idempotente de hojas (elimina "Hoja 1" solo si vacía),
  formato base de PACIENTES (encabezado fijo, técnicas agrupadas/ocultas), lectura
  por bloques e índice por RUT.
- ✅ `07_UI`: menú ECICEP (instalar estructura · ejecutar pruebas · abrir LOG).
- ✅ Pruebas: 85 casos verdes (`node tests/ejecutar_local.mjs` = mismo runner que GAS).
- ⬜ ETAPA 3: staging, validador estructural de fuentes, identificación, consolidación.

## Interfaz dentro de Google Sheets (DEC-012)

Sheets es la interfaz principal: menús personalizados, botones, listas
desplegables, formato condicional, vistas filtradas y navegación entre hojas.
HTML/sidebar/dialog únicamente como complemento justificado. Las hojas se
diseñan como interfaz (encabezados congelados, anchos, colores consistentes,
columnas técnicas agrupadas y ocultas). Fórmulas nativas cuando sean simples y
no penalicen rendimiento; Apps Script para procesamiento complejo.

## Hojas (ver MODELO-DATOS.md)

BASE_ECICEP · STAGING_IMPORT · MAPA_ORIGEN · DUPLICADOS_REVISION · LOG · CONFIG.

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
