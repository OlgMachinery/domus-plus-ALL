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
    remotePath: domus.remotePath || "/var/www/domus-plus",
  };
}

function parseArgs(argv) {
  const out = { timeoutMs: 15000, cmd: "" };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === "--timeout" && args[0]) {
      out.timeoutMs = Math.max(1000, Number(args.shift()));
      continue;
    }
    out.cmd = [a, ...args].join(" ").trim();
    break;
  }
  return out;
}

async function execRemote(cmd, timeoutMs) {
  const cfg = readDomusConfig();
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn
      .on("ready", resolve)
      .on("error", reject)
      .connect({
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        password: cfg.password,
        hostVerifier: () => true,
        readyTimeout: 20000,
      });
  });

  const { code } = await new Promise((resolve) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) {
        process.stderr.write(String(err?.message || err) + "\n");
        conn.end();
        return resolve({ code: 1 });
      }

      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try {
          stream.close?.();
        } catch {
          // ignore
        }
        try {
          stream.destroy?.();
        } catch {
          // ignore
        }
        conn.end();
        process.stderr.write(`[domus-ssh] timeout (${timeoutMs}ms)\n`);
        resolve({ code: 124 });
      }, timeoutMs);

      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (c) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        conn.end();
        resolve({ code: typeof c === "number" ? c : 0 });
      });
    });
  });

  process.exit(code);
}

const { timeoutMs, cmd } = parseArgs(process.argv.slice(2));
if (!cmd) {
  process.stderr.write('Uso: node .domus-tools/remote_exec.mjs [--timeout 15000] "<cmd>"\n');
  process.exit(2);
}

execRemote(cmd, timeoutMs).catch((e) => {
  process.stderr.write(String(e?.message || e) + "\n");
  process.exit(1);
});


