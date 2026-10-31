#!/usr/bin/env bun
// Renders the repository's research guides (docs/ARCHITECTURE.md, docs/RUNBOOK.md on main)
// into styled pages for this GitHub Pages branch.
//
//   bun tools/build-docs.ts               # pages only; diagrams must already exist
//   bun tools/build-docs.ts --diagrams    # also re-render Mermaid + reladraw SVGs (needs npx + Chrome)
//   bun tools/build-docs.ts --ref <rev>   # source revision (default origin/main)
//
// The pages describe main, nothing more: content is read with `git show <ref>:<path>`,
// never from a working tree, and each page names the commit it was rendered from.

import { $ } from "bun";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const SITE = path.resolve(import.meta.dir, "..");
const REPO_URL = "https://github.com/LaansDole/research-harness";
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : "origin/main";
const withDiagrams = args.includes("--diagrams");

interface Doc {
	src: string;
	out: string;
	slug: string;
	tab: "architecture" | "developer";
	// Replaces the Markdown's own h1 on the page (the source title stays as written on main).
	heading?: string;
	// HTML inserted after the page's opening paragraph.
	intro?: string;
	title: string;
	description: string;
	diagramAlt: string[];
}

const DOCS: Doc[] = [
	{
		src: "docs/ARCHITECTURE.md",
		out: "docs/architecture.html",
		slug: "architecture",
		tab: "architecture",
		title: "Architecture",
		intro: "tools/overview-figure.html",
		description:
			"How the research-harness scoping-review layer is built, where every piece lives, and the guarantees the design enforces.",
		diagramAlt: [
			"Layer map. The researcher starts the bin/research launcher, which appends research/mode/system.md, and types the prompt commands from /scope to /litreview. Commands reach the agents (scholar, screener, synthesizer, librarian) and the python3 standard-library skills: literature-search scripts and paper-graph scripts. The agents also call the skills. The skills write review.db per project, papers.db for the paper graph, and the project files; all three feed the outputs: the review, the PRISMA-ScR diagram, graph.html and RIS/BibTeX exports.",
			"PRISMA-ScR record state machine. A record starts as identified and becomes duplicate, screened_excluded or screened_included; the two screened states can flip to each other. screened_included moves to fulltext_sought, which ends as fulltext_retrieved, fulltext_not_retrieved (which can later become retrieved) or fulltext_excluded. fulltext_retrieved becomes included or fulltext_excluded, and fulltext_excluded can be overturned to included. duplicate and included are final.",
		],
	},
	{
		src: "docs/RUNBOOK.md",
		out: "docs/developer.html",
		slug: "developer",
		tab: "developer",
		title: "Developer guide",
		heading: "Developer guide",
		description:
			"Install and health-check research-harness, set up the terminal app, and test-drive it end to end on a real scoping review.",
		diagramAlt: [],
	},
];

const ROUTES: Record<string, string> = {
	"ARCHITECTURE.md": "architecture.html",
	"RUNBOOK.md": "developer.html",
};

const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

async function gitShow(rev: string, file: string): Promise<string> {
	return (await $`git show ${`${rev}:${file}`}`.cwd(SITE).quiet()).text();
}

// ---------- markdown preprocessing ----------

function extractMermaid(md: string): { md: string; blocks: string[] } {
	const blocks: string[] = [];
	const out = md.replace(/^```mermaid\n([\s\S]*?)^```$/gm, (_m, body: string) => {
		blocks.push(body);
		return `RHMERMAID${blocks.length - 1}`;
	});
	return { md: out, blocks };
}

// The in-document "Contents" list duplicates the page's sticky contents rail.
function dropContentsSection(md: string): string {
	return md.replace(/^## Contents\n[\s\S]*?(?=^## )/m, "");
}

// A `---` rule written directly under a paragraph line is a setext heading in CommonMark, which
// turns the whole paragraph into an <h2> (docs/RUNBOOK.md does this once, and GitHub renders it
// the same way). Every `---` in these guides is meant as a rule, so give it its blank line.
function separateRules(md: string): string {
	return md.replace(/^([^\n|].*)\n---$/gm, "$1\n\n---");
}

// ---------- HTML post-processing ----------

interface TocEntry {
	level: 2 | 3;
	id: string;
	text: string;
}

function rewriteLinks(html: string, docSrc: string): string {
	return html.replace(/href="([^"]+)"/g, (whole, href: string) => {
		if (/^(https?:|mailto:|#)/.test(href)) return whole;
		const [file, hash = ""] = href.split("#");
		const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(docSrc), file));
		const base = path.posix.basename(resolved);
		if (resolved.startsWith("docs/") && ROUTES[base]) {
			return `href="${ROUTES[base]}${hash ? `#${hash}` : ""}"`;
		}
		return `href="${REPO_URL}/blob/main/${resolved}${hash ? `#${hash}` : ""}"`;
	});
}

