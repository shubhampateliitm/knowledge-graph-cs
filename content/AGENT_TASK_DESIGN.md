# Writing system design questions (v9)

Root: /tmp/claude-0/-home-claude/0dc6e862-1194-53b2-88f9-ad8a3966ed3c/scratchpad/kgcs
Read first: content/NEW_CONTENT.md section 2 (design format), content/FORMAT.md (rich text: LaTeX, ```sql/```json code
blocks, **bold**, callouts), content/WRITING.md (style: plain easy English, short sentences, concrete numbers,
mechanism over adjectives; never Al Jazeera or The Wire), and one existing design as a model:
`content/design/designs_a.txt` (the first block, @@ rate-limiter).

Your list: lines of content/drafts/designs_v9_list.txt given in your prompt. Each line: `id | title | category |
concept ids` (concept list may end with a ` #Pn` tag; drop it). Concept ids exist in the map (`python3 tools/kg_ids.py
<filter>`); mention every listed concept by name in the text, most important first, 8–20 concepts.
Write one `@@ id` block per line into your draft file content/drafts/<your file>.txt, in the order given.
- 2,500–3,800 words each. Real numbers in estimates with the arithmetic shown. Diagram ≤72 columns.
- api: endpoints as code-like lines; datamodel: tables/keys; use a ```sql block where a schema or query helps.
- For AI & ML designs: requirements (objective, offline/online metrics), data and labels, features, model choice
  and why, training pipeline, serving (latency budget, caching, batching), evaluation (offline, A/B), monitoring and
  drift, failure modes, tradeoffs.
- For mobile designs: client architecture (layers, offline storage, sync, pagination, caching, image loading,
  push), API contract, battery and network constraints, failure modes.
- Verify product facts you state; leave a ref URL empty unless you fetched it.
Check after each design: `python3 tools/checkdesign.py content/drafts/<your file>.txt` and fix every problem.
Do not edit any other file. Report briefly: per design words and status; facts from memory.
