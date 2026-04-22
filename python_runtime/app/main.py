from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from pydantic import BaseModel, Field

from .data.chroma_connector import (
    ensure_document_index,
    get_chroma_status,
    query_chroma_documents,
)
from .data.sqlalchemy_connector import query_database_records
from .external_source_runtime import (
    execute_external_source_download,
    execute_external_source_fetch,
    execute_external_source_query,
)
from .middleware.safety import SafetyMiddleware
from .model.litellm_service import generate_with_litellm, parse_json_block
from .prompt.service import render_prompt
from .settings import SETTINGS


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _safe_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _safe_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_safe_text(item) for item in value if _safe_text(item)]


def _build_execution_context(module_name: str) -> dict[str, Any]:
    return {
        "moduleName": module_name,
        "summary": {
            "promptId": f"python.{module_name}.jinja2",
            "promptVersion": "v1",
            "strategyId": "python-runtime",
        },
        "source": {
            "runtime": "python-fastapi",
            "modelLayer": "litellm",
            "dataLayer": "sqlalchemy+chromadb",
            "promptLayer": "jinja2",
        },
        "fallbackReason": {},
    }


def _build_model_runtime(
    route_reason: str,
    route_trace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    safe_trace = route_trace if isinstance(route_trace, dict) else {}
    channel = _safe_text(safe_trace.get("channel"), "default")
    resolved_model_name = _safe_text(safe_trace.get("modelName"), SETTINGS.litellm_model)
    resolved_base_url = _safe_text(safe_trace.get("apiBase"), SETTINGS.litellm_api_base)
    has_api_key = bool(safe_trace.get("hasApiKey"))

    return {
        "route": f"python-litellm-{channel}",
        "reason": route_reason,
        "requestedRoute": _safe_text(safe_trace.get("requestedRoute"), "default"),
        "attempts": safe_trace.get("attempts") if isinstance(safe_trace.get("attempts"), list) else [],
        "resolvedModel": {
            "source": "python-runtime",
            "isResolved": True,
            "resolvedProvider": f"litellm-{channel}",
            "resolvedModelName": resolved_model_name,
            "resolvedBaseUrl": resolved_base_url,
            "hasApiKey": has_api_key,
        },
    }


class AnalyzeRequest(BaseModel):
    customerName: str | None = None
    industryType: str | None = "other"
    salesStage: str | None = "other"
    productDirection: str | None = ""
    customerText: str = Field(default="")
    remark: str | None = None
    sessionId: str | None = None
    modelRoute: str | None = None
    runtimeConfig: dict[str, Any] | None = None


class SearchRequest(BaseModel):
    keyword: str = Field(default="")
    docType: str | None = None
    industryType: str | None = "other"
    onlyExternalAvailable: bool | None = False
    enableExternalSupplement: bool | None = False
    sessionId: str | None = None
    modelRoute: str | None = None
    runtimeConfig: dict[str, Any] | None = None


class ScriptRequest(BaseModel):
    sessionId: str | None = None
    communicationGoal: str | None = "first_reply"
    productDirection: str | None = ""
    customerText: str = Field(default="")
    referenceSummary: str | None = ""
    toneStyle: str | None = "formal"
    salesStage: str | None = "other"
    customerType: str | None = ""
    industryType: str | None = "other"
    modelRoute: str | None = None
    runtimeConfig: dict[str, Any] | None = None


class ExternalSourceConfig(BaseModel):
    id: str
    name: str | None = None
    providerName: str | None = None
    sourceType: str | None = "search-api"
    authType: str | None = "none"
    enabled: bool | None = True
    baseUrl: str = ""
    apiPath: str | None = None
    apiKey: str | None = None
    username: str | None = None
    password: str | None = None
    capabilities: list[str] | None = None
    allowedDomains: list[str] | None = None
    publicDataOnly: bool | None = True
    localDataOutboundPolicy: str | None = "blocked"


class ExternalSourceRuntimeRequest(BaseModel):
    source: ExternalSourceConfig
    sessionId: str | None = None
    query: str | None = None
    page: int | None = 1
    pageSize: int | None = 10
    path: str | None = None
    apiPath: str | None = None
    resourceUrl: str | None = None
    resourcePath: str | None = None
    fileName: str | None = None
    httpMethod: str | None = None
    timeoutMs: int | None = 10000
    queryParams: dict[str, Any] | None = None
    requestBody: dict[str, Any] | None = None
    headers: dict[str, Any] | None = None
    modelRoute: str | None = None
    runtimeConfig: dict[str, Any] | None = None


app = FastAPI(
    title="Sales Support Python Runtime",
    version="1.0.0",
    description="LiteLLM + FastAPI Middleware + SQLAlchemy + ChromaDB + Jinja2",
)
app.add_middleware(SafetyMiddleware, log_file=SETTINGS.safety_log_path)


@app.on_event("startup")
def _startup() -> None:
    ensure_document_index()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "success": True,
        "message": "python runtime healthy",
        "data": {
            "runtime": "python-fastapi",
            "modelLayer": "litellm",
            "securityLayer": "fastapi-middleware",
            "dataLayer": "sqlalchemy+chromadb",
            "promptLayer": "jinja2",
            "chroma": get_chroma_status(),
        },
    }


