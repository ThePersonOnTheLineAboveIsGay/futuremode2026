"""透過 OpenRouter（Whisper）把音訊段轉成文字。"""
from __future__ import annotations

import logging

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

_ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions"

_EXT_BY_MIME = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
    "audio/mp3": ".mp3",
    "audio/mpeg": ".mp3",
}


async def transcribe(audio_bytes: bytes, *, mime: str = "audio/webm", context: str = "", **_: object) -> str:
    """呼叫 OpenRouter 的 Whisper 端點轉錄一段音訊；失敗重試一次。

    不在這裡過濾雜訊/幻覺——Whisper 回什麼就回傳什麼，交給 Gemini 分析時
    自己判斷、忽略雜訊或幻覺片段（見 prompts.py）。改在生成階段就降低腦補
    機率：temperature=0（降低隨機性），並把最近幾句逐字稿當 prompt 接續上去
    （讓 Whisper 知道當下在講什麼主題，不容易脫離內容亂編）。刻意不強制指定
    單一語言——會議常中英夾雜，鎖死語言反而讓另一種語言轉錄品質變差。
    """
    if not audio_bytes:
        return ""

    s = get_settings()
    if not s.openrouter_api_key:
        logger.error("未設定 OPENROUTER_API_KEY，無法轉錄")
        return ""

    ext = _EXT_BY_MIME.get(mime, ".webm")
    files = {"file": (f"audio{ext}", audio_bytes, mime)}
    data = {"model": s.openrouter_model, "response_format": "json", "temperature": "0"}
    prompt = " ".join(context.split())[-800:]
    if prompt:
        data["prompt"] = prompt
    headers = {"Authorization": f"Bearer {s.openrouter_api_key}"}

    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(2):
            try:
                resp = await client.post(_ENDPOINT, headers=headers, data=data, files=files)
                resp.raise_for_status()
            except Exception as e:  # noqa: BLE001 - 記錄後重試
                last_err = e
                logger.warning("OpenRouter 轉錄失敗 (attempt %d): %s", attempt + 1, e)
                continue

            try:
                text = (resp.json().get("text") or "").strip()
            except Exception as e:  # noqa: BLE001 - 回應不是預期的 JSON
                last_err = e
                logger.warning("OpenRouter 回應解析失敗 (attempt %d): %s | body=%s", attempt + 1, e, resp.text[:200])
                continue

            logger.info("轉錄成功（%d 字）：%s", len(text), text[:80])
            return text

    logger.error("OpenRouter 轉錄放棄：%s", last_err)
    return ""
