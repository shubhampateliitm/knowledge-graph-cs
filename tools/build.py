#!/usr/bin/env python3
"""Build everything from content/:
  data/content.db               SQLite database (nodes, reads, sources, edges, tours, full-text index)
  dist/down-the-stack.html      one self-contained page (same app, data embedded) for sharing

Usage: python3 tools/build.py [--check] [--no-html]
Environment: DTS_CONTENT_DB=path   write the database somewhere else (tests use a temp file)
             DTS_PRACTICE_FIXTURE=1 also load tests/fixtures/problems_sample.json (UI tests)
             DTS_ANIM_FIXTURE=1 also load tests/fixtures/anim_sample.json (animated scenes for tests)
             DTS_ANIM_DIR=path  read animated scenes from another folder instead of content/anim/
             DTS_FORMAT_FIXTURE=1 also load tests/fixtures/format_sample.txt and format_design.txt (rich-text browser test)
             DTS_DIST=path      write the standalone page somewhere else
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
CREATE TABLE programs (id TEXT PRIMARY KEY, name TEXT NOT NULL, year TEXT NOT NULL, url TEXT NOT NULL, summary TEXT NOT NULL);
CREATE TABLE program_groups (program_id TEXT NOT NULL REFERENCES programs(id), ord INTEGER NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL, courses TEXT NOT NULL, PRIMARY KEY (program_id, ord));
CREATE TABLE courses (code TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, term TEXT NOT NULL, material TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE course_concepts (code TEXT NOT NULL REFERENCES courses(code), ord INTEGER NOT NULL, node_id TEXT NOT NULL REFERENCES nodes(id), PRIMARY KEY (code, ord));
CREATE INDEX course_concepts_node ON course_concepts(node_id);
CREATE TABLE designs (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, level TEXT NOT NULL, concepts TEXT NOT NULL,
  words INTEGER NOT NULL, read_min INTEGER NOT NULL, ord INTEGER NOT NULL);
CREATE TABLE design_paragraphs (design_id TEXT NOT NULL REFERENCES designs(id), section TEXT NOT NULL, ord INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (design_id, section, ord));
CREATE TABLE design_sources (design_id TEXT NOT NULL REFERENCES designs(id), ord INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, who TEXT NOT NULL, url TEXT NOT NULL, PRIMARY KEY (design_id, ord));
-- practice problems: one JSON object per row (statement, tests, starter, solution, ...), in file order
CREATE TABLE practice (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, pattern TEXT NOT NULL, difficulty TEXT NOT NULL, body TEXT NOT NULL);
-- animated scenes (content/anim/*.json, format in content/anim/README.md): one JSON object per row, in file order
CREATE TABLE scenes (id TEXT PRIMARY KEY, concept TEXT NOT NULL REFERENCES nodes(id), ord INTEGER NOT NULL, title TEXT NOT NULL, steps INTEGER NOT NULL, body TEXT NOT NULL);
CREATE INDEX scenes_concept ON scenes(concept, ord);
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
    for owner, r in owners:
        db.executemany("INSERT INTO paragraphs VALUES (?,?,?,?)", owner_rows(owner, r))
        db.executemany("INSERT INTO sources (owner, ord, kind, title, who, url, work_key) VALUES (?,?,?,?,?,?,?)",
                       [(owner, j, x["k"], x["t"], x["w"], x["u"], work_key(x)) for j, x in enumerate(r["refs"])])
        label = r.get("label") or r.get("n"); mech = r.get("m") or r.get("d")
        db.execute("INSERT INTO search VALUES (?,?,?,?)", (owner, label, mech, "\n".join(p for ps in r["rd"].values() for p in ps)))
    db.executemany("INSERT INTO edges VALUES (?,?,?,?)", [(e["s"], e["t"], e["k"], e["r"]) for e in data["edges"]])
    db.executemany("INSERT INTO side_links VALUES (?,?,?,?)", [(s["a"], s["b"], s["t"], s["r"]) for s in data["side"]])
    for i, t in enumerate(data["tours"]):
        db.execute("INSERT INTO tours VALUES (?,?,?)", (i, t["title"], t["sub"]))
        db.executemany("INSERT INTO tour_steps VALUES (?,?,?,?)", [(i, j, s[0], s[1]) for j, s in enumerate(t["steps"])])
    cur = data["curriculum"]
    for p in cur["programs"]:
        db.execute("INSERT INTO programs VALUES (?,?,?,?,?)", (p["id"], p["name"], p["year"], p["url"], p["summary"]))
        db.executemany("INSERT INTO program_groups VALUES (?,?,?,?,?)", [(p["id"], i, g["name"], g["note"], ",".join(g["courses"])) for i, g in enumerate(p["groups"])])
    for i, c in enumerate(cur["courses"]):
        db.execute("INSERT INTO courses VALUES (?,?,?,?,?,?)", (c["code"], c["title"], c["url"], c["term"], c["text"], i))
        db.executemany("INSERT INTO course_concepts VALUES (?,?,?)", [(c["code"], j, n) for j, n in enumerate(c["concepts"])])
    for i, d in enumerate(data["designs"]):
        db.execute("INSERT INTO designs VALUES (?,?,?,?,?,?,?,?)", (d["id"], d["title"], d["category"], d["level"], ",".join(d["concepts"]), d["w"], d["rm"], i))
        db.executemany("INSERT INTO design_paragraphs VALUES (?,?,?,?)", [(d["id"], sec, j, p) for sec, ps in d["rd"].items() for j, p in enumerate(ps)])
        db.executemany("INSERT INTO design_sources VALUES (?,?,?,?,?,?)", [(d["id"], j, x["k"], x["t"], x["w"], x["u"]) for j, x in enumerate(d["refs"])])
        db.execute("INSERT INTO search VALUES (?,?,?,?)", ("design/" + d["id"], d["title"], d["category"] + " · " + (d["rd"].get("summary") or [""])[0],
                                                           "\n".join(p for sec, ps in d["rd"].items() if sec not in ("diagram", "animation") for p in ps)))
    for i, p in enumerate(data["practice"]):
        db.execute("INSERT INTO practice VALUES (?,?,?,?,?)", (p["id"], i, p.get("pattern", ""), p.get("difficulty", ""), json.dumps(p, ensure_ascii=False)))
    for i, s in enumerate(data.get("scenes", [])):
        db.execute("INSERT INTO scenes VALUES (?,?,?,?,?,?)", (s["id"], s["concept"], i, s.get("title", ""), len(s["steps"]), json.dumps(s, ensure_ascii=False)))
    db.execute("INSERT INTO search(search) VALUES ('optimize')")
    db.commit(); db.execute("VACUUM"); db.close()
    os.replace(tmp, path)

def _script(js):
    return "<script>\n" + js.replace("</script", "<\\/script") + "\n</script>"

def standalone(data, out):
    """Inline web/ (css + js, the Temml maths library) and the full data into one HTML file.
    The data is embedded compressed: gzip, then base64, in a <script type="application/gzip-base64"> element that
    web/inflate.js decodes in the browser (DecompressionStream, or its own small inflate on older browsers).
    Returns (size of the page, size of the JSON before compression)."""
    import base64, gzip
    web = os.path.join(ROOT, "web")
    read = lambda *p: open(os.path.join(web, *p), encoding="utf-8").read()
    html = read("index.html")
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    b64 = base64.b64encode(gzip.compress(payload, 9, mtime=0)).decode("ascii")
    data_tag = '<script id="dts-data" type="application/gzip-base64">' + b64 + "</script>\n" + _script(read("inflate.js"))
    html = html.replace('<link rel="stylesheet" href="app.css">', "<style>\n" + read("app.css") + "\n</style>")
    for name, body in (("vendor/temml.min.js", "/* Temml 0.13.5 (MIT License, https://temml.org), LaTeX to MathML */\n" + read("vendor", "temml.min.js")),
                       ("rich.js", read("rich.js")), ("scene.js", read("scene.js")), ("algo.js", read("algo.js"))):
        tag = '<script src="%s"></script>' % name
        assert tag in html, "index.html placeholder changed: " + tag
        html = html.replace(tag, _script(body))
    tag = '<script src="app.js"></script>'
    assert tag in html, "index.html placeholder changed: " + tag
    html = html.replace(tag, data_tag + "\n" + _script(read("app.js")))
    assert "<style>" in html and '<script src="' not in html, "index.html placeholders changed"
    # the hosted page gets its own document shell, so drop ours
    html = re.sub(r"(?is)<!doctype html>\s*|</?html[^>]*>\s*|</?head>\s*|</?body>\s*", "", html)
    html = re.sub(r'<meta charset="utf-8">\s*', "", html)
    open(out, "w", encoding="utf-8").write(html)
    return len(html.encode("utf-8")), len(payload)

PRACTICE_KEYS = ("id", "title", "pattern", "difficulty", "statement", "fn", "params", "tests", "starter", "solution")
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "problems_sample.json")

def load_practice():
    """All content/practice/*.json files (each a JSON list), concatenated in file order. When DTS_PRACTICE_FIXTURE is set,
    the sample problems in tests/fixtures/problems_sample.json are added too (for UI tests); content problems win on id clashes."""
    files = sorted(glob.glob(os.path.join(ROOT, "content", "practice", "*.json")))
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
            seen.add(p["id"]); out.append(p)
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
    data["scenes"], aerrs = load_scenes({n["id"] for n in data["nodes"]})
    if aerrs:
        print("ANIMATION ERRORS (fix them, or check one file with python3 tools/checkanim.py <file>):\n  " + "\n  ".join(aerrs), file=sys.stderr); sys.exit(1)
    data["stats"]["scenes"] = len(data["scenes"])
    st = data["stats"]
    print(f"content ok: {st['nodes']} concepts {st['per_layer']}, {st['edges']} links, {st['side']} side links, "
          f"{st['tours']} tours, {st['courses']} courses, {st['words']:,} words, {st['refs']} sources ({st['urls']} with direct links), {st['deep']} deep reads, "
          f"{st['designs']} design questions, {st['practice']} practice problems, {st['scenes']} animated scenes")
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
