/* Down the Stack — test programs for practice problems in Python, Go, C++17, Rust and Scala 3.
   From a problem's typed signature (p.sig) and its tests, program(p, lang, code) builds one runnable file: a small runtime,
   the learner's code, every test as a typed literal, and a main that converts trees and lists, calls the function, compares
   (in any order / with a float tolerance when the problem says so) and prints a plain report, or one JSON line with --json.
   tools/langharness.py is a line-for-line Python port: it reads the PRE_* runtimes below from this file, and
   tests/test_langs.py checks that both produce the same text. Keep the two in step.
   The schema is in content/PRACTICE_LANGS.md. In the browser this is window.DTSHarness; in node, require() it. */
(function(root){
"use strict";

/* ------------------------------------------------------------------ runtimes (static text; no backticks or dollar-brace inside) */
const PRE_python_head = String.raw`
import sys, io, json, math, time
from typing import *


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

`;

const PRE_python_run = String.raw`
import sys as _dts_sys, io as _dts_io, json as _dts_jsonmod, math as _dts_math, time as _dts_time
import contextlib as _dts_ctx, traceback as _dts_tb


class _DtsSetupError(Exception):
    pass


def _dts_type(t):
    t = t.replace(" ", "")
    for k in ("list", "optional"):
        if t.startswith(k + "[") and t.endswith("]"):
            return (k, _dts_type(t[len(k) + 1:-1]))
    return t


_DTS_LIMIT = 1000000


def _dts_tree_in(a):
    if not a or a[0] is None:
        return None
    root = TreeNode(a[0])
    q, h, i = [root], 0, 1
    while h < len(q) and i < len(a):
        n = q[h]
        h += 1
        if i < len(a) and a[i] is not None:
            n.left = TreeNode(a[i])
            q.append(n.left)
        i += 1
        if i < len(a) and a[i] is not None:
            n.right = TreeNode(a[i])
            q.append(n.right)
        i += 1
    return root


def _dts_list_in(a):
    head = None
    for v in reversed(a):
        head = ListNode(v, head)
    return head


def _dts_in(v, t):
    if t == "tree":
        return _dts_tree_in(v)
    if t == "linkedlist":
        return _dts_list_in(v)
    if isinstance(t, tuple) and v is not None:
        if t[0] == "list":
            return [_dts_in(x, t[1]) for x in v]
        return _dts_in(v, t[1])
    return v


def _dts_tree_out(root):
    out, q, h = [], [root], 0
    while h < len(q):
        if len(q) > _DTS_LIMIT:
            raise ValueError("the tree has a cycle or more than 10^6 nodes")
        n = q[h]
        h += 1
        if n is None:
            out.append(None)
        else:
            out.append(_dts_plain(n.val))
            q.append(n.left)
            q.append(n.right)
    while out and out[-1] is None:
        out.pop()
    return out


def _dts_list_out(h):
    out = []
    while h is not None:
        if len(out) >= _DTS_LIMIT:
            raise ValueError("the list has a cycle or more than 10^6 nodes")
        out.append(_dts_plain(h.val))
        h = h.next
    return out


def _dts_plain(v):
    if isinstance(v, TreeNode):
        return _dts_tree_out(v)
    if isinstance(v, ListNode):
        return _dts_list_out(v)
    if isinstance(v, (list, tuple, set, frozenset)):
        return [_dts_plain(x) for x in v]
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    return repr(v)


def _dts_out(v, t):
    if t in ("tree", "linkedlist"):
        return [] if v is None else _dts_plain(v)
    if isinstance(t, tuple):
        if v is None:
            return None
        if t[0] == "list" and isinstance(v, (list, tuple)):
            return [_dts_out(x, t[1]) for x in v]
        if t[0] == "optional":
            return _dts_out(v, t[1])
    return _dts_plain(v)


def _dts_json(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if _dts_math.isnan(v) or _dts_math.isinf(v):
            return _dts_jsonmod.dumps(str(v))
        return repr(v)
    if isinstance(v, str):
        return _dts_jsonmod.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ",".join(_dts_json(x) for x in v) + "]"
    return _dts_jsonmod.dumps(str(v))


def _dts_eq(a, b, tol):
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if isinstance(a, int) and isinstance(b, int):
            return a == b
        if a == b:
            return True
        return abs(a - b) <= tol * max(1.0, abs(a), abs(b))
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_dts_eq(x, y, tol) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def _dts_norm(v):
    if not isinstance(v, list):
        return v
    items = [sorted(x, key=_dts_json) if isinstance(x, list) else x for x in v]
    return sorted(items, key=_dts_json)


def _dts_err(e):
    s = str(e)
    msg = type(e).__name__ + (": " + s if s else "")
    fn = dts_main.__code__.co_filename
    line = None
    for fr in _dts_tb.extract_tb(e.__traceback__):
        if fr.filename == fn and DTS_USER_LINES[0] <= fr.lineno <= DTS_USER_LINES[1]:
            line = fr.lineno - DTS_USER_LINES[0] + 1
    if line is not None:
        msg += " (line %d of your code)" % line
    return msg


def _dts_find_fn():
    g = globals()
    S = g.get("Solution")
    if isinstance(S, type):
        for c in DTS_NAMES:
            if callable(getattr(S, c, None)):
                return getattr(S(), c)
    for c in DTS_NAMES:
        if callable(g.get(c)):
            return g[c]
    raise _DtsSetupError("Define a function named " + DTS_NAMES[0] + " (or a class Solution with that method).")


def _dts_args(vals, types):
    return [_dts_in(v, _dts_type(t)) for v, t in zip(vals, types)]


def _dts_run_fn(args):
    f = _dts_find_fn()
    conv = _dts_args(args, DTS_PARAMS)
    res = f(*conv)
    if DTS_INPLACE is not None:
        return _dts_out(conv[DTS_INPLACE], _dts_type(DTS_PARAMS[DTS_INPLACE]))
    return _dts_out(res, _dts_type(DTS_RETURNS))


def _dts_run_design(args):
    ops, vals = args
    cls = globals().get(DTS_CLASS)
    if not isinstance(cls, type):
        raise _DtsSetupError("Define a class named " + DTS_CLASS + ".")
    out, obj = [], None
    for op, a in zip(ops, vals):
        if op == DTS_CLASS:
            obj = cls(*_dts_args(a, DTS_INIT))
            out.append(None)
            continue
        names, types, ret = DTS_METHODS[op]
        m = None
        for c in names:
            m = getattr(obj, c, None)
            if callable(m):
                break
        if not callable(m):
            raise _DtsSetupError("Define the method " + names[0] + " in class " + DTS_CLASS + ".")
        r = m(*_dts_args(a, types))
        out.append(None if ret == "void" else _dts_out(r, _dts_type(ret)))
    return out


def _dts_show(args):
    return ", ".join(_dts_json(a) for a in args)


def dts_main():
    as_json = "--json" in _dts_sys.argv[1:]
    if _dts_sys.platform != "emscripten":
        _dts_sys.setrecursionlimit(max(_dts_sys.getrecursionlimit(), 10000))
    res, top = [], None
    for args, exp in DTS_TESTS:
        r = {"ok": False}
        buf = _dts_io.StringIO()
        t0 = _dts_time.perf_counter()
        try:
            with _dts_ctx.redirect_stdout(buf):
                got = _dts_run_design(args) if DTS_DESIGN else _dts_run_fn(args)
            r["ms"] = round((_dts_time.perf_counter() - t0) * 1000, 3)
            a, b = (_dts_norm(got), _dts_norm(exp)) if DTS_ORDER_INSENSITIVE else (got, exp)
            r["ok"] = _dts_eq(a, b, DTS_TOL)
            r["got"] = _dts_json(got)
        except _DtsSetupError as e:
            top = str(e)
            break
        except Exception as e:
            r["ms"] = round((_dts_time.perf_counter() - t0) * 1000, 3)
            r["error"] = _dts_err(e)
        logs = buf.getvalue().splitlines()
        if logs:
            r["logs"] = logs[:50]
        res.append(r)
    npass = sum(1 for r in res if r["ok"])
    total = len(DTS_TESTS)
    if as_json:
        print("DTS-RESULT " + _dts_jsonmod.dumps({"lang": "python", "pass": npass, "total": total, "results": res, "error": top}))
    else:
        print(DTS_TITLE + " (Python): " + str(npass) + " of " + str(total) + " tests pass")
        if top:
            print("Error: " + top)
        for i, r in enumerate(res):
            args, exp = DTS_TESTS[i]
            if r["ok"]:
                print("  test %d  ok    %.3f ms" % (i + 1, r["ms"]))
                continue
            print("  test %d  FAIL" % (i + 1))
            print("      input:    " + _dts_show(args))
            print("      expected: " + _dts_json(exp) + ("  (any order)" if DTS_ORDER_INSENSITIVE else ""))
            print("      got:      " + (("error: " + r["error"]) if "error" in r else r["got"]))
            for line in r.get("logs", [])[:10]:
                print("      printed:  " + line)
    if npass != total and not as_json:
        _dts_sys.exit(1)

`;

const PRE_go_head = String.raw`
package main

import (
	"fmt"
	"math"
	"os"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
//DTS-IMPORTS
)

type TreeNode struct {
	Val   int
	Left  *TreeNode
	Right *TreeNode
}

type ListNode struct {
	Val  int
	Next *ListNode
}

`;

const PRE_go_run = String.raw`
type dtsTest struct {
	in  string
	exp any
	run func() any
}

type dtsResult struct {
	ok  bool
	got any
	err string
	ms  float64
}

func dtsPtr[T any](v T) *T { return &v }

func dtsTree(a []any) *TreeNode {
	if len(a) == 0 || a[0] == nil {
		return nil
	}
	root := &TreeNode{Val: a[0].(int)}
	q := []*TreeNode{root}
	i := 1
	for h := 0; h < len(q) && i < len(a); h++ {
		n := q[h]
		if i < len(a) && a[i] != nil {
			n.Left = &TreeNode{Val: a[i].(int)}
			q = append(q, n.Left)
		}
		i++
		if i < len(a) && a[i] != nil {
			n.Right = &TreeNode{Val: a[i].(int)}
			q = append(q, n.Right)
		}
		i++
	}
	return root
}

func dtsList(a []int) *ListNode {
	var head *ListNode
	for i := len(a) - 1; i >= 0; i-- {
		head = &ListNode{Val: a[i], Next: head}
	}
	return head
}

const dtsLimit = 1000000

func dtsTreeV(root *TreeNode) any {
	out := []any{}
	q := []*TreeNode{root}
	for h := 0; h < len(q); h++ {
		if len(q) > dtsLimit {
			panic("the tree has a cycle or more than 10^6 nodes")
		}
		n := q[h]
		if n == nil {
			out = append(out, nil)
		} else {
			out = append(out, int64(n.Val))
			q = append(q, n.Left, n.Right)
		}
	}
	for len(out) > 0 && out[len(out)-1] == nil {
		out = out[:len(out)-1]
	}
	return out
}

func dtsListV(h *ListNode) any {
	out := []any{}
	for ; h != nil; h = h.Next {
		if len(out) >= dtsLimit {
			panic("the list has a cycle or more than 10^6 nodes")
		}
		out = append(out, int64(h.Val))
	}
	return out
}

func dtsToV(x any) any {
	switch v := x.(type) {
	case nil:
		return nil
	case *TreeNode:
		return dtsTreeV(v)
	case *ListNode:
		return dtsListV(v)
	case bool:
		return v
	case string:
		return v
	case byte:
		return string(rune(v))
	}
	rv := reflect.ValueOf(x)
	switch rv.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return rv.Int()
	case reflect.Uint, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return int64(rv.Uint())
	case reflect.Float32, reflect.Float64:
		return rv.Float()
	case reflect.String:
		return rv.String()
	case reflect.Bool:
		return rv.Bool()
	case reflect.Slice, reflect.Array:
		out := make([]any, rv.Len())
		for i := range out {
			out[i] = dtsToV(rv.Index(i).Interface())
		}
		return out
	case reflect.Ptr:
		if rv.IsNil() {
			return nil
		}
		return dtsToV(rv.Elem().Interface())
	}
	return fmt.Sprint(x)
}

func dtsNum(x any) (float64, int64, bool, bool) {
	switch v := x.(type) {
	case int:
		return float64(v), int64(v), false, true
	case int64:
		return float64(v), v, false, true
	case float64:
		return v, 0, true, true
	}
	return 0, 0, false, false
}

func dtsEq(a, b any, tol float64) bool {
	af, ai, aF, aok := dtsNum(a)
	bf, bi, bF, bok := dtsNum(b)
	if aok || bok {
		if !(aok && bok) {
			return false
		}
		if !aF && !bF {
			return ai == bi
		}
		if af == bf {
			return true
		}
		return math.Abs(af-bf) <= tol*math.Max(1, math.Max(math.Abs(af), math.Abs(bf)))
	}
	switch x := a.(type) {
	case nil:
		return b == nil
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !dtsEq(x[i], y[i], tol) {
				return false
			}
		}
		return true
	}
	return false
}

func dtsQuote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString("\\\"")
		case '\\':
			b.WriteString("\\\\")
		case '\n':
			b.WriteString("\\n")
		case '\r':
			b.WriteString("\\r")
		case '\t':
			b.WriteString("\\t")
		default:
			if r < 0x20 {
				b.WriteString(fmt.Sprintf("\\u%04x", r))
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

func dtsJSON(x any) string {
	switch v := x.(type) {
	case nil:
		return "null"
	case bool:
		if v {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return dtsQuote(fmt.Sprint(v))
		}
		return strconv.FormatFloat(v, 'g', -1, 64)
	case string:
		return dtsQuote(v)
	case []any:
		parts := make([]string, len(v))
		for i, e := range v {
			parts[i] = dtsJSON(e)
		}
		return "[" + strings.Join(parts, ",") + "]"
	}
	return dtsQuote(fmt.Sprint(x))
}

func dtsSortByJSON(a []any) []any {
	c := append([]any(nil), a...)
	sort.SliceStable(c, func(i, j int) bool { return dtsJSON(c[i]) < dtsJSON(c[j]) })
	return c
}

func dtsNorm(x any) any {
	l, ok := x.([]any)
	if !ok {
		return x
	}
	out := make([]any, len(l))
	for i, e := range l {
		if il, ok := e.([]any); ok {
			out[i] = dtsSortByJSON(il)
		} else {
			out[i] = e
		}
	}
	return dtsSortByJSON(out)
}

func dtsRun(t dtsTest) (r dtsResult) {
	t0 := time.Now()
	defer func() {
		if e := recover(); e != nil {
			r.err = "panic: " + fmt.Sprint(e)
		}
		r.ms = float64(time.Since(t0).Microseconds()) / 1000
	}()
	r.got = t.run()
	return
}

func dtsMain(title string, anyOrder bool, tol float64, tests []dtsTest) {
	asJSON := false
	for _, a := range os.Args[1:] {
		if a == "--json" || a == "-json" {
			asJSON = true
		}
	}
	res := make([]dtsResult, len(tests))
	pass := 0
	for i, t := range tests {
		r := dtsRun(t)
		if r.err == "" {
			a, b := r.got, t.exp
			if anyOrder {
				a, b = dtsNorm(a), dtsNorm(b)
			}
			r.ok = dtsEq(a, b, tol)
		}
		if r.ok {
			pass++
		}
		res[i] = r
	}
	if asJSON {
		parts := make([]string, len(res))
		for i, r := range res {
			s := "{\"ok\":" + dtsJSON(r.ok) + ",\"ms\":" + strconv.FormatFloat(r.ms, 'f', 3, 64)
			if r.err != "" {
				s += ",\"error\":" + dtsQuote(r.err)
			} else {
				s += ",\"got\":" + dtsQuote(dtsJSON(r.got))
			}
			parts[i] = s + "}"
		}
		fmt.Println("DTS-RESULT {\"lang\":\"go\",\"pass\":" + strconv.Itoa(pass) + ",\"total\":" + strconv.Itoa(len(tests)) + ",\"results\":[" + strings.Join(parts, ",") + "]}")
		return
	}
	fmt.Printf("%s (Go): %d of %d tests pass\n", title, pass, len(tests))
	for i, r := range res {
		if r.ok {
			fmt.Printf("  test %d  ok    %.3f ms\n", i+1, r.ms)
			continue
		}
		fmt.Printf("  test %d  FAIL\n", i+1)
		fmt.Println("      input:    " + tests[i].in)
		ex := dtsJSON(tests[i].exp)
		if anyOrder {
			ex += "  (any order)"
		}
		fmt.Println("      expected: " + ex)
		if r.err != "" {
			fmt.Println("      got:      error: " + r.err)
		} else {
			fmt.Println("      got:      " + dtsJSON(r.got))
		}
	}
	if pass != len(tests) {
		os.Exit(1)
	}
}

`;

const PRE_cpp_head = String.raw`
#include <algorithm>
#include <array>
#include <bitset>
#include <cassert>
#include <chrono>
#include <climits>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <exception>
#include <functional>
#include <iostream>
#include <iterator>
#include <list>
#include <map>
#include <memory>
#include <numeric>
#include <optional>
#include <queue>
#include <random>
#include <set>
#include <sstream>
#include <stack>
#include <stdexcept>
#include <string>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>
using namespace std;

struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

`;

const PRE_cpp_run = String.raw`
namespace dts {
// a plain value: 0 null, 1 bool, 2 integer, 3 float, 4 string, 5 list
struct V {
    int k = 0;
    bool b = false;
    long long i = 0;
    double f = 0;
    std::string s;
    std::vector<V> a;
};
inline V N() { return V(); }
inline V B(bool x) { V v; v.k = 1; v.b = x; return v; }
inline V I(long long x) { V v; v.k = 2; v.i = x; return v; }
inline V F(double x) { V v; v.k = 3; v.f = x; return v; }
inline V S(const std::string& x) { V v; v.k = 4; v.s = x; return v; }
inline V L(std::vector<V> x) { V v; v.k = 5; v.a = std::move(x); return v; }
const long long NUL = LLONG_MIN;

inline V toV(const V& x) { return x; }
inline V toV(bool x) { return B(x); }
inline V toV(char x) { return S(std::string(1, x)); }
inline V toV(signed char x) { return I(x); }
inline V toV(unsigned char x) { return I(x); }
inline V toV(short x) { return I(x); }
inline V toV(unsigned short x) { return I(x); }
inline V toV(int x) { return I(x); }
inline V toV(unsigned x) { return I((long long)x); }
inline V toV(long x) { return I(x); }
inline V toV(unsigned long x) { return I((long long)x); }
inline V toV(long long x) { return I(x); }
inline V toV(unsigned long long x) { return I((long long)x); }
inline V toV(float x) { return F(x); }
inline V toV(double x) { return F(x); }
inline V toV(const std::string& x) { return S(x); }
inline V toV(const char* x) { return S(x); }
inline V toV(TreeNode* root);
inline V toV(ListNode* head);
template <class T> V toV(const std::vector<T>& v);
template <class T> V toV(const std::optional<T>& o);
template <class A, class B2> V toV(const std::pair<A, B2>& p);

template <class T> V toV(const std::vector<T>& v) {
    std::vector<V> out;
    for (const T& x : v) out.push_back(toV(x));
    return L(out);
}
template <class T> V toV(const std::optional<T>& o) { return o ? toV(*o) : N(); }
template <class A, class B2> V toV(const std::pair<A, B2>& p) { return L({toV(p.first), toV(p.second)}); }

inline V toV(TreeNode* root) {
    std::vector<V> out;
    std::vector<TreeNode*> q{root};
    for (size_t h = 0; h < q.size(); h++) {
        if (q.size() > 1000000) throw std::runtime_error("the tree has a cycle or more than 10^6 nodes");
        TreeNode* n = q[h];
        if (!n) {
            out.push_back(N());
        } else {
            out.push_back(I(n->val));
            q.push_back(n->left);
            q.push_back(n->right);
        }
    }
    while (!out.empty() && out.back().k == 0) out.pop_back();
    return L(out);
}

inline V toV(ListNode* head) {
    std::vector<V> out;
    for (ListNode* n = head; n; n = n->next) {
        if (out.size() >= 1000000) throw std::runtime_error("the list has a cycle or more than 10^6 nodes");
        out.push_back(I(n->val));
    }
    return L(out);
}

inline TreeNode* mkTree(const std::vector<long long>& a) {
    if (a.empty() || a[0] == NUL) return nullptr;
    TreeNode* root = new TreeNode((int)a[0]);
    std::vector<TreeNode*> q{root};
    size_t i = 1;
    for (size_t h = 0; h < q.size() && i < a.size(); h++) {
        TreeNode* n = q[h];
        if (i < a.size() && a[i] != NUL) { n->left = new TreeNode((int)a[i]); q.push_back(n->left); }
        i++;
        if (i < a.size() && a[i] != NUL) { n->right = new TreeNode((int)a[i]); q.push_back(n->right); }
        i++;
    }
    return root;
}

inline ListNode* mkList(const std::vector<int>& a) {
    ListNode* head = nullptr;
    for (size_t i = a.size(); i-- > 0;) head = new ListNode(a[i], head);
    return head;
}

inline std::string quote(const std::string& s) {
    std::string o = "\"";
    for (unsigned char c : s) {
        if (c == '"') o += "\\\"";
        else if (c == '\\') o += "\\\\";
        else if (c == '\n') o += "\\n";
        else if (c == '\r') o += "\\r";
        else if (c == '\t') o += "\\t";
        else if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof buf, "\\u%04x", (unsigned)c); o += buf; }
        else o += (char)c;
    }
    return o + "\"";
}

inline std::string num(double d) {
    if (std::isnan(d)) return quote("NaN");
    if (std::isinf(d)) return quote(d > 0 ? "Infinity" : "-Infinity");
    char buf[40];
    for (int p = 1; p <= 17; p++) {
        std::snprintf(buf, sizeof buf, "%.*g", p, d);
        if (std::strtod(buf, nullptr) == d) break;
    }
    return buf;
}

inline std::string json(const V& v) {
    switch (v.k) {
    case 0: return "null";
    case 1: return v.b ? "true" : "false";
    case 2: return std::to_string(v.i);
    case 3: return num(v.f);
    case 4: return quote(v.s);
    }
    std::string o = "[";
    for (size_t j = 0; j < v.a.size(); j++) {
        if (j) o += ",";
        o += json(v.a[j]);
    }
    return o + "]";
}

inline bool eq(const V& a, const V& b, double tol) {
    bool an = a.k == 2 || a.k == 3, bn = b.k == 2 || b.k == 3;
    if (an || bn) {
        if (!(an && bn)) return false;
        if (a.k == 2 && b.k == 2) return a.i == b.i;
        double x = a.k == 2 ? (double)a.i : a.f, y = b.k == 2 ? (double)b.i : b.f;
        if (x == y) return true;
        return std::fabs(x - y) <= tol * std::max(1.0, std::max(std::fabs(x), std::fabs(y)));
    }
    if (a.k != b.k) return false;
    if (a.k == 0) return true;
    if (a.k == 1) return a.b == b.b;
    if (a.k == 4) return a.s == b.s;
    if (a.a.size() != b.a.size()) return false;
    for (size_t j = 0; j < a.a.size(); j++)
        if (!eq(a.a[j], b.a[j], tol)) return false;
    return true;
}

inline std::vector<V> sortByJSON(const std::vector<V>& items) {
    std::vector<std::pair<std::string, V>> keyed;
    for (const V& x : items) keyed.push_back({json(x), x});
    std::stable_sort(keyed.begin(), keyed.end(), [](const std::pair<std::string, V>& p, const std::pair<std::string, V>& q) { return p.first < q.first; });
    std::vector<V> out;
    for (auto& p : keyed) out.push_back(p.second);
    return out;
}

inline V norm(const V& v) {
    if (v.k != 5) return v;
    std::vector<V> items;
    for (const V& e : v.a) items.push_back(e.k == 5 ? L(sortByJSON(e.a)) : e);
    return L(sortByJSON(items));
}

struct Test {
    std::string in;
    V exp;
    std::function<V()> run;
};

inline int runAll(int argc, char** argv, const std::string& title, bool anyOrder, double tol, const std::vector<Test>& tests) {
    bool asJson = false;
    for (int j = 1; j < argc; j++)
        if (std::string(argv[j]) == "--json" || std::string(argv[j]) == "-json") asJson = true;
    struct Row { bool ok = false; bool done = false; V got; std::string err; double ms = 0; };
    std::vector<Row> rows;
    size_t pass = 0;
    for (const Test& t : tests) {
        Row r;
        auto t0 = std::chrono::steady_clock::now();
        try {
            r.got = t.run();
            r.done = true;
        } catch (const std::exception& e) {
            r.err = std::string("exception: ") + e.what();
        } catch (...) {
            r.err = "exception";
        }
        r.ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
        if (r.done) r.ok = anyOrder ? eq(norm(r.got), norm(t.exp), tol) : eq(r.got, t.exp, tol);
        if (r.ok) pass++;
        rows.push_back(r);
    }
    char ms[40];
    if (asJson) {
        std::string o = "DTS-RESULT {\"lang\":\"cpp\",\"pass\":" + std::to_string(pass) + ",\"total\":" + std::to_string(tests.size()) + ",\"results\":[";
        for (size_t j = 0; j < rows.size(); j++) {
            std::snprintf(ms, sizeof ms, "%.3f", rows[j].ms);
            if (j) o += ",";
            o += std::string("{\"ok\":") + (rows[j].ok ? "true" : "false") + ",\"ms\":" + ms;
            o += rows[j].done ? ",\"got\":" + quote(json(rows[j].got)) : ",\"error\":" + quote(rows[j].err);
            o += "}";
        }
        std::cout << o << "]}" << std::endl;
        return 0;
    }
    std::cout << title << " (C++): " << pass << " of " << tests.size() << " tests pass" << std::endl;
    for (size_t j = 0; j < rows.size(); j++) {
        std::snprintf(ms, sizeof ms, "%.3f", rows[j].ms);
        if (rows[j].ok) { std::cout << "  test " << j + 1 << "  ok    " << ms << " ms" << std::endl; continue; }
        std::cout << "  test " << j + 1 << "  FAIL" << std::endl;
        std::cout << "      input:    " << tests[j].in << std::endl;
        std::cout << "      expected: " << json(tests[j].exp) << (anyOrder ? "  (any order)" : "") << std::endl;
        std::cout << "      got:      " << (rows[j].done ? json(rows[j].got) : "error: " + rows[j].err) << std::endl;
    }
    return pass == tests.size() ? 0 : 1;
}
}  // namespace dts

`;

const PRE_rust_head = String.raw`
#![allow(dead_code, unused_imports, unused_variables, unused_mut, unused_parens, unused_assignments, non_snake_case, non_camel_case_types)]
use std::cell::*;
use std::collections::*;
use std::rc::*;

#[derive(PartialEq, Eq, Clone, Debug)]
pub struct ListNode {
    pub val: i32,
    pub next: Option<Box<ListNode>>,
}

impl ListNode {
    #[inline]
    pub fn new(val: i32) -> Self {
        ListNode { next: None, val }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct TreeNode {
    pub val: i32,
    pub left: Option<Rc<RefCell<TreeNode>>>,
    pub right: Option<Rc<RefCell<TreeNode>>>,
}

impl TreeNode {
    #[inline]
    pub fn new(val: i32) -> Self {
        TreeNode { val, left: None, right: None }
    }
}

pub struct Solution;

`;

const PRE_rust_run = String.raw`
mod dts {
    use super::{ListNode, TreeNode};
    use std::cell::RefCell;
    use std::rc::Rc;

    /// a plain value: null, bool, integer, float, string or list
    #[derive(Clone, Debug)]
    pub enum V {
        N,
        B(bool),
        I(i64),
        F(f64),
        S(String),
        L(Vec<V>),
    }

    pub trait ToV {
        fn to_v(&self) -> V;
    }
    macro_rules! dts_ints {
        ($($t:ty),*) => { $(impl ToV for $t { fn to_v(&self) -> V { V::I(*self as i64) } })* };
    }
    dts_ints!(i8, i16, i32, i64, isize, u8, u16, u32, u64, usize);
    impl ToV for bool { fn to_v(&self) -> V { V::B(*self) } }
    impl ToV for f32 { fn to_v(&self) -> V { V::F(*self as f64) } }
    impl ToV for f64 { fn to_v(&self) -> V { V::F(*self) } }
    impl ToV for char { fn to_v(&self) -> V { V::S(self.to_string()) } }
    impl ToV for String { fn to_v(&self) -> V { V::S(self.clone()) } }
    impl<'a> ToV for &'a str { fn to_v(&self) -> V { V::S(self.to_string()) } }
    impl ToV for () { fn to_v(&self) -> V { V::N } }
    impl<T: ToV> ToV for Vec<T> { fn to_v(&self) -> V { V::L(self.iter().map(|x| x.to_v()).collect()) } }
    impl<T: ToV> ToV for std::collections::VecDeque<T> { fn to_v(&self) -> V { V::L(self.iter().map(|x| x.to_v()).collect()) } }
    impl<T: ToV> ToV for Option<T> { fn to_v(&self) -> V { match self { Some(x) => x.to_v(), None => V::N } } }
    impl<T: ToV + ?Sized> ToV for Box<T> { fn to_v(&self) -> V { (**self).to_v() } }
    impl<A: ToV, B: ToV> ToV for (A, B) { fn to_v(&self) -> V { V::L(vec![self.0.to_v(), self.1.to_v()]) } }
    impl ToV for Rc<RefCell<TreeNode>> { fn to_v(&self) -> V { tree_v(&Some(self.clone())) } }
    impl ToV for ListNode {
        fn to_v(&self) -> V {
            let mut out = Vec::new();
            let mut cur = Some(self);
            while let Some(n) = cur {
                out.push(V::I(n.val as i64));
                cur = n.next.as_deref();
            }
            V::L(out)
        }
    }

    pub fn tree_v(root: &Option<Rc<RefCell<TreeNode>>>) -> V {
        let mut out: Vec<V> = Vec::new();
        let mut q: Vec<Option<Rc<RefCell<TreeNode>>>> = vec![root.clone()];
        let mut h = 0;
        while h < q.len() {
            if q.len() > 1_000_000 {
                panic!("the tree has a cycle or more than 10^6 nodes");
            }
            let n = q[h].clone();
            h += 1;
            match n {
                None => out.push(V::N),
                Some(rc) => {
                    let b = rc.borrow();
                    out.push(V::I(b.val as i64));
                    q.push(b.left.clone());
                    q.push(b.right.clone());
                }
            }
        }
        while matches!(out.last(), Some(V::N)) {
            out.pop();
        }
        V::L(out)
    }

    pub fn list_v(head: &Option<Box<ListNode>>) -> V {
        match head {
            Some(n) => n.to_v(),
            None => V::L(Vec::new()),
        }
    }

    pub fn mk_tree(a: &[Option<i32>]) -> Option<Rc<RefCell<TreeNode>>> {
        if a.is_empty() || a[0].is_none() {
            return None;
        }
        let root = Rc::new(RefCell::new(TreeNode::new(a[0].unwrap())));
        let mut q = vec![root.clone()];
        let (mut h, mut i) = (0, 1);
        while h < q.len() && i < a.len() {
            let n = q[h].clone();
            h += 1;
            if let Some(v) = a[i] {
                let c = Rc::new(RefCell::new(TreeNode::new(v)));
                n.borrow_mut().left = Some(c.clone());
                q.push(c);
            }
            i += 1;
            if i < a.len() {
                if let Some(v) = a[i] {
                    let c = Rc::new(RefCell::new(TreeNode::new(v)));
                    n.borrow_mut().right = Some(c.clone());
                    q.push(c);
                }
            }
            i += 1;
        }
        Some(root)
    }

    pub fn mk_list(a: &[i32]) -> Option<Box<ListNode>> {
        let mut head = None;
        for &v in a.iter().rev() {
            head = Some(Box::new(ListNode { val: v, next: head }));
        }
        head
    }

    pub fn quote(s: &str) -> String {
        let mut o = String::from("\"");
        for c in s.chars() {
            match c {
                '"' => o.push_str("\\\""),
                '\\' => o.push_str("\\\\"),
                '\n' => o.push_str("\\n"),
                '\r' => o.push_str("\\r"),
                '\t' => o.push_str("\\t"),
                c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
                c => o.push(c),
            }
        }
        o.push('"');
        o
    }

    pub fn json(v: &V) -> String {
        match v {
            V::N => "null".to_string(),
            V::B(b) => b.to_string(),
            V::I(i) => i.to_string(),
            V::F(f) => if f.is_finite() { format!("{}", f) } else { quote(&format!("{}", f)) },
            V::S(s) => quote(s),
            V::L(a) => format!("[{}]", a.iter().map(json).collect::<Vec<_>>().join(",")),
        }
    }

    fn numv(v: &V) -> Option<(f64, Option<i64>)> {
        match v {
            V::I(i) => Some((*i as f64, Some(*i))),
            V::F(f) => Some((*f, None)),
            _ => None,
        }
    }

    pub fn eq(a: &V, b: &V, tol: f64) -> bool {
        let (na, nb) = (numv(a), numv(b));
        if na.is_some() || nb.is_some() {
            return match (na, nb) {
                (Some((_, Some(p))), Some((_, Some(q)))) => p == q,
                (Some((x, _)), Some((y, _))) => x == y || (x - y).abs() <= tol * 1f64.max(x.abs()).max(y.abs()),
                _ => false,
            };
        }
        match (a, b) {
            (V::N, V::N) => true,
            (V::B(x), V::B(y)) => x == y,
            (V::S(x), V::S(y)) => x == y,
            (V::L(x), V::L(y)) => x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| eq(p, q, tol)),
            _ => false,
        }
    }

    fn sort_by_json(items: &[V]) -> Vec<V> {
        let mut keyed: Vec<(String, V)> = items.iter().map(|x| (json(x), x.clone())).collect();
        keyed.sort_by(|p, q| p.0.cmp(&q.0));
        keyed.into_iter().map(|p| p.1).collect()
    }

    pub fn norm(v: &V) -> V {
        match v {
            V::L(items) => {
                let inner: Vec<V> = items.iter().map(|e| match e { V::L(x) => V::L(sort_by_json(x)), other => other.clone() }).collect();
                V::L(sort_by_json(&inner))
            }
            other => other.clone(),
        }
    }

    pub struct Test {
        pub input: &'static str,
        pub exp: V,
        pub run: Box<dyn Fn() -> V>,
    }

    pub fn run_all(title: &str, any_order: bool, tol: f64, tests: Vec<Test>) {
        let as_json = std::env::args().skip(1).any(|a| a == "--json" || a == "-json");
        std::panic::set_hook(Box::new(|_| {}));
        let mut pass = 0;
        let mut rows: Vec<(bool, f64, Result<V, String>)> = Vec::new();
        for t in &tests {
            let t0 = std::time::Instant::now();
            let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| (t.run)()));
            let ms = t0.elapsed().as_secs_f64() * 1000.0;
            let r = r.map_err(|e| {
                if let Some(s) = e.downcast_ref::<&str>() {
                    format!("panic: {}", s)
                } else if let Some(s) = e.downcast_ref::<String>() {
                    format!("panic: {}", s)
                } else {
                    "panic".to_string()
                }
            });
            let ok = match &r {
                Ok(got) => if any_order { eq(&norm(got), &norm(&t.exp), tol) } else { eq(got, &t.exp, tol) },
                Err(_) => false,
            };
            if ok {
                pass += 1;
            }
            rows.push((ok, ms, r));
        }
        if as_json {
            let parts: Vec<String> = rows.iter().map(|(ok, ms, r)| {
                let tail = match r {
                    Ok(got) => format!(",\"got\":{}", quote(&json(got))),
                    Err(e) => format!(",\"error\":{}", quote(e)),
                };
                format!("{{\"ok\":{},\"ms\":{:.3}{}}}", ok, ms, tail)
            }).collect();
            println!("DTS-RESULT {{\"lang\":\"rust\",\"pass\":{},\"total\":{},\"results\":[{}]}}", pass, tests.len(), parts.join(","));
            return;
        }
        println!("{} (Rust): {} of {} tests pass", title, pass, tests.len());
        for (i, (ok, ms, r)) in rows.iter().enumerate() {
            if *ok {
                println!("  test {}  ok    {:.3} ms", i + 1, ms);
                continue;
            }
            println!("  test {}  FAIL", i + 1);
            println!("      input:    {}", tests[i].input);
            println!("      expected: {}{}", json(&tests[i].exp), if any_order { "  (any order)" } else { "" });
            match r {
                Ok(got) => println!("      got:      {}", json(got)),
                Err(e) => println!("      got:      error: {}", e),
            }
        }
        if pass != tests.len() {
            std::process::exit(1);
        }
    }
}

`;

const PRE_scala_head = String.raw`
class ListNode(_x: Int = 0, _next: ListNode = null) {
  var next: ListNode = _next
  var x: Int = _x
}

class TreeNode(_value: Int = 0, _left: TreeNode = null, _right: TreeNode = null) {
  var value: Int = _value
  var left: TreeNode = _left
  var right: TreeNode = _right
}

`;

const PRE_scala_run = String.raw`
object DtsHarness {
  final case class Test(input: String, exp: Any, run: () => Any)

  val Limit = 1000000

  def mkTree(a: Seq[Any]): TreeNode = {
    if (a.isEmpty || a(0) == null) return null
    val root = new TreeNode(a(0).asInstanceOf[Int])
    val q = scala.collection.mutable.ArrayBuffer[TreeNode](root)
    var h = 0
    var i = 1
    while (h < q.length && i < a.length) {
      val n = q(h)
      h += 1
      if (i < a.length && a(i) != null) { n.left = new TreeNode(a(i).asInstanceOf[Int]); q += n.left }
      i += 1
      if (i < a.length && a(i) != null) { n.right = new TreeNode(a(i).asInstanceOf[Int]); q += n.right }
      i += 1
    }
    root
  }

  def mkList(a: Seq[Int]): ListNode = {
    var head: ListNode = null
    for (v <- a.reverse) head = new ListNode(v, head)
    head
  }

  def treeV(root: TreeNode): Any = {
    val out = scala.collection.mutable.ArrayBuffer[Any]()
    val q = scala.collection.mutable.ArrayBuffer[TreeNode](root)
    var h = 0
    while (h < q.length) {
      if (q.length > Limit) throw new RuntimeException("the tree has a cycle or more than 10^6 nodes")
      val n = q(h)
      h += 1
      if (n == null) out += null
      else { out += n.value.toLong; q += n.left; q += n.right }
    }
    while (out.nonEmpty && out.last == null) out.remove(out.length - 1)
    out.toVector
  }

  def listV(head: ListNode): Any = {
    val out = scala.collection.mutable.ArrayBuffer[Any]()
    var cur = head
    while (cur != null) {
      if (out.length >= Limit) throw new RuntimeException("the list has a cycle or more than 10^6 nodes")
      out += cur.x.toLong
      cur = cur.next
    }
    out.toVector
  }

  def toV(x: Any): Any = x match {
    case null => null
    case t: TreeNode => treeV(t)
    case l: ListNode => listV(l)
    case b: Boolean => b
    case c: Char => c.toString
    case i: Int => i.toLong
    case l: Long => l
    case s: Short => s.toLong
    case b: Byte => b.toLong
    case d: Double => d
    case f: Float => f.toDouble
    case s: String => s
    case _: scala.runtime.BoxedUnit => null
    case o: Option[?] => o match { case Some(v) => toV(v); case _ => null }
    case a: Array[?] => (0 until java.lang.reflect.Array.getLength(a)).map(i => toV(java.lang.reflect.Array.get(a, i))).toVector
    case it: IterableOnce[?] => it.iterator.map(toV).toVector
    case p: Product => p.productIterator.map(toV).toVector
    case other => other.toString
  }

  private def isInt(x: Any): Boolean = x match { case _: Long => true; case _: Int => true; case _ => false }
  private def isNum(x: Any): Boolean = isInt(x) || (x match { case _: Double => true; case _ => false })
  private def toL(x: Any): Long = x match { case l: Long => l; case i: Int => i.toLong; case _ => 0L }
  private def toD(x: Any): Double = x match { case l: Long => l.toDouble; case i: Int => i.toDouble; case d: Double => d; case _ => Double.NaN }

  def same(a: Any, b: Any, tol: Double): Boolean = {
    if (isNum(a) || isNum(b)) {
      if (!(isNum(a) && isNum(b))) false
      else if (isInt(a) && isInt(b)) toL(a) == toL(b)
      else {
        val x = toD(a)
        val y = toD(b)
        x == y || math.abs(x - y) <= tol * math.max(1.0, math.max(math.abs(x), math.abs(y)))
      }
    } else (a, b) match {
      case (null, null) => true
      case (x: Boolean, y: Boolean) => x == y
      case (x: String, y: String) => x == y
      case (x: Vector[?], y: Vector[?]) => x.length == y.length && x.indices.forall(i => same(x(i), y(i), tol))
      case _ => false
    }
  }

  def quote(s: String): String = {
    val b = new StringBuilder()
    b += '"'
    for (c <- s) c match {
      case '"' => b ++= "\\\""
      case '\\' => b ++= "\\\\"
      case '\n' => b ++= "\\n"
      case '\r' => b ++= "\\r"
      case '\t' => b ++= "\\t"
      case c if c < ' ' => b += '\\'; b += 'u'; b ++= String.format("%04x", Integer.valueOf(c.toInt))
      case c => b += c
    }
    b += '"'
    b.toString
  }

  def json(x: Any): String = x match {
    case null => "null"
    case b: Boolean => if (b) "true" else "false"
    case l: Long => l.toString
    case i: Int => i.toString
    case d: Double => if (d.isNaN || d.isInfinite) quote(d.toString) else d.toString
    case s: String => quote(s)
    case v: Vector[?] => v.map(json).mkString("[", ",", "]")
    case o => quote(o.toString)
  }

  private def sortByJson(v: Vector[?]): Vector[Any] = v.map(e => (json(e), e)).sortBy(_._1).map(_._2)

  def norm(x: Any): Any = x match {
    case v: Vector[?] => sortByJson(v.map { case e: Vector[?] => sortByJson(e); case e => e })
    case o => o
  }

  private def ms3(ms: Double): String = String.format(java.util.Locale.ROOT, "%.3f", java.lang.Double.valueOf(ms))

  def runAll(title: String, anyOrder: Boolean, tol: Double, tests: Vector[Test], args: Array[String]): Unit = {
    val asJson = args.contains("--json") || args.contains("-json")
    val rows = tests.map { t =>
      val t0 = System.nanoTime()
      val r: Either[String, Any] =
        try Right(t.run())
        catch { case e: Throwable => Left(e.getClass.getSimpleName + ": " + e.getMessage) }
      val ms = (System.nanoTime() - t0) / 1e6
      val ok = r match {
        case Right(got) => if (anyOrder) same(norm(got), norm(t.exp), tol) else same(got, t.exp, tol)
        case Left(_) => false
      }
      (ok, ms, r)
    }
    val pass = rows.count(_._1)
    if (asJson) {
      val parts = rows.map { row =>
        val tail = row._3 match {
          case Right(got) => ",\"got\":" + quote(json(got))
          case Left(err) => ",\"error\":" + quote(err)
        }
        "{\"ok\":" + row._1 + ",\"ms\":" + ms3(row._2) + tail + "}"
      }
      println("DTS-RESULT {\"lang\":\"scala\",\"pass\":" + pass + ",\"total\":" + tests.length + ",\"results\":[" + parts.mkString(",") + "]}")
      return
    }
    println(title + " (Scala): " + pass + " of " + tests.length + " tests pass")
    for (i <- rows.indices) {
      val row = rows(i)
      if (row._1) println("  test " + (i + 1) + "  ok    " + ms3(row._2) + " ms")
      else {
        println("  test " + (i + 1) + "  FAIL")
        println("      input:    " + tests(i).input)
        println("      expected: " + json(tests(i).exp) + (if (anyOrder) "  (any order)" else ""))
        row._3 match {
          case Right(got) => println("      got:      " + json(got))
          case Left(err) => println("      got:      error: " + err)
        }
      }
    }
    if (pass != tests.length) sys.exit(1)
  }
}

`;

const PRE = {python_head:PRE_python_head, python_run:PRE_python_run, go_head:PRE_go_head, go_run:PRE_go_run, cpp_head:PRE_cpp_head, cpp_run:PRE_cpp_run,
             rust_head:PRE_rust_head, rust_run:PRE_rust_run, scala_head:PRE_scala_head, scala_run:PRE_scala_run};
for (const k in PRE) PRE[k] = PRE[k].replace(/^\n/, "");

/* ------------------------------------------------------------------ languages */
const LANGS = [
  {id:"python", label:"Python", ext:"py", note:"#"},
  {id:"go", label:"Go", ext:"go", note:"//"},
  {id:"cpp", label:"C++", ext:"cpp", note:"//"},
  {id:"rust", label:"Rust", ext:"rs", note:"//"},
  {id:"scala", label:"Scala", ext:"scala", note:"//"},
];
const LANG = {}; LANGS.forEach(l => LANG[l.id] = l);
const GO_IMPORTS = ["\"fmt\"", "\"math\"", "\"os\"", "\"reflect\"", "\"sort\"", "\"strconv\"", "\"strings\"", "\"time\""];
const RUST_KW = new Set("as async await break const continue crate dyn else enum extern false fn for gen if impl in let loop match mod move mut pub ref return self static struct super trait true try type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield".split(" "));

class HarnessError extends Error {}
const fail = m => { throw new HarnessError(m); };

/* ------------------------------------------------------------------ names */
const camel = s => { const p = String(s).split("_"); return p[0] + p.slice(1).map(x => x.slice(0, 1).toUpperCase() + x.slice(1)).join(""); };
const snake = s => String(s).replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const cap = s => String(s).slice(0, 1).toUpperCase() + String(s).slice(1);
const rustId = s => RUST_KW.has(s) ? "r#" + s : s;

/* the function, class and method names one language uses for a signature */
function names(sig, lang){
  if (sig.design) {
    const m = {};
    (sig.methods || []).forEach(x => { m[x.name] = lang === "python" ? snake(x.name) : lang === "go" ? cap(x.name) : lang === "rust" ? rustId(snake(x.name)) : x.name; });
    return {cls: sig.design, ctor: lang === "go" ? "Constructor" : lang === "rust" ? "new" : sig.design, methods: m};
  }
  return {fn: lang === "python" || lang === "rust" ? (lang === "rust" ? rustId(sig.name) : sig.name) : camel(sig.name)};
}

/* ------------------------------------------------------------------ types */
const BASE = ["int", "long", "float", "bool", "str", "tree", "linkedlist"];
function parseType(s, ret){
  const t = String(s).replace(/\s+/g, "");
  if (ret && t === "void") return "void";
  const m = /^(list|optional)\[(.*)\]$/.exec(t);
  if (m) return [m[1], parseType(m[2], false)];
  if (BASE.includes(t)) return t;
  return fail("unknown type " + JSON.stringify(String(s)) + " (use int, long, float, bool, str, list[T], optional[T], tree, linkedlist" + (ret ? ", void" : "") + ")");
}
const typeStr = t => typeof t === "string" ? t : t[0] + "[" + typeStr(t[1]) + "]";

const isInt = v => typeof v === "number" && Number.isInteger(v);
function check(v, t, where){
  const bad = what => fail(where + ": expected " + what + ", got " + JSON.stringify(v));
  if (t === "void") { if (v !== null) bad("null (the method returns nothing)"); return; }
  if (Array.isArray(t) && t[0] === "optional") { if (v !== null) check(v, t[1], where); return; }
  if (v === null) bad(typeStr(t) + " (null is only allowed for optional[...] and inside tree)");
  if (t === "int") { if (!isInt(v) || v < -2147483648 || v > 2147483647) bad("int (a whole number between -2^31 and 2^31-1; use long for bigger values)"); return; }
  if (t === "long") { if (!isInt(v) || Math.abs(v) > 9007199254740991) bad("long (a whole number within +-2^53)"); return; }
  if (t === "float") { if (typeof v !== "number" || !isFinite(v)) bad("float"); return; }
  if (t === "bool") { if (typeof v !== "boolean") bad("bool"); return; }
  if (t === "str") { if (typeof v !== "string") bad("str"); return; }
  if (t === "tree") { if (!Array.isArray(v) || !v.every(x => x === null || (isInt(x) && Math.abs(x) <= 2147483647))) bad("tree (a level-order list of int or null)"); return; }
  if (t === "linkedlist") { if (!Array.isArray(v) || !v.every(x => isInt(x) && Math.abs(x) <= 2147483647)) bad("linkedlist (a list of int)"); return; }
  if (!Array.isArray(v)) bad(typeStr(t));
  v.forEach((x, i) => check(x, t[1], where + "[" + i + "]"));
}

/* level-order with null, as LeetCode prints it: children of null nodes are not listed and trailing nulls are dropped */
function canonTree(a){
  if (!a.length || a[0] === null) return [];
  const nodes = [{v:a[0], l:null, r:null}], q = [nodes[0]]; let h = 0, i = 1;
  while (h < q.length && i < a.length) {
    const n = q[h++];
    if (i < a.length && a[i] !== null) { n.l = {v:a[i], l:null, r:null}; q.push(n.l); } i++;
    if (i < a.length && a[i] !== null) { n.r = {v:a[i], l:null, r:null}; q.push(n.r); } i++;
  }
  const out = [], bq = [nodes[0]];
  for (let k = 0; k < bq.length; k++) { const n = bq[k]; if (!n) out.push(null); else { out.push(n.v); bq.push(n.l, n.r); } }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}
function canon(v, t){
  if (v === null || t === "void") return v;
  if (t === "tree") return canonTree(v);
  if (Array.isArray(t)) return t[0] === "list" ? v.map(x => canon(x, t[1])) : canon(v, t[1]);
  return v;
}

/* the checked, normalized problem: sig parsed, tests checked against the types */
function prepare(p){
  const sig = p.sig;
  if (!sig || typeof sig !== "object") fail("missing sig");
  if (!Array.isArray(p.tests) || !p.tests.length) fail("no tests");
  const tol = sig.tol === undefined ? 1e-6 : sig.tol;
  if (typeof tol !== "number" || !(tol >= 0)) fail("sig.tol must be a number >= 0");
  const M = {id:String(p.id), title:String(p.title || p.id), anyOrder:!!p.order_insensitive, tol, design:!!sig.design};
  const params = (list, where) => {
    if (!Array.isArray(list)) fail(where + " must be a list of [name, type] pairs");
    return list.map((x, i) => { if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== "string" || !/^[a-z_][a-z0-9_]*$/.test(x[0])) fail(where + "[" + i + "] must be [\"snake_case_name\", \"type\"]");
      return {name:x[0], t:parseType(x[1], false)}; });
  };
  if (!M.design) {
    if (typeof sig.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(sig.name)) fail("sig.name must be a snake_case name such as two_sum");
    M.name = sig.name; M.params = params(sig.params, "sig.params"); M.ret = parseType(sig.returns === undefined ? "" : sig.returns, true);
    M.inplace = sig.inplace === undefined || sig.inplace === null ? null : sig.inplace;
    if (M.inplace !== null && (!isInt(M.inplace) || M.inplace < 0 || M.inplace >= M.params.length)) fail("sig.inplace must be the index of a parameter");
    if (M.inplace !== null && M.ret !== "void") fail("sig.inplace needs \"returns\": \"void\"");
    if (M.inplace === null && M.ret === "void") fail("\"returns\": \"void\" needs sig.inplace (the parameter the tests compare after the call)");
    const rt = M.inplace === null ? M.ret : M.params[M.inplace].t;
    M.tests = p.tests.map((t, k) => {
      const w = "test " + (k + 1);
      if (!t || !Array.isArray(t.args) || t.args.length !== M.params.length) fail(w + ": args must be a list of " + M.params.length + " values");
      t.args.forEach((v, i) => check(v, M.params[i].t, w + ", argument " + M.params[i].name));
      check(t.expected, rt, w + ", expected");
      return {args:t.args, exp:canon(t.expected, rt), show:t.args.map((v, i) => show(v, M.params[i].t)).join(", ")};
    });
    M.expType = rt;
  } else {
    if (typeof sig.design !== "string" || !/^[A-Z][A-Za-z0-9]*$/.test(sig.design)) fail("sig.design must be the class name, such as LRUCache");
    M.cls = sig.design; M.init = params(sig.init || [], "sig.init");
    if (!Array.isArray(sig.methods) || !sig.methods.length) fail("sig.methods must list the methods");
    M.methods = {};
    sig.methods.forEach((m, i) => {
      if (!m || typeof m.name !== "string" || !/^[a-z][A-Za-z0-9]*$/.test(m.name)) fail("sig.methods[" + i + "].name must be the operation name as the tests spell it (camelCase)");
      if (M.methods[m.name]) fail("method " + m.name + " is listed twice");
      M.methods[m.name] = {name:m.name, params:params(m.params || [], "method " + m.name + " params"), ret:parseType(m.returns === undefined ? "" : m.returns, true)};
    });
    M.tests = p.tests.map((t, k) => {
      const w = "test " + (k + 1);
      if (!t || !Array.isArray(t.args) || t.args.length !== 2 || !Array.isArray(t.args[0]) || !Array.isArray(t.args[1]) || t.args[0].length !== t.args[1].length) fail(w + ": args must be [operations, arguments] of the same length");
      const [ops, vals] = t.args;
      if (ops[0] !== M.cls) fail(w + ": the first operation must be the constructor " + M.cls);
      if (!Array.isArray(t.expected) || t.expected.length !== ops.length) fail(w + ": expected must have one value per operation");
      const types = ops.map((op, j) => {
        if (j === 0) return M.init.map(x => x.t);
        if (op === M.cls) fail(w + ": the constructor may only be the first operation");
        if (!M.methods[op]) fail(w + ": unknown operation " + JSON.stringify(op) + " (add it to sig.methods)");
        return M.methods[op].params.map(x => x.t);
      });
      ops.forEach((op, j) => {
        if (!Array.isArray(vals[j]) || vals[j].length !== types[j].length) fail(w + ", operation " + (j + 1) + " (" + op + "): needs " + types[j].length + " argument(s)");
        vals[j].forEach((v, i) => check(v, types[j][i], w + ", operation " + (j + 1) + " (" + op + ") argument " + (i + 1)));
        check(t.expected[j], j === 0 ? "void" : M.methods[op].ret, w + ", expected value of operation " + (j + 1) + " (" + op + ")");
      });
      const rets = ops.map((op, j) => j === 0 ? "void" : M.methods[op].ret);
      return {ops, vals, types, rets, exp:t.expected.map((v, j) => canon(v, rets[j])),
              show:show(ops, ["list", "str"]) + ", [" + vals.map((a, j) => "[" + a.map((v, i) => show(v, types[j][i])).join(",") + "]").join(",") + "]"};
    });
  }
  return M;
}

/* ------------------------------------------------------------------ literals */
function fmtInt(v){ return String(v === 0 ? 0 : v); }
function fmtFloat(x){
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return String(x === 0 ? 0 : x) + ".0";
  const a = Math.abs(x);
  if (a >= 1e16 || a < 1e-4) return x.toExponential();
  return String(x);
}
function hex(n, w){ let s = n.toString(16); while (s.length < w) s = "0" + s; return s; }
/* a string literal; control characters escaped the way each language allows */
function strLit(s, lang){
  let o = "\"";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === "\\") o += "\\\\";
    else if (ch === "\"") o += "\\\"";
    else if (ch === "\n") o += "\\n";
    else if (ch === "\r") o += "\\r";
    else if (ch === "\t") o += "\\t";
    else if (c < 0x20 || c === 0x7f) o += lang === "cpp" ? "\\" + ("00" + c.toString(8)).slice(-3) : lang === "scala" ? "\\u" + hex(c, 4) : "\\x" + hex(c, 2);
    else o += ch;
  }
  return o + "\"";
}
/* compact JSON for the "input:" line of the report */
function jstr(s){
  let o = "\"";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === "\\") o += "\\\\"; else if (ch === "\"") o += "\\\""; else if (ch === "\n") o += "\\n"; else if (ch === "\r") o += "\\r"; else if (ch === "\t") o += "\\t";
    else if (c < 0x20) o += "\\u" + hex(c, 4); else o += ch;
  }
  return o + "\"";
}
function show(v, t){
  if (v === null) return "null";
  if (t === "int" || t === "long") return fmtInt(v);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "true" : "false";
  if (t === "str") return jstr(v);
  if (t === "tree" || t === "linkedlist") return "[" + v.map(x => x === null ? "null" : fmtInt(x)).join(",") + "]";
  if (t[0] === "optional") return show(v, t[1]);
  return "[" + v.map(x => show(x, t[1])).join(",") + "]";
}
/* Python: typed literal of a JSON value; meta: a literal of names and type strings */
function pyLit(v, t){
  if (v === null) return "None";
  if (t === "int" || t === "long") return fmtInt(v);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "True" : "False";
  if (t === "str") return strLit(v, "python");
  if (t === "tree" || t === "linkedlist") return "[" + v.map(x => x === null ? "None" : fmtInt(x)).join(", ") + "]";
  if (t[0] === "optional") return pyLit(v, t[1]);
  return "[" + v.map(x => pyLit(x, t[1])).join(", ") + "]";
}
function pyMeta(x){
  if (x === null) return "None";
  if (typeof x === "string") return strLit(x, "python");
  if (typeof x === "number") return fmtInt(x);
  if (Array.isArray(x)) return "[" + x.map(pyMeta).join(", ") + "]";
  return "{" + Object.keys(x).map(k => strLit(k, "python") + ": " + pyMeta(x[k])).join(", ") + "}";
}
/* Go */
function goTy(t){
  if (t === "int" || t === "long") return "int";
  if (t === "float") return "float64";
  if (t === "bool") return "bool";
  if (t === "str") return "string";
  if (t === "tree") return "*TreeNode";
  if (t === "linkedlist") return "*ListNode";
  return t[0] === "list" ? "[]" + goTy(t[1]) : "*" + goTy(t[1]);
}
function goLit(v, t){
  if (Array.isArray(t) && t[0] === "optional") return v === null ? "nil" : "dtsPtr[" + goTy(t[1]) + "](" + goLit(v, t[1]) + ")";
  if (t === "int" || t === "long") return fmtInt(v);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "true" : "false";
  if (t === "str") return strLit(v, "go");
  if (t === "tree") return "dtsTree([]any{" + v.map(x => x === null ? "nil" : fmtInt(x)).join(", ") + "})";
  if (t === "linkedlist") return "dtsList([]int{" + v.map(fmtInt).join(", ") + "})";
  return goTy(t) + "{" + v.map(x => goLit(x, t[1])).join(", ") + "}";
}
function goV(v, t){
  if (v === null || t === "void") return "nil";
  if (t === "int" || t === "long") return fmtInt(v);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "true" : "false";
  if (t === "str") return strLit(v, "go");
  if (t === "tree" || t === "linkedlist") return "[]any{" + v.map(x => x === null ? "nil" : fmtInt(x)).join(", ") + "}";
  if (t[0] === "optional") return goV(v, t[1]);
  return "[]any{" + v.map(x => goV(x, t[1])).join(", ") + "}";
}
/* C++ */
function cppTy(t){
  if (t === "int") return "int";
  if (t === "long") return "long long";
  if (t === "float") return "double";
  if (t === "bool") return "bool";
  if (t === "str") return "std::string";
  if (t === "tree") return "TreeNode*";
  if (t === "linkedlist") return "ListNode*";
  return t[0] === "list" ? "std::vector<" + cppTy(t[1]) + ">" : "std::optional<" + cppTy(t[1]) + ">";
}
const cppLong = v => v === -9223372036854775808 ? "LLONG_MIN" : fmtInt(v) + "LL";
function cppLit(v, t){
  if (Array.isArray(t) && t[0] === "optional") return v === null ? cppTy(t) + "()" : cppTy(t) + "(" + cppLit(v, t[1]) + ")";
  if (t === "int") return fmtInt(v);
  if (t === "long") return cppLong(v);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "true" : "false";
  if (t === "str") return "std::string(" + strLit(v, "cpp") + ")";
  if (t === "tree") return "dts::mkTree(std::vector<long long>{" + v.map(x => x === null ? "dts::NUL" : fmtInt(x)).join(", ") + "})";
  if (t === "linkedlist") return "dts::mkList(std::vector<int>{" + v.map(fmtInt).join(", ") + "})";
  return cppTy(t) + "{" + v.map(x => cppLit(x, t[1])).join(", ") + "}";
}
function cppV(v, t){
  if (v === null || t === "void") return "dts::N()";
  if (t === "int" || t === "long") return "dts::I(" + (v === -9223372036854775808 ? "LLONG_MIN" : fmtInt(v)) + ")";
  if (t === "float") return "dts::F(" + fmtFloat(v) + ")";
  if (t === "bool") return "dts::B(" + (v ? "true" : "false") + ")";
  if (t === "str") return "dts::S(" + strLit(v, "cpp") + ")";
  if (t === "tree" || t === "linkedlist") return "dts::L({" + v.map(x => x === null ? "dts::N()" : "dts::I(" + fmtInt(x) + ")").join(", ") + "})";
  if (t[0] === "optional") return cppV(v, t[1]);
  return "dts::L({" + v.map(x => cppV(x, t[1])).join(", ") + "})";
}
/* Rust */
function rsTy(t){
  if (t === "int") return "i32";
  if (t === "long") return "i64";
  if (t === "float") return "f64";
  if (t === "bool") return "bool";
  if (t === "str") return "String";
  if (t === "tree") return "Option<Rc<RefCell<TreeNode>>>";
  if (t === "linkedlist") return "Option<Box<ListNode>>";
  return t[0] === "list" ? "Vec<" + rsTy(t[1]) + ">" : "Option<" + rsTy(t[1]) + ">";
}
const rsInt = (v, t) => t === "int" && v === -2147483648 ? "i32::MIN" : v === -9223372036854775808 ? "i64::MIN" : fmtInt(v);
function rsLit(v, t){
  if (Array.isArray(t) && t[0] === "optional") return v === null ? "None" : "Some(" + rsLit(v, t[1]) + ")";
  if (t === "int" || t === "long") return rsInt(v, t);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "true" : "false";
  if (t === "str") return "String::from(" + strLit(v, "rust") + ")";
  if (t === "tree") return "dts::mk_tree(&[" + v.map(x => x === null ? "None" : "Some(" + rsInt(x, "int") + ")").join(", ") + "])";
  if (t === "linkedlist") return "dts::mk_list(&[" + v.map(x => rsInt(x, "int")).join(", ") + "])";
  return "vec![" + v.map(x => rsLit(x, t[1])).join(", ") + "]";
}
function rsV(v, t){
  if (v === null || t === "void") return "dts::V::N";
  if (t === "int" || t === "long") return "dts::V::I(" + (v === -9223372036854775808 ? "i64::MIN" : fmtInt(v)) + ")";
  if (t === "float") return "dts::V::F(" + fmtFloat(v) + ")";
  if (t === "bool") return "dts::V::B(" + (v ? "true" : "false") + ")";
  if (t === "str") return "dts::V::S(String::from(" + strLit(v, "rust") + "))";
  if (t === "tree" || t === "linkedlist") return "dts::V::L(vec![" + v.map(x => x === null ? "dts::V::N" : "dts::V::I(" + fmtInt(x) + ")").join(", ") + "])";
  if (t[0] === "optional") return rsV(v, t[1]);
  return "dts::V::L(vec![" + v.map(x => rsV(x, t[1])).join(", ") + "])";
}
/* Scala */
function scTy(t){
  if (t === "int") return "Int";
  if (t === "long") return "Long";
  if (t === "float") return "Double";
  if (t === "bool") return "Boolean";
  if (t === "str") return "String";
  if (t === "tree") return "TreeNode";
  if (t === "linkedlist") return "ListNode";
  return t[0] === "list" ? "Array[" + scTy(t[1]) + "]" : "Option[" + scTy(t[1]) + "]";
}
const scLong = v => v === -9223372036854775808 ? "Long.MinValue" : fmtInt(v) + "L";
function scLit(v, t){
  if (Array.isArray(t) && t[0] === "optional") return v === null ? "None" : "Some(" + scLit(v, t[1]) + ")";
  if (t === "int") return v === -2147483648 ? "Int.MinValue" : fmtInt(v);
  if (t === "long") return scLong(v);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "true" : "false";
  if (t === "str") return strLit(v, "scala");
  if (t === "tree") return "DtsHarness.mkTree(Vector[Any](" + v.map(x => x === null ? "null" : fmtInt(x)).join(", ") + "))";
  if (t === "linkedlist") return "DtsHarness.mkList(Vector[Int](" + v.map(fmtInt).join(", ") + "))";
  return scTy(t) + "(" + v.map(x => scLit(x, t[1])).join(", ") + ")";
}
function scV(v, t){
  if (v === null || t === "void") return "null";
  if (t === "int" || t === "long") return scLong(v);
  if (t === "float") return fmtFloat(v);
  if (t === "bool") return v ? "true" : "false";
  if (t === "str") return strLit(v, "scala");
  if (t === "tree" || t === "linkedlist") return "Vector[Any](" + v.map(x => x === null ? "null" : fmtInt(x) + "L").join(", ") + ")";
  if (t[0] === "optional") return scV(v, t[1]);
  return "Vector[Any](" + v.map(x => scV(x, t[1])).join(", ") + ")";
}

