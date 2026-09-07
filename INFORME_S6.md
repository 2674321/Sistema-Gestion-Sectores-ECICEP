# INFORME S6 — Auditoría integral del sistema

**Fecha:** 2026-09-07
**Tipo:** auditoría de levantamiento (solo lectura). **No** se implementó código, no se hizo `clasp push`, no se modificaron deployments, hojas, datos ni contratos.
**Categorías:** `HECHO` (verificado en código/documentos/tests) · `OBSERVADO` (evidencia recogida sin ejecutar el sistema vivo) · `INFERIDO` (deducción razonada no demostrable desde aquí) · `RECOMENDADO` (acción propuesta, no ejecutada).

### Limitaciones de acceso

- El token de `clasp` no permite llamar a la API runtime (`script.projects.run` → "Script ID could not be opened") ni a Sheets API (404 por scopes). Por eso **los conteos/porcentajes reales de llenado, duplicados y sector por sector NO son calculables automáticamente**: donde aplica se marca `NO COMPUTABLE DESDE REPO` (requiere sesión con acceso al libro).
- Baseline de tests ejecutado en vivo durante la auditoría: **734/734 verdes** (núcleo 489 · captura V2 36 · backend V2 65 · cola S2 33 · formulario web 25 · UI payload 16 · aceptación 50 · contrato datos 20).

---

## 1. Resumen ejecutivo

- `HECHO` — ECICEP es **un único sistema operativo**: un proyecto Apps Script (scriptId `1UepWmo3QvQd5nGjk4kC2yt0WSwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI`), un Spreadsheet activo (`ECICEP.SPREADSHEET_ID`), la Web App como único canal de captura y un pipeline clínico. Google Forms está fuera de operación.
- `HECHO` — El modelo clínico, la normalización, la calidad/auditoría, el instalador y los ingresos convergen en `Modelo_refrescarVistasSectores` (`src/06_Modelo.js:1400`) como punto de refresco único de las vistas de sector.
- `HECHO` — **S5 quedó publicada en v93** como etapa `enriquecimiento` del instalador (`src/20_Instalador.js:21`, `Instalar_pEnriquecimiento`) que completa `SEXO`/`FECHA_NACIMIENTO` vacíos desde `INGRESO_*`. `UI_actualizarSistema` conserva su rol original (diagnóstico + instalación), verificado por test de wiring (`src/10_Pruebas.js:4235`).
- `OBSERVADO` — S5 está **publicada (v93) y testeada (734/734) pero NO commitada a Git**: el working tree contiene `src/27_Actualizacion.js`, `src/07_UI.js`, `src/20_Instalador.js`, `src/Instalador.html`, `src/10_Pruebas.js`, 5 harnesses, `ARQUITECTURA.md`, `DECISIONES.md`, `MODELO-DATOS.md`, `PENDIENTES.md`, `INFORME_S5.md`, `docs/hoja_de_vida.pdf`. El último commit es `8dc3743` (cierre S4).
- `INFERIDO` — El sistema está estabilizado (714 → 734 tests) pero conserva deuda menor (deployments históricos `@89`/`@86`, `Rem9_edadEn` duplicado, tokens CSS, nota "demografía no disponible" posiblemente obsoleta en REM) y depende de decisiones de cliente para cerrar el modelo definitivo (§11 y §25).
- `RECOMENDADO` — Prioridad: (1) commit de S5, (2) decisión sobre `@89`/`@86`, (3) pendientes ALTA (campos REM, histórico Amarillo, modelo G, atenciones REM), (4) documentar el E2E real de S5 y medir el estado real de PACIENTES.

## 2. Inventario de arquitectura

Módulos (`src/`), rol y evidencia:

