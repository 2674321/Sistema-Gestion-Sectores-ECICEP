import { assertInstallerIdempotent, assertMigrations, assertExplicitAdoption } from './helpers/forms_v254_harness.mjs';
assertInstallerIdempotent(); assertMigrations(); assertExplicitAdoption();
console.log('forms_installer_idempotence_v254: PASS');
