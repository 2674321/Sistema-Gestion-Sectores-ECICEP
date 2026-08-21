# ESTRATIFICACIÓN — Motor configurable (ETAPA 2.5)

> Estado: DISEÑO. Confirmado por la cliente: **G1/G2/G3 son una segmentación
> por PRIORIDAD según la CANTIDAD de patologías/condiciones del paciente**.
> NO es una segmentación por sector ni territorial. La regla clínica exacta
> (umbral cantidad→nivel) queda pendiente; no se inventa (requerimiento #15).

## 1. Concepto

```text
CONDICIONES / PATOLOGÍAS del paciente   (PACIENTES.CONDICIONES)
        ↓
REGLA DE ESTRATIFICACIÓN  (tabla de datos, editable sin código)
        ↓
ESTRATIFICACION_CALCULADA → G1 / G2 / G3 / SIN_CLASIFICAR
```

## 2. Principios

1. **Regla = datos, no código.** Vivirá en una hoja de configuración
   (`REGLAS_ESTRATIFICACION`, ETAPA 3+): catálogo de condiciones + tabla de
   reglas condición→nivel. Apps Script solo interpreta.
2. **Nunca cambiar silenciosamente** una clasificación (auditoría, §4).
3. **Dimensiones separadas**: sector geográfico no interviene jamás aquí.
4. Mientras `CFG_ESTRATIFICACION.REGLA_DISPONIBLE === false` (estado actual),
   el motor está APAGADO: la estratificación vigente proviene de la fuente o
   digitación humana y queda registrada como `ESTRAT_ORIGEN`.

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

## 6. Tabla de reglas (base CONFIRMADA, umbral PENDIENTE)

**Base confirmada por la cliente:** el nivel G se determina contando las
patologías/condiciones crónicas del paciente → define PRIORIDAD de atención.

| Cantidad de condiciones | Nivel | Estado |
|---|---|---|
| *(umbral 1)* | G1 | ⏳ pendiente confirmación |
| *(umbral 2)* | G2 | ⏳ pendiente confirmación |
| *(umbral 3+)* | G3 | ⏳ pendiente confirmación |

La tabla vivirá como datos editables (`REGLAS_ESTRATIFICACION`): si mañana el
programa cambia los umbrales o agrega condiciones ponderadas, se actualiza la
tabla sin tocar código. El motor también admitirá reglas por condición
específica (ej: cierta patología fuerza nivel mínimo) si la regla oficial lo exige.

**Pendientes derivadas:** catálogo/códigos de condiciones y mecanismo de captura
(PENDIENTES #14) + umbrales exactos (#13).
