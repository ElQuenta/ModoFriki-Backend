import { randomUUID } from "node:crypto";

/** Provider-free primitives, also used by unit tests. Release barriers in finally. */
export function createBarrier() {
	let signalReached!: () => void;
	let release!: () => void;
	const reached = new Promise<void>(resolve => { signalReached = resolve; });
	const gate = new Promise<void>(resolve => { release = resolve; });
	return { reached, release, async pause() { signalReached(); await gate; } };
}

/** Cleanup receives only allocated IDs, in reverse dependency order; no bulk deletion. */
export function createFixtureScope() {
	const owned = new Set<string>();
	const cleanups: (() => Promise<unknown>)[] = [];
	let disposed = false;
	return {
		runId: randomUUID().replaceAll("-", ""),
		id() {
			if (disposed) throw new Error("Fixture scope is closed");
			const id = randomUUID(); owned.add(id); return id;
		},
		track(id: string, deleteById: (id: string) => Promise<unknown>) {
			if (disposed || !owned.has(id)) throw new Error("Cleanup may only target fixture IDs owned by this scope");
			cleanups.push(() => deleteById(id));
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			let failures = 0;
			for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch { failures++; } }
			if (failures) throw new Error(`Failed to clean ${failures} owned fixtures`);
		}
	};
}