| Módulo | Rol | Evidencia |
|---|---|---|
| `00_Config.js` | Única fuente de config activa (hojas, modelo, contratos, versionado) | `ECICEP.SPREADSHEET_ID`, `ECICEP.VERSION` (:19), `CAPTURE_CONTRACT_VERSION=2` (:751) |
| `01_Utilidades.js` | Helpers puros; `Utl_edadDesde` (:44) como único provedor de edad | usado por Ficha/Panel/Normalización/Auditoría |
| `02_Normalizacion.js` | Normalización RUT/fechas/sexo/encabezados; guard post-escritura | `Norm_normalizarSexo` (:340), llamadas a refresco de vistas (:553,:584) |
| `03_Fuentes.js` | Gestión de hojas fuente, deduplicación, FUENTE | `Fuentes_crearFila`, refresco de vistas (:534) |
| `06_Modelo.js` | Modelo clínico; `Modelo_refrescarVistasSectores` (:1400); ficha con EDAD derivada (:1248) | lector PACIENTES (:1094), `Modelo_asegurarEsquemaPacientes` |
| `07_UI.js` | Menús, panel, ficha, instalación, actualización | `UI_actualizarSistema` (:149), `UI_instalarSistema` (:87) |
| `10_Pruebas.js` | Suite interna (`Pruebas_ejecutarTodo` :12) con 20 tests S5 (`_pruebas_enriquecimiento_s5` :4001) | núcleo 489/489 |
| `12_Ingresos.js` | Pipeline de hojas `INGRESO_*` → PACIENTES/EVENTOS | escribe SEXO/FECHA_NACIMIENTO, refresca vistas (:566) |
| `14_REM.js` | Generador REM (metadatos/indicadores) | nota "BLOQUE B demografía NO DISPONIBLE" (:299) — ver §6/§7 |
| `16_Amarillo.js` | Ingreso histórico Amarillo sin inventar datos | SEXO/FECHA vacíos si sin fuente (:51), refresco vistas (:308) |
| `17_Hojas.js` | Formato, dropdown SEXO, date picker FECHA_NACIMIENTO, notas | (:405–457) |
| `18_Calidad.js` | Diagnóstico de calidad | métricas FECHA_NACIMIENTO (:761–763) |
| `20_Instalador.js` | Instalación/reparación por etapas | `INSTALAR_ETAPAS` (:9), etapa `enriquecimiento` (:21), `Instalar_pVerificar` (:126), `Instalar_pEnriquecimiento` (:140) |
| `21_Auditoria.js` | Auditoría técnica + consistencia de edad | `Utl_edadDesde` (:113), regla "1 implementación" (:424) |
| `24_Formulario.js` | Legado formulario (sin canal operativo) | no operativo |
| `26_Captura.js` | Captura V2 (backend) | CAMPOS incluyen SEXO/FECHA_NACIMIENTO (:93), validación de SEXOS (:296) |
| `27_Actualizacion.js` | **S5**: motor de enriquecimiento demográfico | `CAMPOS_ENRIQUECIMIENTO=['SEXO','FECHA_NACIMIENTO']` (:30), `Act_*` |
| `WebApp.gs` | Endpoints Web App | recibe/escribe SEXO/FECHA_NACIMIENTO (:79–80) |
| `Webhook.js` | Comandos Webhook (`refrescar` vistas) | (:58) |

- `HECHO` — Un solo pipeline: captura V2 + hojas `INGRESO_*` → normalización → PACIENTES/EVENTOS → vistas sector. Sin lógica paralela DEV/DEMO/PROD.
- `RECOMENDADO` — Publicar este mapa de módulos en `ARQUITECTURA.md` para fijar responsabilidades.

## 3. Inventario de hojas

`HECHO` — Definido por `HOJAS` en `00_Config.js`:

| Hoja | Rol |
|---|---|
| `CONFIG` | Configuración operativa del libro |
| `PACIENTES` | Registro clínico maestra (30 campos; SEXO col 4, FECHA_NACIMIENTO col 5, FUENTE col 28, FECHA_ACTUALIZACION col 29, REQUIERE_REVISION col 30) |
| `EVENTOS` | Historia clínica de eventos |
| `STAGING_IMPORT` | Zona de staging de importaciones |
| `LOG` | Bitácora de operaciones |
| `CONFLICTOS` | Conflictos de consolidación (cola de revisión) |
| `FUENTES` | Alta de hojas fuente |
| `FORM_RESPUESTAS` / `FORM_CONTROL` | **Legado**: no son canal operativo; esquema pendiente de redefinición contractual (no asumir correcto ni incorrecto) |
| `PROFESIONALES` / `RESPONSABLES` | Catálogos para protecciones operativas |
| `REM_SALIDA` | Salida de indicadores REM |
| `SECTOR_NARANJO` / `SECTOR_AMARILLO` / `SECTOR_VERDE` (`HOJAS_SECTOR`) | Vistas derivadas, refrescadas por `Modelo_refrescarVistasSectores` |
| `Hoja 1` (`HOJA_PREDETERMINADA`) | Aterrizaje por defecto al abrir el libro |

