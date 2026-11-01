// The research-web demo: a researcher screening her scoping review in the browser UI, recorded in
// real time from a real Chrome. One take walks the working day the UI is built for.
//
// Replaces VHS for this repo's demos: VHS renders a terminal frame by frame through its own
// headless browser, so a capture took many times its running length. The web UI is already a
// browser page, so Puppeteer's `page.screencast()` records it directly (needs ffmpeg) and the
// take costs exactly its own length.
//
// Persona: a researcher (not a developer) coming back to a scoping review on multi-agent LLMs for
// clinical decision support. She asks the agent where the review stands, filters her reading list
// from the PRISMA strip, has the UI suggest highlight words from her own criteria and drops one she
// disagrees with, screens four papers herself at the desk (include, exclude with a reason and a
// note, maybe, and one where she confirms the agent's suggestion), reads her review and marks a
// claim to check, glances at the paper graph, turns the lights down, ends on the PRISMA diagram,
// and finishes on a phone.
//
// What is real: research web from this checkout, its omp agent on the default model (one real turn,
// no mocked RPC or replay), every view reading the scratch ~/.research-harness, and every verdict
// written by `review.py verdict` into the scratch review.db. One prompt is sent and answered:
// "Where does my review stand?". A second prompt — the claim check — is only prefilled into the
// message box and deliberately never sent.
//
// Two things are seeded into the SCRATCH COPY of the demo project (never into the real one):
//   * `scope.md` keeps demo-web-ui's own question and PCC wording but is written in the headings
//     /scope produces (## Question, ## PCC table) and gains "## Inclusion criteria" and
//     "## Exclusion criteria" bullets, because the desk's reason picker and "Suggest from your
//     criteria" read them. Without the PCC table the suggester would offer the review's own
//     subject as an exclusion word.
//   * Six more records, so papers are actually waiting at title/abstract. Real OpenAlex works
//     (real titles, authors, venues, DOIs and abstracts) imported through `review.py import`:
//     10.1093/jamia/ocag111, 10.1109/bibm62325.2024.10822109, 10.1109/jbhi.2026.3740738,
//     10.1515/cdbme-2026-0216, 10.17586/2713-1874-2024-4-50-59, 10.31219/osf.io/bv5sg_v1.
// The review file `review-multi-agent-cds.md` is the project's own and predates those imports, so
// its Scope paragraph still counts 14 records: a draft that has not caught up with the screening,
// which is why she is screening.
//
// Scratch HOME (RESEARCH_WEB_DEMO_HOME, required; the script refuses the real HOME). research web
// and its agent run with HOME pointed there, so nothing under the real ~/.research-harness or
// ~/.omp/agent/sessions is read or written. Prepare it once under a directory that is not pruned
// (the take used ~/.hermes/cache/rh-dispatches/restyle/rec-home, never $TMPDIR):
//   .research-harness/  projects/demo-web-ui copied from the real one (its review.db pdf_path rows
//                       rewritten to the copy) with the scope.md and the six imports above;
//                       active-project = demo-web-ui; papers.db; web-theme (light);
//                       config.env minus RESEARCH_HARNESS_HOME and PAPER_GRAPH_DB.
//   .omp/agent/         agent.db (sqlite3 .backup, OAuth refresh tokens blanked so the copy never
//                       rotates the real ones) and models.db; config.yml and .env, with autoResume
//                       and advisor.enabled set to false (the omp defaults); research/agents/*.md
//                       and research/prompts/*.md as setup.sh installs them. No sessions are copied.
//   .omp/plugins/       node_modules/research-harness-tools -> this checkout's research/, enabled in
//                       omp-plugins.lock.json.
// Restore that state before every take: the take writes four verdicts, a highlights.json and a
// session. Rebuilding the scratch HOME from scratch is the cheapest restore.
//
// Pre-flight (claude-opus-5-5, medium thinking): "Where does my review stand?" starts its first
// activity row 2-3 s after send and answers in 25-29 s over 5-6 steps, with a PRISMA table that
// matches the header strip. Every wait is a DOM condition (status back to Ready, the live activity
// row, the strip's pending count, the paper the panel advanced to) with a generous timeout, never
// a sleep.
// An include or an exclude moves the Screened box's "to screen" count; a maybe does not, because
// review.py keeps a maybe paper unscreened (SCREENING.md) — there the advance is the proof.
//
// Prereqs: ffmpeg, Google Chrome (or CHROME_PATH), the repo's node_modules and a native addon built
// from this checkout (`bun --cwd=packages/natives run build`; a stale one breaks the agent's shell).
// Render from the repo root:  RESEARCH_WEB_DEMO_HOME=/path/to/scratch bun assets/research/tapes/research-web.ts
// Writes assets/research/research-web.mp4, research-web-poster.png and research-web-chapters.json.
// The phone-width part is a second screencast (390x900, letterboxed onto 1440x900) joined after the
// main one: that join is the take's only seam.
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import puppeteer, { type ElementHandle, type Frame, type KeyInput, type Page } from "puppeteer-core";

