// The research-web demo: a researcher returning to her scoping review in the browser UI, recorded in
// real time from a real Chrome. One take walks every capability of the UI.
//
// Replaces VHS for this repo's demos: VHS renders a terminal frame by frame through its own
// headless browser, so a capture took many times its running length. The web UI is already a
// browser page, so Puppeteer's `page.screencast()` records it directly (needs ffmpeg) and the
// take costs exactly its own length.
//
// Persona: a researcher (not a developer) returning to a scoping review on multi-agent LLMs for
// clinical decision support. The agent still points at a newer, empty project; she makes the review
// the agent's project, asks what to read first, stops a second question, reopens an earlier session,
// triages the reading list, opens a PDF, reads the review and checks a claim, explores the paper
// graph (dark mode too), visits the PRISMA diagram and the empty project, reconnects a stopped agent,
// and finishes on a phone-width screen.
//
// What is real: research web from this checkout, its omp agent on the default model (real turns, no
// mocked RPC or replay), and every view reading the scratch ~/.research-harness. Three prompts are
// sent: "Switch the active project to demo-web-ui" (prefilled by Make active), "Which paper should I
// read first?" (queued while the agent works) and "Summarise the included papers." (stopped with
// Esc). The earlier session she reopens is a real turn sent while preparing the scratch HOME.
//
// Scratch HOME (RESEARCH_WEB_DEMO_HOME, required; the script refuses the real HOME). research web and
// its agent run with HOME pointed there, so nothing under the real ~/.research-harness or
// ~/.omp/agent/sessions is read or written. Prepare it once:
//   .research-harness/  projects/demo-web-ui (its review.db pdf_path rows rewritten to the copy) plus
//                       review-evidence-table.md (a second review file: a table and a formula); one
//                       empty project (llm-multi-agent-design) as active-project; papers.db; web-theme;
//                       config.env minus RESEARCH_HARNESS_HOME and PAPER_GRAPH_DB.
//   .omp/agent/         agent.db (sqlite3 .backup, OAuth refresh tokens blanked so the copy never
//                       rotates the real ones) and models.db; config.yml and .env, with autoResume and
//                       advisor.enabled set to false (the omp defaults); research/agents/*.md and
//                       research/prompts/*.md as setup.sh installs them. No sessions are copied.
//   .omp/plugins/       node_modules/research-harness-tools -> this checkout's research/, enabled in
//                       omp-plugins.lock.json.
// Then send "Summarise the included papers." / "One line each." once in research web (the earlier
// session) and set active-project back to llm-multi-agent-design. Restore that state before every
// take: the take switches the active project and adds sessions.
//
// Pre-flight (claude-opus-5-5, medium thinking): the switch turn answers in ~18 s, ~40 s with the
// queued follow-up; the summary took 17-26 s on its own but ~5 s in the take, where the follow-up had
// already read the abstracts, so Esc comes as soon as it starts. Every wait is a DOM condition
// (status back to Ready, the "Stopped before finishing." line) with a generous timeout.
//
// Prereqs: ffmpeg, Google Chrome (or CHROME_PATH), the repo's node_modules and a native addon built
// from this checkout (`bun --cwd=packages/natives run build`; a stale one breaks the agent's shell).
// Render from the repo root:  RESEARCH_WEB_DEMO_HOME=/path/to/scratch bun assets/research/tapes/research-web.ts
// Writes assets/research/research-web.mp4, research-web-poster.png and research-web-chapters.json.
// The phone-width part is a second screencast (430x900, letterboxed onto 1440x900) joined after the
// main one: that join is the take's only seam.
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import puppeteer, { type ElementHandle, type Frame, type KeyInput, type Page } from "puppeteer-core";

const ROOT = path.resolve(import.meta.dir, "../../..");
const OUT_DIR = path.join(ROOT, "assets/research");
const PROJECT = "demo-web-ui";
const EMPTY = "llm-multi-agent-design";
const PORT = Number(process.env.RESEARCH_WEB_PORT ?? 7799);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PHONE = { width: 430, height: 900 };
const BASE = `http://127.0.0.1:${PORT}/`;
const MESSAGE = "textarea[aria-label='Message']";
// Any image works: it is attached and removed again, never sent.
const IMAGE = path.join(OUT_DIR, "graph-viz.png");
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

const statusOf = (page: Page): Promise<string> => page.$eval("[role=status]", e => e.textContent ?? "");

