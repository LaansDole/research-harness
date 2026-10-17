import { useEffect, useState } from "react";

export interface Loaded<T> {
	data: T | null;
	error: string | null;
	/** The server answered 404: nothing there yet, an empty state rather than a failure. */
	empty: boolean;
}

class FetchError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

async function fetchBody<T>(url: string, as: "json" | "text"): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url);
	} catch {
		throw new FetchError("Can't reach research web. Is it still running?", 0);
	}
	const text = await res.text();
	if (!res.ok) {
		let message = "Couldn't load this. Try again.";
		try {
			const body = JSON.parse(text) as { error?: unknown };
			if (typeof body.error === "string") message = body.error;
		} catch {
			// non-JSON body is never shown: it may be a stack trace or stderr
		}
		throw new FetchError(message, res.status);
	}
	return (as === "json" ? JSON.parse(text) : text) as T;
}

/**
 * Fetches `url` (skipped when null) and re-fetches whenever `tick` changes.
 * Keeps the previous data on screen while a refresh is in flight.
 */
export function useFetch<T>(url: string | null, tick: number, as: "json" | "text" = "json"): Loaded<T> {
	const [state, setState] = useState<Loaded<T>>({ data: null, error: null, empty: false });
	useEffect(() => {
		if (url === null) {
			setState({ data: null, error: null, empty: false });
			return;
		}
		let live = true;
		fetchBody<T>(url, as).then(
			data => {
				if (live) setState({ data, error: null, empty: false });
			},
			(err: unknown) => {
				if (!live) return;
				const fetchErr = err instanceof FetchError ? err : null;
				setState({
					data: null,
					error: fetchErr?.message ?? "Couldn't load this. Try again.",
					empty: fetchErr?.status === 404,
				});
			},
		);
		return () => {
			live = false;
		};
	}, [url, tick, as]);
	return state;
}

/** Class for a load problem: neutral for empty states, red for real failures. */
export function problemClass(loaded: Loaded<unknown>): string {
	return loaded.empty ? "rw-notice" : "rw-error";
}