- `HECHO` — Hojas de captura `INGRESO_*` (`HOJAS_INGRESO`, con alias incl. `INGRESO_NARANJA`); `HOJAS_AUTORIZADAS_CARGA` acota la lectura (Naranjo: `Ingresos Enero`/`Ingreso Febrero`/`Ingresos 2025-2026`; Verde: `PLANILLA ECICEP SECTOR VERDE`/`PLANILLA PRE INGRESOS`/`CONTROLES PENDIENTES`).
- `OBSERVADO` — No existe hoja de panel/portada propia; el aterrizaje es `Hoja 1`.
- `RECOMENDADO` — Decidir hoja de inicio tipo panel (§18); no crear segunda base de datos.

## 4. Mapa de fuentes

- `HECHO` — `FUENTES_EXCLUIDAS` (`00_Config.js:701`): `LISTADO 2025`, `INASISTENTES A INGRESOS`, `GESTOR DE CASO` (flujos auxiliares pendientes de definición, PENDIENTES #11).
- `HECHO` — Layout de captura estándar (`CONTRATO_LAYOUT_VISUAL`): título fila 1, secciones fila 2, encabezados fila 3, datos desde fila 4. Mapeo de encabezados vía `SINONIMOS_ENCABEZADOS`; nada se mapea en silencio.
- `HECHO` — `12_Ingresos` consume `INGRESO_*` con columnas `RUT`, `SEXO`, `FECHA DE NACIMIENTO`, etc.; `17_Hojas.js` agrega dropdown SEXO y date picker FECHA_NACIMIENTO.
- `INFERIDO` — La disponibilidad real de SEXO/FECHA varía por hoja: la captura V2 las provee; el histórico Amarillo en muchas filas no (motivo de S5).
- `RECOMENDADO` — Revisión final de fuentes e inclusión/exclusión definitiva (PENDIENTES #28), sin destrucción manual (reconciliador visual, #32).

## 5. Estado de PACIENTES

- `HECHO` — Esquema de 30 campos (`MODELO_PACIENTE`, `00_Config.js:869-899`; docs históricos dicen 29); identidad canónica `ID_INTERNO` + `RUT`.
- `HECHO` — El pipeline de captura escribe SEXO/FECHA_NACIMIENTO (`WebApp.gs:79-80`); `FUENTE`/`FECHA_ACTUALIZACION` se estampan por operación; deduplicación derivada de FUENTE ya validada (problema cerrado).
- `OBSERVADO` — Filas reales pegadas por el usuario (run S5 real): `EC-MTP3GRBD-G0SG` (SEXO=F, FECHA `01/01/1990`, FUENTE `HOJA_INGRESO|INGRESO_NARANJO|14`), `EC-MTN80DG9-MHJI` (SEXO=M), `EC-MTP45QSI-3UT3`, `EC-MTR7FJY3-B6NB` — evidencia de que el pipeline y S5 escriben campos demográficos en vivo.
- `NO COMPUTABLE DESDE REPO` — % total de llenado, filas con `REQUIERE_REVISION`, duplicados reales. Requieren lectura del libro con permisos.
- `INFERIDO` — Antes de S5 existían pacientes con SEXO/FECHA vacíos (histórico Amarillo); tras S5 deberían reducirse a "sin fuente" o "en conflicto".
- `RECOMENDADO` — Ejecutar `Act_diagnosticarEnriquecimiento` (dry-run) más las métricas de `18_Calidad`/`21_Auditoria` para medir el estado real y documentar el E2E de S5.

## 6. SEXO

- `HECHO` — Catálogo `SEXOS.VALIDOS = [M,F,OTRO]` con sinónimos (masculino/hombre/varón→M; femenino/mujer→F); `Norm_normalizarSexo` nunca inventa (desconocido → `''`).
- `HECHO` — Se captura en la Web App (contrato V2), se valida en `26_Captura.js:296`, se escribe desde `INGRESO_*`, se enriquece vía S5 (`27_Actualizacion.js:30`) y tiene dropdown en PACIENTES/INGRESO_*/SECTOR_* (`17_Hojas.js:405-438`).
- `OBSERVADO` — En la data real pegada, los valores `M`/`F` quedaron correctamente normalizados.
- `INFERIDO` — Los `''` restantes corresponden a pacientes sin fuente o en conflicto M vs F.
- `RECOMENDADO` — Ninguna acción de código; verificar en E2E real el flujo conflicto → `REQUIERE_REVISION`.

## 7. FECHA_NACIMIENTO

- `HECHO` — Se captura (V2), se normaliza a ISO en rango `[1900, 2040]` (`CFG_FECHAS`), se escribe desde `INGRESO_*`, se enriquece vía S5 y tiene date picker en `INGRESO_*`.
- `HECHO` — Detección de fechas inválidas en `18_Calidad.js:762-763` y `21_Auditoria.js:115-116`.
- `INFERIDO` — El histórico Amarillo era la principal fuente de vacíos; S5 los reduce a "sin fuente" o "conflicto".
- `RECOMENDADO` — Marcar el % real en la verificación E2E; los casos vacíos restantes se documentan como "sin fuente", no como "a llenar a mano".

## 8. EDAD

- `HECHO` — **`EDAD` nunca se almacena** (decisión vigente, `DECISIONES.md:195`): se **deriva en vivo** con `Utl_edadDesde` (`01_Utilidades.js:44`), consciente del cumpleaños y rango 0–129; tests de frontera en `10_Pruebas.js:2463-2466` y `4047-4052`.
- `HECHO` — Se usa en Ficha/Panel/CentroResumen/Sidebar/REM (edad a la atención) y en `21_Auditoria.js` con la regla "1 implementación" (Panel, Ficha, CentroResumen, :424).
- `OBSERVADO`/`INFERIDO` — `Rem9_edadEn` es un **duplicado menor confirmado** de `Utl_edadDesde` (PENDIENTES #34).
- `RECOMENDADO` — **Mantener EDAD derivada y no almacenarla**: no crear columna ni trigger de edad. Consolidar `Rem9_edadEn` → `Utl_edadDesde` (cambio cosmético, sin semántica).

## 9. Sectores

- `HECHO` — Tres sectores operativos: Naranjo, Amarillo, Verde (`HOJAS_SECTOR` → `SECTOR_*_VIEW`). La estratificación (motor G, apagado en captura V2) y el seguimiento alimentan las vistas.
- `HECHO` — Las vistas `SECTOR_*` se recalculan desde `Modelo_refrescarVistasSectores` (`06_Modelo.js:1400`), invocado tras escritura en los principales flujos: `12_Ingresos.js:566`, `16_Amarillo.js:308`, `03_Fuentes.js:534`, `20_Instalador.js:90`, Webhook (`refrescar`, `Webhook.js:58`) y UI (`07_UI.js:171,260,931,1235,1328,1637`).
- `HECHO` — `HOJAS_AUTORIZADAS_CARGA` reparte las hojas `INGRESO_*` por sector; el refresco es idempotente y best-effort (try/catch en los flujos).
- `NO COMPUTABLE DESDE REPO` — Conteos reales por sector (naranjo/amarillo/verde) y % de llenado demográfico por sector.
- `INFERIDO` — El sector Amarillo concentra la mayor deuda histórica de SEXO/FECHA (origen de S5); Verde heredó lógica de PLANILLA/duplicado histórico (PENDIENTES #3, `NO LLENAR`).
- `RECOMENDADO` — En el E2E real, correr `Webhook` `refrescar` o `UI_actualizarTodo` (núcleo: `HTTP_doGet` + `refrescar` en `Webhook.js:58`); reportar conteos por sector en el informe de cierre.

## 10. Automatización de EDAD

- `HECHO` — No existe (y no debe existir por decisión) un trigger/columna que escriba `EDAD`; la edad se deriva en cada lectura (`Utl_edadDesde`). Esto evita datos obsoletos ("edad al leer", nunca "edad al registrar").
- `HECHO` — `Utl_edadDesde` está instrumentada con tests de frontera (cumpleaños, bebés, 1900, fechas futuras): `10_Pruebas.js:4047-4052`, `4218-4221`.
- `INFERIDO` — Si algún día la UI quisiera mostrar "edad a la fecha de un evento", la implementación correcta es `Utl_edadDesde(FECHA_NACIMIENTO, fechaEvento)` (ya existe y se usa en REM: `10_Pruebas.js:1849`).
- `RECOMENDADO` — No automatizar una columna EDAD. Si se quiere "próximo control en función de edad", derivarlo en el momento de cálculo (seguimiento), no materializarlo en PACIENTES.

## 11. Pendientes (tabla activa)

`HECHO` — Del `PENDIENTES.md` actual (solo ítems accionables):

| # | Pendiente | Tipo | Prio | Estado real |
|---|---|---|---|---|
| 3 | Exclusión de `NO LLENAR` (duplicado Verde) | Decisión cliente | MEDIA | Abierto |
| 4 | Semántica ESTADO vs SEGUIMIENTO vs CONTROL vs PROFESIONAL | Cliente | ALTA | Abierto |
| 5 | Estratificación G sin nivel: derivar o null | Cliente | MEDIA | Abierto |
| 6 | Lista cerrada de estados canónicos | Cliente | ALTA | Abierto |
| 7 | Indicadores del dashboard | Cliente | MEDIA | Abierto |
| 11 | Destino de GESTOR DE CASO / CONTROLES PENDIENTES / INASISTENTES | Cliente | MEDIA | Abierto |
| 12 | Etiqueta NARANJO/NARANJA en UI/REM | Cliente | BAJA | Abierto |
| 13 | Correos de responsables por sector | Cliente | MEDIA | Abierto |
| 14 | Catálogo de condiciones/patologías; FECHA_NACIMIENTO/SEXO disponible vía S5 | Cliente | ALTA | **Parcial: demografía resuelta (S5, DEC-057); catálogo pendiente** |
| 15 | Umbrales G1/G2/G3 y PLAN_CUIDADO/GESTION_CASO | Cliente | ALTA | Abierto |
| 16 | Formato/cierre del REM | Cliente | MEDIA | Abierto |
| 17 | Origen del bloque "atenciones" del REM | Cliente | ALTA | Abierto |
| 18 | Corrección de eventos ya registrados | Diseño | MEDIA | Abierto |
| 25 | Captura de campos REM ausentes (sin inventar) | Dev | ALTA | Abierto |
| 26 | Cierre histórico Amarillo según fuente | Operativo | ALTA | Abierto |
| 27 | Usuarios/accesos y responsables | Cliente | MEDIA | Abierto |
| 28 | Revisión de fuentes restantes | Cliente | MEDIA | Abierto |
| 29 | Backups operativos | Operativo | ALTA | Abierto |
| 30 | Validación visual manual del libro real | Humano | ALTA | Abierto |
| 32 | Reconciliador visual (sin limpieza destructiva) | Dev | BAJA | Abierto |
| 33 | Migrar colores a tokens `00_Tokens` | Dev | BAJA | Abierto |
| 34 | Consolidar `Rem9_edadEn` → `Utl_edadDesde` | Dev | BAJA | Abierto |

- `OBSERVADO` — La cola de publicaciones está limpia (§3 de PENDIENTES): no hay ningún pendiente que obligue a crear un entorno o deployment nuevo.

## 12. Calidad

- `HECHO` — Existen tres mecanismos complementarios: `18_Calidad.js` (métricas de llenado y fecha), `21_Auditoria.js` (auditoría técnica de reglas, incluida la consistencia de EDAD) y la cola `REQUIERE_REVISION`/`CONFLICTOS`/`POSIBLE_DUPLICADO` con UI de resolución (`Sidebar.html` mode='revision', PENDIENTES #21 resuelto).
- `HECHO` — S5 agrega trazabilidad de calidad: conflictos SEXO/FECHA → `REQUIERE_REVISION` sin escritura; `Log_info` con conteos (`src/27_Actualizacion.js:262+`).
- `SOLO OBSERVADO` — Las métricas de llenado real y cola de revisión NO son computables desde el repo (sin acceso al libro).
- `RECOMENDADO` — Ejecutar `Act_diagnosticarEnriquecimiento` (dry-run) + correlato de `18_Calidad` para producir el "semáforo de calidad" del libro en el próximo cierre de fase.

## 13. "Actualizar sistema"

- `HECHO` — `UI_actualizarSistema` (`src/07_UI.js:149`) sigue el flujo original: diagnóstico (`Instalar_diagnosticar`, :151) → diálogo de confirmación (fases pendientes o "al día") → `UI_instalarSistema()` (:163). **No ejecuta enriquecimiento** (test de wiring `10_Pruebas.js:4235`).
- `HECHO` — El enriquecimiento vive en "⚙️ Instalar / reparar sistema" como etapa `enriquecimiento` (`src/20_Instalador.js:21`), corre antes de `verificar` (:22) y su resumen se muestra en la pantalla final (`src/Instalador.html:183`).
- `INFERIDO` — La corrección S5 de ubicación está completa y verificada por tests + deploy v93; el flujo "Actualizar sistema" = diagnóstico + instalación sigue siendo el camino para aplicar cambios de configuración/modelo.

## 14. UI/UX actual

- `HECHO` — Menú Sheets (ECICEP): Panel de control, Personas (ficha/búsqueda/cola de revisión), Instalar / reparar sistema ("⚙️"), Actualizar sistema ("🔄"), diagnóstico. Sidebar y Web App (`Captura.html`) como canal único de captura (SDK `WebApp_previaDuplicadosV2`/`WebApp_capturarEnviar`, captureId `Cp2-`+32 hex).
- `HECHO` — El instalador muestra etapas paso a paso con resultado final (incluye enriquecimiento); la ficha muestra EDAD derivada; las vistas de sector tienen formato condicional y dropdowns.
- `OBSERVADO` — No hay página "home"/dashboard del libro; aterriza en `Hoja 1`. El Panel de Control (07_UI) existe en menú pero no como hoja inicial.
- `RECOMENDADO` — Recuperar/decidir el dashboard (PENDIENTES #7) y evaluar hacerlo hoja de inicio (§18). Mantener la Web App como único canal operativo.

## 15. UI/UX objetivo

- `HECHO` — No existe una especificación de UI/UX objetivo en la doc vigente; `docs/UI-UX.md`/equivalentes no están en la tabla normativa.
- `INFERIDO` — Los focos naturales son: (a) hoja de inicio tipo panel, (b) acceso a la Web App de captura desde el menú/portada, (c) cola de revisión priorizada, (d) legibilidad de REM.
- `RECOMENDADO` — Sin implementar: documentar en una sección de `ARQUITECTURA.md` o `DECISIONES.md` el UX objetivo (criterio, no prototipo) antes de tocar `07_UI/Instalador.html`. Cualquier cambio posterior debe seguir la Web App como único canal y el refresco de vistas existente.

## 16. Versionado actual

- `HECHO` — Múltiples niveles de versión (convención ya usada en el repo):
  - `ECICEP.VERSION = '0.9.3'` (`00_Config.js:19`) — versión semántica manual del sistema.
  - `CAPTURE_CONTRACT_VERSION = 2` (`00_Config.js:751`) — contrato de captura (única fuente normativa: `docs/CONTRATO_CAPTURA_V2.md`).
  - `BUILD.js` — `ECICEP_BUILD = { commit: 'e5d540c', fecha: '2026-09-02 10:29' }`.
  - `clasp` — 93 versiones publicadas; deployments: `@HEAD`, `@89`, `@93` (operativo), `@86` (test).
- `OBSERVADO` — Coexisten versionado semántico manual (`0.9.x`), build-info estático en `BUILD.js` y versionado de Apps Script (93). No hay un mecanismo que genere `0.9.x` automáticamente desde el commit.
- `INFERIDO` — `ECICEP_BUILD` puede quedarse desactualizado si `clasp push` se hace sin regenerarlo.

## 17. Versionado objetivo

- `HECHO` — No hay spec escrita de versionado objetivo (solo la de deployments: reutilizar el deployment operativo; no crear por rutina).
- `RECOMENDADO` — Definir: (a) `0.9.x` se auto-incrementa o se marca en `00_Config.js` de forma deliberada; (b) `BUILD.js` se regenera en el workflow de push (paso del `WORKFLOW.md`); (c) documentar que `/exec` del deployment operativo es la única URL vigente, sin llamar "producción" a un entorno separado (no existe). Sin cambio de arquitectura: sólo convención.

## 18. Página de inicio

- `HECHO` — El libro aterriza en `HOJA_PREDETERMINADA = 'Hoja 1'`. No hay hoja de inicio administrativa.
- `OBSERVADO` — El usuario real abre la Spreadsheet y ve `Hoja 1` (aterrizaje genérico); la Web App es el canal operativo de captura.
- `INFERIDO` — Existe espacio para una portada de administración que reúna accesos (Web App de captura, panel, visor por sector, cola de revisión) y métricas resumidas del libro.
- `RECOMENDADO` — PENDIENTES #7 (indicadores) decide qué mostrar; luego una hoja de inicio no destructiva (nunca reemplazar `PACIENTES`/`EVENTOS`). Crear la hoja es una decisión arquitectónica menor que requiere aval del usuario.

## 19. Deployments

- `HECHO` — `clasp deployments` muestra 4:
  - `AKfycbwd7PkYNWEmglmOqkqgxEw14jTZkTK3O-FgiP3JTVTT` → `@HEAD`.
  - `AKfycbx2LvLy7c3xUVWcPWzy4DsVTaSFR0ldtoKNfyM-3M7cYOMjyBvf_5fFrkKU47UGz9PS6A` → `@89`.
  - `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` → **`@93` (operativo)** — el deployment que sirve la Web App de captura.
  - `AKfycbxIm10Zo0utnRZ9LYIedZzvdc8rZk2ZCbZjSPfK6n_OHUkrgr8QTo3BqvJrQGcck43dUQ` → `@86` (test).
- `HECHO` — `clasp versions` llega a la v93; la v91 fue "S4 - captura V2 estabilizada (714 tests)", la v92/v93 sin descripción (v93 = corrección de ubicación S5).
- `OBSERVADO` — `@89` y `@86` (test) son deployment históricos. `@63` ya se eliminó en la limpieza de deployments (PENDIENTES.md §3). No se verificó desde aquí qué URL/QR depende de `@89` (acceso real requerido).
- `INFERIDO` — `@89` pudo servir URLs usadas por administración histórica; no hay evidencia de uso operativo reciente.
- `RECOMENDADO` — (1) No borrar `@89`/`@86` sin verificar dependencias (PENDIENTES.md §3). (2) Identificar la URL operativa real y publicarla en `ENTORNO.md`. (3) Verificar que nadie usa la URL `/dev` de `@HEAD` en flujo de producción. (4) No crear deployments nuevos por rutina.

## 20. Arquitectura futura (pesquisa)

- `HECHO` — Toda la lógica de captura/estratificación/REM está en un único proyecto Apps Script, con un único pipeline y una Web App. No hay Cloud Run, Functions externas ni banderas DEV/DEMO.
- `INFERIDO` — La deuda son convenciones y limpieza, no gaps estructurales: catalogar módulos (ya posible aquí), consolidar duplicados menores (#33/#34), cerrar el modelo (PENDIENTES ALTA) y definir el dashboard/REMT.
- `RECOMENDADO` — (a) No introducir una segunda app ni segundo sheet "para reportes": los REPORTES deben salir de `REM_SALIDA`/dashboard existente. (b) Si se necesita un pipeline de agregación pesado, hacerlo dentro de Apps Script con el acotado de filas ya existente (DEC-055), nunca un backend paralelo. (c) Programar la revisión de accesos/responsables (#13/#27) como paso previo a la operación con más actores.

## 21. Matriz P0–P4

(estimación de prioridad, según impacto/urgencia; no es una decisión ejecutada)

| Prio | Ítem | Por qué |
|---|---|---|
| P0 | E2E/manual real y cáclculo de llenado real de PACIENTES | Verifica que S5/S4 funcionan sobre el libro vivo (PENDIENTES #30) |
| P0 | Decisión sobre `@89`/`@86`: conservar o eliminar tras verificación | Higiene de deployment; evita URLs muertas |
| P1 | Cierre histórico Amarillo según fuente (#26) + campos REM ausentes (#25) | Influye directamente en el producto operativo (REM) |
| P1 | Definir umbrales G y catálogo de condiciones (#14/#15) | Cierra el modelo de estratificación y REM |
| P1 | Lista cerrada de estados/canónicos (#4/#6) | Normalización definitiva |
| P2 | Semántica de columnas heredadas (#4) y destino de flujos auxiliares (#11) | Afecta fuentes y mapeos |
| P2 | Formato/cierre del REM y origen de "atenciones" (#16/#17) | Entrega del producto si sus campos van en #25 |
| P3 | Home/dashboard (#7/#18), tokens CSS (#33), `Rem9_edadEn` (#34) | Cosméticos/criterios |
| P4 | Migraciones de formato heredado (#32) y exclusión de `NO LLENAR` (#3) | Bajo riesgo, alta cautela |

## 22. Roadmap

- `RECOMENDADO` — Fases sugeridas (no ejecutadas, sujetas a aval):
  - **F1 (operación)**: cierre de S5 (commit + informe de E2E real), medición real de PACIENTES, decisión de deployments.
  - **F2 (producto)**: resolver #25/#26/#14/#15/#4/#6 (modelo definitivo; REM con demografía real).
  - **F3 (visualización)**: dashboard/home (#7/#18) sobre datos ya consolidados.
  - **F4 (limpieza técnica)**: #33/#34/#32 con token CSS y reconciliador visual.
  - Cada fase sin tocar contrato de captura V2 salvo nueva decisión explícita; siempre 734/734 antes de cerrar una fase.

## 23. Testing

- `HECHO` — Batería completa ejecutada en vivo durante esta auditoría: **734/734** (núcleo 489; captura V2 36; backend V2 65; cola 33; formulario web 25; UI payload 16; aceptación 50; contrato datos 20). Comandos: `tests/ejecutar_local.mjs`, `tests/contrato_captura_v2.mjs`, `tests/aceptacion_formulario.mjs` (los tres que documenta AGENTS.md); los 5 restantes se ejecutaron para el total.
- `HECHO` — Los harnesses cargan `src/00_Config.js` (modo jaula) y las sustituciones de pila; no requieren `package.json` (sin dependencias npm).
- `OBSERVADO` — No hay tests de integración contra el libro real (requiere credenciales Sheets; token actual sin scopes) ni test de E2E automatizado de la Web App (deja el E2E en verificación manual).
- `RECOMENDADO` — (a) No modificar tests para ocultar fallos. (b) Añadir un harness de E2E opcional que se ejecute con credenciales reales cuando existan. (c) Mantener los tres comandos canónicos de AGENTS.md en cada fase.

## 24. Reglas de datos

- `HECHO` — Reglas vigentes verificadas en código:
  - **Identidad**: `RUT` canónico exacto; `ID_INTERNO` estable (S4). Sin match por nombre/similitud (S5: `#no-inferir`).
  - **No inventar**: campos sin fuente quedan vacíos (`16_Amarillo.js:51`, SEXO desconocido → `''`, fecha inválida → no aplica). `REQUIERE_REVISION` ante conflicto, nunca escritura forzada.
  - **FUENTE**: siempre se acumula la trazabilidad (`FUENTE` = hoja|bloque|fila; S5 agrega `ENRIQUECIMIENTO|<hoja>|<fila>` sin duplicados).
  - **Unicidad**: deduplicación en `Fuentes` (problema cerrado/validado); `POSIBLE_DUPLICADO` a revisión.
  - **Formatos**: fechas ISO; SEXO mapeado por `SEXOS`; `CFG_FECHAS` acota rangos (2015–2040 eventos; 1900 nacimiento).
  - **Idempotencia**: re-ejecución sin efectos colaterales (S5 idempotente, verificado por 20 tests).
- `RECOMENDADO` — Formalizar esta sección como "Reglas de datos" en `MODELO-DATOS.md` o `DECISIONES.md` (hoy están implícitas, pero hay evidencia suficiente para fijarlas explícitamente).

## 25. Decisiones necesarias

- `HECHO` — 100% de los ítems que requieren aval del usuario:
  1. **Deployment**: ¿conservamos `@89` y `@86` (test) o se eliminan tras verificar dependencias? ¿cuál URL declaramos operativa en `ENTORNO.md`?
  2. **Modelo**: umbrales G1/G2/G3 y definición de PLAN_CUIDADO/GESTION_CASO (#15); catálogo de condiciones (#14); lista de estados canónicos (#6); destino de flujos auxiliares (#11).
  3. **REM**: formato/cierre (#16) y origen de atenciones (#17); qué campos faltantes agregamos sin inventar (#25).
  4. **Dashboard**: indicadores definitivos (#7) y hoja de inicio (#18).
  5. **Operativo**: backups (#29); responsables/correos por sector (#13/#27); cierre histórico Amarillo (#26).
  6. **nomenclatura**: NARANJO vs NARANJA (#12).
- `RECOMENDADO` — Cada decisión se registra como DEC en `DECISIONES.md`; no se implementa hasta aval (regla AGENTS.md: solo confirmación humana para decisiones arquitectónicas/permisos/datos).

## 26. Recomendación

- `RECOMENDADO` — En una frase: **no hay que re-arquitecturar: hay que cerrar (1) el commit de S5, (2) la medición real de PACIENTES y la decisión de deployments, (3) el modelo definitivo (G, catálogo, estados, REM) con las consultas al cliente, y (4) el dashboard/home como capa de visualización sobre un modelo ya cerrado.** Todo ello con la Web App como único canal, 734/734 verdes en cada corte y sin entornos paralelos.

---

### Metadatos del informe

- Estado: auditoría completada. **Sin cambios de código ni publicación**.
- Baseline: 734/734 tests verdes (verificado en vivo 2026-09-07).
- Limitaciones: sin acceso programático al libro real (token clasp sin scopes); conteos reales etiquetados `NO COMPUTABLE DESDE REPO`.
- Evidencia usada: lectura de `src/` (00_Config, 01_Utilidades, 02_Normalizacion, 06_Modelo, 07_UI, 10_Pruebas, 12_Ingresos, 16_Amarillo, 17_Hojas, 18_Calidad, 20_Instalador, 21_Auditoria, 26_Captura, 27_Actualizacion, WebApp.gs, Webhook.js, docs/CONTRATO_CAPTURA_V2.md, PENDIENTES.md, INFORME_S5.md, DECISIONES.md, ARQUITECTURA.md, tests/*.mjs), `clasp deployments`/`clasp versions`, `git status`/`git log` y la data real pegada por el usuario en la fase S5.
- Siguiente paso natural: revisión por el usuario y decisión sobre §25; luego, si corresponde, commit de S5.