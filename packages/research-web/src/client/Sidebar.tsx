import { GitFork, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectSummary } from "../data";
import type { SessionListItem } from "../protocol";
import type { AgentState, ModelRef } from "./agent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export interface SidebarProps {
	projects: readonly ProjectSummary[];
	projectsError: string | null;
	slug: string | null;
	onSelectProject(slug: string): void;
	sessions: readonly SessionListItem[];
	agentState: AgentState | null;
	models: readonly ModelRef[];
	onNewSession(): void;
	onForkSession(): void;
	onSwitchSession(path: string): void;
	onSetModel(model: ModelRef): void;
	onSetThinking(level: string): void;
	prefill(text: string): void;
}

function progress(counts: Record<string, number>): { done: number; total: number } {
	let total = 0;
	for (const [state, n] of Object.entries(counts)) if (state !== "duplicate") total += n;
	const done = (counts.included ?? 0) + (counts.screened_excluded ?? 0) + (counts.fulltext_excluded ?? 0);
	return { done, total };
}

export function Sidebar(props: SidebarProps): ReactNode {
	const { agentState, models } = props;
	const modelIndex = models.findIndex(
		m => m.provider === agentState?.model?.provider && m.id === agentState?.model?.id,
	);
	return (
		<aside className="rw-sidebar">
			<section>
				<h3>Projects</h3>
				{props.projectsError && <p className="rw-error">{props.projectsError}</p>}
				<ul className="rw-list">
					{props.projects.map(project => {
						const { done, total } = progress(project.counts);
						return (
							<li key={project.slug} className={project.slug === props.slug ? "rw-selected" : undefined}>
								<button type="button" className="rw-row" onClick={() => props.onSelectProject(project.slug)}>
									<span className="rw-row-title">
										{project.slug}
										{project.active && <span className="rw-chip">active</span>}
									</span>
									<progress value={done} max={Math.max(total, 1)} />
									<span className="rw-faint">
										{done}/{total} screened
									</span>
								</button>
								{!project.active && (
									<button
										type="button"
										className="rw-link"
										onClick={() => props.prefill(`Switch the active project to ${project.slug}`)}
									>
										make active
									</button>
								)}
							</li>
						);
					})}
				</ul>
			</section>
			<section>
				<h3>
					Sessions
					<button type="button" className="rw-icon" aria-label="New session" onClick={props.onNewSession}>
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
				</h3>
				<ul className="rw-list rw-sessions">
					{props.sessions.map(session => (
						<li
							key={session.path}
							className={session.path === agentState?.sessionFile ? "rw-selected" : undefined}
						>
							<button
								type="button"
								className="rw-row"
								title={session.path}
								onClick={() => props.onSwitchSession(session.path)}
							>
								<span className="rw-row-title">{session.title}</span>
								<span className="rw-faint">{new Date(session.modified).toLocaleString()}</span>
							</button>
						</li>
					))}
				</ul>
			</section>
			<section className="rw-model">
				<h3>Model</h3>
				<select
					value={modelIndex}
					onChange={e => {
						const model = models[Number(e.target.value)];
						if (model) props.onSetModel(model);
					}}
				>
					{modelIndex < 0 && <option value={-1}>{agentState?.model?.id ?? "—"}</option>}
					{models.map((model, i) => (
						<option key={`${model.provider}/${model.id}`} value={i}>
							{model.provider}/{model.id}
						</option>
					))}
				</select>
				<select value={agentState?.thinkingLevel ?? "off"} onChange={e => props.onSetThinking(e.target.value)}>
					{THINKING_LEVELS.map(level => (
						<option key={level} value={level}>
							thinking: {level}
						</option>
					))}
				</select>
			</section>
		</aside>
	);
}
