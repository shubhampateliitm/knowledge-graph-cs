"""Architecture patterns: parse content/patterns/*.txt, lay each pattern's flow out as an animated scene, validate.

Format (full spec in content/patterns/README.md):

  @@ concept-id                         the concept these patterns belong to (one block per concept)
  == Pattern title                      starts a pattern (2-4 per concept)
  kind: catalog-id[, catalog-id]        canonical patterns from content/patterns/catalog.txt (or "none")
  when: when to use it                  1-2 sentences
  how: paragraph                        lines without a key are more paragraphs of the same section
  used: real systems that use it        one line
  avoid: when not to use it             one line (optional)
  flow:                                 3-10 step lines, each animated as one step of the scene:
    Source [shape: sub] -> Target, Target2 : message label | caption for this step
    + A -> B : label                    "+" joins the previous step (no caption)
    A ~> B : label | caption            dashed link (async, optional or background path)
    A -x> B : label | caption           the message is lost (failure path)
    * Node: new sub text | caption      change a node's sub line (highlighted)
  ref: kind | title | who, year | url   0-3 sources for this pattern

Nodes are named by their label (up to 22 characters); the shape and sub line are given once, on first use:
  [svc] [client] [user] [db] [store] [cache] [lake] [log] [queue] [topic] [note] [box] [round] [circle] [cell] [db]
The layout is automatic: columns by longest path (left to right), rows ordered to reduce crossings.

Catalog (content/patterns/catalog.txt):  @ id | Name | family | summary | ref kind | ref title | who, year | url
"""
import glob, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHAPES = {"svc": "box", "service": "box", "box": "box", "client": "round", "user": "round", "round": "round",
          "db": "db", "store": "db", "cache": "db", "lake": "db", "log": "cell", "queue": "cell", "topic": "cell",
          "cell": "cell", "note": "note", "circle": "circle", "worker": "box", "model": "circle"}
KEYS = ("kind", "when", "how", "used", "avoid", "flow", "ref")
KEY_RE = re.compile(r"^(" + "|".join(KEYS) + r"):\s*(.*)$")
REF_KINDS = {"paper", "book", "blog", "docs", "course", "video", "spec"}
ARROW_RE = re.compile(r"\s+(-x>|~>|->)\s+")
NODE_RE = re.compile(r"^(.*?)\s*(?:\[([a-z]+)(?::\s*([^\]]*))?\])?$")
BW, BH, GX, GY, MX, MY = 132, 56, 64, 30, 20, 26
MAX_LABEL, MAX_MSG = 22, 26


def load_catalog(errs):
    cat = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "content/patterns/catalog*.txt"))):
        for ln, line in enumerate(open(f, encoding="utf-8"), 1):
            line = line.rstrip("\n")
            if not line.strip() or line.startswith("#"): continue
            where = f"{os.path.relpath(f, ROOT)}:{ln}"
            if not line.startswith("@ "): errs.append(f"{where} catalog line must start with '@ '"); continue
            p = [x.strip() for x in line[2:].split("|")]
            if len(p) != 8: errs.append(f"{where} catalog line needs 8 fields, has {len(p)}"); continue
            pid, name, fam, summ, rk, rt, rw, ru = p
            if pid in cat: errs.append(f"{where} duplicate catalog id {pid}")
            if rk not in REF_KINDS: errs.append(f"{where} bad ref kind {rk!r}")
            if ru and not ru.startswith("http"): errs.append(f"{where} bad url {ru!r}")
            cat[pid] = dict(id=pid, name=name, fam=fam, s=summ, ref=dict(k=rk, t=rt, w=rw, u=ru))
    return cat


def _node(tok, nodes, order, where, errs):
    m = NODE_RE.match(tok.strip())
    label, shape, sub = m.group(1).strip(), m.group(2), (m.group(3) or "").strip()
    if not label: errs.append(f"{where} empty node name"); return None
    if len(label) > MAX_LABEL: errs.append(f"{where} node name longer than {MAX_LABEL} characters: {label!r}")
    if shape and shape not in SHAPES: errs.append(f"{where} unknown shape [{shape}] (use {', '.join(sorted(SHAPES))})")
    if label not in nodes:
        nodes[label] = dict(label=label, shape=SHAPES.get(shape or "svc", "box"), sub=sub); order.append(label)
    else:
        if shape: nodes[label]["shape"] = SHAPES.get(shape, "box")
        if sub: nodes[label]["sub"] = sub
    return label


