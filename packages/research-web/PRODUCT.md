# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Researchers running a literature review (systematic, scoping, or mini review): academics, clinicians and graduate students. They are mostly non-technical, type short plain sentences rather than commands, and judge the tool against Covidence, the systematic-review platform they already know. They work on their own machine (`127.0.0.1`), usually in daylight and for long reading sessions, moving between screening records, reading full texts and reviewing the agent's synthesis.

## Product Purpose

research web is the browser workspace of research-harness: one command (`research web`) opens a research agent beside the researcher's review projects. It takes a review from a fuzzy question to a publication-ready PRISMA-ScR diagram (scope, databases, search strings, import, dedupe, screening, full texts, synthesis, paper graph, export) without the researcher needing to know the tool's internals. Success: the researcher always knows where the review stands and what to do next, and every number and verdict can be traced back to a record.

## Positioning

PRISMA counts are derived from per-record states in the project's review store, never typed by hand, so the diagram reconciles by construction. Screening verdicts carry a recorded reason and confidence and follow the researcher's PCC method. The agent does the work, and buttons in the research views write a request into the message box so nothing changes until the researcher sends it — except screening, which the researcher can do herself from the reading list, through the same `review.py verdict` the agent uses.

## Operating Context

- Views: Chat, Graph (paper graph), Reviews (synthesized review files), Reading list (records by state, with verdicts and reasons), PRISMA (flow diagram, SVG download); a sidebar of projects (with screening progress) and sessions.
- Record states (PRISMA-ScR): identified, duplicate, screened_included, screened_excluded, fulltext_sought, fulltext_retrieved, fulltext_not_retrieved, fulltext_excluded, included.
- Verdicts: include / exclude / maybe at title-abstract stage (maybe is rare), include / exclude at full-text stage; each with a reason and a HIGH / MEDIUM / LOW confidence.
- Researchers' habits: annotated PDFs and highlighters, PRISMA flow diagrams in manuscripts, Covidence's screening screens, reference managers (Zotero) and RIS/BibTeX exports.

## Capabilities and Constraints

- Local only: binds `127.0.0.1`. The only project writes it makes are screening verdicts (through the `review.py` CLI, never SQL) and the per-project highlight-word list; everything else is read-only and goes through the agent.
- Open-access PDFs only; no shadow libraries, no scraping of paywalled databases.
- The client reuses collab-web's theme tokens and transcript components (`packages/collab-web`, inherited from upstream oh-my-pi). Research-web-specific styling must live in `packages/research-web` so upstream syncs stay conflict-free.
- Light and dark themes exist today, toggled by a sun/moon button and remembered.
- The terminal app (`research`) shares the agent and projects; its logo is `research/branding/logo.txt`.

## Brand Commitments

- Name: research-harness; the browser workspace is "research web".
- Logo: the terminal welcome logo in `research/branding/logo.txt` (also used on the GitHub Pages site).
- Voice: plain researcher language; no flags, file paths, or internals in the UI. Empty states say what to do next; red text only for real failures; no code or error dumps on screen.
- Accent: not pink (user direction, 2026-10-31). The Pages site uses a deep teal.

## Evidence on Hand

- A seeded demo project built from a real OpenAlex search (50-record PubMed export, multi-agent LLMs for clinical decision support), used in the recorded demo.
- Demo video, poster and stills: `assets/research/research-web.mp4`, `research-web-poster.png`, `web-*.png`.
- No user testimonials, usage numbers or published reviews exist; do not invent them.

## Product Principles

1. The researcher always sees where the review stands and the next step.
2. Every count and verdict is traceable to a record and its recorded reason.
3. The agent screens and records its own verdicts with reasons; the researcher confirms or overrules any of them, and her decision is recorded as hers. Every other action waits for her to send it.
4. Plain language over tool vocabulary; Covidence-level friendliness is the bar.
5. Local-first and open-access only.

## Accessibility & Inclusion

Verdict and state colours must never be the only signal (pair each with a label or shape) so colour-blind researchers can screen. Full keyboard operation already exists (tabs, record navigation, Esc/Enter) and must survive any restyle. WCAG AA contrast in both themes.
