import asyncio
from datetime import datetime, timezone

from app.room_manager import RoomManager


class FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.messages: list[dict] = []
        self.closed = False

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, payload: dict) -> None:
        self.messages.append(payload)

    async def close(self, code: int, reason: str) -> None:
        self.closed = True


def test_room_broadcast_isolated_and_single_chat_sender() -> None:
    async def scenario() -> None:
        manager = RoomManager(15, 100, idle_timeout_seconds=60)
        first = FakeWebSocket()
        second = FakeWebSocket()
        other_room = FakeWebSocket()
        await manager.join("aaa-bbbb-ccc", first, display_name=None)
        await manager.join("aaa-bbbb-ccc", second, display_name=None)
        await manager.join("xxx-yyyy-zzz", other_room, display_name=None)

        await manager.broadcast("aaa-bbbb-ccc", {"type": "interjection"}, allow_chat=True)

        assert len(first.messages) == 1
        assert len(second.messages) == 1
        assert other_room.messages == []
        assert sorted(message["send_to_chat"] for message in [first.messages[0], second.messages[0]]) == [False, True]

    asyncio.run(scenario())


def test_chat_cooldown_and_room_cleanup() -> None:
    async def scenario() -> None:
        manager = RoomManager(15, 100, idle_timeout_seconds=10)
        socket = FakeWebSocket()
        await manager.join("aaa-bbbb-ccc", socket, display_name=None)
        room = manager.rooms["aaa-bbbb-ccc"]
        assert await manager.reserve_chat_slot("aaa-bbbb-ccc", "王小明", 60)
        assert not await manager.reserve_chat_slot("aaa-bbbb-ccc", "王小明", 60)
        room.last_activity = 0

        expired = await manager.cleanup_once(now=11)

        assert expired == ["aaa-bbbb-ccc"]
        assert socket.closed
        assert manager.rooms == {}

    asyncio.run(scenario())


def test_room_buffers_do_not_cross_contaminate() -> None:
    async def scenario() -> None:
        manager = RoomManager(15, 100, idle_timeout_seconds=60)
        first = FakeWebSocket()
        second = FakeWebSocket()
        await manager.join("aaa-bbbb-ccc", first, display_name=None)
        await manager.join("xxx-yyyy-zzz", second, display_name=None)
        now = datetime.now(timezone.utc)

        await manager.add_utterance("aaa-bbbb-ccc", "Room A", "Alice", now, "caption", 0)
        await manager.add_utterance("xxx-yyyy-zzz", "Room B", "Bob", now, "caption", 0)

        assert [item.text for item in manager.rooms["aaa-bbbb-ccc"].buffer.items] == ["Room A"]
        assert [item.text for item in manager.rooms["xxx-yyyy-zzz"].buffer.items] == ["Room B"]
        await manager.disconnect("aaa-bbbb-ccc", first)
        assert "aaa-bbbb-ccc" not in manager.rooms
        assert "xxx-yyyy-zzz" in manager.rooms

    asyncio.run(scenario())


def test_snapshot_history_keeps_whole_meeting_past_rolling_window() -> None:
    async def scenario() -> None:
        manager = RoomManager(window_minutes=15, max_utterances=2, idle_timeout_seconds=60)
        socket = FakeWebSocket()
        await manager.join("aaa-bbbb-ccc", socket, display_name=None)
        now = datetime.now(timezone.utc)

        await manager.add_utterance("aaa-bbbb-ccc", "第一句", None, now, "stt", 0)
        await manager.add_utterance("aaa-bbbb-ccc", "第二句", None, now, "stt", 0)
        await manager.add_utterance("aaa-bbbb-ccc", "第三句", None, now, "stt", 0)

        # The rolling analysis buffer is capped at max_utterances=2...
        assert [item.text for item in manager.rooms["aaa-bbbb-ccc"].buffer.items] == ["第二句", "第三句"]
        # ...but the summarize snapshot still has everything said so far.
        assert [item.text for item in manager.snapshot_history("aaa-bbbb-ccc")] == ["第一句", "第二句", "第三句"]

    asyncio.run(scenario())


