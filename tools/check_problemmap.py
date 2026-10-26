"""Check the problem map: the backbone (idea DAG + families) and the writers' drafts.

  python3 tools/check_problemmap.py --backbone          validate content/problemmap/backbone.json only
  python3 tools/check_problemmap.py --ideas [family]    print the idea table (all ideas, or one family's)
  python3 tools/check_problemmap.py --list <family>     print a family's problems with tags and anchor info
  python3 tools/check_problemmap.py --skeleton <family> print a starting draft (anchors pre-filled) to save as the draft file
  python3 tools/check_problemmap.py <family> [...]      validate content/drafts/pm_<family>.json (all drafts are loaded
                                                        for cross-family checks; only the named ones must be complete)
  python3 tools/check_problemmap.py                     validate every draft that exists

Exit code 1 on any error. Warnings (prefixed "warn") do not fail the check, but tools/merge_problemmap.py treats
unresolved cross-family prerequisites as errors once every family is present.
Draft format and rules: content/problemmap/WRITERS.md.
"""
import glob, json, os, re, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
CATALOG = os.path.join(ROOT, "content/problemmap/catalog.json")
BACKBONE = os.path.join(ROOT, "content/problemmap/backbone.json")
DRAFTS = os.path.join(ROOT, "content/drafts")
MAX_NEW_WORDS = 18
MAX_USES = 5
FIELDS = {"n", "idea", "uses", "prereqs", "new", "concepts"}


def load_catalog():
    with open(CATALOG, encoding="utf-8") as fh:
        return {p["n"]: p for p in json.load(fh)}


def load_backbone():
    with open(BACKBONE, encoding="utf-8") as fh:
        return json.load(fh)


def kg_ids():
    import kg
    return {n["id"]: n["l"] for n in kg.load()["nodes"]}


def draft_path(fid):
    return os.path.join(DRAFTS, f"pm_{fid}.json")


def load_drafts(bb):
    """{family id: (path, data or None, error or None)} for every draft file that exists."""
    out = {}
    for f in bb["families"]:
        p = draft_path(f["id"])
        if os.path.exists(p):
            try:
                with open(p, encoding="utf-8") as fh:
                    out[f["id"]] = (p, json.load(fh), None)
            except ValueError as e:
                out[f["id"]] = (p, None, f"{os.path.relpath(p, ROOT)}: invalid JSON: {e}")
    extra = set(glob.glob(os.path.join(DRAFTS, "pm_*.json"))) - {draft_path(f["id"]) for f in bb["families"]}
    for p in sorted(extra):
        out["?" + os.path.basename(p)] = (p, None, f"{os.path.relpath(p, ROOT)}: no family with this id in backbone.json")
    return out


def find_cycle(edges):
    """edges: {node: [succ...]}. Returns one cycle as a list, or None."""
    WHITE, GREY, BLACK = 0, 1, 2
    color = defaultdict(int)
    for start in list(edges):
        if color[start]:
            continue
        stack = [(start, iter(edges.get(start, ())))]
        path = [start]
        color[start] = GREY
        while stack:
            node, it = stack[-1]
            nxt = next(it, None)
            if nxt is None:
                color[node] = BLACK
                stack.pop(); path.pop()
                continue
            if color[nxt] == GREY:
                return path[path.index(nxt):] + [nxt]
            if color[nxt] == WHITE:
                color[nxt] = GREY
                stack.append((nxt, iter(edges.get(nxt, ()))))
                path.append(nxt)
    return None


