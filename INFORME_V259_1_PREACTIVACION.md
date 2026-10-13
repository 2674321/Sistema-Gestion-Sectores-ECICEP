# Informe v259.1 — parche de preactivación

Fecha: 2026-10-13

## Git

```text
HEAD inicial: 9f209210419bff2503b7faf800df53a9102ffed2
HEAD final de código/tests: c8212fbda536cdbb27c3c753add8458f61be2e0a
HEAD remoto verificado: c8212fbda536cdbb27c3c753add8458f61be2e0a
branch: codex/v255-operabilidad-observabilidad
working tree al publicar código/tests: clean
```

El commit posterior que contiene este informe es exclusivamente documental y se
publica en la misma rama, sin force.

## Recuperación transaccional legacy

La migración reconoce explícitamente:

- `LEGACY_UNMIGRATED`: identidad histórica y trailer aún vacío;
- `LEGACY_PARTIAL`: provider `WEBAPP_LEGACY`, pero trailer incompleto o
  divergente;
- `LEGACY_COMPLETE`: los seis campos técnicos coinciden con el plan esperado.

Antes de escribir exige las seis columnas contiguas en el orden autorizado. Un
layout distinto termina con `LEGACY_TRAILER_LAYOUT_UNSAFE` y cero cambios. Cada
fila se prepara en memoria y se escribe mediante un único `setValues()` sobre
el bloque técnico; ninguna columna clínica o histórica se reescribe.

`Form_legacyTrailerCompleto_()` verifica provider, IDs históricos vacíos,
`LEGACY_PRE_FORMS`, clasificación por estado y JSON de error limitado a
`codigo/estado`, sin PII. Las filas parciales siguen siendo legacy para health y
nunca entran en retryable/backlog del Google Form moderno.

### Pruebas de interrupción y recuperación

La suite `forms_legacy_migration_v259` simula:

1. fallo dentro de una fila después de persistir solo `WEBAPP_LEGACY`;
2. redetección posterior como `LEGACY_PARTIAL`;
3. reparación completa en la siguiente corrida;
4. tercera corrida con `cambios=0`;
5. tres filas donde la primera queda completa, la segunda parcial/falla y la
   tercera intacta;
6. convergencia posterior de las tres sin revertir progreso ni alterar nombre,
   RUT, estado o motivo sintéticos;
7. rechazo fail-closed de un layout técnico no contiguo.

Todos los casos pasaron.

## Post-instalación y triggers

`UI_formCanalInstalarSeguro_()` ejecuta diagnóstico inmediatamente después del
instalador y solo anuncia éxito si ambos resultados son verdes. Un postcheck
fallido devuelve `POST_INSTALL_DIAGNOSTIC_FAILED` y muestra únicamente checks
sanitizados.

`Form_operativoInstalar_()` exige explícitamente:

```text
trigger.onFormSubmit === 1
trigger.worker === 1
```

Los errores quedan diferenciados como `INSTALL_SUBMIT_TRIGGER_FAILED` e
`INSTALL_WORKER_FAILED`. Las pruebas cubren ausencia de cada trigger y éxito
con ambos presentes. También verifican que Form ID ausente o ventana cerrada no
ejecutan el instalador.

## Tests

```text
tools/verificar.mjs: 142 suites / 0 fallos / 163428 ms
núcleo aislado: 679 / 679
aceptación: 50 / 50
contrato captura V2: 36 / 36
HTML: 21 / 21
auditar_v254: PASS
placeholders: 142 tests / PASS
v259/v259.1 focales: PASS
git diff --check: PASS
```

La ejecución paralela del núcleo midió una vez 2123 ms contra el umbral de
2000 ms por contención del host. No se modificaron umbrales ni tests: el núcleo
pasó dentro de la batería integral y, repetido después en aislamiento, terminó
679/679.

## Producción

```text
CLASP_PUSH: NO
DEPLOY: NO
APPS_SCRIPT_EXECUTION: NO
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

La ejecución se limitó al repositorio local, tests, commits y push normal de la
rama autorizada. No se activó producción.

READY_FOR_AFTER_HOURS_ACTIVATION_WINDOW
