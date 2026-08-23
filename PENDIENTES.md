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

## Nuevas (ETAPA 2.5)

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 12 | Rotulación del sector resuelta en hojas: oficial **INGRESO_NARANJO / SECTOR_NARANJO** con alias INGRESO_NARANJA aceptado (DEC-029). Falta solo confirmar la etiqueta visible definitiva en UI/REM | Confirmado parcialmente (DEC-029) | Etiquetas REM | BAJA |
| 13 | Correos de responsables por sector (para protecciones SECTOR_*/INGRESO_*) | Consulta cliente | Configurar protecciones | ALTA en ETAPA 4 |
| 14 | Catálogo de condiciones/patologías + mecanismo de captura (motor G necesita CONDICIONES); disponibilidad de FECHA_NACIMIENTO y SEXO (fuentes actuales no los traen) | Consulta cliente | Estratificación automática, Edad/Sexo en REM | ALTA |
| 15 | Umbrales oficiales cantidad-de-patologías→G1/G2/G3 y definición operativa de PLAN_CUIDADO, GESTION_CASO_INGRESO/EGRESO | Consulta cliente | Activar motor G; semántica de eventos REM | ALTA |
| 16 | Formato de entrega del REM (vista trabajo vs informe, XLSX/PDF) y período de cierre (mes calendario?) | Consulta cliente | Exportación REM | MEDIA |
| 17 | Origen del bloque "atenciones" del REM (ficha, documento, centro, embarazada…): ¿sistema clínico externo o ECICEP? | Consulta cliente | Alcance real del generador REM | ALTA |
| 18 | Mecánica de corrección de eventos ya registrados (evento correctivo vs edición controlada) — definir antes de operar EVENTOS en producción | Decisión diseño ETAPA 3b | Integridad historial | MEDIA |

## Nuevas (ETAPA 3)

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 19 | ~~Activar escritura real a EVENTOS/PACIENTES~~ ✅ **RESUELTO Y VERIFICADO (EJ-MT3IJ7RG):** flujo end-to-end real con dataset ficticio — leídos 18 = OK 3 + WARNING 11 + ERROR 4 (intencionales); pacientes nuevos 11 + enlazados 3; eventos 14; append-only verificado; SECTOR_* refrescadas automáticamente | Resuelto | — | — |
| 20 | ~~Procesador de hojas INGRESO_*~~ ✅ **IMPLEMENTADO (ETAPA 3b):** adaptador con sector derivado de la hoja, idempotencia por estado y contradicciones como ERROR. Defecto de integración detectado en la primera corrida real (filas llegaban sin normalizar al orquestador) corregido y cubierto por prueba de regresión (DEC-031) | Resuelto | — | — |
| 21 | Cola de revisión humana: UI mínima para resolver REQUIERE_REVISION/POSIBLE_DUPLICADO (por ahora viven en resultado JSON de staging) | Tarea dev ETAPA 4 | Operación diaria de casos dudosos | MEDIA |
| 22 | Captura de fecha específica por gestión (CONTROL/SEGUIMIENTO con fecha propia) en hojas de ingreso o ficha: hoy el evento usa FECHA_INGRESO salvo override programático | Diseño ETAPA 4 | REM fiel por tipo de evento | ALTA para REM |

## Nuevas (ETAPA 8E)

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 23 | ~~Drift de esquema PACIENTES (hoja física sin OTRAS_PATOLOGIAS)~~ ✅ **RESUELTO (2026-08-23):** guardado de patologías escribía 30 valores posicionales sobre hoja de 29 columnas → corrupción desde NOMBRE_NORMALIZADO en adelante (2 filas afectadas reales). Implementado: `Modelo_planMigracionEsquema` (pura), `Modelo_asegurarEsquemaPacientes` (auto-migración idempotente en todo escritor posicional), limpieza profunda de tipos (texto en booleanos, TRUE/FALSE residual en ESTRAT_*), menú ⚙️ Administración → 🧬 Verificar/migrar esquema. Validado end-to-end en producción | Resuelto | — | — |
| 24 | Restaurar FUENTE perdida en 2 filas de PACIENTES durante el incidente (#23): fila 15 JUAN CUBILLOS RIVERA (7030521-6, probablemente `ECICEP NARANJO\|Ingresos Enero \|4` — confirmar contra Excel) y fila 20 SILVIA MONDACA ALFARO (8031158-3, `ECICEP NARANJO\|Ingresos Enero \|9` — confirmado). Mantener REQUIERE_REVISION=TRUE hasta restaurar | Tarea manual con Excel original | Trazabilidad completa de esas 2 fichas | MEDIA |

## Limitaciones técnicas registradas

- Token clasp actual solo permite metadatos de Drive (listado), no contenido de
  Spreadsheets (403 en sheets.googleapis.com y en export). Verificado 2026-08-21.
- Los seriales de fecha corruptos detectados por openpyxl (celdas marcadas como
  fecha con valores imposibles) se tratarán como texto inválido → flag de revisión.
