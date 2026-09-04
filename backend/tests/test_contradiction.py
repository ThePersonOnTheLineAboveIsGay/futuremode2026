import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from app.contradiction import ContradictionDetector, InterjectionAnalysis
from app.conversation_buffer import Utterance


class FakeResponses:
    async def parse(self, **kwargs):
        return SimpleNamespace(
            output_parsed=InterjectionAnalysis(
                has_issue=True,
                issue_type="contradiction",
                explanation="A 與 B 不一致",
                suggested_interjection="請說明改變原因",
                confidence=0.9,
                target_speaker="模型猜測值",
            )
        )


def test_detector_disables_contradiction_without_speaker() -> None:
    async def scenario() -> None:
        detector = ContradictionDetector(SimpleNamespace(responses=FakeResponses()), "test-model")
        now = datetime.now(timezone.utc)
        result = await detector.analyze(
            [Utterance("採用 A", now, speaker=None, source="stt")],
            Utterance("採用 B", now, speaker=None, source="stt"),
        )
        assert not result.has_issue
        assert result.issue_type == "none"
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
