# INFORME AUDITORÍA v0.10.1 — source sync, backup e idempotencia del Instalar

Fecha de ejecución: 2026-09-22.
Base auditada: v0.10.0 (commit `f7d3f5b`, deployment operativo `@215`).
Objetivo: demostrar con evidencia reproducible que **Instalar / Reparar repetido
no pierde datos, no duplica eventos y deja una copia recuperable previa**.
Resultado: **16 suites · 0 fallos**, incluyendo la nueva
`tests/regresiones_auditoria_v010.mjs` (**15/15**).

---

## 1. Alcance

Se auditó la carga de fuentes (`src/03_Fuentes.js`, `src/12_Ingresos.js`), el
instalador (`src/20_Instalador.js`), el merge conservador
(`src/27_Actualizacion.js`), la migración MIG-002 (`_mig002_asegurarIngresosSaludMental`),
los backups (`src/17_Hojas.js`), la configuración (`src/00_Config.js`) y el
cliente del instalador (`src/Instalador.html`). Solo fixtures sintéticos; sin
libro real, sin red, sin dependencias externas.

Límite vigente (bloqueador): **sin sesión Google en este host** no se pudo
ejecutar E2E real de Instalar contra el libro operativo ni la correspondencia
física de `FUENTES_DRIVE` (AMARILLO/VERDE actualizados 2026-09-15, NARANJO
preservado). Código, migración y tests NO quedan bloqueados.

## 2. Metodología

1. Leer `AGENTS.md` y la documentación vigente antes de tocar contratos.
2. Auditoría adversaria: no confiar en tests verdes; reproducir el problema,
   corregir la causa, añadir test de regresión que bloquee la reaparición.
3. Fixtures 100 % sintéticos; dry-run/preflight solo conteos/IDs/motivos.
4. No se introdujo arquitectura paralela: un solo backend, un solo libro, un
   solo pipeline, Web App único canal de captura.
5. `node tools/verificar.mjs` como oráculo final (16 suites, 0 fallos).

## 3. Hallazgos confirmados (reproducidos)

| Id | Hallazgo | Reproducción | Corrección |
|---|---|---|---|
| B2 | La comparación por FUENTE usaba el literal crudo → drift de mayúsculas/espacios entre configs volvía a generar eventos | `Fuentes_fuenteOrigen` contra `'ECICEP NARANJO|Ingresos Enero '` vs `'ECICEP Naranjo|Ingresos Enero|00123'` | `Fuentes_claveDedupe_` (clave canónica solo para comparar; FUENTE sigue RAW en trazabilidad) |
| B3 | Hojas autorizadas ausentes se salteaban en silencio → conteos mintiendo | Fake de Spreadsheet con una hoja faltante | `Fuentes_preflightFuentes` bloquea `HOJA_FUENTE_FALTANTE` (dry-run y ejecutar, 0 lecturas) |
| B4 | La primera etapa mutante podía escribir sin respaldo previo | Delección: sin Backup antes de lock en `api_instalarPaso` | `Instalar_asegurarBackup_`: `Backup_crear('PRE_INSTALAR')` por token de ejecución; fallo → `BACKUP_FALLIDO`, la etapa NO se invoca; segunda etapa de la misma ejecución reutiliza el respaldo |
| B5 | MIG-002 insertaba `SALUD_MENTAL` por posición (ancho+1) → podía pisar una columna personal real | Hoja con columna extra ocupada tras `NOTA_SISTEMA` | `_mig002_asegurarIngresosSaludMental` por nombre y orden canónico; columna ocupada / encabezado ausente / desorden → `revision[]` + bloqueo `MIG-002:INGRESOS_REVISION:...` |
| B8 | Riesgo de inferir `SALUD_MENTAL` desde texto libre | `Norm_normalizarSaludMental('PS'/'DEPRESION'/'TRUE')` | Ya estricto (`SI`/`SÍ`/`NO`/vacío; resto → `NO_RECONOCIDO` descartado con warning). Solo se añadieron tests de bloqueo |
| B9 | Instalar repetido podía inflar `FUENTE`/`FECHA_ACTUALIZACION` y `STAGING_IMPORT` | Merge 10× con TELEFONOS/ESTRATIFICACIÓN idénticos; doble `Fuentes_guardarFilas` | Guard de snapshot en TELEFONOS (`can === actual` → no-op) + dedupe por origen en STAGING_IMPORT |
| SNAPSHOT | Entre dry-run y ejecución podría releerse Drive (drift entre dosis) | 1 lectura en dry-run + espera de 1 lectura al ejecutar | Memo `_FUENTES_ANALISIS_MEMO` (TTL 1h, poda, se elimina al usar) + `ejecucionId` de `Instalar_pFuentes` → ejecución reutiliza el análisis |

