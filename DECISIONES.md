# DECISIONES — Registro

Formato: DEC-XXX · Título · Estado (Propuesta/Aprobada/Rechazada/Obsoleta) ·
Motivo · Fecha. Una decisión rechazada u obsoleta NO se borra.

---

## DEC-001
**Título:** Stack Google Sheets + Google Apps Script
**Estado:** Aprobada (definida por cliente antes del inicio)
**Motivo:** Costo cero, entorno ya conocido por la usuaria, acceso multi-sector,
sin infraestructura propia que mantener.
**Fecha:** 2026-08-21 (registrada)

## DEC-002
**Título:** No migrar datos reales hasta validar arquitectura
**Estado:** Aprobada (regla del proyecto)
**Motivo:** Los Excel son referencia estructural; el procesamiento masivo consume
cuota y riesgo. Primero núcleo → muestras → simulación → migración controlada.
**Fecha:** 2026-08-21 (registrada)

## DEC-003
**Título:** Identificación primaria por RUT normalizado (DV módulo 11)
**Estado:** Propuesta
**Motivo:** RUT presente en todas las fuentes y es el identificador natural en
salud chilena. Fallbacks: RUT sin DV + nombre → nombre+teléfono → candidato a
revisión manual. Nunca consolidar por similitud de nombre sola.
**Fecha:** 2026-08-21

## DEC-004
**Título:** El `.clasp.json` de la raíz del workspace NO corresponde a ECICEP
**Estado:** Aprobada (verificado)
**Motivo:** Su scriptId `1pFc-o-…` es idéntico al del proyecto cotizaciones
Servicitecnico. Riesgo de push destructivo cruzado. ECICEP tendrá su propio
`.clasp.json` local cuando se confirme el script destino (PENDIENTES #1).
**Fecha:** 2026-08-21

## DEC-005
**Título:** Datos reales nunca al repositorio Git
**Estado:** Aprobada (regla del proyecto)
**Motivo:** Información personal y sanitaria. `.gitignore` creado ANTES del
primer commit; ignora `*.xlsx/*.xls/*.csv` salvo `datos_prueba/`.
**Fecha:** 2026-08-21

## DEC-006
**Título:** Arquitectura modular plana numerada (00_…09_) estilo CESFAM_SJ v2
**Estado:** Propuesta
**Motivo:** Patrón ya probado en producción por el desarrollador en un sistema
hermano; compatible con clasp (que aplana carpetas); separación de responsabilidades
sin sobrediseño. La normalización queda como capa pura sin I/O (mejora respecto
del proyecto de referencia, donde no existía esa separación).
**Fecha:** 2026-08-21

## DEC-007
**Título:** Script Apps Script oficial de ECICEP
**Estado:** Aprobada (confirmada por desarrollador 2026-08-21)
**Motivo:** El proyecto oficial es **"Back-End Proyecto - Sectores - ECICEP - C.S.J"**
(`1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI`), **ligado al
Spreadsheet base** `1OEV2za6…`. Contiene solo un comentario de reserva (código
de Cotizaciones retirado). El standalone "Proyecto sin título" (`1-b9YTL-…`,
6 stubs) queda **descartado** como escombro de prueba — no usarlo.
**Fecha:** 2026-08-21

## DEC-010
**Título:** `.clasp.json` local del proyecto → script ligado, rootDir `src`
**Estado:** Aprobada
**Motivo:** Confirmado el script destino (DEC-007), se crea configuración local
segura dentro de la carpeta del proyecto (nunca en la raíz del workspace).
El archivo permanece fuera de Git por prudencia; el scriptId está documentado
en ARQUITECTURA.md para reconstruirlo.
**Fecha:** 2026-08-21

## DEC-011
**Título:** Sin servicios avanzados (SpreadsheetApp basta)
**Estado:** Aprobada
**Motivo:** El manifest real del script ligado no declara servicios avanzados.
Para el volumen del proyecto, SpreadsheetApp nativo es suficiente y evita scopes
extra. Se copia ese manifest como base local (`src/appsscript.json`).
Si más adelante se necesita Sheets API avanzado, se decide entonces.
**Fecha:** 2026-08-21

## DEC-008
**Título:** Un solo proyecto Apps Script + separación lógica DEV/PROD (no 3 entornos físicos)
**Estado:** Propuesta
**Motivo:** Volumen pequeño-mediano (~3 mil pacientes); tres proyectos sería
sobrediseño. Dataset ficticio en `datos_prueba/` + hoja CONFIG distingue modo.
**Fecha:** 2026-08-21

## DEC-009
**Título:** Hoja 'NO LLENAR' excluida de cualquier migración
**Estado:** Propuesta — requiere confirmación con cliente
**Motivo:** Es duplicado histórico de PLANILLA SECTOR VERDE (mismos pacientes
desde 2023); incluirla duplicaría la base.
**Fecha:** 2026-08-21
