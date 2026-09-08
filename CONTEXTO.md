# CONTEXTO — Sistema ECICEP

## Cliente

- **Nombre:** Camila Paz Aguilar
- **Profesión:** Enfermera
- **Correo:** camilapazaguilar.h90@gmail.com
- **Teléfono:** +56 9 4251 2556

## Naturaleza del proyecto

Proyecto **particular**, desarrollado a medida para la cliente.
**No constituye un proyecto institucional del CESFAM**: evitar documentar o
presentar el sistema como desarrollo oficial de la institución.

## Problema

Los tres sectores del CESFAM San Juan (Amarillo, Verde, Naranjo) registran los
pacientes del programa ECICEP en planillas separadas con estructuras distintas:

- Doble trabajo al buscar un paciente que puede estar en más de una planilla.
- Imposible saber de un vistazo qué pacientes existen, su estado, próximo control
  y quién requiere seguimiento.
- Formatos inconsistentes (fechas, RUT, teléfonos, estados) incluso dentro de
  una misma hoja.

## Solución comprometida

Sistema sobre **Google Sheets + Google Apps Script** que:

1. Integra la información de los tres sectores en una base única.
2. Normaliza nombres, RUT, teléfonos, fechas y estados.
3. Consolida duplicados en una ficha única por paciente (con trazabilidad de origen).
4. Permite búsqueda, registro de controles, próximas fechas, estados y observaciones.
5. Automatiza el procesamiento de las fuentes (eficiente, por lotes).
6. Entrega una interfaz simple para uso cotidiano + dashboard de indicadores.
7. Mantiene trazabilidad: origen, sector, fecha de actualización, conflictos.

## Alcance comprometido (8 ejes)

1. Integración de información
2. Normalización de datos
3. Consolidación centralizada (deduplicación)
4. Gestión y seguimiento
5. Automatización del procesamiento
6. Interfaz simple
7. Dashboard de indicadores
8. Trazabilidad

## Restricciones operativas

- Los datos son **información personal y sanitaria**: nunca salir del entorno
  local/Google de la cliente hacia repositorios públicos.
- El procesamiento masivo de datos reales requiere instrucción explícita
  (migración controlada: análisis → validación → simulación → reporte → migración).
- Prioridad de calidad: estable, rápido, claro, mantenible, modular, escalable,
  documentado, seguro.