# ---------------------------------------------------------------- backbone
def check_backbone(bb, cat, kg):
    errs = []
    ideas = bb.get("ideas", [])
    ix = {}
    for d in ideas:
        if d["id"] in ix:
            errs.append(f"idea {d['id']}: duplicate id")
        ix[d["id"]] = d
    fam_ids = [f["id"] for f in bb.get("families", [])]
    if len(set(fam_ids)) != len(fam_ids):
        errs.append("families: duplicate family id")
    proposed = {d["new_concept"]["id"]: d["id"] for d in ideas if d.get("new_concept")}
    for d in ideas:
        i = d["id"]
        if not re.fullmatch(r"[a-z0-9-]+", i):
            errs.append(f"idea {i}: id must be lowercase letters, digits and '-'")
        if d.get("family") not in fam_ids:
            errs.append(f"idea {i}: unknown family {d.get('family')}")
        for b in d.get("builds_on", []):
            if b not in ix:
                errs.append(f"idea {i}: builds_on unknown idea {b}")
            elif ix[b]["level"] >= d["level"]:
                errs.append(f"idea {i}: builds_on {b} is not at a lower level ({ix[b]['level']} >= {d['level']})")
        want = 0 if not d.get("builds_on") else 1 + max((ix[b]["level"] for b in d["builds_on"] if b in ix), default=-1)
        if d["level"] != want:
            errs.append(f"idea {i}: level {d['level']} but builds_on gives {want}")
        if d.get("anchor") not in cat:
            errs.append(f"idea {i}: anchor {d.get('anchor')} not in catalog")
        if not d.get("concepts"):
            errs.append(f"idea {i}: no concepts")
        for c in d.get("concepts", []):
            if c not in kg and c not in proposed:
                errs.append(f"idea {i}: concept {c} is neither in the graph nor a new_concept proposal")
        nc = d.get("new_concept")
        if nc:
            for k in ("id", "label", "layer", "category", "mechanism"):
                if not nc.get(k) and nc.get(k) != 0:
                    errs.append(f"idea {i}: new_concept missing {k}")
            if nc.get("id") in kg:
                errs.append(f"idea {i}: new_concept {nc.get('id')} already exists in the graph")
            if nc.get("layer") not in (2, 3, 4):
                errs.append(f"idea {i}: new_concept layer must be 2, 3 or 4")
        s = d.get("summary", "")
        if not s or len(s.split()) > 32:
            errs.append(f"idea {i}: summary missing or over 32 words")
    for nid, owner in proposed.items():
        if list(proposed.values()).count(owner) > 1:
            errs.append(f"idea {owner}: more than one new_concept")
    cyc = find_cycle({d["id"]: d.get("builds_on", []) for d in ideas})
    if cyc:
        errs.append("ideas: cycle " + " -> ".join(cyc))
    # anchors and their prerequisites
    anchors = defaultdict(list)
    for d in ideas:
        anchors[d["anchor"]].append(d["id"])
    for d in ideas:
        for a in d.get("anchor_prereqs", []):
            lower = [j for j in anchors.get(a, []) if ix[j]["level"] < d["level"]]
            if not lower:
                errs.append(f"idea {d['id']}: anchor_prereq {a} is not the anchor of a lower-level idea")
        if d["level"] > 0 and not d.get("anchor_prereqs"):
            errs.append(f"idea {d['id']}: level {d['level']} but no anchor_prereqs")
    aedges = defaultdict(list)
    for d in ideas:
        for a in d.get("anchor_prereqs", []):
            aedges[d["anchor"]].append(a)
    cyc = find_cycle(aedges)
    if cyc:
        errs.append("anchor prerequisites: cycle " + " -> ".join(map(str, cyc)))
    # families cover the catalog exactly once
    seen = {}
    for f in bb.get("families", []):
        for n in f.get("problems", []):
            if n not in cat:
                errs.append(f"family {f['id']}: problem {n} not in catalog")
            if n in seen:
                errs.append(f"problem {n}: in families {seen[n]} and {f['id']}")
            seen[n] = f["id"]
        listed = set(f.get("ideas", []))
        actual = {d["id"] for d in ideas if d.get("family") == f["id"]}
        if listed != actual:
            errs.append(f"family {f['id']}: ideas list does not match ideas' family field ({sorted(listed ^ actual)})")
    missing = sorted(set(cat) - set(seen))
    if missing:
        errs.append(f"families: {len(missing)} catalog problems in no family, e.g. {missing[:10]}")
    return errs


