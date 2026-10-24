import { Download, GitFork } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { problemClass, useFetch } from "../api";
import { EmptyState } from "./EmptyState";
import "./views.css";

export function PrismaView({
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
	const svg = useFetch<string>(`/api/projects/${encodeURIComponent(slug)}/prisma.svg`, tick, "text");
	const [fit, setFit] = useState(true);
	// The zoom toggle only matters when the figure is wider than its card.
	const [overflows, setOverflows] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);
	// Measured on resize too: the panel is display:none (0 wide) until its tab is shown.
	useEffect(() => {
		const root = rootRef.current;
		const img = root?.querySelector("img");
		if (!root || !img) return;
		const measure = (): void => {
			// 34 = the card's padding + border.
			if (root.clientWidth > 0 && img.naturalWidth > 0) setOverflows(img.naturalWidth + 34 > root.clientWidth);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		img.addEventListener("load", measure);
		return () => {
			observer.disconnect();
			img.removeEventListener("load", measure);
		};
	}, [svg.data]);
	if (svg.empty)
		return (
			<EmptyState
				icon={GitFork}
				title="No records yet"
				body="The PRISMA flow diagram draws itself once the project has screening records."
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
	if (svg.error) return <p className={problemClass(svg)}>{svg.error}</p>;
	if (svg.data === null) return <p className="rw-faint">Drawing PRISMA diagram…</p>;
	const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.data)}`;
	return (
		<div className="rw-prisma" ref={rootRef}>
			<div className="rw-toolbar">
				{overflows && (
					<div className="rw-segmented" role="group" aria-label="Zoom">
						<button type="button" aria-pressed={fit} onClick={() => setFit(true)}>
							Fit
						</button>
						<button type="button" aria-pressed={!fit} onClick={() => setFit(false)}>
							100 %
						</button>
					</div>
				)}
				<a className="rw-button" href={url} download={`prisma-${slug}.svg`}>
					<Download size={14} aria-hidden /> Download SVG
				</a>
			</div>
			{/* <img> keeps any script in the SVG inert. */}
			<div className={fit ? "rw-prisma-card" : "rw-prisma-card rw-actual"}>
				<img alt="PRISMA flow diagram" src={url} />
			</div>
		</div>
	);
}
