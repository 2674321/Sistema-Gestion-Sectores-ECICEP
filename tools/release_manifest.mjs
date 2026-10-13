#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export function buildManifest({ generatedAt = new Date().toISOString(), suites = 0, failures = 0 } = {}) {
  const cfg = read('src/00_Config.js');
  const appVersion = cfg.match(/VERSION:\s*'([^']+)'/)?.[1];
  const schemaVersion = Number(cfg.match(/SISTEMA_VERSION_SCHEMA_ACTUAL\s*=\s*(\d+)/)?.[1]);
  const installerVersion = cfg.match(/SISTEMA_VERSION_INSTALADOR\s*=\s*'([^']+)'/)?.[1];
  if (!appVersion || !schemaVersion || !installerVersion) throw new Error('VERSION_METADATA_INVALID');
  return {
    appVersion, releaseStage: 'RC', schemaVersion, installerVersion,
    gitSha: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), generatedAt,
    tests: { suites, failures },
    contracts: { capture: 'V4', formsSchema: 3, decisionsThrough: 'DEC-114' },
    activation: { productionMutated: false, requiresAfterHours: true }
  };
}

export function writeManifest(options = {}) {
  const manifest = buildManifest(options);
  fs.writeFileSync(path.join(root, 'RELEASE_CANDIDATE.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = writeManifest();
  console.log(`RELEASE_MANIFEST_WRITTEN ${m.appVersion} ${m.gitSha.slice(0, 12)}`);
}
