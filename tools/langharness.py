#!/usr/bin/env python3
"""Test programs for practice problems in Python, Go, C++17, Rust and Scala 3 (the schema is in content/PRACTICE_LANGS.md).

This is a line-for-line port of web/langharness.js, which the browser uses for "Copy test program" and for running Python.
The runtimes (PRE_* blocks) are read from that file, so they exist once; tests/test_langs.py checks that both generators
produce the same text. Change both together.

  python3 tools/langharness.py two-sum go                 print the test program with the reference solution
  python3 tools/langharness.py two-sum rust --starter     ... with the starter code
  python3 tools/langharness.py two-sum cpp --code my.cpp  ... with your own code
  python3 tools/langharness.py two-sum python --out DIR   write it to DIR/<file> and print the command to run it
  [--problems FILE]  read the problem from another JSON list (a patch file is merged over problems.json by id)

As a module: program(problem, lang, code=None) -> str, prepare(problem) -> model (raises HarnessError on a bad sig or
tests), command(problem, lang), file_name(problem, lang), signature(problem, lang)."""
import json, math, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS_FILE = os.path.join(ROOT, "web", "langharness.js")
PROBLEMS = os.path.join(ROOT, "content", "practice", "problems.json")


class HarnessError(ValueError):
    pass


def fail(m):
    raise HarnessError(m)


def _load_pre():
    with open(JS_FILE, encoding="utf-8") as f:
        src = f.read()
    pre = {}
    for m in re.finditer(r"^const PRE_(\w+) = String\.raw`(.*?)`;$", src, re.S | re.M):
        body = m.group(2)
        pre[m.group(1)] = body[1:] if body.startswith("\n") else body
    need = {"python_head", "python_run", "go_head", "go_run", "cpp_head", "cpp_run", "rust_head", "rust_run", "scala_head", "scala_run"}
    if not need <= set(pre):
        raise RuntimeError("web/langharness.js: missing runtimes " + ", ".join(sorted(need - set(pre))))
    return pre


PRE = _load_pre()

LANGS = [dict(id="python", label="Python", ext="py", note="#"), dict(id="go", label="Go", ext="go", note="//"),
         dict(id="cpp", label="C++", ext="cpp", note="//"), dict(id="rust", label="Rust", ext="rs", note="//"),
         dict(id="scala", label="Scala", ext="scala", note="//")]
LANG = {l["id"]: l for l in LANGS}
GO_IMPORTS = ['"fmt"', '"math"', '"os"', '"reflect"', '"sort"', '"strconv"', '"strings"', '"time"']
RUST_KW = set("as async await break const continue crate dyn else enum extern false fn for gen if impl in let loop match mod move mut pub ref return self static struct super trait true try type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield".split(" "))

# ------------------------------------------------------------------ names
def camel(s):
    p = str(s).split("_")
    return p[0] + "".join(x[:1].upper() + x[1:] for x in p[1:])


def snake(s):
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", str(s))
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s).lower()


def cap(s):
    return str(s)[:1].upper() + str(s)[1:]


def rust_id(s):
    return "r#" + s if s in RUST_KW else s


def names(sig, lang):
    if sig.get("design"):
        m = {}
        for x in sig.get("methods") or []:
            n = x["name"]
            m[n] = snake(n) if lang == "python" else cap(n) if lang == "go" else rust_id(snake(n)) if lang == "rust" else n
        return {"cls": sig["design"], "ctor": "Constructor" if lang == "go" else "new" if lang == "rust" else sig["design"], "methods": m}
    return {"fn": sig["name"] if lang == "python" else rust_id(sig["name"]) if lang == "rust" else camel(sig["name"])}

# ------------------------------------------------------------------ types
BASE = ["int", "long", "float", "bool", "str", "tree", "linkedlist"]


def parse_type(s, ret=False):
    t = re.sub(r"\s+", "", str(s))
    if ret and t == "void":
        return "void"
    m = re.fullmatch(r"(list|optional)\[(.*)\]", t)
    if m:
        return (m.group(1), parse_type(m.group(2), False))
    if t in BASE:
        return t
    fail("unknown type " + json.dumps(str(s)) + " (use int, long, float, bool, str, list[T], optional[T], tree, linkedlist" + (", void" if ret else "") + ")")


def type_str(t):
    return t if isinstance(t, str) else t[0] + "[" + type_str(t[1]) + "]"


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def is_int(v):
    return is_num(v) and math.isfinite(v) and float(v).is_integer()


def check(v, t, where):
    def bad(what):
        fail(where + ": expected " + what + ", got " + json.dumps(v))
    if t == "void":
        if v is not None:
            bad("null (the method returns nothing)")
        return
    if isinstance(t, tuple) and t[0] == "optional":
        if v is not None:
            check(v, t[1], where)
        return
    if v is None:
        bad(type_str(t) + " (null is only allowed for optional[...] and inside tree)")
    if t == "int":
        if not is_int(v) or v < -2147483648 or v > 2147483647:
            bad("int (a whole number between -2^31 and 2^31-1; use long for bigger values)")
        return
    if t == "long":
        if not is_int(v) or abs(v) > 9007199254740991:
            bad("long (a whole number within +-2^53)")
        return
    if t == "float":
        if not is_num(v) or not math.isfinite(v):
            bad("float")
        return
    if t == "bool":
        if not isinstance(v, bool):
            bad("bool")
        return
    if t == "str":
        if not isinstance(v, str):
            bad("str")
        return
    if t == "tree":
        if not isinstance(v, list) or not all(x is None or (is_int(x) and abs(x) <= 2147483647) for x in v):
            bad("tree (a level-order list of int or null)")
        return
    if t == "linkedlist":
        if not isinstance(v, list) or not all(is_int(x) and abs(x) <= 2147483647 for x in v):
            bad("linkedlist (a list of int)")
        return
    if not isinstance(v, list):
        bad(type_str(t))
    for i, x in enumerate(v):
        check(x, t[1], where + "[" + str(i) + "]")


