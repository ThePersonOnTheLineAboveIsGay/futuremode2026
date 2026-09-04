from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ai_provider: Literal["openai", "gemini"] = Field(default="openai", alias="AI_PROVIDER")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    whisper_model: str = Field(default="gpt-4o-transcribe", alias="WHISPER_MODEL")
    llm_model: str = Field(default="gpt-4o", alias="LLM_MODEL")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    interjection_confidence_threshold: float = Field(default=0.7, alias="INTERJECTION_CONFIDENCE_THRESHOLD")
    analysis_interval_seconds: float = Field(default=15, alias="ANALYSIS_INTERVAL_SECONDS")
    conversation_window_minutes: int = Field(default=15, alias="CONVERSATION_WINDOW_MINUTES")
    conversation_max_utterances: int = Field(default=100, alias="CONVERSATION_MAX_UTTERANCES")
    room_idle_timeout_minutes: int = Field(default=30, alias="ROOM_IDLE_TIMEOUT_MINUTES")
    room_cleanup_interval_seconds: int = Field(default=60, alias="ROOM_CLEANUP_INTERVAL_SECONDS")
    chat_cooldown_seconds: int = Field(default=60, alias="CHAT_COOLDOWN_SECONDS")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    allowed_origins: str = Field(default="*", alias="ALLOWED_ORIGINS")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def ai_configured(self) -> bool:
        return bool(self.openai_api_key if self.ai_provider == "openai" else self.gemini_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
