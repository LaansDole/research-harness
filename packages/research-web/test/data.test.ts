import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ResearchConfig } from "../src/config";
import { type DataHandler, dataRoutes, type RecordRow } from "../src/data";

let tmp: string;
let routes: Record<string, DataHandler>;

function call(
	route: string,
	params: Record<string, string>,
	query = "",
	headers?: Record<string, string>,
): Promise<Response> {
	const req = Object.assign(new Request(`http://127.0.0.1/x${query}`, { headers }), {
		params,
		cookies: new Bun.CookieMap(),
	});
	return Promise.resolve(routes[route](req as Bun.BunRequest));
}

beforeAll(async () => {
	tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "research-web-data-")));
	const home = path.join(tmp, "home");
	const proj = path.join(home, "projects", "p1");
	await fs.mkdir(path.join(proj, "papers"), { recursive: true });
	await Bun.write(path.join(proj, "papers", "a.pdf"), "%PDF-1.4 inside");
	await Bun.write(path.join(tmp, "outside.pdf"), "%PDF-1.4 outside");
	await fs.symlink(path.join(tmp, "outside.pdf"), path.join(proj, "papers", "link.pdf"));
	await Bun.write(path.join(proj, "review-x.md"), "# Review");
	await fs.symlink(path.join(tmp, "outside.pdf"), path.join(proj, "review-link.md"));
	await Bun.write(path.join(home, "active-project"), "p1\n");
	await fs.mkdir(path.join(home, "projects", "empty"));
	await fs.mkdir(path.join(home, "projects", "zero"));
	await Bun.write(path.join(home, "projects", "zero", "review.db"), "");

	const db = new Database(path.join(proj, "review.db"));
	db.run(`CREATE TABLE records (
		id TEXT PRIMARY KEY, import_key TEXT NOT NULL, source_db TEXT NOT NULL, title TEXT NOT NULL,
		authors TEXT, year INTEGER, venue TEXT, doi TEXT, url TEXT, abstract TEXT,
		state TEXT NOT NULL DEFAULT 'identified', ta_verdict TEXT, ta_rationale TEXT, ta_confidence TEXT,
		ft_verdict TEXT, ft_rationale TEXT, exclusion_reason TEXT, duplicate_of TEXT, pdf_path TEXT,
		oa_status TEXT, oa_source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
		UNIQUE(source_db, import_key))`);
	const ins = db.prepare(
		"INSERT INTO records (id, import_key, source_db, title, state, pdf_path, created_at, updated_at) VALUES (?, ?, 's', ?, ?, ?, 't', 't')",
	);
	ins.run("r-in", "k1", "Inside", "included", "papers/a.pdf");
	ins.run("r-dotdot", "k2", "Dotdot", "identified", "../../../outside.pdf");
	ins.run("r-abs", "k3", "Absolute", "identified", path.join(tmp, "outside.pdf"));
	ins.run("r-link", "k4", "Symlink", "identified", "papers/link.pdf");
	ins.run("r-stale", "k5", "Stale", "fulltext_retrieved", "papers/deleted.pdf");
	db.close();

	const config: ResearchConfig = {
		home,
		projectsDir: path.join(home, "projects"),
		papersDb: path.join(home, "papers.db"),
		harnessHome: tmp,
		ompCommand: ["omp"],
		systemPrompt: "",
		port: 0,
		openBrowser: false,
	};
	routes = dataRoutes(config);
});

afterAll(async () => {
	await fs.rm(tmp, { recursive: true, force: true });
});

describe("pdf route", () => {
	test("serves a PDF inside the project", async () => {
		const res = await call("/api/projects/:slug/pdf/:recordId", { slug: "p1", recordId: "r-in" });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/pdf");
		expect(await res.text()).toBe("%PDF-1.4 inside");
	});

	test.each(["r-dotdot", "r-abs", "r-link"])("rejects %s escaping the roots", async recordId => {
		const res = await call("/api/projects/:slug/pdf/:recordId", { slug: "p1", recordId });
		expect(res.status).toBe(403);
	});
});

