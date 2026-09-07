# INFORME AUDITORÍA S9

**Fase S9 — Auditoría profunda: rendimiento, automatización y robustez.**
**Versión canónica: `0.9.3` (sin cambio). Fecha: 2026-09-07.**

Regla de trabajo: **no modificar por modificar**. Solo se eliminó código muerto
verificado y se declaró lo ya automatizado. No se cambió `ECICEP.VERSION`, el
modelo canónico ni la arquitectura.

**Estado final: SIN commit · SIN push · SIN deploy.** El push de Apps Script y la
actualización del deployment operativo quedan pendientes de decisión humana.

---

## 1. Resumen ejecutivo

| Área | Resultado |
|---|---|
| Hot-loops (getValue/setValue/appendRow/openById) | Sin críticos. Lecturas batch + memoización ya correctas |
| Código muerto | 17 símbolos eliminados (0 referencias verificadas) |
| Campos derivados | EDAD ya automática por fórmula `DATEDIF`; resto sin definir por cliente |
| Cadena RPC WebApp | Ya 1 llamada inicial (`WebApp_estadoInicial`) — sin cambio |
| Búsqueda | Debounce 220 ms + tope 25, RUT exacto primero — sin cambio |
| Dashboard | Hoja DASHBOARD legacy retirada; funciones puras vía `api_dashboardDatos` |
| Mediciones | Infra ya existente (`Utl_medir`, `Captura_v2_medida` T0–T6, perfil Auditor RENDIMIENTO) — no se creó otra |
| Tests | **738/738** verdes + test-guarda B8 de código muerto (núcleo 494) |
| E2E real en vivo | NO medible en esta ejecución (sin login Google / `clasp run` denegado) — no se inventan mediciones |

---

## 2. Alcance y método

1. Inspección estática de anti-patrones de rendimiento en `src/`:
   `getValue`/`setValue`/`appendRow`/`openById`/`getSheetByName`.
2. Análisis de referencias para detectar código muerto en `src/`, `tests/`,
   HTML embebido y menús (`ui.createMenu`).
3. Comparación contra la infraestructura de medición y contra los contratos
   vigentes (`docs/CONTRATO_CAPTURA_V2.md` **NORMATIVO**).
4. Aplicación de eliminaciones solo donde las referencias fueron 0.
5. Regresión completa con la batería existente (8 harnesses).
6. Documentación del estado (este informe). Sin commit/push/deploy.

---

## 3. Rendimiento — hallazgos y decisiones

### 3.1 Carga/queries de hoja
- Lectura única por hoja con `getDataRange().getValues()` y procesamiento en
  memoria. Memoización por ejecución (`_memoLeer`) sobre PACIENTES/EVENTOS/
  PROFESIONALES con invalidación al escribir. **Correcto, sin cambio.**
- Escrituras masivas con `setValues()`; `setValue`/`getValue` fuera de loops
  calientes (~4 celdas únicas). **Sin hot-loops críticos.**

### 3.2 Cadena de carga de la Web App
- `WebApp_estadoInicial()` ya fusiona esquema + catálogo profesionales + url en
  **una sola RPC** (antes 3). **Sin cambio en S9.**

### 3.3 Búsqueda de pacientes
- Sidebar con debounce 220 ms; `Bus_buscarPacientes(...,25)` devuelve RUT exacto
  primero y nombre normalizado contiene, tope 25. **Sin cambio.**

### 3.4 Dashboard
- Funciones puras `Dash_*` consumidas por `api_dashboardDatos` + `Dashboard.html`.
  La hoja `DASHBOARD` legacy y su orquestador `Dash_actualizar` fueron **retirados**
  como código muerto (la hoja residual en el libro se conserva).

### 3.5 Caché
- Las utilidades `Utl_cacheGet/Put/Olvidar` sobre `CacheService` eran **código
  muerto** (0 referencias operativas). Se eliminaron sin pérdida funcional. La
  memorización `_memoLeer` ya cubre el caso caliente. La línea del Auditor que
  describía esta caché obsoleta se actualizó.

### 3.6 Medición
- Se reutilizó la infra existente: `Utl_medir` (`01_Utilidades`), marcas T0–T6 de
  `Captura_v2_medida` (`26_Captura`), perfil RENDIMIENTO del Auditor
  (`21_Auditoria`). **No se creó una nueva infraestructura de medición.**
- **E2E real no medible en esta ejecución**: sin login Google ni `clasp run`
  (denegado). No se reportan mediciones de latencia en vivo inventadas.

---

## 4. Código muerto eliminado (verificado: 0 referencias)

| Nombre | Archivo | Motivo |
|---|---|---|
| `Utl_mapaPor` | `01_Utilidades.js` | Sin uso |
| `Utl_cacheGet/Put/Olvidar` | `01_Utilidades.js` | Caché CacheService nunca operó |
| `Fuentes_validar` | `03_Fuentes.js` | Sin uso (suplida por `Fuentes_validarEstructura`) |
| `_fuentes_columnasStaging` | `03_Fuentes.js` | Sin uso |
| `DIAGNOSTICO_BUSCAR_FICHA` | `07_UI.js` | Función de diagnóstico sin refs |
| `Dash_actualizar` | `08_Dashboard.js` | Orquestador hoja legacy |
| `_dash_inicializarFiltros` | `08_Dashboard.js` | Idem |
| `_DASH_FILTROS` | `08_Dashboard.js` | Constante solo de cascada |
| `Form_reparar` | `24_Formulario.js` | Sin uso |
| `api_formularioDiagnostico` | `24_Formulario.js` | Exposición sin consumidor |
| `api_formularioInstalar` | `24_Formulario.js` | Suplida por instalación por menú |
| `api_profesionalesCatalogo` | `24_Formulario.js` | Suplida por `WebApp_estadoInicial`; fallback duplicado removido |
| `Entorno_gateGAS` | `25_Entorno.js` | Gate de entorno retirado (único entorno) |
| `Act_enriquecerPacientePorRut` | `27_Actualizacion.js` | Sin uso (motor `Act_aplicarEnriquecimiento` es el vivo) |
| `WebApp_previaDuplicados` (legacy pre-V2) | `WebApp.gs` | Reemplazada por `WebApp_previaDuplicadosV2` |
| `api_webappCapturar` | `WebApp.gs` | Alias puente sin consumidor |
| `salida_contador` | `10_Pruebas.js` | Helper de contador muerto |

