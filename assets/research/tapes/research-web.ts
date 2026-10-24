// The research-web demo: a researcher picking up a scoping review in the browser UI, recorded in
// real time from a real Chrome.
//
// Replaces VHS for this repo's demos: VHS renders a terminal frame by frame through its own
// headless browser, so a capture took many times its running length. The web UI is already a
// browser page, so Puppeteer's `page.screencast()` records it directly (needs ffmpeg) and the
// take costs exactly its own length.
//
// Persona: a researcher returning to a scoping review on multi-agent LLMs for clinical decision
// support. She checks where things stand, triages the reading list, reads the review and checks
// a claim, explores how the papers connect in the graph, and ends on the PRISMA diagram.
//
// Nothing is replayed and nothing is sent: every view reads the real ~/.research-harness, and
// every agent action only PREFILLS the composer — the script never presses Send or Enter in it,
// so no agent turn runs and no research state is written.
//
// Prereqs: ffmpeg, Google Chrome (or CHROME_PATH), the repo's node_modules, a project with
// records and a review (default `demo-web-ui`; override with RESEARCH_WEB_DEMO_PROJECT), and the
// paper graph papers `triageagent`, `medagents` and `galatea2` in ~/.research-harness/papers.db.
// Render from the repo root:  bun assets/research/tapes/research-web.ts
// Writes assets/research/research-web.mp4 and assets/research/research-web-poster.png.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { $ } from "bun";
import puppeteer, { type ElementHandle, type Frame, type Page } from "puppeteer-core";

const ROOT = path.resolve(import.meta.dir, "../../..");
const OUT_DIR = path.join(ROOT, "assets/research");
const PROJECT = process.env.RESEARCH_WEB_DEMO_PROJECT ?? "demo-web-ui";
const PORT = Number(process.env.RESEARCH_WEB_PORT ?? 7799);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1440, height: 900 };
const BASE = `http://127.0.0.1:${PORT}/`;

