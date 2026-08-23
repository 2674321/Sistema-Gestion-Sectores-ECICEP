# INFORME TRASPASO — Sistema ECICEP Unificado

**Fecha:** 2026-08-22 · **Rama:** master
**Este informe refleja el estado del repo verificado en el momento de su generación. Si pasó tiempo desde entonces, re-verificar antes de asumir que sigue vigente.**

---

## Resumen ejecutivo

Sistema ECICEP para gestión de pacientes crónicos del CESFAM San Juan (3 sectores). Google Sheets + Apps Script con clasp. El flujo completo funciona end-to-end: carga real desde Excel → staging → validación → identificación → PACIENTES + EVENTOS → SECTOR_* → Dashboard. ~1,582 pacientes reales importados y 1,879 eventos. **Foco activo: ETAPA 8E (selector patologías) — la ficha y el selector funcionan tras corregir api_ficha truncada y data-id faltante; falta probar guardado con fix de DOM aplicado.**

---

## 1. Metadatos verificados

```text
Tests: 224/224 ✅ (verificado AHORA con node tests/ejecutar_local.mjs)
Git status: limpio (sin cambios sin commitear)
Últimos commits:
  65cc149 ETAPA 8C-fix: resolver alias conflicts + actualizar dataset a ponderación
  e283712 fix DEFINITIVO: setAttribute data-id en abrirFicha
```

---

## 2. Arquitectura y convenciones

### Stack
Google Sheets + Apps Script V8 · clasp 3.3.0 · Node v18 para tests · Git local sin remote

### Archivos src/

| Archivo | Rol | Líneas |
|---|---|---|
| 00_Config.js | Constantes, modelo (31 campos), catálogo ECICEP (~49 condiciones), sinonimos, estados, umbrales G | ~340 |
| 01_Utilidades.js | Batch helpers, colecciones, caché, edad | ~160 |
| 02_Normalizacion.js | Capa PURA sin GAS: RUT mód11, teléfonos, fechas, nombres, encabezados, condiciones, estratificación, motor por puntaje | ~420 |
| 03_Fuentes.js | Staging, validador estructural, fuentes Drive, carga real controlada, DRY RUN | ~620 |
| 04_Identificacion.js | Identificación conservadora (MATCH_EXACTO/PARCIAL/POSIBLE_DUPL/SIN_MATCH/REVISION), dedup lote, búsqueda | ~250 |
| 05_Consolidacion.js | STUB — pendiente etapa futura | 6 |
| 06_Modelo.js | Acceso PACIENTES/EVENTOS, instalador estructura, hard guard, limpieza, recuperación, ficha | ~650 |
| 07_UI.js | Menú onOpen con submenús, handlers UI_*, endpoints api_* para sidebar | ~850 |
| 08_Dashboard.js | Dashboard: filtros dinámicos (período/sector), KPIs, actividad mensual, calidad datos, PENDIENTE separado de G | ~200 |
| 09_Log.js | Logging buffer→flush batch, LockService | ~86 |
| 10_Pruebas.js | Suites deterministas node+GAS | ~990 |
| 11_DatosPrueba.js | Dataset ficticio único | ~310 |
| 12_Ingresos.js | Orquestador INGRESO_* → PACIENTES/EVENTOS con gates | ~430 |
| 13_Eventos.js | Builder puro eventos desde staging validado | ~150 |
| Webhook.js | Ejecución remota con token en Script Properties | ~101 |
| Sidebar.html | Sidebar búsqueda/ficha/patologías/revisión | ~254 |
| Codigo.js | LEGACY: sobrescribe stub remoto | 3 |

### Convenciones vigentes
- `UI_*` → handlers menú · `api_*` → endpoints google.script.run · `Modelo_*` → acceso datos · `Norm_*` → normalización pura · `Fuentes_*` → staging/fuentes · `Iden_*` → identificación · `Ev_*` → eventos · `Ingresos_*` → orquestador ingresos

