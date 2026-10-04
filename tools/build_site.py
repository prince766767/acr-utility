#!/usr/bin/env python3
"""Assemble the GitHub Pages site: the app at the root and the earlier v0.4 utility at v0.4/.

v0.4 is frozen: its committed single-file build (legacy-v0.4/ACR-Utility.html) is published as is.

The app's files are exactly the service worker's ASSETS list plus sw.js, so what is published
is what the app caches for offline use. Usage: python tools/build_site.py [OUT_DIR]  (default _site)
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def app_files():
    text = (ROOT / 'sw.js').read_text(encoding='utf-8')
    listing = re.search(r"const ASSETS=\[([^\]]*)\]", text).group(1)
    names = [n[2:] for n in re.findall(r"'([^']*)'", listing) if n != './']
    return names + ['sw.js']


def build(out):
    out = pathlib.Path(out)
    if out.exists():
        shutil.rmtree(out)
    for name in app_files():
        dest = out / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, dest)
    (out / 'v0.4').mkdir(parents=True)
    shutil.copy2(ROOT / 'legacy-v0.4' / 'ACR-Utility.html', out / 'v0.4' / 'index.html')
    return out


if __name__ == '__main__':
    print('site written to', build(sys.argv[1] if len(sys.argv) > 1 else ROOT / '_site'))
