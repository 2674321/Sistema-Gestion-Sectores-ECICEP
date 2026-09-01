# CONTRATOS — Especificación funcional ECICEP

## Web App

### Entrada

```javascript
Form_capturarDesdeUI(datos)
```

### Campos del payload

| Campo | Tipo | Requerido | Acciones |
|-------|------|-----------|----------|
| `ACCION` | enum | sí | Todas |
| `RUT` | texto | sí | Todas |
| `NOMBRE` | texto | sí | NUEVO_INGRESO |
| `SEXO` | enum | no | NUEVO_INGRESO |
| `FECHA_NACIMIENTO` | fecha | sí | NUEVO_INGRESO |
| `SECTOR` | enum | sí | NUEVO_INGRESO |
| `ESTRATIFICACION` | enum | no | NUEVO_INGRESO |
| `TELEFONOS` | texto | no | NUEVO_INGRESO, ACTUALIZAR_DATOS |
| `FECHA_EVENTO` | fecha | sí | REGISTRAR_CONTROL, REGISTRAR_SEGUIMIENTO |
| `PROFESIONAL` | texto | sí | Todas |
| `PROFESIONAL2` | texto | no | Todas |
| `OBSERVACIONES` | texto | no | Todas |

### Acciones

#### NUEVO_INGRESO

- **Obligatorios**: RUT, NOMBRE, FECHA_NACIMIENTO, SECTOR, PROFESIONAL
- **Opcionales**: SEXO, ESTRATIFICACION, TELEFONOS, PROFESIONAL2, OBSERVACIONES
- **Destino**: `INGRESO_<SECTOR>` → pipeline → PACIENTES
- **Efecto**: Nuevo paciente + EVENTOS (via pipeline)

#### REGISTRAR_CONTROL

- **Obligatorios**: RUT, FECHA_EVENTO, PROFESIONAL
- **Opcionales**: PROFESIONAL2, OBSERVACIONES
- **Destino**: EVENTOS (TIPO_EVENTO=`CONTROL`) + cache PACIENTES
- **Efecto**: Evento registrado + paciente actualizado

#### REGISTRAR_SEGUIMIENTO

- **Obligatorios**: RUT, FECHA_EVENTO, PROFESIONAL
- **Opcionales**: PROFESIONAL2, OBSERVACIONES
- **Destino**: EVENTOS (TIPO_EVENTO=`SEGUIMIENTO`) + cache PACIENTES
- **Efecto**: Evento registrado + paciente actualizado

#### ACTUALIZAR_DATOS

- **Obligatorios**: RUT, PROFESIONAL
- **Opcionales**: TELEFONOS, PROFESIONAL2, OBSERVACIONES
- **Destino**: PACIENTES (directo) + EVENTOS (TIPO_EVENTO=`OTRO`)
- **Efecto**: Campos actualizados + evento de auditoría

### Respuesta

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

### Errores

```javascript
{
  ok: false,
  message: 'El registro no pasó la validación.',
  errors: [{ campo: 'RUT', mensaje: 'RUT ausente' }]
}
```

## FORM_RESPUESTAS

### Columnas (orden)

1. FECHA_FORMS
2. RESPONSE_ID
3. FORM_VERSION
4. USUARIO
5. ACCION
6. RUT
7. NOMBRE
8. SEXO
9. FECHA_NACIMIENTO
10. SECTOR
11. ESTRATIFICACION
12. TELEFONOS
13. FECHA_EVENTO
14. PROFESIONAL
15. PROFESIONAL2
16. OBSERVACIONES
17. TRAZA_CRUDA (JSON completo)
18. INGRESO_HOJA
19. INGRESO_FILA
20. REINTENTOS
21. ESTADO
22. MOTIVO
23. ID_INTERNO
24. ID_EVENTO
25. FECHA_PROCESO

## Configuración

- Fuente de verdad: `00_Config.js`
- `ECICEP.SPREADSHEET_ID`: ID del Spreadsheet activo
- `ECICEP.VERSION`: Versión del sistema
- `FORM_CONFIG.CAMPOS`: Definición de campos del formulario
- `CATALOGO_PROFESIONALES`: Lista de profesionales

## Pipeline

```
Web App
  ↓
Form_capturarDesdeUI()
  ↓
Form_validarRespuesta()
  ↓
FORM_RESPUESTAS (fila RECIBIDO)
  ↓
Form_procesarPendientes()
  ↓
Form_procesarLote()
  ↓
Decisión: ANEXAR | CLINICA
  ↓
Efecto: INGRESO_* | EVENTOS | PACIENTES
```
