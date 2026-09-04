from io import BytesIO

from openai import AsyncOpenAI


class SpeechToText:
    def __init__(self, client: AsyncOpenAI, model: str) -> None:
        self.client = client
        self.model = model

    async def transcribe(self, audio: bytes, mime_type: str = "audio/webm") -> str:
        if not audio:
            return ""
        extension = "ogg" if "ogg" in mime_type else "webm"
        audio_file = BytesIO(audio)
        audio_file.name = f"meeting-chunk.{extension}"
        result = await self.client.audio.transcriptions.create(
            model=self.model, file=audio_file, language="zh", response_format="json"
        )
        return (result.text or "").strip()
