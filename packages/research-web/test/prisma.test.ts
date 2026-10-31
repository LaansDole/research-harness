import { expect, test } from "bun:test";
import { REVIEW_STATES, type ReviewState } from "../src/data";
import { derivePrisma, prismaStrip, stageChip } from "../src/client/prisma";

function counts(partial: Partial<Record<ReviewState, number>>): Record<ReviewState, number> {
	const out = Object.fromEntries(REVIEW_STATES.map(s => [s, 0])) as Record<ReviewState, number>;
	return { ...out, ...partial };
}

/** The header strip must report the numbers prisma_scr.py `derive()` draws, or the diagram and the
 * header disagree about the same review. One fixture per shape the arithmetic can take. */
test("derivePrisma matches prisma_scr.py derive() on a fresh import", () => {
	// 50 records straight out of an import: nothing screened yet.
	expect(derivePrisma(counts({ identified: 50 }))).toEqual({
		identified: 50,
		duplicates: 0,
		screened: 50,
		taPending: 50,
		sought: 0,
		retrievalPending: 0,
		assessed: 0,
		ftPending: 0,
		included: 0,
	});
});

test("derivePrisma matches derive() mid-screening, with duplicates and pending work", () => {
	const mid = counts({
		identified: 3,
		duplicate: 4,
		screened_excluded: 18,
		screened_included: 5,
		fulltext_sought: 3,
		fulltext_retrieved: 4,
		fulltext_not_retrieved: 2,
		fulltext_excluded: 3,
		included: 8,
	});
	expect(derivePrisma(mid)).toEqual({
		identified: 50,
		duplicates: 4,
		screened: 46,
		taPending: 3,
		sought: 25,
		retrievalPending: 8,
		assessed: 15,
		ftPending: 4,
		included: 8,
	});
});

test("derivePrisma counts not-retrieved reports in sought but never in assessed", () => {
	const flow = derivePrisma(
		counts({ duplicate: 2, screened_excluded: 6, fulltext_not_retrieved: 5, fulltext_excluded: 4, included: 3 }),
	);
	expect(flow).toEqual({
		identified: 20,
		duplicates: 2,
		screened: 18,
		taPending: 0,
		sought: 12,
		retrievalPending: 0,
		assessed: 7,
		ftPending: 0,
		included: 3,
	});
});

test("sought equals the sum of the post-title/abstract states", () => {
	const fixtures = [
		counts({ identified: 50 }),
		counts({
			identified: 3,
			duplicate: 4,
			screened_excluded: 18,
			screened_included: 5,
			fulltext_sought: 3,
			fulltext_retrieved: 4,
			fulltext_not_retrieved: 2,
			fulltext_excluded: 3,
			included: 8,
		}),
		counts({ duplicate: 2, screened_excluded: 6, fulltext_not_retrieved: 5, fulltext_excluded: 4, included: 3 }),
	];
	for (const c of fixtures) {
		const postTa =
			c.screened_included +
			c.fulltext_sought +
			c.fulltext_retrieved +
			c.fulltext_not_retrieved +
			c.fulltext_excluded +
			c.included;
		expect(derivePrisma(c).sought).toBe(postTa);
	}
});

/** Each strip button opens the reading list on the work waiting at that stage; a wrong chip sends the
 * researcher to an unrelated filter. */
test("stage buttons open the records waiting at that stage", () => {
	const mid = counts({
		identified: 3,
		duplicate: 4,
		screened_excluded: 18,
		screened_included: 5,
		fulltext_sought: 3,
		fulltext_retrieved: 4,
		included: 8,
	});
	expect(stageChip("identified", mid)).toBe("");
	expect(stageChip("screened", mid)).toBe("identified");
	expect(stageChip("sought", mid)).toBe("screened_included");
	expect(stageChip("assessed", mid)).toBe("fulltext_retrieved");
	expect(stageChip("included", mid)).toBe("included");
});

test("a stage with no waiting records falls back to the next state it owns, then to All", () => {
	// Nothing left to screen and nothing passed T/A: retrieval work is only in fulltext_sought.
	const late = counts({ duplicate: 1, screened_excluded: 4, fulltext_sought: 2, fulltext_excluded: 1, included: 6 });
	expect(stageChip("screened", late)).toBe("");
	expect(stageChip("sought", late)).toBe("fulltext_sought");
	expect(stageChip("assessed", late)).toBe("");
	expect(stageChip("included", late)).toBe("included");
});

test("prismaStrip is empty for a project with no records and ordered for one with records", () => {
	expect(prismaStrip(counts({}))).toEqual([]);
	const strip = prismaStrip(counts({ identified: 2, duplicate: 1, screened_excluded: 3, included: 4 }));
	expect(strip).toEqual([
		{ stage: "identified", count: 10, pending: 0, chip: "" },
		{ stage: "screened", count: 9, pending: 2, chip: "identified" },
		{ stage: "sought", count: 4, pending: 0, chip: "" },
		{ stage: "assessed", count: 4, pending: 0, chip: "" },
		{ stage: "included", count: 4, pending: 0, chip: "included" },
	]);
});
