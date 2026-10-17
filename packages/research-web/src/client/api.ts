import { useEffect, useState } from "react";

export interface Loaded<T> {
	data: T | null;
	error: string | null;
}

async function fetchBody<T>(url: string, as: "json" | "text"): Promise<T> {
	const res = await fetch(url);
	const text = await res.text();
	if (!res.ok) {
		let message = text || `HTTP ${res.status}`;
		try {
			const body = JSON.parse(text) as { error?: unknown };
			if (typeof body.error === "string") message = body.error;
		} catch {
			// non-JSON error body (python stderr): show it verbatim
		}
		throw new Error(message);
	}
	return (as === "json" ? JSON.parse(text) : text) as T;
}

/**
 * Fetches `url` (skipped when null) and re-fetches whenever `tick` changes.
 * Keeps the previous data on screen while a refresh is in flight.
 */
export function useFetch<T>(url: string | null, tick: number, as: "json" | "text" = "json"): Loaded<T> {
	const [state, setState] = useState<Loaded<T>>({ data: null, error: null });
	useEffect(() => {
		if (url === null) {
			setState({ data: null, error: null });
			return;
		}
		let live = true;
		fetchBody<T>(url, as).then(
			data => {
				if (live) setState({ data, error: null });
			},
			(err: unknown) => {
				if (live) setState({ data: null, error: err instanceof Error ? err.message : String(err) });
			},
		);
		return () => {
			live = false;
		};
	}, [url, tick, as]);
	return state;
}
