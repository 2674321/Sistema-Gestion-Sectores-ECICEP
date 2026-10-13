# Activación fuera de horario — v258/v259

Secuencia única para el único entorno operativo. No ejecutar durante atención.
`clasp run` es `NO_REQUERIDO / NO_CONFIGURADO`; los diagnósticos se ejecutan
desde el menú del Spreadsheet y las properties desde Apps Script → Project
Settings → Script Properties.

## 1. Cerrar jornada

- [ ] Atención finalizada.
- [ ] Usuarios fuera del Spreadsheet.
- [ ] Nadie usando CapturaWeb para registrar.

## 2. Refrescar estado read-only

- [ ] Registrar Git HEAD aprobado y rama.
- [ ] Registrar deployment operativo, versión, build y URL `/exec` actuales.
- [ ] Inventariar triggers y conteos actuales sin leer PII.
- [ ] Confirmar presencia/ausencia de `GOOGLE_FORM_ID` y
      `ECICEP_OPERATOR_SECRET_SHA256`.
- [ ] Confirmar `GOOGLE_FORM_SCHEMA_VERSION` sin modificarla.

## 3. Crear backup nuevo

- [ ] Crear copia integral reciente del Spreadsheet.
- [ ] Verificar hojas críticas y conteos agregados.
- [ ] Registrar ID, hora y responsable. No reutilizar automáticamente el backup
      anterior si transcurrió la jornada.

## 4. Resolver Form y operador

Repetir búsqueda read-only de Forms. Si existe exactamente un candidato
inequívoco destinado a ECICEP, adoptar su ID. Si no existe, crear manualmente un
Form vacío llamado `Captura ECICEP`, sin añadir campos ni publicar su URL. Guardar
solo su ID como `GOOGLE_FORM_ID`; el instalador construirá el schema.

Generar una clave de operador de al menos 20 caracteres, guardarla en el gestor
seguro del operador, calcular SHA-256 localmente y añadir **solo el hash** a
`ECICEP_OPERATOR_SECRET_SHA256`. No registrar plaintext ni commitear hash:

```bash
read -s -p "Clave operador: " ECICEP_OPERATOR_SECRET
echo
printf '%s' "$ECICEP_OPERATOR_SECRET" | sha256sum
unset ECICEP_OPERATOR_SECRET
```

No configurar `GOOGLE_FORM_SCHEMA_VERSION` a mano. El instalador escribirá
schema, URLs internas, mapas, estado y cursor.

## 5. Abrir ventana técnica

- [ ] Crear `ECICEP_ACTIVATION_WINDOW=OPEN:<timestamp-expiración>` con menos de
      dos horas de TTL.
- [ ] Registrar expiración. Esta property no afecta la operación clínica.

## 6. Sincronizar código

- [ ] Desde el HEAD final aprobado, ejecutar `npx clasp push --force` una vez.
- [ ] Verificar el mismo `scriptId`; no crear otro proyecto Apps Script.

## 7. Recargar Spreadsheet

- [ ] Recargar el libro para cargar el menú nuevo.
- [ ] Ejecutar Estado y Diagnóstico, ambos read-only y sanitizados.

## 8. Adoptar e instalar Form

- [ ] Ejecutar `Instalar/reparar canal (ventana)`.
- [ ] Revisar diagnóstico y dry-run; confirmar explícitamente.
- [ ] Exigir adopción del ID configurado con `crearNuevo:false`.
- [ ] Confirmar schema y accesibilidad. No borrar respuestas.

## 9. Migrar trailer legacy

- [ ] Instalar primero las seis columnas modernas.
- [ ] Ejecutar Legacy Dry Run y registrar el conteo observado en ese momento.
- [ ] Confirmar que solo detecta filas históricas y ninguna moderna.
- [ ] Aplicar `Form_migrarTrailerLegacy_({dryRun:false})`.
- [ ] Repetir y exigir `cambios=0`.
- [ ] Ejecutar `Form_legacyReconciliarDryRun_()`.
- [ ] No auto-procesar pendientes; dejar la revisión manual como backlog
      histórico separado.

## 10. Verificar triggers

- [ ] `Form_onFormSubmit_ = 1`.
- [ ] `Form_worker_ = 1`.
- [ ] No modificar otros triggers.

## 11. Actualizar deployment

- [ ] Publicar una nueva versión sobre el mismo deployment operativo.
- [ ] No crear otro deployment ni cambiar la URL estable.

## 12. Ejecutar E2E sintético

- [ ] Transporte Web App → Form → worker → Captura V2.
- [ ] Alta sintética.
- [ ] Idempotencia con el mismo request.
- [ ] Control y seguimiento sintéticos.
- [ ] Lock busy: cero mutación, retryable y convergencia posterior.
- [ ] Limpiar solo los datos sintéticos identificados, con verificación.

## 13. Verificar QR

- [ ] El menú dice `Mostrar QR de CapturaWeb`.
- [ ] El QR conserva exactamente la URL `/exec`; nunca la URL del Form.

## 14. Cerrar

- [ ] Probar login de operador después del deploy.
- [ ] Confirmar health del canal actual y legado separado.
- [ ] Eliminar `ECICEP_ACTIVATION_WINDOW` desde Project Settings.
- [ ] Registrar GO o ejecutar rollback con el snapshot refrescado.
