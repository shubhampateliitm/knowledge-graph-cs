# Practice problems in Python, Go, C++, Rust and Scala (for writers)

Every practice problem in `content/practice/problems.json` has JavaScript code (the top-level `fn`, `params`,
`starter`, `solution`). Your job: add the other five languages to a batch of problems. **Python is the main language**:
it is the default in the app and runs in the learner's browser. Go, C++, Rust and Scala are shown in the editor, and the
learner copies a generated test program to run in a terminal. JavaScript stays as it is.

You add two fields per problem:

- `sig`: a typed signature. From it and the existing tests, a generator builds a complete test program in each language.
- `langs`: per language, a `starter` (what the learner sees first) and a `solution` (the reference answer).

You do **not** edit `problems.json`, the statement, the tests or the JavaScript. You write a patch file and check it.

## 1. What you deliver

One file per batch: `content/drafts/practice_langs_K.json` (K is given in your prompt; batch K's problem ids are line K
of `content/drafts/practice_langs_list.txt`, with hints such as `[tree]`, `[design, long]`, `[any-order]`). It is a
JSON array:

```json
[
 {"id": "two-sum",
  "sig": {"name": "two_sum", "params": [["nums", "list[int]"], ["target", "int"]], "returns": "list[int]"},
  "langs": {
   "python": {"starter": "...", "solution": "..."},
   "go":     {"starter": "...", "solution": "..."},
   "cpp":    {"starter": "...", "solution": "..."},
   "rust":   {"starter": "...", "solution": "..."},
   "scala":  {"starter": "...", "solution": "..."}}}
]
```

Only the keys `id`, `sig`, `langs`. All five languages, each with a non-empty `starter` and `solution`. The pilot,
`content/drafts/practice_langs_0.json`, has 12 complete entries (array, string, tree, linked list, graph, DP, two
design classes, any-order and float answers). Read 3 of them before you start; copy their style.

Tip: write the code in normal files or in a small Python script that builds the JSON (escaping code by hand in JSON is
slow and error-prone). End every code string with a newline.

## 2. Workflow

1. Read the problem: `statement`, `tests`, `fn`, `params`, `order_insensitive`, and the JavaScript `solution`
   (it shows how the arrays in the tests are meant: tree, linked list, graph...).
2. Write `sig` (section 3). Check it at once: `python3 tools/check_langs.py content/drafts/practice_langs_K.json --langs python`
   gives `SIG ERROR` with the exact test and value if the types do not fit the tests.
3. Write the Python solution and starter, then Go, C++, Rust, Scala.
4. Check everything:

       python3 tools/check_langs.py content/drafts/practice_langs_K.json --starters
       python3 tools/check_langs.py content/drafts/practice_langs_K.json --ids lru-cache -v      (one problem, every failing test)

   Every solution must pass every test in python, go, cpp and rust. Every starter must compile and run (its tests fail,
   that is fine). `scala -` / "not checked" is expected: scala-cli is not installed here, so read section 7 twice.
   The checker also confirms that the app's JavaScript generator gives the same program (`PARITY` would be a tool bug:
   report it).
5. Look at one generated program per language, as the learner will see it:

       python3 tools/langharness.py two-sum rust --problems content/drafts/practice_langs_K.json            (solution)
       python3 tools/langharness.py two-sum rust --starter --problems content/drafts/practice_langs_K.json
       python3 tools/langharness.py two-sum go --problems content/drafts/practice_langs_K.json --out /tmp/x  (writes the file, prints the command)

6. Report: ids done, ids skipped and why, anything you could not make pass. The coordinator merges with
   `python3 tools/apply_lang_patches.py content/drafts/practice_langs_K.json` (it re-runs every check and writes
   nothing unless all pass), then `python3 tools/build.py`.

## 3. The signature (`sig`)

### Function problems

```json
{"name": "two_sum", "params": [["nums", "list[int]"], ["target", "int"]], "returns": "list[int]"}
```

