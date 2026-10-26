# Problem map: instructions for family writers

The problem map orders all 3,476 catalog problems as a DAG: each problem names the 1–3 easier problems whose
solution it reuses or extends, and says in a few words what it adds. Problems are pinned to **ideas** (techniques and
insights, from "iterate an array" up to "rerooting DP"), and ideas are pinned to the concepts of the Down the Stack map
(L2–L4). A mind-map page will draw it with the foundations at the bottom.

The backbone is fixed and already written:

- `content/problemmap/catalog.json` — the problems: `{n, title, slug, difficulty, tags, url}`.
- `content/problemmap/backbone.json` — `ideas` (264, each with `id, name, family, level, builds_on, concepts, anchor,
  anchor_prereqs, summary, new_concept`) and `families` (18, each with `id, name, description, ideas, problems`).
  Every catalog problem is in exactly one family.

You write **one family**: the file `content/drafts/pm_<family>.json`, with one entry for every problem in that family.
Do not edit any other file. If the backbone looks wrong (a missing idea, a problem in the wrong family), finish your
file anyway and put the issue in your report (see "Report" below).

## 1. Get started

```
python3 tools/check_problemmap.py --ideas                 # every idea: level, family, anchor, builds_on, concepts, summary
python3 tools/check_problemmap.py --ideas <family>        # just the ideas that belong to your family
python3 tools/check_problemmap.py --list <family>         # your problems with tags; anchors are marked
python3 tools/check_problemmap.py --skeleton <family> > content/drafts/pm_<family>.json   # starting file
```

The skeleton has one line per problem. Anchor problems already have `idea` and `prereqs` filled in; everything else is
blank. Read the idea table once from top to bottom before you start: you will pick ideas from **all** families, not
only your own (a heap problem in the greedy family can be about `dijkstra`; a tree problem can be about `treedp`).

## 2. File format

```json
{"family": "pointers", "problems": [
  {"n": 15, "idea": "ksum", "uses": [], "prereqs": [167], "new": "Fix the first number, then solve the remaining pair with two pointers and skip repeats."},
  {"n": 16, "idea": "ksum", "uses": [], "prereqs": [15], "new": "Track the sum closest to the target instead of an exact match."},
  {"n": 18, "idea": "ksum", "uses": [], "prereqs": [15], "new": "Wrap one more fixed loop around 3Sum, skipping duplicates at every level."},
  {"n": 26, "idea": "writeptr", "uses": [], "prereqs": [27], "new": "Keep an item only when it differs from the last kept one."},
  {"n": 30, "idea": "anagram-win", "uses": ["signature"], "prereqs": [438], "new": "The window moves one whole word at a time, once for each starting offset."}
]}
```

Keep one problem per line, in the skeleton's order (by problem number). Fields:

| field | required | meaning |
|---|---|---|
| `n` | yes | problem number from the catalog |
| `idea` | yes | the **primary idea**: the one technique this problem is about (any family) |
| `uses` | no (default `[]`) | 0–5 other ideas the solution also needs, usually lower-level ones; never repeat `idea` |
| `prereqs` | yes | 1–3 problem numbers that must come before it (see rules); `[]` only for anchors of level-0 ideas |
| `new` | yes | at most 18 words: what this problem adds beyond its prerequisites |
| `concepts` | no | extra concept ids (from `python3 tools/kg_ids.py`) that the problem touches beyond its ideas' concepts |

Do not add other fields. Depth (longest path from a root), per-concept lists and "unlocks" are computed by the merge.

## 3. Choosing `idea` and `uses`

- `idea` is the technique a learner must add to their toolbox to solve the problem, not the first tag. "Daily
  Temperatures" is `mono-next`, not `stackmatch`; "Swim in Rising Water" is `minimax-path`, not `bfsgrid`.
