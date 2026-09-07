# CONTRATO DE CAPTURA V2 — ECICEP

> **Estado: NORMATIVO.** Este documento es la **única fuente normativa** del contrato de captura de
> datos en ECICEP. Reemplaza (por definición) a `FORMULARIO.md` y `docs/CONTRATOS.md`, que fueron
> **invalidados** y no tienen contenido normativo.
>
> **Contrato de captura: versión 2** — `CAPTURE_CONTRACT_VERSION = 2`. Revisión **v2.1**
> (cronología del delta y versionado en §26).
>
> Este contrato rige lo que la **Web App** (único canal operativo de captura) envía y recibe, y lo que
> el backend acepta, persiste y devuelve. **No rige** el procesamiento clínico posterior (identidad,
> deduplicación de negocio, estratificación, REM, dashboards, vistas de sector), salvo los datos de
> entrada precisos que la captura entrega.
>
> Convenciones de evidencia usadas en este documento:
>
> - **[CONFIRMADO]** — respaldado por la implementación existente (código estudiado durante la Fase 2).
> - **[DECISIÓN]** — decisión arquitectónica normativa de este contrato.
> - **[INFERENCIA]** — lectura razonable a partir de la implementación; debe verificarse al implementar.
> - **[PENDIENTE]** — punto abierto; no tiene valor normativo hasta que se cierre.
>
> El alcance de esta fase es el **contrato + sus tests**; no introduce implementación nueva de captura.

---

## 1. Propósito

Definir, desde cero y de forma mínima y explícita, el contrato único de captura de datos de ECICEP:

1. qué operación clínico-operativa se solicita;
2. con qué campos y en qué formato exacto;
3. qué valida el backend y qué devuelve;
4. cómo se garantizan unicidad, idempotencia y trazabilidad por envío;
5. dónde termina la captura y dónde empieza el procesamiento clínico.

Es la especificación que debe cumplir toda UI de captura y todo backend de captura, y la referencia
que un agente debe leer para no reabrir los contratos invalidados.

## 2. Alcance

**Incluye:** el payload de entrada desde la Web App, la validación, la respuesta, los estados de la
captura, la idempotencia por `captureId`, la persistencia del registro de captura, la transformación
explícita hacia el modelo interno y la compatibilidad con la implementación histórica mediante
adaptador.

**Excluye:** el pipeline clínico (identificación, deduplicación de negocio, consolidación de
PACIENTES, eventos y cachés), la estratificación automática, el REM, los dashboards, las vistas de
sector, y cualquier otra regla interna de negocio no mencionada en este documento. Esas reglas
consumen los datos entregados por la captura, no forman parte de este contrato.

**Fuera de alcance en esta fase:** la implementación de la nueva captura (`26_Captura.js` o
equivalente, nuevo frontend, endpoint, persistencia o procesamiento nuevos). Esta fase termina con
este documento + `tests/contrato_captura_v2.mjs`.

## 3. Fuente única de captura

1. La **Web App** es el único canal operativo de captura de datos. **[DECISIÓN; confirmada por
   AGENTS.md]**
2. **Google Forms está fuera de operación y no forma parte de la arquitectura.** No se crea
   formulario, no se completa `FORM_ID`, no se instala `onFormSubmit`, no se leen ni se escriben
   `FormResponse`/`FormItem`. **[DECISIÓN]**
3. Todo dato clínico llega al sistema exclusivamente por el payload definido en §6. No existe un
   segundo payload, un segundo pipeline ni un segundo Spreadsheet operativo. **[DECISIÓN]**
4. Sheets conserva su rol administrativo/operativo interno; eso **no** crea un segundo canal de
   captura. **[CONFIRMADO]**

## 4. Terminología

| Término | Definición |
|---|---|
| Captura | Acción de enviar a ECICEP una operación clínico-operativa desde la Web App. |
| Envío | Una invocación del backend con un payload (§6). |
| Operación | Tipo de captura solicitado (§5). |
| `captureId` | Identificador de intención de captura (§12). |
| Registro de captura | Persistencia de un envío (origen: fila de `FORM_RESPUESTAS` existente, ver §21). |
| Procesamiento | Aplicación de reglas clínicas a los datos capturados (fuera del contrato, §22). |
| Adaptador | Capa que traduce identidades históricas ↔ V2 (§25). |
| Fila de ingreso | Fila física en `INGRESO_<SECTOR>`; puerta de entrada del pipeline de ingresos. |
| `INGRESO_<SECTOR>` | Hojas `INGRESO_NARANJO`, `INGRESO_AMARILLO`, `INGRESO_VERDE`. **[CONFIRMADO]** |
| Duplicado de negocio | Persona ya registrada o evento ya existente **según el procesamiento**, no por idempotencia técnica. |

## 5. Operaciones soportadas

La captura soporta exactamente **cuatro operaciones**, cubriendo las necesidades reales detectadas en
la implementación Web App existente. **[CONFIRMADO el flujo; DECISIÓN el identificador nuevo].**

| Operación V2 | Operación anterior (adaptador §25) | Descripción | Resultado del procesamiento (§22) |
|---|---|---|---|
| `nuevoIngreso` | `NUEVO_INGRESO` | Ingreso de una persona por la puerta de un sector (fila en `INGRESO_<SECTOR>`). Los duplicados de negocio los decide el pipeline, no la captura. | `INGRESO_<SECTOR>` + pipeline (CREAR_PACIENTE / ENLAZAR_EXISTENTE / REVISION / BLOQUEADO). |
| `registrarControl` | `REGISTRAR_CONTROL` | Control clínico de una persona existente (identidad por RUT exacto). | Evento `CONTROL` (+ recálculo de cachés). |
| `registrarSeguimiento` | `REGISTRAR_SEGUIMIENTO` | Seguimiento a distancia de una persona existente. | Evento `SEGUIMIENTO` (+ recálculo de cachés). |
| `actualizarDatos` | `ACTUALIZAR_DATOS` | Actualización de **datos operativos** de una persona existente (contacto/observaciones/dupla de ingreso). La identidad no se modifica nunca. | Campos operativos en PACIENTES + evento `OTRO` con marca del canal. La fecha del evento `OTRO` es **generada por el backend** (§5.2): es la fecha de la operación, jamás un dato del payload. |

**No forma parte del contrato** en esta fase: egresos, cambios de sector, cambios de estratificación,
planes de cuidado o gestión de caso. Son operaciones de procesamiento; si el futuro requiere
capturarlas, se agregan como nuevas operaciones V2 mediante el versionado de §26. **[DECISIÓN]**

### 5.1 Matriz de campos por operación

`REQ` = requerido · `OPC` = opcional · `NP` = no permitido (rechazar con `CAMPO_NO_PERMITIDO`).

