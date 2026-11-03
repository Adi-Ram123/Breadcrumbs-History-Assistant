"""Write backend/openapi.json. The extension's TypeScript client is generated from it.

Usage: uv run python backend/scripts/export_openapi.py
"""

import json
from pathlib import Path

from app.main import create_app

OUT = Path(__file__).resolve().parents[1] / "openapi.json"


def main() -> None:
    OUT.write_text(json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
