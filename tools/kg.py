"""Parse and validate the Down the Stack content.

Source files (plain text, easy to diff and edit):
  content/graph/nodes*.txt   id | label | category | year | status | mechanism   (grouped under "## L0" .. "## L5")
  content/graph/edges*.txt   src[, src] > tgt[, tgt] | reason     builds on (same layer = "uses")
                             src ~ tgt | reason                    inspired by (analogy)
                             a = b : alt|comp|evol|related | reason   sideways link
  content/graph/tours.txt    "## Title | subtitle", then "node_id | narrative"
  content/reads/*.txt        "@@ id" then section lines:  value: / history: / how: / intuition: / friction: / practice:
                             lines without a key continue the previous section as a new paragraph
                             ref: kind | title | who, year | url (url optional)
                             terms: "Term — definition" per line;  quiz: "question || answer" per line
                             diagram: preformatted lines (leading spaces kept, max 72 columns)
                             mistakes: one misunderstanding per paragraph
  content/reads/long/*.txt   "@@ id" replaces a read with a long one; "@@+ id" extends an existing read.
                             Every read touched here is marked as a deep read.
Layer essays use the ids L0 .. L5.
"""
import glob, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED = ("value", "how", "intuition", "friction")
OPTIONAL = ("terms", "history", "diagram", "animation", "example", "mistakes", "tradeoffs", "practice", "interview", "quiz")
SECTIONS = ("value", "terms", "history", "how", "diagram", "animation", "example", "intuition", "mistakes", "tradeoffs", "friction",
            "practice", "interview", "quiz")
RAW = ("diagram", "animation")          # sections whose lines are kept as drawn (leading spaces matter)
QA = ("quiz", "interview", "followups") # sections made of "question || answer" lines
SEC_RE = re.compile(r"^(" + "|".join(SECTIONS) + r"|ref):\s*(.*)$")
TERM_SEP, QUIZ_SEP = " — ", " || "
REF_KINDS = {"paper", "book", "blog", "docs", "course", "video", "spec"}
SIDE_TYPES = {"alt", "comp", "evol", "related"}
WPM = 200

LAYERS = [
    dict(n="Products & tools", d="Things you install, run or call: Kafka, Spark, PostgreSQL, Kubernetes, PyTorch, Claude, GPUs."),
    dict(n="Systems & architectures", d="The patterns those products implement: commit logs, lakehouses, OLAP, consensus services, deep learning, agents."),
    dict(n="Core techniques", d="Reusable mechanisms: replication, Raft, LSM trees, MVCC, columnar storage, attention, gradient descent."),
    dict(n="CS foundations", d="The classic subjects: networks, operating systems, computer architecture, database theory, algorithms, compilers, theory of computation."),
    dict(n="Mathematics", d="Logic, set theory, graphs, linear algebra, calculus, probability, information theory, queueing."),
    dict(n="First principles", d="Physics, chemistry, biology, philosophy and linguistics: transistors, tunneling, the speed of light, neurons, Gödel, Aristotle."),
]


class ContentError(Exception):
    pass


def _lines(pattern):
    for f in sorted(glob.glob(os.path.join(ROOT, pattern))):
        with open(f, encoding="utf-8") as fh:
            for ln, line in enumerate(fh, 1):
                yield os.path.relpath(f, ROOT), ln, line.rstrip("\n")


def words(text):
    return len(re.findall(r"\S+", text))


def _file_lines(path):
    with open(path, encoding="utf-8") as fh:
        for ln, line in enumerate(fh, 1):
            yield path, ln, line.rstrip("\n")


def check_animation(lines):
    """An animation is a list of frames; each frame starts with '== caption' and has at least one drawing line."""
    if not lines: return []
    errs, frames = [], []
    for l in lines:
        if l.startswith("== "): frames.append([l[3:].strip(), 0])
        elif not frames: errs.append("animation must start with '== caption'"); break
        else: frames[-1][1] += 1
    if len(frames) < 2: errs.append("animation needs at least 2 frames")
    errs += [f"animation frame {c!r} has no drawing" for c, n in frames if n == 0]
    return errs


DESIGN_SECTIONS = ("summary", "requirements", "estimates", "api", "datamodel", "design", "diagram", "animation", "deepdive",
                   "tradeoffs", "failures", "evolution", "followups")
