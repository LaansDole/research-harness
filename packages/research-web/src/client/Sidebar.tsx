import { GitFork, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectSummary } from "../data";
import type { SessionListItem } from "../protocol";
import type { AgentState } from "./agent";
import { relativeTime } from "./api";

export interface SidebarProps {
	projects: readonly ProjectSummary[];
	projectsError: string | null;
	slug: string | null;
	onSelectProject(slug: string): void;
	sessions: readonly SessionListItem[];
	agentState: AgentState | null;
	onNewSession(): void;
	onForkSession(): void;
	onSwitchSession(path: string): void;
	/** Closed off-canvas drawer: out of the tab order and the accessibility tree. */
	inert: boolean;
}

/** Screening progress, e.g. "9 of 12 screened"; `total` is 0 for an empty project. */
export function progress(counts: Record<string, number>): { done: number; total: number; label: string } {
	let total = 0;
	for (const [state, n] of Object.entries(counts)) if (state !== "duplicate") total += n;
	const done = (counts.included ?? 0) + (counts.screened_excluded ?? 0) + (counts.fulltext_excluded ?? 0);
	return { done, total, label: total > 0 ? `${done} of ${total} screened` : "No records yet" };
}

export function Sidebar(props: SidebarProps): ReactNode {
	const { agentState } = props;
	return (
		<aside className="rw-sidebar" id="rw-sidebar" aria-label="Projects and sessions" inert={props.inert}>
			<section>
				<h3>Projects</h3>
				{props.projectsError && <p className="rw-error">{props.projectsError}</p>}
				<ul className="rw-list">
					{props.projects.map(project => {
						const { done, total, label } = progress(project.counts);
						const selected = project.slug === props.slug;
						return (
							<li key={project.slug} className={selected ? "rw-selected" : undefined}>
								<button
									type="button"
									className="rw-row"
									aria-current={selected ? "true" : undefined}
									onClick={() => props.onSelectProject(project.slug)}
								>
									<span className="rw-row-head">
										<span className="rw-clamp" title={project.slug}>
											{project.slug}
										</span>
										{project.active && <span className="rw-chip">agent</span>}
									</span>
									{total > 0 && <progress aria-hidden="true" value={done} max={total} />}
									<span className="rw-faint">{label}</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>
			<section>
				<div className="rw-section-head">
					<h3>Sessions (all projects)</h3>
					<span>
						<button
							type="button"
							className="rw-icon"
							aria-label="New session"
							title="New session"
							onClick={props.onNewSession}
						>
							<Plus size={14} />
						</button>
						<button
							type="button"
							className="rw-icon"
							aria-label="Fork current session"
							title="Fork current session"
							onClick={props.onForkSession}
						>
							<GitFork size={14} />
						</button>
					</span>
				</div>
				<ul className="rw-list">
					{props.sessions.map(session => {
						const current = session.path === agentState?.sessionFile;
						const modified = Date.parse(session.modified);
						return (
							<li key={session.path} className={current ? "rw-selected" : undefined}>
								<button
									type="button"
									className="rw-row"
									aria-current={current ? "true" : undefined}
									onClick={() => props.onSwitchSession(session.path)}
								>
									<span className="rw-clamp" title={session.path}>
										{session.title}
									</span>
									<span className="rw-faint" title={new Date(modified).toLocaleString()}>
										{relativeTime(modified)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</section>
		</aside>
	);
}
