import os
from dataclasses import dataclass
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    http_host: str = os.getenv("HTTP_HOST", "127.0.0.1")
    http_port: int = int(os.getenv("HTTP_PORT", "8000"))
    http_log_path: Path = Path(
        os.getenv("HTTP_LOG_PATH", str(APP_ROOT / "http_requests.jsonl"))
    )
    tcp_host: str = os.getenv("TCP_HOST", "127.0.0.1")
    tcp_port: int = int(os.getenv("TCP_PORT", "5027"))
    csv_path: Path = Path(os.getenv("CSV_PATH", str(APP_ROOT / "gps_records.csv")))
    webhook_url: str = os.getenv(
        "WEBHOOK_URL", "http://localhost:3000/api/gps"
    )


settings = Settings()

