# Brain Healhound

A private court diary that accepts one or many court-order PDFs, extracts the current case position through Agno and OpenRouter, and tracks the next hearing and follow-up actions. Clerk authenticates users; every signed-in user gets the same experience. Text PDFs are read directly; sparse or scanned pages use Tesseract OCR.

## Service shape

- `frontend/`: Next.js dashboard and case workspace.
- `backend/`: FastAPI API, PostgreSQL job loop, PDF/OCR ingestion, and Agno/OpenRouter extraction.
- PostgreSQL: cases, orders, actions, history, and recoverable jobs.
- Persistent volume: original court-order PDFs at `/data/orders` in Railway.

The backend must run as exactly one replica. It owns both HTTP traffic and the lightweight job loop; Redis and a separate worker are intentionally unnecessary for this release.

## Local setup

Prerequisites: Node.js 20+, Python 3.12, [uv](https://docs.astral.sh/uv/), PostgreSQL, Poppler, and Tesseract. On macOS, install the system tools with `brew install postgresql poppler tesseract`.

Create the local databases:

```bash
createdb legal_tracker
createdb legal_tracker_test
```

Create local environment files:

```bash
cp backend/.env.example backend/.env
cd frontend
npx -y clerk@latest init
```

The Clerk CLI creates a keyless development app and writes ignored development keys to `frontend/.env.local`. The backend reads that same local file for session verification, so no key needs to pass through terminal output or conversation. Sign up from the app navigation after both services start.

Install and migrate the backend:

```bash
cd backend
uv sync
uv run alembic upgrade head
```

Start the backend:

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

In another terminal, install and start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. For real extraction, set `OPENROUTER_API_KEY` in `backend/.env`. The default model is `deepseek/deepseek-v4-flash-0731`.

## Tests and checks

```bash
cd frontend && npm test && npm run lint && npm run build
cd backend && uv run pytest
cd backend && uv run python -c 'from app.main import app; print(app.title)'
cd backend && uv run alembic current
```

Backend integration tests use `postgresql+psycopg://localhost/legal_tracker_test`. Override `TEST_DATABASE_URL` when your test database lives elsewhere.

## Railway deployment

Create one Railway project containing a managed PostgreSQL resource plus two services from this repository.

### Clerk production prerequisite

1. From `frontend/`, run `npx -y clerk@latest auth login` to claim the keyless development app.
2. Run `npx -y clerk@latest deploy`, or use the Clerk Dashboard to create a Production instance by cloning the development settings.
3. Configure a domain you own and complete the DNS/certificate steps Clerk reports. Railway's generated domain can host the app, but Clerk production authentication requires an owned domain.
4. Configure production OAuth credentials for every social provider you keep enabled. Development's shared provider credentials are not for production.
5. Use only the Production instance's matching `pk_live_` and `sk_live_` keys in Railway. Keep local development on `pk_test_` and `sk_test_`.
6. After creating the intended accounts, disable public sign-up in Clerk before production unless anyone who reaches the app should receive full case/configuration access.

Use [Clerk's production deployment checklist](https://clerk.com/docs/guides/development/deployment/production) to confirm the domain, DNS, certificates, and redirect settings before exposing case data. This app intentionally grants identical access to every account that can sign in.

### 1. Backend service

1. Set the service root directory to `/backend` and config-as-code path to `/backend/railway.toml`.
2. Attach the managed PostgreSQL resource and expose its `DATABASE_URL` to the backend. Plain Railway `postgresql://` URLs are normalized to psycopg automatically.
3. Add a persistent volume mounted at `/data`.
4. Generate a public backend domain.
5. Keep the service at one replica.
6. Set these variables:

```text
APP_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
ORDER_STORAGE_ROOT=/data/orders
OPENROUTER_API_KEY=<openrouter-api-key>
LLM_MODEL=deepseek/deepseek-v4-flash-0731
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=4096
LLM_TIMEOUT_SECONDS=60
RUN_JOB_WORKER=true
CORS_ORIGINS=["https://<frontend-domain>"]
CLERK_SECRET_KEY=<same-clerk-application-secret-key>
CLERK_WEBHOOK_SIGNING_SECRET=<clerk-webhook-signing-secret>
# Optional: verify tokens locally instead of fetching Clerk JWKS.
CLERK_JWT_KEY=<clerk-jwt-public-key>
```

Railpack reads `backend/railpack.json` and installs Tesseract and Poppler in the runtime. Railway runs `uv run alembic upgrade head` once as the pre-deploy command, then starts Uvicorn. The `/health` check reports whether Tesseract is available.

### 2. Frontend service

1. Set the service root directory to `/frontend` and config-as-code path to `/frontend/railway.toml`.
2. Generate a public frontend domain.
3. Set these variables before the production build:

```text
NEXT_PUBLIC_API_BASE_URL=https://<backend-domain>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk-publishable-key>
CLERK_SECRET_KEY=<same-clerk-application-secret-key>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
```

In Clerk, allow `https://<frontend-domain>`, use `/sign-in` and `/sign-up` as the auth routes, and use `/` as the fallback redirect. Redeploy the backend after the frontend domain is known so `CORS_ORIGINS` and Clerk's authorized-party check exactly match it. Keep `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SIGNING_SECRET` server-only.

### Clerk user directory and legacy case assignment

The backend maintains an application-owned `app_users` directory keyed by Clerk user ID. Configure a Clerk webhook with the public endpoint `POST https://<backend-domain>/webhooks/clerk`, subscribe to `user.created`, `user.updated`, and `user.deleted`, and copy its signing secret to the backend Railway variable `CLERK_WEBHOOK_SIGNING_SECRET`. The endpoint verifies the raw request signature before changing data. Deleted users are retained locally and their cases are not deleted.

After deployment, run the idempotent bulk import once from the backend service or an environment with the production database and Clerk credentials:

```bash
cd backend
uv run python -m app.users.sync_clerk_users
```

The import synchronizes all existing Clerk users and never assigns cases. Existing cases with no owner remain unassigned and must be assigned manually. Review users and unassigned cases, then set the internal owner explicitly:

```sql
SELECT id, clerk_user_id, primary_email
FROM app_users
ORDER BY primary_email NULLS LAST, clerk_user_id;

SELECT id, case_number
FROM cases
WHERE owner_user_id IS NULL;

UPDATE cases
SET owner_user_id = (
    SELECT id FROM app_users WHERE clerk_user_id = 'user_123'
)
WHERE case_number = 'CT 11866/2025' AND owner_user_id IS NULL;
```

### 3. Deployment smoke check

1. Open `https://<backend-domain>/health` and confirm `status` is `ok` and `ocr_ready` is `true`.
2. Open the frontend while signed out and confirm Clerk sends you to sign-in; create the first account and confirm the profile button appears.
3. Create a case with a short text PDF and wait for Agno/OpenRouter processing to complete.
4. Upload a scanned order to the same case, then download both originals and verify the case state refreshes.

## Authentication access matrix

| Surface | Access | Enforcement | Evidence |
|---|---|---|---|
| `/`, `/cases/**`, `/config` | Signed-in users | Next.js `auth.protect()` in each page | Production build plus sign-in smoke check |
| `/api/**` | Valid Clerk session token | FastAPI `require_clerk_user` router dependency | `backend/tests/test_auth.py` and route suites |
| PDF downloads and mutations | Valid Clerk session token | Shared authenticated frontend fetch and FastAPI dependency | `frontend/src/lib/api.test.ts` and backend route suites |
| `/health` on both services | Public | Dedicated health handlers only | Railway health checks |

## Operational notes

- PDF defaults are 20 MiB and 50 pages per file; typical orders are expected to be 1–5 pages.
- Jobs retry with backoff and retain extracted text, so a provider retry does not repeat OCR.
- Original PDFs are volume-backed. PostgreSQL backups do not include those files; configure a separate volume backup/export process if long-term archival is required.
- Authentication is uniform: every signed-in account can access cases and extraction configuration. Add an application-owned authorization design before introducing differentiated permissions.
# case-tracker
