import { shouldSubmitOnEnter } from "@oh-my-pi/collab-web/src/components/shell/Composer";
import type { ImageContent } from "@oh-my-pi/pi-wire";
import { ImagePlus, SendHorizontal, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

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
}

async function toImage(file: File): Promise<ImageContent> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	return { type: "image", data: bytes.toBase64(), mimeType: file.type };
}

export function Composer({ draft, onEdit, working, prefilled, onRestore, onSend, onStop }: ComposerProps): ReactNode {
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
			<div className="rw-composer-row">
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
					title="Send"
					aria-disabled={empty}
					onClick={send}
				>
					<SendHorizontal size={16} />
				</button>
			</div>
			<p className="rw-hint rw-faint">Enter send · Shift+Enter newline · type / for research commands</p>
		</div>
	);
}
