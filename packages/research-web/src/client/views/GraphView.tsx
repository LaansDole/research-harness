import { useSystemTheme } from "@oh-my-pi/collab-web/src/lib/theme";
import { Network, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { problemClass, useFetch } from "../api";
import { EmptyState } from "./EmptyState";
import "./views.css";

interface Selected {
	id: string;
	title: string;
}

export function GraphView({ tick, prefill }: { tick: number; prefill(text: string): void }): ReactNode {
	const graph = useFetch<{ mtime: number }>("/api/graph", tick);
	const frameRef = useRef<HTMLIFrameElement | null>(null);
	const [selected, setSelected] = useState<Selected | null>(null);
	const [loadedSrc, setLoadedSrc] = useState("");
	const [frameFocused, setFrameFocused] = useState(false);
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
			// id null: the frame's own panel closed.
			setSelected(data.id == null ? null : { id: String(data.id), title: String(data.title ?? data.id) });
		};
		// Chromium matches neither :focus nor :focus-within on a sandboxed iframe whose document has focus,
		// and fires no focus event on the element: only window blur tells that focus moved into the frame.
		const onBlur = (): void => setFrameFocused(document.activeElement === frameRef.current);
		const onFocus = (): void => setFrameFocused(false);
		window.addEventListener("message", onMessage);
		window.addEventListener("blur", onBlur);
		window.addEventListener("focus", onFocus);
		return () => {
			window.removeEventListener("message", onMessage);
			window.removeEventListener("blur", onBlur);
			window.removeEventListener("focus", onFocus);
		};
	}, []);

	if (graph.error) return <p className={problemClass(graph)}>{graph.error}</p>;
	if (graph.data === null) return <p className="rw-faint">Loading graph…</p>;
	if (graph.data.mtime === 0)
		return (
			<EmptyState
				icon={Network}
				title="Graph is empty"
				body="File included papers into the paper graph to see how they connect."
				actions={[{ label: "/graph", prompt: "/graph add" }]}
				prefill={prefill}
			/>
		);

	// src only changes when the db mtime does, so refreshes don't reload an unchanged graph.
	const src = `/api/graph.html?v=${graph.data.mtime}`;
	return (
		<div className="rw-graph">
			<div className="rw-actions">
				<strong>Paper graph · all projects</strong>
				{selected ? (
					<div className="rw-actions-right" aria-label={`Actions for ${selected.title}`} role="group">
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
						<button
							type="button"
							className="rw-icon"
							aria-label="Clear selection"
							onClick={() => {
								setSelected(null);
								frameRef.current?.contentWindow?.postMessage({ type: "paper-graph:select", id: null }, "*");
							}}
						>
							<X size={16} />
						</button>
					</div>
				) : (
					<span className="rw-faint rw-actions-right">Click a paper for actions</span>
				)}
			</div>
			<div className={frameFocused ? "rw-graph-frame rw-focused" : "rw-graph-frame"}>
				<iframe
					ref={frameRef}
					title="Paper graph"
					sandbox="allow-scripts"
					src={src}
					onLoad={() => {
						setLoadedSrc(src);
						sendTheme();
					}}
				/>
				{loadedSrc !== src && (
					<p className="rw-overlay" role="status">
						Drawing graph…
					</p>
				)}
			</div>
		</div>
	);
}
