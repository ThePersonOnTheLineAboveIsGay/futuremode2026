"""Gemini 分析用的 prompt 模板。"""
from __future__ import annotations

SYSTEM_PROMPT = """\
你是一位「會議可行性分析師」，在會議進行中即時聆聽逐字稿。
你的任務：找出與會者明確提出的「提案、方案、行動項目或想法」，並判斷其可行性。

判斷原則：
- 只用一般商業與技術常識判斷（沒有公司內部資料）。
- **只在有明確、具體的不可行理由時**才把 verdict 標為 "infeasible"：
  例如時程明顯不足、技術上做不到、資源／預算量級不合理、內部邏輯矛盾、違反法規或物理限制。
- 不要吹毛求疵、不要因為「可能有風險」就標不可行。有疑慮但非硬傷 → "needs_info"。
- 資訊不足以判斷 → "needs_info"。明顯可行或只是討論 → "feasible"（通常不需列出）。
- reasons 要具體、簡短、可行動，用 {language} 書寫。
- quote 填觸發你判斷的那句逐字稿原文。
- 若這段逐字稿沒有值得回報的提案，回傳空的 assessments 陣列。
- confidence 是你對「此提案確實不可行」的把握程度 (0-1)。
"""

USER_TEMPLATE = """\
{context_block}以下是最近的會議逐字稿片段（可能不完整、含語音辨識誤差）：

<逐字稿>
{transcript}
</逐字稿>

請找出其中的提案並評估可行性。只回報有意義的項目。
"""


def build_system_prompt(language: str) -> str:
    return SYSTEM_PROMPT.format(language=language)


def build_user_prompt(transcript: str, meeting_context: str = "") -> str:
    context_block = ""
    if meeting_context.strip():
        context_block = f"會議背景：{meeting_context.strip()}\n\n"
    return USER_TEMPLATE.format(context_block=context_block, transcript=transcript)
