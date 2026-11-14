import csv
import json
import logging
import os
import urllib.request
from pathlib import Path
from typing import Any

from listener.config import settings


logger = logging.getLogger(__name__)
CSV_FIELDS = (
    "imei",
    "timestamp",
    "latitude",
    "longitude",
    "altitude",
    "angle",
    "satellites",
    "speed_kmh",
)


def save_records_to_csv(records: list[dict[str, Any]]) -> None:
    if not records:
        return

    path: Path = settings.csv_path
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists() or path.stat().st_size == 0

    with path.open("a", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        if write_header:
            writer.writeheader()
        writer.writerows(records)
        csv_file.flush()
        os.fsync(csv_file.fileno())

    logger.info("Saved %s AVL record(s) to %s", len(records), path)


def forward_to_website(payload: dict[str, Any]) -> None:
    if not settings.webhook_url:
        logger.warning(
            "Webhook is disabled; not sending GPS record for IMEI %s",
            payload.get("imei", "unknown"),
        )
        return

    body = json.dumps(payload)
    logger.info("POST %s payload=%s", settings.webhook_url, body)
    try:
        request = urllib.request.Request(
            settings.webhook_url,
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            logger.info("POST %s returned HTTP %s", settings.webhook_url, response.status)
    except Exception as error:
        logger.warning("POST %s failed: %s", settings.webhook_url, error)