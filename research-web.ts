// Capture of `research web` (the local browser UI), recorded in real time from a real Chrome.
//
// Replaces the VHS route for this surface: VHS renders a terminal frame by frame through its
// own headless browser, which made the TUI captures take many times their running length. A
// web UI is already a browser page, so Puppeteer's `page.screencast()` records it directly
// (needs ffmpeg) and the take costs exactly its own length.
//
// Nothing is replayed and nothing is sent: every view reads the real ~/.research-harness, and
// the agent actions only PREFILL the composer — the script never presses Send or Enter in it,
// so no agent turn runs and no research state is written.
//
// Prereqs: ffmpeg, Google Chrome (or CHROME_PATH), the repo's node_modules, and a project with
// records and a review (default `demo-web-ui`; override with RESEARCH_WEB_DEMO_PROJECT).
// Render from the repo root:  bun assets/research/tapes/research-web.ts
// Writes assets/research/research-web.mp4 and assets/research/research-web-poster.png.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { $ } from "bun";
import puppeteer, { type Page } from "puppeteer-core";

const ROOT = path.resolve(import.meta.dir, "../../..");
const OUT_DIR = path.join(ROOT, "assets/research");
const PROJECT = process.env.RESEARCH_WEB_DEMO_PROJECT ?? "demo-web-ui";
const PORT = Number(process.env.RESEARCH_WEB_PORT ?? 7799);
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1440, height: 900 };
const BASE = `http://127.0.0.1:${PORT}/`;

// Screencasts carry no OS cursor; draw one so viewers can follow the clicks.
const CURSOR = `
addEventListener("DOMContentLoaded", () => {
	const dot = document.createElement("div");
	dot.style.cssText = "position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;" +
		"background:rgba(250,250,250,.35);border:2px solid #fafafa;pointer-events:none;transition:transform .12s;left:-40px;top:-40px";
	document.body.append(dot);
	addEventListener("mousemove", e => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
	addEventListener("mousedown", () => { dot.style.transform = "scale(.6)"; }, true);
	addEventListener("mouseup", () => { dot.style.transform = ""; }, true);
});`;

const pause = (ms: number): Promise<void> => Bun.sleep(ms);

async function moveTo(page: Page, selector: string): Promise<{ x: number; y: number }> {
	const el = await page.waitForSelector(selector, { visible: true, timeout: 20_000 }).catch((err: unknown) => {
		throw new Error(`step failed on ${selector}`, { cause: err });
	});
	if (!el) throw new Error(`not found: ${selector}`);
	await el.scrollIntoView();
	const box = await el.boundingBox();
	if (!box) throw new Error(`no box: ${selector}`);
	const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await page.mouse.move(at.x, at.y, { steps: 18 });
	await pause(250);
	return at;
}

async function click(page: Page, selector: string, after = 1200): Promise<void> {
	const at = await moveTo(page, selector);
	await page.mouse.click(at.x, at.y);
	await pause(after);
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
	await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
	await page.evaluateOnNewDocument(CURSOR);
	await page.goto(`${BASE}#chat/${PROJECT}`, { waitUntil: "networkidle0" });
	await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "Ready", {
		timeout: 60_000,
	});
	await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
	const recorder = await page.screencast({ path: webm as `${string}.webm` });

	// 1 · Chat: where am I, what can I do — starters prefill, never send.
	await pause(2500);
	await click(page, ".rw-starters button", 2500);

	// 2 · Reading list: state chips, search, keyboard triage in the detail drawer.
	await click(page, "#rw-tab-records", 2000);
	await click(page, "[aria-label='Filter by state'] button:nth-child(2)", 1500);
	await click(page, "[aria-label='Filter by state'] button:first-child", 1000);
	await moveTo(page, "[aria-label='Search records']");
	await page.keyboard.type("triage", { delay: 90 });
	await pause(1500);
	await click(page, ".rw-table tbody tr:nth-child(1) .rw-title", 2500);
	await page.keyboard.press("ArrowDown");
	await pause(2000);
	await page.keyboard.press("Escape");
	await pause(800);
	await page.click("[aria-label='Search records']", { count: 3 });
	await page.keyboard.press("Backspace");
	await pause(800);
	await click(page, ".rw-table tbody tr:nth-child(3) .rw-title", 1200);
	await page.screenshot({ path: path.join(OUT_DIR, "research-web-poster.png") });
	await pause(1500);
	await page.keyboard.press("Escape");

	// 3 · Reviews: contents, citation jumps, per-section actions.
	await click(page, "#rw-tab-reviews", 2500);
	if ((await page.$$(".rw-toc a")).length > 2) await click(page, ".rw-toc li:nth-child(3) a", 2000);
	await moveTo(page, ".rw-doc a[href^='#ref-']");
	await pause(1500);
	await click(page, ".rw-doc a[href^='#ref-']", 2500);
	await page.goBack();
	await pause(1500);

	// 4 · Graph: search a paper inside the graph, get agent actions for it.
	await click(page, "#rw-tab-graph", 3500);
	const frame = await (await page.waitForSelector(".rw-graph-frame iframe"))?.contentFrame();
	if (frame) {
		await frame.waitForSelector("#search", { timeout: 20_000 });
		const box = await (await page.$(".rw-graph-frame iframe"))?.boundingBox();
		if (box) await page.mouse.move(box.x + 120, box.y + 30, { steps: 18 });
		await frame.type("#search", "triage", { delay: 90 });
		await frame.focus("#search");
		await page.keyboard.press("Enter");
		await pause(2500);
		await click(page, ".rw-actions-right button:nth-child(3)", 3000);
	}

	// 5 · PRISMA: the flow diagram derived from record state.
	await click(page, "#rw-tab-prisma", 500);
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
