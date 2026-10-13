# Informe v259 — cierre local de preactivación

Fecha: 2026-10-13  
Decisión: DEC-114

## Git

```text
HEAD inicial: fc00370ec3a8c3cec0119e6e8ac1bab9649d9fc4
HEAD final de código/runbook: 071c1046673b9c692d2b66ca3e53935d882c2b1b
HEAD remoto verificado: 071c1046673b9c692d2b66ca3e53935d882c2b1b
branch: codex/v255-operabilidad-observabilidad
working tree al publicar código/runbook: clean
```

El commit que incorpora este informe es únicamente documental y se publica a
continuación sobre la misma rama, sin force.

## Cambios

- **Legacy lane:** detección inequívoca `Cp2/Cp3/Cp4` sin metadatos modernos;
  provider `WEBAPP_LEGACY`, source `LEGACY_PRE_FORMS`, mapeo conservador y cero
  auto-reproceso.
- **Migración:** `Form_migrarTrailerLegacy_()` es dry-run por defecto, no crea
  columnas, exige ventana técnica para apply, preserva celdas modernas, verifica
  escritura y converge en segunda corrida con `cambios=0`.
- **Reconciliación:** `Form_legacyReconciliarDryRun_()` entrega únicamente
  agregados de evidencia fuerte, referencia de ingreso y revisión manual.
- **Health separado:** backlog, `oldestPendingMin` y salud del canal actual
  excluyen legado; la deuda histórica se informa como bloque separado y
  `LEGACY_RECONCILIATION_PENDING`.
- **Menú seguro:** estado y diagnóstico read-only sanitizados; instalación y
  catálogos usan wrappers privados, diagnóstico/dry-run, confirmación humana,
  Form explícito y ventana técnica. El QR se rotula `CapturaWeb`.
- **Operación:** DEC-114, checklist sin fecha histórica y runbook lineal fuera
  de horario. `clasp run` queda `NO_REQUERIDO / NO_CONFIGURADO`.
- **Operador y Form:** procedimientos preparados para configurar, fuera de
  horario, solo `GOOGLE_FORM_ID` y el hash SHA-256 del secreto. El instalador
  escribe el resto; no se crea ni configura nada en esta ejecución.

## Tests

```text
tools/verificar.mjs: 142 suites / 0 fallos / 159442 ms
núcleo: 679 / 679
aceptación: 50 / 50
contrato captura V2: 36 / 36
HTML: 21 / 21
auditar_v254: PASS
placeholders: 142 tests / PASS
git diff --check: PASS
v259 nuevas suites: 5 / 5 PASS
```

Hubo una medición aislada no reproducible de 2045 ms frente al umbral de 2000
ms en el benchmark de 3000 pacientes. No se modificó el test ni el código de
rendimiento: la repetición aislada dio 679/679 y las dos baterías integrales
posteriores terminaron con 0 fallos.

## Producción

```text
CLASP_PUSH: NO
DEPLOY: NO
FORM_REAL: NO
SHEET_REAL: NO
PROPERTIES_REALES: NO
TRIGGERS_REALES: NO
E2E_REAL: NO
QR: UNCHANGED
DATOS_CLINICOS: UNCHANGED
MASTER: UNCHANGED
PR13: UNCHANGED
```

No se ejecutó `clasp push`, `clasp deploy`, Apps Script, Spreadsheet, Form,
ScriptProperties, triggers, E2E mutante ni cambio de QR. La activación sigue
pendiente de jornada finalizada, usuarios fuera, backup nuevo verificado y
rollback refrescado.

## Bloqueo anterior

```text
CLASP_RUN: NOT_REQUIRED
FORM_ID: TO_BE_CONFIGURED_AFTER_HOURS
OPERATOR_SECRET: TO_BE_CONFIGURED_AFTER_HOURS
```

La ausencia de Form y secreto significa `CANAL_GOOGLE_FORMS_NO_ACTIVADO`, no
corrupción. Los conteos observados en v258 son históricos y deben volver a
medirse durante la ventana real.

READY_FOR_AFTER_HOURS_ACTIVATION_WINDOW
