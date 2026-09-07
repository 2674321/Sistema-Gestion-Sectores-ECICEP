# INFORME P0 — BASELINE REAL Y PLAN DE IMPLEMENTACIÓN

**Fecha:** 2026-09-07
**Fase:** P0 — cierre de baseline real y preparación de implementación.
**Categorías:** `HECHO` (comprobado directamente) · `OBSERVADO` (visto durante ejecución) · `INFERIDO` (conclusión técnica) · `RECOMENDADO` (propuesta futura).
**Regla ejecutada:** NO se implementó funcionalidad nueva, NO se modificaron contratos/estructura/productivos/deployments/datos reales/lógica/UI/REM/dashboard. La única publicación realizada fue el **cierre de S5 en Git** (sin push, sin deploy nuevo).

**Limitación de medición real:** el entorno no dispone de permisos para leer el libro: `clasp run` → *"Unable to run script function. Please make sure you have permission to run the script function."*; la API `script.projects.run` y Sheets API también fallaron por scopes en ejecuciones anteriores. Por lo tanto toda magnitud real de `PACIENTES`/sectores se marca **NO MEDIBLE EN ESTA EJECUCIÓN** y **NO se sustituye por estimaciones**. Dónde hay evidencia (datos reales pegados en fase S5, conteos de código, tests), se indica como tal.

---

## 1. Estado general

- `HECHO` — S0–S5 vigentes; S6 (auditoría) entregó `INFORME_S6.md` (26 secciones). Esta fase P0 es el primer corte de cierre de baseline.
- `HECHO` — Batería completa **734/734 verdes** ejecutada en vivo para el cierre de S5: núcleo 489 · captura V2 36 · backend V2 65 · cola 33 · formulario web 25 · UI payload 16 · aceptación 50 · contrato datos 20.
- `HECHO` — Sistema de **entorno único** (AGENTS.md, DEC-049/052/053): un proyecto Apps Script, un Spreadsheet, una Web App (canal único de captura), Sheets = operativo interno. `00_Config.js:20` (`AMBIENTE:'DESARROLLO'`) es legado y se resuelve vía `25_Entorno`/ENTORNO.md.
- `HECHO` — Existe hoja **INICIO** (portada/navegación) construida por `Hojas_crearInicio` (`src/17_Hojas.js:95`), integrada al instalador (`Instalar_pInicio`, `20_Instalador.js:110`) y protegida del limpiador de hojas residuales (`10_Pruebas.js:2138`).
- `OBSERVADO` — La medición real (conteos) queda en §4–§5; el resto de hechos estructurales ya está documentado en la sección correspondiente.

## 2. Git / S5

- `HECHO` — S5 quedó **cerrada en Git** con commit:
  - **hash:** `ea6f9a4`
  - **mensaje:** `feat(s5): enriquecimiento demografico de PACIENTES como etapa del instalador (v93)`
  - **archivos (15):** `ARQUITECTURA.md`, `DECISIONES.md`, `MODELO-DATOS.md`, `PENDIENTES.md`, `src/07_UI.js`, `src/10_Pruebas.js`, `src/20_Instalador.js`, `src/Instalador.html`, `src/27_Actualizacion.js` (nuevo), `INFORME_S5.md` (nuevo), y 5 harnesses (`tests/ejecutar_local.mjs`, `captura_backend_v2.mjs`, `captura_ui_payload_v2.mjs`, `cola_form_respuestas.mjs`, `contrato_datos.mjs`).
  - **736 inserciones / 11 eliminaciones.**
- `HECHO` — **Excluidos del commit** (correctamente): `INFORME_S6.md` (entregable S6, quedará en su commit) y `docs/hoja_de_vida.pdf` (archivo ajeno/temporal no rastreable).
- `HECHO` — Los cambios del working tree corresponden a lo publicado en **v93**: `INSTALAR_ETAPAS` contiene `enriquecimiento` antes de `verificar` (`20_Instalador.js:21-22`); `Instalar_pEnriquecimiento` delegada en `Act_enriquecerPacientes({dryRun:false})` (`20_Instalador.js:140-150`); `UI_actualizarSistema` conserva su rol (comentario + test de wiring `10_Pruebas.js:4235-4238`). No se pudo comparar hash por API (sin permisos), pero el deploy v93 se realizó desde este árbol en la fase S5 (`INFORME_S5.md §12`).
- `OBSERVADO` — Tras el commit, el árbol queda sucio únicamente con `INFORME_S6.md` y `docs/hoja_de_vida.pdf` (intencionales).
- `OBSERVADO` — **DEC-057** en `DECISIONES.md` contiene datos de tests obsoletos ("núcleo 469 → 487; 732") frente al cierre final (489/734) y su "Motivo" aún dice "dentro de la operación administrativa existente UI_actualizarSistema" antes de documentar la corrección en el ítem 6. Es deuda documental menor.
- `INFERIDO` — `Rem9_edadEn`·`14_REM` y DEC-057 tienen descuidos textuales que confunden al próximo lector.
- `RECOMENDADO` — (a) No hacer push todavía (no hay política explícita de push automático en este repo; confirmar). (b) En un pase cosmético futuro, alinear DEC-057 al cierre real (489/734, ubicación instalador). (c) Archivar/ignorar `docs/hoja_de_vida.pdf` o depurarlo.

