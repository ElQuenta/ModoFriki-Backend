// Hook PreToolUse (Bash|PowerShell): aplica las prohibiciones de AGENTS.md antes de ejecutar un comando.
// Lo bloqueado solo lo corre una persona, a mano, si de verdad lo necesita.
import { execSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const command = JSON.parse(raw || "{}").tool_input?.command ?? "";

const RULES = [
	[/prisma\s+migrate\s+reset/, "AGENTS.md prohíbe `prisma migrate reset` sin autorización: la DB es compartida."],
	[/--accept-data-loss|--force-reset/, "Operación destructiva sobre la DB compartida: pídele al usuario que la ejecute él si es necesaria."],
	[/prisma\s+migrate\s+dev/, "Render no ofrece shadow DB: escribe una migración SQL aditiva y aplícala con `npx prisma migrate deploy`."],
	[/prisma\s+db\s+push/, "CLAUDE.md prohíbe `db push`: usa una migración SQL aditiva y `npx prisma migrate deploy`."],
	[/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, "AGENTS.md prohíbe DROP/TRUNCATE sin autorización."],
	[/dropDatabase\(|dropCollection\(|\.drop\(\)|deleteMany\(\s*(\{\s*\})?\s*\)/, "Borrado masivo de datos: requiere autorización humana."],
	[/git\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)/, "AGENTS.md prohíbe `git push --force` en ramas compartidas."],
	[/git\s+reset\s+--hard/, "AGENTS.md prohíbe `git reset --hard`: puede descartar trabajo ajeno."],
	[/git\s+push\b(?=.*(?:\s|:)(?:main|qa)(?:\s|$))/, "A main y qa solo se llega por merge revisado con aprobación humana (AGENTS.md)."],
];

let reason = RULES.find(([pattern]) => pattern.test(command))?.[1];

if (!reason && /git\s+(commit|merge|cherry-pick|rebase)\b/.test(command)) {
	let branch = "";
	try { branch = execSync("git branch --show-current", { encoding: "utf8" }).trim(); } catch { /* fuera de un repo */ }
	if (branch === "main" || branch === "qa") reason = `Estás en ${branch}: AGENTS.md prohíbe commits e integraciones directas. Cambia a dev o a una rama feat/*.`;
}

if (reason) {
	console.log(JSON.stringify({
		hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason }
	}));
}
