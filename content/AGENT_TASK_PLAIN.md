# Plain-English pass

The reader is a senior engineer whose first language is not English. He wants text that is simple and comfortable
to read, without losing any technical content.

Input: <your scratch folder>/tmp_plain/cand_K.tsv (K given in
your prompt). Each line: `path:line<TAB>paragraph`. A paragraph may start with a section key such as `how: `.

Rewrite every paragraph in plain, easy English:
- Short sentences: aim for 10–18 words, never more than 25. Split long sentences. One idea per sentence.
- Common words. Replace rare or fancy words ("ubiquitous" → "used everywhere", "mitigate" → "reduce",
  "leverage" → "use", "albeit" → "but", "thereby", "whereby", "hence", "akin to", "plethora"...).
- No idioms or slang ("rule of thumb" is fine; avoid "silver bullet", "low-hanging fruit", "under the hood" →
  "inside", "out of the box" → "by default", "kick in" → "start").
- Active voice and concrete subjects ("the server sends" instead of "it is sent").
- Keep every fact, number, unit, name, technical term, example and nuance. Do not add new facts. Do not cut content.
- Keep exactly as they are: the section key at the start (`how: ` etc.), every `\( … \)` maths span, every
  `backtick code` span, every URL, every number, every `**bold**`, the ` || ` separator in quiz/interview/followups
  lines (exactly one), and the ` — ` separator in term lines (`Term — definition`).
- Keep the paragraph as ONE line (no line breaks). Keep "Choose X when … choose Y when …" structure in trade-offs,
  "Step N" at the start of steps, "Key idea:" / "Warning:" callout prefixes, and myth-then-fact order in mistakes.
- If a paragraph is already plain, still shorten its longest sentences.

Output: <your scratch folder>/tmp_plain/out_K.tsv with one line per
paragraph: `path:line<TAB>new paragraph` (same keys as the input). Work in slices of about 60 lines and append to the
output file as you go. Then validate with
`cd <repo root> && python3 tools/check_plain.py ../tmp_plain/out_K.tsv ../tmp_plain/cand_K.tsv`
and fix every line it reports. Do not edit any file under content/. Report: lines rewritten, lines that failed checks.
