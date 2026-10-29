"""Problem-map lessons: a short read for every idea (content/problemmap/lessons/*.txt), shown in the idea panel before
its ladder of problems. Format (spec in content/problemmap/lessons/README.md):

  @@ idea-id
  what: What the idea is, in 2-4 plain sentences.
  signals: phrase in a problem statement ; another phrase ; ...      (3-6, separated by " ; ")
  code:
  ```python
  def solve(...): ...                                                 (the core template, 6-40 lines, compiles)
  ```
  walk: #217 Contains Duplicate                                       (the idea's simplest problem)
  step: one step of the walk-through, with concrete values            (3-8 step lines)
  bugs: common bug ; another ; ...                                    (2-5, separated by " ; ")
  cost: O(n) time and O(n) extra space, because ...                   (one line)

python3 tools/lessons.py <file> [<file> ...] checks files against the problem map and compiles each template."""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEYS = ("what", "signals", "code", "walk", "step", "bugs", "cost")

def parse(path, ideas, errs):
    out, cur, code = {}, None, None
    where = os.path.relpath(path, ROOT) if path.startswith(ROOT) else path
    for ln, raw in enumerate(open(path, encoding="utf-8"), 1):
        line = raw.rstrip("\n"); w = f"{where}:{ln}"
        if code is not None:
            if line.strip() == "```": cur["code"] = "\n".join(code).rstrip(); code = None
            else: code.append(line)
            continue
        if not line.strip() or line.startswith("# "): continue
        if line.startswith("@@ "):
            iid = line[3:].strip()
            if iid not in ideas: errs.append(f"{w}: unknown idea {iid!r}"); cur = None; continue
            if iid in out: errs.append(f"{w}: duplicate lesson for {iid}")
            cur = out[iid] = dict(steps=[]); continue
        if cur is None: errs.append(f"{w}: text outside a lesson"); continue
        if line.strip() == "```python" and cur.get("_awaitcode"): code = []; cur.pop("_awaitcode"); continue
        m = re.match(r"^(\w+):\s?(.*)$", line)
        if not m or m.group(1) not in KEYS: errs.append(f"{w}: expected one of {', '.join(k + ':' for k in KEYS)}"); continue
        k, v = m.group(1), m.group(2).strip()
        if k == "code":
            if v: errs.append(f"{w}: put the code on the lines after 'code:' inside ```python ... ```"); continue
            cur["_awaitcode"] = True
        elif k == "step": cur["steps"].append(v)
        elif k in ("signals", "bugs"): cur[k] = [x.strip() for x in v.split(" ; ") if x.strip()]
        else: cur[k] = v
    if code is not None: errs.append(f"{where}: unclosed code block")
    for iid, d in out.items():
        d.pop("_awaitcode", None)
        miss = [k for k in ("what", "signals", "code", "walk", "bugs", "cost") if not d.get(k)]
        if miss: errs.append(f"{where}: {iid} is missing {', '.join(miss)}"); continue
        if not 3 <= len(d["steps"]) <= 8: errs.append(f"{where}: {iid} needs 3-8 step lines, has {len(d['steps'])}")
        if not 3 <= len(d["signals"]) <= 6: errs.append(f"{where}: {iid} needs 3-6 signals, has {len(d['signals'])}")
        if not 2 <= len(d["bugs"]) <= 5: errs.append(f"{where}: {iid} needs 2-5 bugs, has {len(d['bugs'])}")
        n = d["code"].count("\n") + 1
        if not 4 <= n <= 45: errs.append(f"{where}: {iid} code should be 4-45 lines, has {n}")
        try: compile(d["code"], f"{iid}.py", "exec")
        except SyntaxError as e: errs.append(f"{where}: {iid} code does not compile: {e}")
        if not re.match(r"^#\d+ ", d["walk"]): errs.append(f"{where}: {iid} walk must start with '#<number> <title>'")
        words = len(" ".join([d["what"], d["cost"]] + d["steps"] + d["signals"] + d["bugs"]).split())
        if words > 600: errs.append(f"{where}: {iid} is {words} words; keep a lesson under 600 words (plus code)")
    return out

def load(ideas, files=None):
    errs, all_ = [], {}
    for f in files or sorted(glob.glob(os.path.join(ROOT, "content", "problemmap", "lessons", "*.txt"))):
        for k, v in parse(f, ideas, errs).items():
            if k in all_: errs.append(f"{f}: {k} also has a lesson in another file")
            all_[k] = v
    return all_, errs

if __name__ == "__main__":
    m = json.load(open(os.path.join(ROOT, "content", "problemmap", "map.json"), encoding="utf-8"))
    ideas = {d["id"] for d in m["ideas"]}
    les, errs = load(ideas, sys.argv[1:] or None)
    for e in errs: print("  " + e)
    print(f"{len(les)} lessons, {len(errs)} problems")
    sys.exit(1 if errs else 0)