| Campo (§6) | `nuevoIngreso` | `registrarControl` | `registrarSeguimiento` | `actualizarDatos` |
|---|---|---|---|---|
| `captureId` | REQ | REQ | REQ | REQ |
| `accion` | REQ | REQ | REQ | REQ |
| `rut` | REQ | REQ | REQ | REQ |
| `nombre` | REQ | NP | NP | NP |
| `sexo` | OPC | NP | NP | NP |
| `fechaNacimiento` | REQ | NP | NP | NP |
| `sector` | REQ | NP | NP | NP |
| `fechaIngreso` | REQ | NP | NP | NP |
| `estratificacion` | OPC | NP | NP | NP |
| `telefonos` | OPC | NP | NP | OPC |
| `fechaEvento` | NP | REQ | REQ | NP |
| `profesional` | REQ | REQ | REQ | REQ |
| `profesionalSecundario` | OPC | OPC | OPC | OPC |
| `observaciones` | OPC | OPC | OPC | OPC |
| `confirmarNuevoPaciente` | OPC | NP | NP | NP |

Los campos `REQ` son obligatorios y no nulos. Los campos `NP` **no pueden estar presentes**; si están,
el backend rechaza el envío (§17). **[DECISIÓN]**

> **Regla de coherencia (§30 / Anexo A):** la `fechaEvento` de `actualizarDatos` es `NP` **en el
> payload**; el evento `OTRO` que la operación produce lleva su fecha **generada por el backend**
> (§5.2), nunca derivada del cliente. Ver §30 del documento.

### 5.2 Fecha del evento `OTRO` de `actualizarDatos`

`actualizarDatos` **no es una operación clínica datada**: actualiza datos operativos de contacto,
observaciones y dupla de ingreso de una persona existente, sin registrar un acto clínico. El evento
`OTRO` que genera existe como **registro de trazabilidad de la operación** (marca del canal en
`FUENTE`, precedente del pipeline histórico §22), no como acto clínico.

Por tanto, **la fecha del evento `OTRO` de `actualizarDatos` no proviene del payload del cliente**
(`fechaEvento` permanece `NP` en §5.1/§6). Es **generada por el backend** al procesar la operación y
representa la **fecha de la operación**: el día calendario en que se ejecutó la actualización.

| Propiedad | Valor |
|---|---|
| Generador | **Backend** (sistema), al procesar `actualizarDatos`. No existe campo del payload que la transporte. |
| Significado | Fecha de la operación: día en que el backend aplica la actualización de datos operativos. |
| Precisión | Día. |
| Formato | ISO `yyyy-MM-dd`, fecha real (calendario). |
| Rango | Año ∈ [2015, 2040], coherente con §10. |
| Zona horaria | Local del entorno operativo (`America/Santiago`, `CFG_FECHAS.ZONA`), misma mecánica del pipeline histórico (`Form_hoy`) y de `FECHA_ACTUALIZACION`. |
| Tipo de evento | `OTRO` (`TIPOS_EVENTO.VALIDOS`). |

Reglas normativas:

1. **El cliente no la envía.** Si `fechaEvento` aparece en el payload de `actualizarDatos` →
   `CAMPO_NO_PERMITIDO` (§5.1/§17).
2. **El backend siempre la produce.** Al registrar el evento `OTRO` el backend entrega su propia
   fecha de operación; nunca transmite `''` ni un valor vacío a la función de registro de eventos.
   Este contrato elimina cualquier escenario válido de `fechaEvento=''` → `FECHA_INVALIDA` o
   `FECHA_EVENTO_AUSENTE` para `actualizarDatos`.
3. **No es un fallback ni dato clínico.** No sustituye a una fecha clínica ausente (no existe acto
   clínico que datar) y no se recicla el timestamp de recepción como "fecha de evento": es la fecha
   en que la operación se aplica, estampada por el backend como `FECHA_EVENTO` del evento `OTRO` y,
   en paralelo, como `FECHA_ACTUALIZACION` en PACIENTES.
4. **Solo aplica a `actualizarDatos`.** Para `registrarControl`/`registrarSeguimiento`,
   `fechaEvento` sigue siendo `REQ` desde el cliente (§5.1/§6).

## 6. Payload de entrada

Un único formato externo, JSON, nombres en **camelCase**. Sin aliases ni variantes ortográficas: cada
concepto tiene **un solo nombre** en el payload. Se rechaza cualquier campo desconocido (§17).

### Tabla de campos

| Campo | Tipo | Oblig. | Nullable | Valores permitidos / formato | Generador | Descripción |
|---|---|---|---|---|---|---|
| `captureId` | `string` | REQ | No | `Cp2-` + 32 hex minúsculas (`Cp2-[a-f0-9]{32}`) | Cliente | Identidad de la intención de captura (§12). |
| `accion` | `string` | REQ | No | `nuevoIngreso` · `registrarControl` · `registrarSeguimiento` · `actualizarDatos` | Cliente | Operación solicitada (§5). |
| `rut` | `string` | REQ | No | Cuerpo-DV, sin puntos, DV mayúscula (ej. `12345678-5`) | Cliente | Identidad de la persona (exacta). |
| `nombre` | `string` | REQ (`nuevoIngreso`) | No | ≥ 2 palabras; normalización: mayúsculas, espacios colapsados, tildes conservadas | Cliente | Nombre completo de la persona. |
| `sexo` | `string` | OPC | Sí | `M` · `F` · `OTRO` · `null` | Cliente | Sexo registrado. |
| `fechaNacimiento` | `string` (fecha) | REQ (`nuevoIngreso`) | No | ISO `yyyy-MM-dd` real, año ∈ [1900, 2040] | Cliente | Fecha de nacimiento. |
| `sector` | `string` | REQ (`nuevoIngreso`) | No | `AMARILLO` · `NARANJO` · `VERDE` | Cliente | Sector de la puerta de ingreso. |
| `fechaIngreso` | `string` (fecha) | REQ (`nuevoIngreso`) | No | ISO `yyyy-MM-dd` real, año ∈ [2015, 2040] | Cliente | Fecha en que se registra el ingreso de la persona al programa/sector ECICEP. |
| `estratificacion` | `string` | OPC | Sí | `G1` · `G2` · `G3` · `null` | Cliente | Estratificación conocida al ingresar. |
| `telefonos` | `string` | OPC | Sí | Lista normalizable: separador `/`, sin espacios; vacío = omitido | Cliente | Teléfono(s) de contacto. |
| `fechaEvento` | `string` (fecha) | REQ (control/seguimiento) · NP en `actualizarDatos` (§5.2) | No | ISO `yyyy-MM-dd` real, año ∈ [2015, 2040] | Cliente (control/seguimiento) · backend (`actualizarDatos`, §5.2) | Fecha del control o del seguimiento. En `actualizarDatos` **no** viaja en el payload: la fecha del evento `OTRO` la genera el backend como fecha de la operación (§5.2). |
| `profesional` | `string` | REQ | No | `NOMBRE` del catálogo `PROFESIONALES` (coincidencia exacta tras normalización mayúsculas/sin tildes, espacios colapsados) | Cliente | Profesional que registra. |
| `profesionalSecundario` | `string` | OPC | Sí | Mismo dominio que `profesional`; **debe ser distinto** de `profesional` | Cliente | Segundo profesional (dupla). |
| `observaciones` | `string` | OPC | Sí | Texto libre, `trim`; vacío = omitido | Cliente | Observaciones del envío. |
| `confirmarNuevoPaciente` | `boolean` | OPC | No (ausencia ≡ `false`) | `true` · `false` | Cliente | Instrucción: el operador verificó que este `nuevoIngreso` corresponde a una persona nueva pese a coincidencia en la base. No es dato clínico y **no** anula la detección de duplicados del backend (§24). |

