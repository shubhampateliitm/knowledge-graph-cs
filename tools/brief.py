"""Print everything a writer needs about some concepts: current read (in the content format), links with reasons,
neighbours and Stanford courses.   usage: python3 tools/brief.py id [id ...]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kg

d = kg.load()
N = {n["id"]: n for n in d["nodes"]}
taught = {}
for c in d["curriculum"]["courses"]:
    for cid in c["concepts"]: taught.setdefault(cid, []).append(f'{c["code"]} {c["title"]}')
for nid in sys.argv[1:]:
    if nid not in N: print(f"!! unknown id {nid}\n"); continue
    n = N[nid]
    print("=" * 78)
    print(f"ID {nid} | {n['label']} | L{n['l']} {kg.LAYERS[n['l']]['n']} | category: {n['cat']} | year: {n['y']} | status: {n['st']}")
    print(f"MECHANISM (one line shown under the title): {n['m']}")
    print(f"CURRENT LENGTH: {n['w']} words, deep={n['deep']}")
    if taught.get(nid): print("TAUGHT IN: " + "; ".join(taught[nid]))
    down = [e for e in d["edges"] if e["s"] == nid]; up = [e for e in d["edges"] if e["t"] == nid]
    print("\nSTANDS ON (lower concepts this one is built from; explain how each adds value):")
    for e in down: print(f"  - {e['t']} ({N[e['t']]['label']}, L{N[e['t']]['l']}) [{e['k']}]: {e['r']}")
    print("\nBUILT ON IT (higher concepts that use this one):")
    for e in up: print(f"  - {e['s']} ({N[e['s']]['label']}, L{N[e['s']]['l']}): {e['r']}")
    sd = [s for s in d["side"] if nid in (s["a"], s["b"])]
    if sd:
        print("\nNEIGHBOURS:")
        for s in sd:
            o = s["b"] if s["a"] == nid else s["a"]; print(f"  - {o} ({N[o]['label']}) [{s['t']}]: {s['r']}")
    print("\nCURRENT READ (rewrite and expand; keep what is correct):")
    print(f"@@ {nid}")
    for sec, ps in n["rd"].items():
        for i, p in enumerate(ps):
            print(f"{sec}: {p}" if i == 0 else p)
    for r in n["refs"]:
        print(f"ref: {r['k']} | {r['t']} | {r['w']} | {r['u']}".rstrip(" |") if not r['u'] else f"ref: {r['k']} | {r['t']} | {r['w']} | {r['u']}")
    print()
