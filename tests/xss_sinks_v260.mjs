import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),dir=path.join(root,'src');
const audit=fs.readFileSync(path.join(root,'docs/AUDITORIA_XSS_V260.md'),'utf8');
const sink=/innerHTML|outerHTML|insertAdjacentHTML|insertAdjacentElement|document\.write|srcdoc|setAttribute\(|\.href\s*=|\.style\.[A-Za-z]+\s*=|on[a-z]+\s*=/;
for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.html')).sort()){
  const text=fs.readFileSync(path.join(dir,name),'utf8'); if(sink.test(text)) assert.ok(audit.includes(`| ${name} |`),`${name}: sink no clasificado`);
  assert.doesNotMatch(text,/\b(?:outerHTML|document\.write|srcdoc)\b/,`${name}: sink prohibido`);
}
const dash=fs.readFileSync(path.join(dir,'Dashboard.html'),'utf8');assert.doesNotMatch(dash,/Error cargando datos:<\/b>['" ]*\+msg/);assert.match(dash,/createTextNode\(String\(msg\|\|'Error'\)\)/);
const side=fs.readFileSync(path.join(dir,'Sidebar.html'),'utf8');assert.match(side,/insertAdjacentHTML\('beforeend',[\s\S]{0,180}_esc\(pie\)/);
const tokens=fs.readFileSync(path.join(dir,'00_Tokens.html'),'utf8');assert.match(tokens,/\['https:\/\/fonts\.googleapis\.com', 'https:\/\/fonts\.gstatic\.com'\]/);
assert.match(audit,/0 VULNERABLE/);
console.log('xss_sinks_v260: PASS');
