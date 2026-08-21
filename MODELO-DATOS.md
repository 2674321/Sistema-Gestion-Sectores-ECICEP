# MODELO DE DATOS — v2.0 (ETAPA 2.5 · implementado en 00_Config)

> Cambios v2: separación ENTIDAD/EVENTO (ver **MODELO-EVENTOS.md**), campos
> demográficos para REM (`SEXO`, `FECHA_NACIMIENTO`), soporte del motor de
> estratificación (`CONDICIONES`, `ESTRAT_ORIGEN/ESTRAT_CALCULADA`),
> `FECHA_LLAMADO` migrada a eventos tipo LLAMADO.
> Los cambios al modelo se hacen en `src/00_Config.js` primero y se reflejan aquí.

## Principios

1. Una ficha única por persona en `PACIENTES` = **estado VIGENTE (caché)**;
   la verdad operativa del historial vive en `EVENTOS` (append-only).
2. Trazabilidad obligatoria: `FUENTE` + MAPA_ORIGEN; originales nunca se pierden.
3. Dudosos no se consolidan automáticamente → `CONFLICTOS`.
4. Sector geográfico (NARANJO|AMARILLO|VERDE) y estratificación (G1|G2|G3) son
   **dimensiones independientes** (DEC-018).
5. Google Sheets es la interfaz principal (DEC-012): operativas visibles,
   técnicas agrupadas/ocultas.

## Entidad PACIENTE — campos canónicos v2

Orden = orden de columnas en la hoja. `Téc` = columna técnica.

| # | Campo | Tipo | Oblig | Téc | Regla |
|---|-------|------|-------|-----|-------|
| 1 | ID_INTERNO | id | ✔ | ✔ | `EC-<base36>-<rand>`; estable aunque cambie el RUT |
| 2 | RUT | texto | ✔ | | Normalizado cuerpo-DV; sin DV en fuente → cuerpo + bandera |
| 3 | NOMBRE | texto | ✔ | | Mayúsculas, espacios colapsados, conserva tildes |
| 4 | SEXO | enum | | | M \| F \| OTRO \| '' (REM lo requiere; hoy sin fuente — captura futura) |
| 5 | FECHA_NACIMIENTO | fecha | | | ISO; base de EDAD/tramos derivados (REM) |
| 6 | TELEFONOS | lista | | | Normalizados separados por `/`; prefijo país removido |
| 7 | TELEFONO_OBS | texto | | | Anotaciones de fuente (ESPOSO…) |
| 8 | SECTOR | enum | ✔ | | NARANJO \| AMARILLO \| VERDE (vigente); MULTIPLE solo transitorio del sistema |
| 9 | ESTRATIFICACION | enum | | | G1\|G2\|G3 vigente; prioridad por cantidad de patologías (ESTRATIFICACION.md) |
| 10 | ESTADO | enum | | | Canónicos; ver tabla de estados |
| 11 | DUPLA_INGRESO | texto | | | Libre normalizado |
| 12 | PROFESIONAL_SEGUIMIENTO | texto | | | Libre normalizado |
| 13 | PREINGRESO | fecha\|texto | | | ISO o estado textual (NO_APLICA…) |
| 14 | FECHA_INGRESO | fecha | | | ISO; inválida → vacío + revisión |
| 15 | ULTIMO_SEGUIMIENTO | fecha | | | Caché del último EVENTO SEGUIMIENTO |
| 16 | ULTIMO_CONTROL | fecha | | | Caché del último EVENTO CONTROL |
| 17 | PROXIMO_CONTROL | fecha\|texto | | | ISO o texto + revisión |
| 18 | COMPOSICION_CONTROL | texto | | | M+E, M+N… |
| 19 | OBSERVACIONES | texto | | | Conservado |
| 20 | CONDICIONES | texto | | ✔ | Lista de códigos de condiciones `;` — entrada del motor G |
| 21 | NOMBRE_NORMALIZADO | texto | | ✔ | Sin tildes para búsqueda/matching |
| 22 | RUT_DV_VALIDO | bool | | ✔ | false → DV erróneo módulo 11 |
| 23 | RUT_SIN_DV | bool | | ✔ | true → fuente sin DV |
| 24 | ESTRAT_ORIGEN | texto | | ✔ | Valor original de la fuente |
| 25 | ESTRAT_CALCULADA | texto | | ✔ | Salida del motor ('' si regla no disponible) |
| 26 | ESTRAT_FECHA_CALCULO | fecha | | ✔ | Cuándo/qué versión de regla |
| 27 | FUENTE | texto | ✔ | ✔ | `archivo\|hoja\|fila`; múltiples por `;` |
| 28 | FECHA_ACTUALIZACION | fecha | ✔ | ✔ | Última modificación del sistema |
| 29 | REQUIERE_REVISION | bool | | ✔ | Conflictos, fechas inválidas, DV erróneo, discrepancia G |

## Estados canónicos (paciente)

PENDIENTE · AGENDADO · INGRESADO (=INGRESADA/INGRESADAO/INGREASO) ·
NO_CONTESTA (=NO CONTESTA, N/C, NC) · FALLECIDO (=FALLECIDA) · NSP.
Lista cerrada pendiente de confirmación (#6); desconocidos quedan visibles.

Estados de solicitud en hojas INGRESO_*: PENDIENTE · VALIDANDO · LISTO ·
INGRESADO · DUPLICADO · REQUIERE_REVISION · ERROR (MODELO-EVENTOS.md §5).

## Tipos de evento (hoja EVENTOS)

INGRESO · CONTROL · SEGUIMIENTO · PLAN_CUIDADO · GESTION_CASO_INGRESO ·
GESTION_CASO_EGRESO · EGRESO · CAMBIO_SECTOR · CAMBIO_ESTRATIFICACION ·
LLAMADO · OTRO. Estructura completa en MODELO-EVENTOS.md §4.

## Hojas del sistema

Ver inventario justificado en MODELO-EVENTOS.md §7 (≈15 hojas con función clara).

## Mapeo fuente → canónico

FUENTES-DATOS.md §4 (tabla por sector). Mapa operativo: `SINONIMOS_ENCABEZADOS`
en 00_Config — solo equivalencias confirmadas; ambiguos en
`ENCABEZADOS_SIN_DESTINO`, jamás mapeados en silencio.
Nota: 'FECHA DE LLAMADO' pasa a capa de eventos (ETAPA 3).

## Identificación de personas (prioridad)

1. RUT normalizado válido (exacto)
2. RUT sin DV → cuerpo + nombre similar (+ dvCalculado como ayuda)
3. Nombre normalizado + teléfono
4. Nombre + sector/estratificación → solo candidato → revisión
Nunca consolidar por similitud de nombres sola.
