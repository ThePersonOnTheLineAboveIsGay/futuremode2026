from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx
from google import genai
from openai import AsyncOpenAI

from .config import Settings
from .contradiction import ContradictionDetector, GeminiContradictionDetector, InterjectionAnalysis
from .conversation_buffer import Utterance
from .stt import OpenRouterSpeechToText


class Transcriber(Protocol):
    async def transcribe(
        self, audio: bytes, mime_type: str = "audio/webm", context: str = ""
    ) -> str: ...


class Detector(Protocol):
    async def analyze(self, history: list[Utterance], latest: Utterance) -> InterjectionAnalysis: ...


@dataclass
class AIServices:
    provider: str
    transcriber: Transcriber
    detector: Detector
    stt_client: httpx.AsyncClient
    analysis_client: AsyncOpenAI | genai.Client

    async def close(self) -> None:
        await self.stt_client.aclose()
        if self.provider == "openai":
            await self.analysis_client.close()
        else:
            await self.analysis_client.aio.aclose()


def create_ai_services(settings: Settings) -> AIServices | None:
    if not settings.ai_configured:
        return None

    stt_client = httpx.AsyncClient(
        timeout=httpx.Timeout(60.0),
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "X-OpenRouter-Title": "Meet AI Interrupter",
        },
    )
    transcriber = OpenRouterSpeechToText(stt_client)

    if settings.ai_provider == "openai":
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        return AIServices(
            provider="openai",
            transcriber=transcriber,
            detector=ContradictionDetector(client, settings.llm_model),
            stt_client=stt_client,
            analysis_client=client,
        )

    client = genai.Client(api_key=settings.gemini_api_key)
    return AIServices(
        provider="gemini",
        transcriber=transcriber,
        detector=GeminiContradictionDetector(client, settings.gemini_model),
        stt_client=stt_client,
        analysis_client=client,
    )