def canon_tree(a):
    if not a or a[0] is None:
        return []
    root = {"v": a[0], "l": None, "r": None}
    q, h, i = [root], 0, 1
    while h < len(q) and i < len(a):
        n = q[h]
        h += 1
        if i < len(a) and a[i] is not None:
            n["l"] = {"v": a[i], "l": None, "r": None}
            q.append(n["l"])
        i += 1
        if i < len(a) and a[i] is not None:
            n["r"] = {"v": a[i], "l": None, "r": None}
            q.append(n["r"])
        i += 1
    out, bq, k = [], [root], 0
    while k < len(bq):
        n = bq[k]
        k += 1
        if n is None:
            out.append(None)
        else:
            out.append(n["v"])
            bq.extend([n["l"], n["r"]])
    while out and out[-1] is None:
        out.pop()
    return out


def canon(v, t):
    if v is None or t == "void":
        return v
    if t == "tree":
        return canon_tree(v)
    if isinstance(t, tuple):
        return [canon(x, t[1]) for x in v] if t[0] == "list" else canon(v, t[1])
    return v


def prepare(p):
    sig = p.get("sig")
    if not isinstance(sig, dict):
        fail("missing sig")
    if not isinstance(p.get("tests"), list) or not p["tests"]:
        fail("no tests")
    tol = sig.get("tol", 1e-6)
    if not is_num(tol) or not tol >= 0:
        fail("sig.tol must be a number >= 0")
    M = {"id": str(p.get("id")), "title": str(p.get("title") or p.get("id")), "any_order": bool(p.get("order_insensitive")), "tol": tol, "design": bool(sig.get("design"))}

    def params(lst, where):
        if not isinstance(lst, list):
            fail(where + " must be a list of [name, type] pairs")
        out = []
        for i, x in enumerate(lst):
            if not isinstance(x, list) or len(x) != 2 or not isinstance(x[0], str) or not re.fullmatch(r"[a-z_][a-z0-9_]*", x[0]):
                fail(where + "[" + str(i) + '] must be ["snake_case_name", "type"]')
            out.append({"name": x[0], "t": parse_type(x[1], False)})
        return out

    if not M["design"]:
        if not isinstance(sig.get("name"), str) or not re.fullmatch(r"[a-z][a-z0-9_]*", sig["name"]):
            fail("sig.name must be a snake_case name such as two_sum")
        M["name"] = sig["name"]
        M["params"] = params(sig.get("params"), "sig.params")
        M["ret"] = parse_type(sig.get("returns", ""), True)
        M["inplace"] = sig.get("inplace")
        if M["inplace"] is not None and (not is_int(M["inplace"]) or isinstance(M["inplace"], float) or M["inplace"] < 0 or M["inplace"] >= len(M["params"])):
            fail("sig.inplace must be the index of a parameter")
        if M["inplace"] is not None and M["ret"] != "void":
            fail('sig.inplace needs "returns": "void"')
        if M["inplace"] is None and M["ret"] == "void":
            fail('"returns": "void" needs sig.inplace (the parameter the tests compare after the call)')
        rt = M["ret"] if M["inplace"] is None else M["params"][M["inplace"]]["t"]
        tests = []
        for k, t in enumerate(p["tests"]):
            w = "test " + str(k + 1)
            if not isinstance(t, dict) or not isinstance(t.get("args"), list) or len(t["args"]) != len(M["params"]):
                fail(w + ": args must be a list of " + str(len(M["params"])) + " values")
            for i, v in enumerate(t["args"]):
                check(v, M["params"][i]["t"], w + ", argument " + M["params"][i]["name"])
            check(t.get("expected"), rt, w + ", expected")
            tests.append({"args": t["args"], "exp": canon(t["expected"], rt), "show": ", ".join(show(v, M["params"][i]["t"]) for i, v in enumerate(t["args"]))})
        M["tests"] = tests
        M["exp_type"] = rt
    else:
        if not isinstance(sig["design"], str) or not re.fullmatch(r"[A-Z][A-Za-z0-9]*", sig["design"]):
            fail("sig.design must be the class name, such as LRUCache")
        M["cls"] = sig["design"]
        M["init"] = params(sig.get("init") or [], "sig.init")
        if not isinstance(sig.get("methods"), list) or not sig["methods"]:
            fail("sig.methods must list the methods")
        M["methods"] = {}
        for i, m in enumerate(sig["methods"]):
            if not isinstance(m, dict) or not isinstance(m.get("name"), str) or not re.fullmatch(r"[a-z][A-Za-z0-9]*", m["name"]):
                fail("sig.methods[" + str(i) + "].name must be the operation name as the tests spell it (camelCase)")
            if m["name"] in M["methods"]:
                fail("method " + m["name"] + " is listed twice")
            M["methods"][m["name"]] = {"name": m["name"], "params": params(m.get("params") or [], "method " + m["name"] + " params"), "ret": parse_type(m.get("returns", ""), True)}
        tests = []
        for k, t in enumerate(p["tests"]):
            w = "test " + str(k + 1)
            a = t.get("args") if isinstance(t, dict) else None
            if not isinstance(a, list) or len(a) != 2 or not isinstance(a[0], list) or not isinstance(a[1], list) or len(a[0]) != len(a[1]):
                fail(w + ": args must be [operations, arguments] of the same length")
            ops, vals = a
            if not ops or ops[0] != M["cls"]:
                fail(w + ": the first operation must be the constructor " + M["cls"])
            if not isinstance(t.get("expected"), list) or len(t["expected"]) != len(ops):
                fail(w + ": expected must have one value per operation")
            types = []
            for j, op in enumerate(ops):
                if j == 0:
                    types.append([x["t"] for x in M["init"]])
                    continue
                if op == M["cls"]:
                    fail(w + ": the constructor may only be the first operation")
                if op not in M["methods"]:
                    fail(w + ": unknown operation " + json.dumps(op) + " (add it to sig.methods)")
                types.append([x["t"] for x in M["methods"][op]["params"]])
            for j, op in enumerate(ops):
                if not isinstance(vals[j], list) or len(vals[j]) != len(types[j]):
                    fail(w + ", operation " + str(j + 1) + " (" + op + "): needs " + str(len(types[j])) + " argument(s)")
                for i, v in enumerate(vals[j]):
                    check(v, types[j][i], w + ", operation " + str(j + 1) + " (" + op + ") argument " + str(i + 1))
                check(t["expected"][j], "void" if j == 0 else M["methods"][op]["ret"], w + ", expected value of operation " + str(j + 1) + " (" + op + ")")
            rets = ["void" if j == 0 else M["methods"][op]["ret"] for j, op in enumerate(ops)]
            tests.append({"ops": ops, "vals": vals, "types": types, "rets": rets, "exp": [canon(v, rets[j]) for j, v in enumerate(t["expected"])],
                          "show": show(ops, ("list", "str")) + ", [" + ",".join("[" + ",".join(show(v, types[j][i]) for i, v in enumerate(x)) + "]" for j, x in enumerate(vals)) + "]"})
        M["tests"] = tests
    return M

