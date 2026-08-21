# Sistema ECICEP Unificado

Sistema de gestión para centralizar la información de pacientes del programa **ECICEP**
(Examen de Medicina Preventiva) proveniente de los tres sectores del CESFAM San Juan
(Amarillo, Verde, Naranjo), hoy dispersa en planillas Excel independientes con
estructuras distintas.

> **Nota contractual:** proyecto particular desarrollado para la cliente
> Camila Paz Aguilar (Enfermera). No constituye un proyecto institucional del CESFAM.

## Estado del proyecto

| Etapa | Estado |
|-------|--------|
| ETAPA 0 — Descubrimiento / Levantamiento | ✅ Completada (2026-08-21) |
| ETAPA 1 — Arquitectura | 🔄 En diseño (ver `ARQUITECTURA.md`) |
| ETAPA 2 — Núcleo | ⬜ Pendiente |
| ETAPA 3+ — Datos controlados → Migración | ⬜ Bloqueado hasta validar arquitectura |

**Regla vigente:** NO migrar ni procesar masivamente los datos reales todavía.
Los `.xlsx` en esta carpeta son material de referencia local (ignorados por Git).

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
│   └── 0X_*.js             # Módulos numerados
├── datos_prueba/           # Dataset ficticio (único Excel permitido en Git)
└── docs anteriores...
```

## Reglas críticas

1. Nunca subir datos reales a Git (`.gitignore` ya configurado).
2. `clasp push` solo desde esta carpeta (`.clasp.json` local → script ligado
   "Back-End Proyecto - Sectores - ECICEP - C.S.J", confirmado DEC-007).
3. Deduplicación explicable, reversible y trazable; dudosos → revisión manual.
4. Lecturas/escrituras por bloques; nunca `getValue/setValue` en loops.
5. Toda decisión arquitectónica se registra en `DECISIONES.md`.
