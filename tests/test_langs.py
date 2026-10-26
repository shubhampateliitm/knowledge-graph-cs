"""Test programs for practice problems in other languages (tools/langharness.py, web/langharness.js, tools/check_langs.py).

  python3 -m unittest tests.test_langs -v
  DTS_LANGS_FULL=1 python3 -m unittest tests.test_langs     also compile and run Go, C++ and Rust (about a minute)

Uses the problems in content/practice/problems.json that have a sig, and tests/fixtures/langs_types.json, which covers
every type in the grammar (long, optional, in-place parameters, lists of lists and trees, string escapes, floats with
a tolerance, any-order answers, a design class with str / optional / bool / list / long results)."""
import json, os, shutil, subprocess, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import langharness as H
import check_langs as C

TYPES = os.path.join(ROOT, "tests", "fixtures", "langs_types.json")


def converted():
    return [p for p in json.load(open(H.PROBLEMS, encoding="utf-8")) if p.get("sig") and p.get("langs")]


def fixture():
    return json.load(open(TYPES, encoding="utf-8"))


class Generator(unittest.TestCase):
    def test_parity_with_the_browser_module(self):
        if not shutil.which("node"):
            self.skipTest("node is not installed")
        probs = converted() + fixture()
        self.assertGreaterEqual(len(probs), 12)
        self.assertEqual(C.js_parity(probs), [])

    def test_types_and_names(self):
        self.assertEqual(H.parse_type("list[ list[int] ]"), ("list", ("list", "int")))
        self.assertEqual(H.type_str(H.parse_type("optional[list[str]]")), "optional[list[str]]")
        self.assertRaises(H.HarnessError, H.parse_type, "array[int]")
        self.assertRaises(H.HarnessError, H.parse_type, "void")
        self.assertEqual(H.parse_type("void", True), "void")
        self.assertEqual((H.snake("getNewsFeed"), H.snake("isBST"), H.camel("length_of_longest_substring")), ("get_news_feed", "is_bst", "lengthOfLongestSubstring"))
        self.assertEqual(H.names({"name": "two_sum"}, "go"), {"fn": "twoSum"})
        self.assertEqual(H.names({"design": "MinStack", "methods": [{"name": "getMin"}]}, "go")["methods"], {"getMin": "GetMin"})
        self.assertEqual(H.names({"design": "MinStack", "methods": [{"name": "getMin"}]}, "rust")["methods"], {"getMin": "get_min"})

    def test_literals(self):
        self.assertEqual([H.fmt_float(x) for x in (2, 2.5, -0.0, 1e-05, 1.5e-07, 1e16, 5e15, 0.1)], ["2.0", "2.5", "0.0", "1e-5", "1.5e-7", "1e+16", "5000000000000000.0", "0.1"])
        s = 'a"b\\c\n\x01é'
        self.assertEqual(H.str_lit(s, "go"), '"a\\"b\\\\c\\n\\x01é"')
        self.assertEqual(H.str_lit(s, "cpp"), '"a\\"b\\\\c\\n\\001é"')
        self.assertEqual(H.str_lit(s, "scala"), '"a\\"b\\\\c\\n\\u0001é"')
        self.assertEqual(H.canon_tree([1, None, 2, None, None, 3]), [1, None, 2])
        self.assertEqual(H.canon_tree([None]), [])

    def test_bad_problems_are_rejected(self):
        base = {"id": "x", "title": "X", "tests": [{"args": [[1, 2], 3], "expected": 1}]}
        def err(sig, tests=None):
            p = dict(base, sig=sig)
            if tests is not None:
                p["tests"] = tests
            with self.assertRaises(H.HarnessError) as cm:
                H.prepare(p)
            return str(cm.exception)
        good = {"name": "f", "params": [["nums", "list[int]"], ["k", "int"]], "returns": "int"}
        H.prepare(dict(base, sig=good))
        self.assertIn("snake_case", err(dict(good, name="twoSum")))
        self.assertIn("expected int", err(good, [{"args": [[1, 2], 1.5], "expected": 1}]))
        self.assertIn("args must be a list of 2", err(good, [{"args": [[1, 2]], "expected": 1}]))
        self.assertIn("use long", err(good, [{"args": [[1, 2], 3], "expected": 3000000000}]))
        self.assertIn("needs sig.inplace", err(dict(good, returns="void")))
        d = {"design": "Box", "init": [], "methods": [{"name": "put", "params": [["v", "int"]], "returns": "void"}]}
        self.assertIn("unknown operation", err(d, [{"args": [["Box", "get"], [[], []]], "expected": [None, 1]}]))
        self.assertIn("constructor", err(d, [{"args": [["put"], [[1]]], "expected": [None]}]))
        self.assertIn("returns nothing", err(d, [{"args": [["Box", "put"], [[], [1]]], "expected": [None, 5]}]))

    def test_go_imports_move_to_the_top(self):
        sp = H.go_split('package main\n\nimport (\n\t"sort"\n\tc "container/heap" // heaps\n)\nimport "fmt"\n\nfunc f() {}\n')
        self.assertEqual(sp["imports"], ['c "container/heap"'])
        self.assertEqual(sp["body"].count("\n"), 9)
        self.assertNotIn("import", sp["body"])

    def test_python_programs_pass_and_fail(self):
        probs = converted() + fixture()
        res = C.check(probs, ["python"], starters=True, log=lambda *a: None)
        bad = [r for r in res if r["status"] != "ok"]
        self.assertEqual(bad, [], bad[:3])
        self.assertEqual(len(res), 2 * len(probs))
        # a wrong answer, an error and a timeout are reported as such
        p = dict(next(x for x in probs if x["id"] == "two-sum"))
        p["langs"] = {"python": {"solution": "def two_sum(nums, target):\n    return [0, 0]\n", "starter": "def two_sum(nums, target):\n    while True:\n        pass\n"}}
        res = {r["kind"]: r for r in C.check([p], ["python"], starters=True, timeout=3, log=lambda *a: None)}
        self.assertEqual(res["solution"]["status"], "fail")
        self.assertEqual(res["starter"]["status"], "timeout")

    def test_build_keeps_a_bad_sig_out(self):
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        import build
        p = dict(converted()[0])
        self.assertEqual(build.check_langs_entry(p), "")
        self.assertIn("bad sig", build.check_langs_entry(dict(p, sig={"name": "Bad"})))
        self.assertIn("no python", build.check_langs_entry(dict(p, langs={"go": p["langs"]["go"]})))


@unittest.skipUnless(os.environ.get("DTS_LANGS_FULL"), "set DTS_LANGS_FULL=1 to compile and run Go, C++ and Rust")
class Compiled(unittest.TestCase):
    def test_every_installed_language(self):
        langs = [l for l in ("go", "cpp", "rust") if C.tools()[l]]
        res = C.check(converted() + fixture(), langs, starters=True, log=lambda *a: None)
        bad = [r for r in res if r["status"] not in ("ok", "unchecked")]
        self.assertEqual(bad, [], bad[:3])


if __name__ == "__main__":
    unittest.main()
