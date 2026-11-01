/**
 * The project's screening criteria, read from `scope.md` (written by /scope).
 * Pure text in, pure data out: no filesystem, no bun APIs, so the client can import it too.
 */

import { markTerms } from "./highlight";

export interface Criteria {
	question: string;
	/** PCC (or PICO) dimensions, keyed by their lower-cased name in table order. */
	pcc: Record<string, string>;
	inclusion: string[];
	exclusion: string[];
}

const EMPTY: Criteria = { question: "", pcc: {}, inclusion: [], exclusion: [] };

/** `## Heading` splits the document; `###` and deeper stay inside their section. */
function sectionsOf(markdown: string): Map<string, string[]> {
	const out = new Map<string, string[]>();
	let lines: string[] = [];
	out.set("", lines);
	for (const line of markdown.split("\n")) {
		const heading = /^##\s+(.+?)\s*$/.exec(line);
		if (heading === null) lines.push(line);
		else {
			lines = [];
			out.set(heading[1].toLowerCase(), lines);
		}
	}
	return out;
}

function bullets(lines: string[] | undefined): string[] {
	const out: string[] = [];
	for (const line of lines ?? []) {
		const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
		if (bullet !== null) out.push(bullet[1]);
	}
	return out;
}

/** The dimension rows of a pipe table: its header row and the `---` rule are not criteria. */
function tableRows(lines: string[] | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	let row = 0;
	for (const line of lines ?? []) {
		if (!line.trim().startsWith("|")) {
			row = 0;
			continue;
		}
		row++;
		const cells = line
			.trim()
			.replace(/^\||\|$/g, "")
			.split("|")
			.map(c => c.trim());
		// 1 = the header row, 2 = the alignment rule.
		if (row <= 2 || cells.length < 2 || cells[0] === "") continue;
		out[cells[0].toLowerCase()] = cells.slice(1).join(" | ");
	}
	return out;
}

export function parseScope(markdown: string): Criteria {
	if (markdown.trim() === "") return { ...EMPTY };
	const sections = sectionsOf(markdown);
	const question = (sections.get("question") ?? []).map(l => l.trim()).find(l => l !== "") ?? "";
	let pcc: Record<string, string> = {};
	for (const [heading, lines] of sections) {
		if (!/^(pcc|pico|picos|criteria framework)\b/.test(heading)) continue;
		pcc = tableRows(lines);
		if (Object.keys(pcc).length > 0) break;
	}
	return {
		question,
		pcc,
		inclusion: bullets(sections.get("inclusion criteria")),
		exclusion: bullets(sections.get("exclusion criteria")),
	};
}

/** Words that carry no meaning as a highlight: method boilerplate and ordinary English glue. */
const STOPWORDS: Record<string, true> = {};
for (const word of `about above after against along among another these those their there where which while with without
	 within been being both case cases does done during each either else enough every from have having here into itself
	 just like made make many more most much must only other over same should since some such than that them then
	 they this through under until upon used uses using very were what when whether will your study studies paper
	 papers article articles research reports reported report design designs describes describe described evaluate
	 evaluated evaluation evaluations include included including includes exclude excluded excluding criteria
	 criterion dimension definition population concept context intervention comparison outcome outcomes setting
	 settings language english peer reviewed conference preprint preprints published publication type types
	 primary secondary review reviews systematic scoping meta analysis data results methods based explicit
	 applied apply task tasks work works etc
	 application applications approach approaches chain chains contexts decision decisions health method
	 model models planning prompt prompts structure structures support supports supported system systems
	 use`.split(/\s+/)) {
	if (word !== "") STOPWORDS[word] = true;
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** One criterion's candidate words, hyphenated compounds first: `single-agent` says more than `prompt`. */
function candidates(text: string, seen: Set<string>): string[] {
	const compounds: string[] = [];
	const plain: string[] = [];
	for (const [word] of text.matchAll(WORD_RE)) {
		const term = word.toLowerCase().replace(/^['’-]+|['’-]+$/g, "");
		if (term.length < 4 || STOPWORDS[term] === true || seen.has(term)) continue;
		seen.add(term);
		(term.includes("-") ? compounds : plain).push(term);
	}
	return [...compounds, ...plain];
}

/** One word from each criterion, then the next: no single bullet eats the whole list. */
function roundRobin(groups: readonly string[][]): string[] {
	const out: string[] = [];
	for (let i = 0; groups.some(group => i < group.length); i++) {
		for (const group of groups) if (i < group.length) out.push(group[i]);
	}
	return out;
}

/**
 * Whether a word lights up the review's own subject — by the highlighter's rule and by that rule
 * read backwards, so `llms` is not offered as an exclusion for a review about LLM systems.
 */
function marksSubject(term: string, subject: string): boolean {
	const hits = (t: string) =>
		t.length >= 3 && markTerms(subject, { include: [], exclude: [t] }).some(seg => seg.kind !== null);
	return hits(term) || hits(term.replace(/(es|s)$/, ""));
}

/** How many suggestions each list offers: enough to edit down, few enough to read at a glance. */
const SUGGEST_LIMIT = 12;

/**
 * Candidate highlight words drawn from the criteria themselves, in the order they are written.
 * Deterministic and model-free: the researcher edits the lists before saving them.
 */
export function suggestTerms(criteria: Criteria): { include: string[]; exclude: string[] } {
	const seen = new Set<string>();
	// PCC first: the dimensions are the criteria themselves; the question only fills what is left.
	const include = [...Object.values(criteria.pcc), ...criteria.inclusion, criteria.question]
		.flatMap(text => candidates(text, seen))
		.slice(0, SUGGEST_LIMIT);
	// What the review is about. A word of it marked vermilion tells the researcher the opposite of
	// the truth, so no exclusion suggestion may touch it — whichever bullet happens to mention it.
	const subject = [...Object.entries(criteria.pcc).flat(), ...criteria.inclusion, criteria.question].join("\n");
	const exclude = roundRobin(
		criteria.exclusion.map(text => candidates(text, seen).filter(term => !marksSubject(term, subject))),
	).slice(0, SUGGEST_LIMIT);
	return { include, exclude };
}
