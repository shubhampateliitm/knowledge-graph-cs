#!/usr/bin/env python3
"""Build everything from content/:
  data/content.db               SQLite database (nodes, reads, sources, edges, tours, full-text index)
  dist/down-the-stack.html      one self-contained page (same app, data embedded) for sharing

Usage: python3 tools/build.py [--check] [--no-html]
"""
import json, os, re, sqlite3, sys, time
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
    db.execute("INSERT INTO search(search) VALUES ('optimize')")
    db.commit(); db.execute("VACUUM"); db.close()
    os.replace(tmp, path)

def standalone(data, out):
    """Inline web/ (css + js) and the full data into one HTML file."""
    web = os.path.join(ROOT, "web")
    html = open(os.path.join(web, "index.html"), encoding="utf-8").read()
    css = open(os.path.join(web, "app.css"), encoding="utf-8").read()
    js = open(os.path.join(web, "app.js"), encoding="utf-8").read()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = html.replace('<link rel="stylesheet" href="app.css">', "<style>\n" + css + "\n</style>")
    html = html.replace('<script src="app.js"></script>', "<script>window.DATA=" + payload + ";</script>\n<script>\n" + js + "\n</script>")
    assert "window.DATA" in html and "<style>" in html, "index.html placeholders changed"
    # the hosted page gets its own document shell, so drop ours
    html = re.sub(r"(?is)<!doctype html>\s*|</?html[^>]*>\s*|</?head>\s*|</?body>\s*", "", html)
    html = re.sub(r'<meta charset="utf-8">\s*', "", html)
    open(out, "w", encoding="utf-8").write(html)
    return len(html)

def main():
    args = sys.argv[1:]
    t0 = time.time()
    try:
        data = kg.load()
    except kg.ContentError as e:
        print("CONTENT ERRORS:\n  " + str(e).replace("\n", "\n  "), file=sys.stderr); sys.exit(1)
    st = data["stats"]
    print(f"content ok: {st['nodes']} concepts {st['per_layer']}, {st['edges']} links, {st['side']} side links, "
          f"{st['tours']} tours, {st['courses']} courses, {st['words']:,} words, {st['refs']} sources ({st['urls']} with direct links), {st['deep']} deep reads")
    if "--check" in args: return
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True); os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    db = os.path.join(ROOT, "data", "content.db")
    write_db(data, db)
    print(f"wrote {os.path.relpath(db, ROOT)} ({os.path.getsize(db)//1024} KB)")
    if "--no-html" not in args:
        out = os.path.join(ROOT, "dist", "down-the-stack.html")
        size = standalone(data, out)
        print(f"wrote {os.path.relpath(out, ROOT)} ({size//1024} KB)")
    print(f"done in {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()