## 3. Tests

- `HECHO` — Regresión completa en vivo (2026-09-07), antes del commit S5:

| Harness | Total | OK |
|---|---:|---:|
| `tests/ejecutar_local.mjs` (núcleo) | 489 | 489 |
| `tests/contrato_captura_v2.mjs` | 36 | 36 |
| `tests/captura_backend_v2.mjs` | 65 | 65 |
| `tests/cola_form_respuestas.mjs` | 33 | 33 |
| `tests/formulario_web.mjs` | 25 | 25 |
| `tests/captura_ui_payload_v2.mjs` | 16 | 16 |
| `tests/aceptacion_formulario.mjs` | 50 | 50 |
| `tests/contrato_datos.mjs` | 20 | 20 |
| **Total** | **734** | **734** |

- `HECHO` — Los harnesses cargan `src/00_Config.js` y las sustituciones de pila en modo local; no requieren `package.json`. Comandos canónicos de AGENTS.md: `ejecutar_local`, `aceptacion_formulario`, `contrato_captura_v2`.
- `OBSERVADO` — No hay tests de integración contra el libro real ni E2E automatizado de la Web App (queda en validación manual). No se modificó ningún test para obtener verde.
- `RECOMENDADO` — Mantener 734/734 como umbral de corte de fase; agregar más adelante un harness "baseline real" opcional que requiera credenciales.

## 4. PACIENTES — baseline real

- `HECHO` — Esquema vigente `MODELO_PACIENTE` (**30 campos**, `00_Config.js:869-899`); columnas: SEXO col 4, FECHA_NACIMIENTO col 5, FUENTE col 28, FECHA_ACTUALIZACION col 29, REQUIERE_REVISION col 30, ID_INTERNO/RUT/NOMBRE cols 1-3. **Nota de consistencia:** docs y comentarios de código dicen "29 campos" (`ARQUITECTURA.md:63`, `12_Ingresos.js:62`); la definición real tiene 30 — deuda documental menor (ver §14.4).
- `HECHO` — El pipeline de captura V2 escribe `SEXO` y `FECHA_NACIMIENTO` (`WebApp.gs:79-80`, campos `sexo`/`fechaNacimiento` del contrato V2, `docs/CONTRATO_CAPTURA_V2.md:528-529`); S5 enriquece campos vacíos desde `INGRESO_*`.
- `HECHO` — `EDAD` **nunca** se almacena: es derivada en vivo vía `Utl_edadDesde` (`src/01_Utilidades.js:44`). No existe columna EDAD persistida en el modelo.
- `OBSERVADO` — Data real pegada en fase S5 (evidencia directa de escritura del pipeline/S5 sobre el libro):
  - `EC-MTP3GRBD-G0SG` · RUT `30123456-2` · SEXO `F` · FECHA_NACIMIENTO `1990-01-01` · FUENTE `HOJA_INGRESO|INGRESO_NARANJO|14` · FECHA_ACTUALIZACION `2026-09-07`.
  - `EC-MTN80DG9-MHJI` · RUT `21889985-4` · SEXO `M` · FUENTE `HOJA_INGRESO|INGRESO_AMARILLO|…` · FECHA_ACTUALIZACION `2026-09-05`.
  - `EC-MTP45QSI-3UT3` · RUT `30123457-0` · SEXO `F` · FECHA `1990-01-01` · FUENTE `HOJA_INGRESO|INGRESO_AMARILLO|…`.
  - `EC-MTR7FJY3-B6NB` (E2E S4) · SEXO `M` · FECHA `1990-05-05` · FUENTE `HOJA_INGRESO|INGRESO_AMARILLO|1071`.
