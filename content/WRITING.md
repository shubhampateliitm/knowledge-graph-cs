# How to write a deep read for Down the Stack

Down the Stack is a map of computer science in six layers: L0 products and tools, L1 systems and architectures,
L2 core techniques, L3 CS foundations, L4 mathematics, L5 first principles (physics, chemistry, biology,
philosophy, linguistics). Every concept is built on concepts in lower layers. The reader is a senior engineer
(director of engineering, M.Tech from IIT Madras, works on ad tech, CTV, data platforms, Spark, Databricks, Kafka)
who wants to **truly understand** each idea, not just recognize it. English is not his first language.

A deep read is a 10 to 14 minute lesson (about **2,000 to 2,800 words**). After reading it, the reader should be
able to explain the idea to a colleague, reason about its costs, and know where to read further.

## What every read must answer

1. **Why does this exist?** What problem forced someone to invent it? What does it give the layer above?
2. **How does it really work?** The mechanism, step by step, with data structures, algorithms, numbers and costs.
3. **How do the layers below add value?** Name the lower concepts from the brief ("STANDS ON") and say exactly
   what each one contributes. This is the heart of the map.
4. **Why does it make sense, and why is it intuitive?** The insight that makes the design natural.
5. **What still hurts?** Real friction, limits, open problems, trade-offs, failure modes.
6. **How do I use it well?** Practical advice from real systems.

## Style

- Plain, easy English. Short sentences. One idea per sentence where possible. No idioms, no slang, no jokes.
- Explain every technical term the first time you use it, unless it is a very common term for an engineer.
- Mechanism over adjectives. Never write "powerful", "seamless", "robust" without saying *how*.
- Use concrete numbers (latencies, sizes, counts, dates) and say "roughly" when they are approximate.
- Be direct. No marketing, no filler, no lecturing, no "In conclusion". Do not repeat the same point in two sections.
- Be accurate. If you are not sure of a date, version or number, check it with WebSearch / WebFetch, or leave it out.
  Facts must be correct as of **October 2026**. For products (L0), check the current version and status.
- Never use Al Jazeera or The Wire as sources. Prefer primary sources: original papers, official docs,
  textbooks, university course pages, the authors' own blogs.

## File format (strict — the build checks it)

```
@@ concept-id
value: First paragraph (shown as the lead).
Next line without a key = a new paragraph in the same section.
terms: Term — one-sentence plain definition.
Another term — its definition.
history: ...
how: ...
diagram:
  +---------+      +---------+
  | client  | ---> | server  |
  +---------+      +---------+
example: ...
intuition: One sentence analogy (shown as a quote).
Then one or two paragraphs on why the idea is natural.
mistakes: People often think X. In fact Y, because Z.
Another misunderstanding as its own paragraph.
friction: ...
practice: ...
quiz: Question text? || Answer in one to three sentences.
Second question? || Its answer.
ref: kind | Title | Authors or org, year | https://url-if-verified
```

Rules:
- A section starts with `key: text` at the start of a line. Keys: value, terms, history, how, diagram, example,
  intuition, mistakes, friction, practice, quiz, ref. Each line after it, until the next key, is a new paragraph.
- Never start a normal paragraph line with one of those keys followed by a colon (for example a line beginning
  "example: " inside the how section would start a new section). Never start a line with "# ".
- `terms`: 6 to 10 lines, each `Term — definition` with a space, an em dash (—) and a space.
- `quiz`: exactly 5 lines, each `question || answer` with exactly one ` || `. Mix: one recall question, two
  "why / how" mechanism questions, one numeric or scenario question, one trade-off or design-judgment question.
  Answers must be complete on their own.
- `diagram`: put `diagram:` alone on its line, then the drawing. **Plain ASCII only** (+ - | / \ < > v ^ [ ] * . =),
  at most 72 columns and about 24 lines. Leading spaces are kept. Draw structure or flow (boxes and arrows, a
  tree, a timeline, a table of states, a memory layout). Include one for most L0–L3 concepts; skip it when a
  drawing would not help (many L4/L5 concepts can use a small table or formula sketch instead, or none).
- `mistakes`: 3 to 5 paragraphs. Each states a common wrong belief, then the truth and the reason.
- `ref`: kinds are paper, book, blog, docs, course, video, spec. 4 to 8 sources. Keep every existing source that is
  correct. Give a URL only if you have verified it (fetched it, or it is a stable official address you are sure of);
  otherwise leave the URL empty (the app links to a search instead). Format with `|` separators.

## Section targets (words)

