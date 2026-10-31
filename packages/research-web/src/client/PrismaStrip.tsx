import { ArrowRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { ReviewState } from "../data";
import { type PrismaStage, prismaStrip } from "./prisma";

const LABELS: Record<PrismaStage, string> = {
	identified: "Identified",
	screened: "Screened",
	sought: "Sought",
	assessed: "Assessed",
	included: "Included",
};

/** What the records still waiting at a stage are waiting for; stages without pending work have none. */
const PENDING: Partial<Record<PrismaStage, string>> = {
	screened: "to screen",
	sought: "to retrieve",
	assessed: "to assess",
};

/**
 * The review's PRISMA flow in the header: five boxed counts joined by arrows, each a button that opens
 * the reading list on the work waiting at that stage. Numbers come from the viewed project's state
 * counts through the same arithmetic as the PRISMA diagram (prisma.ts).
 */
export function PrismaStrip({
	counts,
	active,
	onOpen,
}: {
	counts: Record<ReviewState, number>;
	/** The stage the reading list is currently filtered to, marked in the strip. */
	active: PrismaStage | null;
	onOpen(chip: ReviewState | ""): void;
}): ReactNode {
	const stages = prismaStrip(counts);
	if (stages.length === 0) return null; // no records yet: the views already say so
	return (
		<div className="rw-strip" role="group" aria-label="PRISMA flow">
			{stages.map((s, i) => {
				const pending = s.pending > 0 ? `${s.pending} ${PENDING[s.stage]}` : null;
				return (
					<Fragment key={s.stage}>
						{i > 0 && <ArrowRight className="rw-strip-arrow" size={12} aria-hidden />}
						<button
							type="button"
							className="rw-strip-box"
							data-stage={s.stage}
							aria-current={s.stage === active ? "true" : undefined}
							aria-label={`${LABELS[s.stage]}: ${s.count}.${pending ? ` ${pending}.` : ""} Show in reading list`}
							onClick={() => onOpen(s.chip)}
						>
							<span className="rw-strip-n">{s.count}</span>
							<span className="rw-strip-label">{LABELS[s.stage]}</span>
							{pending && (
								<span className="rw-strip-pending">
									<span className="rw-strip-pending-n">{s.pending}</span> {PENDING[s.stage]}
								</span>
							)}
						</button>
					</Fragment>
				);
			})}
		</div>
	);
}
