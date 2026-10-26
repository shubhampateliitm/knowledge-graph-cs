# Writing practice problems (v9)

Root: /tmp/claude-0/-home-claude/0dc6e862-1194-53b2-88f9-ad8a3966ed3c/scratchpad/kgcs
Format: content/NEW_CONTENT.md section 4 (read it), and look at 3 existing entries in content/practice/problems.json.
Your lines of content/drafts/practice_v9_list.txt are given in your prompt; each is `pattern | Title URL ; Title URL ; ...`.
For every problem on your lines write one JSON object. Rules:
- id: kebab-case slug from the LeetCode URL; skip a problem if that id already exists in problems.json.
- pattern: reuse an existing pattern name from problems.json when the line says "(more)" or clearly matches one
  (print them: python3 -c "import json;print(sorted({p['pattern'] for p in json.load(open('content/practice/problems.json'))}))");
  otherwise use the line's pattern name without the parenthesis part.
- concepts: 1–3 existing concept ids (python3 tools/kg_ids.py <filter>), e.g. graphsalgo, dp, trees, hashtables, rangeq, unionfind.
- statement: your own plain-English statement (do NOT copy LeetCode text), with the input/output contract and limits.
- hint (one line), approach (why it works, 80–160 words), complexity, followups (2–3).
- JavaScript: fn, params, starter, solution (correct, readable). Trees as level-order arrays with null, linked lists as
  arrays, graphs as edge lists — convert inside the solution. 6–10 tests including edge cases; order_insensitive when
  the answer order does not matter. Plain JSON only.
- For design problems (LRU/LFU, Min Stack...), use the class-operations convention already used in problems.json if
  one exists (grep for "ops" or "Cache"); otherwise model it as fn(operations, args) -> outputs array.
Write a JSON array to content/drafts/practice_v9_K.json (K given in your prompt). Validate: copy check_practice.js's
logic or run `node tools/check_practice.js content/drafts/practice_v9_K.json` if it accepts a path (read it first);
every solution must pass all its tests. Do not edit problems.json or any other file.
Report: count of problems written, skipped, and any that you could not make pass.
