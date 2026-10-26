# New content types (read together with WRITING.md)

Reader: a senior engineer preparing to pass staff-level interviews and to understand systems from first principles.
Plain, easy English (not a native speaker), short sentences, concrete numbers, mechanism over adjectives, correct as of
October 2026. Never use Al Jazeera or The Wire. Diagrams and animation frames: plain ASCII, at most 72 columns.
Concept ids must exist in the map: list them with `python3 tools/kg_ids.py [filter]` (prints id, layer, label).

## 1. New sections for concept reads (content/reads/...)

- `tradeoffs:` — "It depends: trade-offs". 3–6 paragraphs. Each paragraph is one decision: "Choose X when …; choose Y
  when …", naming the deciding factors (scale, latency, consistency, cost, team skills, data shape) with numbers where
  possible, and what you give up either way. Required for L0–L2 concepts, recommended for L3.
- `interview:` — "In the interview". 4–6 lines `question || strong answer outline`, the probing questions a staff-level
  interviewer asks about this concept (follow-ups, failure cases, scaling limits, "why not X?"). Answers: 2–5 sentences,
  the key points a strong candidate would make.
- `animation:` — a step-by-step animation of the mechanism, shown with play/next controls. Put `animation:` alone on a
  line, then frames. Each frame starts with a line `== caption of this step` (one sentence), followed by indented ASCII
  drawing lines. 4–10 frames; keep every frame the same size so the eye sees only what changed.
  Example:
      animation:
      == The client sends SYN with its initial sequence number.
        client  --SYN seq=100-------------->  server
      == The server answers SYN-ACK: its own sequence number and ack = 101.
        client  <--SYN-ACK seq=300 ack=101--  server

## 2. System design questions (content/design/<file>.txt)

One file per batch, one block per question:

    @@ url-shortener
    title: Design a URL shortener
    category: Web & product | Data & analytics | Infrastructure | Ads & media | AI & ML
    level: Senior / Staff
    concepts: conshash, partitioning, cachelayer, kvcache, ...      (8–20 concept ids, most important first)
    summary: 1 paragraph: what is being built and what makes it hard.
    requirements: functional and non-functional requirements (one paragraph each); state the assumptions you choose.
    estimates: back-of-the-envelope numbers step by step: users, QPS (average and peak), storage per year,
               bandwidth, memory for caches, number of machines. Show the arithmetic.
    api: the main API calls, one per paragraph (method, path, inputs, outputs).
    datamodel: tables or key layouts, partition keys, indexes, and why.
    design: 4–8 paragraphs walking through the high-level design and the path of the main requests.
    diagram:
      (ASCII architecture diagram, max 72 columns)
    animation:
    == (optional: 4–8 frames following one request through the design)
    deepdive: 4–8 paragraphs on the hardest parts (hot keys, consistency, ordering, exactly-once, fan-out, ...).
    tradeoffs: 3–6 paragraphs "It depends": alternatives considered and when each wins.
    failures: what breaks (node, zone, region, dependency, overload, bad deploy) and how the design survives.
    evolution: how the design changes from 1k to 1M to 1B users (optional but valuable).
    followups: 5–8 lines `interviewer follow-up question || strong answer outline`.
    ref: kind | title | who, year | url-if-verified        (3–6 refs: papers, engineering blogs, books)

Target 2,500–3,500 words per design. Every concept id you list should actually be used in the text; mention concepts
by their names so the reader can open them from the concept chips. Check with
`python3 tools/checkdesign.py content/drafts/<file>.txt`.

## 3. Journeys: "What happens when …" (content/graph/tours_journeys.txt)

Same format as content/graph/tours.txt:

    ## What happens when you open https://example.com | from the keystroke to photons and back
    browser | 120–220 words: what happens at this step, concretely, and why ...
    dns | ...

Each step names one concept id (the left part) and explains what that layer does in this journey, with real numbers
(bytes, milliseconds, packet counts, syscalls). 12–25 steps, going down through the layers (L0 to L5) and back up,
so the reader sees every layer at work. Order steps in time order of the journey. Check with
`python3 tools/build.py --check` after copying your file into place (or ask the coordinator).

## 4. Practice problems (content/practice/problems.json)

A JSON list of objects:

    {"id": "two-sum", "title": "Two Sum", "pattern": "Hashing", "difficulty": "Easy",
     "link": "https://leetcode.com/problems/two-sum/", "concepts": ["hashtables"],
     "statement": "...", "hint": "...", "approach": "... why it works ...", "complexity": "O(n) time, O(n) space",
     "fn": "twoSum", "params": ["nums", "target"],
     "tests": [{"args": [[2,7,11,15], 9], "expected": [0,1]}, ...],          (5–10 tests incl. edge cases)
     "order_insensitive": false,                                              (true: compare sorted outputs)
     "starter": "function twoSum(nums, target) {\n  // your code\n}\n",
     "solution": "function twoSum(nums, target) { ... }\n",
     "followups": ["What if the array is sorted?", "..."]}

Inputs and outputs must be plain JSON (arrays, numbers, strings, booleans, null). Represent trees as level-order
arrays with null, linked lists as arrays, graphs as edge lists. Solutions must pass all tests (check with
`node tools/check_practice.js`).

The fields above are the **JavaScript** version (fn, params, starter, solution). Python (the main language), Go, C++,
Rust and Scala come from two more fields:

    "sig": {"name": "two_sum", "params": [["nums", "list[int]"], ["target", "int"]], "returns": "list[int]"},
    "langs": {"python": {"starter": "...", "solution": "..."}, "go": {...}, "cpp": {...}, "rust": {...}, "scala": {...}}

- `sig` types the existing tests: `int`, `long`, `float`, `bool`, `str`, `list[T]`, `optional[T]`, `tree` (a
  level-order list with null in the tests; TreeNode in the code), `linkedlist` (a list in the tests; ListNode in the
  code). `"returns": "void"` with `"inplace": k` compares parameter k after the call. `"tol"` sets the float tolerance
  (default 1e-6, relative). `name` is snake_case (Python and Rust); Go, C++ and Scala use its camelCase.
- Design (class) problems keep the `[operations, arguments]` tests and use
  `{"design": "LRUCache", "init": [["capacity", "int"]], "methods": [{"name": "get", "params": [["key", "int"]], "returns": "int"}, ...]}`
  with method names spelled as in the tests (`void` methods expect null).
- `langs` has a LeetCode-style starter that compiles and runs, and a reference solution, for each of the five.
- The test program for any language comes from `sig` + `tests` (`tools/langharness.py`, and `web/langharness.js` in the
  browser). Python runs in the browser with Pyodide; the others are copied out and run in a terminal.
- Writers add languages in patch files `content/drafts/practice_langs_K.json` (a list of `{id, sig, langs}`), check
  them with `python3 tools/check_langs.py <patch> --starters`, and the coordinator merges them with
  `python3 tools/apply_lang_patches.py <patch>`. Full rules and examples: `content/PRACTICE_LANGS.md`.