- **NO MEDIBLE EN ESTA EJECUCIÓN** (sin permisos al libro): total de pacientes, con/sin SEXO, con/sin FECHA_NACIMIENTO, con/sin EDAD almacenada (nunca existe), con/sin FUENTE, con/sin FECHA_ACTUALIZACION, pacientes por sector.
- `RECOMENDADO` — Ejecutar en sesión con permisos: `Act_diagnosticarEnriquecimiento` (dry-run, `src/27_Actualizacion.js:305`) + métricas de `18_Calidad`/`21_Auditoria` (#21/#30 de PENDIENTES). Llenar la tabla de §15 con esos números.

## 5. Sectores — baseline

- `HECHO` — Sectores reales: **NARANJO, AMARILLO, VERDE** (`HOJAS_SECTOR`, `SECTOR_NARANJO/AMARILLO/VERDE`). El sistema tolera `MULTIPLE` como transitorio (`MODELO-DATOS.md` SECTOR) y `DESCONOCIDO`/vacío para el resto.
- `HECHO` — Vistas refrescadas por `Modelo_refrescarVistasSectores` (`src/06_Modelo.js:1400`), invocada en el pipeline (`12_Ingresos.js:566`, `16_Amarillo.js:308`, `03_Fuentes.js:534`, instalador `20_Instalador.js:90`, Webhook `refrescar`).
- `HECHO` — `HOJAS_AUTORIZADAS_CARGA` mapea fuentes→sector (Naranjo: `Ingresos Enero`/`Ingreso Febrero`/`Ingresos 2025-2026`; Verde: `PLANILLA ECICEP SECTOR VERDE`/`PLANILLA PRE INGRESOS`/`CONTROLES PENDIENTES`); Amarillo usa histórico `16_Amarillo.js` (sin inventar).
- **NO MEDIBLE EN ESTA EJECUCIÓN** — Conteos por sector, SEXO OK/F.N. OK/EDAD OK por sector, última actualización por sector (requiere lectura del libro).

| Sector | Pacientes | Sexo OK | F.N. OK | Edad OK | Edad dinámica | Pendientes |
| ------ | --------: | ------: | ------: | ------: | ------------- | ---------: |
| NARANJO | NO MEDIBLE | NO MEDIBLE | NO MEDIBLE | NO MEDIBLE | Sí (derivada en vivo) | REV. MANUAL |
| AMARILLO | NO MEDIBLE | NO MEDIBLE | NO MEDIBLE | NO MEDIBLE | Sí | REV. MANUAL (histórico sin SEXO/F.N. en varias filas) |
| VERDE | NO MEDIBLE | NO MEDIBLE | NO MEDIBLE | NO MEDIBLE | Sí | REV. MANUAL (duplicado histórico `NO LLENAR`, #3) |

- `RECOMENDADO` — Completar la tabla con una corrida `Webhook.refrescar`/`UI_actualizarTodo` en sesión autorizada; reportar por sector en el informe de cierre de la fase siguiente.

## 6. SEXO — fuente de verdad

- `HECHO` — Fuente canónica demostrada por el código:
  **`INGRESO_* (hojas de captura) → pipeline (V2) / S5 enriquecimiento → columna SEXO de PACIENTES.`**
  - CAPTURA V2: campo `sexo` del payload → `WebApp.gs:79` → PACIENTES.
  - S5: `CAMPOS_ENRIQUECIMIENTO=['SEXO',…]` (`27_Actualizacion.js:30`) con catálogo `SEXOS.VALIDOS=[M,F,OTRO]` + sinónimos (`00_Config.js:856`; `Norm_normalizarSexo`, `02_Normalizacion.js:340`); desconocido → `''` (nunca se inventa).
  - Dropdown SEXO en PACIENTES/INGRESO_*/SECTOR_* (`17_Hojas.js:405-438`).
- `INFERIDO` — La única autoridad que puede producir un valor válido es el dato legible en una fuente `INGRESO_*` con RUT canónico; nada infiere por nombre.

## 7. FECHA_NACIMIENTO — fuente de verdad

- `HECHO` — Fuente canónica:
  **`INGRESO_* (hojas de captura) → pipeline (V2) / S5 enriquecimiento → columna FECHA_NACIMIENTO de PACIENTES`** (ISO, rango `[1900,2040]`, `CFG_FECHAS`). Date picker en `INGRESO_*` (`17_Hojas.js:455`).
- `HECHO` — Cualquier fecha fuera de rango o no ISO se omite (no se corrige en silencio); detección de inválidas en `18_Calidad.js:762-763` y `21_Auditoria.js:115-116`.
- `INFERIDO` — Histórico Amarillo es la principal fuente de vacíos pre-S5; tras S5, vacíos ≈ "sin fuente" o "conflicto".

## 8. EDAD — dato derivado

- `HECHO` — **`EDAD` es dato derivado de `FECHA_NACIMIENTO` mediante `Utl_edadDesde`** (`01_Utilidades.js:44`), consciente del cumpleaños, rango 0–129, `''` si fecha ausente/inválida/futura-posterior-130. Nunca se almacena (decisión previa: `DECISIONES.md:195`; S5 la refuerza).
- `HECHO` — Se usa en: Ficha (`06_Modelo.js:1248`, `07_UI.js:1133`), Panel/Sidebar (`Sidebar.html:472`), REM (edad a la atención, `10_Pruebas.js:1849`), Auditoría (`21_Auditoria.js:113,424`).
- `RECOMENDADO` — **No permitir que una edad calculada se convierta en fuente maestra**: no crear columna EDAD ni fórmula que escriba su valor; SIEMPRE derivarla al momento de leer. Opcional futuro: `Utl_edadDesde(FECHA_NACIMIENTO, fechaEvento)` para vistas "edad a la fecha".

## 9. Fuentes de verdad — resumen

| Dato | Fuente canónica | Naturaleza | Escritura permitida |
|---|---|---|---|
| SEXO | `INGRESO_*` → captura V2 / S5 | Maestro (solo vacíos en S5) | automática si válida; si conflicto → REVISION |
| FECHA_NACIMIENTO | `INGRESO_*` → captura V2 / S5 | Maestro (solo vacíos en S5) | automática si ISO ∈ [1900,2040] |
| EDAD | derivada de FECHA_NACIMIENTO | Derivado | jamás en disco |
| ID_INTERNO / RUT | generado / normalizado | Maestro técnico | pipeline |
| NOMBRE, TELEFONOS, SECTOR, ESTADO, ESTRATIFICACION | fuentes/eventos vigentes | Maestro (no tocar en S5) | existente |

## 10. Reglas de precedencia

- `HECHO` — Precedencia definida por S5 y el pipeline (auditadas en código, `27_Actualizacion.js:76-280`):

```text
CAPTURA V2 (Web App)  ← primer valor válido por RUT canónico
   ↓
INGRESO_* (hojas, layout visual)  ← misma fuente, primer valor válido
   ↓
SECOND FUENTE con valor IGUAL  → consistente, se conserva la primera FUENTE
SECOND FUENTE con valor DISTINTO → CONFLICTO → REQUIERE_REVISION (sin escribir)
   ↓
SIN FUENTE  → celda queda vacía (NO COMPLETAR / no se infiere)
```

- `HECHO` — Reglas de escritura: solo campos vacíos; `RUT` canónico exacto (un RUT sin DV en la fuente no fabrica match); idempotente (segunda ejecución sin cambios); trazabilidad: append `ENRIQUECIMIENTO|<hoja>|<fila>` en FUENTE (sin duplicar) + `FECHA_ACTUALIZACION` + `Log_info`.
- `RECOMENDADO` — Formalizar esta precedencia explícitamente en `MODELO-DATOS.md` y en el contrato de la próxima implementación (sin cambiar código).

## 11. Datos pendientes

- `HECHO` — Matriz conceptual (todas las magnitudes reales NO MEDIBLES aquí; base para próximo sprint):

| Campo | Total | Vacíos | Fuente disponible | Automático | Manual | No completar | Prioridad |
| ------ | ----: | -----: | ----------------- | ---------- | ------ | ------------ | --------- |
| SEXO | NO MEDIBLE | NO MEDIBLE | Sí (INGRESO_* / V2) | Sí (S5/vacio) | — | Según precedencia | P1 |
| FECHA_NACIMIENTO | NO MEDIBLE | NO MEDIBLE | Sí (INGRESO_* / V2) | Sí (S5/vacio) | — | Fechas no ISO/futuras >130 | P1 |
| EDAD | NO MEDIBLE (nunca existe) | NO MEDIBLE (derivada) | FECHA_NACIMIENTO | Sí (derivación) | NO | Nunca se escribe | P0 (consistencia) |
| DUPLA/PROFESIONAL | NO MEDIBLE | NO MEDIBLE | EVENTOS/CONTRATOS | — | — | — | P2 |
| ESTRATIFICACION (G) | NO MEDIBLE | NO MEDIBLE | Catálogo #14/#15 | Motor G (apagado en V2) | — | Hasta decisión #15 | P1 |
| Condiciones/patologías | — | — | Catálogo #14 (pendiente) | — | — | — | P1 |

- `RECOMENDADO` — Reemplazar cada "NO MEDIBLE" en sesión autorizada con el conteo real del libro.

## 12. Calidad de datos

- `HECHO` — Mecanismos existentes: `18_Calidad.js` (lllenado + fechas), `21_Auditoria.js` (reglas de consistencia de edad), cola `REQUIERE_REVISION`/`CONFLICTOS`/`POSIBLE_DUPLICADO` con UI (`Sidebar.html` mode='revision', PENDIENTES #21 resuelto), deduplicación por FUENTE validada (cerrado), auditoría histórica `AUDITORIA_ESTABILIZACION.md`.
- `HECHO` — S5 produce datos de calidad: conflictos SEXO/FECHA → REVISION sin escritura; dry-run diagnostica `enriquecidos/aplicados/conflictos`.
- **NO MEDIBLE EN ESTA EJECUCIÓN** — duplicados reales, conflictos reales de sexo, fechas inválidas reales, edades imposibles reales, fechas futuras, pacientes sin sector/sector inválido, huérfanos.
- `INFERIDO` (clasificación **sin corrección**):
  - **P0:** edades imposibles/futuras si existieran (impacto REM). No hay evidencia de existencia.
  - **P1:** fechas inválidas y conflictos de sexo (REVISION) — ya detectables; resolver vía cola.
  - **P2:** duplicados residuales, huérfanos y sectores desconocidos.
  - **P3:** limpieza estética (NO LLENAR, formato heredado #3/#32).
- `RECOMENDADO` — Producir el semáforo de calidad con lectura autorizada (métricas `18_Calidad`/`21_Auditoria`) Y SOLO LUEGO decidir correcciones en la fase de implementación; en esta fase NO se corrige nada.

## 13. Actualizar sistema (auditoría S5)

- `HECHO` — `UI_actualizarSistema` (`07_UI.js:149`): diagnostica (`Instalar_diagnosticar`), pregunta al usuario fases pendientes/al-día y, si confirma, llama `UI_instalarSistema()` (que es el panel `Instalador.html` con `INSTALAR_ETAPAS`).
- `HECHO` — **El enriquecimiento S5 NO vive en Actualizar sistema**: es la etapa `enriquecimiento` (`20_Instalador.js:21`) del instalador, ejecutada por `Instalar_pEnriquecimiento` → `Act_enriquecerPacientes({dryRun:false})`, **antes** de `verificar`. Resumen mostrado en pantalla final (`Instalador.html:183-190`).
- `HECHO` — Funciones S5 (`src/27_Actualizacion.js`): `Act_enriquecimientoCampos` (:32), `Act_leerOrigenesDesdeBloques` (:76, puro), `Act_normalizarCandidato` (:50s, puro), `Act_aplicarEnriquecimiento` (:144, puro), `Act_enriquecerPacientes` (:182, GAS, dry-run por defecto), `Act_enriquecerPacientePorRut` (:262, unitario, jamás crea pacientes), `Act_diagnosticarEnriquecimiento` (:305, dry-run).
- `HECHO` — Registro: `Log_info('Actualizacion','enriquecerPacientes',{dryRun,enriquecidos,aplicados,conflictos})` (:262+), append FUENTE, estampa FECHA_ACTUALIZACION. Errores controlados: sin fuente → nada; conflicto → REVISION; RUT no encontrado → `PACIENTE_NO_ENCONTRADO` (unitario).
- `HECHO` — Limitaciones: solo completa vacíos; depende de hoja fuente con RUT válido + encabezados compatibles; batch escribe el bloque PACIENTES completo (precedente); no trate Form, contrato V2, captureId ni deployments.
- `INFERIDO` — Esta estructura (mecanismo general de instalación/actualización) es la base natural para futuras automatizaciones; NO hace falta rediseñarla ahora.
- `RECOMENDADO` — Convertir `Act_*` puros en "núcleo de actualización" (conservará la precedencia §10), pero no tocar todavía.

## 14. Deuda técnica confirmada

### 14.1 `Rem9_edadEn`
- `HECHO` — Existe **una sola definición**: `src/15_RemExcel.js:75`, usada en exportación Excel de REM (`:120` edad a última fecha, `:137` edad a la fecha del evento). Es una **duplicidad lógica** respecto de `Utl_edadDesde` (misma regla de años cumplidos, rango < 130, `''` si inválida), pero con firma distinta (recibe ISO como referencia, mientras `Utl_edadDesde` recibe `Date` inyectable).
- `INFERIDO` — Riesgo de divergencia futura si se tocara una sin la otra; hoy ambas son correctas y probadas (REM Excel: tests `10_Pruebas.js:1886-1931`; edad: `:2463-2466,:4047-4052`).
- `RECOMENDADO` — Consolidar en `Utl_edadDesde` (añadir overload de fecha ISO o wrapper) — #34, BAJA. No urge.

### 14.2 `14_REM.js:299` ("BLOQUE B — DEMOGRAFÍA: NO DISPONIBLE (#14 — sin FECHA_NACIMIENTO/SEXO en fuentes)")
- `HECHO` — La nota se escribe **incondicionalmente** al generar REM (`14_REM.js:299`), NO depende de datos reales. Y la justificación citada (#14 'sin FECHA_NACIMIENTO/SEXO en fuentes') **ya no es exacta**: captura V2 y S5 demuestran que SEXO/FECHA _sí_ existen en PACIENTES desde fuentes legítimas (ver §6/§7 y evidencia real §4). Además `Rem9_sexoRem` (15_RemExcel.js:85) y `Rem9_edadEn` demuestran que la demografía ya se puede computar en Excel.
- `OBSERVADO` — El bloque B del REM de Sheets simplemente **no se implementó**; la nota congeló su ausencia con una razón histórica.
- `INFERIDO` — Era verdadero cuando se escribió; **hoy es obsoleto como justificación**, aunque el hecho funcional (REM Sheets no emite bloque B) sigue siendo cierto.
- `RECOMENDADO` — PENDIENTES #14 (catálogo de condiciones) sigue vigente; la demografía (SEXO/EDAD/TRAMO) ya debería poder salir del REM. Propuesta futura: reemplazar la nota por "BLOQUE B — DEMOGRAFÍA: PENDIENTE DE IMPLEMENTACIÓN (datos disponibles desde PACIENTES)" y generar el bloque en la fase de REM. No eliminar sin implementar.

### 14.4 Inconsistencia "29 vs 30 campos" en PACIENTES
- `HECHO` — `MODELO_PACIENTE` define **30** campos (`00_Config.js:869-899`), pero `ARQUITECTURA.md:63` y el comentario de `12_Ingresos.js:62` dicen **29**. El esquema real tiene además columnas con posición clave (FUENTE 28, FECHA_ACTUALIZACION 29, REQUIERE_REVISION 30) que difieren de lo que asumen otras referencias históricas.
- `INFERIDO` — Riesgo BAJO (no afecta lógica que lee por nombre de campo, no por número); costo: lectores/migradores se confunden.
- `RECOMENDADO` — Alinear docs/comentarios con la definición real (30) en un pase de limpieza; no cambia contrato.

### 14.3 CSS tokens #33
- `HECHO` — `00_Tokens.html` define variables CSS (`--primary`, `--sector-*`, espacios, radios, sombras) y es incluido por 13 páginas dinámicas. Aun así existen **~132 colores hex hardcodeados** en 12 HTML: CapturaWeb 40, QRFormulario 27, Sidebar 18, Dashboard 16, Backup 9, etc.
- `OBSERVADO` — `QRFormulario.html` (2419 líneas, 27 cores) es una página **estática autónoma** sin `include('00_Tokens')` (no es servida vía HtmlService); allí los colores hardcodeados no migran trivialmente a tokens.
- `INFERIDO` — Riesgo BAJO (cosmético); riesgo MEDIO a futuro si se cambia la marca (colores difieren entre páginas). No es error funcional.
- `RECOMENDADO` — #33 como tarea P3-BAJA, en dos tandas: (a) páginas dinámicas con tokens; (b) decisión para QRFormulario (token embebido manual o dejar atómico).

## 15. Deployments — inventario

- `HECHO` — `clasp deployments` (4):

| Deployment | URL / uso | Versión | Rol estimado | Evidencia | ¿Retirable? |
|---|---|---:|---|---|---|
| `AKfycbwd7PkYNWEmglmOqkqgxEw14jTZkTK3O-FgiP3JTVTT` | `/dev` (`@HEAD`) — la que usa `ECICEP.WEB_APP_URL` (`00_Config.js:22`), QR y menú "Abrir formulario" | HEAD (=última push, hoy v93) | **lead/referencia** (sirve código recién pusheado) | config + QR + UI | No sin decisión (ver s17) |
| `AKfycbx2LvLy7c3xUVWcPWzy4DsVTaSFR0ldtoKNfyM-3M7cYOMjyBvf_5fFrkKU47UGz9PS6A` | `/exec` `@89` | 89 | **legacy/desconocido** | versionado histórico | Posible (verificar URL/QR) |
| `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` | `/exec` `@93` | 93 | **OPERATIVO (Web App de captura)** | deployment del cierre S5 (INFORME_S5 §12) | No |
| `AKfycbxIm10Zo0utnRZ9LYIedZzvdc8rZk2ZCbZjSPfK6n_OHUkrgr8QTo3BqvJrQGcck43dUQ` | `@86` (test) | 86 | **test** | nombre 'test' en deployment | Verificar antes de retirar |

- `HECHO` — `clasp versions` llega a v93; v91 nominada "S4 - captura V2 estabilizada (714 tests)"; v92/v93 sin descripción.
- `OBSERVADO` — **Hallazgo relevante:** `ECICEP.WEB_APP_URL` apunta al deployment `@HEAD /dev`, NO al operativo `@93 /exec`. Hoy coinciden en código (HEAD = última push = v93), pero el QR distribuible y el menú "Abrir formulario de captura" exponen futuras pushes sin pasar por el deployment operativo → **riesgo de divergencia de versión**.
- `INFERIDO` — `@89` podría estar sin uso operativo, pero NO se verificó qué URL/QR lo invocan (requiere sesión); NO se elimina (prohibido esta fase).
- `RECOMENDADO` — (a) Decidir cuál URL es la operative de captura y alinear `ECICEP.WEB_APP_URL` a ella (candidato: `@93 /exec`). (b) Documentar en ENTORNO.md. (c) Retirar `@89`/`@86` solo tras verificación de dependencias, en fase de limpieza explícita.

## 16. Versionado — modelo

- `HECHO` — Nociones que existen hoy:
  - **APP**: `ECICEP.VERSION = '0.9.3'` (`00_Config.js:19`) — semántica manual; la consumen UI/WebHook/WebApp/INICIO/LOG y el prefijo de cache `ECICEP:v093:` (`00_Config.js:1146`).
  - **BUILD**: `ECICEP_BUILD = {commit, fecha}` (`src/BUILD.js`, estático) + `t.BUILD` dinámica (timestamp por render en `07_UI.js:89,184,353,364,431`).
  - **CONTRATO**: `CAPTURE_CONTRACT_VERSION = 2` (`00_Config.js:751`), registrado por fila en `FORM_RESPUESTAS` (columna FORM_VERSION) y expuesto al frontend.
  - **DEPLOY/VERSIÓN SCRIPT**: Apps Script v93; deployments @HEAD/@89/@93/@86.
  - **DATA**: metadatos en INICIO/LOG/CONFIG (06_Modelo escribe 'VERSION' y fechas).
- `INFERIDO` — La versión DATA es la más difusa: no hay número de esquema de hoja independiente (el modelo está en código). VISUAL no tiene versión propia (tokens con marca única).
- `RECOMENDADO` (diseño futuro, fuera de alcance) — Autoridades mínimas:

```text
APP       0.9.x → 1.x   (autoridad: 00_Config + regla de bump semántico)
LOGIC     = APP (no separar por ahora; evolución de reglas se sigue por DEC)
CONTRACT  2 (major only; autoridad: docs/CONTRATO_CAPTURA_V2.md + 26_Captura)
DATA      = APP (el esquema es código; no crear versionador de esquema independiente)
VISUAL    = tokens (marca única, sin versión propia)
DEPLOY    versión Apps Script (sigue a push+deploy)
```

- `RECOMENDADO — No implementar aún`; dejar articulado para la fase de versionado formal.

## 17. UI/UX — diagnóstico (sin rediseño)

- `HECHO` — Interfaz actual: menú ECICEP (Panel de Control, Personas/Ficha/Cola de revisión/Duplicados, Seguimiento y controles, Reportes —Estadísticas, REM—, Configuración, 🔍/🔄/⚙️/🧪/💾/📥/📄/ℹ️), hoja **INICIO** (portada con KPIs, metadatos, navegación — `Hojas_crearInicio`), vistas de sector con formato/dropdowns/date-pickers, Sidebar/Ficha/Controles/Dashboard, e `Instalador.html` con etapas y resumen final. Web App `CapturaWeb.html` = único canal de captura (contrato V2, captureId `Cp2-`+32hex).
- `HECHO` — El usuario/administrador conoce la versión por: INICIO (tabla Versión/Build/Actualización, `17_Hojas.js:337-339`), menú v + toast (`07_UI.js:51`), diagnóstico (`:112`), instalador (`Instalador.html:42`), y estado del sistema por diagnóstico/INICIO. No hay indicador visible de estado de datos (lllenado/REVISION) en la portada salvo los KPIs de cada sector.
- `P0` (pueden provocar errores):
  - `ECICEP.WEB_APP_URL` → `@HEAD/dev` en vez del operativo (QR/menú apuntan al deployment incorrecto; divergencia tras un push no publicado) — **§15**.
  - Cola de revisión/conflictos solo visible si el usuario entra al submenú; no hay contador en INICIO (riesgo de REVISION olvidada).
- `P1` (navegación/comprensión):
  - INICIO sin contadores de calidad (SEXO/FECHA vacíos, REVISION, duplicados) que hoy conocen solo los informes.
  - Etiqueta NARANJO vs NARANJA sin decidir (#12).
  - Nota REM "BLOQUE B demografía NO DISPONIBLE" engaña al lector (ver 14.2).
- `P2` (visual): colores hardcodeados frente a tokens (#33); `QRFormulario` sin tokens.
- `P3` (futuro): dashboard consolidado (#7), home mejorada sobre INICIO (#18), accesibilidad (focus ya en tokens), REM con demografía real (14.2).
- `RECOMENDADO` — No rediseñar; adoptar primero: fijar `WEB_APP_URL`, indicadores de estado en INICIO, y discriminar correctamente notas REM. Esto es la capa de "explotación" del roadmap.

## 18. Arquitectura objetivo (propuesta, sin implementar)

```text
FUENTES (hojas INGRESO_* + captura V2)
   ↓
PACIENTES (maestro; SEXO/FECHA_NACIMIENTO normalizados; FUENTE/FECHA_ACTUALIZACION)
   ↓
DATOS DERIVADOS (EDAD por Utl_edadDesde en lectura — NUNCA en disco; tramos/condiciones #14/#15)
   ↓
SECTORES (SECTOR_* refrescadas por Modelo_refrescarVistasSectores)
   ↓
DASHBOARD / INICIO (KPIs + contadores de calidad)
   ↓
REM (bloques con demografía real cuando se implemente)
```

```text
CAPTURA (Web App V2 — canal único) ──┐
  ↓                                  │
FORM_RESPUESTAS (implementación) ────┤
  ↓                                  │
PROCESAMIENTO (pipeline, idempotente)┤
  ↓                                  │
PACIENTES ───────────────────────────┼──> ACTUALIZAR SISTEMA (instalador + etapas,
  ↓                                  │      incluido enriquecimiento S5)
SECTORES/EVENTOS ────────────────────┘
```

- `RECOMENDADO` — No crear segunda base/datamart: reportes desde `REM_SALIDA`/dashboard; toda automatización futura debe anclarse al pipeline existente (DEC-055 acotado de filas) y respetar la precedencia §10.

## 19. Roadmap (según dependencias reales)

`RECOMENDADO` — Fases sugeridas (evitar suponer S7/S8/S9; aquí dependencias verdaderas):

1. **F1 Consistencia/seguridad de datos** (P0/P1): cierre Git de S6 (commit), medición real con sesión autorizada (tabla §5/§15), alinear `ECICEP.WEB_APP_URL` al deployment operativo, decidir deployments.
2. **F2 Completar fuentes reales** (#25/#26/#28/#11): campos REM ausentes sin inventar; cierre histórico Amarillo; revisión de fuentes; catálogo condiciones (#14).
3. **F3 Automatización** (#15/#6/#4/edad): umbrales G, estados canónicos, edad automática en todos los sectores (derivada en vivo; fórmula/tabla según §10 recomendación, evitar dato maestro), fecha_nacimiento cuando exista (S5 ya cubre vacíos).
4. **F4 UI/UX** (P0→P1→P2): corregir URL, indicadores INICIO, cola visible, tokens (#33), nota REM.
5. **F5 Versionado formal**: APP/CONTRACT/DEPLOY disciplinas; BUILD dinámico en el push; autoridad única de bump.
6. **F6 Explotación**: dashboard (#7), REM completo (bloques B/C), exportación.
Cada fase exige 734/734 y documento de cierre; sin entornos paralelos.

## 20. Riesgos

- `HECHO` — Riesgos identificados:
  - **Divergencia de versión operativa** por `WEB_APP_URL` → `/dev` (P0). Mitigación: alinear config; redeploy después de cada push (already workflow).
  - **REQUIERE_REVISION olvidada** (conflictos S5 o dedup): sin contador visible en INICIO. Mitigación: indicador de cola.
  - **Nota REM desactualizada** → decisión de producto errónea (demografía "no existe"). Mitigación: 14.2.
  - **Duplicidad de edad** si alguien implementa columna EDAD. Mitigación: mantener política documentada (decisión previa).
  - **Medición sin permisos** → riesgo de inventar números. Mitigación: declarado NO MEDIBLE; nada se estimó.
  - **Deployments legacy** (`@89`/`@86`) con dependencias desconocidas. Mitigación: verificación antes de retirar; hoy sin eliminación.

## 21. Decisiones pendientes (requieren aval)

`HECHO` — Decisiones que la próxima implementación necesita del responsable humano (completar con la medición §5/§15 cuando exista acceso):

1. **URL operativa**: ¿`@93 /exec` como única URL de captura y `ECICEP.WEB_APP_URL` actualizada? ¿retirar/archivar `@89` y `@86` tras verificación? (sí/no)
2. **Umbrales de estratificación** (**#15**) y **catálogo de condiciones** (**#14**): habilitan edad/tramos/REM.
3. **Estados canónicos** (**#6**) y semántica de columnas heredadas (**#4**).
4. **Campos REM faltantes** (**#25**) y formato/cierre (**#16**): definir lista exacta y su origen (sin inventar).
5. **Cierre histórico Amarillo** (**#26**): fuente y procedimiento.
6. **Indicadores de dashboard/INICIO** (**#7/#18**) y etiqueta NARANJO/NARANJA (**#12**).
7. **Backups operativos** (**#29**) y responsables/correos (**#13/#27**).
8. **Política de push**: confirmar si se autoriza `git push` al cierre de cada fase.
- `RECOMENDADO` — Cada decisión se registra como DEC y cierra el pendiente asociado; no implementar ningún ítem nuevo sin aval (regla P0).

## 22. Próxima fase

- `HECHO` — Criterios de cierre de P0 (§18 del encargo): Git ✅ (`ea6f9a4`), tests ✅ (734/734), baseline PACIENTES (parcial — NO MEDIBLE sin permisos; queda la medición autorizada), baseline por sector (mismo), mapa fuentes ✅, reglas precedencia ✅, matriz de campos (parcial: pendiente conteos), diagnóstico sectores ✅ (estructural), deuda técnica ✅, deployments ✅, versionado ✅ (propuesta), UI/UX ✅ (P0-P3), roadmap ✅.
- `RECOMENDADO` — Siguiente: (1) ejecutar en sesión autorizada `Act_diagnosticarEnriquecimiento`+`18_Calidad`/`21_Auditoria` para llenar la tabla §5/§15; (2) commit del `INFORME_P0_BASELINE.md` + `INFORME_S6.md` (única carpeta de entregables pendiente); (3) resolver las decisiones §21 (comenzar por URL operativa y deployments); (4) arrancar F1 del roadmap.

---

### Metadatos del informe

- Estado: P0 ejecutada; **sin cambios de código ni publicaciones** salvo el commit S5 (`ea6f9a4`).
- Baseline: 734/734 tests verdes (2026-09-07).
- Limitaciones: sin acceso al libro (clasp run negado por permisos); magnitudes reales etiquetadas **NO MEDIBLE EN ESTA EJECUCIÓN**; nada fue estimado.
- Entregables tocados esta fase: `INFORME_P0_BASELINE.md` (nuevo); commit `ea6f9a4` (S5); `INFORME_S6.md` y `docs/hoja_de_vida.pdf` quedan fuera del commit por corresponder a S6/ajeno.