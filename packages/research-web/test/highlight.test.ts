import { expect, test } from "bun:test";
import { markTerms } from "../src/highlight";

const marks = (text: string, include: string[], exclude: string[] = []): [string, string][] =>
	markTerms(text, { include, exclude })
		.filter(s => s.kind !== null)
		.map(s => [s.text, s.kind as string]);

/** The one invariant a researcher reads: the abstract comes back word for word, marks or not. */
test("the original text survives marking, character for character", () => {
	const text = "Agents (multi-agent) debate; rats, too — see Fig. 2.";
	const segments = markTerms(text, { include: ["agent", "debate"], exclude: ["rat"] });
	expect(segments.map(s => s.text).join("")).toBe(text);
});

/** Failure mode: a highlight word only matching the exact casing the researcher typed. */
test("matching ignores case and allows a plural, but not another suffix", () => {
	expect(marks("Agent agents AGENT agentic", ["agent"])).toEqual([
		["Agent", "include"],
		["agents", "include"],
		["AGENT", "include"],
	]);
	expect(marks("agentic systems", ["agentic"])).toEqual([["agentic", "include"]]);
});

/** Failure mode: a word inside another word lighting up ("rat" in "strategy"). */
test("only whole words match", () => {
	expect(marks("strategy and iteration", ["rat"])).toEqual([]);
	expect(marks("the rat, caged", ["rat"])).toEqual([["rat", "include"]]);
});

/** Failure mode: "clinical" eating the start of "clinical decision support" and leaving a nested mark. */
test("the longest phrase wins and nothing nests inside it", () => {
	expect(marks("clinical decision support tools", ["clinical", "clinical decision support"])).toEqual([
		["clinical decision support", "include"],
	]);
	expect(marks("clinical  decision   support", ["clinical decision support"])).toEqual([
		["clinical  decision   support", "include"],
	]);
});

/** Failure mode: the two lists sharing one colour, so a researcher cannot tell them apart. */
test("include and exclude words keep their own kinds, left to right", () => {
	expect(marks("LLM agents versus rats in vitro", ["agent"], ["rat", "in vitro"])).toEqual([
		["agents", "include"],
		["rats", "exclude"],
		["in vitro", "exclude"],
	]);
});

test("no words means no marks, and an empty text is no work", () => {
	expect(markTerms("anything at all", { include: [], exclude: [] })).toEqual([
		{ text: "anything at all", kind: null },
	]);
	expect(markTerms("", { include: ["agent"], exclude: [] })).toEqual([]);
});
