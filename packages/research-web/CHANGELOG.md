# Changelog

## [Unreleased]

### Added

- Added `research web`: a local browser UI (127.0.0.1) bridging chat to `omp --mode rpc` over a WebSocket, with session/model controls and read-only research views.
- Added a light/dark toggle (sun/moon) in the top bar; light by default, and the choice survives restarts. The paper graph follows it.
- Added a context bar showing the viewed project vs the agent's project and agent status; starter prompts in an empty chat; the view and project persist in the URL.
- Added reading-list state filters with counts, search, keyboard triage and a record detail panel with abstract and screening rationale; review contents, citation previews and per-section Check; PRISMA SVG download.
- Added a PRISMA strip in the header: identified, screened, sought, assessed and included counts for the viewed project, with what is still pending under each, and each one opens the reading list on that stage.
- Added margin notes in a review: select a sentence on a wide screen and the Check claim action appears beside it, keeping the sentence marked until the request is sent.
- Added a screening desk in the reading list: for any paper still waiting on a decision, Include, Exclude or Maybe (keys I, E and M) with a reason picked from your own criteria, saved through `review.py verdict` and marked `[researcher]`, then it moves on to the next undecided paper.
- Added highlight words: keep an include and an exclude list per project — suggested from your criteria in one click — and they are marked in every title and abstract, green for include and vermilion underlined for exclude.

### Changed

- Errors and empty states in the web UI are now plain-language; technical details go to the omp log.
- The model and thinking-level pickers moved from the sidebar into the message box, which is now a raised card with a filled Send button.
- Each agent turn shows as one row: its thinking and tool calls fold under a single "thinking · N steps" disclosure, leaving the answer visible.
- Failed or stopped agent replies now explain what happened and what to do next (sign in again, usage limit, conversation too long, provider busy) instead of showing raw provider errors such as `401 {"type":"error",...}`; agent warnings that carry file paths, error codes or raw error bodies toast a plain sentence instead, while plain warnings (model fallback, truncated reply, advisor quota) show as written.
- The web UI now works on phones (sidebar drawer, modal record sheet) and collapses the sidebar with ⌘/Ctrl+B; text meets WCAG AA contrast and tabs are keyboard-navigable.
- The paper graph settles instead of drifting, labels only the hovered or selected paper and its neighbours, and supports Enter-to-select in search.
- Screening verdicts now read as highlighter marks — green include, vermilion exclude, yellow maybe — each with its own icon and word, in the reading list and the record panel.
- The web UI now has its own look: deep-teal ink on cool paper (light) or soft charcoal (dark), hairline boxes and tabular counts, replacing the inherited cyan/pink theme.
- The header strip marks the stage the reading list is filtered to, and its pending counts read as counts rather than italic asides.
- In dark mode the PRISMA diagram sits on a paper card, dimmed so it is no longer the brightest thing on screen.
- Buttons and help text name the action instead of the command — "Screen the 3 waiting papers", not `/screen` — and the views say papers, stage and project rather than records, state and slug; an empty chat on a project the agent is not on offers to make it active.

### Fixed

- Opening PRISMA on a project without records no longer creates an empty `review.db`, and an empty `review.db` no longer breaks the project list.
- Long PRISMA exclusion reasons wrap inside their boxes instead of being clipped.
- Losing the connection no longer stacks duplicate error toasts over the Reconnect button.
- Opening the Graph tab no longer shows the papers piled into the top-left corner; the graph stays centred when its frame is shown or resized.
- Opening another session no longer shows its steps and thinking already expanded because you opened the same spot in the previous session.
- The exclusion reason picker and *Suggest from your criteria* now read every shape `scope.md` is written in — a plain `Question:` line with `- Population:` bullets, `## PCC` sections with bullet lists, and the `| Criterion | Include | Exclude |` table under headings such as *Framework — PCC* or *Inclusion / exclusion criteria* — instead of coming up empty on all but one.
- A hyphenated exclude word is no longer suggested when the review's own subject spells it with a space, so a review about social science is no longer offered `social-science` as a reason to throw papers out.
