# Task: write deep reads for a batch of concepts

Project root: <repo root>
1. Read content/WRITING.md fully (spec, including the "Required since v7" section at the end) and
   content/reads/long/d_gold.txt (the model read: match its depth, tone and format).
2. Run `python3 tools/brief.py <ids>` for your concepts (current read, links with reasons, neighbours, courses).
3. For each concept: verify facts you are unsure of (WebSearch is shared and limited: at most 2 searches per concept;
   prefer WebFetch on official docs, arXiv, RFCs; if you cannot verify a number or date, leave it out). Write the full
   read as `@@ <id>` with ALL sections: value, terms, history, how (700+ words), diagram (when useful), example,
   intuition, mistakes, tradeoffs, friction, practice, interview, quiz (5), refs (4–8). Name the STANDS ON concepts in
   value/how and say what each contributes. Append it to your draft file as soon as it is done.
4. Run `python3 tools/checkread.py content/drafts/<batch>.txt` and fix every error and every "!!" line.
5. Edit no other file. Record wrong/outdated one-line mechanism or status lines in content/drafts/<batch>.notes.txt as
   `id | status|mechanism|year | old | new | source` (keep the new value short, under 100 characters).
Be economical with tokens: do not print whole files you do not need; read briefs, not every deep read.
Reply at the end with one line per concept (id, words, OK) and anything unverified. Keep it short.
