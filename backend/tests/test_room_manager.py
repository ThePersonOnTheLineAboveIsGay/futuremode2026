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
        await manager.join("aaa-bbbb-ccc", first, room_password="", display_name=None)
        await manager.join("aaa-bbbb-ccc", second, room_password="", display_name=None)
        await manager.join("xxx-yyyy-zzz", other_room, room_password="", display_name=None)

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
        await manager.join("aaa-bbbb-ccc", socket, room_password="", display_name=None)
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
        await manager.join("aaa-bbbb-ccc", first, room_password="", display_name=None)
        await manager.join("xxx-yyyy-zzz", second, room_password="", display_name=None)
        now = datetime.now(timezone.utc)

        await manager.add_utterance("aaa-bbbb-ccc", "Room A", "Alice", now, "caption", 0)
        await manager.add_utterance("xxx-yyyy-zzz", "Room B", "Bob", now, "caption", 0)

        assert [item.text for item in manager.rooms["aaa-bbbb-ccc"].buffer.items] == ["Room A"]
        assert [item.text for item in manager.rooms["xxx-yyyy-zzz"].buffer.items] == ["Room B"]
        await manager.disconnect("aaa-bbbb-ccc", first)
        assert "aaa-bbbb-ccc" not in manager.rooms
        assert "xxx-yyyy-zzz" in manager.rooms

    asyncio.run(scenario())


def test_room_password_protects_join() -> None:
    async def scenario() -> None:
        manager = RoomManager(15, 100, idle_timeout_seconds=60)
        host = FakeWebSocket()
        wrong = FakeWebSocket()
        guest = FakeWebSocket()

        host_result = await manager.join("aaa-bbbb-ccc", host, room_password="秘密", display_name="主持人")
        assert host_result.ok and host_result.is_host

        wrong_result = await manager.join("aaa-bbbb-ccc", wrong, room_password="錯的", display_name="路人")
        assert not wrong_result.ok
        assert wrong_result.reason == "房間密碼錯誤"
        assert wrong not in manager.rooms["aaa-bbbb-ccc"].connections

        guest_result = await manager.join("aaa-bbbb-ccc", guest, room_password="秘密", display_name="小美")
        assert guest_result.ok and not guest_result.is_host
        assert manager.participant_name("aaa-bbbb-ccc", guest) == "小美"
        assert manager.participant_name("aaa-bbbb-ccc", host) == "主持人"

    asyncio.run(scenario())
