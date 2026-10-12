import { assertInstallerIdempotent, assertMigrations } from './helpers/forms_v254_harness.mjs';
assertInstallerIdempotent(); assertMigrations();
console.log('forms_installer_idempotence_v254: PASS');
