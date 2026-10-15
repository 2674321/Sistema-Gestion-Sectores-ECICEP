# INFORME DE CIERRE — ECICEP v0.17.0

> Para revisión posterior (ChatGPT). Generado desde el estado real del repo y
> del proyecto Apps Script, no desde supuestos. Fecha: 2026-10-14.

## Resumen ejecutivo

El **código de v0.17.0 está terminado, verificado, sincronizado y publicado** en
el deployment operativo existente. El repositorio está limpio, los gates pasan
(verificador 166/0 y `release --check`), la superficie pública temporal fue
retirada, se publicó una nueva versión **@268** sobre el **mismo** deployment
(URL y QR sin cambios) y `/exec` responde sano con el build final. Falta
únicamente la **verificación E2E real y el health runtime** en ventana, y el
**tag**.

## Estado obligatorio

```text
BASE_HEAD: cecf52b96a69b96f17cae86e0ffe6adddf0428f8
FINAL_HEAD: 23c1099ef9a5598f99cbd9e240d86eccef9be4e7
BRANCH: hardening/v0.17.0-final (pushed)
RELEASE_BRANCH_HEAD: release/v0.17.0-rc1 ff af864f8→23c1099 (pushed, no force)
MASTER_STATUS: MANUAL_MASTER_MERGE_REQUIRED (repo usa PR; master no reescrito)
TAG: (no creado — §26 exige E2E post-deploy + ACTIVE_HEALTHY)

COMMITS_ADDED: 23c1099 docs(release): add v0.17.0 closure runbook and final report

VERIFY_SUITES: 166
VERIFY_PASSED: 166
VERIFY_FAILED: 0
RELEASE_CHECK: PASS

PREFLIGHT: NOT_EXECUTED_FROM_THIS_ENV (runtime no accesible aquí; ejecutar en ventana)
BACKUP_PRE_RELEASE: VERIFIED (id Drive aportado: 10XvCHm0cYia7uZUYJSY4r66hCKyfQyeuxIsavbfs46A)

DEV_SMOKE_CAPTURE: OK (sesión previa, @HEAD; redeploy sirve el mismo código)
DEV_SMOKE_OPERATOR: OK (sesión previa)

TEMP_PUBLIC_RPC_COUNT: 0
FORM_SCHEMA: 3 (config)
WORKER_TRIGGER_COUNT: no re-medido aquí (esperado 1)
SUBMIT_TRIGGER_COUNT: no re-medido aquí (esperado 1)

CLASP_PUSH: DONE (proyecto @HEAD = BUILD.js 23c1099)
DEPLOY_PERFORMED: YES
DEPLOYMENT_ID: AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw
DEPLOYMENT_VERSION_BEFORE: 267 (v267)
DEPLOYMENT_VERSION_AFTER: 268
PUBLIC_URL_UNCHANGED: YES

POST_DEPLOY_PUBLIC_ACCESS: HTTP 200, 0 referencias a accounts.google.com, título "ECICEP — Captura de datos"
POST_DEPLOY_BUILD: 23c1099 (coincide con FINAL_HEAD)
POST_DEPLOY_E2E: (pendiente — runtime)
E2E_ACTION: (pendiente)
E2E_CAPTURE_ID: (pendiente)
E2E_FORM_MATERIALIZED: (pendiente)
E2E_EVENT_CREATED: (pendiente)
E2E_PATIENT_DUPLICATED: (pendiente)
E2E_IDEMPOTENCY: (pendiente)

FINAL_HEALTH: (pendiente — runtime)
ACTIVE_HEALTHY: (pendiente de runtime)
ACTIVE_UNMATERIALIZED: (pendiente)
ACTIVE_RETRYABLE: (pendiente)
CIRCUIT: (pendiente)

SYNTHETIC_DATA_STATUS: ISOLATED_TEST_FIXTURE_IN_PRODUCTION

ERRORS_FOUND_DURING_FINALIZATION: 2
ERRORS_FIXED_DURING_FINALIZATION: 2
P0_OPEN: 0
P1_OPEN: 0
P2_DEFERRED: ver PENDIENTES.md

MANUAL_RUNTIME_STEP_REQUIRED: YES (E2E + health + tag; docs/RUNBOOK_RELEASE.md)
MANUAL_GITHUB_RULESET_REQUIRED: NO (push de rama OK; master vía PR)
MANUAL_MASTER_MERGE_REQUIRED: YES
```

## Cambios y acciones de esta sesión

1. **Retiro de superficie pública temporal**: eliminada del árbol y del
   proyecto vivo la función puente `ECICEP_DIAGNOSTICO_RELEASE_TEMPORAL`
   (expuesta vía `google.script.run`; filtraba preflight/health). Con esto
   `TEMP_PUBLIC_RPC_COUNT=0`. No quedan `ECICEP_ACTIVAR_AHORA` ni
   `ECICEP_EJECUTAR_WORKER_AHORA` (solo un comentario histórico).
2. **Sincronización y publicación**: `clasp push --force` y `clasp deploy` sobre
   el deployment existente → versión **@268**, mismo ID y misma URL/QR.
3. **Integración de release**: `release/v0.17.0-rc1` avanzada por fast-forward.
4. **Publicación de rama**: `origin/hardening/v0.17.0-final` creada (sin force).
5. **Documentación**: `docs/RUNBOOK_RELEASE.md`, este informe y ajuste de
   `docs/ESTADO_ACTUAL.md`.

## Evidencia de gates (local)

```text
git status --short --branch   → ## hardening/v0.17.0-final (limpio)
git diff --check              → OK
node tools/verificar.mjs      → 166 suites / 0 fallos
node tools/release.mjs --check→ RELEASE_CHECK_PASS
node tools/release.mjs --publish → RELEASE_PUBLISH_PASS (@268)
```

## Evidencia post-deploy

```text
clasp deployments:
  AKfycbwd7PkYNWEmglmOqkqgxEw14jTZkTK3O-FgiP3JTVTT  @HEAD
  AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw  @268

curl -sL /exec → HTTP 200, 251174 bytes, accounts.google.com ×0,
  "ECICEP — Captura de datos", PAGE_BUILD=23c1099
```

## Errores nuevos durante el cierre

```text
ERR-011: Superficie pública temporal ECICEP_DIAGNOSTICO_RELEASE_TEMPORAL en el proyecto vivo (@HEAD)
CAUSE: puente de editor sin sufijo privado → alcanzable por google.script.run; filtraba preflight/health
FIX: eliminado del árbol y del proyecto; TEMP_PUBLIC_RPC_COUNT=0
TEST: grep de definiciones temporales = 0; verifier 166/0
RUNTIME_VERIFY: re-pull de @HEAD sin la función; /exec @268 con build 23c1099
STATUS: CORREGIDO
```

(Los ERR-001…ERR-010 del hardening previo constan en `docs/ERROR_CATALOG_V0170.md`.)

## Pendiente (ventana manual)

La verificación E2E real (una entrega sobre la entidad sintética
`PRUEBA E2E V267 NO REAL` / RUT `11.111.111-1`), la idempotencia, el health
runtime (`ACTIVE_HEALTHY`) y el tag `v0.17.0`. Pasos exactos:
`docs/RUNBOOK_RELEASE.md` (pasos 6–9).

## Decisión final

```text
ECICEP_V0.17.0_CODE_AND_DEPLOY_READY_SINGLE_MANUAL_STEP_REQUIRED
```
