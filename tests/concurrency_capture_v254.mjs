import { assertConcurrency } from './helpers/forms_v254_harness.mjs';
const result = assertConcurrency();
for (const n of [5, 10, 20, 50]) {
  if (result[n].perdidas || result[n].duplicadas || result[n].serviceBusy) throw new Error('Concurrencia falló en ' + n);
}
console.log('concurrency_capture_v254: PASS');
