import base64

import httpx

OPENROUTER_STT_MODEL = "openai/whisper-large-v3"
OPENROUTER_TRANSCRIPTION_URL = "https://openrouter.ai/api/v1/audio/transcriptions"


def build_transcription_context(context: str = "") -> str:
    return " ".join(context.split())[-800:]


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
        payload = {
            "model": self.model,
            "input_audio": {
                "data": base64.b64encode(audio).decode("ascii"),
                "format": audio_format,
            },
            "language": "zh",
            "temperature": 0,
        }
        prompt = build_transcription_context(context)
        if prompt:
            payload["provider"] = {
                "options": {
                    "groq": {"prompt": prompt},
                    "deepinfra": {"prompt": prompt},
                    "together": {"prompt": prompt},
                }
            }
        response = await self.client.post(OPENROUTER_TRANSCRIPTION_URL, json=payload)
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
