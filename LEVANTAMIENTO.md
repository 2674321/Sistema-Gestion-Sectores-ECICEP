# LEVANTAMIENTO DEL SISTEMA — Informe maestro (ETAPA 0)

**Fecha:** 2026-08-21 · **Alcance:** descubrimiento completo, sin migración de datos.

---

## 1. Estado actual

- Desarrollo del sistema: **no iniciado**. Existe esqueleto Apps Script vacío
  (6 stubs) y un Spreadsheet base "PROYECTO - Sectores - ECICEP - C.S.J" cuyo
  contenido interno aún no puede inspeccionarse (limitación de scopes, PENDIENTES #2).
- Fuentes reales: 3 archivos Excel en la raíz del proyecto (~2.900 filas de
  datos combinadas en sus hojas principales), analizados estructuralmente.
- Este workspace (`Sistema-Gestion-Sectores-ECICEP/`) es la fuente de verdad:
  documentación + `src/` + datos de referencia (ignorados por Git).

## 2. Infraestructura

| Recurso | ID | Nota |
|---|---|---|
| Apps Script ligado **(OFICIAL, confirmado)** | `1UepWmo3QvQd5nGjk4kC2ytW0SwUvN0AU_G4dKXhmSAnDYwPoshPWB7mI` | "Back-End Proyecto - Sectores - ECICEP - C.S.J", container-bound al Spreadsheet base; solo comentario de reserva (DEC-007) |
| Spreadsheet base | `1OEV2za6VbPG7CHU4Pd71Nzi4smy3eizqjrLCRq7UggE` | Contenido no legible con token actual |
| `.clasp.json` raíz workspace | `1pFc-o-…` | ⚠️ Es del proyecto cotizaciones Servicitecnico (DEC-004). No usar |
| Apps Script standalone "Proyecto sin título" | `1-b9YTL-…` | Descartado: escombro de prueba (6 stubs vacíos) |

Verificación realizada: `clasp list` + API metadata de Apps Script (parentId),
Drive files.list, y `clasp pull` de solo lectura del script oficial.
**Post-cierre:** `.clasp.json` local creado apuntando al script oficial,
rootDir `src` (DEC-010).

## 3. Fuentes

1. `SEGUIMIENTO ECICEP Sector Amarillo.xlsx` — 159 KB · 1 hoja · ~1.091 filas
2. `ECICEP NARANJO.xlsx` — 379 KB · 4 hojas · ~2.020 filas sumadas
3. `PCTS. ECICEP DESDE 2023.xlsx` — 300 KB · 6 hojas · ~2.275 filas sumadas

Detalle hoja por hoja en `FUENTES-DATOS.md`.

## 4. Estructuras

- Encabezados en fila 1 (mayoría), fila 2 o fila 3 según hoja.
- Separadores de sección embebidos en los datos ("ENERO 2025", "ECICEP 2023"):
  14–30 por hoja en las consolidadas.
- Tipos mixtos en columnas críticas: fechas como fecha real / texto / serial
  corrupto; teléfonos numéricos (pierden el 9 inicial al ser float) o texto con
  múltiples números; RUT texto con/sin DV, con puntos, o float sin DV.
- Columnas fantasma llenas sin encabezado (ej. col13 de 'NO LLENAR': 721 textos).

## 5. Diferencias entre sectores

- **Amarillo:** estructura más limpia y estable; tiene CONTROL y PRÓXIMO CONTROL;
  no registra dupla de ingreso.
- **Verde:** histórico desde 2023; SEGUIMIENTO = fecha; PROFESIONAL = persona
  asignada; estratificación 'G' ambigua (399); hoja duplicada histórica ('NO LLENAR').
- **Naranjo:** dos flujos (LISTADO de llamados 2025 + ingresos mensuales);
  ESTADO solo aquí; DUPLA significa disciplina; PROFESIONAL mezclada con próximo
  control; RUT a veces sin DV.
- Misma columna cambia de tipo y semántica entre sectores → la normalización
  debe ser **por fuente+hoja**, no global ingenua.

## 6. Riesgos

| Riesgo | Impacto | Mitigación propuesta |
|---|---|---|
| Push clasp al proyecto equivocado (config raíz = cotizaciones) | Destructivo | DEC-004: nunca push desde raíz; `.clasp.json` propio tras confirmación |
| Doble conteo por 'NO LLENAR' duplicada | Base inflada | Excluir de migración (DEC-009) |
| Fechas imposibles ('0205', seriales año ~2600, '#VALUE!') | Datos corruptos | Validador estricto + flag revisión, nunca crash |
| Teléfonos deformados por Excel (floats, multi-número, anotaciones) | Contacto perdido | Normalizador dedicado + TELEFONO_OBS |
| RUT sin DV (~10% Naranjo LISTADO) | Match fallido | Estrategia fallback + flag RUT_SIN_DV |
| Homónimos con semántica distinta entre hojas | Consolidación errónea | Mapa de mapeo por archivo+hoja (CONFIG) |
| Separadores mensuales dentro de datos | Filas basura | Parser que detecta y descarta secciones |
| Duplicados inter-sectoriales confirmados | Ficha doble | Deduplicación explicable + cola de revisión |

## 7. Modelo inicial

Propuesto en `MODELO-DATOS.md`: ficha única plana con 24 campos canónicos,
estados canónicos, trazabilidad FUENTE/MAPA_ORIGEN y flags de calidad.
Validado contra las tres fuentes; campos ambiguos listados para consulta.

## 8. Arquitectura propuesta

En `ARQUITECTURA.md`: 10 módulos numerados, capa de normalización pura,
hojas BASE_ECICEP/STAGING_IMPORT/MAPA_ORIGEN/DUPLICADOS_REVISION/LOG/CONFIG,
procesamiento por lotes, DRY RUN obligatorio, separación lógica DEV/PROD.
Patrones heredados de CESFAM_SJ v2 (verificado en su código): batch reads,
mapa COL por encabezado, CacheService anti-eco, LockService en log, design
system de sidebars. Mejoras respecto del referente: normalización pura testeable,
logging por niveles, validador pre-import y modo simulación nativos.

## 9. Pendientes

11 pendientes registrados en `PENDIENTES.md`. Los bloqueantes ALTA:
confirmar script Apps Script destino (#1), acceso de lectura al Spreadsheet
base (#2), semántica de columnas ambiguas (#4) y lista cerrada de estados (#6).

## 10. Plan de implementación

```text
ETAPA 1 (ahora): cerrar pendientes ALTA con la cliente; congelar modelo v1.0
ETAPA 2: núcleo — Config, Utilidades, Normalización (+tests), Log
ETAPA 3: muestras controladas (dataset ficticio + 20–30 filas reales por sector)
         → validador estructural → staging
ETAPA 4: UI búsqueda/ficha/controles (sidebar primero)
ETAPA 5: integración fuentes reales (lectura automatizada)
ETAPA 6: migración completa con DRY RUN → reporte → ejecución → verificación
ETAPA 7: optimización (medir tiempos, cache, índices)
ETAPA 8: validación integral + dashboard + documentación final
```

Próxima acción inmediata recomendada: resolver PENDIENTES #1 y #2 (5 minutos
con la cliente/desarrollador) para desbloquear ETAPA 2.
