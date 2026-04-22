from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

from .settings import SETTINGS


def _text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in (_text(item) for item in value) if item]


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
        return parsed
    except (TypeError, ValueError):
        return default


def _normalize_http_method(value: Any, default: str = "GET") -> str:
    method = _text(value, default).upper()
    return method if method in {"GET", "POST"} else default


def _hostname_allowed(hostname: str, allowed_domains: list[str]) -> bool:
    normalized_host = _text(hostname).lower()
    if not normalized_host:
        return False

    normalized_allowed = [_text(item).lower() for item in allowed_domains if _text(item)]
    if not normalized_allowed:
        return True

    for item in normalized_allowed:
        if normalized_host == item or normalized_host.endswith(f".{item}"):
            return True

    return False


def _resolve_effective_allowed_domains(source: dict[str, Any]) -> list[str]:
    allowed_domains = _string_list(source.get("allowedDomains"))
    if allowed_domains:
        return allowed_domains

    base_url = _text(source.get("baseUrl"))
    hostname = urlparse(base_url).hostname or ""
    return [hostname] if hostname else []


def _resolve_target_url(
    source: dict[str, Any],
    *,
    explicit_url: str = "",
    relative_path: str = "",
) -> str:
    if explicit_url:
      return explicit_url

    base_url = _text(source.get("baseUrl")).rstrip("/")
    if not base_url:
        raise ValueError("external source baseUrl is required")

    target_path = relative_path or _text(source.get("apiPath")) or "/"
    if not target_path.startswith("/"):
        target_path = f"/{target_path}"

    return urljoin(f"{base_url}/", target_path.lstrip("/"))


def _build_headers(
    source: dict[str, Any],
    extra_headers: dict[str, Any] | None = None,
) -> dict[str, str]:
    headers = {
        "accept": "application/json, text/plain;q=0.9, text/html;q=0.8, */*;q=0.5",
        "user-agent": "Universal-Agent-Platform/1.0",
    }

    auth_type = _text(source.get("authType"), "none").lower()
    api_key = _text(source.get("apiKey"))
    username = _text(source.get("username"))
    password = _text(source.get("password"))

    if auth_type == "api-key" and api_key:
        headers["x-api-key"] = api_key
    elif auth_type == "bearer" and api_key:
        headers["authorization"] = f"Bearer {api_key}"
    elif auth_type == "basic" and username:
        basic_token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("utf-8")
        headers["authorization"] = f"Basic {basic_token}"

    for key, value in _dict(extra_headers).items():
        header_key = _text(key)
        header_value = _text(value)
        if header_key and header_value:
            headers[header_key] = header_value

    return headers


def _http_request(
    *,
    url: str,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    query_params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
    timeout_ms: int = 10000,
) -> dict[str, Any]:
    query_payload = {key: value for key, value in _dict(query_params).items() if value not in (None, "")}
    request_url = url
    if query_payload:
        request_url = f"{url}{'&' if '?' in url else '?'}{urlencode(query_payload, doseq=True)}"

    raw_body = None
    request_headers = dict(headers or {})

    if method == "POST":
        raw_body = json.dumps(_dict(body), ensure_ascii=False).encode("utf-8")
        request_headers["content-type"] = "application/json"

    request = Request(
        request_url,
        data=raw_body,
        headers=request_headers,
        method=method,
    )

    try:
        with urlopen(request, timeout=max(timeout_ms / 1000, 0.5)) as response:
            content = response.read()
            return {
                "ok": True,
                "status": getattr(response, "status", 200),
                "url": getattr(response, "url", request_url),
                "headers": dict(response.headers.items()),
                "body": content,
            }
    except HTTPError as error:
        return {
            "ok": False,
            "status": getattr(error, "code", 500),
            "url": request_url,
            "headers": dict(error.headers.items()) if error.headers else {},
            "body": error.read(),
            "error": str(error),
        }
    except URLError as error:
        raise RuntimeError(f"external source request failed: {error.reason}") from error


def _ensure_ok_response(response: dict[str, Any]) -> None:
    if response.get("ok"):
        return

    body = response.get("body", b"")
    preview = ""
    if isinstance(body, (bytes, bytearray)):
        try:
            preview = bytes(body).decode("utf-8")[:240]
        except UnicodeDecodeError:
            preview = ""

    raise RuntimeError(
        f"external source http {response.get('status', 500)}"
        + (f": {preview}" if preview else "")
    )


