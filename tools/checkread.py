"""Check a draft long-read file against the whole graph, and report length and completeness per concept.
usage: python3 tools/checkread.py path/to/draft.txt [--strict]
Exit code 0 only if the file parses and (with --strict) every concept in it meets the deep-read standard."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kg

path = os.path.abspath(sys.argv[1]); strict = "--strict" in sys.argv
try:
    d = kg.load(extra=[path])
except kg.ContentError as e:
    print("FORMAT ERRORS:\n" + str(e)); sys.exit(1)
ids = []
for line in open(path, encoding="utf-8"):
    m = re.match(r"^@@\+? (\S+)", line.strip())
    if m and m.group(1) not in ids: ids.append(m.group(1))
N = {n["id"]: n for n in d["nodes"]}
L = {r["id"]: r for r in d["layers"]}
bad = 0
for i in ids:
    n = N.get(i) or L.get(i)
    rd = n["rd"]; w = n["w"]
    sec_w = {s: sum(kg.words(p) for p in rd.get(s, [])) for s in kg.SECTIONS}
    probs = []
    if w < 1800: probs.append(f"only {w} words (target 1,800-3,000)")
    if sec_w["how"] < 600: probs.append(f"how has {sec_w['how']} words (target 700+)")
    for s in ("terms", "history", "example", "mistakes", "practice", "quiz"):
        if not rd.get(s): probs.append(f"missing {s}")
    if rd.get("quiz") and len(rd["quiz"]) < 5: probs.append(f"{len(rd['quiz'])} quiz questions (need 5)")
    if rd.get("terms") and len(rd["terms"]) < 6: probs.append(f"{len(rd['terms'])} terms (need 6+)")
    if len(n["refs"]) < 4: probs.append(f"{len(n['refs'])} sources (need 4+)")
    if probs: bad += 1
    print(f"{'OK ' if not probs else '!! '} {i:22s} {w:5d} words  " + " ".join(f"{s}={sec_w[s]}" for s in kg.SECTIONS if sec_w[s]) + f" refs={len(n['refs'])}" + ("" if not probs else "\n     -> " + "; ".join(probs)))
print(f"\n{len(ids)} concepts, {bad} below standard")
sys.exit(1 if (strict and bad) else 0)
