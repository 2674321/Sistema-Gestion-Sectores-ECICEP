# CONTRATO ÚNICO DE DATOS — ECICEP (FASE S1)

> **NORMATIVO.** Única fuente del **contrato de datos y límites de persistencia** del sistema.
> Complementa `AGENTS.md` y, en materia de captura, se subordina a `docs/CONTRATO_CAPTURA_V2.md`
> (normativo, única fuente del contrato de captura V2).
>
> **Fecha:** 2026-09-06 · **Fase:** S1 del PROMPT MAESTRO de estabilización funcional.
>
> Redacción mínima y reversible (REGLA 1 de S1): **no** introduce refactor masivo; fija los
> invariantes de persistencia, documenta el flujo real y cierra el defecto crítico S0-PF0.
> Cualquier modificación futura de estos invariantes debe pasar por este documento.

---

## A. Carácter y alcance

| Aspecto | Regla |
|---|---|
| Fuente normativa de captura | `docs/CONTRATO_CAPTURA_V2.md` (V2); este documento no se superpone |
| Fuente normativa de datos | **Este documento** (`CONTRATO_DATOS.md`) |
| Autoridad del esquema físico | `00_Config.js` (columnas, layouts, constantes) |
| Canal operativo de captura | Web App (`CapturaWeb.html` → `WebApp_capturarEnviar`) — único canal |
| Procesadores | **Dos**: pipeline legacy de Forms (`24_Formulario.js`) y procesador V2 (`26_Captura.js`). Comparten el mismo esquema físico de `FORM_RESPUESTAS` pero **jamás** procesan filas del otro namespace |

Este contrato define, en un único lugar: (1) la regla de fila física de cada hoja, (2) el mapa
campo a campo, (3) la conversión índice→fila única, (4) la separación de namespaces de la cola
de captura, (5) la retoma administrativa V2, y (6) la separación captureId/identidad clínica.

---

## B. La hoja es autoritativa — regla de fila física (C1)

**Toda escritura en una hoja usa la fila física derivada del layout real de esa hoja**, nunca
aritmética asumida:

```text
fila física = Modelo_dataStartRow(nombreHoja) + índiceDeDatos
            = Modelo_filaFisica(nombreHoja, índiceDeDatos)   // 06_Modelo.js:513-515
```

`Modelo_dataStartRow` proviene de `Modelo_layoutHoja(nombreHoja).datosDesdeRow`
(`06_Modelo.js:507-510`), alimentado por la configuración (`CONTRATO_LAYOUT_VISUAL`,
`LAYOUT_HOJAS_VISUALES`, `00_Config.js`).

| Hoja | `datosDesdeRow` | Inicio físico | Notas |
|---|---|---|---|
| `PACIENTES` | **4** | fila 4 | layout visual (fila 1 barra, fila 2 buscador, fila 3 encabezados) |
| `EVENTOS` | **2** | fila 2 | layout simple (encabezados fila 1) — append-only vía `Modelo_agregarEventos` |
| `FORM_RESPUESTAS` | **1** | fila 1 | layout simple; encabezados son la fila 1 (**datos no hay antes de fila 2**) |
| `INGRESO_<SECTOR>` | **4** | fila 4 | layout visual; anexo con `appendRow` |

**Prohibido (B.1):** escribir con la aritmética del layout simple de la era pre-DEC-043
(encabezados en fila 1). El patrón `getRange(2 + idx, …)` sobre `PACIENTES` quedó **eliminado**
en S1 (ver D). Un reintroducirse se considera regresión (test `R1`).

**Verificación (C2):** ninguna escritura de paciente puede ocurrir por debajo de la primera
fila de datos (`Modelo_dataStartRow(PACIENTES)`).

---

## C. Mapa campo a campo (C1/C5/C7)

### C.1 `FORM_RESPUESTAS` — cola de captura (esquema único, 26 columnas)

