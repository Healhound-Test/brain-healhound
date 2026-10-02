from contextlib import asynccontextmanager
import asyncio
from datetime import datetime, timezone

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cases.routes import router as cases_router
from app.core.auth import require_current_user
from app.core.config import get_cors_settings, get_settings
from app.db.session import get_session_factory
from app.documents.ingestion import tesseract_available
from app.extraction.client import ConfiguredOpenRouterExtractor
from app.extraction.routes import router as extraction_config_router
from app.jobs.runner import JobDependencies, run_job_loop
from app.users.webhooks import router as clerk_webhook_router


@asynccontextmanager
async def lifespan(application: FastAPI):
    settings = get_settings()
    if not settings.run_job_worker:
        yield
        return

    stop = asyncio.Event()
    dependencies = JobDependencies(
        session_factory=get_session_factory(),
        storage_root=settings.order_storage_root,
        extractor=ConfiguredOpenRouterExtractor(settings=settings),
        settings=settings,
        now=lambda: datetime.now(timezone.utc),
    )
    task = asyncio.create_task(run_job_loop(stop, dependencies))
    application.state.job_task = task
    try:
        yield
    finally:
        stop.set()
        await task


app = FastAPI(title="Legal Case Tracker", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
protected_api = [Depends(require_current_user)]
app.include_router(clerk_webhook_router)
app.include_router(cases_router, prefix="/api", dependencies=protected_api)
app.include_router(
    extraction_config_router,
    prefix="/api",
    dependencies=protected_api,
)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"status": "ok", "ocr_ready": tesseract_available()}
