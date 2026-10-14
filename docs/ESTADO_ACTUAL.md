# ESTADO ACTUAL — ECICEP

> Documento **breve y autoritativo** del estado vigente. Si algo aquí contradice a
> un informe histórico o a una sección antigua de `README.md`, manda este archivo
> (y `AGENTS.md`, `ARQUITECTURA.md` y `docs/CONTRATO_CAPTURA_V2.md`).
> Última actualización: **2026-10-14** (v270).

| Campo | Valor vigente |
|---|---|
| Versión de producto | `v0.17.0` (`src/00_Config.js` → `ECICEP.VERSION`) |
| Rama de trabajo | `hardening/v0.17.0-final` (baseline histórico `release/v0.17.0-rc1` / commit clínico v260) |
| Etapa de release | `RC` (hardening v270). `FINAL` solo tras el E2E post-deploy. |
| Deployment operativo | `@267` — `/exec` `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` (verificar con `clasp versions`) |
| Arquitectura de captura | Web App (único canal operativo visible) → Google Forms (transporte durable interno) → `Form_worker_` → pipeline `Captura_v2_enviar_` |
| Esquema clínico | `SISTEMA_VERSION_SCHEMA_ACTUAL = 2` (no subir en este release) |
| Esquema del Form | `GOOGLE_FORMS_CONFIG.SCHEMA_VERSION = 3` |
| Instalador | `SISTEMA_VERSION_INSTALADOR = 'INST-1'` |
| Triggers | Worker durable cada 5 min (`WORKER.CADENCIA_MIN`) + señal `onFormSubmit` (telemetría) |
| Backup | `Backup_crear_/Backup_programado_` con `BACKUP_AUTO_ULTIMA` en CONFIG; backup reciente obligatorio antes de publicar |
| Estado del canal | Operativo en `/dev`; publicación final pendiente de activación fuera de horario |

## Contrato de captura vigente (v270)

- **Captura pública anónima** (DEC-110): sin token, sin OPSESS, sin OAuth
  individual. El HTML servido no lleva credencial en DOM ni URL (DEC-115).
- **Web App = único canal operativo.** El origen se registra como `WEBAPP`
  (`CLIENT_REQUEST_ID` válido) o `GOOGLE_FORM_DIRECT`.
- **Captura directa al Form = recepción durable + `REQUIERE_REVISION`** (DEC-116):
  nunca muta PACIENTES/EVENTOS/agenda/contacto; queda para decisión humana.
- **Operador/administración** exigen sesión OPSESS; `ECICEP_ACCESS_TOKEN` es
  solo trazabilidad de esas vistas.
- Input hardening (DEC-114/v270): cotas de tamaño, profundidad y longitud de
  texto en `Captura_v2_validar_`; anti-inyección de fórmulas en celdas.

## Verificación

- Verificador integral: `node tools/verificar.mjs` (humano) o `--json`.
  Estado: **164 suites / 0 fallos**.
- Preflight de release: `node tools/preflight_release.mjs`.
- Release Node: `node tools/release.mjs --check` (este documento debe citar
  `v0.17.0`).
- Manifest derivado: `RELEASE_CANDIDATE.json` (`tools/release_manifest.mjs`).
- Scopes OAuth: `docs/OAUTH_SCOPES.md` + `tests/oauth_scopes_v270.mjs`.

## Deuda legacy no bloqueante

- Filas `FORM_RESPUESTAS` previas a Forms (`WEBAPP_LEGACY`/`LEGACY_PRE_FORMS`):
  data a interpretar, no especificación; migración dry-run.
- Enunciados históricos de `README.md`/`docs/INFORME_*.md` sin valor normativo.
- Datos sintéticos de E2E en producción: inventario read-only antes del release
  final (§31 del megaprompt); no borrar sin ruta segura probada.

## Último E2E

- `v270`: verificación estática y por suites (transporte, idempotencia,
  concurrencia, captura directa → REVIEW). E2E real `/dev` y post-deploy
  **pendientes** de la ventana de activación (Fases 9–12).