**[CONFIRMADO]** derivado del catálogo real: `SEXOS.VALIDOS = [M, F, OTRO]`,
`SECTORES_RESPONSABLES = [AMARILLO, NARANJO, VERDE]`, rangos `CFG_FECHAS.ANO_MIN=2015`,
`ANO_MAX=2040`, `ANO_MIN_NACIMIENTO=1900`, catálogo `PROFESIONALES` (NOMBRE como clave de selección).
[DECISIÓN] nombre del canal en los identificadores (`Cp2-`), nombres en camelCase y tabla de
obligatoriedad del §5.1.

### 6.1 Campos NO permitidos (generados por el backend, jamás por el payload)

Cualquiera de estos en el payload → error `CAMPO_NO_PERMITIDO`. La lista sigue la implementación
existente, que los escribe/deriva en el procesamiento, no en la captura. **[CONFIRMADO]**

`FECHA_FORMS` (fecha de recepción) · `USUARIO` · `FORM_VERSION` · `TRAZA_CRUDA` · `INGRESO_HOJA` ·
`INGRESO_FILA` · `REINTENTOS` · `ESTADO` · `MOTIVO` · `ID_INTERNO` · `ID_EVENTO` · `FECHA_PROCESO` ·
`respuestaId`/`responseId` · marcadores `FORM|` / `UI-` · `fuente`/`marca` · `registradoPor` · `estado` (cualquier estado) ·
`estadoIngreso`/`notaSistema`.

> Regla de cierre: el payload V2 contiene **exactamente** las 15 claves de la tabla §6. Cualquier otra
> clave es desconocida (`CAMPO_DESCONOCIDO`) o internal (`CAMPO_NO_PERMITIDO`).

## 7. Tipos

| Tipo | Definición | Ejemplo válido |
|---|---|---|
| `string` | Cadena JSON (`typeof === 'string'`), sin `null` si no es nullable del tipo `string`. | `"12345678-5"` |
| `boolean` | JSON `true`/`false`. | `true` |
| `fecha` | `string` ISO `yyyy-MM-dd` **estricto** (§10). | `"2026-09-03"` |
| `enum` | `string` cuyo valor pertenece al conjunto cerrado del campo (§9). | `"AMARILLO"` |
| `lista` | `string` con elementos separados por `/` (normalización establecida del modelo). | `"5697123..."` → normaliza |

En la serialización idempotente (§13) cada campo se normaliza a su forma canónica **antes** de
comparar. Un tipo incorrecto (p. ej. número donde espera `string`, objeto donde espera `boolean`)
rechaza con `TIPO_INCORRECTO` (§20).

## 8. Obligatoriedad

- `REQ`: el campo debe estar presente, no ser `null` y no ser `''`. Ausencia, `null` o `''` →
  `CAMPO_OBLIGATORIO_AUSENTE` (§20).
- `OPC`: el campo puede omitirse, ser `null` o ser `''` (los tres equivalentes, §11). Si se provee un
  valor no vacío, debe satisfacer el tipo/formato del campo.
- `NP`: el campo no puede estar presente en el payload para esa operación → `CAMPO_NO_PERMITIDO`
  (§20).
- La obligatoriedad se define **por operación** en §5.1 y la matriz es la única autoridad.

## 9. Enumeraciones

Conjuntos cerrados, centralizados en `src/00_Config.js` como datos (no duplicados en código). **[CONFIRMADO]**

| Enum | Valores |
|---|---|
| `OPERACIONES` (payload) | `nuevoIngreso` · `registrarControl` · `registrarSeguimiento` · `actualizarDatos` |
| `SECTOR` | `AMARILLO` · `NARANJO` · `VERDE` |
| `SEXO` | `M` · `F` · `OTRO` |
| `ESTRATIFICACION` | `G1` · `G2` · `G3` |

Un valor fuera del conjunto → `ENUM_INVALIDO` (§20). Sin sinónimos en el payload: `NARANJA` solo se
acepta como alias interno de hoja (§25), nunca en el payload. **[DECISIÓN]**

## 10. Fechas y zonas horarias

1. El único formato de fecha en el payload es **ISO `yyyy-MM-dd`** (fecha calendario, sin hora, sin
   `Z`/offset). **[DECISIÓN]** — más estricto que la implementación previa (que aceptaba `dd/MM/yyyy`);
   el adaptador normaliza a ISO y el proceso interno conserva `dd/MM/yyyy` solo como formato visual de
   hoja (`CFG_FECHAS.FORMATO_HOJA`), sin valor contractual.
2. Una fecha no parseable, imposible (p. ej. `2026-02-30`) o fuera de rango → `FECHA_INVALIDA`
   (§20). Rangos: nacimiento año ∈ [1900, 2040]; ingreso (`fechaIngreso`) y evento (`fechaEvento`) año
   ∈ [2015, 2040]. **[CONFIRMADO — CFG_FECHAS]**
3. La zona horaria operativa del sistema es **`America/Santiago`** (`ECICEP.TZ`). Se usa ÚNICAMENTE
   para interpretar "hoy" (fecha de recepción) y para los timestamps
   internos de recepción/proceso (`FECHA_FORMS`, `FECHA_PROCESO`), almacenados como
   `yyyy-MM-dd HH:mm:ss` local sin offset. **[CONFIRMADO]** **[PENDIENTE]** confirmar el DST en la
   interpretación de "hoy" al implementar el nuevo backend.
4. El payload **nunca** transporta timestamp; solo fechas calendario.

## 11. Valores vacíos / `null` / ausencia

- **Ausencia** (clave no presente), **`null`** y **`''`** son equivalentes: representan "sin valor".
- En campos `OPC` los tres son válidos. **[DECISIÓN]**
- En campos `REQ` cualquiera de los tres es `CAMPO_OBLIGATORIO_AUSENTE`. **[DECISIÓN]**
- `confirmarNuevoPaciente` ausente ≡ `false` (nunca `null` significativo). **[DECISIÓN]**
- La serialización canónica de un payload para idempotencia (§13) convierte los "sin valor" a `''`
  para que ausencia y `null` se comparen igual.

## 12. Identidad de captura (`captureId`)

**`captureId`** identifica una **intención de captura**: un único intento lógico del operador (llenar
el formulario de la Web App y enviarlo).

Reglas normativas:

1. Formato: `Cp2-` + exactamente 32 hex minúsculas. Formato inválido → `SINTAXIS_INVALIDA`. **[DECISIÓN]**
2. Lo genera el **cliente** al iniciar una nueva captura. Un mismo formulario rellenado reutiliza el
   mismo `captureId` en **todos** los reintentos de ese formulario (§13). Un formulario **nuevo**
   (botón "nueva captura") genera un `captureId` **nuevo**. **[DECISIÓN]**
