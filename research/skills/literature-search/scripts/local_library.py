#!/usr/bin/env python3
"""Scan a local PDF corpus into JSON-lines records, or extract full text from one PDF.

Stdlib only. Text extraction prefers `pdftotext` (poppler) when on PATH, then
PyMuPDF (`fitz`) when importable, then a built-in metadata-only fallback that
reads the PDF /Title. A scan never crashes on a bad PDF: the record is emitted
with whatever fields resolved plus an "extract_error" field.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

SUBPROCESS_TIMEOUT = 60  # seconds per file; one bad PDF must not hang a scan
ABSTRACT_CAP = 4000
DOI_RE = re.compile(r"10\.\d{4,9}/\S+")
YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
# Letters of "abstract"/"keywords" may be letter-spaced (Elsevier: "a b s t r a c t").
ABSTRACT_RE = re.compile(r"(?i)^\s*a\s*b\s*s\s*t\s*r\s*a\s*c\s*t\b[\s:.\u2013\u2014-]*")
STOP_RE = re.compile(
    r"(?i)^\s*(k\s*e\s*y\s*w\s*o\s*r\s*d\s*s?\b|index terms\b|ccs concepts\b"
    r"|acm reference|[1i]\s*[.)]?\s*introduction\b|introduction\s*$|1\s*[.)]\s)"
)
KEYWORDS_RE = re.compile(r"(?i)^\s*k\s*e\s*y\s*w\s*o\s*r\s*d\s*s?\b")
# Front-matter noise that must not be mistaken for a title line.
TITLE_SKIP_RE = re.compile(
    r"(?i)^(arxiv[:.]|doi[:\s]|10\.\d{4,9}/|https?://|www\.|received\b|accepted\b"
    r"|published\b|available online|contents lists|sciencedirect|elsevier|springer"
    r"|proceedings of\b|journal of\b|vol\.?\s*\d|volume\s*\d|issn|isbn|\u00a9|copyright"
    r"|licens|open access|preprint|research article|original article|citation:)"
    r"|.*\d+\s*\(\d{4}\)\s*\d+"
)


def norm_ws(s):
    return re.sub(r"\s+", " ", s or "").strip()


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------- text extraction chain ----------


def text_pdftotext(path, first=None, last=None):
    cmd = ["pdftotext"]
    if first:
        cmd += ["-f", str(first)]
    if last:
        cmd += ["-l", str(last)]
    cmd += ["-enc", "UTF-8", path, "-"]
    r = subprocess.run(cmd, capture_output=True, timeout=SUBPROCESS_TIMEOUT)
    if r.returncode != 0:
        raise RuntimeError(
            f"pdftotext exit {r.returncode}: {r.stderr.decode('utf-8', 'replace')[:200]}"
        )
    return r.stdout.decode("utf-8", "replace")


def text_fitz(path, first=None, last=None):
    import fitz  # PyMuPDF; optional

    doc = fitz.open(path)
    try:
        lo = (first or 1) - 1
        hi = min(last or doc.page_count, doc.page_count)
        return "\n".join(doc[i].get_text() for i in range(lo, hi))
    finally:
        doc.close()


def extract_text(path, first=None, last=None):
    """Return (text, error). error is None on success; text is "" on total failure."""
    errors = []
    if shutil.which("pdftotext"):
        try:
            return text_pdftotext(path, first, last), None
        except subprocess.TimeoutExpired:
            errors.append(f"pdftotext timeout after {SUBPROCESS_TIMEOUT}s")
        except Exception as e:  # noqa: BLE001 - any failure falls through the chain
            errors.append(str(e)[:200])
    try:
        return text_fitz(path, first, last), None
    except ImportError:
        errors.append("fitz not importable")
    except Exception as e:  # noqa: BLE001
        errors.append(f"fitz: {str(e)[:200]}")
    return "", "; ".join(errors) or "no extractor available"


# ---------- built-in PDF metadata fallback (stdlib only) ----------


def _decode_pdf_string(b):
    if b[:2] == b"\xfe\xff":
        return b[2:].decode("utf-16-be", "replace")
    out = bytearray()
    i = 0
    escapes = {0x6E: 0x0A, 0x72: 0x0D, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0C}
    while i < len(b):
        c = b[i]
        if c == 0x5C and i + 1 < len(b):  # backslash escape
            nxt = b[i + 1]
            if nxt in escapes:
                out.append(escapes[nxt])
                i += 2
            elif nxt in (0x28, 0x29, 0x5C):  # ( ) \
                out.append(nxt)
                i += 2
            elif 0x30 <= nxt <= 0x37:  # octal, up to 3 digits
                j = i + 1
                while j < len(b) and j < i + 4 and 0x30 <= b[j] <= 0x37:
                    j += 1
                out.append(int(b[i + 1 : j], 8) & 0xFF)
                i = j
            else:
                i += 1  # unknown escape / line continuation: drop backslash
        else:
            out.append(c)
            i += 1
    return out.decode("latin-1", "replace")


def _pdf_string_values(raw, key):
    """All decoded string values following /<key> in the raw bytes."""
    values = []
    start = 0
    needle = b"/" + key
    while True:
        idx = raw.find(needle, start)
        if idx < 0:
            break
        i = idx + len(needle)
        while i < len(raw) and raw[i] in b" \r\n\t":
            i += 1
        if i >= len(raw):
            break
        if raw[i] == 0x28:  # literal string (...)
            depth = 1
            j = i + 1
            buf = bytearray()
            while j < len(raw) and depth > 0:
                c = raw[j]
                if c == 0x5C and j + 1 < len(raw):
                    buf += raw[j : j + 2]
                    j += 2
                    continue
                if c == 0x28:
                    depth += 1
                elif c == 0x29:
                    depth -= 1
                    if depth == 0:
                        break
                buf.append(c)
                j += 1
            values.append(_decode_pdf_string(bytes(buf)))
        elif raw[i] == 0x3C:  # hex string <...>
            end = raw.find(b">", i)
            if end > i:
                hexed = re.sub(rb"\s", b"", raw[i + 1 : end])
                try:
                    values.append(_decode_pdf_string(bytes.fromhex(hexed.decode("ascii"))))
                except ValueError:
                    pass
        start = idx + len(needle)
    return [norm_ws(v) for v in values if norm_ws(v)]


def pdf_meta(raw):
    """{title, author, year} from raw PDF bytes; any value may be None.

    Regex-level scan, not a real PDF parser: misses Info dicts inside compressed
    object streams, which is acceptable for a last-resort fallback.
    """
    titles = _pdf_string_values(raw, b"Title")
    # Multiple /Title keys occur (outlines etc.); the longest is usually the doc title.
    title = max(titles, key=len) if titles else None
    authors = _pdf_string_values(raw, b"Author")
    author = authors[0] if authors else None
    year = None
    for key in (b"CreationDate", b"ModDate"):
        for v in _pdf_string_values(raw, key):
            m = re.search(r"(19|20)\d{2}", v)
            if m:
                year = int(m.group(0))
                break
        if year:
            break
    return {"title": title, "author": author, "year": year}


def page_count(path, raw):
    if shutil.which("pdfinfo"):
        try:
            r = subprocess.run(
                ["pdfinfo", path], capture_output=True, timeout=SUBPROCESS_TIMEOUT
            )
            m = re.search(rb"^Pages:\s+(\d+)", r.stdout, re.M)
            if m:
                return int(m.group(1))
        except Exception:  # noqa: BLE001
            pass
    try:
        import fitz

        doc = fitz.open(path)
        try:
            return doc.page_count
        finally:
            doc.close()
    except Exception:  # noqa: BLE001
        pass
    n = len(re.findall(rb"/Type\s*/Page[^s]", raw))
    return n or None


# ---------- field heuristics ----------


def plausible_meta_title(title, stem):
    t = norm_ws(title or "")
    if len(t) <= 15:
        return False
    if re.search(r"(?i)\.(pdf|dvi|docx?|tex|indd|eps|ps)\b", t):
        return False
    if re.match(r"(?i)^(microsoft (word|powerpoint)|untitled|doi[:\s]|https?://|10\.\d{4,9}/)", t):
        return False
    if slugify(t) == slugify(stem):
        return False  # metadata just echoes the filename
    letters = sum(ch.isalpha() for ch in t)
    return letters >= len(t) * 0.5


def title_from_text(text):
    lines = [norm_ws(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    for line in lines[:40]:
        if ABSTRACT_RE.match(line):
            break  # ran past the title zone
        if TITLE_SKIP_RE.match(line):
            continue
        if "journal" in line.lower() and len(line.split()) <= 6:
            continue  # journal name banner, not a title
        letters = sum(c.isalpha() for c in line)
        if (
            20 <= len(line) <= 250
            and len(line.split()) >= 4
            and letters >= len(line) * 0.55
            and "@" not in line
        ):
            return line
    return None


def title_from_filename(stem):
    t = re.sub(r"\s*\(\d+\)\s*$", "", stem)  # trailing " (1)" copy marker
    return norm_ws(re.sub(r"[_\-]+", " ", t))


STRUCTURED_START_RE = re.compile(
    r"(?i)^\s*(background|objectives?|purpose|aims?)( and objectives?)?\s*:"
)


def abstract_from_text(text):
    lines = text.splitlines()
    start = None
    remainder = ""
    for i, line in enumerate(lines):
        m = ABSTRACT_RE.match(line)
        if m:
            start = i + 1
            remainder = line[m.end() :]
            break
    if start is None:
        # Structured abstract without an "Abstract" heading (Background: ... Key words:).
        for i, line in enumerate(lines[:80]):
            if STRUCTURED_START_RE.match(line):
                start = i
                break
    if start is None:
        return ""
    parts = [remainder] if norm_ws(remainder) else []
    i = start
    while i < len(lines):
        line = lines[i]
        if STOP_RE.match(line):
            # Two-column front matter interleaves the Keywords block between the
            # abstract heading and its body; skip past it (to its blank line) when
            # no real abstract text has been collected yet.
            if KEYWORDS_RE.match(line) and sum(len(p) for p in parts) < 200:
                i += 1
                while i < len(lines) and norm_ws(lines[i]):
                    i += 1
                continue
            break
        parts.append(line)
        if sum(len(p) for p in parts) > ABSTRACT_CAP * 2:
            break
        i += 1
    return norm_ws(" ".join(parts))[:ABSTRACT_CAP]


def doi_from_text(text):
    m = DOI_RE.search(text)
    if not m:
        return None
    return m.group(0).rstrip(".,;:)]}\"'")


def year_from(meta, text):
    if meta.get("year"):
        return meta["year"]
    first_page = text.split("\f", 1)[0] if text else ""
    for m in YEAR_RE.finditer(first_page):
        y = int(m.group(0))
        if 1900 <= y <= 2035:
            return y
    return None


# ---------- subcommands ----------


def scan_one(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    rec = {
        "source": "local",
        "id": slugify(stem),
        "path": os.path.abspath(path),
        "title": None,
        "authors": None,
        "year": None,
        "doi": None,
        "abstract": "",
        "pages": None,
    }
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError as e:
        rec["title"] = title_from_filename(stem)
        rec["extract_error"] = f"read failed: {e}"
        return rec

    meta = {}
    try:
        meta = pdf_meta(raw)
    except Exception as e:  # noqa: BLE001
        rec["extract_error"] = f"metadata parse failed: {str(e)[:200]}"

    text, err = extract_text(path, first=1, last=3)
    if err:
        rec["extract_error"] = err

    try:
        if plausible_meta_title(meta.get("title"), stem):
            rec["title"] = meta["title"]
        else:
            rec["title"] = title_from_text(text) or title_from_filename(stem)
        rec["authors"] = meta.get("author")
        rec["year"] = year_from(meta, text)
        rec["doi"] = doi_from_text(text)
        rec["abstract"] = abstract_from_text(text)
        rec["pages"] = page_count(path, raw)
    except Exception as e:  # noqa: BLE001 - never crash a scan on one bad PDF
        rec.setdefault("extract_error", f"field extraction failed: {str(e)[:200]}")
        if not rec["title"]:
            rec["title"] = title_from_filename(stem)
    return rec


def cmd_scan(args):
    if not os.path.isdir(args.dir):
        print(f"local_library: not a directory: {args.dir}", file=sys.stderr)
        sys.exit(1)
    names = sorted(
        n for n in os.listdir(args.dir) if n.lower().endswith(".pdf")
    )
    if args.max:
        names = names[: args.max]
    for name in names:
        rec = scan_one(os.path.join(args.dir, name))
        print(json.dumps(rec, ensure_ascii=False))
        sys.stdout.flush()


def cmd_extract(args):
    if not os.path.isfile(args.path):
        print(f"local_library: no such file: {args.path}", file=sys.stderr)
        sys.exit(1)
    text, err = extract_text(args.path)
    if err and not text:
        print(f"local_library: extraction failed: {err}", file=sys.stderr)
        sys.exit(1)
    out = {
        "source": "local",
        "path": os.path.abspath(args.path),
        "chars": len(text),
        "truncated": len(text) > args.max_chars,
        "text": text[: args.max_chars],
    }
    print(json.dumps(out, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(
        description="Local PDF corpus scanner. One JSON object per line."
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("scan", help="scan a directory of PDFs into candidate records")
    p.add_argument("--dir", required=True)
    p.add_argument("--max", type=int, help="scan at most N PDFs (sorted by filename)")
    p.set_defaults(fn=cmd_scan)

    p = sub.add_parser("extract", help="full text of one PDF for full-text screening")
    p.add_argument("--path", required=True)
    p.add_argument("--max-chars", type=int, default=200000)
    p.set_defaults(fn=cmd_extract)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