def _decode_body_preview(body: bytes, content_type: str) -> tuple[str, Any]:
    if not body:
        return "", None

    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return "", None

    normalized_content_type = _text(content_type).lower()
    if "application/json" in normalized_content_type:
        try:
            return text, json.loads(text)
        except json.JSONDecodeError:
            return text, None

    return text, None


def _normalize_query_items(parsed_json: Any, request_url: str) -> list[dict[str, Any]]:
    candidates: list[Any]
    if isinstance(parsed_json, list):
        candidates = parsed_json
    elif isinstance(parsed_json, dict):
        if isinstance(parsed_json.get("items"), list):
            candidates = parsed_json["items"]
        elif isinstance(parsed_json.get("results"), list):
            candidates = parsed_json["results"]
        elif isinstance(parsed_json.get("data"), list):
            candidates = parsed_json["data"]
        else:
            candidates = [parsed_json]
    else:
        candidates = []

    normalized_items = []
    for index, item in enumerate(candidates, start=1):
        record = _dict(item)
        if not record:
            continue

        url = (
            _text(record.get("url"))
            or _text(record.get("link"))
            or _text(record.get("href"))
            or request_url
        )
        title = (
            _text(record.get("title"))
            or _text(record.get("name"))
            or _text(record.get("label"))
            or f"结果 {index}"
        )
        summary = (
            _text(record.get("summary"))
            or _text(record.get("snippet"))
            or _text(record.get("description"))
            or _text(record.get("content"))
        )

        normalized_items.append(
            {
                "itemId": _text(record.get("id")) or f"item-{index}",
                "title": title,
                "url": url,
                "summary": summary[:800],
                "raw": record,
            }
        )

    return normalized_items


def _build_plain_text_item(text: str, request_url: str) -> list[dict[str, Any]]:
    preview = text.strip()[:800]
    if not preview:
        return []

    return [
        {
            "itemId": "item-1",
            "title": "文本结果",
            "url": request_url,
            "summary": preview,
            "raw": {
                "preview": preview,
            },
        }
    ]


def _sanitize_filename(name: str, default_name: str = "download.bin") -> str:
    safe = "".join(char if char.isalnum() or char in {"-", "_", "."} else "_" for char in _text(name))
    safe = safe.strip("._")
    return safe or default_name


def _resolve_download_name(
    *,
    request_url: str,
    content_type: str,
    explicit_name: str = "",
) -> str:
    if explicit_name:
        return _sanitize_filename(explicit_name)

    parsed = urlparse(request_url)
    file_name = Path(parsed.path).name
    if file_name:
        return _sanitize_filename(file_name)

    extension = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ".bin"
    return f"download{extension}"


def _downloads_dir() -> Path:
    path = SETTINGS.external_downloads_dir
    path.mkdir(parents=True, exist_ok=True)
    return path


def _common_source_guard(source: dict[str, Any]) -> tuple[str, list[str]]:
    if source.get("enabled") is False:
        raise ValueError("external source is disabled")

    if source.get("publicDataOnly") is False:
        raise ValueError("external source is not marked as public-data-only")

    allowed_domains = _resolve_effective_allowed_domains(source)
    return _text(source.get("id")), allowed_domains


def execute_external_source_query(payload: dict[str, Any]) -> dict[str, Any]:
    source = _dict(payload.get("source"))
    source_id, allowed_domains = _common_source_guard(source)
    request_url = _resolve_target_url(
        source,
        explicit_url=_text(payload.get("resourceUrl")),
        relative_path=_text(payload.get("path")) or _text(payload.get("apiPath")) or _text(source.get("apiPath")),
    )

    hostname = urlparse(request_url).hostname or ""
    if not _hostname_allowed(hostname, allowed_domains):
        raise ValueError("target hostname is not in allowedDomains")

    method = _normalize_http_method(payload.get("httpMethod"), "GET")
    timeout_ms = max(500, _int(payload.get("timeoutMs"), 10000))
    query = _text(payload.get("query"))
    page = max(1, _int(payload.get("page"), 1))
    page_size = max(1, min(50, _int(payload.get("pageSize"), 10)))
    query_params = {
        **_dict(payload.get("queryParams")),
    }

    if query and "q" not in query_params and "query" not in query_params:
        query_params["q"] = query

    if "page" not in query_params:
        query_params["page"] = page

    if "pageSize" not in query_params:
        query_params["pageSize"] = page_size

    request_headers = _build_headers(source, _dict(payload.get("headers")))
    request_body = _dict(payload.get("requestBody"))
    if method == "POST" and query and "query" not in request_body:
        request_body["query"] = query
    if method == "POST" and "page" not in request_body:
        request_body["page"] = page
    if method == "POST" and "pageSize" not in request_body:
        request_body["pageSize"] = page_size

    response = _http_request(
        url=request_url,
        method=method,
        headers=request_headers,
        query_params=query_params if method == "GET" else None,
        body=request_body if method == "POST" else None,
        timeout_ms=timeout_ms,
    )
    _ensure_ok_response(response)

    content_type = _text(response.get("headers", {}).get("Content-Type"))
    body = response.get("body", b"")
    preview_text, parsed_json = _decode_body_preview(body, content_type)
    items = _normalize_query_items(parsed_json, response.get("url", request_url))
    if not items:
        items = _build_plain_text_item(preview_text, response.get("url", request_url))

    return {
        "sourceId": source_id,
        "requestUrl": response.get("url", request_url),
        "resultCount": len(items),
        "items": items,
        "statusCode": response.get("status", 200),
        "contentType": content_type,
        "query": query,
        "queryMode": method.lower(),
        "outboundPolicy": {
            "publicDataOnly": True,
            "localDataOutboundPolicy": _text(source.get("localDataOutboundPolicy"), "blocked"),
            "allowedDomains": allowed_domains,
        },
    }


