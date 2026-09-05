import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from app.contradiction import (
    ContradictionDetector,
    InterjectionAnalysis,
    build_analysis_prompt,
    format_utterance,
    normalize_analysis,
)
from app.conversation_buffer import Utterance


class FakeResponses:
    async def parse(self, **kwargs):
        return SimpleNamespace(
            output_parsed=InterjectionAnalysis(
                has_issue=True,
                issue_type="contradiction",
                reasons=["A 與 B 不一致"],
                suggested_interjection="請說明改變原因",
                confidence=0.9,
                target_speaker="模型猜測值",
            )
        )


def test_detector_allows_meeting_level_contradiction_without_guessing_speaker() -> None:
    async def scenario() -> None:
        detector = ContradictionDetector(SimpleNamespace(responses=FakeResponses()), "test-model")
        now = datetime.now(timezone.utc)
        result = await detector.analyze(
            [Utterance("採用 A", now, speaker=None, source="stt")],
            Utterance("採用 B", now, speaker=None, source="stt"),
        )
        assert result.has_issue
        assert result.issue_type == "contradiction"
        assert result.target_speaker is None

    asyncio.run(scenario())


def test_detector_uses_latest_caption_speaker_as_target() -> None:
    async def scenario() -> None:
        detector = ContradictionDetector(SimpleNamespace(responses=FakeResponses()), "test-model")
        now = datetime.now(timezone.utc)
        result = await detector.analyze(
            [Utterance("採用 A", now, speaker="王小明")],
            Utterance("採用 B", now, speaker="王小明"),
        )
        assert result.target_speaker == "王小明"

    asyncio.run(scenario())


def test_prompt_tells_model_about_already_reported_issues() -> None:
    now = datetime.now(timezone.utc)
    prompt = build_analysis_prompt(
        [Utterance("採用 A", now, speaker="王小明")],
        Utterance("採用 B", now, speaker="王小明"),
        already_reported=["contradiction|王小明|A 改成 B"],
    )
    assert "已經回報過的具體問題" in prompt
    assert "contradiction|王小明|A 改成 B" in prompt


def test_prompt_omits_reported_block_when_nothing_reported_yet() -> None:
    now = datetime.now(timezone.utc)
    prompt = build_analysis_prompt(
        [Utterance("採用 A", now, speaker="王小明")],
        Utterance("採用 B", now, speaker="王小明"),
    )
    assert "已經回報過的問題" not in prompt


def test_format_utterance_never_leaks_anonymous_pseudo_label_to_the_model() -> None:
    now = datetime.now(timezone.utc)
    line = format_utterance(Utterance("嗨嗨嗨", now, speaker="匿名講者3"))
    assert "匿名講者3" not in line
    assert "未知講者" in line


def test_format_utterance_still_shows_a_real_display_name() -> None:
    now = datetime.now(timezone.utc)
    line = format_utterance(Utterance("嗨嗨嗨", now, speaker="王小明"))
    assert "王小明" in line


def test_normalize_analysis_masks_target_speaker_for_pseudo_anonymous_label() -> None:
    now = datetime.now(timezone.utc)
    result = InterjectionAnalysis(
        has_issue=True,
        issue_type="off_topic",
        reasons=["聊到跟主題無關的話題"],
        suggested_interjection="要不要回到正題？",
        confidence=0.9,
    )
    normalized = normalize_analysis(result, Utterance("嗨嗨嗨", now, speaker="匿名講者3"))
    assert normalized.target_speaker is None


def test_normalize_analysis_keeps_target_speaker_for_real_display_name() -> None:
    now = datetime.now(timezone.utc)
    result = InterjectionAnalysis(
        has_issue=True,
        issue_type="off_topic",
        reasons=["聊到跟主題無關的話題"],
        suggested_interjection="要不要回到正題？",
        confidence=0.9,
    )
    normalized = normalize_analysis(result, Utterance("嗨嗨嗨", now, speaker="王小明"))
    assert normalized.target_speaker == "王小明"
