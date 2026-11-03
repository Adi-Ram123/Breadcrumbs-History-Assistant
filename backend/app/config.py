"""Backend settings, read from environment variables and backend/.env."""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    db_path: Path = REPO_ROOT / "data" / "breadcrumbs.db"
    default_tz: str = "America/Chicago"
    parser: str = "stub"
    embedder: str = "minilm"
    llm_mode: Literal["off", "live", "replay", "record"] = "off"
    debug_fixed_now: bool = False
    extension_origin: str = ""
