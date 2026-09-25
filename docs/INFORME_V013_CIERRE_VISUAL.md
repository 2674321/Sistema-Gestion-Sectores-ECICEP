# INFORME V0.13.0 — Cierre visual: paridad, portada INICIO y presentación convergente

**Fecha:** 2026-09-24 · **Estado:** publicado en el deployment operativo inmutable (misma URL/QR)

## Alcance

Cierre visual según el prompt de especificación: motor de presentación reanudable,
plantillas INGRESO/SECTOR únicas, portada `INICIO` de 30 columnas e instalador con
paridad real. La Web App sigue siendo el único canal de captura; esquema **2**,
contrato de captura **V4**, un único entorno operativo.

## Cambios

### 1. Presentación por hoja y convergencia real
- `35_Presentacion.js`: subplan de **18 subtareas** (`base`, `formato:*` por hoja,
  `validaciones:extras`, `condicionales`, `notas`, `accesorios`, `inicio`,
  `paridad:INGRESO`, `paridad:SECTOR`, `verificar`), una por hoja de
  `HOJAS_INGRESO` (4 claves, incluye alias `INGRESO_NARANJA`) y `HOJAS_SECTOR`.
- `Presentacion_verificar_` ya **no devuelve `ok:true` por defecto**:
  `ok = pendientes===0 && paridadIngreso.ok && paridadSector.ok && inicio.ok`.
- Memo `_PRESENTACION_VERIFICACION_MEMO` expuesto por
  `Presentacion_VerificacionResultado_()` y transportado en el paso como
  `verificacion:` (solo lo escribe la subtarea `verificar`).
- Fingerprint de presentación por contenido: `'pp013|' + fnv1a32(contrato)`.

### 2. Portada INICIO de 30 columnas
- `INICIO` gobierna `A1:AD38`: cinco accesos universales (PERSONAS, CAPTURA,
  INGRESOS, CONTROLES, REM), tres tarjetas por sector, bloques ESTADO y
  PENDIENTES, metadata y nota operativa.
- `Inicio_fingerprintEsperado_` = `v013|fnv1a32` sobre el layout → migración
  automática desde portadas anteriores (32 columnas de v0.12.2).
- `Instalar_pInicio` solo construye la portada (sin formato condicional, filtros
  ni protecciones ajenas a `A1:AD38`).

### 3. Paridad visual (read-only)
- `22_HojasVisual.js`: `HVis_compararFamilia_` compara cada hoja de una familia
  contra su hoja de referencia por firma neutralizada; `HVis_diferenciasFirmas_`
  reporta diferencias (`out1`,`out2`,`mismatch`,`estructura`,`hoja`), con hash
  `fnv1a32` independiente del orden de claves.
- `Instalar_diagnosticar` bloque §3.1: `visualProfundo` con `paridad.ingreso`,
  `paridad.sector` e `inicio` (fases `paridad:INGRESO`, `paridad:SECTOR`,
  `inicio`; `totalFases` = 11).

### 4. UI del instalador
- Filas de diagnóstico **Paridad INGRESO** y **Paridad SECTOR** (§20).
- `verificacion.ok===false` → título `INSTALACIÓN FUNCIONAL / PRESENTACIÓN
  INCOMPLETA`, estado `ADVERTENCIA`, resumen con divergencias y botón
  **Reintentar presentación** (§21).
- Menú **Sistema** incluye **Reparar presentación** → `UI_repararPresentacion`,
  wrapper fino sobre `Presentacion_ejecutarPaso_` (mismo motor reanudable, §8):
  reanuda con el mismo cursor y cierra según la verificación
  (`Presentación reparada` / `presentación incompleta` / `Reparación incompleta`).

### 5. EDAD
- EDAD se calcula desde FECHA_NACIMIENTO en las vistas `SECTOR_*`
  (`Utl_formulaEdad` con `DATEDIF`); nunca se almacena en `PACIENTES`.

## Tests

| Suite | Resultado |
|---|---|
| `inicio_visual_v013` | 7/7 PASS |
| `paridad_visual_sectores_v013` | 7/7 PASS |
| `presentacion_convergencia_v013` | 7/7 PASS |
| `instalador_visual_v013` | 9/9 PASS |
| `reparar_presentacion_v013` | 6/6 PASS |
| `validar_html` | 22/22 PASS |
| Batería completa (`tools/verificar.mjs`) | **44 suites · 0 fallos** |
| Núcleo ECICEP (`ejecutar_local`) | 673/673 PASS |

## Publicación

- `clasp push --force` + deploy reutilizado del **deployment operativo inmutable**
  (`AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`)
  → misma URL/QR; smoke anónimo HTTP 200 con `0.13.0`.

## Nota operativa

La validación real del Spreadsheet (reparar presentación + instalar/reparar,
2 pasadas) la ejecutó la usuaria con sesión de Google, confirmando la migración
de la portada a 30 columnas y la convergencia de paridad.