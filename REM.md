# REM — Capa de reporting y trazabilidad (ETAPA 2.5)

> Estado: DISEÑO + MAPA DE TRAZABILIDAD. El generador NO se implementa todavía.
> Principio: **los datos operativos se registran una sola vez** y el REM se
> GENERA desde eventos; nadie rellena estadísticas a mano (#18–#24, #29).

## 1. Arquitectura

```text
PACIENTES (entidad) + EVENTOS (actividad)
        ↓ reglas ECICEP (tipos, riesgo G snapshot)
   AGREGACIÓN MENSUAL (Apps Script, on-demand)
        ↓
   REM_SALIDA (hoja reproducible, con metadatos del período)
```

Dirección única: OPERACIÓN → DATOS → DASHBOARD/REM. Jamás dashboard → copia → REM.

## 2. Operación de generación (propuesta)

Menú **ECICEP → Generar REM**: solicita Año · Mes · Sector(Todos|uno) →
procesa el período → escribe `REM_SALIDA` con cabecera reproducible:

```text
REM ECICEP — AGOSTO 2026 · Sector: TODOS
Generado: 2026-09-01 09:12 · Regla estratificación: MANUAL/FUENTE
[estadísticas] [detalle] [totales] [revisión]
```

Regenerar el mismo período produce siempre el mismo resultado (reproducible).
Modalidades vista-trabajo vs informe formateado y exportación (XLSX/PDF) se
deciden cuando la cliente defina el formato de entrega (PENDIENTES #16).

## 3. MAPA DE TRAZABILIDAD REM

Leyenda origen: **E** = EVENTOS · **P** = PACIENTES · **D** = derivado/calculado ·
**X** = externo/manual (no disponible hoy en ECICEP).

### Bloque A — Resumen por nivel G (generable al 100% desde ECICEP)

| Campo REM | Origen | Expresión |
|---|---|---|
| Ingreso integral G1/G2/G3 | E | `TIPO=INGRESO ∧ RIESGO_G=Gn ∧ FECHA_EVENTO ∈ mes ∧ SECTOR filtro` |
| Control integral G1/G2/G3 | E | `TIPO=CONTROL ∧ RIESGO_G=Gn ∧ …` |
| Seguimiento a distancia G1/G2/G3 | E | `TIPO=SEGUIMIENTO ∧ RIESGO_G=Gn ∧ …` |
| Plan de cuidado G1/G2/G3 | E | `TIPO=PLAN_CUIDADO ∧ RIESGO_G=Gn ∧ …` |
| Gestión de casos ingreso G3/G2 | E | `TIPO=GESTION_CASO_INGRESO ∧ RIESGO_G∈{G2,G3} ∧ …` |
| Gestión de casos egreso G3/G2 | E | `TIPO=GESTION_CASO_EGRESO ∧ RIESGO_G∈{G2,G3} ∧ …` |
| Total | **D** | Suma de las columnas anteriores (nunca almacenar) |
| Tiene Ingreso / Control / Seguimiento / Plan | **D** | Indicador booleano por paciente si tiene ≥1 evento del tipo en el período |

### Bloque B — Demografía del paciente

| Campo REM | Origen | Nota |
|---|---|---|
| Paciente (nombre) | P | NOMBRE |
| Edad | P+**D** | Calculada desde FECHA_NACIMIENTO a la fecha de corte; **hoy sin fuente** (PENDIENTES #14) |
| Sexo | P | SEXO normalizado; **hoy sin fuente** |
| Sector | P/E | SECTOR vigente o sector del evento según variante del informe |
| País de origen / Género social | X | Confirmar si aplica; no capturado |

### Bloque C — Registro de atenciones (segunda estructura entregada)

| Campo REM | Origen | Nota |
|---|---|---|
| Profesional / Tipo de Profesional | E | PROFESIONAL / PROFESIONAL_TIPO del evento |
| Fecha/Hora atención | E | FECHA_EVENTO (+hora si la captura la incluye) |
| Nombre paciente / Sector | P/E | |
| Ficha Paciente · Documento · Tipo de documento · Centro paciente · Hora cierre · Embarazada · Condicionantes · Programa | **X** | Provienen típicamente del registro clínico (RAVEN/sistema asistencial), no del flujo ECICEP |
| Tipo · Descripción · Cantidad | E/P | Según tipo de atención registrada |

⚠️ El bloque C sugiere que parte del REM se alimenta desde un sistema externo.
**No inventar integraciones**: confirmar con la cliente qué campos vienen de
ECICEP y cuáles de otra fuente (PENDIENTES #17).

## 4. Campos derivados — política

TOTAL, "Tiene…", edades, tramos y cualquier valor recomputable **se calculan en
el momento de generar**, jamás se almacenan como dato maestro (#25).
Lo que sí se almacena: los eventos atómicos que permiten reconstruir todo.

## 5. Requisitos para activar el generador

1. EVENTOS operando con tipos y snapshots correctos (ETAPA 3).
2. Definiciones operativas confirmadas de PLAN_CUIDADO y GESTION_CASO_* (#15).
3. Decisión sobre bloque B/C (fuente externa vs ECICEP) (#17).
4. Formato de entrega oficial del REM (#16).

---

# ETAPA 9 — REM EXCEL (implementada v0.6.0)

Producto: **REM_ECICEP_AAAA_MM.xlsx** con dos hojas, generado desde
PACIENTES+EVENTOS en modo SOLO LECTURA (`15_RemExcel.js`).

## Hoja REM (resumen · 24 columnas)

1 fila por paciente con actividad en el período. Paciente = RUT.
Conteos tipo × G usando el SNAPSHOT `RIESGO_G` del evento; `G`/vacío →
fuera de G1/G2/G3 y marcado en validación. Total = suma exacta de las
16 celdas de conteo (verificado contra plantilla original).
Tiene Ingreso/Control/Seguimiento/Plan = SI/NO por eventos reales.

## Hoja REM_DETALLE (28 columnas)

1 fila por atención/evento: Profesional, Tipo de Profesional*, Ficha
(RUT sin DV), Doc., Tipo doc., Nombre, Edad a la Atención (nac+fecha
evento), Año/Mes/Día, Sexo, Género Social*, Centro Paciente**, País
Origen*, Sector (SECTOR X), Fecha/Hora, Hora Cierre*, Embarazada*,
Tipo, Descripción, Cantidad, Condicionantes 1–5*, Comentario, Programa.

## Matriz de trazabilidad

| Campo REM | Fuente | Clase | Cobertura |
|---|---|---|---|
| Paciente / Doc. / Ficha | PACIENTES.RUT | AUTOMÁTICO | 100% |
| Nombre | PACIENTES.NOMBRE | AUTOMÁTICO | 100% |
| Sexo | PACIENTES.SEXO | AUTOMÁTICO | parcial (captura nueva) |
| Edad a la Atención | FECHA_NACIMIENTO + FECHA_EVENTO | DERIVADO | requiere FECHA_NACIMIENTO |
| Sector | EVENTOS.SECTOR | REGISTRADO EN EVENTO | ~100% |
| Fecha + Año/Mes/Día | EVENTOS.FECHA_EVENTO | AUTOMÁTICO | 100% |
| Tipo | EVENTOS.TIPO_EVENTO | AUTOMÁTICO | 100% |
| Estratificación G | EVENTOS.RIESGO_G snapshot | REGISTRADO EN EVENTO | parcial |
| Profesional | EVENTOS.PROFESIONAL | REGISTRADO EN EVENTO | parcial |
| Descripción / Cantidad | EVENTOS | REGISTRADO EN EVENTO | sí |
| Programa | CONFIG GENERAL_NOMBRE_SISTEMA | CONFIGURACIÓN | 100% |
| Tipo de Profesional | — | REQUIERE CAPTURA | 0% |
| Género Social / País Origen / Embarazada / Condicionantes 1–5 / Hora Cierre | — | REQUIERE CAPTURA | 0% |
| Centro Paciente | CONFIG GENERAL_INSTITUCION | CONFIGURACIÓN (parcial) | — |

## Brechas de captura abiertas

Ver PENDIENTES #25. Hasta capturarse, esas columnas se entregan vacías y
la hoja de validación las reporta por fila (nunca inventadas).
