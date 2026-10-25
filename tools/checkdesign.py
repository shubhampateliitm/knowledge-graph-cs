"""Check a draft design file: python3 tools/checkdesign.py path"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kg
p = os.path.abspath(sys.argv[1])
inplace = os.path.dirname(p) == os.path.join(kg.ROOT, "content", "design")   # already loaded from content/design/
try: d = kg.load(extra_designs=[] if inplace else [p])
except kg.ContentError as e: print("ERRORS:\n" + str(e)); sys.exit(1)
ids = [l[3:].strip() for l in open(p, encoding="utf-8") if l.startswith("@@ ")]
for x in d["designs"]:
    if x["id"] in ids:
        flag = "OK " if 2300 <= x["w"] <= 4200 else "!! "
        print(f"{flag} {x['id']:24s} {x['w']:5d} words  concepts={len(x['concepts'])} sections={','.join(x['rd'])}")
