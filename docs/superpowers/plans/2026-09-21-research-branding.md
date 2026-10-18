# Research-branded startup screen — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-subagent-driven-development (recommended) or superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TUI startup screen brand itself "Research Harness" (name, beaker logo, researcher tips) when launched via `bin/research`, driven by a generic env-var branding seam in the fork's packages.

**Architecture:** New `packages/utils/src/branding.ts` reads `RESEARCHHARNESS_BRAND_NAME` / `_LOGO` / `_TIPS` env vars (file paths for logo/tips) at call time. `packages/tui/src/prompt/welcome.ts` falls back to stock `APP_NAME`/`PI_LOGO`/`TIPS` when unset (byte-identical stock behavior). The additive `research/` layer supplies the brand content; `bin/research` exports the env vars and prefers the fork's dev wrapper so the brand is actually visible; `setup.sh` appends the brand name to config.env append-if-absent.

**Tech Stack:** TypeScript (Bun test), bash launcher, stdlib-only.

**Spec:** `docs/superpowers/specs/2026-09-21-research-branding-design.md` — read it first.

**Branch:** create `feat/research-branding` off `main` and work there. Do NOT rebase, do NOT push. Commit locally per task.

**Repo rules that bind you:**
- Run tests with `bun test <file>` inside the named package dir; typecheck with `bun run check:types` at repo root only at the end (it is slow).
- Do not edit `packages/catalog/`, `bun.lock`, or any file not listed here.
- Prompts/tips content lives in `.txt` files imported with `{ type: "text" }` — never inline prompt strings in code.
- Every new test states the observable contract it defends; no source-grep tests.

---

### Task 1: Branding seam in pi-utils

**Files:**
- Create: `packages/utils/src/branding.ts`
- Create: `packages/utils/test/branding.test.ts`
- Modify: `packages/utils/src/index.ts` (add one star re-export)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/utils/test/branding.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getBrandDisplayName, getBrandLogo, getBrandTips } from "@oh-my-pi/pi-utils/branding";

const ENV_KEYS = ["RESEARCHHARNESS_BRAND_NAME", "RESEARCHHARNESS_BRAND_LOGO", "RESEARCHHARNESS_BRAND_TIPS"] as const;
const saved = new Map<string, string | undefined>();

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = saved.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	saved.clear();
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
	if (!saved.has(key)) saved.set(key, process.env[key]);
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
}

function tmpFile(name: string, content: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "branding-"));
	const file = path.join(dir, name);
	fs.writeFileSync(file, content);
	return file;
}

