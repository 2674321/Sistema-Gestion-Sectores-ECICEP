# AUDITORÍA DE ESTABILIZACIÓN FUNCIONAL — ECICEP

> Fase S0 del PROMPT MAESTRO de estabilización funcional. **Documento de solo lectura.**
> No se modificó ni se ejecutó ningún código con efectos de estado.
>
> **Fecha:** 2026-09-06 · **Método:** 3 agentes de exploración + verificación manual línea a línea de cada hallazgo crítico contra el código y el contrato (AGENTS.md, ARQUITECTURA.md, docs/CONTRATO_CAPTURA_V2.md, DECISIONES.md, 00_Config.js, 10_Pruebas.js).
>
> **Estado de verificación:** todos los hallazgos están verificados a nivel de **código** (archivo:línea). Las verificaciones sobre la hoja **viva** quedan pendientes de E2E (bloqueado por sesión Google ausente en el perfil Brave de la máquina).
>
> Este informe compara el **flujo declarado** (documentación) contra el **flujo real** (código) y entrega: flujo real actual, tabla de campos, puntos de fallo, riesgos y diagnóstico ejecutivo. Es la base para la secuencia S1→S9: **no corrige nada por sí mismo**.
>
> **Nota de evolución:** las secciones 1–5 corresponden al entregable S0 (contenido preservado).
> Desde **S1** este documento acumula la resolución por fase: la sección 6 registra la
> resolución de S0-PF0/PF1/PF2 y el contrato único de datos (`CONTRATO_DATOS.md`).

---

## 1. FLUJO REAL ACTUAL

### 1.1 Canal operativo vigente (verificado): Captura V2 → FORM_RESPUESTAS → entrega acotada

```
CapturaWeb.html (UI, único canal)
  └─ recolectar() [CapturaWeb.html:753] → construirPayloadV2(estado) [CapturaWeb.html:727]   (camelCase, §6)
  └─ (1ª RPC) WebApp_previaDuplicadosV2(datos) [CapturaWeb.html:997 → 26_Captura.js:1216 → 1168]
  └─ (2ª RPC) WebApp_capturarEnviar(datos)     [CapturaWeb.html:940 → 26_Captura.js:1144]
       └─ Captura_v2_enviar(payload, ctx)       [26_Captura.js:419]
            1. Captura_v2_validar (capas §14, orden §17)              [26_Captura.js:190-351]
            2. canonica = Captura_v2_canonica                         [26_Captura.js:435 → 159]
            3. Captura_v2_leerSeguro (idempotencia A1/A2/B)           [26_Captura.js:438-483 → 612]
            4. Captura_v2_persistirRegistro → fila RECIBIDO
               en FORM_RESPUESTAS (RESPONSE_ID=Cp2-<32hex>, FORM_VERSION=2,
               TRAZA_CRUDA JSON camelCase)                            [26_Captura.js:486-489 → 742-771]
               → confirmación por relectura (getLastRow)              [26_Captura.js:774-788]
            5. Captura_v2_ejecutarEntrega (acotado a la fila actual)  [26_Captura.js:504 → 646-683]
               ├─ nuevoIngreso → INGRESO_<SECTOR>.appendRow(marca
               │   FORM|<id>|NUEVO_INGRESO) + Ingresos_procesarTodasLasHojas
               │   {soloHojas, soloFilas}                             [26_Captura.js:943-1017, 973, 979-986]
               └─ registrarControl/registrarSeguimiento/actualizarDatos
                  → api_registrarEvento(EVENTOS, marca FORM|<id>|ACCION)
                  → actualizarDatos además Form_actualizarDatosPaciente
                    (PACIENTES primero) + evento OTRO con fecha de operación
                    del backend (nunca del payload)                    [26_Captura.js:1041-1114, 1054-1075]
            6. trailer ESTADO/MOTIVO/ID_INTERNO/ID_EVENTO/...          [26_Captura.js:662-670 → 791-827]
            7. respuesta §16 (ok/data) o §17 (ok/errors)               [26_Captura.js:509 → 581-609]
```

Claves del flujo real:

| Hecho | Evidencia |
|---|---|
| El frontend **no** invoca `Form_capturarDesdeUI`; su único canal es V2 (`WebApp_capturarEnviar`) | `CapturaWeb.html:940`, `:1018`; `WebApp.gs:64` (puente sin uso en HTML) |
| El captureId es **`Cp2-` + 32 hex minúsculas** (base fija de sesión de 16 hex + 16 hex por firma) | `CapturaWeb.html:651-670`; validación backend idéntica `26_Captura.js:52,198-201` |
| La firma de idempotencia cliente = concatenación `\u0001` de 13 valores del estado; el mismo contenido reutiliza el mismo captureId | `CapturaWeb.html:769-773` |
| El envío real **jamás procesa lote**: solo la fila del envío actual | `26_Captura.js:979-986` (única mención de `Form_procesarPendientes` en `26_Captura.js` es un comentario, línea 12) |
| La persistencia ocurre **antes** de los efectos (durabilidad §15.2) | `26_Captura.js:486-504` |
| `actualizarDatos`: PACIENTES se actualiza primero (correcto: `Modelo_dataStartRow(PACIENTES)+idx`, `24_Formulario.js:1696`) y el evento OTRO usa fecha de operación del backend | `26_Captura.js:1061,1066-1075`; `24_Formulario.js:1673-1702` |

### 1.2 Canal legacy (presente, desplegado, pero NO usado por la UI)

`Form_capturarDesdeUI` sigue vivo en `WebApp.gs:64-220` (escribe filas `UI-<ts>-<rand>` en `FORM_RESPUESTAS` y dispara `Form_procesarPendientes({max:200})` — barrido de lote, `WebApp.gs:141,157`). Exposición residual:

- `api_webappCapturar` (alias legacy) `WebApp.gs:364`
- `WebApp_previaDuplicados` (versión legacy) `WebApp.gs:295`
- `UI_buscarEnvioReciente` / `UI_lecturaEstadoRespuesta` (vigencias legacy) `WebApp.gs:227, 257`
- `Form_procesarPendientes` / `Form_reprocesar`(lote) / `api_formularioProcesar` / `api_formularioReprocesar` `24_Formulario.js` (barrido por ESTADO sin filtrar prefijo de RESPONSE_ID, `24_Formulario.js:642-675`)

El backend legacy **no distingue espacio de identidad**: `Form_filasPendientes` selecciona por `ESTADO`/`REINTENTOS`, sin filtrar `Cp2-` vs `UI-` (`24_Formulario.js:642-675`).

### 1.3 Flujo declarado (docs) vs flujo real (código) — divergencias de documentación

