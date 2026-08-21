# PENDIENTES — Decisiones abiertas y bloqueantes

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 1 | ~~Confirmar script Apps Script de ECICEP~~ ✅ **RESUELTO (2026-08-21):** `1UepWmo3…` "Back-End Proyecto - Sectores - ECICEP - C.S.J", ligado al Spreadsheet base. `.clasp.json` local creado (DEC-007/010) | Resuelto | — | — |
| 2 | ~~Estructura interna del Spreadsheet base~~ ✅ **RESUELTO (2026-08-21):** el Spreadsheet está **vacío**, solo tiene la "Hoja 1" predeterminada. Libre para crear las hojas del sistema (BASE_ECICEP, STAGING_IMPORT, MAPA_ORIGEN, DUPLICADOS_REVISION, LOG, CONFIG). La "Hoja 1" vacía podrá eliminarse/renombrarse al crear la estructura | Resuelto | — | — |
| 3 | Confirmar exclusión de la hoja 'NO LLENAR' (duplicado histórico sector Verde) | Decisión cliente | Migración | MEDIA |
| 4 | Semántica exacta de columnas ambiguas: ESTADO vs SEGUIMIENTO vs CONTROL vs PROFESIONAL por sector; significado de 'COLUMN 12', 'COLUMNA 1', 'EVALUACIÓN DE PIE', 'ASISTENCIA' | Consulta cliente | Modelo final, normalización | ALTA |
| 5 | Estratificación 'G' sin nivel (399 casos en Verde): ¿derivable? ¿dejar null? | Consulta cliente | Normalización | MEDIA |
| 6 | Lista cerrada de estados canónicos (PENDIENTE/AGENDADO/INGRESADO/NO_CONTESTA/FALLECIDO/NSP…) | Consulta cliente | Consolidación + UI | ALTA |
| 7 | Indicadores que la cliente quiere en el dashboard | Consulta cliente | ETAPA dashboard | MEDIA |
| 8 | ~~Interfaz: sidebar vs Web App~~ ✅ **RESUELTO (2026-08-21):** Google Sheets es la interfaz principal (DEC-012); sidebar/dialog solo como complemento justificado | Resuelto | — | — |
| 9 | Crear dataset ficticio en `datos_prueba/` (nombres/RUT/teléfonos inventados) | Tarea dev | ETAPA 3 (muestras) | MEDIA — dataset de normalización ya existe (`src/11_DatosPrueba.js`) |
| 10 | Primer commit Git (repo ya inicializado, `.gitignore` listo) — esperar confirmación | Tarea dev | Versionado | MEDIA |
| 11 | Definir destino de flujos auxiliares: GESTOR DE CASO, CONTROLES PENDIENTES, INASISTENTES A INGRESOS (¿eventos separados u observaciones?) | Consulta cliente | Modelo final | MEDIA |

## Limitaciones técnicas registradas

- Token clasp actual solo permite metadatos de Drive (listado), no contenido de
  Spreadsheets (403 en sheets.googleapis.com y en export). Verificado 2026-08-21.
- Los seriales de fecha corruptos detectados por openpyxl (celdas marcadas como
  fecha con valores imposibles) se tratarán como texto inválido → flag de revisión.