- `name`: snake_case. Python and Rust use it as is (`two_sum`); Go, C++ and Scala use camelCase (`twoSum`), computed
  for you. Choose the LeetCode name in snake_case (`lengthOfLongestSubstring` -> `length_of_longest_substring`).
- `params`: `[name, type]` in the order of the test `args`. Names are snake_case (they show in the Python signature).
- `returns`: the type of `expected`.
- Optional `"tol": 1e-5`: the float tolerance (default 1e-6, relative: `|a-b| <= tol * max(1, |a|, |b|)`).
- Optional `"inplace": k` with `"returns": "void"`: the function changes parameter k in place (LeetCode's "do not
  return anything"); the tests compare that parameter after the call with `expected`. Example: rotate array,
  flatten a tree, reorder a list.

### Types

| type | means | Python | Go | C++ | Rust | Scala |
|---|---|---|---|---|---|---|
| `int` | whole number, 32-bit | `int` | `int` | `int` | `i32` | `Int` |
| `long` | whole number, 64-bit (keep values within ±2^53) | `int` | `int` | `long long` | `i64` | `Long` |
| `float` | number with decimals | `float` | `float64` | `double` | `f64` | `Double` |
| `bool` | true / false | `bool` | `bool` | `bool` | `bool` | `Boolean` |
| `str` | text | `str` | `string` | `string` | `String` | `String` |
| `list[T]` | array (nest for grids: `list[list[int]]`) | `list[T]` | `[]T` | `vector<T>` | `Vec<T>` | `Array[T]` (params) |
| `optional[T]` | T or null | `Optional[T]` | `*T` | `optional<T>` | `Option<T>` | `Option[T]` |
| `tree` | binary tree of ints, tests give level order with null (`[3,9,20,null,null,15,7]`) | `Optional[TreeNode]` | `*TreeNode` | `TreeNode*` | `Option<Rc<RefCell<TreeNode>>>` | `TreeNode` (null = empty) |
| `linkedlist` | singly linked list of ints, tests give `[1,2,3]` | `Optional[ListNode]` | `*ListNode` | `ListNode*` | `Option<Box<ListNode>>` | `ListNode` (null = empty) |
| `void` | only as `returns`, with `inplace`; or for design methods that return nothing | `None` | - | `void` | `()` | `Unit` |

`TreeNode` and `ListNode` are defined by the test program exactly as on LeetCode (Python `TreeNode(val, left, right)`;
Go `Val/Left/Right`; Rust `Rc<RefCell<..>>`; Scala `value/left/right` and `x/next`). The learner's code must not define
them again. A returned tree is compared in LeetCode's level order (children of null nodes are not listed, trailing
nulls dropped), so `expected` may be written either way.

Return types are flexible in the other languages: the harness converts whatever comes back (a Go slice or nil slice, a
C++ vector, a Rust Vec, a Scala Array / List / Vector / Seq, a Python list or tuple). What must match the table is the
**parameter** types, because the tests are passed as typed values.

### Choosing types for the existing tests

| the JavaScript version uses | use |
|---|---|
| a tree as a level-order array (it calls `buildTree`) | `tree` |
| a linked list as an array (it calls `arrToList`) | `linkedlist` |
| a list that has a cycle or shared nodes (linked-list-cycle, intersection) | keep the array and the extra parameters (`list[int]`, `int`); the solution builds the nodes itself, like the JavaScript one |
| a graph as an edge list / adjacency list | `list[list[int]]` |
| a grid of strings like `["110","011"]` | `list[str]` |
| single characters | `str` |
| any value that can be non-integer, or an average / probability / median | `float` (write `expected` as it is; 2 and 2.0 are the same) |
| integers that can exceed 2^31-1 | `long` |
| a result that can be null | `optional[T]` |
| a tree node returned "by value" (LCA returns a node's value in our tests) | `int` (keep the test's convention) |

If a problem needs something the grammar cannot express (a map/object, a mix of types in one list, a random answer),
skip it and say why in your report. Do not change tests.

### Design problems (classes, tests as operations)

