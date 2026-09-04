import base64

import httpx

OPENROUTER_STT_MODEL = "openai/whisper-large-v3"
OPENROUTER_TRANSCRIPTION_URL = "https://openrouter.ai/api/v1/audio/transcriptions"


def build_chinese_transcription_prompt(context: str = "") -> str:
    clean_context = " ".join(context.split())[-800:]
    instructions = (
        "這是以台灣繁體中文為主的線上會議。請忠實逐字轉寫音訊，使用繁體中文與台灣常用詞彙，"
        "保留英文專有名詞、產品名稱、數字與單位。不要翻譯成英文，不要摘要，不要解釋，"
        "不要加入講者名稱或音訊中沒有說出的內容。沒有清楚人聲時只回傳空字串。"
    )
    if clean_context:
        instructions += f" 前一段逐字稿如下，僅用於銜接斷句與專有名詞：{clean_context}"
    return instructions


class OpenRouterSpeechToText:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self.client = client
        self.model = OPENROUTER_STT_MODEL

    async def transcribe(
        self, audio: bytes, mime_type: str = "audio/webm", context: str = ""
    ) -> str:
        if not audio:
            return ""
        audio_format = audio_format_from_mime_type(mime_type)
        prompt = build_chinese_transcription_prompt(context)
        response = await self.client.post(
            OPENROUTER_TRANSCRIPTION_URL,
            json={
                "model": self.model,
                "input_audio": {
                    "data": base64.b64encode(audio).decode("ascii"),
                    "format": audio_format,
                },
                "language": "zh",
                "temperature": 0,
                "provider": {
                    "options": {
                        "groq": {"prompt": prompt},
                        "deepinfra": {"prompt": prompt},
                        "together": {"prompt": prompt},
                    }
                },
            },
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            try:
                detail = response.json().get("error", {}).get("message")
            except (ValueError, AttributeError):
                detail = None
            raise RuntimeError(
                f"OpenRouter STT 回傳 HTTP {response.status_code}：{detail or response.text[:300]}"
            ) from exc
        payload = response.json()
        return str(payload.get("text") or "").strip()


def audio_format_from_mime_type(mime_type: str) -> str:
    clean = mime_type.split(";", 1)[0].lower()
    formats = {
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/flac": "flac",
        "audio/aac": "aac",
    }
    return formats.get(clean, "webm")
