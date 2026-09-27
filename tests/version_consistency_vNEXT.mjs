#!/usr/bin/env node
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const cfg=readFileSync(new URL('../src/00_Config.js',import.meta.url),'utf8');
const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
const version=(cfg.match(/VERSION:\s*'([^']+)'/)||[])[1];
assert.equal(version,'0.16.0');assert.match(readme,new RegExp('release-v'+version.replace(/\./g,'\\.')));assert.match(readme,new RegExp('`v'+version.replace(/\./g,'\\.')+'`'));
assert.match(cfg,/SISTEMA_VERSION_SCHEMA_ACTUAL\s*=\s*2/,'schema clínico permanece independiente');
console.log('Version consistency vNEXT: '+version+' PASS');
