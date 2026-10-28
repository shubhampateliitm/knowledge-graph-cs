#!/usr/bin/env python3
"""Down the Stack: local server. Python standard library only.

  python3 server/server.py [--port 8787] [--host 127.0.0.1]

Serves the web app from web/ and a JSON API:
  GET  /api/health
  GET  /api/graph                      every concept (summary), links, tours, layer essays (summary), stats
  GET  /api/read/<id>                  full read for a concept or a layer essay (L0..L5); concepts include "scenes" (animated scenes, full)
  GET  /api/scenes?concept=<id>        every animated scene in full (or one concept's); summaries are in /api/graph -> scenes
  GET  /api/patterns?concept=<id>      every architecture pattern in full, with its scene (or one concept's); summaries and the
                                       pattern catalog are in /api/graph -> patterns, pcatalog; each read carries "patterns" in full
  GET  /api/search?q=...&limit=20      full-text search over every read (SQLite FTS5, BM25 ranking)
  GET  /api/library?kind=book          every source in the map, grouped by work, with the concepts that cite it
  GET  /api/me                         your progress, bookmarks, notes counts, reading time
  PUT|DELETE /api/progress/<id>        body {"status": "read" | "reading"}
  PUT|DELETE /api/bookmarks/<id>
  GET  /api/notes?node=<id>   POST /api/notes {"node","body"}   PUT|DELETE /api/notes/<note_id>
  POST /api/time/<id>                  body {"seconds": n}  (time spent reading, capped)
  GET  /api/design/<id>                full system design question (summaries are in /api/graph -> designs)
  GET  /api/practice                   your saved code and solved marks per practice problem (problems are in /api/graph -> practice)
  PUT|DELETE /api/practice/<id>        body {"code": "...", "solved": true|false} (either or both)
  GET  /api/templates                  pattern templates keyed by pattern name (also in /api/graph -> templates)
  GET  /api/problemmap                 the problem map: families, ideas (the idea DAG) and every problem as a compact row
                                       (column names in "cols"); 404 when the build has no problem map
  GET  /api/problem/<n>                one problem in full, with its idea, prerequisites and unlocks (titles included)
  PUT|DELETE /api/problem/<n>/solved   mark a problem-map problem as solved (or not); returns {"problems": {n: solved_at}}
  GET  /api/export                     all your data as JSON

Content lives in data/content.db (rebuilt by tools/build.py); your own data lives in data/user.db and survives rebuilds.
"""
import argparse, gzip, json, mimetypes, os, re, sqlite3, sys, threading, time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
CONTENT_DB = os.environ.get("DTS_CONTENT_DB") or os.path.join(ROOT, "data", "content.db")
USER_DB = os.environ.get("DTS_USER_DB") or os.path.join(ROOT, "data", "user.db")
MAX_BODY = 64 * 1024
# same order as tools/kg.py SECTIONS (reading order)
SECTIONS = ("value", "terms", "history", "how", "diagram", "animation", "example", "intuition", "mistakes", "tradeoffs", "friction",
            "practice", "interview", "quiz")
DESIGN_SECTIONS = ("summary", "requirements", "estimates", "api", "datamodel", "design", "diagram", "animation", "deepdive",
                   "tradeoffs", "failures", "evolution", "followups")
MAX_CODE = 60000

