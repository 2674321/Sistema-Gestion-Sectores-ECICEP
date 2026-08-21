# MODELO EVENTOS — Entidad vs Actividad (ETAPA 2.5)

> Estado: DISEÑO APROBADO (implementación en ETAPA 3). Este documento responde
> formalmente: ¿qué es un paciente?, ¿qué es un evento?, ¿qué información es
> estado actual y qué información es historial?

## 1. Decisión central

**El sistema mantiene DOS entidades complementarias:**

```text
PACIENTES (entidad)                EVENTOS (actividad)
¿Quién es la persona?              ¿Qué ocurrió con esa persona?
├── Identificación                 ├── Fecha del evento
├── Demografía                     ├── Tipo (ingreso/control/seguimiento…)
├── Sector territorial VIGENTE    ├── Sector donde ocurrió
├── Estratificación VIGENTE       ├── Estratificación AL MOMENTO (snapshot)
└── Estado VIGENTE (caché)         ├── Profesional · descripción · cantidad
                                   └── Fuente · registro
```

**Justificación:** el REM exige contar *eventos* por mes/sector/nivel G ("Control
integral G2 de agosto"), y el dashboard exige evolución temporal por fecha de
evento (#26/#27 del requerimiento). Un modelo de una fila estática por persona
sobrescribiría el historial y haría imposible reconstruir esas cifras sin doble
digitación. Con eventos, **cada dato operativo se registra UNA vez** y alimenta
seguimiento, dashboard y REM (principio #62).

## 2. Definiciones formales

| Concepto | Definición | Representación |
|---|---|---|
| PACIENTE | Persona identificable (RUT) inscrita en el flujo ECICEP | 1 fila en PACIENTES |
| INGRESO | Alta formal de la persona al programa ECICEP | EVENTO `INGRESO` (+ creación de entidad si no existía) |
| CONTROL | Atención de control integral realizada | EVENTO `CONTROL` |
| SEGUIMIENTO | Gestión telefónica/a distancia registrada | EVENTO `SEGUIMIENTO` |
| PLAN DE CUIDADO | Elaboración/actualización de plan | EVENTO `PLAN_CUIDADO` |
| GESTIÓN DE CASO (ingreso/egreso) | Entrada/salida del programa de gestión de casos | EVENTO `GESTION_CASO_INGRESO` / `GESTION_CASO_EGRESO` |
| EGRESO | Salida del paciente del flujo ECICEP | EVENTO `EGRESO` (la entidad NO se borra) |
| LLAMADO | Intento de contacto telefónico (flujo LISTADO Naranjo) | EVENTO `LLAMADO` |
| CAMBIO DE SECTOR | Reasignación territorial administrativa | EVENTO `CAMBIO_SECTOR` (anterior→nuevo+motivo); nunca sobrescribe historial |
| CAMBIO DE ESTRATIFICACIÓN | Recalificación G1/G2/G3 | EVENTO `CAMBIO_ESTRATIFICACION` (auditoría, ver ESTRATIFICACION.md) |

⚠️ Definiciones operativas exactas de PLAN_CUIDADO y GESTION_CASO_* requieren
confirmación de la cliente (PENDIENTES #15) — no se codifican supuestos.

## 3. Reglas del modelo

1. **EVENTOS es append-only**: nunca se edita ni borra un evento registrado;
   correcciones = nuevo evento correctivo referenciado (ETAPA de consolidación
   define mecánica).
2. **PACIENTES guarda el estado VIGENTE como caché** derivada de los eventos
   (último seguimiento, último control, próximo control, sector actual,
   estratificación vigente). La verdad operativa son los eventos; la caché
   existe para búsqueda/uso diario rápido. La sincronización la hace Apps Script
   tras cada escritura de eventos (regla documentada, no edición manual de la caché).
3. **Snapshot de riesgo**: cada evento guarda `RIESGO_G` tal como estaba al
   ocurrir. El REM cuenta por ese snapshot, no por la estratificación actual.
4. **Sector del evento inmutable**: lo determina la hoja de origen (INGRESO_*)
   o quien registra; no depende de digitación manual posterior.
5. **Sector geográfico ≠ estratificación**: dimensiones totalmente independientes
   (DEC-018). Un paciente del Sector Amarillo puede ser G1, G2 o G3.
6. **Egreso no borra**: el paciente pasa a estado EGRESADO; sus eventos permanecen.

## 4. Hoja EVENTOS — estructura propuesta

| Campo | Tipo | Nota |
|---|---|---|
| ID_EVENTO | id (téc) | `EV-<base36>-<rand>` |
| ID_INTERNO | link | FK a PACIENTES |
| RUT | texto | Denormalizado para filtrado directo |
| NOMBRE | texto | Snapshot al momento del evento |
| FECHA_EVENTO | fecha | **Base de todo análisis temporal y REM** |
| TIPO_EVENTO | enum | Ver §2 |
| SECTOR | enum | NARANJO \| AMARILLO \| VERDE |
| RIESGO_G | enum | G1\|G2\|G3 snapshot; '' si aún no clasifica |
| PROFESIONAL | texto | |
| PROFESIONAL_TIPO | texto | Lo pide el bloque "atenciones" del REM |
| DESCRIPCION | texto | Libre |
| CANTIDAD | número | Solo si aplica |
| OBSERVACIONES | texto | |
| FUENTE | texto (téc) | archivo\|hoja\|fila u ORIGEN_HUMANO |
| REGISTRADO_POR | email (téc) | Auditoría |
| FECHA_REGISTRO | fecha (téc) | |

## 5. Flujo de hojas de ingreso por sector (DEC-019)

```text
INGRESO_NARANJO / _AMARILLO / _VERDE   ← usuario del sector SOLO aquí
        ↓  (acción "Registrar ingreso")
VALIDACIÓN (RUT, nombre, teléfono, obligatorios, duplicados)
        ↓
IDENTIFICACIÓN (¿ya existe en PACIENTES?)
     ↙            ↘
 SÍ: actualizar     NO: crear entidad
     ↘            ↙
   EVENTO INGRESO (sector = hoja de origen, inmutable)
        ↓
PACIENTES (estado vigente) → DASHBOARD → REM
```

Estados de solicitud de ingreso (centralizados): PENDIENTE · VALIDANDO · LISTO ·
INGRESADO · DUPLICADO · REQUIERE_REVISION · ERROR. Errores críticos **no** crean
registros automáticamente; la fila queda marcada con nota explicativa.

## 6. Impacto en PACIENTES (v2)

- Se incorporan: `SEXO`, `FECHA_NACIMIENTO` (requeridos por REM/demografía;
  hoy ausentes de las fuentes → captura futura vía hojas de ingreso),
  `CONDICIONES` (entrada del motor de estratificación) y el par
  `ESTRAT_ORIGEN/ESTRAT_CALCULADA`.
- `FECHA_LLAMADO` deja de ser columna: su historial vive como eventos `LLAMADO`.
- Detalle completo en MODELO-DATOS.md v2.0.

## 7. Inventario final de hojas (justificado, sin inflar)

| Hoja | Rol | Etapa |
|---|---|---|
| CONFIG · LOG · FUENTES · CONFLICTOS | Sistema/administración | 2 ✅ |
| PACIENTES | Base consolidada (entidad) | 2 ✅ (se amplía a v2) |
| EVENTOS | Historial de actividad | 3 |
| STAGING_IMPORT · MAPA_ORIGEN | Aterrizaje y trazabilidad de migración | 3 |
| SECTOR_NARANJO / _AMARILLO / _VERDE | Superficies operativas sincronizadas (no bases independientes) | 4 |
| INGRESO_NARANJO / _AMARILLO / _VERDE | Puertas de entrada controladas por sector | 4 |
| DASHBOARD (+aux oculta) | Análisis dinámico | 4 |
| REM_SALIDA (+REM_INFORME si aplica) | Reporting mensual generado | 5 |
| INICIO | Portada/navegación | 4 |

Total proyectado: ~15 hojas con función clara. SEGUIMIENTO como vista de trabajo
se evalúa dentro de DASHBOARD/SECTOR_* antes de crear otra hoja.
