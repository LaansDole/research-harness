---
name: research web
description: The browser workspace of research-harness — a review's PRISMA evidence trail as the interface, in one deep-teal ink on cool paper or soft charcoal.
colors:
  # Light theme (the default: main.tsx sets light before the stored preference loads)
  cool-paper: "#f4f5f4"
  sheet-white: "#ffffff"
  inset-paper: "#eef0ee"
  graphite-ink: "#16181a"
  graphite-muted: "#545a5f"
  graphite-faint: "#696f75"
  deep-teal: "#0f766e"
  deep-teal-shade: "#0b5751"
  teal-hover-wash: "rgba(15, 118, 110, 0.06)"
  teal-selected-wash: "rgba(15, 118, 110, 0.11)"
  teal-accent-wash: "rgba(15, 118, 110, 0.12)"
  claim-tint: "rgba(15, 118, 110, 0.18)"
  hairline: "rgba(0, 0, 0, 0.1)"
  hairline-strong: "rgba(0, 0, 0, 0.16)"
  highlighter-include: "#bfe8c9"
  highlighter-exclude: "#f8c3b0"
  highlighter-maybe: "#f6e48a"
  status-ok: "#0f7a4f"
  status-warn: "#b45309"
  status-err: "#c6362c"
  # Dark theme
  soft-charcoal: "#141517"
  charcoal-panel: "#1b1c1f"
  charcoal-inset: "#202226"
  charcoal-overlay: "#22242a"
  fog-ink: "#e6e7e8"
  fog-muted: "#a9adb1"
  fog-faint: "#868b90"
  sea-teal: "#5fb3a8"
  sea-teal-shade: "#2f8c80"
  sea-teal-ink-on: "#082522"
  sea-teal-selected-wash: "rgba(95, 179, 168, 0.14)"
  sea-teal-accent-wash: "rgba(95, 179, 168, 0.16)"
  claim-tint-dark: "rgba(95, 179, 168, 0.26)"
  hairline-dark: "rgba(255, 255, 255, 0.09)"
  hairline-strong-dark: "rgba(255, 255, 255, 0.15)"
  highlighter-include-dark: "rgba(74, 180, 110, 0.3)"
  highlighter-exclude-dark: "rgba(230, 110, 70, 0.3)"
  highlighter-maybe-dark: "rgba(220, 190, 60, 0.28)"
  status-ok-dark: "#4ab46e"
  status-warn-dark: "#d8a33c"
  status-err-dark: "#ef6a5e"
  prisma-paper-dark: "#e3e5e2"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "20px"
    fontWeight: 600
  title-document:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "18px"
    fontWeight: 600
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-reading:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  body-composer:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
  count:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 600
    fontFeature: "\"tnum\""
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 400
    fontFeature: "\"tnum\""
  label-small:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "\"tnum\""
  section-label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.06em"
  command:
    fontFamily: "ui-monospace, \"SF Mono\", \"JetBrains Mono\", \"Cascadia Mono\", Menlo, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 600
rounded:
  progress: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  pill: "999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  sidebar-gap: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "48px"
components:
  button:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  button-hover:
    backgroundColor: "{colors.teal-hover-wash}"
  tab:
    textColor: "{colors.graphite-muted}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  tab-selected:
    backgroundColor: "{colors.teal-selected-wash}"
    textColor: "{colors.graphite-ink}"
  prisma-strip-box:
    textColor: "{colors.graphite-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  prisma-strip-box-current:
    backgroundColor: "{colors.teal-accent-wash}"
  prisma-strip-count:
    textColor: "{colors.deep-teal}"
    typography: "{typography.count}"
  verdict-mark-include:
    backgroundColor: "{colors.highlighter-include}"
    textColor: "{colors.graphite-ink}"
    typography: "{typography.label}"
    padding: "1px 6px 2px"
  verdict-mark-exclude:
    backgroundColor: "{colors.highlighter-exclude}"
    textColor: "{colors.graphite-ink}"
    typography: "{typography.label}"
    padding: "1px 6px 2px"
  verdict-mark-maybe:
    backgroundColor: "{colors.highlighter-maybe}"
    textColor: "{colors.graphite-ink}"
    typography: "{typography.label}"
    padding: "1px 6px 2px"
  stage-badge:
    backgroundColor: "{colors.teal-accent-wash}"
    textColor: "{colors.deep-teal}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  stage-badge-muted:
    backgroundColor: "{colors.teal-selected-wash}"
    textColor: "{colors.graphite-muted}"
  filter-chip:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    height: "32px"
  filter-chip-selected:
    backgroundColor: "{colors.teal-selected-wash}"
  search-input:
    backgroundColor: "{colors.inset-paper}"
    textColor: "{colors.graphite-ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
    height: "32px"
  composer:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.graphite-ink}"
    typography: "{typography.body-composer}"
    rounded: "{rounded.xl}"
  send-button:
    backgroundColor: "{colors.deep-teal}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.pill}"
    size: "34px"
  next-step-callout:
    backgroundColor: "{colors.sheet-white}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  margin-note:
    backgroundColor: "{colors.sheet-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  prisma-paper-card:
    backgroundColor: "{colors.sheet-white}"
    rounded: "{rounded.lg}"
    padding: "16px"
  prisma-paper-card-dark:
    backgroundColor: "{colors.prisma-paper-dark}"
