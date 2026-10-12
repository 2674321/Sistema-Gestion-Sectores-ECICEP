# Informe final de dry-run de activación v254.4

Fecha: 2026-10-12  
Rama: `codex/vnext-campos-e-identidad`  
HEAD inicial auditado: `0fc3b6fb22c68c64dfba1bfaa172c53723134249`

## Resultado

`tests/dry_run_activation_v254.mjs` ejecutó las funciones productivas de
`src/36_FormsCanal.js`, `src/30_Ingesta.js`, `src/26_Captura.js` y
`src/29_ActualizacionCaptura.js` con servicios GAS simulados.

| Evidencia | Resultado |
|---|---:|
| Instalaciones consecutivas | 10 |
| Forms creados | 0 |
| Form adoptado por ID explícito | PASS |
| Secciones clínicas | 4 |
| Mapa canónico | `GLOBAL|ACCION` + 33 ítems clínicos |
| Preguntas artificiales `Enviar respuesta` | 0 |
| Roundtrip de operaciones | 4/4 |
| Pérdida de campos aceptados | 0 |
| Recepciones concurrentes | 5, 10, 20 y 50 |
| Pérdidas / duplicados / `SERVICE_BUSY` en recepción | 0 / 0 / 0 |
| Pipeline clínico durante recepción | 0 llamadas |
| Lock clínico durante recepción | 0 llamadas |
| Respuesta programática recuperada sin evento submit | PASS |
| Lock ocupado, cursor sin cambio, recuperación posterior | PASS |
| Retryable intermedio recuperado sin duplicar T0/T2/T3 | PASS |
| QR ante URL de Form A/B/C | estable |

Los 33 ítems clínicos son el conteo final derivado del contrato ejecutable: los
31 preexistentes más `ACTUALIZAR_DATOS|TELEFONO_OBS` y
`ACTUALIZAR_DATOS|SALUD_MENTAL`. Mantener 31 habría perdido dos campos que el
contrato V4 acepta y la terminación exige conservar.

La auditoría `tools/auditar_v254.mjs` informó PASS en sus 16 invariantes. Este
ensayo no abrió ni modificó el Form, Spreadsheet, ScriptProperties, triggers o
deployment reales; tampoco ejecutó `clasp push` ni `clasp deploy`.

```text
ESTADO: READY_FOR_ACTIVATION
CODIGO_REAL_AUDITADO: PASS
DRY_RUN_FIEL_AL_CODIGO: PASS
PRODUCCION: INTACTA
ACTIVACION: NO EJECUTADA
```
