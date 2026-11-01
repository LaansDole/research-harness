import { afterAll, beforeAll, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ResearchConfig } from "../src/config";
import { type DataHandler, dataRoutes, type Highlights } from "../src/data";

const ROUTE = "/api/projects/:slug/highlights";
const CRITERIA = "/api/projects/:slug/criteria";

let tmp: string;
let routes: Record<string, DataHandler>;

function call(route: string, slug: string, body?: unknown): Promise<Response> {
	const init = body === undefined ? undefined : { method: "PUT", body: JSON.stringify(body) };
	const params: Record<string, string> = { slug };
	const req = Object.assign(new Request("http://127.0.0.1/x", init), { params, cookies: new Bun.CookieMap() });
	return Promise.resolve(routes[route](req as Bun.BunRequest));
}
beforeAll(async () => {
	tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "research-web-highlights-")));
	const home = path.join(tmp, "home");
	await fs.mkdir(path.join(home, "projects", "p1"), { recursive: true });
	await Bun.write(
		path.join(home, "projects", "p1", "scope.md"),
		"## Inclusion criteria\n\n- Randomised trials\n\n## Exclusion criteria\n\n- Case reports\n",
	);
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

/** Failure mode: a project that has never had highlight words failing to load instead of showing none. */
test("a project with no highlight words has empty lists", async () => {
	const res = await call(ROUTE, "p1");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ include: [], exclude: [] });
});

test("saved words come back trimmed and de-duplicated case-insensitively", async () => {
	const res = await call(ROUTE, "p1", {
		include: [" agent ", "Agent", "clinical decision support"],
		exclude: ["rat"],
	});
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ include: ["agent", "clinical decision support"], exclude: ["rat"] });
	expect((await (await call(ROUTE, "p1")).json()) as Highlights).toEqual({
		include: ["agent", "clinical decision support"],
		exclude: ["rat"],
	});
});

/** Failure mode: an unbounded or control-character-carrying word list reaching the renderer. */
test.each([
	["more than 50 words in a list", { include: Array.from({ length: 51 }, (_, i) => `w${i}`) }],
	["a word longer than 60 characters", { include: ["x".repeat(61)] }],
	["a word with control characters", { include: ["agent\u0000"] }],
	["a list that is not a list", { include: "agent" }],
])("rejects %s", async (_label, body) => {
	expect((await call(ROUTE, "p1", body)).status).toBe(400);
	// The last good save stands.
	expect(((await (await call(ROUTE, "p1")).json()) as Highlights).include).toEqual([
		"agent",
		"clinical decision support",
	]);
});

test("the criteria route serves the project's parsed scope", async () => {
	const res = await call(CRITERIA, "p1");
	expect(await res.json()).toEqual({
		question: "",
		pcc: {},
		inclusion: ["Randomised trials"],
		exclusion: ["Case reports"],
	});
});

test("a project without scope.md has no criteria rather than an error", async () => {
	await fs.mkdir(path.join(tmp, "home", "projects", "bare"), { recursive: true });
	const res = await call(CRITERIA, "bare");
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ question: "", pcc: {}, inclusion: [], exclusion: [] });
});
