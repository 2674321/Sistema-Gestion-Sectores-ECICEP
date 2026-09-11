# INFORME — Integración de IA generativa (Gemini) en ECICEP

> Documentación vigente de la primera capacidad de IA generativa del proyecto.
> Naturaleza: **herramienta de asistencia técnica** para análisis, validación,
> calidad de datos y automatización de tareas de datos. **No** constituye IA
> médica, diagnóstico ni sustitución del criterio profesional.
>
> Estado: implementada y publicada en el proyecto Apps Script · `v0.9.3`
> (sin cambio de versión) · última actualización: 2026-09-11.

---

## 1. Descripción

ECICEP procesa una base clínico-administrativa real con miles de registros
(pacientes, eventos y hojas derivadas). La calidad de esos datos es una
preocupación operativa constante: formatos inconsistentes, campos vacíos,
posibles duplicados y eventos sin respaldo.

La integración con la **API de Google Gemini** añade una capa de asistencia para:

- analizar la **estructura** y calidad de las hojas de cálculo;
- detectar **inconsistencias**, **duplicados** y problemas de **integridad**;
- ejecutar **correcciones/normalizaciones** deterministas (RUT, fechas, nombres,
  teléfonos, sexo) de forma asistida y trazable;
- interpretar **instrucciones en lenguaje natural** y traducirlas a acciones del
  sistema;
- mantener un **registro auditable** de cada cambio realizado.

La IA generativa se usa como **asistencia técnica**: aporta análisis, patrones y
propuestas sobre estructura y estadísticas. Las transformaciones de datos se
apoyan en los normalizadores deterministas ya existentes del sistema
(`02_Normalizacion.js`), no en la generación no controlada de contenido.

La integración es una **nueva capacidad del proyecto**, no el núcleo del
sistema: el pipeline clínico, el modelo de datos y la Web App de captura
permanecen inalterados y siguen siendo la fuente de verdad operativa.

---

## 2. Arquitectura

```text
┌─────────────────────────────────────────────────────────────────┐
│                        GOOGLE SHEETS                           │
│   PACIENTES · EVENTOS · hojas derivadas · LOG_IA (auditoría)    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Google Apps Script
┌──────────────────────────────▼──────────────────────────────────┐
│                  MÓDULO 28_IA.js (backend IA)                   │
│  lectura de estructura/estadísticas · detección local · acciones │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS (UrlFetchApp) · API key
                               │ desde Script Properties (GEMINI_API_KEY)
┌──────────────────────────────▼──────────────────────────────────┐
│                        GEMINI API                               │
│                     modelo `gemini-2.0-flash`                   │
│            retry/backoff exponencial · manejo de 429            │
└──────────────────────────────┬──────────────────────────────────┘
                               │ respuesta (JSON/texto)
┌──────────────────────────────▼──────────────────────────────────┐
│            VALIDACIÓN Y PROCESAMIENTO                           │
│        IA_parsearJSON · resolución de columnas por encabezado   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                        LOG_IA                                   │
│     cada corrección/acción se registra (fecha, usuario, tipo,   │
│     cantidad, detalle) → trazabilidad y revisión                │
└──────────────────────────────────────────────────────────────────┘
```

Principio operativo:

```text
detección → propuesta/corrección → registro (LOG_IA) → revisión
```

La IA no actúa como caja negra: todo lo que toca datos deja registro y las
correcciones reutilizan validadores deterministas del sistema.

---

## 3. Componentes

| Archivo | Rol |
|---|---|
| `src/28_IA.js` | **Módulo backend de IA**: conexión Gemini, análisis, detección de duplicados/integridad, correcciones, chat/instrucciones, configuración y logging. |
| `src/IAPanel.html` | **Sidebar del panel IA**: estado de configuración, acciones rápidas (Análisis rápido, Corregir todo, Duplicados, Integridad), chat en lenguaje natural y log de actividades. |
| `src/07_UI.js` | Integración del **menú `IA`** en `onOpen()`: *Abrir panel · Análisis rápido · Corregir errores · Configurar API*. |
| `src/00_Config.js` | Registro de `IAPanel` en `UICFG_DIALOGOS` (sidebar). |
| Script Properties | Almacenamiento de la **API key** (`GEMINI_API_KEY`), fuera del código fuente. |
| Hoja `LOG_IA` | Registro auditable de correcciones y ejecución de pruebas (se crea automáticamente si no existe). |

