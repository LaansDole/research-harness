---
version: 1
slug: "packages-research-web-src-client-app-tsx"
primary_target: "packages/research-web/src/client/App.tsx"
related_targets: ["packages/research-web/src/client/app.css","packages/research-web/src/client/views/views.css"]
---

# research web: app shell (Operate)

Scope: the research web client (`packages/research-web/src/client`): shell, header, sidebar, Chat, Graph, Reviews, Reading list, PRISMA. Visitor mode: Operate. Build path: code-led (app screen).

Audience and job: a non-technical researcher working a scoping/systematic review for hours, in daylight; she needs to see where the review stands, read verdicts at a glance, and ask the agent for the next step. Constraints: layout, navigation model, controls, keyboard behaviour and every prefill string stay as they are (user chose "restyle + signature moves, layout stays"). collab-web files are never edited; research web overrides tokens in its own package. No pink anywhere (user direction). Verdict colour never the only signal.

Unresolved: Graph link-type colours and the server-drawn PRISMA SVG keep their current styling this round.

## Direction contract

THESIS: The review's own evidence trail is the interface: PRISMA flow notation carries structure and counts, highlighter marks carry verdicts. It refuses the category default, a grey chat app with one decorative accent where the review's state is buried in a sidebar.

OWN-WORLD: Cool paper ground (light) or soft charcoal (dark), never pure black. One ink, deep teal, for structure, counts, focus and the agent. Hairline 1px boxes with small corners joined by thin arrow connectors, as in a PRISMA diagram. A highlighter set for verdicts: include green, exclude vermilion (not pink), maybe yellow, each always with an icon and the word. Tabular numerals for every count. System UI sans.

STORY: She opens research web and the header already says how far the review got (identified, screened, sought, assessed, included). In the Reading list each verdict reads like her own highlighter marks. In a review she selects a sentence and a margin note offers Check claim; nothing changes until she sends.

FIRST VIEWPORT: Unchanged shell: sidebar left; header with tabs, project context and status; work area. New in the header: a PRISMA strip of five boxed counts joined by arrows, Identified → Screened → Sought → Assessed → Included, in teal ink with pending counts faint beneath; each box opens the Reading list on its stage. The message box remains the primary action.

FORM: User-pinned fusion of "PRISMA flow as identity" and "highlighter and margin notes" (options 1 and 2 of the 2026-10-31 round). seed: none (user-pinned direction, roll not run).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