const ROOT = path.resolve(import.meta.dir, "../../..");
const OUT_DIR = path.join(ROOT, "assets/research");
const PORT = Number(process.env.RESEARCH_WEB_PORT ?? 7799);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 900 };
const BASE = `http://127.0.0.1:${PORT}/`;
const MESSAGE = "textarea[aria-label='Message']";
const DEMO_HOME = path.resolve(process.env.RESEARCH_WEB_DEMO_HOME ?? "");
if (!process.env.RESEARCH_WEB_DEMO_HOME || DEMO_HOME === path.resolve(os.homedir())) {
	throw new Error("set RESEARCH_WEB_DEMO_HOME to a prepared scratch HOME (see the header), never the real one");
}

// Runs in every frame's page world before its scripts. It draws the cursor screencasts lack (dark
// fill, white ring: visible on any theme), and answers `rw-node` events with a paper's position in
// the graph frame. Page and graph frame each draw their own dot; the frame announces when the pointer
// is inside it and the page tells it when the pointer is back out, so only one dot is ever shown.
const INIT = `
addEventListener("DOMContentLoaded", () => {
	const dot = document.createElement("div");
	dot.style.cssText = "position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;" +
		"background:rgba(20,20,20,.45);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.6);" +
		"pointer-events:none;transition:transform .12s;left:-40px;top:-40px";
	document.body.append(dot);
	const inFrame = window !== window.top;
	let pointerInFrame = false;
	addEventListener("mousemove", e => {
		const overFrame = e.target.tagName === "IFRAME";
		dot.style.display = overFrame ? "none" : "";
		dot.style.left = e.clientX + "px";
		dot.style.top = e.clientY + "px";
		if (inFrame) parent.postMessage("rw-cursor:in", "*");
		else if (pointerInFrame && !overFrame) {
			pointerInFrame = false;
			for (const f of document.querySelectorAll(".rw-graph-frame iframe")) f.contentWindow?.postMessage("rw-cursor:out", "*");
		}
	}, true);
	addEventListener("message", e => {
		if (e.data === "rw-cursor:in") pointerInFrame = true;
		if (e.data === "rw-cursor:in" || e.data === "rw-cursor:out") dot.style.display = "none";
	});
	addEventListener("mousedown", () => { dot.style.transform = "scale(.6)"; }, true);
	addEventListener("mouseup", () => { dot.style.transform = ""; }, true);
});
// graph_viz.py keeps node world coordinates and the pan/zoom transform in top-level const/let
// bindings, visible only from this world; Puppeteer may evaluate in an isolated one.
document.addEventListener("rw-node", e => {
	let out = "null";
	try {
		const n = nodes.find(m => m.id === e.detail);
		if (n) out = JSON.stringify({ x: n.x * scale + tx, y: n.y * scale + ty });
	} catch {}
	document.documentElement.dataset.rwNode = out;
});`;

const pause = (ms: number): Promise<void> => Bun.sleep(ms);

async function glide(page: Page, x: number, y: number): Promise<void> {
	await page.mouse.move(x, y, { steps: 20 });
	await pause(250);
}

