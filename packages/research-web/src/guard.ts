/**
 * Trust-boundary check for every request: the server drives an agent with shell
 * access, and any page the researcher visits can reach 127.0.0.1.
 * - Host must be this server (blocks DNS rebinding).
 * - WebSocket upgrades and non-GET requests carrying a foreign Origin are
 *   rejected (blocks cross-site WebSocket hijacking / form posts).
 */
export function checkRequest(req: Request, port: number): Response | null {
	const host = req.headers.get("host");
	if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
		return new Response("Forbidden host", { status: 403 });
	}
	const origin = req.headers.get("origin");
	const isUpgrade = req.headers.get("upgrade")?.toLowerCase() === "websocket";
	if (
		origin !== null &&
		(isUpgrade || req.method !== "GET") &&
		origin !== `http://127.0.0.1:${port}` &&
		origin !== `http://localhost:${port}`
	) {
		return new Response("Forbidden origin", { status: 403 });
	}
	return null;
}
