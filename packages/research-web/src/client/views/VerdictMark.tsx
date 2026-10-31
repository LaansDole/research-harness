import { Check, CircleHelp, type LucideIcon, X } from "lucide-react";
import type { ReactNode } from "react";

export type VerdictTone = "include" | "exclude" | "maybe";

export interface VerdictMarkSpec {
	tone: VerdictTone;
	/** The verdict in the researcher's words; shown next to the icon, never replaced by colour. */
	label: string;
	icon: LucideIcon;
}

/** The three verdicts review.py records (include / exclude / maybe), each with its own highlighter. */
const MARKS: Record<VerdictTone, VerdictMarkSpec> = {
	include: { tone: "include", label: "Include", icon: Check },
	exclude: { tone: "exclude", label: "Exclude", icon: X },
	maybe: { tone: "maybe", label: "Maybe", icon: CircleHelp },
};

/** `null` for anything else: an unrecorded verdict renders as plain text, with no band. */
export function verdictMark(verdict: string | null | undefined): VerdictMarkSpec | null {
	return MARKS[(verdict ?? "").trim().toLowerCase() as VerdictTone] ?? null;
}

/**
 * A verdict as a highlighter stroke: the word on a band of the verdict's colour, with its icon.
 * `label` overrides the word (a reading-list row shows the record's state wording on the same band).
 */
export function VerdictMark({ verdict, label }: { verdict: string | null | undefined; label?: string }): ReactNode {
	const mark = verdictMark(verdict);
	if (mark === null) return label ?? verdict ?? null;
	const Icon = mark.icon;
	return (
		<span className={`rw-mark rw-mark-${mark.tone}`}>
			<Icon size={13} aria-hidden />
			{label ?? mark.label}
		</span>
	);
}
