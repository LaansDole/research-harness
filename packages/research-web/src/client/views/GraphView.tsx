import { useSystemTheme } from "@oh-my-pi/collab-web/src/lib/theme";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { problemClass, useFetch } from "../api";

interface Selected {
	id: string;
	title: string;
}

export function GraphView({ tick, prefill }: { tick: number; prefill(text: string): void }): ReactNode {
	const graph = useFetch<{ mtime: number }>("/api/graph", tick);
	const frameRef = useRef<HTMLIFrameElement | null>(null);
	const [selected, setSelected] = useState<Selected | null>(null);
	const theme = useSystemTheme();
	// The iframe is sandboxed (opaque origin), so the theme travels by message, on load and on change.
	const sendTheme = useCallback(() => {
		frameRef.current?.contentWindow?.postMessage({ type: "paper-graph:theme", theme }, "*");
	}, [theme]);
	useEffect(sendTheme, [sendTheme]);

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

	if (graph.error) return <p className={problemClass(graph)}>{graph.error}</p>;
	if (graph.data === null) return <p className="rw-faint">loading…</p>;
	if (graph.data.mtime === 0)
		return <p className="rw-notice">No papers in the graph yet. Ask the agent to add some (try /graph).</p>;

	return (
		<div className="rw-graph">
			{/* src only changes when the db mtime does, so refreshes don't reload an unchanged graph. */}
			<iframe
				ref={frameRef}
				title="Paper graph"
				sandbox="allow-scripts"
				src={`/api/graph.html?v=${graph.data.mtime}`}
				onLoad={sendTheme}
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
