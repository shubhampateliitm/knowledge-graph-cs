# Down the Stack

A layered map of computer science, from the tools you use (Kafka, Spark, Delta, Pinot, Postgres, Kubernetes, LLMs, GPUs) down through systems patterns, core techniques, CS foundations and mathematics to first principles in physics, biology and philosophy.

Every concept has a read with the same shape:

- **Why it exists**: the value this layer adds
- **How it works**: the mechanism, and how the layers below make it possible
- **What it stands on**: generated from the graph, one line per lower-layer idea
- **Why it makes sense**: the intuition
- **Where it still hurts**: the friction that remains
- **Go deeper**: papers, books, articles, courses and docs

Reads can also have **It depends: trade-offs**, **In the interview** (staff-level questions with answer outlines) and a step-by-step **animation** of the mechanism (Back / Play / Next, arrow keys; no autoplay when you ask for reduced motion).

Tabs:

- **Tours**: complete descents; "What happens when…" journeys come first.
- **Design**: system design interview questions (requirements, estimates, API, data model, design with diagram and animation, deep dives, trade-offs, failure modes, evolution, follow-ups). Each links to the concepts it uses (chips, a concept map by layer, and "Study these concepts" as a reading sequence); every concept lists the design questions that use it.
- **Algorithms**: 23 step-by-step visualizers (sorting, binary search, two pointers, sliding window, BFS/DFS, Dijkstra, topological sort, union–find, heaps, hash tables, LRU, Bloom filter, consistent hashing, trie, DP tables) with pseudocode, narration, counters and your own input; and **Practice** problems grouped by pattern, with a code editor, tests run in a Web Worker (2-second limit), hint / approach / solution and follow-ups.

A **Courses** view maps the Stanford BS and MS curriculum (CS 103 to CS 336) onto the graph: pick a course and study its concepts in order.

Today: 582 concepts in six layers, 1,591 links (each with its own reason), 21 tours, 31 Stanford courses, about 144,000 words and 1,360 sources.

Long "deep reads" (51 of them, 5 to 12 minutes) add **How we got here**, **A worked example** and **In practice**. Every L1 system concept also has history and practice notes, and each of the six layers has a 10-minute essay.

## Run it

```bash
./run.sh            # builds data/content.db, then serves http://localhost:8787
./run.sh 9000       # another port
```

Needs only Python 3.9+ (standard library: `http.server`, `sqlite3` with FTS5). No packages to install.

## What is where

```
content/graph/        nodes*.txt, edges*.txt, tours.txt      the graph (plain text, easy to diff)
content/reads/        *.txt                                   one read per concept (and L0..L5 layer essays)
content/reads/long/   *.txt                                   long reads: "@@ id" replaces, "@@+ id" extends
content/curriculum/   *.txt                                   Stanford BS/MS programs and courses mapped to concepts
content/design/       *.txt                                   system design questions ("@@ id", see content/NEW_CONTENT.md section 2)
content/practice/     *.json                                  practice problems (JSON lists, concatenated; see NEW_CONTENT.md section 4)
tools/kg.py           parser + validator (every node has a read, every edge has a reason, every node reaches L5)
tools/build.py        content -> data/content.db (SQLite + FTS5) and dist/down-the-stack.html (single shareable file)
server/server.py      local API + static web server (Python standard library only)
web/                  the app (index.html, app.css, app.js, algo.js = Algorithms tab); works against the API or with embedded data
tests/                test_api.py (unittest), e2e.js (Playwright browser test), fixtures/problems_sample.json
data/                 content.db (rebuilt) and user.db (your progress, bookmarks, notes; never rebuilt)
```

## API

| Method | Path | What |
|---|---|---|
| GET | `/api/graph` | all concepts (summary), links, tours, layers, stats |
| GET | `/api/read/<id>` | full read for a concept or layer essay (`L0`..`L5`) |
| GET | `/api/search?q=` | full-text search over every read and design question (FTS5, BM25; phrase hits first; designs come back as `design/<id>`) |
| GET | `/api/graph` → `designs`, `practice` | design summaries (id, title, category, level, concepts, minutes, summary) and all practice problems |
| GET | `/api/design/<id>` | full system design question (sections, sources) |
| GET | `/api/practice` | your saved code and solved marks |
| PUT/DELETE | `/api/practice/<id>` | `{"code": "...", "solved": true|false}` (either or both; code up to 60,000 characters) |
| GET | `/api/library` | every source, grouped by work, with the concepts that cite it |
| GET | `/api/graph` → `curriculum` | Stanford BS/MS programs, course groups and the concepts each course teaches |
| GET | `/api/me` | your progress, bookmarks, notes counts, reading time |
| PUT/DELETE | `/api/progress/<id>` | `{"status":"read"|"reading"}` |
| PUT/DELETE | `/api/bookmarks/<id>` | save / unsave |
| GET/POST/PUT/DELETE | `/api/notes` | your notes per concept |
| POST | `/api/time/<id>` | add reading time (capped per call) |
| GET | `/api/export` | download all your data as JSON |

The server binds to 127.0.0.1, rejects unexpected `Host` headers (DNS rebinding) and requires `application/json` for writes (so other websites cannot post to it).

## Editing content

Content formats for trade-offs, interview questions, animations, design questions, journeys and practice problems are in `content/NEW_CONTENT.md`. Check a design with `python3 tools/checkdesign.py <file>` and practice solutions with `node tools/check_practice.js`.

Add a concept: a line in `content/graph/nodes_*.txt` under its layer, edges in `edges_*.txt` with a reason for each link, and a read in `content/reads/`. Then `python3 tools/build.py --check` tells you exactly what is missing (no read, no sources, no path down to L5, an edge pointing upward...).

## Tests

```bash
python3 -m unittest discover -s tests -v          # API (builds into a temp DB with the sample practice problems)
DTS_PRACTICE_FIXTURE=1 python3 tools/build.py     # include tests/fixtures/problems_sample.json, for the browser test
node tests/e2e.js http://localhost:8787/          # browser (needs Playwright); or file://.../dist/down-the-stack.html
python3 tools/build.py                            # rebuild without the samples afterwards
```

`DTS_CONTENT_DB` and `DTS_USER_DB` point the build and the server at other database files.
