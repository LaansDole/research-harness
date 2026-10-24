import { shouldSubmitOnEnter } from "@oh-my-pi/collab-web/src/components/shell/Composer";
import type { ImageContent } from "@oh-my-pi/pi-wire";
import { ImagePlus, SendHorizontal, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { AgentState, ModelRef } from "./agent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export interface ComposerProps {
	draft: string;
	/** User edits. */
	onEdit(text: string): void;
	working: boolean;
	/** The draft came from a view action and hasn't been edited yet. */
	prefilled: boolean;
	/** Set when a prefill replaced a different draft: restores it. */
	onRestore: (() => void) | null;
	onSend(message: string, images: ImageContent[]): void;
	onStop(): void;
	agentState: AgentState | null;
	models: readonly ModelRef[];
	onSetModel(model: ModelRef): void;
	onSetThinking(level: string): void;
}

async function toImage(file: File): Promise<ImageContent> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	return { type: "image", data: bytes.toBase64(), mimeType: file.type };
}

export function Composer(props: ComposerProps): ReactNode {
	const { draft, onEdit, working, prefilled, onRestore, onSend, onStop, agentState } = props;
	const [images, setImages] = useState<ImageContent[]>([]);
	const composingRef = useRef(false);
	const fileRef = useRef<HTMLInputElement | null>(null);
	const empty = draft.trim() === "" && images.length === 0;

	const addFiles = async (files: Iterable<File>): Promise<void> => {
		const picked = [...files].filter(file => file.type.startsWith("image/"));
		if (picked.length === 0) return;
		const added = await Promise.all(picked.map(toImage));
		setImages(prev => [...prev, ...added]);
	};

	const send = (): void => {
		if (empty) return;
		onSend(draft, images);
		setImages([]);
	};

	return (
		<div
			className="rw-composer"
			onDragOver={e => {
				if (e.dataTransfer.types.includes("Files")) e.preventDefault();
			}}
			onDrop={e => {
				if (e.dataTransfer.files.length === 0) return;
				e.preventDefault();
				void addFiles(e.dataTransfer.files);
			}}
		>
			{(prefilled || onRestore) && (
				<div className="rw-composer-note">
					{prefilled && <span className="rw-faint">Prefilled. Review, then press Enter.</span>}
					{onRestore && (
						<button type="button" className="rw-link" onClick={onRestore}>
							Restore previous draft
						</button>
					)}
				</div>
			)}
			{images.length > 0 && (
				<div className="rw-thumbs">
					{images.map((image, i) => (
						<span key={i} className="rw-thumb">
							<img src={`data:${image.mimeType};base64,${image.data}`} alt="" />
							<button
								type="button"
								aria-label="Remove image"
								onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
							>
								<X size={12} />
							</button>
						</span>
					))}
				</div>
			)}
			<div className="rw-composer-box">
				<textarea
					value={draft}
					rows={2}
					aria-label="Message"
					placeholder="Ask the research agent…"
					onChange={e => onEdit(e.target.value)}
					onCompositionStart={() => {
						composingRef.current = true;
					}}
					onCompositionEnd={() => {
						// WebKit fires the confirming Enter keydown after compositionend.
						setTimeout(() => {
							composingRef.current = false;
						}, 0);
					}}
					onKeyDown={e => {
						if (e.key === "Escape" && working) {
							e.preventDefault();
							onStop();
							return;
						}
						if (!shouldSubmitOnEnter(e, composingRef.current)) return;
						e.preventDefault();
						send();
					}}
					onPaste={e => {
						const files = [...e.clipboardData.files];
						if (files.some(file => file.type.startsWith("image/"))) {
							e.preventDefault();
							void addFiles(files);
						}
					}}
				/>
				<div className="rw-composer-bar">
					<button
						type="button"
						className="rw-icon"
						aria-label="Attach image"
						title="Attach image"
						onClick={() => fileRef.current?.click()}
					>
						<ImagePlus size={16} />
					</button>
					<input
						ref={fileRef}
						type="file"
						accept="image/*"
						multiple
						hidden
						onChange={e => {
							if (e.target.files) void addFiles(e.target.files);
							e.target.value = "";
						}}
					/>
					<ModelSelect {...props} />
					<select
						className="rw-pick"
						aria-label="Thinking level"
						title="How long the model thinks before answering"
						value={agentState?.thinkingLevel ?? "off"}
						onChange={e => props.onSetThinking(e.target.value)}
					>
						{THINKING_LEVELS.map(level => (
							<option key={level} value={level}>
								Thinking: {level}
							</option>
						))}
					</select>
					<span className="rw-spacer" />
					{working && (
						<button type="button" className="rw-stop" title="Stop (Esc)" onClick={onStop}>
							<Square size={14} />
							Stop
						</button>
					)}
					<button
						type="button"
						className="rw-icon rw-send"
						aria-label="Send"
						title="Send (Enter)"
						aria-disabled={empty}
						onClick={send}
					>
						<SendHorizontal size={16} />
					</button>
				</div>
			</div>
			<p className="rw-hint rw-faint">Enter send · Shift+Enter newline · type / for research commands</p>
		</div>
	);
}

function ModelSelect({ agentState, models, onSetModel }: ComposerProps): ReactNode {
	const current = agentState?.model;
	const index = models.findIndex(m => m.provider === current?.provider && m.id === current?.id);
	const byProvider = new Map<string, number[]>();
	models.forEach((model, i) => {
		const group = byProvider.get(model.provider);
		if (group) group.push(i);
		else byProvider.set(model.provider, [i]);
	});
	return (
		<select
			className="rw-pick rw-pick-model"
			aria-label="Model"
			title={current ? `${current.provider}/${current.id}` : "Model"}
			value={index}
			onChange={e => {
				const model = models[Number(e.target.value)];
				if (model) onSetModel(model);
			}}
		>
			{index < 0 && <option value={-1}>{current?.id ?? "Model"}</option>}
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
	);
}
