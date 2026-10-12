# Checklist de activación del martes — v254

Este checklist se ejecuta sobre el único entorno operativo. Antes de comenzar,
confirmar que el dry run sigue verde, que el Form adoptado es el correcto y que
el deployment operativo conserva la URL estable de Captura.

1. **backup** — Crear y verificar un respaldo recuperable del Spreadsheet activo. Registrar ID, hora, responsable y recuentos de `PACIENTES`, `EVENTOS` y `FORM_RESPUESTAS`.
2. **snapshot deployments** — Ejecutar `npx clasp deployments` y `npx clasp versions`; registrar el deployment operativo, su versión y la URL `/exec`. Detenerse si no coinciden con `.clasp.json` y `ECICEP.WEB_APP_URL`.
3. **`clasp push`** — Ejecutar `npx clasp push --force` una sola vez desde la rama aprobada. No crear otro proyecto Apps Script.
4. **validar scriptId** — Comparar el `scriptId` remoto con `1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI`.
5. **inspeccionar Form** — En solo lectura, registrar ID, título, URL de edición, cantidad de respuestas, schema e inventario de triggers. No distribuir la URL de respondedor.
6. **adoptar Form existente** — Ejecutar el instalador sobre `GOOGLE_FORM_ID`; si el ID es inaccesible, detenerse con `FORM_CONOCIDO_NO_ACCESIBLE`. No crear un reemplazo silencioso.
7. **validar schema/canonical map** — Confirmar portada, `GLOBAL|ACCION`, cuatro `PageBreak`, 31 campos por sección con itemIds únicos, required correcto y mapa itemId→campo completo. Con respuestas, detenerse ante `FORM_SCHEMA_REQUIRES_REVIEW`.
8. **instalar/verificar worker** — Confirmar exactamente un trigger `Form_onFormSubmit` y uno `Form_worker`; eliminar solo duplicados identificados del mismo handler.
9. **diagnóstico** — Ejecutar `Form_operativoDiagnosticar`; exigir Form, schema v2, columnas, URL interna y triggers verdes, sin PII en la salida.
10. **E2E sintético** — Enviar un caso ficticio por `CapturaWeb → WebApp_capturarRecibirDurable → FormResponse.submit() → Form_worker → Captura_v2_enviar`. Verificar `RECIBIDO`, responseId y procesamiento posterior.
11. **prueba lock busy** — Forzar una corrida diferida y exigir `DEFERRED_LOCK_BUSY`; la siguiente debe recuperar el envío sin duplicarlo.
12. **prueba permisos** — Probar admin, editor de Sheet y usuario sin acceso directo al Sheet. La recepción Web no puede depender de allowlist, email, OAuth individual ni permiso del usuario sobre el Sheet.
13. **prueba concurrencia** — Ejecutar lotes sintéticos 5/10/20/50; exigir cero pérdidas, cero duplicados y cero `SERVICE_BUSY` en recepción.
14. **actualizar mismo deployment** — Publicar una nueva versión sobre el deployment ID `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`. No crear otro deployment.
15. **validar URL** — Abrir `https://script.google.com/macros/s/AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw/exec` de forma anónima y comprobar que sirve `CapturaWeb`.
16. **validar QR** — Leer el QR desde la UI y confirmar que contiene exactamente la URL `/exec` anterior, nunca la URL del Form.
17. **prueba post-deploy** — Repetir el E2E sintético y verificar la misma responseId/captureId ante reintento, sin duplicar `PACIENTES` ni `EVENTOS`.
18. **observabilidad** — Registrar solo métricas agregadas: responses total, processed, retryable, review, terminal, backlog y oldestPendingMin. Confirmar conservación de masa y ausencia de PII.
19. **GO/ROLLBACK** — GO solo con todos los checks verdes, URL/QR estables y conservación de masa. Ante pérdida, duplicación, schema dudoso, permisos rotos o URL distinta, ejecutar `PLAN_ROLLBACK_V254.md`.

