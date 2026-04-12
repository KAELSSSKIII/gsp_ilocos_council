# GSP Docker Deployment Guide

This guide explains how to deploy the GSP Business Suite with Docker.

The Docker setup runs three services:

- `gsp_postgres`: PostgreSQL 16 database
- `gsp_backend`: Express API server
- `gsp_frontend`: nginx server for the React/Vite frontend

Current recommended local URL:

```text
http://127.0.0.1:8081
```

Use `8081` because port `8080` may already be used by Apache/EnterpriseDB on this machine.

## 1. Requirements

Install these first:

- Docker Desktop
- Node.js, only needed for generating secrets or password hashes outside Docker
- PowerShell

Verify Docker is ready:

```powershell
docker --version
docker compose version
```

## 2. Project Files Used By Docker

Required files:

```text
docker-compose.yml
Dockerfile.backend
Dockerfile.frontend
nginx.conf
db/schema.sql
db/migrate-products.sql
extracted_products.sql
.env.production
.env.docker
```

Important behavior:

- `db/schema.sql` creates the database tables.
- `db/migrate-products.sql` imports product categories.
- `extracted_products.sql` imports product rows.
- Product import files only run automatically when the Docker database volume is created for the first time.
- Existing Docker volumes do not rerun `/docker-entrypoint-initdb.d` scripts.

## 3. Create `.env.docker`

Create or edit `.env.docker` in the project root.

Use this format:

```env
POSTGRES_DB=gsp_db
POSTGRES_USER=gsp_user
POSTGRES_PASSWORD=replace_with_a_strong_database_password

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d

FRONTEND_PORT=8081
```

Generate a strong JWT secret:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Security notes:

- Do not commit `.env.docker`.
- Use a long random `POSTGRES_PASSWORD`.
- Use a long random `JWT_SECRET`.
- If a password or secret was shared publicly, rotate it.

## 4. Build And Start The System

From the project root:

```powershell
cd C:\Users\KAELLLSKIII\Desktop\Web-Projects\GSP
docker compose --env-file .env.docker up -d --build
```

This builds and starts:

```text
gsp_postgres
gsp_backend
gsp_frontend
```

Check status:

```powershell
docker ps --filter name=gsp
```

Expected:

```text
gsp_postgres   healthy
gsp_backend    healthy
gsp_frontend   running
```

## 5. Verify The App