const COPY_BUTTON =
	'<button class="icon-btn copy" type="button" aria-label="Copy code">' +
	'<svg class="clip i" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>' +
	'<svg class="ok i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' +
	"</button>";

function decorate(html: string, toc: TocEntry[]): string {
	// Headings: collect contents, add a hover anchor.
	html = html.replace(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g, (_m, lvl: string, id: string, inner: string) => {
		toc.push({ level: Number(lvl) as 2 | 3, id, text: stripTags(inner) });
		return `<h${lvl} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${lvl}>`;
	});
	// Tables scroll inside their own frame on narrow screens.
	html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
	// Code blocks: frame and copy button.
	html = html.replace(/<pre><code(?: class="language-[\w-]+")?>/g, `<div class="code">${COPY_BUTTON}<pre><code>`);
	html = html.replace(/<\/code><\/pre>/g, "</code></pre></div>");
	return html;
}

function renderToc(toc: TocEntry[]): string {
	const groups: { head: TocEntry; subs: TocEntry[] }[] = [];
	for (const e of toc) {
		if (e.level === 2 || !groups.length) groups.push({ head: e, subs: [] });
		else groups[groups.length - 1].subs.push(e);
	}
	// e.text is heading HTML with tags stripped, so entities are already escaped.
	const link = (e: TocEntry) => `<a href="#${e.id}">${e.text}</a>`;
	const items = groups.map(({ head, subs }) => {
		const nested = subs.length ? `<ol>${subs.map((s) => `<li>${link(s)}</li>`).join("")}</ol>` : "";
		return `<li>${link(head)}${nested}</li>`;
	});
	return `<ol>${items.join("")}</ol>`;
}

// ---------- diagrams ----------

async function renderMermaid(doc: Doc, blocks: string[]): Promise<void> {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rh-mermaid-"));
	await fs.mkdir(path.join(SITE, "docs/diagrams"), { recursive: true });
	const puppeteer = path.join(tmp, "puppeteer.json");
	await Bun.write(puppeteer, JSON.stringify({ executablePath: CHROME, args: ["--no-sandbox"] }));
	for (const [n, body] of blocks.entries()) {
		const input = path.join(tmp, `d${n}.mmd`);
		await Bun.write(input, body);
		for (const theme of ["light", "dark"]) {
			const out = path.join(SITE, "docs/diagrams", `${doc.slug}-${n + 1}-${theme}.svg`);
			const config = path.join(import.meta.dir, `mermaid-${theme}.json`);
			await $`npx -y @mermaid-js/mermaid-cli@11 -q -p ${puppeteer} -c ${config} -i ${input} -o ${out} -b transparent`.quiet();
			// Mermaid emits width="100%"; give the SVG its real size so an <img> has intrinsic dimensions.
			const svg = await Bun.file(out).text();
			const vb = svg.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
			if (!vb) throw new Error(`${out}: no viewBox`);
			const [w, h] = [Math.ceil(Number(vb[1])), Math.ceil(Number(vb[2]))];
			const open = svg.slice(0, svg.indexOf(">") + 1);
			const sized = open.replace(' width="100%"', ` width="${w}" height="${h}"`).replace(/max-width: [\d.]+px;\s*/, "");
			await Bun.write(out, sized + svg.slice(open.length));
			console.log(`  diagram ${path.relative(SITE, out)}`);
		}
	}
	await fs.rm(tmp, { recursive: true, force: true });
}

