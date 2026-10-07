"""Makes the small files tests/enclosure_pdf.test.js uses. Run once: python tests/fixtures/encl/make_fixtures.py"""
from pathlib import Path
from PIL import Image
from pypdf import PdfWriter

HERE = Path(__file__).resolve().parent
Image.new('RGB', (60, 90), (200, 30, 30)).save(HERE / 'portrait.jpg', quality=85)
Image.new('RGB', (90, 60), (30, 30, 200)).save(HERE / 'landscape.jpg', quality=85)
w = PdfWriter()
w.add_blank_page(width=595.28, height=841.89)
w.add_blank_page(width=595.28, height=841.89)
w.write(HERE / 'two-pages.pdf')
w = PdfWriter()
w.add_blank_page(width=595.28, height=841.89)
w.encrypt(user_password='secret', owner_password='owner')
w.write(HERE / 'locked.pdf')
print('fixtures written')
