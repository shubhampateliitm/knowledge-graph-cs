"""Merge the writers' drafts (content/drafts/pm_<family>.json) into content/problemmap/map.json.

  python3 tools/merge_problemmap.py              all families must be present and complete; strict checks
  python3 tools/merge_problemmap.py --partial    merge whatever drafts exist (missing families are listed in stats)
  options: --drafts DIR (default content/drafts), --out PATH (default content/problemmap/map.json)

Computed fields:
  level   the primary idea's level in the idea DAG (0 = foundation)
  depth   longest prerequisite path from a root problem (a problem with no prerequisites has depth 0)
  unlocks problems that list this one as a prerequisite
  concepts (per problem) the primary idea's concepts + the problem's extra concepts; "also" = concepts of the uses ideas
  concepts (index) {concept id: {"primary": [n...], "uses": [n...]}}, each list ordered by depth then number
"""
import json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import check_problemmap as cp


def main(argv):
    partial = "--partial" in argv
    out = os.path.join(ROOT, "content/problemmap/map.json")
    if "--out" in argv:
        out = os.path.abspath(argv[argv.index("--out") + 1])
    if "--drafts" in argv:
        cp.DRAFTS = os.path.abspath(argv[argv.index("--drafts") + 1])
    cat, bb, kg = cp.load_catalog(), cp.load_backbone(), cp.kg_ids()
    errs = cp.check_backbone(bb, cat, kg)
    if errs:
        for e in errs: print("backbone error:", e)
        return 1
    drafts = cp.load_drafts(bb)
    fam_ids = [f["id"] for f in bb["families"]]
    required = None if partial else fam_ids
    errs, warns, rows = cp.check_drafts(bb, cat, kg, drafts, required=required, strict=not partial)
    for w in warns: print("warn:", w)
    for e in errs: print("error:", e)
    if errs:
        print(f"merge aborted: {len(errs)} errors"); return 1

    ix = {d["id"]: d for d in bb["ideas"]}
    anchors = defaultdict(list)
    for d in bb["ideas"]:
        anchors[d["anchor"]].append(d["id"])
    # depth = longest path from a root, over prerequisites that are present
    depth = {}
    def dep(n):
        if n not in depth:
            ps = [p for p in rows[n]["prereqs"] if p in rows]
            depth[n] = 0 if not ps else 1 + max(dep(p) for p in ps)
        return depth[n]
    sys.setrecursionlimit(20000)
    for n in rows: dep(n)
    unlocks = defaultdict(list)
    for n, r in rows.items():
        for p in r["prereqs"]:
            unlocks[p].append(n)
    order = lambda ns: sorted(ns, key=lambda m: (depth.get(m, 0), m))

    problems, cindex = [], defaultdict(lambda: {"primary": set(), "uses": set()})
    for n in sorted(rows):
        r, p = rows[n], cat[n]
        prim = list(dict.fromkeys(ix[r["idea"]]["concepts"] + r["concepts"]))
        also = [c for u in r["uses"] for c in ix[u]["concepts"] if c not in prim]
        also = list(dict.fromkeys(also))
        for c in prim: cindex[c]["primary"].add(n)
        for c in also: cindex[c]["uses"].add(n)
        problems.append(dict(n=n, title=p["title"], slug=p["slug"], difficulty=p["difficulty"], url=p["url"], tags=p["tags"],
                             family=r["family"], idea=r["idea"], uses=r["uses"], prereqs=r["prereqs"], new=r["new"].strip(),
                             level=ix[r["idea"]]["level"], depth=depth[n], unlocks=order(unlocks.get(n, [])),
                             anchor_of=anchors.get(n, []), concepts=prim, also=also))
    by_idea = defaultdict(list); used_by = defaultdict(list)
    for q in problems:
        by_idea[q["idea"]].append(q["n"])
        for u in q["uses"]: used_by[u].append(q["n"])
    ideas = []
    for d in bb["ideas"]:
        ideas.append(dict(id=d["id"], name=d["name"], family=d["family"], level=d["level"], builds_on=d["builds_on"],
                          concepts=d["concepts"], anchor=d["anchor"], summary=d["summary"],
                          new_concept=(d["new_concept"] or {}).get("id"),
                          problems=order(by_idea[d["id"]]), used_by=order(used_by[d["id"]])))
    fams = []
    for f in bb["families"]:
        have = [n for n in f["problems"] if n in rows]
        fams.append(dict(id=f["id"], name=f["name"], description=f["description"], ideas=f["ideas"],
                         problems=order(have), complete=len(have) == len(f["problems"])))
    concepts = {c: {"primary": order(v["primary"]), "uses": order(v["uses"])} for c, v in sorted(cindex.items())}
    new_concepts = [dict(d["new_concept"], idea=d["id"]) for d in bb["ideas"] if d.get("new_concept")]
    missing = [f["id"] for f in bb["families"] if f["id"] not in drafts]
    stats = dict(problems=len(problems), catalog=len(cat), ideas=len(ideas), families=len(fams),
                 max_depth=max(depth.values(), default=0), roots=sum(1 for q in problems if not q["prereqs"]),
                 missing_families=missing, warnings=len(warns))
    data = dict(version=1, stats=stats, families=fams, ideas=ideas, problems=problems, concepts=concepts,
                new_concepts=new_concepts)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print(f"wrote {os.path.relpath(out, ROOT) if out.startswith(ROOT) else out}: {len(problems)} problems, "
          f"max depth {stats['max_depth']}, {len(concepts)} concepts" + (f", missing {missing}" if missing else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
