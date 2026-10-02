# Repository Instructions

## Stack

- Frontend: Next.js App Router with TypeScript, managed by npm.
- Backend: FastAPI, managed by uv.
- Database: PostgreSQL through SQLAlchemy and psycopg.
- Migrations: Alembic.

## Working rules

- Read `CODE_PHILOSOPHY.md` before implementing changes.
- Read `DECISIONS.md` before changing architecture or dependencies.
- Keep code simple, readable, and straightforward.
- Preserve the separation between frontend, backend, and persistence concerns.
- Add the smallest test that proves changed behavior.
- Do not add infrastructure or dependencies without an application requirement.
- Record major architectural decisions in `DECISIONS.md`.
- Never commit secrets. Document backend variables in `backend/.env.example`
  and public frontend variables in `frontend/.env.example`.

## Canonical checks

```bash
cd frontend && npm test && npm run lint && npm run build
cd backend && uv run pytest
cd backend && uv run python -c 'from app.main import app; print(app.title)'
cd backend && uv run alembic current
```

## Local development

```bash
cd backend && uv sync && uv run alembic upgrade head
cd backend && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

Railway deploys `frontend/` and `backend/` as separate services. The backend owns migrations and runs exactly one replica because its PostgreSQL job loop shares a persistent PDF volume.
