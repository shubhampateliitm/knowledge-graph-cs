# Architecture patterns and MIT/Caltech curricula: status (October 2026)

Request (from Shubham): add common architecture patterns, with a visualization for each, to every tech/tool/concept;
look at Stanford, MIT and Caltech courses and add what adds value to this stack.

## Done

- Format, auto-layout compiler (`tools/patterns.py`), checker (`tools/checkpatterns.py`), spec (`README.md`),
  writer brief (`content/AGENT_TASK_PATTERNS.md`), gold example (`p_gold.txt`, Kafka).
- 1,665 patterns on all 664 L0-L3 concepts (`pt01_L0` ... `pt37_L3`, `v11a`, `v11b`). Each has an animated diagram.
- Catalog: 208 canonical patterns in 11 families. Every URL was checked with curl in October 2026 (bot-blocked but
  stable pages, such as O'Reilly, were kept). Writers' proposals were merged and de-duplicated; about a dozen
  patterns still have `kind: none` and show under "Other patterns" in the Patterns view.
- App: "Architecture patterns" read section (tabs, scene player, catalog chips), Patterns view (`#architecture`,
  `#architecture/<id>`), deep links `#pattern/<concept>/<n>`; server `/api/patterns`, summaries and catalog in
  `/api/graph`. The old `#patterns` hash stays the Algorithms "Which pattern?" cheat sheet.
- Curricula: `@school` lines (kg.py, DB tables `schools`, `programs.school`, `courses.school`), school-aware
  "Taught in" lines and program buttons. `mit.txt` (6-3 SB and 6-P MEng, MIT catalog 2026-27), `caltech.txt` (CS
  option, Caltech catalog 2026-27) and six more Stanford courses (CS 224W, 240, 244, 348K, 349D, 217), each checked on
  the official page. New concepts these courses teach: pruning, chainrep, kbypass, graphemb, itp (nodes_v11,
  edges_v11, deep reads d_r68_v11a/b).

## Possible next steps

- Give the remaining `kind: none` patterns catalog ids when a canonical pattern exists.
- Scene thumbnails for patterns in the Animations gallery (needs the full pattern scenes there).
- Short reads (`content/reads/*.txt`) for the five v11 concepts (their deep reads already cover every section).