@app.post("/api/v1/analyze-customer")
def analyze_customer(payload: AnalyzeRequest, request: Request) -> dict[str, Any]:
    session_id = _safe_text(payload.sessionId) or str(uuid4())
    step_id = str(uuid4())
    customer_text = _safe_text(payload.customerText)
    product_direction = _safe_text(payload.productDirection)
    sales_stage = _safe_text(payload.salesStage, "other")
    industry_type = _safe_text(payload.industryType, "other")

    prompt_text = render_prompt(
        "analyze.j2",
        {
            "customer_text": customer_text,
            "product_direction": product_direction,
            "sales_stage": sales_stage,
            "industry_type": industry_type,
        },
    )
    response_text, route_reason, route_trace = generate_with_litellm(
        messages=[
            {
                "role": "system",
                "content": "你是企业服务支持分析助手。只输出 JSON。",
            },
            {"role": "user", "content": prompt_text},
        ],
        max_tokens=700,
        module_name="analyze",
        preferred_route=_safe_text(payload.modelRoute),
        runtime_config=payload.runtimeConfig or {},
    )
    parsed = parse_json_block(response_text) or {}

    final_analyze_data = {
        "summary": _safe_text(
            parsed.get("summary"),
            f"客户当前关注“{product_direction or '目标方案'}”，建议先确认应用工序、评价标准和推进节奏。",
        ),
        "sceneJudgement": _safe_text(
            parsed.get("sceneJudgement"),
            "当前场景初步判断为服务支持沟通阶段。",
        ),
        "recommendedProducts": _safe_list(parsed.get("recommendedProducts"))
        or [product_direction or "基础资料包"],
        "followupQuestions": _safe_list(parsed.get("followupQuestions"))
        or [
            "客户当前最关心的指标是什么？",
            "是否已有现用方案可对比？",
            "是否计划进入测试或验证？",
        ],
        "riskNotes": _safe_list(parsed.get("riskNotes"))
        or ["在未明确工艺条件前，不建议给出刚性性能承诺。"],
        "nextActions": _safe_list(parsed.get("nextActions"))
        or ["补齐关键条件", "整理可公开资料", "确认下一步推进节点"],
        "nextStepType": _safe_text(parsed.get("nextStepType"), "go_search"),
    }
    safety_summary = getattr(request.state, "safety", {"redactionCount": 0})
    execution_context = _build_execution_context("analyze")

    return {
        "success": True,
        "message": "analyze completed by python runtime",
        "data": {
            "sessionId": session_id,
            "stepId": step_id,
            "matchedRule": None,
            "matchedProducts": [],
            "matchedProduct": None,
            "relatedDocumentNames": [],
            "analyzeModelConfig": {"modelName": SETTINGS.litellm_model},
            "modelRuntime": _build_model_runtime(route_reason, route_trace),
            "analyzeStrategy": "python-litellm",
            "analyzeExecutionStrategy": "python-fastapi",
            "analyzeOutboundDecision": {
                "outboundAllowed": True,
                "outboundReason": "python-middleware-sanitized",
            },
            "sanitizedAnalyzeInput": {
                "sanitizedText": customer_text,
                "redactionCount": int(safety_summary.get("redactionCount", 0)),
            },
            "analysisRoute": "python-runtime",
            "activeAssistantId": "",
            "promptId": "python.analyze.jinja2",
            "promptVersion": "v1",
            "strategy": {"id": "python-runtime", "label": "Python Runtime"},
            "source": execution_context.get("source"),
            "fallbackReason": execution_context.get("fallbackReason"),
            "assistantContext": {
                "assistantId": "",
                "source": "python-runtime",
            },
            "executionContext": execution_context,
            "analyzePrompt": {
                "id": "python.analyze.jinja2",
                "version": "v1",
            },
            "baseResult": final_analyze_data,
            "finalAnalyzeData": final_analyze_data,
        },
    }


