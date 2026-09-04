from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from google import genai
from openai import AsyncOpenAI

from .config import Settings
from .contradiction import ContradictionDetector, GeminiContradictionDetector, InterjectionAnalysis
from .conversation_buffer import Utterance
from .stt import GeminiSpeechToText, SpeechToText


class Transcriber(Protocol):
    async def transcribe(self, audio: bytes, mime_type: str = "audio/webm") -> str: ...


class Detector(Protocol):
    async def analyze(self, history: list[Utterance], latest: Utterance) -> InterjectionAnalysis: ...


@dataclass
class AIServices:
    provider: str
    transcriber: Transcriber
    detector: Detector
    client: AsyncOpenAI | genai.Client

    async def close(self) -> None:
        if self.provider == "openai":
            await self.client.close()
        else:
            await self.client.aio.aclose()


def create_ai_services(settings: Settings) -> AIServices | None:
    if not settings.ai_configured:
        return None

    if settings.ai_provider == "openai":
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        return AIServices(
            provider="openai",
            transcriber=SpeechToText(client, settings.whisper_model),
            detector=ContradictionDetector(client, settings.llm_model),
            client=client,
        )

    client = genai.Client(api_key=settings.gemini_api_key)
    return AIServices(
        provider="gemini",
        transcriber=GeminiSpeechToText(client, settings.gemini_model),
        detector=GeminiContradictionDetector(client, settings.gemini_model),
        client=client,
    )
