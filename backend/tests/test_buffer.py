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
