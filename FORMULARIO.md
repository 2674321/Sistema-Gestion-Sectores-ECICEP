# FORMULARIO — Contrato de captura Web App ECICEP

## Estado actual

Este archivo conserva el nombre histórico `FORMULARIO.md`, pero el **canal operativo actual es la Web App**.

Google Forms está abandonado y no forma parte de la operación.

La hoja `FORM_RESPUESTAS` es una estructura interna de recepción/procesamiento. No debe interpretarse como una respuesta de Google Forms ni como una base de datos paralela.

## 1. Flujo vigente

```text
CapturaWeb.html
      ↓
google.script.run
      ↓
Form_capturarDesdeUI(datos)
      ↓
Form_validarRespuesta()
      ↓
FORM_RESPUESTAS
      ↓
Form_procesarPendientes()
      ↓
Form_procesarLote()
      ↓
pipeline clínico existente
      ↓
PACIENTES / EVENTOS / efectos derivados
```

La Web App es la única puerta de captura. Sheets se utiliza para administración, configuración, supervisión y las operaciones que el sistema ya mantiene como internas.

## 2. Acciones soportadas

| Acción | Requisitos mínimos | Efecto |
|---|---|---|
| `NUEVO_INGRESO` | RUT, nombre, fecha nacimiento, sector, profesional | Entrada a `INGRESO_<SECTOR>` y pipeline clínico |
| `REGISTRAR_CONTROL` | RUT, fecha evento, profesional | Evento `CONTROL` + actualización derivada |
| `REGISTRAR_SEGUIMIENTO` | RUT, fecha evento, profesional | Evento `SEGUIMIENTO` + actualización derivada |
| `ACTUALIZAR_DATOS` | RUT, profesional | Actualiza campos operativos y genera auditoría |

`PROFESIONAL2` es opcional en todas las acciones.

## 3. Validación

La validación se realiza antes de producir efectos clínicos.

Se mantiene el uso de los normalizadores existentes (`Norm_*`) y los catálogos definidos en `00_Config.js`.

Reglas esenciales:

- RUT normalizado y validado;
- fechas válidas;
- sector válido;
- profesional válido según catálogo vigente;
- campos obligatorios por acción;
- `PROFESIONAL2`, cuando existe, no puede duplicar `PROFESIONAL`.

La estratificación no se modifica mediante una ruta arbitraria de captura.

## 4. `FORM_RESPUESTAS`

`FORM_RESPUESTAS` actúa como **cola/tabla de entrada y trazabilidad interna** del mismo pipeline.

No es una segunda base clínica y no reemplaza PACIENTES/EVENTOS.

Campos actuales documentados en `CONTRATOS.md`.

La generación de `RESPONSE_ID` en la Web App utiliza el mecanismo vigente del código (prefijo `UI-` y componente único adicional). El identificador debe ser estable para el registro y servir a la idempotencia del procesamiento.

## 5. Idempotencia y recuperación

Reintentar una captura no debe crear efectos clínicos duplicados.

El procesamiento utiliza las marcas/identificadores establecidos por el código vigente y `LockService` cuando corresponde.

Los errores reintentables pueden reprocesarse sin duplicar eventos ya aplicados.

## 6. Seguridad

La captura no escribe directamente la historia clínica sin validación.

El efecto clínico siempre pasa por el pipeline existente.

El control de acceso real depende de la cuenta Google, permisos del proyecto y permisos del Spreadsheet. Las protecciones de hojas son controles operativos contra errores, no un mecanismo de seguridad institucional.

## 7. Web App y publicación

La Web App se sirve mediante Apps Script.

La URL `/exec` corresponde a un deployment publicado; `/dev` es una URL técnica de desarrollo/previsualización del mismo proyecto y no constituye otro entorno de aplicación.

Antes de documentar una URL concreta, verificar el deployment que realmente la sirve.

## 8. Google Forms — histórico

Google Forms fue una etapa anterior del proyecto.

Durante esa etapa existieron conceptos como:

- `Form_onFormSubmit`;
- `FormApp.getResponses()`;
- `FORM_ID`;
- trigger `onFormSubmit`;
- instalación/diagnóstico del formulario;
- aislamiento DEV/DEMO asociado al formulario.

Esos elementos son **históricos** y no forman parte del contrato operativo actual.

No deben reactivarse para resolver problemas de captura actuales.

El código histórico que permanezca en el repositorio debe considerarse deuda técnica/compatibilidad hasta que su eliminación pueda hacerse con seguridad; su mera presencia no lo convierte en parte del flujo operativo.

## 9. Problemas ya cerrados

No reabrir sin evidencia nueva:

- soporte para `PROFESIONAL2`;
- selección de dupla con segundo profesional opcional;
- bloqueo de profesionales duplicados;
- renderizado de `include('00_Tokens')` mediante `createTemplateFromFile(...).evaluate()`;
- correcciones de esquema y trazabilidad ya documentadas como verificadas.

## 10. Fuente de verdad

La implementación real y sus tests tienen prioridad sobre este documento cuando exista una diferencia temporal.

La configuración vigente vive en `src/00_Config.js`.

La especificación pública de payload/respuesta vive en `CONTRATOS.md`.

## 11. Antiguas tareas de Google Forms

Las tareas históricas de “crear formulario”, “completar `FORM_ID`”, “instalar trigger” o “procesar respuestas de Google Forms” **no son pendientes del sistema actual**.

No deben aparecer como tareas activas, bloqueantes ni pasos normales de despliegue.
