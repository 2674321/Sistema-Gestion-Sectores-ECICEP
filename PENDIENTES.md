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
| 24 | ~~Restaurar FUENTE perdida en 2 filas de PACIENTES~~ ✅ **RESUELTO Y VERIFICADO (2026-08-23):** evidencia confirmada contra `ECICEP NARANJO.xlsx` → 'Ingresos Enero ' (fila 4 = JUAN CUBILLOS RIVERA 7030521-6, fila 9 = SILVIA MONDACA ALFARO 8031158-3); FUENTE restaurada manualmente con esos valores exactos; fechas manuales conservadas; REQUIERE_REVISION=FALSE ahora legítimo. Diagnóstico final: **1582/1582 OK · FUENTE vacía: 0 · cierres indebidos: 0**. Contrato de trazabilidad vigente desde commit 7447d99 (altas exigen FUENTE, guard anti-cierre-sin-origen, diagnóstico report-only) | Resuelto | — | — |

## Limitaciones técnicas registradas

- Webhook desplegado devuelve HTTP 404 (despliegue eliminado o URL vencida, detectado 2026-08-23). Las acciones remotas nuevas (diag_trazabilidad, restaurar_fuente) requieren republicar la app web. Alternativa: `clasp login` refrescaría el token con scopes completos (habilitaría scripts:run y lectura de contenido, cerrando también la limitación de abajo).
- Token clasp actual solo permite metadatos de Drive (listado), no contenido de
  Spreadsheets (403 en sheets.googleapis.com y en export). Verificado
  2026-08-21 y re-verificado 2026-08-23 vía scripts:run (storage NOT_FOUND).
- Los seriales de fecha corruptos detectados por openpyxl (celdas marcadas como
  fecha con valores imposibles) se tratarán como texto inválido → flag de revisión.

## ETAPA 9 — Brechas de captura para REM completo

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 25 | Campos del REM original sin captura actual (se entregan vacíos, jamás inventados): TIPO_PROFESIONAL · GÉNERO_SOCIAL · PAÍS_ORIGEN · EMBARAZADA (+/PRIMIGESTA) · CONDICIONANTES 1–5 · HORA_INICIO/HORA_CIERRE · AGENDA/ASOCIADO. Requiere ampliar EVENTOS (columnas) + ficha "Registrar gestión" + validaciones + tests. FECHA_NACIMIENTO/SEXO en PACIENTES también siguen sin fuente (#14) | Captura nueva | REM 100% fiel al original | ALTA |

## Cierre — Sector Amarillo, fuentes y usuarios

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 26 | **Sector Amarillo — importación** (fuente auditada: 1.091 pacientes, cobertura 99-100%, G3=594/G2=366/G1=127/SIN G=3, 25 duplicados en fuente, 6 RUTs problemáticos→revisión, 3 DV inválidos, seriales corruptos→revisión). **Pasos:** (1) subir `SEGUIMIENTO ECICEP Sector Amarillo.xlsx` a Drive como Google Sheets; (2) copiar el ID en `FUENTES_DRIVE['SEGUIMIENTO ECICEP Sector Amarillo'].id`; (3) 🧪 Centro de Pruebas → 🟡 Amarillo → "Importar puerta + histórico"; (4) 📥 Gestión → Procesar ingresos; (5) re-ejecutar 🟡 Amarillo para el histórico. Módulo `16_Amarillo.js` (puerta idempotente por RUT + histórico append-only con snapshot G) | Acción operativa (2 clics tras subir archivo) | Cierre sector Amarillo | **ALTA** |
| 27 | **Usuarios/accesos**: el sistema no gestiona usuarios propios — el acceso es por compartición de Google (hoja + Apps Script). Claves `RESPONSABLE_NARANJO/AMARILLO/VERDE` en CONFIG están vacías → definir correos de responsables por sector (#13) para protecciones finas | Decisión cliente | Protecciones por sector | MEDIA |
| 28 | **Fuentes restantes**: `PCTS. ECICEP DESDE 2023.xlsx` (VERDE) ya importado en su hoja principal; hojas LISTADO 2025 / INASISTENTES / GESTOR DE CASO siguen EXCLUIDAS por análisis pendiente (#FUENTES_EXCLUIDAS). `ECICEP NARANJO.xlsx` completo. Actualización de fuentes = re-subir a Drive + re-procesar (pipeline idempotente) | Según cliente | Historial completo | MEDIA |

## Backups

| # | Pendiente | Tipo | Bloquea | Prioridad |
|---|---|---|---|---|
| 29 | **Backups**: manual (💾 Backups → AHORA) y automático semanal (domingo 03:00, conserva últimos 8, poda automática). Requiere autorizar scope scriptapp la primera vez. Los backups son COPIAS COMPLETAS del spreadsheet (hojas+formatos+paneles) en la raíz de Drive. Recomendación: activar SEMANAL en producción | Operativo | Pérdida de datos | **ALTA** |

## Ingeniería — seguimiento v0.8.9.6 (DESIGN SYSTEM) y estabilidad

| # | Pendiente | Tipo | Prioridad |
|---|---|---|---|
| 30 | **Parte 21 — Validación VISUAL MANUAL**: antes de promover v0.8.9.6, revisar con ojos humanos el libro real (INICIO, INGRESO_*, PACIENTES, SECTOR_*, EVENTOS, CONFIG): rampas por familia, encabezados uniformes #0E5C68/blanco, tinta #0B3C49, estados clínicos no colisionando con colores de sector | Humano | **ALTA** |
| 31 | **Parte 25 — Deploy WebApp**: el límite de 20 deployments se alcanzó en dev y NO se crea ninguno nuevo; el ejecutable de producción permanece en @63 (v0.8.9.5). Promover v0.8.9.6 exige liberar un deployment (borrar un dev) o autorización explícita | Cliente | MEDIA |
| 32 | **Parte 16 — Limpieza de formato heredado**: el formato heredado se normaliza al re-aplicar el estándar (Instalar fase visual + reconciliador). No se implementa limpieza destructiva manual fuera del estándar para no tocar datos | Dev | BAJA |
| 33 | **HTML → tokens CSS**: colores duplicados de `00_Config` en Sidebar/Dashboard/Backup/LogVisor/RemGenerador/RemVista/CentroPruebas/Configuracion deberían migrar a vars CSS de `00_Tokens.html` | Dev (cosmético) | BAJA |
| 34 | **Consolidar normalizadores de fecha/edad**: 3 helpers casi-equivalentes (Amarillo_aFecha, Dash_fechaIso, _ui_isoFecha) y 2 de edad (Utl_edadDesde vs Rem9_edadEn). Comportamientos distintos (serial Excel vs string crudo); requerirían tests de contrato antes de unificar (riesgo moderado) | Dev | MEDIA |