The tests are `args: [operations, arguments]`, for example
`[["LRUCache","put","get"], [[2],[1,1],[1]]]` with `expected: [null, null, 1]`. The sig:

```json
{"design": "LRUCache",
 "init": [["capacity", "int"]],
 "methods": [{"name": "get", "params": [["key", "int"]], "returns": "int"},
             {"name": "put", "params": [["key", "int"], ["value", "int"]], "returns": "void"}]}
```

- `design`: the class name, exactly as the first operation in the tests.
- `init`: the constructor parameters (`[]` for none).
- `methods`: every operation the tests use, `name` spelled exactly as in the tests (camelCase). `returns: "void"`
  means the expected value of that call is null.
- Names per language (computed): Python methods snake_case (`addNum` -> `add_num`; the camelCase name also works),
  Go `func Constructor(...) LRUCache` and methods with a capital (`Get`, `AddNum`) on `*LRUCache`, C++ the class
  with its constructor, Rust `struct` + `impl` with `fn new(...) -> Self` and snake_case methods taking `&mut self` or
  `&self`, Scala `class LRUCache(_capacity: Int)`; zero-argument Scala methods are called with `()`, so declare them
  with `()` (`def findMedian(): Double`).

## 4. Starters

The starter is what the learner sees first. LeetCode-style signature, an empty body that **compiles and runs** (the
tests then fail). Use exactly these bodies:

| language | function | starter body |
|---|---|---|
| Python | `def two_sum(nums: list[int], target: int) -> list[int]:` | `    # your code` then `    pass` |
| Go | `func twoSum(nums []int, target int) []int {` | `\t// your code` then `\treturn nil` (`0`, `false`, `""`, `nil` as fits) |
| C++ | `class Solution { public: vector<int> twoSum(vector<int>& nums, int target) {` | `// your code` then `return {};` (`0`, `false`, `nullptr`) |
| Rust | `impl Solution { pub fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {` | `// your code` then `todo!()` |
| Scala | `object Solution { def twoSum(nums: Array[Int], target: Int): Array[Int] = {` | `// your code` then `???` |

- C++ parameters: `vector<...>&` and `string` as LeetCode does; any form that accepts a named variable works.
- Rust: parameters by value (`Vec<i32>`, `String`), except an `inplace` parameter, which is `&mut` (`nums: &mut Vec<i32>`,
  `root: &mut Option<Rc<RefCell<TreeNode>>>`, `head: &mut Option<Box<ListNode>>`). Rust tree problems: put
  `use std::cell::RefCell;` and `use std::rc::Rc;` at the top of starter and solution, as LeetCode does.
- Design starters: the class with every method, Python bodies `pass`, Go/C++ zero returns, Rust `todo!()` (and
  `fn new` returning an empty struct), Scala `???`. See lru-cache and find-median-from-data-stream in the pilot.
- For tree / linked-list problems add one comment line above the code, for example
  `# TreeNode is defined for you: TreeNode(val, left=None, right=None)` (Go: `// TreeNode is defined for you: type TreeNode struct { Val int; Left, Right *TreeNode }`).
- Python type hints use `list[int]`, `Optional[TreeNode]` (the test program imports `typing`). Python 3.9+.
- Indentation: Python 4 spaces, Go tabs, C++/Rust 4 spaces, Scala 2 spaces.

## 5. Solutions

- Correct, readable, idiomatic, and the **same algorithm as the problem's `approach`** with the stated complexity.
  No brute force when the approach is O(n). Short comments only where the reader needs them (an invariant, what a
  map holds). Same naming as the starter.
- Only the solution code: no `main`, no reading input, no printing, no tests, no `package` line, no `TreeNode`/`ListNode`
  definitions, and in Rust no `struct Solution;` (the harness defines it).
- Imports: write them as you normally would, at the top of the code (Python `from collections import deque`;
  Go `import "sort"` or an import block: it is moved to the file's import block automatically; Rust `use std::collections::HashMap;`;
  C++ needs none: the common standard headers and `using namespace std;` are included; Scala `import ...` or full names).