async function centerOf(el: ElementHandle, label: string): Promise<{ x: number; y: number }> {
	await el.scrollIntoView();
	const box = await el.boundingBox();
	if (!box) throw new Error(`no box: ${label}`);
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function find(scope: Page | Frame, selector: string): Promise<ElementHandle> {
	const el = await scope.waitForSelector(selector, { visible: true, timeout: 20_000 }).catch((err: unknown) => {
		throw new Error(`step failed on ${selector}`, { cause: err });
	});
	if (!el) throw new Error(`not found: ${selector}`);
	return el;
}

/** The first visible `targets` element inside `scope` whose text starts with `text`. */
async function findText(
	page: Page,
	scope: string,
	text: string,
	targets = "button, summary, a",
): Promise<ElementHandle> {
	const handle = await page
		.waitForFunction(
			(s: string, t: string, tags: string) =>
				[
					...document.querySelectorAll(
						tags
							.split(",")
							.map(tag => `${s} ${tag.trim()}`)
							.join(", "),
					),
				].find(e => e.textContent?.trim().startsWith(t) && e.getClientRects().length > 0),
			{ timeout: 20_000 },
			scope,
			text,
			targets,
		)
		.catch((err: unknown) => {
			throw new Error(`step failed on "${text}" in ${scope}`, { cause: err });
		});
	const el = handle.asElement();
	if (!el) throw new Error(`not an element: "${text}"`);
	return el as ElementHandle;
}

async function clickEl(page: Page, el: ElementHandle, label: string, after: number): Promise<void> {
	const at = await centerOf(el, label);
	await glide(page, at.x, at.y);
	await page.mouse.click(at.x, at.y);
	await pause(after);
}

const click = async (page: Page, selector: string, after = 1200): Promise<void> =>
	clickEl(page, await find(page, selector), selector, after);
const clickText = async (page: Page, scope: string, text: string, after = 1200, targets?: string): Promise<void> =>
	clickEl(page, await findText(page, scope, text, targets), text, after);

async function hover(page: Page, selector: string, after = 1200): Promise<void> {
	const at = await centerOf(await find(page, selector), selector);
	await glide(page, at.x, at.y);
	await pause(after);
}

async function press(page: Page, key: KeyInput, after = 900, modifier?: KeyInput): Promise<void> {
	if (modifier) await page.keyboard.down(modifier);
	await page.keyboard.press(key);
	if (modifier) await page.keyboard.up(modifier);
	await pause(after);
}

async function waitStatus(page: Page, text: string, timeout: number): Promise<void> {
	await page
		.waitForFunction((t: string) => document.querySelector("[role=status]")?.textContent === t, { timeout }, text)
		.catch((err: unknown) => {
			throw new Error(`status never became ${text}`, { cause: err });
		});
}

/**
 * The header strip's pending count for a stage, e.g. the "6 to screen" under Screened. Every
 * screening step waits on this instead of a sleep: it only moves once review.py has written the
 * verdict and the project counts have been re-read.
 */
async function waitPending(page: Page, stage: string, want: number): Promise<void> {
	await page
		.waitForFunction(
			(s: string, n: string) =>
				document.querySelector(`.rw-strip-box[data-stage="${s}"] .rw-strip-pending-n`)?.textContent === n,
			{ timeout: 60_000 },
			stage,
			String(want),
		)
		.catch((err: unknown) => {
			throw new Error(`the ${stage} box never counted down to ${want}`, { cause: err });
		});
}

/** The paper the detail panel is open on; the desk beats assert they moved to the right one. */
const openPaper = (page: Page): Promise<string> => page.$eval("#rw-drawer-title", e => e.textContent ?? "");

async function expectPaper(page: Page, starts: string): Promise<void> {
	const title = await openPaper(page);
	if (!title.startsWith(starts)) throw new Error(`the panel shows "${title}", expected "${starts}…"`);
}

/**
 * Waits for the panel to land on a paper. A maybe leaves the paper unscreened (review.py records the
 * verdict and keeps the state), so the strip cannot prove that save: the advance to the next
 * undecided paper is what does.
 */
async function waitPaper(page: Page, starts: string): Promise<void> {
	await page
		.waitForFunction(
			(s: string) => document.querySelector("#rw-drawer-title")?.textContent?.startsWith(s) === true,
			{ timeout: 60_000 },
			starts,
		)
		.catch((err: unknown) => {
			throw new Error(`the panel never moved to "${starts}…"`, { cause: err });
		});
}

/** Page coordinates of a paper node inside the graph iframe. */
async function nodePoint(page: Page, frame: Frame, id: string): Promise<{ x: number; y: number }> {
	const box = await (await find(page, ".rw-graph-frame iframe")).boundingBox();
	if (!box) throw new Error("graph iframe has no box");
	const p = JSON.parse(
		await frame.evaluate((nodeId: string) => {
			document.dispatchEvent(new CustomEvent("rw-node", { detail: nodeId }));
			return document.documentElement.dataset.rwNode ?? "null";
		}, id),
	) as { x: number; y: number } | null;
	if (!p) throw new Error(`paper ${id} is not in the graph`);
	if (p.x < 0 || p.y < 0 || p.x > box.width || p.y > box.height)
		throw new Error(`paper ${id} is off-screen in the graph (${Math.round(p.x)}, ${Math.round(p.y)})`);
	return { x: box.x + p.x, y: box.y + p.y };
}

// The screencast only emits a frame when the page repaints, and frames still in flight are lost
// at stop(): a still final view would be cut. Nudge the cursor so the last view keeps painting.
async function hold(page: Page, ms: number): Promise<void> {
	const { width, height } = page.viewport() ?? VIEWPORT;
	for (let t = 0; t < ms; t += 200) {
		await page.mouse.move(width - 40 + ((t / 200) % 2), height - 40);
		await pause(200);
	}
}

async function waitForServer(): Promise<void> {
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(`${BASE}api/projects`)).ok) return;
		} catch {}
		await pause(500);
	}
	throw new Error(`research web did not come up on ${BASE}`);
}

