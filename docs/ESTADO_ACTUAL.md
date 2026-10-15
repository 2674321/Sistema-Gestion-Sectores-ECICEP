# ESTADO ACTUAL — ECICEP

> Documento **breve y autoritativo** del estado vigente. Si algo aquí contradice a
> un informe histórico o a una sección antigua de `README.md`, manda este archivo
> (y `AGENTS.md`, `ARQUITECTURA.md` y `docs/CONTRATO_CAPTURA_V2.md`).
> Última actualización: **2026-10-15** (mejora visual de captura).

| Campo | Valor vigente |
|---|---|
| Versión de producto | `v0.17.0` (`src/00_Config.js` → `ECICEP.VERSION`) |
| Rama de trabajo | `hardening/v0.17.0-final` (baseline histórico `release/v0.17.0-rc1` / commit clínico v260) |
| Etapa de release | `FINAL` — publicada sobre el deployment existente (`@273`, build `0f8c0e2`); smoke público anónimo y carga read-only de ficha OK, E2E/health runtime y tag en ventana |
| Deployment operativo | `@273` — `/exec` `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` (verificado con `clasp deployments`) |
| Arquitectura de captura | Web App (único canal operativo visible) → Google Forms (transporte durable interno) → `Form_worker_` → pipeline `Captura_v2_enviar_` |
| Esquema clínico | `SISTEMA_VERSION_SCHEMA_ACTUAL = 2` (no subir en este release) |
| Esquema del Form | `GOOGLE_FORMS_CONFIG.SCHEMA_VERSION = 4` |
| Instalador | `SISTEMA_VERSION_INSTALADOR = 'INST-1'` |
| Triggers | Worker durable cada 5 min (`WORKER.CADENCIA_MIN`) + señal `onFormSubmit` (telemetría) |
| Backup | `Backup_crear_/Backup_programado_` con `BACKUP_AUTO_ULTIMA` en CONFIG; backup reciente obligatorio antes de publicar |
| Estado del canal | Publicado en `/exec` (@273, build `0f8c0e2`, HTTP 200, sin login Google); 4 acciones públicas, `Actualizar` carga la ficha completa sin clave (DEC-123) y usa el editor visual guiado; `Funciones` no se muestra en la captura |
| HEAD de trabajo | `0f8c0e2` (`hardening/v0.17.0-final`); incluye DEC-119/120/121/122/123/124 y la mejora visual del editor completo. Publicado a producción `@273` sobre el MISMO deployment; health runtime y tag pendientes de ventana |
| Acceso operador | QR/Web App → cuatro acciones públicas sin clave; administración desde el Spreadsheet autorizado → OPSESS automática (DEC-119); admin externo conserva OPSESS |

## Contrato de captura vigente (v270)

- **Captura pública anónima** (DEC-110): sin token, sin OPSESS, sin OAuth
  individual. El HTML servido no lleva credencial en DOM ni URL (DEC-115).
- **Web App = único canal operativo.** El origen se registra como `WEBAPP`
  (`CLIENT_REQUEST_ID` válido) o `GOOGLE_FORM_DIRECT`.
- **Captura directa al Form = recepción durable + `REQUIERE_REVISION`** (DEC-116):
  nunca muta PACIENTES/EVENTOS/agenda/contacto; queda para decisión humana.
- **Operador/administración** exigen sesión OPSESS; `ECICEP_ACCESS_TOKEN` es
  solo trazabilidad de esas vistas.
- **Acceso desde Sheets sin clave (DEC-119):** el render container-bound del
  Spreadsheet autorizado (ID exacto + `getUi()`) emite OPSESS automática; la Web
  App externa y `google.script.run` no la reciben y piden clave. Captura intacta.
- **Captura completa sin fricción (DEC-122/DEC-123):** las cuatro acciones del QR
  son públicas y sin clave. `ACTUALIZAR_DATOS` **carga y reemplaza la ficha
  completa** (18 campos + CONTROL/SEGUIMIENTO) directamente desde la captura
  pública (DEC-123 reemplaza el alcance parcial de DEC-122); `Funciones` no se
  muestra en la captura. La privacidad de la carga se evaluó y se descartó
  explícitamente (DEC-124): el flujo permanece público por decisión del usuario.
