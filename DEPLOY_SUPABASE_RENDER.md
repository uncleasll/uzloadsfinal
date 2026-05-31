# Deploy: Vercel Frontend + Render Backend + Supabase Postgres

Frontend is already deployed here:

```text
https://uzloadsfinal-7c41.vercel.app/
```

## 1. Supabase database

1. Create a Supabase project.
2. Open `Project Settings -> Database`.
3. Copy the **Transaction pooler** connection string.
4. Replace `[YOUR-PASSWORD]` with the database password.
5. Make sure the URL ends with:

```text
?sslmode=require
```

Example:

```text
postgresql://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

Use the pooler URL for Render because production apps can open multiple DB connections.

## 2. Render backend

Create a new Render Web Service from this repo.

Settings:

```text
Root Directory: backend
Runtime: Python
Build Command: pip install -r requirements.txt
Start Command: alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Environment variables:

```text
DATABASE_URL=<Supabase transaction pooler URL with sslmode=require>
SECRET_KEY=<long random secret>
CORS_ORIGINS=https://uzloadsfinal-7c41.vercel.app,http://localhost:5173,http://localhost:3000
UPLOAD_DIR=./uploads
```

The repo also has `render.yaml`, so Render Blueprint can use it.

## 3. Vercel frontend env

In Vercel project settings, set:

```text
VITE_API_BASE_URL=https://YOUR_RENDER_BACKEND.onrender.com
```

Then redeploy frontend.

## 4. After deploy checks

Open:

```text
https://YOUR_RENDER_BACKEND.onrender.com/health
https://YOUR_RENDER_BACKEND.onrender.com/docs
```

Expected `/health` response:

```json
{"status":"ok","service":"uzLoads TMS API","version":"1.0.0"}
```

Then open the Vercel frontend and login/use the app.

## Important production note

Render web service disk is ephemeral unless you add persistent disk. Uploaded load/driver documents in `./uploads` may disappear after redeploy/restart. For real production file storage, move uploads to Supabase Storage or S3.
