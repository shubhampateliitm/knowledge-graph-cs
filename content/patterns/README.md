# Architecture patterns (content/patterns/*.txt)

Every L0–L3 concept has a section **Architecture patterns** in its read: the 2–4 common ways real systems use this
tool or idea, each with a short explanation and an **animated diagram** that the build lays out automatically.
L4 and L5 concepts (mathematics, first principles) have no patterns.

A concept's patterns also link to a **catalog** of canonical patterns (`catalog.txt`: publish–subscribe, CQRS,
outbox, medallion, circuit breaker, RAG, …). The Patterns view (`#patterns`) lists the catalog by family and shows
every concept that implements each pattern.

## Format

```
@@ concept-id
== Pattern title (at most 60 characters)
kind: catalog-id[, catalog-id]          one to three ids from catalog.txt, or "none"
when: When to use it, in one or two sentences.
how: First paragraph: the mechanism, step by step, with real numbers.
A line without a key is another paragraph of how (2-3 paragraphs, 80-220 words in all).
used: Real systems or companies that use it (one line, specific).
avoid: When not to use it, and what to use instead (one line, optional but usually useful).
flow:
  Source [shape: sub text] -> Target [shape] : message | Caption of this step.
  Target -> A, B : message | One line can fan out to several targets (or in, with "A, B -> C").
  + A -> C : message                     "+" adds a message to the previous step (no caption)
  A ~> B : message | Caption.            dashed link: asynchronous, background or optional path
  A -x> B : message | Caption.           the message is lost or rejected: a failure path
  * B: new sub text | Caption.           change a node's sub line (for example "leader, term 2", "lag 29")
ref: kind | Title | Authors or org, year | url (0-3 lines; kinds: paper, book, blog, docs, course, video, spec)
```

## Rules for the flow (the build draws it)

- 3–10 step lines (each line without "+" is one animation step) and 3–10 nodes.
- A node is named by its label, at most 22 characters. Give the shape and sub text on first use only, then write
  the plain label. Labels are case-sensitive: `orders topic` and `Orders topic` are two nodes.
- Shapes: `svc` (default box), `client`, `user` (rounded), `db`, `store`, `cache`, `lake` (cylinder), `log`,
  `queue`, `topic` (monospace cell), `model` (circle), `note`. The sub text is a short second line (≤ 24 chars).
- Message labels at most 26 characters. Captions: one or two plain sentences that say what happens and why.
- The layout is automatic: left-to-right columns by longest path; replies that go back (B -> A) do not add columns.
  At most 6 columns and 5 nodes per column. Prefer 3–5 columns.
- Every step must teach something: a request, a write, a failure, a state change. No filler steps.

## Style

Plain, easy English (the reader is a senior engineer whose first language is not English): short sentences of 10–18
words, common words, no idioms, no marketing words. Mechanism and numbers over adjectives. Name real products.
Facts must be correct as of October 2026. Never use Al Jazeera or The Wire as sources.

## Check

`python3 tools/checkpatterns.py <file> --show` validates a file and prints each layout as columns.
`python3 tools/build.py --check` validates everything. The gold example is `content/patterns/p_gold.txt` (Kafka).
