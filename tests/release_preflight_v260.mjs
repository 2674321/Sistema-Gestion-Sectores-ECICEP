import assert from 'node:assert/strict'; import {commands,runPreflight,versionGate} from '../tools/preflight_release.mjs';
assert.equal(versionGate("VERSION: '0.16.4'",'v0.16.4').reason,'VERSION_MISMATCH');
assert.ok(commands.some(x=>x[1].some(a=>a.includes('rpc_public_surface_v255.mjs'))),'RPC surface incluida');
assert.ok(commands.some(x=>x[1].some(a=>a.includes('xss_sinks_v260.mjs'))),'XSS incluido');
const fail=runPreflight({allowDirty:true,commandRunner:(cmd,args)=>({status:args.some(a=>a.includes('validar_html.mjs'))?1:0,stdout:'',stderr:''})});assert.equal(fail.reason,'COMMAND_FAILED');
const pass=runPreflight({allowDirty:true,commandRunner:()=>({status:0,stdout:'',stderr:''})});assert.equal(pass.ok,true);
console.log('release_preflight_v260: PASS');
