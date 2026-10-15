# Plan de rollback v254

## Estado anterior comprobable

- Deployment ID operativo: `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`.
- URL estable: `https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec`.
- Versión anterior: `@250` es la última versión documentada localmente. El martes debe reemplazarse este dato por el resultado en vivo de `npx clasp deployments`; el dry run del 2026-10-12 agotó el tiempo de espera sin respuesta y no lo considera verificado.

## Restauración

1. Suspender nuevos ensayos y registrar la causa, hora, versión recién publicada y métricas agregadas.
2. No borrar respuestas, items ni el Form. Preservar `FORM_RESPUESTAS`, `PACIENTES` y `EVENTOS` para reconciliación.
3. Reapuntar el mismo deployment operativo a la versión anterior verificada con `npx clasp deploy --deploymentId AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw --versionNumber <VERSION_ANTERIOR>`.
4. Confirmar que la URL `/exec` no cambió y que vuelve a servir `CapturaWeb`.
5. Verificar el QR contra la URL estable carácter por carácter.
6. Restaurar el inventario de triggers anotado en el snapshot: eliminar únicamente el trigger `Form_worker` creado durante la activación si la versión anterior no lo usa; conservar cualquier trigger preexistente y no crear `onFormSubmit` adicionales.
7. Mantener el Form en estado seguro: sin reconstrucción, sin borrado de respuestas y sin cambio de propietario o permisos. Si su schema requiere intervención, dejarlo en `FORM_SCHEMA_REQUIRES_REVIEW`.
8. Ejecutar diagnóstico de solo lectura, smoke anónimo y reconciliación dry run. Verificar cero escrituras nuevas durante la inspección.
9. Comparar recuentos de `PACIENTES`, `EVENTOS` y `FORM_RESPUESTAS` con el backup. Restaurar datos solo desde el respaldo validado y únicamente si se demuestra una pérdida.
10. Documentar el resultado y mantener la activación detenida hasta que la causa tenga prueba de regresión.