3. **Unicidad**: el backend asegura que un `captureId` aceptado queda persistido e inmutable y no se
   reutiliza con otro payload (Caso B, §13).
4. **No reutiliza** identificadores históricos: `UI-…`, `RESPONSE_ID`, `responseId`, `FORM|…`. Son
   identidades del canal previo, gestionadas por el adaptador (§25), jamás emitidas por el cliente
   V2. **[DECISIÓN]**
5. El `captureId` **no** identifica a la persona, **no** es un hash del payload y **no** es el
   negocio.
6. Persistencia: el `captureId` se guarda con el registro de captura (§15) y se devuelve en toda
   respuesta exitosa (§16) para permitir reintentos seguros.

## 13. Idempotencia

La idempotencia técnica se evalúa por `captureId`, frente al **payload normalizado canónico**
(§7/§11). Es independiente de la deduplicación de negocio (§22).

| Caso | `captureId` | Payload | Tratamiento normativo |
|---|---|---|---|
| **A1** — reintento tras éxito | Mismo | Mismo (canónico) | **No duplica efectos.** Devuelve el resultado almacenado (estado previo y materia resultante) con `ok:true`. Sin escritura nueva. |
| **A2** — reintento tras error/atascado | Mismo | Mismo (canónico) | **Reprocesamiento técnico seguro** (mismo `captureId`, payload idéntico). No duplica porque los marcadores de negocio (§22) ya se protegen. Respeta `maxReintentos = 3`. |
| **B** — conflicto | Mismo | **Diferente** (canónico) | **`CONFLICTO_IDEMPOTENCIA`** (§20), sin efectos. El operador debe usar un `captureId` nuevo (nueva captura) o reenviar Exactamente el mismo payload original. |
| **C** — datos idénticos, ID distinto | Nuevo | Clínicamente igual a un envío previo | **NO es idempotencia técnica.** Es un caso de **deduplicación de negocio** que resuelve el procesamiento (REVISION/DUPLICADO, §22). La captura lo acepta como envío nuevo. |

Notas normativas:

- Ausencia de `captureId` en el payload o formato inválido → rechazo `SINTAXIS_INVALIDA` (no hay fila
  de idempotencia). **[DECISIÓN]**
- La comparación de payload es sobre la **forma canónica** (§11) de todos los campos del campo
  afectado por la operación; los campos `NP` para esa operación no pueden estar presentes (rechazo
  previo a idempotencia).
- Idempotencia técnica ≠ duplicado funcional: dos dominios distintos, responsabilidades distintas.

## 14. Validación

El backend valida **siempre**; el frontend puede pre-validar solo para UX. La autoridad final es el
backend. **[DECISIÓN]** Capas aplicadas en orden:

1. **Sintaxis**: JSON bien formado, `captureId` con formato válido.
2. **Estructural**: claves exactas (desconocidas → `CAMPO_DESCONOCIDO`; internas → `CAMPO_NO_PERMITIDO`);
   tipos correctos (`TIPO_INCORRECTO`); obligatoriedad por operación (`CAMPO_OBLIGATORIO_AUSENTE`);
   reglas de `null` (§11).
3. **Semántica**: enums (§9) → `ENUM_INVALIDO`; fechas (§10) → `FECHA_INVALIDA`; `rut` (módulo 11,
   DV) → `RUT_INVALIDO`; `profesionalSecundario` ≠ `profesional` → `ENUM_INVALIDO`? no —
   `CAMPO_INVALIDO` con detalle; `profesional` existente en el catálogo → `ENUM_INVALIDO`.
4. **Negocio**: para operaciones sobre persona existente (`registrarControl`, `registrarSeguimiento`,
   `actualizarDatos`), si el `rut` no existe en PACIENTES → **`PERSONA_NO_ENCONTRADA`** que produce
   estado `REQUIERE_REVISION` de captura (no error de relanzamiento; ver §18). **[DECISIÓN; sigue la
   práctica operativa CUARENTENA]**

El resultado de la validación es binario: `ok` = todos los campos obligatorios/opcionales provistos
satisfacen las reglas y no hay campos rechazados.

## 15. Persistencia

1. Un envío es "captura aceptada" **solo** cuando su registro de captura (con `captureId`, payload
   normalizado, fecha de recepción, estado inicial y usuario si aplica) está **persistido de forma
   duradera** en el registro de capturas. **[DECISIÓN — evidencia: fila `RECIBIDO` en
   `FORM_RESPUESTAS` previo a procesar]**
2. No hay efecto clínico sin registro de captura persistido: el procesamiento se ancla al registro. **[DECISIÓN]**
3. El backend devuelve la respuesta **después de** completar el intento síncrono de persistencia + 
   procesamiento del envío (estado final del trailer §21). Si el intento síncrono no puede completar
   (tiempo máximo), el registro queda en `RECIBIDO`/`VALIDANDO` y un reprocesamiento por lote lo
   retoma (eventualidad documentada, §23); la respuesta refleja el estado **en ese momento**. **[INFERENCIA —
   evidencia: `max=200`, trailer y `Form_procesarPendientes`]**
4. La persistencia de la captura es independiente de los efectos clínicos: puede existir registro
   aceptado con procesamiento pendiente (`REQUIERE_REVISION`) sin que ello implique fallo de captura.

## 16. Respuesta exitosa

`ok:true` significa, de forma **verificable**: *"el envío fue aceptado según el contrato, su registro
de captura quedó persistido, y el intento de procesamiento asociado terminó en un estado resuelto o
pendiente-de-revisión conocido"*. No significa "efecto clínico completado" ni "duplicado descartado".

Formato (JSON):

```json
{
  "ok": true,
  "data": {
    "captureId": "Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "accion": "nuevoIngreso",
    "estado": "PROCESADO",
    "motivo": "",
    "idInterno": "EC-…",
    "idEvento": ""
  }
}
```

Semántica de `data`:

| Clave | Tipo | Semántica |
|---|---|---|
| `captureId` | `string` | El mismo del payload (siempre presente). |
| `accion` | `string` | Operación reconocida (normalizada). |
| `estado` | `string` | Estado **de captura** final tras el intento (§18): `PROCESADO` · `REQUIERE_REVISION` · `RECIBIDO`/`VALIDANDO` (si el intento síncrono no completó). |
| `motivo` | `string` | Texto legible; vacío cuando `estado === 'PROCESADO'`; con explicación en `REQUIERE_REVISION`. |
| `idInterno` | `string` | ID interno de la persona afectada si el procesamiento lo determinó; vacío si no. |
| `idEvento` | `string` | ID del evento clínico creado si corresponde; vacío si no. |

`estado: PROCESADO` es la única condición en la que el mensaje de éxito de UI debe considerarse
"efecto culminado". `REQUIERE_REVISION` se comunica como advertencia con `motivo`. **[DECISIÓN]**

