from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_text(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_int(name: str, default: int) -> int:
    raw_value = _env_text(name, str(default))
    try:
        return int(raw_value)
    except ValueError:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    raw_value = _env_text(name, "true" if default else "false").lower()
    return raw_value in {"1", "true", "yes", "on"}


def _normalize_model_route(value: str, default: str = "cloud") -> str:
    normalized = str(value or "").strip().lower() if isinstance(value, str) else ""
    if normalized in {"local", "cloud", "default"}:
        return normalized
    return default


@dataclass(frozen=True)
class RuntimeSettings:
    host: str = _env_text("PY_RUNTIME_HOST", "0.0.0.0")
    port: int = _env_int("PY_RUNTIME_PORT", 8008)
    debug: bool = _env_bool("PY_RUNTIME_DEBUG", False)

    litellm_model: str = _env_text("PY_RUNTIME_LITELLM_MODEL", "gpt-4o-mini")
    litellm_api_base: str = _env_text("PY_RUNTIME_LITELLM_API_BASE", "")
    litellm_api_key: str = _env_text("PY_RUNTIME_LITELLM_API_KEY", "")
    model_routing_enabled: bool = _env_bool("PY_RUNTIME_MODEL_ROUTING_ENABLED", False)
    model_fallback_enabled: bool = _env_bool("PY_RUNTIME_MODEL_FALLBACK_ENABLED", True)
    route_analyze: str = _normalize_model_route(
        _env_text("PY_RUNTIME_MODEL_ROUTE_ANALYZE", "local"),
        "local",
    )
    route_search: str = _normalize_model_route(
        _env_text("PY_RUNTIME_MODEL_ROUTE_SEARCH", "local"),
        "local",
    )
    route_script: str = _normalize_model_route(
        _env_text("PY_RUNTIME_MODEL_ROUTE_SCRIPT", "cloud"),
        "cloud",
    )
    litellm_local_model: str = _env_text(
        "PY_RUNTIME_LITELLM_LOCAL_MODEL",
        "ollama/qwen2.5:7b",
    )
    litellm_local_api_base: str = _env_text(
        "PY_RUNTIME_LITELLM_LOCAL_API_BASE",
        "http://127.0.0.1:11434",
    )
    litellm_local_api_key: str = _env_text("PY_RUNTIME_LITELLM_LOCAL_API_KEY", "")
    litellm_cloud_model: str = _env_text(
        "PY_RUNTIME_LITELLM_CLOUD_MODEL",
        _env_text("PY_RUNTIME_LITELLM_MODEL", "gpt-4o-mini"),
    )
    litellm_cloud_api_base: str = _env_text(
        "PY_RUNTIME_LITELLM_CLOUD_API_BASE",
        _env_text("PY_RUNTIME_LITELLM_API_BASE", ""),
    )
    litellm_cloud_api_key: str = _env_text(
        "PY_RUNTIME_LITELLM_CLOUD_API_KEY",
        _env_text("PY_RUNTIME_LITELLM_API_KEY", ""),
    )

    database_url: str = _env_text(
        "PY_RUNTIME_DATABASE_URL",
        "sqlite:///data/sales_support_agent.db",
    )
    chroma_path: str = _env_text(
        "PY_RUNTIME_CHROMA_PATH",
        "runtime/chroma",
    )
    chroma_collection: str = _env_text(
        "PY_RUNTIME_CHROMA_COLLECTION",
        "sales_support_docs",
    )
    document_roots_raw: str = _env_text(
        "PY_RUNTIME_DOC_ROOTS",
        "data,前端支持文件,后端支持文件",
    )
    max_document_scan: int = _env_int("PY_RUNTIME_MAX_DOCUMENT_SCAN", 160)
    max_search_results: int = _env_int("PY_RUNTIME_MAX_SEARCH_RESULTS", 8)

    safety_log_file: str = _env_text(
        "PY_RUNTIME_SAFETY_LOG_FILE",
        "runtime/safety_audit.jsonl",
    )
    external_downloads_path: str = _env_text(
        "PY_RUNTIME_EXTERNAL_DOWNLOADS_PATH",
        "runtime/external_downloads",
    )

    @property
    def project_root(self) -> Path:
        # settings.py -> app -> python_runtime -> project_root
        return Path(__file__).resolve().parents[2]

    @property
    def document_roots(self) -> list[Path]:
        roots = [
            self.project_root / item.strip()
            for item in self.document_roots_raw.split(",")
            if item.strip()
        ]
        return roots

    @property
    def chroma_dir(self) -> Path:
        return self.project_root / self.chroma_path

    @property
    def safety_log_path(self) -> Path:
        return self.project_root / self.safety_log_file

    @property
    def external_downloads_dir(self) -> Path:
        return self.project_root / self.external_downloads_path

    def resolve_model_route(self, module_name: str, preferred_route: str = "") -> str:
        preferred = _normalize_model_route(preferred_route, "")
        if preferred in {"local", "cloud"}:
            return preferred

        if not self.model_routing_enabled:
            return "default"

        normalized_module = str(module_name or "").strip().lower()
        if normalized_module == "analyze":
            return self.route_analyze
        if normalized_module == "search":
            return self.route_search
        if normalized_module == "script":
            return self.route_script

        return "cloud"

    def resolve_route_candidates(self, primary_route: str) -> list[str]:
        normalized_primary = _normalize_model_route(primary_route, "default")
        if normalized_primary == "default":
            return ["default"]
        if not self.model_fallback_enabled:
            return [normalized_primary]
        fallback_route = "cloud" if normalized_primary == "local" else "local"
        return [normalized_primary, fallback_route]

    def resolve_channel_config(self, channel: str) -> dict[str, str]:
        normalized_channel = _normalize_model_route(channel, "default")
        if normalized_channel == "local":
            return {
                "channel": "local",
                "model": self.litellm_local_model or self.litellm_model,
                "api_base": self.litellm_local_api_base,
                "api_key": self.litellm_local_api_key,
            }
        if normalized_channel == "cloud":
            return {
                "channel": "cloud",
                "model": self.litellm_cloud_model or self.litellm_model,
                "api_base": self.litellm_cloud_api_base or self.litellm_api_base,
                "api_key": self.litellm_cloud_api_key or self.litellm_api_key,
            }
        return {
            "channel": "default",
            "model": self.litellm_model,
            "api_base": self.litellm_api_base,
            "api_key": self.litellm_api_key,
        }


SETTINGS = RuntimeSettings()
