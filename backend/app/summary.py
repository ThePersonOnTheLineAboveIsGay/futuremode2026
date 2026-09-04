from __future__ import annotations

from typing import Protocol

from google import genai
from openai import AsyncOpenAI

from .conversation_buffer import Utterance
from .contradiction import format_utterance

SUMMARY_SYSTEM_PROMPT = """你是會議記錄助手。你會收到一段會議逐字稿歷史紀錄。
請把它整理成 3 到 8 條繁體中文重點摘要，使用台灣用詞，保留英文專有名詞、數字與單位。
只能根據逐字稿內容整理，不可以新增逐字稿沒有提到的資訊或猜測。
如果逐字稿是空的或內容太少，直接說明目前還沒有足夠內容可以整理重點。
輸出格式：每條重點一行，開頭是「- 」，不要加其他說明文字。"""


class Summarizer(Protocol):
    async def summarize(self, history: list[Utterance]) -> str: ...


class OpenAISummarizer:
    def __init__(self, client: AsyncOpenAI, model: str) -> None:
        self.client = client
        self.model = model

    async def summarize(self, history: list[Utterance]) -> str:
        response = await self.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": build_summary_prompt(history)},
            ],
        )
        return (response.output_text or "").strip()


class GeminiSummarizer:
    def __init__(self, client: genai.Client, model: str) -> None:
        self.client = client
        self.model = model

    async def summarize(self, history: list[Utterance]) -> str:
        interaction = await self.client.aio.interactions.create(
            model=self.model,
            input=build_summary_prompt(history),
            system_instruction=SUMMARY_SYSTEM_PROMPT,
            store=False,
        )
        return (interaction.output_text or "").strip()


def build_summary_prompt(history: list[Utterance]) -> str:
    history_text = "\n".join(format_utterance(item) for item in history) or "（尚無逐字稿）"
    return f"會議逐字稿：\n{history_text}"
