import asyncio

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app


def test_websocket_rejects_invalid_meeting_id() -> None:
    with TestClient(app) as client:
        with client.websocket_connect("/ws/meeting?meeting_id=../../other-room") as websocket:
            assert websocket.receive_json() == {"type": "error", "message": "meeting_id 格式不正確"}
            with pytest.raises(WebSocketDisconnect) as closed:
                websocket.receive_json()
            assert closed.value.code == 1008


def test_websocket_rejects_wrong_room_password() -> None:
    # Seed the room directly through RoomManager so this test does not depend on
    # real AI provider keys being configured (join() never touches the websocket
    # object, so a plain sentinel works as the "host" connection).
    with TestClient(app) as client:
        host_socket = object()
        asyncio.run(
            client.app.state.rooms.join(
                "aaa-bbbb-ccc", host_socket, room_password="秘密", display_name="主持人"
            )
        )

        with client.websocket_connect("/ws/meeting?meeting_id=aaa-bbbb-ccc") as guest:
            guest.send_json({"type": "config", "mime_type": "audio/webm", "room_password": "錯的"})
            message = guest.receive_json()
            assert message["type"] == "error"
            assert message["code"] == "invalid_room_password"
            with pytest.raises(WebSocketDisconnect) as closed:
                guest.receive_json()
            assert closed.value.code == 4003
