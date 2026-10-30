import { createServer, type RequestListener } from "node:http";

/** HTTP boundary for tests; always binds an ephemeral loopback port. */
export async function startHttpServer(listener: RequestListener) {
	const server = createServer(listener);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Test HTTP server has no TCP address");
	const baseUrl = `http://127.0.0.1:${address.port}`;
	return {
		baseUrl,
		request(path: string, init: RequestInit = {}) {
			const target = new URL(path, baseUrl);
			if (!path.startsWith("/") || target.origin !== baseUrl) throw new Error("Test requests must target the local server");
			const timeout = AbortSignal.timeout(5000);
			return fetch(target, { ...init, redirect: "manual", signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
		},
		async close() {
			if (!server.listening) return;
			await new Promise<void>((resolve, reject) => {
				server.close(error => error ? reject(error) : resolve());
				server.closeAllConnections();
			});
		}
	};
}