### Contratos críticos
- `api_ficha()` NUNCA retorna null — siempre `{ok:true, ficha:{...}}` o `{ok:false, code:'...', message:'...'}`
- `Modelo_agregarPacientes/Eventos(objs, contexto)` exigen `contexto.autorizacion === 'IMPORT_AUTORIZADO'` — sin eso lanzan WRITE_BLOCKED
- EVENTOS es append-only: nunca se modifican ni eliminan eventos históricos
- Sector geográfico ≠ estratificación G1/G2/G3 — dimensiones completamente independientes
- `G/null/vacío` = PENDIENTE (nunca se convierte automáticamente a nivel)

---

## 3. Suite de pruebas

**Comando:** `node tests/ejecutar_local.mjs`
**Resultado verificado AHORA:** 224/224 ✅
**Gap conocido:** No hay tests end-to-end que cubran "buscar→abrir ficha→editar patologías" como flujo continuo (requiere GAS real).

---

## 4. Foco activo

### Bug "Abre una ficha primero" — RESUELTO ✅

**Causa raíz confirmada (commit `e283712`):**
La función `abrirFicha()` en Sidebar.html NO ejecutaba `setAttribute('data-id', ...)` sobre los elementos DOM `#vista` y `#panelPat`. Esas líneas estaban en el código local pero nunca llegaron al archivo físico durante las ediciones múltiples.

Sin ese atributo, `abrirPatologias()` leía `data-id` vacío → gate `if(!pid)` bloqueaba.

**Fix aplicado:** Agregadas 2 líneas en abrirFicha success handler:
```js
document.getElementById('panelPat').setAttribute('data-id', f.ID_INTERNO);
document.getElementById('vista').setAttribute('data-id', f.ID_INTERNO);
```

**Verificado por el usuario:** La ficha abre correctamente y el selector de patologías funciona (49 condiciones visibles, búsqueda OK, selección múltiple OK).

**Bug adicional resuelto en misma sesión:** `api_patologiasAbrir(P_ACTUAL)` usaba variable global JS que podía ser stale. Cambiado a `api_patologiasAbrir(pid)` donde pid se lee del DOM data-attribute (independiente de estado async).

---

## 5. Problemas menores conocidos

| Problema | Archivo:línea | Estado |
|---|---|---|
| UI_demoCompleta duplicada | 07_UI.js | ✅ CORREGIDO (una sola definición) |
| var ui sin declarar en UI_analisisCarga | 07_UI.js ~línea 594 | ✅ CORRECTIDO (`var ui = ...`) |
| ss sin declarar en UI_recuperarInventario | 07_UI.js ~línea 652 | 🔴 PRESENTE — `ss.setActiveSheet(hoja)` usa variable no declarada localmente |

---

## 6. Restricciones activas

1. NO reintroducir P_ACTUAL como única fuente del ID de paciente (data-id en DOM es la fuente)
2. NO cambiar contrato de api_buscar (`id` vs `ID_INTERNO`) sin tarea aparte
3. NO activar REGLA_DISPONIBLE hasta catálogo oficial completo (~52 condiciones)
4. NO importar LISTADO 2025 / INASISTENTES / GESTOR DE CASO sin análisis previo
5. NO modificar PACIENTES/EVENTOS reales sin autorización IMPORT_AUTORIZADO
6. NO mezclar estratificación con priorización
7. NO crear columnas físicas por condición en PACIENTES
8. Datos reales jamás a Git (.gitignore configurado)

---

## 7. Próximos pasos sugeridos

1. Probar flujo completo: buscar → ficha → 🩺 editar patologías → seleccionar → guardar → verificar persistencia
2. Subir Excel Amarillo a Drive → agregar ID a FUENTES_DRIVE → importar sector
3. Resolver los 11 conflictos ABIERTO cuando haya acceso a verificación
4. Implementar Dashboard avanzado (gráficos, trazabilidad indicadores)
5. REM mensual generable desde EVENTOS

