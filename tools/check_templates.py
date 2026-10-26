#!/usr/bin/env python3
"""Compile-check the code in content/practice/templates.json.

  python3 tools/check_templates.py [pattern substring]

Python: compile and run the definitions. JavaScript: node --check. Go: go vet (the snippet is wrapped in package main).
C++: g++ -std=c++17 -fsyntax-only with <bits/stdc++.h>. Rust: rustc as a library. A language whose tool is not installed is
skipped with a note. Scala is only checked for balanced braces. Also checks that every pattern used in problems.json has a
template. Exit code 1 on any failure."""
import json, os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, "content", "practice", "templates.json"), encoding="utf-8"))
P = json.load(open(os.path.join(ROOT, "content", "practice", "problems.json"), encoding="utf-8"))
only = sys.argv[1].lower() if len(sys.argv) > 1 else ""
tmp = tempfile.mkdtemp()
have = {t: shutil.which(t) for t in ("node", "go", "g++", "rustc")}
for t, w in have.items():
    if not w: print(f"note: {t} not found, skipping that language")
fails = []

def run(cmd, name, cwd=None, env=None):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, env=env)
    if r.returncode: fails.append(f"{name}\n{(r.stdout + r.stderr)[:1500]}")

for p in sorted({p["pattern"] for p in P}):
    if p not in T: fails.append(f"no template for the pattern {p!r}")
for name, t in T.items():
    if only and only not in name.lower(): continue
    c, key = t["code"], "".join(ch if ch.isalnum() else "_" for ch in name)
    try: exec(compile(c["python"], name, "exec"), {})
    except Exception as e: fails.append(f"{name} python: {e!r}")
    if have["node"] and c.get("javascript"):
        f = os.path.join(tmp, key + ".js"); open(f, "w").write(c["javascript"] + "\n"); run(["node", "--check", f], name + " javascript")
    if have["go"] and c.get("go"):
        d = os.path.join(tmp, "go_" + key); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "main.go"), "w").write("package main\n\n" + c["go"] + "\n\nfunc main() {}\n")
        open(os.path.join(d, "go.mod"), "w").write("module x\n\ngo 1.21\n")
        run(["go", "vet", "."], name + " go", cwd=d, env=dict(os.environ, GOFLAGS="-mod=mod"))
    if have["g++"] and c.get("cpp"):
        f = os.path.join(tmp, key + ".cpp"); open(f, "w").write("#include <bits/stdc++.h>\nusing namespace std;\n\n" + c["cpp"] + "\n")
        run(["g++", "-std=c++17", "-fsyntax-only", "-Werror=return-type", f], name + " cpp")
    if have["rustc"] and c.get("rust"):
        f = os.path.join(tmp, key + ".rs"); open(f, "w").write("#![allow(dead_code, unused)]\n" + c["rust"] + "\n")
        run(["rustc", "--edition", "2021", "--crate-type", "lib", "--emit=metadata", "-o", os.path.join(tmp, key + ".rmeta"), f], name + " rust")
    if c.get("scala") and c["scala"].count("{") != c["scala"].count("}"): fails.append(f"{name} scala: unbalanced braces")
shutil.rmtree(tmp, ignore_errors=True)
print("\n".join("FAIL " + f for f in fails) or f"{len(T)} templates ok")
sys.exit(1 if fails else 0)