/* ------------------------------------------------------------------ program text */
function fileBase(p){ return String(p.id).replace(/-/g, "_") + "_tests"; }
function fileName(p, lang){ return fileBase(p) + "." + LANG[lang].ext; }
function command(p, lang, json){
  const f = fileName(p, lang), b = fileBase(p), j = json ? " --json" : "";
  if (lang === "python") return "python3 " + f + j;
  if (lang === "go") return "go run " + f + j;
  if (lang === "cpp") return "g++ -std=c++17 -O2 -o " + b + " " + f + " && ./" + b + j;
  if (lang === "rust") return "rustc -O --edition 2021 -o " + b + " " + f + " && ./" + b + j;
  if (lang === "scala") return "scala-cli run " + f + (json ? " -- --json" : "");
  return fail("unknown language " + lang);
}
function header(p, lang){
  const c = LANG[lang].note;
  return c + " Down the Stack practice: " + (p.title || p.id) + " (" + p.id + "). Test program in " + LANG[lang].label + ".\n" +
         c + " Your code is between the two ==== lines; the tests come after it.\n" +
         c + " Run: " + command(p, lang) + "    (add --json for a one-line JSON report)\n";
}
const USER_START = c => c + " ==== your code ====\n";
const USER_END = c => c + " ==== tests (generated from the problem: edit your code above, not below) ====\n";
const withNL = s => { s = String(s == null ? "" : s).replace(/\r\n?/g, "\n"); return s.endsWith("\n") ? s : s + "\n"; };
const countLines = s => s.split("\n").length - 1;

