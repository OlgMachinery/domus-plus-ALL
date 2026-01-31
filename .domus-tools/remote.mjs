import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'ssh2';

function stripJsonc(input) {
  // Remove /* */ comments
  let s = input.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove // comments
  s = s.replace(/(^|[^:])\/\/.*$/gm, '$1');
  // Remove trailing commas
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

function readDomusSshConfig() {
  const cfgPath = path.resolve(process.cwd(), '..', 'sync_config.jsonc');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  const parsed = JSON.parse(stripJsonc(raw));
  const domus = parsed?.domus_plus;
  if (!domus?.host || !domus?.username || !domus?.password) {
    throw new Error('No se encontró configuración válida `domus_plus` en sync_config.jsonc');
  }
  return {
    host: domus.host,
    port: domus.port || 22,
    username: domus.username,
    password: domus.password,
    remotePath: domus.remotePath || '/var/www/domus-plus',
  };
}

function execRemote(command) {
  const cfg = readDomusSshConfig();
  const conn = new Client();
  console.error(`[domus-ssh] conectando a ${cfg.host}:${cfg.port} ...`);
  const watchdog = setTimeout(() => {
    console.error('[domus-ssh] watchdog: aún no hay conexión (posible bloqueo de red/firewall/credenciales)');
  }, 5000);

  conn
    .on('ready', () => {
      clearTimeout(watchdog);
      console.error(`[domus-ssh] conectado a ${cfg.host}:${cfg.port}`);
      conn.exec(command, { pty: false }, (err, stream) => {
        if (err) {
          console.error(err.message || String(err));
          conn.end();
          process.exit(1);
        }

        stream
          .on('close', (code) => {
            console.error(`[domus-ssh] comando finalizó con code=${code}`);
            conn.end();
            process.exit(typeof code === 'number' ? code : 0);
          })
          .on('data', (data) => process.stdout.write(data));

        stream.stderr.on('data', (data) => process.stderr.write(data));
      });
    })
    .on('error', (e) => {
      clearTimeout(watchdog);
      console.error(e?.message || String(e));
      process.exit(1);
    })
    .connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      password: cfg.password,
      // Avoid interactive host key prompt
      hostVerifier: () => true,
      readyTimeout: 20000,
    });
}

const cmd = process.argv.slice(2).join(' ').trim();
if (!cmd) {
  console.error('Uso: node remote.mjs "<comando>"');
  process.exit(2);
}

execRemote(cmd);


