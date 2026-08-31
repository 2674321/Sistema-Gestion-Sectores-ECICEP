# Formulario complementario — v0.9.2

Puerta de entrada controlada: las respuestas de un **Google Form** se validan, normalizan y se
entregan al pipeline existente (**PACIENTES / EVENTOS / SECTOR / INICIO**). El formulario **no es**
una base de datos paralela (DEC-048) y su instalación es conservadora (DEC-047).

Desde **v0.9.1 (DEC-049)** el formulario convive con la estrategia de entornos **DEV + DEMO**: el
mismo código distingue por `Spreadsheet.getId()` si el libro activo es desarrollo o demostración,
y el **gate de entorno** (`Entorno_validarProcesamiento`) bloquea con `ERROR_CONFIG_ENTORNO`
cualquier cruce (libro/Form de otro entorno o libro desconocido). La identidad NUNCA depende del
nombre visible de la hoja.

```
FORM → respuesta → VALIDACIÓN/NORMALIZACIÓN → pipeline existente → PACIENTES · EVENTOS · SECTOR · INICIO
```

## 1. Flujo

| Paso | Responsable | Detalle |
|------|-------------|---------|
| Captura | `Form_capturarRespuestas` (trigger `Form_onFormSubmit` o bajo demanda) | `FormApp.getResponses(desde)`; dedupe por `responseId`; ventana inicial 2 h; deposita fila plana en `FORM_RESPUESTAS` con `ESTADO=RECIBIDO`. |
| Validación | `Form_validarRespuesta` (puro) | Normaliza con las reglas del sistema (`Norm_*`): RUT con DV, fechas reales, sector/estratificación oficiales. |
| Decisión | `Form_procesarLote` (puro) | `ANEXAR` / `CLINICA` / `ERROR` / `CUARENTENA` / `PROCESADO_YA` / `SALTAR` / `YA_ANEXADO`. |
| Efectos | `Form_procesarPendientes` | Anexa filas canónicas a `INGRESO_<SECTOR>`; acciones clínicas vía `api_registrarEvento`; dispara el pipeline real. |
| Resultado | Trailer | Traduce el estado del pipeline al estado FORM (`INGRESADO→PROCESADO`, `DUPLICADO→REQUIERE_REVISION`, …). |

## 2. Acciones soportadas (FORM_CONFIG.ACCIONES)

| Acción | Requisito mínimo | Efecto |
|--------|------------------|--------|
| `NUEVO_INGRESO` | RUT · NOMBRE · SEXO · FECHA DE NACIMIENTO · SECTOR · ESTRATIFICACIÓN | Fila canónica en `INGRESO_<SECTOR>` + pipeline completo. Duplicados los decide el sistema (nunca se crean dos pacientes). |
| `REGISTRAR_CONTROL` | RUT · FECHA_EVENTO | Evento `CONTROL` completo (reuso de `api_registrarEvento`). |
| `REGISTRAR_SEGUIMIENTO` | RUT · FECHA_EVENTO | Evento `SEGUIMIENTO`. |
| `ACTUALIZAR_DATOS` | RUT | Ajusta solo campos operativos (teléfono, observaciones, profesional). **Identidad y estratificación jamás se tocan.** |

El cambio de estratificación está **excluido del formulario** (se mantiene en la ficha clínica).

## 3. Contrato de columnas (FORM_RESPUESTAS_COLUMNAS)

Derivado de `FORM_CONFIG.CAMPOS` (pregunta ↔ campo) + metadatos. Orden estable:

**Técnicas (sin dependencia de índice):** `RESPONSE_ID · FECHA_FORMS · ESTADO · REINTENTOS · MOTIVO ·
ACCION · TRAZA_CRUDA · ID_INTERNO · ID_EVENTO · INGRESO_HOJA · INGRESO_FILA · FECHA_PROCESO` + campos
del contrato (RUT, NOMBRE, SEXO, FECHA DE NACIMIENTO, SECTOR, ESTRATIFICACIÓN, TELEFONO(S), FECHA
EVENTO, PROFESIONAL, OBSERVACIONES, EMAIL DE LA PERSONA).

