import fs from 'fs';
const files = fs.readdirSync('tests').filter(x=>x.includes('v255'));
let ok=true;
for (const f of files){
  const c=fs.readFileSync('tests/'+f,'utf8');
  if (/assert.ok(true)/.test(c)) { ok=false; }
}
if(!ok) process.exit(1);
console.log('ok');
