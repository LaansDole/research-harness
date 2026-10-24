# Changelog

## [Unreleased]

### Added

- Added `research web`: a local browser UI (127.0.0.1) bridging chat to `omp --mode rpc` over a WebSocket, with session/model controls and read-only research views.
- Added a light/dark toggle (sun/moon) in the top bar; light by default, and the choice survives restarts. The paper graph follows it.
- Added a context bar showing the viewed project vs the agent's project and agent status; starter prompts in an empty chat; the view and project persist in the URL.
- Added reading-list state filters with counts, search, keyboard triage and a record detail panel with abstract and screening rationale; review contents, citation previews and per-section Check; PRISMA SVG download.

### Changed

- Errors and empty states in the web UI are now plain-language; technical details go to the omp log.
- The model and thinking-level pickers moved from the sidebar into the message box, which is now a raised card with a filled Send button.
- Each agent turn shows as one row: its thinking and tool calls fold under a single "thinking · N steps" disclosure, leaving the answer visible.
- Failed or stopped agent replies now explain what happened and what to do next (sign in again, usage limit, conversation too long, provider busy) instead of showing raw provider errors such as `401 {"type":"error",...}`; agent warnings that carry file paths, error codes or raw error bodies toast a plain sentence instead, while plain warnings (model fallback, truncated reply, advisor quota) show as written.
- The web UI now works on phones (sidebar drawer, modal record sheet) and collapses the sidebar with ⌘/Ctrl+B; text meets WCAG AA contrast and tabs are keyboard-navigable.
- The paper graph settles instead of drifting, labels only the hovered or selected paper and its neighbours, and supports Enter-to-select in search.

### Fixed

- Opening PRISMA on a project without records no longer creates an empty `review.db`, and an empty `review.db` no longer breaks the project list.
- Long PRISMA exclusion reasons wrap inside their boxes instead of being clipped.
- Losing the connection no longer stacks duplicate error toasts over the Reconnect button.
- Opening the Graph tab no longer shows the papers piled into the top-left corner; the graph stays centred when its frame is shown or resized.
- Opening another session no longer shows its steps and thinking already expanded because you opened the same spot in the previous session.
