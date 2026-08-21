# FUENTES DE DATOS — Inventario detallado

**Fecha de análisis:** 2026-08-21 · Método: perfilado estructural local (openpyxl),
sin migración de datos. Los ejemplos de valores son categorías/estados, no datos personales.

> Regla: estos archivos son **referencia**, no la base final del sistema.
> Prohibido su versionado en Git (ver `.gitignore`).

---

## 1. SEGUIMIENTO ECICEP Sector Amarillo.xlsx (159 KB)

Sector **Amarillo**. Una sola hoja, la estructura más limpia de las tres fuentes.

### Hoja: INGRESOS ECICEP — ~1.091 filas, encabezado fila 1, sin separadores

| # | Columna | Llenos | Tipos | Observaciones |
|---|---------|--------|-------|---------------|
| 1 | NOMBRE | 1091 | texto | |
| 2 | G | 1088 | texto | Estratificación: G3(595), G2(366), G1(127) |
| 3 | RUT | 1089 | texto(1087)+num(2) | |
| 4 | TELÉFONO | 1088 | num(986)+texto(98)+fecha(4) | Fechas usadas como teléfono = error de formato celda |
| 5 | PREINGRESO | 1088 | texto(610)+fecha(478) | 'NO APLICA'(602); textos varios ('PENDIENTE','--','NO TIENE') |
| 6 | INGRESO | 1090 | **fecha(1084)** | Muy limpio; typos puntuales ('24/03/0205', '#VALUE!') |
| 7 | SEGUIMIENTO | 1083 | texto(815)+fecha(268) | 'PENDIENTE'(789); **referencias a otros sectores: NARANJO(7), VERDE(2), S/NARANJO(3)...** |
| 8 | CONTROL | 1085 | fecha(572)+texto(513) | Último control realizado |
| 9 | PRÓXIMO CONTROL | 1087 | fecha(832)+texto(255) | Textos tipo '11/26', 'seguimiento en octubre' |
| 10 | OBSERVACIONES | 252 | texto | |

---

## 2. ECICEP NARANJO.xlsx (379 KB)

Sector **Naranjo**. Cuatro hojas: un listado de llamado/seguimiento 2025, una
consolidada de ingresos 2025–2026 con separadores mensuales, y dos hojas
mensuales sueltas (Enero, Febrero 2026).

### Hoja: LISTADO 2025 — ~863 filas, encabezado fila 1

| # | Columna | Llenos | Tipos | Observaciones |
|---|---------|--------|-------|---------------|
| 1 | *(sin encabezado)* | 851 | texto(762)+num(89) | **Contiene RUT; los numéricos van SIN dígito verificador** |
| 2 | USUARIO | 855 | texto | = NOMBRE |
| 3 | TELEFONO | 844 | num(783)+texto(61) | |
| 4 | DUPLA | 849 | texto | Aquí significa **disciplina**: NUTRICIONISTA(345), ENFERMERA(252), NO ESPECIFICA(195), PSICOLOGA(57) |
| 5 | ESTADO | 856 | texto | PENDIENTE(662), AGENDADO(126), INGRESADO(37), INGRESADA(21), NO CONTESTA(6), FALLECIDA(1), typos: INGRESADAO, INGREASO, NSP |
| 6 | FECHA DE LLAMADO | 477 | fecha(388)+texto(85)+num(4) | Textos tipo 'fallecida' |
| 7 | OBSERVACIONES | 568 | texto | |
| 8 | PROXIMA FECHA CONTROL | 19 | texto | Texto libre completo ('PROX CONTROL EN ABRIL 2026 M/E') |

### Hoja: Ingresos 2025 - 2026 — ~980 filas, encabezado fila 1, **14 separadores mensuales**

