"""Generate employee-side ACR outputs from a portable v0.4 draft.

This tool is intentionally master-first: it overlays slots on the supplied official
PDF and never redraws the Reporting/Reviewing Officer pages. A coordinate map must
be checked against the retained 30-page master before a production submission.
"""
from __future__ import annotations
import argparse, json, re, shutil, zipfile
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

def path_value(data, path):
    value = data
    for part in path.split('.'):
        if isinstance(value, dict): value = value.get(part, '')
        else: return ''
    if isinstance(value, list): return '; '.join(str(x) for x in value)
    return '' if value is None else str(value)

def write_pdf(draft, master, slot_map, target):
    reader = PdfReader(str(master)); writer = PdfWriter()
    pages = slot_map.get('pages', {})
    for number, page in enumerate(reader.pages):
        slots = pages.get(str(number), [])
        if slots:
            stream = BytesIO(); c = canvas.Canvas(stream, pagesize=A4)
            for slot in slots:
                value = path_value(draft, slot['path'])
                if not value: continue
                c.setFont(slot.get('font', 'Helvetica'), float(slot.get('size', 8)))
                c.drawString(float(slot['x']), float(slot['y']), value[:slot.get('maxChars', 500)])
            c.save(); stream.seek(0); page.merge_page(PdfReader(stream).pages[0])
        writer.add_page(page)
    with target.open('wb') as fh: writer.write(fh)

def write_docx(draft, master, target):
    """Replace only {{dot.path}} tokens in the copied official master XML."""
    token = re.compile(r'\{\{([A-Za-z0-9_.]+)\}\}')
    with zipfile.ZipFile(master) as src, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            raw = src.read(info.filename)
            if info.filename.endswith('.xml'):
                text = raw.decode('utf-8')
                text = token.sub(lambda m: escape(path_value(draft, m.group(1))), text)
                raw = text.encode('utf-8')
            dst.writestr(info, raw)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--draft', required=True, type=Path)
    p.add_argument('--pdf-master', type=Path)
    p.add_argument('--docx-master', type=Path)
    p.add_argument('--map', dest='slot_map', type=Path)
    p.add_argument('--out-dir', required=True, type=Path)
    args = p.parse_args(); args.out_dir.mkdir(parents=True, exist_ok=True)
    draft = json.loads(args.draft.read_text(encoding='utf-8'))
    stem = 'ACR_' + re.sub(r'[^A-Za-z0-9_-]+', '_', draft.get('part1', {}).get('session') or 'draft')
    if args.pdf_master:
        if not args.slot_map: p.error('--map is required with --pdf-master')
        if not args.pdf_master.exists(): p.error('Official PDF master not found')
        slot_map = json.loads(args.slot_map.read_text(encoding='utf-8'))
        write_pdf(draft, args.pdf_master, slot_map, args.out_dir / f'{stem}.pdf')
    if args.docx_master:
        if not args.docx_master.exists(): p.error('Official DOCX master not found')
        write_docx(draft, args.docx_master, args.out_dir / f'{stem}.docx')
    print('Generated:', ', '.join(x.name for x in args.out_dir.iterdir() if x.is_file()))

if __name__ == '__main__': main()
