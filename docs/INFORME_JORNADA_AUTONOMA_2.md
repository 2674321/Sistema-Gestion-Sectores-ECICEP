# INFORME JORNADA AUTÓNOMA 2 — Controles 50/50 · captura aditiva · ocultamiento de IA

Fecha de ejecución: 2026-09-15.
Alcance: rediseño operativo de "Controles por persona", corrección de la pérdida
real de controles/seguimientos que entraban por fuentes, y retirada completa del
frontend de IA (backend conservado íntegro). Sin tocar el contrato
`docs/CONTRATO_CAPTURA_V2.md` (NORMATIVO) ni el pipeline de captura.

> E2E en vivo: **no medible en esta ejecución** (sin login/Spreadsheet desde el
> entorno de agente). Verificación por baterías deterministas + emulador de template.

## A. Contexto

- El modal "Controles por persona" era **solo bajo demanda**: no mostraba ninguna
  lista al abrir, obligaba a elegir sector o escribir un término, y no ofrecía
  orientación de intervención (estados) ni acciones desde el propio modal.
- En la auditoría de fuentes se confirmó que **datos reales de la planilla se
  perdían en el ingreso**: columnas `SEGUIMIENTO`, `CONTROL`, `PRÓXIMO CONTROL`,
  `PROFESIONAL` y `PRE INGRESO` se descartaban, y `ULTIMO_CONTROL`/`ULTIMO_SEGUIMIENTO`
  se fijaban en `''` al crear el paciente.

## B. Diagnóstico (causa raíz)

`Ingresos_mapearEncabezadosHoja` solo mapeaba encabezados cuyo campo canónico
pertenecía a `CAMPOS_INGRESO_OPERATIVOS` (9 campos). Los sinónimos confirmados
(12_Ingresos SINONIMOS de `12_Ingresos.js`/`SINONIMOS_ENCABEZADOS`) caían a
`desconocidos`:

| Encabezado fuente | Canonico | Antes | Ahora |
|---|---|---|---|
| `SEGUIMIENTO` | ULTIMO_SEGUIMIENTO | descartado | conservado |
| `CONTROL` | ULTIMO_CONTROL | descartado | conservado |
| `PROXIMO CONTROL` | PROXIMO_CONTROL | descartado | conservado |
| `PROFESIONAL` | PROFESIONAL_SEGUIMIENTO | descartado | conservado |
| `PRE INGRESO` | PREINGRESO | descartado | conservado |

Además `Ingresos_pacienteDesdeNormalizado` fijaba `ULTIMO_SEGUIMIENTO:''` y
`ULTIMO_CONTROL:''`, y los lectores (`Fuentes_importarMuestra`, `Ingresos_leerHoja`)
solo copiaban los 9 campos operativos. `Fuentes_cargaReal` ya copiaba de forma
aditiva (era el modelo correcto a replicar).

## C. Solución implementada

1. **Rediseño 50/50 de `Controles.html`** (modal 1160×760):
   - Izquierda: sector + **chips de estado** (Pendientes · Vencidos · Próximos ·
     Sin control · Vigentes · Todos), tabla densa paginada ("Cargar más") y
     **auto-carga al abrir** de la lista de control pendiente (VENCIDO/
     POR_VENCER/SIN_FECHA) → es la **única lectura automática** del modal.
   - Derecha: búsqueda (ID/RUT/nombre, min 2 caracteres, bajo el filtro activo),
     detalle de la persona (vigencia, últ. control/seguimiento, recordatorio) y
     acciones: registrar control/seguimiento de hoy y abrir ficha completa.
   - Sin KPIs ni estadísticas; sin contenido dinámico peligroso (`_esc` en todo).
2. **Filtro por estado en backend**: `Control_consultarControles` acepta
   `estados[]`, `estado` y `pendientes`; ordena por urgencia
   VENCIDO→POR_VENCER→SIN_FECHA→VIGENTE (proximo asc, luego nombre); `sectores`
   se recalculan sobre el subconjunto filtrado. Criterio en función pura
   `Control_estadosCriterio` (03 → testeable sin UI).
3. **Captura aditiva**: nuevo `CAMPOS_INGRESO_ADICIONALES` (5 campos) en
   `00_Config.js`; `Ingresos_mapearEncabezadosHoja`, `Fuentes_importarMuestra` e
   `Ingresos_leerHoja` copian los adicionales con el mismo criterio que
   `Fuentes_cargaReal`; `Fuentes_normalizar` normaliza las fechas de
   ULTIMO_CONTROL/ULTIMO_SEGUIMIENTO (warn, no bloquea); el paciente nuevo
   conserva los valores reales.
4. **IA frontend retirada por completo** (backend intacto):
   - Eliminado menú `IA` de `onOpen()` (07_UI.js).
   - Eliminada entrada `IAPanel` de `UICFG_DIALOGOS` (00_Config.js).
   - Eliminado `src/IAPanel.html`.
   - **Conservado íntegro `src/28_IA.js`**: el webhook
     (`Webhook.js:110` → `IA_revisarTodo()`) y la batería de tests siguen
     dependiendo de él; no hay UI que lo invoque.