# ------------------------------------------------------------------ literals
def fmt_int(v):
    return str(int(v))


def fmt_float(x):
    x = float(x)
    if x.is_integer() and abs(x) < 1e16:
        return "%d.0" % int(x)
    a = abs(x)
    if a >= 1e16 or a < 1e-4:
        m, e = repr(x).split("e")
        sign = "-" if e.startswith("-") else "+"
        return m + "e" + sign + (e.lstrip("+-").lstrip("0") or "0")
    return repr(x)


def str_lit(s, lang):
    o = '"'
    for ch in str(s):
        c = ord(ch)
        if ch == "\\":
            o += "\\\\"
        elif ch == '"':
            o += '\\"'
        elif ch == "\n":
            o += "\\n"
        elif ch == "\r":
            o += "\\r"
        elif ch == "\t":
            o += "\\t"
        elif c < 0x20 or c == 0x7f:
            o += ("\\%03o" % c) if lang == "cpp" else ("\\u%04x" % c) if lang == "scala" else ("\\x%02x" % c)
        else:
            o += ch
    return o + '"'


def jstr(s):
    o = '"'
    for ch in str(s):
        c = ord(ch)
        if ch == "\\":
            o += "\\\\"
        elif ch == '"':
            o += '\\"'
        elif ch == "\n":
            o += "\\n"
        elif ch == "\r":
            o += "\\r"
        elif ch == "\t":
            o += "\\t"
        elif c < 0x20:
            o += "\\u%04x" % c
        else:
            o += ch
    return o + '"'


def show(v, t):
    if v is None:
        return "null"
    if t in ("int", "long"):
        return fmt_int(v)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "true" if v else "false"
    if t == "str":
        return jstr(v)
    if t in ("tree", "linkedlist"):
        return "[" + ",".join("null" if x is None else fmt_int(x) for x in v) + "]"
    if t[0] == "optional":
        return show(v, t[1])
    return "[" + ",".join(show(x, t[1]) for x in v) + "]"


def py_lit(v, t):
    if v is None:
        return "None"
    if t in ("int", "long"):
        return fmt_int(v)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "True" if v else "False"
    if t == "str":
        return str_lit(v, "python")
    if t in ("tree", "linkedlist"):
        return "[" + ", ".join("None" if x is None else fmt_int(x) for x in v) + "]"
    if t[0] == "optional":
        return py_lit(v, t[1])
    return "[" + ", ".join(py_lit(x, t[1]) for x in v) + "]"


def py_meta(x):
    if x is None:
        return "None"
    if isinstance(x, str):
        return str_lit(x, "python")
    if isinstance(x, int):
        return fmt_int(x)
    if isinstance(x, list):
        return "[" + ", ".join(py_meta(y) for y in x) + "]"
    return "{" + ", ".join(str_lit(k, "python") + ": " + py_meta(v) for k, v in x.items()) + "}"


def go_ty(t):
    if t in ("int", "long"):
        return "int"
    return {"float": "float64", "bool": "bool", "str": "string", "tree": "*TreeNode", "linkedlist": "*ListNode"}.get(t) if isinstance(t, str) else ("[]" if t[0] == "list" else "*") + go_ty(t[1])


