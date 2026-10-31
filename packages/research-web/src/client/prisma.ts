import type { ReviewState } from "../data";

/** The five PRISMA-ScR flow boxes, in diagram order. */
export const PRISMA_STAGES = ["identified", "screened", "sought", "assessed", "included"] as const;
export type PrismaStage = (typeof PRISMA_STAGES)[number];

/** The numbers prisma_scr.py `derive()` puts in the diagram, plus the work still pending at each box. */
export interface PrismaFlow {
	identified: number;
	duplicates: number;
	screened: number;
	/** Records still awaiting a title/abstract decision. */
	taPending: number;
	sought: number;
	/** Screened-in records still awaiting a full text. */
	retrievalPending: number;
	assessed: number;
	/** Retrieved full texts still awaiting an eligibility decision. */
	ftPending: number;
	included: number;
}

/**
 * The same arithmetic as `derive()` in research/skills/literature-search/scripts/prisma_scr.py, so the
 * header strip and the PRISMA diagram can never disagree. `sought` is a subtraction there and here;
 * it equals the sum of the post-title/abstract states (prisma_scr.py asserts that).
 */
export function derivePrisma(counts: Record<ReviewState, number>): PrismaFlow {
	const identified =
		counts.identified +
		counts.duplicate +
		counts.screened_excluded +
		counts.screened_included +
		counts.fulltext_sought +
		counts.fulltext_retrieved +
		counts.fulltext_not_retrieved +
		counts.fulltext_excluded +
		counts.included;
	const screened = identified - counts.duplicate;
	return {
		identified,
		duplicates: counts.duplicate,
		screened,
		taPending: counts.identified,
		sought: screened - counts.screened_excluded - counts.identified,
		retrievalPending: counts.screened_included + counts.fulltext_sought,
		assessed: counts.fulltext_retrieved + counts.fulltext_excluded + counts.included,
		ftPending: counts.fulltext_retrieved,
		included: counts.included,
	};
}

/**
 * The reading-list chip each stage opens: the records a researcher still acts on at that stage
 * (RecordsView's state filter; "" is its All chip). Stages whose work is done fall through to All,
 * because a chip with no records is not offered in the reading list either.
 */
const STAGE_CHIPS: Record<PrismaStage, readonly ReviewState[]> = {
	identified: [], // every record in the project: All
	screened: ["identified"], // still to screen on title/abstract
	sought: ["screened_included", "fulltext_sought"], // waiting for a full text
	assessed: ["fulltext_retrieved"], // full text in hand, decision pending
	included: ["included"],
};

export function stageChip(stage: PrismaStage, counts: Record<ReviewState, number>): ReviewState | "" {
	return STAGE_CHIPS[stage].find(state => counts[state] > 0) ?? "";
}

/**
 * The strip box the reading list's current chip belongs to, so the header can mark where she is.
 * `""` is the All chip, which only the Identified box asks for; a chip no box owns (duplicates,
 * excluded, …) marks nothing.
 */
export function activeStage(chip: ReviewState | ""): PrismaStage | null {
	if (chip === "") return "identified";
	return PRISMA_STAGES.find(stage => STAGE_CHIPS[stage].includes(chip)) ?? null;
}

export interface PrismaStageView {
	stage: PrismaStage;
	count: number;
	/** Records still waiting at this stage; 0 when nothing is pending there. */
	pending: number;
	chip: ReviewState | "";
}

/** The header strip's five boxes; empty for a project with no records (the strip is then hidden). */
export function prismaStrip(counts: Record<ReviewState, number>): PrismaStageView[] {
	const flow = derivePrisma(counts);
	if (flow.identified === 0) return [];
	const pending: Record<PrismaStage, number> = {
		identified: 0,
		screened: flow.taPending,
		sought: flow.retrievalPending,
		assessed: flow.ftPending,
		included: 0,
	};
	return PRISMA_STAGES.map(stage => ({
		stage,
		count: flow[stage],
		pending: pending[stage],
		chip: stageChip(stage, counts),
	}));
}
