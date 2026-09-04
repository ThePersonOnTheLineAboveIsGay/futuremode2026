from __future__ import annotations

from typing import Literal

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from .conversation_buffer import Utterance


SYSTEM_PROMPT = """你是一個謹慎的會議品質監督 AI。你會收到會議逐字稿的歷史紀錄與最新一段發言。
請判斷最新發言是否：
1. 與該講者稍早的發言矛盾，且沒有說明改變原因。
2. 與會議討論主題明顯無關。
3. 存在可由逐字稿直接驗證的邏輯或數字錯誤。

避免將正常的意見調整、假設、提問、澄清、補充資訊或語音辨識雜訊誤判為問題。
只有逐字稿內有清楚證據時才標記；不確定就回報無問題。提醒必須簡短、口語、尊重發言者，並指出可核對的前後內容。"""


class InterjectionAnalysis(BaseModel):
    has_issue: bool
    issue_type: Literal["contradiction", "off_topic", "logical_error", "none"]
    explanation: str = Field(max_length=300)
    suggested_interjection: str = Field(max_length=300)
    confidence: float = Field(ge=0, le=1)


class ContradictionDetector:
    def __init__(self, client: AsyncOpenAI, model: str) -> None:
        self.client = client
        self.model = model

    async def analyze(self, history: list[Utterance], latest: Utterance) -> InterjectionAnalysis:
        history_text = "\n".join(self._format(item) for item in history) or "（尚無歷史紀錄）"
        response = await self.client.responses.parse(
            model=self.model,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"歷史紀錄：\n{history_text}\n\n最新發言：\n{self._format(latest)}"},
            ],
            text_format=InterjectionAnalysis,
        )
        if response.output_parsed is None:
            raise ValueError("模型沒有回傳可解析的判斷結果")
        return response.output_parsed

    @staticmethod
    def _format(item: Utterance) -> str:
        local_time = item.timestamp.astimezone().strftime("%H:%M:%S")
        return f"[{local_time}] {item.speaker or '未知講者'}：{item.text}"