def go_lit(v, t):
    if isinstance(t, tuple) and t[0] == "optional":
        return "nil" if v is None else "dtsPtr[" + go_ty(t[1]) + "](" + go_lit(v, t[1]) + ")"
    if t in ("int", "long"):
        return fmt_int(v)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "true" if v else "false"
    if t == "str":
        return str_lit(v, "go")
    if t == "tree":
        return "dtsTree([]any{" + ", ".join("nil" if x is None else fmt_int(x) for x in v) + "})"
    if t == "linkedlist":
        return "dtsList([]int{" + ", ".join(fmt_int(x) for x in v) + "})"
    return go_ty(t) + "{" + ", ".join(go_lit(x, t[1]) for x in v) + "}"


def go_v(v, t):
    if v is None or t == "void":
        return "nil"
    if t in ("int", "long"):
        return fmt_int(v)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "true" if v else "false"
    if t == "str":
        return str_lit(v, "go")
    if t in ("tree", "linkedlist"):
        return "[]any{" + ", ".join("nil" if x is None else fmt_int(x) for x in v) + "}"
    if t[0] == "optional":
        return go_v(v, t[1])
    return "[]any{" + ", ".join(go_v(x, t[1]) for x in v) + "}"


def cpp_ty(t):
    if isinstance(t, str):
        return {"int": "int", "long": "long long", "float": "double", "bool": "bool", "str": "std::string", "tree": "TreeNode*", "linkedlist": "ListNode*"}[t]
    return ("std::vector<" if t[0] == "list" else "std::optional<") + cpp_ty(t[1]) + ">"


LLMIN = -9223372036854775808


def cpp_long(v):
    return "LLONG_MIN" if v == LLMIN else fmt_int(v) + "LL"


def cpp_lit(v, t):
    if isinstance(t, tuple) and t[0] == "optional":
        return cpp_ty(t) + "()" if v is None else cpp_ty(t) + "(" + cpp_lit(v, t[1]) + ")"
    if t == "int":
        return fmt_int(v)
    if t == "long":
        return cpp_long(v)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "true" if v else "false"
    if t == "str":
        return "std::string(" + str_lit(v, "cpp") + ")"
    if t == "tree":
        return "dts::mkTree(std::vector<long long>{" + ", ".join("dts::NUL" if x is None else fmt_int(x) for x in v) + "})"
    if t == "linkedlist":
        return "dts::mkList(std::vector<int>{" + ", ".join(fmt_int(x) for x in v) + "})"
    return cpp_ty(t) + "{" + ", ".join(cpp_lit(x, t[1]) for x in v) + "}"


def cpp_v(v, t):
    if v is None or t == "void":
        return "dts::N()"
    if t in ("int", "long"):
        return "dts::I(" + ("LLONG_MIN" if v == LLMIN else fmt_int(v)) + ")"
    if t == "float":
        return "dts::F(" + fmt_float(v) + ")"
    if t == "bool":
        return "dts::B(" + ("true" if v else "false") + ")"
    if t == "str":
        return "dts::S(" + str_lit(v, "cpp") + ")"
    if t in ("tree", "linkedlist"):
        return "dts::L({" + ", ".join("dts::N()" if x is None else "dts::I(" + fmt_int(x) + ")" for x in v) + "})"
    if t[0] == "optional":
        return cpp_v(v, t[1])
    return "dts::L({" + ", ".join(cpp_v(x, t[1]) for x in v) + "})"


def rs_ty(t):
    if isinstance(t, str):
        return {"int": "i32", "long": "i64", "float": "f64", "bool": "bool", "str": "String", "tree": "Option<Rc<RefCell<TreeNode>>>", "linkedlist": "Option<Box<ListNode>>"}[t]
    return ("Vec<" if t[0] == "list" else "Option<") + rs_ty(t[1]) + ">"


def rs_int(v, t):
    return "i32::MIN" if t == "int" and v == -2147483648 else "i64::MIN" if v == LLMIN else fmt_int(v)


def rs_lit(v, t):
    if isinstance(t, tuple) and t[0] == "optional":
        return "None" if v is None else "Some(" + rs_lit(v, t[1]) + ")"
    if t in ("int", "long"):
        return rs_int(v, t)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "true" if v else "false"
    if t == "str":
        return "String::from(" + str_lit(v, "rust") + ")"
    if t == "tree":
        return "dts::mk_tree(&[" + ", ".join("None" if x is None else "Some(" + rs_int(x, "int") + ")" for x in v) + "])"
    if t == "linkedlist":
        return "dts::mk_list(&[" + ", ".join(rs_int(x, "int") for x in v) + "])"
    return "vec![" + ", ".join(rs_lit(x, t[1]) for x in v) + "]"


def rs_v(v, t):
    if v is None or t == "void":
        return "dts::V::N"
    if t in ("int", "long"):
        return "dts::V::I(" + ("i64::MIN" if v == LLMIN else fmt_int(v)) + ")"
    if t == "float":
        return "dts::V::F(" + fmt_float(v) + ")"
    if t == "bool":
        return "dts::V::B(" + ("true" if v else "false") + ")"
    if t == "str":
        return "dts::V::S(String::from(" + str_lit(v, "rust") + "))"
    if t in ("tree", "linkedlist"):
        return "dts::V::L(vec![" + ", ".join("dts::V::N" if x is None else "dts::V::I(" + fmt_int(x) + ")" for x in v) + "])"
    if t[0] == "optional":
        return rs_v(v, t[1])
    return "dts::V::L(vec![" + ", ".join(rs_v(x, t[1]) for x in v) + "])"


