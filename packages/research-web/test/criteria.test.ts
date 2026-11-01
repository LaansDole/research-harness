import { expect, test } from "bun:test";
import { parseScope, suggestTerms } from "../src/criteria";
import { markTerms } from "../src/highlight";

/** The shape /scope writes: a PCC table plus the two criteria lists (demo project's scope.md). */
const DEMO = `# Scope: Multi-agent LLM systems for clinical decision support

Created: 2026-09-06 (drafted from user guidance; refine via /scope if needed)

## Question

What multi-agent large-language-model systems have been proposed or evaluated for clinical decision support, and how are they designed and assessed?

## PCC

| Dimension | Definition |
|---|---|
| Population | Clinicians, patients, or clinical workflows where decisions are supported (diagnosis, triage, treatment planning, medication) |
| Concept | Multi-agent LLM systems: two or more LLM-backed agents that collaborate, debate, orchestrate, or specialize (incl. agentic pipelines with distinct roles) |
| Context | Clinical decision support: CDSS, diagnostic assistance, clinical triage/treatment recommendation settings (real or simulated clinical tasks) |

## Inclusion criteria

- Describes a system with >=2 LLM-backed agents (or an explicit agentic/orchestrated LLM architecture) applied to a clinical decision-support task
- Reports design, implementation, or evaluation (benchmark, simulation, or clinical study)
- Peer-reviewed articles, conference papers, or preprints (preprint status flagged at appraisal)
- English language

## Exclusion criteria

- Single-agent LLM applications (one model, one prompt chain, no inter-agent structure)
- Multi-agent systems without LLMs (classical MAS, rule-based agents)
- LLMs in non-clinical health contexts (admin, billing, education-only) with no decision-support task
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
		"Single-agent LLM applications (one model, one prompt chain, no inter-agent structure)",
		"Multi-agent systems without LLMs (classical MAS, rule-based agents)",
		"LLMs in non-clinical health contexts (admin, billing, education-only) with no decision-support task",
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
/** The list the editor shows when a researcher presses "Suggest from your criteria" is the contract:
 * same scope, same words, same order, no model call. Failure mode: a suggestion list that reshuffles
 * between visits, or fills up with "study", "evaluation" and other method boilerplate. */
test("suggested highlight words come from the criteria, deterministically", () => {
	const suggested = suggestTerms(parseScope(DEMO));
	expect(suggested).toEqual({
		include: [
			"clinicians",
			"patients",
			"clinical",
			"workflows",
			"diagnosis",
			"triage",
			"treatment",
			"medication",
			"multi-agent",
			"llm-backed",
			"agents",
			"collaborate",
		],
		exclude: [
			"single-agent",
			"rule-based",
			"non-clinical",
			"editorials",
			"inter-agent",
			"classical",
			"education-only",
			"opinion",
			"admin",
			"pieces",
			"billing",
			"protocols",
		],
	});
	expect(suggestTerms(parseScope(DEMO))).toEqual(suggested);
});

/** The failure: the suggestion painted the review's own subject vermilion. On this scope it offered
 * `model`, `llms` and `applications` as EXCLUDE words, so every relevant "large language models"
 * title came back marked as a reason to throw the paper out — while the last exclusion bullet
 * ("Editorials, opinion pieces, protocols...") contributed nothing, its words never reached. */
test("no suggested exclude word marks the review's own subject, and every exclusion bullet contributes", () => {
	const scope = parseScope(DEMO);
	const { exclude } = suggestTerms(scope);
	const subject = [...Object.entries(scope.pcc).flat(), ...scope.inclusion, scope.question].join("\n");
	for (const term of exclude) {
		const marked = markTerms(subject, { include: [], exclude: [term] }).filter(seg => seg.kind !== null);
		expect([term, marked]).toEqual([term, []]);
	}
	// A relevant title, as the reading list renders it: not one vermilion mark on it.
	const title = "Large language models (LLMs) in a multi-agent clinical decision support system";
	expect(markTerms(title, { include: [], exclude }).filter(seg => seg.kind !== null)).toEqual([]);
	// Every exclusion criterion that has a usable word is represented by one of its own words.
	for (const bullet of scope.exclusion) {
		const words = new Set(bullet.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []);
		expect([bullet, exclude.some(term => words.has(term))]).toEqual([bullet, true]);
	}
});
