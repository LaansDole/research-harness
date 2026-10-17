import type { ReactNode } from "react";
import { problemClass, useFetch } from "../api";

export function PrismaView({ slug, tick }: { slug: string; tick: number }): ReactNode {
	const svg = useFetch<string>(`/api/projects/${encodeURIComponent(slug)}/prisma.svg`, tick, "text");
	if (svg.error) return <p className={problemClass(svg)}>{svg.error}</p>;
	if (svg.data === null) return <p className="rw-faint">loading…</p>;
	// <img> keeps any script in the SVG inert.
	return (
		<div className="rw-prisma">
			<img alt="PRISMA flow diagram" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.data)}`} />
		</div>
	);
}
