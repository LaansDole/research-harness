import type { Highlights } from "./data";

export type MarkKind = "include" | "exclude";

/** A run of the original text, marked as an include or exclude word or left plain. */
export interface Segment {
	text: string;
	kind: MarkKind | null;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Splits `text` into marked and plain runs for the project's highlight words.
 *
 * Whole-word and case-insensitive, with a plural allowance (`agent` lights up `agents`, but not
 * `agentic` unless that is listed too). Phrases match across any run of whitespace, the longest
 * match at a position wins, marks never nest, and the original characters are never rewritten.
 */
export function markTerms(text: string, highlights: Highlights): Segment[] {
	if (text === "") return [];
	const kinds = new Map<string, MarkKind>();
	for (const term of highlights.exclude) kinds.set(term.trim().toLowerCase().replace(/\s+/g, " "), "exclude");
	// An include word wins a tie: one word carries one meaning.
	for (const term of highlights.include) kinds.set(term.trim().toLowerCase().replace(/\s+/g, " "), "include");
	kinds.delete("");
	if (kinds.size === 0) return [{ text, kind: null }];

	const alternatives = [...kinds.keys()]
		.sort((a, b) => b.length - a.length)
		.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
	const re = new RegExp(`(?:${alternatives.join("|")})(?:es|s)?(?![\\p{L}\\p{N}])`, "giu");

	const out: Segment[] = [];
	let at = 0;
	for (let m = re.exec(text); m !== null; m = re.exec(text)) {
		// A match that starts inside a word is not a match; resume one character along.
		if (m.index > 0 && WORD_CHAR.test(text[m.index - 1])) {
			re.lastIndex = m.index + 1;
			continue;
		}
		const matched = m[0];
		// The trailing plural is not part of the term: look the core up without it.
		const core = matched.toLowerCase().replace(/\s+/g, " ");
		const kind = kinds.get(core) ?? kinds.get(core.replace(/(es|s)$/, ""));
		if (kind === undefined) {
			re.lastIndex = m.index + 1;
			continue;
		}
		if (m.index > at) out.push({ text: text.slice(at, m.index), kind: null });
		out.push({ text: matched, kind });
		at = m.index + matched.length;
	}
	if (at < text.length) out.push({ text: text.slice(at), kind: null });
	return out;
}