describe("validation", () => {
	test("slug .. → 400", async () => {
		expect((await call("/api/projects/:slug/reviews", { slug: ".." })).status).toBe(400);
	});

	test("unknown project → 404", async () => {
		expect((await call("/api/projects/:slug/reviews", { slug: "nope" })).status).toBe(404);
	});

	test("review file traversal → 400", async () => {
		const res = await call("/api/projects/:slug/reviews/:file", { slug: "p1", file: "../x.md" });
		expect(res.status).toBe(400);
	});

	test("review file served as markdown", async () => {
		const res = await call("/api/projects/:slug/reviews/:file", { slug: "p1", file: "review-x.md" });
		expect(res.headers.get("content-type")).toStartWith("text/markdown");
		expect(await res.text()).toBe("# Review");
	});

	test("review file symlinked outside the project → 404", async () => {
		const res = await call("/api/projects/:slug/reviews/:file", { slug: "p1", file: "review-link.md" });
		expect(res.status).toBe(404);
	});

	test("unknown state → 400", async () => {
		const res = await call("/api/projects/:slug/records", { slug: "p1" }, "?state=bogus");
		expect(res.status).toBe(400);
	});

	test("state filter", async () => {
		const res = await call("/api/projects/:slug/records", { slug: "p1" }, "?state=included");
		const rows = (await res.json()) as RecordRow[];
		expect(rows.map(r => [r.id, r.has_pdf])).toEqual([["r-in", true]]);
	});

	test("stale pdf_path (file missing) reports has_pdf false", async () => {
		const res = await call("/api/projects/:slug/records", { slug: "p1" }, "?state=fulltext_retrieved");
		const rows = (await res.json()) as RecordRow[];
		expect(rows.map(r => [r.id, r.has_pdf])).toEqual([["r-stale", false]]);
	});
});

describe("readable errors", () => {
	test("PRISMA for a project without review.db is a 404 empty state, not a script error", async () => {
		const res = await call("/api/projects/:slug/prisma.svg", { slug: "empty" });
		expect(res.status).toBe(404);
		const { error } = (await res.json()) as { error: string };
		expect(error).toStartWith("No screening records in this project yet.");
	});

	test("a 0-byte review.db reads as an empty project, not a 500", async () => {
		const projects = (await (await call("/api/projects", {})).json()) as { slug: string; counts: object }[];
		expect(Object.values(projects.find(p => p.slug === "zero")?.counts ?? { missing: 1 })).toEqual(Array(9).fill(0));
		expect(await (await call("/api/projects/:slug/records", { slug: "zero" })).json()).toEqual([]);
		expect((await call("/api/projects/:slug/prisma.svg", { slug: "zero" })).status).toBe(404);
		expect(await Bun.file(path.join(tmp, "home", "projects", "zero", "review.db")).size).toBe(0);
	});

	test("a PDF link opened in a browser tab gets an HTML page, not JSON", async () => {
		const res = await call("/api/projects/:slug/pdf/:recordId", { slug: "p1", recordId: "r-stale" }, "", {
			accept: "text/html",
		});
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(await res.text()).toContain("The PDF for this paper is missing");
	});
});

describe("theme route", () => {
	const theme = (body?: string) => {
		const init = body === undefined ? undefined : { method: "POST", body };
		const req = Object.assign(new Request("http://127.0.0.1/api/theme", init), {
			params: {},
			cookies: new Bun.CookieMap(),
		});
		return Promise.resolve(routes["/api/theme"](req as Bun.BunRequest));
	};

	test("defaults to light, keeps a saved dark choice, and rejects anything else", async () => {
		expect(await (await theme()).json()).toEqual({ theme: "light" });
		expect((await theme("dark")).status).toBe(204);
		expect(await (await theme()).json()).toEqual({ theme: "dark" });
		const bad = await theme("../../etc/passwd");
		expect(bad.status).toBe(400);
		expect(await (await theme()).json()).toEqual({ theme: "dark" });
	});
});