| Docs dicen | Código real | Severidad |
|---|---|---|
| `WebApp.gs:7-10` describe flujo `→ Form_capturarDesdeUI(datos)` | La Web App usa `WebApp_capturarEnviar` (V2) | Documental (BAJA) |
| `PENDIENTES.md #29` dice que la UI V2 está pendiente de implementar | `CapturaWeb.html` ya invoca `WebApp_capturarEnviar` y `WebApp_previaDuplicadosV2` | Documental (BAJA) |
| `ARQUITECTURA.md:102` versión canónica `0.9.3` / build `e5d540c` | El código contiene módulos posteriores (26_Captura.js, contrato V2, layout visual) | Documental (BAJA) |
| `FORMULARIO.md` y `docs/CONTRATOS.md` = contratos invalidadas | Coherente: `docs/CONTRATO_CAPTURA_V2.md` es la fuente normativa | Correcto |
| `AGENTS.md` regla "un único entorno" (DEC-052) | `25_Entorno.js` conserva estrategia DEV/DEMO histórica como referencia; sin lógica `if(DEV)` activa | Correcto (histórico) |

---

## 2. TABLA DE CAMPOS (UI → payload → persistencia → modelo)

### 2.1 Documentos (24/25 columnas de FORM_RESPUESTAS — esquema físico único)

Definición compartida legacy+V2: `00_Config.js:849-851` (`FORM_RESPUESTAS_COLUMNAS`): `FECHA_FORMS, RESPONSE_ID, FORM_VERSION, USUARIO` + `FORM_CONFIG.CAMPOS` + `TRAZA_CRUDA, INGRESO_HOJA, INGRESO_FILA, REINTENTOS, ESTADO, MOTIVO, ID_INTERNO, ID_EVENTO, FECHA_PROCESO`.

### 2.2 Mapeo UI → payload V2 → columna física

| Input HTML (id) | Clave payload V2 (camelCase) | Fila física FORM_RESPUESTAS | Generación/línea |
|---|---|---|---|
| (radio `accion`) | `accion` | `ACCION` (legacy: `NUEVO_INGRESO`…) | `CapturaWeb.html:646-648`; TR-1 `26_Captura.js:367` |
| (generado, sin input) | `captureId` (`Cp2-`+32hex) | `RESPONSE_ID` | `CapturaWeb.html:663-670`; `26_Captura.js:752` |
| `rut` | `rut` (REQ) | `RUT` | `CapturaWeb.html:730`; `26_Captura.js:368` |
| `nombre` | `nombre` (REQ) | `NOMBRE` | `CapturaWeb.html:732`; `26_Captura.js:369` |
| `sexo` | `sexo` (OPC) | `SEXO` | `CapturaWeb.html:733`; `26_Captura.js:370` |
| `fnac` | `fechaNacimiento` (REQ) | `FECHA_NACIMIENTO` | `CapturaWeb.html:734`; `26_Captura.js:371` |
| `sector` | `sector` (REQ) | `SECTOR` | `CapturaWeb.html:735`; `26_Captura.js:372` |
| `fingreso` | `fechaIngreso` (REQ, **no persiste en la hoja**: solo TRAZA_CRUDA + fila INGRESO) | `FECHA_INGRESO` **no existe** como columna | `CapturaWeb.html:736`; `26_Captura.js:373`; `00_Config.js:772-791` |
| `estrat` | `estratificacion` (OPC) | `ESTRATIFICACION` | `CapturaWeb.html:737`; `26_Captura.js:374` |
| `telefonos` | `telefonos` (OPC) | `TELEFONOS` | `CapturaWeb.html:738,743`; `26_Captura.js:375` |
| `fecha_evento` | `fechaEvento` (REQ control/seguimiento; NP actualizarDatos) | `FECHA_EVENTO` | `CapturaWeb.html:740-741`; `26_Captura.js:376` |
| `profesional` | `profesional` (REQ) | `PROFESIONAL` | `CapturaWeb.html:745`; `26_Captura.js:377` |
| `profesional2` | `profesionalSecundario` (OPC) | `PROFESIONAL2` | `CapturaWeb.html:746`; `26_Captura.js:378` |
| `obs` | `observaciones` (OPC) | `OBSERVACIONES` | `CapturaWeb.html:747`; `26_Captura.js:379` |
| (flag interno) | `confirmarNuevoPaciente` (solo true tras duplicado) | no se persiste en la fila; va al pipeline | `CapturaWeb.html:739,929`; `26_Captura.js:985` |
| — | `TRAZA_CRUDA` = `JSON.stringify(normalizado)` camelCase | `TRAZA_CRUDA` | `26_Captura.js:760` |
| — | `FORM_VERSION` = 2 (`CAPTURE_CONTRACT_VERSION`) | `FORM_VERSION` | `26_Captura.js:753`; `00_Config.js:751` |
| trailer | `INGRESO_HOJA…FECHA_PROCESO` | trailer por encabezado | `26_Captura.js:791-827` |

### 2.3 Espacios de identidad (RESPONSE_ID) coexistiendo en la MISMA hoja

| Origen | Formato RESPONSE_ID | FORM_VERSION | TRAZA_CRUDA |
|---|---|---|---|
| Captura V2 (vigente) | `Cp2-<32hex>` | 2 | JSON camelCase |
| WebApp legacy (`Form_capturarDesdeUI`) | `UI-<ts>-<rand>` | 1 | JSON UPPERCASE |
| (histórico inactivo) | id de Google Forms | 1 | — |

No hay separador físico; solo `FORM_VERSION` y el prefijo los distinguen. (Detalle: `Form_capturarDesdeUI` usa `getRange(hoja.getLastRow()+1,…)` — la fila física legacy se apoya en el layout simple de `FORM_RESPUESTAS`, correcto; el V2 usa `getLastRow()+1`, también correcto — ambos robustos a layout.)

### 2.4 Modelo de salida

- **PACIENTES**: bloque de datos desde `Modelo_dataStartRow(PACIENTES)=4` (layout visual: fila 1 barra, fila 2 buscador, fila 3 encabezados — DEC-043/`CONTRATO_LAYOUT_VISUAL` `00_Config.js:146`, `LAYOUT_HOJAS_VISUALES=[PACIENTES]` `00_Config.js:153`). Columnas alineadas a `MODELO_PACIENTE`.
- **EVENTOS**: layout simple (`Modelo_dataStartRow(EVENTOS)=2`), añadido por `Modelo_agregarEventos`.
- **INGRESO_<SECTOR>**: layout visual (`Modelo_dataStartRow=4`); anexo con `appendRow`.

---

## 3. PUNTOS DE FALLO (verificados en código)

S0=HALLAZGO CRÍTICO · A=ALTO · M=MEDIO · B=BAJO (todos verificados a nivel de código; la confirmación viva requiere el E2E pendiente).

### S0-PF0 (CRÍTICO) — Escrituras directas a PACIENTES con fila `2 + idx` (desalineación −2)

