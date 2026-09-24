# Informe v0.12.0 — rediseño visual y automatización de Sheets

**Fecha:** 2026-09-23  
**Esquema:** 2, sin migración nueva  
**Contrato de captura:** V4, sin cambio clínico

## Incidente corregido

La fase `Reconciliando derivados` podía terminar con `Detalle: error` aunque la
reparación hubiera conciliado todas las diferencias regenerables. El diagnóstico
mezclaba esas diferencias con evidencia histórica que debe conservarse y solo
reportarse, como eventos huérfanos o identificadores/fuentes duplicados.

`Integridad_diagnosticarDerivados_` distingue ahora:

- estado derivado reparable;
- evidencia de solo reporte;
- advertencias que no autorizan borrado automático.

`Integridad_repararDerivados_` devuelve éxito cuando los derivados quedaron
consistentes y adjunta la evidencia histórica como advertencia. Si permanece una
diferencia reparable, informa conteos y motivo concreto. La pantalla del
instalador conserva las advertencias sin convertirlas en un fallo genérico.

## Rediseño del libro

- Se centralizaron tokens, anchos, formatos y familias de hoja en
  `DESIGN_SYSTEM` y `HOJAS_UX`.
- `INICIO` fue reconstruida como centro operativo ligero, limitado a `A1:AF60`,
  con seis accesos, resumen por sector, estado, pendientes y snapshots agregados
  sin PII.
- La portada ya no depende de fórmulas que recorren tablas clínicas completas.
- El orden operativo empieza en INICIO y PACIENTES, continúa por puertas de
  ingreso, vistas sectoriales y REM.
- Las fórmulas condicionales resuelven columnas por nombre y soportan columnas
  posteriores a Z.
- Validaciones, notas, formatos numéricos y formato condicional son operaciones
  separadas.
- Las protecciones ajenas a ECICEP se preservan y no se instalan filtros
  compartidos automáticos.
- El formato diferencia columnas editables, técnicas y derivadas.

## Automatización y rendimiento

- Se añadió un trigger instalable `ECICEP_onChangeLibro` que solo marca flags
  ante cambios estructurales.
- El mantenimiento visual y el refresco de INICIO se ejecutan selectivamente.
- Las escrituras de pacientes, eventos, respuestas e ingresos garantizan
  capacidad por bloques y preparan solo las filas nuevas.
- Se retiró el formateo global de hojas de ingreso del camino caliente de
  captura.
- El menú agrega `Inicio`, `Actualizar Inicio` y `Reparar presentación`.

## Instalador

La fase `Presentación del libro` aplica y verifica el diseño profesional sin
congelar parcialmente celdas combinadas. La fase `Automatizaciones` asegura los
triggers propios de ingreso y de cambio estructural. El diagnóstico reporta por
categoría cuántos ajustes visuales quedan pendientes.

## Validación

Se añadieron las suites:

- `design_system_sync_v012.mjs`
- `hojas_visual_v012.mjs`
- `inicio_v012.mjs`
- `automatizacion_hojas_v012.mjs`

La batería conserva las pruebas de núcleo, captura, contrato, seguridad,
instalador, integración, HTML y operación real. La guía operativa está en
`docs/GUIA_VISUAL_HOJAS_V012.md`.