---

# Design System: research web

## Overview

**Creative North Star: "The Evidence Trail"**

research web is a working desk for a long screening session, and the review's own paperwork is its visual language. The PRISMA flow diagram a researcher will print in her manuscript is redrawn in the header as five hairline boxes joined by thin arrows; her highlighter marks become the verdict marks in the Reading list; a selected sentence in a review gets a margin note tied back to the line by a hairline connector. Everything else (sidebar, tabs, transcript, composer) stays quiet, flat and conventional so those three devices carry the identity.

The ground is cool paper (light, the default) or soft charcoal (dark), never pure black. One ink, deep teal, carries structure, counts, focus, selection and the agent's controls; there is no second accent and no gradient in use. Colour beyond teal is reserved for meaning: three highlighter bands for verdicts and the status trio for real system state. Density is Operate-grade: 14px body, 4–12px steps, hairline borders, small corners, tabular figures wherever counts are compared.

The world is built as an override layer: `theme.css` replaces every colour and radius token of collab-web's upstream `tokens.css` (whose cyan-to-pink accent and pure-black chassis are fully overridden) so the inherited transcript and composer read in the same world without editing upstream files.

**Key Characteristics:**
- PRISMA flow notation as chrome: boxed counts, 1px borders, 4px corners, arrow connectors.
- One deep-teal ink (light #0f766e / dark #5fb3a8) for structure, counts, focus and the agent.
- Verdicts as highlighter strokes: band + lucide icon + word, never colour alone.
- Tabular numerals on every count, badge, table and status line.
- Flat surfaces separated by hairlines; shadow only on the composer and floating layers.
- Light by default for daylight reading; soft charcoal dark theme with a dimmed paper card for the PRISMA figure.

## Colors

A cool, near-neutral paper-and-graphite palette with a single deep-teal ink and a three-colour highlighter set that only ever means a verdict.

### Primary
- **Deep Teal** (light `deep-teal`) / **Sea Teal** (dark `sea-teal`): the one ink. PRISMA strip counts and arrows, pending counts, the next-step callout count, focus rings (2px, inset), the selected tab and filter-chip border, the current strip box border, sidebar progress fill, the send button, starter command names, links and citation links, the margin-note connector. Count text on tinted fills is mixed 80% teal / 20% foreground to clear 4.5:1.
- **Teal washes** (`teal-hover-wash`, `teal-selected-wash`, `teal-accent-wash` and their dark counterparts): the only fills that indicate state. Hover is 6%, selection 11% (14% dark), accent fill 12% (16% dark). Even hover is teal-tinted in light mode, never grey.
- **Claim Tint** (`claim-tint`): the CSS Highlight on the sentence a claim check is about, while its margin note is open.

### Tertiary (verdict highlighters)
- **Include Green** (`highlighter-include`): a pale mint band behind "Include", and behind a record's state wording in the table when its verdict was include (the same holds for the other two bands).
- **Exclude Vermilion** (`highlighter-exclude`): a pale coral-vermilion band behind "Exclude". It leans orange (OKLCH hue ≈ 41° light, ≈ 39° dark), never pink.
- **Maybe Yellow** (`highlighter-maybe`): a classic highlighter yellow behind "Maybe".
- In dark mode the three bands become 28–30% alpha washes of the same hues, with fog text on top.

### Neutral
- **Cool Paper** (`cool-paper`): the page ground in light; also the sticky table header and drawer header ground.
- **Sheet White** (`sheet-white`): sidebar, controls, composer, callouts, margin notes, toasts.
- **Inset Paper** (`inset-paper`): the search field's recessed fill.
- **Graphite Ink / Muted / Faint** (`graphite-ink`, `graphite-muted`, `graphite-faint`): text in three steps; muted carries labels, table headers, metadata and empty-state copy; faint is separators only.
- **Soft Charcoal** (`soft-charcoal`) with **Charcoal Panel / Inset / Overlay**: the dark ground ramp, a lifted charcoal rather than black.
- **Fog Ink / Muted / Faint**: dark-theme text.
- **Hairlines** (`hairline`, `hairline-strong`): 10% / 16% black (9% / 15% white in dark). Default dividers use `hairline`; controls, boxes, cards and notes use `hairline-strong`.
- **Status** (`status-ok`, `status-warn`, `status-err`): the connection dot, the stop control, the failure banner and toasts. Error text is mixed 75% err / 25% foreground.
- **PRISMA Paper** (`prisma-paper-dark`): the off-white card the server-drawn PRISMA SVG sits on in dark mode, with the image dimmed to `brightness(0.86)`.

### Named Rules
**The One Ink Rule.** Teal is the only accent. Structure, counts, focus and the agent share it; no second brand hue, no gradient, no pink or magenta anywhere.

**The Highlighter Rule.** Green, vermilion and yellow mean include, exclude and maybe, and nothing else. Every band carries its lucide icon (Check, X, CircleHelp) and the word.

**The Override Layer Rule.** Raw colour values live only in `theme.css`; every other stylesheet uses variables. Change the two light blocks together.

## Typography

**Body Font:** the system UI sans (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`), set as `--font-ui` in `theme.css` over collab-web's Inter-first stack. No webfont is loaded, so it renders as the platform sans (SF Pro on macOS in every capture).
**Mono Font:** `ui-monospace, "SF Mono", …` for slash commands and code only.

**Character:** a single plain sans in a compact app scale; hierarchy comes from weight (400 / 500 / 600) and three or four size steps, not from a display face.

### Hierarchy
- **Headline** (600, 20px): the chat empty-state question ("What should we research?").
- **Title – document** (600, 18px): section headings inside a review.
- **Title** (600, 16px): record title in the detail drawer, empty-state headings.
- **Body** (400, 14px, 1.5): the app default; drawer copy at 1.5.
- **Body – reading** (400, 14px, 1.6): review prose, max 860px column.
- **Body – composer** (400, 15px): the message box.
- **Count** (600, 13px, tabular): PRISMA strip numbers.
- **Label** (400, 12px, tabular): strip labels, badges, verdict marks, metadata, context cluster, margin notes.
- **Label – small** (400–600, 11px): pending counts, agent chip, composer hint.
- **Section label** (600, 11px, 0.06em, uppercase): sidebar section headings (Projects, Sessions) only.
- **Command** (mono, 600, teal): a literal command inside running copy (`research web` in the failure banner). Never an action label — buttons name the action in words.

### Named Rules
**The Tabular Count Rule.** Every number a researcher compares down a column or across the strip uses tabular figures (`.rw-count`, strip, badges, table, status, chips). Review prose keeps proportional figures.

**The Weight-Not-Size Rule.** Emphasis is 600 weight at an existing size; no step above 20px exists.

## Layout

A fixed app shell: a 280px sidebar and a fluid work column (`grid-template-columns: 280px minmax(0, 1fr)`). The header wraps: tabs, then the project context cluster pushed right, then the PRISMA strip as a full-width second row. Panels pad 12px 16px. The Reading list splits into a table and a detail drawer (`min(380px, 42%)`, hairline left border). Reviews use a 180px sticky table of contents, an 860px reading column and, at ≥1100px, a 210px margin column with 32px gaps. The composer is centred at max 820px.

Spacing runs on 2/4/6/8/12/16 px for controls and rows, 20px between sidebar sections, 24–48px around empty states. Tap targets are at least 28px (icons) and 32px (chips, search, drawer controls).

Responsive behaviour:
- **< 1100px:** the margin column disappears; Check claim lives in the sticky toolbar only. At or above it, while a margin note is up, the toolbar's Check claim hides so one selection never offers the same button twice.
- **< 900px:** the sidebar becomes an off-canvas drawer (min(300px, 85vw), overlay shadow, scrim, inert when closed); the PRISMA strip collapses to one unboxed line of Screened · Sought · Included with lowercase labels and no arrows or pending counts; the record detail opens as a full-screen native dialog; the review TOC becomes a `<details>` disclosure.
- **< 640px:** wide table columns (PDF, actions) hide.
- **< 600px:** the tab row scrolls with a 32px fade mask at its end; toasts move above the composer.

## Elevation & Depth

Flat by default. Depth is tonal (paper → white sheet → inset) and drawn with hairlines, like a printed diagram. Shadows appear only on the composer card (the primary control) and on genuinely floating layers.

### Shadow Vocabulary
- **Card hairline shadow** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`; dark 0.4): paired with the composer's soft lift.
- **Composer lift** (`box-shadow: 0 1px 2px …, 0 6px 20px color-mix(in srgb, var(--fg) 7%, transparent)`): the composer at rest; on focus-within the border turns teal and a 3px teal wash ring replaces the hairline shadow.
- **Overlay** (`box-shadow: 0 18px 48px rgba(0, 0, 0, 0.14)`; dark `0 24px 64px rgba(0, 0, 0, 0.6)` plus a 1px inset top highlight): toasts and the mobile sidebar drawer.

### Named Rules
**The Flat Desk Rule.** Boxes, cards, notes, callouts and the PRISMA card take a 1px border and no shadow. Only the composer and floating layers lift.

## Shapes

Small, diagram-like corners over hairline 1px borders: 4px for strip boxes, badges, margin notes and TOC links; 6px for buttons, inputs, list rows and callouts; 8px for the graph frame and PRISMA card; 12px for the composer. Pills (999px) are used for the filter chips and the round send button. The verdict mark is the one organic shape: its band covers only the lower two-thirds of the line (`inset: 34% 0 0`) with uneven radii (`2px 7px 3px 6px / 6px 3px 7px 2px`) so the ends read as a drawn stroke. Connectors are 12px lucide ArrowRight icons in the strip and a 26px, 1px teal rule from the margin note back to the text.

## Components

### Buttons
- **Shape:** gently squared (6px), 1px `hairline-strong` border.
- **Default:** sheet-white fill, ink text, 4px 10px padding; this is the baseline for every `<button>` and `<select>` in the app.
- **Hover / Focus:** hover fills with the teal hover wash; focus is a 2px teal outline drawn inset (offset −2px) so scroll containers never clip it.
- **Emphasised:** the next-step callout's button takes a teal border, teal accent wash and 500 weight.
- **Send:** a 34px round teal button with white (dark: deep teal-black) icon; hover mixes 15% foreground into the teal; disabled at 35% opacity.
- **Icon buttons:** borderless, 28px minimum, muted icon that darkens on hover.

### Tabs
- Borderless muted text buttons; the selected tab gets the teal selected wash, a teal 1px border and ink text.

### PRISMA Strip (signature)
- Five buttons, Identified → Screened → Sought → Assessed → Included, joined by 12px teal arrows. Each box: 1px strong hairline, 4px corners, 2px 8px padding, count in teal 13px/600 tabular, label 12px muted, and a pending line ("3 to screen") in 11px muted with the number in teal 600.
- Hover fills with the teal accent wash; the stage the Reading list is filtered to (`aria-current`) gets a teal border plus the wash.
- Counts are computed in `prisma.ts` by the same arithmetic as `derive()` in `prisma_scr.py`, so the strip and the PRISMA diagram cannot disagree. Hidden when a project has no records.

### Verdict Marks (signature)
- Inline highlighter strokes: 13px lucide icon (Check / X / CircleHelp) + the word, 12px ink on the lower-line band. Used for title/abstract and full-text verdicts in the drawer, and for a record's state wording in the table when a verdict exists. An unrecorded verdict renders as plain text with no band.

### Screening Desk (signature)
- Sits in the detail drawer above the agent's actions, for a paper that still needs a decision at its stage. A 12px muted stage line ("Title and abstract" / "Full text", with a link to the other stage when both apply), then the agent's standing suggestion as a verdict mark plus its confidence in 11px muted, then the three verdict buttons: Include, Exclude and Maybe, each a default button whose band (include green / exclude vermilion / maybe yellow) is drawn as a 3px `::before` stripe inside the left edge — the fill stays sheet-white so the row of buttons never reads as a block of colour. Maybe is absent at the full-text stage, where it is illegal.
- Each button carries its shortcut as a `<kbd>`: 11px muted on the inset fill in a hairline box (`I`, `E`, `M`). The keys work from anywhere in the reading list unless focus is in a text field.
- A saved verdict leaves the desk and reappears as a verdict mark with "You decided" or "The agent decided" above the rationale, clamped to three lines with a Show more disclosure.
- A refusal from `review.py` prints as one plain err-coloured sentence under the buttons, and nothing moves.

### Reason Picker
- Exclude opens a list in place of the buttons: the project's own exclusion criteria first, then the PCC dimensions, "No abstract" and "Other…", each row numbered 1–9 in an 11px teal tabular prefix. Arrow keys move, a digit selects, Enter confirms, Escape returns to the buttons.
- Below it a Save exclusion / Cancel pair, and under the desk one optional note field (strong hairline, inset fill); Enter in the note — or in the "Other…" field, which replaces the list's reason — saves the exclusion.

### Criteria Marks
- The project's highlight words marked in titles and abstracts: include words get the green highlighter band, exclude words the vermilion band plus a dotted underline, so the two never depend on colour alone. 2px corners, 1px horizontal padding, text colour unchanged.
- An 11px muted legend ("green = include words, vermilion underlined = exclude words") sits above the abstract whenever the paper has any mark.

### Highlight-Words Editor
- Opens under the Reading list toolbar: a raised 6px-cornered box with a strong hairline, holding one row per list (96px muted label, then the words as chips in their own band colour with an 18px remove button, then an inset text field — type and press Enter to add).
- Actions are plain buttons: Suggest from your criteria, Save, Cancel. The toolbar button that opens it carries a Highlighter icon and the total word count as a muted tabular chip.

### Stage Badges
- Small 4px-cornered labels (2px 8px, 12px) for records without a verdict: teal wash with teal-mixed text, or the muted variant (selected wash, muted text) for duplicates.

### Chips
- **Filter chips:** pill-shaped, 32px tall, 13px, default button styling with a muted tabular count; the checked chip gets a teal border and teal selected wash.
- **Agent chip:** 4px corners, teal accent wash, 11px teal-mixed text, marks the agent's active project.

### Cards / Containers
- **Next-step callout:** 6px corners, strong hairline, sheet-white, 8px 12px padding; the count is in teal 600 tabular.
- **Starter cards:** default buttons laid out in an auto-fill grid (min 240px), 10px 12px padding, a 600 ink action title over a muted description; the slash command is the prefill, never the label.
- **Detail drawer:** no card; a hairline left border, sticky header on the page ground, 1.5 line height.
- **PRISMA card:** 8px corners, 16px padding, `--rw-paper` fill (white light, off-white #e3e5e2 dark) with its own border; the server SVG inside is dimmed in dark mode. The SVG's own drawing is out of scope.

### Inputs / Fields
- **Search:** inset-paper fill, strong hairline, 6px corners, 32px tall, 4px 10px padding, max 360px.
- **Composer:** a 12px-cornered sheet with a strong hairline and the composer lift; borderless textarea (15px, auto-sizing to 40vh) over a toolbar of muted pickers; focus rings the whole card in teal.

### Navigation
- **Sidebar:** sheet-white panel with a hairline right border; uppercase 11px section labels; project rows (6px corners) with a two-line clamped name, a 4px teal progress bar on a teal wash track, and a muted "29 of 46 screened" line. Hover uses the teal hover wash; the selected row uses the selected wash.
- **Review TOC:** sticky 13px muted links with 4px corners and hover wash.

### Margin Note (signature)
- At ≥1100px a selection in a review raises a note in the margin column: sheet-white, strong hairline, 4px corners, 8px 10px padding, 12px/1.45, quoting the selection in muted text above a Check claim button, linked to the line by a 1px teal connector. The sentence stays tinted with the claim highlight while the note is up.

### Status, Banner and Toasts
- **Connection status:** an 8px dot (ok green; teal pulsing at 1.2s while busy, static under reduced motion; red when down) beside a muted word.
- **Failure banner:** full-width, err tinted 10% into the raised surface, 40% err hairline below, AlertCircle icon in err colour, ink text.
- **Toasts:** overlay surface, 1px err border, 6px corners, overlay shadow, icon-led.

## Do's and Don'ts

### Do:
- **Do** use the deep teal (light #0f766e, dark #5fb3a8) as the only accent, for structure, counts, focus, selection and the agent's controls.
- **Do** draw boxes the PRISMA way: 1px `hairline-strong` border, 4–6px corners, no shadow.
- **Do** render every verdict with the highlighter band, its lucide icon and the word.
- **Do** set every compared count in tabular figures.
- **Do** put raw colour values only in `theme.css`, overriding collab-web's tokens rather than editing them, and change both light blocks together.
- **Do** keep focus visible as a 2px teal outline, inset by 2px inside scroll containers.
- **Do** keep the dark ground a soft charcoal (#141517) and set the PRISMA figure on its dimmed paper card in dark mode.

### Don't:
- **Don't** use pink or magenta anywhere: no accent, gradient, mark or icon in that hue.
- **Don't** use a pure black (#000) ground.
- **Don't** let a highlighter colour stand alone, or use green, vermilion or yellow for anything but a verdict.
- **Don't** add shadows to boxes, cards or notes; only the composer and floating layers lift.
- **Don't** mark state with a grey fill; hover and selection use teal washes.
