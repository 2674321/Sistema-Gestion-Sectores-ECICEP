# INFORME S6 — Actualización de datos desde fuentes (v0.9.6)

Fase S6 de ampliación de datos ECICEP. Decisión vigente: **DEC-064**.
Informe de 30 secciones: auditoría de fuentes y SEXO, contrato de campos
(fuente/derivado/inferido), política FUENTE vs SISTEMA, merge, orquestación
ACTUALIZAR, trazabilidad, tests y despliegue.

---

## 1. Resumen ejecutivo

`Actualizar sistema` dejó de ser un recalculo de derivados (DEC-058) y pasó a ser
el **mecanismo real de mantenimiento**: detecta registros nuevos en las fuentes
autorizadas, actualiza campos vacíos de pacientes existentes, repara columnas
faltantes del modelo, normaliza, recalcula derivados y refresca vistas/formato.
Todo bajo un merge **conservador e idempotente** que nunca destruye un dato
vigente ni infiere datos. Una sola cadena (`Act_actualizarSistema`) evita rutas
paralelas.

## 2. Alcance

- Módulos tocados: `03_Fuentes.js`, `27_Actualizacion.js`, `07_UI.js`,
  `00_Config.js` (versión), `10_Pruebas.js`, documentación.
- Módulos NO tocados: captura Web App (V2), instalador (creación completa),
  pipeline de eventos, remesas REM, IA backend.

## 3. Estado previo

- `v0.9.5` (código), `ECICEP.VERSION='0.9.3'` (desactualizado), deploy **@180**.
- Núcleo **597/597**; total baterías **868/868**; `validar_html` 17/17.
- Árbol limpio en `3d64e2e`.

## 4. Problema

El flujo operativo FUENTE → importar registros nuevos → actualizar existentes →
estructura → derivados → vista era **inviable** desde el menú: DEC-058 limitaba
`Actualizar` a derivados/vistas y delegaba en el instalador la importación y la
estructura, forzando una reinstalación para incorporar datos.

## 5. Objetivos

1. ACTUALIZAR soporta el ciclo completo de mantenimiento.
2. Merge no destructivo, idempotente y trazable.
3. Maximización de campos capturados desde fuentes (incluido SEXO).
4. Sin inferencias; vacío = sin información.
5. Tests, docs, despliegue y commit limpio.

## 6. Auditoría de fuentes

- `FUENTES_DRIVE` (`00_Config.js:700`): 3 archivos (`SEGUIMIENTO ECICEP Sector
  Amarillo`, `ECICEP NARANJO`, `PCTS. ECICEP DESDE 2023`).
- `HOJAS_AUTORIZADAS_CARGA` (`:723`) restringe el universo de hojas.
- No existe `docs/FUENTES-DATOS.md` (mera referencia en comentario);
  la correspondencia fuente→destino vive en configuración.

## 7. Auditoría SEXO

- `SEXOS` (`00_Config.js:885`) ya normaliza `M|F|OTRO|vacío`, con sinónimos
  (MASCULINO/HOMBRE/VARON→M; FEMENINO/MUJER→F).
- El campo existe en `MODELO_PACIENTE`; el comentario `00_Config.js:883` indica
  que las fuentes actuales no lo traen: hoy se cubre el Caso D (vacío = sin
  información) y actúan el enriquecimiento (S5) y el merge (fill-only).
- **Conclusiones**: sinónimos suficientes para las codificaciones documentadas
  (no se agregan); **no se infiere SEXO por nombre**; si una hoja futura lo
  incluye, la normalización y el llenado ya están operativos.
- Verificación en los libros reales pendiente de acceso en vivo (no medible
  desde el entorno agente).

## 8. Encabezados de fuente sin destino