def execute_external_source_fetch(payload: dict[str, Any]) -> dict[str, Any]:
    source = _dict(payload.get("source"))
    source_id, allowed_domains = _common_source_guard(source)
    request_url = _resolve_target_url(
        source,
        explicit_url=_text(payload.get("resourceUrl")),
        relative_path=_text(payload.get("resourcePath")) or _text(payload.get("path")),
    )

    hostname = urlparse(request_url).hostname or ""
    if not _hostname_allowed(hostname, allowed_domains):
        raise ValueError("target hostname is not in allowedDomains")

    response = _http_request(
        url=request_url,
        method="GET",
        headers=_build_headers(source, _dict(payload.get("headers"))),
        timeout_ms=max(500, _int(payload.get("timeoutMs"), 10000)),
    )
    _ensure_ok_response(response)

    content_type = _text(response.get("headers", {}).get("Content-Type"))
    preview_text, parsed_json = _decode_body_preview(response.get("body", b""), content_type)
    body_preview = preview_text[:1600] if preview_text else ""

    return {
        "sourceId": source_id,
        "requestUrl": response.get("url", request_url),
        "statusCode": response.get("status", 200),
        "contentType": content_type,
        "parsedJson": parsed_json,
        "bodyPreview": body_preview,
        "contentLength": len(response.get("body", b"")),
        "outboundPolicy": {
            "publicDataOnly": True,
            "localDataOutboundPolicy": _text(source.get("localDataOutboundPolicy"), "blocked"),
            "allowedDomains": allowed_domains,
        },
    }


def execute_external_source_download(payload: dict[str, Any]) -> dict[str, Any]:
    source = _dict(payload.get("source"))
    source_id, allowed_domains = _common_source_guard(source)
    request_url = _resolve_target_url(
        source,
        explicit_url=_text(payload.get("resourceUrl")),
        relative_path=_text(payload.get("resourcePath")) or _text(payload.get("path")),
    )

    hostname = urlparse(request_url).hostname or ""
    if not _hostname_allowed(hostname, allowed_domains):
        raise ValueError("target hostname is not in allowedDomains")

    response = _http_request(
        url=request_url,
        method="GET",
        headers=_build_headers(source, _dict(payload.get("headers"))),
        timeout_ms=max(500, _int(payload.get("timeoutMs"), 15000)),
    )
    _ensure_ok_response(response)

    body = response.get("body", b"")
    content_type = _text(response.get("headers", {}).get("Content-Type"), "application/octet-stream")
    file_name = _resolve_download_name(
        request_url=response.get("url", request_url),
        content_type=content_type,
        explicit_name=_text(payload.get("fileName")),
    )

    digest = hashlib.sha1(f"{source_id}:{response.get('url', request_url)}:{len(body)}".encode("utf-8")).hexdigest()[:10]
    target_dir = _downloads_dir() / _sanitize_filename(source_id, "external-source")
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{digest}__{file_name}"
    target_path.write_bytes(body)

    return {
        "sourceId": source_id,
        "requestUrl": response.get("url", request_url),
        "statusCode": response.get("status", 200),
        "contentType": content_type,
        "contentLength": len(body),
        "savedPath": str(target_path),
        "savedFileName": target_path.name,
        "outboundPolicy": {
            "publicDataOnly": True,
            "localDataOutboundPolicy": _text(source.get("localDataOutboundPolicy"), "blocked"),
            "allowedDomains": allowed_domains,
        },
    }