// Chapter markers for the Pages player, measured from the start of each screencast segment.
const chapters: { segment: number; t: number; title: string }[] = [];
let segment = 0;
let segmentStart = 0;
function chapter(title: string): void {
	chapters.push({ segment, t: (Date.now() - segmentStart) / 1000, title });
	console.log(`${segment}:${((Date.now() - segmentStart) / 1000).toFixed(1)}s ${title}`);
}

const server = Bun.spawn([path.join(ROOT, "bin/research"), "web"], {
	cwd: ROOT,
	env: { ...process.env, HOME: DEMO_HOME, RESEARCH_WEB_PORT: String(PORT), RESEARCH_WEB_NO_OPEN: "1" },
	stdout: "ignore",
	stderr: "inherit",
});
const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: true,
	defaultViewport: VIEWPORT,
	args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
	// Download SVG saves where her browser would: the scratch HOME's Downloads.
	downloadBehavior: { policy: "allow", downloadPath: path.join(DEMO_HOME, "Downloads") },
});
const work = await fs.mkdtemp(path.join(os.tmpdir(), "research-web-take-"));
const main = path.join(work, "main.webm");
const phone = path.join(work, "phone.webm");
try {
	await waitForServer();
	const page = await browser.newPage();
	await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
	await page.evaluateOnNewDocument(INIT);
	await page.goto(BASE, { waitUntil: "networkidle0" });
	await waitStatus(page, "Ready", 60_000);
	await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
	let recorder = await page.screencast({ path: main as `${string}.webm` });
	segment = 1;
	segmentStart = Date.now();

	// 1 · Arrival, light. The PRISMA flow of her own review runs across the header with what is
	// still waiting under each box; the empty chat offers the next steps in her words.
	chapter("Back to her scoping review");
	await pause(2600);
	await hover(page, ".rw-strip-box[data-stage='screened']", 2200);
	await hover(page, ".rw-strip-box[data-stage='sought']", 1800);
	await hover(page, ".rw-strip-box[data-stage='assessed']", 1800);
	await hover(page, ".rw-starters li:nth-child(1) button", 2000);
	await hover(page, ".rw-starters li:nth-child(4) button", 1800);

	// 2 · One real agent turn, in a plain sentence. Its thinking and tool calls stay folded under
	// "thinking · N steps" — that fold is the point, so the take leaves it closed: the answer, a
	// PRISMA table counted live from review.db, is what she reads. (It also keeps this checkout's
	// paths, which the agent's shell lines carry, out of a published video.)
	chapter("She asks where the review stands");
	await click(page, MESSAGE, 200);
	await page.keyboard.type("Where does my review stand?", { delay: 38 });
	await pause(1400);
	await press(page, "Enter", 0);
	await waitStatus(page, "Working…", 20_000);
	// The live row is the proof of work: its label counts the steps up while the status says
	// Working…, and the fold keeps them out of her way.
	const liveFold = await page.waitForSelector(".tr-think-head[aria-expanded]", {
		visible: true,
		timeout: 60_000,
	});
	if (!liveFold) throw new Error("no live activity row");
	if ((await liveFold.evaluate(e => e.getAttribute("aria-expanded"))) === "true")
		await clickEl(page, liveFold, "live steps", 600);
	await hover(page, ".tr-think-head", 0);
	await hold(page, 9000);
	await waitStatus(page, "Ready", 240_000);
	await pause(4000);
	await page.mouse.wheel({ deltaY: 700 });
	await pause(5000);
	await page.mouse.wheel({ deltaY: 700 });
	await pause(4500);
	// The views read the same review.db the agent just counted: her header says what its answer says.
	await hover(page, ".rw-strip-box[data-stage='identified']", 1800);
	await hover(page, ".rw-strip-box[data-stage='screened']", 2600);

	// 3 · The strip is also the way in: its Screened box opens the reading list on the papers that
	// still need a title/abstract decision.
	chapter("Her reading list, opened from the strip");
	await click(page, ".rw-strip-box[data-stage='screened']", 2600);
	await hover(page, ".rw-chips", 2200);
	await hover(page, ".rw-table tbody tr:nth-child(3)", 2600);

	// 4 · Highlight words: suggested from her own inclusion and exclusion criteria, edited by hand if
	// she likes, then marked in every title and abstract with a legend above the abstract.
	chapter("Words from her own criteria");
	await clickText(page, ".rw-toolbar", "Highlight words", 2000);
	await clickText(page, ".rw-words-actions", "Suggest from your criteria", 3000);
	await hover(page, ".rw-words-row:nth-of-type(1) .rw-words-chips", 2600);
	await hover(page, ".rw-words-row:nth-of-type(2) .rw-words-chips", 2600);
	// The list is hers, not the suggester's: "reinforcement learning" came apart into two words and
	// a bare "learning" would mark half her field, so she drops it.
	await click(page, "[aria-label='Remove learning']", 2600);
	await clickText(page, ".rw-words-actions", "Save", 2600);
	await click(page, ".rw-table tbody tr:nth-child(1)", 2400);
	await expectPaper(page, "Orchestrator multi-agent");
	await hover(page, ".rw-hl-legend", 3000);
	await hover(page, ".rw-drawer dl dd:last-child", 3400);

	// 5 · The desk. This paper is an LLM multi-agent CDSS with an evaluation: include, with the I key.
	chapter("She decides a paper herself");
	await hover(page, ".rw-desk-verdicts", 3000);
	await press(page, "i", 0);
	await waitPending(page, "screened", 5);
	await pause(2600);
	await expectPaper(page, "ArgMed-Agents");
	await pause(1600);

	// 6 · An exclusion names one reason, picked from her own criteria with a number key, plus a note.
	// Her exclude words are already marked in this abstract: reinforcement, PPO, no LLM.
	chapter("Excluding one, with a reason");
	await clickText(page, ".rw-table tbody", "Explainability of Agent Behavior", 2400, ".rw-title");
	await expectPaper(page, "Explainability of Agent Behavior");
	await hover(page, ".rw-drawer dl dd:last-child", 4000);
	await press(page, "e", 2000);
	await press(page, "2", 2400);
	await click(page, ".rw-desk-note input", 600);
	await page.keyboard.type("Reinforcement-learning agents, no language model.", { delay: 42 });
	await pause(1400);
	// She looks back over the reason she picked before saving. The caret stays in the note, so Enter
	// still saves; this is also the poster frame: picker, note and the marked abstract in one view.
	await glide(page, 1230, 560);
	await page.mouse.wheel({ deltaY: -170 });
	await pause(2200);
	await page.screenshot({ path: path.join(OUT_DIR, "research-web-poster.png") });
	await press(page, "Enter", 0);
	await waitPending(page, "screened", 4);
	await pause(2000);
	await expectPaper(page, "A Survey on LLM-based");

	// 7 · Maybe is for exactly this: a survey of the field, not a system. It keeps the paper
	// unscreened — the strip does not move — and the desk moves on; her own mark waits where she
	// left it.
	chapter("A maybe, when she is not sure");
	// The caret is still in the note she just typed; her next click is the paper the desk moved to,
	// which is also what puts I/E/M back in reach.
	await click(page, ".rw-table tbody tr[aria-selected='true']", 1800);
	await hover(page, ".rw-drawer dl dd:last-child", 3600);
	await hover(page, ".rw-desk-verdicts", 2200);
	await press(page, "m", 0);
	await waitPaper(page, "ArgMed-Agents");
	await pause(2400);
	await clickText(page, ".rw-table tbody", "A Survey on LLM-based", 2600, ".rw-title");
	await hover(page, ".rw-desk-said", 3600);

	// 8 · A paper the agent screened: its verdict is a suggestion with a rationale and a confidence,
	// not a decision. Both stages apply here, and Maybe is absent at full text, where it is illegal.
	chapter("What the agent suggested");
	await click(page, ".rw-strip-box[data-stage='sought']", 2600);
	await click(page, ".rw-table tbody tr:nth-child(1)", 2400);
	await expectPaper(page, "ClinicalMC");
	await hover(page, ".rw-desk-said", 2600);
	await clickText(page, ".rw-desk-said", "Show more", 4200);
	await clickText(page, ".rw-desk-stage", "Full text", 3200);
	await clickText(page, ".rw-desk-stage", "Title/abstract", 2400);
	// Back to the whole list, so confirming hands her the next paper that is still waiting.
	await clickText(page, ".rw-chips", "All", 2000);
	await press(page, "i", 0);
	await pause(4000);
	await expectPaper(page, "ArgMed-Agents");
	await pause(1800);

	// 9 · Her decisions down the table: green include and vermilion exclude bands, each with its
	// icon and its word, beside the stage badges of the papers that have no verdict yet.
	chapter("Verdict marks down the list");
	await press(page, "Escape", 1200);
	await glide(page, 760, 520);
	await page.mouse.wheel({ deltaY: 420 });
	await pause(3400);
	await page.mouse.wheel({ deltaY: 420 });
	await pause(3400);
	// The same list, found by name: 20 papers down to the one she wanted, then back.
	const search = await centerOf(await find(page, "[aria-label='Search papers']"), "search box");
	await glide(page, search.x, search.y);
	await page.mouse.click(search.x, search.y);
	await pause(800);
	await page.keyboard.type("radiology", { delay: 90 });
	await pause(3400);
	// Meta+A is a browser editing command rather than a key event Chrome synthesises for us, and a
	// synthetic triple click does not select inside a type=search field either: she just deletes it.
	for (let i = 0; i < "radiology".length; i++) await press(page, "Backspace", 110);
	await pause(2400);
	await page
		.waitForFunction(() => document.querySelector<HTMLInputElement>("[aria-label='Search papers']")?.value === "", {
			timeout: 10_000,
		})
		.catch((err: unknown) => {
			throw new Error("the search box did not clear", { cause: err });
		});

	// 10 · Reviews: a selected sentence raises a note in the margin, and its Check claim writes the
	// question into the message box. Nothing is sent: the box still waits for her.
	chapter("A claim she wants checked");
	await click(page, "#rw-tab-reviews", 2600);
	await clickText(page, ".rw-toc", "Safety evaluation", 3400);
	const claim = await page.evaluate(() => {
		const p = [...document.querySelectorAll(".rw-doc p")].find(e => e.textContent?.startsWith("GALATEA II"));
		const text = p?.firstChild;
		const end = text?.textContent?.indexOf("domains") ?? -1;
		if (!text || end < 0) return null;
		const range = document.createRange();
		range.setStart(text, 0);
		range.setEnd(text, 1);
		const first = range.getBoundingClientRect();
		range.setStart(text, end + "domains".length - 1);
		range.setEnd(text, end + "domains".length);
		const last = range.getBoundingClientRect();
		return { x0: first.left + 1, y0: first.top + first.height / 2, x1: last.right, y1: last.top + last.height / 2 };
	});
	if (!claim) throw new Error("the GALATEA II claim is not in the review");
	await glide(page, claim.x0, claim.y0);
	await page.mouse.down();
	await page.mouse.move(claim.x1, claim.y1, { steps: 30 });
	await page.mouse.up();
	await pause(2400);
	await hover(page, ".rw-margin-note", 2600);
	await clickText(page, ".rw-margin-note", "Check claim", 3600);
	await click(page, "#rw-tab-reviews", 2000);
	await hover(page, ".rw-margin-note", 4000);

	// 11 · A short look at how the papers connect, then the lights go down once, for good.
	chapter("How the papers connect");
	await click(page, "#rw-tab-graph", 3400);
	const frame = await (await find(page, ".rw-graph-frame iframe")).contentFrame();
	if (!frame) throw new Error("graph iframe has no frame");
	await frame.waitForSelector("#search", { timeout: 20_000 });
	for (const id of ["medagents", "agentclinic", "galatea2"]) {
		const at = await nodePoint(page, frame, id);
		await glide(page, at.x, at.y);
		await pause(2000);
	}
	const node = await nodePoint(page, frame, "triageagent");
	await glide(page, node.x, node.y);
	await page.mouse.click(node.x, node.y);
	await pause(4500);
	const close = await centerOf(await find(frame, "#panel .close"), "panel close");
	await glide(page, close.x, close.y);
	await page.mouse.click(close.x, close.y);
	await pause(2000);

	chapter("Lights down");
	await click(page, ".rw-context button[aria-label^='Switch to']", 3400);
	await click(page, "#rw-tab-records", 3000);
	await glide(page, 760, 520);
	await page.mouse.wheel({ deltaY: 300 });
	await pause(3400);

	// 12 · The diagram she will print, drawn from the decisions she just made: her exclusion reason
	// is a line in the excluded box, and the maybe is counted as still awaiting a decision.
	chapter("PRISMA, from her own decisions");
	await click(page, "#rw-tab-prisma", 3400);
	await hover(page, "#rw-panel-prisma .rw-prisma-card", 3400);
	await page.mouse.wheel({ deltaY: 260 });
	await pause(4500);
	await hold(page, 3000);
	await recorder.stop();

	// 13 · Phone width: the strip collapses to one line of counts, and the desk still fits.
	await page.setViewport(PHONE);
	await pause(1000);
	recorder = await page.screencast({ path: phone as `${string}.webm` });
	segment = 2;
	segmentStart = Date.now();
	chapter("On a phone-width screen");
	await pause(1200);
	await hover(page, ".rw-strip", 3000);
	await click(page, "#rw-tab-records", 2600);
	await glide(page, PHONE.width / 2, 600);
	await page.mouse.wheel({ deltaY: -1400 });
	await pause(2600);
	await clickText(page, ".rw-table tbody", "KGR-MAS", 2800, ".rw-title");
	await hover(page, ".rw-desk-verdicts", 3000);
	await glide(page, PHONE.width / 2, 600);
	await page.mouse.wheel({ deltaY: 420 });
	await pause(3400);
	await press(page, "Escape", 1600);
	await hold(page, 2500);
	await recorder.stop();
} finally {
	await browser.close();
	server.kill();
}

