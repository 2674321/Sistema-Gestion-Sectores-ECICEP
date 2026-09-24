# Informe v0.12.2 — Instalador y formato visual

**Fecha:** 2026-09-24

**Baseline:** `cb01e7c` · ECICEP 0.12.1 · schema 2 · captura V4

**Resultado local:** PASS · 40 suites · 0 fallos

## Problema confirmado

La reparación real fallaba en **Presentación del libro** con:

```text
INICIO: No se pueden inmovilizar filas que solo contengan parte de una celda combinada.
```

`INICIO!A1:X2` es una celda combinada de dos filas. El motor genérico trataba la
portada como una hoja simple y podía ejecutar `setFrozenRows(1)`, dividiendo esa
combinación. La portada tenía además su propio freeze final, por lo que existían
dos responsables para la misma propiedad.

La corrección excluye `INICIO` del freeze genérico. `Inicio_construir_` es ahora
el único owner: destraba filas y columnas, construye, verifica y finalmente deja
`2` filas y `0` columnas inmovilizadas. Una regresión reproduce `A1:X2` combinada
y falla si cualquier otro módulo intenta congelarla parcialmente.

## Instalador

La interfaz muestra tres niveles simultáneos:

- estado general;
- fase actual;
- subtarea real de la fase reanudable.

El porcentaje usa fases completadas y el cursor devuelto por el backend. No hay
temporizadores simulando avance. Los estados visibles son `PENDIENTE`,
`EJECUTANDO`, `OK`, `ADVERTENCIA` y `ERROR`, cada uno con texto e icono.

El diagnóstico previo resume versión, schema, backup, trigger de ingreso,
integridad, presentación e `INICIO`. Los errores presentan primero un mensaje
operativo y mantienen el detalle técnico desplegable. **Reintentar esta
subtarea** conserva `_EJEC`, cursor y backup. La acción **Reparar presentación**
invalida solo el fingerprint visual y reutiliza el mismo deployment.

El cierre informa fases correctas, advertencias, errores, versión/build,
resultados relevantes y duración total. `PACIENTES_SIN_SECTOR` continúa como
advertencia y no se convierte en un fallo de instalación.

## Contrato visual

`FORMATO_TIPOS` define `ID`, `TEXTO`, `TEXTO_LARGO`, `ENUM`, `FECHA`,
`FECHA_HORA`, `BOOLEANO`, `NUMERO` y `SISTEMA`. `FORMATO_CAMPOS` sobrescribe lo
necesario usando nombres reales del modelo.

| Campo o tipo | Resultado |
|---|---|
| RUT, teléfonos e IDs | texto `@`, alineación izquierda |
| Fechas | `dd/MM/yyyy`, centradas |
| Fecha-hora | `dd/MM/yyyy HH:mm`, centrada |
| EDAD y cantidades | formato `0` |
| Nombre y textos largos | izquierda; wrap cuando corresponde |
| Estado, sector y estratificación | centrados |
| Filas de datos | 23 px, sin autoajuste por observaciones |

Las superficies distinguen edición, sistema, derivado y técnico.
`ESTADO_INGRESO` conserva la superficie editable y sigue siendo el disparador
transaccional. `SECTOR_*` comunica que es una vista automática.

## Responsabilidades

| Propiedad | Owner |
|---|---|
| Título, secciones, encabezado y freeze de hojas visuales | `22_HojasVisual.js` |
| Validaciones de puertas `INGRESO_*` | `Modelo_validarIngresos` |
| Anchos, number format y semántica de datos | `35_Presentacion.js` + helpers de `34_LibroUX.js` |
| Reglas condicionales | `Hojas_aplicarFormatoCondicional_` |
| Notas de encabezado | `Hojas_aplicarNotas_` mediante `setNotes` |
| Layout y freeze de `INICIO` | `Inicio_construir_` |

La fase `estructura` dejó de aplicar presentación completa a `PACIENTES`; solo
conserva la reparación estructural del grupo legacy que podía ocultar columnas
clínicas.

## Idempotencia y rendimiento

- Los rangos visuales usan filas ocupadas más buffer y respetan
  `getMaxRows()` como límite, sin formatear toda la hoja vacía.
- Anchos, encabezados, banding, formatos, validaciones, notas, reglas
  condicionales, orden y freeze se comparan antes de escribir.
- Las notas se actualizan por matriz con `setNotes()` y preservan notas ajenas.
- Las reglas condicionales usan una firma estable; una lista equivalente se
  omite.
- La presentación mantiene el presupuesto de 20 segundos y ahora tiene 10
  subtareas reanudables.
- Los fingerprints de Presentación e `INICIO` permiten que una segunda pasada
  correcta omita el trabajo visual.

## Verificación

```text
tests/instalador_formato_visual_v0122.mjs       20/20
tests/inicio_portada_freezerows_v0121.mjs        8/8
tests/instalador_presentacion_timeout_v0121.mjs 19/19
node tools/verificar.mjs                  40 suites · 0 fallos
git diff --check                                     OK
```

La suite nueva cubre los 20 casos solicitados, incluida ausencia de escrituras
en estado correcto, formatos canónicos, owner único de validaciones, rango
gestionado, notas batch, firma condicional, orden sin movimientos, preservación
de protecciones manuales, secuencia de freeze, fingerprint, retry y ausencia de
escrituras clínicas desde el motor visual.

La verificación E2E en la Web App detectó y corrigió además una excepción del
token visual compartido: el preconnect de fuentes llamaba `createElement` sobre
`document.documentElement`. Ahora usa `document.createElement`, por lo que las
vistas dejan de emitir el error sin cambiar su carga no bloqueante.

## Contratos preservados

- un único proyecto Apps Script y un único Spreadsheet operativo;
- Web App como único canal de captura;
- schema 2 y captura V4;
- `PROXIMO_CONTROL` manual;
- misma URL, QR y deployment operativo.

La referencia de publicación final se registra después de actualizar el
deployment operativo.
