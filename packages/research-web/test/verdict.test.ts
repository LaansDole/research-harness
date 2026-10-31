import { expect, test } from "bun:test";
import { Check, CircleHelp, X } from "lucide-react";
import { verdictMark } from "../src/client/views/VerdictMark";

/** A verdict must never read as colour alone: each one carries its own icon and its own word.
 * Failure mode: two verdicts share a mark, or a verdict shows as a bare coloured band. */
test("each verdict maps to its own highlighter colour, icon and word", () => {
	const marks = ["include", "exclude", "maybe"].map(v => verdictMark(v));
	expect(marks).toEqual([
		{ tone: "include", label: "Include", icon: Check },
		{ tone: "exclude", label: "Exclude", icon: X },
		{ tone: "maybe", label: "Maybe", icon: CircleHelp },
	]);
});

test("a verdict the agent wrote in another casing still gets its mark", () => {
	expect(verdictMark(" Exclude ")).toEqual({ tone: "exclude", label: "Exclude", icon: X });
});

/** Anything that is not one of the three recorded verdicts renders as plain text, never as a band in
 * a colour that would claim a decision the review store does not hold. */
test("an unrecorded verdict has no mark", () => {
	expect(verdictMark(null)).toBeNull();
	expect(verdictMark("")).toBeNull();
	expect(verdictMark("unclear")).toBeNull();
});
