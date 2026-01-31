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
    remoteRoot: domus.remotePath || "/var/www/domus-plus",
  };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function isDir(entry) {
  // ssh2 SFTP attrs uses mode bits
  // eslint-disable-next-line no-bitwise
  return (entry.attrs.mode & 0o170000) === 0o040000;
}

async function withSftp(conn) {
  return await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
  });
}

async function readdir(sftp, remoteDir) {
  return await new Promise((resolve, reject) => {
    sftp.readdir(remoteDir, (err, list) => (err ? reject(err) : resolve(list)));
  });
}

async function fastGet(sftp, remote, local) {
  ensureDir(path.dirname(local));
  return await new Promise((resolve, reject) => {
    sftp.fastGet(remote, local, {}, (err) => (err ? reject(err) : resolve()));
  });
}

async function downloadTree(sftp, remoteDir, localDir, filterFn) {
  const list = await readdir(sftp, remoteDir);
  for (const entry of list) {
    const name = entry.filename;
    const remotePath = `${remoteDir}/${name}`;
    const localPath = path.join(localDir, name);

    if (isDir(entry)) {
      await downloadTree(sftp, remotePath, localPath, filterFn);
      continue;
    }

    if (filterFn && !filterFn(remotePath)) continue;
    await fastGet(sftp, remotePath, localPath);
    process.stdout.write(`GET ${remotePath}\n`);
  }
}

async function main() {
  const cfg = readDomusConfig();
  const localRoot = path.resolve(process.cwd(), ".domus-cache", "domus-plus");
  ensureDir(localRoot);

  const conn = new Client();
  process.stdout.write(`[pull] conectando a ${cfg.host}:${cfg.port}\n`);

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

  const sftp = await withSftp(conn);

  const remoteFrontend = `${cfg.remoteRoot}/frontend`;
  const localFrontend = path.join(localRoot, "frontend");

  // Pull only relevant subtree for receipts + api routes to keep it small.
  const allow = (remotePath) => {
    if (remotePath.endsWith(".ts") || remotePath.endsWith(".tsx") || remotePath.endsWith(".json") || remotePath.endsWith(".cjs") || remotePath.endsWith(".mjs")) {
      return true;
    }
    if (remotePath.endsWith(".env.production")) return true;
    return false;
  };

  // API routes: domus-receipts
  await downloadTree(
    sftp,
    `${remoteFrontend}/src/app/api/domus-receipts`,
    path.join(localFrontend, "src/app/api/domus-receipts"),
    allow
  );

  // Frontend UI for receipts
  await downloadTree(
    sftp,
    `${remoteFrontend}/src/app/receipts`,
    path.join(localFrontend, "src/app/receipts"),
    allow
  );

  // Shared libs potentially used by receipts
  await downloadTree(
    sftp,
    `${remoteFrontend}/src/lib`,
    path.join(localFrontend, "src/lib"),
    (p) => allow(p) && /\/(supabase|http|i18n|auth)\//.test(p)
  );

  // PM2 ecosystem file (root)
  await fastGet(sftp, `${cfg.remoteRoot}/ecosystem.config.cjs`, path.join(localRoot, "ecosystem.config.cjs"));
  process.stdout.write(`GET ${cfg.remoteRoot}/ecosystem.config.cjs\n`);

  conn.end();
  process.stdout.write(`[pull] listo. local=${localRoot}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e?.message || e) + "\n");
  process.exit(1);
});


