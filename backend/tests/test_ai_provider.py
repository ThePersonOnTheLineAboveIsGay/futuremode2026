import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from app.ai_provider import create_ai_services
from app.config import Settings
from app.contradiction import GeminiContradictionDetector
from app.conversation_buffer import Utterance
from app.stt import GeminiSpeechToText


class FakeGeminiModels:
    def __init__(self, text: str) -> None:
        self.text = text
        self.calls: list[dict] = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text=self.text)


def test_provider_requires_the_selected_key() -> None:
    assert create_ai_services(Settings(AI_PROVIDER="openai", OPENAI_API_KEY="")) is None
    assert create_ai_services(Settings(AI_PROVIDER="gemini", GEMINI_API_KEY="")) is None


def test_gemini_transcribes_inline_audio() -> None:
    async def scenario() -> None:
        models = FakeGeminiModels("會議逐字稿")
        client = SimpleNamespace(aio=SimpleNamespace(models=models))
        transcriber = GeminiSpeechToText(client, "gemini-2.5-flash")

        result = await transcriber.transcribe(b"webm audio", "audio/webm;codecs=opus")

        assert result == "會議逐字稿"
        assert models.calls[0]["model"] == "gemini-2.5-flash"

    asyncio.run(scenario())


def test_gemini_returns_structured_interjection() -> None:
    async def scenario() -> None:
        models = FakeGeminiModels(
            '{"has_issue":true,"issue_type":"contradiction","explanation":"A 改成 B",'
            '"suggested_interjection":"請說明改變原因","confidence":0.9,"target_speaker":null}'
        )
        client = SimpleNamespace(aio=SimpleNamespace(models=models))
        detector = GeminiContradictionDetector(client, "gemini-2.5-flash")
        now = datetime.now(timezone.utc)

        result = await detector.analyze(
            [Utterance("採用 A", now, speaker="王小明")],
            Utterance("採用 B", now, speaker="王小明"),
        )

        assert result.has_issue
        assert result.target_speaker == "王小明"
        config = models.calls[0]["config"]
        assert config.response_mime_type == "application/json"
        assert config.response_json_schema is not None

    asyncio.run(scenario())