def sc_ty(t):
    if isinstance(t, str):
        return {"int": "Int", "long": "Long", "float": "Double", "bool": "Boolean", "str": "String", "tree": "TreeNode", "linkedlist": "ListNode"}[t]
    return ("Array[" if t[0] == "list" else "Option[") + sc_ty(t[1]) + "]"


def sc_long(v):
    return "Long.MinValue" if v == LLMIN else fmt_int(v) + "L"


def sc_lit(v, t):
    if isinstance(t, tuple) and t[0] == "optional":
        return "None" if v is None else "Some(" + sc_lit(v, t[1]) + ")"
    if t == "int":
        return "Int.MinValue" if v == -2147483648 else fmt_int(v)
    if t == "long":
        return sc_long(v)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "true" if v else "false"
    if t == "str":
        return str_lit(v, "scala")
    if t == "tree":
        return "DtsHarness.mkTree(Vector[Any](" + ", ".join("null" if x is None else fmt_int(x) for x in v) + "))"
    if t == "linkedlist":
        return "DtsHarness.mkList(Vector[Int](" + ", ".join(fmt_int(x) for x in v) + "))"
    return sc_ty(t) + "(" + ", ".join(sc_lit(x, t[1]) for x in v) + ")"


def sc_v(v, t):
    if v is None or t == "void":
        return "null"
    if t in ("int", "long"):
        return sc_long(v)
    if t == "float":
        return fmt_float(v)
    if t == "bool":
        return "true" if v else "false"
    if t == "str":
        return str_lit(v, "scala")
    if t in ("tree", "linkedlist"):
        return "Vector[Any](" + ", ".join("null" if x is None else fmt_int(x) + "L" for x in v) + ")"
    if t[0] == "optional":
        return sc_v(v, t[1])
    return "Vector[Any](" + ", ".join(sc_v(x, t[1]) for x in v) + ")"

# ------------------------------------------------------------------ program text
def file_base(p):
    return str(p["id"]).replace("-", "_") + "_tests"


def file_name(p, lang):
    return file_base(p) + "." + LANG[lang]["ext"]


def command(p, lang, json_out=False):
    f, b, j = file_name(p, lang), file_base(p), " --json" if json_out else ""
    if lang == "python":
        return "python3 " + f + j
    if lang == "go":
        return "go run " + f + j
    if lang == "cpp":
        return "g++ -std=c++17 -O2 -o " + b + " " + f + " && ./" + b + j
    if lang == "rust":
        return "rustc -O --edition 2021 -o " + b + " " + f + " && ./" + b + j
    if lang == "scala":
        return "scala-cli run " + f + (" -- --json" if json_out else "")
    fail("unknown language " + str(lang))


def header(p, lang):
    c = LANG[lang]["note"]
    return (c + " Down the Stack practice: " + str(p.get("title") or p["id"]) + " (" + str(p["id"]) + "). Test program in " + LANG[lang]["label"] + ".\n" +
            c + " Your code is between the two ==== lines; the tests come after it.\n" +
            c + " Run: " + command(p, lang) + "    (add --json for a one-line JSON report)\n")


def user_start(c):
    return c + " ==== your code ====\n"


def user_end(c):
    return c + " ==== tests (generated from the problem: edit your code above, not below) ====\n"


def with_nl(s):
    s = re.sub(r"\r\n?", "\n", "" if s is None else str(s))
    return s if s.endswith("\n") else s + "\n"


def count_lines(s):
    return s.count("\n")


def js_bool(b):
    return "true" if b else "false"


def go_split(code):
    out, imps, block = [], [], False
    for ln in code.split("\n"):
        if block:
            if re.fullmatch(r"\s*\)\s*", ln, re.A):
                block = False
            else:
                s = re.sub(r"//.*$", "", ln).strip()
                if s:
                    imps.append(re.sub(r"\s+", " ", s, flags=re.A))
            out.append("")
            continue
        if re.fullmatch(r"\s*package\s+\w+\s*(//.*)?", ln, re.A):
            out.append("")
            continue
        if re.fullmatch(r"\s*import\s*\(\s*(//.*)?", ln, re.A):
            block = True
            out.append("")
            continue
        m = re.fullmatch(r'\s*import\s+((?:[\w.]+\s+)?"[^"]+")\s*(//.*)?', ln, re.A)
        if m:
            imps.append(re.sub(r"\s+", " ", m.group(1), flags=re.A))
            out.append("")
            continue
        out.append(ln)
    uniq = []
    for s in imps:
        if s not in GO_IMPORTS and s not in uniq:
            uniq.append(s)
    return {"body": "\n".join(out), "imports": uniq}


