# Maths markup pass

Root: /tmp/claude-0/-home-claude/0dc6e862-1194-53b2-88f9-ad8a3966ed3c/scratchpad/kgcs
Read content/FORMAT.md first (the `\( \)` inline and `\[ \]` display LaTeX syntax, rendered with Temml to MathML).

Input: /tmp/claude-0/-home-claude/0dc6e862-1194-53b2-88f9-ad8a3966ed3c/scratchpad/tmp_math/cand_K.tsv (K = your chunk). Each line: `path:line<TAB>the current text of that line`.
Each line is one paragraph of a deep read (it may start with a section key such as `how: ` or `terms: `).

Task: for each line, decide whether it contains a real formula (a definition, law, theorem, model equation,
complexity recurrence, probability expression, or a symbolic expression like H(X) = −Σ p(x) log₂ p(x),
2^(−nH), (1 − e^(−kn/m))^k, T(n) = 2T(n/2) + O(n), x ≡ a (mod n), ∂L/∂w). If yes, rewrite ONLY the formula
spans as `\( LaTeX \)`. Keep every other word exactly as it is.
- Plain arithmetic with concrete numbers in worked examples stays as text ("550 / 40 ≈ 14 shards",
  "3 × 4 = 12", "0.9³ = 0.729" can stay). Mark them only when they are a symbolic formula with variables.
- Never touch prices ($0.023), dates, versions, units, code identifiers, or text inside backticks.
- A formula that is the main point of the paragraph and is long may become display maths: put it as its own line
  `\[ ... \]` — to do that, output the paragraph as TWO OR MORE lines joined by the separator ` ⏎ ` (space, U+23CE, space)
  in the output (see below); the first line keeps the section key if there was one. Use display at most once or
  twice per read.
- Lines that start with `terms:` or are term lines (`Term — definition`): keep the ` — ` separator; inline only.
- quiz / interview lines (`question || answer`): keep exactly one ` || `; inline only.
- Use correct LaTeX: \log_2, \sum_{x}, \frac{a}{b}, \sqrt{n}, e^{-kn/m}, \mathbb{E}[X], \Pr[\cdot], \equiv, \pmod{n},
  \le, \ge, \approx, \in, \to, \infty, \cdot, \times, Greek letters (\lambda, \sigma, \mu, \varepsilon, \varphi).
  Variables italic (default); words inside formulas with \text{...}. No $ signs.

Output: write /tmp/claude-0/-home-claude/0dc6e862-1194-53b2-88f9-ad8a3966ed3c/scratchpad/tmp_math/out_K.tsv with one line per CHANGED paragraph: `path:line<TAB>new text`
(if you split into display lines, write them in the same field separated by ` ⏎ `; never use a literal backslash-n,
because LaTeX has \nabla, \neq). Do not include unchanged lines. Do not edit any file under content/ yourself.

Check your LaTeX: run `node -e` with web/vendor/temml.min.js to render every \( \) and \[ \] you wrote, e.g.
  node -e "const t=require('./web/vendor/temml.min.js'); console.log(t.renderToString(String.raw`\frac{a}{b}`))"
(load it the way the file supports: it may define a global `temml`; adapt as needed). Fix every formula that throws.
Report: how many lines changed, how many display formulas, and any lines you were unsure about.
