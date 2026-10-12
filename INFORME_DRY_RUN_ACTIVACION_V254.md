# Informe dry run de activación v254

ESTADO: DRY_RUN_ACTIVATION_PASS

Git
- HEAD: c84dbfbc1a46d87d0e6c5b1f6f88da4fc2906b25 (snapshot de entrada)
- branch: codex/vnext-campos-e-identidad
- master: 93f67b3b84d42bedd4f4246a244a3ddd02c7f9d5
- PR #13: OPEN, sin merge; mergeStateStatus `BLOCKED`

Apps Script (snapshot solo lectura)
- scriptId: 1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI
- deployment ID operativo: AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw
- versión anterior: @250, última documentada localmente; consulta remota no verificada por timeout
- URL /exec: https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec
- `npx clasp status`: timeout 25 s, sin salida
- `npx clasp deployments`: timeout 25 s, sin salida

Instalador
- 10x idempotencia: PASS
- Form nuevo: NO
- canonical map: PASS, `GLOBAL|ACCION` + 31 itemIds canónicos únicos
- schema con 0 respuestas: reconstrucción determinista PASS
- schema con respuestas: conservación PASS; conflicto → `FORM_SCHEMA_REQUIRES_REVIEW`

Worker
- trigger mock: PASS, exactamente 1 `Form_onFormSubmit` + 1 `Form_worker`
- lock busy: PASS, `DEFERRED_LOCK_BUSY` y recuperación posterior
- retry: PASS
- cursor: PASS, overlap recupera T1 después de procesar T2/T3
- idempotencia: PASS, éxitos previos no se duplican

E2E
- nuevo ingreso: PASS
- control: PASS
- seguimiento: PASS
- actualizar: PASS; `TELEFONOS`, `PROXIMO_CONTROL` y `OBSERVACIONES` conservan `{anterior,valor}`; `PROFESIONAL` y `PROFESIONAL2` conservados
- recepción durable: `RECIBIDO` + responseId; 0 pipeline clínico, 0 PACIENTES, 0 EVENTOS y 0 lock clínico durante recepción
- submit programático sin evento: PASS; worker procesa después

Concurrencia
- 5: PASS, 0 pérdidas, 0 duplicados, 0 SERVICE_BUSY
- 10: PASS, 0 pérdidas, 0 duplicados, 0 SERVICE_BUSY
- 20: PASS, 0 pérdidas, 0 duplicados, 0 SERVICE_BUSY
- 50: PASS, 0 pérdidas, 0 duplicados, 0 SERVICE_BUSY

Permisos
- admin: PASS
- editor: PASS
- usuario sin Sheet: PASS
- sin dependencia de allowlist, `Session.getActiveUser()`, OAuth individual ni permiso editor en recepción Web

Conservación de masa y observabilidad
- simulación: total 6 = processed 3 + retryable 1 + review 1 + terminal 1
- backlog: 2
- oldestPendingMin: 7
- PII en métricas: NO

QR
- estable: PASS con Form URL A y B; siempre conserva la URL `/exec`

Rollback
- plan preparado: SÍ, mismo deployment, versión anterior, URL/QR, trigger y Form seguro

Batería local
- `node tests/ejecutar_local.mjs`: 679/679
- `node tests/aceptacion_formulario.mjs`: 50/50
- `node tests/contrato_captura_v2.mjs`: 36/36
- `node tests/validar_html.mjs`: 21/21
- `node tools/verificar.mjs`: 102 suites, 0 fallos
- `git diff --check`: PASS

Producción real
- clasp push: NO
- Form real modificado: NO
- Sheet real modificada: NO
- ScriptProperties reales: NO
- triggers reales: NO
- deployment real: NO
- master: NO

DRY_RUN_ACTIVATION_PASS
READY_FOR_TUESDAY