Definición: `00_Config.js:849-851` = `FECHA_FORMS, RESPONSE_ID, FORM_VERSION, USUARIO` +
`FORM_CONFIG.CAMPOS` + `TRAZA_CRUDA, INGRESO_HOJA, INGRESO_FILA, REINTENTOS, ESTADO, MOTIVO,
ID_INTERNO, ID_EVENTO, FECHA_PROCESO, FECHA_INGRESO`.

| Campo | Tipo | Fuente | Carácter | Escritor / Lector |
|---|---|---|---|---|
| `RESPONSE_ID` | string | cliente (V2: `Cp2-`+32 hex; legacy: `UI-…`) | **CANÓNICO (namespace)** | V2 persistencia / ambos procesadores |
| `FORM_VERSION` | string | backend (V2=2, `CAPTURE_CONTRACT_VERSION`) | **CANÓNICO (separador de namespace)** | V2 persistencia / `Form_filasPendientes` |
| `FECHA_FORMS` | string ISO+hora | backend | CANÓNICO | V2 persistencia |
| `USUARIO` | string | sesión GAS | CANÓNICO | V2 persistencia |
| `ACCION`..`PROFESIONAL2` | según §6 | del payload normalizado (TR-1) | CANÓNICO (copia) | V2 persistencia / lectura |
| `TRAZA_CRUDA` | JSON string | backend (payload normalizado) | **CANÓNICO (permite retoma V2)** | V2 persistencia / `Captura_v2_buscarRegistro` |
| `INGRESO_HOJA`/`INGRESO_FILA` | string | resultado de entrega | CANÓNICO | trailer V2 / legacy |
| `REINTENTOS` | number | contador por envío | CANÓNICO (por namespace) | V2 y legacy (contadores separados por filtro de namespace) |
| `ESTADO`/`MOTIVO`/`ID_INTERNO`/`ID_EVENTO`/`FECHA_PROCESO` | string | trailer de entrega | CANÓNICO | V2 / legacy |
| `FECHA_INGRESO` | string ISO | del payload normalizado (TR-1) | CANÓNICO (copia; se escribe en el persistir, no en el trailer) | V2 persistencia / `Captura_v2_buscarRegistro` |

`FECHA_INGRESO` se añadió en **S2** como 26.ª columna (última del esquema; cierre de S0-PF5).
`persistirRegistro` la escribe una vez en el persistir desde `internos.FECHA_INGRESO`; el trailer
(`INGRESO_HOJA`…`FECHA_PROCESO`) no la modifica. `Captura_v2_buscarRegistro` la relee como
`fechaIngreso`. No cambia el orden de las 25 columnas previas: es adición **al final**, segura
ante layout visual en la hoja operativa (realineación por encabezado en `Form_instalar`).

### C.2 `PACIENTES` — bloque de datos (fila 4 en adelante)

| Campo | Tipo | Carácter | Escritor |
|---|---|---|---|
| `ID_INTERNO`, `RUT`, `NOMBRE`, `SEXO`, `FECHA_NACIMIENTO`, `SECTOR`, `ESTRATIFICACION`, `CONDICIONES`, `OTRAS_PATOLOGIAS`, `DUPLA_INGRESO`, `ULTIMO_CONTROL`, `ULTIMO_SEGUIMIENTO`, `PROXIMO_CONTROL`, `TELEFONOS`, … | según `MODELO_PACIENTE` | CANÓNICO | pipeline de ingresos, `Form_actualizarDatosPaciente`, y los endpoints de la tabla D (todos por `Modelo_filaFisica`) |

`Modelo_leerPacientes()` devuelve **solo el bloque de datos** (índice 0 ↔ fila física
`Modelo_dataStartRow(PACIENTES)`), `06_Modelo.js:1094-1110`.

### C.3 `EVENTOS` — append-only

