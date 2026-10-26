"""Apply node-field corrections from a notes file: lines 'id | status|mechanism|year | old | new | source'."""
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
for line in open(sys.argv[1], encoding="utf-8"):
    p = [x.strip() for x in line.split(" | ")]
    if len(p) >= 4 and p[1] in ("status", "mechanism", "year") and not p[3].lower().startswith(("add", "note", "keep")) and len(p[3]) <= 160:
        subprocess.run([sys.executable, os.path.join(here, "setnode.py"), p[0], p[1], p[3]])
    elif line.strip(): print("manual:", line.strip()[:160])
