/**
 * The project's screening criteria, read from `scope.md` (written by /scope).
 * Pure text in, pure data out: no filesystem, no bun APIs, so the client can import it too.
 */

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
	 applied apply task tasks work works etc`.split(/\s+/)) {
	if (word !== "") STOPWORDS[word] = true;
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

function terms(texts: readonly string[], seen: Set<string>): string[] {
	const out: string[] = [];
	for (const text of texts) {
		for (const [word] of text.matchAll(WORD_RE)) {
			const term = word.toLowerCase().replace(/^['’-]+|['’-]+$/g, "");
			if (term.length < 4 || STOPWORDS[term] === true || seen.has(term)) continue;
			seen.add(term);
			out.push(term);
		}
	}
	return out;
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
	const include = terms([...Object.values(criteria.pcc), ...criteria.inclusion, criteria.question], seen).slice(
		0,
		SUGGEST_LIMIT,
	);
	// Words already suggested as include words are not offered again: one word, one meaning.
	for (const word of include) seen.add(word);
	return { include, exclude: terms(criteria.exclusion, seen).slice(0, SUGGEST_LIMIT) };
}