# ---------------------------------------------------------------- drafts
def check_drafts(bb, cat, kg, drafts, required=None, strict=False):
    """Validate loaded drafts. required: family ids that must be present and complete. Returns (errors, warnings, rows)."""
    errs, warns = [], []
    ix = {d["id"]: d for d in bb["ideas"]}
    proposed = {d["new_concept"]["id"] for d in bb["ideas"] if d.get("new_concept")}
    fam_of = {n: f["id"] for f in bb["families"] for n in f["problems"]}
    fam_problems = {f["id"]: set(f["problems"]) for f in bb["families"]}
    anchors = defaultdict(list)
    for d in bb["ideas"]:
        anchors[d["anchor"]].append(d["id"])
    rows = {}
    for fid in sorted(required or []):
        if fid not in drafts:
            errs.append(f"{fid}: draft {os.path.relpath(draft_path(fid), ROOT)} not found")
    for fid, (path, data, err) in sorted(drafts.items()):
        rel = os.path.relpath(path, ROOT)
        if err:
            errs.append(err); continue
        if not isinstance(data, dict) or data.get("family") != fid or not isinstance(data.get("problems"), list):
            errs.append(f"{rel}: must be {{\"family\": \"{fid}\", \"problems\": [...]}}"); continue
        got = set()
        for k, r in enumerate(data["problems"]):
            where = f"{rel}[{k}]"
            if not isinstance(r, dict) or not isinstance(r.get("n"), int):
                errs.append(f"{where}: entry must be an object with integer n"); continue
            n = r["n"]; where = f"{rel} #{n}"
            unknown = set(r) - FIELDS
            if unknown:
                errs.append(f"{where}: unknown fields {sorted(unknown)}")
            if n not in cat:
                errs.append(f"{where}: not in catalog"); continue
            if fam_of.get(n) != fid:
                errs.append(f"{where}: belongs to family {fam_of.get(n)}, not {fid}"); continue
            if n in got or n in rows:
                errs.append(f"{where}: duplicate entry"); continue
            got.add(n)
            idea = r.get("idea")
            if idea not in ix:
                errs.append(f"{where}: unknown idea {idea!r}"); continue
            uses = r.get("uses", [])
            if not isinstance(uses, list) or len(uses) > MAX_USES:
                errs.append(f"{where}: uses must be a list of at most {MAX_USES} idea ids"); uses = []
            for u in uses:
                if u not in ix:
                    errs.append(f"{where}: unknown idea in uses {u!r}")
                elif u == idea:
                    errs.append(f"{where}: uses repeats the primary idea {u}")
            if len(set(uses)) != len(uses):
                errs.append(f"{where}: duplicate ids in uses")
            pre = r.get("prereqs")
            if not isinstance(pre, list) or len(pre) > 3 or not all(isinstance(p, int) for p in pre):
                errs.append(f"{where}: prereqs must be a list of 0-3 problem numbers"); pre = []
            for p in pre:
                if p == n:
                    errs.append(f"{where}: lists itself as a prerequisite")
                elif p not in cat:
                    errs.append(f"{where}: prerequisite {p} not in catalog")
            if len(set(pre)) != len(pre):
                errs.append(f"{where}: duplicate prerequisites")
            mine = anchors.get(n, [])
            if mine and idea not in mine:
                errs.append(f"{where}: anchor of {mine}, so its idea must be one of them (got {idea})")
            if not pre and not (mine and ix[idea]["level"] == 0):
                errs.append(f"{where}: needs 1-3 prerequisites (only anchors of level-0 ideas may have none)")
            if mine and idea in mine:
                lower_anchor = {d["anchor"] for d in bb["ideas"] if d["level"] < ix[idea]["level"]}
                for p in pre:
                    if p not in lower_anchor:
                        errs.append(f"{where}: anchor problem; prerequisite {p} is not the anchor of a lower-level idea "
                                    f"(use anchor_prereqs {ix[idea]['anchor_prereqs']})")
            new = r.get("new")
            if not isinstance(new, str) or not new.strip():
                errs.append(f"{where}: 'new' is missing")
            elif len(new.split()) > MAX_NEW_WORDS:
                errs.append(f"{where}: 'new' has {len(new.split())} words (max {MAX_NEW_WORDS})")
            con = r.get("concepts", [])
            if not isinstance(con, list):
                errs.append(f"{where}: concepts must be a list"); con = []
            for c in con:
                if c not in kg and c not in proposed:
                    errs.append(f"{where}: unknown concept {c!r}")
            rows[n] = dict(r, family=fid, uses=uses, prereqs=pre, concepts=con)
        missing = sorted(fam_problems[fid] - got)
        if missing:
            msg = f"{rel}: {len(missing)} of {len(fam_problems[fid])} family problems missing, e.g. {missing[:12]}"
            (errs if (required is None or fid in required) else warns).append(msg)
    # levels, cross-family links, cycles
    def level_of(p):
        if p in rows:
            return ix[rows[p]["idea"]]["level"], True
        if p in anchors:
            return min(ix[i]["level"] for i in anchors[p]), False
        return None, False
    for n, r in rows.items():
        lv = ix[r["idea"]]["level"]
        related = {r["idea"], *r["uses"], *ix[r["idea"]]["builds_on"]}
        hit = False
        for p in r["prereqs"]:
            pl, known = level_of(p)
            if pl is None:
                msg = f"pm_{r['family']} #{n}: prerequisite {p} (family {fam_of.get(p)}) not checked: its draft is not loaded"
                (errs if strict else warns).append(msg)
            elif pl > lv:
                errs.append(f"pm_{r['family']} #{n}: prerequisite {p} has idea level {pl} > this problem's {lv} ({r['idea']})")
            if p in rows and (rows[p]["idea"] in related or set(rows[p]["uses"]) & related):
                hit = True
            if p in anchors and set(anchors[p]) & related:
                hit = True
        if r["prereqs"] and not hit and all(p in rows or p in anchors for p in r["prereqs"]):
            warns.append(f"pm_{r['family']} #{n}: no prerequisite shares its idea, uses or the idea's builds_on")
    cyc = find_cycle({n: [p for p in r["prereqs"] if p in rows] for n, r in rows.items()})
    if cyc:
        errs.append("prerequisite cycle: " + " -> ".join(map(str, cyc)))
    return errs, warns, rows


