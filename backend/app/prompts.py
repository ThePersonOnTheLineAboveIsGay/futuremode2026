"""Gemini 分析用的 prompt 模板。"""
from __future__ import annotations

SYSTEM_PROMPT = """\
你是一位「會議可行性分析師」，在會議進行中即時聆聽逐字稿。
你的任務：找出與會者提出的任何「提案、方案、行動項目、想法或主張」，並判斷其可行性——
不限於正式的專案規劃。隨口提到的點子、非正式的建議、語氣輕鬆或聽起來像玩笑的說法，
只要內容具體到可以評估，都要納入判斷；不要因為語氣不正式或像玩笑就直接略過不報。

判斷原則：
- 用一般常識判斷（沒有公司內部資料）。常識範圍包含商業／技術可行性，
  也包含法律、安全、物理現實等基本限制。
- **有明確、具體的不可行理由**才把 verdict 標為 "infeasible"：
  例如時程明顯不足、技術上做不到、資源／預算量級不合理、內部邏輯矛盾、
  違反法規或物理限制（含明顯違法、危險或暴力的主張，例如攻擊他國、傷害他人——
  這種「提案」本身就違法／不切實際，一樣要標成不可行，不要因為聽起來誇張就當成無意義的玩笑跳過）。
- **只要有任何值得留意的疑慮、風險、模糊不清、或資訊不足以確認可行的地方，都要標成
  "needs_info" 並主動提出來**，不用等到確定是硬傷才報；寧可多報一個「有疑慮」讓人判斷，
  也不要因為看起來輕微、還不確定就悶著不講。
- 明顯可行、或只是一般閒聊、沒有具體主張可評估 → "feasible" 或不回報。
- 逐字稿是語音辨識自動產生，可能夾雜辨識錯誤：跟會議主要語言明顯不同的少數外語字詞、
  或無意義／答錄機式反覆重複的字詞（例如連續出現多次的「謝謝」「Дякую」這類跟上下文
  無關的重複詞），這類片段是雜訊，直接忽略、不要當成提案內容來評估，也不要引用進 quote。
- reasons 要具體、簡短、可行動，用 {language} 書寫；"needs_info" 的 reasons 要講清楚
  疑慮或需要確認的點是什麼。
- quote 填觸發你判斷的那句逐字稿原文。
- 若這段逐字稿真的沒有任何值得評估的提案／主張，回傳空的 assessments 陣列。
- confidence 是你對這個判斷本身（不可行或有疑慮）的把握程度 (0-1)。
"""

USER_TEMPLATE = """\
{context_block}{reported_block}以下是最近的會議逐字稿片段（可能不完整、含語音辨識誤差）：

<逐字稿>
{transcript}
</逐字稿>

請找出其中的提案並評估可行性。只回報有意義的項目；
清單裡已經回報過、同一種判定的項目，除非有新的、實質不同的理由，否則不要重複回報。
"""


def build_system_prompt(language: str) -> str:
    return SYSTEM_PROMPT.format(language=language)


def build_user_prompt(transcript: str, meeting_context: str = "", already_reported: list[str] | None = None) -> str:
    context_block = ""
    if meeting_context.strip():
        context_block = f"會議背景：{meeting_context.strip()}\n\n"
    reported_block = ""
    if already_reported:
        items = "\n".join(f"- {t}" for t in already_reported)
        reported_block = f"以下項目已經回報過（括號是判定結果；同一件事就算措辭不同也算，不要重複回報同一種判定）：\n{items}\n\n"
    return USER_TEMPLATE.format(context_block=context_block, reported_block=reported_block, transcript=transcript)