/* Go: a package line and imports in the learner's code move to the top of the file */
function goSplit(code){
  const out = [], imps = []; let block = false;
  for (const ln of code.split("\n")) {
    if (block) { if (/^\s*\)\s*$/.test(ln)) block = false; else { const s = ln.replace(/\/\/.*$/, "").trim(); if (s) imps.push(s.replace(/\s+/g, " ")); } out.push(""); continue; }
    if (/^\s*package\s+\w+\s*(\/\/.*)?$/.test(ln)) { out.push(""); continue; }
    if (/^\s*import\s*\(\s*(\/\/.*)?$/.test(ln)) { block = true; out.push(""); continue; }
    const m = /^\s*import\s+((?:[\w.]+\s+)?"[^"]+")\s*(\/\/.*)?$/.exec(ln);
    if (m) { imps.push(m[1].replace(/\s+/g, " ")); out.push(""); continue; }
    out.push(ln);
  }
  const uniq = [];
  imps.forEach(s => { if (!GO_IMPORTS.includes(s) && !uniq.includes(s)) uniq.push(s); });
  return {body:out.join("\n"), imports:uniq};
}

function pyProgram(p, M, code){
  const head = header(p, "python") + PRE.python_head + USER_START("#");
  const first = countLines(head) + 1, last = first + countLines(code) - 1;
  const L = [];
  L.push("DTS_TITLE = " + strLit(M.title, "python"));
  L.push("DTS_USER_LINES = [" + first + ", " + Math.max(first, last) + "]");
  L.push("DTS_DESIGN = " + (M.design ? "True" : "False"));
  if (!M.design) {
    L.push("DTS_NAMES = " + pyMeta(M.name === camel(M.name) ? [M.name] : [M.name, camel(M.name)]));
    L.push("DTS_PARAMS = " + pyMeta(M.params.map(x => typeStr(x.t))));
    L.push("DTS_RETURNS = " + pyMeta(typeStr(M.ret)));
    L.push("DTS_INPLACE = " + (M.inplace === null ? "None" : fmtInt(M.inplace)));
    L.push("DTS_CLASS = None", "DTS_INIT = []", "DTS_METHODS = {}");
  } else {
    L.push("DTS_NAMES = []", "DTS_PARAMS = []", "DTS_RETURNS = \"void\"", "DTS_INPLACE = None");
    L.push("DTS_CLASS = " + strLit(M.cls, "python"));
    L.push("DTS_INIT = " + pyMeta(M.init.map(x => typeStr(x.t))));
    const meth = {};
    Object.keys(M.methods).forEach(k => { const m = M.methods[k], s = snake(k); meth[k] = [s === k ? [k] : [s, k], m.params.map(x => typeStr(x.t)), typeStr(m.ret)]; });
    L.push("DTS_METHODS = " + pyMeta(meth));
  }
  L.push("DTS_ORDER_INSENSITIVE = " + (M.anyOrder ? "True" : "False"));
  L.push("DTS_TOL = " + fmtFloat(M.tol));
  L.push("DTS_TESTS = [");
  M.tests.forEach(t => {
    if (!M.design) L.push("    ([" + t.args.map((v, i) => pyLit(v, M.params[i].t)).join(", ") + "], " + pyLit(t.exp, M.expType) + "),");
    else L.push("    ([" + pyLit(t.ops, ["list", "str"]) + ", [" + t.vals.map((a, j) => "[" + a.map((v, i) => pyLit(v, t.types[j][i])).join(", ") + "]").join(", ") + "]], [" +
                t.exp.map((v, j) => pyLit(v, t.rets[j])).join(", ") + "]),");
  });
  L.push("]");
  return head + code + USER_END("#") + L.join("\n") + "\n\n" + PRE.python_run + "dts_main()\n";
}

