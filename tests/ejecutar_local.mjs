#!/usr/bin/env node
/**
 * Harness local de pruebas del núcleo ECICEP (DEC-016).
 * Ejecuta exactamente las mismas suites que el menú ECICEP → 🧪 en Apps Script,
 * sin depender de hojas, red ni hora actual.
 *
 * Uso: node tests/ejecutar_local.mjs
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(__dirname, '..');

const archivos = [
  'src/00_Config.js',
  'src/01_Utilidades.js',
  'src/02_Normalizacion.js',
  'src/03_Fuentes.js',
  'src/04_Identificacion.js',
  'src/13_Eventos.js',
  'src/14_REM.js',
  'src/15_RemExcel.js',
  'src/16_Amarillo.js',
  'src/17_Hojas.js',
  'src/18_Calidad.js',
  'src/12_Ingresos.js',
  'src/Webhook.js',
  'src/06_Modelo.js',
  'src/08_Dashboard.js',
  'src/11_DatosPrueba.js',
  'src/10_Pruebas.js'
];

let codigo = '';
for (const a of archivos) {
  codigo += readFileSync(path.join(raiz, a), 'utf8') + '\n';
}

const sandbox = { console, JSON, Date, Math, RegExp, Object, Array, String, Number };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(codigo + '\n;__resultado = Pruebas_ejecutarTodo();', sandbox, { filename: 'ecicep-nucleo.js' });
} catch (e) {
  console.error('ERROR cargando el núcleo:', e.message);
  process.exit(2);
}

const r = sandbox.__resultado;
console.log(`\nECICEP núcleo — Total: ${r.total} · OK: ${r.pasados} · FALLAN: ${r.fallidos}`);
for (const d of r.detalles.filter(x => !x.ok)) {
  console.log('  ✗ ' + d.nombre + '\n      ' + d.error);
}
process.exit(r.fallidos ? 1 : 0);
