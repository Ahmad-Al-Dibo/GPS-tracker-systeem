from fastapi import APIRouter

from listener.config import settings


router = APIRouter()


@router.get("/")
async def root() -> dict[str, object]:
    return {
        "service": "FMC920 GPS Listener",
        "status": "ok",
        "api": "/api/me",
        "docs": "/docs",
    }


@router.get("/api/me")
async def service_info() -> dict[str, object]:
    return {
        "service": "FMC920 GPS Listener",
        "status": "running",
        "protocol": "Teltonika AVL Codec 8 / Codec 8 Extended over TCP",
        "tcp_host": settings.tcp_host,
        "tcp_port": settings.tcp_port,
    }