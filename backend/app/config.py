from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    whisper_model: str = Field(default="gpt-4o-transcribe", alias="WHISPER_MODEL")
    llm_model: str = Field(default="gpt-4o", alias="LLM_MODEL")
    interjection_confidence_threshold: float = Field(default=0.7, alias="INTERJECTION_CONFIDENCE_THRESHOLD")
    analysis_interval_seconds: float = Field(default=15, alias="ANALYSIS_INTERVAL_SECONDS")
    conversation_window_minutes: int = Field(default=15, alias="CONVERSATION_WINDOW_MINUTES")
    conversation_max_utterances: int = Field(default=100, alias="CONVERSATION_MAX_UTTERANCES")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    allowed_origins: str = Field(default="*", alias="ALLOWED_ORIGINS")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
