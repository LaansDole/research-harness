import { Transcript } from "@oh-my-pi/collab-web/src/components/transcript/Transcript";
import { useThemePreference } from "@oh-my-pi/collab-web/src/lib/theme";
import type { ImageContent, WireMessage } from "@oh-my-pi/pi-wire";
import { Moon, PanelLeft, Sun, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary } from "../data";
import type { SessionListItem } from "../protocol";
import {
	AgentConnection,
	type AgentState,
	appendMessage,
	type CommandBody,
	type ExitInfo,
	emptyChat,
	entriesFromMessages,
	type ModelRef,
	reduce,
} from "./agent";
import { useFetch } from "./api";
import { Composer } from "./Composer";
import { progress, Sidebar } from "./Sidebar";
import { GraphView } from "./views/GraphView";
import { PrismaView } from "./views/PrismaView";
import { RecordsView } from "./views/RecordsView";
import { ReviewsView } from "./views/ReviewsView";

const TABS = [
	["chat", "Chat"],
	["graph", "Graph"],
	["reviews", "Reviews"],
	["records", "Reading list"],
	["prisma", "PRISMA"],
] as const;
type Tab = (typeof TABS)[number][0];

interface Toast {
	id: number;
	text: string;
}

let toastSeq = 0;

const NARROW = matchMedia("(max-width: 899px)");
const COLLAPSED_KEY = "research-web.sidebar-collapsed";
// `#<tab>/<viewed slug>` keeps the view across reloads and makes it linkable. Review citations
// navigate to `#ref-n`, so the view is mirrored in sessionStorage for reloads on such a hash.
const VIEW_KEY = "research-web.view";
function decodeHash(raw: string): string {
	try {
		return decodeURIComponent(raw);
	} catch {
		return ""; // malformed bookmark: fall back to the default view
	}
}
const [HASH_TAB = "", HASH_SLUG = ""] = (
	location.hash.startsWith("#ref-") ? (sessionStorage.getItem(VIEW_KEY) ?? "") : decodeHash(location.hash.slice(1))
).split("/");

/** Starter prompts; descriptions condensed from research/prompts/*.md frontmatter. */
function starters(projects: readonly ProjectSummary[]): [string, string][] {
	const counts = projects.find(p => p.active)?.counts;
	const out: [string, string][] = [];
	if (projects.length === 0)
		out.push(["/scope ", "Turn a fuzzy question into PCC/PICO with inclusion/exclusion criteria."]);
	if (counts) {
		if (counts.identified > 0) out.push(["/screen", "Screen unscreened records against the PCC criteria."]);
		if (counts.screened_included > 0)
			out.push(["/fulltext", "Retrieve full texts for screened-in records, open access first."]);
		if (counts.fulltext_retrieved > 0)
			out.push(["/screen full-text", "Screen retrieved full texts against the criteria."]);
		if (counts.included > 0) out.push(["/review", "Synthesize a cited review from the included papers."]);
	}
	out.push(["/find ", "Search arXiv, OpenAlex and the local PDF corpus; save deduped records."]);
	out.push(["/import ", "Import RIS/BibTeX/CSV exports into the project."]);
	out.push(["/litreview ", "Mini review: search, screen, fetch PDFs, synthesize with citations."]);
	if (counts && progress(counts).total > 0)
		out.push(["/prisma", "Redraw the PRISMA flow diagram from the review store."]);
	return out.slice(0, 6);
}

