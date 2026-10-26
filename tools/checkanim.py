"""Validate animated scene files: python3 tools/checkanim.py [files...] (default: content/anim/*.json)"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kg
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TONES = {"normal", "accent", "ok", "bad", "muted", "warn"}; SHAPES = {"box", "round", "circle", "db", "cell", "note"}
def check(scenes, nodes, where):
    errs, ids = [], set()
    if not isinstance(scenes, list): return [f"{where}: top level must be a list"]
    for s in scenes:
        sid = s.get("id", "?"); p = f"{where}:{sid}"
        if sid in ids: errs.append(f"{p} duplicate id")
        ids.add(sid)
        if s.get("concept") not in nodes: errs.append(f"{p} unknown concept {s.get('concept')!r}")
        W, H = s.get("w", 720), s.get("h", 400)
        actors = {}
        def addactor(a, q):
            for k in ("id", "x", "y"):
                if k not in a: errs.append(f"{q} actor missing {k}")
            if a.get("shape", "box") not in SHAPES: errs.append(f"{q} bad shape {a.get('shape')}")
            x, y, w, h = a.get("x", 0), a.get("y", 0), a.get("w", 120), a.get("h", 50)
            if x < 0 or y < 0 or x + w > W + 1 or y + h > H + 1: errs.append(f"{q} actor {a.get('id')} outside the {W}x{H} view")
            actors[a.get("id")] = a
        for a in s.get("actors", []): addactor(a, p)
        for g in s.get("groups", []):
            if g.get("x", 0) + g.get("w", 0) > W + 1 or g.get("y", 0) + g.get("h", 0) > H + 1: errs.append(f"{p} group {g.get('id')} outside view")
        for l in s.get("links", []):
            if l.get("from") not in actors or l.get("to") not in actors: errs.append(f"{p} link to unknown actor {l}")
        steps = s.get("steps", [])
        if not 3 <= len(steps) <= 16: errs.append(f"{p} has {len(steps)} steps (need 3-16)")
        for i, st in enumerate(steps):
            q = f"{p} step {i+1}"
            if not st.get("say"): errs.append(f"{q} missing say")
            for a in st.get("add", []): addactor(a, q)
            for m in st.get("msgs", []):
                if m.get("from") not in actors or m.get("to") not in actors: errs.append(f"{q} msg between unknown actors {m.get('from')}->{m.get('to')}")
                if m.get("tone", "normal") not in TONES: errs.append(f"{q} bad tone")
            for k, v in st.get("set", {}).items():
                if k not in actors: errs.append(f"{q} set unknown actor {k}")
                if v.get("tone", "normal") not in TONES: errs.append(f"{q} bad tone {v.get('tone')}")
            for k, v in st.get("move", {}).items():
                if k not in actors: errs.append(f"{q} move unknown actor {k}")
                else:
                    a = actors[k]
                    if v.get("x", 0) + a.get("w", 120) > W + 1 or v.get("y", 0) + a.get("h", 50) > H + 1: errs.append(f"{q} move of {k} leaves the view")
            for l in st.get("link", []):
                if l.get("from") not in actors or l.get("to") not in actors: errs.append(f"{q} link to unknown actor")
            for k in st.get("focus", []):
                if k not in actors: errs.append(f"{q} focus unknown actor {k}")
            changed = any(st.get(k) for k in ("msgs", "set", "move", "add", "remove", "link", "unlink", "focus"))
            if not changed: errs.append(f"{q} changes nothing visible")
    return errs
if __name__ == "__main__":
    nodes = {n["id"] for n in kg.load()["nodes"]}
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "content/anim/*.json")))
    total, bad = 0, 0
    for f in files:
        try: sc = json.load(open(f, encoding="utf-8"))
        except Exception as e: print(f"{f}: invalid JSON: {e}"); bad += 1; continue
        e = check(sc, nodes, os.path.basename(f)); total += len(sc) if isinstance(sc, list) else 0
        for x in e: print(x)
        bad += len(e)
    print(f"{total} scenes, {bad} problems"); sys.exit(1 if bad else 0)
