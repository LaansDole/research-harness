"""local_library: PDF author extraction — metadata preferred, text fallback safe."""
import os
import unittest
from unittest import mock

import helpers
import local_library

# Handcrafted minimal PDF: a decoy /Author (annotation-style, appears FIRST in
# the raw bytes) plus the real trailer-referenced Info dict. Mirrors the
# corpus bug: Distiller-produced embedded objects carried /Author (negul.d)
# 13 times before the document's own /Author (Jia Li).
FIXTURE_PDF = b"""%PDF-1.4
1 0 obj
<< /Type /Annot /Author (negul.d) >>
endobj
2 0 obj
<< /Author (Jia Li) /Title (Experience-guided multi-agent interpretable framework for radiology report summarization) /CreationDate (D:20251107122410Z) >>
endobj
3 0 obj
<< /Type /Page >>
endobj
trailer
<< /Info 2 0 R >>
%%EOF
"""

# No trailer /Info, only garbage /Author values: nothing trustworthy.
FIXTURE_PDF_GARBAGE = b"""%PDF-1.4
1 0 obj
<< /Type /Annot /Author (negul.d) >>
endobj
2 0 obj
<< /Type /Page >>
endobj
trailer
<< /Size 3 >>
%%EOF
"""

# Page-1 front matter with banner/affiliation noise around the author block.
PAGE1_NOISE = """Computer Methods and Programs in Biomedicine 273 (2026) 109078
Contents lists available at ScienceDirect
journal homepage: www.elsevier.com/locate/cmpb
Experience-guided multi-agent interpretable framework for
radiology report summarization
negul.d
Department of Radiology, Example University, Somewhere 12345
corresponding@example.org
Abstract
We summarize radiology reports.
"""


class AuthorMetadataTest(helpers.ResearchCase):
    def scan(self, pdf_bytes, page_text):
        path = os.path.join(self.dir, "fixture.pdf")
        with open(path, "wb") as f:
            f.write(pdf_bytes)
        with mock.patch.object(
            local_library, "extract_text", return_value=(page_text, None)
        ), mock.patch.object(local_library, "page_count", return_value=1):
            return local_library.scan_one(path)

    def test_regression_pdf_author_metadata_preferred(self):
        # The trailer-referenced Info dict names the document author; decoy
        # /Author bytes earlier in the file and page-1 noise must not win.
        rec = self.scan(FIXTURE_PDF, PAGE1_NOISE)
        self.assertEqual(rec["authors"], ["Jia Li"])
        # Unextractable case: garbage-only metadata plus noise text yields an
        # honest empty list, never a fabricated string like "negul.d".
        rec = self.scan(FIXTURE_PDF_GARBAGE, PAGE1_NOISE)
        self.assertEqual(rec["authors"], [])
        self.assertIn("authors_note", rec)

    def test_implausible_metadata_falls_back_to_text_author_line(self):
        # Publisher-stamped metadata is rejected; the name list between the
        # title block and the affiliation block is recovered instead.
        pdf = FIXTURE_PDF.replace(b"(Jia Li)", b"(Elsevier)")
        text = (
            "Experience-guided multi-agent interpretable framework for\n"
            "radiology report summarization\n"
            "Jia Li a,*, Tong Zhou b\n"
            "Department of Radiology, Example University\n"
            "Abstract\n"
        )
        rec = self.scan(pdf, text)
        self.assertEqual(rec["authors"], ["Jia Li", "Tong Zhou"])


if __name__ == "__main__":
    unittest.main()
