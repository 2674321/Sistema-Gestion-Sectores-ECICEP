# INFORME INST-1 — Endurecimiento del Instalador, Versionado y Migraciones

Cierre de la fase **INST-1** (DEC-059), publicación **@102**.

## Estado

- **Esquema versionado** y motor de migraciones declarativas idempotentes operativos:
  el instalador ya conoce la versión estructural, la clasifica y la hace evolucionar
  sin adivinar ni reescribir.
- **Código + tests + docs + deploy + E2E real**: completos y verificados.
- **E2E real (usuario)**: el diagnóstico del instalador muestra **VIGENTE** tras la
  instalación. No hay escenarios DIVERGENTE/DESCONOCIDA activos.

## Arquitectura (nueva pieza)

- **Fuente única de versiones** (`src/00_Config.js`): `SISTEMA_VERSION_SCHEMA_ACTUAL = 1`
  (esquema estructural) y `SISTEMA_VERSION_INSTALADOR = 'INST-1'`.
- **Semántica de versión**: `SCHEMA_VERSION` ausente/vacía/ilegible ⇒ esquema legacy `'0'`
  (nunca VIGENTE por defecto). Solo `Mig_ejecutarDeclaradas(…persistir:true)` escribe
  `SCHEMA_VERSION`/`LAST_MIGRATION`; no se siembra en `_CONFIG_SEMILLA`.
- **Motor** (`src/20_Instalador.js`): `REGISTRO_MIGRACIONES`, `Mig_pendientesPura`
  (cadena determinista, objetivo parametrizable), `Mig_clasificarInstalacion`
  (NUEVA/VIGENTE/ANTIGUA/DIVERGENTE/INCOMPLETA/DESCONOCIDA), `Mig_ejecutarDeclaradas`
  (fallo ⇒ detiene sin avanzar versión), `Mig_schemaLeido`, `_inst_configEscribir`,
  `Mig_ejecutarPersistente`, `Mig_run001`, `Instalar_ejecutarPolitica`.
- **Instalador**: etapas `versionado` (solo lectura) y `migraciones` (mutante)
  tras `diagnostico`; `INSTALAR_ETAPAS_MUTAN` + LockService (`tryLock(30000)`,
  `releaseLock` en `finally`) en `api_instalarPaso`; `Instalar_diagnosticar`
  usa `Modelo_escanearEstructura` (solo lecturas) y ya **no invoca**
  `Modelo_crearEstructura()`; `Instalar_pVerificar` reporta `schemaVersion`/`esquemaOK`/`estado`.
- **Webhook**: `action:'instalar'` ⇒ `Instalar_ejecutarPolitica()` (DIVERGENTE/
  DESCONOCIDA = error sin mutar; INCOMPLETA = repara; luego migraciones persistentes).
- **UI**: bloque VERSIONADO en el panel y en el diagnóstico; pesos de etapa
  (`versionado:1`, `migraciones:2`); resumen final con esquema y migraciones.
- **Sin lógica paralela**: Actualizar (DEC-058) no referencias el motor; las
  migraciones solo tocan estructura (sin append/insert de filas ni PACIENTES/EVENTOS).

## Migraciones (registradas)

| ID | desde | hasta | Descripción | Resultado |
| --- | --- | --- | --- | --- |
| MIG-001 | `0` | `1` | Alinear `SECTOR_*` 15→16 columnas canónicas (`COLUMNAS_SECTOR_VISTA`, `FECHA_NACIMIENTO`) por nombre; `HOJA_NO_EXISTE`/`SIN_ENCABEZADOS` ⇒ `sinObjeto`; `ENCABEZADOS_INCOMPATIBLES` ⇒ falla (no adivina). Idempotente. | Suspendida/lista; E2E real: instalación VIGENTE; es la vía por-registro de la protección BUG-E2E-003 |

## Tests

Suite `_pruebas_inst1_versionado` (T1–T15) en `src/10_Pruebas.js`.

- Núcleo: **534 → 549** (549/549 OK).
- Batería completa: aceptación **50/50** · backend V2 **65/65** · UI payload V2 **19/19** ·
  cola FORM_RESPUESTAS **33/33** · contrato captura V2 **36/36** · contrato de datos **20/20** ·
  formulario web **25/25**.

## E2E real

- Resultado del instalador en el spreadsheet operativo: **VIGENTE** (confirmado por el usuario).
- `/exec`: **HTTP 200** (formulario + profesionales, canal operativo intacto).
- Nota observada (fuera de INST-1): el Dashboard muestra ESTRATIFICACIÓN G1/G2/G3 = 0 porque
  los 2603 pacientes tienen `ESTRATIFICACION` sin confirmar (ESTRAT. PENDIENTE = 2603 = 100%).
  Estado de **datos** esperado, coherente con `COUNTIF` sobre columna vacía; no es regresión
  (MIG-001 no toca PACIENTES ni Dashboard). Para asignar G1/G2/G3 hace falta cargar/confirmar
  estratificación vía `CONDICIONES` o captura — fuera del alcance de INST-1.

## Git / Deploy

- Commit: `559cd8c` — «INST-1: endurecer instalador y sistema de migraciones (DEC-059)»
  (12 archivos, +926 líneas; incluye `docs/VERSIONADO.md`, `docs/MIGRACIONES.md`).
- `clasp push --force` ✓ · deployment operativo **@102** (misma URL, sin crear deployments) ✓.

## Riesgos / pendientes

- BUG-E2E-004: mejora opcional no bloqueante (alineación que repare encabezados y regenere
  desde PACIENTES/EVENTOS sin remapear por nombre) — sin código, documentado en
  `docs/INFORME_BUGS_E2E.md`.
- Nueva migración futura (p. ej. `1→2`): basta añadir su registro `{id, desde, hasta, fn}` +
  implementación + test T-serie. La cadena y la clasificación se ajustan solas.
- Estratificación de pacientes (carga/confirmación de G1/G2/G3): tarea operativa/de datos,
  fuera de INST-1.