import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import "./views.css";

/** The one empty-state layout: icon, heading, one sentence, CTAs that only prefill the composer. */
export function EmptyState({
	icon: Icon,
	title,
	body,
	actions,
	prefill,
}: {
	icon: LucideIcon;
	title: string;
	body: string;
	actions: { label: string; prompt: string }[];
	prefill(text: string): void;
}): ReactNode {
	return (
		<div className="rw-empty">
			<Icon size={28} aria-hidden />
			<h2>{title}</h2>
			<p>{body}</p>
			<div className="rw-empty-actions">
				{actions.map(a => (
					<button key={a.label} type="button" onClick={() => prefill(a.prompt)}>
						{a.label}
					</button>
				))}
			</div>
		</div>
	);
}