- If the problem needs two techniques, the primary idea is the **higher-level** one (the one that is new), and the
  other goes into `uses`. Example: "Kth Smallest Element in a Sorted Matrix" (#378): `idea: "bskth"`.
- `uses` lists the other ideas a solver must combine, at most 5, most important first. Leave out trivial ones that every
  solution has (`scan` inside a DP loop). Do not list the ideas in your primary idea's `builds_on` unless the problem
  uses them in an extra way.
- An idea's level is fixed by the backbone. A problem's level is its primary idea's level.
- If two ideas fit equally, prefer the one in your own family; if no idea fits well, pick the closest and list the
  problem in your report with the idea you would add.

## 4. Choosing `prereqs` (the DAG)

A prerequisite is an **easier problem whose solution this one reuses or extends**: the same trick with one more twist,
or a part of this solution that is a whole earlier problem. It is not "a problem with the same tag".

Rules (the checker enforces 1–5; 6–8 are judgement):

1. 1–3 problem numbers, each in the catalog, no duplicates, not the problem itself.
2. **Level**: every prerequisite's primary-idea level must be ≤ this problem's level. If you want a prerequisite whose
   idea is higher than yours, your primary idea is probably too low; move up.
3. **No cycles** across all families.
4. **Anchors.** Each idea has one anchor: the simplest catalog problem that introduces it (`--list` marks them). An
   anchor's `idea` must be one of the ideas it anchors, and its `prereqs` may only be anchors of lower-level ideas. Use
   the backbone's `anchor_prereqs` for that idea (the skeleton fills them in); do not change them unless they are empty
   and you have a strong reason. When a problem anchors two ideas (e.g. #307 anchors `segtree` and `fenwick`), the
   skeleton puts the lower one in `idea` and the other in `uses`; keep that unless the other fits clearly better.
5. Only anchors of level-0 ideas may have `[]`. Every other problem has at least one prerequisite. A plain problem whose
   idea is level 0 points to that idea's anchor (or to an easier problem that already uses the idea).
6. **Prefer the closest step, not the root.** If 3Sum Closest extends 3Sum, point to 3Sum (#15), not to Two Sum II.
   Chains of real "same idea plus one twist" steps are what give the map depth. But do not build an artificial chain
   (I → II → III → IV) when part IV only reuses part I; point each to what it really reuses.
7. At least one prerequisite should share the primary idea, one of its `uses`, or one of the idea's `builds_on`
   (the checker warns otherwise). A good default for the first problem after an anchor is the anchor itself.
8. **Prefer your own family.** Cross a family boundary when the reuse is real (Add Two Numbers #2 reuses Add Binary #67
   from strings). Anchors are always safe targets; for other problems in another family, their level is only checked
   once that family's draft exists, so make sure the problem really is easier and uses an idea of level ≤ yours.
9. Numbered series ("Stone Game", "Jump Game II", "Best Time to Buy and Sell Stock IV") are a hint, not a rule: link to
   an earlier part only if its solution is actually reused.

## 5. Writing `new`

- At most 18 words, one plain sentence in easy English (many readers are not native speakers). Short words, active
  voice, no jargon that the idea name does not already use.
- Say what this problem **adds** beyond its prerequisites: the twist, the extra state, the reason the old trick needs
  a change. Not a restatement of the title, not "This problem is about...".
  - good: "Track the closest sum instead of an exact match." (3Sum Closest)
  - good: "Allow k zeros inside the window; shrink only when there are more than k." (Max Consecutive Ones III)
  - bad: "A classic sliding window problem." / "Use two pointers to solve it efficiently in O(n) time."
- For an anchor, say the idea in one line as it shows up in that problem.
- Write from your own understanding of the problem. Never copy or paraphrase editorial, solution or discussion text, and
  do not fetch problem pages; the title, tags and your own knowledge are enough. No code.
- If you do not know a problem (new, premium 🔒, or unfamiliar), infer conservatively from title and tags, keep `new`
  modest, and list it in your report as low confidence.

## 6. `concepts` (optional)

Each idea already pins its concepts (see `--ideas`). Add a concept only when the problem itself touches a concept its
ideas do not: "Design Snake Game" adds `queuesbuf`; "Web Crawler Multithreaded" adds `crawling`, `threadpool`;
"Encode and Decode TinyURL" adds `idgen`, `hashfn`; "UTF-8 Validation" adds `unicode`; "LRU Cache" needs nothing extra.
Use ids from `python3 tools/kg_ids.py <words>` or the proposed new ids in `content/drafts/pm_new_concepts.txt`
(`prefixsums, twopointers, binsearch, monostack, linkedlist, mst, lca, combgames`). Keep it to 0–3 per problem.

## 7. Check, then report

```
python3 tools/check_problemmap.py <family>      # must print 0 errors; read the warnings
python3 tools/merge_problemmap.py --partial     # optional: see your family in content/problemmap/map.json
```

The checker loads every draft that exists, so cross-family levels and cycles are checked against the others' work too.
Fix all errors. A warning "prerequisite N not checked" is fine for now but the final merge (all families present) treats
it as an error, so make sure such a prerequisite is genuinely an easier problem.

**Report** (your final message, not a file): number of problems written; ideas used most; problems that seem to be in
the wrong family (with the family you suggest); problems where no idea fits (with a proposed idea: id, name, builds_on,
anchor); low-confidence entries. The coordinator merges all families with `python3 tools/merge_problemmap.py`.

## Appendix: families

| id | name |
|---|---|
| arrays | Arrays, hashing & sorting |
| prefix | Prefix sums, difference arrays & sweeps |
| pointers | Two pointers & sliding windows |
| stacks | Stacks, queues, monotonic structures & linked lists |
| binsearch | Binary search |
| trees | Trees & binary search trees |
| graphs | Graph traversal, topological sort & union–find |
| advgraphs | Shortest paths & advanced graphs |
| greedy | Heaps, greedy & intervals |
| backtrack | Recursion & backtracking |
| dp1 | Dynamic programming 1: linear, knapsack, grid & sequences |
| dp2 | Dynamic programming 2: interval, tree, bitmask, digit & games |
| strings | Strings: processing, parsing, tries & matching |
| math | Math: number theory, combinatorics, geometry, probability & games |
| bits | Bit manipulation |
| design | Design & range data structures |
| sim | Simulation & matrices |
| misc | Platform topics: JavaScript, pandas/SQL & concurrency |
