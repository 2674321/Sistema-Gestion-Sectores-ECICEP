# Informe v0.12.1 — hotfix de timeout en la presentación del libro

**Fecha:** 2026-09-24  
**Esquema:** 2, sin migración nueva  
**Contrato de captura:** V4, sin cambio clínico  
**Versión:** `ECICEP.VERSION = '0.12.1'`

## Incidente corregido

La fase `Presentación del libro` (etapa `diseno` del instalador) podía exceder el
límite de ejecución de Apps Script porque corría en **un solo RPC** la cadena
`Modelo_aplicarDiseno()` + `Libro_repararPresentacion_({forzar:true})`, que
reescribía la presentación completa del libro (estilos, banding, anchos, formatos,
validaciones, notas y colores) en cada reinstalación, recorriendo `getMaxRows()`
completo de cada hoja.

## Solución en dos frentes

### 1. Presentación por subtareas reanudables (`src/35_Presentacion.js`)

- Plan de **8 subtareas** `PRESENTACION_SUBPLAN_DISENO` con presupuesto de
  tiempo por RPC (`PRESUPUESTO_PRESENTACION_MS = 20000`).
- Cada RPC procesa las subtareas que entran en el presupuesto y responde
  `{continuar:true, cursor, progreso, subetapa}`. El cliente
  (`Instalador.html`) re-invoca la **misma etapa** con el mismo `_EJEC`
  mientras el servidor responda `continuar:true`, mostrando
  `nombre · subetapa (actual/total)`.
- El cursor se persiste en `CacheService` con clave `ECICEP_INST_PRES|<ejecucion>`
  (TTL 3600, null-safe en entornos sin `CacheService`). Cada subtarea es
  idempotente: si una RPC muere tras escribir antes de persistir, el reintento
  ejecuta la misma subtarea sin efecto colateral. Una subtarea que **falla** no
  persiste el cursor: el reintento vuelve exactamente a la misma subtarea.
- Solo la etapa `diseno` es reanudable. `visual`, `validaciones`, `inicio` y las
  demás conservan su comportamiento de una RPC.
- `Instalar_pDiseno(ejecucion)` delega en `Presentacion_ejecutarPaso_('diseno',
  ejecucion)`; `api_instalarPaso` conserva el paso de `ejecucion` al handler.

### 2. Fast-paths "cero escrituras"

- `Hojas_filasGestionadas_(hoja, nombreHoja, opciones)`: acota todos los formatos
  a las filas gestionadas (dataStart + reserva de 250, limitada por
  `getMaxRows()`) en lugar de barrer `getMaxRows()` completo.
- Compara el estado real antes de escribir y omite la escritura si ya coincide:
  estilos de encabezado (fondo/tinta/peso/tamaño/altura), banding (zona y
  colores), anchos de columna, formatos numéricos, validaciones (misma lista),
  notas, semántica de columnas y color de RUT de las puertas de ingreso.
- Se eliminó la **fuerza global** `{forzar:true}` de `Instalar_pVisual`: una hoja
  con inconsistencias reales se detecta (`HVis_yaFormateada`/
  `HVis_pendientesVisual`) y se repara solo esa hoja. La expansión forzada de
  filas nueva sigue existiendo vía `cantidad` explícita en
  `Hojas_prepararRangoDatos_` (capacidad por bloques, no reescritura global).

## Alcance

- `src/35_Presentacion.js` (nuevo): motor reanudable.
- `src/20_Instalador.js`: `Instalar_pDiseno` delegado al motor; `Instalar_pVisual`
  sin fuerza global (agrega fallos por hoja).
- `src/Instalador.html`: `ejecutarSecuencia(ix)` + `llamarPaso(etapa,ix)` con
  soporte `r.continuar===true`; literales del instalador intactos.
- `src/06_Modelo.js`, `src/17_Hojas.js`, `src/34_LibroUX.js`: fast-paths y rangos
  acotados.
- `src/00_Config.js`, `src/10_Pruebas.js` y suite nueva:
  `tests/instalador_presentacion_timeout_v0121.mjs` (19/19) — plan, presupuesto,
  caché null-safe, reanudación 8 RPC, fallo sin persistir cursor, dispatcher,
  `Instalar_pVisual` sin forzar y cero escrituras de cada fast-path. Pins de
  versión actualizados a `0.12.1`.

## Validación

`node tools/verificar.mjs`: **38 suites, 0 fallos** (incluye `ejecutar_local`
671/671, `regresiones_revision` 45/45, `validar_html` 22/22, la suite
`instalador_presentacion_timeout_v0121` 19/19 y la nueva
`inicio_portada_freezerows_v0121` 7/7).

## Segundo hallazgo — freeze residual en la portada (reparación real)

Durante la primera ejecución real de `Instalar / reparar` con la v0.12.1 (la que
confirmó el fin del timeout de `Presentación del libro`), la etapa `inicio`
(`Preparando la portada`) falló con:

> `No se pueden combinar filas inmovilizadas con filas no inmovilizadas.`

### Causa

`Inicio_construir_` (34_LibroUX.js) redibuja la hoja `INICIO` por completo
(`breakApart` + `clear` + merges + estilos sobre `A1:AF60`) y solo al final
congelaba 2 filas. Si la hoja **heredaba filas/columnas inmovilizadas** de una
instalación anterior (v0.12.0 parcial o legado), cualquier escritura cuyo rango
cruzaba el límite congelado/no-congelado disparaba la validación de Sheets. La
fase `inicio` nunca se había ejercitado en producción desde el rediseño porque la
fase anterior (`diseno`) siempre había agotado el timeout primero.

### Solución (invariante)

Construir la portada **siempre sin freeze residual** y congelar solo al final:

- `h.setFrozenRows(0); h.setFrozenColumns(0);` inmediatamente después de asegurar
  la hoja, antes de cualquier operación estructural o de contenido (idempotente:
  sobre una hoja nueva no tiene efecto neto).
- `setConditionalFormatRules([])` y `setTabColor` se aplican antes del freeze.
- El freeze final `setFrozenRows(2); setFrozenColumns(0)` queda como última
  mutación visual.
- La verificación `ver` ahora incluye `freeze: getFrozenRows() === 2`, de modo que
  una portada que no termine correctamente congelada se informa como fallo real
  de la fase.

Suite nueva `tests/inicio_portada_freezerows_v0121.mjs` (7/7): una hoja heredada
con freeze 2/1 y otra nueva se reconstruyen sin lanzar, todo `write` ocurre con
`freeze=0` (orden `unlock → escrituras → freeze final` verificado por registro de
operaciones) y termina con freeze 2/columnas 0. Alcance del cambio: solo
`src/34_LibroUX.js` (función `Inicio_construir_`).

## Pendiente operativo

El smoke E2E real de `Instalar / reparar` en el Spreadsheet lo ejecuta el
operador desde la Web App de instalación (esta estación no dispone de una sesión
Google autorizada para `clasp run`). Con la v0.12.1 completa (presentación
reanudable + freeze de portada), se espera el confirm de que la instalación
termina las etapas `Presentación del libro` (sin timeout) y `Preparando la
portada` (sin el error de filas inmovilizadas).