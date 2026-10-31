<div align="center">
<pre>
   ▄▄▄▄▄▄▄▄ 
 ▄▄█▀▀▀▀▀▀█ 
 █▀█▀▀▀▀▀▀█ 
 █ █▀▀▀▀  █ 
 █▄█▄▄▄▄▄▄█ 
</pre>
</div>

<p align="center"><strong>research-harness</strong></p>

<p align="center">
  A literature-review assistant that runs on your own computer. Frame the question, screen the papers, see how they connect, and get a PRISMA diagram whose numbers add up — in your browser, in plain language.
</p>

<p align="center">
  <a href="https://github.com/can1357/oh-my-pi"><img src="https://img.shields.io/badge/fork%20of-oh--my--pi-58A6FF?style=flat&colorA=222222" alt="fork of oh-my-pi"></a>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-MIT-3FB950?style=flat&colorA=222222" alt="License"></a>
  <img src="https://img.shields.io/badge/APIs-arXiv%20%2B%20OpenAlex%20(keyless)-ffa94d?style=flat&colorA=222222" alt="keyless APIs">
</p>

![research web in light mode, Chat tab, mid-turn: the researcher asked "Switch the active project to demo-web-ui"; the agent's folded steps are open on its thinking and the bash and write tool calls it ran, and its answer says the active project is now demo-web-ui, followed by a table of PRISMA-ScR counts read from review.db. The status reads Working… (a queued follow-up is running) and the message box shows a Stop button beside the claude-opus-5-5 and Thinking: medium pickers. The sidebar lists the projects demo-web-ui (9 of 12 screened) and llm-multi-agent-design and one earlier session; the header still offers Make active until the turn settles and the views refresh.](../assets/research/research-web-poster.png)

_[Watch the 6-minute demo ↗](https://laansdole.github.io/research-harness/#research-web)_ — one unedited take with chapters. A researcher returns to her scoping review on multi-agent LLMs for clinical decision support, asks which paper to read first, triages her reading list, checks a claim in her review, explores the paper graph, and opens the PRISMA diagram. Recorded with real agent turns on a demo project built from a real OpenAlex search.

## Get started

```sh
git clone https://github.com/LaansDole/research-harness
cd research-harness
./setup.sh        # one-time setup; safe to run again after you pull
research web      # opens your research workspace in the browser
```

You need [omp](https://github.com/can1357/oh-my-pi), `python3` and [bun](https://bun.sh) (run `bun install` once in the folder). If something looks off, `research doctor` tells you what is missing. Prefer the terminal? `research` starts the same assistant there.

Then just say what you are working on — *"I'm starting a scoping review on LLM agents in emergency triage. Where do I start?"* — and it proposes the next step.

## What it does for you

- **Frames your question** as PCC/PICO with inclusion and exclusion criteria.
- **Plans the search** — which databases suit your question, and ready-to-paste search strings in each one's own syntax. It searches arXiv, OpenAlex and your own folder of PDFs itself; for paywalled databases you run the string and import the export (RIS, BibTeX or CSV). Nothing is scraped.
- **Screens** — removes duplicates, then checks each record against your criteria and gives a one-sentence reason you can check. You see the verdicts before they are saved.
- **Finds full texts** from open-access sources only (OpenAlex, Unpaywall, arXiv, your own PDFs). Anything it cannot find is marked *not retrieved*, never guessed.
- **Drafts a cited review** from your included papers, citing only papers in your review.
- **Counts for you** — every PRISMA-ScR number comes from each record's state, so the diagram always adds up.
- **Exports** RIS or BibTeX for Covidence, Zotero or EndNote whenever you want.

### Reading list

![research web Reading list tab for the demo-web-ui project, filtered to Excluded at title/abstract (5 of 14 records): each row shows the paper's title, authors, year and venue, an Excluded · T/A state, and an "Ask agent to reconsider" button. Filter chips above show All 14, Duplicate 2, Excluded T/A 5, Passed T/A 1, Full text ready 1, Full text not found 1, Included 4, beside a search box; a banner offers "Screen full texts" for the 1 full text ready.](../assets/research/web-reading-list.png)

Every record with its state, verdict and reason. Filter by state, search by title, author or DOI, and triage with the keyboard (↑/↓, Enter, Esc).

### Paper graph

![research web Graph tab: the paper graph across all projects, a handful of papers connected by cites, related and same-topic edges, with a side panel open on "Development of a Large Language Model-based Multi-Agent Clinical Decision Support System for Korean Triage and Acuity Scale" (2025, Adv Artif Intell Mach Learn, DOI link) and buttons for Find citing papers, Auto-edges and Explain neighbors.](../assets/research/web-graph.png)

How your papers connect — citation links checked against OpenAlex, plus related and same-topic links. Click a paper for its details.

### PRISMA diagram

![research web PRISMA tab: the PRISMA-ScR flow for demo-web-ui — 14 records identified from OpenAlex, 2 duplicates removed, 12 screened, 5 excluded (no abstract 3, Other 1, Concept 1), 7 reports sought, 1 not retrieved (no open-access copy found), 5 assessed for eligibility, 0 excluded, 4 studies included, with notes for 1 awaiting full-text retrieval and 1 awaiting full-text screening, and a Download SVG button.](../assets/research/web-prisma.png)

Drawn from your records and ready to download as SVG for your manuscript.

**You stay in control.** The reading list, review, graph and PRISMA views only show your work. Buttons such as *Screen full texts* or *Check the claims in this section* just fill in the message box — nothing runs until you press Enter. The workspace runs on your own machine (`127.0.0.1`), and each review lives in its own folder under `~/.research-harness/projects/`, so several reviews can run side by side.

## Commands

You never need these — plain sentences work — but they are there if you like shortcuts. Type `/` in the message box to pick one (`/help` in the terminal).

| Command | In plain words |
|---|---|
| `/scope` | Turn a rough question into criteria and start a project |
| `/databases` | Which databases to search, and why |
| `/searchstring` | Search strings ready to paste into each database |
| `/find` | Search arXiv, OpenAlex and your own PDFs |
| `/import` | Bring in a RIS, BibTeX or CSV export |
| `/dedupe` | Remove duplicate records |
| `/screen` | Screen records against your criteria |
| `/fulltext` | Fetch open-access full texts |
| `/review` | Draft a cited review from the included papers |
| `/graph` | Add papers to the paper graph and explore it |
| `/prisma` | Draw the PRISMA-ScR diagram |
| `/export` | Export RIS or BibTeX |
| `/litreview` | Do a quick review end to end in one go |

## Optional: a faster first screening pass

If you add a TypeSafe key (`TYPESAFE_API_KEY="..."` in `~/.research-harness/config.env`), the Jev model screens the clear-cut records first: very likely includes and very likely excludes are decided automatically, and everything in between — plus any record without an abstract — is left for the assistant and you. Each automatic verdict records the model version and its scores, so you can check or overturn it. Off by default. Walkthrough: [docs/RUNBOOK.md](../docs/RUNBOOK.md).

## Learn more

- [docs/RUNBOOK.md](../docs/RUNBOOK.md) — try it on your own review, step by step, with the numbers you should see.
- [packages/research-web/README.md](../packages/research-web/README.md) — the browser workspace in detail.
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — how it is built: pipeline, data model, retrieval order, screening rules.

<details>
<summary><strong>For developers</strong></summary>

This is a fork of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi), so the whole coding agent is still here. The research layer is additive — `research/`, `assets/research/`, `setup.sh`, `bin/research`, `packages/research-web/`, `docs/` — and reaches stock omp through its plugin, prompt and agent extension points; the browser workspace drives omp's RPC mode. The one exception is a small env-driven branding seam for the terminal welcome banner ([ARCHITECTURE §2.1](../docs/ARCHITECTURE.md#21-branding-seam)). Upstream's own README is the repository-root [README.md](../README.md), untouched. Keeping `main` in step with upstream: [ARCHITECTURE §11](../docs/ARCHITECTURE.md#11-staying-in-sync-with-upstream).

The paper graph is scriptable and exports one self-contained HTML file:

```sh
pg="python3 research/skills/paper-graph/scripts/paper_graph.py"
$pg add --id bert --title "BERT: ..." --doi 10.18653/v1/N19-1423
$pg auto-edges bert          # cites edges from OpenAlex
$pg export --format html     # one-file interactive viz
```

Requirements beyond the above: `python3` standard library only (no pip installs); network access for arXiv/OpenAlex (a local folder of PDFs works offline).

CI scores the docs this fork owns (this README, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`, `packages/research-web/README.md`) with the [avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) detector in [.github/workflows/prose.yml](workflows/prose.yml). It is advisory: findings show up in the job summary and never fail a build.

</details>

## Credits

- Fork of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi), itself a fork of [badlogic/pi-mono](https://github.com/badlogic/pi-mono) by [@mariozechner](https://github.com/mariozechner).
- Literature data: [arXiv](https://arxiv.org) and [OpenAlex](https://openalex.org) (both keyless), plus [Unpaywall](https://unpaywall.org) when a contact email is configured — open-access sources only.
- The demo is recorded live from Chrome with Puppeteer ([assets/research/tapes/research-web.ts](../assets/research/tapes/research-web.ts)) and hosted on [GitHub Pages](https://laansdole.github.io/research-harness/), because GitHub will not play a committed MP4 of this size in place.