def parse_flow(lines, where, errs):
    """lines: [(where, text)] -> nodes (dict), order, steps [{say, msgs:[(a,b,label,kind)], set:{label:sub}}]"""
    nodes, order, steps = {}, [], []
    for w, raw in lines:
        t = raw.strip()
        join = t.startswith("+ ")
        if join: t = t[2:].strip()
        body, cap = (t.split(" | ", 1) + [""])[:2] if " | " in t else (t, "")
        body, cap = body.strip(), cap.strip()
        if join and cap: errs.append(f"{w} a '+' line joins the previous step and has no caption")
        if not join and not cap: errs.append(f"{w} step needs a caption after ' | '")
        if join and not steps: errs.append(f"{w} '+' line before any step"); continue
        st = steps[-1] if join else dict(say=cap, msgs=[], set={})
        if body.startswith("* "):
            if ":" not in body: errs.append(f"{w} set line needs '* Node: new sub'"); continue
            lab, sub = body[2:].split(":", 1)
            lab = lab.strip()
            if lab not in nodes: errs.append(f"{w} sets unknown node {lab!r} (name it in an earlier line)"); continue
            st["set"][lab] = sub.strip()
        else:
            parts = ARROW_RE.split(body, maxsplit=1)
            if len(parts) != 3: errs.append(f"{w} step line needs 'A -> B' (or ~> or -x>): {body[:60]!r}"); continue
            src, arrow, rest = parts
            dst, lab = (rest.split(" : ", 1) + [""])[:2] if " : " in rest else (rest, "")
            if ARROW_RE.search(dst): errs.append(f"{w} one arrow per line; chain steps on separate lines"); continue
            lab = lab.strip()
            if len(lab) > MAX_MSG: errs.append(f"{w} message label longer than {MAX_MSG} characters: {lab!r}")
            srcs = [_node(x, nodes, order, w, errs) for x in src.split(",") if x.strip()]
            dsts = [_node(x, nodes, order, w, errs) for x in dst.split(",") if x.strip()]
            for a in srcs:
                for b in dsts:
                    if a is None or b is None: continue
                    if a == b: errs.append(f"{w} {a!r} sends to itself"); continue
                    st["msgs"].append((a, b, lab, arrow))
        if not join: steps.append(st)
    return nodes, order, steps


