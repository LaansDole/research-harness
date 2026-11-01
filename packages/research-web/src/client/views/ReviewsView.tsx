import { Markdown } from "@oh-my-pi/collab-web/src/components/transcript/Markdown";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewFile } from "../../data";
import { problemClass, relativeTime, useFetch } from "../api";
import { EmptyState } from "./EmptyState";
import "./views.css";

interface Section {
	heading: string | null;
	/** Markdown after the `## ` heading line (the heading itself is rendered next to its Revise button). */
	body: string;
}

const REFERENCES_RE = /references|bibliography/i;
/** `doi:10.x/…` or a bare `10.x/…` not already inside a URL or link. */
const DOI_RE = /(?<![\w/.([-])(?:doi:\s*)?(10\.\d{4,9}\/[^\s)\]>]*[^\s)\].,;>])/gi;

/** Split at `## ` headings; `[n]` citations become `#ref-n` links; reference DOIs link to doi.org. */
function sections(markdown: string): Section[] {
	const linked = markdown.replace(/\[(\d+)\](?![(:[])/g, "[[$1]](#ref-$1)");
	return linked.split(/^(?=## )/m).map(text => {
		if (!text.startsWith("## ")) return { heading: null, body: text };
		const newline = text.indexOf("\n");
		const heading = text.slice(3, newline === -1 ? undefined : newline).trim();
		const body = newline === -1 ? "" : text.slice(newline + 1);
		return {
			heading,
			body: REFERENCES_RE.test(heading) ? body.replace(DOI_RE, "[$&](https://doi.org/$1)") : body,
		};
	});
}

/** The claim the researcher asked about keeps a tint while the note is up; browsers without the
 * Custom Highlight API simply show no tint. */
const CLAIM_HIGHLIGHT = "rw-claim";
function tintClaim(range: Range | null): void {
	const highlights = CSS.highlights as HighlightRegistry | undefined;
	if (highlights === undefined) return;
	if (range === null) highlights.delete(CLAIM_HIGHLIGHT);
	else highlights.set(CLAIM_HIGHLIGHT, new Highlight(range));
}

/** A margin note: the Check claim action for the current selection, beside the line it starts on. */
interface MarginNote {
	/** Offset of the selection's first line from the top of the review body, in px. */
	top: number;
	text: string;
	/** The request is in the message box; the researcher still has to send it. */
	sent: boolean;
}

export function ReviewsView({
	slug,
	active,
	tick,
	prefill,
}: {
	slug: string;
	/** Whether `slug` is the agent's active project: slash commands only target that one. */
	active: boolean;
	tick: number;
	prefill(text: string): void;
}): ReactNode {
	const list = useFetch<ReviewFile[]>(`/api/projects/${encodeURIComponent(slug)}/reviews`, tick);
	const [picked, setPicked] = useState<string | null>(null);
	const file = list.data?.some(r => r.file === picked) ? picked : (list.data?.[0]?.file ?? null);
	const review = useFetch<string>(
		file === null ? null : `/api/projects/${encodeURIComponent(slug)}/reviews/${encodeURIComponent(file)}`,
		tick,
		"text",
	);
	const parts = useMemo(() => sections(review.data ?? ""), [review.data]);
	const bodyRef = useRef<HTMLDivElement | null>(null);
	const layoutRef = useRef<HTMLDivElement | null>(null);
	const claimRange = useRef<Range | null>(null);
	const [selection, setSelection] = useState("");
	const [note, setNote] = useState<MarginNote | null>(null);

	// Number the reference list (n-th item under the last references heading → #ref-n),
	// and give every citation its reference text as a native hover preview.
	useEffect(() => {
		const root = bodyRef.current;
		if (root === null) return;
		const heading = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")]
			.filter(h => REFERENCES_RE.test(h.textContent ?? ""))
			.at(-1);
		const scope = heading?.closest("section");
		if (heading === undefined || !scope) return;
		const refList = [...scope.querySelectorAll("ol, ul")].find(
			l => heading.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING,
		);
		if (refList === undefined) return;
		[...refList.children].forEach((li, i) => {
			li.id = `ref-${i + 1}`;
		});
		for (const a of root.querySelectorAll("a[href^='#ref-']")) {
			const ref = root.querySelector(a.getAttribute("href") ?? "");
			if (ref === null) continue;
			a.setAttribute("title", ref.textContent ?? "");
			a.setAttribute("aria-describedby", ref.id);
			a.removeAttribute("target");
		}
	}, [parts]);

	// selectionchange also sees keyboard (Shift+Arrow) selections; only text inside the review counts.
	useEffect(() => {
		const onChange = (): void => {
			const sel = window.getSelection();
			const root = bodyRef.current;
			if (sel === null || root === null) return;
			if (sel.isCollapsed) {
				// Pressing the Check claim button may collapse the selection; keep the claim until then.
				if (!(document.activeElement as Element | null)?.closest(".rw-reviews .rw-toolbar, .rw-margin-note")) {
					setSelection("");
					// A note whose request is already in the message box stays until the file changes.
					setNote(previous => (previous?.sent === true ? previous : null));
				}
				return;
			}
			if (!root.contains(sel.anchorNode)) return;
			const text = sel.toString().trim();
			setSelection(text);
			const range = sel.getRangeAt(0);
			claimRange.current = range.cloneRange();
			const layout = layoutRef.current;
			if (layout !== null && text !== "") {
				// Both rects are viewport-relative, so the offset holds however far the panel is scrolled.
				setNote({ top: range.getBoundingClientRect().top - layout.getBoundingClientRect().top, text, sent: false });
			}
		};
		document.addEventListener("selectionchange", onChange);
		return () => document.removeEventListener("selectionchange", onChange);
	}, []);

	// A different review file is a different document: its claim note and tint mean nothing here.
	useEffect(() => {
		setNote(null);
		setSelection("");
		claimRange.current = null;
		tintClaim(null);
	}, [file]);

	// Leaving the view (or the whole app) must not leave a tinted sentence behind.
	useEffect(() => () => tintClaim(null), []);

	if (list.error) return <p className={problemClass(list)}>{list.error}</p>;
	if (list.data === null) return <p className="rw-faint">Loading reviews…</p>;
	if (list.data.length === 0 || file === null)
		return (
			<EmptyState
				icon={FileText}
				title="No review yet"
				body="Once papers are included, the agent can write a cited literature review here."
				actions={[
					{
						label: "Write review",
						prompt: active ? "/review" : `Write the literature review for project ${slug}`,
					},
				]}
				prefill={prefill}
			/>
		);

	const toc = parts.flatMap((p, i) => (p.heading === null ? [] : [{ heading: p.heading, i }]));
	const tocLinks = toc.map(t => (
		<li key={t.i}>
			<a
				href={`#rw-sec-${t.i}`}
				onClick={e => {
					e.preventDefault();
					document.getElementById(`rw-sec-${t.i}`)?.scrollIntoView({ behavior: "smooth" });
				}}
			>
				{t.heading}
			</a>
		</li>
	));

	// One route for both the toolbar button and the margin note: the same request, word for word.
	const checkClaim = (text: string): void => {
		prefill(`Check this claim in ${file} (project ${slug}) against the cited papers: "${text}"`);
		setNote(previous => (previous === null ? null : { ...previous, sent: true }));
		tintClaim(claimRange.current);
	};

	return (
		<div className="rw-reviews">
			<div className="rw-toolbar">
				<select aria-label="Review file" value={file} onChange={e => setPicked(e.target.value)}>
					{list.data.map(r => (
						<option key={r.file} value={r.file}>
							{r.file} · {relativeTime(r.mtime)}
						</option>
					))}
				</select>
				<button
					type="button"
					className="rw-check-claim"
					disabled={selection === ""}
					onClick={() => checkClaim(selection)}
				>
					Check claim
				</button>
				{selection === "" && <span className="rw-faint">Select a sentence first</span>}
			</div>
			{review.error && <p className={problemClass(review)}>{review.error}</p>}
			{review.data === null && !review.error && <p className="rw-faint">Loading review…</p>}
			{toc.length > 0 && (
				<details className="rw-toc-mobile">
					<summary>Contents</summary>
					<ol>{tocLinks}</ol>
				</details>
			)}
			<div className="rw-reviews-body" ref={layoutRef}>
				{toc.length > 0 && (
					<nav className="rw-toc" aria-label="Contents">
						<ol>{tocLinks}</ol>
					</nav>
				)}
				{/* Citations are plain #ref-n links: :target highlights the reference, browser Back returns. */}
				<div ref={bodyRef} className="rw-doc">
					{parts.map((part, i) => (
						<section key={i} id={part.heading === null ? undefined : `rw-sec-${i}`}>
							{part.heading !== null && (
								<div className="rw-doc-head">
									<h2>{part.heading}</h2>
									{!REFERENCES_RE.test(part.heading) && (
										<span className="rw-revise">
											<button
												type="button"
												onClick={() =>
													prefill(`Revise the section "${part.heading}" in ${file} of project ${slug}`)
												}
											>
												Revise
											</button>
											{/* The keyboard route to claim checking: no text selection needed. */}
											<button
												type="button"
												onClick={() =>
													prefill(
														`Check the claims in section "${part.heading}" of ${file} (project ${slug}) against the cited papers`,
													)
												}
											>
												Check
											</button>
										</span>
									)}
								</div>
							)}
							<Markdown text={part.body} />
						</section>
					))}
				</div>
				{/* The margin: wide screens only (views.css), where the review column leaves room for it. */}
				<div className="rw-margin">
					{note !== null && (
						<aside className="rw-margin-note" style={{ top: `${Math.max(0, note.top)}px` }}>
							<p className="rw-margin-quote">
								“{note.text.length > 80 ? `${note.text.slice(0, 80).trimEnd()}…` : note.text}”
							</p>
							{note.sent ? (
								<p className="rw-faint">In the message box - send it to ask the agent</p>
							) : (
								<button type="button" onClick={() => checkClaim(note.text)}>
									Check claim
								</button>
							)}
						</aside>
					)}
				</div>
			</div>
		</div>
	);
}
