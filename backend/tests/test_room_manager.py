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
        await manager.connect("aaa-bbbb-ccc", first)
        await manager.connect("aaa-bbbb-ccc", second)
        await manager.connect("xxx-yyyy-zzz", other_room)

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
        room = await manager.connect("aaa-bbbb-ccc", socket)
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
        await manager.connect("aaa-bbbb-ccc", first)
        await manager.connect("xxx-yyyy-zzz", second)
        now = datetime.now(timezone.utc)

        await manager.add_utterance("aaa-bbbb-ccc", "Room A", "Alice", now, "caption", 0)
        await manager.add_utterance("xxx-yyyy-zzz", "Room B", "Bob", now, "caption", 0)

        assert [item.text for item in manager.rooms["aaa-bbbb-ccc"].buffer.items] == ["Room A"]
        assert [item.text for item in manager.rooms["xxx-yyyy-zzz"].buffer.items] == ["Room B"]
        await manager.disconnect("aaa-bbbb-ccc", first)
        assert "aaa-bbbb-ccc" not in manager.rooms
        assert "xxx-yyyy-zzz" in manager.rooms

    asyncio.run(scenario())