- Input hardening (DEC-114/v270): cotas de tamaño, profundidad y longitud de
  texto en `Captura_v2_validar_`; anti-inyección de fórmulas en celdas.
- **Actualizar ficha (DEC-120):** la acción se lee de `<select id="accion">`
  (única fuente). `ACTUALIZAR_DATOS` carga y renderiza los 18 campos editables
  (`CAPTURA_EDICION_CAMPOS` ≡ editor), conserva campos vacíos, guarda solo
  diferencias y mantiene los controles de CONTROL/SEGUIMIENTO. Desde el build
  `0f8c0e2`, el editor agrupa la ficha en tarjetas, guía el flujo en cuatro pasos,
  destaca cambios y mantiene visible su resumen; no cambió el payload ni el RPC.

## Verificación

- Verificador integral: `node tools/verificar.mjs` (humano) o `--json`.
  Estado: **170 suites / 0 fallos**.
- Preflight de release: `node tools/preflight_release.mjs`.
- Release Node: `node tools/release.mjs --check` (este documento debe citar
  `v0.17.0`).
- Manifest derivado local: `RELEASE_CANDIDATE.json`
  (`tools/release_manifest.mjs`). Se regenera desde HEAD y no se versiona para
  evitar un SHA autorreferente obsoleto.
- Scopes OAuth: `docs/OAUTH_SCOPES.md` + `tests/oauth_scopes_v270.mjs`.
- Las RPC destructivas de operador exigen confirmación server-side consume-once
  ligada a OPSESS+método+argumentos (DEC-117).
- Capacidad de versiones de Apps Script (límite 200): `tools/release.mjs --publish`
  aborta con `APPS_SCRIPT_VERSION_LIMIT_REACHED` antes de desplegar si
  `VERSION_COUNT >= 200` y avisa `APPS_SCRIPT_VERSION_LIMIT_NEAR` desde 190;
  el conteo sale de `clasp versions` (nunca `max(versionNumber)`).
  `tests/release_version_capacity_v0170.mjs` cubre 199/200/201+ y que en el
  límite no se invoca `clasp deploy`.

## Deuda legacy no bloqueante

- Filas `FORM_RESPUESTAS` previas a Forms (`WEBAPP_LEGACY`/`LEGACY_PRE_FORMS`):
  data a interpretar, no especificación; migración dry-run.
- Enunciados históricos de `README.md`/`docs/INFORME_*.md` sin valor normativo.
- Datos sintéticos de E2E en producción: inventario read-only antes del release
  final (§31 del megaprompt); no borrar sin ruta segura probada.

## Último E2E

- `v270` + mejora visual `0f8c0e2`: 170 suites / 0 fallos y smoke interactivo
  anónimo sobre `/exec` @273. Se verificaron las cuatro opciones, catálogo de
  profesionales y carga read-only de la ficha sintética completa (18 campos +
  CONTROL/SEGUIMIENTO), sin clave, login ni OPSESS y sin enviar cambios. El
  E2E real de una entrega, la idempotencia y el health `ACTIVE_HEALTHY` quedan
  **pendientes** de la ventana de activación
  (`docs/RUNBOOK_RELEASE.md`, pasos 6–9).

## Publicación (deploy)

- Publicado sobre el **MISMO** deployment operativo (nunca uno nuevo):
  `DEPLOYMENT_ID_UNCHANGED=YES`, `PUBLIC_URL_UNCHANGED=YES`.
- `node tools/release.mjs --push` **OK** (dev `@HEAD` = `0f8c0e2`).
- `node tools/release.mjs --publish` **OK** con preflight de capacidad
  (`warn APPS_SCRIPT_VERSION_LIMIT_NEAR VERSION_COUNT=198 free=2`) →
  `RELEASE_PUBLISH_PASS`. `DEPLOYMENT_VERSION_AFTER=273`, `VERSION_COUNT_AFTER=199`.
  `/exec` HTTP 200 sirviendo build `0f8c0e2` con la ficha completa y el editor
  visual guiado de `ACTUALIZAR_DATOS` (DEC-120/DEC-123).
- Pendiente de ventana: E2E real sintético
  (`PRUEBA E2E V267 NO REAL`, RUT `11.111.111-1`), idempotencia, health
  `ACTIVE_HEALTHY` y tag `v0.17.0` (`docs/RUNBOOK_RELEASE.md`, pasos 6–9).
