# PENDIENTES — Trabajo pendiente real ECICEP

Este documento contiene únicamente asuntos que siguen siendo accionables. Los trabajos históricos ya resueltos se mantienen fuera de la cola activa para evitar que un agente los reabra por error.

## 1. Decisiones funcionales abiertas

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 3 | Confirmar exclusión de la hoja `NO LLENAR` (duplicado histórico del sector Verde) | Decisión cliente | Migración | MEDIA |
| 4 | Precisar semántica de columnas ambiguas: ESTADO vs SEGUIMIENTO vs CONTROL vs PROFESIONAL y otros encabezados heredados | Consulta cliente | Modelo final / normalización | ALTA |
| 5 | Estratificación `G` sin nivel: decidir derivación o `null` en los casos restantes | Consulta cliente | Normalización | MEDIA |
| 6 | Confirmar lista cerrada de estados canónicos | Consulta cliente | Consolidación + UI | ALTA |
| 7 | Confirmar indicadores definitivos del dashboard | Consulta cliente | Dashboard | MEDIA |
| 11 | Definir destino de flujos auxiliares: GESTOR DE CASO, CONTROLES PENDIENTES, INASISTENTES A INGRESOS | Consulta cliente | Modelo final | MEDIA |
| 12 | Confirmar etiqueta visible definitiva de NARANJO/NARANJA en UI/REM | Consulta cliente | Etiquetas REM | BAJA |
| 13 | Definir correos de responsables por sector para protecciones operativas | Consulta cliente | Protecciones | MEDIA |
| 14 | Definir catálogo de condiciones/patologías y disponibilidad final de FECHA_NACIMIENTO/SEXO desde fuentes actuales | Consulta cliente | Estratificación / REM | ALTA |
| 15 | Confirmar umbrales oficiales G1/G2/G3 y definición operativa de PLAN_CUIDADO / GESTION_CASO | Consulta cliente | Motor G / REM | ALTA |
| 16 | Definir formato de entrega del REM y período de cierre | Consulta cliente | Exportación REM | MEDIA |
| 17 | Confirmar origen del bloque “atenciones” del REM | Consulta cliente | Generador REM | ALTA |
| 18 | Definir mecánica de corrección de eventos ya registrados | Decisión de diseño | Integridad de historial | MEDIA |

## 2. Desarrollo / operación

| # | Pendiente | Tipo | Prioridad |
|---|---|---|---|
| 25 | Completar captura de campos REM actualmente ausentes sin inventar datos | Captura nueva | ALTA |
| 26 | Completar importación/cierre del histórico del sector Amarillo según fuente y procedimiento vigente | Acción operativa | ALTA |
| 27 | Completar definición de usuarios/accesos y responsables por sector | Decisión cliente | MEDIA |
| 28 | Completar revisión de fuentes restantes y su inclusión/exclusión definitiva | Decisión cliente | MEDIA |
| 29 | Activar y validar estrategia de backups operativos | Operativo | ALTA |
| 30 | Realizar validación visual manual integral del libro real tras los cambios correspondientes | Humano | ALTA |
| 32 | Normalizar formato heredado mediante el reconciliador visual, sin limpieza destructiva manual | Dev | BAJA |
| 33 | Migrar colores duplicados en HTML a tokens CSS de `00_Tokens` | Dev / cosmético | BAJA |
| 34 | Consolidar `Rem9_edadEn` en `Utl_edadDesde` (duplicado menor confirmado) | Dev | BAJA |

## 3. Publicación / deployment

No existe un pendiente activo que obligue a crear un nuevo entorno o un nuevo deployment.

Las tareas de publicación deben:

1. inspeccionar deployments reales;
2. identificar la URL operativa;
3. reutilizar el deployment operativo existente cuando sea posible;
4. actualizarlo después de `clasp push`;
5. comprobar `/exec` mediante E2E;
6. eliminar deployments obsoletos únicamente después de verificar dependencias.

El deployment histórico `@63` fue eliminado después de verificar que no tenía dependencias operativas activas.

## 4. Limitaciones conocidas

Las limitaciones antiguas de acceso/API o URLs obsoletas deben volver a verificarse antes de considerarse vigentes. Un diagnóstico histórico no debe tratarse como estado actual sin evidencia.

En particular, antes de actuar sobre un webhook, deployment, token o URL, comprobar el estado real en el proyecto.

## 5. Pendientes eliminados por obsolescencia

Las siguientes categorías **ya no son pendientes**:

- crear o vincular un Google Form;
- completar `FORM_ID`;
- instalar un trigger `onFormSubmit` para captura;
- operar mediante Google Forms;
- crear DEV/DEMO como ambientes;
- promover una versión hacia una supuesta “producción @63”;
- crear un segundo Spreadsheet para pruebas o demostración;
- crear un segundo pipeline de captura.

Estas tareas pertenecen a etapas históricas que fueron supersedidas por la arquitectura actual de entorno único y Web App única.

## 6. Problemas cerrados

Los problemas que ya fueron implementados y validados permanecen cerrados y no forman parte de la cola activa. Una reaparición debe demostrarse mediante una nueva evidencia o una regresión reproducible.

- **#21** UI mínima para `REQUIERE_REVISION` / `POSIBLE_DUPLICADO`: resuelto. Backend (`api_revisionListar`, `api_revisionResolver`) y frontend (Sidebar `mode='revision'` con comparación lado a lado y botones de acción) completamente implementados. Accesible vía `ECICEP > Personas > Cola de revisión` y Panel de Control.
- **#22** Fecha específica para CONTROL/SEGUIMIENTO: resuelto. `FECHA_EVENTO` es obligatorio en el contrato, capturado por `<input type="date">` en la UI, validado/normalizado en `Form_validarRespuesta`, persistido en `FORM_RESPUESTAS`, y utilizado por `api_registrarEvento` para crear el evento con la fecha del usuario.