def py_program(p, M, code):
    head = header(p, "python") + PRE["python_head"] + user_start("#")
    first = count_lines(head) + 1
    last = first + count_lines(code) - 1
    L = ["DTS_TITLE = " + str_lit(M["title"], "python"), "DTS_USER_LINES = [" + str(first) + ", " + str(max(first, last)) + "]",
         "DTS_DESIGN = " + ("True" if M["design"] else "False")]
    if not M["design"]:
        n = M["name"]
        L.append("DTS_NAMES = " + py_meta([n] if n == camel(n) else [n, camel(n)]))
        L.append("DTS_PARAMS = " + py_meta([type_str(x["t"]) for x in M["params"]]))
        L.append("DTS_RETURNS = " + py_meta(type_str(M["ret"])))
        L.append("DTS_INPLACE = " + ("None" if M["inplace"] is None else fmt_int(M["inplace"])))
        L += ["DTS_CLASS = None", "DTS_INIT = []", "DTS_METHODS = {}"]
    else:
        L += ["DTS_NAMES = []", "DTS_PARAMS = []", 'DTS_RETURNS = "void"', "DTS_INPLACE = None"]
        L.append("DTS_CLASS = " + str_lit(M["cls"], "python"))
        L.append("DTS_INIT = " + py_meta([type_str(x["t"]) for x in M["init"]]))
        meth = {}
        for k, m in M["methods"].items():
            s = snake(k)
            meth[k] = [[k] if s == k else [s, k], [type_str(x["t"]) for x in m["params"]], type_str(m["ret"])]
        L.append("DTS_METHODS = " + py_meta(meth))
    L.append("DTS_ORDER_INSENSITIVE = " + ("True" if M["any_order"] else "False"))
    L.append("DTS_TOL = " + fmt_float(M["tol"]))
    L.append("DTS_TESTS = [")
    for t in M["tests"]:
        if not M["design"]:
            L.append("    ([" + ", ".join(py_lit(v, M["params"][i]["t"]) for i, v in enumerate(t["args"])) + "], " + py_lit(t["exp"], M["exp_type"]) + "),")
        else:
            L.append("    ([" + py_lit(t["ops"], ("list", "str")) + ", [" + ", ".join("[" + ", ".join(py_lit(v, t["types"][j][i]) for i, v in enumerate(a)) + "]" for j, a in enumerate(t["vals"])) + "]], [" +
                     ", ".join(py_lit(v, t["rets"][j]) for j, v in enumerate(t["exp"])) + "]),")
    L.append("]")
    return head + code + user_end("#") + "\n".join(L) + "\n\n" + PRE["python_run"] + "dts_main()\n"


def go_program(p, M, code):
    sp, nm = go_split(code), names(p["sig"], "go")
    head = header(p, "go") + PRE["go_head"].replace("//DTS-IMPORTS\n", "".join("\t" + s + "\n" for s in sp["imports"]), 1)

    def call(fn, args):
        return fn + "(" + ", ".join(args) + ")"

    def decl(n, v, t):
        return "var " + n + " " + go_ty(t) + " = " + go_lit(v, t)
    T = []
    for t in M["tests"]:
        b = []
        if not M["design"]:
            for i, v in enumerate(t["args"]):
                b.append("\t\t" + decl("a" + str(i), v, M["params"][i]["t"]))
            c = call(nm["fn"], ["a" + str(i) for i in range(len(t["args"]))])
            if M["inplace"] is None:
                b.append("\t\treturn dtsToV(" + c + ")")
            else:
                b += ["\t\t" + c, "\t\treturn dtsToV(a" + str(M["inplace"]) + ")"]
        else:
            b.append("\t\tout := []any{}")
            for i, v in enumerate(t["vals"][0]):
                b.append("\t\t" + decl("c" + str(i), v, t["types"][0][i]))
            b += ["\t\tobj := " + call(nm["ctor"], ["c" + str(i) for i in range(len(t["vals"][0]))]), "\t\t_ = obj", "\t\tout = append(out, nil)"]
            for j, op in enumerate(t["ops"]):
                if not j:
                    continue
                ds = "".join(decl("a" + str(i), v, t["types"][j][i]) + "; " for i, v in enumerate(t["vals"][j]))
                c = call("obj." + nm["methods"][op], ["a" + str(i) for i in range(len(t["vals"][j]))])
                b.append("\t\t{ " + ds + (c + "; out = append(out, nil)" if t["rets"][j] == "void" else "out = append(out, dtsToV(" + c + "))") + " }")
            b.append("\t\treturn out")
        exp = "[]any{" + ", ".join(go_v(v, t["rets"][j]) for j, v in enumerate(t["exp"])) + "}" if M["design"] else go_v(t["exp"], M["exp_type"])
        T.append("\t{" + str_lit(t["show"], "go") + ", " + exp + ", func() any {\n" + "\n".join(b) + "\n\t}},\n")
    return (head + user_start("//") + sp["body"] + user_end("//") + PRE["go_run"] + "var dtsTests = []dtsTest{\n" + "".join(T) + "}\n\nfunc main() {\n\tdtsMain(" +
            str_lit(M["title"], "go") + ", " + js_bool(M["any_order"]) + ", " + fmt_float(M["tol"]) + ", dtsTests)\n}\n")


