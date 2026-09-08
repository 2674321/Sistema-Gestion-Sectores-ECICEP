# ECICEP — Sistema de Gestión Sanitaria por Sectores

> Plataforma de captura, seguimiento clínico y reporte construida sobre
> **Google Apps Script + Google Sheets**, con una **Web App** como único canal
> operativo de captura y un backend de reglas de negocio testeable.
>
> **Naturaleza:** proyecto **particular**, desarrollado a medida para una
> profesional de enfermería como cliente. **No es un desarrollo institucional.**

[![CI tests](https://github.com/2674321/Sistema-Gestion-Sectores-ECICEP/actions/workflows/ci.yml/badge.svg)](https://github.com/2674321/Sistema-Gestion-Sectores-ECICEP/actions/workflows/ci.yml)
[![Demo interactiva](https://img.shields.io/badge/DEMO-interactiva-1B7A8A?style=flat-square&logo=html5)](https://2674321.github.io/Sistema-Gestion-Sectores-ECICEP/)

## De un vistazo

| | |
|---|---|
| **Modelo de datos** | `PACIENTES` (estado vigente) + `EVENTOS` (historial inmutable) + vistas derivadas |
| **Canal de captura** | Web App (contrato de captura V2, idempotente) |
| **Unidades territoriales** | Sectores (Amarillo · Verde · Naranjo) |
| **Reportes** | REM mensual en Excel y PDF, estadísticas con gráficos, dashboard de indicadores |
| **Calidad** | Normalización, deduplicación trazable, cola de revisión, auditoría |
| **Entornos** | **Uno solo** — un Spreadsheet, un proyecto Apps Script, una fuente de verdad |
| **Estado** | Operativo · `v0.9.3` · pruebas núcleo **552/552** · deploy `/exec` vigente |

## Qué resuelve

Equipos de salud territorial suelen trabajar con **planillas Excel independientes
y estructuras distintas**, una por sector o programa. Las consecuencias son
conocidas:

- **Doble trabajo** al buscar a una persona que aparece en más de una planilla.
- **Imposible saber de un vistazo** quiénes existen, su estado, su próximo
  control o quién requiere seguimiento.
- **Formatos inconsistentes** (RUT, teléfonos, fechas, estados) incluso dentro
  de una misma hoja.

ECICEP integra esas fuentes en **una única base operativa**, normaliza y
consolida los datos y provee una interfaz simple para el uso cotidiano.

## Capacidades

**Base unificada y trazable**
- Personas (`PACIENTES`) con identidad canónica y **historial de eventos
  inmutable** (`EVENTOS`, append-only); origen, sector y fecha de cada registro.
- Deduplicación **explicable, reversible y trazable**; dudosos van a la cola de
  revisión, nunca se descartan a ciegas.

**Normalización automática**
- RUT con **módulo 11** (formato, dígito verificador y validación en vivo),
  teléfonos, fechas, nombres sin tildes y estados canónicos.

**Modelo clínico por persona**
- **Estratificación de riesgo** `G1/G2/G3` con **frecuencia de control
  configurable** por nivel (días/meses).
- Cálculo centralizado de `PRÓXIMO CONTROL`, **estado** (VENCIDO / POR VENCER /
  VIGENTE / SIN FECHA) y **recordatorio** — una única fuente de verdad.

**Seguimiento y controles**
- Registro de controles y seguimientos, fecha de próximo control recalculada al
  instante, panel *Controles por persona* con búsqueda y paginación.

**Reportes**
- **REM mensual** derivado de EVENTOS: resumen por censo + detalle por atención,
  exportable a **Excel (.xlsx)** y **PDF profesional**.
- Estadísticas con 5 indicadores y gráficos, filtro cruzado por sector y fecha.

**Captura Web App (único canal operativo)**
- Formulario responsivo con 4 operaciones (`nuevoIngreso`, `registrarControl`,
  `registrarSeguimiento`, `actualizarDatos`), validación por capas, **idempotencia
  de reenvíos** y trazabilidad por envío — especificado en
  `docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**).
- QR para compartir el acceso al canal de captura.

**Operación y confiabilidad**
- Instalador/reparador por **etapas** con diagnóstico de solo lectura,
  **versionado de esquema y motor de migraciones** (idempotente).
- Backups manuales y automáticos, cola de calidad, auditoría integral,
  protección por categoría de hojas, filtros y buscador por hoja.
- Diseño visual del libro normalizado por un **design system** único (tokens en
  `00_Tokens`), contrastes accesibles y una sola tinta.

## Demo interactiva

Puedes probar una **réplica estática exacta** del formulario de captura (misma
interfaz, mismas secciones y mismas validaciones, **datos ficticios**, sin
conexión a Apps Script) en línea:

- **🌐 En línea:** <https://2674321.github.io/Sistema-Gestion-Sectores-ECICEP/>
- **Local:** abre `examples/formulario_demo.html` en un navegador (doble clic).

Incluye RUT de ejemplo que ya existen en la base demo (13.187.212-7,
9.866.001-1, 15.798.443-8) para ver el comportamiento de personas registradas.

## Arquitectura

Un solo sistema operativo (una Web App, un backend, un pipeline, una fuente de
verdad). Google Sheets cumple la función administrativa interna; la captura
operativa vive **solo** en la Web App.

```text
                ECICEP
                   │
         ┌─────────┴─────────┐
         │                   │
      WEB APP            SHEETS / ADMIN
         │                   │
         └─────────┬─────────┘
                   │
                BACKEND
                   │
                PIPELINE
                   │
                  MODELO
        PACIENTES + EVENTOS + DERIVADOS
                  ─ SECTORES · DASHBOARD · REM · LOG ─
```

Contrato de captura vigente (operaciones, payload, estados, errores):
`docs/CONTRATO_CAPTURA_V2.md` (**NORMATIVO**, única fuente).

## Stack

`Google Apps Script · Google Sheets · HTML/CSS/JS (Web App) · Git · Clasp ·
SheetJS (Excel) · Chart.js (gráficos) · PDF local`

Sin dependencias externas salvo beneficio demostrable. Código en paquetes
planos numerados (`src/00_Config.js … src/27_Actualizacion.js`) sincronizados
con `clasp`.

## Estado del proyecto

| Componente | Estado |
|---|---|
| Núcleo (normalización, modelo, pipeline) | ✅ Implementado |
| Web App de captura (contrato V2) | ✅ Operativo |
| Instalador + motor de migraciones | ✅ Operativo (fase INST-1 cerrada) |
| REM Excel / PDF · Estadísticas · Dashboard | ✅ Implementados |
| Calidad, auditoría, backups | ✅ Implementados |
| E2E real | ✅ Verificado en libro operativo |

**Regla vigente:** el procesamiento masivo de datos reales requiere instrucción
explícita (migración controlada: análisis → validación → simulación → reporte →
migración). Los datos personales y sanitarios nunca salen del entorno de la
cliente hacia repositorios públicos.

## Documentación

| Documento | Propósito |
|---|---|
| `AGENTS.md` | Contrato permanente de trabajo para agentes |
| `ARQUITECTURA.md` | Arquitectura técnica y funcional vigente |
| `MODELO-DATOS.md` · `MODELO-EVENTOS.md` | Modelo PACIENTES y EVENTOS |
| `docs/CONTRATO_CAPTURA_V2.md` | Contrato de captura V2 — **NORMATIVO** |
| `DECISIONES.md` | Registro de decisiones (DEC-XXX) |
| `docs/MIGRACIONES.md` | Motor de migraciones de esquema |
| `docs/VERSIONADO.md` | Versionado del esquema |
| `docs/HISTORIAL.md` | Evolución completa por versión (historial) |
| `CONTEXTO.md` | Cliente, naturaleza y reglas generales |
| `PENDIENTES.md` | Trabajo pendiente real |

## Estructura

```text
Sistema-Gestion-Sectores-ECICEP/
├── src/                   # Código Apps Script (sincronizado con clasp)
│   ├── 00_Config.js …     # Config, tokens, núcleo, modelo, hojas, UI
│   ├── 10_Pruebas.js      # Suites deterministas (552)
│   ├── 24_Formulario.js   # Backend de captura Web App
│   ├── 26_Captura.js      # Backend contrato de captura V2
│   └── CapturaWeb.html    # Formulario Web App (canal de captura)
├── tests/                 # Baterías ejecutables: node tests/*.mjs
├── examples/              # Réplicas/demos (ej. formulario_demo.html)
├── tools/                 # push_y_abrir.sh, sync_remoto.py…
└── docs/                  # Documentación vigente
```

## Reglas críticas

1. Nunca se versionan datos reales en Git (`.gitignore` ya configurado).
2. `clasp push` solo desde esta carpeta (proyecto Apps Script vinculado).
3. Deduplicación explicable, reversible y trazable; dudosos → revisión manual.
4. Lecturas/escrituras por bloques; nunca `getValue/setValue` en loops.
5. Toda decisión arquitectónica se registra en `DECISIONES.md`.

## Evolución

El sistema se construyó y estabilizó en fases incrementales (`v0.5.0` → `v0.9.3`,
más las fases S9/S10/INST-1 y MEJORA-INST1.1). El detalle completo por versión,
incluidos los desenlaces técnicos (rendimiento, auditorías, instalador
versionado, despliegues) está en **`docs/HISTORIAL.md`**.