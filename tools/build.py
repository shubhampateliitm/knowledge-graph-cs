#!/usr/bin/env python3
"""Build everything from content/:
  data/content.db               SQLite database (nodes, reads, sources, edges, tours, full-text index)
  dist/down-the-stack.html      one self-contained page (same app, data embedded) for sharing

Usage: python3 tools/build.py [--check] [--no-html]
Environment: DTS_CONTENT_DB=path   write the database somewhere else (tests use a temp file)
             DTS_PRACTICE_FIXTURE=1 also load tests/fixtures/problems_sample.json (UI tests)
             (content/practice/templates.json is not a problem list: it holds the pattern templates, keyed by pattern name)
             DTS_ANIM_FIXTURE=1 also load tests/fixtures/anim_sample.json (animated scenes for tests)
             DTS_ANIM_DIR=path  read animated scenes from another folder instead of content/anim/
             DTS_FORMAT_FIXTURE=1 also load tests/fixtures/format_sample.txt and format_design.txt (rich-text browser test)
             DTS_DIST=path      write the standalone page somewhere else
             DTS_PROBLEMMAP=path read the problem map from another file instead of content/problemmap/map.json
                                (tests use tests/fixtures/problemmap_sample.json; a missing file just means no problem map)
"""
import glob, json, os, re, sqlite3, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kg

