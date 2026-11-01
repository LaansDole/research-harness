import { Check, CircleHelp, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { Criteria } from "../../criteria";
import type { RecordRow, ReviewState, Stage, VerdictRequest } from "../../data";
import { sendJson } from "../api";
import { VerdictMark } from "./VerdictMark";
import "./views.css";

/** The states review.py accepts a title/abstract verdict for (`cmd_verdict`, stage ta). */
const TA_STATES: Partial<Record<ReviewState, true>> = {
	identified: true,
	screened_excluded: true,
	screened_included: true,
};
/** The states it accepts a full-text verdict for (stage ft). */
const FT_STATES: Partial<Record<ReviewState, true>> = {
	screened_included: true,
	fulltext_sought: true,
	fulltext_retrieved: true,
	fulltext_excluded: true,
	included: true,
};
/** Where a paper can take no decision at all, and why. */
const NO_DECISION: Partial<Record<ReviewState, string>> = {
	duplicate: "Duplicate - merged into its survivor, so it takes no decision.",
	fulltext_not_retrieved: "No full text yet - find one before deciding at full text.",
};

const STAGE_LABEL: Record<Stage, string> = { ta: "Title/abstract", ft: "Full text" };

/** Written by this web UI rather than by an agent: the same prefix convention the screeners use. */
const MINE = "[researcher] ";

/** The stages a paper can be decided at right now, title/abstract first. */
export function stagesFor(state: ReviewState): Stage[] {
	const out: Stage[] = [];
	if (TA_STATES[state]) out.push("ta");
	if (FT_STATES[state]) out.push("ft");
	return out;
}

/** Whether this paper is still waiting for a decision at `stage` (a maybe is not a decision). */
export function needsDecision(record: RecordRow, stage: Stage): boolean {
	if (!stagesFor(record.state).includes(stage)) return false;
	const verdict = stage === "ta" ? record.ta_verdict : record.ft_verdict;
	return verdict === null || verdict === "maybe";
}

/**
 * Whether a keystroke lands in text the researcher is typing. The I/E/M shortcuts must never steal
 * a letter from the search box, the note field, the free-text reason or the message composer.
 */
export function typingInField(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (el === null || typeof el.closest !== "function") return false;
	return el.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") !== null;
}

/** The fallback exclusion reasons, after the project's own criteria (SCREENING.md's dimensions). */
const FALLBACK_REASONS = ["Population not met", "Concept not met", "Context not met", "No abstract"];
const OTHER = "Other…";

interface Decision {
	verdict: VerdictRequest["verdict"];
	label: string;
	icon: typeof Check;
	key: string;
}
const DECISIONS: Decision[] = [
	{ verdict: "include", label: "Include", icon: Check, key: "I" },
	{ verdict: "exclude", label: "Exclude", icon: X, key: "E" },
	{ verdict: "maybe", label: "Maybe", icon: CircleHelp, key: "M" },
];

/** Who wrote a rationale, and what it says once its authorship prefix is removed. */
export function whoDecided(rationale: string | null): { mine: boolean; reason: string } {
	const text = rationale ?? "";
	return text.startsWith(MINE) ? { mine: true, reason: text.slice(MINE.length) } : { mine: false, reason: text };
}

/** The verdict and its wording at one stage, and who recorded it. */
function recorded(record: RecordRow, stage: Stage): { verdict: string; reason: string; mine: boolean } | null {
	const verdict = stage === "ta" ? record.ta_verdict : record.ft_verdict;
	if (verdict === null || verdict === "") return null;
	return { verdict, ...whoDecided(stage === "ta" ? record.ta_rationale : record.ft_rationale) };
}

/**
 * A verdict already recorded at a stage this paper can no longer be decided at: the archive row in
 * the detail panel, where the desk is showing the other stage.
 */
export function RecordedVerdict({
	label,
	verdict,
	rationale,
}: {
	label: string;
	verdict: string;
	rationale: string | null;
}): ReactNode {
	const { mine, reason } = whoDecided(rationale);
	return (
		<>
			<dt>
				{label}: <VerdictMark verdict={verdict} />
			</dt>
			<dd>
				<span className="rw-faint">{mine ? "Your decision." : "Agent's decision."}</span>{" "}
				{reason === "" ? "No reason recorded." : reason}
			</dd>
		</>
	);
}

export function ScreeningDesk({
	slug,
	record,
	criteria,
	onSaved,
}: {
	slug: string;
	record: RecordRow;
	/** The project's scope.md criteria; the exclusion picker lists them first. */
	criteria: Criteria | null;
	onSaved(record: RecordRow, stage: Stage): void;
}): ReactNode {
	const stages = stagesFor(record.state);
	const [picked, setPicked] = useState<Stage | null>(null);
	const stage = picked !== null && stages.includes(picked) ? picked : (stages[0] ?? "ta");
	const [note, setNote] = useState("");
	const [reasons, setReasons] = useState(false);
	const [reason, setReason] = useState<string | null>(null);
	const [other, setOther] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const reasonsRef = useRef<HTMLDivElement | null>(null);
	const otherRef = useRef<HTMLInputElement | null>(null);

	// A different paper is a different decision: nothing typed here carries over.
	useEffect(() => {
		setNote("");
		setReasons(false);
		setReason(null);
		setOther("");
		setError(null);
	}, [record.id]);

	// The picker is modal to the keyboard: it opens with its first reason focused.
	useEffect(() => {
		if (reasons) reasonsRef.current?.querySelector<HTMLElement>("button")?.focus();
	}, [reasons]);

	// "Other…" is typed, so the caret goes there as soon as it is chosen.
	useEffect(() => {
		if (reason === OTHER) otherRef.current?.focus();
	}, [reason]);
	const save = async (verdict: VerdictRequest["verdict"], chosen?: string): Promise<void> => {
		setBusy(true);
		setError(null);
		try {
			const saved = await sendJson<RecordRow>(
				`/api/projects/${encodeURIComponent(slug)}/records/${encodeURIComponent(record.id)}/verdict`,
				"POST",
				{ stage, verdict, reason: chosen, note: note || undefined } satisfies VerdictRequest,
			);
			setReasons(false);
			setReason(null);
			setOther("");
			setNote("");
			onSaved(saved, stage);
		} catch (err) {
			setError(err instanceof Error ? err.message : "This decision couldn't be saved.");
		} finally {
			setBusy(false);
		}
	};

	const decide = (verdict: VerdictRequest["verdict"]): void => {
		setError(null);
		if (verdict !== "exclude") {
			void save(verdict);
			return;
		}
		setReasons(true);
	};

	// I / E / M anywhere in the reading list or the detail panel, never while typing.
	useEffect(() => {
		const scope = rootRef.current?.closest<HTMLElement>(".rw-records");
		if (!scope) return;
		const onKey = (e: globalThis.KeyboardEvent): void => {
			if (e.metaKey || e.ctrlKey || e.altKey || reasons || busy || typingInField(e.target)) return;
			const hit = DECISIONS.find(d => d.key === e.key.toUpperCase());
			if (hit === undefined || (hit.verdict === "maybe" && stage === "ft")) return;
			e.preventDefault();
			decide(hit.verdict);
		};
		scope.addEventListener("keydown", onKey);
		return () => scope.removeEventListener("keydown", onKey);
	});

	const blocked = NO_DECISION[record.state];
	if (blocked !== undefined) return <p className="rw-desk-blocked rw-notice">{blocked}</p>;

	const choices = [...(criteria?.exclusion ?? []), ...FALLBACK_REASONS, OTHER];
	const confirmable = reason === OTHER ? other.trim() !== "" : reason !== null;
	const confirm = (): void => {
		if (!confirmable || reason === null) return;
		void save("exclude", reason === OTHER ? other.trim() : reason);
	};
	const onReasonKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation(); // Escape closes the picker, not the whole detail panel
			setReasons(false);
			return;
		}
		const digit = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
		if (digit >= 0 && digit < choices.length && !typingInField(e.target)) {
			e.preventDefault();
			setReason(choices[digit]);
			(reasonsRef.current?.querySelectorAll("button")[digit] as HTMLElement | undefined)?.focus();
			return;
		}
		const dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
		if (dir !== 0) {
			e.preventDefault();
			const at = reason === null ? -1 : choices.indexOf(reason);
			const next = (at + dir + choices.length) % choices.length;
			setReason(choices[next]);
			(reasonsRef.current?.querySelectorAll("button")[next] as HTMLElement | undefined)?.focus();
		} else if (e.key === "Enter" && !typingInField(e.target)) {
			e.preventDefault();
			confirm();
		}
	};

	const mark = recorded(record, stage);
	const confidence = stage === "ta" ? record.ta_confidence : null;
	return (
		<div className="rw-desk" ref={rootRef}>
			{mark !== null && (
				<p className={mark.mine ? "rw-desk-said rw-desk-mine" : "rw-desk-said"}>
					<span className="rw-faint">{mark.mine ? "Your decision:" : "Agent suggested:"}</span>{" "}
					<VerdictMark verdict={mark.verdict} />
					{mark.reason !== "" && <Rationale text={mark.reason} />}
					{!mark.mine && confidence !== null && confidence !== "" && (
						<span className="rw-faint"> Confidence: {confidence.toLowerCase()}</span>
					)}
				</p>
			)}
			{stages.length > 1 && (
				<div className="rw-segmented rw-desk-stage" role="group" aria-label="Screening stage">
					{stages.map(s => (
						<button key={s} type="button" aria-pressed={stage === s} onClick={() => setPicked(s)}>
							{STAGE_LABEL[s]}
						</button>
					))}
				</div>
			)}
			<div className="rw-desk-verdicts">
				{DECISIONS.filter(d => d.verdict !== "maybe" || stage === "ta").map(d => {
					const Icon = d.icon;
					return (
						<button
							key={d.verdict}
							type="button"
							className={`rw-desk-verdict rw-mark-${d.verdict}`}
							aria-pressed={mark?.mine === true && mark.verdict === d.verdict}
							disabled={busy}
							onClick={() => decide(d.verdict)}
						>
							<Icon size={14} aria-hidden />
							{d.label}
							<kbd>{d.key}</kbd>
						</button>
					);
				})}
			</div>
			{reasons && (
				<div className="rw-reasons" ref={reasonsRef} onKeyDown={onReasonKey}>
					<p className="rw-faint" id="rw-reasons-label">
						Why is this paper excluded? Pick one.
					</p>
					<div role="radiogroup" aria-labelledby="rw-reasons-label">
						{choices.map((choice, i) => (
							<button
								key={choice}
								type="button"
								role="radio"
								aria-checked={reason === choice}
								onClick={() => setReason(choice)}
							>
								<span className="rw-reason-n">{i < 9 ? i + 1 : "·"}</span>
								{choice}
							</button>
						))}
					</div>
					{reason === OTHER && (
						<input
							type="text"
							aria-label="Your reason"
							placeholder="Your reason"
							maxLength={500}
							value={other}
							ref={otherRef}
							onChange={e => setOther(e.target.value)}
							onKeyDown={e => {
								if (e.key !== "Enter") return;
								e.preventDefault();
								confirm();
							}}
						/>
					)}
					<div className="rw-reason-actions">
						<button type="button" disabled={!confirmable || busy} onClick={confirm}>
							Save exclusion
						</button>
						<button type="button" onClick={() => setReasons(false)}>
							Cancel
						</button>
					</div>
				</div>
			)}
			<label className="rw-desk-note">
				<span className="rw-faint">Note (optional)</span>
				<input
					type="text"
					maxLength={500}
					value={note}
					placeholder="Anything to remember about this decision"
					onChange={e => setNote(e.target.value)}
					onKeyDown={e => {
						// A note is the last thing typed before an exclusion is saved; Enter finishes it.
						if (e.key !== "Enter" || !reasons || !confirmable) return;
						e.preventDefault();
						confirm();
					}}
				/>
			</label>
			{error !== null && <p className="rw-error rw-desk-error">{error}</p>}
		</div>
	);
}

/** A rationale, clamped to three lines until the researcher asks for the rest. */
function Rationale({ text }: { text: string }): ReactNode {
	const [open, setOpen] = useState(false);
	useEffect(() => setOpen(false), [text]);
	return (
		<>
			<span className={open ? "rw-desk-why" : "rw-desk-why rw-clamp"}>{text}</span>
			{!open && text.length > 120 && (
				<button type="button" className="rw-link rw-desk-more" onClick={() => setOpen(true)}>
					Show more
				</button>
			)}
		</>
	);
}
