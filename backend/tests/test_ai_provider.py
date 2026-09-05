import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from app.ai_provider import create_ai_services
from app.config import Settings
from app.contradiction import GeminiContradictionDetector
from app.conversation_buffer import Utterance
from app.stt import OPENROUTER_TRANSCRIPTION_URL, OpenRouterSpeechToText


class FakeGeminiInteractions:
    def __init__(self, text: str) -> None:
        self.text = text
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=self.text)


def test_provider_requires_the_selected_key() -> None:
    assert create_ai_services(
        Settings(AI_PROVIDER="openai", OPENAI_API_KEY="", OPENROUTER_API_KEY="test")
    ) is None
    assert create_ai_services(
        Settings(AI_PROVIDER="gemini", GEMINI_API_KEY="", OPENROUTER_API_KEY="test")
    ) is None
    assert create_ai_services(
        Settings(AI_PROVIDER="gemini", GEMINI_API_KEY="test", OPENROUTER_API_KEY="")
    ) is None


def test_retired_gemini_model_is_migrated() -> None:
    settings = Settings(AI_PROVIDER="gemini", GEMINI_API_KEY="test", GEMINI_MODEL="gemini-2.5-flash")
    assert settings.gemini_model == "gemini-3.8-flash"
    settings = Settings(AI_PROVIDER="gemini", GEMINI_API_KEY="test", GEMINI_MODEL="gemini-3.6-flash")
    assert settings.gemini_model == "gemini-3.8-flash"


class FakeHTTPResponse:
    status_code = 200
    text = '{"text":"會議逐字稿"}'

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"text": "會議逐字稿"}


class FakeHTTPClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def post(self, url: str, **kwargs):
        self.calls.append((url, kwargs))
        return FakeHTTPResponse()


def test_openrouter_transcribes_inline_audio_as_chinese() -> None:
    async def scenario() -> None:
        client = FakeHTTPClient()
        transcriber = OpenRouterSpeechToText(client)

        result = await transcriber.transcribe(
            b"webm audio", "audio/webm;codecs=opus", "前一段提到專案方案甲"
        )

        assert result == "會議逐字稿"
        url, request = client.calls[0]
        assert url == OPENROUTER_TRANSCRIPTION_URL
        payload = request["json"]
        assert payload["model"] == "openai/whisper-large-v3"
        assert payload["input_audio"]["format"] == "webm"
        assert payload["language"] == "zh"
        assert payload["temperature"] == 0
        prompt = payload["provider"]["options"]["groq"]["prompt"]
        assert "前一段提到專案方案甲" in prompt

    asyncio.run(scenario())


def test_openrouter_does_not_send_instruction_prompt_without_context() -> None:
    async def scenario() -> None:
        client = FakeHTTPClient()
        transcriber = OpenRouterSpeechToText(client)

        await transcriber.transcribe(b"webm audio", "audio/webm;codecs=opus")

        _, request = client.calls[0]
        payload = request["json"]
        assert "provider" not in payload
        assert payload["language"] == "zh"

    asyncio.run(scenario())


def test_gemini_returns_structured_interjection() -> None:
    async def scenario() -> None:
        interactions = FakeGeminiInteractions(
            '{"has_issue":true,"issue_type":"contradiction","explanation":"A 改成 B",'
            '"suggested_interjection":"請說明改變原因","confidence":0.9,"target_speaker":null}'
        )
        client = SimpleNamespace(aio=SimpleNamespace(interactions=interactions))
        detector = GeminiContradictionDetector(client, "gemini-3.8-flash")
        now = datetime.now(timezone.utc)

        result = await detector.analyze(
            [Utterance("採用 A", now, speaker="王小明")],
            Utterance("採用 B", now, speaker="王小明"),
        )

        assert result.has_issue
        assert result.target_speaker == "王小明"
        response_format = interactions.calls[0]["response_format"]
        assert response_format["mime_type"] == "application/json"
        assert response_format["schema"] is not None
        assert interactions.calls[0]["store"] is False

    asyncio.run(scenario())
