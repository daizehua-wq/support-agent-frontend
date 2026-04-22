from __future__ import annotations

import json
from typing import Any

from ..settings import SETTINGS

try:
    from litellm import completion as litellm_completion
except Exception:  # pragma: no cover
    litellm_completion = None


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_route(value: Any, default: str = "") -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"local", "cloud", "default"}:
        return normalized
    return default


def _resolve_requested_route(
    module_name: str,
    preferred_route: str,
    runtime_config: dict[str, Any] | None,
) -> str:
    normalized_preferred_route = _normalize_route(preferred_route, "")
    if normalized_preferred_route in {"local", "cloud"}:
        return normalized_preferred_route

    runtime_config_dict = _as_dict(runtime_config)
    routing_config = _as_dict(runtime_config_dict.get("modelRouting"))
    runtime_routing_enabled = routing_config.get("enabled")

    if isinstance(runtime_routing_enabled, bool):
        if not runtime_routing_enabled:
            return "default"
        module_routes = _as_dict(routing_config.get("moduleRoutes"))
        runtime_module_route = _normalize_route(module_routes.get(module_name), "")
        if runtime_module_route in {"local", "cloud"}:
            return runtime_module_route

    return SETTINGS.resolve_model_route(module_name, normalized_preferred_route)


def _resolve_route_candidates(
    requested_route: str,
    runtime_config: dict[str, Any] | None,
) -> list[str]:
    normalized_requested_route = _normalize_route(requested_route, "default")
    if normalized_requested_route == "default":
        return ["default"]

    runtime_config_dict = _as_dict(runtime_config)
    routing_config = _as_dict(runtime_config_dict.get("modelRouting"))
    runtime_fallback_enabled = routing_config.get("fallbackEnabled")

    if isinstance(runtime_fallback_enabled, bool):
        if not runtime_fallback_enabled:
            return [normalized_requested_route]
    elif not SETTINGS.model_fallback_enabled:
        return [normalized_requested_route]

    fallback_route = "cloud" if normalized_requested_route == "local" else "local"
    return [normalized_requested_route, fallback_route]


def _resolve_channel_config(
    channel: str,
    runtime_config: dict[str, Any] | None,
) -> dict[str, str]:
    base_channel_config = SETTINGS.resolve_channel_config(channel)
    runtime_config_dict = _as_dict(runtime_config)
    channels_config = _as_dict(runtime_config_dict.get("channels"))
    channel_config = _as_dict(channels_config.get(channel))

    resolved_model = str(channel_config.get("model") or base_channel_config["model"]).strip()
    resolved_api_base = str(channel_config.get("apiBase") or base_channel_config["api_base"]).strip()
    runtime_api_key = channel_config.get("apiKey")
    resolved_api_key = (
        str(base_channel_config["api_key"]).strip()
        if runtime_api_key is None
        else str(runtime_api_key).strip()
    )

    return {
        "channel": base_channel_config["channel"],
        "model": resolved_model,
        "api_base": resolved_api_base,
        "api_key": resolved_api_key,
    }


def _extract_text_from_response(response: Any) -> str:
    if not response:
        return ""

    choices = getattr(response, "choices", None)
    if choices and len(choices) > 0:
        message = getattr(choices[0], "message", None)
        if message is not None:
            content = getattr(message, "content", "")
            if isinstance(content, str):
                return content.strip()

    if isinstance(response, dict):
        choices = response.get("choices") or []
        if choices:
            content = ((choices[0] or {}).get("message") or {}).get("content") or ""
            return str(content).strip()

    return ""


def generate_with_litellm(
    *,
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 700,
    module_name: str = "",
    preferred_route: str = "",
    runtime_config: dict[str, Any] | None = None,
) -> tuple[str, str, dict[str, Any]]:
    selected_model = (model or SETTINGS.litellm_model).strip() or SETTINGS.litellm_model
    if litellm_completion is None:
        return "", "litellm-not-installed", {
            "requestedRoute": "default",
            "attempts": [],
            "channel": "default",
            "modelName": selected_model,
            "apiBase": "",
            "hasApiKey": False,
        }

    requested_route = _resolve_requested_route(module_name, preferred_route, runtime_config)
    route_candidates = _resolve_route_candidates(requested_route, runtime_config)
    attempts: list[dict[str, str]] = []

    for index, route in enumerate(route_candidates):
        channel_config = _resolve_channel_config(route, runtime_config)
        channel_model = (selected_model if model else channel_config["model"]).strip() or selected_model
        kwargs: dict[str, Any] = {
            "model": channel_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if channel_config["api_base"]:
            kwargs["api_base"] = channel_config["api_base"]
        if channel_config["api_key"]:
            kwargs["api_key"] = channel_config["api_key"]

        try:
            response = litellm_completion(**kwargs)
            text = _extract_text_from_response(response)
            route_reason = (
                "litellm"
                if index == 0
                else f"litellm-fallback:{route_candidates[0]}->{channel_config['channel']}"
            )
            return text, route_reason, {
                "requestedRoute": requested_route,
                "channel": channel_config["channel"],
                "modelName": channel_model,
                "apiBase": channel_config["api_base"],
                "hasApiKey": bool(channel_config["api_key"]),
                "attempts": attempts
                + [
                    {
                        "channel": channel_config["channel"],
                        "result": "success",
                    }
                ],
            }
        except Exception as error:  # pragma: no cover
            error_text = str(error).strip().replace("\n", " ")[:360]
            attempts.append(
                {
                    "channel": channel_config["channel"],
                    "result": "failed",
                    "error": error_text,
                }
            )

    last_error = attempts[-1]["error"] if attempts else "unknown-error"
    last_channel = attempts[-1]["channel"] if attempts else "default"
    return "", f"litellm-error:{last_error}", {
        "requestedRoute": requested_route,
        "channel": last_channel,
        "modelName": selected_model,
        "apiBase": "",
        "hasApiKey": False,
        "attempts": attempts,
    }


def parse_json_block(text: str) -> dict[str, Any] | None:
    if not text:
        return None

    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].strip()

    try:
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start_index = candidate.find("{")
    end_index = candidate.rfind("}")
    if start_index >= 0 and end_index > start_index:
        snippet = candidate[start_index : end_index + 1]
        try:
            parsed = json.loads(snippet)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None

    return None
