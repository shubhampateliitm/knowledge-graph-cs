#!/usr/bin/env python3
"""Apply plain-English rewrites safely. usage: apply_plain.py out.tsv cand.tsv
Each rewrite must keep: the section key, separators (' || ', ' — '), every number, every \\( \\) span,
every `code` span and every URL. Lines that fail are skipped and listed."""
import re, sys
from collections import Counter
def keys(t):
    m = re.match(r"^(\w+):\s", t); return m.group(1) if m else None
def facts(t):
    math = re.findall(r"\\\(.*?\\\)", t)
    code = re.findall(r"`[^`]+`", t)
    urls = re.findall(r"https?://\S+", t)
    rest = re.sub(r"\\\(.*?\\\)|`[^`]+`|https?://\S+", " ", t)
    nums = re.findall(r"\d+(?:[.,]\d+)*", rest)
    return Counter(math), Counter(code), Counter(urls), Counter(n.replace(",", "") for n in nums)
new = [l.rstrip("\n").split("\t", 1) for l in open(sys.argv[1], encoding="utf-8") if "\t" in l]
old = dict(l.rstrip("\n").split("\t", 1) for l in open(sys.argv[2], encoding="utf-8") if "\t" in l)
files, ok, bad = {}, 0, []
for key, text in new:
    if key not in old: bad.append((key, "unknown line")); continue
    o = old[key]; path, ln = key.rsplit(":", 1); ln = int(ln)
    L = files.setdefault(path, open(path, encoding="utf-8").read().split("\n"))
    if L[ln - 1] != o: bad.append((key, "file changed")); continue
    why = None
    if keys(o) != keys(text): why = "section key"
    elif o.count(" || ") != text.count(" || "): why = "|| separator"
    elif o.count(" — ") > 0 and text.count(" — ") < 1: why = "term separator"
    else:
        a, b = facts(o), facts(text)
        for name, x, y in zip(("maths", "code", "url", "numbers"), a, b):
            if x != y: why = name + " changed"; break
    if not text.strip() or "\n" in text: why = why or "empty or multi-line"
    if why: bad.append((key, why)); continue
    L[ln - 1] = text; ok += 1
for p, L in files.items(): open(p, "w", encoding="utf-8").write("\n".join(L))
print("applied", ok, "rejected", len(bad))
for k, w in bad[:40]: print("  !!", k, w)
