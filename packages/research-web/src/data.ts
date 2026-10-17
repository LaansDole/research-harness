import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
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

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

function guarded(fn: DataHandler): DataHandler {
	return async req => {
		try {
			return await fn(req);
		} catch (err) {
			if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
			return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
		}
	};
}

async function isDir(p: string): Promise<boolean> {
	try {
		return (await fs.stat(p)).isDirectory();
	} catch {
		return false;
	}
}

async function projectDir(config: ResearchConfig, slug: string | undefined): Promise<string> {
	if (!slug || !SLUG_RE.test(slug) || slug === "." || slug === "..") throw new HttpError(400, "invalid project slug");
	const dir = path.join(config.projectsDir, slug);
	if (!(await isDir(dir))) throw new HttpError(404, `no project ${slug}`);
	return dir;
}

/** Runs `fn` against the project's review.db opened read-only; a missing db yields `fallback`. */
async function withReviewDb<T>(dir: string, fallback: T, fn: (db: Database) => T): Promise<T> {
	const file = path.join(dir, "review.db");
	if (!(await Bun.file(file).exists())) return fallback;
	const db = new Database(file, { readonly: true });
	try {
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
			if (!name || !REVIEW_FILE_RE.test(name)) throw new HttpError(400, "invalid review file name");
			const file = Bun.file(path.join(dir, name));
			if (!(await file.exists())) throw new HttpError(404, `no review ${name}`);
			return new Response(file, { headers: { "content-type": "text/markdown; charset=utf-8" } });
		},

		"/api/projects/:slug/records": async req => {
			const dir = await projectDir(config, req.params.slug);
			const state = new URL(req.url).searchParams.get("state") || null;
			if (state !== null && !(REVIEW_STATES as readonly string[]).includes(state)) {
				throw new HttpError(400, `unknown state ${state}`);
			}
			const rows = await withReviewDb(dir, [] as RecordRow[], db =>
				db
					.query<Omit<RecordRow, "has_pdf"> & { has_pdf: number }, [string | null]>(
						`SELECT id, title, authors, year, venue, doi, url, state, ta_verdict, ta_rationale,
							ft_verdict, ft_rationale, exclusion_reason, oa_status,
							(pdf_path IS NOT NULL AND pdf_path != '') AS has_pdf
						FROM records WHERE ?1 IS NULL OR state = ?1 ORDER BY created_at, id`,
					)
					.all(state)
					.map(r => ({ ...r, has_pdf: r.has_pdf === 1 })),
			);
			return Response.json(rows);
		},

		"/api/projects/:slug/pdf/:recordId": async req => {
			const dir = await projectDir(config, req.params.slug);
			const stored = await withReviewDb(dir, null, db =>
				db
					.query<{ pdf_path: string | null }, [string]>("SELECT pdf_path FROM records WHERE id = ?")
					.get(req.params.recordId ?? ""),
			);
			if (!stored?.pdf_path) throw new HttpError(404, "no pdf for record");
			const real = await realpathOrNull(path.resolve(dir, stored.pdf_path));
			if (!real) throw new HttpError(404, "pdf file missing");
			const roots = [await realpathOrNull(dir), config.corpusDir ? await realpathOrNull(config.corpusDir) : null];
			if (!roots.some(root => root !== null && (real === root || real.startsWith(root + path.sep)))) {
				throw new HttpError(403, "pdf path outside allowed roots");
			}
			return new Response(Bun.file(real), { headers: { "content-type": "application/pdf" } });
		},

		"/api/projects/:slug/prisma.svg": async req => {
			const dir = await projectDir(config, req.params.slug);
			// ponytail: pass the project dir (not the slug) so prisma_scr.py resolves it independent of HOME/cwd.
			const out = await runPython(path.join(scripts, "literature-search", "scripts", "prisma_scr.py"), [
				"--project",
				dir,
				"--format",
				"svg",
			]);
			if (out.code !== 0) throw new HttpError(404, out.stderr.trim() || `prisma_scr.py exited ${out.code}`);
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
				if (out.code !== 0) throw new HttpError(500, out.stderr.trim() || `graph_viz.py exited ${out.code}`);
				const html = await Bun.file(tmp).bytes();
				return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
			} finally {
				await fs.rm(tmp, { force: true });
			}
		},
	};
	return Object.fromEntries(Object.entries(routes).map(([k, fn]) => [k, guarded(fn)]));
}
