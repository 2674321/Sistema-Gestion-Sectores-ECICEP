# MODELO DE DATOS — Propuesta inicial v0.1

> Estado: PROPUESTO. Debe validarse contra las fuentes (hecho parcialmente en
> ETAPA 0) y confirmar campos ambiguos con la cliente antes de ETAPA 2.

## Principios

1. Una **ficha única por persona** en `BASE_ECICEP` (tabla plana, simple de
   mantener en Sheets y suficiente para el volumen estimado ~2–3 mil pacientes).
2. **Trazabilidad obligatoria**: toda fila conserva su origen exacto.
3. Los casos dudosos **no se consolidan automáticamente**: van a revisión.
4. No inventar campos sin utilidad demostrable en las fuentes o en el flujo real.

## Entidad PACIENTE — campos canónicos

| Campo | Tipo | Origen / regla |
|---|---|---|
| ID_INTERNO | texto generado | Estable, independiente del RUT (permite RUT corregido) |
| RUT | texto | Normalizado `12345678-5`, DV módulo 11, mayúscula K |
| RUT_DV_VALIDO | bool | false → marcar revisión, no bloquear |
| RUT_SIN_DV | bool | true cuando la fuente no tenía DV (caso LISTADO Naranjo) |
| NOMBRE | texto | Mayúsculas consistentes, espacios colapsados |
| TELEFONOS | texto | Lista normalizada separada por `/`; anotaciones aparte |
| TELEFONO_OBS | texto | 'ESPOSO', 'HIJO', etc., extraído del original |
| SECTOR | enum | AMARILLO / VERDE / NARANJO / MULTIPLE |
| ESTRATIFICACION | enum | G1 / G2 / G3 / null ('G' sola y 'NSP' → null + nota) |
| DUPLA_INGRESO | texto | Dupla médico+profesional del ingreso |
| PROFESIONAL_SEGUIMIENTO | texto | Profesional asignado al seguimiento |
| ESTADO | enum canónico | Ver tabla de estados |
| PREINGRESO | fecha \| estado | Fecha normalizada o NO_APLICA/PENDIENTE |
| FECHA_INGRESO | fecha | Validada (año plausible 2023–2027); inválida → null + flag |
| FECHA_LLAMADO | fecha | Del flujo de llamado (Naranjo LISTADO) |
| ULTIMO_SEGUIMIENTO | fecha | Última gestión telefónica registrada |
| ULTIMO_CONTROL | fecha | Último control realizado |
| PROXIMO_CONTROL | fecha \| texto | Fecha si es parseable; si no, texto tal cual + flag |
| COMPOSICION_CONTROL | texto | 'M+E', 'M+N', 'M/PS'… (desde OTROS/PROFESIONAL) |
| OBSERVACIONES | texto | Libre |
| FUENTE | texto | `archivo|hoja|fila` (multi-origen separado por `;`) |
| FECHA_ACTUALIZACION | fecha | Última modificación por el sistema |
| REQUIERE_REVISION | bool | Conflictos, DV inválido, duplicado dudoso |

## Estados canónicos (propuesta)

| Canónico | Variantes observadas |
|---|---|
| PENDIENTE | 'PENDIENTE', 'Pendiente' |
| AGENDADO | 'AGENDADO' |
| INGRESADO | 'INGRESADO', 'INGRESADA', typos 'INGRESADAO', 'INGREASO' |
| NO_CONTESTA | 'NO CONTESTA' |
| FALLECIDO | 'FALLECIDO', 'FALLECIDA' |
| NSP | 'NSP' |
| *(vacío)* | sin estado en fuente |

⚠️ La lista cerrada requiere confirmación de la cliente (PENDIENTES #6).

## Hojas del sistema

| Hoja | Rol |
|---|---|
| BASE_ECICEP | Ficha única consolidada (tabla anterior) |
| STAGING_IMPORT | Zona de aterrizaje de filas crudas validadas estructuralmente |
| MAPA_ORIGEN | Trazabilidad: cada fila de origen → ID_INTERNO asignado (reversible) |
| DUPLICADOS_REVISION | Matches dudosos para decisión humana |
| LOG | INFO/WARNING/ERROR/CRITICAL con timestamp y módulo |
| CONFIG | Parámetros: IDs de hojas fuente, sinonimos de columnas, estados |

## Mapeo fuente → canónico (resumen)

| Canónico | Amarillo | Verde | Naranjo |
|---|---|---|---|
| NOMBRE | NOMBRE | NOMBRE/NOMBRES | USUARIO/NOMBRE/NOMBRE PACIENTE |
| RUT | RUT | RUT | col1 sin título (LISTADO)/RUT |
| TELEFONOS | TELÉFONO | FONO/TELEFONO | TELEFONO/FONO/CELULAR |
| ESTRATIFICACION | G | ESTRATIFICACION | ESTRATIFICACIÓN |
| PREINGRESO | PREINGRESO | PREINGRESO/PRE- INGRESO | PREINGRESO/PRE INGRESO |
| FECHA_INGRESO | INGRESO | FECHA DE INGRESO/FECHA INGRESO | J/FECHA INGRESO |
| DUPLA_INGRESO | — | DUPLA INGRESO/MEDICO/DUPLA INGRESO | DUPLA INGRESO/MEDICO /DUPLA |
| ESTADO | ESTADO | —(derivar de seguimiento) | ESTADO (LISTADO) |
| ULTIMO_SEGUIMIENTO | SEGUIMIENTO(fecha) | SEGUIMIENTO(SEGUIMIENTO TELEFONICO)(fecha) | SEGUIMIENTO(texto→parsear) |
| ULTIMO_CONTROL | CONTROL | —(no existe explícito) | — |
| PROXIMO_CONTROL | PRÓXIMO CONTROL | FECHA PROX CONTROL/PROXIMO CONTROL | FECHA PROX. CONTROL/PROXIMO CONTROL/PROFESIONAL(mezcla) |
| OBSERVACIONES | OBSERVACIONES | OTROS/OBSERVACION | OBSERVACIONES/OTROS/COLUMNA 1 |

Campos aún sin destino definido (decidir con cliente): ASISTENCIA (Naranjo
mensuales), PATOLOGIAS/QUIEN DERIVA/MOTIVO (Gestor de Caso), EVALUACIÓN DE PIE,
COLUMN 12, CONTROLES PENDIENTES e INASISTENTES (¿eventos o notas?).

## Identificación de personas (prioridad)

1. RUT normalizado válido (exacto).
2. RUT sin DV → RUT numérico + nombre similar.
3. Nombre normalizado + teléfono.
4. Nombre normalizado + sector/estratificación (solo candidato → revisión).

Nunca consolidar solo por similitud de nombres. Score de match documentado en
`DUPLICADOS_REVISION` con motivo legible.
