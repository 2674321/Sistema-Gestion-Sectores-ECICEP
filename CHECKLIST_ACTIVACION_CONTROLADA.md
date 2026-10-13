# Checklist de activación controlada fuera de horario — v258/v259

Este checklist no depende de un día específico y se ejecuta sobre el único entorno operativo. Antes de comenzar,
confirmar jornada finalizada, usuarios fuera, backup reciente, rollback listo,
que el gate local sigue verde, que el Form adoptado es el correcto y que
el deployment operativo conserva la URL estable de Captura.

1. **backup** — Crear y verificar un respaldo recuperable del Spreadsheet activo. Registrar ID, hora, responsable y recuentos de `PACIENTES`, `EVENTOS` y `FORM_RESPUESTAS`.
2. **snapshot deployments** — Ejecutar `npx clasp deployments` y `npx clasp versions`; registrar el deployment operativo, su versión y la URL `/exec`. Detenerse si no coinciden con `.clasp.json` y `ECICEP.WEB_APP_URL`.
3. **`clasp push`** — Ejecutar `npx clasp push --force` una sola vez desde la rama aprobada. No crear otro proyecto Apps Script.
4. **validar scriptId** — Comparar `.clasp.json`, `clasp status` y la identidad en vivo. No usar IDs históricos como autoridad.
5. **inspeccionar Form** — En solo lectura, registrar ID, título, URL de edición, cantidad de respuestas, schema e inventario de triggers. No distribuir la URL de respondedor.
6. **adoptar Form existente** — Ejecutar el instalador sobre `GOOGLE_FORM_ID`; si el ID es inaccesible, detenerse con `FORM_CONOCIDO_NO_ACCESIBLE`. No crear un reemplazo silencioso.
7. **validar schema/canonical map** — Confirmar portada, `GLOBAL|ACCION`, cuatro `PageBreak`, 33 campos clínicos con itemIds únicos, required correcto y mapa canónico completo. Los dos campos adicionales son `ACTUALIZAR_DATOS|TELEFONO_OBS` y `ACTUALIZAR_DATOS|SALUD_MENTAL`. Con respuestas, detenerse ante `FORM_SCHEMA_REQUIRES_REVIEW`.
8. **instalar/verificar worker** — Confirmar exactamente un trigger `Form_onFormSubmit` y uno `Form_worker`; eliminar solo duplicados identificados del mismo handler.
9. **diagnóstico** — Ejecutar `Form_operativoDiagnosticar`; exigir Form, schema v3, columnas, URL interna y triggers verdes, sin PII en la salida.
10. **E2E sintético** — Enviar un caso ficticio por `CapturaWeb → WebApp_capturarRecibirDurable → FormResponse.submit() → Form_worker → Captura_v2_enviar`. Verificar `RECIBIDO`, responseId y procesamiento posterior.
11. **prueba lock busy** — Tras adquirir el lease, forzar contención del lock clínico y exigir `SERVICIO_OCUPADO` reintentable; cero mutaciones, cursor seguro y siguiente corrida convergente.
12. **prueba permisos** — Probar admin, editor de Sheet y usuario sin acceso directo al Sheet. La recepción Web no puede depender de allowlist, email, OAuth individual ni permiso del usuario sobre el Sheet.
13. **prueba concurrencia** — Conservar 5/10/20/50 en local; en GAS usar 3–5 solicitudes sobre el único caso sintético, sin carga masiva del libro real.
14. **actualizar mismo deployment** — Publicar una nueva versión sobre el deployment ID obtenido del snapshot en vivo. No crear otro deployment.
15. **validar URL** — Abrir de forma anónima la URL `/exec` obtenida del snapshot y comprobar que sirve `CapturaWeb` sin cambiarla.
16. **validar QR** — Leer el QR desde la UI y confirmar que contiene exactamente la URL `/exec` anterior, nunca la URL del Form.
17. **prueba post-deploy** — Repetir el E2E sintético y verificar la misma responseId/captureId ante reintento, sin duplicar `PACIENTES` ni `EVENTOS`.
18. **observabilidad** — Registrar solo métricas agregadas: responses total, processed, retryable, review, terminal, backlog y oldestPendingMin. Confirmar conservación de masa y ausencia de PII.
19. **GO/ROLLBACK** — GO solo con todos los checks verdes, URL/QR estables y conservación de masa. Ante pérdida, duplicación, schema dudoso, permisos rotos o URL distinta, ejecutar el plan v258 con los valores de `PREACTIVACION_V258_SNAPSHOT.json`.
