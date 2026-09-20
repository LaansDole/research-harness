<p align="center"><strong>research-harness</strong></p>

<p align="center">
  A research harness built on oh-my-pi: review literature, grow a second brain of papers, and code — all local-first.
</p>

<p align="center">
  <a href="https://github.com/can1357/oh-my-pi"><img src="https://img.shields.io/badge/fork%20of-oh--my--pi-58A6FF?style=flat&colorA=222222" alt="fork of oh-my-pi"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3FB950?style=flat&colorA=222222" alt="License"></a>
  <img src="https://img.shields.io/badge/APIs-arXiv%20%2B%20OpenAlex%20(keyless)-ffa94d?style=flat&colorA=222222" alt="keyless APIs">
</p>

![omp TUI: the PRISMA-ScR flow diagram the harness derives from its own record store at the end of the capture. The lower half of the diagram is on screen — "Records screened (n=50)" branching to "Records excluded (n=4)" with the four exclusion reasons spelled out one per line (sequential pipeline, no mutual agent conditioning; not a diagnostic task; no inter-agent communication; no abstract), then "Reports sought for retrieval (n=1)", "Reports not retrieved (n=0)", ELIGIBILITY with "Reports assessed for eligibility (n=0)", and INCLUDED with "Studies included in review (n=0)". Below it two NOTE lines for the pending work (45 awaiting title/abstract screening, 1 awaiting full-text retrieval) and the arithmetic line that has to balance: "50 - 0 duplicates = 50 screened; 50 - 4 excluded - 45 pending = 1 sought; 1 - 0 not retrieved - 1 pending = 0 assessed; 0 - 0 excluded = 0 included". The status bar at the bottom reads "active: llm-agent-teams-hospital-diagnosis · 5/50 screened · type /help for commands".](assets/research/guided-review-poster.png)

