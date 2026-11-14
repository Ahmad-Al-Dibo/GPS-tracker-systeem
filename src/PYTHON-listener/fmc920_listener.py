import uvicorn

from listener.config import settings
from listener.main import app
from listener.teltonika import parse_avl_packet


__all__ = ["app", "parse_avl_packet"]


if __name__ == "__main__":
    uvicorn.run(app, host=settings.http_host, port=settings.http_port)