| Campo | Carácter |
|---|---|
| `ID_INTERNO`, `RUT`, `NOMBRE`, `FECHA_EVENTO`, `TIPO_EVENTO`, `SECTOR`, `RIESGO_G`, `PROFESIONAL`, `PROFESIONAL_TIPO`, `DESCRIPCION`, `CANTIDAD`, `OBSERVACIONES`, `FUENTE` (marca `FORM|<id>|ACCION`), `REGISTRADO_POR`, `FECHA_REGISTRO` | CANÓNICO. `Modelo_agregarEventos` (append-only, `06_Modelo.js:1172`) |

`FUENTE` es **trazabilidad de canal**: la marca del envío (`Captura_v2_marca`), no la identidad clínica (ver G).

---

## D. Conversión índice→fila única y sitios de escritura (C3/C4 — cierra S0-PF0)

La conversión autoritativa es **una sola**: `Modelo_filaFisica(nombreHoja, idx)`. S1 corrige los
5 sitios que conservaban `2 + idx` (aritmética del layout simple; con el layout visual vigente
escribían en la fila 2 = fila del **buscador** y desalineaban todo paciente en −2):

| Sitio | Función | Antes (S0) | Ahora (S1) |
|---|---|---|---|
| `07_UI.js:514` | `api_duplaGuardar` | `getRange(2 + idx, colDupla)` | `getRange(Modelo_filaFisica(PACIENTES, idx), colDupla)` |
| `07_UI.js:926` | `api_controlActualizarUltimo` | `getRange(2 + idx, …)` | `getRange(Modelo_filaFisica(PACIENTES, idx), …)` |
| `07_UI.js:1229` | `api_registrarEvento` **(ruta de entrega V2)** | `getRange(2 + idx, …)` | `getRange(Modelo_filaFisica(PACIENTES, idx), …)` |
| `07_UI.js:1618,1628` | `api_patologiasGuardar` | `getRange(2 + idx, …)` ×2 | `getRange(Modelo_filaFisica(PACIENTES, idx), …)` ×2 |
| `02_Normalizacion.js:551` | `Estrat_recalcularPaciente` | `getRange(2 + idx, …)` | `getRange(Modelo_filaFisica(PACIENTES, idx), …)` |

Referencia que ya era correcta y permanece intacta: `24_Formulario.js:1696`
(`Modelo_dataStartRow(PACIENTES) + idx` en `Form_actualizarDatosPaciente`); escrituras masivas
`02_Normalizacion.js:582`, `16_Amarillo.js:289-294`, `06_Modelo.js:736`, `17_Hojas.js:60` ya
usaban `dataStartRow`.

Efecto colateral esperado (documentado): el comportamiento **vivo** de estos endpoints cambia de
fila (de `2+idx` a `4+idx`); con el layout visual este cambio es el **fix** — la fila 2 nunca
debió recibir datos de paciente.

---

## E. Namespaces de la cola compartida `FORM_RESPUESTAS` (C5 — cierra S0-PF1)

`FORM_RESPUESTAS` es **una cola física compartida** con dos namespaces distinguibles:

| Namespace | `RESPONSE_ID` | `FORM_VERSION` | Procesador propietario |
|---|---|---|---|
| Captura V2 (vigente) | `Cp2-` + 32 hex | `2` | **`26_Captura.js`** (procesador V2) |
| WebApp/Form legacy | `UI-…` | `1` (o vacío) | `24_Formulario.js` (pipeline legacy) |
| Forms histórico (inactivo) | id de Forms | `1` (o vacío) | legacy (no se reactiva) |

**Regla de procesamiento (E.1):** un procesador **nunca** toma filas del otro namespace.

Implementación en S1 (`24_Formulario.js`):
- `Form_filasPendientes` (líneas 646+): excluye filas con `FORM_VERSION === '2'` **o**
  `RESPONSE_ID` con prefijo `Cp2-`. El pipeline legacy del panel ya no puede barrer filas V2.
