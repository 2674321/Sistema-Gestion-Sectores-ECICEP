# DASHBOARD — Diseño (ETAPA 2.5)

> Estado: DISEÑO APROBADO (implementación ETAPA 4). Objetivo: análisis dinámico
> de los tres sectores con filtros de período y sector, sin fórmulas volátiles
> gigantes y con trazabilidad de cada cifra.

## 1. Una sola hoja

Todo el dashboard vive en **una hoja `DASHBOARD`** (+ una hoja auxiliar oculta
`DASH_AUX` solo si las series mensuales/detalle lo exigen). Sin dashboards
fragmentados ni hojas por sector duplicadas.

## 2. Zona de filtros (celdas identificadas, editables sin código)

```text
┌──────────────────────────────────────────────────────┐
│ ANÁLISIS ECICEP                                       │
│ Período:  [MES ACTUAL ▼]   Desde: [01/08/2026]       │
│                            Hasta: [31/08/2026]       │
│ Sector:   [TODOS ▼]                                   │
│ [🔄 Actualizar]      Última actualización: …         │
└──────────────────────────────────────────────────────┘
```

- **Tipo de período** (validación de datos): MES ACTUAL · MES ANTERIOR ·
  ÚLTIMOS 3 MESES · ÚLTIMOS 6 MESES · AÑO ACTUAL · AÑO A LA FECHA · PERSONALIZADO.
  Elegir un preset recalcula Desde/Hasta; PERSONALIZADO respeta las fechas
  manuales → cualquier rango analizable sin modificar código.
- **Sector**: TODOS · SECTOR NARANJO · SECTOR AMARILLO · SECTOR VERDE.
  Nunca G1/G2/G3 en este selector (DEC-018).
- **[🔄 Actualizar]** ejecuta la agregación Apps Script (menú equivalente).

## 3. Bloques de indicadores

| Bloque | Contenido | Fuente |
|---|---|---|
| Calidad de datos | registros incompletos, sin RUT válido, fechas inválidas, sin sector, estratificación pendiente, conflictos abiertos | PACIENTES + CONFLICTOS |
| Pacientes | total; matriz **Sector × G1/G2/G3**; por sexo; por tramo etario (derivado de FECHA_NACIMIENTO) | PACIENTES |
| Actividad ECICEP (período) | ingresos · controles · seguimientos · planes de cuidado · gestiones de caso (ingreso/egreso) · egresos — total y por sector | EVENTOS |
| Temporal | serie mensual del período (por tipo de evento); acumulado; comparación vs período anterior equivalente | EVENTOS |
| Pendientes | próximos controles (30/60/90 días) · controles atrasados · seguimientos pendientes | PACIENTES (estado vigente) |

Solo se construyen indicadores sostenibles por la fuente real (requerimiento #13).

## 4. Estrategia de cálculo (rendimiento)

- **On-demand**: la agregación corre al pulsar 🔄 (y opción "actualizar al abrir").
  Lectura por bloques de PACIENTES/EVENTOS + agregación en memoria + escritura de
  resultados compactos. Nada recalculándose constantemente.
- Fórmulas nativas solo ligeras (COUNTIFS sobre tablas auxiliares pequeñas);
  prohibido FILTER/QUERY masivos re-evaluando miles de filas.
- Resultados escritos como valores (no fórmulas) → dashboard estable y rápido.
- Caché de agregaciones (CFG_CACHE) si conviene para lecturas repetidas.

## 5. Trazabilidad de indicadores (#31/#32)

Ningún número es caja negra: cada indicador tiene su vista DETALLE (sección
inferior u hoja DASH_AUX) con los registros/eventos que componen la cifra bajo
los mismos filtros. Ejemplo: "Controles = 47" → tabla filtrable de esos 47
eventos CONTROL del período/sector. Implementación: la misma función que agrega
expone el subconjunto fuente.

## 6. Comparación entre sectores

La matriz Sector × Nivel G responde directamente: ¿cuántos ingresos en el
período por sector?, ¿cuántos controles G1/G2/G3 hizo cada sector?
El selector SECTOR=TODOS muestra las tres columnas + fila TOTAL.
