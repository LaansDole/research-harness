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
 * A tick refresh keeps the previous data on screen; a new URL never shows the old URL's data.
 */
export function useFetch<T>(url: string | null, tick: number, as: "json" | "text" = "json"): Loaded<T> {
	const [state, setState] = useState<Loaded<T> & { url: string | null }>({
		url: null,
		data: null,
		error: null,
		empty: false,
	});
	useEffect(() => {
		if (url === null) return;
		let live = true;
		fetchBody<T>(url, as).then(
			data => {
				if (live) setState({ url, data, error: null, empty: false });
			},
			(err: unknown) => {
				if (!live) return;
				const fetchErr = err instanceof FetchError ? err : null;
				setState({
					url,
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
	return url !== null && state.url === url ? state : { data: null, error: null, empty: false };
}

/** Class for a load problem: neutral for empty states, red for real failures. */
export function problemClass(loaded: Loaded<unknown>): string {
	return loaded.empty ? "rw-notice" : "rw-error";
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 31_536_000_000],
	["month", 2_592_000_000],
	["week", 604_800_000],
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

/** "3 days ago" for an epoch-ms timestamp. */
export function relativeTime(ms: number, now = Date.now()): string {
	const diff = ms - now;
	for (const [unit, size] of UNITS) {
		if (Math.abs(diff) >= size) return RELATIVE.format(Math.round(diff / size), unit);
	}
	return RELATIVE.format(0, "minute");
}