USER_SCHEMA = [
    # migration 1
    """
    CREATE TABLE progress (node_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('read','reading')), updated_at TEXT NOT NULL);
    CREATE TABLE bookmarks (node_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE notes (id INTEGER PRIMARY KEY, node_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX notes_node ON notes(node_id);
    CREATE TABLE reading_time (node_id TEXT PRIMARY KEY, seconds INTEGER NOT NULL, last_at TEXT NOT NULL);
    """,
    # migration 2: spaced review of self-check questions (Leitner boxes 1-5, due date YYYY-MM-DD)
    """
    CREATE TABLE review (node_id TEXT NOT NULL, q INTEGER NOT NULL, box INTEGER NOT NULL CHECK (box BETWEEN 1 AND 5), due TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (node_id, q));
    """,
    # migration 3: practice problems (your code and whether all tests passed)
    """
    CREATE TABLE practice (problem_id TEXT PRIMARY KEY, code TEXT NOT NULL, solved INTEGER NOT NULL DEFAULT 0 CHECK (solved IN (0,1)), solved_at TEXT, updated_at TEXT NOT NULL);
    """,
    # migration 4: problem-map problems you have solved (LeetCode numbers); drives "Next problems"
    """
    CREATE TABLE pm_solved (n INTEGER PRIMARY KEY, solved_at TEXT NOT NULL);
    """,
]

def now(): return time.strftime("%Y-%m-%dT%H:%M:%S")


