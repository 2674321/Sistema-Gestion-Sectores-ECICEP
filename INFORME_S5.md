# INFORME S5 — Enriquecimiento seguro de PACIENTES en "Instalar / reparar sistema"

**Fecha:** 2026-09-07
**Versión objetivo:** v0.9.3+ (ECICEP.VERSION) · DEC-057
**Resultado de batería:** núcleo 489/489 · regresión completa 734/734

## 1. Resumen ejecutivo

S5 incorpora el **enriquecimiento demográfico** como etapa del instalador: **"⚙️ Instalar / reparar sistema"** (`UI_instalarSistema` → `Instalador.html` → `INSTALAR_ETAPAS` → `Instalar_pEnriquecimiento` en `src/20_Instalador.js`) **completa únicamente campos demográficos vacíos** de `PACIENTES` (`SEXO`, `FECHA_NACIMIENTO`) a partir de los datos que ya viven en las hojas `INGRESO_*` del mismo entorno (única fuente de verdad). Corre antes de la etapa `verificar` y su resumen se muestra en la pantalla final del panel. No se crea lógica paralela, no se reintroducen formularios, no se toca `FORM_RESPUESTAS`, el contrato de captura V2, `captureId` ni deployments. **Corrección solicitada tras validación real**: el enriquecimiento **no** va en "🔄 Actualizar sistema" (`UI_actualizarSistema` queda con su rol original).

Reglas núcleo: identidad por `RUT` canónico exacto, solo campos vacíos, nunca inferir, `EDAD` siempre derivada (jamás almacenada), idempotente, trazable (append `FUENTE` + `FECHA_ACTUALIZACION` + `Log_info`). Fuentes inconsistentes → `REQUIERE_REVISION` sin escritura. La ejecución es idempotente y se dispara únicamente al usar "Instalar / reparar sistema".

Núcleo: **469 → 489** (+20 casos S5) · regresión completa **734/734 verdes**.

## 2. Contrato de campos S5

- `CAMPOS_ENRIQUECIMIENTO = ['SEXO', 'FECHA_NACIMIENTO']` en `src/27_Actualizacion.js:29` (única fuente).
- Todo lo demás (NOMBRE, RUT, TELEFONOS, SECTOR, ESTADO, ESTRATIFICACION, …) permanece intacto.
- No existe el campo `EDAD` (decisión previa de edad derivada; `DECISIONES.md:195`).

## 3. Motor de enriquecimiento y reglas

- `Act_leerOrigenesDesdeBloques(bloques)` (puro): consolida SEXO/FECHA_NACIMIENTO por RUT canónico exacto desde bloques de hojas `INGRESO_*`.
  - Primer valor válido visto se conserva con su FUENTE exacta.
  - Segundo valor **igual** → consistente; **diferente** → `conflicto=true` → `REQUIERE_REVISION`.
  - RUT solo con DV; un RUT sin DV en la fuente no fabrica un match completo.
- `Act_normalizarCandidato(campo, raw)`: SEXO vía `Norm_normalizarSexo` (canónicos M/F/OTRO, sinónimos confirmados; desconocido → vacío); FECHA_NACIMIENTO vía `Norm_normalizarFecha` en `[1900, 2040]` (rango de nacimiento, no el de eventos); inválida → vacío.
- `Act_aplicarEnriquecimiento(paciente, origen)` (puro): muta solo campos vacíos; conflicto → sin escribir; origen inexistente → nada.
- `Act_enriquecerPacientes({dryRun})` (GAS): batch; dry-run por defecto (no escribe); con `dryRun:false` escribe el bloque PACIENTES una sola vez tras `Modelo_asegurarEsquemaPacientes`, estampando FUENTE/FECHA_ACTUALIZACION y `Log_info`.
- `Act_enriquecerPacientePorRut(rut, {dryRun})` (GAS): unitario; comparte el motor; nunca crea pacientes (`PACIENTE_NO_ENCONTRADO`).

## 4. Fuente de datos operativa

- Hojas de captura `INGRESO_*` de `HOJAS_INGRESO` (incluye alias `INGRESO_NARANJA`), con encabezados compatibles (`RUT`, `SEXO`, `FECHA DE NACIMIENTO`) y el layout visual estándar de la captura (título/secciones/encabezados/datos).
- Reutiliza funciones de hoja existentes: `Modelo_hoja`, `Modelo_leerBloqueCabecera`, `Modelo_headerRow`, `Modelo_dataStartRow`, `Ingresos_mapearEncabezadosHoja`, `Modelo_leerPacientes`.
- Solo filas con RUT normalizado válido; bloques sin encabezado RUT se descartan.
- Mapa de encabezados = `SINONIMOS_ENCABEZADOS` de `00_Config`; nada se mapea en silencio.

## 5. EDAD / identidad

- Identidad canónica: `ID_INTERNO`. Match de orígenes a pacientes: `RUT` canónico exacto (`Norm_normalizarRut`), misma clave del pipeline.
- `EDAD` nunca almacenada; se deriva en vivo con `Utl_edadDesde` (consciente del cumpleaños, rango 0–129). Tests de frontera: antes/el día/después del cumpleaños; recién nacido; 1900→126; fecha futura → sin edad.
- No se consolida por nombre, similitud ni heurísticas.

