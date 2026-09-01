# CONTRATOS — Especificación funcional ECICEP

## Alcance

Este documento describe el contrato **vigente** de captura de la Web App y el recorrido interno de los datos.

Google Forms no forma parte del contrato actual.

`FORM_RESPUESTAS` es una hoja interna del pipeline y conserva su nombre por compatibilidad con el código; su existencia no implica que exista un Google Form.

## Entrada Web App

```javascript
Form_capturarDesdeUI(datos)
```

La UI es `CapturaWeb.html` y llama al backend mediante `google.script.run`.

## Campos del payload

| Campo | Tipo | Requerido | Acciones |
|-------|------|-----------|----------|
| `ACCION` | enum | sí | Todas |
| `RUT` | texto | sí | Todas |
| `NOMBRE` | texto | sí | `NUEVO_INGRESO` |
| `SEXO` | enum | no | `NUEVO_INGRESO` |
| `FECHA_NACIMIENTO` | fecha | sí | `NUEVO_INGRESO` |
| `SECTOR` | enum | sí | `NUEVO_INGRESO` |
| `ESTRATIFICACION` | enum | no | `NUEVO_INGRESO` |
| `TELEFONOS` | texto | no | `NUEVO_INGRESO`, `ACTUALIZAR_DATOS` |
| `FECHA_EVENTO` | fecha | sí | `REGISTRAR_CONTROL`, `REGISTRAR_SEGUIMIENTO` |
| `PROFESIONAL` | texto | sí | Todas |
| `PROFESIONAL2` | texto | no | Todas |
| `OBSERVACIONES` | texto | no | Todas |

## Acciones

### `NUEVO_INGRESO`

- **Obligatorios:** RUT, NOMBRE, FECHA_NACIMIENTO, SECTOR, PROFESIONAL.
- **Opcionales:** SEXO, ESTRATIFICACION, TELEFONOS, PROFESIONAL2, OBSERVACIONES.
- **Destino lógico:** `INGRESO_<SECTOR>` → pipeline → PACIENTES/EVENTOS.
- **Regla:** el pipeline determina si corresponde crear un paciente nuevo, enlazar o requerir revisión. La captura no decide duplicados por sí sola.

### `REGISTRAR_CONTROL`

- **Obligatorios:** RUT, FECHA_EVENTO, PROFESIONAL.
- **Opcionales:** PROFESIONAL2, OBSERVACIONES.
- **Destino:** EVENTOS con `TIPO_EVENTO=CONTROL` y actualización derivada de PACIENTES.
- **Regla:** utiliza `api_registrarEvento`/pipeline existente; no existe una ruta clínica paralela.

### `REGISTRAR_SEGUIMIENTO`

- **Obligatorios:** RUT, FECHA_EVENTO, PROFESIONAL.
- **Opcionales:** PROFESIONAL2, OBSERVACIONES.
- **Destino:** EVENTOS con `TIPO_EVENTO=SEGUIMIENTO` y actualización derivada de PACIENTES.

### `ACTUALIZAR_DATOS`

- **Obligatorios:** RUT, PROFESIONAL.
- **Opcionales:** TELEFONOS, PROFESIONAL2, OBSERVACIONES.
- **Destino:** actualización de campos operativos de PACIENTES + evento de auditoría `OTRO`.
- **Regla:** no modifica campos de identidad ni la estratificación clínica protegida por este contrato.

## Profesional 2

`PROFESIONAL2` es un campo opcional del contrato.

Cuando se utilice, el backend y la UI deben impedir duplicar el mismo profesional en ambas posiciones.

Este contrato se considera **resuelto y vigente**; no reabrirlo salvo una regresión demostrada.

## Respuesta exitosa

```javascript
{
  ok: true,
  message: 'Registro realizado correctamente',
  data: {
    responseId: 'UI-...',
    accion: 'NUEVO_INGRESO',
    estado: 'PROCESADO',
    motivo: '',
    idInterno: '...'
  },
  errors: []
}
```

## Respuesta con error de validación

```javascript
{
  ok: false,
  message: 'El registro no pasó la validación.',
  errors: [{ campo: 'RUT', mensaje: 'RUT ausente' }]
}
```

## `FORM_RESPUESTAS`

La hoja almacena la entrada normalizada/pendiente y el resultado del procesamiento. Sus columnas contractuales actuales son:

1. `FECHA_FORMS`
2. `RESPONSE_ID`
3. `FORM_VERSION`
4. `USUARIO`
5. `ACCION`
6. `RUT`
7. `NOMBRE`
8. `SEXO`
9. `FECHA_NACIMIENTO`
10. `SECTOR`
11. `ESTRATIFICACION`
12. `TELEFONOS`
13. `FECHA_EVENTO`
14. `PROFESIONAL`
15. `PROFESIONAL2`
16. `OBSERVACIONES`
17. `TRAZA_CRUDA`
18. `INGRESO_HOJA`
19. `INGRESO_FILA`
20. `REINTENTOS`
21. `ESTADO`
22. `MOTIVO`
23. `ID_INTERNO`
24. `ID_EVENTO`
25. `FECHA_PROCESO`

Las lecturas deben realizarse por encabezado/campo contractual cuando el código lo permita; no asumir índices físicos como lógica de negocio.

## Estados

Estados relevantes del procesamiento:

```text
RECIBIDO → VALIDANDO → VALIDO → PROCESADO
                    ├→ REQUIERE_REVISION
                    └→ ERROR
```

Los reintentos no deben duplicar efectos clínicos. La idempotencia se basa en los identificadores y marcas definidas por el código actual.

## Pipeline único

```text
CapturaWeb.html
      ↓
google.script.run
      ↓
Form_capturarDesdeUI(datos)
      ↓
Form_validarRespuesta()
      ↓
FORM_RESPUESTAS
      ↓
Form_procesarPendientes()
      ↓
Form_procesarLote()
      ↓
pipeline clínico existente
      ↓
INGRESO_* / EVENTOS / PACIENTES
```

No existe otra ruta paralela de captura que deba coexistir con este flujo.

## Configuración

La fuente de verdad de configuración es `src/00_Config.js`, incluyendo, entre otros:

- `ECICEP.SPREADSHEET_ID`;
- `ECICEP.VERSION`;
- definición de campos de captura;
- catálogo de profesionales;
- sectores y demás catálogos vigentes.

No crear configuraciones duplicadas en documentos, formularios o archivos separados.