class Content:
    """Everything except search is served from memory; the content DB is read once at start-up."""
    def __init__(self, path):
        if not os.path.exists(path):
            sys.exit(f"{path} not found. Run: python3 tools/build.py")
        self.path = path
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        db.row_factory = sqlite3.Row
        self.stats = json.loads(db.execute("SELECT value FROM meta WHERE key='stats'").fetchone()[0])
        self.built_at = db.execute("SELECT value FROM meta WHERE key='built_at'").fetchone()[0]
        paras, refs = {}, {}
        for r in db.execute("SELECT owner, section, text FROM paragraphs ORDER BY owner, section, ord"):
            paras.setdefault(r["owner"], {}).setdefault(r["section"], []).append(r["text"])
        for r in db.execute("SELECT owner, kind, title, who, url FROM sources ORDER BY owner, ord"):
            refs.setdefault(r["owner"], []).append(dict(k=r["kind"], t=r["title"], w=r["who"], u=r["url"]))
        def ordered(d): return {s: d[s] for s in SECTIONS if s in d}
        self.reads, nodes = {}, []
        for r in db.execute("SELECT * FROM nodes ORDER BY ord"):
            rd = ordered(paras.get(r["id"], {}))
            nodes.append(dict(id=r["id"], l=r["layer"], label=r["label"], cat=r["category"], y=r["year"], st=r["status"], m=r["mechanism"],
                              deep=bool(r["deep"]), rm=r["read_min"], w=r["words"], nr=len(refs.get(r["id"], [])),
                              b=(rd.get("value") or [""])[0], q=(rd.get("intuition") or [""])[0]))
            self.reads[r["id"]] = dict(id=r["id"], rd=rd, refs=refs.get(r["id"], []))
        layers = []
        for r in db.execute("SELECT * FROM layers ORDER BY layer"):
            lid = f"L{r['layer']}"
            layers.append(dict(id=lid, l=r["layer"], n=r["name"], d=r["description"], rm=r["read_min"], w=r["words"]))
            self.reads[lid] = dict(id=lid, rd=ordered(paras.get(lid, {})), refs=refs.get(lid, []))
        edges = [dict(s=r[0], t=r[1], k=r[2], r=r[3]) for r in db.execute("SELECT src, dst, kind, reason FROM edges")]
        side = [dict(a=r[0], b=r[1], t=r[2], r=r[3]) for r in db.execute("SELECT a, b, type, reason FROM side_links")]
        tours = []
        for t in db.execute("SELECT id, title, subtitle FROM tours ORDER BY id").fetchall():
            steps = [[s[0], s[1]] for s in db.execute("SELECT node_id, note FROM tour_steps WHERE tour_id=? ORDER BY ord", (t[0],))]
            tours.append(dict(title=t[1], sub=t[2], steps=steps))
        curriculum = dict(programs=[], courses=[])
        for p in db.execute("SELECT * FROM programs ORDER BY rowid").fetchall():
            groups = [dict(name=g["name"], note=g["note"], courses=g["courses"].split(",")) for g in db.execute("SELECT * FROM program_groups WHERE program_id=? ORDER BY ord", (p["id"],))]
            curriculum["programs"].append(dict(id=p["id"], name=p["name"], year=p["year"], url=p["url"], summary=p["summary"], groups=groups))
        for c in db.execute("SELECT * FROM courses ORDER BY ord").fetchall():
            ids = [r[0] for r in db.execute("SELECT node_id FROM course_concepts WHERE code=? ORDER BY ord", (c["code"],))]
            curriculum["courses"].append(dict(code=c["code"], title=c["title"], url=c["url"], term=c["term"], text=c["material"], concepts=ids))
        self.designs, design_list = {}, []
        has = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "designs" in has:
            dp, ds = {}, {}
            for r in db.execute("SELECT design_id, section, text FROM design_paragraphs ORDER BY design_id, section, ord"):
                dp.setdefault(r[0], {}).setdefault(r[1], []).append(r[2])
            for r in db.execute("SELECT design_id, kind, title, who, url FROM design_sources ORDER BY design_id, ord"):
                ds.setdefault(r[0], []).append(dict(k=r[1], t=r[2], w=r[3], u=r[4]))
            for r in db.execute("SELECT * FROM designs ORDER BY ord").fetchall():
                rd = {s_: dp[r["id"]][s_] for s_ in DESIGN_SECTIONS if s_ in dp.get(r["id"], {})}
                base = dict(id=r["id"], title=r["title"], category=r["category"], level=r["level"], concepts=[c for c in r["concepts"].split(",") if c],
                            rm=r["read_min"], w=r["words"])
                self.designs[r["id"]] = dict(base, rd=rd, refs=ds.get(r["id"], []))
                design_list.append(dict(base, summary=(rd.get("summary") or [""])[0]))
        practice = [json.loads(r[0]) for r in db.execute("SELECT body FROM practice ORDER BY ord")] if "practice" in has else []
        self.practice_ids = {p["id"] for p in practice}
        # pattern templates (content/practice/templates.json), keyed by the practice pattern name, in file order
        self.templates = {r[0]: json.loads(r[1]) for r in db.execute("SELECT pattern, body FROM templates ORDER BY ord")} if "templates" in has else {}
        # animated scenes: full bodies in each concept's read, summaries in the graph
        self.scenes = [json.loads(r[0]) for r in db.execute("SELECT body FROM scenes ORDER BY ord")] if "scenes" in has else []
        by_concept = {}
        for s_ in self.scenes: by_concept.setdefault(s_["concept"], []).append(s_)
        for n in nodes: self.reads[n["id"]]["scenes"] = by_concept.get(n["id"], [])
        scene_list = [dict(id=s_["id"], concept=s_["concept"], title=s_.get("title", ""), n=len(s_.get("steps", []))) for s_ in self.scenes]
        # architecture patterns (content/patterns/*.txt): full bodies (with the compiled scene) in each concept's read,
        # summaries and the canonical catalog in the graph
        pats = {}
        if "patterns" in has:
            for r in db.execute("SELECT concept, body FROM patterns ORDER BY concept, ord"): pats.setdefault(r[0], []).append(json.loads(r[1]))
        self.patterns = [x for n in nodes for x in pats.get(n["id"], [])]
        for n in nodes: self.reads[n["id"]]["patterns"] = pats.get(n["id"], [])
        pattern_list = [dict(concept=x["concept"], i=i, title=x["title"], kinds=x["kinds"], when=x["when"], n=len(x["scene"]["steps"]))
                        for n in nodes for i, x in enumerate(pats.get(n["id"], []))]
        row = db.execute("SELECT value FROM meta WHERE key='pcatalog'").fetchone()
        pcatalog = json.loads(row[0]) if row else []
        # problem map: the compact form is served as is; full entries per problem answer /api/problem/<n>
        self.pm_json, self.pm_gz, self.pm, self.pm_ideas, pm_summary = None, None, {}, {}, None
        if "pm_problems" in has:
            meta = dict(db.execute("SELECT key, value FROM meta WHERE key IN ('problemmap', 'problemmap_summary')").fetchall())
            if meta.get("problemmap"):
                self.pm_json = meta["problemmap"].encode()
                self.pm_gz = gzip.compress(self.pm_json, 6)
                pm_summary = json.loads(meta.get("problemmap_summary") or "null")
                self.pm = {r[0]: json.loads(r[1]) for r in db.execute("SELECT n, body FROM pm_problems")}
                self.pm_ideas = {r[0]: json.loads(r[1]) for r in db.execute("SELECT id, body FROM pm_ideas ORDER BY ord")}
        db.close()
        self.ids = set(self.reads)
        self.graph = dict(nodes=nodes, edges=edges, side=side, tours=tours, layers=layers, curriculum=curriculum, designs=design_list, practice=practice, templates=self.templates, scenes=scene_list, patterns=pattern_list, pcatalog=pcatalog, stats=self.stats, built_at=self.built_at, mode="server", problemmap=pm_summary)
        self.graph_json = json.dumps(self.graph, ensure_ascii=False, separators=(",", ":")).encode()
        self.graph_gz = gzip.compress(self.graph_json, 6)
        self.local = threading.local()

    def db(self):
        c = getattr(self.local, "db", None)
        if c is None:
            c = self.local.db = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, check_same_thread=False)
            c.row_factory = sqlite3.Row
        return c

    def search(self, q, limit=20):
        tokens = re.findall(r"[\w][\w'’.-]*", q.lower())[:8]
        if not tokens: return []
        # every token must match; the last one may be a prefix (search-as-you-type)
        expr = " ".join('"%s"%s' % (t.replace('"', ''), "*" if i == len(tokens) - 1 else "") for i, t in enumerate(tokens))
        sql = ("SELECT owner, label, snippet(search, 3, char(2), char(3), ' … ', 22) AS snip, "
               "bm25(search, 0, 12.0, 4.0, 1.0) AS score FROM search WHERE search MATCH ? ORDER BY score LIMIT ?")
        out, seen = [], set()
        # exact phrase hits rank first, then documents that contain every word
        queries = []
        if len(tokens) > 1:
            queries.append('"' + " ".join(t.replace('"', '') for t in tokens) + '"')
        queries.append(expr)
        for qx in queries:
            try:
                rows = self.db().execute(sql, (qx, limit)).fetchall()
            except sqlite3.OperationalError:
                continue
            for r in rows:
                if r["owner"] in seen: continue
                seen.add(r["owner"])
                out.append(dict(id=r["owner"], label=r["label"], snippet=r["snip"], score=round(r["score"], 3)))
        return out[:limit]

    def problem(self, n):
        """One problem in full, with the titles of its prerequisites and unlocks, its idea and its worked practice problem."""
        q = self.pm.get(n)
        if not q: return None
        brief = lambda m: dict(n=m, title=self.pm[m]["title"], difficulty=self.pm[m]["difficulty"], idea=self.pm[m]["idea"], depth=self.pm[m]["depth"], new=self.pm[m]["new"]) if m in self.pm else dict(n=m)
        d = self.pm_ideas.get(q["idea"], {})
        return dict(q, idea_name=d.get("name", q["idea"]), idea_level=d.get("level"), uses_names={u: self.pm_ideas.get(u, {}).get("name", u) for u in q.get("uses", [])},
                    prereqs_detail=[brief(m) for m in q.get("prereqs", [])], unlocks_detail=[brief(m) for m in q.get("unlocks", [])],
                    practice=q["slug"] if q["slug"] in self.practice_ids else None)

    def library(self, kind=None):
        sql = ("SELECT work_key, kind, title, who, url, owner FROM sources " + ("WHERE kind = ? " if kind else "") + "ORDER BY id")
        works = {}
        for r in self.db().execute(sql, (kind,) if kind else ()):
            w = works.setdefault(r["work_key"], dict(k=r["kind"], t=r["title"], w=r["who"], u="", by=[]))
            if r["url"] and not w["u"]: w["u"] = r["url"]
            t = re.sub(r",\s*ch(apter)?s?\.?\s.*$", "", r["title"])
            if len(t) < len(w["t"]) or w["t"] == r["title"]: w["t"] = t
            if r["owner"] not in w["by"]: w["by"].append(r["owner"])
        out = sorted(works.values(), key=lambda w: (-len(w["by"]), w["t"].lower()))
        return dict(works=out, total=len(out))