> **Captura rápida (aportación v2.0-delta):** el intento síncrono (§15.3) se limita al envío actual
> (TR-2 acotado de una fila); el request de captura **jamás** procesa un lote de respuestas pendientes
> (`Form_procesarPendientes` y equivalentes son procesamiento, fuera del contrato, §28). Si el intento
> acotado no puede completar, el estado devuelto es `RECIBIDO` con `motivo` explicativo y el
> reprocesamiento por lote/panel lo retoma (§23).

## 17. Respuesta de error

Cualquier rechazo devuelve `ok:false` con una lista de errores. Formato:

```json
{
  "ok": false,
  "errors": [
    {
      "codigo": "CAMPO_OBLIGATORIO_AUSENTE",
      "campo": "fechaNacimiento",
      "mensaje": "Fecha de nacimiento es obligatoria para nuevoIngreso",
      "detalle": "El valor es nulo o vacío"
    }
  ]
}
```

Reglas:

- `codigo` siempre pertenece al catálogo de §20.
- `campo` es el nombre camelCase del campo (§6), o `null` para errores no asociados a un campo
  (p. ej. `CONFLICTO_IDEMPOTENCIA`, `SINTAXIS_INVALIDA` por mal formato general).
- `mensaje` es legible por operador; `detalle` es optativo para diagnóstico técnico.
- Lista ordenada por severidad (sintaxis → estructural → semántica → negocio) y limitada a los
  errores del propio envío; se recomienda no enviar más de los errores de los campos afectados.
- Un envío rechazado **no persiste** registro de captura con efecto (solo, opcionalmente, un intento
  de diagnóstico sin datos clínicos). **[DECISIÓN]**
- `CONFLICTO_IDEMPOTENCIA` y `PERSONA_NO_ENCONTRADA` son errores/estados con semántica propia (§13,
  §18) y no se mezclan con errores de campo.

## 18. Estados

### 18.1 Estados de captura (del registro)

| Estado | Significado | ¿Terminal? | Transición a |
|---|---|---|---|
| `RECIBIDO` | Envío persistido, aún no procesado (o procesamiento síncrono interrumpido). | No | `VALIDANDO` (automático en reproceso) |
| `VALIDANDO` | Validación/procesamiento en curso (transitorio; puede no observarse). | No | `VALIDO` · `PROCESADO` · `REQUIERE_REVISION` · `ERROR` |
| `VALIDO` | Validación completada (transitorio; intermedio entre validación y efecto). | No | `PROCESADO` · `REQUIERE_REVISION` |
| `PROCESADO` | Efecto culminado: fila de ingreso procesada a `INGRESADO`, o evento clínico creado, o `actualizarDatos` completado. | **Sí** | — (no se reinicia; `Form_reiniciarRespuesta` lo bloquea) |
| `REQUIERE_REVISION` | Requiere decisión humana: duplicado de negocio, persona no encontrada, fila del pipeline en incompleto. | No (espera humana) | Solo por acción administrativa explícita (§23) |
| `ERROR` | Fracaso de validación o de procesamiento. Reintentable conforme a §13 A2 y §23. | No | `VALIDANDO` (reintento técnico, ≤ `maxReintentos = 3`) |

**[DECISIÓN]** los nombres coinciden con etiquetas históricas (`RECIBIDO`, `VALIDANDO`…) pero su
semántica queda **definida aquí**; no se hereda el contrato previo `FORM_CONFIG.ESTADOS`.

### 18.2 Separación de dominios

Los estados del **registro de captura** (§18.1) son distintos de:

- los estados del **procesamiento de la fila de ingreso** (`ESTADOS_INGRESO`: `PENDIENTE`, `VALIDANDO`,
  `LISTO`, `INGRESADO`, `DUPLICADO`, `REQUIERE_REVISION`, `ERROR`) — que viven en `INGRESO_<SECTOR>`; y
- los **estados canónicos del paciente** (`ESTADOS.VALIDOS`: `PENDIENTE`…`NSP`).

Tres conjuntos, tres ámbitos, tres autoridades. La UI de captura muestra los estados de §18.1; el
sistema interno mapea resultados del pipeline a los estados de §18.1 mediante la tabla
`Form_mapearResultadoFila` del adaptador (§25). **[CONFIRMADO]**

## 19. Transiciones

```text
                    (nuevo envío / reproceso)
                              │
                              ▼
                      ┌──► RECIBIDO ──► VALIDANDO ──► VALIDO
                      │          ▲          │            │
   Caso A1 (reintento)│          │          │            │
   resultado previo   │          │          ▼            ▼
   PROCESADO/REVISION ◄┘    ERROR ◄──┐  PROCESADO   REQUIERE_REVISION
                       (≤3 reint.)  │      │               │
                                    │      │               │ (solo admin)
                                    └──────┴───────────────┴──► VALIDANDO
```

- `ERROR` → `VALIDANDO`: reintento técnico automático (Caso A2, mismo `captureId` y payload).
- `REQUIERE_REVISION` → `VALIDANDO`: **solo** acción administrativa explícita (panel/reproceso), jamás
  automática.
- `PROCESADO` → ninguna (terminal). El backend **no** reinicia estados terminales.
- Un reintento con el mismo `captureId` y payload (Caso A1) no mueve el estado terminal: redevuelve el
  resultado almacenado.

## 20. Errores (catálogo)

| Código | Significado | `campo` típico |
|---|---|---|
| `SINTAXIS_INVALIDA` | Payload no es JSON o `captureId` con formato inválido. | `captureId` (o `null`) |
| `ACCION_INVALIDA` | `accion` no pertenece a `OPERACIONES`. | `accion` |
| `CAMPO_OBLIGATORIO_AUSENTE` | Campo `REQ` ausente, `null` o `''`. | el campo |
| `CAMPO_DESCONOCIDO` | Clave no definida en §6. | la clave |
| `CAMPO_NO_PERMITIDO` | Campo `NP` para esa operación, o campo interno/generado. | el campo |
| `TIPO_INCORRECTO` | Tipo JSON distinto del declarado en §7. | el campo |
| `ENUM_INVALIDO` | Valor fuera del conjunto §9 (incluye `sector`, `sexo`, `estratificacion`, `profesional` fuera de catálogo). | el campo |
| `FECHA_INVALIDA` | No ISO, imposible o fuera de rango (§10). | el campo |
| `RUT_INVALIDO` | RUT con DV incorrecto o formato inválido. | `rut` |
| `CAMPO_INVALIDO` | Regla semántica específica (p. ej. `profesionalSecundario === profesional`). | el campo |
| `NULL_INCORRECTO` | `null` en un campo `OPC` no-nullable. **Reservado:** hoy todos los `OPC` son nullable, por lo que no se emite. En campos `REQ` el `null`/`''`/ausencia se reporta como `CAMPO_OBLIGATORIO_AUSENTE` (§8). | el campo |
| `CONFLICTO_IDEMPOTENCIA` | Caso B (§13). | `null` |
| `PERSONA_NO_ENCONTRADA` | Op. sobre persona existente sin RUT en PACIENTES → estado `REQUIERE_REVISION`. | `rut` |
| `ERROR_INTERNO` | Falla no controlada. Nunca expone detalles con datos personales (§24). | `null` |

