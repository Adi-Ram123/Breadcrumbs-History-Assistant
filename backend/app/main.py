"""FastAPI app factory. Creating the app never opens the DB or loads models."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.db.connection import connect, init_db
from app.index.store import ensure_embedder_version
from app.ports import AnswerWriter, Embedder, Parser
from app.registry import build_answer_writer, build_embedder, build_parser
from app.routes import ask, ingest
from app.schemas.api import HealthResponse


def create_app(
    settings: Settings | None = None,
    *,
    parser: Parser | None = None,
    embedder: Embedder | None = None,
    answer_writer: AnswerWriter | None = None,
) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        state = app.state
        state.parser = parser or build_parser(settings.parser)
        state.embedder = embedder or build_embedder(settings.embedder)
        state.answer_writer = answer_writer or build_answer_writer(settings.llm_mode)
        conn = connect(settings.db_path)
        try:
            init_db(conn, state.embedder.dim)
            ensure_embedder_version(conn, state.embedder)
        finally:
            conn.close()
        yield

    app = FastAPI(title="Breadcrumbs", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings

    if settings.extension_origin:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[settings.extension_origin],
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(ingest.router)
    app.include_router(ask.router)

    @app.get("/health", response_model=HealthResponse)
    def health(request: Request) -> HealthResponse:
        state = request.app.state
        return HealthResponse(
            status="ok",
            embedder_version=state.embedder.version,
            parser=state.parser.name,
            llm_mode=settings.llm_mode,
        )

    return app


app = create_app()