| # | Columna | Llenos | Tipos | Observaciones |
|---|---------|--------|-------|---------------|
| 1 | J | 678 | fecha(670)+texto(8) | = FECHA INGRESO; typos graves: '24/72025', '15/24/2026', '08/06/2026/08/06/2026' |
| 2 | NOMBRE | 846 | texto | |
| 3 | RUT | 829 | texto | |
| 4 | ESTRATIFICACIÓN | 642 | texto | G2(267), G3(266), G1(108), **'Z'(1)** |
| 5 | FONO | 427 | num(416)+texto(11) | Dobles con '/'; 'S/N', 'S/T'; algunos son RUT por error |
| 6 | PREINGRESO | 164 | texto(158)+fecha(6) | 'NO TUVO'(133), 'PENDIENTE'(20) |
| 7 | DUPLA INGRESO | 362 | texto(361)+fecha(1) | Médico/profesional dupla |
| 8 | SEGUIMIENTO | 214 | texto(208)+fecha(6) | |
| 9 | PROFESIONAL | 165 | texto(164)+fecha(1) | **Mezcla próximo control + dupla**: 'PENDIENTE'(138), 'ABRIL 2026 MEDICO + ENFERMERO'(5)... |
| 10 | FECHA PROX. CONTROL | 233 | texto(233) | Todo texto libre |
| 11 | EVALUACIÓN DE PIE | 1 | fecha | Prácticamente vacía |
| 12 | OTROS | 251 | texto | |
| 13 | COLUMNA 1 | 30 | texto(27)+fecha(3) | Sin definir |

### Hoja: Ingresos Enero — 82 filas, encabezado fila 1
NOMBRE · RUT · ASISTENCIA(texto: 'INGRESO 5/1/2026', rescates) · CELULAR(num) ·
PRE INGRESO · FECHA INGRESO(**fecha pura**) · MEDICO/DUPLA ·
OBSERVACION/EXAMENES SOLICITADOS · PROXIMO CONTROL(texto: 'M/E ABRIL').

### Hoja: Ingreso Febrero — 95 filas, encabezado fila 1
NOMBRE PACIENTE · RUT · CELULAR(mixto, dobles '/') · PRE INGRESO(casi vacía) ·
FECHA INGRESO(**mixta**: fecha(19)+texto(12) tipo 'NO SE PRESENTO') ·
MEDICO/DUPLA · OBSERVACION/PENDIENTE · PROXIMO CONTROL(texto libre).

---

## 3. PCTS. ECICEP DESDE 2023.xlsx (300 KB)

Sector **Verde**, histórico desde 2023. Seis hojas.

### Hoja: PLANILLA ECICEP SECTOR VERDE — ~954 filas, encabezado fila 1, **30 separadores**

| # | Columna | Llenos | Tipos | Observaciones |
|---|---------|--------|-------|---------------|
| 1 | COLUMN 12 | 95 | texto | Sin definir (¿composición dupla?) |
| 2 | FECHA DE INGRESO | 920 | fecha(917) | Typos: '10-02-0205' |
| 3 | NOMBRE | 953 | texto | |
| 4 | RUT | 919 | texto | |
| 5 | ESTRATIFICACION | 765 | texto | **'G' sin nivel(399)**, G3(197), G2(122), G1(47) |
| 6 | FONO | 900 | num(715)+texto(185) | Dobles '/' |
| 7 | PREINGRESO | 281 | fecha(247)+texto(34) | '-'(34) |
| 8 | DUPLA INGRESO | 849 | texto | |
| 9 | SEGUIMIENTO | 585 | **fecha(511)**+texto(74) | Mayormente fecha de último seguimiento; textos: 'NARANJO'(5), 'OK', 'NO CONTESTA'... |
| 10 | PROFESIONAL | 539 | texto | Profesional asignado (ej. V.TAPIA) |
| 11 | FECHA PROX CONTROL | 835 | fecha(819)+texto(16) | |
| 12 | OTROS | 826 | texto | Composición control: 'M+E', 'M+N' |

