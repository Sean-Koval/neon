"""AgentEval API - FastAPI application entry point."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.db.session import init_db
from src.routers import auth, cases, compare, runs, suites


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    await init_db()
    yield
    # Shutdown


app = FastAPI(
    title="AgentEval API",
    description="Agent evaluation platform built on MLflow",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(suites.router, prefix="/api/v1", tags=["suites"])
app.include_router(cases.router, prefix="/api/v1", tags=["cases"])
app.include_router(runs.router, prefix="/api/v1", tags=["runs"])
app.include_router(compare.router, prefix="/api/v1", tags=["compare"])


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "name": "AgentEval API",
        "version": "0.1.0",
        "docs": "/docs",
    }
