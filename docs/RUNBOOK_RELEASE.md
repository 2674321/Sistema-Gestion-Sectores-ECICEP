# RUNBOOK — Cierre de release v0.17.0 (operación manual en ventana)

> Estado que documenta: el **código está listo y sincronizado** (repo + proyecto
> Apps Script `@HEAD`), los **gates locales están verdes** y el **deploy de
> producción sobre el deployment existente queda pendiente** porque requiere
> runtime (editor Apps Script / navegador / Sheets) que no es accesible desde
> el entorno de automatización. Este runbook es la única operación manual que
> falta.

## Invariantes (no romper)

- Un único entorno, un único pipeline, una única fuente de verdad.
- Deployment operativo autorizado (NO crear otro):
  `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`
- URL pública a conservar:
  `https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec`
- Nunca `clasp deploy` sin `--deploymentId`. Nunca cambiar la URL ni el QR.
- Preservar toda versión referenciada por un deployment activo (`@HEAD`, `@275`).
- Gestión del límite de 200 versiones de Apps Script (ver Paso 4.0).
- No usar datos clínicos reales en pruebas.

## Paso 0 — Prerrequisitos de ventana

- Jornada finalizada y usuarios operativos retirados.
- Ventana técnica abierta (máx. 120 min).
- Backup PRE_RELEASE reciente, no vacío y abrible (verificado en ventana).

## Paso 1 — Gate local (código)

```bash
git status --short          # debe estar limpio
node tools/verificar.mjs    # 170 suites, 0 fallos
node tools/release.mjs --check   # RELEASE_CHECK_PASS
```

## Paso 2 — Preflight runtime (editor Apps Script)

Ejecutar en el editor, en el contexto del Spreadsheet:

- `Operacion_preflightRelease_()` (o el menú `UI_formCanalPreflight_()`).

Esperado: sin ningún `BLOCK`; `resultado` = `ACTIVE_HEALTHY` (o
`READY_TO_ACTIVATE` si Form/operador aún no configurados). Estado aceptable
`NOT_CONFIGURED` solo si aún no se adopta Form/operador (setup runtime).

## Paso 3 — Smoke `/dev` anónimo

Abrir en incógnito el deployment `@HEAD`:

`https://script.google.com/macros/s/AKfycbwd7PkYNWEmglmOqkqgxEw14jTZkTK3O-FgiP3JTVTT/exec`

Verificar: captura carga sin login Google, título correcto, **build = `8eef18f`**,
catálogo de profesionales carga, sin token legacy visible. Abrir una vista
protegida (backup/dashboard) → debe pedir OPSESS y funcionar **sin**
`... is not a function` ni error de Proxy.

## Paso 4 — Deploy sobre el deployment EXISTENTE

### Paso 4.0 — Capacidad de versiones (límite 200)

Google Apps Script admite **máximo 200 versiones existentes** (no depende del
número más alto: los números tienen huecos por versiones borradas). `clasp deploy`
falla con *"Script has reached the limit of 200 versions"* cuando el proyecto está
lleno. `tools/release.mjs --publish` ahora lo detecta **antes** de desplegar:

- `VERSION_COUNT >= 200` → aborta con `APPS_SCRIPT_VERSION_LIMIT_REACHED` y **no**
  llama a `clasp deploy`.
- `VERSION_COUNT >= 190` → warning `APPS_SCRIPT_VERSION_LIMIT_NEAR` (permite
  publicar si queda al menos 1 slot).
- El conteo se toma de `clasp versions` (número de líneas), **nunca**
  `max(versionNumber)`.

Política de mantenimiento (manual, en el editor Apps Script → `Project History`):

- **Preservar** toda versión usada por un deployment activo: Google no ofrece
  esas versiones para borrar (p. ej. `@HEAD` y `@275`).
- **Preservar** las versiones recientes útiles para diagnóstico/reversión
  (mantener las ~30 más recientes disponibles).
- **Borrar periódicamente** snapshots antiguos no referenciados por ningún
  deployment (`Bulk delete versions`).
- **Mantenimiento preventivo** al superar 180 versiones; objetivo cómodo
  `VERSION_COUNT_AFTER <= 120`.
