import { afterAll, beforeAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ResearchConfig } from "../src/config";
import { type DataHandler, dataRoutes, type RecordRow } from "../src/data";

/** The repo root: the verdict route runs the real review.py from it, the one writer of review.db. */
const HARNESS = path.resolve(import.meta.dir, "../../..");
const REVIEW_PY = path.join(HARNESS, "research", "skills", "literature-search", "scripts", "review.py");
const VERDICT = "/api/projects/:slug/records/:id/verdict";

let tmp: string;
let proj: string;
let routes: Record<string, DataHandler>;

function review(...args: string[]): { code: number; stderr: string } {
	const out = Bun.spawnSync(["python3", REVIEW_PY, "--project", proj, ...args]);
	return { code: out.exitCode, stderr: out.stderr.toString() };
}

function post(params: Record<string, string>, body: unknown): Promise<Response> {
	const req = Object.assign(
		new Request("http://127.0.0.1/x", {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "content-type": "application/json" },
		}),
		{ params, cookies: new Bun.CookieMap() },
	);
	return Promise.resolve(routes[VERDICT](req as Bun.BunRequest));
}

interface Stored {
	state: string;
	ta_verdict: string | null;
	ta_rationale: string | null;
	ft_verdict: string | null;
	exclusion_reason: string | null;
}

function stored(id: string): Stored {
	const db = new Database(path.join(proj, "review.db"), { readonly: true });
	try {
		return db.query<Stored, [string]>("SELECT * FROM records WHERE id = ?").get(id) as Stored;
	} finally {
		db.close();
	}
}

function history(id: string): { from_state: string | null; to_state: string; note: string | null }[] {
	const db = new Database(path.join(proj, "review.db"), { readonly: true });
	try {
		return db
			.query<{ from_state: string | null; to_state: string; note: string | null }, [string]>(
				"SELECT from_state, to_state, note FROM history WHERE record_id = ? ORDER BY seq",
			)
			.all(id);
	} finally {
		db.close();
	}
}

beforeAll(async () => {
	tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "research-web-verdict-")));
	const home = path.join(tmp, "home");
	proj = path.join(home, "projects", "p1");
	await fs.mkdir(proj, { recursive: true });
	await fs.mkdir(path.join(home, "projects", "other"), { recursive: true });

	const seed = path.join(tmp, "seed.jsonl");
	await Bun.write(
		seed,
		["one", "two", "three", "four", "five"]
			.map((n, i) =>
				JSON.stringify({ title: `Paper ${n}`, doi: `10.1000/${n}`, year: 2020 + i, abstract: `About ${n}.` }),
			)
			.join("\n"),
	);
	expect(review("import", "--path", seed).code).toBe(0);
	// An agent verdict carries a record all the way to included: its title/abstract stage is closed.
	for (const stage of ["ta", "ft"]) {
		expect(
			review("verdict", "--id", "10.1000/three", "--stage", stage, "--verdict", "include", "--rationale", "agent")
				.code,
		).toBe(0);
	}

	const config: ResearchConfig = {
		home,
		projectsDir: path.join(home, "projects"),
		papersDb: path.join(home, "papers.db"),
		harnessHome: HARNESS,
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

/** Failure mode: a verdict saved straight into SQLite, bypassing the state machine and its history trail. */
test("including at title/abstract moves the paper on, marks it as the researcher's and leaves a history row", async () => {
	const res = await post({ slug: "p1", id: "10.1000/one" }, { stage: "ta", verdict: "include" });
	expect(res.status).toBe(200);
	const record = (await res.json()) as RecordRow;
	expect([record.id, record.state, record.ta_verdict]).toEqual(["10.1000/one", "screened_included", "include"]);

	const row = stored("10.1000/one");
	expect(row.state).toBe("screened_included");
	expect(row.ta_rationale).toBe("[researcher] Included at title/abstract");
	expect(history("10.1000/one").map(h => [h.from_state, h.to_state])).toEqual([
		[null, "identified"],
		["identified", "screened_included"],
	]);
});

/** Failure mode: an exclusion recorded without the one primary reason SCREENING.md requires. */
test("excluding needs a reason, and stores it as the exclusion reason with the researcher's note", async () => {
	const missing = await post({ slug: "p1", id: "10.1000/two" }, { stage: "ta", verdict: "exclude" });
	expect(missing.status).toBe(400);
	expect(stored("10.1000/two").state).toBe("identified");

	const res = await post(
		{ slug: "p1", id: "10.1000/two" },
		{ stage: "ta", verdict: "exclude", reason: "Population not met", note: "animal study" },
	);
	expect(res.status).toBe(200);
	const row = stored("10.1000/two");
	expect(row.state).toBe("screened_excluded");
	expect(row.exclusion_reason).toBe("Population not met");
	expect(row.ta_rationale).toBe("[researcher] Population not met - note: animal study");
});

/** Failure mode: the full-text stage accepting "maybe", which SCREENING.md bans as a binary stage. */
test("maybe is refused at the full-text stage and writes nothing", async () => {
	const res = await post({ slug: "p1", id: "10.1000/three" }, { stage: "ft", verdict: "maybe" });
	expect(res.status).toBe(400);
	expect(stored("10.1000/three").ft_verdict).toBe("include");
});

test("a paper from another project is a 404, not a write into this one", async () => {
	const res = await post({ slug: "other", id: "10.1000/one" }, { stage: "ta", verdict: "include" });
	expect(res.status).toBe(404);
});

/** Failure mode: the browser overruling review.py's state machine, or showing its stderr to a researcher. */
test("a decision the review store refuses comes back as a plain sentence, with the paper unchanged", async () => {
	const res = await post(
		{ slug: "p1", id: "10.1000/three" },
		{ stage: "ta", verdict: "exclude", reason: "Context not met" },
	);
	expect(res.status).toBe(409);
	const { error } = (await res.json()) as { error: string };
	expect(error).not.toContain("review:");
	expect(error).toContain("title and abstract");
	expect(stored("10.1000/three").state).toBe("included");
});

test.each([
	["a reason longer than 500 characters", { verdict: "exclude", reason: "x".repeat(501) }],
	["a note longer than 500 characters", { verdict: "include", note: "x".repeat(501) }],
	["a reason carrying control characters", { verdict: "exclude", reason: "Population\u0007 not met" }],
	["an unknown verdict", { verdict: "skip" }],
	["an unknown stage", { stage: "abstract", verdict: "include" }],
])("rejects %s", async (_label, body) => {
	const res = await post({ slug: "p1", id: "10.1000/four" }, { stage: "ta", ...body });
	expect(res.status).toBe(400);
	expect(stored("10.1000/four").state).toBe("identified");
});

/** Failure mode: a researcher's maybe silently moving the paper, instead of leaving it to decide again. */
test("maybe at title/abstract records the verdict and leaves the paper where it is", async () => {
	const res = await post({ slug: "p1", id: "10.1000/five" }, { stage: "ta", verdict: "maybe" });
	expect(res.status).toBe(200);
	const row = stored("10.1000/five");
	expect([row.state, row.ta_verdict]).toEqual(["identified", "maybe"]);
	expect(row.ta_rationale).toStartWith("[researcher] ");
});
