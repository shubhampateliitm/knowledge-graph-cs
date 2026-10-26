#!/usr/bin/env python3
"""Insert journey steps: lines `title prefix || after-step-id || id | text` into content/graph/tours_journeys.txt."""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "content", "graph", "tours_journeys.txt")
lines = open(P).read().split("\n")
for spec in open(sys.argv[1]).read().strip().split("\n"):
    if not spec.strip(): continue
    title, after, step = [s.strip() for s in spec.split("||", 2)]
    start = next(i for i, l in enumerate(lines) if l.startswith("## ") and l[3:].startswith(title.replace("## ", "")))
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    pos = next((i for i in range(start + 1, end) if lines[i].split("|")[0].strip() == after), None)
    if pos is None: print("!! step", after, "not found in", title); continue
    lines.insert(pos + 1, step); print("inserted", step.split("|")[0].strip(), "after", after, "in", title[:50])
open(P, "w").write("\n".join(lines))
