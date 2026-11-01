import { expect, test } from "bun:test";
import type { RecordRow } from "../src/data";
import { needsDecision, stagesFor, typingInField } from "../src/client/views/ScreeningDesk";

/** A minimal element stand-in: the predicate only ever asks a target what it is nested in. */
function target(selectors: string[]): EventTarget {
	return { closest: (query: string) => (selectors.includes(query) ? {} : null) } as unknown as EventTarget;
}

/** Failure mode: pressing "e" while typing "epilepsy" in the search box excludes the open paper. */
test("the I/E/M shortcuts stand down while the researcher is typing", () => {
	const fields = "input, textarea, select, [contenteditable='true'], [contenteditable='']";
	expect(typingInField(target([fields]))).toBe(true);
	expect(typingInField(target([]))).toBe(false);
	expect(typingInField(null)).toBe(false);
});

/** Failure mode: offering Maybe at full text (banned by SCREENING.md), or a desk on a duplicate. */
test("each state offers exactly the stages review.py accepts a verdict for", () => {
	expect(stagesFor("identified")).toEqual(["ta"]);
	expect(stagesFor("screened_included")).toEqual(["ta", "ft"]);
	expect(stagesFor("fulltext_retrieved")).toEqual(["ft"]);
	expect(stagesFor("included")).toEqual(["ft"]);
	expect(stagesFor("duplicate")).toEqual([]);
	expect(stagesFor("fulltext_not_retrieved")).toEqual([]);
});

/** Failure mode: screening skips past papers the agent left as "maybe", or re-asks decided ones. */
test("a maybe still waits for a decision; an include or exclude does not", () => {
	const row = (over: Partial<RecordRow>): RecordRow =>
		({ state: "identified", ta_verdict: null, ft_verdict: null, ...over }) as RecordRow;
	expect(needsDecision(row({}), "ta")).toBe(true);
	expect(needsDecision(row({ ta_verdict: "maybe" }), "ta")).toBe(true);
	expect(needsDecision(row({ ta_verdict: "include" }), "ta")).toBe(false);
	expect(needsDecision(row({ state: "duplicate" }), "ta")).toBe(false);
	expect(needsDecision(row({ state: "fulltext_retrieved" }), "ta")).toBe(false);
	expect(needsDecision(row({ state: "fulltext_retrieved" }), "ft")).toBe(true);
});
