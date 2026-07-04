# Moneybag (Next.js)

**Moneybag** — personal finance app built with **Next.js + Node.js + free PostgreSQL (Neon)**.

Deploy for free on **Vercel** (app) + **Neon** (database).

## Free stack

| Piece | Free service |
|--------|----------------|
| App / API | [Vercel](https://vercel.com) Hobby |
| Database | [Neon](https://neon.tech) PostgreSQL |
| Code | GitHub |

## 1. Create a free database (Neon)

1. Sign up at [https://console.neon.tech](https://console.neon.tech) (free).
2. **New Project** → name it `moneybag`.
3. Copy the **connection string** (URI). It looks like:
   ```
   postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
4. In `web/.env` paste it:
   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
   ```

## 2. Run locally

```bash
cd web
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 3. Deploy free on Vercel

### A. Push code to GitHub

Create a GitHub repo and push this project (include the `web` folder).

### B. Import on Vercel

1. Go to [https://vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. Import your GitHub repo.
3. Set **Root Directory** to `web` (Edit → `web`).
4. Under **Environment Variables**, add:

   | Name | Value |
   |------|--------|
   | `DATABASE_URL` | Same Neon connection string as in `.env` |

   Apply to **Production**, **Preview**, and **Development**.

5. Click **Deploy**.

Vercel will run:

```bash
prisma generate && prisma db push && next build
```

That creates tables on Neon and builds the app. You get a URL like:

`https://your-app.vercel.app`

### C. Redeploy after schema changes

Push to GitHub; Vercel rebuilds and runs `prisma db push` automatically.

## Other free hosts (optional)

| Host | Notes |
|------|--------|
| [Render](https://render.com) | Web Service, root `web`, same `DATABASE_URL` |
| [Railway](https://railway.app) | Free credits; set start `npm start` after build |

Use the **same Neon** `DATABASE_URL` on any host.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development |
| `npm run build` | Generate client, sync DB schema, build app |
| `npm start` | Production server |
| `npm run db:push` | Apply schema to database |
| `npm run db:studio` | Open Prisma Studio |

## Project layout

```
web/
  prisma/schema.prisma   # PostgreSQL models
  src/app/api/           # API routes
  src/components/        # UI
  src/lib/               # Business logic
  vercel.json            # Vercel build config
```
