import type { ReactNode } from "react";
import { useState } from "react";
import type { RecordRow } from "../../data";
import { problemClass, useFetch } from "../api";

/** review.py STATES (the server validates the same list). */
const STATES = [
	"identified",
	"duplicate",
	"screened_excluded",
	"screened_included",
	"fulltext_sought",
	"fulltext_retrieved",
	"fulltext_not_retrieved",
	"fulltext_excluded",
	"included",
];

/** States where a missing full text blocks the next screening step. */
const NEEDS_FULLTEXT: Record<string, true> = {
	screened_included: true,
	fulltext_sought: true,
	fulltext_not_retrieved: true,
	fulltext_retrieved: true,
};

export function RecordsView({
	slug,
	tick,
	prefill,
}: {
	slug: string;
	tick: number;
	prefill(text: string): void;
}): ReactNode {
	const [state, setState] = useState("");
	const base = `/api/projects/${encodeURIComponent(slug)}`;
	const records = useFetch<RecordRow[]>(`${base}/records${state ? `?state=${state}` : ""}`, tick);

	return (
		<div className="rw-records">
			<div className="rw-toolbar">
				<select value={state} onChange={e => setState(e.target.value)}>
					<option value="">all states</option>
					{STATES.map(s => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
				{records.data && <span className="rw-faint">{records.data.length} records</span>}
			</div>
			{records.error && <p className={problemClass(records)}>{records.error}</p>}
			<table className="rw-table">
				<thead>
					<tr>
						<th>Record</th>
						<th>State</th>
						<th>PDF</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{records.data?.map(r => (
						<tr key={r.id}>
							<td>
								<div>{r.title}</div>
								<div className="rw-faint">{[r.id, r.authors, r.year, r.venue].filter(Boolean).join(" · ")}</div>
							</td>
							<td title={[r.ta_rationale, r.ft_rationale, r.exclusion_reason].filter(Boolean).join("\n")}>
								{r.state}
							</td>
							<td>
								{r.has_pdf ? (
									<a href={`${base}/pdf/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener">
										open
									</a>
								) : (
									<span className="rw-faint">{r.oa_status ?? "—"}</span>
								)}
							</td>
							<td className="rw-row-actions">
								{r.state !== "duplicate" && r.state !== "included" && (
									<button
										type="button"
										onClick={() => prefill(`Screen record ${r.id} ("${r.title}") in project ${slug}`)}
									>
										Screen
									</button>
								)}
								{!r.has_pdf && NEEDS_FULLTEXT[r.state] && (
									<button
										type="button"
										onClick={() => prefill(`Retry full-text retrieval for record ${r.id} in project ${slug}`)}
									>
										Retry PDF
									</button>
								)}
								{r.state.endsWith("_excluded") && (
									<button
										type="button"
										onClick={() => prefill(`Explain why record ${r.id} in project ${slug} was excluded`)}
									>
										Why excluded
									</button>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
