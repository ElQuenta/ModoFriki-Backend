const { fs, path, root, fingerprint, unchanged, remember, run, npm, report } = require("./shared.cjs");

function sources(directory = "src") {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (file === "src/generated") return [];
    if (entry.isDirectory()) return sources(file);
    return entry.isFile() && file.endsWith(".ts") ? [file] : [];
  });
}

const manual = process.argv.includes("--manual");
let event = {};
try {
  if (!manual) event = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  run("git", ["diff", "--check"], 10000);
  run("git", ["diff", "--cached", "--check"], 10000);
  const hash = fingerprint(["tsconfig.json", "package.json", "package-lock.json",
    "prisma/schema.prisma", "prisma.config.ts", ...sources()]);
  if (!manual && unchanged("typescript", hash)) {
    report();
    return;
  }
  npm("run", "build", "--", "--noEmit");
  remember("typescript", hash);
  report("Checks: TypeScript y espacios del diff correctos (sin generar dist).");
} catch (error) {
  const message = `Hook de comprobacion: ${error.message}`;
  // Solo solicita una continuacion; evita bucles si el error no se puede corregir.
  if (!manual && event.hook_event_name === "Stop" && !event.stop_hook_active) {
    console.log(JSON.stringify({ decision: "block", reason: message }));
  } else {
    report(message);
  }
  if (manual) process.exitCode = 1;
}
