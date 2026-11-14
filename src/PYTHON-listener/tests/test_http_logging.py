import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from listener.http_logging import RequestLoggingMiddleware


class RequestLoggingTests(unittest.IsolatedAsyncioTestCase):
    async def test_logs_full_url_and_invalid_json_request(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            log_path = Path(temporary_directory) / "requests.jsonl"

            async def app(scope: dict[str, Any], receive: Any, send: Any) -> None:
                request_message = await receive()
                self.assertEqual(request_message["body"], b'{"latitude":')
                await send(
                    {
                        "type": "http.response.start",
                        "status": 400,
                        "headers": [],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": b"invalid JSON",
                    }
                )

            middleware = RequestLoggingMiddleware(app, log_path)
            incoming_messages = [
                {
                    "type": "http.request",
                    "body": b'{"latitude":',
                    "more_body": False,
                }
            ]

            async def receive() -> dict[str, Any]:
                return incoming_messages.pop(0)

            async def send(message: dict[str, Any]) -> None:
                return None

            with self.assertLogs("listener.http_logging", level="INFO") as captured:
                await middleware(
                    {
                        "type": "http",
                        "asgi": {"version": "3.0"},
                        "http_version": "1.1",
                        "method": "POST",
                        "scheme": "https",
                        "path": "/api/gps",
                        "raw_path": b"/api/gps",
                        "query_string": b"source=fmc920",
                        "headers": [
                            (b"host", b"gps.example.test"),
                            (b"content-type", b"application/json"),
                        ],
                        "client": ("192.0.2.10", 12345),
                        "server": ("127.0.0.1", 8000),
                    },
                    receive,
                    send,
                )

            record = json.loads(log_path.read_text(encoding="utf-8"))
            self.assertEqual(
                record["url"], "https://gps.example.test/api/gps?source=fmc920"
            )
            self.assertEqual(record["body"], '{"latitude":')
            self.assertIsNone(record["body_json"])
            self.assertIn("body_parse_error", record)
            self.assertEqual(record["status_code"], 400)
            self.assertFalse(record["valid"])
            self.assertIn(
                "https://gps.example.test/api/gps?source=fmc920", captured.output[0]
            )


if __name__ == "__main__":
    unittest.main()
