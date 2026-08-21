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
| `06_Modelo.gs` | Acceso a BASE_ECICEP (CRUD por lotes, índices en memoria) | normalizar |
| `07_UI.gs` | Interfaz (sidebar/web app): búsqueda, ficha, registro de controles | lógica pesada |
| `08_Dashboard.gs` | KPIs: pendientes, próximos controles, por sector/estratificación | — |
| `09_Log.gs` | Logging INFO/WARNING/ERROR/CRITICAL a hoja LOG con LockService | — |

Dependencia estricta hacia abajo: UI/Dashboard → Modelo → Normalización → Utilidades.
La normalización nunca llama a SpreadsheetApp (testeable sin hoja real).

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
| clasp 3.3.0 (instalado, autenticado) | ✅ Usar para sync; push solo tras confirmar script destino |
| Python 3.12 + openpyxl 3.1.5 (local) | ✅ Análisis/validación estructural de Excel fuera de línea; ya usado en ETAPA 0 |
| Git local | ✅ Repo inicializado; primer commit pendiente de confirmación |
| Node/npm para linting .gs | ⏸️ Aplazado: beneficio marginal ahora; evaluar en ETAPA 2+ si el código crece |
| GAS tests framework externos | ⏸️ No instalar; tests como módulo propio simple (patrón CESFAM_SJ `10_Pruebas`) mejorado con asserts |
