// v255 (DEC-110) — Sin sesión no hay PII: las vistas de operador se sirven como
// shell (sin precargar paciente) y toda RPC de operador responde sesión requerida.
import assert from 'node:assert/strict';
import { crearContextoOperador } from './helpers/operador_vm.mjs';

const { c, props } = crearContextoOperador();
const PII = /"RUT"|"NOMBRE"|"TELEFONOS?"|"OBSERVACIONES?"|"SALUD_MENTAL"|"DIAGNOSTICO"|12345678|EC-001/;

const VISTAS = {
  portal: 'Sidebar', pacientes: 'Sidebar', ingresos: 'Sidebar', controles: 'Controles',
  estadisticas: 'Dashboard', configuracion: 'Configuracion', backups: 'Backup',
  registro: 'LogVisor', instalar: 'Instalador', rem: 'RemVista', generarRem: 'RemGenerador'
};

// Shell sin PII en cada vista de operador.
for (const [vista, archivo] of Object.entries(VISTAS)) {
  const r = c.doGet({ parameter: { vista } });
  assert.equal(r.tipo, 'html', vista + ' sirve HTML');
  assert.equal(r.vars.MODO_OPERADOR, true, vista + ' es de operador');
  assert.doesNotMatch(JSON.stringify(Object.keys(r.vars)), PII, vista + ' no precarga PII');
  assert.doesNotMatch(JSON.stringify(r.vars.CAPTURA_ACCESO || ''), PII, vista + ' no filtra PII en la credencial universal');
}

// Con una vista que acepta id, no se resuelve el paciente sin sesión.
const conId = c.doGet({ parameter: { vista: 'pacientes', id: 'EC-001' } });
assert.doesNotMatch(JSON.stringify(conId.vars), PII, 'no se hidrata el paciente en el shell');

// Toda RPC de operador sin sesión → sesión requerida, respuesta sin PII.
props.set('ECICEP_OPERATOR_SECRET_SHA256', 'deadbeef');
const rpc = c.WebApp_operadorRpc('', 'WebApp_cargarPacienteEdicion', ['EC-001']);
assert.equal(rpc.codigo, 'OPERADOR_SESION_REQUERIDA');
assert.doesNotMatch(JSON.stringify(rpc), PII, 'la denegación no filtra PII');

// Sin secret configurado, el login tampoco revela nada.
props.delete('ECICEP_OPERATOR_SECRET_SHA256');
assert.equal(c.WebApp_operadorIniciar('x').codigo, 'OPERADOR_NO_CONFIGURADO');
console.log('operator_no_session_no_pii_v255: shell sin PII + gateway cerrado PASS');
