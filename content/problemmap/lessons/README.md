# Problem-map lessons (content/problemmap/lessons/*.txt)

Every idea in the problem map has a short lesson, shown in the idea panel above its ladder of problems: read it, then
solve. Format and limits are in the docstring of `tools/lessons.py`; check a file with `python3 tools/lessons.py <file>`
(the build runs the same check on every file). The model lesson is `hashset` in `l01.txt`.

Style: plain, easy English for a senior engineer whose first language is not English. Short sentences (10-18 words),
common words, no idioms. The walk-through uses real values from the idea's simplest problem. The code is the core
template in Python, written so that it also solves that problem, and it was run against small tests before it was added.
