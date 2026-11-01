# Changelog

Research-harness changes, newest first. `research update` prints the sections newer than your
installed version. Add entries under `[Unreleased]`; release with Actions → Research release
(see docs/RUNBOOK.md).

## [Unreleased]

## [0.1.1] - 2026-11-01

### Added

- `research web` has a screening desk: open a paper in the Reading list and decide it yourself with Include, Exclude or Maybe (keys I, E, M); an exclusion asks which of your criteria it failed, and the agent's own verdict is shown so you can confirm or overrule it
- `research web` highlights your include and exclude words in every title and abstract; "Suggest from your criteria" fills the lists from your scope
- `research web` shows a live PRISMA strip in the header (identified, screened, sought, assessed, included, with what is still waiting); click a stage to see those papers
- Selecting a sentence in a review offers "Check claim" in the margin beside it

### Changed

- `research web` has a calmer look: deep teal on a paper-white page, a soft charcoal dark mode, and verdicts shown as highlighter marks with an icon and a word
- Buttons in `research web` say what they do in plain words instead of showing commands like `/screen`
- `research doctor` flags installed agents and prompts that no longer match your checkout

### Fixed

- `research update` refreshes the install even when you are already up to date

## [0.1.0] - 2026-10-31

### Added

- `research version` shows which harness version you have; `research doctor` lists it too
- `research update` reports the old and new version and lists what changed since your version
