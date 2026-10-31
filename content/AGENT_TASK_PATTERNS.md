# Task: write architecture patterns for a batch of concepts

You write the **Architecture patterns** section for each concept in your batch. Read first, in this order:

1. `<repo root>/content/patterns/README.md`: the format and rules (strict, the build checks them).
2. `<repo root>/content/patterns/p_gold.txt`: the model for depth, tone and format (Apache Kafka).
3. `<repo root>/content/patterns/catalog.txt`: canonical pattern ids for `kind:` lines.

For each concept id in your batch:

- Run `cd <repo root> && python3 tools/brief.py <id>` to see the concept, what it stands on, what is built on it and
  its neighbours. Use the read's facts; for more detail, `grep -n "" content/reads/long/*.txt | grep "<id>"` finds it.
- L0 (products) and L1 (systems): write **3 patterns** (2 if the concept is narrow). L2 (techniques): **2–3**.
  L3 (CS foundations): **1–2** patterns showing how real systems use the idea (for example B-tree: "secondary index
  lookup then heap fetch"; TCP: "connection pooling behind a load balancer").
- A pattern is a reusable **architecture**: how this tool or idea is placed among other components to solve a real
  problem, with the data and control flow. Not a feature list. Prefer patterns an architect would draw on a
  whiteboard: fan-out, outbox, CQRS read model, medallion layers, cache-aside, leader election, RAG, feature store,
  sidecar, canary, etc. Where the concept is about ad tech, data platforms, streaming, CTV or ML, choose patterns that
  show those uses.
- Different patterns of one concept must be really different (not three variants of one idea).
- Map each pattern to 1–3 catalog ids. If nothing fits, write `kind: none` and add a line to your notes file
  `<your scratch folder>/<batch>.catalog.txt` proposing a new catalog entry in the catalog's exact format.
- Accuracy: be correct as of October 2026. Do not invent product features, version numbers or company usage. If
  you are not sure a company uses it, name the open-source project or say "common in …". Give a `ref:` URL only if
  you are sure it is a stable official address; otherwise leave the URL empty.

Write everything to `<your scratch folder>/<batch>.txt` (one `@@ id` block per concept, in batch order). Never edit any
file inside the repo. After every 3–4 concepts run
`cd <repo root> && python3 tools/checkpatterns.py <your scratch folder>/<batch>.txt --show` and fix every problem and
every warning. Finish only when it prints `0 problems`. Then reply with: the file path, the number of patterns, and
any concept you were unsure about.
