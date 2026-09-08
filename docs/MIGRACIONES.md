# MIGRACIONES — Motor de migraciones estructurales (INST-1, DEC-059)

Normativo para la fase **INST-1**: cómo el sistema pasa su esquema estructural de
una versión a otra de forma **declarada, idempotente y determinista**, sin
reescribir el instalador ni crear lógica paralela.

## Ideas rectoras

- **Un único autor del esquema**: solo el motor de migraciones escribe
  `SCHEMA_VERSION` y `LAST_MIGRATION` en CONFIG. Nada más versiona la estructura.
- **Versión ausente ≡ `'0'`**: lo no versionado es legacy, nunca VIGENTE por
  defecto (ver `VERSIONADO.md`).
- **Declarativo**: cada migración se declara en `REGISTRO_MIGRACIONES` con
  `{id, desde, hasta, fn, descripcion}`; el motor la resuelve por nombre
  (`GV[fn]`) y la invoca con `ctx`.
- **Determinista**: la cadena pendiente se ordena por `desde` ascendente y, a
  igualdad, por `id`. El objetivo es `SISTEMA_VERSION_SCHEMA_ACTUAL` salvo que se
  indique otro (p. ej. en tests).
- **Nunca retroceder**: una migración pendiente requiere `desde ∈ [actual,
  objetivo)` — por construcción las cadenas solo avanzan el esquema.
- **No ocultar divergencias**: si las vistas `SECTOR_*` están desalineadas con el
  esquema canónico aunque `SCHEMA_VERSION` diga estar al día, la instalación se
  clasifica **ANTIGUA** y se re-aplica la migración correspondiente (defensa
  directa contra la regresión BUG-E2E-003).

## Registro

`REGISTRO_MIGRACIONES` (en `src/20_Instalador.js`):

| ID | desde | hasta | Función | Descripción |
| --- | --- | --- | --- | --- |
| MIG-001 | `0` | `1` | `Mig_run001` | Alinear las hojas `SECTOR_*` de **15** a las **16** columnas canónicas (`COLUMNAS_SECTOR_VISTA`, `FECHA_NACIMIENTO`) por nombre de encabezado: `HOJA_NO_EXISTE`/`SIN_ENCABEZADOS` → `sinObjeto`; `ENCABEZADOS_INCOMPATIBLES` → la migración **falla, no adivina**. Sin append/insert de filas ni columnas; solo reescritura en sitio de datos alineados. Es el camino por-registro de la protección ya validada en S10-FIX.3/BUG-E2E-003. |

## API (todas en `src/20_Instalador.js`)

- `Mig_pendientesPura(actual, registro, objetivo?)` — **pura**: devuelve la
  cadena de migraciones pendientes entre `actual` y `objetivo` (default el
  canónico), ordenada. Nunca invoca funciones GAS.
- `Mig_clasificarInstalacion(snapshot, schemaVersion, registro)` — **pura**:
  clasifica la instalación (tabla de estados en `VERSIONADO.md`) y devuelve
  `pendientes`, `sectores`, `sectoresDivergentes`, etc.
- `Mig_ejecutarDeclaradas(registro, ctx)` — **pura (por defecto)**: ejecutor
  declarativo. `ctx = {schemaVersion, pendientes?, persistir, objetivo, g?}`.
  - `persistir:true` → por cada éxito escribe `SCHEMA_VERSION` y `LAST_MIGRATION`
    (vía `_inst_configEscribir`). Es **el único** punto que versiona CONFIG.
  - Ante el **primer fallo**: para la cadena, reporta la migración fallida y NO
    escribe su versión (no se marca como aplicada).
  - Con `ctx.g` se puede inyectar el `global` donde resolver `fn` (tests).
- `Mig_schemaLeido()` — lee `SCHEMA_VERSION` de CONFIG (`_rem9_configValor`).
- `Mig_ejecutarPersistente()` — **GAS**: escanea la estructura, clasifica, aplica
  pendientes con persistencia y devuelve `{versionInicial, versionFinal,
  aplicadas, estado}`.
- `Mig_run001()` — implementación de MIG-001 (idempotente, defensiva).
- `Instalar_pVersionado` / `Instalar_pMigraciones` — etapas del instalador:
  **versionado** = solo lectura (clasifica y reporta); **migraciones** =
  `Mig_ejecutarPersistente()`. Orden de `INSTALAR_ETAPAS`: `runtime, diagnostico,
  versionado, migraciones, estructura, fuentes, amarillo, visual, validaciones,
  limpieza, diseno, inicio, menu, enriquecimiento, verificar`.
- `_inst_configEscribir(clave, valor)` — puerto de persistencia de CONFIG (en
  GAS → `_config_set`; en tests puede espiarse/inyectarse).

## Contratos de ejecución

- **La función de migración recibe** el `ctx` y debe devolver `{ok:boolean,
  motivo?}`. Si no existe `fn` en el global → error controlado
  (`FUNCION_AUSENTE`), no silencioso.
- **Idempotencia**: ejecutar dos veces la misma cadena no duplica nada; la
  segunda clasificación reporta `aplicadas: []`.
- **Solo estructura**: una migración solo toca hojas/estructura; no crea
  pacientes ni eventos (verificado por test de "no duplicación").
- **Diagnóstico y versión** nunca mutan: `Modelo_escanearEstructura` solo lee.

## Pruebas

Suite `_pruebas_inst1_versionado` (T1–T15) en `src/10_Pruebas.js`, +15 casos
verdes (núcleo **534 → 549**): constantes canónicas, clasificación (ausente/
ilegible/mayor/incompleta), NUEVA/VIGENTE/ANTIGUA, cadena determinista
(con objetivo parametrizable para simular cadenas multi-versión), contrato de
persistencia (fuente única), detención ante fallo con versión sin avanzar,
diagnóstico no-mutante, LockService en mutantes y ausente en solo-lectura,
Actualizar sin referencias al motor, defensa BUG-E2E-003 protegida por MIG-001,
ejecución declarada idempotente con stub.