# Guía visual de hojas — ECICEP v0.12.0

## Propósito

El libro usa una sola gramática visual para distinguir trabajo manual, datos del
sistema, vistas derivadas y soporte técnico. El color de un sector identifica su
familia; no expresa por sí solo un estado clínico.

## Orden y visibilidad

El orden operativo visible es:

1. `INICIO`
2. `PACIENTES`
3. `INGRESO_NARANJO`, `INGRESO_AMARILLO`, `INGRESO_VERDE`
4. `SECTOR_NARANJO`, `SECTOR_AMARILLO`, `SECTOR_VERDE`
5. `REM_SALIDA`

`EVENTOS` conserva el historial. Las hojas técnicas siguen ocultas cuando el
modelo lo indica. El instalador no oculta hojas adicionales creadas por el
usuario.

## Semántica visual

| Familia | Uso | Apariencia de datos |
|---|---|---|
| Entrada | `INGRESO_*` | Fondo blanco, editable |
| Canónica | `PACIENTES` | Campos clínicos editables y campos técnicos diferenciados |
| Vista | `SECTOR_*` | Fondo derivado, regenerable desde el modelo |
| Historial | `EVENTOS` | Fondo técnico, una columna inicial inmovilizada |
| Reporte | `REM_SALIDA` | Visible, lectura y exportación |
| Técnica | `CONFIG`, `LOG`, `FORM_RESPUESTAS` | Fondo técnico y visibilidad según el modelo |

Los anchos, formatos y colores se obtienen de `DESIGN_SYSTEM`; los tokens
críticos coinciden con `00_Tokens.html`. Las fechas usan `dd/MM/yyyy`, los
identificadores, RUT y teléfonos se conservan como texto.

## INICIO

> **v0.13.0:** la portada migró al lienzo de 30 columnas `A1:AD38` (cinco accesos,
> tres tarjetas, bloques ESTADO/PENDIENTES, metadata y nota operativa). Guía
> vigente: `docs/INFORME_V013_CIERRE_VISUAL.md`.

En v0.12.x `INICIO` administraba `A1:AF60`. La reconstrucción separa las
celdas combinadas dentro de ese rango, lo limpia y vuelve a crear accesos,
resumen por sector, estado del sistema, pendientes y metadatos. No borra el
resto de la hoja.

Sus cifras son snapshots agregados sin datos personales. No instala fórmulas
que recorran columnas clínicas completas. Las mutaciones marcan el snapshot
como desactualizado y `Actualizar Inicio` lo recalcula de forma explícita.

## Reparación e instalación

`Instalar / reparar` incluye una fase `Presentación del libro`. Reaplica diseño,
validaciones, notas, formatos, colores de pestaña, inmovilización y orden de
forma idempotente. `Reparar presentación` permite ejecutar solo esa parte.

La reparación elimina únicamente protecciones cuya descripción comienza con
`ECICEP:`. Las protecciones ajenas se preservan. No crea filtros compartidos
automáticos, porque pueden interferir con el trabajo simultáneo.

## Automatización

El trigger instalable `ECICEP_onChangeLibro` solo marca indicadores de trabajo
pendiente ante cambios estructurales. No formatea ni recorre el libro dentro del
trigger. Las filas nuevas reciben capacidad, estilo, validaciones y formatos al
ser creadas por el sistema.

## Operación recomendada

- Use la Web App para toda captura clínica.
- Use `INGRESO_*` como puerta administrativa y `SECTOR_*` como vista automática.
- Registre `PROXIMO_CONTROL` manualmente desde Captura o la ficha.
- Ejecute `Actualizar Inicio` para refrescar indicadores a demanda.
- Ejecute `Reparar presentación` si una hoja perdió formato por una edición
  estructural.
