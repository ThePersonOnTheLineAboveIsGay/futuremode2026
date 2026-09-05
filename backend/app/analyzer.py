"""把逐字稿視窗送 Gemini，取得結構化可行性評估，並套用門檻與去重。"""
from __future__ import annotations

import json
import logging
import re

from google.genai import types

from .config import get_settings
from .gemini_client import get_client
from .prompts import build_system_prompt, build_user_prompt
from .schemas import AnalysisResult, Assessment
from .session import Session

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> dict:
    """從模型回應中抓出第一個 JSON 物件。"""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
    raise ValueError("回應中找不到 JSON")


_VERDICT_LABEL = {"infeasible": "不可行", "needs_info": "有疑慮"}


async def analyze(
    transcript: str,
    *,
    language: str,
    meeting_context: str = "",
    already_reported: list[tuple[str, str]] | None = None,
    client=None,
) -> AnalysisResult:
    """呼叫 Gemini 分析單一逐字稿視窗。純函式，不做過濾。"""
    if not transcript.strip():
        return AnalysisResult()

    s = get_settings()
    client = client or get_client()

    reported_labels = [f"{topic}（{_VERDICT_LABEL.get(v, v)}）" for topic, v in (already_reported or [])]

    try:
        resp = await client.aio.models.generate_content(
            model=s.gemini_model,
            contents=build_user_prompt(transcript, meeting_context, reported_labels),
            config=types.GenerateContentConfig(
                system_instruction=build_system_prompt(language),
                response_mime_type="application/json",
                response_schema=AnalysisResult,
                temperature=0.2,
            ),
        )
    except Exception as e:  # noqa: BLE001
        logger.error("Gemini 分析失敗：%s", e)
        return AnalysisResult()

    parsed = getattr(resp, "parsed", None)
    if isinstance(parsed, AnalysisResult):
        return parsed
    try:
        return AnalysisResult.model_validate(_extract_json(getattr(resp, "text", "")))
    except Exception as e:  # noqa: BLE001
        logger.error("Gemini 回應解析失敗：%s", e)
        return AnalysisResult()


async def run_if_needed(session: Session, *, client=None) -> list[Assessment] | None:
    """檢查觸發條件 → 分析 → 過濾門檻與去重。

    回傳：None = 本次未觸發分析；[] = 有分析但無可推播項目；[...] = 要推播的項目。
    """
    if not session.should_analyze():
        return None

    window = session.analysis_window()
    session.mark_analyzed()

    result = await analyze(
        window,
        language=session.analysis_language,
        meeting_context=session.meeting_context,
        already_reported=session.reported_topics,
        client=client,
    )
    logger.info(
        "分析原始回傳 %d 筆：%s",
        len(result.assessments),
        [(a.verdict, round(a.confidence, 2), a.topic) for a in result.assessments],
    )

    out: list[Assessment] = []
    for a in result.assessments:
        if a.verdict not in ("infeasible", "needs_info"):
            continue
        # 信心門檻是「確實不可行」的把握程度，只套用在 infeasible；
        # needs_info 本來就是「不確定，需要人來看」，不該再拿確定性去擋。
        if a.verdict == "infeasible" and a.confidence < session.confidence_threshold:
            continue
        if not session.is_new_report(a.topic, a.verdict):
            continue
        out.append(a)
    return out
