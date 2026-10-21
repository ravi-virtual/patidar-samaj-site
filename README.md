# Uttar Gujarat Kadva Patidar Samaj — community portal

Public website, member workspace and admin panel for the Uttar Gujarat Kadva Patidar Samaj, built
from the client-approved **Design 2 — Modern Platform** prototype. MERN stack in TypeScript.

> **Status:** all eight phases implemented — public website, member workspace, admin panel and API.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **24.22.0** (LTS "Krypton") | Pinned in `.nvmrc`; the same version for frontend and backend |
| npm | 11.19.1 or newer | Bundled with Node 24.22.0 |
| MongoDB Community Server | 8.0.x | Local, bound to `127.0.0.1` |
| Git | any recent | |

### Node.js

Windows (nvm-windows), PowerShell:

```powershell
nvm install 24.22.0
nvm use 24.22.0
node -v   # v24.22.0
```

macOS / Linux (nvm):

```bash
nvm install    # reads .nvmrc
nvm use
```

`npm run check:node` fails with instructions if the running Node differs from `.nvmrc`.

### MongoDB (no admin rights needed)

1. Download the **ZIP** for Windows from <https://www.mongodb.com/try/download/community>
   (or the direct 8.0.34 archive) and extract it so that `mongod.exe` is at
   `C:\Users\<you>\mongodb\bin\mongod.exe`. On macOS/Linux install via your package manager
   (`brew install mongodb-community`, `apt`, …) so `mongod` is on your `PATH`.
2. Start it from the repo root (keep this terminal open):

   ```powershell
   npm run mongo:start
   ```

   Data is stored in `.data/mongo` (git-ignored) and the server listens on `127.0.0.1:27018` only (not the default 27017, so it cannot clash with another MongoDB on the machine).
   If `mongod` is installed somewhere else set `MONGOD_PATH` to its full path.
3. Verify: `npm run db:check` prints `OK  connected, server v8.0.x`.

If you prefer another MongoDB (a service, Docker, Atlas free tier), skip step 2 and point `MONGO_URI` in `backend/.env` at it.

> If the project MongoDB is killed forcibly (power loss, Task Manager) its journal can fail to
> recover on some CPUs. For development data this is harmless: delete `.data/mongo`, start again
> and re-run `npm run seed`.

## First-time setup

```powershell
git clone https://github.com/ravi-virtual/patidar-samaj-site.git
cd patidar-samaj-site
npm run install:all                      # root + backend + frontend
copy backend\.env.example backend\.env   # macOS/Linux: cp backend/.env.example backend/.env
```

Edit `backend/.env` and set a real `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Sample data and the first administrator

Development (needs `ENABLE_DEV_SEED=true` in `backend/.env`):

```powershell
npm run seed            # fictional events, news, FAQs, members and five sample accounts
```

The sample passwords are random and printed **once**; they are not stored anywhere. `--reset-passwords`
issues new ones. The seed refuses to run when `NODE_ENV=production`.

Production (and any real environment) has no seed. Create the first Super Admin with the CLI, which
asks for the password with hidden input and refuses to run if a Super Admin already exists:

```powershell
npm run bootstrap:superadmin --prefix backend
```

All other staff are created by a Super Admin in the admin panel. There is no email provider, so
the panel hands the administrator a one-time setup or reset link to pass on.

## Daily commands

| Command | What it does |
|---|---|
| `npm run mongo:start` | Start local MongoDB (separate terminal) |
| `npm run dev` | API on `:5000` and web app on `:5173` together |
| `npm run build` | Type-check and build both apps |
| `npm run lint` | ESLint, backend and frontend |
| `npm run typecheck` | `tsc` in both apps |
| `npm test` | Unit tests, backend and frontend |
| `npm run test:integration` | Backend integration tests (needs MongoDB running) |
| `npm run seed` | Development sample data (see above) |
| `npm run db:check` | Verify the MongoDB connection |
| `npm run audit` | `npm audit` for production dependencies |

Open <http://localhost:5173>. With the sample data loaded, sign in with one of the accounts printed by
`npm run seed` (member, viewer, editor, admin, super admin).

## Repository layout

```
backend/    Express + Mongoose API (TypeScript)
frontend/   React + Vite + Tailwind app (TypeScript)
scripts/    Node version check, local MongoDB launcher
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Node.js version mismatch` | `nvm use 24.22.0`, open a new terminal |
| `FATAL: Missing required env var` | Create `backend/.env` from `backend/.env.example` |
| `Could not connect to MongoDB` | Run `npm run mongo:start` and `npm run db:check` |
| `Port 5000 is already in use` | Stop the other process or change `PORT` in `backend/.env` (and the Vite proxy target) |
| Clean reinstall | Delete `node_modules` in the root, `backend/` and `frontend/`, then `npm run install:all` |

