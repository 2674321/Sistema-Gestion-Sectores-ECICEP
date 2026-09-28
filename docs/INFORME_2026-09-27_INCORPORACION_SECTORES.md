# Informe — incorporación a sectores (2026-09-27)

## Causa raíz

El pipeline trataba `PACIENTES` como append-only durante la incorporación: al
enlazar una persona existente creaba `INGRESO`, pero no ejecutaba la transición
de sector prometida por la UI. Además, la barrera `(RUT, FECHA_INGRESO)` consultaba
una caché de la entidad en vez de evidencia `EVENTOS`, produciendo falsos
duplicados. `DUPLICADO`/`REQUIERE_REVISION` tampoco tenían semántica terminal
coherente y la UI declaraba éxito sin comprobar la vista derivada.

## Contrato resultante

| Caso | Resultado |
|---|---|
| Nuevo | PACIENTE en sector destino + `INGRESO` |
| Existente, mismo sector | `INGRESO`; sector intacto |
| Existente, otro sector válido | `CAMBIO_SECTOR` + actualización vigente + `INGRESO` |
| Existente, sector vacío | asignación trazada como `CAMBIO_SECTOR` + `INGRESO` |
| Existente, `MULTIPLE` | revisión humana; cero mutación clínica |
| Misma fuente | idempotente; repara estado/vista, sin eventos nuevos |
| Mismo paciente y día | idempotente; aplica regla de un ingreso diario |
| Retry después de cambio posterior | conserva el sector vigente posterior |
| Ambiguo o inválido | revisión/error; cero mutación clínica |

DEC-026 sigue vigente para identidad, demografía y campos clínicos. DEC-100
exceptúa únicamente `SECTOR`, porque el cambio usa una operación de dominio
trazable y no un merge silencioso.

## Implementación y consistencia

- Individual, lote y trigger manual entran a `Ingresos_procesarTodasLasHojas_`.
- Pacientes e ingresos existentes se indexan una vez; no hay búsqueda por fila.
- La transición territorial reutiliza `Paciente_prepararCambioSector_`.
- PACIENTES se escribe por bloques contiguos; si falla el append de EVENTOS se
  aplica rollback compensatorio del sector.
- Se refrescan una sola vez sector anterior y destino. La ausencia en la vista o
  una excepción produce `INCORPORADO_VISTA_PENDIENTE` y
  `VISTA_SECTOR_PENDIENTE`.
- La respuesta conserva metadata de sector, evento de cambio, idempotencia y
  confirmación de vista para que la UI no presente un éxito falso.

## Evidencia

La prueba roja inicial falló porque `sectorAnterior` no existía y el paciente
seguía en el sector antiguo. Tras la corrección, `incorporacion_ingresos_vNEXT`
queda 41/41: cubre individual y lote, cross-sector, falsa duplicidad, retry que
no revierte, `MULTIPLE`, estados terminales, fallo de vista, cola de revisión,
rollback ante fallo de EVENTOS y volumen realista.

Benchmark local del índice puro: 2.713 pacientes + 21.783 eventos en 187 ms. El
algoritmo previo de la barrera recorría PACIENTES y luego volvía a filtrar la
colección por cada duplicado; además no leía EVENTOS. La nueva ruta es O(P+E+F).

## Estado operativo

Validación local completa: núcleo 673/673, aceptación 50/50, contrato V2 36/36,
HTML 21/21, ficha 13/13 e ingreso manual 20/20. La operación valida evidencia
canónica (`PACIENTES` + `EVENTOS`) antes de cerrar una revisión y distingue el
éxito clínico de una vista derivada pendiente. El E2E con datos clínicos reales
no se automatiza: requiere una fila controlada y autorización explícita para
mutarla.
