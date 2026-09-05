import time

import pytest

from app import analyzer
from app.schemas import AnalysisResult, Assessment
from app.session import Session


class _FakeResp:
    def __init__(self, result: AnalysisResult):
        self.parsed = result
        self.text = result.model_dump_json()


class _FakeModels:
    def __init__(self, result: AnalysisResult):
        self._result = result
        self.calls = 0

    async def generate_content(self, **kwargs):
        self.calls += 1
        return _FakeResp(self._result)


class _FakeAio:
    def __init__(self, models):
        self.models = models


class FakeClient:
    """模擬 google-genai 的 client.aio.models.generate_content。"""

    def __init__(self, result: AnalysisResult):
        self.models = _FakeModels(result)
        self.aio = _FakeAio(self.models)


def _session(**kw) -> Session:
    s = Session(session_id="t", **kw)
    return s


# ---------- should_analyze ----------

def test_no_analysis_without_new_segments():
    s = _session()
    assert s.should_analyze() is False


def test_analysis_triggers_on_segment_count(monkeypatch):
    s = _session()
    for _ in range(3):
        s.append("一句話")
    assert s.should_analyze() is True


def test_analysis_triggers_on_time(monkeypatch):
    s = _session()
    s.append("一句話")
    s._last_analysis_time = time.time() - 999
    assert s.should_analyze() is True


def test_mark_analyzed_resets_counter():
    s = _session()
    for _ in range(3):
        s.append("句")
    s.mark_analyzed()
    assert s.new_segment_count == 0
    assert s.should_analyze() is False


# ---------- run_if_needed 過濾 ----------

@pytest.mark.asyncio
async def test_infeasible_above_threshold_is_reported():
    s = _session(confidence_threshold=0.6)
    for _ in range(3):
        s.append("下週一前把系統改用區塊鏈重寫")
    client = FakeClient(
        AnalysisResult(
            assessments=[
                Assessment(topic="區塊鏈重寫", verdict="infeasible", confidence=0.9, reasons=["時程不足"])
            ]
        )
    )
    items = await analyzer.run_if_needed(s, client=client)
    assert len(items) == 1
    assert items[0].topic == "區塊鏈重寫"


@pytest.mark.asyncio
async def test_low_confidence_filtered_out():
    s = _session(confidence_threshold=0.6)
    for _ in range(3):
        s.append("句")
    client = FakeClient(
        AnalysisResult(assessments=[Assessment(topic="X", verdict="infeasible", confidence=0.3)])
    )
    assert await analyzer.run_if_needed(s, client=client) == []


@pytest.mark.asyncio
async def test_feasible_verdict_filtered_out():
    s = _session()
    for _ in range(3):
        s.append("句")
    client = FakeClient(
        AnalysisResult(assessments=[Assessment(topic="X", verdict="feasible", confidence=0.9)])
    )
    assert await analyzer.run_if_needed(s, client=client) == []


@pytest.mark.asyncio
async def test_duplicate_topic_reported_once():
    s = _session()
    result = AnalysisResult(
        assessments=[Assessment(topic="區塊鏈 重寫", verdict="infeasible", confidence=0.9)]
    )
    client = FakeClient(result)

    for _ in range(3):
        s.append("句")
    first = await analyzer.run_if_needed(s, client=client)
    assert len(first) == 1

    for _ in range(3):
        s.append("句")
    second = await analyzer.run_if_needed(s, client=client)
    assert second == []


def test_similar_topic_wording_is_deduped():
    s = _session()
    assert s.is_new_report("下週一前把整個系統改用區塊鏈重寫", "infeasible") is True
    # 措辭不同但講的是同一件事：字元相似度夠高，應該被擋掉
    assert s.is_new_report("把系統改用區塊鏈重寫", "infeasible") is False


def test_different_topics_are_not_deduped():
    s = _session()
    assert s.is_new_report("下週一前把整個系統改用區塊鏈重寫", "infeasible") is True
    assert s.is_new_report("砍掉現有團隊全部外包", "infeasible") is True


def test_verdict_change_for_same_topic_is_allowed():
    s = _session()
    # 先是「有疑慮」，後來有新資訊變成「不可行」：算新狀態，應該放行
    assert s.is_new_report("區塊鏈重寫", "needs_info") is True
    assert s.is_new_report("區塊鏈重寫", "infeasible") is True
    # 但同一個 verdict 再報一次還是要擋
    assert s.is_new_report("區塊鏈重寫", "infeasible") is False


@pytest.mark.asyncio
async def test_needs_info_is_reported_regardless_of_confidence():
    s = _session(confidence_threshold=0.9)
    for _ in range(3):
        s.append("句")
    client = FakeClient(
        AnalysisResult(
            assessments=[
                Assessment(topic="X", verdict="needs_info", confidence=0.2, reasons=["缺預算資訊"])
            ]
        )
    )
    items = await analyzer.run_if_needed(s, client=client)
    assert len(items) == 1
    assert items[0].verdict == "needs_info"


@pytest.mark.asyncio
async def test_not_called_when_no_trigger():
    s = _session()
    client = FakeClient(AnalysisResult())
    items = await analyzer.run_if_needed(s, client=client)
    assert items is None
    assert client.models.calls == 0
