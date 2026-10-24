import { type ThemePreference, useThemePreference } from "@oh-my-pi/collab-web/src/lib/theme";
import { GitFork, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectSummary } from "../data";
import type { SessionListItem } from "../protocol";
import type { AgentState, ModelRef } from "./agent";
import { relativeTime } from "./api";

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
	const { agentState, models } = props;
	const modelIndex = models.findIndex(
		m => m.provider === agentState?.model?.provider && m.id === agentState?.model?.id,
	);
	const byProvider = new Map<string, number[]>();
	models.forEach((model, i) => {
		const group = byProvider.get(model.provider);
		if (group) group.push(i);
		else byProvider.set(model.provider, [i]);
	});
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
			<details className="rw-settings">
				<summary>Model &amp; appearance</summary>
				<label>
					Model
					<select
						id="rw-model"
						value={modelIndex}
						onChange={e => {
							const model = models[Number(e.target.value)];
							if (model) props.onSetModel(model);
						}}
					>
						{modelIndex < 0 && <option value={-1}>{agentState?.model?.id ?? "—"}</option>}
						{[...byProvider].map(([provider, indices]) => (
							<optgroup key={provider} label={provider}>
								{indices.map(i => (
									<option key={i} value={i}>
										{models[i]?.id}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</label>
				<label>
					Thinking
					<select value={agentState?.thinkingLevel ?? "off"} onChange={e => props.onSetThinking(e.target.value)}>
						{THINKING_LEVELS.map(level => (
							<option key={level} value={level}>
								{level}
							</option>
						))}
					</select>
				</label>
				<ThemeSelect />
			</details>
		</aside>
	);
}

function ThemeSelect(): ReactNode {
	const { preference, setPreference } = useThemePreference();
	return (
		<label>
			Theme
			<select value={preference} onChange={e => setPreference(e.target.value as ThemePreference)}>
				<option value="system">Match my computer</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
		</label>
	);
}