5. **Limpieza**: eliminada `api_centroResumen` (07_UI.js, código muerto desde el
   sidebar simplificado); se conserva `_centro_resumen` (sigue bajo test en
   `tests/contrato_datos.mjs`).

## D. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/Controles.html` | Rediseño completo 50/50 con auto-carga de pendientes |
| `src/02_Normalizacion.js` | `Control_consultarControles` (estados + urgencia) · `Control_estadosCriterio` |
| `src/00_Config.js` | +`CAMPOS_INGRESO_ADICIONALES` · −entrada `IAPanel` en UICFG |
| `src/03_Fuentes.js` | `Fuentes_importarMuestra` aditivo · `Fuentes_normalizar` fecha ULTIMO_* |
| `src/12_Ingresos.js` | mapeo adicional · `Ingresos_leerHoja` aditivo · paciente conserva ULTIMO_* |
| `src/07_UI.js` | −menú IA · −`api_centroResumen` · modal 1160×760 + docblocks |
| `src/IAPanel.html` | **eliminado** |
| `src/10_Pruebas.js` | +6 tests (mapeo aditivo, pipeline controles, filtro/orden estados) |
| `README.md` | árbol actualizado (`IAPanel.html` fuera · conteo 597) |
| `DECISIONES.md` | DEC-063 |

## E. Verificación

- `node tests/ejecutar_local.mjs` → **597/597** (eran 591; +6 nuevos).
- `node --check` OK en todos los `.js` modificados.
- `node tests/validar_html.mjs` → **17/17** (era 18/18: baja a 17 porque
  `IAPanel.html` dejó de existir, esperado).
- Emulador de template `Controles.html` en Node → compila y renderiza la
  estructura 50/50 con ambos endpoints (`api_controlPanel`,
  `api_controlActualizarUltimo`). Residual scriptlet = el comentario documental
  `<?!= include('00_Tokens') ?>` interno de tokens (idéntico en todas las páginas).
- Resto de baterías: contrato_datos 38/38 · cola 33/33 · captura_ui_payload 19/19 ·
  captura_backend 68/68 · formulario_web 27/27 · contrato_captura_v2 36/36 ·
  aceptación 50/50. **Total baterías: 868/868.**

## F. Deployment

- `clasp push --force` → **48 ficheros** sincronizados (el proyecto remoto ya no
  contaba `IAPanel.html`; el push quedó limpio).
- **Nueva versión @180** creada con `clasp deploy` sobre el **deployment operativo
  existente** (`AKfycbx16…RuYSCw`, `/exec`, el que sirve `ECICEP.WEB_APP_URL`) —
  reutilizado, sin crear deployments nuevos.
- Smoke check: `GET /exec` → **HTTP 200** (respuesta con shell y contenido de la
  app). E2E interactivo completo (login Google + Spreadsheet) no medible en este
  entorno de agente, coherente con jornadas anteriores. Verificación interactiva
  recomendada en §H.

## G. Riesgos y pendientes

- **Regresión nula esperada en pipeline**: la copia aditiva no altera
  validaciones ni ER de integridad; `desconocidos` ya no recibe los 5 sinónimos
  confirmados (tests lo fijan).
- **PROXIMO_CONTROL de fuente** se conserva como dato; la vigilancia del panel
  sigue derivándose en vivo (`Control_calcularProximo`) — no hay doble autoridad
  de vigencia.
- **Tema de estado SIN_FECHA**: si existe ULTIMO_CONTROL pero la fecha no
  calcula próximo (ausente/en blanco) la fila cae a SIN_FECHA; coherente con el
  criterio de intervención actual.
- Docs históricas que aún describen el panel IA (`docs/INFORME_IA_GEMINI.md`,
  `PENDIENTES.md` y el propio texto de DEC-062) quedan como historial; la
  vigencia está dada por DEC-063 y este informe. No se eliminan (regla: el
  historial se conserva).

## H. Reproducción / verificación manual

1. Abrir aplicación → menú Sistema → *Controles por persona*.
2. Confirmar modal 1160×760 con la planilla de pendientes ya cargada (chips
   "Pendientes" activo por defecto).
3. Probar chips Vencidos/Próximos/Sin control/Vigentes/Todos → la tabla se
   re-consulta; prueba búsqueda con 2+ caracteres (se mantiene el filtro).
4. Hacer clic en una fila → detalle derecho con vigencia y recordatorio;
   "Registrar control (hoy)" actualiza la lista (vuelve a cargar).
5. Fuentes: cargar/actualizar una hoja con columnas `SEGUIMIENTO`, `CONTROL`,
   `PRÓXIMO CONTROL`, `PROFESIONAL`, `PRE INGRESO` → verificar en PACIENTES que
   `ULTIMO_CONTROL`/`ULTIMO_SEGUIMIENTO`/`PROXIMO_CONTROL`/etc. quedan poblados
   (antes se vaciaban).
6. Verificar que el menú ya no ofrece "IA" y que no existe el HTML IAPanel en el
   proyecto Apps Script.