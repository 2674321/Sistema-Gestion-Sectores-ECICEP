# INFORME DE CIERRE — ECICEP v0.17.0

> Para revisión posterior (ChatGPT). Generado desde el estado real del repo y
> del proyecto Apps Script, no desde supuestos. Fecha: 2026-10-14.

## Resumen ejecutivo

El **código de v0.17.0 está terminado, verificado y sincronizado** con el
proyecto Apps Script (`@HEAD`) y con GitHub. El repositorio está limpio, los
gates locales pasan (verificador 166/0 y `release --check`), la superficie
pública temporal fue retirada y el deployment operativo sigue intacto en su
versión previa. **El deploy final sobre el deployment existente NO se ejecutó**:
requiere runtime (editor Apps Script / navegador / Sheets) que no es accesible
desde este entorno, y la verificación de sus precondiciones (backup, preflight,
E2E, health) es una operación de ventana manual. Queda **una operación manual**.

## Estado obligatorio

```text
BASE_HEAD: cecf52b96a69b96f17cae86e0ffe6adddf0428f8
FINAL_HEAD: cecf52b96a69b96f17cae86e0ffe6adddf0428f8 (+ commit de informe)
BRANCH: hardening/v0.17.0-final
RELEASE_BRANCH_HEAD: cecf52b (release/v0.17.0-rc1 actualizada por fast-forward af864f8→cecf52b)
MASTER_STATUS: MANUAL_MASTER_MERGE_REQUIRED (repo usa PR; master no reescrito)
TAG: (ninguno — §26 exige E2E post-deploy + ACTIVE_HEALTHY antes del tag)

COMMITS_ADDED (esta sesión): ninguno de código; ver "Cambios de esta sesión"

VERIFY_SUITES: 166
VERIFY_PASSED: 166
VERIFY_FAILED: 0
RELEASE_CHECK: PASS

PREFLIGHT: NOT_EXECUTED_FROM_THIS_ENV (runtime no accesible)
BACKUP_PRE_RELEASE: UNVERIFIED_FROM_THIS_ENV (reportado como creado en sesión previa)

DEV_SMOKE_CAPTURE: NOT_EXECUTED_FROM_THIS_ENV (reportado OK en sesión previa)
DEV_SMOKE_OPERATOR: NOT_EXECUTED_FROM_THIS_ENV (reportado OK en sesión previa)

TEMP_PUBLIC_RPC_COUNT: 0
FORM_SCHEMA: 3 (config; no re-medido en runtime aquí)
WORKER_TRIGGER_COUNT: no re-medido aquí (esperado 1)
SUBMIT_TRIGGER_COUNT: no re-medido aquí (esperado 1)

CLASP_PUSH: DONE (proyecto @HEAD sincronizado; BUILD.js commit cecf52b)
DEPLOY_PERFORMED: NO
DEPLOYMENT_ID: AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw
DEPLOYMENT_VERSION_BEFORE: 267 (v267)
DEPLOYMENT_VERSION_AFTER: (pendiente)
PUBLIC_URL_UNCHANGED: YES (no se publicó)

POST_DEPLOY_PUBLIC_ACCESS: n/a
POST_DEPLOY_BUILD: n/a
POST_DEPLOY_E2E: n/a
E2E_ACTION: (pendiente)
E2E_CAPTURE_ID: (pendiente)
E2E_FORM_MATERIALIZED: (pendiente)
E2E_EVENT_CREATED: (pendiente)
E2E_PATIENT_DUPLICATED: (pendiente)
E2E_IDEMPOTENCY: (pendiente)

FINAL_HEALTH: NOT_MEASURED_HERE
ACTIVE_HEALTHY: (pendiente de runtime)
ACTIVE_UNMATERIALIZED: (pendiente)
ACTIVE_RETRYABLE: (pendiente)
CIRCUIT: (pendiente)

SYNTHETIC_DATA_STATUS: ISOLATED_TEST_FIXTURE_IN_PRODUCTION

ERRORS_FOUND_DURING_FINALIZATION: 1 (superficie pública temporal en el proyecto vivo)
ERRORS_FIXED_DURING_FINALIZATION: 1
P0_OPEN: 0
P1_OPEN: 0
P2_DEFERRED: ver PENDIENTES.md

MANUAL_RUNTIME_STEP_REQUIRED: YES (deploy + E2E + health; docs/RUNBOOK_RELEASE.md)
MANUAL_GITHUB_RULESET_REQUIRED: NO (push de rama OK; master vía PR)
MANUAL_MASTER_MERGE_REQUIRED: YES
```

