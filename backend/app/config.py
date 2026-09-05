from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

RETIRED_GEMINI_MODELS = {
    "gemini-2.5-flash": "gemini-3.8-flash",
    "gemini-3.6-flash": "gemini-3.8-flash",
}


class Settings(BaseSettings):
    ai_provider: Literal["openai", "gemini"] = Field(default="openai", alias="AI_PROVIDER")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    llm_model: str = Field(default="gpt-4o", alias="LLM_MODEL")
    gemini_model: str = Field(default="gemini-3.8-flash", alias="GEMINI_MODEL")
    interjection_confidence_threshold: float = Field(default=0.7, alias="INTERJECTION_CONFIDENCE_THRESHOLD")
    analysis_interval_seconds: float = Field(default=15, alias="ANALYSIS_INTERVAL_SECONDS")
    # Analysis also runs early once this many new utterances pile up, even if
    # the interval above hasn't elapsed yet — keeps fast-moving exchanges from
    # feeling sluggish without lowering the interval (and thus the API-call
    # rate) for slow-moving ones.
    analysis_min_new_utterances: int = Field(default=3, alias="ANALYSIS_MIN_NEW_UTTERANCES")
    conversation_window_minutes: int = Field(default=15, alias="CONVERSATION_WINDOW_MINUTES")
    conversation_max_utterances: int = Field(default=100, alias="CONVERSATION_MAX_UTTERANCES")
    room_idle_timeout_minutes: int = Field(default=30, alias="ROOM_IDLE_TIMEOUT_MINUTES")
    room_cleanup_interval_seconds: int = Field(default=60, alias="ROOM_CLEANUP_INTERVAL_SECONDS")
    chat_cooldown_seconds: int = Field(default=10, alias="CHAT_COOLDOWN_SECONDS")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    allowed_origins: str = Field(default="*", alias="ALLOWED_ORIGINS")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def ai_configured(self) -> bool:
        return self.analysis_configured and self.stt_configured

    @property
    def analysis_configured(self) -> bool:
        return bool(self.openai_api_key if self.ai_provider == "openai" else self.gemini_api_key)

    @property
    def stt_configured(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def missing_api_keys(self) -> list[str]:
        missing: list[str] = []
        analysis_key = "OPENAI_API_KEY" if self.ai_provider == "openai" else "GEMINI_API_KEY"
        if not self.analysis_configured:
            missing.append(analysis_key)
        if not self.stt_configured:
            missing.append("OPENROUTER_API_KEY")
        return missing

    @field_validator("gemini_model", mode="before")
    @classmethod
    def migrate_retired_gemini_model(cls, value: object) -> object:
        name = str(value).removeprefix("models/")
        return RETIRED_GEMINI_MODELS.get(name, value)


@lru_cache
def get_settings() -> Settings:
    return Settings()