describe("branding", () => {
	it("returns empty display name when env is unset (stock omp title)", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", undefined);
		expect(getBrandDisplayName()).toBe("");
	});

	it("returns trimmed display name from env", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", "  Research Harness  ");
		expect(getBrandDisplayName()).toBe("Research Harness");
	});

	it("treats whitespace-only display name as unset", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", "   ");
		expect(getBrandDisplayName()).toBe("");
	});

	it("returns undefined logo when env unset", () => {
		setEnv("RESEARCHHARNESS_BRAND_LOGO", undefined);
		expect(getBrandLogo()).toBeUndefined();
	});

	it("reads logo rows and drops blank lines", () => {
		const file = tmpFile("logo.txt", " ██████████ \n\n   ██  ██   \n");
		setEnv("RESEARCHHARNESS_BRAND_LOGO", file);
		expect(getBrandLogo()).toEqual([" ██████████ ", "   ██  ██   "]);
	});

	it("degrades to undefined for an unreadable logo path", () => {
		setEnv("RESEARCHHARNESS_BRAND_LOGO", "/nonexistent/branding/logo.txt");
		expect(getBrandLogo()).toBeUndefined();
	});

	it("reads tips and drops blank lines", () => {
		const file = tmpFile("tips.txt", "tip one\n\ntip two\n");
		setEnv("RESEARCHHARNESS_BRAND_TIPS", file);
		expect(getBrandTips()).toEqual(["tip one", "tip two"]);
	});

	it("degrades to undefined for an unreadable tips path", () => {
		setEnv("RESEARCHHARNESS_BRAND_TIPS", "/nonexistent/branding/tips.txt");
		expect(getBrandTips()).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/utils && bun test test/branding.test.ts`
Expected: FAIL — cannot resolve `@oh-my-pi/pi-utils/branding`.

- [ ] **Step 3: Implement**

```ts
// packages/utils/src/branding.ts
/**
 * Optional rebranding for host surfaces that ship generic ("omp").
 * The research-harness launcher sets RESEARCHHARNESS_BRAND_* so its TUI
 * presents as the research harness; unset env = fully stock behavior.
 * All reads are at call time and degrade to stock on any problem — branding
 * must never break startup.
 */
import * as fs from "node:fs";

export const BRAND_NAME_ENV = "RESEARCHHARNESS_BRAND_NAME";
export const BRAND_LOGO_ENV = "RESEARCHHARNESS_BRAND_LOGO";
export const BRAND_TIPS_ENV = "RESEARCHHARNESS_BRAND_TIPS";

/** Trimmed display name for branded surfaces, or "" to keep the stock app name. */
export function getBrandDisplayName(): string {
	const value = process.env[BRAND_NAME_ENV]?.trim();
	return value ? value : "";
}

/** Non-blank lines of the brand logo file, or undefined when unset/unreadable. */
export function getBrandLogo(): readonly string[] | undefined {
	return readBrandLines(BRAND_LOGO_ENV);
}

/** Non-blank lines of the brand tips file, or undefined when unset/unreadable. */
export function getBrandTips(): readonly string[] | undefined {
	return readBrandLines(BRAND_TIPS_ENV);
}

function readBrandLines(envKey: string): readonly string[] | undefined {
	const file = process.env[envKey]?.trim();
	if (!file) return undefined;
	try {
		return fs
			.readFileSync(file, "utf8")
			.split("\n")
			.map(line => line.replace(/\r$/, "").trim())
			.filter(line => line.length > 0);
	} catch {
		return undefined;
	}
}
```

Then add to `packages/utils/src/index.ts`, after the `binary` export line, keeping alphabetical-ish grouping used by the file (it groups by module; `branding` sits next to `binary`):

```ts
export * from "./branding";
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd packages/utils && bun test test/branding.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/branding.ts packages/utils/test/branding.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): env-driven branding seam for host surfaces"
```

---

### Task 2: Welcome screen consumes the seam

**Files:**
- Modify: `packages/tui/src/prompt/welcome.ts`
- Create: `packages/tui/test/welcome-branding.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/tui/test/welcome-branding.test.ts
import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { WelcomeComponent } from "@oh-my-pi/pi-tui/prompt/welcome";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

const ENV_KEYS = ["RESEARCHHARNESS_BRAND_NAME", "RESEARCHHARNESS_BRAND_LOGO", "RESEARCHHARNESS_BRAND_TIPS"] as const;
const saved = new Map<string, string | undefined>();

beforeAll(async () => {
	await initTheme(false);
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = saved.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	saved.clear();
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
	if (!saved.has(key)) saved.set(key, process.env[key]);
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
}

function tmpFile(name: string, content: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "welcome-brand-"));
	const file = path.join(dir, name);
	fs.writeFileSync(file, content);
	return file;
}

/** The border line of the welcome box carrying "<name> vX.Y.Z". */
function titleLine(component: WelcomeComponent): string {
	const lines = component.render(100);
	return lines.find(line => line.includes(" v1.2.3 ")) ?? "";
}