## 6. Idempotencia y consistencia

- Segunda ejecución → sin cambios nuevos (campos llenos no se tocan; FUENTE no duplica segmentos; sin eventos espurios; sin pacientes creados).
- Orígenes duplicados idénticos → consistente, conserva la primera FUENTE.
- Conflicto entre fuentes (SEXO M vs F; fechas distintas) → `REQUIERE_REVISION`, sin escribir el campo.

## 7. Trazabilidad

- Append a `FUENTE` con segmento `ENRIQUECIMIENTO|<hoja>|<fila física>` (sin duplicar, orden de aparición).
- Estampa `FECHA_ACTUALIZACION` por paciente aplicado.
- `Log_info('Actualizacion', 'enriquecerPacientes', {dryRun, enriquecidos, aplicados, conflictos})` — solo conteos, sin PII innecesaria.
- Test específico de conservación de FUENTE previa + incorporación del origen.

## 8. Escenarios E2E

- **E2E-A**: paciente con SEXO/FECHA_NACIMIENTO vacíos → "⚙️ Instalar / reparar sistema" → la etapa `enriquecimiento` completa desde INGRESO_*; verificar FUENTE/FECHA_ACTUALIZACION/Log; repetir → sin cambios (idempotencia real).
- **E2E-B**: paciente sin fuente → nada cambia.
- **E2E-C**: fuente con conflicto → `REQUIERE_REVISION`, sin escritura.
- **E2E-D**: unitario por RUT reutilizable.
- La verificación en vivo queda para ejecución manual con sesión administrador (§10).

## 9. Pruebas automatizadas

Nueva batería `_pruebas_enriquecimiento_s5` en `src/10_Pruebas.js` (20 tests): A (completo), B (FECHA vacía) + EDAD integrada, C/C2 (canónico + sinónimo), D/D2 (fuente inválida no completa, sin inferir), E/E2 (idempotencia + no sobrescritura), F/F2 (sin fuente → nada), G..G4 (conflicto, consolidación, RUT sin DV), H (campos no autorizados intactos), invariante de campos, FUENTE, EDAD/límites + 2 tests de wiring (etapa `enriquecimiento` en `INSTALAR_ETAPAS` antes de `verificar`; `UI_actualizarSistema` sin llamada a enriquecimiento).

Regresión completa: núcleo **489/489** · contrato V2 36/36 · aceptación 50/50 · contrato datos 20/20 · cola S2 33/33 · backend V2 65/65 · UI payload 16/16 · formulario web 25/25 → **734/734**. No se modificaron tests existentes para ocultar fallos.

## 10. Riesgos, limitaciones y NO-GO

- El enriquecimiento solo aplica si la hoja fuente conserva el dato legible y con RUT válido; no hay segunda base de datos (misma Spreadsheet).
- Si la captura futura no recoge SEXO/FECHA, el enriquecimiento seguirá dependiendo de las hojas INGRESO_*.
- FECHA_NACIMIENTO se escribe en ISO normalizado; fechas no ISO de la fuente se omiten (no se corrigen en silencio).
- El batch escribe el bloque PACIENTES completo (precedente de operaciones de limpieza/actualización); el unitario escribe una fila.
- **NO-GO**: no se toca `FORM_RESPUESTAS`, contrato captura V2, captureId, pipeline de captura, deployments (`@89`, `@HEAD`, operativo) ni se crean ambientes.

## 11. Documentación vigente actualizada

- `DECISIONES.md` → DEC-057.
- `ARQUITECTURA.md` → sección S5 (flujo, identidad, reglas, UI).
- `MODELO-DATOS.md` → campos 4/5 con fuente.
- `PENDIENTES.md` → #14 (disponibilidad SEXO/FECHA resuelta vía S5; el catálogo de condiciones sigue pendiente).
- `AGENTS.md` sin cambios (no altera arquitectura ni contratos).

## 12. Metadatos del informe

- Estado: **publicado** — `clasp push --force` OK; deployment operativo `AKfycbx16nfHiSKgHA04JlZnjjNn4JVri_kPO9fI4LC0sgwfP-42IGoYRFaXZ9XDGuwgRuYSCw` actualizado a **versión 93** tras la corrección de ubicación (sin crear deployments nuevos).
- Batería: núcleo 489/489 · completo 734/734.
- Archivos de código: `src/27_Actualizacion.js` (nuevo), `src/20_Instalador.js` (etapa `enriquecimiento`), `src/Instalador.html` (resumen final), `src/07_UI.js` (revert `UI_actualizarSistema`), `src/10_Pruebas.js` (20 tests S5), harnesses (5 archivos).
- Archivos de documentación: `DECISIONES.md`, `ARQUITECTURA.md`, `MODELO-DATOS.md`, `PENDIENTES.md`.
- E2E real: pendiente de ejecución manual con sesión administrador (mismo enfoque que S4).