class UserData:
    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.execute("PRAGMA foreign_keys = ON")
        v = self.conn.execute("PRAGMA user_version").fetchone()[0]
        for i, script in enumerate(USER_SCHEMA[v:], start=v + 1):
            self.conn.executescript(script); self.conn.execute(f"PRAGMA user_version = {i}")
        self.conn.commit()

    def q(self, sql, args=()):
        with self.lock:
            cur = self.conn.execute(sql, args); self.conn.commit(); return cur

    def me(self):
        with self.lock:
            c = self.conn
            return dict(
                progress={r[0]: dict(status=r[1], at=r[2]) for r in c.execute("SELECT node_id, status, updated_at FROM progress")},
                bookmarks=[dict(id=r[0], at=r[1]) for r in c.execute("SELECT node_id, created_at FROM bookmarks ORDER BY created_at DESC")],
                notes={r[0]: r[1] for r in c.execute("SELECT node_id, count(*) FROM notes GROUP BY node_id")},
                time={r[0]: r[1] for r in c.execute("SELECT node_id, seconds FROM reading_time")},
                review={f"{r[0]}#{r[1]}": [r[2], r[3]] for r in c.execute("SELECT node_id, q, box, due FROM review")},
                practice={r[0]: bool(r[1]) for r in c.execute("SELECT problem_id, solved FROM practice")},
                problems={str(r[0]): r[1] for r in c.execute("SELECT n, solved_at FROM pm_solved")},
                recent=[dict(id=r[0], at=r[1]) for r in c.execute("SELECT node_id, max(at) AS at FROM (SELECT node_id, updated_at AS at FROM progress UNION ALL SELECT node_id, last_at FROM reading_time) GROUP BY node_id ORDER BY at DESC LIMIT 12")],
            )

    def export(self):
        with self.lock:
            c = self.conn
            return {t: [dict(r) for r in c.execute(f"SELECT * FROM {t}")] for t in ("progress", "bookmarks", "notes", "reading_time", "review", "practice", "pm_solved")}

    def pm_solved(self):
        with self.lock:
            return {"problems": {str(r[0]): r[1] for r in self.conn.execute("SELECT n, solved_at FROM pm_solved")}}

    def practice(self):
        with self.lock:
            return {r[0]: dict(code=r[1], solved=bool(r[2]), solved_at=r[3], at=r[4]) for r in self.conn.execute("SELECT problem_id, code, solved, solved_at, updated_at FROM practice")}