`Modelo_leerPacientes()` devuelve **solo el bloque de datos** (índice 0 ↔ fila física 4) — `06_Modelo.js:1094-1110` — y `Modelo_dataStartRow(PACIENTES)=4` (`10_Pruebas.js:3131-3139`, `CONTRATO_LAYOUT_VISUAL`). Cinco sitios escriben en `2 + idx` en vez de `Modelo_dataStartRow(PACIENTES) + idx`:

| Función contenedora | Línea | Efecto con el contrato vigente |
|---|---|---|
| `api_duplaGuardar` (`07_UI.js:500`) | `07_UI.js:514` | `idx=0` → escribe en fila 2 (fila del **buscador**); todo paciente desalineado −2 |
| `api_controlActualizarUltimo` (Panel de Control, `07_UI.js:885`) | `07_UI.js:926` | idem |
| `api_registrarEvento` (ficha **y ruta de entrega V2**, `07_UI.js:1188`) | `07_UI.js:1229` | idem |
| `api_patologias` guardar (`07_UI.js` ~1580) | `07_UI.js:1618,1628` | idem |
| `Estrat_recalcularPaciente` (`02_Normalizacion.js:533`) | `02_Normalizacion.js:551` | idem |

Impacto en la captura V2: `actualizarDatos`, `registrarControl` y `registrarSeguimiento` terminan en `api_registrarEvento` (`26_Captura.js:1066,1090`): `actualizarDatos` escribe bien PACIENTES (vía `Form_actualizarDatosPaciente`, `24_Formulario.js:1696`) y **después** `api_registrarEvento` vuelve a escribir la fila completa en `2+idx`. El evento ya quedó registrado; el desalineamiento **sobrescribe la fila del paciente `idx-2`** (o la fila 2/3 para `idx≤1`).

Causa probable: estos sitios conservan la aritmética de la era del layout SIMPLE (`2+idx` era correcto con encabezados en fila 1); la migración al layout visual (DEC-043) no los actualizó. Deuda no cubierta por los tests porque son funciones con capa GAS (la batería `.mjs` las sustituye/stub o no las ejercita).

**Verificación recomendada (fase siguiente):** comprobar en la hoja viva el layout real de PACIENTES (encabezados en fila 3) y, en cuanto el E2E pueda correr, registrar un CONTROL/SEGUIMIENTO y contrastar la fila escrita.

### S0-PF1 (ALTO) — Reprocesamiento cruzado legacy sobre filas V2

`Form_filasPendientes` selecciona por `ESTADO`/`REINTENTOS` **sin filtrar** prefijo de `RESPONSE_ID` (`24_Formulario.js:642-675`). Una fila V2 en `RECIBIDO`/`VALIDANDO`/`ERROR(<3)` — p. ej. tras crash entre persistir y entregar (ventana §15.3) — puede ser barrida y procesada con **semántica legacy** cuando el panel ejecute `Form_procesarAhora`/`api_formularioReprocesar`/`Form_capturarDesdeUI` (`24_Formulario.js:1665-1666,1719-1721`; `WebApp.gs:157`): `fechaIngreso=hoy`, marcas `|INGRESO` (distintas a las V2 `|NUEVO_INGRESO`), doble contabilidad de `REINTENTOS` cruzada (`24_Formulario.js:656-657` comparte contador con V2).

Mitigación parcial existente: barrera `(RUT, FECHA_INGRESO)` en `Ingresos_procesarTodasLasHojas` (`12_Ingresos.js:487-497`) evita doble paciente, pero no doble fila en INGRESO; y la compatibilidad de marcas en EVENTOS es interoperable (`Form_leerMarcas` prefi jo `FORM|`, `24_Formulario.js:1166`).

### S0-PF2 (ALTO) — Recuperación de envíos V2 depende del motor legacy

V2 no barre lote (por contrato §28, `Form_procesarPendientes` "fuera del contrato"). Un envío V2 interrumpido entre persistir y entregar queda `RECIBIDO` y solo puede retomarse por: (a) reenvío del mismo `captureId` (caso A2, `26_Captura.js:452-477`), o (b) el barrido legacy del panel — que procesa con reglas legacy (S0-PF1). En la práctica la "retoma por lote/panel" del contrato (`docs/CONTRATO_CAPTURA_V2.md:383-387,560-563`) está implementada por el motor legacy.

### S0-PF3 (MEDIO) — Concurrencia sin LockService en V2

`Captura_v2_persistirRegistro` usa `getLastRow()+1` sin `LockService` (`26_Captura.js:763`; cero coincidencias `LockService` en todo `26_Captura.js`). Dos envíos concurrentes (o envío V2 + barrido legacy) pueden pisarse la fila o invalidar la confirmación por relectura (`26_Captura.js:774-788`). El legacy sí usa `LockService.tryLock(30000)` (`24_Formulario.js:1420-1421`).

### S0-PF4 (MEDIO) — Costo por envío

`Captura_v2_buscarRegistro` lee el rango **completo** de `FORM_RESPUESTAS` en cada envío (`26_Captura.js:706-739`), y `Captura_v2_actualizarTrailer` re-busca si no recibe `reg` (`26_Captura.js:795-798`). Con histórico creciente: O(n) por envío. El legacy lee solo la cola (`WebApp.gs:227-254,257-283`). No viola presupuesto hoy, pero escala mal.

### S0-PF5 (MEDIO) — `fechaIngreso` no persistida en FORM_RESPUESTAS

`Captura_v2_normalizadoAInterno` genera `FECHA_INGRESO` (TR-1, `26_Captura.js:373`), pero la columna física no existe en `FORM_RESPUESTAS_COLUMNAS` (`00_Config.js:849-851`) y `Captura_v2_persistirRegistro` la omite silenciosamente (`if (mapa[...] !== undefined)`, `26_Captura.js:757-759`): sobrevive en `TRAZA_CRUDA` y en la fila `INGRESO_<SECTOR>`, pero no en la trazabilidad de la captura. Además la semántica diverge: legacy fuerza "hoy" (`24_Formulario.js:297`) vs V2 recibe la fecha del cliente (REQ, `26_Captura.js:76`).

### S0-PF6 (MEDIO) — Marca de ingreso divergente

Legacy `FORM|<id>|INGRESO` (`24_Formulario.js:1496`; dedupe `:1452-1462`) vs V2 `FORM|<id>|NUEVO_INGRESO` (`26_Captura.js:358-360,973`). La deduplicación por marca NO es interoperable entre backends; solo la barrera `(RUT,FECHA_INGRESO)` del pipeline la cubre.

### S0-PF7 (BAJO) — Ventana de carrera A2 con trailer vacío + doble `appendRow`

Reintento técnico A2 con trailer aún vacío (`26_Captura.js:963-971`): si el primer request no escribió la fila con la marca, el segundo hace `appendRow` duplicado (`26_Captura.js:972-976`) antes del procesamiento acotado. La dedupe de efectos §22 protege los eventos (`26_Captura.js:854-858`); la ventana es de milisegundos y no hay `LockService`.

