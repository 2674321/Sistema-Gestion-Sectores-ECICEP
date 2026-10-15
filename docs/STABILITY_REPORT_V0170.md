# Informe de estabilidad — ECICEP v0.17.0

Fecha: 2026-10-14. Alcance: hardening desde
`origin/release/v0.17.0-rc1` (`af864f8`) hasta la rama
`hardening/v0.17.0-final`.

## Resultado local

- Datos e integridad: PASS. Confirmación basada en PACIENTES+EVENTOS, escritura
  y rollback verificados, captureId/IDs únicos y vistas derivadas no canónicas.
- Captura: PASS. Web App anónima como única interfaz; Form interno durable,
  runtime de Items tipado, schema 3 y provider directo en REVIEW sin clínica.
- Worker: PASS. Lease corto, lock solo en commit clínico, trailer autoritativo,
  cursor fail-closed, circuito y métricas de materialización.
- Seguridad: PASS. 12 RPC públicas, operador OPSESS, sin token en captura,
  barrera de fórmulas, auditoría XSS/HTML, privacidad IA y nonce consume-once
  para eliminaciones.
- Rendimiento: PASS local. Hot paths batch/indexados, sin N×TextFinder en la
  integridad y snapshot Forms acotado.
- Legacy: aislado. `WEBAPP_LEGACY/LEGACY_PRE_FORMS`, migración dry-run y sin
  reenvío automático al pipeline.
- Release engineering: PASS local. CI descubre suites, manifest derivado,
  scope audit, tool Node multiplataforma y deployment existente obligatorio.

## Evidencia

`node tools/verificar.mjs`: 166 suites, 0 fallos, incluida sintaxis JS/GS.
`tests/ejecutar_local.mjs`: 679/679.
`tests/aceptacion_formulario.mjs`: 50/50.
`tests/contrato_captura_v2.mjs`: 36/36.
`tests/validar_html.mjs`: 20 scripts válidos.
`tests/rpc_public_surface_v255.mjs`: 12 globales públicas.
`tests/operator_destructive_nonce_v0170.mjs`: binding/consume-once/replay PASS.
`tests/operator_proxy_chain_v0170.mjs`: chaining real del gateway PASS.

## Backups y recuperación

El release exige una copia PRE_RELEASE reciente, no vacía y abrible antes de
publicar. `Backup_crear_` copia el Spreadsheet completo en Drive y devuelve ID,
URL y tamaño; `Backup_estadoOperativo_` es read-only. La verificación runtime y
el restore smoke se registran durante la ventana de activación; una evidencia
ausente bloquea `--publish`.

## Publicación y salud

Único deployment autorizado:
`AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`.
La URL `/exec` no puede cambiar. Antes del deploy se exige `/dev` anónimo,
preflight, backup y ausencia de P0/P1; después se exige efecto E2E, idempotencia
y `ACTIVE_HEALTHY`.

## Limitaciones conocidas

- Decisiones clínicas pendientes (semántica de estados/catálogos y bloque C
  REM) permanecen fuera del release técnico y no habilitan writes alternativos.
- La gobernanza de branch protection requiere configuración manual en GitHub si
  el host no expone administración de rulesets.
- Datos sintéticos existentes se inventarían read-only; solo se eliminan por una
  ruta probada, con confirmación server-side y backup.

El estado runtime definitivo se completa en este mismo documento tras el E2E
post-deploy; no se declara producción lista con solo HTTP 200.
