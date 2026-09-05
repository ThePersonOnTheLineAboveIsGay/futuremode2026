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

# 模型在靜音／雜訊段常見的回應，直接丟棄
_NOISE = {"", "（無語音）", "(無語音)", "[靜音]", "無法辨識", "no speech", "(silence)"}

# Whisper 對靜音／雜訊段常見的另一種幻覺：腦補出 YouTube 影片開頭結尾的制式用語
# （謝謝觀看、訂閱、點讚、字幕組…）。每次幻覺出的措辭都不一樣，精確比對擋不住，
# 改用關鍵字命中數判斷——命中 2 個以上才視為幻覺，避免誤刪真的提到「訂閱」之類的正常發言。
_HALLUCINATION_MARKERS = (
    "謝謝觀看", "谢谢观看", "感謝觀看", "感谢观看",
    "歡迎訂閱", "欢迎订阅", "請訂閱", "请订阅", "訂閱", "订阅",
    "點讚", "点赞", "不吝點讚", "不吝点赞",
    "轉發", "转发", "打賞", "打赏",
    "字幕由", "字幕組", "字幕组",
    "明鏡與點點", "明镜与点点",
)


def _looks_like_noise(text: str) -> bool:
    stripped = text.strip().strip("。.!！?？ ")
    if stripped.lower() in _NOISE or len(stripped) == 0:
        return True
    hits = sum(1 for marker in _HALLUCINATION_MARKERS if marker in stripped)
    return hits >= 2


async def transcribe(audio_bytes: bytes, *, mime: str = "audio/webm", **_: object) -> str:
    """呼叫 OpenRouter 的 Whisper 端點轉錄一段音訊；失敗重試一次；雜訊結果回傳空字串。"""
    if not audio_bytes:
        return ""

    s = get_settings()
    if not s.openrouter_api_key:
        logger.error("未設定 OPENROUTER_API_KEY，無法轉錄")
        return ""

    ext = _EXT_BY_MIME.get(mime, ".webm")
    files = {"file": (f"audio{ext}", audio_bytes, mime)}
    data = {"model": s.openrouter_model, "response_format": "json"}
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

            if _looks_like_noise(text):
                logger.info("轉錄結果視為雜訊/靜音，已丟棄：%r", text)
                return ""

            logger.info("轉錄成功（%d 字）：%s", len(text), text[:80])
            return text

    logger.error("OpenRouter 轉錄放棄：%s", last_err)
    return ""
