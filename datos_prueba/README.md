# datos_prueba/

Datasets FICTICIOS para desarrollo y pruebas. Nunca datos reales de pacientes.

- El dataset de normalización del núcleo vive en `src/11_DatosPrueba.js`
  (debe sincronizarse con Apps Script vía clasp; es la única fuente de casos
  para las suites que corren en node y en GAS).
- Esta carpeta está reservada para muestras de staging (ETAPA 3): pequeños
  CSV/XLSX artificiales con la estructura de las fuentes reales.

El `.gitignore` permite versionar únicamente los archivos de esta carpeta.
