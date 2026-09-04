"""集中管理設定，從環境變數 / .env 讀取。"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""

    # 轉錄與分析共用同一個 Gemini 模型
    gemini_model: str = "gemini-3.6-flash"

    # 轉錄語言提示（自然語言，給模型看）；留空則不提示
    transcribe_language_hint: str = "繁體中文"
    # 分析輸出語言
    analysis_language: str = "zh-TW"

    # analyzer 觸發條件：任一滿足即分析
    analyze_min_new_segments: int = 3
    analyze_min_interval_seconds: float = 30.0
    # 送給模型的逐字稿視窗（尾端字元數）
    analyze_window_chars: int = 4000

    # 只有 verdict == infeasible 且 confidence >= 門檻才推播
    confidence_threshold: float = 0.6

    allow_origins: str = "*"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
