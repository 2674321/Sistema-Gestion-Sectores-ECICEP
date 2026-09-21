# VERSIONADO — Esquema del sistema e instalador (INST-1, DEC-059)

Normativo para la fase **INST-1** (release `INST-1`): qué versión identifica el
esquema, cómo se lee, qué significan los estados de instalación y dónde vive la
versión del instalador.

## Versión canónica del esquema

- **`SISTEMA_VERSION_SCHEMA_ACTUAL`** (constante en `src/00_Config.js`): número
  entero de la versión estructural vigente del sistema (hojas + layout + vistas).
  Actualmente **`2`** (v0.10 · MIG-002: campo `SALUD_MENTAL`).
- **Regla de semejanza**: si la clave `SCHEMA_VERSION` en CONFIG **está ausente,
  vacía o ilegible**, la instalación se considera esquema **legacy `'0'`** (no se
  asume VIGENTE por omisión). Esta regla también protege contra migraciones que
  recién se incorporan al sistema.
- La versión instalada se **persiste** en CONFIG (`SCHEMA_VERSION` y
  `LAST_MIGRATION`) **solo por el motor de migraciones** (ver `MIGRACIONES.md`).
- Nunca se siembra `SCHEMA_VERSION` en la semilla de CONFIG: sembrar el valor
  canónico enmascararía una instalación legacy como VIGENTE y **saltaría** el
  sistema de migraciones (protección contra una regresión tipo BUG-E2E-003).

## Versión del instalador

- **`SISTEMA_VERSION_INSTALADOR`** (misma fuente): identificador del propio
  instalador, actualmente **`'INST-1'`**. Se expone en el panel
  (`api_instalarEtapas` → `instalador`) y en el diagnóstico de la UI.

## Estados de instalación (`Mig_clasificarInstalacion`)

Clasificación **pura y determinista** a partir del escaneo solo-lectura de la
estructura (`Modelo_escanearEstructura`, nunca `Modelo_crearEstructura`):

| Estado | Condición | Acción recomendada |
| --- | --- | --- |
| **NUEVA** | Sin datos y esquema `'0'` (sin versionar) | Instalar completo |
| **VIGENTE** | Esquema = objetivo, sin sectores divergentes, sin críticas faltantes | Ninguna |
| **ANTIGUA** | Hay migraciones pendientes hacia el objetivo **o** vistas `SECTOR_*` divergentes aunque `SCHEMA_VERSION` diga estar al día | Migrar |
| **DIVERGENTE** | Esquema **mayor** que el objetivo canónico (código desactualizado) | Revisión (no migrar; versión superior = el sistema sabe algo que el código no) |
| **INCOMPLETA** | Faltan hojas críticas | Reparar estructura |
| **DESCONOCIDA** | `SCHEMA_VERSION` ilegible (no numérico) | Revisión segura (no adivinar) |

La propuesta de acción es informativa; el instalador ejecuta la acción que
corresponde en cada fase (ver `MIGRACIONES.md` y la política de instalación).

## Diagnóstico dry-run (`Instalar_diagnosticar`)

- El diagnóstico ya **no invoca** `Modelo_crearEstructura()` (era una mutación
  dentro de un reporte). Usa `Modelo_escanearEstructura(ss)`, que solo lee
  existencia de hojas, tamaño y encabezados (`getSheetByName`/`getLastRow`/
  `getMaxRows`/`getMaxColumns`/`getRange().getValues()`).
- Incluye el bloque **VERSIONADO**: instalador, esquema leído → esperado,
  clasificación, pendientes y sectores divergentes. Se muestra igual en la UI
  (`UI_instalarDiagnosticar`).

## Concurrencia

`api_instalarPaso` toma **LockService** (`tryLock(30000)`) para cada etapa en
`INSTALAR_ETAPAS_MUTAN` (migraciones, estructura, fuentes, amarillo,
enriquecimiento, visual, validaciones, diseño, inicio, menú, derivados) — desde
v0.10 las etapas de carga de datos reales son mutantes y toman el lock. Las fases
de solo lectura (runtime, diagnóstico, versionado, limpieza, verificar) no toman
lock. Si está ocupado devuelve `{ok:false, motivo:'CONCURRENCIA'}`;
`releaseLock` en `finally`. En node (`LockService` ausente) una etapa mutante
responde `LOCK_NO_DISPONIBLE` sin ejecutar (las pruebas inyectan un lock real).

## Diagnóstico del verificador (`Instalar_pVerificar`)

Reporta también `schemaVersion` (leído), `esquemaOK` (bool) y `estado`
(clasificación), de modo que la verificación final del panel y la política del
Webhook sepan si la instalación quedó VIGENTE.

La instalación bloquea las etapas mutantes si `SCHEMA_VERSION` no es numérica
o supera la versión que conoce el código, incluso cuando faltan hojas y la
clasificación general es INCOMPLETA. No intenta reparar ni retroceder ese
esquema. La verificación final devuelve `ok:false` si no queda VIGENTE.

## Política del Webhook (`action: instalar`)

`Instalar_ejecutarPolitica()` decide en tiempo real:

1. Si `DIVERGENTE` o `DESCONOCIDA` → respuesta de error **sin mutar nada**.
2. Si `INCOMPLETA` → repara estructura (`Modelo_crearEstructura()`).
3. Luego ejecuta `Mig_ejecutarPersistente()` (aplica pendientes y persiste
   `SCHEMA_VERSION`/`LAST_MIGRATION` en GAS) y devuelve el estado final.

Ver `MIGRACIONES.md` para el motor y el registro de migraciones.
