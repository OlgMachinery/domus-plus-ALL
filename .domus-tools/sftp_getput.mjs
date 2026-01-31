import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "ssh2";

function stripJsonc(input) {
  let s = input.replace(/\/\*[\s\S]*?\*\//g, "");
  s = s.replace(/(^|[^:])\/\/.*$/gm, "$1");
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
}

function readDomusConfig() {
  const cfgPath = path.resolve(process.cwd(), "sync_config.jsonc");
  const raw = fs.readFileSync(cfgPath, "utf8");
  const parsed = JSON.parse(stripJsonc(raw));
  const domus = parsed?.domus_plus;
  if (!domus?.host || !domus?.username || !domus?.password) {
    throw new Error("No se encontró configuración válida `domus_plus` en sync_config.jsonc");
  }
  return {
    host: domus.host,
    port: domus.port || 22,
    username: domus.username,
    password: domus.password,
  };
}

function usage() {
  process.stderr.write(
    "Uso:\n" +
      '  node .domus-tools/sftp_getput.mjs [--timeout 20000] get "<remote>" "<local>"\n' +
      '  node .domus-tools/sftp_getput.mjs [--timeout 20000] put "<local>" "<remote>"\n'
  );
}

function parseArgs(argv) {
  const out = { timeoutMs: 20000, rest: [] };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === "--timeout" && args[0]) {
      const n = Number(args.shift());
      out.timeoutMs = Number.isFinite(n) ? Math.max(1000, n) : out.timeoutMs;
      continue;
    }
    out.rest.push(a, ...args);
    break;
  }
  return out;
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms (${label})`)), timeoutMs);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), t]);
}

async function main() {
  const { timeoutMs, rest } = parseArgs(process.argv.slice(2));
  const [mode, a, b] = rest;
  if (!mode || !a || !b || !["get", "put"].includes(mode)) {
    usage();
    process.exit(2);
  }

  const cfg = readDomusConfig();
  const conn = new Client();
  process.stderr.write(`[sftp] conectando a ${cfg.host}:${cfg.port}\n`);
  await withTimeout(
    new Promise((resolve, reject) => {
      conn
        .on("ready", resolve)
        .on("error", reject)
        .connect({
          host: cfg.host,
          port: cfg.port,
          username: cfg.username,
          password: cfg.password,
          hostVerifier: () => true,
          readyTimeout: Math.min(20000, timeoutMs),
        });
    }),
    timeoutMs,
    "connect"
  );

  const sftp = await withTimeout(
    new Promise((resolve, reject) => {
      conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
    }),
    timeoutMs,
    "sftp"
  );

  if (mode === "get") {
    const remote = a;
    const local = b;
    fs.mkdirSync(path.dirname(local), { recursive: true });
    process.stderr.write(`[sftp] GET ${remote} -> ${local}\n`);
    await withTimeout(
      new Promise((resolve, reject) => {
        sftp.fastGet(remote, local, {}, (err) => (err ? reject(err) : resolve()));
      }),
      timeoutMs,
      "fastGet"
    );
  } else {
    const local = a;
    const remote = b;
    process.stderr.write(`[sftp] PUT ${local} -> ${remote}\n`);
    await withTimeout(
      new Promise((resolve, reject) => {
        sftp.fastPut(local, remote, {}, (err) => (err ? reject(err) : resolve()));
      }),
      timeoutMs,
      "fastPut"
    );
  }

  conn.end();
  process.stderr.write("[sftp] listo\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.message || e) + "\n");
  process.exit(1);
});