- Al llegar a 200, el release queda **bloqueado** hasta liberar versiones.

Git + backups (`Backup_crear_`) son la fuente principal de historial de código;
las versiones de Apps Script son snapshots publicables, no el historial.

No existe API pública para borrar versiones (`projects.versions` solo expone
`create/get/list`); la limpieza es exclusivamente por la UI de Project History.

### Deploy

Vía tool (gates + BUILD + push + capacidad + deploy + mismo ID), con evidencia de backup:

```bash
ECICEP_PUBLISH_CONFIRM=1 ECICEP_BACKUP_RECENT="<id/URL/ISO del backup PRE_RELEASE>" \
  node tools/release.mjs --publish
```

O el comando equivalente directo:

```bash
clasp deploy --deploymentId AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw \
  --description "ECICEP v0.17.0 final"
```

> Preferir siempre `node tools/release.mjs --publish`: ejecuta gates, BUILD,
> push y el **preflight de capacidad de versiones** (Paso 4.0). El `clasp deploy`
> directo omite ese preflight y puede fallar tarde con el límite de 200.

Registrar `DEPLOYMENT_VERSION_AFTER` (leer con `clasp versions`) y confirmar
`DEPLOYMENT_ID_UNCHANGED=YES`, `PUBLIC_URL_UNCHANGED=YES`.

## Paso 5 — Verificación `/exec`

Abrir la URL pública. Debe: HTTP 200, **sin** `accounts.google.com`, título
`ECICEP — Captura`, build = `8eef18f`. Si el build no coincide, NO crear otro
deployment: revisar versión y actualizar el mismo.

## Paso 6 — E2E (una sola entrega)

Usar la entidad sintética existente `PRUEBA E2E V267 NO REAL` (RUT sintético
`11.111.111-1`). Acción `REGISTRAR_CONTROL` o `REGISTRAR_SEGUIMIENTO`.
Marcador: `PRUEBA E2E FINAL V0170 NO REAL <timestamp>`. Profesional del
catálogo, sin segundo profesional, fecha local válida, observación solo marcador.

Un único submit. Capturar `HTTP_RESULT`, `UI_RESULT`, `UI_TECHNICAL_CODE` → debe
ser `accepted/received` (no basta HTTP 200).

Comprobar:
- Google Form: 1 response creada.
- `FORM_RESPUESTAS`: 1 fila `GOOGLE_FORMS`, `TRANSPORT_RESPONSE_ID` presente,
  `CLIENT_REQUEST_ID=CR-...`, `SOURCE=WEBAPP`, `CLASIFICACION=TERMINAL`,
  `TRANSPORTE_ERROR=[]`, estado `PROCESADO`, `ID_INTERNO`/`ID_EVENTO` coherentes.
- `EVENTOS`: 1 evento nuevo `CONTROL`/`SEGUIMIENTO`, `FUENTE` = marca.
- `PACIENTES`: sigue habiendo 1 (sin duplicado).

## Paso 7 — Idempotencia

Reprocesar técnicamente el mismo `captureId` (sin segundo submit) → mismo
`ID_EVENTO`, sin segunda fila en `EVENTOS` ni `PACIENTES`.

## Paso 8 — Health final

Diagnóstico runtime: Form accessible/published/accepting, schema 3, worker
trigger 1, worker activo, lease libre, circuito cerrado, `unmaterialized=0`,
`active retryable=0`, `TEMP_PUBLIC_RPC_COUNT=0`, backup válido →
`ACTIVE_HEALTHY`. Si el E2E creó fila terminal, no debe aparecer como backlog.

NO ejecutar activación global si health ya es `ACTIVE_HEALTHY`.

## Paso 9 — Tag

Solo con E2E PASS + `ACTIVE_HEALTHY` + deployment correcto:

```bash
git tag -a v0.17.0 -m "ECICEP v0.17.0"
git push origin v0.17.0
```

## Datos sintéticos

Único evento sintético añadido sobre la entidad de prueba existente:
`SYNTHETIC_DATA_STATUS=ISOLATED_TEST_FIXTURE_IN_PRODUCTION`. Conservar
claramente identificado; no borrado clínico automático sin rutina probada.