---

## 4. Capacidades

Solo capacidades presentes en el código (`src/28_IA.js`).

### 4.1 Conexión con Gemini API

- **`IA_llamarGemini(prompt, opts)`**: llamada HTTPS a la API con modelo
  `gemini-2.0-flash`, **retry/backoff exponencial** (`MAX_RETRIES: 3`,
  `TIMEOUT_MS: 30000`) y manejo del límite de peticiones (`429`). La API key se
  lee de Script Properties; si no está configurada, se informa el error de
  configuración sin fallar en silencio.

### 4.2 Análisis de datos

- **`IA_analizarHoja(hoja)` / `IA_analizarPacientes()` / `IA_analizarEventos()` /
  `IA_analizarCompleto()`**: envían a Gemini la **estructura y estadísticas**
  (filas, columnas, campos, vacíos, valores únicos) de las hojas para detectar
  problemas comunes de formato y consistencia. El prompt indica explícitamente
  trabajar con patrones, no con datos reales.
- **`IA_leerEstadisticas(hoja)` / `IA_leerColumna(hoja, nombre, max)`**: lecturas
  preparatorias de estructura/estadísticas.

### 4.3 Detección local (sin envío a la API)

- **`IA_detectarDuplicados()`**: construye un mapa de RUTs de PACIENTES
  **en memoria** y reporta coincidencias; **no envía** datos a la API. Los RUTs
  se presentan enmascarados (`'***'`). Máximo 20 duplicados en el detalle.
- **`IA_verificarIntegridadEventos()`**: detecta **eventos huérfanos** (evento
  sin paciente asociado) comparando `ID_INTERNO` entre EVENTOS y PACIENTES;
  también **100% local**, sin llamadas a la API. Detalle limitado a 50 registros.

### 4.4 Corrección / normalización asistida

Correcciones **deterministas** que reutilizan los normalizadores del sistema:

- **`IA_corregirRuts()`** — formato y dígito verificador vía `Norm_normalizarRut`.
- **`IA_corregirFechas()`** — unifica a ISO `yyyy-MM-dd` (`FECHA_NACIMIENTO`,
  `FECHA_INGRESO`).
- **`IA_corregirNombres()`** — mayúsculas y colapso de espacios.
- **`IA_corregirTelefonos()`** — formato estándar (prefijo país, guiones).
- **`IA_corregirSexo()`** — valores canónicos M/F/OTRO.
- **`IA_corregirTodo()`** — orquesta todas las anteriores y resume totales.

Cada rutina registra el cambio en `LOG_IA` (ver §6).

### 4.5 Interacción en lenguaje natural

- **`IA_procesarInstruccion(texto)`**: interpreta la intención del usuario y la
  traduce a una acción concreta (`analyse`, correcciones, duplicados,
  integridad, estadísticas), ejecuta la acción y devuelve el resultado.
- **`IA_chat(mensaje, historial)`**: chat multi-turno con historial.
- **`IA_ejecutarAccion(nombre, params)`**: despacho seguro por nombre de acción.

### 4.6 Pruebas y configuración

- **`IA_ejecutarTests()`**: ejecuta `Pruebas_ejecutarTodo` si está disponible
  (independiente de la API; sin key no debe fallar) y **registra el resultado**
  en `LOG_IA`.
- **`IA_analizarFallos(resultadoTests)`**: sugiere correcciones sobre resultados
  de pruebas usando Gemini (asistencia a desarrollo, no operación clínica).
- **`IA_configurar()` / `IA_guardarApiKey()` / `IA_verificarConfig()`**:
  configuración y verificación de la API key.
- **`IA_abrirPanel()`**: abre la sidebar `IAPanel`.

### 4.7 Helper estructural

- **`IA_columnaPorNombre(datos, nombre)`**: resuelve el índice de una columna por
  su **encabezado real** (nunca por posición fija). Ver §7.
- **`IA_parsearJSON(texto)`**: normaliza la respuesta de Gemini (limpia *markdown*
  code blocks) y la convierte en estructuras utilizables.

