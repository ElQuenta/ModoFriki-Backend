const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const cache = path.resolve(root, execFileSync("git", ["rev-parse", "--git-path", "codex-hooks"], {
  cwd: root, encoding: "utf8", windowsHide: true, timeout: 10000
}).trim());

function fingerprint(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file).update("\0");
    hash.update(fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : "<missing>");
  }
  return hash.digest("hex");
}

function unchanged(name, hash) {
  try { return fs.readFileSync(path.join(cache, name), "utf8") === hash; }
  catch (error) { if (error.code !== "ENOENT") throw error; return false; }
}

function remember(name, hash) {
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, name), hash);
}

function run(command, args, timeout = 45000) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", windowsHide: true, timeout
  });
  if (result.error) throw new Error(`No se pudo ejecutar ${command}: ${result.error.code}`);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} fallo:\n${((result.stdout || "") + (result.stderr || "")).trim().slice(-3000)}`);
  }
}

// npm.cmd necesita cmd.exe; estos argumentos son constantes, nunca datos del evento.
const npm = (...args) => process.platform === "win32"
  ? run("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`])
  : run("npm", args);
const report = (systemMessage) => console.log(JSON.stringify(systemMessage ? { systemMessage } : {}));

module.exports = { fs, path, root, cache, fingerprint, unchanged, remember, run, npm, report };