function goProgram(p, M, code){
  const sp = goSplit(code), nm = names(p.sig, "go");
  const head = header(p, "go") + PRE.go_head.replace("//DTS-IMPORTS\n", sp.imports.map(s => "\t" + s + "\n").join(""));
  const call = (fn, args) => fn + "(" + args.join(", ") + ")";
  const decl = (n, v, t) => "var " + n + " " + goTy(t) + " = " + goLit(v, t);
  const T = M.tests.map(t => {
    const b = [];
    if (!M.design) {
      t.args.forEach((v, i) => b.push("\t\t" + decl("a" + i, v, M.params[i].t)));
      const c = call(nm.fn, t.args.map((v, i) => "a" + i));
      if (M.inplace === null) b.push("\t\treturn dtsToV(" + c + ")"); else b.push("\t\t" + c, "\t\treturn dtsToV(a" + M.inplace + ")");
    } else {
      b.push("\t\tout := []any{}");
      t.vals[0].forEach((v, i) => b.push("\t\t" + decl("c" + i, v, t.types[0][i])));
      b.push("\t\tobj := " + call(nm.ctor, t.vals[0].map((v, i) => "c" + i)), "\t\t_ = obj", "\t\tout = append(out, nil)");
      t.ops.forEach((op, j) => { if (!j) return;
        const ds = t.vals[j].map((v, i) => decl("a" + i, v, t.types[j][i]) + "; ").join(""), c = call("obj." + nm.methods[op], t.vals[j].map((v, i) => "a" + i));
        b.push("\t\t{ " + ds + (t.rets[j] === "void" ? c + "; out = append(out, nil)" : "out = append(out, dtsToV(" + c + "))") + " }"); });
      b.push("\t\treturn out");
    }
    return "\t{" + strLit(t.show, "go") + ", " + (M.design ? "[]any{" + t.exp.map((v, j) => goV(v, t.rets[j])).join(", ") + "}" : goV(t.exp, M.expType)) + ", func() any {\n" + b.join("\n") + "\n\t}},\n";
  });
  return head + USER_START("//") + sp.body + USER_END("//") + PRE.go_run + "var dtsTests = []dtsTest{\n" + T.join("") + "}\n\nfunc main() {\n\tdtsMain(" +
         strLit(M.title, "go") + ", " + M.anyOrder + ", " + fmtFloat(M.tol) + ", dtsTests)\n}\n";
}