def layout(nodes, order, steps, where, errs):
    idx = {lab: i for i, lab in enumerate(order)}
    edges = []
    for st in steps:
        for a, b, _, arrow in st["msgs"]:
            if (a, b) not in [(x, y) for x, y, _ in edges] and (b, a) not in [(x, y) for x, y, _ in edges]:
                edges.append((a, b, arrow == "~>"))
    out = {lab: [] for lab in order}
    for a, b, _ in edges: out[a].append(b)
    # forward edges by DFS in order of first appearance; back edges do not raise ranks
    state, fwd = {}, []
    def dfs(u):
        state[u] = 1
        for v in out[u]:
            if state.get(v) == 1: continue
            fwd.append((u, v))
            if v not in state: dfs(v)
        state[u] = 2
    for lab in order:
        if lab not in state: dfs(lab)
    rank = {lab: 0 for lab in order}
    for _ in range(len(order)):
        ch = False
        for u, v in fwd:
            if rank[v] < rank[u] + 1: rank[v] = rank[u] + 1; ch = True
        if not ch: break
    # pull sources right, next to the first node they feed (a dashboard reading the last table sits beside it)
    has_in = {v for _, v in fwd}
    for lab in order:
        tg = [v for u, v in fwd if u == lab]
        if lab not in has_in and tg: rank[lab] = max(rank[lab], min(rank[v] for v in tg) - 1)
    # compact: no empty columns
    used = sorted(set(rank.values())); remap = {r: i for i, r in enumerate(used)}
    rank = {k: remap[v] for k, v in rank.items()}
    ncol = max(rank.values()) + 1 if rank else 1
    cols = [[lab for lab in order if rank[lab] == c] for c in range(ncol)]
    if ncol > 6: errs.append(f"{where} flow is {ncol} columns deep (max 6): shorten the chain")
    if max(len(c) for c in cols) > 5: errs.append(f"{where} {max(len(c) for c in cols)} nodes in one column (max 5)")
    nb = {lab: set() for lab in order}
    for a, b, _ in edges: nb[a].add(b); nb[b].add(a)
    pos = {lab: i for c in cols for i, lab in enumerate(c)}
    for sweep in range(6):
        rng = range(1, ncol) if sweep % 2 == 0 else range(ncol - 2, -1, -1)
        for c in rng:
            ref = c - 1 if sweep % 2 == 0 else c + 1
            def bary(lab):
                ns = [pos[x] - (len(cols[ref]) - 1) / 2 for x in nb[lab] if rank[x] == ref]
                return sum(ns) / len(ns) if ns else pos[lab] - (len(cols[c]) - 1) / 2
            cols[c].sort(key=lambda lab: (bary(lab), idx[lab]))
            for i, lab in enumerate(cols[c]): pos[lab] = i
    rows = max(len(c) for c in cols)
    W = max(720, MX * 2 + ncol * BW + (ncol - 1) * GX)
    H = max(240, MY * 2 + rows * BH + (rows - 1) * GY + 20)
    step_x = (W - 2 * MX - BW) / (ncol - 1) if ncol > 1 else 0
    xs = [MX + c * step_x if ncol > 1 else (W - BW) / 2 for c in range(ncol)]
    top, bot = MY, H - MY - BH
    ys = {}
    def even(col):
        gap = GY if len(col) == rows else (min(GY * 2.2, (bot - top - (len(col) - 1) * BH) / max(1, len(col) - 1)) if len(col) > 1 else 0)
        span = len(col) * BH + (len(col) - 1) * gap; y0 = (H - span) / 2
        for i, lab in enumerate(col): ys[lab] = y0 + i * (BH + gap)
    def settle(col, want):
        # keep the order, put each node as close to its wish as the minimum gap and the frame allow
        y = [want[lab] for lab in col]
        for i in range(1, len(y)): y[i] = max(y[i], y[i - 1] + BH + GY)
        if y and y[-1] > bot:
            y[-1] = bot
            for i in range(len(y) - 2, -1, -1): y[i] = min(y[i], y[i + 1] - BH - GY)
        if y and y[0] < top:
            y[0] = top
            for i in range(1, len(y)): y[i] = max(y[i], y[i - 1] + BH + GY)
        for lab, v in zip(col, y): ys[lab] = v
    def wish(col, side):
        w = {}
        for lab in col:
            ns = [ys[x] for x in nb[lab] if x in ys and rank[x] == rank[lab] + side]
            w[lab] = sum(ns) / len(ns) if ns else None
        return w
    widest = max(range(ncol), key=lambda c: len(cols[c]))
    even(cols[widest])
    for c in list(range(widest + 1, ncol)) + list(range(widest - 1, -1, -1)):
        w = wish(cols[c], -1 if c > widest else 1)
        if all(v is None for v in w.values()): even(cols[c]); continue
        even(cols[c]); base = {lab: ys[lab] for lab in cols[c]}
        settle(cols[c], {lab: (w[lab] if w[lab] is not None else base[lab]) for lab in cols[c]})
    actors = []
    for c, col in enumerate(cols):
        for lab in col:
            n = nodes[lab]
            actors.append(dict(id=f"n{idx[lab]}", label=lab, sub=n["sub"], shape=n["shape"],
                               x=round(xs[c]), y=round(ys[lab]), w=BW, h=BH))
    links = [dict(from_=f"n{idx[a]}", to=f"n{idx[b]}", dashed=d) for a, b, d in edges]
    return W, H, actors, [{"from": l["from_"], "to": l["to"], "label": "", "dashed": l["dashed"]} for l in links]


def compile_scene(concept, k, title, nodes, order, steps, where, errs):
    W, H, actors, links = layout(nodes, order, steps, where, errs)
    idx = {lab: f"n{i}" for i, lab in enumerate(order)}
    out = []
    for st in steps:
        s = {"say": st["say"]}
        if st["msgs"]:
            s["msgs"] = [dict({"from": idx[a], "to": idx[b], "label": lab},
                              **({"tone": "bad", "lost": True} if arrow == "-x>" else {"tone": "muted"} if arrow == "~>" else {"tone": "accent"}))
                         for a, b, lab, arrow in st["msgs"]]
        if st["set"]:
            s["set"] = {idx[lab]: {"sub": sub, "tone": "accent"} for lab, sub in st["set"].items()}
            s["focus"] = [idx[lab] for lab in st["set"]]
        out.append(s)
    return dict(id=f"pat-{concept}-{k}", concept=concept, title=title, w=W, h=H, actors=actors, links=links, steps=out)


