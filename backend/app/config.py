from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Secrets stay on the server; relative paths are resolved from backend/."""

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )
    environment: Literal["development", "production"] = "development"
    deepseek_api_key: SecretStr
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_chat_model: str = "deepseek-flash"
    embedding_provider: Literal["siliconflow", "local_bge"] = "siliconflow"
    embedding_api_key: SecretStr | None = None
    embedding_base_url: str = "https://api.siliconflow.cn/v1"
    embedding_api_model: str = "BAAI/bge-m3"
    local_embedding_model: str = "BAAI/bge-small-zh-v1.5"
    hf_endpoint: str = "https://hf-mirror.com"
    data_dir: Path = BASE_DIR / "data" / "public"
    storage_dir: Path = BASE_DIR / "storage"
    public_site_url: str = "http://cloud.8-152-192-126.sslip.io/wx/"
    allowed_origins: list[str] = [
        "http://cloud.8-152-192-126.sslip.io",
        "http://127.0.0.1:8931",
        "http://localhost:8931",
        "http://127.0.0.1:8932",
        "http://localhost:8932",
    ]
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    admin_token: SecretStr | None = None
    rate_limit_salt: SecretStr = SecretStr("development-only-change-before-deploy")
    chunk_size: int = Field(420, ge=100, le=800)
    chunk_overlap: int = Field(80, ge=0)
    top_k: int = Field(4, ge=1, le=6)
    min_similarity: float = Field(0.40, ge=-1, le=1)
    max_output_tokens: int = Field(650, ge=64, le=1500)
    upstream_timeout: float = Field(25, ge=2, le=90)
    request_deadline: float = Field(75, ge=10, le=180)
    requests_per_minute: int = Field(6, ge=1, le=120)
    requests_per_ip_day: int = Field(60, ge=1)
    requests_per_day: int = Field(300, ge=1)
    max_concurrent: int = Field(4, ge=1, le=16)
    max_body_bytes: int = 24576

    @model_validator(mode="after")
    def validate_settings(self):
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("CHUNK_OVERLAP must be smaller than CHUNK_SIZE")
        for name in ("data_dir", "storage_dir"):
            path = getattr(self, name)
            if not path.is_absolute():
                setattr(self, name, BASE_DIR / path)
        if self.embedding_provider == "siliconflow" and not self.embedding_api_key:
            raise ValueError("EMBEDDING_API_KEY is required")
        if self.environment == "production":
            if len(self.rate_limit_salt.get_secret_value()) < 32 or "development" in self.rate_limit_salt.get_secret_value():
                raise ValueError("Production requires a random RATE_LIMIT_SALT of 32+ characters")
            if not self.admin_token or len(self.admin_token.get_secret_value()) < 32:
                raise ValueError("Production requires a random ADMIN_TOKEN of 32+ characters")
            if "*" in self.allowed_hosts or "*" in self.allowed_origins:
                raise ValueError("Production requires explicit hosts and origins")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
