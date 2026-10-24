import { describe, expect, it } from "bun:test";
import { checkRequest } from "../src/guard";

const PORT = 4321;

function req(headers: Record<string, string>, method = "GET"): Request {
	return new Request(`http://127.0.0.1:${PORT}/ws`, { method, headers });
}

describe("checkRequest", () => {
	it("rejects a foreign Host (DNS rebinding)", () => {
		expect(checkRequest(req({ host: `evil.example:${PORT}` }), PORT)?.status).toBe(403);
	});

	it("rejects a WebSocket upgrade from a foreign Origin", () => {
		const r = req({ host: `127.0.0.1:${PORT}`, upgrade: "websocket", origin: "https://evil.example" });
		expect(checkRequest(r, PORT)?.status).toBe(403);
	});

	it("rejects a non-GET request from a foreign Origin", () => {
		const r = req({ host: `localhost:${PORT}`, origin: "https://evil.example" }, "POST");
		expect(checkRequest(r, PORT)?.status).toBe(403);
	});

	it("allows a same-origin WebSocket upgrade", () => {
		const r = req({ host: `localhost:${PORT}`, upgrade: "websocket", origin: `http://localhost:${PORT}` });
		expect(checkRequest(r, PORT)).toBeNull();
	});

	it("allows a GET without Origin", () => {
		expect(checkRequest(req({ host: `127.0.0.1:${PORT}` }), PORT)).toBeNull();
	});
});
