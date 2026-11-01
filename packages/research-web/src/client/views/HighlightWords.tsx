import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { type Criteria, suggestTerms } from "../../criteria";
import type { Highlights } from "../../data";
import { markTerms } from "../../highlight";
import { sendJson } from "../api";
import "./views.css";

export const NO_WORDS: Highlights = { include: [], exclude: [] };

/**
 * A title or abstract with the project's highlight words marked.
 * ponytail: segmented on every render; memoised per text, which is all a 50-row list needs.
 */
export function Marked({ text, words }: { text: string; words: Highlights }): ReactNode {
	const segments = useMemo(() => markTerms(text, words), [text, words]);
	return (
		<>
			{segments.map((s, i) =>
				s.kind === null ? (
					s.text
				) : (
					<mark key={i} className={`rw-hl rw-hl-${s.kind}`}>
						{s.text}
					</mark>
				),
			)}
		</>
	);
}

/** Whether any highlight word appears in `text` (the legend only shows where there are marks). */
export function hasMarks(text: string, words: Highlights): boolean {
	return markTerms(text, words).some(s => s.kind !== null);
}

export function HighlightLegend(): ReactNode {
	return (
		<p className="rw-hl-legend">
			<mark className="rw-hl rw-hl-include">green</mark> = include words,{" "}
			<mark className="rw-hl rw-hl-exclude">vermilion underlined</mark> = exclude words
		</p>
	);
}

type ListName = "include" | "exclude";
const LIST_LABEL: Record<ListName, string> = { include: "Include words", exclude: "Exclude words" };

/** The editor behind the toolbar's "Highlight words" button: two lists the researcher keeps. */
export function HighlightWords({
	slug,
	words,
	criteria,
	onSaved,
	onClose,
}: {
	slug: string;
	words: Highlights;
	criteria: Criteria | null;
	onSaved(words: Highlights): void;
	onClose(): void;
}): ReactNode {
	const [draft, setDraft] = useState<Highlights>({ include: [...words.include], exclude: [...words.exclude] });
	const [typed, setTyped] = useState<Record<ListName, string>>({ include: "", exclude: "" });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const add = (list: ListName, raw: string): void => {
		const term = raw.trim().replace(/\s+/g, " ");
		setTyped(prev => ({ ...prev, [list]: "" }));
		if (term === "" || draft[list].some(w => w.toLowerCase() === term.toLowerCase())) return;
		setDraft(prev => ({ ...prev, [list]: [...prev[list], term] }));
	};

	const suggest = (): void => {
		if (criteria === null) return;
		const suggested = suggestTerms(criteria);
		setDraft(prev => ({
			include: merge(prev.include, suggested.include),
			exclude: merge(prev.exclude, suggested.exclude),
		}));
	};

	const save = async (): Promise<void> => {
		setBusy(true);
		setError(null);
		try {
			const saved = await sendJson<Highlights>(`/api/projects/${encodeURIComponent(slug)}/highlights`, "PUT", draft);
			onSaved(saved);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Those words couldn't be saved.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			className="rw-words"
			onKeyDown={e => {
				if (e.key !== "Escape") return;
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}}
		>
			{draft.include.length === 0 && draft.exclude.length === 0 && (
				<p className="rw-faint">Add words to highlight them in titles and abstracts.</p>
			)}
			{(["include", "exclude"] as ListName[]).map(list => (
				<div key={list} className="rw-words-row">
					<span className="rw-words-label">{LIST_LABEL[list]}</span>
					<div className="rw-words-chips">
						{draft[list].map(word => (
							<span key={word} className={`rw-word rw-hl-${list}`}>
								{word}
								<button
									type="button"
									className="rw-icon"
									aria-label={`Remove ${word}`}
									onClick={() => setDraft(prev => ({ ...prev, [list]: prev[list].filter(w => w !== word) }))}
								>
									<X size={12} />
								</button>
							</span>
						))}
						<input
							type="text"
							aria-label={`Add an ${list} word`}
							placeholder="Add a word, then Enter"
							maxLength={60}
							value={typed[list]}
							onChange={e => setTyped(prev => ({ ...prev, [list]: e.target.value }))}
							onBlur={e => add(list, e.target.value)}
							onKeyDown={e => {
								if (e.key !== "Enter") return;
								e.preventDefault();
								add(list, typed[list]);
							}}
						/>
					</div>
				</div>
			))}
			<div className="rw-words-actions">
				<button type="button" disabled={criteria === null} onClick={suggest}>
					Suggest from your criteria
				</button>
				<button type="button" disabled={busy} onClick={() => void save()}>
					Save
				</button>
				<button type="button" onClick={onClose}>
					Cancel
				</button>
				{error !== null && <span className="rw-error">{error}</span>}
			</div>
		</div>
	);
}

/** Keeps what the researcher already has and appends the new suggestions, case-insensitively. */
function merge(kept: string[], suggested: string[]): string[] {
	const seen = new Set(kept.map(w => w.toLowerCase()));
	return [...kept, ...suggested.filter(w => !seen.has(w.toLowerCase()))];
}
