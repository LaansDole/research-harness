import { Transcript } from "@oh-my-pi/collab-web/src/components/transcript/Transcript";
import type { ImageContent, WireMessage } from "@oh-my-pi/pi-wire";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import type { ProjectSummary } from "../data";
import type { SessionListItem } from "../protocol";
import {
	AgentConnection,
	type AgentState,
	type CommandBody,
	type ExitInfo,
	emptyChat,
	entriesFromMessages,
	type ModelRef,
	reduce,
} from "./agent";
import { useFetch } from "./api";
import { Composer } from "./Composer";
import { Sidebar } from "./Sidebar";
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
	const [tab, setTab] = useState<Tab>("chat");
	const [draft, setDraft] = useState("");
	const [picked, setPicked] = useState<string | null>(null);

	const projects = useFetch<ProjectSummary[]>("/api/projects", tick);
	const slug = picked ?? projects.data?.find(p => p.active)?.slug ?? projects.data?.[0]?.slug ?? null;

	const toast = useCallback((text: string): void => {
		const id = ++toastSeq;
		setToasts(prev => [...prev, { id, text }]);
		setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
	}, []);

	/** Bridge request; `ok:false` and transport failures become a toast. */
	const run = useCallback(
		async <T,>(body: CommandBody): Promise<T | undefined> => {
			if (conn === null) return undefined;
			try {
				return await conn.request<T>(body);
			} catch (err) {
				toast(err instanceof Error ? err.message : String(err));
				return undefined;
			}
		},
		[conn, toast],
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
		setExit(null);
		next.subscribe(event => {
			setChat(prev => reduce(prev, event));
			if (event.type === "notice" && event.level !== "info") toast(event.message);
		});
		next.onSettled(() => setTick(t => t + 1));
		next.onExit(setExit);
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

	const prefill = useCallback((text: string): void => {
		setDraft(text);
		setTab("chat");
	}, []);

	const send = (message: string, images: ImageContent[]): void => {
		void run({ cmd: "prompt", message, images: images.length > 0 ? images : undefined });
	};

	const switchTo = async (body: CommandBody): Promise<void> => {
		await run(body);
		await loadHistory();
	};

	return (
		<div className="rw-app">
			<Sidebar
				projects={projects.data ?? []}
				projectsError={projects.error}
				slug={slug}
				onSelectProject={setPicked}
				sessions={sessions}
				agentState={agentState}
				models={models}
				onNewSession={() => void switchTo({ cmd: "new_session" })}
				onForkSession={() => void switchTo({ cmd: "fork" })}
				onSwitchSession={path => void switchTo({ cmd: "switch_session", path })}
				onSetModel={model =>
					void run({ cmd: "set_model", provider: model.provider, modelId: model.id }).then(syncState)
				}
				onSetThinking={level => void run({ cmd: "set_thinking_level", level }).then(syncState)}
				prefill={prefill}
			/>
			<main className="rw-main">
				<nav className="rw-tabs">
					{TABS.map(([id, label]) => (
						<button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
							{label}
						</button>
					))}
				</nav>
				{exit && (
					<div className="rw-banner">
						<span>agent exited (code {exit.code})</span>
						{exit.stderr && <pre>{exit.stderr}</pre>}
						<button type="button" onClick={() => setGeneration(g => g + 1)}>
							Reconnect
						</button>
					</div>
				)}
				{/* Panels stay mounted so the graph iframe and transcript scroll survive tab switches. */}
				<section className="rw-panel rw-chat" hidden={tab !== "chat"}>
					<div className="rw-transcript">
						<Transcript
							entries={chat.entries}
							stream={chat.stream}
							streamDone={chat.streamDone}
							activeTools={chat.activeTools}
							working={chat.working}
						/>
					</div>
					<Composer
						draft={draft}
						setDraft={setDraft}
						working={chat.working}
						onSend={send}
						onStop={() => void run({ cmd: "abort" })}
					/>
				</section>
				<section className="rw-panel" hidden={tab !== "graph"}>
					<GraphView tick={tick} prefill={prefill} />
				</section>
				{slug === null ? (
					tab !== "chat" && tab !== "graph" && <p className="rw-panel rw-faint">No research projects yet.</p>
				) : (
					<>
						<section className="rw-panel" hidden={tab !== "reviews"}>
							<ReviewsView slug={slug} tick={tick} prefill={prefill} />
						</section>
						<section className="rw-panel" hidden={tab !== "records"}>
							<RecordsView slug={slug} tick={tick} prefill={prefill} />
						</section>
						<section className="rw-panel" hidden={tab !== "prisma"}>
							<PrismaView slug={slug} tick={tick} />
						</section>
					</>
				)}
			</main>
			<div className="rw-toasts">
				{toasts.map(t => (
					<div key={t.id} className="rw-toast" role="alert">
						{t.text}
					</div>
				))}
			</div>
		</div>
	);
}
