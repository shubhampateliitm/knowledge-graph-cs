"""List concept ids: python3 tools/kg_ids.py [filter words]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kg
f = " ".join(sys.argv[1:]).lower()
for n in kg.load()["nodes"]:
    line = f"{n['id']:18s} L{n['l']}  {n['label']}  ({n['cat']})"
    if not f or f in line.lower(): print(line)