---

## 5. Privacidad y minimización de datos

El entorno es clínico-administrativo, por lo que el diseño de la integración
tiene un criterio explícito de reducción de exposición:

> **Diseñado con un enfoque de minimización de datos y reducción de exposición
> de información identificable.**

Principios efectivos implementados en el código:

- Las detecciones locales (**duplicados** e **integridad**) **no envían ningún
  dato a Gemini**: operan 100% en memoria con datos de la hoja.
- Las **correcciones** aplicadas por la IA son **deterministas** (normalizadores
  del sistema) y no dependen de la generación de contenido por el modelo.
- La API key se mantiene **fuera del código fuente**, en **Script Properties**
  (`GEMINI_API_KEY`), y nunca se escribe en hojas ni en documentación.
- El prompt de análisis pide explícitamente trabajar con patrones y no con
  valores reales.

**Riesgo residual documentado (pendiente de mejora):** `IA_leerEstadisticas`
recolecta hasta **3 valores de ejemplo por columna** que se incluyen en el
prompt de `IA_analizarHoja`. Si una hoja expone RUT, nombres o teléfonos en esas
columnas, esos ejemplos podrían alcanzar la API. La mitigación es marcar o
anonimizar los ejemplos de columnas sensibles. Este punto está registrado en los
pendientes (§9).

**Límite de esta sección:** este documento describe una **intención de diseño**.
No se afirma ni se documenta cumplimiento de HIPAA, GDPR, Ley 19.628 ni otra
norma: la verificación de cumplimiento normativo es responsabilidad de la
organización operadora y queda fuera del alcance de esta integración.

---

## 6. Auditoría y trazabilidad (`LOG_IA`)

Toda modificación de datos realizada por la capa de IA se registra en la hoja
**`LOG_IA`**, creada por `IA_registrarCambio` si no existe (encabezado en negrita
`FECHA · USUARIO · TIPO · CANTIDAD · DETALLE`).

Cada registro incluye:

- fecha/hora (zona del sistema);
- usuario activo (`Session.getActiveUser()`);
- tipo de cambio (RUTS, FECHAS, NOMBRES, TELEFONOS, SEXO, TESTS, …);
- cantidad de registros afectados;
- detalle de las primeras correcciones (muestra acotada).

Este registro hace que la IA **no sea una caja negra**:

```text
detección → propuesta/corrección → LOG_IA → revisión por la usuaria
```

El detalle se limita a una muestra (p. ej. primeras 10–20 correcciones) para no
duplicar el volumen de datos ni sobrecargar la hoja de auditoría.

---

## 7. Hallazgo y mejora de robustez estructural

Durante la puesta en marcha se detectó un **falso positivo masivo** en la
verificación de integridad: la función reportaba **18 605 problemas en 18 605
eventos** (100% de falsos positivos, todos los eventos "huérfanos").

**Causa raíz:** la función interpretaba **columnas por posición fija** en lugar
de usar su encabezado real:

- en `MODELO_PACIENTE`, `ID_INTERNO` está en la posición **0**;
- en `COLUMNAS_EVENTOS`, `ID_INTERNO` está en la posición **1** (la posición 2 es
  `RUT`).

Al comparar la columna equivocada (RUT) contra los IDs internos `EC-...`, ningún
evento coincidía y todos quedaban marcados como huérfanos.

**Corrección aplicada (mejora de robustez estructural):**

1. Se creó el helper **`IA_columnaPorNombre(datos, nombre)`** que resuelve el
   índice **por encabezado** y devuelve `-1` si la columna no existe.
2. `IA_verificarIntegridadEventos` usa resolución por nombre para `ID_INTERNO`.
3. `IA_detectarDuplicados` y `IA_corregirRuts` se migraron al mismo patrón
   (misma clase de riesgo).

**Regla resultante:** toda lectura de columna en el módulo de IA (y cualquier
módulo que lea layout de hojas) debe resolver las columnas por **encabezado**,
nunca por **índice fijo**, porque los layout pueden evolucionar.

Este hallazgo demuestra el ciclo de mantenimiento real del proyecto:
detección de anomalía → diagnóstico de causa raíz → corrección estructural →
regresión cubierta por reglas de trabajo (`DECISIONES.md`).

