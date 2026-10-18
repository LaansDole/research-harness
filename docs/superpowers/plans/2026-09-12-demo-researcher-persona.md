# Demo re-record: researcher persona (Covidence bar) — plan of record

> **For agentic workers:** the tape edits here are the implementation; Hermes owns design and final verification.

**Goal:** Replace the two README demo captures with recordings of a *researcher* using the harness, not a power user passing a flag-soup prompt.

**Bar (user, 2026-09-12):** "think of how researcher friendly Covidence is, I want research harness to follow that same goal" — plain language, no command recall, the tool carries the method, the researcher answers questions and follows proposed next steps.

**Why the current demos fail that bar:** the typed prompts were technical briefs, e.g.
`/litreview multi-agent LLM feedback and critique on clinical tasks --criteria: include only papers where two or more LLM agents interact via feedback, critique, or debate on a clinical task; corpus-only (offline, skip auto-edges); max 4 candidates; proceed with the include verdicts automatically and do not ask me any questions; keep the review under 400 words; end your final report with the line: GRAPH -> <N> papers / <E> edges`. No researcher writes that.

**Validated before designing (pre-flight, real runs, sonnet, mode prompt appended):**

| Typed line (plain language, no flags) | What the harness actually did |
| --- | --- |
| `I'm starting a scoping review on how LLM agents help with triage in the emergency department. Where do I start?` | created project `llm-agents-ed-triage`, wrote `scope.md`, printed the PCC table, flagged the strict-"agent" assumption, noticed the pre-existing broader project, proposed `/databases` |
| `/databases` | database table with per-question rationale, coverage gaps, access, syntax family, automated-vs-manual; skipped CINAHL/PsycINFO/CENTRAL/WoS with reasons; wrote `searches/00-database-plan.md` |
| `/scope ... use sensible defaults if you would normally ask me` | PCC + explicit assumptions (years 2022-present, preprints included, English only) with no blocking question |

Conclusion: the mode already behaves Covidence-ly on plain input. Only the demo prompts were wrong.

**Deliverables**
- `assets/research/tapes/guided-review.tape` → `assets/research/guided-review.mp4` (replaces `litreview.*`)
- `assets/research/tapes/paper-graph.tape` → `assets/research/paper-graph.mp4` (re-recorded, plain language)
- Poster PNGs re-grabbed from the new captures; README alt text + Pages page updated to match what is actually on screen.

**Out of scope:** the product-level Covidence gaps the demo exposes (one-keystroke verdicts, progress meter, non-command UI). Flag to the user; do not build unasked.

**Constraint:** tapes are rendered against the installed plugin/agents and the read-only corpus at `~/Research/Papers`. The demo writes a scratch project under `~/.research-harness/projects/`; restore `active-project` (`multi-agent-llm-clinical-decision-support`) and delete the demo project afterwards.
