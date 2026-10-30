import { commentCreationRepository } from "../repositories/community/comment-creation.repository";

const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
const apply = args.includes("--apply");
const authorId = value("--author");
const ids = (value("--ids") ?? "").split(",").map(id => id.trim()).filter(Boolean);

if (!authorId || ids.length === 0 || ids.length > 100) {
	console.error("Usage: tsx src/scripts/reconcile-comment-creations.ts --author <uuid> --ids <uuid,...> [--apply]");
	process.exitCode = 1;
} else if (!apply) {
	console.info(JSON.stringify({ mode: "inspect", authorId, requested: ids.length, ids }));
} else {
	commentCreationRepository.rejectExpired(authorId, ids)
		.then(rejected => console.info(JSON.stringify({ mode: "apply", requested: ids.length, rejected, code: "EXPIRED" })))
		.catch(() => { console.error(JSON.stringify({ mode: "apply", error: "reconciliation unavailable" })); process.exitCode = 1; });
}