- `Form_reiniciarRespuesta`: rechaza respuestas del namespace V2
  (`NAMESPACE_V2_USA_PROCESADOR_V2`); su retoma pertenece al procesador V2 (sección F).

La fila física de anexo legacy (`getLastRow()+1`) y V2 (`getLastRow()+1`) coexistía sin
conflicto de fila (ambas dependen del layout simple de `FORM_RESPUESTAS`); el riesgo era el
**procesamiento cruzado**, hoy eliminado por E.1. Los `REINTENTOS` siguen siendo contadores
por fila/namespace (ya no comparten semántica por el filtro).

---

## F. Retoma administrativa V2 (C6 — cierra S0-PF2)

**Meta de contrato:** `PENDIENTE V2 → PROCESADOR V2`. Un pendiente V2 (no terminal) se retoma
**exclusivamente** con el procesador V2, jamás con el pipeline legacy.

### F.1 Flujo vigente

| Etapa | Ruta |
|---|---|
| Captura | `CapturaWeb.html → WebApp_capturarEnviar → Captura_v2_enviar` |
| Persistencia durable | `Captura_v2_persistirRegistro` → fila `RECIBIDO` (RESPONSE_ID, FORM_VERSION=2, TRAZA_CRUDA) |
| Entrega | `Captura_v2_ejecutarEntrega` (acotada a la fila del envío) → trailer `ESTADO/…` |
| Estados | `RECIBIDO · VALIDANDO · VALIDO · PROCESADO · REQUIERE_REVISION · ERROR` (§18) |
| Reintento técnico | reenvío del mismo `captureId` (caso A2 §13, `26_Captura.js:452-477`) |
| Reproceso admin (reset) | `Captura_v2_reprocesar` (§23): reinicia estados no terminales a `VALIDANDO` |
| **Retoma V2 (S1, nuevo)** | `Captura_v2_retomarRegistro(captureId, ctx)` → re-entrega con el **motor V2** |
| Entrypoint | `WebApp_capturarRetomar({ captureId })` (Web App / panel) |

### F.2 `Captura_v2_retomarRegistro` — reglas

- **Retomables:** `RECIBIDO`, `VALIDANDO`, `VALIDO`, `ERROR` (`CAPTURA_V2_RETOMABLES`).
- **Bloqueados:** `PROCESADO` (terminal, §18) y `REQUIERE_REVISION` (decisión humana; no se
  auto-retoma).
- **Requisito:** payload normalizado almacenado en `TRAZA_CRUDA` (`reg.normalizado`). Sin él,
  rechazo explícito (no se inventa payload).
- **Mecánica:** idéntica a A2 del contrato — `trailer → VALIDANDO` (motivo `RETOMA_ADMIN`),
  re-entrega vía `c.entregar` con las protecciones de idempotencia del contrato (marcas §22,
  coordenadas), trailer final por `Captura_v2_ejecutarEntrega`, respuesta §16/§17.
- **Sintaxis:** `captureId` debe cumplir §12 (`SINTAXIS_INVALIDA` en otro caso).
- **Seguridad de nombres:** la ubicación es `26_Captura.js`; la retoma de una fila `Cp2-` vía
  legacy está bloqueada por la sección E.

Esto **elimina la dependencia del motor legacy para recuperar envíos V2** (S0-PF2) y alinea la
recuperación con el contrato V2. La funcionalidad de Borrado de la cola confiable (S2) sigue
pendiente por fase.

---

## G. `captureId` ≠ identidad clínica (C7)

| Concepto | Identidad |
|---|---|
| Clínica | `RUT` (exacto) + `ID_INTERNO` (asignado por el pipeline) en `PACIENTES`/`EVENTOS` |
| Transporte/idempotencia | `captureId` (`Cp2-`+32 hex) en `FORM_RESPUESTAS.RESPONSE_ID` |

Reglas:
- `ID_INTERNO` **nunca** hereda el `captureId` ni su prefijo (`Cp2-`); la identidad clínica es
  independiente del canal de transporte.