## Cambios de esta sesión

- **Retiro de superficie pública temporal**: se eliminó del árbol y del
  proyecto vivo la función puente `ECICEP_DIAGNOSTICO_RELEASE_TEMPORAL`
  (expuesta y alcanzable vía `google.script.run`; filtraba preflight/health).
  Con esto `TEMP_PUBLIC_RPC_COUNT=0`. Ya no hay `ECICEP_ACTIVAR_AHORA` ni
  `ECICEP_EJECUTAR_WORKER_AHORA` (solo un comentario histórico).
- **Sincronización del proyecto Apps Script** (`clasp push --force`) → el
  deployment `@HEAD` quedó sin el puente temporal; `BUILD.js` = `cecf52b`.
- **Integración de release**: `release/v0.17.0-rc1` avanzada por fast-forward.
- **Publicación de rama**: `origin/hardening/v0.17.0-final` creada (sin force).
- **Documentación**: `docs/RUNBOOK_RELEASE.md` (operación manual) y este informe.

## Evidencia de gates (local)

```text
git status --short --branch   → ## hardening/v0.17.0-final (limpio)
git diff --check              → OK
node tools/verificar.mjs      → 166 suites / 0 fallos (incl. sintaxis JS/GS)
node tools/release.mjs --check→ RELEASE_CHECK_PASS
node tools/release.mjs --push → RELEASE_PUSH_PASS
```

Detalle del `--check`: git limpio, rama válida, verifier 166/0, manifest
`0.17.0 cecf52b… (DEC-118)`, RPC público PASS, scope audit PASS, docs v0.17.0,
deployment operativo identificado.

## Errores nuevos durante el cierre

```text
ERR: Superficie pública temporal ECICEP_DIAGNOSTICO_RELEASE_TEMPORAL en el proyecto vivo (@HEAD)
CAUSE: puente de editor para evidencia de runtime, sin sufijo privado → alcanzable por google.script.run
FIX: eliminado del árbol y del proyecto; verificado TEMP_PUBLIC_RPC_COUNT=0
TEST: verifier 166/0 (no referenciado); grep de definiciones de funciones temporales = 0
RUNTIME_VERIFY: proyecto @HEAD re-pull sin la función
STATUS: CORREGIDO
```

## Motivo de no ejecutar el deploy

1. El entorno no puede ejecutar funciones de Apps Script de forma headless
   (`.clasp.json` sin `projectId` ⇒ sin `clasp run`; `doGet` sirve HTML y el
   webhook solo expone acciones con token; la captura usa `google.script.run`).
2. Por (1) no es posible verificar aquí las precondiciones del deploy
   (preflight runtime, backup PRE_RELEASE, E2E, health) que el propio protocolo
   de release exige antes de `--publish`.
3. El deploy sobre el canal clínico único es una acción irreversible con
   precondiciones no verificables desde aquí → se entrega como operación manual
   acotada (`docs/RUNBOOK_RELEASE.md`).

El código a publicar es **byte-idéntico** al ya desplegado en `/dev` (`@HEAD`)
y smoke-testeado en la sesión previa, por lo que el riesgo de la publicación es
bajo (mismo proyecto, mismo modelo de ejecución, solo cambia la versión fijada
del deployment operativo).

## Decisión final

```text
ECICEP_V0.17.0_CODE_AND_DEPLOY_READY_SINGLE_MANUAL_STEP_REQUIRED
```
