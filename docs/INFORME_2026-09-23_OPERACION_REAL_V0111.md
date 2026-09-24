# Informe v0.11.1 — Estabilización de operación real

**Fecha:** 2026-09-23  
**Aplicación / esquema / captura:** `0.11.1` / `2` / `V4`  
**Arquitectura:** un proyecto Apps Script, un Spreadsheet, una Web App, un backend y un pipeline.

## Resultado implementado

El sistema ya no resume toda su condición en un booleano ambiguo. El diagnóstico
rápido valida estructura, esquema, trigger y respaldo sin barrer datos clínicos.
La auditoría profunda revisa huérfanos, cachés de atenciones, ingresos, vistas,
estratificación y duplicados; persiste solo conteos técnicos. Cualquier mutación
canónica marca ese resultado como desactualizado.

El trigger de ingreso se considera correcto únicamente cuando existe una vez,
es de tipo `ON_EDIT` y apunta al Spreadsheet operativo. La ausencia, duplicación
o fuente incorrecta deja `operativo=false`. El respaldo tiene estado propio y no
se presenta como validado si no hay carpeta, trigger o ejecución observable.

El instalador y la reparación administrativa usan el orden `lock → backup →
mutación`. La reparación es selectiva: recalcula controles, estratificación,
ingresos o vistas solo cuando el diagnóstico lo exige. Los eventos huérfanos y
los duplicados se conservan como evidencia para revisión humana.

La captura reemplaza búsquedas con `findAll()` por `findNext()` sobre la columna
`RESPONSE_ID`. La reconciliación de una marca busca en `NOTA_SISTEMA` según el
localizador robusto de encabezados; el barrido heredado se reserva a hojas sin
esa columna.

## Interfaz

Instalación muestra tarjetas de Datos, Integridad, Ingreso y Respaldo, ofrece una
auditoría profunda y una reparación respaldada. Backups muestra el día, hora y
retención reales; diferencia respaldos automáticos, manuales y previos a una
reparación.

## Validación local

- Núcleo: 671/671.
- Contrato de captura V4: 36/36.
- Formulario: 50/50.
- HTML embebido: 22/22.
- Nuevas suites: operación real 6/6, salud 5/5 y rendimiento 3/3.
- Verificador completo: 32 suites.

## Corrección post-validación de MIG-001

Una ejecución real informó `MIG-001:SECTOR_NARANJO:ENCABEZADOS_INCOMPATIBLES`.
La causa era una vista derivada heredada cuya cabecera no estaba en la fila
visual esperada o ya no conservaba la identidad mínima. La migración ahora busca
la cabecera en las primeras diez filas. Si puede reconocerla, reordena por nombre;
si no puede, reconstruye exclusivamente la vista `SECTOR_*` con el contrato
canónico y la repuebla desde `PACIENTES + EVENTOS`. No interpreta ni elimina
datos canónicos. La regresión quedó cubierta en `regresiones_revision` (45/45).

## Publicación y validación operativa

Publicado en el deployment operativo existente **@230**, sin cambiar URL ni QR.
El smoke anónimo respondió HTTP 200 y confirmó `0.11.1` / build `3fdeca6`.

`clasp run` no dispone de autorización de ejecución sobre el Spreadsheet. Por
ello la
instalación real del trigger, la creación de un backup y la auditoría profunda
contra datos reales deben confirmarse desde **Instalar / reparar** con una sesión
Google autorizada. Esto se informa como pendiente y no como éxito supuesto.

## Corrección del buscador

Se corrigió la incompatibilidad entre `api_buscar`, que devuelve `{ok, filas}`, y la interfaz, que aún esperaba un arreglo. La UI valida errores lógicos, extrae `filas` y conserva compatibilidad con la respuesta anterior. Regresión Operador/Resiliencia: 33/33.