def test_burst_of_new_utterances_triggers_analysis_before_interval_elapses() -> None:
    async def scenario() -> None:
        manager = RoomManager(15, 100, idle_timeout_seconds=60)
        socket = FakeWebSocket()
        await manager.join("aaa-bbbb-ccc", socket, display_name=None)
        now = datetime.now(timezone.utc)

        # First utterance: no prior history yet, so it never analyzes on its
        # own regardless of the burst/interval settings.
        await manager.add_utterance("aaa-bbbb-ccc", "第一句", None, now, "stt", 999, min_new_utterances=3)
        # Second utterance: last_analysis_at is still -inf (nothing has ever
        # been analyzed), so the time-based condition alone fires here — this
        # "warms up" last_analysis_at to a real timestamp so the burst
        # trigger below can be tested in isolation from that startup edge case.
        _, _, warmed_up = await manager.add_utterance(
            "aaa-bbbb-ccc", "第二句", None, now, "stt", 999, min_new_utterances=3
        )
        assert warmed_up

        # From here, interval=999s never elapses on its own; only piling up
        # min_new_utterances new utterances should trigger analysis.
        _, _, analyzed1 = await manager.add_utterance(
            "aaa-bbbb-ccc", "第三句", None, now, "stt", 999, min_new_utterances=3
        )
        assert not analyzed1  # only 1 new utterance since the warmup analysis
        _, _, analyzed2 = await manager.add_utterance(
            "aaa-bbbb-ccc", "第四句", None, now, "stt", 999, min_new_utterances=3
        )
        assert not analyzed2  # only 2 new utterances so far
        _, _, analyzed3 = await manager.add_utterance(
            "aaa-bbbb-ccc", "第五句", None, now, "stt", 999, min_new_utterances=3
        )
        assert analyzed3  # 3rd new utterance reaches the burst threshold

    asyncio.run(scenario())


def test_register_issue_if_new_deduplicates_similar_wording() -> None:
    async def scenario() -> None:
        manager = RoomManager(15, 100, idle_timeout_seconds=60)
        socket = FakeWebSocket()
        await manager.join("aaa-bbbb-ccc", socket, display_name=None)

        assert await manager.register_issue_if_new(
            "aaa-bbbb-ccc", "contradiction|王小明|稍早提到方案 A，現在改成方案 B，沒有說明原因"
        )
        # Same underlying issue, slightly different wording -> suppressed.
        assert not await manager.register_issue_if_new(
            "aaa-bbbb-ccc", "contradiction|王小明|稍早提到方案 A，現在卻改成方案 B，也沒說明原因"
        )
        # A genuinely different issue still gets through.
        assert await manager.register_issue_if_new(
            "aaa-bbbb-ccc", "off_topic|王小明|聊到跟會議主題完全無關的週末旅遊計畫"
        )
        assert manager.reported_issues_for_prompt("aaa-bbbb-ccc") == [
            "contradiction|王小明|稍早提到方案 A，現在改成方案 B，沒有說明原因",
            "off_topic|王小明|聊到跟會議主題完全無關的週末旅遊計畫",
        ]

    asyncio.run(scenario())


def test_join_tracks_participant_display_names() -> None:
    async def scenario() -> None:
        manager = RoomManager(15, 100, idle_timeout_seconds=60)
        first = FakeWebSocket()
        second = FakeWebSocket()

        is_first = await manager.join("aaa-bbbb-ccc", first, display_name="主持人")
        assert is_first
        is_first_again = await manager.join("aaa-bbbb-ccc", second, display_name="小美")
        assert not is_first_again

        assert manager.participant_name("aaa-bbbb-ccc", first) == "主持人"
        assert manager.participant_name("aaa-bbbb-ccc", second) == "小美"

        await manager.disconnect("aaa-bbbb-ccc", first)
        assert manager.participant_name("aaa-bbbb-ccc", first) is None

    asyncio.run(scenario())