_[Watch the capture ↗](https://laansdole.github.io/research-harness/#guided-review)_ — 13 minutes 24 seconds, unedited, eleven typed lines. It follows this repo's own testing runbook, [docs/RUNBOOK.md](docs/RUNBOOK.md): both Part 0 environment gates, then Part 1 as far as the first screening pass — a real 50-record PubMed export imported, deduped, abstract-filled, screened, confirmed, and counted. It stops at the PRISMA diagram; full-text retrieval, synthesis, the paper graph and export are documented in the runbook but not on camera.

Nothing above is a script. You type what you want in plain language and the harness carries the method: it frames the question as PCC/PICO and writes `scope.md`, ingests your database export into a per-record store, fills in the abstracts a PubMed CSV does not carry, screens each record against your own criteria with an evidence sentence and a first-failed dimension, shows you those verdicts before it writes any of them, and derives every PRISMA count from record state rather than typing it. Where the evidence genuinely will not settle a call it says so and leaves a `maybe` for full text. Covidence stays optional — `/export` writes RIS/BibTeX when you want it. `/litreview` is the one-command shortcut through the same pipeline.

## Literature review pipeline

```
/litreview LLM agents for radiology report generation — criteria: include only
multi-LLM-agent systems evaluated on radiology tasks; max 8 candidates
```

Three agents run the pipeline: `scholar` searches (arXiv + OpenAlex, keyless), `screener` applies your include/exclude criteria with per-paper rationales, `synthesizer` writes `review-<slug>.md` with citations. Open-access PDFs only — null URLs are skipped, never substituted.

## Research mode

`research` launches omp as a self-contained scoping-review assistant: screening, full-text retrieval, and the PRISMA-ScR diagram all happen in-harness, so Covidence is optional rather than required (`/export` still writes RIS/BibTeX for Covidence, Zotero, or EndNote when you want them). It frames questions as PCC/PICO, recommends databases with rationale (from the skill's `references/DATABASES.md` — coverage, gaps, MeSH vs Emtree vs field-tag syntax), builds ready-to-paste per-database search strings, keeps every PRISMA count derived from per-record states, and proposes the next workflow step after every command.

You never have to remember any of it: `/help` prints the whole capability guide in plain words — what each command does and when you would reach for it — and the bar at the bottom of the screen keeps your place, reading `active: <project> · 5/50 screened · type /help for commands` and moving as you screen. Plain sentences work everywhere a command does.

A separate screenshot of `/searchstring`, from a review on emergency-department triage rather than the one in the capture above:

![omp TUI: the search strings the harness wrote for a scoping review on LLM agents in emergency-department triage — an Embase block built from :ti,ab,kw terms (triage, chief complaint, acuity) with the note to verify the controlled-vocabulary terms against Emtree, a Scopus TITLE-ABS-KEY() block that ANDs the LLM/agent synonyms with the triage and emergency-department ones, and the matching arXiv abs: query — followed by the honest caveats, including that a bare "ED" is avoided as a free-text term because it collides with an unrelated meaning, and the reminder to paste the strings into each database and bring the exports back.](assets/research/search-strings.png)

| Command | Does |
|---|---|
| `/scope <question>` | fuzzy question to PCC/PICO + inclusion/exclusion table; creates the project (or switches to an existing slug) |
| `/databases` | which databases to search for THIS question, with rationale, coverage gaps, and access notes |
| `/searchstring [db]` | ready-to-paste strings in each database's exact syntax (MeSH/Emtree/field tags), recorded under `searches/` |
| `/find` | run what CAN be run: arXiv + OpenAlex + local corpus, via the `scholar` agent |
| `/import <file>` | ingest RIS/BibTeX/CSV/JSONL exports into the per-record review store (`review.db`) with per-database counts; idempotent |
| `/dedupe` | mark duplicates in the store (DOI, then normalized title), survivors keep merged metadata |
| `/screen` | walk the unscreened queue with PCC verdicts per `SCREENING.md` — title/abstract or full-text stage — persisted per record; resumable (optional Jev pre-screen — see below) |
| `/fulltext` | OA-first retrieval cascade: OpenAlex -> Unpaywall -> arXiv -> local corpus -> web-search candidate you approve |
| `/prisma [--format]` | PRISMA-ScR flow diagram DERIVED from record states (text/mermaid/svg/html) |
| `/review` | synthesize a cited review from the includes, via the `synthesizer` agent |
| `/graph` | file the includes into the paper graph and view it inside the terminal (`paper_graph.py view`; inline PNG on Kitty terminals) |
| `/export <ris\|bib>` | write out the includes, all candidates, or the whole graph for Covidence/Zotero/EndNote |
| `/litreview <question>` | **the end-to-end shortcut** — search, screen, fetch, synthesize, graph, in one turn |

Each review lives in its own project under `~/.research-harness/projects/<slug>/` (scope, recorded searches, the `review.db` record store, fetched PDFs), so several reviews can run side by side. A full pass reads: scope -> databases -> searchstring -> find + import -> dedupe -> screen -> fulltext -> prisma -> review -> graph -> export. Paywalled databases are never scraped: the mode writes the strings, you paste them and bring back the exports. Full texts come from open-access sources only — OpenAlex first, then Unpaywall (needs `UNPAYWALL_EMAIL` or `OPENALEX_MAILTO`; skipped rather than faked without one), then arXiv and your corpus, with web search a last resort that hands back a candidate URL for you to approve. A record that resolves to nothing ends as `fulltext_not_retrieved` with a reason — never a guessed link.

**Optional Jev first pass** — TypeSafe's Jev is a _decision-only_ model: it never writes prose, it answers specific yes/no questions and hands back a probability for each one. That is the shape screening already has — one question per inclusion criterion — which is why it is fast and costs a small fraction of a general LLM.

**How the pass works.** Before the `screener` agent reads anything, each title/abstract record gets ONE call carrying one question per must-meet criterion from the review's scope. The banding is enforced in code, not judgment: every criterion at or above 0.90 auto-includes, the weakest at or below 0.10 auto-excludes, and everything in between — plus any record with no abstract — is left completely untouched for the `screener` agent and for you. The first pass only removes the records nobody would have argued about; it never shrinks what a human sees.

**Auditable and reversible.** Each auto-verdict is written through the same review-store command a human verdict uses, and carries its provenance in the rationale — `[jev-1.13.0 p=0.04] exclude on criterion 'Context' (Concept=0.71, Context=0.04, Population=0.88)`: the model version that decided, and every per-criterion probability. Any of them can be checked or overturned later.

**Off by default.** Turn it on by adding `TYPESAFE_API_KEY="..."` to `~/.research-harness/config.env` (or exporting it); `research doctor` reports the first pass as OFF when no key is set. With no key the workflow is byte-for-byte unchanged and the assistant never mentions it. Enabled, it is one API call per record — screening the whole queue costs less than a single general-model turn.

`docs/RUNBOOK.md` has the hands-on subsection ("Optional: a cheap first pass with Jev"); `docs/ARCHITECTURE.md` documents the design — band rule, provenance, and key resolution.

## Second-brain paper graph

![omp TUI: the librarian agent answers "what connects them" for the papers it just added. The reply lists verified citations found in the papers' own reference lists rather than inferred (medcoact cites clinicalagent, ref [2]; med-debate-mesh cites sem-agents, ref [21]), then same-topic clusters by architecture, naming the tightest methodological pair (sem-agents and sr-mapr), explaining what med-debate-mesh and medcoact each add, and calling out clinicalagent as the outlier since it is the only trial-prediction paper — ending with the next steps it can run: auto-edges per paper, screening the new nodes against the scope, and the HTML export. Status bar shows the real session: Sonnet 5, 14.0%/1M context, $0.61.](assets/research/paper-graph-poster.png)

_[Watch the capture ↗](https://laansdole.github.io/research-harness/#paper-graph)_ — six and a half minutes, unedited: the folder, the adds, the connection answer, and the export.

In the demo the `librarian` agent grows the graph live from the TUI: corpus scan, adds with full metadata, same-topic linking, the connection query, and the HTML export — the other operations it offers (`auto-edges` per paper to pull OpenAlex-verified citation edges, screening the new nodes against the scope) are one command away. Every reviewed paper lands in a local SQLite graph (`~/.research-harness/papers.db`) with typed edges: `cites`, `related`, `same-topic`. `auto-edges` resolves papers on OpenAlex and links them to the papers you already have via `referenced_works` — Connected-Papers style, offline-first. The same operations are scriptable directly:

```sh
pg="python3 research/skills/paper-graph/scripts/paper_graph.py"
$pg add --id bert --title "BERT: ..." --doi 10.18653/v1/N19-1423
$pg auto-edges bert          # cites edges from OpenAlex
$pg neighbors bert --depth 2 # BFS with edge provenance
$pg export --format html     # one-file interactive viz
```

![Interactive paper-graph export: a dark force-directed canvas of paper nodes sized by degree, edges colored by type, a search box top-left, a type legend bottom-left, and a metadata side panel open on the selected paper.](assets/research/graph-viz.png)

The export is ONE self-contained HTML file — vanilla-JS force-directed canvas, node size by degree, edge colors by type, search, drag/zoom/pan, click for metadata. No external assets; works from `file://` on a plane, the only outbound links being DOIs in the metadata panel.

## Everything oh-my-pi has

This is a fork of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) — the coding agent with the IDE wired in: 60+ providers, 31 built-in tools, 14 LSP ops, 28 DAP ops, subagents, and a ~80k-line Rust core. The research layer only adds paths (`research/`, `research/tests/`, `assets/research/`, `setup.sh`, `bin/research`, `docs/ARCHITECTURE.md`, `docs/UPSTREAM.md`) and reaches stock omp through its plugin, prompt, and agent extension points; upstream merges touch none of them, and the only file both sides own is `README.md`. Upstream's full README is preserved at [docs/UPSTREAM.md](docs/UPSTREAM.md).

**Staying in sync with upstream** (synced to upstream `main` 78b753124d, 2026-09-19):

```sh
git remote add upstream https://github.com/can1357/oh-my-pi.git   # one-time
git fetch upstream main
git merge upstream/main                                           # only README.md conflicts
git checkout --ours README.md && git add README.md                # this repo keeps its README
git show upstream/main:README.md                                  # refresh the body of docs/UPSTREAM.md
```

## Architecture

The research layer is purely additive — mode prompt, 13 prompt commands, four agents, three skills, two SQLite stores plus per-project files, all under `research/` — wired into stock omp through its plugin and agent extension points. The Python is stdlib-only and covered by 109 tests (`bash research/tests/run.sh`). Full design doc: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```mermaid
flowchart TB
    user["Researcher"]

    subgraph modeLayer["Research mode - an omp session"]
        launcher["bin/research launcher + doctor"]
        system["research/mode/system.md - appended system prompt"]
        commands["Prompt commands: /scope /databases /searchstring /find /import /dedupe /screen /fulltext /prisma /review /graph /export /litreview"]
    end

    subgraph agentLayer["Agents - spawned via the task tool"]
        scholar["scholar - search and dedupe"]
        screener["screener - PCC verdicts"]
        synthesizer["synthesizer - cited review"]
        librarian["librarian - graph curation"]
    end

    subgraph skillLayer["Skills - python3 stdlib scripts"]
        lit["literature-search: arxiv_search / openalex_search / fetch_paper / local_library / refs_io / review / prisma_scr / prisma / _http / jev_client / jev_screen"]
        pg["paper-graph: paper_graph / graph_viz / graph_png"]
    end

    subgraph storeLayer["Stores"]
        reviewdb[("review.db per project - records + history")]
        papersdb[("papers.db - paper graph nodes + typed edges")]
        files["Project files: scope.md, searches/, records/, papers/, prisma.json"]
    end

    outputs["Outputs: review-slug.md, PRISMA-ScR diagram, graph.html, RIS/BibTeX exports"]

    user --> launcher
    launcher --> system
    user --> commands
    commands --> agentLayer
    commands --> skillLayer
    agentLayer --> skillLayer
    skillLayer --> reviewdb
    skillLayer --> papersdb
    skillLayer --> files
    reviewdb --> outputs
    papersdb --> outputs
    files --> outputs
```

## Quickstart

```sh
git clone https://github.com/LaansDole/research-harness
cd research-harness
./setup.sh        # registers the plugin, copies agents + prompts, writes config, symlinks the launcher — idempotent
research doctor   # checks omp, plugin, agents, prompts, corpus, and paper-graph db
research          # exports the research env and starts omp with the mode system prompt appended
```

Then type `/help` to see every command in plain words. To test-drive it on your own review — every step with the numbers you should see and what a different one means — follow [docs/RUNBOOK.md](docs/RUNBOOK.md); the capture above walks its first half.

`bin/research` is a thin launcher: it sources `~/.research-harness/config.env`, exports `RESEARCH_HARNESS_HOME`, `PAPER_GRAPH_DB` (default `~/.research-harness/papers.db`) and `RESEARCH_CORPUS_DIR` when set, then `exec`s your `omp` with `--append-system-prompt research/mode/system.md` — all omp flags pass through. Re-run `./setup.sh` after pulling; new commands reach `~/.omp/agent/prompts/` only when it runs.

Requirements: [omp](https://github.com/can1357/oh-my-pi) installed, `python3` (stdlib only — no pip installs), network for arXiv/OpenAlex (a local corpus works fully offline).

## Credits

- Fork of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi), itself a fork of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) by [@mariozechner](https://github.com/mariozechner).
- Literature data: [arXiv](https://arxiv.org) export API and [OpenAlex](https://openalex.org) (both keyless), plus [Unpaywall](https://unpaywall.org) for OA locations when a contact email is configured — honest User-Agent; open-access sources only.
- Terminal demos rendered with [charmbracelet/vhs](https://github.com/charmbracelet/vhs); the captures play at full quality on [GitHub Pages](https://laansdole.github.io/research-harness/). GitHub will not render a committed MP4 above about 1 MB and serves repository blobs as downloads, so a repo-committed video cannot be watched in place — the page exists for that reason.