### S0-PF8 (BAJO) — UI borra el formulario en estados no terminales

`_envExito` limpia el form y muestra "Nueva captura" para cualquier `ok:true` no-ERROR, incluido `estado:'RECIBIDO', motivo:'PENDIENTE_ENTREGA'` (eventualidad §15.3, `26_Captura.js:598-608`) y `REQUIERE_REVISION` (`CapturaWeb.html:910-919`). El usuario pierde visibilidad de la entrega pendiente.

### S0-PF9 (BAJO) — Callbacks silenciosos y superficie expuesta

- `cargarEsquema` falla silenciosamente (`CapturaWeb.html:624-628`); `api_webappEstado` en init idem (`:1300-1303`); `poblarProfesionales` degrada a dropdowns vacíos (`:672-678`).
- `XFrameOptionsMode.ALLOWALL` (`WebApp.gs:34`) permite incrustación en iframes de terceros (formulario con datos de salud).
- El diagnóstico en caso de ERROR viaja al navegador dentro de la respuesta (`CapturaWeb.html:898-899`; recortado a 4000 chars) — fuga controlada de internals.
- Entrypoints legacy expuestos (`Form_capturarDesdeUI`, `api_webappCapturar`, `WebApp_previaDuplicados`) sin consumidor en la UI actual.

---

## 4. RIESGOS (probabilidad × impacto, mitigación prevista en S1→S9)

| # | Riesgo | Prob. | Impacto | Mitigación prevista |
|---|---|---|---|---|
| R1 | Corrupción de filas PACIENTES por `2+idx` en los 5 endpoints (incluye ruta V2 de control/seguimiento/actualizarDatos) | MEDIA (requiere uso de esos endpoints en hoja viva con layout visual) | **CRÍTICO** (sobrescribe paciente `idx-2` / franja superior) | S1/S6: unificar la escritura por contrato (`Modelo_dataStartRow(PACIENTES)+idx` / helper único) + tests GAS simulados + verificación viva en E2E |
| R2 | Fila V2 reprocesada por lote legacy con reglas legacy | MEDIA | ALTO (semántica distinta, doble contabilidad) | S2 (cola confiable): separador físico de espacio de identidad o filtro por prefijo en `Form_filasPendientes`; S6 unificar pipeline |
| R3 | Dependencia de recuperación V2 → motor legacy | ALTA (diseño actual) | ALTO (contradice contrato §28 y regla de entorno único) | S2/S5: retoma/estado propio de V2 (barrido acotado V2 o reintento administrativo V2) sin rules legacy |
| R4 | Carrera de appendRow sin LockService | BAJA | MEDIO (duplicados de fila/confirmación inválida) | S2: LockService alrededor de persistir+entregar+trailer de V2 |
| R5 | O(n) completo por envío con histórico creciente | MEDIA (crece con uso) | MEDIO | S1/S6: ventana de cola + índice de RESPONSE_ID por prefijo |
| R6 | Pérdida de `fechaIngreso` en trazabilidad de captura | MEDIA | MEDIO (auditoría incompleta) | S1 (contrato único de campos): columna física o trazabilidad explícita |
| R7 | Doble fila en INGRESO por marca no interoperable | BAJA | MEDIO | S6: marca única compartida por backend |
| R8 | Usuario pierde visibilidad en `PENDIENTE_ENTREGA` (form se limpia) | MEDIA | BAJO | S3 (frontend): distinguir estados no terminales |
| R9 | Incrustación/clickjacking + internals en navegador | BAJA | BAJO | S3+/S8: política XFrame ajustada; diagnóstico exclusivo de panel |

---

## 5. DIAGNÓSTICO EJECUTIVO

**Qué está sólido (verificado):**
1. **Contrato V2 y pipeline de captura están coherentes entre sí y con la UI**: payload camelCase (§6), captureId `Cp2-32hex` (§12) con validación estricta en ambos lados, idempotencia §13 (A1/A2/B), persistencia-durable-antes-de-efectos (§15.2), entrega acotada al envío actual, respuesta §16/§17. La "UI V2 pendiente" de `PENDIENTES.md #29` ya no es cierta: `CapturaWeb.html` es 100% V2.
2. **El modelo de salida está alineado en las rutas canónicas del backend V2** (`Form_actualizarDatosPaciente` usa el índice correcto; `appendRow` de INGRESO robusto a layout; EVENTOS append-only).
3. **Arquitectura de entorno único respetada**: sin DEV/DEMO operativos, sin segunda base de datos, sin Google Forms funcional.

**Qué exige corrección (orden de la fase S0→S9):**
1. **S0-PF0 es el defecto de mayor severidad**: cinco escrituras a PACIENTES quedaron en la aritmética del layout SIMPLE tras la migración visual (DEC-043). Al estar la ruta V2 de `registrarControl`/`registrarSeguimiento`/`actualizarDatos` conectada a `api_registrarEvento`, el **canal de captura vigente puede corromper la fila de otro paciente** si se usa en la hoja viva con layout visual. (S1/S6.)
2. **La recuperación de envíos V2 vive en el motor legacy sin separación de espacio de identidad** (S0-PF1/PF2). Es el conflicto arquitectónico central: mismo esquema físico, doble namespace, y el barrido del panel puede aplicar reglas legacy a filas V2. (S2/S5/S6.)
3. **Concurrencia y costo**: V2 sin `LockService` y con barrido completo por envío. (S2.)
4. **Fechas**: `fechaIngreso` no trazable en `FORM_RESPUESTAS`; divergencia de semántica con legacy. (S1/S6.)
5. **Baja severidad** (UI/estados/seguridad documental): limpieza temprana del form, callbacks silenciosos, `XFrameOptionsMode.ALLOWALL`, documentación desactualizada. (S3/S8/S9.)

**Verificación pendiente (bloquea la confirmación viva, no el trabajo de código):**
- E2E del canal V2 (requiere usuario autenticado con `pvc.devno@gmail.com` en el perfil Brave — paso pendiente del usuario).
- Confirmación del layout real de la hoja PACIENTES en el libro vivo antes de declarar R1 como defecto observado (el código ya lo demuestra contra el contrato).

**Criterio de éxito al cierre de S0:** este documento es la línea base. S1 (contrato único de datos) deberá resolver PF5/PF0, S2 la cola confiable (PF1/PF2/PF3/R3/R4), S3 el formulario web (PF8/PF9), S5 idempotencia, S6 pipeline (PF6/R7) y S8/S9 errores y base estable (R9, documentación).

---

## 6. RESOLUCIÓN S1 — CONTRATO ÚNICO DE DATOS Y LÍMITES DE PERSISTENCIA

