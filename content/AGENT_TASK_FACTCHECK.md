# Fact-check pass on deep reads

Root: <repo root>
Files: content/reads/long/d_rNN_*.txt (the DSL is described in content/WRITING.md).

For each claim in your list:
1. Find it in the file (grep).
2. Verify against a primary source: official docs, release notes, the paper itself, the vendor's own page.
   Use WebFetch on official pages first; WebSearch only when you do not know the page. Budget: about 3 web calls
   per claim, at most 60 in total. Never use Al Jazeera or The Wire.
3. Then:
   - Correct: leave the text alone. If the ref for it has no URL and you fetched a stable official URL, you may add it.
   - Wrong: fix the number/date/name with the smallest edit (Edit tool). Keep plain, easy English.
   - Cannot verify: soften it ("about", "roughly", "around 2014") or remove the specific number if it carries no
     teaching value. Never invent a replacement.
4. For arXiv ids: fetch https://arxiv.org/abs/<id> and check the title matches the ref. Fix or blank the URL if not.
   If arXiv rate-limits you (429), wait and continue with other claims, then retry once.

Rules: edit only the files named in your list. Do not touch diagrams except to fix a wrong number (keep ≤72 columns).
After editing, run `python3 tools/checkread.py content/reads/long/<file>` and make sure every concept is still OK.
Final report (short): per claim, one line: file | claim | verdict (ok / fixed: old -> new / softened / removed) | source URL.