- Helpers: free functions or nested functions are fine (Go helper types too: name them specifically, e.g. `lruEntry`,
  not `node`, and never start a name with `dts`).
- Python: plain functions (`def two_sum(...)`), not `class Solution` (both work, but plain functions are the house style).
- Integer overflow: use `long long` / `i64` / `Long` / Go `int` for sums that can exceed 2^31.
- Floats: return a float type (`float64`, `double`, `f64`, `Double`).

## 6. How the test program compares results

- Exact match for ints, strings, bools, nulls and lists; ints and floats compare as numbers.
- Floats: relative tolerance `sig.tol` (default 1e-6).
- `order_insensitive: true` (already set on the problem): the outer list is compared as a multiset, and each inner
  list is sorted first. So `[[1,2],[3]]` equals `[[3],[2,1]]`.
- Trees and linked lists are compared as their level-order / value lists.
- In the app, Python runs with a 5-second limit for all tests together (CPython in WebAssembly is 2–5x slower than
  native); keep solutions efficient. The checker allows 10 seconds per program natively.

## 7. Scala without a compiler (read this)

Scala 3 code is not compiled here, so mistakes reach learners. Keep Scala solutions simple and use only:

- `object Solution { def name(...): T = { ... } }`; parameters `Array[...]`, `Int`, `Long`, `Double`, `String`,
  `Boolean`, `Option[...]`, `TreeNode`, `ListNode`.
- `scala.collection.mutable.{HashMap, HashSet, ArrayBuffer, Queue, Stack, PriorityQueue, ArrayDeque}` by full name or with
  an `import scala.collection.mutable` at the top; `math.max`, `math.min`.
- Loops: `while` loops and `for (i <- 0 until n)`. **No `return` inside a `for` or a lambda** (Scala 3 warns and it
  behaves badly); use a `while` loop and a `return` in the method body instead.
- No `???` in solutions, no `s"..."` interpolation needed, no implicit conversions, no `Array[Char]` tricks you have
  not seen work. `PriorityQueue[Int]()(Ordering[Int].reverse)` for a min-heap.
- Zero-argument methods in design classes: declare with `()`.
- Mirror the C++/Go solution line by line; it is the easiest way to stay correct.

If you know Scala and have scala-cli locally, run `scala-cli run <file>` on the programs from
`python3 tools/langharness.py <id> scala --out DIR`; mention it in your report.

## 8. Errors and what they mean

| message | fix |
|---|---|
| `SIG ERROR ... test 3, argument nums[2]: expected int ..., got 2.5` | the type is wrong (`float`?) |
| `... expected int (... use long for bigger values), got 3000000000` | `long` |
| `... expected tree (a level-order list of int or null)` | the value is not a level-order array: wrong type |
| `"returns": "void" needs sig.inplace` | add `"inplace": k`, or return the value |
| `unknown operation "getRandom"` | add the method to `sig.methods` |
| `MISSING ... no rust starter` | add it |
| `COMPILE ...` | the compiler message follows; line numbers are in the generated file (print it with tools/langharness.py) |
| `FAIL test 4: input ... expected ... got ...` | the solution is wrong for that input |
| `CRASH` | the program died without a report (stack overflow, segfault); recursion too deep? |
| `TIMEOUT` | infinite loop, or too slow |
| `(starter COMPILE)` | the starter must compile: return a zero value / `todo!()` / `???` |
| `the starter is the same as the solution` (apply tool) | the starter must not contain the answer |

## 9. Checklist per problem

- [ ] `sig` fits every test (checker shows no SIG ERROR); names snake_case; `returns` right; `inplace` only when needed.
- [ ] Five languages, each with starter and solution; starters compile and fail; solutions pass.
- [ ] Solutions follow the problem's approach and complexity; idiomatic; no I/O.
- [ ] Rust tree problems have the `Rc`/`RefCell` use lines; Go code has its imports; Scala follows section 7.
- [ ] You looked at one generated program (`tools/langharness.py`) and it reads well.
