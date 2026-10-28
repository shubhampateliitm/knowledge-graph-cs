"""Validate architecture pattern files: python3 tools/checkpatterns.py [files...] (default: content/patterns/*.txt)
--show prints each pattern's automatic layout as columns, so you can see the drawing without a browser."""
import glob, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kg, patterns
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
show = "--show" in sys.argv
nodes = {n["id"]: n for n in kg.load()["nodes"]}
files = [os.path.abspath(f) for f in args] or None
pats, cat, errs = patterns.load(set(nodes), files=files)
errs += patterns.check_scenes(pats, set(nodes))
for c, ps in pats.items():
    if not 2 <= len(ps) <= 4 and nodes[c]["l"] <= 2: print(f"warning: {c} has {len(ps)} patterns (aim for 2-4 on L0-L2)")
    for x in ps:
        hw = sum(len(h.split()) for h in x["how"])
        if hw < 60: print(f"warning: {c} / {x['title']}: how is {hw} words (aim for 80-220)")
        if hw > 300: print(f"warning: {c} / {x['title']}: how is {hw} words (aim for 80-220)")
        if show and x.get("scene"):
            s = x["scene"]; cols = {}
            for a in s["actors"]: cols.setdefault(a["x"], []).append(a)
            print(f"\n{c} / {x['title']}  ({s['w']}x{s['h']}, {len(s['steps'])} steps)")
            for xx in sorted(cols): print("   | " + "  ||  ".join(f"{a['label']} [{a['shape']}]" for a in sorted(cols[xx], key=lambda a: a["y"])))
for e in errs: print(e)
n = sum(len(ps) for ps in pats.values())
print(f"{n} patterns on {len(pats)} concepts, {len(errs)} problems")
sys.exit(1 if errs else 0)
