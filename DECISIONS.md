# Architectural Decisions

Keep this file as an append-only record of decisions that materially affect architecture, dependencies, data ownership, external services, security, or deployment.

## 2026-08-16 — Use the standard application stack

**Status:** Accepted

**Context:** The application needs a small, consistent full-stack foundation.

**Decision:** Use Next.js App Router with TypeScript for the frontend, FastAPI for the backend, PostgreSQL through SQLAlchemy and psycopg for persistence, and Alembic for migrations. Use npm and uv for package management.

**Consequences:** Application work follows one predictable structure. Changing a fixed technology requires a new explicit decision.

## 2026-08-16 — Reuse focused ClimLaw ingestion behavior

**Status:** Accepted

**Context:** Court orders include text PDFs and scanned pages, and the ClimLaw Case Summarizer already has a proven selective OCR path.

**Decision:** Adapt its pdfplumber extraction, 50-character OCR threshold, 300-DPI Tesseract fallback, sanitization, and page-aware chunking. Do not import ClimLaw's climate fields, chat, translation, embeddings, or authentication.

**Consequences:** The two applications share proven behavior without coupling their repositories or release cycles.

## 2026-08-16 — Use Railway-managed persistence

**Status:** Accepted

**Context:** The first release is hosted on Railway for one user.

**Decision:** Store structured data and durable job state in Railway PostgreSQL and original PDFs on a Railway persistent volume. Use one backend replica with a recoverable PostgreSQL-backed job loop.

**Consequences:** Redis and Celery are unnecessary in version one. Horizontal backend scaling requires revisiting worker coordination and volume access.

## 2026-08-16 — Keep Docker conditional

**Status:** Accepted

**Context:** Railway can build the services directly and install Tesseract through build configuration.

**Decision:** Do not add Docker. Add it only if Railway cannot install or consistently execute the required OCR system packages.

**Consequences:** Local PostgreSQL is provided separately, and Railway-native configuration owns system dependencies.

## 2026-08-16 — Use Railway Railpack for native builds

**Status:** Accepted

**Context:** Railway now defaults to Railpack, while Nixpacks is in maintenance mode. OCR requires Tesseract and Poppler binaries in the runtime image.

**Decision:** Build the frontend and backend with Railway Railpack. Install `tesseract-ocr` and `poppler-utils` as backend runtime Apt packages through `backend/railpack.json`. Keep migrations in the backend pre-deploy command and run the database-backed worker inside the single backend service.

**Consequences:** No Dockerfile, Redis service, or separate worker service is required. The backend must remain at one replica and its persistent volume must mount at `/data`.

## 2026-08-17 — Use Agno with OpenRouter for extraction

**Status:** Accepted; supersedes the Gemini/Vertex provider choice.

**Context:** Court-order extraction needs one structured model boundary and an environment-backed provider that is easy to run locally and on Railway.

**Decision:** Use one Agno `Agent` with Pydantic structured output and an Agno `OpenRouter` model. The default model is `deepseek/deepseek-v4-flash-0731`, configured through `LLM_MODEL`, and authentication uses `OPENROUTER_API_KEY`. Keep telemetry disabled and retain the database job runner's retry behavior.

**Consequences:** Google Vertex credentials and `google-genai` are no longer required. OpenRouter is the only AI provider in this release, and production startup requires its API key.

## 2026-08-17 — Store extraction configuration in PostgreSQL

**Status:** Accepted

**Context:** The user needs to change the extraction prompt and output fields without editing or redeploying Python source. Added, renamed, and removed fields must remain validated and their extracted values must not be discarded.

**Decision:** Store one ordered, versioned extraction configuration document in PostgreSQL. Build a Pydantic case-state model and matching `<output_format>` from an immutable configuration snapshot for each extraction attempt. Store the complete validated result as JSONB, then separately project recognized compatible keys into the existing case columns and action workflow. Keep `case_number` outside extraction as required user input.

**Consequences:** PostgreSQL is the source of truth for the active prompt and field schema. Configuration changes affect new and retried attempts but not in-flight requests. Renamed or type-changed fields remain available as dynamic case data but stop driving built-in tracker behavior unless their recognized name and type are restored.

## 2026-08-30 — Authenticate every user with Clerk

**Status:** Accepted

**Context:** The deployed tracker must no longer expose case data or configuration to unauthenticated visitors. The product has one access experience and does not need roles, tiers, organizations, or a local user directory.

**Decision:** Use Clerk for identity and session management. Protect every Next.js product page at the server component that owns it. Send the current short-lived Clerk session token with every browser-to-FastAPI request, and verify it centrally on every `/api/**` route with Clerk's Python SDK. Keep `/health` public for Railway. Do not add Clerk Organizations, application roles, user provisioning, or webhooks while all authenticated users have identical access.

**Consequences:** Both Railway services require credentials for the same Clerk application, the backend must allow only the deployed frontend origin, and all new API routers must opt into the shared authentication dependency. Adding differentiated access later requires a separate authorization design and application-owned policy data.

## 2026-09-07 — Isolate case data by Clerk user

**Status:** Accepted

**Context:** Clerk authenticates every API request, but case queries did not use the verified user identity. Any authenticated user could therefore read or modify every case.

**Decision:** Store the verified Clerk subject on each new case as `owner_clerk_user_id`. Scope every user-initiated case, order, PDF, retry, and follow-up-action operation by that owner. Return not found for foreign or unassigned records so resource existence is not disclosed. Keep the ownership column nullable so existing cases remain intact and unassigned until they are manually assigned.

**Consequences:** Authenticated users see and mutate only their own cases. Existing cases are hidden from all users until an operator assigns their Clerk user ID. Background processing continues to use internal case identifiers and does not establish or change ownership.

## 2026-09-07 — Maintain a local Clerk user directory

**Status:** Accepted; supersedes the “no local user directory” portion of the 2026-08-30 authentication decision.

**Context:** Case ownership needs a durable internal reference, server-side profile synchronization, and safe handling of Clerk user updates and deletions. Existing cases must remain data-preserving and unassigned cases must not be assigned by inference.

**Decision:** Keep Clerk as the authentication authority, and add an application-owned `app_users` directory keyed by immutable `clerk_user_id`. Cases reference a nullable internal `owner_user_id` foreign key with `ON DELETE SET NULL`. Retain soft-deleted users and their case links for history, while denying access for deleted identities. Synchronize users through verified Clerk webhooks for `user.created`, `user.updated`, and `user.deleted`, just-in-time provisioning during authenticated API access, and the idempotent one-time bulk sync command `uv run python -m app.users.sync_clerk_users`. Do not automatically assign legacy unassigned cases; operators must assign them explicitly. Roles and organizations remain out of scope.

**Consequences:** User email and profile state are maintained server-side without becoming case ownership identity. Clerk webhook delivery requires `CLERK_WEBHOOK_SIGNING_SECRET`, and the import command requires `CLERK_SECRET_KEY`. Existing unassigned cases remain inaccessible until manually assigned to an `app_users.id`; deleting a Clerk user does not delete cases.
