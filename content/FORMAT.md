# Rich text inside reads, designs and tours (v9)

These marks work in every prose section (not in `diagram:`). Keep them rare and meaningful.

## Maths (LaTeX, rendered as MathML)
- Inline: `\( ... \)`  e.g.  `The capacity is \( C = B \log_2(1 + S/N) \) bits per second.`
- Display (own paragraph line): `\[ ... \]`  e.g.  `\[ P(\text{false positive}) \approx \left(1 - e^{-kn/m}\right)^k \]`
- Use it for real formulas (definitions, theorems, laws, model equations). Do NOT use it for plain
  arithmetic in worked examples ("550 / 40 ≈ 14 shards" stays as text) or for prices like $0.023.
- LaTeX subset: \frac \sqrt \sum \prod \int \log \ln \exp \max \min \arg\max \lim \infty \approx \le \ge \ne
  \in \to \cdot \times \mathbb \mathbf \mathcal \text \left \right ^ _ Greek letters, \hat \bar \tilde \vec.

## Code
- Inline: backticks `like_this` for identifiers, config keys, commands, short code.
- Block: a line that is only ```lang (sql, python, scala, java, js, ts, go, rust, c, bash, json, yaml, text),
  then the code lines, then a line that is only ```. Indentation inside is kept. Max 72 columns per line.
  Use a block for any SQL query longer than one short clause, and for code of 2+ lines.
  Example:
      ```sql
      SELECT campaign_id, count(*) AS imps, sum(cost) AS spend
      FROM imps
      WHERE event_date >= DATE '2026-10-20'
      GROUP BY campaign_id
      ```

## Emphasis
- `**bold**` for the one key phrase of a paragraph (at most one or two per section).
- A paragraph starting with `Key idea:` / `Rule of thumb:` / `Warning:` renders as a callout.
