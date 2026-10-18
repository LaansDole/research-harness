# Spec: v6 guided-review demo — recorded by following the RUNBOOK

Date: 2026-09-19. Supersedes the v5 `guided-review` capture (589 s, one-shot prompt + fixed sleep).

## Problem (user direction, verbatim intent)

The current hero demo (https://laansdole.github.io/research-harness/#guided-review, 589 s) "waits on the session to complete", stretching the video with dead air. The user wants the demo to follow `docs/RUNBOOK.md` instead: drive the journey turn-by-turn, and when a turn finishes (or stalls), CONTINUE with the next runbook step for a smooth flow — not re-read a stuck screen. The README hero caption ("10 minutes, unedited, four turns") and the capability story are also stale: the harness now has `/help`, the statusline research hint, the Jev first pass, and a 109-test suite.

## Design

A single re-recorded `guided-review` capture that IS the runbook's Part 0 + Part 1 journey, performed against a THROWAWAY project, with per-turn pacing measured by pre-flight:

1. **Pre-flight every typed line** (mandatory per the reference): headless `omp -p` with the real mode prompt for each turn the tape will type. Record (a) the actual output — which must match the RUNBOOK's "you should see" claims (this simultaneously re-validates the runbook) — and (b) the wall-clock runtime per turn, which sizes the tape's per-turn Sleep. No developer clauses in typed lines; researcher voice; file paths only where the runbook itself shows them.
2. **Tape v6**: vhs settings unchanged from v5 (1600x1000, FontSize 18, Framerate 12, PlaybackSpeed 1.0, Theme Catppuccin Mocha, MP4 primary). Hide block: scratch env (RESEARCH_HARNESS_HOME=$PWD, PAPER_GRAPH_DB → scratch, corpus → the real ~/Research/Papers READ-ONLY), launch via the same flags `bin/research` uses. Show block: Part 0 gates (`research doctor`, test suite — fast, honest), then the session journey: plain-language scope → `/help` (the new capability guide) → database plan + search strings → import the PubMed CSV → `/dedupe` → `/find` (abstract fill + own-source search) → `/screen the first 10` → `/prisma` → `/graph` → `/export`. Each turn: Type + Enter + Sleep(actual+buffer from pre-flight). A finished turn does not stretch the video; the next runbook line comes next.
3. **Post-process** exactly per the reference: mpdecimate → last-activity tail trim (scene-score cross-check for the cursor-blink trap) → crf 26 +faststart. Poster = the most informative frame (candidate: the `/help` command table or the PRISMA diagram), legibility-checked at 880 px.
4. **README refresh**: new hero poster + honest caption (new length, turn count); a sentence that the demo follows the repo's own RUNBOOK; mention of `/help` + the statusline hint (the capability surface); link `docs/RUNBOOK.md` from Quickstart ("test-drive it on your own review"). Watch links stay on the Pages anchor. No stale claims left (length, turn count, capabilities).
5. **Publish**: commit to main + push (pre-authorized), then gh-pages worktree republish (new mp4 + poster, index.html caption/length updates if present), push, then verify SERVED content (content-type video/mp4, page 200, spot-check the page references the new length).
6. **State hygiene**: the demo runs in its own project slug; afterwards delete the demo project, restore `~/.research-harness/active-project` to `multi-agent-llm-clinical-decision-support`, verify the real project dir untouched (file count + mtimes), remove scratch.

## Out of scope
- `paper-graph.mp4` (untouched, still current).
- Any product change; any Jev-on-camera (no TYPESAFE_API_KEY is configured — the demo shows the default path, which is the point).

## Acceptance
- New `guided-review.mp4` committed (≤ ~8-10 min, honestly captioned), zero fake-check hits (`grep -c "head -n\|# omp -p" tapes`), 3+ deep frames verified by vision showing real runbook outputs, poster legible at 880 px.
- README: no stale length/turn claims; references resolve; /help + statusline mentioned; RUNBOOK linked.
- Pages serves the new capture (`video/mp4`) and the page's caption matches.
- Real state restored: active-project back to the real slug, demo project deleted, real project dir untouched, `~/Research/` untouched.
