# MODELO DE DATOS — v1.0 (implementado en 00_Config)

> Estado: IMPLEMENTADO en `src/00_Config.js` (ETAPA 2). Los cambios al modelo
> se hacen ahí primero y se reflejan aquí. Validado contra las tres fuentes
> en ETAPA 0; campos ambiguos siguen en PENDIENTES #4/#5/#6/#11.

## Principios

1. Una **ficha única por persona** en la hoja `PACIENTES` (tabla plana,
   suficiente para el volumen estimado ~3 mil pacientes).
2. **Trazabilidad obligatoria**: cada fila conserva su origen exacto (`FUENTE`);
   los valores originales nunca se pierden (staging/MAPA_ORIGEN en ETAPA 3).
3. Los casos dudosos **no se consolidan automáticamente** → `CONFLICTOS`.
4. No inventar campos sin utilidad demostrable en las fuentes o el flujo real.
5. **Google Sheets es la interfaz principal** (DEC-012): el orden de columnas
   distingue información operativa (visible) de técnica (agrupada/oculta).

## Entidad PACIENTE — campos canónicos definitivos

Orden = orden de columnas en la hoja. `Téc` = columna técnica (se agrupa y
oculta al usuario; expandible cuando haga falta).

| # | Campo | Tipo | Oblig | Téc | Regla de normalización |
|---|-------|------|-------|-----|------------------------|
| 1 | ID_INTERNO | id | ✔ | ✔ | `EC-<base36 tiempo>-<aleatorio>`; independiente del RUT |
| 2 | RUT | texto | ✔ | | `Norm_normalizarRut`: sin puntos, DV mayúscula; sin DV en fuente → solo cuerpo + bandera |
| 3 | NOMBRE | texto | ✔ | | Mayúsculas, espacios colapsados, conserva tildes/Ñ |
| 4 | TELEFONOS | lista | | | Normalizados separados por `/`; prefijo país removido; duplicados fuera |
| 5 | TELEFONO_OBS | texto | | | Anotaciones de la fuente (ESPOSO, nombres) tal cual |
| 6 | SECTOR | enum | ✔ | | AMARILLO \| VERDE \| NARANJO \| MULTIPLE |
| 7 | ESTRATIFICACION | enum | | | G1\|G2\|G3; 'G' sola, Z, NSP → vacío hasta confirmación (PENDIENTES #5) |
| 8 | DUPLA_INGRESO | texto | | | Texto normalizado libre |
| 9 | PROFESIONAL_SEGUIMIENTO | texto | | | Texto normalizado libre |
| 10 | ESTADO | enum | | | Canónicos en tabla siguiente; desconocidos quedan visibles tal cual |
| 11 | PREINGRESO | fecha\|texto | | | ISO si parseable; si no, estado textual (NO_APLICA, PENDIENTE…) |
| 12 | FECHA_INGRESO | fecha | | | ISO yyyy-MM-dd; inválida → vacío + REQUIERE_REVISION |
| 13 | FECHA_LLAMADO | fecha | | | ISO yyyy-MM-dd (flujo LISTADO Naranjo) |
| 14 | ULTIMO_SEGUIMIENTO | fecha | | | ISO yyyy-MM-dd |
| 15 | ULTIMO_CONTROL | fecha | | | ISO yyyy-MM-dd |
| 16 | PROXIMO_CONTROL | fecha\|texto | | | ISO si parseable; texto tal cual + REQUIERE_REVISION si no |
| 17 | COMPOSICION_CONTROL | texto | | | M+E, M+N, M/PS… normalizado libre |
| 18 | OBSERVACIONES | texto | | | Conservado |
| 19 | NOMBRE_NORMALIZADO | texto | | ✔ | Sin tildes, para búsqueda/matching |
| 20 | RUT_DV_VALIDO | bool | | ✔ | false → DV erróneo según módulo 11 |
| 21 | RUT_SIN_DV | bool | | ✔ | true → fuente sin DV (LISTADO Naranjo) |
| 22 | FUENTE | texto | ✔ | ✔ | `archivo\|hoja\|fila`, múltiples separados por `;` |
| 23 | FECHA_ACTUALIZACION | fecha | ✔ | ✔ | Última modificación del sistema |
| 24 | REQUIERE_REVISION | bool | | ✔ | Conflictos, fechas inválidas, DV erróneo |

## Estados canónicos

| Canónico | Variantes de fuente mapeadas |
|---|---|
| PENDIENTE | PENDIENTE |
| AGENDADO | AGENDADO |
| INGRESADO | INGRESADO, INGRESADA, INGRESADAO*, INGREASO* |
| NO_CONTESTA | NO CONTESTA, N/C, NC |
| FALLECIDO | FALLECIDO, FALLECIDA |
| NSP | NSP |

\* typos confirmados en levantamiento. Lista cerrada pendiente de confirmación
de la cliente (PENDIENTES #6); valores desconocidos no se descartan: quedan visibles.

## Hojas del sistema

| Hoja | Rol | Creada en |
|---|---|---|
| CONFIG | Parámetros administrativos (clave/valor/descripción) | ETAPA 2 ✅ |
| PACIENTES | Base consolidada — interfaz principal de datos | ETAPA 2 ✅ |
| LOG | Registro técnico por lotes (FECHA/NIVEL/MODULO/OPERACION/MENSAJE/DURACION_MS/CONTEXTO) | ETAPA 2 ✅ |
| CONFLICTOS | Registros que requieren revisión humana | ETAPA 2 ✅ (estructura) |
| FUENTES | Control de archivos/sectores de origen | ETAPA 2 ✅ (estructura) |
| STAGING_IMPORT / MAPA_ORIGEN | Aterrizaje controlado y trazabilidad fila a fila | ETAPA 3 |
| INICIO / DASHBOARD / FICHA / SEGUIMIENTO | Interfaz Sheets-nativa (DEC-012) | ETAPA 4+ |

La "Hoja 1" predeterminada se elimina durante la instalación SOLO si está vacía.

## Mapeo fuente → canónico

Ver FUENTES-DATOS.md §4 (tabla completa por sector). El mapa operativo vive en
`SINONIMOS_ENCABEZADOS` dentro de `00_Config.js` — solo equivalencias
confirmadas; los encabezados ambiguos están listados explícitamente en
`ENCABEZADOS_SIN_DESTINO` y jamás se mapean en silencio.

## Identificación de personas (prioridad)

1. RUT normalizado válido (exacto).
2. RUT sin DV → cuerpo numérico + nombre similar (+ dvCalculado como ayuda).
3. Nombre normalizado + teléfono.
4. Nombre normalizado + sector/estratificación (solo candidato → revisión).

Nunca consolidar solo por similitud de nombres. Score y motivo legibles en
`CONFLICTOS` (implementación en ETAPA 3).
