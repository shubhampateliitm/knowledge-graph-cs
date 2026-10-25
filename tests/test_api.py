"""API tests: build the content DB, start the server on a free port with a throwaway user DB, exercise every endpoint.
   python3 -m unittest discover -s tests -v"""
import json, os, shutil, socket, subprocess, sys, tempfile, time, unittest, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

class API(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py"), "--no-html"], check=True, capture_output=True)
        cls.tmp = tempfile.mkdtemp()
        cls.port = free_port()
        env = dict(os.environ, DTS_QUIET="1", DTS_USER_DB=os.path.join(cls.tmp, "user.db"))
        cls.proc = subprocess.Popen([sys.executable, os.path.join(ROOT, "server", "server.py"), "--port", str(cls.port)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            try: cls.get("/api/health"); break
            except Exception: time.sleep(0.05)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(5); shutil.rmtree(cls.tmp, ignore_errors=True)

    @classmethod
    def req(cls, method, path, body=None, ctype="application/json", host=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(f"http://127.0.0.1:{cls.port}{path}", data=data, method=method)
        if data is not None: r.add_header("Content-Type", ctype)
        if host: r.add_header("Host", host)
        try:
            with urllib.request.urlopen(r, timeout=5) as resp: return resp.status, json.loads(resp.read() or b"null")
        except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"null")

    @classmethod
    def get(cls, path): return cls.req("GET", path)

    def test_graph(self):
        s, g = self.get("/api/graph")
        self.assertEqual(s, 200)
        self.assertGreater(len(g["nodes"]), 500)
        ids = {n["id"] for n in g["nodes"]}
        for e in g["edges"]: self.assertIn(e["s"], ids); self.assertIn(e["t"], ids)
        self.assertEqual(len(g["layers"]), 6)
        for n in g["nodes"]: self.assertTrue(n["b"] and n["q"] and n["rm"] >= 1, n["id"])

    def test_read(self):
        s, r = self.get("/api/read/kafka")
        self.assertEqual(s, 200)
        for sec in ("value", "how", "intuition", "friction"): self.assertTrue(r["rd"][sec])
        self.assertTrue(r["refs"])
        s, r = self.get("/api/read/L3"); self.assertEqual(s, 200); self.assertTrue(r["rd"]["value"])
        self.assertEqual(self.get("/api/read/nope")[0], 404)

    def test_search(self):
        s, r = self.get("/api/search?q=write%20skew")
        self.assertEqual(r["results"][0]["id"], "isolation")
        s, r = self.get("/api/search?q=raf")          # prefix match on the last word
        self.assertIn("raft", [x["id"] for x in r["results"]])
        s, r = self.get("/api/search?q=%22%29(*")     # junk must not crash FTS
        self.assertEqual(s, 200)

    def test_library(self):
        s, r = self.get("/api/library")
        self.assertGreater(r["total"], 300)
        self.assertGreaterEqual(len(r["works"][0]["by"]), len(r["works"][-1]["by"]))

    def test_progress_bookmarks_notes_time(self):
        s, me = self.req("PUT", "/api/progress/raft", {"status": "read"}); self.assertEqual(me["progress"]["raft"]["status"], "read")
        self.assertEqual(self.req("PUT", "/api/progress/raft", {"status": "bogus"})[0], 400)
        s, me = self.req("PUT", "/api/bookmarks/raft", {}); self.assertEqual(me["bookmarks"][0]["id"], "raft")
        s, n = self.req("POST", "/api/notes", {"node": "raft", "body": "terms are a logical clock"}); self.assertEqual(s, 201)
        s, lst = self.get("/api/notes?node=raft"); self.assertEqual(lst[0]["body"], "terms are a logical clock")
        self.assertEqual(self.req("PUT", f"/api/notes/{n['id']}", {"body": "edited"})[0], 200)
        s, me = self.req("POST", "/api/time/raft", {"seconds": 99999}); self.assertEqual(me["time"]["raft"], 1800)  # capped
        self.assertEqual(self.req("DELETE", f"/api/notes/{n['id']}")[0], 200)
        s, me = self.req("DELETE", "/api/bookmarks/raft"); self.assertEqual(me["bookmarks"], [])
        s, ex = self.get("/api/export"); self.assertIn("progress", ex)

    def test_review(self):
        s, me = self.req("PUT", "/api/review/bloom/0", {"box": 1, "due": "2026-10-26"}); self.assertEqual(me["review"]["bloom#0"], [1, "2026-10-26"])
        s, me = self.req("PUT", "/api/review/bloom/0", {"box": 3, "due": "2026-11-02"}); self.assertEqual(me["review"]["bloom#0"], [3, "2026-11-02"])
        self.assertEqual(self.req("PUT", "/api/review/bloom/0", {"box": 9, "due": "2026-11-02"})[0], 400)
        self.assertEqual(self.req("PUT", "/api/review/bloom/0", {"box": 2, "due": "soon"})[0], 400)
        self.assertEqual(self.req("PUT", "/api/review/nope/0", {"box": 2, "due": "2026-11-02"})[0], 404)
        s, me = self.req("DELETE", "/api/review/bloom/0"); self.assertNotIn("bloom#0", me["review"])

    def test_learning_sections(self):
        s, r = self.get("/api/read/bloom"); self.assertEqual(s, 200)
        self.assertEqual(len(r["rd"]["quiz"]), 5)
        self.assertGreaterEqual(len(r["rd"]["terms"]), 6)
        self.assertTrue(r["rd"]["diagram"][0].startswith("  "))   # leading spaces kept in diagrams
        self.assertEqual(list(r["rd"]).index("terms"), 1)          # sections come back in reading order

    def test_security(self):
        self.assertEqual(self.req("PUT", "/api/progress/raft", {"status": "read"}, ctype="text/plain")[0], 415)   # forces CORS preflight from other sites
        self.assertEqual(self.req("GET", "/api/me", host="evil.example")[0], 403)                                  # DNS-rebinding guard
        import http.client                                                                                         # path traversal serves the app, never source files
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5); c.request("GET", "/../server/server.py")
        body = c.getresponse().read().decode(); self.assertNotIn("import argparse", body); self.assertIn("<!doctype html>", body)

if __name__ == "__main__":
    unittest.main()
