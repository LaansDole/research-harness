import { shouldSubmitOnEnter } from "@oh-my-pi/collab-web/src/components/shell/Composer";
import type { ImageContent } from "@oh-my-pi/pi-wire";
import { ImagePlus, SendHorizontal, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

export interface ComposerProps {
	draft: string;
	setDraft(text: string): void;
	working: boolean;
	onSend(message: string, images: ImageContent[]): void;
	onStop(): void;
}

async function toImage(file: File): Promise<ImageContent> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	return { type: "image", data: bytes.toBase64(), mimeType: file.type };
}

export function Composer({ draft, setDraft, working, onSend, onStop }: ComposerProps): ReactNode {
	const [images, setImages] = useState<ImageContent[]>([]);
	const composingRef = useRef(false);
	const fileRef = useRef<HTMLInputElement | null>(null);

	const addFiles = async (files: Iterable<File>): Promise<void> => {
		const picked = [...files].filter(file => file.type.startsWith("image/"));
		if (picked.length === 0) return;
		const added = await Promise.all(picked.map(toImage));
		setImages(prev => [...prev, ...added]);
	};

	const send = (): void => {
		if (draft.trim() === "" && images.length === 0) return;
		onSend(draft, images);
		setDraft("");
		setImages([]);
	};

	return (
		<div className="rw-composer">
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
					rows={3}
					placeholder="Message the research agent… (Enter sends, Shift+Enter newline)"
					onChange={e => setDraft(e.target.value)}
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
					<button type="button" className="rw-icon rw-stop" aria-label="Stop" onClick={onStop}>
						<Square size={16} />
					</button>
				)}
				<button type="button" className="rw-icon rw-send" aria-label="Send" onClick={send}>
					<SendHorizontal size={16} />
				</button>
			</div>
		</div>
	);
}