function cppProgram(p, M, code){
  const nm = names(p.sig, "cpp");
  const decl = (n, v, t) => "auto " + n + " = " + cppLit(v, t) + ";";
  const T = M.tests.map(t => {
    const b = [];
    if (!M.design) {
      t.args.forEach((v, i) => b.push("            " + decl("a" + i, v, M.params[i].t)));
      b.push("            Solution* dtsSol = new Solution();");
      const c = "dtsSol->" + nm.fn + "(" + t.args.map((v, i) => "a" + i).join(", ") + ")";
      if (M.inplace === null) b.push("            return dts::toV(" + c + ");"); else b.push("            " + c + ";", "            return dts::toV(a" + M.inplace + ");");
    } else {
      b.push("            std::vector<dts::V> out;");
      t.vals[0].forEach((v, i) => b.push("            " + decl("c" + i, v, t.types[0][i])));
      b.push("            auto* obj = new " + M.cls + "(" + t.vals[0].map((v, i) => "c" + i).join(", ") + ");", "            out.push_back(dts::N());");
      t.ops.forEach((op, j) => { if (!j) return;
        const ds = t.vals[j].map((v, i) => decl("a" + i, v, t.types[j][i]) + " ").join(""), c = "obj->" + nm.methods[op] + "(" + t.vals[j].map((v, i) => "a" + i).join(", ") + ")";
        b.push("            { " + ds + (t.rets[j] === "void" ? c + "; out.push_back(dts::N());" : "out.push_back(dts::toV(" + c + "));") + " }"); });
      b.push("            return dts::L(out);");
    }
    return "        {" + strLit(t.show, "cpp") + ", " + (M.design ? "dts::L({" + t.exp.map((v, j) => cppV(v, t.rets[j])).join(", ") + "})" : cppV(t.exp, M.expType)) +
           ", []() -> dts::V {\n" + b.join("\n") + "\n        }},\n";
  });
  return header(p, "cpp") + PRE.cpp_head + USER_START("//") + code + USER_END("//") + PRE.cpp_run + "static std::vector<dts::Test> dtsTests() {\n    return {\n" + T.join("") +
         "    };\n}\n\nint main(int argc, char** argv) {\n    return dts::runAll(argc, argv, " + strLit(M.title, "cpp") + ", " + M.anyOrder + ", " + fmtFloat(M.tol) + ", dtsTests());\n}\n";
}