ROOT = kg.ROOT
SCHEMA = """
PRAGMA journal_mode = DELETE;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE layers (layer INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, read_min INTEGER NOT NULL, words INTEGER NOT NULL);
CREATE TABLE nodes (
  id TEXT PRIMARY KEY, layer INTEGER NOT NULL REFERENCES layers(layer), label TEXT NOT NULL, category TEXT NOT NULL,
  year TEXT NOT NULL, status TEXT NOT NULL, mechanism TEXT NOT NULL, deep INTEGER NOT NULL, words INTEGER NOT NULL,
  read_min INTEGER NOT NULL, ord INTEGER NOT NULL);
CREATE INDEX nodes_layer ON nodes(layer, category);
-- owner is a node id or a layer essay id ('L0'..'L5')
CREATE TABLE paragraphs (owner TEXT NOT NULL, section TEXT NOT NULL, ord INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (owner, section, ord));
CREATE TABLE sources (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, ord INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, who TEXT NOT NULL, url TEXT NOT NULL, work_key TEXT NOT NULL);
CREATE INDEX sources_owner ON sources(owner, ord);
CREATE INDEX sources_work ON sources(work_key);
CREATE TABLE edges (src TEXT NOT NULL REFERENCES nodes(id), dst TEXT NOT NULL REFERENCES nodes(id), kind TEXT NOT NULL CHECK (kind IN ('builds','inspired')), reason TEXT NOT NULL, PRIMARY KEY (src, dst));
CREATE INDEX edges_dst ON edges(dst);
CREATE TABLE side_links (a TEXT NOT NULL REFERENCES nodes(id), b TEXT NOT NULL REFERENCES nodes(id), type TEXT NOT NULL, reason TEXT NOT NULL);
CREATE TABLE tours (id INTEGER PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL);
CREATE TABLE tour_steps (tour_id INTEGER NOT NULL REFERENCES tours(id), ord INTEGER NOT NULL, node_id TEXT NOT NULL REFERENCES nodes(id), note TEXT NOT NULL, PRIMARY KEY (tour_id, ord));
-- schools (content/curriculum/*.txt "@school" lines); programs and courses name theirs
CREATE TABLE schools (id TEXT PRIMARY KEY, short TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE programs (id TEXT PRIMARY KEY, name TEXT NOT NULL, year TEXT NOT NULL, url TEXT NOT NULL, summary TEXT NOT NULL, short TEXT NOT NULL, school TEXT NOT NULL REFERENCES schools(id));
CREATE TABLE program_groups (program_id TEXT NOT NULL REFERENCES programs(id), ord INTEGER NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL, courses TEXT NOT NULL, PRIMARY KEY (program_id, ord));
CREATE TABLE courses (code TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, term TEXT NOT NULL, material TEXT NOT NULL, ord INTEGER NOT NULL, school TEXT NOT NULL REFERENCES schools(id));
CREATE TABLE course_concepts (code TEXT NOT NULL REFERENCES courses(code), ord INTEGER NOT NULL, node_id TEXT NOT NULL REFERENCES nodes(id), PRIMARY KEY (code, ord));
CREATE INDEX course_concepts_node ON course_concepts(node_id);
CREATE TABLE designs (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, level TEXT NOT NULL, concepts TEXT NOT NULL,
  words INTEGER NOT NULL, read_min INTEGER NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE design_paragraphs (design_id TEXT NOT NULL REFERENCES designs(id), section TEXT NOT NULL, ord INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (design_id, section, ord));
CREATE TABLE design_sources (design_id TEXT NOT NULL REFERENCES designs(id), ord INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, who TEXT NOT NULL, url TEXT NOT NULL, PRIMARY KEY (design_id, ord));
-- practice problems: one JSON object per row (statement, tests, starter, solution, ...), in file order
CREATE TABLE practice (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, pattern TEXT NOT NULL, difficulty TEXT NOT NULL, body TEXT NOT NULL);
-- pattern templates (content/practice/templates.json): one JSON object per pattern name, in file order
CREATE TABLE templates (pattern TEXT PRIMARY KEY, ord INTEGER NOT NULL, body TEXT NOT NULL);
-- animated scenes (content/anim/*.json, format in content/anim/README.md): one JSON object per row, in file order
CREATE TABLE scenes (id TEXT PRIMARY KEY, concept TEXT NOT NULL REFERENCES nodes(id), ord INTEGER NOT NULL, title TEXT NOT NULL, steps INTEGER NOT NULL, body TEXT NOT NULL);
CREATE INDEX scenes_concept ON scenes(concept, ord);
-- architecture patterns (content/patterns/*.txt, spec in content/patterns/README.md): one JSON object per pattern, with its
-- compiled scene; the canonical pattern catalog (content/patterns/catalog.txt) is in meta ('pcatalog')
-- hands-on practice links (content/handson/*.txt): playgrounds, puzzles, labs, CTFs per concept, one JSON object per link
CREATE TABLE handson (concept TEXT NOT NULL REFERENCES nodes(id), ord INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (concept, ord));
CREATE TABLE patterns (concept TEXT NOT NULL REFERENCES nodes(id), ord INTEGER NOT NULL, title TEXT NOT NULL, kinds TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (concept, ord));
-- problem map (content/problemmap/map.json, built by tools/merge_problemmap.py): one full JSON entry per problem;
-- the compact form the app loads (/api/problemmap, the standalone page) and its per-concept summary are in meta
-- ('problemmap', 'problemmap_summary'). Absent when there is no map.json.
CREATE TABLE pm_problems (n INTEGER PRIMARY KEY, idea TEXT NOT NULL, family TEXT NOT NULL, depth INTEGER NOT NULL, slug TEXT NOT NULL, body TEXT NOT NULL);
CREATE INDEX pm_problems_idea ON pm_problems(idea, depth);
CREATE TABLE pm_ideas (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, family TEXT NOT NULL, level INTEGER NOT NULL, body TEXT NOT NULL);
-- search owners: node ids, layer essays 'L0'..'L5' and design questions 'design/<id>'
CREATE VIRTUAL TABLE search USING fts5(owner UNINDEXED, label, mechanism, body, tokenize = 'porter unicode61');
"""

