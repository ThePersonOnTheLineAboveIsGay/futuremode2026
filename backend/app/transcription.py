"""透過 Gemini API 把音訊段轉成文字。"""
from __future__ import annotations

import logging

from google.genai import types

from .config import get_settings
from .gemini_client import get_client

logger = logging.getLogger(__name__)

# 模型在靜音／雜訊段常見的回應，直接丟棄
_NOISE = {"", "（無語音）", "(無語音)", "[靜音]", "無法辨識", "no speech", "(silence)"}


def _looks_like_noise(text: str) -> bool:
    stripped = text.strip().strip("。.!！?？ ")
    return stripped.lower() in _NOISE or len(stripped) == 0


def _prompt() -> str:
    hint = get_settings().transcribe_language_hint.strip()
    lang = f"（語言：{hint}）" if hint else ""
    return (
        f"你是逐字稿轉錄器。把這段會議音訊逐字轉成文字{lang}。"
        "只輸出聽到的內容，不要加標點以外的任何說明、標記或前後綴。"
        "若整段沒有清楚人聲，輸出「（無語音）」。"
    )


async def transcribe(audio_bytes: bytes, *, mime: str = "audio/webm", **_: object) -> str:
    """轉錄一段音訊；失敗重試一次；雜訊結果回傳空字串。"""
    if not audio_bytes:
        return ""

    s = get_settings()
    client = get_client()

    last_err: Exception | None = None
    for attempt in range(2):
        try:
            resp = await client.aio.models.generate_content(
                model=s.gemini_model,
                contents=[
                    _prompt(),
                    types.Part.from_bytes(data=audio_bytes, mime_type=mime),
                ],
            )
        except Exception as e:  # noqa: BLE001 - 記錄後重試
            last_err = e
            logger.warning("Gemini 轉錄失敗 (attempt %d): %s", attempt + 1, e)
            continue

        try:
            text = (resp.text or "").strip()
        except Exception as e:  # noqa: BLE001 - 例如被安全過濾擋掉、沒有文字內容
            logger.warning(
                "Gemini 回應沒有文字內容 (attempt %d): %s | finish_reason=%s",
                attempt + 1,
                e,
                getattr(getattr(resp, "candidates", [None])[0], "finish_reason", None) if getattr(resp, "candidates", None) else None,
            )
            last_err = e
            continue

        if _looks_like_noise(text):
            logger.info("轉錄結果視為雜訊/靜音，已丟棄：%r", text)
            return ""

        logger.info("轉錄成功（%d 字）：%s", len(text), text[:80])
        return text

    logger.error("Gemini 轉錄放棄：%s", last_err)
    return ""