---

## 8. Limitaciones

Documentación honesta de las restricciones reales de la integración:

- **Dependencia de una API externa:** el análisis guiado y el chat requieren
  conectividad y disponibilidad del proveedor Google Gemini.
- **Límites y cuotas del proveedor:** según la documentación de implementación
  utilizada (comentario de cabecera del módulo), el tier gratuito es del orden de
  **~1 500 peticiones/día y 15 RPM**, con `maxOutputTokens` por request; estas
  cifras son referenciales del proveedor y no están garantizadas por el código.
- **Latencia:** cada llamada externa agrega tiempo de respuesta; el módulo
  gestiona esperas en reintentos (`429`).
- **Posibilidad de respuestas incorrectas:** el modelo puede producir resultados
  imperfectos; por eso el flujo es de **asistencia + revisión** y las
  transformaciones de datos usan normalizadores deterministas.
- **Necesidad de validación:** los hallazgos del análisis deben revisarse antes
  de actuar; el panel separa *analizar* de *corregir*.
- **Procesamiento por lotes:** existe el parámetro `IA_CONFIG.BATCH_SIZE` (50) y
  el módulo registra su configuración, pero las rutinas actuales procesan el
  bloque completo de una vez (`Utl_leerBloque` + `Utl_escribirBloque`). Para
  conjuntos muy grandes conviene revisar estrategias de lectura parcial antes de
  usar correcciones masivas.
- **No es autoridad clínica:** la IA no realiza diagnóstico ni reemplaza el
  criterio profesional; es asistencia técnica sobre estructura y calidad de
  datos.
- **Protección de información sensible:** el operador debe garantizar que no se
  introduzcan datos identificables en prompts de chat manuales; el diseño del
  módulo apunta a estructura y estadísticas (§5).

---

## 9. Pendientes de mejora

1. **Anonimizar/marcar ejemplos** de columnas sensibles en
   `IA_leerEstadisticas` antes de enviarlos a Gemini (§5).
2. **Unificar** la resolución de columnas: `IA_corregirFechas/Nombres/Telefonos/
   Sexo` aún resuelven sus columnas por iteración propia; migrarlas todas a
   `IA_columnaPorNombre` elimina el riesgo residual de la misma clase que el
   bug corregido (§7).
3. **Verificar en vivo** integridad y duplicados con datos reales (esperado:
   problemas reales ≪ 18 605; duplicados 0 es plausible porque la consolidación
   del pipeline ya deduplica por RUT).
4. **Confirmar cobertura** de `LOG_IA` en el instalador/reparador de hojas
   (hoy se crea automáticamente al primer cambio).
5. Re-evaluar **performance** del análisis sobre EVENTOS (~18 K filas) si se
   introduce uso masivo.

---

## 10. Validación

Baterías ejecutadas tras la integración (verdes):

| Batería (node) | Resultado |
|---|---|
| `tests/ejecutar_local.mjs` | **553/553** |
| `tests/contrato_datos.mjs` | **38/38** |
| `tests/aceptacion_formulario.mjs` | **50/50** |
| `tests/contrato_captura_v2.mjs` | verificado |
| `tests/captura_ui_payload_v2.mjs` | **19/19** |
| `tests/captura_backend_v2.mjs` | **68/68** |
| `tests/cola_form_respuestas.mjs` | **33/33** |
| `tests/formulario_web.mjs` | **27/27** |
| `tests/validar_html.mjs` | **18/18** (incluye `IAPanel.html`) |

---

## 11. Configuración

La API key **no está en el código** ni en este documento. Para activarla:

1. Obtener una clave gratuita en <https://aistudio.google.com/apikey>.
2. Menú **`IA` → Abrir panel** → campo *Guardar API key* (o usar
   `IA_configurar` desde el menú).
3. La clave se guarda en **Script Properties** del proyecto
   (`GEMINI_API_KEY`) mediante `IA_guardarApiKey`.

El panel indica visualmente si la API está configurada. Sin clave, las funciones
que requieren Gemini informan el error de configuración; las detecciones locales
(duplicados, integridad) no dependen de ella.