> **Fase S1 del PROMPT MAESTRO · fecha 2026-09-06.** Aprobada por el usuario con alcance
> mínimo y reversible (REGLA 1: sin refactor masivo). Entregables: `CONTRATO_DATOS.md`
> (**NORMATIVO**), corrección S0-PF0, separación de namespaces (S0-PF1), retoma V2 (S0-PF2),
> batería de tests C1–C7 + regresión R1/R2. **No se avanza a S2.**

### 6.1 Correcciones aplicadas

| Hallazgo S0 | Corrección | Verificación |
|---|---|---|
| **S0-PF0 (CRÍTICO)** — 5 sitios con `2 + idx` en PACIENTES | `07_UI.js:514,926,1229,1618,1628` y `02_Normalizacion.js:551` → `Modelo_filaFisica(HOJAS.PACIENTES, idx)` | C2/C3/C4/R1/R2 conductuales (`tests/contrato_datos.mjs`) |
| **S0-PF1 (ALTO)** — reprocesamiento legacy sobre filas V2 | Filtro de namespace en `Form_filasPendientes` (`FORM_VERSION=2` o prefijo `Cp2-`) + rechazo en `Form_reiniciarRespuesta` | C5 |
| **S0-PF2 (ALTO)** — retoma V2 dependía del motor legacy | `Captura_v2_retomarRegistro` + entrypoint `WebApp_capturarRetomar`: re-entrega con el **procesador V2** (mecánica A2, `CAPTURA_V2_RETOMABLES`) | C6 |
| S0 §2.3/R2 (MEDIO) — cola sin separación por prefijo | El filtro E.1 elimina el barrido cruzado; la separación física es parte de S2 | C5 |

### 6.2 No resuelto en S1 (fase futura)

S0-PF3 (LockService V2) → S2 · S0-PF4 (O(n) por envío / índice por prefijo) → S2 · S0-PF5
(`fechaIngreso` no persistida) → S2 · S0-PF6 (marca `|NUEVO_INGRESO` vs `|INGRESO`) → S6 ·
S0-PF7 (carrera A2 doble appendRow) → S2 · S0-PF8/PF9 (UI y exposición) → S3/S8/S9.

### 6.3 Resultado de pruebas en S1

| Suite | Resultado |
|---|---|
| núcleo (`tests/ejecutar_local.mjs`) | 469/469 ✅ |
| contrato V2 (`tests/contrato_captura_v2.mjs`) | 36/36 ✅ |
| aceptación (`tests/aceptacion_formulario.mjs`) | 50/50 ✅ |
| backend V2 (`tests/captura_backend_v2.mjs`) | 65/65 ✅ |
| UI payload V2 (`tests/captura_ui_payload_v2.mjs`) | 16/16 ✅ |
| **contrato de datos S1 (NUEVO, `tests/contrato_datos.mjs`)** | **20/20 ✅** (C1–C7, R1, R2) |

Nota: la suite núcleo registró un fallo de benchmark `Control_filasPanel O(n) < 2000ms`
(2144ms) por carga de la máquina en el primer intento; **no es regresión de S1** (re-verificó
469/469 en ejecución posterior; tria cuenta de tiempos le agrega jitter a la prueba).

### 6.4 Documentación

