import { expect, test } from "bun:test";
import { type Criteria, parseScope, suggestTerms } from "../src/criteria";
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

/** A hand-written scope: no sections at all, the question on one line and the dimensions as bullets. */
const PLAIN = `# Scope (hand-written)

Question: How do retrieval-augmented LLM tutors change what secondary-school teachers do in class?

- Population: secondary-school teachers and their classes
- Concept: retrieval-augmented LLM tutors answering coursework questions
- Context: timetabled lessons and homework, 2022 onwards
`;

/** What research/prompts/scope.md instructs: loose headings and one criteria row per criterion. */
const TABLE = `# Scope: Retrieval-augmented LLM tutors in secondary classrooms

**Date:** 2026-10-14
**Review type:** Scoping review

## Research question

How are retrieval-augmented large language model tutors designed and evaluated for
secondary-school classroom use, and what learning gains are reported?

## Framework — PCC

| Element | Definition |
|---|---|
| **Population** | Secondary-school learners and the teachers running the lesson. |
| **Concept** | Retrieval-augmented LLM tutors: a tutoring agent whose answers are grounded in the course corpus. |
| **Context** | Timetabled teaching and the coursework attached to it, in school. |

## Inclusion / exclusion criteria

| Criterion | Include | Exclude |
|---|---|---|
| Population | **Secondary-school** learners, ages 11–18 | University cohorts; workplace training |
| Concept | Tutoring grounded in a course corpus | Plain chatbots with no retrieval; marking-only tools |
| Context | Lessons or coursework in school | Laboratory-only prompting trials |
| Study types | Classroom trials, design studies, preprints | Editorials; vendor white papers |
| Years | 2021–2026 | Pre-2021 |
| Language | English | Non-English |

## Assumptions (headless defaults)

- **Years = 2021–2026.** Retrieval-augmented tutoring is a post-2021 phenomenon.
- **English only.**
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

/** Failure mode: a scope written as plain lines — no `##` sections anywhere — left the exclusion
 * reason picker empty and the suggest button with nothing to offer. */
test("a hand-written scope states its question on one line and its dimensions as bullets", () => {
	const scope = parseScope(PLAIN);
	expect(scope.question).toBe(
		"How do retrieval-augmented LLM tutors change what secondary-school teachers do in class?",
	);
	expect(scope.pcc).toEqual({
		population: "secondary-school teachers and their classes",
		concept: "retrieval-augmented LLM tutors answering coursework questions",
		context: "timetabled lessons and homework, 2022 onwards",
	});
	expect([scope.inclusion, scope.exclusion]).toEqual([[], []]);
});

/** Failure mode: the shape /scope actually writes — an inclusion/exclusion TABLE under a loose
 * heading — parsed as no criteria at all, so the picker fell back to "Population not met". */
test("a criteria table gives one inclusion and one exclusion entry per criterion", () => {
	const scope = parseScope(TABLE);
	expect(scope.question).toBe(
		"How are retrieval-augmented large language model tutors designed and evaluated for secondary-school classroom use, and what learning gains are reported?",
	);
	expect(Object.keys(scope.pcc)).toEqual(["population", "concept", "context"]);
	expect(scope.pcc.concept).toStartWith("Retrieval-augmented LLM tutors:");
	expect(scope.inclusion).toEqual([
		"Population: Secondary-school learners, ages 11–18",
		"Concept: Tutoring grounded in a course corpus",
		"Context: Lessons or coursework in school",
		"Study types: Classroom trials, design studies, preprints",
		"Years: 2021–2026",
		"Language: English",
	]);
	// The criterion name is the reason label the exclusion picker shows.
	expect(scope.exclusion).toEqual([
		"Population: University cohorts; workplace training",
		"Concept: Plain chatbots with no retrieval; marking-only tools",
		"Context: Laboratory-only prompting trials",
		"Study types: Editorials; vendor white papers",
		"Years: Pre-2021",
		"Language: Non-English",
	]);
});

/** Headings are written freely; a two-column criteria table has no criterion to name. */
test("loose headings and a criteria table without a criterion column still read", () => {
	const scope = parseScope(
		`## Framework - PICO\n\n| Element | Definition |\n|---|---|\n| Population | Adults with chronic pain |\n| Intervention | Supervised exercise |\n\n## Eligibility criteria\n\n| Include | Exclude |\n|---|---|\n| Randomised trials | Case reports |\n`,
	);
	expect(scope.pcc).toEqual({ population: "Adults with chronic pain", intervention: "Supervised exercise" });
	expect([scope.inclusion, scope.exclusion]).toEqual([["Randomised trials"], ["Case reports"]]);
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

/** The failure: the suggestion painted the review's own subject vermilion. On the demo scope it
 * offered `model`, `llms` and `applications` as EXCLUDE words, so every relevant "large language
 * models" title came back marked as a reason to throw the paper out. */
function expectNoSubjectMarks(scope: Criteria, title: string): string[] {
	const { exclude } = suggestTerms(scope);
	const subject = [...Object.entries(scope.pcc).flat(), ...scope.inclusion, scope.question].join("\n");
	for (const term of exclude) {
		const marked = markTerms(subject, { include: [], exclude: [term] }).filter(seg => seg.kind !== null);
		expect([term, marked]).toEqual([term, []]);
	}
	// A relevant title, as the reading list renders it: not one vermilion mark on it.
	expect(markTerms(title, { include: [], exclude }).filter(seg => seg.kind !== null)).toEqual([]);
	return exclude;
}

test("no suggested exclude word marks the review's own subject, and every exclusion bullet contributes", () => {
	const scope = parseScope(DEMO);
	const exclude = expectNoSubjectMarks(
		scope,
		"Large language models (LLMs) in a multi-agent clinical decision support system",
	);
	// Every exclusion criterion that has a usable word is represented by one of its own words.
	for (const bullet of scope.exclusion) {
		const words = new Set(bullet.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []);
		expect([bullet, exclude.some(term => words.has(term))]).toEqual([bullet, true]);
	}
});

/** The same failure on the other two shapes: a hand-written scope has no exclusion criteria, so it
 * has no exclude words to offer (its dimensions are what the review is ABOUT), and a criteria
 * table's Exclude cells repeat the subject's own words ("no retrieval", "trials", "Years"). */
test("the other scope shapes never suggest the review's own subject as an exclude word", () => {
	const hand = parseScope(PLAIN);
	expect(suggestTerms(hand).exclude).toEqual([]);
	expectNoSubjectMarks(hand, "Retrieval-augmented LLM tutors in secondary-school classrooms");
	const table = parseScope(TABLE);
	const exclude = expectNoSubjectMarks(table, "Retrieval-augmented LLM tutors in secondary-school classrooms");
	expect(exclude).toContain("university");
	for (const banned of ["retrieval", "trials", "years"]) expect(exclude).not.toContain(banned);
});

/** The real scope that hit this: its PCC says "social science", one Exclude cell says
 * "social-science". Offering the hyphenated spelling paints the review's own subject vermilion
 * just the same, because the highlighter marks `social-science` wherever a title hyphenates it. */
test("an exclude word is judged by its spaced spelling too", () => {
	const scope: Criteria = {
		question: "How are LLM multi-agent systems used in social science research?",
		pcc: { context: "Social science and computational social science" },
		inclusion: [],
		exclusion: ["Purely NLP engineering benchmarks with no social-science question"],
	};
	expect(suggestTerms(scope).exclude).toEqual(["purely", "engineering", "benchmarks", "question"]);
});
