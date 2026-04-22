from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


PHONE_PATTERN = re.compile(r"(?<!\d)(1[3-9]\d{9})(?!\d)")
CN_ID_PATTERN = re.compile(r"(?<!\w)(\d{17}[\dXx])(?!\w)")
EMAIL_PATTERN = re.compile(
    r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9._%+-])"
)


def _mask_text(text: str) -> tuple[str, int]:
    sanitized_text = text
    total_redactions = 0

    for pattern in (PHONE_PATTERN, CN_ID_PATTERN, EMAIL_PATTERN):
        sanitized_text, match_count = pattern.subn("***", sanitized_text)
        total_redactions += match_count

    return sanitized_text, total_redactions


def _sanitize_payload(payload: Any) -> tuple[Any, int]:
    if isinstance(payload, str):
        return _mask_text(payload)

    if isinstance(payload, list):
        redaction_count = 0
        sanitized_list = []

        for item in payload:
            sanitized_item, item_redaction_count = _sanitize_payload(item)
            redaction_count += item_redaction_count
            sanitized_list.append(sanitized_item)

        return sanitized_list, redaction_count

    if isinstance(payload, dict):
        redaction_count = 0
        sanitized_dict = {}

        for key, value in payload.items():
            sanitized_value, value_redaction_count = _sanitize_payload(value)
            redaction_count += value_redaction_count
            sanitized_dict[key] = sanitized_value

        return sanitized_dict, redaction_count

    return payload, 0


def _append_safety_log(log_file: Path, payload: dict[str, Any]) -> None:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    with log_file.open("a", encoding="utf-8") as file_pointer:
        file_pointer.write(f"{json.dumps(payload, ensure_ascii=False)}\n")


class SafetyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, log_file: Path):
        super().__init__(app)
        self._log_file = log_file

    async def dispatch(self, request: Request, call_next) -> Response:
        content_type = request.headers.get("content-type", "")
        should_sanitize = (
            request.method.upper() in {"POST", "PUT", "PATCH"}
            and content_type.startswith("application/json")
        )

        if should_sanitize:
            raw_body = await request.body()
            if raw_body:
                try:
                    raw_payload = json.loads(raw_body.decode("utf-8"))
                    sanitized_payload, redaction_count = _sanitize_payload(raw_payload)
                    sanitized_body = json.dumps(
                        sanitized_payload,
                        ensure_ascii=False,
                    ).encode("utf-8")
                    did_receive = False

                    async def _receive():
                        nonlocal did_receive
                        if did_receive:
                            return {
                                "type": "http.request",
                                "body": b"",
                                "more_body": False,
                            }
                        did_receive = True
                        return {
                            "type": "http.request",
                            "body": sanitized_body,
                            "more_body": False,
                        }

                    request._body = sanitized_body  # type: ignore[attr-defined]
                    request._receive = _receive  # type: ignore[attr-defined]
                    request.state.safety = {
                        "redactionCount": redaction_count,
                        "sanitized": redaction_count > 0,
                    }
                    _append_safety_log(
                        self._log_file,
                        {
                            "at": datetime.utcnow().isoformat(),
                            "path": request.url.path,
                            "method": request.method,
                            "redactionCount": redaction_count,
                        },
                    )
                except json.JSONDecodeError:
                    request.state.safety = {
                        "redactionCount": 0,
                        "sanitized": False,
                    }

        response = await call_next(request)
        safety_summary = getattr(request.state, "safety", None)
        if isinstance(safety_summary, dict):
            response.headers["x-safety-redaction-count"] = str(
                int(safety_summary.get("redactionCount", 0))
            )
        return response