`ENCABEZADOS_SIN_DESTINO` (`00_Config.js:1003`): 15 encabezados conocidos-pero-sin-mapeo
(DUPLA, COLUMN 12, COLUMNA 1, EVALUACION DE PIE, ASISTENCIA, PATOGIAS,
PATOLOGIAS, QUIEN DERIVA, MOTIVO, FECHA, OBSERVACION EXAMENES SOLICITADOS,
OBSERVACION PENDIENTE, MEDICO DUPLA INGRESO, ESTATIFICACION, FECHA DE LLAMADO).
Política vigente: **NO CONVIENE CARGAR** (semántica ambigua o fuera del modelo),
salvo decisión cliente (PENDIENTES §1 #4).

## 9. Contrato de campos — FUENTE vs SISTEMA

| Campo | Desde fuente (merge) | Derivado / SISTEMA |
|---|---|---|
| SEXO | fill-only canónico | `Estrat_*` no lo recalcula |
| FECHA_NACIMIENTO | fill-only | enriquecimiento S5 |
| ULTIMO_CONTROL / ULTIMO_SEGUIMIENTO | MÁS RECIENTE (nunca retrocede) | — |
| PROXIMO_CONTROL | fill-only (persiste si no derivable) | `Control_recalcularTodos` si derivable |
| PROFESIONAL_SEGUIMIENTO, PREINGRESO, DUPLA_INGRESO, TELEFONOS, OBSERVACIONES | fill-only | — |
| NOMBRE, RUT, SECTOR, ESTADO, ESTRATIFICACION, FECHA_INGRESO, EDAD, técnicos | **NUNCA** | revisión humana / derivados |

## 10. Clasificación campo-origen

- **CARGADO**: campos que la fuente puede completar de forma fiable (sección 9,
  primeras filas).
- **NO CARGADO**: `NOMBRE`, `RUT`, `SECTOR`, `ESTADO`, `ESTRATIFICACION`,
  `FECHA_INGRESO` — identidad, pertenencia territorial y estado son dominio de
  revisión humana/derivados.
- **NO CONVIENE CARGAR**: los 15 encabezados de la sección 8 (ambiguos o ajenos
  al modelo).

## 11. SEXO — categorización de casos

| Caso | Fuente | Modelo | Tratamiento |
|---|---|---|---|
| A | canónico/sinónimo | vacío | se completa (fill) |
| B | canónico/sinónimo | valor igual | sin cambios |
| C | canónico/sinónimo | valor distinto | conflicto → REQUIERE_REVISION |
| D | vacío/irreconocible | cualquiera | nada (vacío = sin información), nunca se infiere |

## 12. Merge — reglas

1. Fuente vacía/inválida nunca destruye.
2. Fechas de estado: MÁS RECIENTE válida.
3. Demografía: fill-only; divergencia → REQUIERE_REVISION.
4. Contexto: fill-only.
5. Identidad/derivados jamás se escriben desde fuente.
6. Trazabilidad: `FUENTE` index sin duplicar + `FECHA_ACTUALIZACION`.
7. Filas `ERROR` nunca alimentan; sin RUT no hay match.
8. Idempotencia: segunda corrida sin cambios.

## 13. Algoritmos del merge

- `Act_mergearPaciente` (puro): recorre `CAMPOS_MERGE_FUENTE` con las tres ramas
  (fechas-max, demografía con normalización defensiva de SEXO, contexto fill-only).
- `Act_mergearPacientesDesdeStaging` (puro): match por `RUT` canónico exacto
  (misma clave que S5), produce reporte `revisados/actualizados/sinCambios/
  conflictos/campos/detalle` sin PII.
- `Act_appendFuente`: append de segmento fuente sin duplicar.

## 14. Orquestador ACTUALIZAR

`Act_actualizarSistema(opciones)`:

1. Estructura: `Modelo_asegurarEsquemaPacientes` + `Modelo_alinearVistasSectoriales`.
2. Datos: `Fuentes_cargaReal({ ejecutar, actualizar: true })`.
3. Demografía: `Act_enriquecerPacientes` (misma implementación que S5).
4. Derivados: `Estrat_recalcularTodos` + `Control_recalcularTodos`.
5. Vistas/formato: `Modelo_refrescarVistasSectores` + `HVis_formatearIngresos`
   + `Hojas_formatoCondicional`.
6. Resumen consolidado trazable.

## 15. Fuentes_cargaReal en modo actualizar

- Split del staging: `stagingNuevas` (pacientes nuevos) y `stagingReutilizables`
  (merge sobre existentes).
- En merge se lee `store.pacientes` también en dry-run (análisis realista).
- Persistencia UNIFICADA en un bloque (igual que el barrido de enriquecimiento).
- Esquema incompatible → `resumen.error='ESQUEMA_PACIENTES_INCOMPATIBLE'`.
- Idempotencia de eventos de FUENTE conservada (filas ya importadas no generan
  eventos pero participan del merge).

## 16. UI

- `UI_actualizarSistema`: nuevo mensaje (qué actualiza / qué nunca toca).
- `UI_actualizarTodo`: delega en `Act_actualizarSistema` y tostaea el resumen vía
  `Act_resumenActualizacionTexto`. Sin lógica duplicada.

## 17. Trazabilidad

- `FUENTE`: anexa `ARCHIVO_ORIGEN|HOJA_ORIGEN|FILA_ORIGEN` sin duplicar segmentos.
- `FECHA_ACTUALIZACION`: estampa al aplicar campos.
- `REQUIERE_REVISION`: marca divergencias demográficas; el valor vigente se
  conserva intacto.

## 18. Instalador vs ACTUALIZAR

- Instalador: única puerta para **creación completa** de estructura e instalación.
- ACTUALIZAR: reparación idempotente (columnas faltantes) + datos + derivados.
- Separación verificada por tests (sin `api_instalarPaso` en la cadena).

## 19. ESTRATIFICACION y ESTADO (excluidos del merge)

- `ESTRATIFICACION`: `Estrat_recalcularTodos` (motor ON, REGLA_DISPONIBLE=true)
  la recalcula desde CONDICIONES → cualquier valor de fuente sería sobrescrito.
- `ESTADO`: caché derivada del flujo de atención → dominio de SISTEMA.

## 20. PROXIMO_CONTROL (persistencia)

`Control_recalcularTodos` solo setea PROXIMO cuando es derivable; el valor traído
de fuente persiste en caso contrario. La vigilancia siempre se deriva en vivo
(doctrina FIX v0.8.5).

## 21. Contrato roto (tests migrados)

Tests que exigían el comportamiento DEC-058 ("Actualizar no importa fuentes / no
toca estructura") re-apuntados al nuevo contrato DEC-064:

- S11R-2, S11R-3: delegación UI → cadena única.
- S12 U1–U5: cadena = fuentes + estructura + derivados + vistas/formato; sin
  instalador, sin creación directa de pacientes/eventos, sin referencias a
  captura.
- T12/T13: reparación de estructura y migración SECTOR_* explícitas en la cadena.

## 22. Nueva suite de pruebas

`_pruebas_actualizacion_v096` (9):

- A1 SEXO/fecha fill-only + normalización (sin falsos conflictos).
- A2 fuente vacía nunca destruye.
- A3 fechas de estado: MÁS RECIENTE, nunca retrocede.
- A4 divergencia demográfica → REQUIERE_REVISION sin sobrescribir.
- A5 merge por RUT completo + campos protegidos intactos.
- A6 idempotencia (2ª corrida sin cambios).
- A7 trazabilidad (FUENTE sin duplicar, FECHA_ACTUALIZACION, REQUIERE_REVISION).
- A8 contrato de campos (CAMPOS_MERGE_FUENTE y protegidos).
- A9 cadena Act_actualizarSistema integra todos los pasos y reporta métricas.

## 23. Verificación

- Núcleo **606/606** (597 + 9 nuevos).
- `validar_html` 17/17; contrato datos 38/38; cola 33/33; payload V2 19/19;
  backend V2 68/68; formulario web 27/27; contrato V2 36/36; aceptación 50/50.
- Total **894/894**.

## 24. node --check

Sintaxis verificada en `03_Fuentes`, `27_Actualizacion`, `07_UI`, `00_Config`,
`10_Pruebas` (copia `.gs→.js`).

## 25. Despliegue

`clasp push --force` + nueva versión del deployment operativo
(reutilizado, sin crear deployments por rutina). Smoke `GET /exec` → 200.

## 26. E2E y límites del entorno

- E2E de menú en libro real (botón "Actualizar sistema") requiere login
  interactivo: **guía manual** en §28.
- La auditoría de SEXO en las hojas reales se verifica en el mismo recorrido.

## 27. Documentación

- `DECISIONES.md`: DEC-064.
- `PENDIENTES.md`: §13.
- `README.md`: versión 0.9.6 + baterías.
- Este informe (`docs/INFORME_ACTUALIZACION_S6.md`).

## 28. Guía manual de verificación (E2E)

1. Abrir el Spreadsheet operativo → menú "Actualizar sistema" → confirmar.
2. Verificar toast con resumen `fuentesRevisadas/nuevos/actualizados/...`.
3. Abrir menú "Sistema → Instalar / reparar": sin cambios en estructura si todo
   estaba al día (idempotente).
4. Revisar conteo final: agregar una fila nueva en una hoja autorizada → volver a
   actualizar → aparece como nuevo sin duplicar eventos.
5. En ficha de una persona con `SEXO` vacío y fuente con SEXO: se completa;
   si además incluye `FECHA_NACIMIENTO` divergente → latiza REQUIERE_REVISION sin
   sobrescribir.
6. Ejecutar batería completa: `node tests/ejecutar_local.mjs` (606) y las 8
   suites auxiliares (894 en total) + `validar_html` (17).

## 29. Riesgos

- Los 15 encabezados "NO CONVIENE CARGAR" pueden contener semántica que el
  cliente quiera mapear: decisión explícita requerida (PENDIENTES §1 #4).
- SEXO sin acceso a libros reales: el enriquecimiento/merge están operativos y
  preservativos; validación visual pendiente de login.
- El merge conserva valores de fuente no derivables (ej. PROXIMO sin ULTIMO):
  comportamiento intencional, documentado en DEC-064 §5.

## 30. Estado del commit

`src/` y `docs/` actualizados; baterías verdes; despliegue operativo actualizado;
árbol de Git limpio tras commit + push (ver mensaje de cierre del agente).

---
**Fecha:** 2026-09-15 · **Versión:** 0.9.6 · **Decisión:** DEC-064