function rustProgram(p, M, code){
  const nm = names(p.sig, "rust");
  const decl = (n, v, t) => "let mut " + n + ": " + rsTy(t) + " = " + rsLit(v, t) + ";";
  const conv = (e, t) => t === "tree" ? "dts::tree_v(&" + e + ")" : t === "linkedlist" ? "dts::list_v(&" + e + ")" : "dts::ToV::to_v(&" + e + ")";
  const T = M.tests.map(t => {
    const b = [];
    if (!M.design) {
      t.args.forEach((v, i) => b.push("            " + decl("a" + i, v, M.params[i].t)));
      const c = "Solution::" + nm.fn + "(" + t.args.map((v, i) => (i === M.inplace ? "&mut a" : "a") + i).join(", ") + ")";
      if (M.inplace === null) b.push("            " + conv(c, M.ret)); else b.push("            " + c + ";", "            " + conv("a" + M.inplace, M.params[M.inplace].t));
    } else {
      b.push("            let mut out: Vec<dts::V> = Vec::new();");
      t.vals[0].forEach((v, i) => b.push("            " + decl("c" + i, v, t.types[0][i])));
      b.push("            let mut obj = " + M.cls + "::new(" + t.vals[0].map((v, i) => "c" + i).join(", ") + ");", "            out.push(dts::V::N);");
      t.ops.forEach((op, j) => { if (!j) return;
        const ds = t.vals[j].map((v, i) => decl("a" + i, v, t.types[j][i]) + " ").join(""), c = "obj." + nm.methods[op] + "(" + t.vals[j].map((v, i) => "a" + i).join(", ") + ")";
        b.push("            { " + ds + (t.rets[j] === "void" ? c + "; out.push(dts::V::N);" : "out.push(" + conv(c, t.rets[j]) + ");") + " }"); });
      b.push("            dts::V::L(out)");
    }
    return "        dts::Test { input: " + strLit(t.show, "rust") + ", exp: " + (M.design ? "dts::V::L(vec![" + t.exp.map((v, j) => rsV(v, t.rets[j])).join(", ") + "])" : rsV(t.exp, M.expType)) +
           ", run: Box::new(|| {\n" + b.join("\n") + "\n        }) },\n";
  });
  return header(p, "rust") + PRE.rust_head + USER_START("//") + code + USER_END("//") + PRE.rust_run + "fn dts_tests() -> Vec<dts::Test> {\n    vec![\n" + T.join("") +
         "    ]\n}\n\nfn main() {\n    let worker = std::thread::Builder::new().stack_size(256 << 20).spawn(|| dts::run_all(" + strLit(M.title, "rust") + ", " + M.anyOrder + ", " +
         fmtFloat(M.tol) + ", dts_tests())).unwrap();\n    if worker.join().is_err() {\n        std::process::exit(2);\n    }\n}\n";
}

