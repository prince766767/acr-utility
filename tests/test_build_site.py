"""The published site: the app's runtime files at the root, the earlier v0.4 utility at v0.4/."""
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import build_site  # noqa: E402


class BuildSiteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = build_site.build(pathlib.Path(cls.tmp.name) / '_site')

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_every_cached_app_file_is_published(self):
        files = build_site.app_files()
        for name in ['index.html', 'app.js', 'sw.js', 'sw_rules.js', 'google-config.js', 'vendor/jszip.min.js', 'ACR_EMPLOYEE_MASTER.docx', 'privacy.html', 'vendor/docx-preview.min.js']:
            self.assertIn(name, files)
        for name in files:
            self.assertEqual((self.out / name).read_bytes(), (ROOT / name).read_bytes(), name)

    def test_v04_is_the_unchanged_earlier_utility(self):
        page = (self.out / 'v0.4' / 'index.html').read_bytes()
        self.assertEqual(page, (ROOT / 'legacy-v0.4' / 'ACR-Utility.html').read_bytes())
        self.assertIn(b'910978076407-', page)  # its own Google sign-in still configured

    def test_development_files_are_not_published(self):
        published = {p.relative_to(self.out).as_posix() for p in self.out.rglob('*') if p.is_file()}
        for name in ['generate_acr.py', 'package.json', 'tests/test_build_site.py', 'docs/google-drive-setup.md', 'legacy-v0.4/build.py']:
            self.assertNotIn(name, published)


if __name__ == '__main__':
    unittest.main()