El contrato prohíbe inventar códigos fuera de esta tabla para respuestas de captura.

## 21. Relación con `FORM_RESPUESTAS`

- El **contrato V2 define el payload** (§6), no el esquema de ninguna hoja.
- `FORM_RESPUESTAS` es **implementación existente** del registro de capturas (persistencia) pendiente
  de redefinición contractual: su esquema actual **no es** el contrato. **[INFO: AGENTS.md]**
- La transformación explícita que, al implementar, traducirá el payload V2 al sistema interno es:

```text
PAYLOAD V2 (camelCase, §6)
   │ TR-1  mapeo nombre-estricto de campos (sin alias; ver §25)
   ▼
MODELO INTERNO NORMALIZADO
   │ TR-2  a) nuevoIngreso   → fila INGRESO_<SECTOR> (orden INGRESO_COLUMNAS; ESTADO_INGRESO vacío;
   │          FECHA DE INGRESO = fechaIngreso, escrita por encabezado;
   │          NOTA_SISTEMA = marca interna)
   │       b) control/seguimiento → registro EVENTO (orden COLUMNAS_EVENTOS) vía api_registrarEvento
   │       c) actualizarDatos → campos operativos PACIENTES + evento OTRO (fecha del evento OTRO
    │          generada por el backend como fecha de la operación, §5.2)
   ▼
FORM_RESPUESTAS (registro de captura: cabecera + crudo normalizado + trailer de resultado)
```

- El mapeo **por encabezado**, jamás por índice fijo, se mantiene como invariante operativo
  (`Form_mapeoEncabezados` / `Ingresos_mapearEncabezadosHoja`). **[CONFIRMADO]**
- **No** se asume que el esquema actual de `FORM_RESPUESTAS` sea correcto o incorrecto (AGENTS.md):
  al implementar, la tabla TR-1/TR-2 debe conservarse y el esquema podrá ajustarse sin cambiar este
  contrato.

### 21.1 Tabla de transformación de campos (TR-1)

| Campo V2 | Destino interno (normalizado) | Observaciones |
|---|---|---|
| `captureId` | `RESPONSE_ID` (adaptador) / registro | El adaptador conserva el histórico como evidencia, no como entrada V2. |
| `accion` | operación → `ACCION` (etiqueta histórica §25) | Mapeo canónico: ver tabla §5. |
| `rut` | `RUT` | Normalización `Norm_normalizarRut` (cuerpo-DV). |
| `nombre` | `NOMBRE` | `Norm_normalizarNombre` (mayúsculas, colapso, tildes). |
| `sexo` | `SEXO` | `Norm_normalizarSexo`. |
| `fechaNacimiento` | `FECHA_NACIMIENTO` | ISO. |
| `sector` | `SECTOR` / hoja `INGRESO_<SECTOR>` | Solo con puerta de ingreso. |
| `fechaIngreso` | `FECHA_INGRESO` | ISO. Sincroniza el campo `FECHA DE INGRESO` de la hoja `INGRESO_<SECTOR>` a través del modelo `INGRESO_COLUMNAS` (nombre canónico); la confirmación tras persistir relee la fila **por encabezado** (`FECHA DE INGRESO`, variantes `FECHA DE ING…`), nunca por índice fijo. |
| `estratificacion` | `ESTRATIFICACION` | Normalizador oficial. |
| `telefonos` | `TELEFONOS` | Lista `/`; prefijo país 56 removido. |
| `fechaEvento` | `FECHA_EVENTO` | ISO. |
| `profesional` | `PROFESIONAL` / `DUPLA_INGRESO` / `PROFESIONAL_SEGUIMIENTO` | Según operación. |
| `profesionalSecundario` | `PROFESIONAL2` / dupla | Debe diferir de `profesional`. |
| `observaciones` | `OBSERVACIONES` | `trim`. |
| `confirmarNuevoPaciente` | Bandera de gate del pipeline (confirma creación) | No es dato clínico. |

## 22. Relación con el procesamiento clínico

1. El contrato de captura **termina** en la entrega de: fila de ingreso (a), evento (b) o actualización
   de campos + evento (c) de TR-2. **[DECISIÓN]**
2. Todo lo posterior — identificación/recondado (`CREAR_PACIENTE` / `ENLAZAR_EXISTENTE` / `REVISION` /
   `BLOQUEADO`), deduplicación de negocio, consolidación de PACIENTES, cachés (`ULTIMO_CONTROL`,
   `PROXIMO_CONTROL`), vistas de sector, REM, dashboard, estratificación automática — es
   **procesamiento**, fuera de este contrato, y se alimenta de los datos que la captura entrega.
3. La captura **acepta** envíos cuyo procesamiento resulte `REQUIERE_REVISION` (duplicados de negocio,
   personas no encontradas). La deduplicación la decide el pipeline, no la captura: la UI puede
   pre-avisar (`previa duplicados`) como **ayuda UX**, nunca como veredicto. **[DECISIÓN]**
4. `confirmarNuevoPaciente=true` informa al pipeline la intención del operador de tratar un
   coincidente como persona nueva; el pipeline conserva la decisión final y puede seguir marcando
   `REVISION` si la evidencia es ambigua. **[DECISIÓN]**

## 23. Reprocesamiento

- **Reintento técnico**: mismo `captureId` + payload idéntico, `estado ∈ {RECIBIDO, VALIDANDO,
  ERROR}` — automático y seguro (Caso A2). Tope `maxReintentos = 3`, configurable en el backend
  como dato, no como contrato. **[DECISIÓN; evidencia `MAX_REINTENTOS=3`]**
- **Reprocesamiento clínico**: acción administrativa explícita que reinicia **solo** estados no
  terminales (`ERROR`, `REQUIERE_REVISION`, `RECIBIDO`, `VALIDANDO`) a `VALIDANDO`. **Nunca** reinicia
  `PROCESADO`. El reinicio **no cambia el `captureId`** y la protección por marcadores de negocio
  (§22) impide duplicar efectos. **[CONFIRMADO — `Form_reiniciarRespuesta`/`Form_reprocesar`]**
- Un reintento después de `PROCESADO` no reprocesa: devuelve el resultado almacenado (Caso A1).

## 24. Seguridad / autorización

1. La Web App opera con el acceso de publicación; `google.script.run` ejecuta bajo el usuario activo.
   El backend verifica que la sesión esté activa; si no hay usuario autorizado, **rechaza** con
   `ERROR_INTERNO` + motivo de acceso (sin lanzar detalles técnicos al cliente no autorizado).
   **[DECISIÓN — evidencia: `Session.getActiveUser()` puede ser vacío; limitación conocida]**
2. **No se confía en banderas del cliente.** `confirmarNuevoPaciente` es una **instrucción** validada
   y acotada (solo `nuevoIngreso`, `boolean`), jamás una acreditación; el backend revalida todo
   (duplicados, identidad, enums).
3. Los mensajes de error no exponen datos personales ni estructuras internas (hasta donde el
   procesamiento lo permite).
