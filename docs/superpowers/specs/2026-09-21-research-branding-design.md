# Research-branded startup screen — design spec

Date: 2026-09-21. Request: the startup screen still reads "omp" (border title
`omp v18.1.19`, the block logo, omp-specific tips). Make it customized to the
research harness itself.

## Verified current-state facts (recon 2026-09-21, do not re-derive)

- The welcome box is `packages/tui/src/prompt/welcome.ts`:
  - Border title: `` ` ${APP_NAME} v${this.version} ` `` (line ~383), `APP_NAME`
    is a hardcoded `const` = `"omp"` in `packages/utils/src/dirs.ts:21`.
  - Logo: `PI_LOGO` const (line 481), 12 cols × 5 lines of block glyphs,
    gradient-animated by `introLogoFrame()`; nothing else in src imports it
    except setup splash/outro/wizard-overlay (which have their own copies).
  - Tips: build-time `tips.txt` import → module-level `TIPS` array (omp
    coding-agent jokes); picked in the `tip` getter via `pickWeightedTip`.
- The extension API cannot reach any of it: `setHeader` is a hard no-op stub in
  `packages/coding-agent/src/modes/controllers/extension-ui-controller.ts:149`
  (and rpc/acp/runner/agent-session fallbacks). So research-mode's plugin
  cannot rebrand the screen — a tiny generic seam in the fork is required.
- `WelcomeComponent` is constructed only inside
  `packages/tui/src/prompt/composer.ts` `#ensureWelcome()` (line ~896); the
  prepaint path (`startup-composer.ts`) passes cached/model data later.
- The "Update Available / Run: omp update" banner is gated by the settings key
  `startup.checkUpdate` (`packages/coding-agent/src/main.ts:172,665`); banner
  text is hardcoded in `packages/coding-agent/src/modes/utils/ui-helpers.ts:1061`.
- Deployment reality: the user launches via `bin/research`, which `exec omp`
  — the installed compiled binary at `~/.local/bin/omp` (18.1.19, built Sep 13),
  NOT the fork's source. A source-only change would be invisible to the
  research launcher unless the launcher runs the fork's build or the binary is
  rebuilt. `bun run dev` runs the fork from source; `scripts/link-omp.sh`
  installs a dev wrapper pointing at `packages/coding-agent/src/cli.ts`.

## Design

**Principle**: one small, generic, env-driven branding seam in the fork's
packages (justified exception to "never modify packages/" — documented), all
research-specific content lives in the additive `research/` layer. `getAppName()`
(broker attribution headers) is NOT touched.

### 1. New module `packages/utils/src/branding.ts`

Reads three optional env vars at call time (never cached at import):

| Env var                        | Meaning                                   | Missing/empty → |
| ------------------------------ | ----------------------------------------- | --------------- |
| `RESEARCHHARNESS_BRAND_NAME`   | display name for the welcome border title | `""` (stock `APP_NAME` used) |
| `RESEARCHHARNESS_BRAND_LOGO`   | path to a logo file (one line per row)    | `undefined` (stock `PI_LOGO`) |
| `RESEARCHHARNESS_BRAND_TIPS`   | path to a tips file (one tip per line)    | `undefined` (stock `TIPS`) |

Exports:

```ts
/** Display name overriding APP_NAME in the welcome border title, or "" for stock. */
export function getBrandDisplayName(): string;
/** Brand logo rows from RESEARCHHARNESS_BRAND_LOGO (trimmed, blanks dropped), or undefined. */
export function getBrandLogo(): readonly string[] | undefined;
/** Brand tips from RESEARCHHARNESS_BRAND_TIPS (trimmed, blanks dropped), or undefined. */
export function getBrandTips(): readonly string[] | undefined;
```

Rules: https/ok — file reads are sync `fs.readFileSync` with try/catch →
missing/unreadable file behaves like unset (degrade, never crash startup);
blank lines dropped; lines trimmed; no caching (cheap, called once per render
of a static screen). Env names all prefixed `RESEARCHHARNESS_`.
`packages/utils/src/index.ts` gains `export * from "./branding";` (star
re-export per repo barrel convention).

### 2. `packages/tui/src/prompt/welcome.ts` consumes the seam

- Title: `` const title = ` ${getBrandDisplayName() || APP_NAME} v${this.version} `; ``
- Logo: `#currentLogoFrame()` returns gradient frames of
  `getBrandLogo() ?? PI_LOGO` (intro + rest paths both route through it, so the
  animation works unchanged on any row count).
- Tips: `tip` getter picks from `getBrandTips() ?? TIPS` (nerdfont-nag branch
  unchanged). `[NEW]` weighting still works on brand tips.

### 3. Research layer supplies the brand

- `research/branding/logo.txt` — 12-col block-glyph beaker mark (exact default
  content in the plan; renderer is char-agnostic, only widths matter).
- `research/branding/tips.txt` — researcher-voiced tips (/help, plain-language
  review starts, /find, /import, /screen, /graph, /prisma, corpus env, doctor).
  ASCII hyphens only.
- `bin/research` exports the three env vars (values; file paths guarded by
  `[ -f ]`) before `exec omp`. The launcher is the single place that binds
  brand values — packages/ stays content-free.
- `setup.sh` appends `RESEARCHHARNESS_BRAND_NAME` to `~/.research-harness/config.env`
  via an **append-if-absent** helper only (never the full-rewrite path — that
  path is the known open config.env-clobbering defect; do not broaden it).
- `bin/research doctor` gains one check: brand name set + logo/tips files resolve.

### 4. Update banner

Out of scope for the seam. It is truthful (the binary is omp) and only shows
when outdated. Optional follow-up (not in this round): suppress per-launch via
a config overlay once `--config` merge semantics are verified.

## Out of scope

- No changes to `getAppName()` / attribution headers / `desktop-notify.ts` /
  OSC99 app name (those SHOULD stay omp).
- No setup-splash/wizard rebranding (first-run surface, not the daily screen).
- No changelog edits in packages/* (upstream-owned files; fork-local feature is
  documented in repo docs + git history).
- No `startup.checkUpdate` flip.

## Risks / mitigations

- Fork-sync friction: the seam touches `dirs.ts`-adjacent new file (new file =
  near-zero conflict), `index.ts` (+1 line), `welcome.ts` (3 small edits in
  hot files — accepted, kept minimal).
- Stock behavior must be byte-identical when env unset: fallback expressions
  `getBrandX() ?? stock` guarantee it; tests pin both branches.
- Binary deployment: `bin/research` currently execs the installed binary, so
  the user must either run the fork's dev wrapper or rebuild the binary for
  the brand to show. Plan ships a launcher-mode toggle (env
  `RESEARCH_HARNESS_OMP` override, default: installed omp) + documented rebuild
  path; verification uses the fork from source via the dev wrapper.