- **Nuevo:** `CONTRATO_DATOS.md` (**NORMATIVO**, secciones A–J).
- **Actualizado:** `PENDIENTES.md` (#29: UI V2 ya operativa + retoma V2 en S1),
  `ARQUITECTURA.md` (§ versión canónica sin build desactualizado), `src/WebApp.gs` (cabecera de
  flujo describe el canal V2). `docs/CONTRATO_CAPTURA_V2.md` permanece intacto (fuente
  normativa estable; la retoma V2 se documenta aquí y en `CONTRATO_DATOS.md` §F).

### 6.5 E2E / verificación viva (BLOQUEADA)

Sigue pendiente la sesión Google (`pvc.devno@gmail.com`) en el perfil Brave de la máquina para:
confirmar el layout real de PACIENTES en la hoja viva; registrar un CONTROL/SEGUIMIENTO y
contrastar la fila escrita; y validar la retoma V2. La validación de S1 es **estática** (código
+ tests); **no** se declara validación en vivo.

---

## 7. RESOLUCIÓN S2 — COLA FORM_RESPUESTAS CONFIABLE

> **Fase S2 del PROMPT MAESTRO · fecha 2026-09-06.** Correcciones mínimas, verificables y
> reversibles (REGLA 1 heredada de S1). Alcance: `FORM_RESPUESTAS` como cola confiable,
> trazable e idempotente (PF3/PF4/PF5/PF7). **No se ejecutó `clasp push`** (flujo: modificar →
> probar → revisar diff → informar). **No se avanza a S3 sin aprobación.**

### 7.1 Correcciones aplicadas

| Hallazgo S0 | Corrección | Verificación |
|---|---|---|
| **S0-PF3 (MEDIO) / R4** — V2 sin LockService | `LockService.getScriptLock().tryLock(30000)` + `finally { releaseLock() }` en `WebApp_capturarEnviar` (`26_Captura.js:1189`) y `WebApp_capturarRetomar` (`26_Captura.js:1283`). El lock cubre validar → persistir → entregar → trailer del intento. | Q8/Q9/Q10; suites completas verdes |
| **S0-PF4 (MEDIO) / R5** — barrido O(n) por envío | `Captura_v2_buscarRegistro` ahora escanea **de abajo hacia arriba** (`for f = datos.length-1 → 1`, `26_Captura.js:759`): un reintento (A2) encuentra su fila en O(k) y la resolución de duplicados teóricos toma la coincidencia **más reciente**. Los envíos nuevos siguen siendo O(n) (correcto; el early-exit por índice de prefijo queda como optimización de fase futura). | Q13 (reverse scan) |
| **S0-PF5 (MEDIO) / R6** — `fechaIngreso` no persistida | Se añadió `FECHA_INGRESO` como **26.ª columna** de `FORM_RESPUESTAS_COLUMNAS` (`00_Config.js:851`). `persistirRegistro` ya arrastraba `['FECHA_INGRESO', internos.FECHA_INGRESO]` en su mapa de escritura; ahora la columna existe y el valor se persiste. `buscarRegistro` la relee como `fechaIngreso` (`26_Captura.js:779`). | Q7, Q13d |
| **S0-PF7 (BAJO) / R4** — ventana A2 de doble fila | Mitigado por el lock de PF3 (serialización persistir→entregar→trailer) + reverse scan (la escritura más reciente gana). La dedupe de efectos §22 sigue intacta. | Q9, suites completas |

### 7.2 Contrato físico de FORM_RESPUESTAS (Q1/Q2, tras PF5)

`FORM_RESPUESTAS_COLUMNAS` = 4 header + 12 `FORM_CONFIG.CAMPOS` + 10 trailer (9 originales +
`FECHA_INGRESO`) = **26 columnas**. `FECHA_INGRESO` es la última. `captureId` = `RESPONSE_ID`
(`Cp2-` + 32 hex); es la **única clave de deduplicación** contractual (§12/§13); la identidad
clínica sigue siendo RUT/ID_INTERNO (C7 S1).

### 7.3 Ciclo de vida de la fila (S2.9 — máquina de estados real)

```
RECIBIDO ──╮
           │  (1 request, captura rápida §16: RECIBIDO → PROCESADO)
           ▼
       VALIDANDO ─ VALIDO ─ PROCESADO   (TERMINAL; inamovible, §19/§23)
           │            │
           ├─ ERROR ────┤  (REINTENTABLE; reintentos < maxR → A2; ≥ maxR →
           │            │   ERROR + motivo REINTENTOS_AGOTADOS)
           ▼
      REQUIERE_REVISION  (TERMINAL; decisión humana, no se retoma automáticamente)
```

- **Inicial:** `RECIBIDO`. **Terminales:** `PROCESADO`, `REQUIERE_REVISION`.
- **Reintentables (reenvío A2):** `RECIBIDO`, `ERROR`. **Retomables (admin):** `RECIBIDO`,
  `VALIDANDO`, `VALIDO`, `ERROR` (`CAPTURA_V2_RETOMABLES`).
- `PROCESADO` es inamovible: reenvío idéntico devuelve la respuesta almacenada (A1) sin efectos;
  `reprocesar` lo rechaza. Requiere decisión humana para **toda** salida de `PROCESADO`.

### 7.4 Escritura y consistencia (S2.10)

- `persistirRegistro` escribe la fila completa (26 columnas) al final y confirma por relectura
  (`Captura_v2_confirmarFila`). `actualizarTrailer` actualiza solo `INGRESO_HOJA`…`FECHA_PROCESO`;
  `FECHA_INGRESO` se escribe una vez en el persistir.
- LockService serializa el tríptico persistir→entregar→trailer en los entrypoints de escritura.
- Cache por request (`Captura_v2_regDesdeCache`, por ctx → sin fuga entre requests) evita un
  segundo escaneo al primea el trailer tras persistir (§15).
- Las escrituras son append-only al final; el reverse scan encuentra la escritura más reciente
  primero y la resolución de duplicados teóricos elige la de mayor fila.

### 7.5 Recuperación de errores (S2.11)

- **ERROR reintentable (A2):** reenvío del mismo payload o retoma administrativa
  (`WebApp_capturarRetomar` → procesador V2) reprocesa sin duplicar fila ni efectos (dedupe §22).
- **REINTENTOS_AGOTADOS:** queda en `ERROR` con motivo; requiere intervención (retoma o revisión).
- **CONFLICTO_IDEMPOTENCIA:** mismo captureId + payload distinto → rechazo sin fila nueva (§13 B).
- **Persistencia fallida:** sin fila y con `ERROR_INTERNO` (Q10); el cliente puede reintentar.

### 7.6 Auditoría de la UI (S2.16 — confirmación PF8, NO corregido aquí)

`CapturaWeb.html` `_envExito` trata `RECIBIDO`/`VALIDANDO`/`VALIDO` como éxito y limpia el
formulario: el usuario pierde visibilidad de la entrega pendiente (eventualidad §15.3) y de
`REQUIERE_REVISION`. No hay bloqueo de doble envío en la UI. El `captureId` no se pierde y los
errores sí se muestran. **Pertenece a S3** (frontend); en S2 solo se documenta como confirmado.

### 7.7 Resultado de pruebas en S2

| Suite | Resultado |
|---|---|
| núcleo (`tests/ejecutar_local.mjs`) | 469/469 ✅ |
| contrato V2 (`tests/contrato_captura_v2.mjs`) | 36/36 ✅ |
| aceptación (`tests/aceptacion_formulario.mjs`) | 50/50 ✅ |
| backend V2 (`tests/captura_backend_v2.mjs`) | 65/65 ✅ |
| UI payload V2 (`tests/captura_ui_payload_v2.mjs`) | 16/16 ✅ |
| contrato de datos S1 (`tests/contrato_datos.mjs`) | 20/20 ✅ |
| **cola FORM_RESPUESTAS S2 (NUEVO, `tests/cola_form_respuestas.mjs`)** | **33/33 ✅ (Q1–Q13)** |

Total: **689 tests · 0 fallos**.

### 7.8 Documentación

- **Nuevo:** `tests/cola_form_respuestas.mjs` (batería S2 Q1–Q13).
- **Actualizado:** este documento (§7), y `CONTRATO_DATOS.md` (§E — columna `FECHA_INGRESO`
  como parte del esquema físico de FORM_RESPUESTAS).
- `docs/CONTRATO_CAPTURA_V2.md` permanece **intacto** (fuente normativa estable).

### 7.9 No resuelto en S2 (fase futura)

S0-PF6 (marca `|NUEVO_INGRESO` vs `|INGRESO`) → S6 · S0-PF8/PF9 (UI limpieza temprana,
exposición) → S3/S8/S9 · índice/early-exit por prefijo de RESPONSE_ID (O(n)→O(1) en envíos
nuevos) → fase posterior a S2 · confirmación del layout físico real de FORM_RESPUESTAS en hoja
viva (bloqueada por E2E).

### 7.10 E2E / verificación viva (BLOQUEADA)

Misma sesión pendiente que S1 (`pvc.devno@gmail.com` en Brave). S2 se declara validada
**estáticamente** (código + 689 tests). `clasp push` queda pendiente de decisión controlada del
usuario (no es parte del flujo S2 salvo necesidad técnica).

## 8. RESOLUCIÓN S3 — COMPORTAMIENTO DEL FORMULARIO WEB

> **Fase S3 del PROMPT MAESTRO · fecha 2026-09-07.** Correcciones mínimas de comportamiento y
> UX operacional sobre la Web App. **NO se rediseñó la UI** (sin cambio visual, de paleta,
> gráficas, módulos o pantallas; REGLA S3). **No se ejecutó `clasp push`** (flujo: modificar →
> probar → regresión → revisar diff → informar). **No se avanza a S4 sin aprobación.** La
> especificación normativa del canal es `docs/CONTRATO_CAPTURA_V2.md`; la UI ahora se alinea con
> ella.

### 8.1 Correcciones aplicadas en `src/CapturaWeb.html`

| Hallazgo | Corrección | Verificación |
|---|---|---|
| **S0-PF8 (BAJO→resuelto)** — `_envExito` limpiaba el formulario también en `RECIBIDO`/`VALIDANDO`/`VALIDO`/`REQUIERE_REVISION` | Nueva interpretación por estado: **la única ruta de limpieza es `estado === 'PROCESADO'`**. `RECIBIDO`/`VALIDANDO`/`VALIDO` y `REQUIERE_REVISION` conservan el formulario con mensajes diferenciados (tipo `warn`); `ERROR` y `ok:false` conservan con tipo `err`. El reintento idéntico es inocuo (A1/A2) porque el `captureId` no cambia. | UI1–UI18 (A1–A8, B1–B5) |
| **S3.3 (spinner/botón colgados)** — el timeout de 60 s solo cubría `enviarFinal`; la verificación previa de duplicados (`WebApp_previaDuplicadosV2`) podía quedar colgada sin desbloquear | `_envTimeoutInit()` se arma al inicio de `enviar()` (cubre previa) y se rear-ma (sin acumular) en `enviarFinal()`. Timeout muerto si `_enviando=false`. `estadoEnviando()` además se aplica dentro de `enviarFinal` para ambos caminos (directo y duplicados). | E1–E4 |
| **S0-PF9 (parcial)** — `_envExito` volcaba `r.data.diagnostico` al DOM | Bloque **eliminado**: la respuesta estructurada del backend nunca se vuelca completa; los chips muestran solo estado, `captureId`, motivo e identificadores técnicos (`idInterno`/`idEvento`). Falta de S0-PF9 (callbacks de init silenciosos) pasa a fases S8/S9. | C1–C2 |
| **NUEVO (auditoría S3)** — `_asignarCaptureId` emitía `Cp2-` + **64 hex** (base de 32 + 32) mientras el contrato §12 exige **`Cp2-` + exactamente 32 hex** (`RE_CAPTURE_ID: /^Cp2-[a-f0-9]{32}$/`). Todo envío real era rechazado con `SINTAXIS_INVALIDA`. | `_capIdPendiente = _hex16()` (32 hex exactos, minúsculas). Se elimina `_capIdBase`. Formato §12 restaurado; reintento idéntico conserva el id. | F1 |

### 8.2 Máquina de estados UI (S3.1)

```
IDLE ──(editar)──> EDITANDO ──(btnEnviar, valida ok)──> ENVIANDO ──> RESPUESTA
  ^                                                       │  previa duplicados
  │                                                       └──> (coincidencia) EDICION_ASISTIDA (overlay)
  └──(Nueva captura / estatus terminal)                                │ decisión
                                                                       ▼
                                                              ENVIANDO (reenvío)
```
- `ENVIANDO`: `_enviando=true`, botón deshabilitado, spinner `.spin.on`, `aria-busy=true`,
  label “Registrando…”. Bloquea doble envío (guardia `if(_enviando)return`).
- `RESPUESTA`: depende de la semántica del estado devuelto (§8.3).
- Timeout 60 s desde ENVIANDO (previa y envío): desbloquea botón y spinner y muestra aviso
  “La respuesta tardó demasiado…” sin limpiar el formulario.
- La limpieza del formulario solo ocurre en la transición PROCESADO → IDLE (“Nueva captura”).

### 8.3 Semántica estados backend → UI (S3.6)

| Estado backend (`data.estado`) | Significado | UI | ¿Limpia formulario? |
|---|---|---|---|
| `PROCESADO` | Aceptada + persistida + entregada (terminal, éxito real) | `status-ok`, mensaje de éxito de la acción + chips técnicos; esconde `btnEnviar`, muestra “Nueva captura” | **SÍ** (única ruta) |
| `RECIBIDO` con `motivo=PENDIENTE_ENTREGA` | Persistida; espera confirmación del trailer (§15.3, eventualidad) | `status-warn`, “Captura recibida — entrega pendiente de confirmación” + chips | NO (reintento A2) |
| `RECIBIDO` / `VALIDANDO` / `VALIDO` | Estado transitorio recuperable (reintentable) | `status-warn`, “Captura recibida — pendiente (ESTADO)” | NO (reintento A2) |
| `REQUIERE_REVISION` | Terminal de decisión humana; no se retoma automáticamente | `status-warn`, “Registro recibido — requiere revisión” + motivo | NO (intervención; reintento inocuo A1) |
| `ERROR` | Error de procesamiento recuperable | `status-err`, mensaje de error + motivo | NO (reintento A2) |
| `ok:false` + `errors[]` | Rechazo de validación/conflicto | `status-err`, mensajes `e.mensaje` por error | NO |
| fallo de transporte / `null` / estado desconocido | No hubo respuesta confiable | `status-err` (o `warn` defensivo en estado desconocido) | NO |

### 8.4 captureId (S3.9)

La Web App emite `captureId` como `Cp2-` + **exactamente 32 hex minúsculas**, conforme a
`CAPTURA_V2.RE_CAPTURE_ID` (§12). Se corrigió la emisión de 64 hex que hubiera hecho rechazar
**todo** envío real con `SINTAXIS_INVALIDA`. El mismo contenido del formulario reutiliza el
mismo `captureId` (reintento idéntico A1; edición → nuevo id). No se documenta “64” en ningún
contrato.

### 8.5 Privacidad (S3.14)

La UI nunca vuelca la respuesta estructurada completa al DOM ni pide datos clínicos adicionales
a los que ya captura el formulario. Solo se muestran identificadores técnicos de
confirmación: `captureId`, `idInterno` e `idEvento` (cuando el backend los provee).

### 8.6 Resultado de pruebas en S3

| Suite | Resultado |
|---|---|
| **formulario web S3 (NUEVO, `tests/formulario_web.mjs`, UI1–UI18 · 25 casos)** | **25/25 ✅** |
| núcleo (`tests/ejecutar_local.mjs`) | 469/469 ✅ |
| contrato V2 (`tests/contrato_captura_v2.mjs`) | 36/36 ✅ |
| aceptación (`tests/aceptacion_formulario.mjs`) | 50/50 ✅ |
| backend V2 (`tests/captura_backend_v2.mjs`) | 65/65 ✅ |
| UI payload V2 (`tests/captura_ui_payload_v2.mjs`) | 16/16 ✅ |
| contrato de datos S1 (`tests/contrato_datos.mjs`) | 20/20 ✅ |
| cola FORM_RESPUESTAS S2 (`tests/cola_form_respuestas.mjs`) | 33/33 ✅ |
| **TOTAL** | **714 tests · 0 fallos** |

### 8.7 Documentación

- **Nuevo:** `tests/formulario_web.mjs` (batería S3 UI1–UI18). El harness ejecuta el script
  inline **real** de `CapturaWeb.html` en un sandbox con DOM mínimo y expone los internos vía
  hook inyectado en el IIFE (mismo enfoque que `captura_ui_payload_v2.mjs`).
- **Actualizado:** este documento (§8) y `ARQUITECTURA.md` (§3 — Comportamiento del formulario web).
- `docs/CONTRATO_CAPTURA_V2.md` permanece **intacto** (fuente normativa estable).

### 8.8 No resuelto en S3 (fase futura)

- S0-PF6 (marca `|NUEVO_INGRESO` vs `|INGRESO`) → S6.
- S0-PF9 restante: callbacks silenciosos de init (`cargarEsquema`, `poblarProfesionales`,
  `api_webappEstado` no informan fallo al usuario) → fases S8/S9 + exposición de superficie de
  funciones RPC.
- Índice/early-exit por prefijo de `RESPONSE_ID` (O(n)→O(1) en envíos nuevos) → fase posterior.
- Confirmación del layout físico real de FORM_RESPUESTAS en hoja viva (bloqueada por E2E).

### 8.9 E2E / verificación viva (BLOQUEADA)

La sesión `pvc.devno@gmail.com` sigue sin estar disponible en Brave. S3 se valida
**estáticamente** (código + 714 tests). El E2E real (enviar → determinismo de estados →
limpieza solo en PROCESADO) queda **PENDIENTE POR AUTENTICACIÓN**. `clasp push` no se ejecutó
en S3; quedará pendiente de decisión controlada del usuario.

---

## 9. RESOLUCIÓN S4 — PUBLICACIÓN CONTROLADA Y VALIDACIÓN E2E REAL

> **Fase S4 del PROMPT MAESTRO · fecha 2026-09-07.** Objetivo único: publicar el código V2
> estabilizado (S0–S3) y validar en la **instancia real** el circuito
> `FORMULARIO → WEB APP/BACKEND → FORM_RESPUESTAS → PACIENTES/EVENTOS`, incluyendo idempotencia
> A1/A2 y control de errores. **Sin funcionalidad nueva** (sin edad, sexo, dashboard, G1–G3,
> REM, actualizar sistema, filtros, búsquedas). S4 no modifica código de negocio.

### 9.1 Antecedente y hallazgo de inspección

- **S3-BUG-001 (antecedente):** `_asignarCaptureId` emitía `Cp2-` + 64 hex; el contrato §12 exige
  `Cp2-` + exactamente 32 hex (`RE_CAPTURE_ID: /^Cp2-[a-f0-9]{32}$/`, `26_Captura.js:52`).
  Sin la corrección S3, todo envío real habría sido rechazado con `SINTAXIS_INVALIDA`.
- **S4.1 Hallazgo de inspección:** la instancia real **servía formularios PRE-V2** (deployments
  @89/@90 legacy: sin `construirPayloadV2`, `captureId`, `Cp2-`). El código V2 estabilizado
  **nunca se había desplegado**. S4 publica V2 por primera vez.

### 9.2 Publicación

| Paso | Resultado |
|---|---|
| `git commit 60ec053` (S0–S4, 27 archivos, +6764/−530; `docs/hoja_de_vida.pdf` quedó **untracked**, ajeno a la tarea) | OK |
| Regresión previa a publicación | 714/714 ✅ (re-ejecutada en S4.3) |
| `clasp push --force` | OK, proyecto sincronizado sin untracked |
| `clasp version` | **v91** |
| `clasp deploy --deploymentId AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw --versionNumber 91` (deployment @90, la URL de captura) | **Deployed @91** |
| Verificación HTTP `/exec` del deployment @90 | HTML V2 real (520 KB): `construirPayloadV2`×2, `captureId`, `Cp2-`, `.status-warn`, `entrega pendiente`, `NUEVO_INGRESO` |
| `/dev` del deployment @HEAD | Sigue devolviendo página de autorización Apps Script (5541 B); @HEAD se actualiza por push pero requiere autorización propia del deployment |

Distribución de deployments: @HEAD `AKfycbwd7PkYNWEmglmOqkqgxEw14jTZkTK3O-FgiP3JTVTT` (dinámico,
sin fijar), **@90→v91 `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw`
(URL operativa de captura, ahora V2)**, @89 legacy `AKfycbx2LvLy7c3xUVWcPWzy4DsVTaSFR0ldtoKNfyM-3M7cYOMjyBvf_5fFrkKU47UGz9PS6A`
(sin tocar), @86-test (sin tocar). No se crearon deployments nuevos.

### 9.3 Validación E2E real (registro de prueba descartable)

> Registro de prueba identificable enviado desde la instancia real por `pvc.devno@gmail.com`:
> RUT `15987654-3` · NOMBRE `PRUEBA E2E S4 ECICEP NO REAL` · sexo M · nac. 1990-05-05 · sector
> AMARILLO · G2 · tel 955555444 · obs “Registro de prueba S4 (2026-09-07). Descartable.”.
> La Web App real exige sesión de Google (diseño de producción, §24.1: `Sesión de usuario no
> detectada; acceso denegado` en acceso anónimo); el envío se realizó con sesión autenticada.

| Etapa | Evidencia real |
|---|---|
| **A — Formulario V2 servido** | Deployment @90/exec responde 200 y el frame `/blank` renderiza la app V2 (nuevo ingreso/control/seguimiento/actualizar, `#btnEnviar`) |
| **B — captureId** | `Cp2-55cac2c87ab08e34541ba94ab82590c4` (32 hex, formato §12 válido) |
| **C — FORM_RESPUESTAS** | **1 sola fila** con ese captureId (nunca dos); estado `RECIBIDO`, `PENDIENTE_CONFIRMACION`, trazabilidad cruda `FORM|Cp2-…|NUEVO_INGRESO`, ingreso `INGRESO_AMARILLO:1071` |
| **D — Entrega/pipeline** | `INGRESO_AMARILLO` fila 1071 con marca `pacientes:EC-MTR7FJY3-B6NB`; **PACIENTES** `EC-MTR7FJY3-B6NB` (estado PENDIENTE); **EVENTOS** `EV-0001` (INGRESO, 2026-09-07) |
| **Idempotencia (A1/A2)** | Envío #2 con datos idénticos → **el mismo captureId**, sin fila nueva; la previa de duplicados leyó `Modelo_leerPacientes()` real y detectó la persona ya registrada (dedup de negocio §22) |
| **Error controlado (seguro)** | El rechazo anónimo (§24.1) no limpió el formulario y mostró error claro; la confirmación pendiente (`RECIBIDO`) tampoco lo limpió (comportamiento §8.3 coherente) |

### 9.4 Cierre del proceso de estabilización S0→S4

- El **núcleo de captura está operativo en la instancia real**: envío V2 → FORM_RESPUESTAS →
  INGRESO_* → PACIENTES/EVENTOS, con captureId estable e idempotencia técnica verificada en vivo.
- Pendiente de fases futuras (S5+): enriquecimiento, edad/sexo, dashboard, G1–G3, REM,
  S0-PF6 (marca `NUEVO_INGRESO` vs `INGRESO`), reproceso por lote para confirmar el `RECIBIDO`
  a `VALIDO/PROCESADO` y limpieza/decision de deployments @89/@HEAD según dependencias reales.