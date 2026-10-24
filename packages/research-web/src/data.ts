import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { logger } from "@oh-my-pi/pi-utils";
import type { ResearchConfig } from "./config";

/** The nine PRISMA-ScR states from research/skills/literature-search/scripts/review.py. */
export const REVIEW_STATES = [
	"identified",
	"duplicate",
	"screened_excluded",
	"screened_included",
	"fulltext_sought",
	"fulltext_retrieved",
	"fulltext_not_retrieved",
	"fulltext_excluded",
	"included",
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export interface ProjectSummary {
	slug: string;
	active: boolean;
	counts: Record<ReviewState, number>;
}

export interface ReviewFile {
	file: string;
	mtime: number;
}

export interface RecordRow {
	id: string;
	title: string;
	authors: string | null;
	year: number | null;
	venue: string | null;
	doi: string | null;
	url: string | null;
	abstract: string | null;
	state: ReviewState;
	ta_verdict: string | null;
	ta_rationale: string | null;
	ft_verdict: string | null;
	ft_rationale: string | null;
	exclusion_reason: string | null;
	oa_status: string | null;
	has_pdf: boolean;
}

export type DataHandler = (req: Bun.BunRequest) => Response | Promise<Response>;

const SLUG_RE = /^[\w.-]+$/;
const REVIEW_FILE_RE = /^review-[\w.-]+\.md$/;

/** An error whose message is written for researchers; it is shown in the UI as-is. */
class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

const UNEXPECTED =
	"Something went wrong while loading this. Try again; if it keeps happening, the details are in the omp log.";

/** A browser navigation (e.g. a PDF link opened in a new tab) gets a readable page instead of JSON. */
function errorResponse(req: Request, status: number, message: string): Response {
	if (req.headers.get("accept")?.includes("text/html")) {
		const page = `<!doctype html><meta charset="utf-8"><title>research web</title><body style="font:16px system-ui;max-width:40em;margin:4em auto;padding:0 1em"><p>${Bun.escapeHTML(message)}</p></body>`;
		return new Response(page, { status, headers: { "content-type": "text/html; charset=utf-8" } });
	}
	return Response.json({ error: message }, { status });
}

function guarded(fn: DataHandler): DataHandler {
	return async req => {
		try {
			return await fn(req);
		} catch (err) {
			if (err instanceof HttpError) return errorResponse(req, err.status, err.message);
			logger.error("research-web: data route failed", {
				url: req.url,
				error: err instanceof Error ? err.stack : String(err),
			});
			return errorResponse(req, 500, UNEXPECTED);
		}
	};
}

/** Logs a failed helper script's stderr and surfaces `message` instead. */
function scriptFailed(script: string, out: { code: number; stderr: string }, message: string): HttpError {
	logger.error("research-web: script failed", { script, code: out.code, stderr: out.stderr.trim() });
	return new HttpError(500, message);
}

async function isDir(p: string): Promise<boolean> {
	try {
		return (await fs.stat(p)).isDirectory();
	} catch {
		return false;
	}
}

async function projectDir(config: ResearchConfig, slug: string | undefined): Promise<string> {
	if (!slug || !SLUG_RE.test(slug) || slug === "." || slug === "..") {
		throw new HttpError(400, "That project name isn't valid.");
	}
	const dir = path.join(config.projectsDir, slug);
	if (!(await isDir(dir)))
		throw new HttpError(404, `The project "${slug}" no longer exists. It may have been renamed or deleted.`);
	return dir;
}

/** Runs `fn` against the project's review.db opened read-only; a missing db yields `fallback`. */
async function withReviewDb<T>(dir: string, fallback: T, fn: (db: Database) => T): Promise<T> {
	const file = path.join(dir, "review.db");
	if (!(await Bun.file(file).exists())) return fallback;
	const db = new Database(file, { readonly: true });
	try {
		// A 0-byte or half-initialized review.db has no records yet: same as no review.db.
		if (db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'records'").get() === null)
			return fallback;
		return fn(db);
	} finally {
		db.close();
	}
}

async function realpathOrNull(p: string): Promise<string | null> {
	try {
		return await fs.realpath(p);
	} catch {
		return null;
	}
}

async function runPython(script: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["python3", script, ...args], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
}

export function dataRoutes(config: ResearchConfig): Record<string, DataHandler> {
	const scripts = path.join(config.harnessHome, "research", "skills");
	const routes: Record<string, DataHandler> = {
		"/api/projects": async () => {
			let active = "";
			try {
				active = (await Bun.file(path.join(config.home, "active-project")).text()).trim();
			} catch {}
			let entries: string[] = [];
			try {
				entries = (await fs.readdir(config.projectsDir, { withFileTypes: true }))
					.filter(e => e.isDirectory() && SLUG_RE.test(e.name))
					.map(e => e.name)
					.sort();
			} catch {}
			const projects: ProjectSummary[] = [];
			for (const slug of entries) {
				const counts = Object.fromEntries(REVIEW_STATES.map(s => [s, 0])) as Record<ReviewState, number>;
				await withReviewDb(path.join(config.projectsDir, slug), undefined, db => {
					const rows = db
						.query<{ state: ReviewState; n: number }, []>(
							"SELECT state, COUNT(*) AS n FROM records GROUP BY state",
						)
						.all();
					for (const r of rows) counts[r.state] = r.n;
				});
				projects.push({ slug, active: slug === active, counts });
			}
			return Response.json(projects);
		},

		"/api/projects/:slug/reviews": async req => {
			const dir = await projectDir(config, req.params.slug);
			const files: ReviewFile[] = [];
			for (const file of await fs.readdir(dir)) {
				if (!REVIEW_FILE_RE.test(file)) continue;
				files.push({ file, mtime: (await fs.stat(path.join(dir, file))).mtimeMs });
			}
			files.sort((a, b) => b.mtime - a.mtime);
			return Response.json(files);
		},

		"/api/projects/:slug/reviews/:file": async req => {
			const dir = await projectDir(config, req.params.slug);
			const name = req.params.file;
			if (!name || !REVIEW_FILE_RE.test(name)) throw new HttpError(400, "That review file name isn't valid.");
			const real = await realpathOrNull(path.join(dir, name));
			const root = await realpathOrNull(dir);
			if (!real || !root || !real.startsWith(root + path.sep))
				throw new HttpError(404, "This review no longer exists. It may have been renamed or deleted.");
			const file = Bun.file(real);
			return new Response(file, { headers: { "content-type": "text/markdown; charset=utf-8" } });
		},

		"/api/projects/:slug/records": async req => {
			const dir = await projectDir(config, req.params.slug);
			const state = new URL(req.url).searchParams.get("state") || null;
			if (state !== null && !(REVIEW_STATES as readonly string[]).includes(state)) {
				throw new HttpError(400, "That screening-stage filter isn't recognised.");
			}
			const rows = await withReviewDb(dir, [], db =>
				db
					.query<Omit<RecordRow, "has_pdf"> & { pdf_path: string | null }, [string | null]>(
						`SELECT id, title, authors, year, venue, doi, url, abstract, state, ta_verdict, ta_rationale,
							ft_verdict, ft_rationale, exclusion_reason, oa_status, pdf_path
						FROM records WHERE ?1 IS NULL OR state = ?1 ORDER BY created_at, id`,
					)
					.all(state),
			);
			// A stale pdf_path (file deleted or never written) must not render an "open" link that 404s.
			const records: RecordRow[] = await Promise.all(
				rows.map(async ({ pdf_path, ...r }) => ({
					...r,
					has_pdf: pdf_path ? await Bun.file(path.resolve(dir, pdf_path)).exists() : false,
				})),
			);
			return Response.json(records);
		},

		"/api/projects/:slug/pdf/:recordId": async req => {
			const dir = await projectDir(config, req.params.slug);
			const stored = await withReviewDb(dir, null, db =>
				db
					.query<{ pdf_path: string | null }, [string]>("SELECT pdf_path FROM records WHERE id = ?")
					.get(req.params.recordId ?? ""),
			);
			if (!stored?.pdf_path) throw new HttpError(404, "No PDF has been downloaded for this paper yet.");
			const real = await realpathOrNull(path.resolve(dir, stored.pdf_path));
			if (!real)
				throw new HttpError(
					404,
					"The PDF for this paper is missing from the project folder. It may have been moved or deleted.",
				);
			const roots = [await realpathOrNull(dir), config.corpusDir ? await realpathOrNull(config.corpusDir) : null];
			if (!roots.some(root => root !== null && (real === root || real.startsWith(root + path.sep)))) {
				throw new HttpError(
					403,
					"This PDF is stored outside the project and corpus folders, so it can't be opened here.",
				);
			}
			return new Response(Bun.file(real), { headers: { "content-type": "application/pdf" } });
		},

		"/api/projects/:slug/prisma.svg": async req => {
			const dir = await projectDir(config, req.params.slug);
			// No records yet is an empty project, not a failure: say what to do next. A 0-byte review.db counts as
			// none too, and never reaches prisma_scr.py (which would initialize its schema: a write from a GET).
			if (!(await withReviewDb(dir, false, db => db.query("SELECT 1 FROM records LIMIT 1").get() !== null))) {
				throw new HttpError(
					404,
					"No screening records in this project yet. Ask the agent to find or import papers, and the PRISMA diagram will appear here.",
				);
			}
			// ponytail: pass the project dir (not the slug) so prisma_scr.py resolves it independent of HOME/cwd.
			const out = await runPython(path.join(scripts, "literature-search", "scripts", "prisma_scr.py"), [
				"--project",
				dir,
				"--format",
				"svg",
			]);
			if (out.code !== 0)
				throw scriptFailed("prisma_scr.py", out, "The PRISMA diagram couldn't be drawn for this project.");
			return new Response(out.stdout, { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
		},

		"/api/graph": async () => {
			let mtime = 0;
			try {
				mtime = (await fs.stat(config.papersDb)).mtimeMs;
			} catch {}
			return Response.json({ mtime });
		},

		"/api/graph.html": async () => {
			const tmp = path.join(os.tmpdir(), `research-graph-${crypto.randomUUID()}.html`);
			try {
				const out = await runPython(path.join(scripts, "paper-graph", "scripts", "graph_viz.py"), [
					"--db",
					config.papersDb,
					"--out",
					tmp,
				]);
				if (out.code !== 0) throw scriptFailed("graph_viz.py", out, "The paper graph couldn't be drawn.");
				const html = await Bun.file(tmp).bytes();
				return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
			} finally {
				await fs.rm(tmp, { force: true });
			}
		},

		// The port is random per launch, so the browser's per-origin storage can't remember the theme.
		"/api/theme": async req => {
			const file = path.join(config.home, "web-theme");
			if (req.method === "POST") {
				const theme = await req.text();
				if (theme !== "light" && theme !== "dark") throw new HttpError(400, "That theme isn't recognised.");
				await Bun.write(file, theme);
				return new Response(null, { status: 204 });
			}
			let theme = "light";
			try {
				if ((await Bun.file(file).text()).trim() === "dark") theme = "dark";
			} catch {}
			return Response.json({ theme });
		},
	};
	return Object.fromEntries(Object.entries(routes).map(([k, fn]) => [k, guarded(fn)]));
}