function scalaProgram(p, M, code){
  const nm = names(p.sig, "scala");
  const decl = (n, v, t) => "val " + n + ": " + scTy(t) + " = " + scLit(v, t);
  const conv = (e, t) => t === "tree" ? "DtsHarness.treeV(" + e + ")" : t === "linkedlist" ? "DtsHarness.listV(" + e + ")" : "DtsHarness.toV(" + e + ")";
  const T = M.tests.map(t => {
    const b = [];
    if (!M.design) {
      t.args.forEach((v, i) => b.push("      " + decl("a" + i, v, M.params[i].t)));
      const c = "Solution." + nm.fn + "(" + t.args.map((v, i) => "a" + i).join(", ") + ")";
      if (M.inplace === null) b.push("      " + conv(c, M.ret)); else b.push("      " + c, "      " + conv("a" + M.inplace, M.params[M.inplace].t));
    } else {
      b.push("      val out = scala.collection.mutable.ArrayBuffer[Any]()");
      t.vals[0].forEach((v, i) => b.push("      " + decl("c" + i, v, t.types[0][i])));
      b.push("      val obj = new " + M.cls + "(" + t.vals[0].map((v, i) => "c" + i).join(", ") + ")", "      out += null");
      t.ops.forEach((op, j) => { if (!j) return;
        const ds = t.vals[j].map((v, i) => decl("a" + i, v, t.types[j][i]) + "; ").join(""), c = "obj." + nm.methods[op] + "(" + t.vals[j].map((v, i) => "a" + i).join(", ") + ")";
        b.push("      locally { " + ds + (t.rets[j] === "void" ? c + "; out += null" : "out += " + conv(c, t.rets[j])) + " }"); });
      b.push("      out.toVector");
    }
    return "    DtsHarness.Test(" + strLit(t.show, "scala") + ", " + (M.design ? "Vector[Any](" + t.exp.map((v, j) => scV(v, t.rets[j])).join(", ") + ")" : scV(t.exp, M.expType)) +
           ", () => {\n" + b.join("\n") + "\n    })";
  });
  return header(p, "scala") + PRE.scala_head + USER_START("//") + code + USER_END("//") + PRE.scala_run + "object DtsTests {\n  def all: Vector[DtsHarness.Test] = Vector(\n" + T.join(",\n") +
         "\n  )\n\n  def main(args: Array[String]): Unit = DtsHarness.runAll(" + strLit(M.title, "scala") + ", " + M.anyOrder + ", " + fmtFloat(M.tol) + ", all, args)\n}\n";
}

