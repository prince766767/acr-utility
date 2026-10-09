"""Makes the small files tests/enclosure_pdf.test.js uses. Run once: python tests/fixtures/encl/make_fixtures.py"""
from pathlib import Path
from PIL import Image
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject

HERE = Path(__file__).resolve().parent
A4 = dict(width=595.28, height=841.89)
SQUARE = b'0 0 1 rg 100 100 200 200 re f'
# What Word's "Save as PDF" leaves on an empty last page: one space in a text block.
ONE_SPACE = b' /P <</MCID 0>> BDC BT\r\n/F3 11.04 Tf\r\n1 0 0 1 28.32 566.16 Tm\r\n0 g\r\n0 G\r\n[( )] TJ\r\nET\r\n EMC '


def page(w, content=None):
    p = w.add_blank_page(**A4)
    if content is not None:
        s = DecodedStreamObject()
        s.set_data(content)
        p[NameObject('/Contents')] = w._add_object(s)


Image.new('RGB', (60, 90), (200, 30, 30)).save(HERE / 'portrait.jpg', quality=85)
Image.new('RGB', (90, 60), (30, 30, 200)).save(HERE / 'landscape.jpg', quality=85)
w = PdfWriter()
page(w, SQUARE)
page(w, SQUARE)
w.write(HERE / 'two-pages.pdf')
w = PdfWriter()
page(w, SQUARE)
page(w, ONE_SPACE)
page(w)
page(w, rb'BT /F1 12 Tf 72 700 Td (Page three \(text\)) Tj ET')
w.write(HERE / 'with-blank-pages.pdf')
w = PdfWriter()
page(w)
w.write(HERE / 'all-blank.pdf')
w = PdfWriter()
w.add_blank_page(**A4)
w.encrypt(user_password='secret', owner_password='owner')
w.write(HERE / 'locked.pdf')
print('fixtures written')