Todas las lecturas mapean por **encabezado** (`Form_mapeoEncabezados` + `Utl_claveAlnum`): un
reordenamiento de columnas no rompe el procesamiento.

## 4. Estados de una respuesta

`RECIBIDO → (validación) → VALIDANDO → VALIDO → PROCESADO` (`REQUIERE_REVISION` / `ERROR`
por decisión del pipeline). Reintentos: un `ERROR` se reintenta hasta
`FORM_CONFIG.MAX_REINTENTOS = 3`; `PROCESADO` y `REQUIERE_REVISION` nunca.

## 5. Instalación (DEC-047)

- `api_formularioInstalar` (`Form_instalar` + `Form_instalarTrigger`): crea/alinea **exclusivamente la
  estructura** (hoja oculta `FORM_RESPUESTAS`, encabezados al contrato) e instala el trigger
  idempotente `Form_onFormSubmit`. **No crea ni modifica el formulario de Google Forms.**
- `api_formularioDiagnostico` (`Form_diagnosticar`, solo lectura): estructura, `FORM_ID`,
  accesibilidad del formulario, trigger, métricas.
- `Form_reparar`: nunca borra datos y nunca recrea un formulario eliminado — reporta la deuda como
  pendiente humano.
- Botón `📥 Formularios → Instalar` en el menú y en el panel.

## 6. Creación y asociación del formulario (manual, deuda humana)

`FORM_ID` vacío NO impide preparar la estructura. Para activar la captura:

1. Crear el formulario en Google Forms con exactamente las preguntas de `FORM_CONFIG.CAMPOS`
   (los títulos DEBEN coincidir; el resto de preguntas se ignoran).
2. Enlazarlo a este libro de cálculo (Formulario → … → Vincular a Hojas de cálculo existente).
3. Completar `FORM_CONFIG.FORM_ID` (clave `FORM_ID` en CONFIG o en el bloque de código).
4. `Form_instalarTrigger()` (botón Instalar) para que cada envío deposite su respuesta.

## 7. Operación

- `Form_procesarPendientes(opciones)` procesa `RECIBIDO`/`VALIDANDO`/`ERROR-reintentable`: anexa
  ingresos, registra acciones clínicas, corre el pipeline y escribe el trailer. `LockService` evita
  ejecuciones concurrentes.
- Botón `Procesar pendientes` del panel (bajo demanda) o trigger de tiempo si se desea automático.
- `Form_simularRespuestas(n, {semilla})`: generador determinista de respuestas válidas para pruebas y
  carga.

## 8. Seguridad

- **El formulario jamás escribe clínica directamente**: todo pasa por validación → decisión →
  pipeline/eventos.
- Validación estricta por acción; el teléfono NO bloquea un ingreso válido (advertencia, no error).
- La marca `FORM|<responseId>|<ACCIÓN>` previene eventos duplicados en reintentos; `INGRESO_FILA` ya
  poblado → `YA_ANEXADO`.
- El panel de administración expone solo **métricas agregadas** (sin datos personales).
- Log del sistema registra contadores, no datos clínicos.

## 9. Archivos