async function waitStatus(page: Page, text: string, timeout: number): Promise<void> {
	await page
		.waitForFunction((t: string) => document.querySelector("[role=status]")?.textContent === t, { timeout }, text)
		.catch((err: unknown) => {
			throw new Error(`status never became ${text}`, { cause: err });
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

/** Moves the mouse from `from` to `by` away with the button held: drags a node, or pans the canvas. */
async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }): Promise<void> {
	await glide(page, from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 25 });
	await page.mouse.up();
	await pause(1200);
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

	// 1 · The agent still points at her newer, empty project; the sidebar shows both projects and an
	// earlier session. She views her review and makes it the agent's project.
	chapter("Back to her scoping review");
	await pause(1800);
	await hover(page, ".rw-context .rw-chip", 1200);
	await hover(page, ".rw-starters li:nth-child(1) button", 1000);
	await clickText(page, "#rw-sidebar", PROJECT, 1500);
	await clickText(page, ".rw-context", "Make active", 1800);

	// 2 · A real turn: Working…, the live row with its steps, then the answer. While it works she
	// queues a follow-up, and Fork refuses (a snapshot needs an idle agent: a toast, dismissed). Once
	// both turns settle the header and sidebar show demo-web-ui as the agent's project.
	chapter("She hands the review to the agent");
	await page.focus(MESSAGE);
	await press(page, "Enter", 0);
	await waitStatus(page, "Working…", 15_000);
	const liveFold = await page.waitForSelector(".tr-think-head[aria-expanded]", { visible: true, timeout: 30_000 });
	if (!liveFold) throw new Error("no live activity row");
	await clickEl(page, liveFold, "live steps", 1500);
	await click(page, MESSAGE, 200);
	await page.keyboard.type("Which paper should I read first?", { delay: 35 });
	if ((await statusOf(page)) !== "Working…") console.warn("the first turn ended before the follow-up was sent");
	await press(page, "Enter", 0);
	await click(page, "[aria-label='Fork current session']", 0);
	await find(page, ".rw-toast");
	await pause(2500);
	await click(page, ".rw-toast [aria-label='Dismiss']", 800);
	await page.waitForFunction(() => document.querySelectorAll(".tr-row--user").length >= 2, { timeout: 120_000 });
	// Scroll back to the status table while the follow-up runs; the poster is this mid-work view.
	await glide(page, 900, 400);
	await page.mouse.wheel({ deltaY: -420 });
	await pause(2500);
	await page.screenshot({ path: path.join(OUT_DIR, "research-web-poster.png") });
	await waitStatus(page, "Ready", 180_000);
	await page.mouse.wheel({ deltaY: 4000 });
	await pause(3500);
	await hover(page, ".rw-context .rw-chip", 1200);
	await hover(page, "#rw-sidebar .rw-selected .rw-chip", 1500);

	// 3 · The message box: an image attached and removed, the model, and a thinking level changed and
	// changed back. Native <select> popups never reach a screencast, so values are set with the
	// pointer resting on the picker.
	chapter("Images, model and thinking level");
	const [chooser] = await Promise.all([page.waitForFileChooser(), click(page, "[aria-label='Attach image']", 0)]);
	await chooser.accept([IMAGE]);
	await find(page, ".rw-thumb img");
	await pause(1500);
	await click(page, "[aria-label='Remove image']", 1000);
	await hover(page, "select[aria-label=Model]", 1800);
	await hover(page, "select[aria-label='Thinking level']", 800);
	await page.select("select[aria-label='Thinking level']", "high");
	await pause(1800);
	await page.select("select[aria-label='Thinking level']", "medium");
	await pause(1200);

	// 4 · A two-line question sent with the Send button, then stopped with Esc in the box (the Stop
	// button beside Send does the same): "Stopped before finishing." The follow-up already read the
	// abstracts, so the summary needs no tools and answers in ~5 s; Esc comes as soon as it starts.
	chapter("A second question, stopped with Esc");
	await click(page, MESSAGE, 200);
	await page.keyboard.type("Summarise the included papers.", { delay: 35 });
	await press(page, "Enter", 0, "Shift");
	await page.keyboard.type("One line each.", { delay: 35 });
	await pause(800);
	await click(page, "button[aria-label='Send']", 0);
	await waitStatus(page, "Working…", 15_000);
	await click(page, MESSAGE, 0);
	if ((await statusOf(page)) !== "Working…") throw new Error("the summary finished before Esc; render again");
	await press(page, "Escape", 0);
	await waitStatus(page, "Ready", 60_000);
	await hover(page, ".tr-stop", 2500);

	// 5 · She remembers asking this before: the earlier session, its folded steps, a thinking block
	// and a tool card. Then a fork of it, and a fresh session whose starters fit the review.
	chapter("An earlier session, folded");
	await clickText(page, "#rw-sidebar", "Summarise the included papers.", 0);
	await page.waitForFunction(() => document.querySelectorAll(".tr-row--user").length === 1, { timeout: 20_000 });
	await pause(1800);
	await click(page, ".tr-think-head[aria-expanded]", 1500);
	await click(page, ".tr-activity-body .tr-think-head", 1800);
	const toolCards = await page.$$(".tr-activity-body .tv-head");
	const helpCard = toolCards[1];
	if (!helpCard) throw new Error("the earlier session has fewer tool calls than expected");
	await clickEl(page, helpCard, "tool card", 1500);
	await click(page, ".tv-expand", 1800);
	await click(page, ".tv-expand", 1000);

	chapter("Fork it, or start fresh");
	await click(page, "[aria-label='Fork current session']", 1800);
	await hover(page, "#rw-sidebar section:nth-child(2) .rw-selected", 1200);
	await click(page, "[aria-label='New session']", 1800);
	await click(page, MESSAGE, 200);
	await page.keyboard.type("Plan for today: screen the last full text, then tighten the review", { delay: 30 });
	await pause(600);
	await clickText(page, ".rw-starters", "/screen full-text", 1800);
	await clickText(page, ".rw-composer", "Restore previous draft", 1800);

	// 6 · Reading list: the next step, chips (also by arrow keys), why papers were excluded,
	// keyboard triage, and a row action.
	chapter("Reading list: next step and exclusions");
	await click(page, "#rw-tab-records", 1800);
	await clickText(page, ".rw-next", "Screen full texts", 1500);
	await click(page, "#rw-tab-records", 1200);
	await clickText(page, "[aria-label='Filter by state']", "Excluded", 900);
	await press(page, "ArrowRight", 900);
	await press(page, "ArrowLeft", 900);
	await click(page, ".rw-table tbody tr:nth-child(1) .rw-title", 2500);
	await press(page, "ArrowDown", 2000);
	await click(page, "[aria-label='Next record']", 1800);
	await click(page, "[aria-label='Previous record']", 1500);
	await press(page, "Escape", 800);
	await press(page, "ArrowUp", 900);
	await press(page, "Enter", 2200);
	await press(page, "Escape", 800);
	await clickText(page, ".rw-table tbody tr[aria-selected='true']", "Ask agent to reconsider", 2200);

	// 7 · A paper the agent suggested: search, its record, the DOI, and the PDF. A real click would
	// open a new tab the screencast cannot follow, so this tab goes to the PDF; coming back reloads
	// the app on the same view from its URL. The PDF stays on its first page: scrolling headless
	// Chrome's PDF viewer crashed it in one take.
	chapter("Opening TriageAgent's PDF");
	await click(page, "#rw-tab-records", 1200);
	await clickText(page, "[aria-label='Filter by state']", "All", 800);
	await click(page, "[aria-label='Search records']", 200);
	await page.keyboard.type("triage", { delay: 80 });
	await pause(1200);
	await clickText(page, ".rw-table tbody", "TriageAgent", 2200, ".rw-title");
	await hover(page, ".rw-drawer a[href^='https://doi.org/']", 1500);
	const pdf = await find(page, ".rw-drawer a.rw-button");
	const pdfUrl = await pdf.evaluate(a => (a as HTMLAnchorElement).href);
	const at = await centerOf(pdf, "Open PDF");
	await glide(page, at.x, at.y);
	await pause(500);
	await page.goto(pdfUrl);
	await pause(4500);
	await page.goto(`${BASE}#records/${PROJECT}`);
	await waitStatus(page, "Ready", 60_000);
	await pause(1200);
	await click(page, "[aria-label='Search records']", 200);
	await page.keyboard.type("zebrafish", { delay: 70 });
	await pause(2000);
	await page.click("[aria-label='Search records']", { count: 3 });
	await press(page, "Backspace", 600);

	// 8 · Reviews: the newest file (a table and a formula), the picker, contents, a citation and its
	// reference (DOI linked), browser Back, one claim checked, and per-section Revise and Check.
	chapter("Reading the review");
	await click(page, "#rw-tab-reviews", 2000);
	await hover(page, ".rw-doc table", 1800);
	await hover(page, ".rw-doc .tr-math", 1800);
	await hover(page, "select[aria-label='Review file']", 800);
	await page.select("select[aria-label='Review file']", "review-multi-agent-cds.md");
	await pause(2000);
	await clickText(page, ".rw-toc", "Safety evaluation", 2000);
	await hover(page, "#rw-sec-4 a[href^='#ref-']", 1200);
	await click(page, "#rw-sec-4 a[href^='#ref-']", 2000);
	await hover(page, "#rw-sec-6 li:target a[href^='https://doi.org/']", 1500);
	await page.goBack();
	await pause(1500);

	chapter("Checking a claim, revising a section");
	// Drag-select one whole claim: the GALATEA II sentence, from its first word to "domains".
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
	await pause(1500);
	await clickText(page, ".rw-toolbar", "Check claim", 2500);
	await click(page, "#rw-tab-reviews", 1200);
	await hover(page, "#rw-sec-5 h2", 800);
	await clickText(page, "#rw-sec-5 .rw-revise", "Revise", 2200);
	await click(page, "#rw-tab-reviews", 1200);
	await hover(page, "#rw-sec-5 h2", 800);
	await clickText(page, "#rw-sec-5 .rw-revise", "Check", 2200);

	// 9 · Paper graph: labels on hover, a paper's record and its three agent actions, the in-frame
	// close, zoom, drag, pan, the legend, search + Enter, clearing, and dark mode following inside.
	chapter("How the papers connect");
	await click(page, "#rw-tab-graph", 3000);
	const frame = await (await find(page, ".rw-graph-frame iframe")).contentFrame();
	if (!frame) throw new Error("graph iframe has no frame");
	await frame.waitForSelector("#search", { timeout: 20_000 });
	for (const id of ["medagents", "galatea2"]) {
		const p = await nodePoint(page, frame, id);
		await glide(page, p.x, p.y);
		await pause(1400);
	}
	let p = await nodePoint(page, frame, "triageagent");
	await glide(page, p.x, p.y);
	await page.mouse.click(p.x, p.y);
	await pause(2500);
	for (const action of ["Find citing papers", "Auto-edges", "Explain neighbors"]) {
		await clickText(page, ".rw-actions-right", action, 1800);
		await click(page, "#rw-tab-graph", 1200);
	}
	const close = await centerOf(await find(frame, "#panel .close"), "panel close");
	await glide(page, close.x, close.y);
	await page.mouse.click(close.x, close.y);
	await pause(1200);
	await drag(page, await nodePoint(page, frame, "korean-triage"), { x: 90, y: 60 });
	const box = await (await find(page, ".rw-graph-frame iframe")).boundingBox();
	if (!box) throw new Error("graph iframe has no box");
	await drag(page, { x: box.x + box.width * 0.85, y: box.y + box.height * 0.8 }, { x: -160, y: -70 });
	p = await nodePoint(page, frame, "triageagent");
	await glide(page, p.x, p.y);
	for (let i = 0; i < 4; i++) {
		await page.mouse.wheel({ deltaY: -120 });
		await pause(250);
	}
	await pause(1200);
	const legend = await centerOf(await find(frame, "#legend"), "legend");
	await glide(page, legend.x, legend.y);
	await pause(1500);
	await frame.click("#search");
	await frame.type("#search", "galatea", { delay: 90 });
	await press(page, "Enter", 2500);
	await click(page, "[aria-label='Clear selection']", 1500);

	chapter("Dark mode, all the way into the graph");
	await click(page, ".rw-context button[aria-label^='Switch to']", 3000);
	await click(page, ".rw-context button[aria-label^='Switch to']", 1500);

	// 10 · PRISMA, derived from record state, and its SVG download.
	chapter("PRISMA flow diagram");
	await click(page, "#rw-tab-prisma", 2500);
	await clickText(page, "#rw-panel-prisma", "Download SVG", 1500);

	// 11 · The empty project: Make active instead of the chip, and each view's empty state with a
	// button that writes the next step into the message box, naming the project.
	chapter("A project with nothing in it yet");
	await clickText(page, "#rw-sidebar", EMPTY, 1800);
	await hover(page, ".rw-context", 1000);
	await clickText(page, "#rw-panel-prisma", "Import exports", 1800);
	await click(page, "#rw-tab-records", 1500);
	await clickText(page, "#rw-panel-records", "Find papers", 1800);
	await click(page, "#rw-tab-reviews", 1500);
	await clickText(page, "#rw-panel-reviews", "Write review", 1800);
	await clickText(page, "#rw-sidebar", PROJECT, 1200);

	// 12 · Reading room: hide the sidebar with its button, bring it back with ⌘B, walk the tabs by keyboard.
	chapter("More room, and tabs by keyboard");
	await click(page, "button[aria-controls=rw-sidebar]", 1500);
	await press(page, "b", 1500, "Meta");
	await click(page, "#rw-tab-chat", 600);
	for (const key of ["ArrowRight", "ArrowRight", "End", "ArrowLeft", "Home"] as const) await press(page, key, 800);

	// 13 · An old bookmark to a renamed project falls back to her review. Then the agent process dies:
	// the banner, Reconnect, a fresh agent, and her sessions are still there.
	chapter("An old link still lands on her review");
	// A hash-only goto would stay in the same document; the app reads its view from the URL at load.
	await page.evaluate(() => history.replaceState(null, "", "#reviews/multi-agent-cds"));
	await page.reload();
	await waitStatus(page, "Ready", 60_000);
	await pause(2200);

	chapter("If the agent stops, reconnect");
	await $`pkill -KILL -P ${server.pid}`.nothrow();
	await find(page, ".rw-banner");
	await pause(2500);
	await clickText(page, ".rw-banner", "Reconnect", 0);
	await waitStatus(page, "Ready", 60_000);
	await pause(1000);
	await click(page, "#rw-tab-chat", 600);
	await clickText(page, "#rw-sidebar", "Switch the active project", 0);
	await page.waitForFunction(() => document.querySelectorAll(".tr-row--user").length >= 3, { timeout: 20_000 });
	await hold(page, 3000);
	await recorder.stop();

	// 14 · Phone width: the sidebar as a drawer (scrim, Esc), a record as a full-screen sheet, the
	// review's Contents menu, and PRISMA's Fit / 100 %.
	await page.setViewport(PHONE);
	await pause(800);
	recorder = await page.screencast({ path: phone as `${string}.webm` });
	segment = 2;
	segmentStart = Date.now();
	chapter("On a phone-width screen");
	await pause(1500);
	await click(page, "#rw-tab-records", 1500);
	await click(page, "button[aria-controls=rw-sidebar]", 1500);
	await press(page, "Escape", 1000);
	await click(page, "button[aria-controls=rw-sidebar]", 1200);
	await glide(page, PHONE.width - 50, PHONE.height / 2);
	await page.mouse.click(PHONE.width - 50, PHONE.height / 2);
	await pause(1000);
	await click(page, ".rw-table tbody tr:nth-child(4) .rw-title", 2000);
	await click(page, "dialog [aria-label='Next record']", 1800);
	await press(page, "Escape", 1000);
	await click(page, "#rw-tab-reviews", 1500);
	await click(page, ".rw-toc-mobile summary", 1200);
	await clickText(page, ".rw-toc-mobile", "Screening agreement", 2000);
	await click(page, "#rw-tab-prisma", 1800);
	await clickText(page, ".rw-segmented", "100 %", 1500);
	await glide(page, PHONE.width / 2, PHONE.height / 2);
	await page.mouse.wheel({ deltaX: 360 });
	await pause(1500);
	await clickText(page, ".rw-segmented", "Fit", 1500);
	await hold(page, 2000);
	await recorder.stop();
} finally {
	await browser.close();
	server.kill();
}