DESIGN_REQUIRED = ("summary", "requirements", "estimates", "design", "deepdive", "tradeoffs", "failures", "followups")
DESIGN_RE = re.compile(r"^(" + "|".join(DESIGN_SECTIONS) + r"|ref|title|category|level|concepts):\s*(.*)$")


def load_designs(nodes, errs, extra=()):
    """content/design/*.txt: '@@ id' then title:, category:, level:, concepts: id, id, ... and the design sections."""
    designs, cur, sec, cur_file = [], None, None, None
    lines = list(_lines("content/design/*.txt")) + [x for e in extra for x in _file_lines(e)]
    for f, ln, line in lines:
        if f != cur_file: cur_file, cur, sec = f, None, None
        raw = line.rstrip(); line = line.strip(); where = f"{f}:{ln}"
        if not line or line.startswith("# "): continue
        if line.startswith("@@ "):
            cur = dict(id=line[3:].strip(), title="", category="", level="", concepts=[], rd={s: [] for s in DESIGN_SECTIONS}, refs=[])
            designs.append(cur); sec = None; continue
        if cur is None: errs.append(f"{where} text outside a design"); continue
        m = None if (sec in RAW and raw[:1] in (" ", "\t")) else DESIGN_RE.match(line)
        if m:
            key, val = m.groups()
            if key in ("title", "category", "level"): cur[key] = val.strip(); sec = None; continue
            if key == "concepts":
                for c in [x.strip() for x in val.split(",") if x.strip()]:
                    if c not in nodes: errs.append(f"{where} design {cur['id']} uses unknown concept {c!r}")
                    elif c not in cur["concepts"]: cur["concepts"].append(c)
                sec = None; continue
            if key == "ref":
                p = [x.strip() for x in val.split("|")]
                while len(p) < 4: p.append("")
                if p[0] not in REF_KINDS: errs.append(f"{where} unknown ref kind {p[0]!r}")
                cur["refs"].append(dict(k=p[0], t=p[1], w=p[2], u="|".join(p[3:]).strip())); continue
            sec = key
            if val: cur["rd"][sec].append(val)
            continue
        if sec is None: errs.append(f"{where} paragraph before any section"); continue
        if sec in RAW:
            if len(raw) > 72: errs.append(f"{where} {sec} line longer than 72 columns")
            cur["rd"][sec].append(line if line.startswith("== ") else raw); continue
        cur["rd"][sec].append(line)
    seen = set()
    for d in designs:
        if d["id"] in seen: errs.append(f"duplicate design {d['id']}")
        seen.add(d["id"])
        if not d["title"]: errs.append(f"design {d['id']} has no title")
        for s_ in DESIGN_REQUIRED:
            if not d["rd"][s_]: errs.append(f"design {d['id']} missing section {s_}")
        if len(d["concepts"]) < 5: errs.append(f"design {d['id']} lists fewer than 5 concepts")
        for q in d["rd"]["followups"]:
            if q.count(QUIZ_SEP) != 1: errs.append(f"design {d['id']}: followups line needs one ' || '")
        errs.extend(f"design {d['id']}: {e}" for e in check_animation(d["rd"]["animation"]))
        d["rd"] = {k: v for k, v in d["rd"].items() if v}
        d["w"] = sum(words(p) for ps in d["rd"].values() for p in ps); d["rm"] = max(1, round(d["w"] / WPM))
    return designs