## 4. Cambios de código (sintaxis verificada con `node --check`)

- `src/03_Fuentes.js`: `Fuentes_claveDedupe_` (B2); `Fuentes_preflightFuentes` +
  `Fuentes_preflightInforme_` (B3); refactor `_Fuentes_analizar_`/`_Fuentes_escribir_`
  con memo `_FUENTES_ANALISIS_MEMO` y `ejecucionId` reutilizable (single-read);
  `Fuentes_guardarFilas` con dedupe por FUENTE (B9).
- `src/20_Instalador.js`: `Instalar_asegurarBackup_` + `_INSTALAR_BACKUP_MEMO`;
  `api_instalarPaso(id, acceso, ejecucion)` con respaldo previo y `BACKUP_FALLIDO`;
  `_mig002_asegurarIngresosSaludMental` por nombre con bloqueo en revisión;
  `Instalar_pFuentes` reutiliza el análisis; `Instalar_ejecutarPolitica` respalda
  antes de mutar (webhook).
- `src/27_Actualizacion.js`: guard de snapshot en TELEFONOS (B9).
- `src/00_Config.js`: eliminado el alias `'SM'` (sin evidencia real).
- `src/Instalador.html`: `_EJEC`/`nuevoEjecucion()` y 3er argumento en
  `api_instalarPaso`.

## 5. Comportamiento heredado preservado

- Llamadas legacy a `api_instalarPaso(id, acceso)` sin token: respaldo con clave
  `ECICEP_INST_BK|LEGACY_<minuto>` (no bloquea).
- Entorno node (tests sin GAS): `Instalar_asegurarBackup_` devuelve
  `{ok:true, skip:true, sinRespaldo:true}` → `instalador_estabilidad.mjs` no se rompió.
- `Fuentes_cargaReal` `actualizar:false` sigue siendo 100 % seco (no escribe).

## 6. Evidencia de verificación

```text
node tools/verificar.mjs
16 suites; 0 fallos (incluye sintaxis JS/GS)

Núcleo         671/671   · Aceptación         50/50
Contrato V2     36/36   · Captura backend V2  73/73
UI payload V2   23/23   · Cola FORM_RESP       33/33
Contrato datos  38/38   · Edición V4          13/13
Formulario Web  32/32   · Publicación          5/5
Acceso Web App   7/7    · Agenda manual       21/21
Regresiones     44/44   · Auditoría v0.10     15/15
Instalador estabilidad PASS · HTML            21/21
```

## 7. Tests de regresión añadidos (`tests/regresiones_auditoria_v010.mjs`, 15/15)

1. `Fuentes_claveDedupe_` insensible a caja/espacios/tildes y fila.
2. Carga no vuelve a generar evento con FUENTE de literal con drift.
3. Preflight detecta hoja autorizada ausente y archivo inaccesible.
4. `HOJA_FUENTE_FALTANTE` sin leer ni escribir la carga.
5. Primera etapa mutante crea UN respaldo por ejecución; el resto lo reutiliza.
6. `BACKUP_FALLIDO` → la etapa no se invoca.
7. MIG-002 escribe `SALUD_MENTAL` solo donde falta y con celda libre.
8. Columna ocupada tras `NOTA_SISTEMA` BLOQUEA sin pisar.
9. Encabezado canónico ausente/desordenado → revisión sin escribir.
10. Normalizador: solo SI/SÍ/NO/vacío; texto clínico descartado con aviso.
11. Merge nunca escribe/modifica `SALUD_MENTAL` de existentes.
12. SNAPSHOT_ACTUAL no re-registra TELEFONOS idéntico (FUENTE estable en 10×).
13. 10× Instalar sobre el mismo origen: 0 eventos duplicados, STAGING_IMPORT
    archiva el origen UNA sola vez.
14. `Fuentes_guardarFilas` idempotente (2ª llamada → 0).
15. Dry-run + ejecución reutilizadas = UNA lectura real de fuentes.

## 8. Actualización legítima de harness

