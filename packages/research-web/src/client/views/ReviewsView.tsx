import { Markdown } from "@oh-my-pi/collab-web/src/components/transcript/Markdown";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewFile } from "../../data";
import { problemClass, useFetch } from "../api";

interface Section {
	heading: string | null;
	text: string;
}

/** Split at `## ` headings; `[n]` citations become `#ref-n` links resolved on click. */
function sections(markdown: string): Section[] {
	const linked = markdown.replace(/\[(\d+)\](?![(:[])/g, "[[$1]](#ref-$1)");
	return linked.split(/^(?=## )/m).map(text => ({
		heading: text.startsWith("## ") ? (text.slice(3).split("\n", 1)[0] ?? "").trim() : null,
		text,
	}));
}

export function ReviewsView({
	slug,
	tick,
	prefill,
}: {
	slug: string;
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

	// Number the reference list: n-th item under the last references/bibliography heading → #ref-n.
	useEffect(() => {
		const root = bodyRef.current;
		if (root === null) return;
		const headings = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(h =>
			/references|bibliography/i.test(h.textContent ?? ""),
		);
		let node = headings.at(-1)?.nextElementSibling ?? null;
		while (node !== null && node.tagName !== "OL" && node.tagName !== "UL") node = node.nextElementSibling;
		if (node === null) return;
		[...node.children].forEach((li, i) => {
			li.id = `ref-${i + 1}`;
		});
	}, [parts]);

	if (list.error) return <p className={problemClass(list)}>{list.error}</p>;
	if (list.data === null) return <p className="rw-faint">loading…</p>;
	if (list.data.length === 0 || file === null)
		return (
			<p className="rw-notice">No literature review written for this project yet. Ask the agent to run /review.</p>
		);

	return (
		<div className="rw-reviews">
			<div className="rw-toolbar">
				<select value={file} onChange={e => setPicked(e.target.value)}>
					{list.data.map(r => (
						<option key={r.file} value={r.file}>
							{r.file}
						</option>
					))}
				</select>
				{selection !== "" && (
					<button
						type="button"
						onClick={() =>
							prefill(`Check this claim in ${file} (project ${slug}) against the cited papers: "${selection}"`)
						}
					>
						Check claim
					</button>
				)}
			</div>
			{review.error && <p className={problemClass(review)}>{review.error}</p>}
			<div
				ref={bodyRef}
				className="rw-doc"
				onMouseUp={() => setSelection(window.getSelection()?.toString().trim() ?? "")}
				onClick={e => {
					const link = (e.target as Element).closest("a[href^='#ref-']");
					if (link === null) return;
					e.preventDefault();
					bodyRef.current?.querySelector(link.getAttribute("href") ?? "")?.scrollIntoView({ behavior: "smooth" });
				}}
			>
				{parts.map((part, i) => (
					<section key={i}>
						{part.heading !== null && (
							<button
								type="button"
								className="rw-revise"
								onClick={() => prefill(`Revise the section "${part.heading}" in ${file} of project ${slug}`)}
							>
								Revise
							</button>
						)}
						<Markdown text={part.text} />
					</section>
				))}
			</div>
		</div>
	);
}