describe("WelcomeComponent branding", () => {
	it("keeps the stock omp title when brand env is unset", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", undefined);
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(titleLine(component)).toContain("omp v1.2.3");
	});

	it("renders the brand name in the border title when set", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", "Research Harness");
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(titleLine(component)).toContain("Research Harness v1.2.3");
		expect(titleLine(component)).not.toContain("omp v1.2.3");
	});

	it("renders the brand logo rows in place of the stock mark", () => {
		setEnv("RESEARCHHARNESS_BRAND_NAME", undefined);
		setEnv("RESEARCHHARNESS_BRAND_LOGO", tmpFile("logo.txt", "▓▓▓▓▓▓\n"));
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		const rendered = component.render(100).join("\n");
		expect(rendered).toContain("▓▓▓▓▓▓");
	});

	it("picks tips from the brand tips file when set", () => {
		setEnv("RESEARCHHARNESS_BRAND_TIPS", tmpFile("tips.txt", "only-brand-tip\n"));
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(component.tip).toBe("only-brand-tip");
	});

	it("falls back to stock tips when the brand tips file is missing", () => {
		setEnv("RESEARCHHARNESS_BRAND_TIPS", "/nonexistent/branding/tips.txt");
		const component = new WelcomeComponent("1.2.3", "model", "provider");
		expect(component.tip).toBeDefined();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/tui && bun test test/welcome-branding.test.ts`
Expected: FAIL — title still says `omp v1.2.3`, `▓▓▓▓▓▓` absent, tip is a stock tip.

- [ ] **Step 3: Implement (three small edits in welcome.ts)**

Edit 1 — import, next to the existing `APP_NAME` import (line 4):

```ts
import { getBrandDisplayName, getBrandLogo, getBrandTips } from "@oh-my-pi/pi-utils/branding";
```

Edit 2 — `tip` getter (line ~158-165), replace the final return:

```ts
	return pickWeightedTip(getBrandTips() ?? TIPS, this.#tipRoll) || undefined;
```

Edit 3a — `#currentLogoFrame()` (line ~471-477): resolve the brand rows once per call and route both frames through them:

```ts
	#currentLogoFrame(): readonly string[] {
		const logo = getBrandLogo() ?? PI_LOGO;
		if (this.#animStart == null) return gradientLogo(logo, 0);
		const elapsed = performance.now() - this.#animStart;
		if (elapsed >= INTRO_MS) return gradientLogo(logo, 0);
		return introLogoFrame(logo, elapsed / INTRO_MS);
	}
```

Edit 3b — `introLogoFrame` (line ~596-602) and the `REST_FRAME` const (line ~604-605) take the rows as a parameter; the module-level `REST_FRAME` const is DELETED (rest frames are now computed per component via `#currentLogoFrame`):

```ts
function introLogoFrame(logo: readonly string[], progress: number): string[] {
	const eased = 1 - (1 - progress) ** 3;
	const phase = ((((1 - eased) * INTRO_SWEEPS) % 1) + 1) % 1;
	const shinePos = (((progress * INTRO_SHINE_TRAVERSALS) % 1) + 1) % 1;
	const shineStrength = (1 - eased) ** 1.5;
	return gradientLogo(logo, phase, { strength: shineStrength, pos: shinePos });
}
```

Edit 3c — border title (line ~383):

```ts
	const title = ` ${getBrandDisplayName() || APP_NAME} v${this.version} `;
```

Check `packages/tui/test/welcome.test.ts` and any other in-repo consumers of the exported `REST_FRAME`/`introLogoFrame` before finalizing (they are module-internal today; only `PI_LOGO` is exported and consumers list splash/outro/wizard-overlay which have their own copies — do not touch them).

- [ ] **Step 4: Run the package's welcome tests**

Run: `cd packages/tui && bun test test/welcome-branding.test.ts test/welcome.test.ts test/welcome-tip.test.ts`
Expected: all pass (old + new).

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/prompt/welcome.ts packages/tui/test/welcome-branding.test.ts
git commit -m "feat(tui): welcome screen honors RESEARCHHARNESS_BRAND_* env"
```

---

### Task 3: Research layer brand content + launcher + setup + doctor

**Files:**
- Create: `research/branding/logo.txt`
- Create: `research/branding/tips.txt`
- Modify: `bin/research`
- Modify: `setup.sh`
- Modify: `docs/RUNBOOK.md`, `docs/ARCHITECTURE.md` (short branding notes)

- [ ] **Step 1: Create the brand assets**

`research/branding/logo.txt` — beaker mark, 12 columns × 5 rows (exact widths matter; each line is 12 chars):

```
 ██████████ 
   ██  ██   
   ▒▒██▒▒   
 ▒▒██████▒▒ 
████████████
```

`research/branding/tips.txt` (ASCII hyphens only):

```
Type /help to see everything the research harness can do
Start a review in plain words: "I'm doing a scoping review on X - where do I start?"
/find searches OpenAlex and arXiv and brings back abstracts
/import reads RIS, BibTeX and CSV exports from PubMed or Scopus
/screen walks you through title-abstract screening with PCC criteria
/graph opens your paper graph; /prisma derives the flow diagram from your review
/review shows where the review stands and proposes the next step
Local PDFs? Point RESEARCH_CORPUS_DIR at the folder and /find will search them too
research doctor checks plugin, agents, prompts, corpus and databases
```

- [ ] **Step 2: Wire bin/research**

In `bin/research`, after the `RESEARCH_HARNESS_HOME` resolution block (line ~20) add:

```bash
# Brand the TUI welcome screen (consumed by packages/utils/src/branding.ts).
BRAND_DIR="$RESEARCH_HARNESS_HOME/research/branding"
export RESEARCHHARNESS_BRAND_NAME="${RESEARCHHARNESS_BRAND_NAME:-Research Harness}"
if [ -f "$BRAND_DIR/logo.txt" ]; then
	export RESEARCHHARNESS_BRAND_LOGO="$BRAND_DIR/logo.txt"
fi
if [ -f "$BRAND_DIR/tips.txt" ]; then
	export RESEARCHHARNESS_BRAND_TIPS="$BRAND_DIR/tips.txt"
fi
```

Launcher binary selection — replace the final `exec omp "${args[@]}" "$@"` with:

```bash
# Prefer the fork's dev wrapper so fork-level features (including branding)
# are live; RESEARCH_HARNESS_OMP overrides; otherwise the installed omp.
if [ -n "${RESEARCH_HARNESS_OMP:-}" ]; then
	OMP_BIN="$RESEARCH_HARNESS_OMP"
elif [ -x "$RESEARCH_HARNESS_HOME/packages/coding-agent/scripts/omp" ]; then
	OMP_BIN="$RESEARCH_HARNESS_HOME/packages/coding-agent/scripts/omp"
else
	OMP_BIN="omp"
fi
exec "$OMP_BIN" "${args[@]}" "$@"
```

- [ ] **Step 3: setup.sh appends the brand name (append-if-absent ONLY)**

After the existing config-writing step, add (never rewrite the file — it must preserve unrecognized lines):

```bash
if [ -f "$CONFIG" ] && ! grep -q '^RESEARCHHARNESS_BRAND_NAME=' "$CONFIG"; then
	printf '\n# Welcome-screen branding (read by bin/research)\nRESEARCHHARNESS_BRAND_NAME=Research Harness\n' >> "$CONFIG"
	note "config   brand name appended to config.env (existing lines preserved)"
fi
```

- [ ] **Step 4: doctor check**

In `bin/research`'s `doctor()` (after the config check, line ~90):

```bash
if [ -n "${RESEARCHHARNESS_BRAND_NAME:-}" ]; then
	brand_state="brand \"$RESEARCHHARNESS_BRAND_NAME\""
	[ -n "${RESEARCHHARNESS_BRAND_LOGO:-}" ] && [ -f "${RESEARCHHARNESS_BRAND_LOGO:-}" ] && brand_state="$brand_state, logo ok"
	[ -n "${RESEARCHHARNESS_BRAND_TIPS:-}" ] && [ -f "${RESEARCHHARNESS_BRAND_TIPS:-}" ] && brand_state="$brand_state, tips ok"
	ok "$brand_state"
else
	warn "brand not set - welcome screen stays stock omp (run setup.sh)"
fi
```

- [ ] **Step 5: Docs (short)**

- `docs/RUNBOOK.md`: add a "Welcome-screen branding" subsection under an existing customization section: what the brand is, the three env vars, where the files live (`research/branding/`), how to swap logo/tips, `RESEARCH_HARNESS_OMP` override, and that the installed-binary path shows the brand only after a rebuild (or via the dev wrapper, which the launcher prefers automatically).
- `docs/ARCHITECTURE.md`: one paragraph in the extension/layer section: branding seam = `packages/utils/src/branding.ts` + 3 consumption points in `packages/tui/src/prompt/welcome.ts`; research layer supplies content; stock behavior when env unset.

- [ ] **Step 6: Verify launcher end-to-end from source (the real gate)**

```bash
cd /Users/laansdole/Projects/research-harness
bash bin/research doctor 2>&1 | head -20   # expect: brand "Research Harness", logo ok, tips ok
```

Then a non-interactive proof that the env vars reach omp (print mode ignores them, but the export chain must not break the launcher):

```bash
bin/research --version   # expect: omp/18.x printed, exit 0
```

- [ ] **Step 7: Commit**

```bash
git add research/branding/ bin/research setup.sh docs/RUNBOOK.md docs/ARCHITECTURE.md
git commit -m "feat(research): brand the TUI welcome screen as Research Harness"
```

---

### Task 4: Final gates

- [ ] **Step 1: Typecheck touched packages**

Run (repo root): `bun run check:types`
Expected: no new errors.

- [ ] **Step 2: Lint touched files**

Run (repo root): `bun run lint:ts`
Expected: no new errors vs pre-change baseline.

- [ ] **Step 3: Full utils + tui test dirs**

Run: `cd packages/utils && bun test` and `cd packages/tui && bun test`
Expected: green.

- [ ] **Step 4: Report**

Print: branch, `git log --oneline main..HEAD`, files changed per commit, and the exact test/check outputs.

---

## Parent-session verification (after the dispatch, not part of it)

1. `git log --oneline main..HEAD` — 3-4 commits, only the listed files.
2. `bun run check:types` re-run by parent.
3. Live PTY probe via expect (the /help probe recipe in the dispatch skill): spawn `bin/research`, wait for the welcome frame, capture, strip ANSI, grep for `Research Harness v` and a beaker row; also confirm a stock `omp` session (env cleared) still prints `omp v`.
4. Then dispatch heavy QA (`omp -p --model anthropic/claude-opus-5:max`) only if the PTY probe or gates surface anything questionable.
