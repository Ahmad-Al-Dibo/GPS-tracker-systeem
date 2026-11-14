import asyncio
import base64
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from starlette.requests import Request


logger = logging.getLogger(__name__)
_file_lock = threading.Lock()


class RequestLoggingMiddleware:
    def __init__(self, app: Any, log_path: Path) -> None:
        self.app = app
        self.log_path = log_path

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        body_chunks: list[bytes] = []
        messages: list[dict[str, Any]] = []
        body_complete = False
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.disconnect":
                break
            if message["type"] != "http.request":
                continue
            body_chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                body_complete = True
                break

        body = b"".join(body_chunks)

        async def replay_receive() -> dict[str, Any]:
            if messages:
                return messages.pop(0)
            return await receive()

        response_status: int | None = None

        async def capture_send(message: dict[str, Any]) -> None:
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = message["status"]
            await send(message)

        record = self._request_record(scope, body)
        record["body_complete"] = body_complete
        try:
            await self.app(scope, replay_receive, capture_send)
        except Exception as error:
            record["error"] = f"{type(error).__name__}: {error}"
            raise
        finally:
            record["status_code"] = response_status
            record["valid"] = (
                response_status is not None
                and response_status < 400
                and body_complete
                and record.get("body_parse_error") is None
            )
            await asyncio.to_thread(self._save_record, record)
            logger.info("HTTP request: %s", json.dumps(record, ensure_ascii=False))

    @staticmethod
    def _request_record(scope: dict[str, Any], body: bytes) -> dict[str, Any]:
        request = Request(scope)
        headers = [
            [key.decode("latin-1"), value.decode("latin-1")]
            for key, value in scope.get("headers", [])
        ]
        record: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": scope["method"],
            "url": str(request.url),
            "client": scope.get("client"),
            "headers": headers,
        }

        try:
            record["body"] = body.decode("utf-8")
        except UnicodeDecodeError:
            record["body_base64"] = base64.b64encode(body).decode("ascii")

        content_type = request.headers.get("content-type", "").split(";", 1)[0]
        if body and (
            content_type == "application/json" or content_type.endswith("+json")
        ):
            try:
                record["body_json"] = json.loads(body)
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                record["body_json"] = None
                record["body_parse_error"] = str(error)

        return record

    def _save_record(self, record: dict[str, Any]) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with _file_lock:
            with self.log_path.open("a", encoding="utf-8") as log_file:
                log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
