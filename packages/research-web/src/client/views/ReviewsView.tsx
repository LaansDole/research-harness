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
	const [selection, setSelection] = useState("");

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
				if (!(document.activeElement as Element | null)?.closest(".rw-reviews .rw-toolbar")) setSelection("");
				return;
			}
			if (root.contains(sel.anchorNode)) setSelection(sel.toString().trim());
		};
		document.addEventListener("selectionchange", onChange);
		return () => document.removeEventListener("selectionchange", onChange);
	}, []);

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
					disabled={selection === ""}
					onClick={() =>
						prefill(`Check this claim in ${file} (project ${slug}) against the cited papers: "${selection}"`)
					}
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
			<div className="rw-reviews-body">
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
			</div>
		</div>
	);
}