def load(node_ids=None, catalog=None, files=None):
    """-> (patterns: {concept: [pattern]}, catalog, errs)"""
    errs = []
    if catalog is None: catalog = load_catalog(errs)
    files = files or sorted(f for f in glob.glob(os.path.join(ROOT, "content/patterns/*.txt")) if not os.path.basename(f).startswith("catalog"))
    pats = {}
    for f in files:
        rel = os.path.relpath(f, ROOT) if f.startswith(ROOT) else f
        concept, cur, sec, flow = None, None, None, []
        def finish():
            nonlocal cur, flow
            if cur is None: return
            w = cur["where"]
            for key in ("when", "how", "used"):
                if not cur[key]: errs.append(f"{w} pattern {cur['title']!r} missing {key}:")
            if not cur["kinds"]: errs.append(f"{w} pattern {cur['title']!r} missing kind:")
            nodes, order, steps = parse_flow(flow, w, errs)
            if not 3 <= len(steps) <= 10: errs.append(f"{w} pattern {cur['title']!r} has {len(steps)} flow steps (need 3-10)")
            if not 3 <= len(order) <= 10: errs.append(f"{w} pattern {cur['title']!r} has {len(order)} nodes (need 3-10)")
            if steps and len(order) >= 2:
                k = len(pats.setdefault(cur["concept"], [])) + 1
                cur["scene"] = compile_scene(cur["concept"], k, cur["title"], nodes, order, steps, w, errs)
            pats.setdefault(cur["concept"], []).append({k2: v for k2, v in cur.items() if k2 != "where"})
            cur, flow = None, []
        for ln, line in enumerate(open(f, encoding="utf-8"), 1):
            raw = line.rstrip("\n"); s = raw.strip(); where = f"{rel}:{ln}"
            if not s or s.startswith("# "): continue
            if s.startswith("@@ "):
                finish(); concept = s[3:].strip(); sec = None
                if node_ids is not None and concept not in node_ids: errs.append(f"{where} unknown concept {concept!r}")
                if concept in pats: errs.append(f"{where} concept {concept} already has patterns (one @@ block per concept)")
                continue
            if s.startswith("== "):
                finish()
                if concept is None: errs.append(f"{where} pattern before any @@ concept"); continue
                cur = dict(concept=concept, title=s[3:].strip(), kinds=[], when="", how=[], used="", avoid="", refs=[], where=where)
                if len(cur["title"]) > 60: errs.append(f"{where} pattern title longer than 60 characters")
                sec = None; continue
            if cur is None: errs.append(f"{where} text outside a pattern"); continue
            m = None if (sec == "flow" and raw[:1] in (" ", "\t")) else KEY_RE.match(s)
            if m:
                sec, val = m.group(1), m.group(2).strip()
                if sec == "kind":
                    for kid in [x.strip() for x in val.split(",") if x.strip()]:
                        if kid != "none" and kid not in catalog: errs.append(f"{where} unknown catalog pattern {kid!r} (see content/patterns/catalog.txt)")
                        elif kid != "none": cur["kinds"].append(kid)
                    if val.strip() == "none": cur["kinds"].append("none")
                elif sec == "ref":
                    p = [x.strip() for x in val.split("|")]
                    while len(p) < 4: p.append("")
                    if p[0] not in REF_KINDS: errs.append(f"{where} unknown ref kind {p[0]!r}")
                    if p[3] and not p[3].startswith("http"): errs.append(f"{where} bad url {p[3]!r}")
                    cur["refs"].append(dict(k=p[0], t=p[1], w=p[2], u="|".join(p[3:]).strip()))
                elif sec == "how": cur["how"] += [val] if val else []
                elif sec == "flow":
                    if val: flow.append((where, val))
                elif val: cur[sec] = val
                continue
            if sec == "flow": flow.append((where, s))
            elif sec == "how": cur["how"].append(s)
            elif sec in ("when", "used", "avoid"): cur[sec] = (cur[sec] + " " + s).strip()
            else: errs.append(f"{where} line outside a section")
        finish()
    for c, ps in pats.items():
        for p in ps:
            p["kinds"] = [x for x in p["kinds"] if x != "none"]
        if len(ps) > 5: errs.append(f"{c}: {len(ps)} patterns (max 5)")
    return pats, catalog, errs


def check_scenes(pats, node_ids):
    import checkanim
    sc = [p["scene"] for ps in pats.values() for p in ps if p.get("scene")]
    return checkanim.check(sc, node_ids, "patterns")
