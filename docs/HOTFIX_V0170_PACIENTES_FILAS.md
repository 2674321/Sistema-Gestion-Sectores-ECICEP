# HOTFIX (línea v0.17.0-final) — Saltos de fila en altas de PACIENTES

## Síntoma
Al dar de alta pacientes nuevos en la hoja `PACIENTES`, el registro aparecía
~200 filas por debajo del último paciente real, dejando un bloque de filas
"vacías" que solo contenían el default técnico `FALSE` en la columna
`REQUIERE_REVISION` (última, AE). La contigüidad índice↔fila se rompía.

## Causa raíz (probada)
`Modelo_agregarPacientes_` decidía el destino con
`hoja.getLastRow() + 1` **después** de llamar a
`Hojas_asegurarCapacidadGestionada_`. Cuando esa función expandía la hoja e
insertaba un bloque de reserva, `Hojas_prepararRangoDatos_` podía dejar valores
técnicos (`FALSE`) en la columna `REQUIERE_REVISION` del bloque nuevo. Como GAS
cuenta el booleano `false` en `getLastRow()`, la reserva quedaba "ocupada" y el
alta se escribía detrás de las ~200 filas reservadas.

`insertCheckboxes`/`requireCheckbox`/escritura de `FALSE` **no existen** en el
código actual ni en el historial Git: el valor residual proviene de una acción
manual/legacy sobre la hoja. La corrección es defensiva: robusta ante cualquier
valor residual, sin depender de su origen.

## Corrección
- `src/06_Modelo.js`
  - Nuevo `Modelo_ultimaFilaPaciente_(hoja)`: fila física del último paciente
    real (columna `ID_INTERNO` no vacía). No usa `getLastRow()` ni
    `getMaxRows()` para decidir; conserva huecos históricos y el mapeo
    índice↔fila. Con 0 pacientes devuelve `dataStartRow - 1`.
  - Nuevo `Modelo_destinoPacientesLibre_(hoja, filaDestino, cantidad)`: valida
    que el rectángulo destino esté vacío o contenga a lo sumo el default
    técnico `FALSE` en `REQUIERE_REVISION`. Cualquier otro contenido →
    `DESTINO_PACIENTES_OCUPADO` (jamás se sobrescriben datos sin clasificar).
  - `Modelo_agregarPacientes_`: calcula `filaDestino` con
    `Modelo_ultimaFilaPaciente_(hoja) + 1` **antes** de expandir capacidad,
    asegura capacidad hasta `filaFinal`, valida libertad y escribe exactamente
    en `filaDestino`. `throw SIN_HOJA_PACIENTES` si no hay hoja.
  - `Modelo_agregarEventos_`: `filaDestinoEventos = getLastRow() + 1` fijado
    antes de expandir (append-only preservado).
  - `Modelo_asegurarEsquemaPacientes_`: corregido `ReferenceError` latente de
    la variable `contexto` inexistente → `Modelo_invalidarLecturas_()`.
- `src/34_LibroUX.js`
  - `Hojas_asegurarCapacidad_`: tras `Hojas_prepararRangoDatos_`, un
    `clearContent()` (mejor esfuerzo, envuelto en `try`) sobre el rango recién
    insertado garantiza reservas **vacías** de valores, preservando
    estilo/formato/validaciones y sin tocar datos reales.

## Concurrencia
Lectura-comprobación-escritura corre serializada: los llamadores canónicos
(revision resolver, incorporación de ingresos, carga real) ya poseen
`Ecicep_conLock_` (`ScriptLock` no es reentrante, así que no se añadió lock
anidado). EVENTOS sigue siendo estrictamente append-only.

## Verificación
- `tests/pacientes_destino_consecutivo_vNEXT.mjs`: 12/12 PASS (hoja vacía,
  contigüidad N→N+4, expansión de 200 filas, reserva contaminada, datos sin
  identidad → `DESTINO_PACIENTES_OCUPADO`, hueco histórico, lote, re-alta
  rechazada, concurrencia/lock externo, patrón viejo vs nuevo, EVENTOS
  append-only, idempotencia de capacidad).
- Batería base sin regresiones: `ejecutar_local.mjs` 679/679,
  `aceptacion_formulario.mjs` 50/50, `contrato_captura_v2.mjs` 36/36,
  `validar_html.mjs` 20/20, `automatizacion_hojas_v012.mjs` 11/11.

## Publicación
- `clasp push --force`: **OK** (59 archivos sincronizados; el proyecto Apps Script
  ya ejecuta el código con el fix, incluido el deployment `@HEAD`).
- `clasp deploy` sobre el deployment operativo
  `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`
  (`@275`, el que sirve `ECICEP.WEB_APP_URL` y el QR): **BLOQUEADO** — el script
  alcanzó el límite duro de **200 versiones** de Apps Script (máx. actual: 275).
  No se puede crear la versión 276 sin eliminar una versión previa desde la
  página de historial del proyecto (script.google.com). `clasp` no elimina
  versiones.
- Consecuencia: el código desplegado (`@HEAD`) ya tiene el fix, pero la Web App
  operativa (`@275`, QR) **todavía no** lo sirve hasta liberar cupo de versiones
  y republicar el mismo deployment. **No** crear un deployment nuevo (invalidaría
  el QR vigente).

## Alcance / no-alcance
- No se modificaron datos clínicos de producción.
- No se recompactaron las otras hojas (ya saneadas).
- No se filtró `Modelo_leerPacientes_` (rompería el mapeo índice↔fila).
- No se creó entorno/planilla paralela.