Se añadió el test **OPT B8** (`10_Pruebas.js`) que verifica que estos símbolos no
se reintroduzcan, evitando futuras regresiones de código muerto acumulado.

---

## 5. Campos derivados / automatización

| Campo | Estado | Decisión |
|---|---|---|
| `EDAD` | **Automática** | Fórmula `DATEDIF(FECHA_NACIMIENTO;TODAY();"Y")` en vista SECTOR_*; viva sin triggers. Sin cambio |
| `FECHA_NACIMIENTO` | Semilla histórica | No se infiere; pendiente cliente (PENDIENTES §1 #14) |
| `SEXO` | Enriquecimiento solo con fuente | No se infiere (S5 cerrado). Sin cambio |
| Catálogo profesionales | RPC única | Ya vía `WebApp_estadoInicial`. Sin cambio |

**Conclusión:** los campos derivados que podían automatizarse sin inventar datos
ya lo están; el resto depende del cliente (PENDIENTES §1).

---

## 6. Estadísticas / REM / dashboard

- `api_dashboardDatos` ya consume las funciones puras; se retiró la capa legacy de
  escritura a hoja.
- Sin estadísticas nuevas: indicadores REM/dashboard dependen del cliente
  (PENDIENTES §1 #7/#16/#17).

---

## 7. Validaciones / ficha

- Validaciones de captura: cubiertas por el contrato V2 §7 tipos / §10 fechas
  (orden §17). Sin cambio.
- Ficha de paciente: lectura legible vía API; sin mejoras seguras sin acceso al
  libro real. Auditada sin cambio.

---

## 8. Tests

| Harness | TOTAL | PASAN | FALLAN |
|---|---|---|---|
| Núcleo (`ejecutar_local`) | 494 | 494 | 0 |
| `aceptacion_formulario` | 50 | 50 | 0 |
| `contrato_captura_v2` | 36 | 36 | 0 |
| `captura_backend_v2` | 65 | 65 | 0 |
| `captura_ui_payload_v2` | 16 | 16 | 0 |
| `cola_form_respuestas` | 33 | 33 | 0 |
| `contrato_datos` | 20 | 20 | 0 |
| `formulario_web` | 25 | 25 | 0 |
| **Total** | **739** | **739** | **0** |

> Total 738 → 739 por el test-guarda OPT B8 (nuevo, no una baja de cobertura):
> lo eliminado fueron funciones sin referencias testeables.

---

## 9. Archivos modificados (S9)

| Archivo | Cambio |
|---|---|
| `src/01_Utilidades.js` | Eliminadas `Utl_mapaPor`, `Utl_cacheGet/Put/Olvidar` |
| `src/03_Fuentes.js` | Eliminadas `Fuentes_validar`, `_fuentes_columnasStaging` |
| `src/07_UI.js` | Eliminada `DIAGNOSTICO_BUSCAR_FICHA` |
| `src/08_Dashboard.js` | Eliminados `Dash_actualizar`, `_dash_inicializarFiltros`, `_DASH_FILTROS`; cabecera actualizada |
| `src/24_Formulario.js` | Eliminados `Form_reparar`, `api_formularioDiagnostico`, `api_formularioInstalar`, `api_profesionalesCatalogo` |
| `src/25_Entorno.js` | Eliminado `Entorno_gateGAS` |
| `src/27_Actualizacion.js` | Eliminado `Act_enriquecerPacientePorRut` |
| `src/WebApp.gs` | Eliminados `WebApp_previaDuplicados` (legacy), `api_webappCapturar` |
| `src/10_Pruebas.js` | Eliminado `salida_contador`; añadido test-guarda OPT B8 |
| `src/21_Auditoria.js` | Actualizada línea de caché obsoleta |
| `src/CapturaWeb.html` | Limpieza de comentario con símbolo removido |
| `tests/formulario_web.mjs` | Stub actualizado (dropped `api_profesionalesCatalogo`) |
| `ARQUITECTURA.md`, `README.md`, `PENDIENTES.md` | Documentación vigente S9 |

---

## 10. Riesgos y pendientes

1. **E2E real en vivo no realizado** (sin login): la Web App y el deployment no
   fueron re-validados con el libro real. Requiere humano con credenciales.
2. **`clasp push --force` + actualización del deployment operativo** pendientes:
   son mecanismos de publicación; no se ejecutan sin aprobación (AGENTS.md).
3. **Pendientes del cliente** que condicionan estadísticas/REM/campos derivados:
   PENDIENTES §1 #7, #14, #16, #17.
4. **Validación visual integral del libro** real tras la fase: PENDIENTES §2 #30.

---

## 11. ¿Listo para commit?

- Código testeable, regresión verde (739/739), sin modelo cambiado ni arquitectura
  paralela, sin secrets ni cambios de datos reales.
- Documentación vigente actualizada (README, ARQUITECTURA, PENDIENTES, informe).
- **Pendiente explícito:** E2E real y push en vivo antes del commit operativo. Por
  contrato de la fase, aquí no se comitea, no se pushea, no se despliega.