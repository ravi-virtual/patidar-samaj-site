// Starts a local MongoDB for development, bound to 127.0.0.1 only (never exposed to the network).
// Data lives in ./.data/mongo (git-ignored). Works on Windows, macOS and Linux.
//
// mongod is located in this order:
//   1. MONGOD_PATH environment variable (full path to mongod / mongod.exe)
//   2. mongod on PATH (e.g. a service/package-manager install)
//   3. the default portable location used in docs/setup.md
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const exe = isWindows ? 'mongod.exe' : 'mongod';
// 27018, not the default 27017: many machines already run another MongoDB there (for example a
// Windows service), and Windows lets two servers bind the same port, so clients would silently
// reach the wrong one. Override with MONGO_PORT (and MONGO_URI in backend/.env) if you wish.
const port = process.env.MONGO_PORT ?? '27018';

const onPath = () => {
  const probe = spawnSync(isWindows ? 'where' : 'which', [exe], { encoding: 'utf8' });
  return probe.status === 0 ? probe.stdout.split(/\r?\n/)[0].trim() : null;
};

const candidates = [
  process.env.MONGOD_PATH,
  onPath(),
  join(homedir(), 'mongodb', 'bin', exe),
].filter(Boolean);

const mongod = candidates.find((p) => existsSync(p));
if (!mongod) {
  console.error('Could not find mongod. Install MongoDB Community Server (see docs/setup.md)');
  console.error('or set MONGOD_PATH to the full path of the mongod executable.');
  process.exit(1);
}

// Refuse to start if something already listens on the port (see note above).
const portInUse = await new Promise((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port: Number(port) });
  socket.once('connect', () => (socket.destroy(), resolve(true)));
  socket.once('error', () => resolve(false));
});
if (portInUse) {
  console.error(`Port ${port} is already in use on 127.0.0.1 — another MongoDB may be running.`);
  console.error('Stop it, or choose a free port with MONGO_PORT and update MONGO_URI in backend/.env.');
  process.exit(1);
}

const dbPath = join(root, '.data', 'mongo');
mkdirSync(dbPath, { recursive: true });

console.log(`Starting ${mongod}`);
console.log(`  data: ${dbPath}`);
console.log(`  bind: 127.0.0.1:${port}  (local only)`);

const child = spawn(mongod, ['--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', port], {
  stdio: 'inherit',
});

const stop = (signal) => child.kill(signal);
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
