"""共用的 google-genai 非同步 client。"""
from __future__ import annotations

from google import genai

from .config import get_settings

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        s = get_settings()
        _client = genai.Client(api_key=s.gemini_api_key or None)
    return _client