// H.264 MP4 plays everywhere the Pages site is opened. Each segment is encoded alike (the phone one
// letterboxed to 1440x900) and joined without re-encoding.
const encode = (input: string, output: string, filter: string) =>
	$`ffmpeg -y -loglevel error -i ${input} -vf ${filter} -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -an ${output}`;
const mainMp4 = path.join(work, "main.mp4");
const phoneMp4 = path.join(work, "phone.mp4");
await encode(main, mainMp4, "fps=30");
await encode(phone, phoneMp4, `fps=30,pad=${VIEWPORT.width}:${VIEWPORT.height}:(ow-iw)/2:0:color=0x1f2328`);
const list = path.join(work, "list.txt");
await Bun.write(list, `file '${mainMp4}'\nfile '${phoneMp4}'\n`);
const mp4 = path.join(OUT_DIR, "research-web.mp4");
await $`ffmpeg -y -loglevel error -f concat -safe 0 -i ${list} -c copy -movflags +faststart ${mp4}`;
const mainSeconds = Number(
	(await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${mainMp4}`.text()).trim(),
);
const marks = chapters.map(c => ({
	t: Math.round((c.t + (c.segment === 2 ? mainSeconds : 0)) * 10) / 10,
	title: c.title,
}));
await Bun.write(path.join(OUT_DIR, "research-web-chapters.json"), `${JSON.stringify(marks, null, "\t")}\n`);
await fs.rm(work, { recursive: true, force: true });
console.log("wrote research-web.mp4, research-web-poster.png and research-web-chapters.json in assets/research");
