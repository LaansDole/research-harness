import { BookOpen, ChevronDown, ChevronUp, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { RecordRow, ReviewState } from "../../data";
import { problemClass, useFetch } from "../api";
import { EmptyState } from "./EmptyState";
import "./views.css";

/** Human labels in review.py STATES order (the chip order). */
const LABELS: Record<ReviewState, string> = {
	identified: "Not screened",
	duplicate: "Duplicate",
	screened_excluded: "Excluded · T/A",
	screened_included: "Passed T/A",
	fulltext_sought: "Full text sought",
	fulltext_retrieved: "Full text ready",
	fulltext_not_retrieved: "Full text not found",
	fulltext_excluded: "Excluded · full text",
	included: "Included",
};
const STATES = Object.keys(LABELS) as ReviewState[];
/** Below this the details are a full-screen modal sheet instead of a side panel (matches views.css). */
const NARROW = "(max-width: 899px)";

/** Unpaywall/OpenAlex oa_status in plain words. */
const OA: Record<string, string> = {
	gold: "Open access (publisher)",
	diamond: "Open access (publisher, no fees)",
	hybrid: "Open access article in a subscription journal",
	green: "Open access (repository copy)",
	bronze: "Free to read on the publisher site, no licence",
	closed: "Paywalled: no open copy known",
};

/** States where a missing full text blocks the next screening step. */
const NEEDS_FULLTEXT: Partial<Record<ReviewState, true>> = {
	screened_included: true,
	fulltext_sought: true,
	fulltext_not_retrieved: true,
	fulltext_retrieved: true,
};

function tone(state: ReviewState): string {
	if (state === "included") return "ok";
	if (state.endsWith("_excluded")) return "err";
	return state === "duplicate" ? "muted" : "accent";
}

/** Prefill actions for one record, most relevant first (the row shows the first). */
function actions(r: RecordRow, slug: string): { label: string; prompt: string }[] {
	const out: { label: string; prompt: string }[] = [];
	if (r.state === "identified")
		out.push({ label: "Screen", prompt: `Screen record ${r.id} ("${r.title}") in project ${slug}` });
	if (!r.has_pdf && NEEDS_FULLTEXT[r.state])
		out.push({ label: "Retry PDF", prompt: `Retry full-text retrieval for record ${r.id} in project ${slug}` });
	if (r.state.endsWith("_excluded"))
		out.push({
			label: "Ask agent to reconsider",
			prompt: `Reconsider the exclusion of record ${r.id} ("${r.title}") in project ${slug}; recorded reason: ${r.exclusion_reason ?? r.ft_rationale ?? r.ta_rationale ?? "none"}`,
		});
	const verdict = r.ft_verdict ?? r.ta_verdict;
	if (verdict !== null && r.state !== "identified" && r.state !== "duplicate")
		out.push({
			label: "Re-screen",
			prompt: `Re-screen record ${r.id} in project ${slug}; current verdict: ${verdict}`,
		});
	return out;
}

export function RecordsView({
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
	const base = `/api/projects/${encodeURIComponent(slug)}`;
	// ponytail: one fetch, client-side filtering; server ?state= filtering if a project reaches thousands of rows.
	const records = useFetch<RecordRow[]>(`${base}/records`, tick);
	const [state, setState] = useState<ReviewState | "">("");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const restoreFocus = useRef(false);
	const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
	useEffect(() => {
		const mq = window.matchMedia(NARROW);
		const onChange = (): void => setNarrow(mq.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	// A different project starts fresh: its filter and selection mean nothing here.
	useEffect(() => {
		setState("");
		setQuery("");
		setSelectedId(null);
		setOpen(false);
	}, [slug]);

	// Mobile: a native modal dialog, so everything behind the sheet is inert and Tab stays inside it.
	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog !== null && !dialog.open) dialog.showModal();
	});

	// Back on the row after closing; deferred because the row is inert while the modal sheet is still up.
	useEffect(() => {
		if (open || !restoreFocus.current) return;
		restoreFocus.current = false;
		tbodyRef.current?.querySelector<HTMLElement>("tr[aria-selected='true']")?.focus();
	}, [open]);

	if ((records.error && records.empty) || records.data?.length === 0)
		return (
			<EmptyState
				icon={BookOpen}
				title="No papers yet"
				body="Search the databases or import an export to start the reading list."
				actions={[
					{ label: "Find papers", prompt: active ? "/find " : `Find candidate papers for project ${slug}` },
					{
						label: "Import exports",
						prompt: active ? "/import " : `Import reference exports into project ${slug}: `,
					},
				]}
				prefill={prefill}
			/>
		);
	if (records.error) return <p className={problemClass(records)}>{records.error}</p>;
	if (records.data === null) return <p className="rw-faint">Loading reading list…</p>;

	const all = records.data;
	const counts: Partial<Record<ReviewState, number>> = {};
	for (const r of all) counts[r.state] = (counts[r.state] ?? 0) + 1;
	const q = query.trim().toLowerCase();
	const shown = all.filter(
		r =>
			(state === "" || r.state === state) &&
			(q === "" || [r.title, r.authors, r.id, r.doi, r.venue].some(v => v?.toLowerCase().includes(q))),
	);
	const selectedIndex = shown.findIndex(r => r.id === selectedId);
	const selected = open ? shown[selectedIndex] : undefined;
	// The open record was filtered out: close rather than pop back open when the filter changes again.
	if (open && selected === undefined) setOpen(false);
	const chips: (ReviewState | "")[] = ["", ...STATES.filter(s => counts[s])];

	const n = (s: ReviewState): number => counts[s] ?? 0;
	const step = [
		{
			count: n("identified"),
			text: "not screened",
			label: "Screen them",
			slash: "/screen",
			prose: "Screen the unscreened records",
		},
		{
			count: n("fulltext_retrieved"),
			text: n("fulltext_retrieved") === 1 ? "full text ready" : "full texts ready",
			label: "Screen full texts",
			slash: "/screen full-text",
			prose: "Screen the retrieved full texts",
		},
		{
			count: n("screened_included") + n("fulltext_sought"),
			text: "awaiting full text",
			label: "Retrieve full texts",
			slash: "/fulltext",
			prose: "Retrieve full texts for the screened-in records",
		},
		{
			count: n("included"),
			text: "included",
			label: "Write review",
			slash: "/review",
			prose: "Write the literature review",
		},
	].find(s => s.count > 0);

	const select = (i: number): void => {
		const r = shown[i];
		if (r === undefined) return;
		setSelectedId(r.id);
		(tbodyRef.current?.children[i] as HTMLElement | undefined)?.focus();
	};
	const close = (): void => {
		restoreFocus.current = true;
		setOpen(false);
	};
	const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, i: number): void => {
		if (e.target !== e.currentTarget) return; // keys on the row's own buttons stay theirs
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			select(Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
		} else if (e.key === "Enter") {
			setSelectedId(shown[i]?.id ?? null);
			setOpen(true);
		}
	};
	const onChipKey = (e: KeyboardEvent<HTMLDivElement>): void => {
		const dir =
			e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
		if (dir === 0) return;
		e.preventDefault();
		const next = (chips.indexOf(state) + dir + chips.length) % chips.length;
		setState(chips[next] ?? "");
		(e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
	};
	// The roving tab stop: the selected row, else the first.
	const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

	const details = selected && (
		<>
			<div className="rw-drawer-head">
				<span className={`rw-badge rw-badge-${tone(selected.state)}`}>{LABELS[selected.state]}</span>
				<span className="rw-drawer-nav">
					<button
						type="button"
						className="rw-icon"
						aria-label="Previous record"
						disabled={selectedIndex === 0}
						onClick={() => select(selectedIndex - 1)}
					>
						<ChevronUp size={16} />
					</button>
					<button
						type="button"
						className="rw-icon"
						aria-label="Next record"
						disabled={selectedIndex === shown.length - 1}
						onClick={() => select(selectedIndex + 1)}
					>
						<ChevronDown size={16} />
					</button>
					<button type="button" className="rw-icon" aria-label="Close details" onClick={close}>
						<X size={16} />
					</button>
				</span>
			</div>
			<h2 id="rw-drawer-title">{selected.title}</h2>
			<p className="rw-faint">{[selected.authors, selected.year, selected.venue].filter(Boolean).join(" · ")}</p>
			{selected.doi && (
				<p>
					DOI{" "}
					<a href={`https://doi.org/${selected.doi}`} target="_blank" rel="noopener">
						{selected.doi}
					</a>
				</p>
			)}
			{selected.url && /^https?:\/\//i.test(selected.url) && (
				<p className="rw-break">
					<a href={selected.url} target="_blank" rel="noopener">
						{selected.url}
					</a>
				</p>
			)}
			<div className="rw-drawer-actions">
				{selected.has_pdf ? (
					<a
						className="rw-button"
						href={`${base}/pdf/${encodeURIComponent(selected.id)}`}
						target="_blank"
						rel="noopener"
					>
						Open PDF
					</a>
				) : (
					<span className="rw-faint">
						{selected.oa_status ? (OA[selected.oa_status] ?? selected.oa_status) : "No PDF downloaded"}
					</span>
				)}
				{actions(selected, slug).map(a => (
					<button key={a.label} type="button" onClick={() => prefill(a.prompt)}>
						{a.label}
					</button>
				))}
			</div>
			<dl>
				{selected.ta_verdict && (
					<>
						<dt>Title/abstract verdict: {selected.ta_verdict}</dt>
						<dd>{selected.ta_rationale ?? "No rationale recorded."}</dd>
					</>
				)}
				{selected.ft_verdict && (
					<>
						<dt>Full-text verdict: {selected.ft_verdict}</dt>
						<dd>{selected.ft_rationale ?? "No rationale recorded."}</dd>
					</>
				)}
				{selected.exclusion_reason &&
					selected.exclusion_reason !== selected.ta_rationale &&
					selected.exclusion_reason !== selected.ft_rationale && (
						<>
							<dt>{selected.state.endsWith("_excluded") ? "Exclusion reason" : "Note"}</dt>
							<dd>{selected.exclusion_reason}</dd>
						</>
					)}
				<dt>Abstract</dt>
				<dd>{selected.abstract || "No abstract recorded."}</dd>
			</dl>
		</>
	);

	return (
		<div
			className="rw-records"
			onKeyDown={e => {
				if (e.key === "Escape" && open) {
					e.preventDefault();
					close();
				}
			}}
		>
			{step && (
				<div className="rw-next">
					<span>
						{step.count} {step.text}
					</span>
					<button type="button" onClick={() => prefill(active ? step.slash : `${step.prose} in project ${slug}`)}>
						{step.label}
					</button>
				</div>
			)}
			<div className="rw-toolbar">
				<div className="rw-chips" role="radiogroup" aria-label="Filter by state" onKeyDown={onChipKey}>
					{chips.map(s => (
						<button
							key={s || "all"}
							type="button"
							role="radio"
							aria-checked={state === s}
							tabIndex={state === s ? 0 : -1}
							onClick={() => setState(s)}
						>
							{s === "" ? "All" : LABELS[s]}{" "}
							<span className="rw-count">{s === "" ? all.length : counts[s]}</span>
						</button>
					))}
				</div>
				<input
					type="search"
					className="rw-search"
					placeholder="Search title, author, DOI"
					aria-label="Search records"
					value={query}
					onChange={e => setQuery(e.target.value)}
				/>
				<span className="rw-faint" role="status">
					{shown.length} of {all.length} records
				</span>
			</div>
			<div className="rw-records-body">
				<div className="rw-records-list">
					<table className="rw-table" role="grid" aria-label="Reading list">
						<thead>
							<tr>
								<th>Record</th>
								<th>State</th>
								<th className="rw-wide">PDF</th>
								<th className="rw-wide">
									<span className="rw-sr">Action</span>
								</th>
							</tr>
						</thead>
						<tbody ref={tbodyRef}>
							{shown.map((r, i) => {
								const primary = actions(r, slug)[0];
								return (
									<tr
										key={r.id}
										tabIndex={i === tabStop ? 0 : -1}
										aria-selected={r.id === selectedId}
										onClick={e => {
											if ((e.target as Element).closest("a, button")) return;
											setSelectedId(r.id);
											setOpen(true);
										}}
										onFocus={e => {
											if (e.target === e.currentTarget) setSelectedId(r.id);
										}}
										onKeyDown={e => onRowKey(e, i)}
									>
										<td>
											<div className="rw-title">{r.title}</div>
											<div className="rw-faint">
												{[r.authors, r.year, r.venue].filter(Boolean).join(" · ")}
											</div>
										</td>
										<td>
											<span className={`rw-badge rw-badge-${tone(r.state)}`}>{LABELS[r.state]}</span>
										</td>
										<td className="rw-wide">
											{r.has_pdf ? (
												<a
													className="rw-button"
													tabIndex={-1}
													href={`${base}/pdf/${encodeURIComponent(r.id)}`}
													target="_blank"
													rel="noopener"
												>
													Open PDF
												</a>
											) : (
												<span className="rw-faint">
													{r.oa_status ? (OA[r.oa_status] ?? r.oa_status) : "No PDF"}
												</span>
											)}
										</td>
										<td className="rw-wide rw-row-actions">
											{primary && (
												<button type="button" tabIndex={-1} onClick={() => prefill(primary.prompt)}>
													{primary.label}
												</button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{shown.length === 0 && <p className="rw-faint rw-pad">No records match this filter.</p>}
				</div>
				{selected &&
					(narrow ? (
						<dialog
							ref={dialogRef}
							className="rw-drawer"
							aria-labelledby="rw-drawer-title"
							onCancel={e => {
								e.preventDefault();
								close();
							}}
						>
							{details}
						</dialog>
					) : (
						<aside className="rw-drawer" aria-label="Record details">
							{details}
						</aside>
					))}
			</div>
		</div>
	);
}