def work_key(r):
    t = re.sub(r"\s*\(.*?\)", "", r["t"].lower())
    t = re.sub(r",?\s*(\d+(st|nd|rd|th)\s+ed\.?|ch\.\s*[\w–-]+.*)$", "", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()

def write_db(data, path):
    tmp = path + ".tmp"
    if os.path.exists(tmp): os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript(SCHEMA)
    st = data["stats"]
    db.executemany("INSERT INTO meta VALUES (?,?)", [("built_at", time.strftime("%Y-%m-%dT%H:%M:%S")), ("stats", json.dumps(st)), ("as_of", "October 2026")])
    for r in data["layers"]:
        db.execute("INSERT INTO layers VALUES (?,?,?,?,?)", (r["l"], r["n"], r["d"], r["rm"], r["w"]))
    def owner_rows(owner, r):
        for sec, ps in r["rd"].items():
            for i, p in enumerate(ps): yield (owner, sec, i, p)
    for i, n in enumerate(data["nodes"]):
        db.execute("INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?)", (n["id"], n["l"], n["label"], n["cat"], n["y"], n["st"], n["m"], int(n["deep"]), n["w"], n["rm"], i))
    owners = [(n["id"], n) for n in data["nodes"]] + [(r["id"], r) for r in data["layers"]]
    pats = {}
    for x in data.get("patterns", []): pats.setdefault(x["concept"], []).append(x)
    for owner, r in owners:
        db.executemany("INSERT INTO paragraphs VALUES (?,?,?,?)", owner_rows(owner, r))
        db.executemany("INSERT INTO sources (owner, ord, kind, title, who, url, work_key) VALUES (?,?,?,?,?,?,?)",
                       [(owner, j, x["k"], x["t"], x["w"], x["u"], work_key(x)) for j, x in enumerate(r["refs"])])
        label = r.get("label") or r.get("n"); mech = r.get("m") or r.get("d")
        ptext = [" ".join([x["title"], x["when"]] + x["how"] + [x["used"]]) for x in pats.get(owner, [])]
        db.execute("INSERT INTO search VALUES (?,?,?,?)", (owner, label, mech, "\n".join([p for ps in r["rd"].values() for p in ps] + ptext)))
    db.executemany("INSERT INTO edges VALUES (?,?,?,?)", [(e["s"], e["t"], e["k"], e["r"]) for e in data["edges"]])
    db.executemany("INSERT INTO side_links VALUES (?,?,?,?)", [(s["a"], s["b"], s["t"], s["r"]) for s in data["side"]])
    for i, t in enumerate(data["tours"]):
        db.execute("INSERT INTO tours VALUES (?,?,?)", (i, t["title"], t["sub"]))
        db.executemany("INSERT INTO tour_steps VALUES (?,?,?,?)", [(i, j, s[0], s[1]) for j, s in enumerate(t["steps"])])
    cur = data["curriculum"]
    db.executemany("INSERT INTO schools VALUES (?,?,?,?,?)", [(x["id"], x["short"], x["name"], x["url"], i) for i, x in enumerate(cur.get("schools", []))])
    for p in cur["programs"]:
        db.execute("INSERT INTO programs VALUES (?,?,?,?,?,?,?)", (p["id"], p["name"], p["year"], p["url"], p["summary"], p["short"], p["school"]))
        db.executemany("INSERT INTO program_groups VALUES (?,?,?,?,?)", [(p["id"], i, g["name"], g["note"], ",".join(g["courses"])) for i, g in enumerate(p["groups"])])
    for i, c in enumerate(cur["courses"]):
        db.execute("INSERT INTO courses VALUES (?,?,?,?,?,?,?)", (c["code"], c["title"], c["url"], c["term"], c["text"], i, c["school"]))
        db.executemany("INSERT INTO course_concepts VALUES (?,?,?)", [(c["code"], j, n) for j, n in enumerate(c["concepts"])])
    for i, d in enumerate(data["designs"]):
        db.execute("INSERT INTO designs VALUES (?,?,?,?,?,?,?,?)", (d["id"], d["title"], d["category"], d["level"], ",".join(d["concepts"]), d["w"], d["rm"], i))
        db.executemany("INSERT INTO design_paragraphs VALUES (?,?,?,?)", [(d["id"], sec, j, p) for sec, ps in d["rd"].items() for j, p in enumerate(ps)])
        db.executemany("INSERT INTO design_sources VALUES (?,?,?,?,?,?)", [(d["id"], j, x["k"], x["t"], x["w"], x["u"]) for j, x in enumerate(d["refs"])])
        db.execute("INSERT INTO search VALUES (?,?,?,?)", ("design/" + d["id"], d["title"], d["category"] + " · " + (d["rd"].get("summary") or [""])[0],
                                                           "\n".join(p for sec, ps in d["rd"].items() if sec not in ("diagram", "animation") for p in ps)))
    for i, p in enumerate(data["practice"]):
        db.execute("INSERT INTO practice VALUES (?,?,?,?,?)", (p["id"], i, p.get("pattern", ""), p.get("difficulty", ""), json.dumps(p, ensure_ascii=False)))
    for i, (name, t) in enumerate(data.get("templates", {}).items()):
        db.execute("INSERT INTO templates VALUES (?,?,?)", (name, i, json.dumps(t, ensure_ascii=False)))
    for i, s in enumerate(data.get("scenes", [])):
        db.execute("INSERT INTO scenes VALUES (?,?,?,?,?,?)", (s["id"], s["concept"], i, s.get("title", ""), len(s["steps"]), json.dumps(s, ensure_ascii=False)))
    ho = {}
    for x in data.get("handson", []): ho.setdefault(x["concept"], []).append(x)
    for c, xs in ho.items():
        db.executemany("INSERT INTO handson VALUES (?,?,?)", [(c, i, json.dumps(x, ensure_ascii=False)) for i, x in enumerate(xs)])
    for c, ps in pats.items():
        db.executemany("INSERT INTO patterns VALUES (?,?,?,?,?)", [(c, i, x["title"], ",".join(x["kinds"]), json.dumps(x, ensure_ascii=False)) for i, x in enumerate(ps)])
    db.execute("INSERT INTO meta VALUES (?,?)", ("pcatalog", json.dumps(data.get("pcatalog", []), ensure_ascii=False)))
    pm = data.get("problemmap_full")
    if pm:
        db.executemany("INSERT INTO pm_problems VALUES (?,?,?,?,?,?)", [(q["n"], q["idea"], q["family"], q["depth"], q["slug"], json.dumps(q, ensure_ascii=False)) for q in pm["problems"]])
        db.executemany("INSERT INTO pm_ideas VALUES (?,?,?,?,?)", [(d["id"], i, d["family"], d["level"], json.dumps(d, ensure_ascii=False)) for i, d in enumerate(pm["ideas"])])
        db.executemany("INSERT INTO meta VALUES (?,?)", [("problemmap", json.dumps(data["problemmap"], ensure_ascii=False, separators=(",", ":"))),
                                                         ("problemmap_summary", json.dumps(data["pm_summary"], ensure_ascii=False, separators=(",", ":")))])
    db.execute("INSERT INTO search(search) VALUES ('optimize')")
    db.commit(); db.execute("VACUUM"); db.close()
    os.replace(tmp, path)

def _script(js):
    return "<script>\n" + js.replace("</script", "<\\/script") + "\n</script>"

PROBLEMMAP = os.path.join(ROOT, "content", "problemmap", "map.json")
PM_COLS = ["n", "title", "slug", "difficulty", "family", "idea", "uses", "prereqs", "new", "depth", "concepts", "tags"]
PM_DIFF = ["Easy", "Medium", "Hard"]

def load_problemmap(path=None):
    """content/problemmap/map.json (or DTS_PROBLEMMAP). Returns (map or None, errors). A missing file is not an error:
    the app simply has no problem map until tools/merge_problemmap.py has written one."""
    path = path or os.environ.get("DTS_PROBLEMMAP") or PROBLEMMAP
    if not os.path.exists(path): return None, []
    try: m = json.load(open(path, encoding="utf-8"))
    except ValueError as e: return None, [f"{os.path.relpath(path, ROOT)}: invalid JSON: {e}"]
    if not isinstance(m, dict) or not all(isinstance(m.get(k), list) for k in ("families", "ideas", "problems")):
        return None, [f"{os.path.relpath(path, ROOT)}: needs families, ideas and problems lists"]
    ideas = {d["id"] for d in m["ideas"]}; fams = {f["id"] for f in m["families"]}
    bad = [q.get("n") for q in m["problems"] if q.get("idea") not in ideas or q.get("family") not in fams]
    if bad: return None, [f"{os.path.relpath(path, ROOT)}: problems with unknown idea or family, e.g. {bad[:8]}"]
    return m, []

def compact_problemmap(m):
    """The form the app loads: families and ideas as small objects, problems as rows (column names in "cols"); families,
    ideas, difficulties and tags are indexes. Per problem "concepts" holds only the concepts the problem adds beyond its
    primary idea's (the app derives the rest), "unlocks" is derived from prereqs. Also returns the per-concept summary
    that /api/graph carries: {concept id: [problems about it, problems that also use it]}."""
    fi = {f["id"]: i for i, f in enumerate(m["families"])}
    ii = {d["id"]: i for i, d in enumerate(m["ideas"])}
    ic = {d["id"]: d["concepts"] for d in m["ideas"]}
    tags = sorted({t for q in m["problems"] for t in q.get("tags", [])})
    ti = {t: i for i, t in enumerate(tags)}
    rows = []
    for q in sorted(m["problems"], key=lambda q: q["n"]):
        extra = [c for c in q.get("concepts", []) if c not in ic[q["idea"]]]
        rows.append([q["n"], q["title"], q["slug"], PM_DIFF.index(q["difficulty"]) if q["difficulty"] in PM_DIFF else 1, fi[q["family"]], ii[q["idea"]],
                     [ii[u] for u in q.get("uses", []) if u in ii], q.get("prereqs", []), q.get("new", ""), q.get("depth", 0), extra, [ti[t] for t in q.get("tags", [])]])
    st = dict(m.get("stats") or {})
    st.setdefault("problems", len(rows)); st.setdefault("ideas", len(m["ideas"]))
    compact = dict(v=1, stats=st, cols=PM_COLS, diffs=PM_DIFF, tags=tags,
                   families=[dict(id=f["id"], name=f["name"], description=f.get("description", ""), complete=bool(f.get("complete", True))) for f in m["families"]],
                   ideas=[dict(id=d["id"], name=d["name"], f=fi[d["family"]], l=d["level"], b=d.get("builds_on", []), c=d.get("concepts", []),
                               a=d.get("anchor"), s=d.get("summary", ""), nc=d.get("new_concept")) for d in m["ideas"]],
                   p=rows)
    concepts = {c: [len(v.get("primary", [])), len(v.get("uses", []))] for c, v in (m.get("concepts") or {}).items()}
    summary = dict(problems=len(rows), catalog=st.get("catalog", len(rows)), ideas=len(m["ideas"]), families=len(m["families"]),
                   missing_families=st.get("missing_families", []), concepts=concepts)
    return compact, summary

def standalone(data, out):
    """Inline web/ (css + js, the Temml maths library) and the full data into one HTML file.
    The data is embedded compressed: gzip, then base64, in a <script type="application/gzip-base64"> element that
    web/inflate.js decodes in the browser (DecompressionStream, or its own small inflate on older browsers).
    Returns (size of the page, size of the JSON before compression)."""
    import base64, gzip
    web = os.path.join(ROOT, "web")
    read = lambda *p: open(os.path.join(web, *p), encoding="utf-8").read()
    html = read("index.html")
    payload = json.dumps({k: v for k, v in data.items() if k != "problemmap_full"}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    b64 = base64.b64encode(gzip.compress(payload, 9, mtime=0)).decode("ascii")
    data_tag = '<script id="dts-data" type="application/gzip-base64">' + b64 + "</script>\n" + _script(read("inflate.js"))
    html = html.replace('<link rel="stylesheet" href="app.css">', "<style>\n" + read("app.css") + "\n</style>")
    for name, body in (("vendor/temml.min.js", "/* Temml 0.13.5 (MIT License, https://temml.org), LaTeX to MathML */\n" + read("vendor", "temml.min.js")),
                       ("rich.js", read("rich.js")), ("scene.js", read("scene.js")), ("langharness.js", read("langharness.js")), ("algo.js", read("algo.js")), ("pm.js", read("pm.js"))):
        tag = '<script src="%s"></script>' % name
        assert tag in html, "index.html placeholder changed: " + tag
        html = html.replace(tag, _script(body))
    tag = '<script src="app.js"></script>'
    assert tag in html, "index.html placeholder changed: " + tag
    html = html.replace(tag, data_tag + "\n" + _script(read("app.js")))
    assert "<style>" in html and '<script src="' not in html, "index.html placeholders changed"
    # dist/down-the-stack.html is a complete document (doctype + UTF-8) for opening from disk;
    # dist/artifact.html drops the shell because the hosted page gets its own document shell
    open(out, "w", encoding="utf-8").write(html)
    shell = re.sub(r"(?is)<!doctype html>\s*|</?html[^>]*>\s*|</?head>\s*|</?body>\s*", "", html)
    shell = re.sub(r'<meta charset="utf-8">\s*', "", shell)
    open(os.path.join(os.path.dirname(out), "artifact.html"), "w", encoding="utf-8").write(shell)
    return len(html.encode("utf-8")), len(payload)

PRACTICE_KEYS = ("id", "title", "pattern", "difficulty", "statement", "fn", "params", "tests", "starter", "solution")
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "problems_sample.json")

def load_practice():
    """All content/practice/*.json files (each a JSON list), concatenated in file order. When DTS_PRACTICE_FIXTURE is set,
    the sample problems in tests/fixtures/problems_sample.json are added too (for UI tests); content problems win on id clashes."""
    files = sorted(f for f in glob.glob(os.path.join(ROOT, "content", "practice", "*.json")) if os.path.basename(f) != "templates.json")
    if os.environ.get("DTS_PRACTICE_FIXTURE"): files.append(FIXTURE)
    out, seen, errs = [], set(), []
    for f in files:
        try: items = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError) as e: errs.append(f"{os.path.relpath(f, ROOT)}: {e}"); continue
        if not isinstance(items, list): errs.append(f"{os.path.relpath(f, ROOT)}: must be a JSON list"); continue
        for p in items:
            miss = [k for k in PRACTICE_KEYS if k not in p] if isinstance(p, dict) else ["object"]
            if miss: errs.append(f"{os.path.relpath(f, ROOT)}: problem {p.get('id') if isinstance(p, dict) else p!r} missing {', '.join(miss)}"); continue
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", str(p["id"])): errs.append(f"{os.path.relpath(f, ROOT)}: bad problem id {p['id']!r}"); continue
            if p["id"] in seen: continue
            if p.get("sig") is not None or p.get("langs") is not None:
                bad = check_langs_entry(p)
                if bad:
                    errs.append(f"{os.path.relpath(f, ROOT)}: problem {p['id']}: {bad}; kept as JavaScript only (fix it, then python3 tools/check_langs.py --ids {p['id']})")
                    p = {k: v for k, v in p.items() if k not in ("sig", "langs")}
            seen.add(p["id"]); out.append(p)
    return out, errs