`tests/regresiones_revision.mjs` (~620-643) llamaba al `Fuentes_cargaReal` real
con `SpreadsheetApp.openById → null`; con el preflight nuevo eso devuelve
`ARCHIVO_INACCESIBLE`. Se añadió a esos dos tests el stub
`Fuentes_preflightFuentes = () => ({ok:true, fuentes:[], bloqueantes:[]})`
(simular origen válido, igual que ya simulaban el lector). No encubre fallos:
el comportamiento bloqueante se comprueba en los tests 3-4 de la suite de auditoría.

## 9. Idempotencia demostrable

- **Eventos**: 10× Instalar sobre la misma fila física → yaImportadas 1 en cada
  corrida, 0 anexos `Modelo_agregarEventos`.
- **Pacientes**: merge SNAPSHOT_ACTUAL con datos idénticos → aplicados 0, `FUENTE`
  sin crecimiento (guard TELEFONOS).
- **Auditoría**: STAGING_IMPORT con dedupe por origen → segunda llamada 0 filas.
- **MIG-002**: ejecutar dos veces → la segunda no escribe (encabezado ya presente).
- **Respaldo**: dos etapas de la misma ejecución → 1 copia Drive; ejecución
  distinta → otra copia.

## 10. Sin datos reales usados

Ninguna hoja, libro, Drive ni URL real se abrió, escribió o copió durante la
auditoría. Todo el razonamiento de la correspondencia de `FUENTES_DRIVE` queda
pendiente de la sesión autorizada (bloqueador 1).

## 11. Documentación vigente actualizada

- `README.md`: respaldo real `PRE_INSTALAR` (no `SNAPSHOT_ACTUAL` como respaldo);
  estado E2E real = ⏳ pendiente; conteos de batería (16 suites).
- `ARQUITECTURA.md`: respaldo `PRE_INSTALAR`, idempotencia B2, preflight B3,
  MIG-002 por nombre.
- `PENDIENTES.md`: nota v0.10.1 + referencia al informe.
- `docs/MIGRACIONES.md`: fila MIG-002 con el guard de columna ocupada.
- `docs/INFORME_2026-09-21_V010_SALUD_MENTAL.md`: puntos 2 y 7 precisados.
- `docs/HISTORIAL.md`: entrada **v0.10.1**.

## 12. Publicación

- `clasp push --force` (sync del código) + actualización del **deployment
  operativo reutilizado** (el que sirve `ECICEP.WEB_APP_URL`, `AKfycbx16n…YSCw`,
  antigua `@215`), preservando URL base/QR y acceso anónimo a la vista de captura.
- Smoke `GET /exec` → 200 con la vista de captura (vía encabezados de
  `WebApp_estadoInicial`: `ECICEP_ACCESO` y `ECICEP_PAGE_BUILD` presentes).

## 13. Pendiente explícito

- **E2E en vivo** (requiere sesión Google/Spreadsheet): ejecutar
  `Instalar / Reparar Sistema` sobre el libro real y comprobar: respaldo
  `PRE_INSTALAR` creado una sola vez, etapa «Ajustando el libro», cifras de
  INICIO, y que una segunda vuelta de Instalar no duplica eventos ni crece
  FUENTE/STAGING_IMPORT.
- Correlacionar `FUENTES_DRIVE` con los archivos reales del libro del
  21-09-2026 (AMARILLO/VERDE actualizados 2026-09-15, NARANJO preservado).

## 14. Commit y cierre

Commit sugerido (patch `v0.10.1`, `SCHEMA_VERSION` permanece 2):

```text
fix: harden v0.10.0 source sync, backup and idempotency

- backup real PRE_INSTALAR por ejecución (BACKUP_FALLIDO sin escritura)
- idempotencia por FUENTE con clave canónica (sin duplicar eventos)
- preflight estructural HOJA_FUENTE_FALTANTE (dry-run y ejecutar)
- una sola lectura real de fuentes entre dry-run y ejecución
- guard de snapshot TELEFONOS + dedupe en STAGING_IMPORT
- MIG-002 por nombre; columna ocupada bloquea en revisión
- suite tests/regresiones_auditoria_v010.mjs (15/15); 16 suites · 0 fallos
```

Paso posterior al commit/push: `clasp push --force` + actualizar el deployment
operativo reutilizado (URL/QR intactos). E2E real queda como pendiente del
bloqueador 1 (sin sesión Google en el host).