# ---------------------------------------------------------------- printing helpers
def print_ideas(bb, fam=None):
    for d in bb["ideas"]:
        if fam and d["family"] != fam:
            continue
        nc = f"  NEW CONCEPT {d['new_concept']['id']}" if d.get("new_concept") else ""
        print(f"L{d['level']} {d['id']:16s} [{d['family']}] {d['name']} | anchor #{d['anchor']} | builds_on {','.join(d['builds_on']) or '-'}"
              f" | concepts {','.join(d['concepts'])}{nc}")
        print(f"      {d['summary']}")


def print_family(bb, cat, fid):
    fam = next((f for f in bb["families"] if f["id"] == fid), None)
    if not fam:
        sys.exit(f"unknown family {fid}; families: {', '.join(f['id'] for f in bb['families'])}")
    anchors = defaultdict(list)
    for d in bb["ideas"]:
        anchors[d["anchor"]].append(d)
    print(f"# {fam['id']}: {fam['name']} ({len(fam['problems'])} problems)\n# {fam['description']}")
    for n in fam["problems"]:
        p = cat[n]
        a = ""
        if n in anchors:
            a = "  ANCHOR " + "; ".join(f"{d['id']} (L{d['level']}, prereqs {d['anchor_prereqs']})" for d in anchors[n])
        print(f"{n} | {p['title']} | {p['difficulty']} | {', '.join(p['tags'])}{a}")


def print_skeleton(bb, fid):
    fam = next((f for f in bb["families"] if f["id"] == fid), None)
    if not fam:
        sys.exit(f"unknown family {fid}")
    ix = {d["id"]: d for d in bb["ideas"]}
    anchors = defaultdict(list)
    for d in bb["ideas"]:
        anchors[d["anchor"]].append(d["id"])
    lines = []
    for n in fam["problems"]:
        a = sorted(anchors.get(n, []), key=lambda i: ix[i]["level"])
        if a:
            r = dict(n=n, idea=a[0], uses=a[1:], prereqs=ix[a[0]]["anchor_prereqs"], new="")
        else:
            r = dict(n=n, idea="", uses=[], prereqs=[], new="")
        lines.append("  " + json.dumps(r, ensure_ascii=False))
    print('{"family": "%s", "problems": [\n%s\n]}' % (fid, ",\n".join(lines)))


def main(argv):
    global DRAFTS
    if "--drafts" in argv:                       # testing: read drafts from another folder
        k = argv.index("--drafts"); DRAFTS = os.path.abspath(argv[k + 1]); argv = argv[:k] + argv[k + 2:]
    cat, bb = load_catalog(), load_backbone()
    if argv[:1] == ["--ideas"]:
        print_ideas(bb, argv[1] if len(argv) > 1 else None); return 0
    if argv[:1] == ["--skeleton"]:
        if len(argv) < 2: sys.exit("usage: --skeleton <family>")
        print_skeleton(bb, argv[1]); return 0
    if argv[:1] == ["--list"]:
        if len(argv) < 2: sys.exit("usage: --list <family>")
        print_family(bb, cat, argv[1]); return 0
    kg = kg_ids()
    errs = check_backbone(bb, cat, kg)
    if argv[:1] == ["--backbone"]:
        for e in errs: print("error:", e)
        lv = defaultdict(int)
        for d in bb["ideas"]: lv[d["level"]] += 1
        print(f"backbone: {len(bb['ideas'])} ideas (by level {dict(sorted(lv.items()))}), "
              f"{len(bb['families'])} families, {sum(len(f['problems']) for f in bb['families'])} problems; "
              f"{len(errs)} errors")
        return 1 if errs else 0
    if errs:
        for e in errs: print("backbone error:", e)
        return 1
    drafts = load_drafts(bb)
    required = argv or None
    for f in argv:
        if f not in {x["id"] for x in bb["families"]}:
            sys.exit(f"unknown family {f}")
    if not drafts and not argv:
        print("no drafts found in content/drafts/pm_<family>.json"); return 0
    e2, warns, rows = check_drafts(bb, cat, kg, drafts, required=required)
    for w in warns: print("warn:", w)
    for e in e2: print("error:", e)
    print(f"checked {len(drafts)} draft(s), {len(rows)} problems; {len(e2)} errors, {len(warns)} warnings")
    return 1 if e2 else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
