# Sistema ECICEP Unificado

Sistema de gestión para centralizar la información de pacientes del programa **ECICEP**
(Examen de Medicina Preventiva) proveniente de los tres sectores del CESFAM San Juan
(Amarillo, Verde, Naranjo), hoy dispersa en planillas Excel independientes con
estructuras distintas.

**v0.6.0** · Google Sheets + Apps Script (clasp) · 275 pruebas locales verdes ·
1.582 pacientes reales / 1.879 eventos operando en producción.

> **Nota contractual:** proyecto particular desarrollado para la cliente
> Camila Paz Aguilar (Enfermera). No constituye un proyecto institucional del CESFAM.

## Qué incluye v0.5.0

- **Panel de Control**: KPIs reales, tarjetas por sector con cobertura, última actividad, accesos.
- **Estadísticas** (dialog): 5 indicadores + 4 gráficos Chart.js + filtro cruzado por sector y fecha.
- **REM mensual** derivado de EVENTOS: resumen 24c + detalle por atención, exportable a **Excel .xlsx** (contrato REM original) y PDF profesional.
- **Selector de patologías ECICEP** en ficha (49 condiciones) con ponderación y esquema migrado.
- **Cola de revisión**, registro de gestiones, timeline de historial, hard guard de escrituras.
- **Instalar / Reparar Sistema**: hojas, CONFIG centralizado, catálogo de vigencias,
  validaciones desplegables en INGRESO_*, diseño del libro (colores/orden/ocultas/banding).
- **Centro de Pruebas**: diagnóstico seleccionable con informe técnico.
- **Registro del sistema** (visor de LOG) con filtros y export CSV.

## Estado del proyecto

| Etapa | Estado |
|-------|--------|
| ETAPA 0 — Descubrimiento / Levantamiento | ✅ Completada (2026-08-21) |
| ETAPA 1 — Arquitectura | ✅ Diseñada y registrada |
| ETAPA 2 — Núcleo | ✅ Implementada, pruebas verdes |
| ETAPA 2.5 — Refinamiento funcional (paciente/evento, sectores, dashboard, REM, estratificación, protecciones) | ✅ Diseñada — docs: MODELO-EVENTOS · DASHBOARD · REM · ESTRATIFICACION |
| ETAPA 3 — Staging + validador + identificación controlada | ✅ Núcleo implementado |
| ETAPA 3b — INGRESO_* → staging → PACIENTES/EVENTOS (gates, append-only, batch) | ✅ Implementada y **verificada end-to-end en el sheet real** (EJ-MT3IJ7RG: 18 leídos, 14 eventos, 11 nuevos + 3 enlazados) |
| ETAPA 4+ — Interfaz → Migración → Optimización → Validación | ⬜ Bloqueadas secuencialmente |

**Interfaz:** Google Sheets es la interfaz principal del sistema (DEC-012).
**Modelo:** PACIENTES (entidad/estado vigente) + EVENTOS (historial append-only) — DEC-017.
**Regla vigente:** NO migrar ni procesar masivamente los datos reales todavía.

## Stack

Google Sheets · Google Apps Script · HTML/CSS/JS · Git · Clasp.
Sin dependencias externas salvo beneficio demostrable.

## Documentación (fuente de verdad)

| Archivo | Contenido |
|---------|-----------|
| `CONTEXTO.md` | Cliente, naturaleza del proyecto, reglas generales |
| `LEVANTAMIENTO.md` | Informe maestro de levantamiento (ETAPA 0) |
| `FUENTES-DATOS.md` | Inventario detallado de archivos y hojas de origen |
| `MODELO-DATOS.md` | Modelo canónico propuesto y mapeo desde las fuentes |
| `ARQUITECTURA.md` | Arquitectura del sistema, módulos, hojas, rendimiento |
| `DECISIONES.md` | Registro de decisiones (DEC-XXX) |
| `PENDIENTES.md` | Decisiones abiertas y tareas bloqueantes |

## Estructura

```text
Sistema-Gestion-Sectores-ECICEP/
├── *.xlsx                  # Fuentes reales (NO versionar)
├── src/                    # Código Apps Script (sincronizado con clasp)
│   ├── appsscript.json
│   ├── 00_Config … 09_Log  # Módulos del núcleo
│   ├── 10_Pruebas.js       # Suites deterministas
│   └── 11_DatosPrueba.js   # Dataset ficticio único
├── tests/
│   └── ejecutar_local.mjs  # node tests/ejecutar_local.mjs
├── datos_prueba/           # Muestras ficticias futuras (único Excel permitido)
└── docs...
```

## Reglas críticas

1. Nunca subir datos reales a Git (`.gitignore` ya configurado).
2. `clasp push` solo desde esta carpeta (`.clasp.json` local → script ligado
   "Back-End Proyecto - Sectores - ECICEP - C.S.J", confirmado DEC-007).
3. Deduplicación explicable, reversible y trazable; dudosos → revisión manual.
4. Lecturas/escrituras por bloques; nunca `getValue/setValue` en loops.
5. Toda decisión arquitectónica se registra en `DECISIONES.md`.
