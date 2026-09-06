<p align="center"><strong>research-harness</strong></p>

<p align="center">
  A research harness built on oh-my-pi: review literature, grow a second brain of papers, and code — all local-first.
</p>

<p align="center">
  <a href="https://github.com/can1357/oh-my-pi"><img src="https://img.shields.io/badge/fork%20of-oh--my--pi-58A6FF?style=flat&colorA=222222" alt="fork of oh-my-pi"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3FB950?style=flat&colorA=222222" alt="License"></a>
  <img src="https://img.shields.io/badge/APIs-arXiv%20%2B%20OpenAlex%20(keyless)-ffa94d?style=flat&colorA=222222" alt="keyless APIs">
</p>

![omp TUI: the final turn of a live /litreview run over a 49-file local PDF corpus. The scholar, screener, and synthesizer agents have finished, and the results table reads: Candidates screened 0 -> 4 (from 49-file local corpus scan), Verdicts 4 include / 0 exclude / 0 maybe, Review file review-multi-agent-llm-clinical-feedback.md (~330-word body + refs), PDFs fetched 0 (local corpus, no fetch needed), Paper graph 0 papers / 0 edges -> 4 papers / 6 same-topic edges. The report ends with the requested stats line GRAPH -> 4 papers / 6 edges, and the status bar shows the real session: Sonnet 5, 6.2%/1M context, $0.37.](assets/research/litreview-poster.png)

_[Watch the capture ↗](assets/research/litreview.mp4)_

One command — typed in the interactive omp TUI, as recorded above — searches your sources (arXiv + OpenAlex, or a local PDF corpus via `RESEARCH_CORPUS_DIR` for fully offline runs like the demo), screens candidates against your criteria, fetches open-access PDFs, writes a cited review, and files every included paper into a local knowledge graph. `/litreview` is the end-to-end shortcut; the full research mode below breaks the same workflow into researcher-shaped commands.

## Literature review pipeline

```
/litreview LLM agents for radiology report generation — criteria: include only
multi-LLM-agent systems evaluated on radiology tasks; max 8 candidates
```

Three agents run the pipeline: `scholar` searches (arXiv + OpenAlex, keyless), `screener` applies your include/exclude criteria with per-paper rationales, `synthesizer` writes `review-<slug>.md` with citations. Open-access PDFs only — null URLs are skipped, never substituted.

## Research mode

`research` launches omp as a systematic-review assistant: it frames questions as PCC/PICO, recommends databases with rationale (from the skill's `DATABASES.md` — coverage, gaps, MeSH vs Emtree vs field-tag syntax), builds ready-to-paste per-database search strings, keeps PRISMA counts honest, and proposes the next workflow step after every command.

| Command | Does |
|---|---|
| `/scope <question>` | PCC/PICO framing + inclusion/exclusion table; creates the project |
| `/databases` | which databases to search for THIS question, with rationale and gaps |
| `/searchstring [db]` | ready-to-paste strings in each database's exact syntax, recorded for reproducibility |
| `/find` | run what CAN be run: arXiv + OpenAlex + local corpus |
| `/import <file>` | ingest RIS/BibTeX/CSV exports from databases the harness cannot query |
| `/prisma` | dedupe (DOI, then normalized title) and show the PRISMA ledger |
| `/screen` | PCC verdicts with evidence-based rationales per `SCREENING.md` |
| `/review` | synthesize a cited review from the includes |
| `/graph` | view the paper graph inside the terminal (`paper_graph.py view`; inline PNG on Kitty terminals) |
| `/export <ris\|bib>` | export for Covidence/Zotero/EndNote |
| `/litreview <question>` | the end-to-end shortcut |

Each review lives in its own project under `~/.research-harness/projects/<slug>/` (scope, recorded searches, PRISMA counts, records), so several reviews can run side by side. Paywalled databases are never scraped: the mode writes the strings, you paste them and bring back the exports.

## Second-brain paper graph

![omp TUI: the librarian agent has finished growing the paper graph from the local corpus. The before/after table reads: Papers in graph 0 -> 3 (sem-agents, medcoact, sr-mapr), Metadata none -> full (title/authors/year/venue/DOI/OpenAlex ID/abstract/path) per paper, Edges 0 -> 3 same-topic (fully connected triangle), OpenAlex citation edges 0 -> 0 with each paper resolved (27/9/10 references respectively) but none among these 3 nodes, Viz export -> /tmp/rh-demo-graph/graph.html (offline, interactive). Above it, the librarian answers what connects the first two papers: a direct same-topic edge — both do integrated diagnosis+treatment via specialized multi-agent roles with reflection/confidence mechanisms.](assets/research/paper-graph-poster.png)

_[Watch the capture ↗](assets/research/paper-graph.mp4)_

In the demo the `librarian` agent grows the graph live from the TUI: corpus scan, add/link with metadata, OpenAlex `auto-edges`, a connection query, and the HTML export. Every reviewed paper lands in a local SQLite graph (`~/.research-harness/papers.db`) with typed edges: `cites`, `related`, `same-topic`. `auto-edges` resolves papers on OpenAlex and links them to the papers you already have via `referenced_works` — Connected-Papers style, offline-first. The same operations are scriptable directly:

```sh
pg="python3 research/skills/paper-graph/scripts/paper_graph.py"
$pg add --id bert --title "BERT: ..." --doi 10.18653/v1/N19-1423
$pg auto-edges bert          # cites edges from OpenAlex
$pg neighbors bert --depth 2 # BFS with edge provenance
$pg export --format html     # one-file interactive viz
```

![graph viz](assets/research/graph-viz.png)

The export is ONE self-contained HTML file — vanilla-JS force-directed canvas, node size by degree, edge colors by type, search, drag/zoom/pan, click for metadata. Zero external URLs; works from `file://` on a plane.

## Everything oh-my-pi has

This is a fork of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) — the coding agent with the IDE wired in: 60+ providers, 31 built-in tools, LSP/DAP integration, subagents, and a Rust core. The research layer is purely additive (everything lives under `research/`), so upstream updates merge clean. Upstream's full README is preserved at [docs/UPSTREAM.md](docs/UPSTREAM.md).

## Quickstart

```sh
git clone https://github.com/LaansDole/research-harness
cd research-harness
./setup.sh     # installs the plugin, agents, prompts, config, and the launcher — idempotent
research       # opens the omp TUI in research mode ('research doctor' to verify the wiring)
```

Requirements: [omp](https://github.com/can1357/oh-my-pi) installed, `python3` (stdlib only — no pip installs), network for arXiv/OpenAlex (a local corpus works fully offline).

## Credits

- Fork of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi), itself a fork of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) by [@mariozechner](https://github.com/mariozechner).
- Literature data: [arXiv](https://arxiv.org) export API and [OpenAlex](https://openalex.org) — both keyless; honest User-Agent; open-access sources only.
- Terminal demos rendered with [charmbracelet/vhs](https://github.com/charmbracelet/vhs).
