import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFetch } from "../api";

interface Selected {
	id: string;
	title: string;
}

export function GraphView({ tick, prefill }: { tick: number; prefill(text: string): void }): ReactNode {
	const graph = useFetch<{ mtime: number }>("/api/graph", tick);
	const frameRef = useRef<HTMLIFrameElement | null>(null);
	const [selected, setSelected] = useState<Selected | null>(null);

	useEffect(() => {
		const onMessage = (e: MessageEvent): void => {
			// Only our own graph iframe may drive the selection.
			if (frameRef.current === null || e.source !== frameRef.current.contentWindow) return;
			const data = e.data as { type?: unknown; id?: unknown; title?: unknown } | null;
			if (data?.type !== "paper-graph:select") return;
			setSelected({ id: String(data.id), title: String(data.title ?? data.id) });
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	if (graph.error) return <p className="rw-error">{graph.error}</p>;
	if (graph.data === null) return <p className="rw-faint">loading…</p>;
	if (graph.data.mtime === 0) return <p className="rw-faint">No paper graph yet (papers.db missing).</p>;

	return (
		<div className="rw-graph">
			{/* src only changes when the db mtime does, so refreshes don't reload an unchanged graph. */}
			<iframe
				ref={frameRef}
				title="Paper graph"
				sandbox="allow-scripts"
				src={`/api/graph.html?v=${graph.data.mtime}`}
			/>
			{selected && (
				<div className="rw-actions">
					<strong>{selected.title}</strong>
					<button
						type="button"
						onClick={() => prefill(`Find papers that cite "${selected.title}" and add them to the graph`)}
					>
						Find citing papers
					</button>
					<button type="button" onClick={() => prefill(`Run auto-edges for paper ${selected.id}`)}>
						Auto-edges
					</button>
					<button
						type="button"
						onClick={() => prefill(`Explain how "${selected.title}" relates to its neighbors in the graph`)}
					>
						Explain neighbors
					</button>
				</div>
			)}
		</div>
	);
}
