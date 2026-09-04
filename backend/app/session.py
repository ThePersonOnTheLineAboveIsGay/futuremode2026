"""每個會議 session 的逐字稿緩衝與去重狀態。"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

from .config import get_settings


@dataclass
class Utterance:
    text: str
    ts: float
    speaker: str = ""

    def render(self) -> str:
        return f"{self.speaker}：{self.text}" if self.speaker else self.text


def _normalize_topic(topic: str) -> str:
    """把提案描述正規化成去重用的 key。"""
    return re.sub(r"\s+", "", topic.lower())[:60]


@dataclass
class Session:
    session_id: str
    analysis_language: str = field(default_factory=lambda: get_settings().analysis_language)
    confidence_threshold: float = field(default_factory=lambda: get_settings().confidence_threshold)
    meeting_context: str = ""

    transcript: list[Utterance] = field(default_factory=list)
    _last_analyzed_index: int = 0
    _last_analysis_time: float = field(default_factory=time.time)
    # topic key -> 已回報過的 verdict
    _reported: dict[str, str] = field(default_factory=dict)
    # 已回報過「不可行」的原始 topic 文字，餵回 prompt 讓模型自己判斷語意重複
    # （純字串比對抓不住模型每次措辭略有不同的同一個提案）。
    reported_topics: list[str] = field(default_factory=list)

    def append(self, text: str, speaker: str = "") -> Utterance:
        u = Utterance(text=text.strip(), ts=time.time(), speaker=speaker.strip())
        self.transcript.append(u)
        return u

    # ---------- analyzer 觸發判斷 ----------

    @property
    def new_segment_count(self) -> int:
        return len(self.transcript) - self._last_analyzed_index

    def should_analyze(self) -> bool:
        s = get_settings()
        if self.new_segment_count == 0:
            return False
        if self.new_segment_count >= s.analyze_min_new_segments:
            return True
        return (time.time() - self._last_analysis_time) >= s.analyze_min_interval_seconds

    def analysis_window(self) -> str:
        """回傳送給模型的逐字稿（尾端視窗）。"""
        limit = get_settings().analyze_window_chars
        rendered = "\n".join(u.render() for u in self.transcript)
        return rendered[-limit:]

    def mark_analyzed(self) -> None:
        self._last_analyzed_index = len(self.transcript)
        self._last_analysis_time = time.time()

    # ---------- 去重 ----------

    def is_new_report(self, topic: str, verdict: str) -> bool:
        """同一提案、同一 verdict 只回報一次（字面完全相同才擋；語意重複交給 prompt 處理）。"""
        key = _normalize_topic(topic)
        if self._reported.get(key) == verdict:
            return False
        self._reported[key] = verdict
        if verdict == "infeasible":
            self.reported_topics.append(topic)
        return True