LANG_IDS = ("python", "go", "cpp", "rust", "scala")

def check_langs_entry(p):
    """The other languages of a practice problem (content/PRACTICE_LANGS.md): a valid sig that fits the tests, and langs with a
    starter and a solution per language. Returns an error message, or "" when it is fine. (Running the solutions is
    tools/check_langs.py's job; the build only checks the shape.)"""
    import langharness
    if not isinstance(p.get("sig"), dict) or not isinstance(p.get("langs"), dict): return "sig and langs go together"
    try: langharness.prepare(p)
    except langharness.HarnessError as e: return "bad sig: " + str(e)
    L = p["langs"]
    if "python" not in L: return "langs has no python"
    for k, v in L.items():
        if k not in LANG_IDS: return f"unknown language {k!r} in langs"
        if not isinstance(v, dict) or not all(isinstance(v.get(x), str) and v[x].strip() for x in ("starter", "solution")): return f"langs.{k} needs a starter and a solution"
    return ""

TEMPLATES = os.path.join(ROOT, "content", "practice", "templates.json")
TEMPLATE_LANGS = ("python", "javascript", "go", "cpp", "rust", "scala")

def load_templates(patterns):
    """content/practice/templates.json: {pattern name: {summary, signals, idea, example, code: {language: source}, complexity, bugs,
    viz, viz_more}}. Returns (templates, errors); a bad entry is skipped with a message, a missing file means no templates.
    patterns are the practice patterns: a template for a pattern no problem uses is reported, but kept (the cheat sheet shows it)."""
    if not os.path.exists(TEMPLATES): return {}, []
    try: raw = json.load(open(TEMPLATES, encoding="utf-8"))
    except ValueError as e: return {}, [f"content/practice/templates.json: invalid JSON: {e}"]
    if not isinstance(raw, dict): return {}, ["content/practice/templates.json: must be an object keyed by pattern name"]
    out, errs = {}, []
    for name, t in raw.items():
        bad = [] if isinstance(t, dict) else ["not an object"]
        if not bad:
            if not (isinstance(t.get("signals"), list) and 1 <= len(t["signals"]) <= 6 and all(isinstance(x, str) and x for x in t["signals"])): bad.append("signals")
            for k in ("summary", "idea", "complexity"):
                if not isinstance(t.get(k), str) or not t[k].strip(): bad.append(k)
            code = t.get("code")
            if not isinstance(code, dict) or not code.get("python") or any(not isinstance(v, str) for v in code.values()) or set(code) - set(TEMPLATE_LANGS): bad.append("code")
            if not isinstance(t.get("bugs", []), list): bad.append("bugs")
            if t.get("viz") is not None and not isinstance(t.get("viz"), str): bad.append("viz")
        if bad: errs.append(f"templates.json: {name!r} has a bad {', '.join(bad)}"); continue
        if name not in patterns: errs.append(f"templates.json: no practice problem uses the pattern {name!r} (kept)")
        out[name] = t
    errs += [f"templates.json: no template for the pattern {p!r}" for p in sorted(patterns) if p not in out]
    return out, errs