4. `captureId` no es secreto ni token: es identificador de envío. El backend no autoriza operaciones
   por presentarlo.
5. No hay `if (DEV/DEMO)` ni ramificación de entorno en la captura: un solo entorno operativo, un solo
   Spreadsheet (`ECICEP.SPREADSHEET_ID`). **[CONFIRMADO — AGENTS.md]**

## 25. Compatibilidad histórica (adaptador)

El contrato define el **canal nuevo**. La implementación histórica (filas `FORM_RESPUESTAS`, marcas
`FORM|…`/`UI-…`, etiquetas `NUEVO_INGRESO`…) **deja de ser especificación** pero sigue siendo dato a
migrar/interpretar. Un adaptador explícito —que se implementará con la captura V2, no en esta fase—
traduce:

| Identidad histórica | Identidad V2 | Sentido del adaptador |
|---|---|---|
| `responseId` (`UI-…`) | `captureId` | Solo lectura histórica; V2 nunca emite `UI-`. |
| `RESPONSE_ID` de fila | `captureId` | Persistencia interna (campo rebautizado), sin contrato de formato. |
| Marca `FORM|<responseId>|ACCIÓN` | Marcadores de trazabilidad internos | Generados por el backend a partir de `captureId`+operación; nunca provistos por el cliente. |
| `ACCION ∈ {NUEVO_INGRESO, …}` | `accion ∈ OPERACIONES` (§9) | Mapeo canónico en tabla §5. |
| `FORM_CONFIG.CAMPOS` (`ACCION`, `RUT`, …, `OBSERVACIONES`) | Definición exacta del §6 | El payload V2 **no** nombra `ACCION`, `RUT`, etc.; son salida del adaptador, no entrada. |
| `FORM_RESPUESTAS_COLUMNAS` | TR-1/TR-2 (§21) | Implementación, no contrato. |
| `trazabilidad`/`Form_trazabilidad`, `FORM_CONTROL` | Trazas derivadas del registro | Instrumentación administrativa, no contrato de captura. |
| Hoja `INGRESO_NARANJA` (alias) | `sector: NARANJO` | Solo alias interno de hoja; nunca valor de payload. |

## 26. Versionado

- Constante normativa: **`CAPTURE_CONTRACT_VERSION = 2`** (a declarar en `src/00_Config.js` al
  implementar). **[DECISIÓN]**
- La versión viaja implícita en el prefijo del `captureId` (`Cp2-`), de modo que identificadores de
  versiones distintas **no colisionan**. El payload **no** lleva campo de versión: el backend de ese
  deployment sirve exactamente una versión de contrato.
- Cambios incompatibles (nuevas operaciones, campos, semántica, estado, formato) incrementan la
  versión y requieren un nuevo prefijo y un adaptador. Cambios aditivos retrocompatibles pueden
  convivir bajo la misma versión únicamente si no alteran el §5.1 ni el §6.
- **Nota editorial (delta v2.0→v2.0.1, no rompe compatibilidad):** la incorporación de `fechaIngreso`
  (REQ en `nuevoIngreso`) altera el §5.1/§6 y, aplicada estrictamente, sería un cambio incompatible.
  Se mantiene **`CAPTURE_CONTRACT_VERSION = 2`** porque este delta se completa **antes del primer
  despliegue operativo de la captura V2**: no existe ningún cliente V2 en producción ni `captureId`
  `Cp2-` emitido operativamente (la Web App aún servía la ruta heredada). El §30.2 (reportar, no
  cambiar en silencio) se cumple documentando este delta aquí y en el informe de la fase. Desde el
  momento en que la captura V2 entre en operación, el §6 y el §5.1 de este documento son la única
  fuente. **[DECISIÓN — pre-primer-despliegue]**
- **Nota editorial (delta v2.0.1→v2.1, no rompe compatibilidad):** la semántica de `actualizarDatos`
  queda **explicitada** (§5.2, §6 `fechaEvento`, §21 TR-2c): el evento `OTRO` que produce lleva una
  fecha **generada por el backend** (fecha de la operación), desconectada del payload. En la v2.0 la
  redacción dejaba sin fuente la `FECHA_EVENTO` del evento `OTRO` de `actualizarDatos` (`fechaEvento`
  `NP` sin fecha alternativa), haciendo imposible implementar la operación sin inventar una fecha.
  Aplicado estrictamente altera la semántica de una operación ya redactada; se mantiene
  **`CAPTURE_CONTRACT_VERSION = 2`** porque este delta se completa **antes del primer despliegue
  operativo** de la captura V2: no existe ningún cliente V2 en producción ni `captureId` `Cp2-`
  emitido operativamente (la Web App y el E2E usaron únicamente datos sintéticos). El §30.2 (reportar,
  no cambiar en silencio) se cumple documentando este delta aquí y en el informe de la fase, con
  versión anterior (v2.0), problema, corrección y motivo. **[DECISIÓN — pre-primer-despliegue]**
- El `captureId` de una versión anterior jamás puede ser emitido por un cliente nuevo.

## 27. Casos de ejemplo (normativos)

Todos los ejemplos son normativos: un implementador debe aceptar/rechazar exactamente como aquí se
indica.

### 27.1 Payload válido — `nuevoIngreso`

```json
{
  "captureId": "Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "accion": "nuevoIngreso",
  "rut": "12345678-5",
  "nombre": "LUISA ANDREA PARRA SOTO",
  "sexo": "F",
  "fechaNacimiento": "1988-03-12",
  "sector": "AMARILLO",
  "fechaIngreso": "2026-09-01",
  "estratificacion": "G1",
  "telefonos": "+56955556666",
  "profesional": "Matrona/o",
  "observaciones": ""
}
```

### 27.2 Respuesta válida (idéntico flujo del §16)

```json
{
  "ok": true,
  "data": {
    "captureId": "Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90",
    "accion": "nuevoIngreso",
    "estado": "PROCESADO",
    "motivo": "",
    "idInterno": "EC-KXS2MP90", 
    "idEvento": ""
  }
}
```

### 27.3 Payload inválido — falta campo obligatorio

```json
{
  "captureId": "Cp2-a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "accion": "nuevoIngreso",
  "rut": "12345678-5"
}
```

→ `errors[0] = { codigo: "CAMPO_OBLIGATORIO_AUSENTE", campo: "nombre", … }`.

### 27.4 Error de campo — enum inválido

```json
{
  "captureId": "Cp2-b2c3d4e5f60718293a4b5c6d7e8f910a",
  "accion": "nuevoIngreso",
  "rut": "12345678-5",
  "nombre": "MARIA JOSE FUENTES",
  "fechaNacimiento": "1990-06-01",
  "fechaIngreso": "2026-09-01",
  "profesional": "Matrona/o",
  "sector": "AZUL"
}
```

→ `errors[0] = { codigo: "ENUM_INVALIDO", campo: "sector", … }` (único defecto del payload).

### 27.5 Reintento idempotente (Caso A1)

El cliente reenvía exactamente el payload del §27.1 (mismo `captureId`). El backend devuelve la misma
respuesta del §27.2 **sin crear efectos nuevos** (misma `idInterno`, ningún evento/duplicado).

