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
