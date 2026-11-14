import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from listener.api import router
from listener.config import settings
from listener.http_logging import RequestLoggingMiddleware
from listener.teltonika import handle_client


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    tcp_server = await asyncio.start_server(
        handle_client, settings.tcp_host, settings.tcp_port
    )
    application.state.tcp_server = tcp_server
    logger.info(
        "Teltonika TCP listener running on %s:%s",
        settings.tcp_host,
        settings.tcp_port,
    )
    try:
        yield
    finally:
        tcp_server.close()
        await tcp_server.wait_closed()
        logger.info("Teltonika TCP listener stopped")


app = FastAPI(
    title="FMC920 GPS Listener",
    description="FastAPI service and Teltonika FMC920 AVL-over-TCP listener.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(RequestLoggingMiddleware, log_path=settings.http_log_path)
app.include_router(router)