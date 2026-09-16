# ESTRATIFICACIÓN — Motor configurable (ETAPA 2.5)

> Estado: **OPERATIVO** (REGLA_DISPONIBLE = true). Motor activo con regla
> por puntaje ponderado (v1.0-MINSAL). Ver `CFG_ESTRATIFICACION` en
> `00_Config.js` y `CATALOGO_CONDICIONES_ECICEP` para el catálogo completo.

## 1. Concepto

```text
CONdiciones normalizadas del paciente
(PACIENTES.CONDICIONES, resuelto vía CATALOGO_CONDICIONES_ECICEP)
        ↓
REGLA DE ESTRATIFICACIÓN (umbrales ponderados en CFG_ESTRATIFICACION)
        ↓
ESTRATIFICACION_CALCULADA → G1 / G2 / G3 / vacío (sin datos o no calculable)
```

## 2. Principios

1. **Regla = datos, no código.** Vivirá en una hoja de configuración
   (`REGLAS_ESTRATIFICACION`, ETAPA 3+): catálogo de condiciones + tabla de
   reglas condición→nivel. Apps Script solo interpreta.
2. **Nunca cambiar silenciosamente** una clasificación (auditoría, §4).
3. **Dimensiones separadas**: sector geográfico no interviene jamás aquí.
4. `CFG_ESTRATIFICACION.REGLA_DISPONIBLE` controla si el motor está activo.
   Cuando es `true`, `Estrat_recalcularTodos()` calcula `ESTRAT_CALCULADA`
   usando la tabla de umbrales ponderados (ver §6). Cuando es `false`,
   `ESTRAT_CALCULADA` queda vacía y la estratificación vigente proviene
   exclusivamente de la fuente o digitación humana (`ESTRAT_ORIGEN`).

## 3. Campos en PACIENTES

| Campo | Visibilidad | Significado |
|---|---|---|
| ESTRATIFICACION | operativa | Valor VIGENTE mostrado al usuario (fuente o calculada) |
| CONDICIONES | técnica | Lista normalizada de códigos de condiciones detectadas (`;`) |
| ESTRAT_ORIGEN | técnica | Valor original de la fuente (comparación origen vs calculada) |
| ESTRAT_CALCULADA | técnica | Salida del motor ('' si regla no disponible/aplicable) |
| ESTRAT_FECHA_CALCULO | técnica | Cuándo se calculó y con qué versión de regla |

Discrepancia `ESTRAT_ORIGEN ≠ ESTRAT_CALCULADA` → `REQUIERE_REVISION` + fila en
CONFLICTOS (no sobrescribir automáticamente).

## 4. Auditoría de cambios

Todo cambio del valor vigente genera un **EVENTO `CAMBIO_ESTRATIFICACION`**
(MODELO-EVENTOS.md §2) con: valor anterior · valor nuevo · fecha · motivo
(`FUENTE`, `REGLA_v<n>`, `MANUAL`) · regla aplicada. Así los indicadores y el
REM pueden reconstruir cuándo y por qué cambió una clasificación.

## 5. Entrada del motor: condiciones

- Hoy las fuentes casi no registran patologías (solo texto libre en GESTOR DE
  CASO). **Brecha de datos abierta**: PENDIENTES #14 — la cliente debe definir
  el catálogo de condiciones y el mecanismo de captura (hoja de ingreso,
  checkboxes, importación).
- Formato interno propuesto: lista de códigos canónicos separados por `;`
  (ej. `DM2;HTA;ERC3`) con alias tolerantes resueltos por el catálogo.

## 6. Tabla de reglas (regla por puntaje ponderado — OPERATIVO)

**Regla vigente (v1.0-MINSAL):** el nivel G se determina con un puntaje
ponderado: suma de `CONDICIONES.ponderacion` del catálogo
(`CATALOGO_CONDICIONES_ECICEP` en `00_Config.js`). Patologías de mayor
impacto tienen peso 2; el resto peso 1.

| Puntaje ponderado | Nivel | Descripción |
|---|---|---|
| 0 | vacío | Sin condiciones registradas (SIN_DATOS) — nunca se escribe G0 |
| 1 | G1 | 1 condición de peso 1 |
| 2–4 | G2 | Varias condiciones o condición de peso 2 |
| ≥5 | G3 | Múltiples condiciones de alto impacto |

La tabla vive como datos editables (`CFG_ESTRATIFICACION.UMBRALES`):
si mañana el programa cambia los umbrales o agrega condiciones, se actualiza
sin tocar código.
