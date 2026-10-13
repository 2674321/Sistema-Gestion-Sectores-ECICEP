# Informe v258 — GAS, E2E y activación controlada

Fecha: 2026-10-13  
Decisión: DEC-113

## A. Git

```text
HEAD inicial: 9a9b3eda27145a5887bea13323c0aea458b0c19a
HEAD después fixes locales: d5c7fd9268299ad06efa3e8a45a394bb415dd219
HEAD remoto: d5c7fd9268299ad06efa3e8a45a394bb415dd219
branch: codex/v255-operabilidad-observabilidad
working tree antes de informe: clean
commits: d5c7fd9 fix(preactivation): close locking and durable-state gates
```

## B. Residuos del audit

| Severidad | Evidencia / causa | Corrección | Test | Resultado |
|---|---|---|---|---|
| P0 | Worker mutaba fuera del lock clínico | lock por candidato solo en `CapturaIngress_enviar_`; busy retryable | `preactivation_locking_v258` | PASS |
| P0 | `getScriptLock()` fallido ejecutaba `fn` | fail-closed `LOCK_NO_DISPONIBLE`; cero llamadas | `preactivation_locking_v258` | PASS |
| P0 | trailer solo gateaba éxito | helper común para cuatro clasificaciones; cursor/health seguros | `forms_trailer_gate_v258` | PASS |
| P1 | release ignoraba `tryLock` | `DEFERRED_LOCK_BUSY`, sin leer/borrar property | `forms_lease_release_v258` | PASS |
| P1 | delete sin post-check | relectura por identidad, resultado `verificadas/fallidas` | `ingresos_delete_verify_v258` | PASS |
| P1 | conflicto resuelto antes de limpiar revisión | limpieza verificada antes de `RESUELTO` | `estrat_reconcile_v258` | PASS |
| P1 | rollback verificaba conjunto fijo | `ID_INTERNO` + tocados + derivados | `ficha_rollback_fields_v258` | PASS |

Gate local: `tools/verificar.mjs` 137 suites / 0 fallos; núcleo 679/679;
aceptación 50/50; contrato 36/36; HTML 21/21; auditor y placeholders PASS.

## C. Preactivation

```text
script identity: VERIFIED
deployment identity: VERIFIED (@265, mismo ID de CONFIG)
URL stable: YES (HTTP 200; build previo 6fb4ef6)
backup: VERIFIED (22 hojas; 2734/21884/227)
operator secret: BLOCKED — inspecciones read-only contradictorias; no se rotó
form: BLOCKED — GOOGLE_FORM_ID no pudo resolverse de forma inequívoca
triggers: ECICEP_onChangeLibro=1, Backup_programado=1,
          ECICEP_onEditIngreso=1, Form_onFormSubmit_=0, Form_worker_=0
```

El snapshot del Spreadsheet se obtuvo por rangos técnicos, sin filas clínicas:
`PACIENTES=2734`, `EVENTOS=21884`, `FORM_RESPUESTAS=227`, conflictos abiertos
`20`. La cola heredada conserva `126` filas recuperables y aún no presenta las
columnas nuevas de clasificación. Dos inspecciones de configuración discreparon
sobre la presencia de propiedades críticas; `clasp run` respondió falta de
permiso. El gate prohíbe inferir el Form o mutar el proyecto en esta condición.

## D. Código Apps Script

```text
CLASP_PUSH: NO
HEAD pushed: N/A
pre-push Git SHA: 6fb4ef68048b8e8e24b2481478d080302db55964
rollback source verified: YES (build /exec 6fb4ef6 y commit Git existente)
```

## E. Deploy

```text
same deployment ID: N/A — no deploy
previous version: 265
new version: N/A
URL unchanged: YES
new deployment created: NO
```

## F. E2E

| Prueba | Estado | Evidencia técnica |
|---|---|---|
| TRANSPORTE | NOT RUN | bloqueado antes de GAS |
| NUEVO_INGRESO | NOT RUN | bloqueado antes de GAS |
| IDEMPOTENCIA | NOT RUN | bloqueado antes de GAS |
| CONTROL | NOT RUN | bloqueado antes de GAS |
| SEGUIMIENTO | NOT RUN | bloqueado antes de GAS |
| LOCK_BUSY | PASS LOCAL | suite v258; GAS no ejecutado |
| BACKLOG | BLOCKED | 126 recuperables heredados; clasificación v255 no disponible |
| CLEANUP | NOT RUN | no se creó paciente sintético |

## G. Producción

| Conteo | Antes | Después |
|---|---:|---:|
| PACIENTES | 2734 | 2734 |
| EVENTOS | 21884 | 21884 |
| FORM_RESPUESTAS | 227 | 227 |
| CONFLICTOS_ABIERTOS | 20 | 20 |
| BACKLOG recuperable heredado | 126 | 126 |

La única escritura externa fue la copia integral de respaldo verificada; no se
modificaron el Spreadsheet operativo, Form, propiedades, triggers, proyecto GAS,
deployment, QR, `master` ni PR #13.

## H. Rollback

```text
needed: NO
executed: NO
reason: ningún cambio GAS/producción fue aplicado
verified: estado operativo y URL permanecen en @265 / build 6fb4ef6
```

Para reanudar se necesita una vía autorizada y consistente que permita leer el
`GOOGLE_FORM_ID`, abrir ese Form y ejecutar diagnóstico sin exponer secretos;
después debe repetirse el snapshot porque la cola puede cambiar.

BLOCKED_FOR_ACTIVATION