### Hoja: PLANILLA PRE INGRESOS — 384 filas, **encabezado en fila 3**
NOMBRE · RUT · TELEFONO(mixto, con anotaciones tipo nombre de familiar) ·
FECHA(fecha 368; '#VALUE!'(2)) · PREFESIONAL*(typo de PROFESIONAL)* ·
ESTRATIFICACION(G2(102), G3(84), G1(29), 'NSP 22/10') ·
FECHA DE INGRESO(**texto mayoritario**: '09-2025', '23/07/2025') · OBSERVACION.

### Hoja: GESTOR DE CASO — 4 registros, encabezado fila 2
NOMBRE · RUT · ESTATIFICACION*(typo)* · PATOLOGIAS · QUIEN DERIVA · MOTIVO.
Flujo distinto (derivación a gestor de caso), no ingreso ECICEP estándar.

### Hoja: NO LLENAR — ~892 filas, encabezado fila 2, 18 separadores
**Duplicado histórico de los ingresos del sector verde** ("INGRESOS ECICEP SECTOR
VERDE", secciones "ECICEP 2023"…). Mismos pacientes que PLANILLA SECTOR VERDE.
Columnas fantasma llenas: col13(721 textos), col14(13), col15(2), col19(1).
Valor basura en estratificación: literal 'ESTRATIFICACION'(9).
⚠️ **Debe excluirse de cualquier migración** (riesgo de doble conteo).

### Hoja: CONTROLES PENDIENTES — 2 registros, encabezado fila 2
NOMBRE · RUT · FONO · FECHA DE CONTROL SUSPENDIDA. Controles suspendidos por
ausencia de profesional.

### Hoja: INASISTENTES A INGRESOS — ~39 filas, **sin encabezado claro**
Fecha · NOMBRE · RUT · (estratificación) · FONO · dupla · estado 'INASISTENTE'.

---

## 4. Síntesis de equivalencias detectadas

| Concepto | Amarillo | Verde | Naranjo |
|---|---|---|---|
| Nombre | NOMBRE | NOMBRE / NOMBRES | USUARIO / NOMBRE / NOMBRE PACIENTE |
| RUT | RUT | RUT | *(sin título)* / RUT |
| Teléfono | TELÉFONO | FONO / TELEFONO | TELEFONO / FONO / CELULAR |
| Estratificación | G | ESTRATIFICACION | ESTRATIFICACIÓN |
| Preingreso | PREINGRESO | PREINGRESO / PRE- INGRESO / PRE INGRESO | PREINGRESO / PRE INGRESO |
| Fecha ingreso | INGRESO | FECHA DE INGRESO / FECHA INGRESO | J / FECHA INGRESO |
| Dupla | —(no tiene) | DUPLA INGRESO / MEDICO/DUPLA INGRESO | DUPLA INGRESO / MEDICO /DUPLA |
| Seguimiento | SEGUIMIENTO (fecha o PENDIENTE) | SEGUIMIENTO / SEGUIMIENTO TELEFONICO (fecha) | SEGUIMIENTO (texto) |
| Último control | CONTROL | —(implícito) | — |
| Próximo control | PRÓXIMO CONTROL | FECHA PROX CONTROL / PROXIMO CONTROL | FECHA PROX. CONTROL / PROXIMO CONTROL / PROXIMA FECHA CONTROL |
| Estado | ESTADO | —(implícito) | ESTADO (solo LISTADO 2025) |
| Observaciones | OBSERVACIONES | OTROS / OBSERVACION | OBSERVACIONES / OTROS / OBSERVACION /EXAMENES |

## 5. Hallazgos que condicionan el diseño

1. La misma columna cambia de **tipo y semántica** entre sectores (SEGUIMIENTO =
   fecha en Verde, estado en Amarillo, texto libre en Naranjo).
2. **PROFESIONAL** en Naranjo consolidada mezcla "próximo control" con dupla.
3. 'DUPLA' en LISTADO Naranjo = disciplina profesional, no dupla médico+profesional.
4. Existen **pacientes compartidos entre sectores** (evidencia directa en datos).
5. Fechas con años imposibles y seriales corruptos requieren validador estricto.
6. RUT sin DV (~10% en LISTADO Naranjo) requiere estrategia de matching secundaria.