class App:
    def __init__(self):
        self.content = Content(CONTENT_DB)
        self.user = UserData(USER_DB)


def make_handler(app, allowed_hosts):
    class H(BaseHTTPRequestHandler):
        server_version = "DownTheStack/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            if os.environ.get("DTS_QUIET"): return
            sys.stderr.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

        # ---------- helpers ----------
        def send(self, status, body=b"", ctype="application/json; charset=utf-8", gz=None, headers=None):
            if isinstance(body, (dict, list)):
                body = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
            elif isinstance(body, str):
                body = body.encode()
            accepts_gz = "gzip" in (self.headers.get("Accept-Encoding") or "")
            if gz is not None and accepts_gz:
                body = gz; enc = True
            elif accepts_gz and len(body) > 1400 and (ctype.startswith("application/json") or ctype.startswith("text/") or "javascript" in ctype):
                body = gzip.compress(body, 5); enc = True
            else:
                enc = False
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            if enc: self.send_header("Content-Encoding", "gzip")
            for k, v in (headers or {}).items(): self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD": self.wfile.write(body)

        def err(self, status, msg): self.send(status, {"error": msg})

        def body_json(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY: raise ValueError("body too large")
            if not (self.headers.get("Content-Type") or "").startswith("application/json"):
                raise PermissionError("writes must be application/json")
            raw = self.rfile.read(n) if n else b"{}"
            return json.loads(raw or b"{}")

        def guard(self):
            # DNS-rebinding guard: only answer requests addressed to this machine
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
            if host not in allowed_hosts:
                self.err(HTTPStatus.FORBIDDEN, "unexpected Host header"); return False
            return True

        def known(self, nid):
            if nid not in app.content.ids:
                self.err(HTTPStatus.NOT_FOUND, f"unknown concept {nid!r}"); return False
            return True

        # ---------- routing ----------
        def do_HEAD(self): self.do_GET()

        def do_GET(self):
            if not self.guard(): return
            u = urlparse(self.path); p = u.path; qs = parse_qs(u.query)
            c = app.content
            try:
                if p == "/api/health": return self.send(200, {"ok": True, "built_at": c.built_at, "concepts": c.stats["nodes"]})
                if p == "/api/graph": return self.send(200, c.graph_json, gz=c.graph_gz)
                m = re.fullmatch(r"/api/design/([A-Za-z0-9-]+)", p)
                if m:
                    d = c.designs.get(m.group(1))
                    if not d: return self.err(404, f"unknown design {m.group(1)!r}")
                    return self.send(200, d)
                if p == "/api/practice": return self.send(200, app.user.practice())
                if p == "/api/problemmap":
                    if not c.pm_json: return self.err(404, "this build has no problem map (run python3 tools/merge_problemmap.py, then tools/build.py)")
                    return self.send(200, c.pm_json, gz=c.pm_gz)
                m = re.fullmatch(r"/api/problem/(\d{1,6})", p)
                if m:
                    q = c.problem(int(m.group(1)))
                    if not q: return self.err(404, f"problem {m.group(1)} is not in the problem map")
                    return self.send(200, q)
                if p == "/api/templates": return self.send(200, c.templates)
                if p == "/api/scenes":
                    cid = (qs.get("concept") or [None])[0]
                    if cid is not None and not self.known(cid): return
                    return self.send(200, [s_ for s_ in c.scenes if cid is None or s_["concept"] == cid])
                if p == "/api/patterns":
                    cid = (qs.get("concept") or [None])[0]
                    if cid is not None and not self.known(cid): return
                    return self.send(200, [x for x in c.patterns if cid is None or x["concept"] == cid])
                m = re.fullmatch(r"/api/read/([A-Za-z0-9-]+)", p)
                if m:
                    if not self.known(m.group(1)): return
                    return self.send(200, c.reads[m.group(1)])
                if p == "/api/search":
                    q = (qs.get("q") or [""])[0][:200]
                    limit = max(1, min(50, int((qs.get("limit") or ["20"])[0] or 20)))
                    return self.send(200, {"q": q, "results": c.search(q, limit)})
                if p == "/api/library":
                    kind = (qs.get("kind") or [None])[0]
                    return self.send(200, c.library(kind))
                if p == "/api/me": return self.send(200, app.user.me())
                if p == "/api/export":
                    return self.send(200, app.user.export(), headers={"Content-Disposition": 'attachment; filename="down-the-stack-my-data.json"'})
                if p == "/api/notes":
                    nid = (qs.get("node") or [""])[0]
                    if not self.known(nid): return
                    rows = app.user.q("SELECT id, body, created_at, updated_at FROM notes WHERE node_id=? ORDER BY created_at", (nid,)).fetchall()
                    return self.send(200, [dict(r) for r in rows])
                if p.startswith("/api/"): return self.err(404, "no such endpoint")
                return self.static(p)
            except ValueError as e:
                return self.err(400, str(e))

        def do_PUT(self): self.write("PUT")
        def do_POST(self): self.write("POST")
        def do_DELETE(self): self.write("DELETE")

        def write(self, method):
            if not self.guard(): return
            p = urlparse(self.path).path
            U = app.user
            try:
                body = self.body_json() if method in ("PUT", "POST") else {}
            except PermissionError as e: return self.err(415, str(e))
            except (ValueError, json.JSONDecodeError) as e: return self.err(400, f"bad JSON: {e}")
            m = re.fullmatch(r"/api/(progress|bookmarks|time)/([A-Za-z0-9-]+)", p)
            if m:
                what, nid = m.groups()
                if not self.known(nid): return
                if what == "progress":
                    if method == "PUT":
                        st = body.get("status")
                        if st not in ("read", "reading"): return self.err(400, "status must be 'read' or 'reading'")
                        U.q("INSERT INTO progress VALUES (?,?,?) ON CONFLICT(node_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at", (nid, st, now()))
                    elif method == "DELETE": U.q("DELETE FROM progress WHERE node_id=?", (nid,))
                    else: return self.err(405, "use PUT or DELETE")
                elif what == "bookmarks":
                    if method == "PUT": U.q("INSERT OR IGNORE INTO bookmarks VALUES (?,?)", (nid, now()))
                    elif method == "DELETE": U.q("DELETE FROM bookmarks WHERE node_id=?", (nid,))
                    else: return self.err(405, "use PUT or DELETE")
                else:
                    if method != "POST": return self.err(405, "use POST")
                    try: secs = int(body.get("seconds", 0))
                    except (TypeError, ValueError): return self.err(400, "seconds must be a number")
                    secs = max(0, min(secs, 1800))
                    U.q("INSERT INTO reading_time VALUES (?,?,?) ON CONFLICT(node_id) DO UPDATE SET seconds=seconds+excluded.seconds, last_at=excluded.last_at", (nid, secs, now()))
                return self.send(200, U.me())
            m = re.fullmatch(r"/api/practice/([A-Za-z0-9-]+)", p)
            if m:
                pid = m.group(1)
                if pid not in app.content.practice_ids: return self.err(404, f"unknown problem {pid!r}")
                if method == "PUT":
                    code, solved = body.get("code"), body.get("solved")
                    if code is not None and (not isinstance(code, str) or len(code) > MAX_CODE): return self.err(400, f"code must be a string of at most {MAX_CODE} characters")
                    if solved is not None and not isinstance(solved, bool): return self.err(400, "solved must be true or false")
                    if code is None and solved is None: return self.err(400, "send code and/or solved")
                    t = now()
                    U.q("INSERT INTO practice (problem_id, code, solved, solved_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(problem_id) DO UPDATE SET "
                        "code=COALESCE(?, code), solved=COALESCE(?, solved), solved_at=CASE WHEN ?=1 THEN COALESCE(solved_at, ?) WHEN ?=0 THEN NULL ELSE solved_at END, updated_at=?",
                        (pid, code or "", int(bool(solved)), t if solved else None, t,
                         code, None if solved is None else int(solved), None if solved is None else int(solved), t, None if solved is None else int(solved), t))
                elif method == "DELETE": U.q("DELETE FROM practice WHERE problem_id=?", (pid,))
                else: return self.err(405, "use PUT or DELETE")
                return self.send(200, U.practice())
            m = re.fullmatch(r"/api/problem/(\d{1,6})/solved", p)
            if m:
                n = int(m.group(1))
                if n not in app.content.pm: return self.err(404, f"problem {n} is not in the problem map")
                if method == "PUT": U.q("INSERT OR IGNORE INTO pm_solved VALUES (?,?)", (n, now()))
                elif method == "DELETE": U.q("DELETE FROM pm_solved WHERE n=?", (n,))
                else: return self.err(405, "use PUT or DELETE")
                return self.send(200, U.pm_solved())
            m = re.fullmatch(r"/api/review/([A-Za-z0-9-]+)/(\d{1,2})", p)
            if m:
                nid, qi = m.group(1), int(m.group(2))
                if not self.known(nid): return
                if method == "PUT":
                    box, due = body.get("box"), str(body.get("due", ""))
                    if not isinstance(box, int) or not 1 <= box <= 5: return self.err(400, "box must be 1-5")
                    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", due): return self.err(400, "due must be YYYY-MM-DD")
                    U.q("INSERT INTO review VALUES (?,?,?,?,?) ON CONFLICT(node_id, q) DO UPDATE SET box=excluded.box, due=excluded.due, updated_at=excluded.updated_at", (nid, qi, box, due, now()))
                elif method == "DELETE": U.q("DELETE FROM review WHERE node_id=? AND q=?", (nid, qi))
                else: return self.err(405, "use PUT or DELETE")
                return self.send(200, U.me())
            if p == "/api/notes" and method == "POST":
                nid, text = body.get("node", ""), str(body.get("body", "")).strip()
                if not self.known(nid): return
                if not text or len(text) > 20000: return self.err(400, "note must be 1–20000 characters")
                t = now(); cur = U.q("INSERT INTO notes (node_id, body, created_at, updated_at) VALUES (?,?,?,?)", (nid, text, t, t))
                return self.send(201, {"id": cur.lastrowid, "body": text, "created_at": t, "updated_at": t})
            m = re.fullmatch(r"/api/notes/(\d+)", p)
            if m:
                note = int(m.group(1))
                if method == "PUT":
                    text = str(body.get("body", "")).strip()
                    if not text or len(text) > 20000: return self.err(400, "note must be 1–20000 characters")
                    if U.q("UPDATE notes SET body=?, updated_at=? WHERE id=?", (text, now(), note)).rowcount == 0: return self.err(404, "no such note")
                    return self.send(200, {"ok": True})
                if method == "DELETE":
                    if U.q("DELETE FROM notes WHERE id=?", (note,)).rowcount == 0: return self.err(404, "no such note")
                    return self.send(200, {"ok": True})
            return self.err(404, "no such endpoint")

        def static(self, p):
            if p in ("", "/"): p = "/index.html"
            path = os.path.realpath(os.path.join(WEB, p.lstrip("/")))
            if not path.startswith(os.path.realpath(WEB) + os.sep) or not os.path.isfile(path):
                # client-side routes fall back to the app
                path = os.path.join(WEB, "index.html")
            ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype.endswith("javascript"): ctype += "; charset=utf-8"
            with open(path, "rb") as f: body = f.read()
            self.send(200, body, ctype=ctype)
    return H


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--host", default=os.environ.get("DTS_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("DTS_PORT", "8787")))
    a = ap.parse_args()
    mimetypes.add_type("text/javascript", ".js"); mimetypes.add_type("text/css", ".css")
    app = App()
    allowed = {"localhost", "127.0.0.1", "::1", a.host.lower()}
    allowed |= set(filter(None, os.environ.get("DTS_ALLOWED_HOSTS", "").lower().split(",")))
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(app, allowed))
    srv.daemon_threads = True
    st = app.content.stats
    print(f"Down the Stack: {st['nodes']} concepts, {st['refs']} sources, {st['words']:,} words")
    print(f"Open http://{'localhost' if a.host in ('127.0.0.1', '0.0.0.0') else a.host}:{a.port}/   (Ctrl+C to stop)")
    try: srv.serve_forever()
    except KeyboardInterrupt: print("\nbye")

if __name__ == "__main__":
    main()