def cpp_program(p, M, code):
    nm = names(p["sig"], "cpp")

    def decl(n, v, t):
        return "auto " + n + " = " + cpp_lit(v, t) + ";"
    T = []
    for t in M["tests"]:
        b = []
        if not M["design"]:
            for i, v in enumerate(t["args"]):
                b.append("            " + decl("a" + str(i), v, M["params"][i]["t"]))
            b.append("            Solution* dtsSol = new Solution();")
            c = "dtsSol->" + nm["fn"] + "(" + ", ".join("a" + str(i) for i in range(len(t["args"]))) + ")"
            if M["inplace"] is None:
                b.append("            return dts::toV(" + c + ");")
            else:
                b += ["            " + c + ";", "            return dts::toV(a" + str(M["inplace"]) + ");"]
        else:
            b.append("            std::vector<dts::V> out;")
            for i, v in enumerate(t["vals"][0]):
                b.append("            " + decl("c" + str(i), v, t["types"][0][i]))
            b += ["            auto* obj = new " + M["cls"] + "(" + ", ".join("c" + str(i) for i in range(len(t["vals"][0]))) + ");", "            out.push_back(dts::N());"]
            for j, op in enumerate(t["ops"]):
                if not j:
                    continue
                ds = "".join(decl("a" + str(i), v, t["types"][j][i]) + " " for i, v in enumerate(t["vals"][j]))
                c = "obj->" + nm["methods"][op] + "(" + ", ".join("a" + str(i) for i in range(len(t["vals"][j]))) + ")"
                b.append("            { " + ds + (c + "; out.push_back(dts::N());" if t["rets"][j] == "void" else "out.push_back(dts::toV(" + c + "));") + " }")
            b.append("            return dts::L(out);")
        exp = "dts::L({" + ", ".join(cpp_v(v, t["rets"][j]) for j, v in enumerate(t["exp"])) + "})" if M["design"] else cpp_v(t["exp"], M["exp_type"])
        T.append("        {" + str_lit(t["show"], "cpp") + ", " + exp + ", []() -> dts::V {\n" + "\n".join(b) + "\n        }},\n")
    return (header(p, "cpp") + PRE["cpp_head"] + user_start("//") + code + user_end("//") + PRE["cpp_run"] + "static std::vector<dts::Test> dtsTests() {\n    return {\n" + "".join(T) +
            "    };\n}\n\nint main(int argc, char** argv) {\n    return dts::runAll(argc, argv, " + str_lit(M["title"], "cpp") + ", " + js_bool(M["any_order"]) + ", " + fmt_float(M["tol"]) + ", dtsTests());\n}\n")


def rust_program(p, M, code):
    nm = names(p["sig"], "rust")

    def decl(n, v, t):
        return "let mut " + n + ": " + rs_ty(t) + " = " + rs_lit(v, t) + ";"

    def conv(e, t):
        return "dts::tree_v(&" + e + ")" if t == "tree" else "dts::list_v(&" + e + ")" if t == "linkedlist" else "dts::ToV::to_v(&" + e + ")"
    T = []
    for t in M["tests"]:
        b = []
        if not M["design"]:
            for i, v in enumerate(t["args"]):
                b.append("            " + decl("a" + str(i), v, M["params"][i]["t"]))
            c = "Solution::" + nm["fn"] + "(" + ", ".join(("&mut a" if i == M["inplace"] else "a") + str(i) for i in range(len(t["args"]))) + ")"
            if M["inplace"] is None:
                b.append("            " + conv(c, M["ret"]))
            else:
                b += ["            " + c + ";", "            " + conv("a" + str(M["inplace"]), M["params"][M["inplace"]]["t"])]
        else:
            b.append("            let mut out: Vec<dts::V> = Vec::new();")
            for i, v in enumerate(t["vals"][0]):
                b.append("            " + decl("c" + str(i), v, t["types"][0][i]))
            b += ["            let mut obj = " + M["cls"] + "::new(" + ", ".join("c" + str(i) for i in range(len(t["vals"][0]))) + ");", "            out.push(dts::V::N);"]
            for j, op in enumerate(t["ops"]):
                if not j:
                    continue
                ds = "".join(decl("a" + str(i), v, t["types"][j][i]) + " " for i, v in enumerate(t["vals"][j]))
                c = "obj." + nm["methods"][op] + "(" + ", ".join("a" + str(i) for i in range(len(t["vals"][j]))) + ")"
                b.append("            { " + ds + (c + "; out.push(dts::V::N);" if t["rets"][j] == "void" else "out.push(" + conv(c, t["rets"][j]) + ");") + " }")
            b.append("            dts::V::L(out)")
        exp = "dts::V::L(vec![" + ", ".join(rs_v(v, t["rets"][j]) for j, v in enumerate(t["exp"])) + "])" if M["design"] else rs_v(t["exp"], M["exp_type"])
        T.append("        dts::Test { input: " + str_lit(t["show"], "rust") + ", exp: " + exp + ", run: Box::new(|| {\n" + "\n".join(b) + "\n        }) },\n")
    return (header(p, "rust") + PRE["rust_head"] + user_start("//") + code + user_end("//") + PRE["rust_run"] + "fn dts_tests() -> Vec<dts::Test> {\n    vec![\n" + "".join(T) +
            "    ]\n}\n\nfn main() {\n    let worker = std::thread::Builder::new().stack_size(256 << 20).spawn(|| dts::run_all(" + str_lit(M["title"], "rust") + ", " + js_bool(M["any_order"]) + ", " +
            fmt_float(M["tol"]) + ", dts_tests())).unwrap();\n    if worker.join().is_err() {\n        std::process::exit(2);\n    }\n}\n")