| section   | words        | content |
|-----------|--------------|---------|
| value     | 250–400      | 2–3 paragraphs: the problem, who uses it, what it gives the layer above, why now |
| terms     | 6–10 lines   | the vocabulary needed for the rest of the read |
| history   | 250–450      | key people, papers, dates; *why* each step happened |
| how       | 700–1,200    | 4–8 paragraphs: the mechanism step by step; name each STANDS ON concept and what it adds |
| diagram   | optional     | ASCII picture of the mechanism |
| example   | 350–600      | a worked example with concrete numbers, step by step, that the reader can follow with a pen |
| intuition | 150–250      | first line: a one-sentence analogy; then why the design is natural |
| mistakes  | 150–350      | 3–5 common misunderstandings, corrected |
| friction  | 250–400      | limits, costs, failure modes, open problems |
| practice  | 250–400      | concrete advice; for L4/L5: where an engineer meets this in computing and how to study it |
| quiz      | 5 lines      | self-check questions with answers |

For L4 (mathematics): state definitions and key theorems precisely, write formulas in plain text with Unicode
(∑, √, ≤, ², log₂, ∈, →), and work through a small numeric example. For L5 (physics, chemistry, biology, philosophy):
explain the real mechanism and connect it clearly to the computing concepts built on it.

## Process

1. Run `python3 tools/brief.py <id> ...` to see the concept, its current short read, what it stands on, what is
   built on it, and neighbours. **Read `content/reads/long/d_gold.txt` (the Bloom filter read) first: it is the
   model for depth, tone and format.** Related deep reads in `content/reads/long/` show the tone too.
2. Research what you are not sure about (WebSearch, WebFetch). Verify versions and dates for products.
3. Write the full read (`@@ id`, replacing the short one) into your draft file in `content/drafts/`.
4. Run `python3 tools/checkread.py content/drafts/<your-file>.txt` after each concept and fix every problem.
   Aim for every concept to print `OK`.
5. Do not edit any other file. If a node's one-line mechanism or status (shown in the brief) is wrong or outdated,
   write the correction in `content/drafts/<your-file>.notes.txt` as `id | field | old | new | source`.

## Required since v7: trade-offs and interview sections

- `tradeoffs:` ("It depends: trade-offs") — 3–6 paragraphs, one decision each: "Choose X when …; choose Y when …",
  naming the deciding factors with numbers, and what you give up either way. Required for EVERY concept. For L4/L5
  (maths, physics, philosophy) the decisions are about which model, method or approximation to use and when it breaks
  down (e.g. exact vs approximate, frequentist vs Bayesian, classical vs quantum model).
- `interview:` ("In the interview") — 4–6 lines `question || strong answer outline`: the probing questions a
  staff-level interviewer asks (follow-ups, failure cases, scaling limits, "why not X?"); answers 2–5 sentences.
  Required for L0–L3. Different from `quiz:` (self-check recall); interview questions are harder and open-ended.
- Do NOT write `animation:` sections in reads. Animations are separate scene files (content/anim/), made by other writers.

## Rich text (v9)

The full rules are in `content/FORMAT.md`. In short:

- Maths: `\( ... \)` inline and `\[ ... \]` as its own paragraph line (LaTeX, rendered as MathML). Use it for real
  formulas, not for arithmetic in worked examples or for prices.
- Code: backticks for `identifiers`; a block is a line that is only ```lang (sql, python, scala, java, js, ts, go,
  rust, c, bash, json, yaml, text), the code, then a line that is only ```. Max 72 columns. Lines inside a block are
  never read as section keys, so `how:` or `# comment` inside code is safe. A key line may be empty (`example:`) only
  when a code block follows directly. Code blocks are not allowed in `terms:`, `quiz:`, `interview:` or `followups:`.
- `**bold**` for the one key phrase of a paragraph; a paragraph starting `Key idea:`, `Rule of thumb:` or `Warning:`
  becomes a callout.
- The app also styles un-marked text: formulas such as "T(n) = 2T(n/2) + O(n)" get the maths font, SQL written in a
  sentence is highlighted (and laid out as a block when longer than about 70 characters), "People often think X. In
  fact Y." becomes a myth / fact card, "Choose X when ..." sentences become decision options, "Step 1: ..." paragraphs
  get numbered markers, and a short first sentence ("Average load.") becomes a bold run-in head. Keep writing in
  these shapes; they are what the reader's visual cues are built on.
- `python3 tools/checkread.py <file>` reports unclosed code blocks, lines over 72 columns and unbalanced `\(` / `\[`.
