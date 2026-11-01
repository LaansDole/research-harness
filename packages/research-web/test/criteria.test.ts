import { expect, test } from "bun:test";
import { parseScope } from "../src/criteria";

/** The shape /scope writes: a PCC table plus the two criteria lists (demo project's scope.md). */
const DEMO = `# Scope: Multi-agent LLM systems for clinical decision support

Created: 2026-09-06 (drafted from user guidance; refine via /scope if needed)

## Question

What multi-agent large-language-model systems have been proposed or evaluated for clinical decision support?

## PCC

| Dimension | Definition |
|---|---|
| Population | Clinicians, patients, or clinical workflows where decisions are supported |
| Concept | Multi-agent LLM systems: two or more LLM-backed agents that collaborate |
| Context | Clinical decision support: CDSS, diagnostic assistance, clinical triage |

## Inclusion criteria

- Describes a system with >=2 LLM-backed agents applied to a clinical decision-support task
- Reports design, implementation, or evaluation
- Peer-reviewed articles, conference papers, or preprints
- English language

## Exclusion criteria

- Single-agent LLM applications
- Multi-agent systems without LLMs
- LLMs in non-clinical health contexts
- Editorials, opinion pieces, protocols without system description
`;

/** Failure mode: the criteria the exclusion picker and the suggest button read come back empty or
 * carry the table's header row as if it were a criteria dimension. */
test("reads the question, the PCC dimensions and both criteria lists", () => {
	const scope = parseScope(DEMO);
	expect(scope.question).toStartWith("What multi-agent large-language-model systems");
	expect(Object.keys(scope.pcc)).toEqual(["population", "concept", "context"]);
	expect(scope.pcc.concept).toStartWith("Multi-agent LLM systems");
	expect(scope.inclusion).toHaveLength(4);
	expect(scope.exclusion).toEqual([
		"Single-agent LLM applications",
		"Multi-agent systems without LLMs",
		"LLMs in non-clinical health contexts",
		"Editorials, opinion pieces, protocols without system description",
	]);
});

/** A PICO review states its dimensions in the same table shape under a different heading. */
test("a PICO table reads the same way", () => {
	const scope = parseScope(
		"## PICO\n\n| Element | Definition |\n|---|---|\n| Population | Adults |\n| Intervention | Exercise |\n",
	);
	expect(scope.pcc).toEqual({ population: "Adults", intervention: "Exercise" });
});

/** Failure mode: a hand-written scope with no tables (or no scope at all) throwing instead of
 * leaving the picker with the fallback reasons. */
test("a scope without tables or criteria headings is empty, not an error", () => {
	const scope = parseScope("# Scope\n\nSome prose about the review, no headings at all.\n");
	expect(scope).toEqual({ question: "", pcc: {}, inclusion: [], exclusion: [] });
	expect(parseScope("")).toEqual({ question: "", pcc: {}, inclusion: [], exclusion: [] });
});