def scala_program(p, M, code):
    nm = names(p["sig"], "scala")

    def decl(n, v, t):
        return "val " + n + ": " + sc_ty(t) + " = " + sc_lit(v, t)

    def conv(e, t):
        return "DtsHarness.treeV(" + e + ")" if t == "tree" else "DtsHarness.listV(" + e + ")" if t == "linkedlist" else "DtsHarness.toV(" + e + ")"
    T = []
    for t in M["tests"]:
        b = []
        if not M["design"]:
            for i, v in enumerate(t["args"]):
                b.append("      " + decl("a" + str(i), v, M["params"][i]["t"]))
            c = "Solution." + nm["fn"] + "(" + ", ".join("a" + str(i) for i in range(len(t["args"]))) + ")"
            if M["inplace"] is None:
                b.append("      " + conv(c, M["ret"]))
            else:
                b += ["      " + c, "      " + conv("a" + str(M["inplace"]), M["params"][M["inplace"]]["t"])]
        else:
            b.append("      val out = scala.collection.mutable.ArrayBuffer[Any]()")
            for i, v in enumerate(t["vals"][0]):
                b.append("      " + decl("c" + str(i), v, t["types"][0][i]))
            b += ["      val obj = new " + M["cls"] + "(" + ", ".join("c" + str(i) for i in range(len(t["vals"][0]))) + ")", "      out += null"]
            for j, op in enumerate(t["ops"]):
                if not j:
                    continue
                ds = "".join(decl("a" + str(i), v, t["types"][j][i]) + "; " for i, v in enumerate(t["vals"][j]))
                c = "obj." + nm["methods"][op] + "(" + ", ".join("a" + str(i) for i in range(len(t["vals"][j]))) + ")"
                b.append("      locally { " + ds + (c + "; out += null" if t["rets"][j] == "void" else "out += " + conv(c, t["rets"][j])) + " }")
            b.append("      out.toVector")
        exp = "Vector[Any](" + ", ".join(sc_v(v, t["rets"][j]) for j, v in enumerate(t["exp"])) + ")" if M["design"] else sc_v(t["exp"], M["exp_type"])
        T.append("    DtsHarness.Test(" + str_lit(t["show"], "scala") + ", " + exp + ", () => {\n" + "\n".join(b) + "\n    })")
    return (header(p, "scala") + PRE["scala_head"] + user_start("//") + code + user_end("//") + PRE["scala_run"] + "object DtsTests {\n  def all: Vector[DtsHarness.Test] = Vector(\n" + ",\n".join(T) +
            "\n  )\n\n  def main(args: Array[String]): Unit = DtsHarness.runAll(" + str_lit(M["title"], "scala") + ", " + js_bool(M["any_order"]) + ", " + fmt_float(M["tol"]) + ", all, args)\n}\n")


GEN = {"python": py_program, "go": go_program, "cpp": cpp_program, "rust": rust_program, "scala": scala_program}


def program(p, lang, code=None):
    """The whole test program: runtime + code + tests. code defaults to the problem's reference solution in that language."""
    if lang not in GEN:
        fail("unknown language " + str(lang))
    M = prepare(p)
    if code is None:
        code = ((p.get("langs") or {}).get(lang) or {}).get("solution")
    return GEN[lang](p, M, with_nl(code))


def py_hint(t):
    if t in ("int", "long"):
        return "int"
    if t == "tree":
        return "Optional[TreeNode]"
    if t == "linkedlist":
        return "Optional[ListNode]"
    if t == "void":
        return "None"
    if isinstance(t, str):
        return t
    return ("list[" if t[0] == "list" else "Optional[") + py_hint(t[1]) + "]"


def signature(p, lang):
    """A short signature line: Python hints for python, the sig's own type names otherwise."""
    sig, nm = p["sig"], names(p["sig"], lang)

    def ty(t):
        return py_hint(t) if lang == "python" else type_str(t)

    def ps(lst):
        return ", ".join(x[0] + ": " + ty(parse_type(x[1])) for x in (lst or []))
    if not sig.get("design"):
        return nm["fn"] + "(" + ps(sig["params"]) + ") -> " + ty(parse_type(sig["returns"], True))
    return "class " + sig["design"] + ": " + ", ".join([nm["ctor"] + "(" + ps(sig.get("init")) + ")"] + [nm["methods"][m["name"]] + "(" + ps(m.get("params")) + ") -> " + ty(parse_type(m["returns"], True)) for m in sig["methods"]])


def load_problems(path=None):
    """problems.json, with a patch file (a list of {id, sig, langs}) merged over it by id when path is a patch."""
    with open(PROBLEMS, encoding="utf-8") as f:
        base = json.load(f)
    if not path or os.path.abspath(path) == os.path.abspath(PROBLEMS):
        return base
    with open(path, encoding="utf-8") as f:
        extra = json.load(f)
    by = {p["id"]: p for p in base}
    out = []
    for e in extra:
        p = dict(by.get(e.get("id"), {}))
        p.update(e)
        out.append(p)
    return out


def main(argv):
    args = list(argv)
    def opt(name):
        if name in args:
            i = args.index(name)
            v = args[i + 1]
            del args[i:i + 2]
            return v
        return None
    problems, code_file, out = opt("--problems"), opt("--code"), opt("--out")
    starter = "--starter" in args
    args = [a for a in args if a not in ("--starter", "--solution")]
    if len(args) != 2 or args[1] not in GEN:
        print(__doc__)
        return 2
    pid, lang = args
    p = next((x for x in load_problems(problems) if x.get("id") == pid), None)
    if not p:
        print("no problem " + pid, file=sys.stderr)
        return 1
    code = open(code_file, encoding="utf-8").read() if code_file else ((p.get("langs") or {}).get(lang) or {}).get("starter" if starter else "solution")
    if code is None:
        print(pid + " has no " + lang + " code yet", file=sys.stderr)
        return 1
    try:
        text = program(p, lang, code)
    except HarnessError as e:
        print(pid + ": " + str(e), file=sys.stderr)
        return 1
    if out:
        os.makedirs(out, exist_ok=True)
        f = os.path.join(out, file_name(p, lang))
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(text)
        print("wrote " + f + "\nrun:  cd " + out + " && " + command(p, lang))
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
