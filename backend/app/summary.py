from __future__ import annotations

from typing import Protocol

from google import genai
from openai import AsyncOpenAI

from .conversation_buffer import Utterance
from .contradiction import format_utterance

SUMMARY_SYSTEM_PROMPT = """你是會議記錄助手。你會收到從會議開始到現在的完整逐字稿歷史紀錄，每行開頭是 [HH:MM:SS] 的時間戳記。
請按照時間先後，整理成一份時間軸重點摘要，使用繁體中文、台灣用詞，保留英文專有名詞、數字與單位。
重點數量依內容多寡決定，不用固定條數；內容很少就只列少數幾條，內容多就分段涵蓋整場會議的重要進展與結論，不要只總結最後幾句話。
只能根據逐字稿內容整理，不可以新增逐字稿沒有提到的資訊或猜測。
如果逐字稿是空的或內容太少，直接說明目前還沒有足夠內容可以整理重點。
輸出格式：每條重點一行，格式是「[時間] 重點內容」，時間取自逐字稿裡最接近的時間戳記；不要加其他說明文字。"""


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
