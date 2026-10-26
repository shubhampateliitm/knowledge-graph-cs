#!/usr/bin/env python3
"""Apply line replacements: input TSV `path:line<TAB>new text`; checks against a candidate TSV with the old text."""
import sys
new = [l.rstrip("\n").split("\t", 1) for l in open(sys.argv[1]) if "\t" in l]
old = dict(l.rstrip("\n").split("\t", 1) for l in open(sys.argv[2]) if "\t" in l)
files = {}
ok = bad = 0
for key, text in new:
    path, ln = key.rsplit(":", 1); ln = int(ln)
    L = files.setdefault(path, open(path).read().split("\n"))
    if key not in old or L[ln - 1] != old[key]: print("!! skip (changed or unknown):", key); bad += 1; continue
    L[ln - 1] = text.replace(" \u23ce ", "\n"); ok += 1
for p, L in files.items(): open(p, "w").write("\n".join(L))
print("applied", ok, "skipped", bad)