ANIM_FIXTURE = os.path.join(ROOT, "tests", "fixtures", "anim_sample.json")
FORMAT_FIXTURE = os.path.join(ROOT, "tests", "fixtures", "format_sample.txt")    # rich-text sample reads (DTS_FORMAT_FIXTURE=1)
FORMAT_DESIGN = os.path.join(ROOT, "tests", "fixtures", "format_design.txt")

def load_scenes(node_ids):
    """Animated scenes: every content/anim/*.json (a JSON list of scenes; DTS_ANIM_DIR points elsewhere), validated with
    tools/checkanim.py. With DTS_ANIM_FIXTURE set, tests/fixtures/anim_sample.json is added (content wins on id clashes).
    Returns (scenes, errors); any error fails the build. A missing folder means no scenes."""
    import checkanim
    folder = os.environ.get("DTS_ANIM_DIR") or os.path.join(ROOT, "content", "anim")
    files = sorted(glob.glob(os.path.join(folder, "*.json")))
    if os.environ.get("DTS_ANIM_FIXTURE"): files.append(ANIM_FIXTURE)
    out, seen, errs = [], {}, []
    for f in files:
        where = os.path.relpath(f, ROOT)
        try: items = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError) as e: errs.append(f"{where}: invalid JSON: {e}"); continue
        if not isinstance(items, list) or not all(isinstance(s, dict) for s in items): errs.append(f"{where}: must be a JSON list of scene objects"); continue
        e = checkanim.check(items, node_ids, where)
        e += [f"{where}:{s.get('id')} bad id (use kebab-case: a-z, 0-9 and -)" for s in items if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", str(s.get("id", "")))]
        if e: errs.extend(e); continue
        for s in items:
            if s["id"] in seen:
                if f != ANIM_FIXTURE: errs.append(f"{where}:{s['id']} duplicate id (also in {seen[s['id']]})")
                continue
            seen[s["id"]] = where; out.append(s)
    return out, errs

def load_patterns(node_ids):
    """Architecture patterns (content/patterns/*.txt): (flat list in concept order, catalog list, errors)."""
    import patterns
    pats, cat, errs = patterns.load(node_ids)
    errs += patterns.check_scenes(pats, node_ids)
    catalog = [dict(c, n=sum(1 for ps in pats.values() for x in ps if c["id"] in x["kinds"])) for c in cat.values()]
    return [x for c in pats for x in pats[c]], catalog, errs

HO_KINDS = ("playground", "simulator", "puzzles", "exercises", "lab", "ctf", "game", "dataset", "kata")
HO_ACCESS = ("open-source", "free", "free-tier")
def load_handson(node_ids):
    """content/handson/*.txt: one line per link, "concept | kind | title | who | url | access | what you do there".
    Returns (links in file order, errors). A concept keeps at most 4 links; duplicates (same concept and url) are errors."""
    out, errs, seen = [], [], set()
    for f in sorted(glob.glob(os.path.join(ROOT, "content", "handson", "*.txt"))):
        where = os.path.relpath(f, ROOT)
        for ln, line in enumerate(open(f, encoding="utf-8"), 1):
            line = line.strip()
            if not line or line.startswith("#"): continue
            p = [x.strip() for x in line.split(" | ")]
            w = f"{where}:{ln}"
            if len(p) != 7: errs.append(f"{w}: needs 7 fields separated by ' | ', got {len(p)}"); continue
            c, kind, title, who, url, access, what = p
            if c not in node_ids: errs.append(f"{w}: unknown concept {c!r}"); continue
            if kind not in HO_KINDS: errs.append(f"{w}: kind must be one of {', '.join(HO_KINDS)}"); continue
            if access not in HO_ACCESS: errs.append(f"{w}: access must be one of {', '.join(HO_ACCESS)}"); continue
            if not re.match(r"https?://\S+$", url): errs.append(f"{w}: bad url {url!r}"); continue
            if not title or not what: errs.append(f"{w}: title and description are required"); continue
            if (c, url) in seen: errs.append(f"{w}: duplicate link for {c}"); continue
            seen.add((c, url)); out.append(dict(concept=c, kind=kind, t=title, w=who, u=url, access=access, d=what))
    n = {}
    for x in out: n[x["concept"]] = n.get(x["concept"], 0) + 1
    errs += [f"content/handson: {c} has {k} links (at most 4)" for c, k in n.items() if k > 4]
    return out, errs

def main():
    args = sys.argv[1:]
    t0 = time.time()
    try:
        fx = os.environ.get("DTS_FORMAT_FIXTURE")
        data = kg.load(extra=[FORMAT_FIXTURE] if fx else (), extra_designs=[FORMAT_DESIGN] if fx else ())
    except kg.ContentError as e:
        print("CONTENT ERRORS:\n  " + str(e).replace("\n", "\n  "), file=sys.stderr); sys.exit(1)
    data["practice"], perrs = load_practice()
    for e in perrs: print("practice: skipped " + e, file=sys.stderr)
    data["stats"]["practice"] = len(data["practice"])
    data["templates"], terrs = load_templates({p.get("pattern") for p in data["practice"] if p.get("pattern")})
    for e in terrs: print("templates: " + e, file=sys.stderr)
    data["stats"]["templates"] = len(data["templates"])
    data["scenes"], aerrs = load_scenes({n["id"] for n in data["nodes"]})
    if aerrs:
        print("ANIMATION ERRORS (fix them, or check one file with python3 tools/checkanim.py <file>):\n  " + "\n  ".join(aerrs), file=sys.stderr); sys.exit(1)
    data["stats"]["scenes"] = len(data["scenes"])
    data["patterns"], data["pcatalog"], perrs2 = load_patterns({n["id"] for n in data["nodes"]})
    if perrs2:
        print("PATTERN ERRORS (check one file with python3 tools/checkpatterns.py <file>):\n  " + "\n  ".join(perrs2), file=sys.stderr); sys.exit(1)
    data["handson"], herrs = load_handson({n["id"] for n in data["nodes"]})
    if herrs:
        print("HANDS-ON ERRORS:\n  " + "\n  ".join(herrs), file=sys.stderr); sys.exit(1)
    data["stats"]["handson"] = len(data["handson"])
    data["stats"]["patterns"] = len(data["patterns"])
    data["stats"]["pattern_concepts"] = len({x["concept"] for x in data["patterns"]})
    pm, pmerrs = load_problemmap()
    for e in pmerrs: print("problem map: skipped " + e, file=sys.stderr)
    if pm:
        data["problemmap_full"] = pm
        data["problemmap"], data["pm_summary"] = compact_problemmap(pm)
        # a short lesson per idea (content/problemmap/lessons/*.txt, tools/lessons.py), served with the compact map
        import lessons
        # checked against the full map (content/problemmap/map.json), then cut to the map being built (tests use a sample)
        full = json.load(open(PROBLEMMAP, encoding="utf-8")) if os.path.exists(PROBLEMMAP) else pm
        les, lerrs = lessons.load({d["id"] for d in full["ideas"]})
        if lerrs:
            print("LESSON ERRORS (check one file with python3 tools/lessons.py <file>):\n  " + "\n  ".join(lerrs), file=sys.stderr); sys.exit(1)
        here = {d["id"] for d in pm["ideas"]}
        data["problemmap"]["lessons"] = {k: v for k, v in les.items() if k in here}
    data["stats"]["problemmap"] = len(pm["problems"]) if pm else 0
    data["stats"]["lessons"] = len(data["problemmap"].get("lessons", {})) if pm else 0
    st = data["stats"]
    print(f"content ok: {st['nodes']} concepts {st['per_layer']}, {st['edges']} links, {st['side']} side links, "
          f"{st['tours']} tours, {st['courses']} courses, {st['words']:,} words, {st['refs']} sources ({st['urls']} with direct links), {st['deep']} deep reads, "
          f"{st['designs']} design questions, {st['practice']} practice problems, {st['templates']} pattern templates, {st['scenes']} animated scenes, "
          f"{st['patterns']} architecture patterns on {st['pattern_concepts']} concepts ({len(data['pcatalog'])} in the catalog), "
          f"{st['handson']} hands-on practice links, {st['lessons']} problem-map lessons, "
          f"{st['problemmap']} problems in the problem map" + ("" if pm else " (no content/problemmap/map.json yet)"))
    if "--check" in args: return
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True); os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    db = os.environ.get("DTS_CONTENT_DB") or os.path.join(ROOT, "data", "content.db")
    write_db(data, db)
    print(f"wrote {os.path.relpath(db, ROOT)} ({os.path.getsize(db)//1024} KB)")
    if "--no-html" not in args:
        out = os.environ.get("DTS_DIST") or os.path.join(ROOT, "dist", "down-the-stack.html")
        size, raw = standalone(data, out)
        print(f"wrote {os.path.relpath(out, ROOT)} ({size//1024} KB; content {raw//1024} KB before gzip + base64)")
    print(f"done in {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()
