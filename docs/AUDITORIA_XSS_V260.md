# Auditoría XSS sink-by-sink — v260

Fecha: 2026-10-13. Alcance: todos los `src/*.html`. La auditoría clasifica cada archivo que contiene un sink; el test `tests/xss_sinks_v260.mjs` impide incorporar un archivo con sinks sin esta clasificación.

Clasificaciones: `STATIC_SAFE` (literal controlado), `ESCAPED` (dato pasa por `_esc`/escape equivalente), `TEXT_CONTENT` (DOM seguro), `TRUSTED_INTERNAL` (valor cerrado o generado localmente) y `VULNERABLE` (debe quedar en cero).

| Archivo | Sinks y clasificación | Resultado |
|---|---|---|
| 00_OperadorRuntime.html | mensajes por `textContent`; atributos ARIA cerrados | TEXT_CONTENT / STATIC_SAFE |
| 00_Tokens.html | constructores DOM por `textContent`; URLs de fuentes con allowlist HTTPS literal | TEXT_CONTENT / TRUSTED_INTERNAL |
| AcercaDe.html | plantillas y estilos literales | STATIC_SAFE |
| Backup.html | tablas con campos escapados mediante `_esc`; errores escapados | ESCAPED |
| CapturaWeb.html | datos y errores con `_esc` o `textContent`; QR usa URL interna y `data:image/png`; HTML de estado restante es literal | ESCAPED / TEXT_CONTENT / TRUSTED_INTERNAL |
| CentroPruebas.html | estructura literal y resultados escapados | ESCAPED / STATIC_SAFE |
| Configuracion.html | opciones DOM creadas con `textContent`; estructura literal | TEXT_CONTENT / STATIC_SAFE |
| Controles.html | filas clínicas con `_esc`; ARIA y estilos de estado cerrados | ESCAPED / STATIC_SAFE |
| Dashboard.html | etiquetas/datos con escape o `textContent`; estados vacíos literales. `errorFatal` migrado en v260 de HTML crudo a nodos/texto | ESCAPED / TEXT_CONTENT / STATIC_SAFE |
| EditorPaciente.html | valores mediante `textContent`/value; estructura literal | TEXT_CONTENT / STATIC_SAFE |
| Instalador.html | mensajes mediante `textContent`; atributos ARIA/título | TEXT_CONTENT |
| LogVisor.html | filas escapadas; descarga por `URL.createObjectURL` local | ESCAPED / TRUSTED_INTERNAL |
| PortalWeb.html | estructura literal; navegación interna controlada | STATIC_SAFE / TRUSTED_INTERNAL |
| QRFormulario.html | URL mostrada por `textContent`; imagen QR/data URL local | TEXT_CONTENT / TRUSTED_INTERNAL |
| RemGenerador.html | opciones cerradas y estructura literal | STATIC_SAFE |
| RemVista.html | valores renderizados con escape; estructura literal | ESCAPED / STATIC_SAFE |
| Sidebar.html | datos clínicos y trazabilidad con `_esc`; `insertAdjacentHTML` recibe literal + valor escapado; atributos de ID no ejecutables | ESCAPED / STATIC_SAFE |

No se encontraron usos de `outerHTML`, `document.write` ni `srcdoc`. Los handlers `onclick` escritos en el HTML son llamadas estáticas a funciones locales; no se permite interpolar datos backend sin escape. Resultado final: **0 VULNERABLE**.

Reglas de continuidad:

- nombres, RUT, observaciones y errores externos: `textContent` por defecto;
- si una plantilla HTML es imprescindible, todo valor variable debe pasar por `_esc`;
- URLs dinámicas: `https:` en allowlist o `blob:`/`data:image` generado localmente;
- todo nuevo HTML con sink debe agregarse a esta tabla y superar el test estático.
