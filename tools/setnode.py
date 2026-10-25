"""Set a field of a node line.  usage: python3 tools/setnode.py ID FIELD 'new value'   (FIELD: label|cat|year|status|mechanism)"""
import glob, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nid, field, val = sys.argv[1], sys.argv[2], sys.argv[3]
idx = {"label": 1, "cat": 2, "year": 3, "status": 4, "mechanism": 5}[field]
for f in glob.glob(os.path.join(ROOT, "content/graph/nodes*.txt")):
    lines = open(f, encoding="utf-8").read().split("\n"); hit = False
    for i, l in enumerate(lines):
        p = [x.strip() for x in l.split("|", 5)]
        if len(p) == 6 and p[0] == nid:
            p[idx] = val; lines[i] = " | ".join(p); hit = True
    if hit:
        open(f, "w", encoding="utf-8").write("\n".join(lines)); print(f"{nid}.{field} = {val}"); break
else: sys.exit(f"node {nid} not found")