// H.264 MP4 plays everywhere the Pages site is opened. Each segment is encoded alike (the phone one
// letterboxed to 1440x900) and joined without re-encoding. CRF 26 keeps a six-minute take of this
// mostly-static UI near 7 MB; raise it if a longer take ever approaches the ~15 MB the Pages site
// should serve. Never speed the take up to make it smaller.
const encode = (input: string, output: string, filter: string) =>
	$`ffmpeg -y -loglevel error -i ${input} -vf ${filter} -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -an ${output}`;
const mainMp4 = path.join(work, "main.mp4");
const phoneMp4 = path.join(work, "phone.mp4");
await encode(main, mainMp4, "fps=30");
await encode(phone, phoneMp4, `fps=30,pad=${VIEWPORT.width}:${VIEWPORT.height}:(ow-iw)/2:0:color=0x141517`);
const list = path.join(work, "list.txt");
await Bun.write(list, `file '${mainMp4}'\nfile '${phoneMp4}'\n`);
const mp4 = path.join(OUT_DIR, "research-web.mp4");
await $`ffmpeg -y -loglevel error -f concat -safe 0 -i ${list} -c copy -movflags +faststart ${mp4}`;
const mainSeconds = Number(
	(await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${mainMp4}`.text()).trim(),
);
const marks = chapters.map(c => ({
	t: Math.round((c.segment === 1 ? c.t : mainSeconds + c.t) * 10) / 10,
	title: c.title,
}));
await Bun.write(path.join(OUT_DIR, "research-web-chapters.json"), `${JSON.stringify(marks, null, "\t")}\n`);
await fs.rm(work, { recursive: true, force: true });
console.log("wrote research-web.mp4, research-web-poster.png and research-web-chapters.json in assets/research");
