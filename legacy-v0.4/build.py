#!/usr/bin/env python3
"""Bundle the ACR utility into a single self-contained HTML file."""
import pathlib, sys

root = pathlib.Path(__file__).parent
src = root / "src"
order = ["model.js", "docmodel.js", "render.js", "docx.js", "sync.js", "auth.js", "drive.js", "drivesync.js", "app.js"]

css = (src / "styles.css").read_text(encoding="utf-8")
js = "\n\n".join("/* ===== %s ===== */\n%s" % (n, (src / n).read_text(encoding="utf-8")) for n in order)

shell = (src / "shell.html").read_text(encoding="utf-8")
out = shell.replace("/*{{CSS}}*/", css).replace("/*{{JS}}*/", js)

dest = root / "ACR-Utility.html"
dest.write_text(out, encoding="utf-8")
print("wrote %s  (%.1f KB)" % (dest, dest.stat().st_size / 1024))
