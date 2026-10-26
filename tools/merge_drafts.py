"""Move finished drafts from content/drafts/ into content/reads/long/.
usage: python3 tools/merge_drafts.py NAME [NAME ...] [--force]
A draft is merged only if it parses; without --force every concept in it must also meet the deep-read standard.
New reads (b* batches) become long/d_NAME.txt; extensions (x* batches) become long/y_NAME.txt (sorted after
the files they extend). The whole content is then re-checked."""
import os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
force = "--force" in sys.argv
for name in [a for a in sys.argv[1:] if not a.startswith("--")]:
    src = os.path.join(ROOT, "content/drafts", name + ".txt")
    if not os.path.exists(src): print(f"{name}: no draft"); continue
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools/checkread.py"), src] + ([] if force else ["--strict"]), capture_output=True, text=True)
    print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr)
    if r.returncode: print(f"{name}: NOT merged\n" + r.stdout[-3000:]); continue
    dst = os.path.join(ROOT, "content/reads/long", ("y_" if name[0] in "xt" else "d_") + name + ".txt")
    shutil.move(src, dst); print(f"{name}: merged -> {os.path.relpath(dst, ROOT)}")
r = subprocess.run([sys.executable, os.path.join(ROOT, "tools/build.py"), "--check"], capture_output=True, text=True)
print((r.stdout + r.stderr).strip().splitlines()[-1])
