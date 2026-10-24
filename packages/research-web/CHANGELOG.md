# Changelog

## [Unreleased]

### Added

- Added `research web`: a local browser UI (127.0.0.1) bridging chat to `omp --mode rpc` over a WebSocket, with session/model controls and read-only research views.
- Added an Appearance setting in the sidebar: light, dark, or match the computer (remembered per browser); the paper graph follows it.
- Added a context bar showing the viewed project vs the agent's project, agent status and model; starter prompts in an empty chat; the view and project persist in the URL.
- Added reading-list state filters with counts, search, keyboard triage and a record detail panel with abstract and screening rationale; review contents, citation previews and per-section Check; PRISMA SVG download.

### Changed

- Errors and empty states in the web UI are now plain-language; technical details go to the omp log.
- The web UI now works on phones (sidebar drawer, modal record sheet) and collapses the sidebar with ⌘/Ctrl+B; text meets WCAG AA contrast and tabs are keyboard-navigable.
- The paper graph settles instead of drifting, labels only the hovered or selected paper and its neighbours, and supports Enter-to-select in search.

### Fixed

- Opening PRISMA on a project without records no longer creates an empty `review.db`, and an empty `review.db` no longer breaks the project list.
- Long PRISMA exclusion reasons wrap inside their boxes instead of being clipped.
- Losing the connection no longer stacks duplicate error toasts over the Reconnect button.
- Opening the Graph tab no longer shows the papers piled into the top-left corner; the graph stays centred when its frame is shown or resized.
