from datetime import datetime, timedelta, timezone

from app.conversation_buffer import ConversationBuffer


def test_buffer_prunes_old_items() -> None:
    now = datetime.now(timezone.utc)
    buffer = ConversationBuffer(window_minutes=1, max_utterances=10)
    buffer.add("old", timestamp=now - timedelta(minutes=2))
    latest = buffer.add("new", timestamp=now)
    assert len(buffer) == 1
    assert latest.text == "new"
    assert buffer.history_before(latest) == []


def test_buffer_enforces_max_items() -> None:
    buffer = ConversationBuffer(window_minutes=60, max_utterances=2)
    buffer.add("one")
    buffer.add("two")
    buffer.add("three")
    assert [item.text for item in buffer.items] == ["two", "three"]


def test_buffer_groups_history_by_speaker_and_deduplicates() -> None:
    now = datetime.now(timezone.utc)
    buffer = ConversationBuffer(window_minutes=10, max_utterances=10)
    first = buffer.add("採用方案 A", speaker="王小明", timestamp=now)
    buffer.add("我同意", speaker="李小華", timestamp=now + timedelta(seconds=1))
    duplicate = buffer.add("採用方案 A", speaker="王小明", timestamp=now + timedelta(seconds=2))
    latest = buffer.add("改用方案 B", speaker="王小明", timestamp=now + timedelta(seconds=10))

    assert duplicate is None
    assert first is not None and latest is not None
    assert [item.text for item in buffer.history_for_speaker("王小明", latest)] == ["採用方案 A"]