const GEN = {python:pyProgram, go:goProgram, cpp:cppProgram, rust:rustProgram, scala:scalaProgram};

/* the whole test program: runtime + code + tests. code defaults to the problem's reference solution in that language */
function program(p, lang, code){
  if (!GEN[lang]) fail("unknown language " + lang);
  const M = prepare(p);
  if (code === undefined) code = ((p.langs || {})[lang] || {}).solution;
  return GEN[lang](p, M, withNL(code));
}

/* a short signature line for the page, such as two_sum(nums: list[int], target: int) -> list[int] */
/* a type as a Python hint (TreeNode / ListNode as on LeetCode), for the signature line */
function pyHint(t){
  if (t === "int" || t === "long") return "int";
  if (t === "tree") return "Optional[TreeNode]";
  if (t === "linkedlist") return "Optional[ListNode]";
  if (t === "void") return "None";
  if (typeof t === "string") return t;
  return t[0] === "list" ? "list[" + pyHint(t[1]) + "]" : "Optional[" + pyHint(t[1]) + "]";
}
/* a short signature line for the page: Python hints for python, the sig's own type names otherwise */
function signature(p, lang){
  const sig = p.sig, nm = names(sig, lang), ty = t => lang === "python" ? pyHint(t) : typeStr(t);
  const ps = list => (list || []).map(x => x[0] + ": " + ty(parseType(x[1]))).join(", ");
  if (!sig.design) return nm.fn + "(" + ps(sig.params) + ") -> " + ty(parseType(sig.returns, true));
  return "class " + sig.design + ": " + [nm.ctor + "(" + ps(sig.init) + ")"].concat(sig.methods.map(m => nm.methods[m.name] + "(" + ps(m.params) + ") -> " + ty(parseType(m.returns, true)))).join(", ");
}

const API = {LANGS, PRE, program, prepare, command, fileName, signature, names, parseType, typeStr, HarnessError, version:1,
             _:{fmtFloat, fmtInt, strLit, snake, camel, canonTree, goSplit}};
if (typeof module === "object" && module.exports) module.exports = API;
else root.DTSHarness = API;
})(typeof self !== "undefined" ? self : this);
