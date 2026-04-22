from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ..settings import SETTINGS

try:
    import chromadb
except Exception:  # pragma: no cover
    chromadb = None


_INDEX_READY = False


def _vectorize_text(value: str, dimension: int = 16) -> list[float]:
    digest = hashlib.sha256(value.encode("utf-8")).digest()
    return [round((digest[index] / 255.0), 6) for index in range(dimension)]


def _iter_documents() -> list[tuple[str, str, str]]:
    documents: list[tuple[str, str, str]] = []
    max_count = max(16, SETTINGS.max_document_scan)

    for root in SETTINGS.document_roots:
        if not root.exists() or not root.is_dir():
            continue

        for file_path in root.rglob("*"):
            if len(documents) >= max_count:
                return documents
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in {".md", ".txt", ".json"}:
                continue

            try:
                content = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue

            normalized_content = " ".join(content.split())
            if not normalized_content:
                continue
            relative_path = str(file_path.relative_to(SETTINGS.project_root))
            documents.append((relative_path, file_path.suffix.lower(), normalized_content))

    return documents


def _ensure_collection():
    if chromadb is None:
        return None

    SETTINGS.chroma_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(SETTINGS.chroma_dir))
    collection = client.get_or_create_collection(name=SETTINGS.chroma_collection)
    return collection


def ensure_document_index() -> bool:
    global _INDEX_READY
    if _INDEX_READY:
        return True

    collection = _ensure_collection()
    if collection is None:
        return False

    documents = _iter_documents()
    if not documents:
        _INDEX_READY = True
        return True

    ids = [f"doc-{hashlib.md5(path.encode('utf-8')).hexdigest()}" for path, _, _ in documents]
    metadatas = [
        {
            "path": path,
            "extension": extension,
        }
        for path, extension, _ in documents
    ]
    contents = [content[:2200] for _, _, content in documents]
    embeddings = [_vectorize_text(content) for content in contents]

    collection.upsert(
        ids=ids,
        metadatas=metadatas,
        documents=contents,
        embeddings=embeddings,
    )
    _INDEX_READY = True
    return True


def query_chroma_documents(keyword: str, limit: int = 8) -> list[dict[str, str]]:
    normalized_keyword = (keyword or "").strip()
    if not normalized_keyword:
        return []

    collection = _ensure_collection()
    if collection is None:
        return []
    ensure_document_index()

    try:
        query_result = collection.query(
            query_embeddings=[_vectorize_text(normalized_keyword)],
            n_results=max(1, min(limit, SETTINGS.max_search_results)),
        )
    except Exception:
        return []

    raw_documents = (query_result.get("documents") or [[]])[0]
    raw_metadatas = (query_result.get("metadatas") or [[]])[0]
    raw_ids = (query_result.get("ids") or [[]])[0]
    results: list[dict[str, str]] = []

    for index, content in enumerate(raw_documents):
        metadata = raw_metadatas[index] if index < len(raw_metadatas) else {}
        row_id = raw_ids[index] if index < len(raw_ids) else f"chroma-{index + 1}"
        path = (metadata or {}).get("path") or f"chroma/{row_id}"
        summary = " ".join(str(content or "").split())[:260]
        results.append(
            {
                "sourceType": "local-file",
                "sourceRef": row_id,
                "title": path,
                "docType": "知识文件",
                "summary": summary,
                "applicableScene": "chroma/knowledge",
            }
        )

    return results


def get_chroma_status() -> dict[str, str | bool]:
    return {
        "enabled": chromadb is not None,
        "collection": SETTINGS.chroma_collection,
        "path": str(SETTINGS.chroma_dir),
    }

