#!/usr/bin/env python3
"""
Sincronización confiable src/ ↔ Apps Script (bypass del diff de clasp).
Uso: python3 tools/sync_remoto.py
Garantiza que el proyecto remoto quede IDÉNTICO a src/.
"""
import json, os, urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rc = json.load(open(os.path.expanduser("~/.clasprc.json")))

def find_token(o):
    if isinstance(o, str) and len(o) > 100 and o.count(".") >= 2:
        return o
    if isinstance(o, dict):
        for k in ("access_token", "accessToken", "oauth_token", "token"):
            if k in o and isinstance(o[k], str):
                return o[k]
        for v in o.values():
            t = find_token(v)
            if t:
                return t
    if isinstance(o, list):
        for v in o:
            t = find_token(v)
            if t:
                return t

tok = find_token(rc)
sid = json.load(open(os.path.join(BASE, ".clasp.json")))["scriptId"]

def api(url, method="GET", body=None):
    req = urllib.request.Request(url, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))

files = []
src_dir = os.path.join(BASE, "src")

# BUILD.js generado: identidad de versión (commit + fecha) para INICIO
import subprocess
try:
    _commit = subprocess.check_output(['git','rev-parse','--short','HEAD'], cwd=BASE).decode().strip()
except Exception:
    _commit = 'dev'
from datetime import datetime as _dt
_build = "var ECICEP_BUILD = { commit: '%s', fecha: '%s' };" % (
    _commit, _dt.now().strftime('%Y-%m-%d %H:%M'))
open(os.path.join(src_dir, 'BUILD.js'), 'w', encoding='utf-8').write(_build + '\n')
for nombre in sorted(os.listdir(src_dir)):
    ruta = os.path.join(src_dir, nombre)
    if not os.path.isfile(ruta):
        continue
    source = open(ruta, encoding="utf-8").read()
    if nombre.endswith(".js"):
        files.append({"name": nombre[:-3], "type": "SERVER_JS", "source": source})
    elif nombre.endswith(".html"):
        files.append({"name": nombre[:-5], "type": "HTML", "source": source})
    elif nombre == "appsscript.json":
        files.append({"name": "appsscript", "type": "JSON", "source": source})

api(f"https://script.googleapis.com/v1/projects/{sid}/content", "PUT", {"files": files})

verificacion = api(f"https://script.googleapis.com/v1/projects/{sid}/content")["files"]
remoto = {f["name"]: len(f.get("source", "")) for f in verificacion}
print(f"Remoto actualizado con {len(files)} archivos:")
ok = True
for f in files:
    n = f["name"]
    coincide = remoto.get(n) == len(f["source"])
    ok = ok and coincide
    print(("  ✓ " if coincide else "  ✗ ") + n)
print("SINCRONIZACIÓN:", "COMPLETA" if ok else "CON DIFERENCIAS")
exit(0 if ok else 1)
