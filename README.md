# Moneybag

Personal finance app — **Next.js + free PostgreSQL**.

## Free deploy (recommended)

| What | Free service |
|------|----------------|
| App | [Vercel](https://vercel.com) |
| Database | [Neon](https://neon.tech) |
| Code | GitHub |

Full steps: **[web/README.md](web/README.md)**

### Short version

1. Create a free Neon project → copy `DATABASE_URL`.
2. Put it in `web/.env`.
3. Locally:
   ```bash
   cd web
   npm install
   npx prisma db push
   npm run dev
   ```
4. Push to GitHub → import on Vercel → Root Directory = `web` → add `DATABASE_URL` → Deploy.

## Local only

```bash
cd web
npm install
# set DATABASE_URL in web/.env (Neon free connection string)
npx prisma db push
npm run dev
```

Open http://localhost:3000
