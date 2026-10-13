# Plan de rollback v258

Este plan usa únicamente identidades verificadas en vivo el 2026-10-13. No se
debe sustituir ningún dato por referencias históricas.

## Estado anterior verificable

- Código ligado anterior: Git `6fb4ef68048b8e8e24b2481478d080302db55964`.
- Deployment operativo: `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`.
- Versión anterior: `265`.
- URL estable: `https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec`.
- Backup verificado: `19cJjRAIEK83DKpH0-_RLAb_P3zX3w2rz84gZ-skiM6U`.
- Inventario de triggers: uno de cada `ECICEP_onChangeLibro`,
  `Backup_programado` y `ECICEP_onEditIngreso`; cero de
  `Form_onFormSubmit_` y `Form_worker_`.

## Restauración

1. Suspender ensayos y registrar causa, hora y métricas agregadas.
2. Reapuntar el mismo deployment a la versión `265`; no crear otro deployment.
3. En un worktree temporal limpio del SHA `6fb4ef68048b8e8e24b2481478d080302db55964`,
   ejecutar `clasp push --force` para restaurar el HEAD ligado. No mover la rama v258.
4. Confirmar HTTP 200, la misma URL `/exec` y el build `6fb4ef6`.
5. Restaurar exactamente el inventario de triggers anterior; no tocar otros.
6. Preservar Form, respuestas y cola. No borrar filas clínicas ni respuestas.
7. Comparar `PACIENTES=2734`, `EVENTOS=21884` y `FORM_RESPUESTAS=227` contra
   el snapshot y el backup. No restaurar el libro completo si hubo escrituras
   legítimas posteriores; resolver solo corrupción demostrada.
8. Ejecutar diagnóstico read-only y reconciliación dry-run antes de reabrir.

En esta ejecución el rollback no fue necesario porque no hubo `clasp push`,
deploy, reparación, cambio de triggers ni E2E mutante.
