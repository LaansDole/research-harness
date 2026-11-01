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

/** Markdown emphasis is decoration, not content: `**Population**` is the dimension `Population`. */
function plainText(text: string): string {
	return text
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/`(.+?)`/g, "$1")
		.replace(/\*(.+?)\*/g, "$1")
		.trim();
}

/**
 * `## Heading` splits the document; `###` and deeper stay inside their section. Headings are kept as
 * their bare words, so "Framework — PCC" and "Inclusion / exclusion criteria" are matchable.
 */
function sectionsOf(markdown: string): Map<string, string[]> {
	const out = new Map<string, string[]>();
	let lines: string[] = [];
	out.set("", lines);
	for (const line of markdown.split("\n")) {
		const heading = /^##\s+(.+?)\s*$/.exec(line);
		if (heading === null) lines.push(line);
		else {
			lines = [];
			out.set(
				plainText(heading[1])
					.toLowerCase()
					.replace(/[^\p{L}\p{N}]+/gu, " ")
					.trim(),
				lines,
			);
		}
	}
	return out;
}

function bullets(lines: string[] | undefined): string[] {
	const out: string[] = [];
	for (const line of lines ?? []) {
		const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
		if (bullet !== null) out.push(plainText(bullet[1]));
	}
	return out;
}

/** The bullets of the first section whose heading matches, skipping sections that hold a table. */
function sectionBullets(sections: Map<string, string[]>, heading: RegExp): string[] {
	for (const [name, lines] of sections) {
		if (!heading.test(name)) continue;
		const found = bullets(lines);
		if (found.length > 0) return found;
	}
	return [];
}

/** The first paragraph: /scope wraps a question over several lines. */
function paragraph(lines: string[] | undefined): string {
	const out: string[] = [];
	for (const line of lines ?? []) {
		const text = plainText(line);
		if (text === "" || text.startsWith("|") || /^[-*]\s/.test(text)) {
			if (out.length > 0) break;
			continue;
		}
		out.push(text);
	}
	return out.join(" ");
}

/** Every pipe table in these lines, as rows of cells; the `---` alignment rule is not a row. */
function pipeTables(lines: string[] | undefined): string[][][] {
	const tables: string[][][] = [];
	let rows: string[][] | null = null;
	for (const line of lines ?? []) {
		const text = line.trim();
		if (!text.startsWith("|")) {
			rows = null;
			continue;
		}
		const cells = text
			.replace(/^\||\|$/g, "")
			.split("|")
			.map(c => plainText(c));
		if (cells.every(c => /^:?-+:?$/.test(c))) continue;
		if (rows === null) {
			rows = [];
			tables.push(rows);
		}
		rows.push(cells);
	}
	return tables;
}

/** The dimension rows of a `| Dimension | Definition |` table: its header row is not a dimension. */
function dimensionRows(tables: string[][][]): Record<string, string> {
	for (const rows of tables) {
		const out: Record<string, string> = {};
		for (const cells of rows.slice(1)) {
			if (cells.length < 2 || cells[0] === "") continue;
			out[cells[0].toLowerCase()] = cells.slice(1).join(" | ");
		}
		if (Object.keys(out).length > 0) return out;
	}
	return {};
}

/**
 * The shape /scope writes: `| Criterion | Include | Exclude |`, one row per criterion. Each row
 * contributes one inclusion and one exclusion entry, labelled by its criterion so the exclusion
 * reads as a reason in the picker ("Population: Single-agent LLM systems; non-LLM agents").
 */
function criteriaTable(tables: string[][][]): { inclusion: string[]; exclusion: string[] } | null {
	for (const rows of tables) {
		const header = (rows[0] ?? []).map(c => c.toLowerCase());
		const columns = {
			inclusion: header.findIndex(c => c.startsWith("inclu")),
			exclusion: header.findIndex(c => c.startsWith("exclu")),
		};
		if (columns.inclusion < 0 || columns.exclusion < 0) continue;
		const label = header.findIndex((_, i) => i !== columns.inclusion && i !== columns.exclusion);
		const out: { inclusion: string[]; exclusion: string[] } = { inclusion: [], exclusion: [] };
		for (const cells of rows.slice(1)) {
			const name = label < 0 ? "" : (cells[label] ?? "");
			for (const key of ["inclusion", "exclusion"] as const) {
				const text = cells[columns[key]] ?? "";
				if (text === "" || text === "-" || text === "—") continue;
				out[key].push(name === "" ? text : `${name}: ${text}`);
			}
		}
		if (out.inclusion.length > 0 || out.exclusion.length > 0) return out;
	}
	return null;
}

/** The PCC/PICO dimension names, for a scope that states them as plain bullets instead of a table. */
const DIMENSION =
	/^(population|participants|concept|context|intervention|comparator|comparison|outcomes?|setting|exposure)$/;

export function parseScope(markdown: string): Criteria {
	if (markdown.trim() === "") return { ...EMPTY };
	const sections = sectionsOf(markdown);
	const all = markdown.split("\n");

	let question = "";
	for (const [heading, lines] of sections) {
		if (!/\bquestion\b/.test(heading)) continue;
		question = paragraph(lines);
		if (question !== "") break;
	}
	// A hand-written scope states it as one line: "Question: ..." / "Research question: ...".
	if (question === "")
		for (const line of all) {
			const stated = /^(?:[-*]\s+)?(?:\p{L}+\s+)?question\s*:\s*(.+)$/iu.exec(plainText(line));
			if (stated !== null) {
				question = stated[1].trim();
				break;
			}
		}

	let pcc: Record<string, string> = {};
	for (const [heading, lines] of sections) {
		if (!/\b(pcc|picos?|framework)\b/.test(heading)) continue;
		pcc = dimensionRows(pipeTables(lines));
		if (Object.keys(pcc).length > 0) break;
	}
	if (Object.keys(pcc).length === 0)
		for (const bullet of bullets(all)) {
			const row = /^([^:]+):\s*(.+)$/.exec(bullet);
			if (row !== null && DIMENSION.test(row[1].toLowerCase().trim()))
				pcc[row[1].toLowerCase().trim()] = row[2].trim();
		}

	const table = criteriaTable(pipeTables(all));
	const inclusion = sectionBullets(sections, /^inclusion/);
	const exclusion = sectionBullets(sections, /^exclusion/);
	return {
		question,
		pcc,
		inclusion: inclusion.length > 0 ? inclusion : (table?.inclusion ?? []),
		exclusion: exclusion.length > 0 ? exclusion : (table?.exclusion ?? []),
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
 * read backwards, so `llms` is not offered as an exclusion for a review about LLM systems. A
 * compound counts as its spaced spelling too: one scope writes "social science" in its PCC and
 * "social-science" in an exclusion cell, and both name the same subject.
 */
function marksSubject(term: string, subject: string): boolean {
	const hits = (t: string) =>
		t.length >= 3 && markTerms(subject, { include: [], exclude: [t] }).some(seg => seg.kind !== null);
	const spellings = term.includes("-") ? [term, term.replace(/-/g, " ")] : [term];
	return spellings.some(t => hits(t) || hits(t.replace(/(es|s)$/, "")));
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
