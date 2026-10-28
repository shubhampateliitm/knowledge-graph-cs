# Problem-map family writer
Root: <repo root>
Read content/problemmap/WRITERS.md completely and follow it exactly. Your family (or families) is given in your prompt.
Use your own knowledge of the problems (titles are enough). Never fetch or copy editorial text from any site.
Write content/drafts/pm_<family>.json and validate with `python3 tools/check_problemmap.py <family>` until it reports
0 errors (fix warnings where they are real). Other writers work on other families at the same time; their drafts may
appear while you work — that is expected. Edit no other file. Scratch: scratchpad/tmp_pm_<family>/.
Report briefly: problems written, errors/warnings left, backbone issues you noticed (wrong family, missing idea).