- La deduplicación clínica la decide el **pipeline** (barrera RUT / marcas §22), no el `captureId`.
- `FUENTE` de eventos = marca del envío (`Captura_v2_marca`), trazabilidad del canal; no se usa
  como llave clínica.

---

## H. Regla de evolución de esquemas (S1.3/H)

1. Una migración de columnas/layout de una hoja altera `Modelo_layoutHoja` + config en **una
   única operación** y su correspondiente plan de esquema (`Modelo_planMigracionEsquema`),
   nunca fila por fila desde los callers.
2. Los callers **nunca** vuelven a la aritmética manual de filas: usan `Modelo_filaFisica`.
3. Todo cambio de contrato de datos exige las pruebas **C1–C7** + **R1/R2** verdes y la
   actualización de este documento.
4. No se crean columnas a medias: si una fase S posterior (p. ej. S2) añade `FECHA_INGRESO`
   como columna física o un separador físico de namespace, la decisión se documenta aquí antes
   de tocar `FORM_RESPUESTAS_COLUMNAS`.

---

## I. Divergencias documentales corregidas en S1

| Documento | Antes (S0) | Después (S1) |
|---|---|---|
| `src/WebApp.gs` (cabecera, flujo) | describía `Form_capturarDesdeUI` como flujo | describe el canal V2 (`WebApp_capturarEnviar`) y declara el puente legacy como compatibilidad sin consumidor en la UI |
| `PENDIENTES.md #29` | afirmaba "UI/Web App V2 pendiente de implementar" | confirmaba UI V2 operativa (100% `CapturaWeb.html`) + retoma V2 en S1 |
| `ARQUITECTURA.md §versión canónica` | build `e5d540c` (2026-09-02) anterior a módulos V2/layout visual | referencia a `00_Config.ECICEP.VERSION` como única fuente, sin fijar un build desactualizado |

---

## J. Estado de cumplimiento y pruebas

| Test | Qué verifica | Estado |
|---|---|---|
| **C1** | `dataStartRow` coincide con el layout real de cada hoja | ✅ `tests/contrato_datos.mjs` |
| **C2** | ninguna escritura de PACIENTES bajo la primera fila de datos | ✅ idem |
| **C3** | conversión índice→fila única y lineal vía `Modelo_filaFisica` | ✅ idem |
| **C4** | los 5 endpoints de escritura usan la misma convención | ✅ idem (conductual con hoja simulada) |
| **C5** | fila V2 no aparece pendiente para el legacy; `Form_reiniciarRespuesta` la rechaza | ✅ idem |
| **C6** | pendiente V2 retomado por su procesador V2; bloqueos PROCESADO/REVISION; sintaxis §12 | ✅ idem |
| **C7** | `captureId` ≠ identidad clínica (RUT/ID_INTERNO) | ✅ idem |
| **R1** | regresión estática: no persiste `getRange(2 + idx` en el código | ✅ idem |
| **R2** | regresión conductual: `actualizarDatos`→`api_registrarEvento` escribe fila física correcta | ✅ idem (C4) |

Batería completa en S2: núcleo 469/469 · contrato V2 36/36 · aceptación 50/50 · backend V2
65/65 · UI payload 16/16 · contrato de datos 20/20 · **cola FORM_RESPUESTAS (S2) 33/33
(Q1–Q13)** = **689 tests / 0 fallos**. Validación en vivo pendiente de E2E (sesión Google
`pvc.devno@gmail.com` en el perfil Brave de la máquina).

Tras S2 quedan abiertos: S0-PF6 (marca `|NUEVO_INGRESO` vs `|INGRESO`) → S6; índice / early-exit
por prefijo de `RESPONSE_ID` (O(n)→O(1) en envíos nuevos) → fase posterior a S2; S0-PF8/PF9 (UI
y exposición) → S3/S8/S9.