function ChatEmpty({
	projects,
	prefill,
}: {
	projects: readonly ProjectSummary[];
	prefill(text: string): void;
}): ReactNode {
	const active = projects.find(p => p.active);
	return (
		<div className="rw-chat-empty">
			<h2>What should we research?</h2>
			<p className="rw-faint">
				{active
					? `Agent project: ${active.slug} · ${progress(active.counts).label}`
					: "No research project yet. Start by scoping a question."}
			</p>
			<ul className="rw-starters">
				{starters(projects).map(([command, description]) => (
					<li key={command}>
						<button type="button" onClick={() => prefill(command)}>
							<code>{command.trim()}</code>
							<span className="rw-faint">{description}</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

export function App(): ReactNode {
	const [generation, setGeneration] = useState(0);
	const [conn, setConn] = useState<AgentConnection | null>(null);
	const [chat, setChat] = useState(emptyChat);
	const [exit, setExit] = useState<ExitInfo | null>(null);
	const [agentState, setAgentState] = useState<AgentState | null>(null);
	const [models, setModels] = useState<ModelRef[]>([]);
	const [sessions, setSessions] = useState<SessionListItem[]>([]);
	const [tick, setTick] = useState(0);
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [tab, setTab] = useState<Tab>(() => TABS.find(([id]) => id === HASH_TAB)?.[0] ?? "chat");
	const [draft, setDraft] = useState("");
	const [prefilled, setPrefilled] = useState(false);
	const [previousDraft, setPreviousDraft] = useState<string | null>(null);
	const [picked, setPicked] = useState<string | null>(HASH_SLUG || null);
	const [narrow, setNarrow] = useState(NARROW.matches);
	// Desktop collapse persists; the mobile drawer always starts closed.
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
	const [drawer, setDrawer] = useState(false);
	const toggleRef = useRef<HTMLButtonElement | null>(null);
	// Read synchronously in `run`'s catch: exit lands before the rejected requests settle.
	const exitRef = useRef<ExitInfo | null>(null);
	const draftRef = useRef(draft);
	draftRef.current = draft;

	const projects = useFetch<ProjectSummary[]>("/api/projects", tick);
	const activeSlug = projects.data?.find(p => p.active)?.slug ?? null;
	// A stale hash slug (project removed) falls back like an unpicked view.
	const pickedSlug = picked !== null && (projects.data?.some(p => p.slug === picked) ?? true) ? picked : null;
	const slug = pickedSlug ?? activeSlug ?? projects.data?.[0]?.slug ?? null;
	const sidebarShown = narrow ? drawer : !collapsed;

	const toast = useCallback((text: string): void => {
		const id = ++toastSeq;
		setToasts(prev => (prev.some(t => t.text === text) ? prev : [...prev, { id, text }]));
		setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
	}, []);

	/** While disconnected the banner and status pill already say so; no toast per failed request. */
	const fail = useCallback(
		(err: unknown): void => {
			if (exitRef.current === null) toast(err instanceof Error ? err.message : String(err));
		},
		[toast],
	);

	/** Bridge request; `ok:false` and transport failures become a toast. */
	const run = useCallback(
		async <T,>(body: CommandBody): Promise<T | undefined> => {
			if (conn === null) return undefined;
			try {
				return await conn.request<T>(body);
			} catch (err) {
				fail(err);
				return undefined;
			}
		},
		[conn, fail],
	);

	const syncState = useCallback(async (): Promise<void> => {
		const [state, list] = await Promise.all([
			run<AgentState>({ cmd: "get_state" }),
			run<SessionListItem[]>({ cmd: "list_sessions" }),
		]);
		if (state) setAgentState(state);
		if (list) setSessions(list);
	}, [run]);

	// ponytail: history reload races events landing mid-request; only called while idle.
	const loadHistory = useCallback(async (): Promise<void> => {
		const messages = await run<WireMessage[]>({ cmd: "get_messages" });
		if (messages) setChat({ ...emptyChat, entries: entriesFromMessages(messages) });
		await syncState();
	}, [run, syncState]);

	// One WebSocket (= one omp child) per generation; Reconnect bumps it.
	useEffect(() => {
		const next = new AgentConnection(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
		setConn(next);
		setChat(emptyChat);
		setAgentState(null);
		exitRef.current = null;
		setExit(null);
		next.subscribe(event => {
			setChat(prev => reduce(prev, event));
			if (event.type === "notice" && event.level !== "info") toast(event.message);
		});
		next.onSettled(() => setTick(t => t + 1));
		next.onExit(info => {
			exitRef.current = info;
			setExit(info);
		});
		return () => next.close();
	}, [generation, toast]);

	useEffect(() => {
		if (conn === null) return;
		void loadHistory();
		void run<ModelRef[]>({ cmd: "get_available_models" }).then(list => {
			if (list) setModels(list);
		});
	}, [conn, loadHistory, run]);

	// Research views and the session list refresh after each settled turn.
	useEffect(() => {
		if (tick > 0) void syncState();
	}, [tick, syncState]);

	useEffect(() => {
		document.title = slug ? `Research · ${slug}` : "Research";
	}, [slug]);

	useEffect(() => {
		const view = `${tab}${picked ? `/${picked}` : ""}`;
		sessionStorage.setItem(VIEW_KEY, view);
		history.replaceState(null, "", `#${tab}${picked ? `/${encodeURIComponent(picked)}` : ""}`);
	}, [tab, picked]);

	useEffect(() => {
		const onChange = (): void => setNarrow(NARROW.matches);
		NARROW.addEventListener("change", onChange);
		return () => NARROW.removeEventListener("change", onChange);
	}, []);

	const toggleSidebar = useCallback((): void => {
		if (NARROW.matches) {
			setDrawer(open => !open);
			return;
		}
		setCollapsed(prev => {
			localStorage.setItem(COLLAPSED_KEY, prev ? "0" : "1");
			return !prev;
		});
	}, []);

	// The open drawer is modal (main is inert): focus moves into it, and back to the toggle once main is live again.
	const drawerWasOpen = useRef(false);
	useEffect(() => {
		if (drawer) document.querySelector<HTMLElement>(".rw-sidebar .rw-row")?.focus();
		else if (drawerWasOpen.current) toggleRef.current?.focus();
		drawerWasOpen.current = drawer;
	}, [drawer]);

	useEffect(() => {
		const onKey = (e: globalThis.KeyboardEvent): void => {
			if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
				e.preventDefault();
				toggleSidebar();
			} else if (e.key === "Escape" && drawer && NARROW.matches) {
				setDrawer(false);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [drawer, toggleSidebar]);

	const prefill = useCallback((text: string): void => {
		const previous = draftRef.current;
		if (previous.trim() !== "" && previous !== text) setPreviousDraft(previous);
		setDraft(text);
		setPrefilled(true);
		setTab("chat");
		// Focus once the chat panel is unhidden so Enter sends the reviewed prompt.
		requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".rw-chat textarea")?.focus());
	}, []);

	const send = (message: string, images: ImageContent[]): void => {
		setDraft("");
		setPrefilled(false);
		setPreviousDraft(null);
		void run({ cmd: "prompt", message, images: images.length > 0 ? images : undefined });
	};

	const switchTo = async (body: CommandBody): Promise<void> => {
		if (conn === null) return;
		try {
			await conn.request(body);
		} catch (err) {
			fail(err);
			return;
		}
		await loadHistory();
	};

	const onTabKey = (e: KeyboardEvent<HTMLDivElement>): void => {
		const i = TABS.findIndex(([id]) => id === tab);
		const last = TABS.length - 1;
		const next =
			e.key === "ArrowRight"
				? (i + 1) % TABS.length
				: e.key === "ArrowLeft"
					? (i + last) % TABS.length
					: e.key === "Home"
						? 0
						: e.key === "End"
							? last
							: -1;
		if (next < 0) return;
		e.preventDefault();
		const id = TABS[next][0];
		setTab(id);
		document.getElementById(`rw-tab-${id}`)?.focus();
	};

	const panel = (id: Tab, children: ReactNode, className = "rw-panel"): ReactNode => (
		<section
			id={`rw-panel-${id}`}
			role="tabpanel"
			aria-labelledby={`rw-tab-${id}`}
			className={className}
			hidden={tab !== id}
		>
			{children}
		</section>
	);
	const noProjects = <p className="rw-notice">No research projects yet.</p>;
	// The live reply joins its turn's entry (same id it gets on commit), so the folded row never remounts.
	const shownEntries = useMemo(
		() => (chat.stream === null ? chat.entries : appendMessage(chat.entries, chat.stream)),
		[chat.entries, chat.stream],
	);
	// That entry is the turn's last assistant row; it renders as streaming (incremental Markdown, running tools).
	const liveEntryId =
		chat.stream === null
			? undefined
			: shownEntries.findLast(e => e.type === "message" && e.message.role === "assistant")?.id;
	const chatEmpty = chat.entries.length === 0 && chat.stream === null && !chat.working;
	const connecting = agentState === null && !exit;
	const status = exit ? "Disconnected" : connecting ? "Connecting…" : chat.working ? "Working…" : "Ready";
	const statusClass = exit ? " rw-status-down" : connecting || chat.working ? " rw-status-busy" : "";
	const active = slug === activeSlug;

	return (
		<div className={`rw-app${collapsed ? " rw-collapsed" : ""}${drawer ? " rw-drawer-open" : ""}`}>
			<Sidebar
				projects={projects.data ?? []}
				projectsError={projects.error}
				slug={slug}
				onSelectProject={next => {
					setPicked(next);
					setDrawer(false);
				}}
				sessions={sessions}
				agentState={agentState}
				onNewSession={() => void switchTo({ cmd: "new_session" })}
				onForkSession={() => void switchTo({ cmd: "fork" })}
				onSwitchSession={path => {
					setDrawer(false);
					void switchTo({ cmd: "switch_session", path });
				}}
				inert={narrow && !drawer}
			/>
			{narrow && drawer && <div className="rw-scrim" onClick={() => setDrawer(false)} />}
			<main className="rw-main" inert={narrow && drawer}>
				<header className="rw-header">
					<button
						ref={toggleRef}
						type="button"
						className="rw-icon"
						aria-label={sidebarShown ? "Hide sidebar" : "Show sidebar"}
						aria-expanded={sidebarShown}
						aria-controls="rw-sidebar"
						title={`${sidebarShown ? "Hide" : "Show"} sidebar (${navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl+"}B)`}
						onClick={toggleSidebar}
					>
						<PanelLeft size={16} />
					</button>
					<div className="rw-tabs" role="tablist" aria-label="Views" onKeyDown={onTabKey}>
						{TABS.map(([id, label]) => (
							<button
								key={id}
								id={`rw-tab-${id}`}
								type="button"
								role="tab"
								aria-selected={tab === id}
								aria-controls={`rw-panel-${id}`}
								tabIndex={tab === id ? 0 : -1}
								onClick={() => setTab(id)}
							>
								{label}
							</button>
						))}
					</div>
					<div className="rw-context">
						{slug && (
							<span className="rw-viewed" title={`Viewing ${slug}`}>
								{slug}
							</span>
						)}
						{slug &&
							(active ? (
								<span className="rw-chip">Agent project</span>
							) : (
								<button type="button" onClick={() => prefill(`Switch the active project to ${slug}`)}>
									Make active
								</button>
							))}
						<span className={`rw-status${statusClass}`} role="status" aria-live="polite">
							{status}
						</span>
						<ThemeToggle onSaveFailed={toast} />
					</div>
				</header>
				{exit && (
					<div className="rw-banner">
						<span>
							{exit.reason === "agent" ? (
								"The research agent stopped unexpectedly. Your sessions are saved; reconnecting starts it again."
							) : (
								<>
									Lost the connection to research web. If you closed it, run <code>research web</code> in a
									terminal, then reconnect.
								</>
							)}
						</span>
						<button type="button" onClick={() => setGeneration(g => g + 1)}>
							Reconnect
						</button>
					</div>
				)}
				{/* Panels stay mounted so the graph iframe and transcript scroll survive tab switches. */}
				{panel(
					"chat",
					<>
						<div className="rw-transcript">
							{chatEmpty ? (
								<ChatEmpty projects={projects.data ?? []} prefill={prefill} />
							) : (
								<Transcript
									entries={shownEntries}
									committedEntries={chat.entries}
									stream={null}
									streamDone
									activeTools={chat.activeTools}
									// The live reply is already in shownEntries; no "thinking…" placeholder under it.
									working={chat.working && chat.stream === null}
									foldActivity
									pendingEntryId={liveEntryId}
								/>
							)}
						</div>
						<Composer
							draft={draft}
							onEdit={text => {
								setDraft(text);
								setPrefilled(false);
							}}
							working={chat.working}
							prefilled={prefilled}
							onRestore={
								previousDraft === null
									? null
									: () => {
											setDraft(previousDraft);
											setPreviousDraft(null);
											setPrefilled(false);
										}
							}
							onSend={send}
							onStop={() => void run({ cmd: "abort" })}
							agentState={agentState}
							models={models}
							onSetModel={model =>
								void run({ cmd: "set_model", provider: model.provider, modelId: model.id }).then(syncState)
							}
							onSetThinking={level => void run({ cmd: "set_thinking_level", level }).then(syncState)}
						/>
					</>,
					"rw-panel rw-chat",
				)}
				{panel("graph", <GraphView tick={tick} prefill={prefill} />)}
				{panel(
					"reviews",
					slug === null ? noProjects : <ReviewsView slug={slug} active={active} tick={tick} prefill={prefill} />,
				)}
				{panel(
					"records",
					slug === null ? noProjects : <RecordsView slug={slug} active={active} tick={tick} prefill={prefill} />,
				)}
				{panel(
					"prisma",
					slug === null ? noProjects : <PrismaView slug={slug} active={active} tick={tick} prefill={prefill} />,
				)}
			</main>
			<div className="rw-toasts">
				{toasts.map(t => (
					<div key={t.id} className="rw-toast" role="alert">
						<span>{t.text}</span>
						<button
							type="button"
							className="rw-icon"
							aria-label="Dismiss"
							onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
						>
							<X size={14} />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

const THEME_NOT_SAVED = "Couldn't save your theme choice; it will go back to light next time research web starts.";

function ThemeToggle({ onSaveFailed }: { onSaveFailed(text: string): void }): ReactNode {
	const { resolved, setPreference } = useThemePreference();
	const next = resolved === "dark" ? "light" : "dark";
	const label = `Switch to ${next} mode`;
	return (
		<button
			type="button"
			className="rw-icon"
			aria-label={label}
			title={label}
			onClick={() => {
				setPreference(next);
				fetch("/api/theme", { method: "POST", body: next }).then(
					res => {
						if (!res.ok) onSaveFailed(THEME_NOT_SAVED);
					},
					() => onSaveFailed(THEME_NOT_SAVED),
				);
			}}
		>
			{resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}
		</button>
	);
}
