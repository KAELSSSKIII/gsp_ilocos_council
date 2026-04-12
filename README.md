# GSP Business Suite

Internal business operations suite for the Girl Scouts of the Philippines Ilocos Sur Council.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Backend: Express, TypeScript, PostgreSQL
- Data: PostgreSQL plus Supabase migration history in `supabase/`

## Required Environment Variables

Copy `.env.example` to `.env` for local development.

### Frontend

- `VITE_API_BASE_URL`: Base URL for the Express API. Use `/api` for local dev and Docker.
- `VITE_MEMBERS_ENDPOINT`: Members endpoint used by legacy flows. Use `/api/members` for local dev and Docker.

### Backend

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Long random secret used to sign auth tokens
- `JWT_EXPIRES_IN`: JWT lifetime, for example `7d`
- `PORT`: Express API port
- `CORS_ORIGIN`: Allowed frontend origins, comma-separated when needed

## Development

```bash
npm run dev
npm run dev:server
```

Or run both together:

```bash
npm run dev:all
```

## Security Notes

- Do not commit `.env` or other local env files.
- Rotate any secrets that were previously committed.
- Use a strong `JWT_SECRET` in every environment.