// Runs in every frame's page world before its scripts. It draws the cursor screencasts lack (dark
// fill, white ring: visible on any theme; the parent hides its dot while the pointer is over the
// graph iframe), and answers `rw-node` events with a paper's position in the graph frame.
const INIT = `
addEventListener("DOMContentLoaded", () => {
	const dot = document.createElement("div");
	dot.style.cssText = "position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;" +
		"background:rgba(20,20,20,.45);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.6);" +
		"pointer-events:none;transition:transform .12s;left:-40px;top:-40px";
	document.body.append(dot);
	addEventListener("mousemove", e => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
	addEventListener("mouseover", e => { dot.style.display = e.target.tagName === "IFRAME" ? "none" : ""; }, true);
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

async function find(page: Page, selector: string): Promise<ElementHandle> {
	const el = await page.waitForSelector(selector, { visible: true, timeout: 20_000 }).catch((err: unknown) => {
		throw new Error(`step failed on ${selector}`, { cause: err });
	});
	if (!el) throw new Error(`not found: ${selector}`);
	return el;
}

/** The first visible button/link/summary inside `scope` whose text starts with `text`. */
async function findText(page: Page, scope: string, text: string): Promise<ElementHandle> {
	const handle = await page
		.waitForFunction(
			(s: string, t: string) =>
				[...document.querySelectorAll(`${s} button, ${s} summary, ${s} a`)].find(
					e => e.textContent?.trim().startsWith(t) && e.getClientRects().length > 0,
				),
			{ timeout: 20_000 },
			scope,
			text,
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
const clickText = async (page: Page, scope: string, text: string, after = 1200): Promise<void> =>
	clickEl(page, await findText(page, scope, text), text, after);

async function hover(page: Page, selector: string, after = 1200): Promise<void> {
	const at = await centerOf(await find(page, selector), selector);
	await glide(page, at.x, at.y);
	await pause(after);
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
	const { width, height } = VIEWPORT;
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

const server = Bun.spawn([path.join(ROOT, "bin/research"), "web"], {
	cwd: ROOT,
	env: { ...process.env, RESEARCH_WEB_PORT: String(PORT), RESEARCH_WEB_NO_OPEN: "1" },
	stdout: "ignore",
	stderr: "inherit",
});
const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: true,
	defaultViewport: VIEWPORT,
	args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
});
const webm = path.join(OUT_DIR, "research-web.webm");
try {
	await waitForServer();
	const page = await browser.newPage();
	await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
	await page.evaluateOnNewDocument(INIT);
	await page.goto(`${BASE}#chat/${PROJECT}`, { waitUntil: "networkidle0" });
	await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "Ready", {
		timeout: 60_000,
	});
	await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
	const recorder = await page.screencast({ path: webm as `${string}.webm` });

	// 1 · Where was I? The header shows the review she is viewing beside the one the agent is
	// on; the empty chat offers the next commands. A half-typed plan survives a prefill.
	await pause(2000);
	await hover(page, ".rw-context", 1500);
	await hover(page, ".rw-starters li:nth-child(1) button", 1200);
	await click(page, "textarea[aria-label='Message']", 300);
	await page.keyboard.type("Plan for today: finish full-text screening, then tighten the review", { delay: 30 });
	await pause(800);
	await clickText(page, ".rw-context", "Make active", 2500);
	await clickText(page, ".rw-composer", "Restore previous draft", 2000);

	// 2 · The composer holds the model and thinking pickers; the sidebar has projects with screening
	// progress and sessions. Ctrl/⌘+B folds it away for reading room.
	await hover(page, ".rw-composer-bar", 2000);
	await page.keyboard.down("Control");
	await page.keyboard.press("b");
	await page.keyboard.up("Control");
	await pause(1500);
	await page.keyboard.down("Control");
	await page.keyboard.press("b");
	await page.keyboard.up("Control");
	await pause(1000);

	// 3 · Reading list: the next step, why papers were excluded, what made it in.
	await click(page, "#rw-tab-records", 2000);
	await hover(page, ".rw-next", 1500);
	await clickText(page, "[aria-label='Filter by state']", "Excluded", 1500);
	await click(page, ".rw-table tbody tr:nth-child(1) .rw-title", 3000);
	await page.keyboard.press("ArrowDown");
	await pause(2500);
	await page.keyboard.press("Escape");
	await pause(600);
	await clickText(page, "[aria-label='Filter by state']", "Included", 1200);
	await click(page, "[aria-label='Search records']", 200);
	await page.keyboard.type("triage", { delay: 80 });
	await pause(1200);
	await click(page, ".rw-table tbody tr:nth-child(1) .rw-title", 3500);
	await page.keyboard.press("Escape");
	await pause(600);
	await page.click("[aria-label='Search records']", { count: 3 });
	await page.keyboard.press("Backspace");
	await clickText(page, "[aria-label='Filter by state']", "All", 1200);

	// 4 · Reviews: jump to a section, follow a citation, check one claim against its sources.
	await click(page, "#rw-tab-reviews", 2500);
	await clickText(page, ".rw-toc", "Safety evaluation", 2000);
	await hover(page, ".rw-doc a[href^='#ref-']", 1200);
	await click(page, ".rw-doc a[href^='#ref-']", 2500);
	await page.goBack();
	await pause(1500);
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
	await clickText(page, ".rw-toolbar", "Check claim", 3000);

	// 5 · Paper graph: how her included papers connect, and what to ask the agent next.
	await click(page, "#rw-tab-graph", 4000);
	const frame = await (await find(page, ".rw-graph-frame iframe")).contentFrame();
	if (!frame) throw new Error("graph iframe has no frame");
	await frame.waitForSelector("#search", { timeout: 20_000 });
	for (const id of ["medagents", "galatea2"]) {
		const p = await nodePoint(page, frame, id);
		await glide(page, p.x, p.y);
		await pause(1500);
	}
	let p = await nodePoint(page, frame, "triageagent");
	await glide(page, p.x, p.y);
	await page.mouse.click(p.x, p.y);
	await pause(2500);
	for (let i = 0; i < 4; i++) {
		await page.mouse.wheel({ deltaY: -120 });
		await pause(250);
	}
	await pause(1500);
	await page.screenshot({ path: path.join(OUT_DIR, "research-web-poster.png") });
	await click(page, "[aria-label='Clear selection']", 1500);
	const search = await frame.waitForSelector("#search");
	const sb = await (await find(page, ".rw-graph-frame iframe")).boundingBox();
	const inner = await search?.boundingBox();
	if (sb && inner) await glide(page, sb.x + inner.x + inner.width / 2, sb.y + inner.y + inner.height / 2);
	await frame.click("#search");
	await frame.type("#search", "galatea", { delay: 90 });
	await page.keyboard.press("Enter");
	await pause(2500);
	await frame.click("#search", { count: 3 });
	await page.keyboard.press("Backspace");
	p = await nodePoint(page, frame, "triageagent");
	await glide(page, p.x, p.y);
	await page.mouse.click(p.x, p.y);
	await pause(1500);
	await clickText(page, ".rw-actions-right", "Find citing papers", 3000);

	// 6 · PRISMA: the flow diagram her methods section needs, derived from record state.
	await click(page, "#rw-tab-prisma", 1500);
	const download = await centerOf(await findText(page, "#rw-panel-prisma", "Download SVG"), "Download SVG");
	await glide(page, download.x, download.y);
	await pause(1500);
	await hold(page, 5000);

	await recorder.stop();
} finally {
	await browser.close();
	server.kill();
}

// H.264 MP4 plays everywhere the Pages site is opened; drop the intermediate WebM.
const mp4 = path.join(OUT_DIR, "research-web.mp4");
await $`ffmpeg -y -loglevel error -i ${webm} -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an ${mp4}`;
await fs.rm(webm);
console.log(`wrote ${path.relative(ROOT, mp4)} and research-web-poster.png`);
