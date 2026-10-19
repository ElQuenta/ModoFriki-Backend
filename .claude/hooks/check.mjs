// Hook de Claude Code (ver .claude/settings.json).
// PreToolUse: bloquea ediciones de .env (secretos) y del cliente generado de Prisma.
// PostToolUse: valida Prisma / tipos tras cada edición; exit 2 devuelve los errores a Claude.
import { execSync } from "node:child_process";
import { basename, join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd(); // funciona aunque la sesión haya hecho cd
const bin = (tool) => join("node_modules", ".bin", tool); // relativo a root; evita los ~3 s de arranque de npx

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { hook_event_name, tool_input = {} } = JSON.parse(raw || "{}");
const file = tool_input.file_path ?? "";
const name = basename(file);

if (hook_event_name === "PreToolUse") {
	const deny = (reason) => console.log(JSON.stringify({
		hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason }
	}));
	if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") {
		deny(`${name} contiene secretos: edítalo a mano. Documenta variables nuevas en .env.example.`);
	} else if (file.replace(/\\/g, "/").includes("/src/generated/")) {
		deny("src/generated es código generado por Prisma (AGENTS.md): cambia prisma/schema.prisma y el hook regenera el cliente.");
	}
	process.exit(0);
}

const run = (cmd) => {
	try {
		execSync(cmd, { stdio: "pipe", cwd: root });
	} catch (error) {
		process.stderr.write(`[hook] "${cmd}" falló tras editar ${name}:\n${error.stdout ?? ""}${error.stderr ?? ""}`);
		process.exit(2);
	}
};

if (name === "schema.prisma") run(`${bin("prisma")} validate && ${bin("prisma")} generate`);
else if (file.endsWith(".ts")) run(`${bin("tsc")} --noEmit`);
