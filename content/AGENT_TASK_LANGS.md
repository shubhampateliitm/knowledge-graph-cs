# Converting practice problems to Python-first + Go, C++, Rust, Scala
Root: <repo root>
Read content/PRACTICE_LANGS.md completely and follow it exactly (schema, type grammar, starter/solution rules,
Scala rules, error table). Your batch K is one line of content/drafts/practice_langs_list.txt (`K | id [hints] ; ...`).
Look at content/drafts/practice_langs_0.json (the pilot) for finished examples.
For each id in your batch: read the problem in content/practice/problems.json (statement, JS solution, tests), write
`sig` and `langs` for python, go, cpp, rust, scala (idiomatic, clean, commented only where it helps a learner).
Write the patch to content/drafts/practice_langs_K.json. Run
`python3 tools/check_langs.py content/drafts/practice_langs_K.json --starters` and fix until python, go, cpp and rust
all pass (the machine has only 2 CPUs and other writers share it: check a few problems at a time with --ids while
working, then the whole batch once at the end). Skip and report any problem the type grammar cannot express.
Do not edit problems.json or any other file; scratch in scratchpad/tmp_lang_K/ outside content/.
Report briefly: problems done, skipped (why), check results per language.
