from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined


PROMPT_DIR = Path(__file__).resolve().parent / "templates"
PROMPT_ENV = Environment(
    loader=FileSystemLoader(str(PROMPT_DIR)),
    autoescape=False,
    trim_blocks=True,
    lstrip_blocks=True,
    undefined=StrictUndefined,
)


def render_prompt(template_name: str, context: dict) -> str:
    template = PROMPT_ENV.get_template(template_name)
    return template.render(**context).strip()

