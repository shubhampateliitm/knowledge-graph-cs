#!/usr/bin/env python3
"""Validate language patch files and merge them into content/practice/problems.json.

  python3 tools/apply_lang_patches.py content/drafts/practice_langs_3.json [more patch files ...]
                                      [--dry-run] [--no-run] [--allow-missing] [--jobs N]

A patch file is a JSON list of {"id", "sig", "langs"} (format: content/PRACTICE_LANGS.md). For every entry this checks:
  - the id exists in problems.json and appears once across the patch files; no other keys;
  - sig is valid and every existing test of the problem fits its types (tools/langharness.py prepare);
  - langs has python, go, cpp, rust and scala (--allow-missing: python is still required), each with a non-empty
    starter and solution, and the starter is not the solution;
  - with tools/check_langs.py: every solution passes all tests and every starter compiles and runs, in each language
    whose toolchain is installed (Scala without scala-cli is reported "not checked"); and web/langharness.js generates
    the same programs (when node is installed).
Nothing is written unless every entry passes. --dry-run checks without writing; --no-run skips compiling and running
(structure and types only; do not merge like that). On success the entries' "sig" and "langs" replace the old ones
in problems.json, which keeps its order and formatting (indent 1). Then run python3 tools/build.py."""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import langharness as H
import check_langs as C

LANGS = ["python", "go", "cpp", "rust", "scala"]


def validate(entries, by_id, allow_missing=False):
    """Structural checks. Returns (merged problems, errors)."""
    errs, merged, seen = [], [], {}
    for where, e in entries:
        pid = e.get("id") if isinstance(e, dict) else None
        tag = "%s: %s" % (where, pid if pid else "(entry without id)")
        if not isinstance(e, dict) or not isinstance(pid, str):
            errs.append(tag + ": each entry must be an object with an id")
            continue
        if pid in seen:
            errs.append(tag + ": also in " + seen[pid])
            continue
        seen[pid] = where
        if pid not in by_id:
            errs.append(tag + ": no problem with this id in content/practice/problems.json")
            continue
        extra = sorted(set(e) - {"id", "sig", "langs"})
        if extra:
            errs.append(tag + ": unexpected keys " + ", ".join(extra) + " (a patch only carries id, sig and langs)")
        p = dict(by_id[pid])
        p["sig"], p["langs"] = e.get("sig"), e.get("langs")
        try:
            H.prepare(p)
        except H.HarnessError as x:
            errs.append(tag + ": sig: " + str(x))
            continue
        L = e.get("langs")
        if not isinstance(L, dict):
            errs.append(tag + ": langs must be an object keyed by language")
            continue
        bad = sorted(set(L) - set(LANGS))
        if bad:
            errs.append(tag + ": unknown languages " + ", ".join(bad) + " (JavaScript stays in the top-level fn/starter/solution fields)")
        need = ["python"] if allow_missing else LANGS
        for lang in need:
            if lang not in L:
                errs.append(tag + ": missing langs." + lang)
        for lang, v in L.items():
            if lang not in LANGS:
                continue
            if not isinstance(v, dict) or set(v) - {"starter", "solution"}:
                errs.append(tag + ": langs.%s must be {\"starter\": ..., \"solution\": ...}" % lang)
                continue
            for k in ("starter", "solution"):
                if not isinstance(v.get(k), str) or not v[k].strip():
                    errs.append(tag + ": langs.%s.%s is empty" % (lang, k))
            if isinstance(v.get("starter"), str) and v.get("starter", "").strip() == (v.get("solution") or "").strip():
                errs.append(tag + ": langs.%s: the starter is the same as the solution" % lang)
        merged.append(p)
    return merged, errs


def main(argv):
    args = list(argv)
    jobs = None
    if "--jobs" in args:
        i = args.index("--jobs")
        jobs = int(args[i + 1])
        del args[i:i + 2]
    flags = {a for a in args if a.startswith("--")}
    files = [a for a in args if not a.startswith("--")]
    unknown = flags - {"--dry-run", "--no-run", "--allow-missing"}
    if unknown or not files:
        print(__doc__)
        return 2
    problems = json.load(open(H.PROBLEMS, encoding="utf-8"))
    by_id = {p["id"]: p for p in problems}
    entries = []
    for f in files:
        try:
            data = json.load(open(f, encoding="utf-8"))
        except (OSError, ValueError) as e:
            print("%s: cannot read: %s" % (f, e))
            return 1
        if not isinstance(data, list):
            print("%s: must be a JSON list of {id, sig, langs}" % f)
            return 1
        entries += [(os.path.basename(f), e) for e in data]
    merged, errs = validate(entries, by_id, "--allow-missing" in flags)
    if errs:
        print("NOT APPLIED. %d problem(s):\n  " % len(errs) + "\n  ".join(errs))
        return 1
    print("%d entries: ids, sig, tests and langs look right" % len(merged))
    if "--no-run" not in flags:
        res = C.check(merged, LANGS, starters=True, jobs=jobs)
        res += C.js_parity(merged)
        if not C.report(res, LANGS):
            print("\nNOT APPLIED: fix the entries above and run this again.")
            return 1
    if "--dry-run" in flags:
        print("dry run: problems.json not changed")
        return 0
    for p in merged:
        by_id[p["id"]]["sig"] = p["sig"]
        by_id[p["id"]]["langs"] = {k: {"starter": p["langs"][k]["starter"], "solution": p["langs"][k]["solution"]} for k in LANGS if k in p["langs"]}
    tmp = H.PROBLEMS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(problems, indent=1, ensure_ascii=False))
    os.replace(tmp, H.PROBLEMS)
    done = sum(1 for p in problems if p.get("sig") and p.get("langs"))
    print("merged %d problems into content/practice/problems.json (%d of %d now have all languages). Next: python3 tools/build.py" % (len(merged), done, len(problems)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
