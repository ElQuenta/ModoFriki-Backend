const { fs, path, root, cache, fingerprint, unchanged, remember, npm, report } = require("./shared.cjs");

// Evita que herramientas/subagentes regeneren el mismo cliente simultaneamente.
const lock = path.join(cache, "prisma.lock");
let locked = false;
try {
  fs.mkdirSync(cache, { recursive: true });
  try {
    fs.mkdirSync(lock);
    locked = true;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    // Un hook interrumpido puede dejar el directorio vacio; caduca en dos minutos.
    if (Date.now() - fs.statSync(lock).mtimeMs > 120000) fs.rmdirSync(lock);
    report();
    return;
  }
  const hash = fingerprint(["prisma/schema.prisma", "prisma.config.ts", "package.json", "package-lock.json"]);
  const force = process.argv.includes("--force");
  const clientExists = fs.existsSync(path.join(root, "src/generated/prisma/client.ts"));
  if (!force && clientExists && unchanged("prisma", hash)) {
    report();
    return;
  }
  npm("run", "prisma:validate");
  npm("run", "prisma:generate");
  remember("prisma", hash);
  report("Prisma: schema validado y cliente regenerado.");
} catch (error) {
  report(`Hook Prisma: ${error.message}`);
  if (process.argv.includes("--force")) process.exitCode = 1;
} finally {
  if (locked) fs.rmdirSync(lock);
}