def load(root=None, extra=(), extra_designs=()):
    """Return a dict with nodes, edges, side, tours, layers, stats. Raises ContentError listing every problem.
    extra: paths of additional long-read files (used by tools/checkread.py to check a draft before it is merged)."""
    global ROOT
    if root: ROOT = root
    errs = []
    nodes, order, layer = {}, [], None
    for f, ln, line in _lines("content/graph/nodes*.txt"):
        if not line.strip() or line.startswith("# "): continue
        m = re.match(r"## L(\d)", line)
        if m: layer = int(m.group(1)); continue
        parts = [p.strip() for p in line.split("|", 5)]
        if len(parts) != 6 or layer is None: errs.append(f"{f}:{ln} bad node line"); continue
        nid, label, cat, year, status, mech = parts
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", nid): errs.append(f"{f}:{ln} bad id {nid!r}")
        if nid in nodes: errs.append(f"{f}:{ln} duplicate node {nid}"); continue
        nodes[nid] = dict(id=nid, l=layer, label=label, cat=cat, y=year, st=status, m=mech)
        order.append(nid)

    edges, side, seen = [], [], set()
    def chk(i, where):
        if i not in nodes: errs.append(f"{where} unknown node {i!r}")
    for f, ln, line in _lines("content/graph/edges*.txt"):
        if not line.strip() or line.startswith("#"): continue
        where = f"{f}:{ln}"
        if " | " not in line: errs.append(f"{where} missing ' | reason'"); continue
        left, reason = line.split(" | ", 1)
        reason = reason.strip()
        if not reason: errs.append(f"{where} empty reason")
        if " = " in left:
            a, rest = left.split(" = ", 1)
            if " : " not in rest: errs.append(f"{where} side link needs ': type'"); continue
            b, typ = rest.split(" : ", 1)
            a, b, typ = a.strip(), b.strip(), typ.strip()
            chk(a, where); chk(b, where)
            if typ not in SIDE_TYPES: errs.append(f"{where} bad side type {typ}")
            side.append(dict(a=a, b=b, t=typ, r=reason)); continue
        if " ~ " in left: srcs, tgts = left.split(" ~ ", 1); kind = "inspired"
        elif " > " in left: srcs, tgts = left.split(" > ", 1); kind = "builds"
        else: errs.append(f"{where} no '>' '~' or '='"); continue
        for s in [x.strip() for x in srcs.split(",")]:
            for t in [x.strip() for x in tgts.split(",")]:
                chk(s, where); chk(t, where)
                if s in nodes and t in nodes:
                    if (s, t) in seen: continue
                    seen.add((s, t))
                    if kind == "builds" and nodes[t]["l"] < nodes[s]["l"]:
                        errs.append(f"{where} edge points upward {s}->{t}")
                    edges.append(dict(s=s, t=t, k=kind, r=reason))

    # reason overrides: content/graph/reasons*.txt holds "src > tgt | specific reason" lines for edges already declared
    # with a shared reason, so every "stands on" line can say exactly what that lower idea contributes.
    idx = {(e["s"], e["t"]): e for e in edges}
    for f, ln, line in _lines("content/graph/reasons*.txt"):
        if not line.strip() or line.startswith("#"): continue
        m = re.match(r"^\s*([a-z0-9-]+)\s*[>~]\s*([a-z0-9-]+)\s*\|\s*(.+)$", line)
        if not m: errs.append(f"{f}:{ln} bad reason line"); continue
        s_, t_, r_ = m.groups()
        if (s_, t_) not in idx: errs.append(f"{f}:{ln} no edge {s_} -> {t_} to give a reason to"); continue
        idx[(s_, t_)]["r"] = r_.strip()

    tours, cur = [], None
    for f, ln, line in _lines("content/graph/tours*.txt"):
        if not line.strip(): continue
        if line.startswith("## "):
            title, sub = (line[3:].split(" | ", 1) + [""])[:2]
            cur = dict(title=title.strip(), sub=sub.strip(), steps=[]); tours.append(cur); continue
        if cur is None or " | " not in line: errs.append(f"{f}:{ln} bad tour line"); continue
        nid, txt = line.split(" | ", 1)
        chk(nid.strip(), f"{f}:{ln}")
        cur["steps"].append([nid.strip(), txt.strip()])

    # curriculum: programs, course groups, courses -> ordered concept ids
    programs, courses, pending_groups = [], [], []
    cur_course = None
    for f, ln, line in _lines("content/curriculum/*.txt"):
        if not line.strip() or line.startswith("# "): continue
        where = f"{f}:{ln}"
        if line.startswith("@program "):
            p = [x.strip() for x in line[9:].split("|")]
            if len(p) != 5: errs.append(f"{where} @program needs 5 fields"); continue
            programs.append(dict(id=p[0], name=p[1], year=p[2], url=p[3], summary=p[4], groups=[])); continue
        if line.startswith("@group "):
            p = [x.strip() for x in line[7:].split("|")]
            if len(p) != 4: errs.append(f"{where} @group needs 4 fields"); continue
            pending_groups.append((where, p)); continue
        if line.startswith("## "):
            p = [x.strip() for x in line[3:].split("|")]
            if len(p) != 5: errs.append(f"{where} course header needs 5 fields"); cur_course = None; continue
            cur_course = dict(code=p[0], title=p[1], url=p[2], term=p[3], text=p[4], concepts=[])
            courses.append(cur_course); continue
        if cur_course is None: errs.append(f"{where} concept list outside a course"); continue
        for cid in [x.strip() for x in line.split(",") if x.strip()]:
            if cid not in nodes: errs.append(f"{where} {cur_course['code']} lists unknown concept {cid!r}")
            elif cid not in cur_course["concepts"]: cur_course["concepts"].append(cid)
    codes = {c["code"] for c in courses}
    progs = {p["id"]: p for p in programs}
    for where, (pid, name, cl, note) in pending_groups:
        if pid not in progs: errs.append(f"{where} unknown program {pid}"); continue
        cl = [x.strip() for x in cl.split(",") if x.strip()]
        for c in cl:
            if c not in codes: errs.append(f"{where} unknown course {c}")
        progs[pid]["groups"].append(dict(name=name, courses=cl, note=note))
    for c in courses:
        if not c["concepts"]: errs.append(f"course {c['code']} has no concepts")

    designs = load_designs(nodes, errs, extra_designs)

    # reads
    reads, long_keys = {}, set()
    files = [(f, ln, l, False) for f, ln, l in _lines("content/reads/*.txt")] + \
            [(f, ln, l, False) for f, ln, l in _lines("content/reads/more/*.txt")] + \
            [(f, ln, l, True) for f, ln, l in _lines("content/reads/long/*.txt")] + \
            [(f, ln, l, True) for x in extra for f, ln, l in _file_lines(x)]
    rd = sec = None; cur_file = None
    for f, ln, line, is_long in files:
        if f != cur_file: cur_file, rd, sec = f, None, None   # a read never continues into the next file
        raw = line.rstrip(); line = line.strip(); where = f"{f}:{ln}"
        if not line or line.startswith("# "): continue
        if line.startswith("@@+ ") or line.startswith("@@ "):
            ext = line.startswith("@@+ ")
            key = line[4 if ext else 3:].strip()
            if ext:
                if key not in reads: errs.append(f"{where} extends unknown read {key}"); rd = None; continue
            else:
                if key in reads and not is_long: errs.append(f"{where} duplicate read {key}")
                reads[key] = dict(rd={s: [] for s in SECTIONS}, refs=[])
            if is_long:
                if not ext and key in long_keys: errs.append(f"{where} {key} has two long versions")
                long_keys.add(key); reads[key]["deep"] = True
            rd, sec = reads[key], None
            continue
        if rd is None: errs.append(f"{where} text outside a read"); continue
        # inside a diagram, indented lines are drawing, even if they look like "value: ..."
        m = None if (sec in RAW and raw[:1] in (" ", "\t")) else SEC_RE.match(line)
        if m and m.group(1) == "ref":
            p = [x.strip() for x in m.group(2).split("|")]
            while len(p) < 4: p.append("")
            kind, title, who, url = p[0], p[1], p[2], "|".join(p[3:]).strip()
            if kind not in REF_KINDS: errs.append(f"{where} unknown ref kind {kind!r}")
            if not title: errs.append(f"{where} empty ref title")
            if url and not url.startswith("http"): errs.append(f"{where} bad url {url!r}")
            rd["refs"].append(dict(k=kind, t=title, w=who, u=url)); continue
        if m:
            sec = m.group(1)
            if m.group(2): rd["rd"][sec].append(m.group(2))
            elif sec not in RAW: errs.append(f"{where} empty {sec}: line")
            continue
        if sec is None: errs.append(f"{where} paragraph before any section"); continue
        if sec in RAW:
            if len(raw) > 72: errs.append(f"{where} {sec} line longer than 72 columns")
            rd["rd"][sec].append(line if line.startswith("== ") else raw); continue
        rd["rd"][sec].append(line)

    layer_reads = []
    for L in range(6):
        r = reads.pop(f"L{L}", None)
        if not r: errs.append(f"missing layer essay L{L}"); r = dict(rd={s: [] for s in SECTIONS}, refs=[])
        layer_reads.append(r)
    for k in reads:
        if k not in nodes: errs.append(f"read for unknown node {k}")
    for n in nodes:
        if n not in reads: errs.append(f"node without a read: {n}")
    for k, r in list(reads.items()) + [(f"L{i}", r) for i, r in enumerate(layer_reads)]:
        for s in REQUIRED:
            if not r["rd"][s]: errs.append(f"read {k} missing section {s}")
        if not r["refs"]: errs.append(f"read {k} has no sources")
        for t in r["rd"]["terms"]:
            if TERM_SEP not in t: errs.append(f"read {k}: term line needs ' — ': {t[:50]!r}")
        for qs in QA:
            for q in r["rd"].get(qs, []):
                if q.count(QUIZ_SEP) != 1: errs.append(f"read {k}: {qs} line needs one ' || ': {q[:50]!r}")
        errs.extend(f"read {k}: {e}" for e in check_animation(r["rd"].get("animation", [])))
        for s in OPTIONAL:
            if not r["rd"][s]: del r["rd"][s]

    # graph structure checks
    kids = {n: [] for n in nodes}; pars = {n: [] for n in nodes}; sides = {n: [] for n in nodes}
    for e in edges: kids[e["s"]].append(e); pars[e["t"]].append(e)
    for s in side:
        if s["a"] in nodes and s["b"] in nodes:
            sides[s["a"]].append(s); sides[s["b"]].append(s)
    for n, v in nodes.items():
        if v["l"] < 5 and not kids[n]: errs.append(f"{n} (L{v['l']}) has nothing below it")
        if v["l"] > 0 and not pars[n]: errs.append(f"{n} (L{v['l']}) has nothing above it")
    memo = {}
    def reach5(n, stack=()):
        if n in memo: return memo[n]
        if nodes[n]["l"] == 5: memo[n] = True; return True
        memo[n] = False
        memo[n] = any(reach5(e["t"]) for e in kids[n] if e["k"] == "builds")
        return memo[n]
    for n in nodes:
        if not reach5(n): errs.append(f"{n} cannot reach a first principle (L5)")

    if errs: raise ContentError("\n".join(errs))

    # drop duplicate sources inside one read (extensions sometimes repeat a source); keep the one with a URL
    for r in list(reads.values()) + layer_reads:
        best = {}
        for x in r["refs"]:
            k = re.sub(r"[^a-z0-9]", "", x["t"].lower())[:50]
            if k not in best or (x["u"] and not best[k]["u"]): best[k] = x
        keep = set(id(v) for v in best.values())
        r["refs"] = [x for x in r["refs"] if id(x) in keep]

    # merge reads, compute reading time
    total_words = 0
    for nid, v in nodes.items():
        r = reads[nid]
        v.update(rd=r["rd"], refs=r["refs"], deep=bool(r.get("deep")))
        w = sum(words(p) for ps in r["rd"].values() for p in ps)
        v["w"] = w; total_words += w
        extra = sum(words(e["r"]) + 3 for e in kids[nid] + pars[nid] + sides[nid])
        v["rm"] = max(1, round((w + extra) / WPM))
    for i, r in enumerate(layer_reads):
        w = sum(words(p) for ps in r["rd"].values() for p in ps)
        total_words += w
        cnt = sum(1 for v in nodes.values() if v["l"] == i)
        r.update(id=f"L{i}", l=i, n=LAYERS[i]["n"], d=LAYERS[i]["d"], w=w, rm=max(1, round((w + cnt * 4) / WPM)))
    nrefs = sum(len(v["refs"]) for v in nodes.values()) + sum(len(r["refs"]) for r in layer_reads)
    stats = dict(nodes=len(nodes), edges=len(edges), side=len(side), tours=len(tours), words=total_words, refs=nrefs,
                 urls=sum(1 for v in nodes.values() for x in v["refs"] if x["u"]) + sum(1 for r in layer_reads for x in r["refs"] if x["u"]),
                 deep=sum(1 for v in nodes.values() if v["deep"]),
                 per_layer=[sum(1 for v in nodes.values() if v["l"] == L) for L in range(6)])
    stats["courses"] = len(courses)
    stats["designs"] = len(designs)
    stats["words"] += sum(d["w"] for d in designs)
    return dict(nodes=[nodes[i] for i in order], edges=edges, side=side, tours=tours, layers=layer_reads, stats=stats,
                curriculum=dict(programs=programs, courses=courses), designs=designs)