| Archivo | Rol |
|---------|-----|
| `src/24_Formulario.js` | Núcleo puro + wrappers GAS + endpoints `api_formulario*` |
| `src/00_Config.js` | `FORM_CONFIG`, `FORM_RESPUESTAS_COLUMNAS`, `FORM_CONFIG.CONTROL`, `HOJAS.FORM_*`, menú |
| `src/06_Modelo.js` | Esquema de `FORM_RESPUESTAS`, helpers de fila/lectura |
| `src/07_UI.js` | `UI_formularioPanel`, `api_registrarEvento` (fuente/registradoPor) |
| `src/FormularioPanel.html` | Panel de administración (métricas, control, reprocesar, instalar, diagnosticar, procesar) |
| `src/25_Entorno.js` | Estrategia DEV/DEMO (v0.9.1): identidad por ID, gate, backups aislados |
| `src/10_Pruebas.js` | `_pruebas_formulario_v090` + `_pruebas_entornos_v091` + `_pruebas_operativo_v092` (469/469 verdes) |
| `tests/aceptacion_formulario.mjs` | Batería de aceptación end-to-end, Grupos A/B/C (29/29 verdes) |

## 10. Operativización y control administrativo (v0.9.2 — DEC-051)

El formulario es el **canal operativo principal**: el capturador solo llena el FORM (MVP focal:
CONTROL/SEGUIMIENTO); el sistema procesa y la hoja queda como base + administración + supervisión.

- **Matriz de operaciones** (qué va al form, qué se queda en hoja/admin):
  | Operación | Usuario | FORM | Hoja | Automático | Admin |
  |-----------|:---:|:---:|:---:|:---:|:---:|
  | Nuevo ingreso a ECICEP | capturador | ✓ | — | ✓ (pipeline) | — |
  | Registrar control | capturador | ✓ | — | ✓ (cálculo) | — |
  | Registrar seguimiento | capturador | ✓ | — | ✓ | — |
  | Actualizar datos de contacto | capturador | ✓ | — | ✓ | — |
  | Config / responsables / estrat | administrador | — | ✓ | — | ✓ |
  | Revisión de ingreso ambiguo | administrador | — | ✓ | — | ✓ |
  | Control y supervisión del canal | administrador | — | ✓ (FORM_CONTROL) | ✓ | ✓ |
  | Trigger / captura / procesamiento | sistema | — | — | ✓ | — |
  | ID interno / marcas / estados | sistema | —(oculto) | — | ✓ | NO EXPUESTO |
- **Catálogos oficiales**: `PROFESIONAL` ← `CATALOGO_PROFESIONALES`; `SECTOR` ←
  `SECTORES_RESPONSABLES`; `ESTRATIFICACIÓN` ← `['G1','G2','G3']`. El formulario no copia listas.
- **Métrica operativa** `% vía formulario` (`Form_metricasOperativas`): se deriva de EVENTOS
  (FUENTE `FORM|…`). Acompañada de registros por formulario, errores, rechazos, duplicados evitados
  y reprocesamientos (agregados, sin datos personales).
- **Hoja de control `FORM_CONTROL`**: tabla administrativa visible y regenerable
  (`Form_refrescarControl`) con trazabilidad por-envío
  (`RESPONSE_ID · MARCA · FECHA · ACCION · RUT · ID_INTERNO · ESTADO · MOTIVO · REINTENTOS ·
  ID_EVENTO`) + bloque de métricas. Endpoints: `api_formularioControl`, `api_formularioReprocesar`.
- **Recuperación idempotente**: `Form_reprocesar`/`Form_reiniciarRespuesta` listan y reprocesan
  ERROR/PENDIENTES; reinician solo estados no-PROCESADO y la marca/`INGRESO_FILA` garantiza que
  reprocesar nunca duplica.

## 11. Estado

**v0.9.2** — módulo implementado y probado localmente (**469/469 núcleo + 29/29 aceptación**).
Incluye estrategia DEV/DEMO (DEC-049), batería de aceptación (DEC-050) y la operativización del
canal (DEC-051): métricas operativas, trazabilidad, hoja `FORM_CONTROL` y recuperación idempotente.
En producción la activación requiere la acción manual del §6 (formulario real — uno por entorno,
`BACKUP_FOLDER_ID` por libro) y el botón **Instalar**; luego el admin usa "Actualizar hoja de
control" y "Reprocesar errores" del panel para supervisión.