### 27.6 Conflicto de idempotencia (Caso B)

El mismo `captureId` del §27.1 con `observaciones: "cambio el comentario"`. → 
`errors[0] = { codigo: "CONFLICTO_IDEMPOTENCIA", campo: null, … }`, `ok:false`, sin efectos.

### 27.7 Payload válido — `actualizarDatos` (sin `fechaEvento`)

```json
{
  "captureId": "Cp2-fedcba9876543210fedcba9876543210",
  "accion": "actualizarDatos",
  "rut": "12345678-5",
  "telefonos": "+56977778888",
  "profesional": "Matrona/o",
  "observaciones": "actualiza teléfono"
}
```

→ Es el payload mínimamente normativo de §5.1: no incluye `fechaEvento` (NP, §5.1). La respuesta es
`PROCESADO` con `idEvento` de evento `OTRO`; la `FECHA_EVENTO` del evento la **genera el backend**
como fecha de la operación (§5.2). El escenario **nunca** produce `fechaEvento=''` →
`FECHA_INVALIDA` ni `FECHA_EVENTO_AUSENTE` para un `actualizarDatos` válido.

## 28. Reglas que NO forman parte del contrato

Con propósito de cierre explícito; lo que sigue **no es** el contrato y no debe implementarse como
tal:

- **Google Forms** en cualquier forma (FormApp, `FORM_ID`, `onFormSubmit`, `FormResponse`,
  `FormItem`, triggers de envío, ventanas de captura por timestamp de Forms).
- **Identificadores históricos** como entrada válida: `UI-…`, `RESPONSE_ID`, `responseId`, `FORM|…`.
- **Aliases / variantes ortográficas** de nombres de campo (p. ej. `accion` vs `ACCION`, `rut` vs
  `RUT`) en el payload.
- **Fallbacks especulativos**: leer `FORM_CONFIG` o `FORM_RESPUESTAS` como especificación, adivinar
  esquemas, "mejor esfuerzo" para mensajes.
- **Lote en captura**: procesar lotes de respuestas de formulario (es procesamiento; el contrato es
  un envío intencional por `captureId`).
- **Bifurcaciones por entorno** (`DEV`/`DEMO`/`PROD`), segundo Spreadsheet, segunda base, webhooks de
  captura.
- **Lectura de datos personales en respuestas de error**, logs sin permiso, o exposición de
  `Form`/hojas técnicas en la UI de captura.

## 29. Criterios de aceptación del contrato

Este documento es aceptable si responde **sin ambigüedad** (sin consultar otro documento):

1. ¿Qué campos se envían? → §5.1 y §6.
2. ¿En qué formato exacto? → §7, §9, §10.
3. ¿Qué es obligatorio/opcional/prohibido por operación? → §5.1 y §8.
4. ¿Qué valida el backend y qué devuelve? → §14, §16, §17, §20.
5. ¿Qué significa `ok:true`? → §16.
6. ¿Qué pasa al reintentar y al reutilizar un ID con otro payload? → §13, §19, §23.
7. ¿Qué no forma parte del contrato? → §28.
8. Regla coherencia §37/§38: cada tabla/ejemplo/estado/campo tiene correspondencia en los tests.

## 30. Condición de bloqueo

- Una **contradicción interna** (entre tabla §5.1, §5.2, §6, §9, §18, §20 y ejemplos §27) o entre el
  documento y sus tests `tests/contrato_captura_v2.mjs` → **corregir el contrato** antes de aprobar.
- Una **contradicción contrato ↔ implementación histórica** → **reportar**, no cambiar en silencio el
  contrato ni la implementación (AGENTS.md; regla de no reabrir contratos invalidados sin evidencia
  nueva).

---

## Anexo A — Correspondencia regla ↔ test (§37)

Cada regla normativa debe estar cubierta por al menos un test de `tests/contrato_captura_v2.mjs`:

| Regla | Test(es) |
|---|---|
| §6/§27.1 payload Y + caso válido | `schema_valido` |
| §8 campo REQ ausente | `campo_obligatorio_ausente` |
| §5.1/§6.1 campo NP presente | `campo_no_permitido` · `campo_interno_rechazado` |
| §7 tipo incorrecto | `tipo_incorrecto` |
| §9 enum inválido | `enum_invalido` (sector/sexo/estrat/accion/profesional) |
| §10 fecha inválida | `fecha_invalida` (formato, imposible, rango) |
| §11 null incorrecto | `null_incorrecto` |
| §5 `accion` inválida | `accion_invalida` |
| §16 respuesta válida | `respuesta_valida` |
| §17/§20 respuesta de error | `respuesta_error` |
| §13 Caso A | `idempotencia_reenvio` (A1) y `idempotencia_reintento` (A2) |
| §13 Caso B | `idempotencia_conflicto` |
| §13 Caso C | `idempotencia_vs_dedupe_negocio` |
| §5.1 matriz | `matriz_consistente` · `campo_permitido_por_operacion` |
| §5.2 fecha del evento `OTRO` de `actualizarDatos` | `actualizar_otro_fecha_backend` · `actualizar_otro_sin_fecha_evento` |
| §18/§19 estados y transiciones | `estados_cerrados` · `transicion_terminal_no_reinicia` |
| §26 versionado | `version_constante` |
| §25 adaptador | `sin_identificadores_historicos_en_payload` |

## Anexo B — Verificación implementación ↔ contrato (§38)

Alcance de esta fase, sin implementación nueva. `tests/contrato_captura_v2.mjs` carga la
implementación existente y verifica **solo lo verificable**:

1. **Modelo referenciado**: los enums/rangos/estados citados en §9–§10 existen tal cual en
   `src/00_Config.js` (`SECTORES_RESPONSABLES`, `SEXOS.VALIDOS`, `ESTRATIFICACION`, `CFG_FECHAS`,
   `TIPOS_EVENTO.VALIDOS` ⊇ {CONTROL, SEGUIMIENTO, OTRO}). 
2. **Puertas y columnas**: `INGRESO_COLUMNAS` (ubicación y orden) y `COLUMNAS_EVENTOS` soportan TR-1/TR-2.
3. **Separación de estado**: `ESTADOS_INGRESO` y `MODELO_PACIENTE` existen como conjuntos distintos
   del estado de captura (§18.2).
4. **No-colisión**: los identificadores V2 (`nuevoIngreso`, `captureId`, `Cp2-`, campos camelCase) no
   existen como contratos de entrada en la implementación actual (la cual expone `NUEVO_INGRESO`,
   `RESPONSE_ID`, `UI-`…), demostrando que el contrato nuevo no duplica silenciosamente el viejo.
5. **Rechazo del canal antiguo como entrada V2**: `Form_validarRespuesta` (implementación histórica)
   rechaza un payload V2 camelCase sin adaptador → confirma que el adaptador (§25) es obligatorio y no
   hay alias silencioso.

Cuando se implemente la captura V2, esta verificación incorporará acepta-permitidos/rechaza-prohibidos
sobre el backend real.