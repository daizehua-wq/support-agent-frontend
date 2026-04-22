from __future__ import annotations

import json
from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError

from ..settings import SETTINGS


ENGINE = create_engine(SETTINGS.database_url, future=True)


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value)
    return str(value)


def query_database_records(keyword: str, limit: int = 8) -> list[dict[str, str]]:
    normalized_keyword = (keyword or "").strip().lower()
    if not normalized_keyword:
        return []

    results: list[dict[str, str]] = []
    inspector = inspect(ENGINE)
    table_names = [
        table_name
        for table_name in inspector.get_table_names()
        if table_name != "system_settings"
    ]

    try:
        with ENGINE.connect() as connection:
            for table_name in table_names[:18]:
                if len(results) >= limit:
                    break
                query = text(f'SELECT * FROM "{table_name}" LIMIT 24')
                rows = connection.execute(query).mappings().all()

                for index, row in enumerate(rows):
                    serialized_row = " ".join(
                        _safe_text(item_value) for item_value in row.values()
                    ).lower()
                    if normalized_keyword not in serialized_row:
                        continue
                    row_id = row.get("id") or row.get("ID") or str(index + 1)
                    results.append(
                        {
                            "sourceType": "enterprise-database",
                            "sourceRef": f"{table_name}:{row_id}",
                            "title": f"{table_name} / {row_id}",
                            "docType": "数据库记录",
                            "summary": _safe_text(row)[:280],
                            "applicableScene": f"database/{table_name}",
                        }
                    )
                    if len(results) >= limit:
                        break
    except SQLAlchemyError:
        return []

    return results

