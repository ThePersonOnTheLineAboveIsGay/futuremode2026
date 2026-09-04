from io import BytesIO

from openai import AsyncOpenAI
from google import genai
from google.genai import types


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


class GeminiSpeechToText:
    def __init__(self, client: genai.Client, model: str) -> None:
        self.client = client
        self.model = model

    async def transcribe(self, audio: bytes, mime_type: str = "audio/webm") -> str:
        if not audio:
            return ""
        clean_mime_type = mime_type.split(";", 1)[0]
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=[
                "請逐字轉寫這段會議音訊。只輸出逐字稿，不要摘要、解釋或加上標點以外的註記。",
                types.Part.from_bytes(data=audio, mime_type=clean_mime_type),
            ],
            config=types.GenerateContentConfig(temperature=0),
        )
        return (response.text or "").strip()