Check backend health through nginx:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8081/health
```

Expected:

```json
{"ok":true,"db":"connected"}
```

Open the frontend:

```text
http://127.0.0.1:8081/login
```

If the page is blank after a rebuild:

```text
Ctrl + Shift + R
```

Or open:

```text
http://127.0.0.1:8081/login?fresh=1
```

## 6. Create The First Admin User

The database starts without users. Create the first admin after the containers are running.

Run this from PowerShell:

```powershell
$Password = Read-Host "New admin password"
$Hash = docker exec gsp_backend node -e "const b=require('bcryptjs'); b.hash(process.argv[1], 10).then(console.log)" $Password
$Sql = "WITH inserted AS (INSERT INTO public.users (username, password_hash) VALUES ('admin', '$Hash') ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id, username) INSERT INTO public.profiles (id, full_name, username, role) SELECT id, 'Admin User', username, 'admin'::public.user_role FROM inserted ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, username = EXCLUDED.username, role = EXCLUDED.role;"
docker exec gsp_postgres psql -U gsp_user -d gsp_db -c $Sql
```

Login with:

```text
Username: admin
Password: the password you entered
```

After logging in, change the password if it was shared or reused.

## 7. Verify Product Migration

Check product and category counts:

```powershell
docker exec gsp_postgres psql -U gsp_user -d gsp_db -c "SELECT COUNT(*) AS products FROM public.products; SELECT COUNT(*) AS categories FROM public.product_categories;"
```

Expected after import:

```text
products:   361
categories: 51
```

If the counts are `0`, run the manual product import steps below.

## 8. Manual Product Import For Existing Volumes

Only use this if the Docker volume already existed before product import files were added.

Add missing import columns:

```powershell
docker exec gsp_postgres psql -U gsp_user -d gsp_db -c "ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_id UUID; ALTER TABLE public.products ADD COLUMN IF NOT EXISTS last_restocked_at TIMESTAMPTZ; ALTER TABLE public.products ADD COLUMN IF NOT EXISTS restock_interval_days INTEGER;"
```

Copy import files into the database container:

```powershell
docker cp db\migrate-products.sql gsp_postgres:/tmp/migrate-products.sql
docker cp extracted_products.sql gsp_postgres:/tmp/extracted_products.sql
```

Run category import first:

```powershell
docker exec gsp_postgres psql -v ON_ERROR_STOP=1 -U gsp_user -d gsp_db -f /tmp/migrate-products.sql
```

Run product import second:

```powershell
docker exec gsp_postgres psql -v ON_ERROR_STOP=1 -U gsp_user -d gsp_db -f /tmp/extracted_products.sql
```

Verify:

```powershell
docker exec gsp_postgres psql -U gsp_user -d gsp_db -c "SELECT COUNT(*) AS products FROM public.products; SELECT COUNT(*) AS categories FROM public.product_categories;"
```

## 9. Access From Another Computer

Find the server PC IP address:

```powershell
ipconfig
```

Look for the IPv4 address, for example:

```text
192.168.1.50
```

Open from another device on the same network:

```text
http://192.168.1.50:8081
```

If another computer cannot connect, allow the port through Windows Firewall:

```powershell
netsh advfirewall firewall add rule name="GSP Docker App 8081" dir=in action=allow protocol=TCP localport=8081
```

## 10. Updating The App

After code changes:

```powershell
docker compose --env-file .env.docker up -d --build
```

The database data is preserved because it is stored in the Docker volume:

```text
postgres_data
```

Do not use `down -v` unless you intentionally want to delete the database.

## 11. Stop, Start, Restart

Stop containers but keep data:

```powershell
docker compose --env-file .env.docker down
```

Start containers:

```powershell
docker compose --env-file .env.docker up -d
```

Restart containers:

```powershell
docker compose --env-file .env.docker restart
```

Rebuild containers:

```powershell
docker compose --env-file .env.docker up -d --build
```

## 12. Logs And Debugging

View all logs:

```powershell
docker compose --env-file .env.docker logs -f
```

Backend logs:

```powershell
docker logs gsp_backend -f
```

Frontend logs:

```powershell
docker logs gsp_frontend -f
```

Database logs:

```powershell
docker logs gsp_postgres -f
```

Open a PostgreSQL shell:

```powershell
docker exec -it gsp_postgres psql -U gsp_user -d gsp_db
```

## 13. Backup And Restore

Create a backup:

```powershell
docker exec gsp_postgres pg_dump -U gsp_user gsp_db > gsp_backup.sql
```

Restore a backup:

```powershell
docker exec -i gsp_postgres psql -U gsp_user -d gsp_db < gsp_backup.sql
```

## 14. Troubleshooting

### Backend says unhealthy

Check logs:

```powershell
docker logs gsp_backend --tail 120
```

Known fixed issue:

```text
ReferenceError: exports is not defined in ES module scope
```

This is fixed by `Dockerfile.backend`, which adds:

```text
dist/server/package.json
```

with:

```json
{"type":"commonjs"}
```

Rebuild after confirming the file exists:

```powershell
docker compose --env-file .env.docker up -d --build
```

### `localhost:8080` shows EnterpriseDB/PostgreSQL page

Port `8080` is being used by Apache/EnterpriseDB, not GSP.

Use:

```text
http://127.0.0.1:8081
```

Check port usage:

```powershell
cmd /c netstat -ano | findstr :8080
cmd /c netstat -ano | findstr :8081
```

### Frontend is blank

Check the browser console.

Known fixed issue:

```text
Cannot access 'P' before initialization
vendor-charts-...
```

This is fixed by removing fragile manual chunk splitting from `vite.config.ts`.

Rebuild:

```powershell
docker compose --env-file .env.docker up -d --build frontend
```

Then hard refresh:

```text
Ctrl + Shift + R
```

### Products are missing

Check counts:

```powershell
docker exec gsp_postgres psql -U gsp_user -d gsp_db -c "SELECT COUNT(*) AS products FROM public.products; SELECT COUNT(*) AS categories FROM public.product_categories;"
```

Expected:

```text
products:   361
categories: 51
```

If not, run the manual product import steps in section 8.

### Login fails

Check that the admin user has a matching profile:

```powershell
docker exec gsp_postgres psql -U gsp_user -d gsp_db -c "SELECT u.username, p.full_name, p.role FROM public.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.username = 'admin';"
```

Expected:

```text
admin | Admin User | admin
```

If no profile exists, rerun the admin creation command in section 6.

### Port already allocated

Change `.env.docker`:

```env
FRONTEND_PORT=8082
```

Restart:

```powershell
docker compose --env-file .env.docker up -d
```

Open:

```text
http://127.0.0.1:8082
```

## 15. Clean Fresh Install

Only do this when you intentionally want to erase the Docker database and recreate everything.

Danger: this deletes the database volume.

```powershell
docker compose --env-file .env.docker down -v
docker compose --env-file .env.docker up -d --build
```

After a clean install, recreate the admin user using section 6.

The schema, categories, and products should import automatically on first startup.