@app.post("/api/v1/search-documents")
def search_documents(payload: SearchRequest, request: Request) -> dict[str, Any]:
    session_id = _safe_text(payload.sessionId) or str(uuid4())
    step_id = str(uuid4())
    keyword = _safe_text(payload.keyword)
    db_candidates = query_database_records(
        keyword,
        limit=max(1, SETTINGS.max_search_results // 2),
    )
    chroma_candidates = query_chroma_documents(
        keyword,
        limit=max(1, SETTINGS.max_search_results // 2),
    )
    candidates = db_candidates + chroma_candidates

    evidence_items = []
    for index, candidate in enumerate(candidates, start=1):
        source_type = _safe_text(candidate.get("sourceType"), "local-file")
        outbound_allowed = source_type != "enterprise-database"
        evidence_items.append(
            {
                "evidenceId": f"evidence-{index}",
                "level": "core" if index <= 3 else "support",
                "sourceType": source_type,
                "sourceRef": _safe_text(candidate.get("sourceRef"), f"source-{index}"),
                "title": _safe_text(candidate.get("title"), f"证据 {index}"),
                "docType": _safe_text(candidate.get("docType"), "资料"),
                "summary": _safe_text(candidate.get("summary"), ""),
                "applicableScene": _safe_text(candidate.get("applicableScene"), "python/search"),
                "outboundStatus": "allowed" if outbound_allowed else "internal-only",
                "outboundPolicy": {
                    "decision": "allowed" if outbound_allowed else "internal-only",
                    "reason": "python-whitelist-allowed"
                    if outbound_allowed
                    else "python-database-internal-only",
                    "whitelistMatched": outbound_allowed,
                    "summaryAllowed": outbound_allowed,
                    "policySource": "python-runtime.search.policy",
                    "connectorType": "database"
                    if source_type == "enterprise-database"
                    else "knowledge",
                },
                "confidence": round(0.92 - ((index - 1) * 0.05), 2),
                "relatedAssistantId": "",
                "relatedSessionId": session_id,
            }
        )

    primary_evidence_ids = [item["evidenceId"] for item in evidence_items[:3]]
    whitelisted_evidence = [
        {
            "evidenceId": item["evidenceId"],
            "sourceType": item["sourceType"],
            "title": item["title"],
            "docType": item["docType"],
            "summary": item["summary"],
            "confidence": item["confidence"],
        }
        for item in evidence_items
        if item["outboundPolicy"]["summaryAllowed"]
    ][:6]

    prompt_text = render_prompt(
        "search.j2",
        {
            "sanitized_keyword": keyword,
            "whitelisted_evidence_json": json.dumps(
                whitelisted_evidence,
                ensure_ascii=False,
                indent=2,
            ),
        },
    )
    response_text, route_reason, route_trace = generate_with_litellm(
        messages=[
            {
                "role": "system",
                "content": "你是检索总结助手。只输出 JSON。",
            },
            {"role": "user", "content": prompt_text},
        ],
        max_tokens=520,
        module_name="search",
        preferred_route=_safe_text(payload.modelRoute),
        runtime_config=payload.runtimeConfig or {},
    )
    parsed = parse_json_block(response_text) or {}
    search_summary = _safe_text(
        parsed.get("searchSummary"),
        f"已基于关键词“{keyword or '未提供'}”返回 {len(evidence_items)} 条证据。",
    )
    safety_summary = getattr(request.state, "safety", {"redactionCount": 0})
    execution_context = _build_execution_context("search")

    return {
        "success": True,
        "message": "search completed by python runtime",
        "data": {
            "keyword": keyword,
            "sessionId": session_id,
            "stepId": step_id,
            "matchedRule": None,
            "matchedProducts": [],
            "evidenceItems": evidence_items,
            "primaryEvidenceIds": primary_evidence_ids,
            "referenceSummary": search_summary,
            "searchModelConfig": {"modelName": SETTINGS.litellm_model},
            "modelRuntime": _build_model_runtime(route_reason, route_trace),
            "searchStrategy": "python-data-search",
            "searchExecutionStrategy": "python-fastapi",
            "enableExternalSupplement": bool(payload.enableExternalSupplement),
            "externalSearchAllowed": False,
            "searchSanitizationResult": {
                "sanitizedText": keyword,
                "redactionCount": int(safety_summary.get("redactionCount", 0)),
                "outboundAllowed": True,
                "outboundReason": "python-sanitized",
            },
            "searchKeywordPolicy": {
                "sanitizedKeyword": keyword,
                "outboundAllowed": True,
                "outboundReason": "python-sanitized",
                "externalSearchAllowed": False,
                "externalSearchReason": "python-local-only",
            },
            "sourceSummary": {
                "knowledgeCount": len(chroma_candidates),
                "fileSystemCount": len(chroma_candidates),
                "enterpriseDatabaseCount": len(db_candidates),
            },
            "searchRoute": "python-chromadb+sqlalchemy",
            "searchReason": "python-runtime",
            "searchSummary": search_summary,
            "externalResults": [],
            "externalProvider": "",
            "externalProviderConfigured": False,
            "strategy": {"id": "python-runtime", "label": "Python Runtime"},
            "source": execution_context.get("source"),
            "fallbackReason": execution_context.get("fallbackReason"),
            "promptId": "python.search.jinja2",
            "promptVersion": "v1",
            "assistantContext": {
                "assistantId": "",
                "source": "python-runtime",
            },
            "executionContext": execution_context,
            "activeAssistantId": "",
            "searchPrompt": {
                "id": "python.search.jinja2",
                "version": "v1",
            },
            "modulePolicy": None,
            "summaryModelTrace": {
                "allowed": True,
                "used": bool(response_text),
                "reason": route_reason,
                "whitelistedEvidenceCount": len(whitelisted_evidence),
                "whitelistedEvidenceIds": [item["evidenceId"] for item in whitelisted_evidence],
            },
            "externalSearchTrace": {
                "requested": bool(payload.enableExternalSupplement),
                "allowed": False,
                "used": False,
                "providerConfigured": False,
                "resultCount": 0,
                "reason": "python-local-only",
            },
            "whitelistedEvidenceSummaries": whitelisted_evidence,
            "connectorRegistrySummary": {
                "contractVersion": "python-connectors/v1",
                "connectorCount": 2,
                "connectors": [
                    {"id": "database", "adapterType": "sqlalchemy"},
                    {"id": "knowledge", "adapterType": "chromadb"},
                ],
            },
            "searchTraceSummary": {
                "outboundAllowed": True,
                "outboundReason": "python-runtime",
                "outboundPolicySummary": {
                    "allowedCount": len(
                        [item for item in evidence_items if item["outboundStatus"] == "allowed"]
                    ),
                    "internalOnlyCount": len(
                        [item for item in evidence_items if item["outboundStatus"] != "allowed"]
                    ),
                    "unknownCount": 0,
                },
            },
        },
    }


@app.post("/api/v1/generate-script")
def generate_script(payload: ScriptRequest, request: Request) -> dict[str, Any]:
    session_id = _safe_text(payload.sessionId) or str(uuid4())
    step_id = str(uuid4())
    customer_text = _safe_text(payload.customerText)
    reference_summary = _safe_text(payload.referenceSummary)
    product_direction = _safe_text(payload.productDirection)
    tone_style = _safe_text(payload.toneStyle, "formal")
    communication_goal = _safe_text(payload.communicationGoal, "first_reply")

    prompt_text = render_prompt(
        "script.j2",
        {
            "customer_text": customer_text,
            "reference_summary": reference_summary,
            "tone_style": tone_style,
            "communication_goal": communication_goal,
            "product_direction": product_direction,
        },
    )
    response_text, route_reason, route_trace = generate_with_litellm(
        messages=[
            {"role": "system", "content": "你是销售支持话术助手。只输出 JSON。"},
            {"role": "user", "content": prompt_text},
        ],
        max_tokens=700,
        module_name="script",
        preferred_route=_safe_text(payload.modelRoute),
        runtime_config=payload.runtimeConfig or {},
    )
    parsed = parse_json_block(response_text) or {}

    formal_version = _safe_text(
        parsed.get("formalVersion"),
        f"您好，关于您提到的“{product_direction or '当前需求'}”，我们建议先基于现有资料确认关键条件，再安排下一步技术沟通。",
    )
    concise_version = _safe_text(
        parsed.get("conciseVersion"),
        formal_version[:120] if len(formal_version) > 120 else formal_version,
    )
    spoken_version = _safe_text(
        parsed.get("spokenVersion"),
        concise_version,
    )
    caution_notes = _safe_list(parsed.get("cautionNotes")) or [
        "在未确认工艺条件前，不建议承诺最终效果。",
    ]
    safety_summary = getattr(request.state, "safety", {"redactionCount": 0})
    execution_context = _build_execution_context("script")
    final_result = {
        "formalVersion": formal_version,
        "conciseVersion": concise_version,
        "spokenVersion": spoken_version,
        "cautionNotes": caution_notes,
        "llmVersion": response_text or formal_version,
        "llmRoute": "python-litellm",
        "scriptStrategy": "python-litellm",
        "scriptExecutionStrategy": "python-fastapi",
        "outboundAllowed": True,
        "outboundReason": "python-sanitized",
        "sanitizedCustomerText": customer_text,
        "sanitizedReferenceSummary": reference_summary,
    }

    return {
        "success": True,
        "message": "script completed by python runtime",
        "data": {
            "rawInput": payload.model_dump(),
            "sessionId": session_id,
            "stepId": step_id,
            "modulePolicy": None,
            "scriptModelConfig": {"modelName": SETTINGS.litellm_model},
            "modelRuntime": _build_model_runtime(route_reason, route_trace),
            "scriptStrategy": "python-litellm",
            "scriptExecutionStrategy": "python-fastapi",
            "selectedTemplate": "",
            "scene": communication_goal,
            "sceneTemplates": [],
            "toneRule": {"name": tone_style},
            "cautionNotes": caution_notes,
            "customerSanitizationResult": {
                "sanitizedText": customer_text,
                "redactionCount": int(safety_summary.get("redactionCount", 0)),
            },
            "referenceSummarySanitizationResult": {
                "sanitizedText": reference_summary,
                "redactionCount": int(safety_summary.get("redactionCount", 0)),
            },
            "outboundAllowed": True,
            "outboundReason": "python-sanitized",
            "strategy": {"id": "python-runtime", "label": "Python Runtime"},
            "source": execution_context.get("source"),
            "fallbackReason": execution_context.get("fallbackReason"),
            "promptId": "python.script.jinja2",
            "promptVersion": "v1",
            "executionContext": execution_context,
            "finalResult": final_result,
        },
    }


@app.post("/api/v1/external-sources/query")
def external_source_query(payload: ExternalSourceRuntimeRequest, request: Request) -> dict[str, Any]:
    session_id = _safe_text(payload.sessionId) or str(uuid4())
    step_id = str(uuid4())
    safety_summary = getattr(request.state, "safety", {"redactionCount": 0})
    query_result = execute_external_source_query(payload.model_dump())
    execution_context = _build_execution_context("search")

    return {
        "success": True,
        "message": "external source query completed by python runtime",
        "data": {
            "sessionId": session_id,
            "stepId": step_id,
            "sourceId": query_result.get("sourceId"),
            "requestUrl": query_result.get("requestUrl"),
            "statusCode": query_result.get("statusCode"),
            "contentType": query_result.get("contentType"),
            "resultCount": query_result.get("resultCount"),
            "items": query_result.get("items"),
            "query": query_result.get("query"),
            "queryMode": query_result.get("queryMode"),
            "sanitization": {
                "redactionCount": int(safety_summary.get("redactionCount", 0)),
                "publicDataOnly": True,
            },
            "outboundPolicy": query_result.get("outboundPolicy"),
            "executionContext": execution_context,
            "strategy": {"id": "python-runtime", "label": "Python Runtime"},
        },
    }


@app.post("/api/v1/external-sources/fetch")
def external_source_fetch(payload: ExternalSourceRuntimeRequest, request: Request) -> dict[str, Any]:
    session_id = _safe_text(payload.sessionId) or str(uuid4())
    step_id = str(uuid4())
    safety_summary = getattr(request.state, "safety", {"redactionCount": 0})
    fetch_result = execute_external_source_fetch(payload.model_dump())
    execution_context = _build_execution_context("search")

    return {
        "success": True,
        "message": "external source fetch completed by python runtime",
        "data": {
            "sessionId": session_id,
            "stepId": step_id,
            "sourceId": fetch_result.get("sourceId"),
            "requestUrl": fetch_result.get("requestUrl"),
            "statusCode": fetch_result.get("statusCode"),
            "contentType": fetch_result.get("contentType"),
            "contentLength": fetch_result.get("contentLength"),
            "bodyPreview": fetch_result.get("bodyPreview"),
            "parsedJson": fetch_result.get("parsedJson"),
            "sanitization": {
                "redactionCount": int(safety_summary.get("redactionCount", 0)),
                "publicDataOnly": True,
            },
            "outboundPolicy": fetch_result.get("outboundPolicy"),
            "executionContext": execution_context,
            "strategy": {"id": "python-runtime", "label": "Python Runtime"},
        },
    }


@app.post("/api/v1/external-sources/download")
def external_source_download(payload: ExternalSourceRuntimeRequest, request: Request) -> dict[str, Any]:
    session_id = _safe_text(payload.sessionId) or str(uuid4())
    step_id = str(uuid4())
    safety_summary = getattr(request.state, "safety", {"redactionCount": 0})
    download_result = execute_external_source_download(payload.model_dump())
    execution_context = _build_execution_context("search")

    return {
        "success": True,
        "message": "external source download completed by python runtime",
        "data": {
            "sessionId": session_id,
            "stepId": step_id,
            "sourceId": download_result.get("sourceId"),
            "requestUrl": download_result.get("requestUrl"),
            "statusCode": download_result.get("statusCode"),
            "contentType": download_result.get("contentType"),
            "contentLength": download_result.get("contentLength"),
            "savedPath": download_result.get("savedPath"),
            "savedFileName": download_result.get("savedFileName"),
            "sanitization": {
                "redactionCount": int(safety_summary.get("redactionCount", 0)),
                "publicDataOnly": True,
            },
            "outboundPolicy": download_result.get("outboundPolicy"),
            "executionContext": execution_context,
            "strategy": {"id": "python-runtime", "label": "Python Runtime"},
        },
    }
