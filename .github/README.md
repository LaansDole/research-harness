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

![research web in light mode, Reading list tab, a decision half-made at the screening desk: the paper "Explainability of Agent Behavior in Clinical Decision Support Systems" is open in the panel on the right with Exclude chosen, and the reason picker underneath lists this project's own exclusion criteria, numbered 1 to 9 — number 2, "Multi-agent systems without LLMs (rule-based agents, reinforcement learning)", is selected, with Population / Concept / Context not met, No abstract and Other… below it. Under the picker sit Save exclusion and Cancel and a note that reads "Reinforcement-learning agents, no language model."; below that the abstract is marked with the researcher's own highlight words, green for include and vermilion underlined for exclude. The header strip counts 20 Identified, 18 Screened with 5 still to screen, 8 Sought with 2 to retrieve, 5 Assessed with 1 to assess, 4 Included, and the list behind the panel holds all five papers still waiting, their titles marked.](../assets/research/research-web-poster.png)

_[Watch the 5½-minute demo ↗](https://laansdole.github.io/research-harness/#research-web)_ — one unedited take with chapters, in real time. A researcher comes back to her scoping review on multi-agent LLMs for clinical decision support, asks the agent where the review stands, opens her reading list from the PRISMA strip, has the words from her own criteria marked in every title and abstract, screens four papers herself — include, exclude with a reason, maybe, and one where she confirms what the agent suggested — marks a claim in her draft for checking, glances at the paper graph and ends on the PRISMA diagram her decisions just changed. Recorded with a real agent turn on a demo project built from a real OpenAlex search.

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
- **Screens with you** — it removes duplicates, then screens each record against your criteria and records its verdict with a one-sentence reason and how confident it is. At the screening desk you confirm or overrule any of them with one key — *Include*, *Exclude* or *Maybe*, the exclusion reason picked from your own criteria, a note if you want one — and what you decide is recorded as your decision, with your reason.
- **Marks your own words** — the terms from your inclusion and exclusion criteria are highlighted in every title and abstract, green for include and vermilion for exclude, so you can see at a glance why a paper is there. Suggested from your scope; edit the list whenever it is wrong.
- **Finds full texts** from open-access sources only (OpenAlex, Unpaywall, arXiv, your own PDFs). Anything it cannot find is marked *not retrieved*, never guessed.
- **Drafts a cited review** from your included papers, citing only papers in your review.
- **Counts for you** — every PRISMA-ScR number comes from each record's state, so the diagram always adds up.
- **Exports** RIS or BibTeX for Covidence, Zotero or EndNote whenever you want.

### Screening desk

![research web Reading list tab, filtered to the 4 records not screened yet, with the screening desk open on "A Survey on LLM-based Multi-Agent AI Hospital" (Zonghai Yao; Hong Qing Yu, 2025) and its DOI. The decision line reads "Your decision: Maybe — Unclear from the title and abstract", with Maybe outlined in amber beside Include and Exclude and their I, E and M keys, an optional note box, and a Screen button next to "No PDF downloaded". Below, the abstract is marked with the researcher's highlight words — green for include words, vermilion underlined for exclude words — and the four waiting titles on the left carry the same marks. The header strip counts 20 Identified, 18 Screened with 4 to screen, 8 Sought, 5 Assessed, 4 Included.](../assets/research/web-screening.png)

One paper at a time, with its abstract, its marks and the verdict the agent already recorded, if it has one. Confirm it or change it: *Include*, *Exclude* or *Maybe* with one key; an exclusion asks which of your own criteria it failed and lets you add a note; *Maybe* keeps the paper open for later. The panel moves to the next paper on its own, and every decision you make is written as your call, with your reason, into the PRISMA counts.

### Reading list

![research web Reading list tab for the demo-web-ui project, all 20 records: each row shows the paper's title, authors, year and venue with the researcher's highlight words marked in the titles, then its state and what it needs next — Duplicate, Passed T/A with a Retry PDF button, Not screened with a Screen button, and a vermilion "Excluded · T/A" with "Ask agent to reconsider". Filter chips above read All 20, Not screened 4, Duplicate 2, Excluded · T/A 6, Passed T/A 2, Full text ready 1, Full text not found 1, Included 4, beside a search box, and a "Highlight words 23" button sits under them; a banner offers "Screen them" for the 4 not screened.](../assets/research/web-reading-list.png)

Every record with its state, verdict and reason. Filter by state, search by title, author or DOI, move with ↑/↓ and screen without leaving the keyboard. Each row says what it needs next, and the counts at the top are links — click *Screened* to see only the papers still waiting for you.

### Paper graph

![research web Graph tab: the paper graph across all projects, nine papers connected by cites, related and same-topic edges, with "TriageAgent: Towards Better Multi-Agents Collaborations for LLM-Based Clinical Triage" selected and its side panel open — Lu M; Ho B; Ren D; Wang X, 2024, Findings of EMNLP, id triageagent, degree 2, with its DOI link — and buttons for Find citing papers, Auto-edges and Explain neighbors.](../assets/research/web-graph.png)

How your papers connect — citation links checked against OpenAlex, plus related and same-topic links. Click a paper for its details.

### PRISMA diagram

![research web PRISMA tab in dark mode: the PRISMA-ScR flow for demo-web-ui — 20 records identified from OpenAlex, 2 duplicates removed, 18 screened, 6 excluded with the researcher's own reasons listed (no abstract 3, Other 1, "Multi-agent systems without LLMs (rule-based agents, reinforcement learning)" 1, Concept 1), 8 reports sought, 1 not retrieved (no open-access copy found), 5 assessed for eligibility, 0 excluded, 4 studies included, and notes below for 4 awaiting title/abstract screening (1 maybe), 2 awaiting full-text retrieval and 1 awaiting full-text screening.](../assets/research/web-prisma.png)

Drawn from your records and ready to download as SVG for your manuscript.

**You stay in control.** The agent screens and writes down what it decided and why, and you can confirm or overrule any verdict at the desk with one key — your decisions are recorded as yours, with your reason, and the diagram counts them. The reading list, review, graph and PRISMA views only show work that is already there. Buttons such as *Screen full texts* or *Check the claims in this section* just fill in the message box — nothing runs until you press Enter. The workspace runs on your own machine (`127.0.0.1`), and each review lives in its own folder under `~/.research-harness/projects/`, so several reviews can run side by side.

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

In the terminal, three more:

| Command | In plain words |
|---|---|
| `research update` | Get the latest version of the harness from GitHub and reinstall it (`research update --check` only tells you what is new) |
| `research doctor` | Check the install and say what is missing |
| `research version` | Show which harness version you have (`research/VERSION` plus the commit) |
| `research web` | Open the workspace in your browser |

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
