# GSP — Local PostgreSQL + Express Server Setup

This guide walks you through running GSP entirely locally on Windows 11:
PostgreSQL database + Node.js/Express API + Vite frontend.

---

## Prerequisites

- **Node.js 18+** installed (download from https://nodejs.org)
- **Git Bash** or **PowerShell** terminal
- Windows 11

---

## Step 1 — Install PostgreSQL on Windows

1. Download the **PostgreSQL 16** installer (EDB installer) from:
   https://www.postgresql.org/download/windows/

2. Run the installer. During setup use these settings:
   - **Installation directory**: leave default (`C:\Program Files\PostgreSQL\16`)
   - **Components**: keep all checked (PostgreSQL Server, pgAdmin 4, Stack Builder, Command Line Tools)
   - **Data directory**: leave default
   - **Password**: set a password for the `postgres` superuser — **write this down**
   - **Port**: `5432` (default — leave it)
   - **Locale**: leave default

3. Finish the install. Stack Builder will open — you can close/skip it.

---

## Step 2 — Add PostgreSQL to PATH

This lets you run `psql` from any terminal.

1. Open **Start → search "Environment Variables" → Edit the system environment variables**
2. Click **Environment Variables…**
3. Under **System variables**, find `Path` → click **Edit**
4. Click **New** and add:
   ```
   C:\Program Files\PostgreSQL\16\bin
   ```
5. Click OK on all dialogs.
6. **Restart your terminal** (close and reopen Git Bash / PowerShell / CMD).
7. Verify it works:
   ```bash
   psql --version
   # Should print: psql (PostgreSQL) 16.x
   ```

---

## Step 3 — Create the Database and User

Open a terminal and connect as the postgres superuser:

```bash
psql -U postgres
# Enter the password you set during install
```

Then run these SQL commands inside the `psql` prompt:

```sql
-- Create a dedicated database user (replace 'your_password' with something strong)
CREATE USER gsp_user WITH PASSWORD 'your_password';

-- Create the database
CREATE DATABASE gsp_db OWNER gsp_user;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE gsp_db TO gsp_user;

-- Exit psql
\q
```

---

## Step 4 — Apply the Schema

From the **project root** directory in your terminal:

```bash
psql -U gsp_user -d gsp_db -f db/schema.sql
```

Enter the `gsp_user` password when prompted. You should see output like:

```
CREATE EXTENSION
CREATE TYPE
CREATE TABLE
...
CREATE FUNCTION
```

> **Optional:** To avoid typing the password each time, create a pgpass file:
> ```
> # File: C:\Users\<YourName>\AppData\Roaming\postgresql\pgpass.conf
> localhost:5432:gsp_db:gsp_user:your_password
> ```

---

## Step 5 — Create Your First Admin User

The schema has no seed users for security. Create one manually.

Connect to the database:

```bash
psql -U gsp_user -d gsp_db
```

Then run inside `psql`:

```sql
-- Insert user (the hash below is for the password 'password' — change this!)
INSERT INTO public.users (id, email, password_hash)
VALUES (
  gen_random_uuid(),
  'admin@example.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
);

-- Get the new user's ID
SELECT id FROM public.users WHERE email = 'admin@example.com';

-- Insert their profile — paste the UUID from above where it says <id>
INSERT INTO public.profiles (id, full_name, email, role)
VALUES (
  '<id>',
  'Admin User',
  'admin@example.com',
  'admin'
);

\q
```

**To generate a bcrypt hash for your own password** (run this once in any terminal from the project root):

```bash
node -e "const b = require('bcryptjs'); b.hash('YourPassword123', 10).then(h => console.log(h));"
```

Copy the output hash and use it in the `INSERT` above instead of the default one.

---

## Step 6 — Configure the .env File

Open [.env](.env) in the project root and update these values:

```env
# Frontend (already set — leave as-is for local dev)
VITE_API_BASE_URL=/api
VITE_MEMBERS_ENDPOINT=/api/members

# Backend — fill these in with your actual values:
DATABASE_URL=postgresql://gsp_user:your_password@localhost:5432/gsp_db
JWT_SECRET=paste_a_long_random_string_here
JWT_EXPIRES_IN=7d
PORT=3001
CORS_ORIGIN=http://localhost:8080,http://localhost:8081,http://localhost:5173
```

**Generate a secure JWT secret** (run in terminal):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and paste it as your `JWT_SECRET`.

---

## Step 7 — Install Node.js Dependencies

From the project root:

```bash
npm install
```

This installs Express, postgres.js, bcryptjs, jsonwebtoken, tsx, concurrently, and all frontend packages.

---

## Step 8 — Run the Express API Server

```bash
npm run dev:server
```

Expected output:
```
GSP API server running on http://localhost:3001
```

**Verify it's working:**

```bash
# Health check
curl http://localhost:3001/health
# → {"ok":true}

# Test login (replace credentials with what you created in Step 5)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@example.com\",\"password\":\"password\"}"
# → {"token":"eyJ...","profile":{...}}
```

---

## Step 9 — Run Frontend + Backend Together

```bash
npm run dev:all
```

This starts both:
- **Vite frontend** → http://localhost:8080
- **Express API** → http://localhost:3001

Open http://localhost:8080 in your browser and log in with the admin credentials you created in Step 5.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `psql: command not found` | PostgreSQL not in PATH — redo Step 2 and restart terminal |
| `FATAL: password authentication failed` | Wrong password — double-check what you set during install |
| `ERROR: role "gsp_user" does not exist` | Run Step 3 first |
| `ERROR: type "public.user_role" already exists` | Schema partially applied — drop the DB and recreate: `DROP DATABASE gsp_db;` then redo Step 3–4 |
| `Error: Cannot find module 'express'` | Run `npm install` in the project root |
| `Error: DATABASE_URL environment variable is required` | Fill in `DATABASE_URL` in `.env` |
| `Error: connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL service not running — open Windows Services and start `postgresql-x64-16` |
| `FetchError: Failed to fetch` in browser | Express server not running — run `npm run dev:server` in a separate terminal |
| CORS error in browser | Confirm `CORS_ORIGIN` in `.env` includes your Vite port (default: `http://localhost:8080`) |
| Login returns 401 | Make sure you inserted both the `users` AND `profiles` rows in Step 5 |

---

## Verification Checklist

Run these to confirm everything is set up correctly:

```bash
# 1. Check database has your admin profile
psql -U gsp_user -d gsp_db -c "SELECT email, role FROM public.profiles;"

# 2. Check API health
curl http://localhost:3001/health

# 3. Test login via API
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@example.com\",\"password\":\"password\"}"

# 4. Open the app in browser
# http://localhost:8080/login — should log in and show the dashboard with real data
```

---

## Key Files Reference

| File | Purpose |
|---|---|
| [db/schema.sql](db/schema.sql) | Full PostgreSQL schema — apply in Step 4 |
| [db/migrate-from-supabase.sql](db/migrate-from-supabase.sql) | Only needed if migrating existing Supabase data |
| [server/index.ts](server/index.ts) | Express entry point |
| [server/db.ts](server/db.ts) | PostgreSQL connection (reads `DATABASE_URL`) |
| [.env](.env) | All environment variables — fill in Step 6 |
| [package.json](package.json) | Scripts: `dev:server`, `dev:all` |

---

---

# Docker Deployment — 24/7 Server Access

This section covers deploying GSP on a dedicated server PC using Docker so that **other computers on the same network** (and optionally the internet) can access it around the clock.

The project already includes:
- [docker-compose.yml](docker-compose.yml) — orchestrates PostgreSQL + backend + nginx/frontend
- [Dockerfile.backend](Dockerfile.backend) and [Dockerfile.frontend](Dockerfile.frontend)
- [nginx.conf](nginx.conf) — reverse proxy `/api/*` to the backend, serves the React SPA
- [.env.docker](.env.docker) — runtime secrets template

---

## Prerequisites

- **Server PC** — the machine that will run the app 24/7 (Windows 10/11 or Linux)
- **Docker Desktop** (Windows/Mac) or **Docker Engine** (Linux) — version 24+
- **Git** installed on the server PC (or copy the project folder manually)
- The server PC must be **on** and **network-connected** at all times

---

## Step 1 — Install Docker Desktop

### Windows
1. Download **Docker Desktop for Windows** from https://www.docker.com/products/docker-desktop
2. Run the installer. When prompted, keep **"Use WSL 2 instead of Hyper-V"** checked (recommended).
3. After install, **reboot** the PC.
4. Open Docker Desktop. Wait for the whale icon in the system tray to stop animating (engine is ready).
5. Verify in a terminal:
   ```bash
   docker --version
   # Docker version 24.x.x or newer
   docker compose version
   # Docker Compose version v2.x.x
   ```

### Linux (Ubuntu/Debian)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
docker compose version
```

---

## Step 2 — Get the Project on the Server PC

**Option A — Git clone (recommended if you have the repo):**
```bash
git clone <your-repo-url> GSP
cd GSP
```

**Option B — Copy the folder:**
Copy the entire project folder to the server PC (USB drive, network share, etc.) into a location like `C:\Apps\GSP` or `/home/user/GSP`.

> Make sure the folder contains `docker-compose.yml`, `Dockerfile.backend`, `Dockerfile.frontend`, `nginx.conf`, `db/schema.sql`, and `.env.docker`.

---

## Step 3 — Configure `.env.docker`

Open [.env.docker](.env.docker) in a text editor and fill in all `CHANGE_ME` values:

```env
# ── PostgreSQL ──────────────────────────────────────────────────────────────
POSTGRES_DB=gsp_db
POSTGRES_USER=gsp_user
POSTGRES_PASSWORD=YourStrongPasswordHere   # ← change this

# ── JWT ─────────────────────────────────────────────────────────────────────
JWT_SECRET=paste_your_64_char_random_hex_here   # ← change this
JWT_EXPIRES_IN=7d

# ── Ports ───────────────────────────────────────────────────────────────────
FRONTEND_PORT=80    # change to 8080 if port 80 is already in use
```

**Generate a secure JWT_SECRET** (run this in any terminal that has Node.js):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the 128-character output and paste it as `JWT_SECRET`.

> **Security:** Never commit `.env.docker` to git. It contains your database password and JWT secret.

---

## Step 4 — Build and Start the Containers

From the project root directory:

```bash
docker compose --env-file .env.docker up -d --build
```

What this does:
- **Builds** the frontend (React → Nginx) and backend (Node/Express) images
- **Pulls** the official PostgreSQL 16 image
- **Starts** all three containers in the background (`-d`)
- **Applies the schema** automatically on first run (via `db/schema.sql`)

Expected output:
```
[+] Building ...
[+] Running 3/3
 ✔ Container gsp_postgres   Started
 ✔ Container gsp_backend    Started
 ✔ Container gsp_frontend   Started
```

Check that all containers are healthy:
```bash
docker ps
# All three containers should show STATUS: Up ... (healthy)
```

---

## Step 5 — Grant Permissions

Grant the app user access to all tables (run this once after the schema is applied):

```bash
docker exec -it gsp_postgres psql -U postgres -d gsp_db -c \
  "GRANT ALL ON ALL TABLES IN SCHEMA public TO gsp_user; \
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO gsp_user;"
```

---

## Step 6 — Create the First Admin User

The database starts empty (no users). Create your admin account:

```bash
# Open a psql shell inside the postgres container
docker exec -it gsp_postgres psql -U gsp_user -d gsp_db
```

Inside the `psql` prompt, run:

```sql
-- Generate a bcrypt hash for your password first (run outside psql):
-- node -e "const b=require('bcryptjs');b.hash('YourPassword123',10).then(h=>console.log(h));"
-- Then paste the hash below:

INSERT INTO public.users (id, email, password_hash)
VALUES (
  gen_random_uuid(),
  'admin@yourorg.com',
  '$2a$10$PASTE_YOUR_BCRYPT_HASH_HERE'
);

-- Get the new user's ID
SELECT id FROM public.users WHERE email = 'admin@yourorg.com';

-- Create the profile (paste the UUID from the SELECT above)
INSERT INTO public.profiles (id, full_name, email, role)
VALUES (
  '<paste-uuid-here>',
  'Admin User',
  'admin@yourorg.com',
  'admin'
);

\q
```

**To generate a bcrypt hash** (run this in a separate terminal from the project root):
```bash
node -e "const b = require('bcryptjs'); b.hash('YourPassword123', 10).then(h => console.log(h));"
```

---

## Step 7 — Verify Everything Is Running

```bash
# 1. Check all containers are healthy
docker ps

# 2. Test the backend health endpoint
curl http://localhost:3001/health
# → {"ok":true}

# 3. Open the app in a browser ON THE SERVER PC
# http://localhost
# (or http://localhost:8080 if you set FRONTEND_PORT=8080)
```

Log in with the admin credentials you created in Step 6. You should see the GSP dashboard.

---

## Step 8 — Access From Other Computers on the Same Network

### Find the server PC's IP address

On the **server PC**, open a terminal:

```bash
# Windows:
ipconfig
# Look for: "IPv4 Address . . . : 192.168.x.x"

# Linux:
ip addr show
# Look for: inet 192.168.x.x
```

Example: your server IP is `192.168.1.50`

### Open the app on any other computer

On **any other device on the same Wi-Fi or LAN**, open a browser and go to:

```
http://192.168.1.50
```

Or if you used `FRONTEND_PORT=8080`:
```
http://192.168.1.50:8080
```

> **No extra setup needed.** The app is already served over HTTP on your local network.

---

## Step 9 — Make It Auto-Start on Boot (Always On)

The containers are already configured with `restart: unless-stopped`, meaning Docker will restart them automatically after a crash or container stop. You just need Docker itself to start with Windows.

### Windows — Docker Desktop auto-start
1. Open **Docker Desktop**
2. Click the gear icon → **Settings**
3. Under **General**, check **"Start Docker Desktop when you log in"**
4. Click **Apply & Restart**

> The containers will restart automatically whenever Docker starts, which is on every Windows login.

### Windows — Auto-login (optional, for unattended servers)
If the server PC needs to restart without anyone being present to log in:

1. Press `Win + R` → type `netplwiz` → Enter
2. Uncheck **"Users must enter a user name and password"**
3. Enter your Windows password when prompted → OK

This ensures Windows logs in automatically after a reboot, which triggers Docker Desktop to start.

---

## Step 10 — Internet Access (Optional)

To allow access from **outside your local network** (over the internet):

### Option A — Router Port Forwarding (simplest)
1. Log into your router admin page (usually `http://192.168.1.1`)
2. Find **Port Forwarding** or **Virtual Server** settings
3. Add a rule:
   - **External port:** 80 (or 8080)
   - **Internal IP:** 192.168.1.50 (your server PC's IP)
   - **Internal port:** 80 (or 8080, matching `FRONTEND_PORT`)
   - **Protocol:** TCP
4. Save. Users can now access via `http://<your-public-ip>`

> Find your public IP at https://whatismyip.com

### Option B — Cloudflare Tunnel (recommended, free, no port forwarding)
Cloudflare Tunnel gives you a permanent public URL without opening router ports:

```bash
# Install cloudflared on the server PC
# Windows: winget install --id Cloudflare.cloudflared
# Linux:   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared

# Log in to Cloudflare (opens browser)
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create gsp-tunnel

# Route your domain to the tunnel (replace with your actual domain/subdomain)
cloudflared tunnel route dns gsp-tunnel gsp.yourdomain.com

# Run the tunnel (proxies Cloudflare → your local port 80)
cloudflared tunnel run --url http://localhost:80 gsp-tunnel
```

Users access via `https://gsp.yourdomain.com` — fully encrypted, no open router ports.

---

## Updating the App

When you push new code and want to redeploy:

```bash
# 1. Pull the latest code
git pull

# 2. Rebuild and restart (database data is preserved in the postgres_data volume)
docker compose --env-file .env.docker up -d --build
```

> The `postgres_data` Docker volume is **never deleted** by `up --build`. Your data is safe.

---

## Useful Management Commands

```bash
# View logs from all containers (follow mode)
docker compose --env-file .env.docker logs -f

# View logs from just one container
docker logs gsp_backend -f
docker logs gsp_frontend -f
docker logs gsp_postgres -f

# Stop all containers (data is preserved)
docker compose --env-file .env.docker down

# Restart all containers
docker compose --env-file .env.docker restart

# Open a psql shell in the database
docker exec -it gsp_postgres psql -U gsp_user -d gsp_db

# Backup the database to a file
docker exec gsp_postgres pg_dump -U gsp_user gsp_db > backup-$(date +%Y%m%d).sql

# Restore a backup
docker exec -i gsp_postgres psql -U gsp_user -d gsp_db < backup-20260315.sql
```

---

## Docker Troubleshooting

| Problem | Fix |
|---|---|
| `docker: command not found` | Docker Desktop not installed or not started — open Docker Desktop and wait for it to be ready |
| Container shows `unhealthy` | Run `docker logs gsp_backend` to see the error |
| `port is already allocated` | Port 80 is in use. Change `FRONTEND_PORT=8080` in `.env.docker` and re-run `up -d --build` |
| Can't access from other computers | Check Windows Firewall — allow inbound TCP on port 80 (or 8080): `netsh advfirewall firewall add rule name="GSP" dir=in action=allow protocol=TCP localport=80` |
| App loads but login fails | Admin user not created yet — complete Step 6 |
| `permission denied for table ...` | Run the GRANT commands in Step 5 |
| Database data lost after `down` | Data is in the `postgres_data` volume — only `down -v` deletes volumes. Never use `-v` unless intentionally wiping data |
| Containers don't auto-start after reboot | Make sure "Start Docker Desktop when you log in" is enabled (Step 9) and Windows auto-login is configured |