// The landing page's reladraw diagram, in the site's light and dark themes, on a transparent ground.
async function renderReladraw(): Promise<void> {
	const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rh-reladraw-"));
	const input = path.join(tmp, "architecture.reladraw");
	await fs.copyFile(path.join(SITE, "diagrams/architecture.reladraw.txt"), input);
	for (const [theme, file] of [
		["light", "architecture-light.svg"],
		["dark", "architecture.svg"],
	]) {
		const out = path.join(SITE, "diagrams", file);
		await $`npx -y reladraw@0.19.0 render ${input} --theme ${theme} -o ${out}`.quiet();
		const svg = await Bun.file(out).text();
		// Drop the full-canvas background rect so the diagram sits on the page's own plate.
		await Bun.write(out, svg.replace(/(<rect x="[-\d.]+" y="0" width="\d+" height="\d+") fill="#[0-9a-fA-F]{6}"\/>/, '$1 fill="none"/>'));
		console.log(`  diagram ${path.relative(SITE, out)}`);
	}
	await fs.rm(tmp, { recursive: true, force: true });
}

async function diagramFigure(doc: Doc, n: number): Promise<string> {
	const alt = escapeHtml(doc.diagramAlt[n] ?? `Diagram ${n + 1} from ${doc.src}.`);
	const src = (theme: string) => `diagrams/${doc.slug}-${n + 1}-${theme}.svg`;
	const head = (await Bun.file(path.join(SITE, "docs", src("light"))).text()).slice(0, 2000);
	const size = head.match(/<svg[^>]*? width="(\d+)" height="(\d+)"/);
	const dims = size ? ` width="${size[1]}" height="${size[2]}"` : "";
	return (
		`<figure class="plate">` +
		`<img class="only-light" src="${src("light")}"${dims} alt="${alt}" loading="lazy" />` +
		`<img class="only-dark" src="${src("dark")}"${dims} alt="${alt}" loading="lazy" />` +
		`</figure>`
	);
}

// ---------- main ----------

const sha = (await $`git rev-parse --short=10 ${ref}`.cwd(SITE).quiet()).text().trim();
const template = await Bun.file(path.join(import.meta.dir, "doc.html")).text();

if (withDiagrams) await renderReladraw();

for (const doc of DOCS) {
	const raw = await gitShow(ref, doc.src);
	const date = (await $`git log -1 --format=%cs ${ref} -- ${doc.src}`.cwd(SITE).quiet()).text().trim();
	const { md, blocks } = extractMermaid(separateRules(dropContentsSection(raw)));
	if (blocks.length !== doc.diagramAlt.length) {
		throw new Error(`${doc.src} has ${blocks.length} Mermaid blocks but ${doc.diagramAlt.length} alt texts; update DOCS`);
	}
	if (withDiagrams && blocks.length) await renderMermaid(doc, blocks);
	for (const n of blocks.keys()) {
		for (const theme of ["light", "dark"]) {
			const file = path.join(SITE, "docs/diagrams", `${doc.slug}-${n + 1}-${theme}.svg`);
			if (!(await Bun.file(file).exists())) throw new Error(`missing ${file}; run with --diagrams`);
		}
	}

	const toc: TocEntry[] = [];
	let html = Bun.markdown.html(md, { headings: { ids: true } });
	html = rewriteLinks(html, doc.src);
	html = decorate(html, toc);
	for (const n of blocks.keys()) html = html.replace(`<p>RHMERMAID${n}</p>`, await diagramFigure(doc, n));
	if (doc.heading) html = html.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/, `<h1$1>${escapeHtml(doc.heading)}</h1>`);
	if (doc.intro) {
		const figure = await Bun.file(path.join(SITE, doc.intro)).text();
		html = html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>\s*<p>[\s\S]*?<\/p>)/, `$1\n${figure}`);
	}

	const source =
		`Rendered from <a href="${REPO_URL}/blob/${sha}/${doc.src}">${doc.src}</a> ` +
		`at <a href="${REPO_URL}/commit/${sha}">${sha}</a>, last changed ${date}.`;

	const page = template
		.replaceAll("{{title}}", escapeHtml(doc.title))
		.replaceAll("{{description}}", escapeHtml(doc.description))
		.replace("{{toc}}", renderToc(toc))
		.replace("{{source}}", source)
		.replace("{{content}}", html)
		.replaceAll(`{{current-${doc.tab}}}`, ' aria-current="page"')
		.replace(/\{\{current-\w+\}\}/g, "");
	await Bun.write(path.join(SITE, doc.out), page);
	console.log(`${doc.out}  <- ${doc.src}@${sha}  (${toc.length} headings, ${blocks.length} diagrams)`);
}
