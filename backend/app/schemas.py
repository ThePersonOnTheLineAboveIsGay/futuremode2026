"""WebSocket 訊息型別與 Gemini 結構化輸出 schema。"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Verdict = Literal["infeasible", "feasible", "needs_info"]


# ---------- Gemini 分析結果 ----------

class Assessment(BaseModel):
    topic: str = Field(description="被評估的提案簡述")
    verdict: Verdict
    confidence: float = Field(ge=0.0, le=1.0)
    reasons: list[str] = Field(default_factory=list, description="不可行／存疑的具體理由")
    quote: str = Field(default="", description="觸發此判斷的逐字稿原文片段")


class AnalysisResult(BaseModel):
    assessments: list[Assessment] = Field(default_factory=list)


# ---------- WebSocket：伺服器 -> 用戶端 ----------

class TranscriptMessage(BaseModel):
    type: Literal["transcript"] = "transcript"
    text: str
    ts: float


class AssessmentMessage(BaseModel):
    type: Literal["assessment"] = "assessment"
    items: list[Assessment]


class StatusMessage(BaseModel):
    type: Literal["status"] = "status"
    state: str
    detail: str = ""


class NoticeMessage(BaseModel):
    type: Literal["notice"] = "notice"
    text: str


class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    message: str


# ---------- WebSocket：用戶端 -> 伺服器（文字控制幀）----------

class ClientConfig(BaseModel):
    type: Literal["config"] = "config"
    analysis_language: str | None = None
    confidence_threshold: float | None = None
    meeting_context: str | None = Field(
        default=None, description="會議主題／背景，提供給 Gemini 增進判斷"
    )


class ClientCaption(BaseModel):
    """由擴充功能擷取的 Google Meet 字幕（可選，用來補上發言者）。"""
    type: Literal["caption"] = "caption"
    speaker: str = ""
    text: str


class ClientStop(BaseModel):
    type: Literal["stop"] = "stop"
