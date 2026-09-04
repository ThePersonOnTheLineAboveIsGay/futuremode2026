from __future__ import annotations

from typing import Literal

from openai import AsyncOpenAI
from google import genai
from pydantic import BaseModel, Field

from .conversation_buffer import Utterance


SYSTEM_PROMPT = """你是積極參與會議討論的 AI 顧問，不是只挑錯、不表態的旁觀者。你會收到會議逐字稿的歷史紀錄與最新一段發言。

用你的判斷力評估最新發言：只要你認為有不合邏輯、不合理、前後矛盾、明顯離題，或任何值得提出看法的地方，就應該指出來並給出你自己的判斷或建議——不用等到符合嚴格的固定條件才觸發，你覺得不對勁、不合理，就可以提出來。

把你的判斷歸類到最接近的類型：
- contradiction：跟該講者稍早的發言矛盾，且沒有說明改變原因。
- off_topic：跟會議討論主題明顯無關。
- logical_error：有明顯不合邏輯或不合理的地方（例如數字兜不起來、時程／資源／技術上不可行、常識上說不通）。
- decision_review：提出方案、計畫、決定，或任何值得表態的意見交流／比較／辯論（不需要有兩個選項互相比較，單一提案或單純意見討論也算）。
不確定要歸到哪一類時，用 decision_review。

判斷時要給出你自己的意見，不要只是中立描述現況：可以明確說出你認為哪裡不合理、哪個選項比較好、為什麼。給意見時可以運用你自己的知識與常識，不限於逐字稿字面內容；但引用「會議裡實際發生的事」（誰說了什麼、稍早決定了什麼）時必須跟逐字稿一致，絕對不可以編造沒發生過的對話或未提及的具體細節。

當輸入有講者名稱時，只能用「同一位講者」的過往發言判定前後矛盾，絕對不要把不同講者的意見互相比對為矛盾。
當輸入標示為 AI 音訊模式且沒有講者名稱時，可以指出「會議內容」前後不一致，但不得猜測或指名是哪一位講者；target_speaker 必須為 null。
避免把單純的寒暄、跟討論主題完全無關的閒聊、或語音辨識雜訊誤判為問題；除此之外，只要你判斷有不合理或值得表態的地方，就應該提出來，不要因為「這只是意見交流」或「沒有明確矛盾」而略過不表態。
只有逐字稿內有清楚證據支持你的判斷時才標記；證據不足就回報無問題。提醒必須簡短、直接、講重點：不要用「不好意思」、「抱歉」這類開場白或客套話，也不用刻意婉轉，直接講出問題或意見就好；語氣不用攻擊性或指責，但不需要刻意禮貌鋪陳。讓人清楚知道這是 AI 的參考意見，最終決定權在團隊手上。有講者時，提醒句要明確稱呼該講者。"""


class InterjectionAnalysis(BaseModel):
    has_issue: bool
    issue_type: Literal["contradiction", "off_topic", "logical_error", "decision_review", "none"]
    explanation: str = Field(max_length=500)
    suggested_interjection: str = Field(max_length=500)
    confidence: float = Field(ge=0, le=1)
    target_speaker: str | None = None


class ContradictionDetector:
    def __init__(self, client: AsyncOpenAI, model: str) -> None:
        self.client = client
        self.model = model

    async def analyze(self, history: list[Utterance], latest: Utterance) -> InterjectionAnalysis:
        prompt = build_analysis_prompt(history, latest)
        response = await self.client.responses.parse(
            model=self.model,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            text_format=InterjectionAnalysis,
        )
        if response.output_parsed is None:
            raise ValueError("模型沒有回傳可解析的判斷結果")
        return normalize_analysis(response.output_parsed, latest)

    @staticmethod
    def _format(item: Utterance) -> str:
        return format_utterance(item)


class GeminiContradictionDetector:
    def __init__(self, client: genai.Client, model: str) -> None:
        self.client = client
        self.model = model

    async def analyze(self, history: list[Utterance], latest: Utterance) -> InterjectionAnalysis:
        interaction = await self.client.aio.interactions.create(
            model=self.model,
            input=build_analysis_prompt(history, latest),
            system_instruction=SYSTEM_PROMPT,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": InterjectionAnalysis.model_json_schema(),
            },
            store=False,
        )
        if not interaction.output_text:
            raise ValueError("Gemini 沒有回傳判斷結果")
        result = InterjectionAnalysis.model_validate_json(interaction.output_text)
        return normalize_analysis(result, latest)


def build_analysis_prompt(history: list[Utterance], latest: Utterance) -> str:
    history_text = "\n".join(format_utterance(item) for item in history) or "（尚無歷史紀錄）"
    has_speaker = bool(latest.speaker)
    same_speaker = [item for item in history if has_speaker and item.speaker == latest.speaker]
    same_speaker_text = "\n".join(format_utterance(item) for item in same_speaker) or "（沒有）"
    mode = "有講者模式" if has_speaker else "AI 音訊模式（可判斷會議內容前後不一致，但不可猜測講者）"
    return (
        f"分析模式：{mode}\n\n完整歷史紀錄：\n{history_text}\n\n"
        f"最新講者的同人歷史：\n{same_speaker_text}\n\n最新發言：\n{format_utterance(latest)}"
    )


def normalize_analysis(result: InterjectionAnalysis, latest: Utterance) -> InterjectionAnalysis:
    has_speaker = bool(latest.speaker)
    result.target_speaker = latest.speaker if has_speaker and result.has_issue else None
    return result


def format_utterance(item: Utterance) -> str:
    local_time = item.timestamp.astimezone().strftime("%H:%M:%S")
    return f"[{local_time}] {item.speaker or '未知講者'}：{item.text}"
